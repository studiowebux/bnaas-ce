// Task scheduler for automatic task execution
import { CronJob } from "cron";
import { LogLevel, TaskStatus } from "../types/orchestrator.ts";
import { JsonDatabase } from "../database/json-db.ts";
import { TaskOrchestrator } from "../orchestrator/task-orchestrator.ts";

export class TaskScheduler {
  private database: JsonDatabase;
  private orchestrator: TaskOrchestrator;
  private scheduledJobs: Map<string, CronJob> = new Map(); // taskId -> CronJob
  private scheduledExpressions: Map<string, string> = new Map(); // taskId -> cronExpression
  private checkInterval?: number;
  private running = false;

  constructor(database: JsonDatabase, orchestrator: TaskOrchestrator) {
    this.database = database;
    this.orchestrator = orchestrator;
  }

  async start(checkIntervalMs = 60000): Promise<void> {
    if (this.running) return;

    this.running = true;
    this.checkInterval = checkIntervalMs;

    console.log("Starting task scheduler...");

    // Load existing scheduled tasks
    await this.loadScheduledTasks();

    // Start periodic check for schedule changes
    this.startPeriodicCheck();

    console.log(
      `Task scheduler started with ${this.scheduledJobs.size} scheduled tasks`,
    );
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    this.running = false;

    console.log("Stopping task scheduler...");

    // Stop all scheduled jobs
    for (const [taskId, job] of this.scheduledJobs) {
      job.stop();
      await this.database.addTaskLog(
        taskId,
        LogLevel.INFO,
        "Scheduled task stopped due to scheduler shutdown",
      );
    }

    this.scheduledJobs.clear();
    this.scheduledExpressions.clear();
    console.log("Task scheduler stopped");
  }

  async addScheduledTask(
    taskId: string,
    cronExpression: string,
  ): Promise<boolean> {
    try {
      const task = await this.database.getTask(taskId);
      if (!task) {
        console.error(`Task ${taskId} not found`);
        return false;
      }

      if (!task.schedule || !task.schedule.enabled) {
        console.error(`Task ${taskId} is not configured for scheduling`);
        return false;
      }

      // Remove existing job if it exists
      if (this.scheduledJobs.has(taskId)) {
        await this.removeScheduledTask(taskId);
      }

      // Create new cron job
      const job = new CronJob(
        cronExpression,
        async () => {
          console.log(
            `Cron job triggered for task ${taskId} at ${
              new Date().toISOString()
            }`,
          );
          await this.executeScheduledTask(taskId);
        },
        null,
        false, // don't start immediately - we'll start it manually
        task.schedule.timezone || "UTC",
      );

      // Start the job
      job.start();

      // Log next scheduled run
      const nextRun = job.nextDate();
      await this.database.addTaskLog(
        taskId,
        LogLevel.INFO,
        `Next scheduled run: ${
          nextRun ? nextRun.toJSDate().toISOString() : "unknown"
        }`,
      );

      this.scheduledJobs.set(taskId, job);
      this.scheduledExpressions.set(taskId, cronExpression);

      await this.database.addTaskLog(
        taskId,
        LogLevel.INFO,
        `Task scheduled with cron expression: ${cronExpression}`,
      );

      console.log(
        `Added scheduled task ${taskId} with expression: ${cronExpression}`,
      );
      return true;
    } catch (error) {
      console.error(`Error adding scheduled task ${taskId}:`, error);
      await this.database.addTaskLog(
        taskId,
        LogLevel.ERROR,
        `Failed to schedule task: ${(error as Error).message}`,
      );
      return false;
    }
  }

  async removeScheduledTask(taskId: string): Promise<boolean> {
    const job = this.scheduledJobs.get(taskId);
    if (!job) {
      return false;
    }

    job.stop();
    this.scheduledJobs.delete(taskId);
    this.scheduledExpressions.delete(taskId);

    await this.database.addTaskLog(
      taskId,
      LogLevel.INFO,
      "Task removed from scheduler",
    );

    console.log(`Removed scheduled task ${taskId}`);
    return true;
  }

  async updateScheduledTask(
    taskId: string,
    cronExpression: string,
  ): Promise<boolean> {
    // Remove existing and add new
    await this.removeScheduledTask(taskId);
    return await this.addScheduledTask(taskId, cronExpression);
  }

  private async executeScheduledTask(taskId: string): Promise<void> {
    try {
      const task = await this.database.getTask(taskId);
      if (!task) {
        console.error(`Scheduled task ${taskId} not found`);
        return;
      }

      // Check if task can be executed
      if (!task.schedule || !task.schedule.enabled) {
        console.log(`Skipping disabled scheduled task ${taskId}`);
        return;
      }

      // Check max runs limit
      if (
        task.schedule.maxRuns &&
        task.schedule.currentRuns >= task.schedule.maxRuns
      ) {
        console.log(
          `Task ${taskId} has reached max runs limit (${task.schedule.maxRuns})`,
        );

        // Disable the schedule
        await this.database.updateTask(taskId, {
          schedule: { ...task.schedule, enabled: false },
        });

        await this.removeScheduledTask(taskId);
        await this.database.addTaskLog(
          taskId,
          LogLevel.INFO,
          `Task disabled after reaching max runs limit (${task.schedule.maxRuns})`,
        );
        return;
      }

      // Check if agent is available
      const runningTask = await this.database.getRunningTaskForAgent(
        task.agentId,
      );
      if (runningTask) {
        console.log(
          `Agent ${task.agentId} is busy with task ${runningTask.id}, skipping scheduled task ${taskId}`,
        );
        await this.database.addTaskLog(
          taskId,
          LogLevel.WARN,
          `Scheduled execution skipped - agent busy with task ${runningTask.id}`,
        );
        return;
      }

      console.log(`Executing scheduled task ${taskId}`);

      await this.database.addTaskLog(
        taskId,
        LogLevel.INFO,
        `Starting scheduled execution (run ${task.schedule.currentRuns + 1})`,
      );

      // Create a new task instance for this execution
      const newTask = await this.database.createTask({
        agentId: task.agentId,
        configPath: "", // No longer using file paths
        configContent: task.configContent,
        configType: task.configType,
        name: `${task.name} (scheduled)`,
        description: task.description,
        status: TaskStatus.PENDING,
        currentState: {},
        logs: [],
        resources: task.resources,
        timeoutMs: task.timeoutMs,
      });

      // Update original task's run count
      await this.database.updateTask(taskId, {
        schedule: {
          ...task.schedule,
          currentRuns: task.schedule.currentRuns + 1,
        },
      });

      await this.database.addTaskLog(
        taskId,
        LogLevel.INFO,
        `Created scheduled execution task ${newTask.id} (run ${
          task.schedule.currentRuns + 1
        })`,
      );

      // Start the new task
      const started = await this.orchestrator.startTask(newTask.id);
      if (!started) {
        await this.database.addTaskLog(
          taskId,
          LogLevel.ERROR,
          `Failed to start scheduled execution task ${newTask.id}`,
        );
      }
    } catch (error) {
      console.error(`Error executing scheduled task ${taskId}:`, error);
      await this.database.addTaskLog(
        taskId,
        LogLevel.ERROR,
        `Scheduled execution failed: ${(error as Error).message}`,
      );
    }
  }

  private async loadScheduledTasks(): Promise<void> {
    try {
      const allTasks = await this.database.getAllTasks();
      const scheduledTasks = allTasks.filter((task) =>
        task.status === TaskStatus.SCHEDULED &&
        task.schedule &&
        task.schedule.enabled
      );

      for (const task of scheduledTasks) {
        if (task.schedule && task.schedule.cronExpression) {
          await this.addScheduledTask(task.id, task.schedule.cronExpression);
        }
      }

      console.log(`Loaded ${scheduledTasks.length} scheduled tasks`);
    } catch (error) {
      console.error("Error loading scheduled tasks:", error);
    }
  }

  private startPeriodicCheck(): void {
    if (!this.checkInterval || !this.running) return;

    setTimeout(async () => {
      if (!this.running) return;

      try {
        // Check for new or updated scheduled tasks
        const allTasks = await this.database.getAllTasks();
        const scheduledTasks = allTasks.filter((task) =>
          task.status === TaskStatus.SCHEDULED &&
          task.schedule &&
          task.schedule.enabled
        );

        // Add new scheduled tasks and update existing ones with changed cron expressions
        for (const task of scheduledTasks) {
          if (task.schedule?.cronExpression) {
            if (!this.scheduledJobs.has(task.id)) {
              // New scheduled task
              await this.addScheduledTask(
                task.id,
                task.schedule.cronExpression,
              );
            } else {
              // Check if cron expression has changed
              const existingExpression = this.scheduledExpressions.get(task.id);
              if (
                existingExpression &&
                existingExpression !== task.schedule.cronExpression
              ) {
                console.log(
                  `Cron expression changed for task ${task.id}: ${existingExpression} -> ${task.schedule.cronExpression}`,
                );
                await this.updateScheduledTask(
                  task.id,
                  task.schedule.cronExpression,
                );
              }
            }
          }
        }

        // Remove disabled or deleted scheduled tasks
        const activeTaskIds = new Set(scheduledTasks.map((t) => t.id));
        const jobsToRemove = [];

        for (const taskId of this.scheduledJobs.keys()) {
          if (!activeTaskIds.has(taskId)) {
            jobsToRemove.push(taskId);
          }
        }

        for (const taskId of jobsToRemove) {
          await this.removeScheduledTask(taskId);
        }
      } catch (error) {
        console.error("Error in scheduler periodic check:", error);
      }

      // Schedule next check
      this.startPeriodicCheck();
    }, this.checkInterval);
  }

  // Get scheduler status
  getStatus(): {
    running: boolean;
    scheduledTasks: number;
    jobs: Array<{ taskId: string; nextRun?: Date; running: boolean }>;
  } {
    const jobs = [];

    for (const [taskId, job] of this.scheduledJobs) {
      jobs.push({
        taskId,
        nextRun: job.nextDate()?.toJSDate(),
        running: (job as any).running ?? false,
      });
    }

    return {
      running: this.running,
      scheduledTasks: this.scheduledJobs.size,
      jobs: jobs.sort((a, b) => {
        if (!a.nextRun) return 1;
        if (!b.nextRun) return -1;
        return a.nextRun.getTime() - b.nextRun.getTime();
      }),
    };
  }

  // Validate cron expression
  static validateCronExpression(expression: string): boolean {
    try {
      const job = new CronJob(expression, () => {}, null, false);
      job.stop();
      return true;
    } catch (_error) {
      return false;
    }
  }

  // Get next run times for a cron expression
  static getNextRunTimes(expression: string, count = 5): Date[] {
    try {
      const job = new CronJob(expression, () => {}, null, false);
      const times = [];

      for (let i = 0; i < count; i++) {
        const nextTime = job.nextDate();
        if (nextTime) {
          times.push(nextTime.toJSDate());
        }
      }

      job.stop();
      return times;
    } catch (_error) {
      return [];
    }
  }
}
