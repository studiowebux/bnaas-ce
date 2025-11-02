// JSON file-based database for task persistence
import {
  Agent,
  Database,
  LogLevel,
  PruningConfig,
  Secret,
  SecretListResponse,
  Task,
  TaskAction,
  TaskActivity,
  TaskStatus,
} from "../types/orchestrator.ts";

export class JsonDatabase {
  private dbPath: string;
  private data: Database;
  private saveTimeout: number | null = null;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.data = this.initializeDatabase();
    this.loadDatabase();
  }

  private initializeDatabase(): Database {
    return {
      tasks: [],
      agents: [],
      secrets: [],
      version: "1.0.0",
      lastUpdated: new Date(),
    };
  }

  private async loadDatabase(): Promise<void> {
    try {
      const content = await Deno.readTextFile(this.dbPath);
      const parsed = JSON.parse(content);

      // Convert date strings back to Date objects
      this.data = {
        ...parsed,
        lastUpdated: new Date(parsed.lastUpdated),
        tasks: parsed.tasks.map((task: any) => ({
          ...task,
          createdAt: new Date(task.createdAt),
          startedAt: task.startedAt ? new Date(task.startedAt) : undefined,
          endedAt: task.endedAt ? new Date(task.endedAt) : undefined,
          logs: task.logs.map((log: any) => ({
            ...log,
            timestamp: new Date(log.timestamp),
          })),
        })),
        agents: parsed.agents.map((agent: any) => ({
          ...agent,
          lastActivity: agent.lastActivity
            ? new Date(agent.lastActivity)
            : undefined,
        })),
        secrets: (parsed.secrets || []).map((secret: any) => ({
          ...secret,
          createdAt: new Date(secret.createdAt),
          updatedAt: new Date(secret.updatedAt),
          lastUsed: secret.lastUsed ? new Date(secret.lastUsed) : undefined,
        })),
      };
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        // Database file doesn't exist, create it
        await this.saveDatabase();
      } else {
        console.error("Error loading database:", error);
        throw error;
      }
    }
  }

  private async saveDatabase(): Promise<void> {
    // Debounce saves to avoid excessive I/O
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(async () => {
      try {
        this.data.lastUpdated = new Date();
        const content = JSON.stringify(this.data, null, 2);
        await Deno.writeTextFile(this.dbPath, content);
      } catch (error) {
        console.error("Error saving database:", error);
      }
      this.saveTimeout = null;
    }, 100);
  }

  // Task operations
  async createTask(
    task: Omit<Task, "id" | "createdAt" | "isDeleted">,
  ): Promise<Task> {
    const newTask: Task = {
      ...task,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      logs: [],
      isDeleted: false,
      status: task.status || TaskStatus.PENDING, // Default to PENDING if not specified
    };

    this.data.tasks.push(newTask);
    await this.saveDatabase();
    return newTask;
  }

  async getTask(id: string): Promise<Task | null> {
    return this.data.tasks.find((task) => task.id === id) || null;
  }

  async getAllTasks(includeDeleted = false): Promise<Task[]> {
    if (includeDeleted) {
      return [...this.data.tasks];
    }
    return this.data.tasks.filter((task) => !task.isDeleted);
  }

  async getTasksByStatus(
    status: TaskStatus,
    includeDeleted = false,
  ): Promise<Task[]> {
    let tasks = this.data.tasks.filter((task) => task.status === status);
    if (!includeDeleted) {
      tasks = tasks.filter((task) => !task.isDeleted);
    }
    return tasks;
  }

  async getTasksByAgent(
    agentId: string,
    includeDeleted = false,
  ): Promise<Task[]> {
    let tasks = this.data.tasks.filter((task) => task.agentId === agentId);
    if (!includeDeleted) {
      tasks = tasks.filter((task) => !task.isDeleted);
    }
    return tasks;
  }

  async getDeletedTasks(): Promise<Task[]> {
    const tasks = this.data.tasks.filter((task) => task.isDeleted);
    return tasks;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
    const taskIndex = this.data.tasks.findIndex((task) => task.id === id);
    if (taskIndex === -1) return null;

    this.data.tasks[taskIndex] = { ...this.data.tasks[taskIndex], ...updates };
    await this.saveDatabase();
    return this.data.tasks[taskIndex];
  }

  async deleteTask(id: string, deletedBy?: string): Promise<boolean> {
    const task = this.data.tasks.find((task) => task.id === id);
    if (!task) return false;

    // Soft delete
    task.isDeleted = true;
    task.deletedAt = new Date();
    task.status = TaskStatus.DELETED;
    if (deletedBy) {
      task.deletedBy = deletedBy;
    }

    await this.saveDatabase();
    return true;
  }

  async restoreTask(id: string): Promise<boolean> {
    const task = this.data.tasks.find((task) =>
      task.id === id && task.isDeleted
    );
    if (!task) return false;

    // Restore task - figure out what status it should have
    task.isDeleted = false;
    task.deletedAt = undefined;
    task.deletedBy = undefined;

    // Determine appropriate status
    if (task.schedule && task.schedule.enabled) {
      task.status = TaskStatus.SCHEDULED;
    } else if (task.status === TaskStatus.DELETED) {
      task.status = TaskStatus.PENDING; // Default restored status
    }

    await this.saveDatabase();
    return true;
  }

  async permanentlyDeleteTask(id: string): Promise<boolean> {
    const taskIndex = this.data.tasks.findIndex((task) => task.id === id);
    if (taskIndex === -1) return false;

    this.data.tasks.splice(taskIndex, 1);
    await this.saveDatabase();
    return true;
  }

  async addTaskLog(
    taskId: string,
    level: LogLevel,
    message: string,
    data?: any,
  ): Promise<boolean> {
    const task = this.data.tasks.find((task) => task.id === taskId);
    if (!task) return false;

    task.logs.push({
      timestamp: new Date(),
      level,
      message,
      data,
    });

    await this.saveDatabase();
    return true;
  }

  // Agent operations
  async createAgent(agent: Omit<Agent, "id">): Promise<Agent> {
    const newAgent: Agent = {
      ...agent,
      id: crypto.randomUUID(),
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
    };

    this.data.agents.push(newAgent);
    await this.saveDatabase();
    return newAgent;
  }

  async getAgent(id: string): Promise<Agent | null> {
    return this.data.agents.find((agent) => agent.id === id) || null;
  }

  async getAllAgents(): Promise<Agent[]> {
    return [...this.data.agents];
  }

  async updateAgent(
    id: string,
    updates: Partial<Agent>,
  ): Promise<Agent | null> {
    const agentIndex = this.data.agents.findIndex((agent) => agent.id === id);
    if (agentIndex === -1) return null;

    this.data.agents[agentIndex] = {
      ...this.data.agents[agentIndex],
      ...updates,
    };
    await this.saveDatabase();
    return this.data.agents[agentIndex];
  }

  async deleteAgent(id: string): Promise<boolean> {
    const agentIndex = this.data.agents.findIndex((agent) => agent.id === id);
    if (agentIndex === -1) return false;

    this.data.agents.splice(agentIndex, 1);
    await this.saveDatabase();
    return true;
  }

  // Statistics and analytics
  async getStatistics(includeDeleted = false): Promise<{
    totalTasks: number;
    runningTasks: number;
    completedTasks: number;
    failedTasks: number;
    scheduledTasks: number;
    deletedTasks: number;
    averageRuntime: number;
    tasksByAgent: Record<string, number>;
    tasksByStatus: Record<TaskStatus, number>;
  }> {
    let tasks = this.data.tasks;
    if (!includeDeleted) {
      tasks = tasks.filter((task) => !task.isDeleted);
    }
    const deletedTasks = this.data.tasks.filter((task) => task.isDeleted);
    const completedTasks = tasks.filter((t) =>
      t.status === TaskStatus.COMPLETED && t.duration
    );

    const averageRuntime = completedTasks.length > 0
      ? completedTasks.reduce((sum, task) => sum + (task.duration || 0), 0) /
        completedTasks.length
      : 0;

    const tasksByAgent: Record<string, number> = {};
    const tasksByStatus: Record<TaskStatus, number> = {
      [TaskStatus.PENDING]: 0,
      [TaskStatus.RUNNING]: 0,
      [TaskStatus.COMPLETED]: 0,
      [TaskStatus.FAILED]: 0,
      [TaskStatus.CANCELLED]: 0,
      [TaskStatus.SCHEDULED]: 0,
      [TaskStatus.DELETED]: 0,
    };

    for (const task of tasks) {
      tasksByAgent[task.agentId] = (tasksByAgent[task.agentId] || 0) + 1;
      tasksByStatus[task.status]++;
    }

    return {
      totalTasks: tasks.length,
      runningTasks: tasksByStatus[TaskStatus.RUNNING],
      completedTasks: tasksByStatus[TaskStatus.COMPLETED],
      failedTasks: tasksByStatus[TaskStatus.FAILED],
      scheduledTasks: tasksByStatus[TaskStatus.SCHEDULED],
      deletedTasks: deletedTasks.length,
      averageRuntime,
      tasksByAgent,
      tasksByStatus,
    };
  }

  async getRecentActivity(limit = 50): Promise<TaskActivity[]> {
    const activities: TaskActivity[] = [];

    for (const task of this.data.tasks) {
      activities.push({
        taskId: task.id,
        agentId: task.agentId,
        action: TaskAction.CREATED,
        timestamp: task.createdAt,
        details: `Task "${task.name}" created`,
      });

      if (task.startedAt) {
        activities.push({
          taskId: task.id,
          agentId: task.agentId,
          action: TaskAction.STARTED,
          timestamp: task.startedAt,
          details: `Task "${task.name}" started`,
        });
      }

      if (task.endedAt) {
        const action = task.status === TaskStatus.COMPLETED
          ? TaskAction.COMPLETED
          : task.status === TaskStatus.FAILED
          ? TaskAction.FAILED
          : TaskAction.CANCELLED;
        activities.push({
          taskId: task.id,
          agentId: task.agentId,
          action,
          timestamp: task.endedAt,
          details: `Task "${task.name}" ${action}`,
        });
      }
    }

    return activities
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  // Utility methods
  async cleanup(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      await this.saveDatabase();
    }
  }

  // Get running task for agent (enforce one task per agent)
  async getRunningTaskForAgent(agentId: string): Promise<Task | null> {
    return this.data.tasks.find((task) =>
      task.agentId === agentId && task.status === TaskStatus.RUNNING
    ) || null;
  }

  // Pagination helper
  async getTasksPaginated(
    page: number,
    limit: number,
    sortBy = "createdAt",
    sortOrder: "asc" | "desc" = "desc",
    includeDeleted = false,
  ): Promise<{
    tasks: Task[];
    total: number;
    hasNext: boolean;
    hasPrev: boolean;
  }> {
    let allTasks = [...this.data.tasks];

    if (!includeDeleted) {
      allTasks = allTasks.filter((task) => !task.isDeleted);
    }

    // Sort tasks
    allTasks.sort((a, b) => {
      const aVal = (a as any)[sortBy];
      const bVal = (b as any)[sortBy];

      if (aVal instanceof Date && bVal instanceof Date) {
        return sortOrder === "asc"
          ? aVal.getTime() - bVal.getTime()
          : bVal.getTime() - aVal.getTime();
      }

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortOrder === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortOrder === "asc"
        ? (aVal > bVal ? 1 : -1)
        : (bVal > aVal ? 1 : -1);
    });

    const startIndex = (page - 1) * limit;
    const tasks = allTasks.slice(startIndex, startIndex + limit);

    return {
      tasks,
      total: allTasks.length,
      hasNext: startIndex + limit < allTasks.length,
      hasPrev: page > 1,
    };
  }

  // Pruning functionality
  async pruneOldData(config: PruningConfig): Promise<{
    tasksRemoved: number;
    agentsRemoved: number;
    spaceFreed: number;
  }> {
    const cutoffDate = new Date(
      Date.now() - (config.retentionDays * 24 * 60 * 60 * 1000),
    );
    const batchSize = config.batchSize || 100;
    const dryRun = config.dryRun || false;

    console.log(
      `Starting data pruning (${
        dryRun ? "DRY RUN" : "LIVE"
      }) - removing data older than ${cutoffDate.toISOString()}`,
    );

    let tasksRemoved = 0;
    let agentsRemoved = 0;
    let spaceFreed = 0;

    // Calculate space before pruning
    const spaceBefore = JSON.stringify(this.data).length;

    // Prune completed/failed/cancelled tasks older than cutoff date
    const oldTasks = this.data.tasks.filter((task) => {
      const isOld = task.endedAt && task.endedAt < cutoffDate;
      const isEligibleForPruning = ["completed", "failed", "cancelled"]
        .includes(task.status);
      return isOld && isEligibleForPruning;
    });

    console.log(`Found ${oldTasks.length} old tasks eligible for pruning`);

    if (!dryRun) {
      // Process tasks in batches
      for (let i = 0; i < oldTasks.length; i += batchSize) {
        const batch = oldTasks.slice(i, i + batchSize);

        for (const task of batch) {
          // Remove task permanently
          const taskIndex = this.data.tasks.findIndex((t) => t.id === task.id);
          if (taskIndex !== -1) {
            this.data.tasks.splice(taskIndex, 1);
            tasksRemoved++;
          }
        }

        // Save after each batch
        await this.saveDatabase();
        console.log(
          `Processed batch ${Math.floor(i / batchSize) + 1}/${
            Math.ceil(oldTasks.length / batchSize)
          }`,
        );
      }
    } else {
      tasksRemoved = oldTasks.length;
      console.log(`DRY RUN: Would remove ${tasksRemoved} tasks`);

      // Log sample of tasks that would be removed
      oldTasks.slice(0, 10).forEach((task) => {
        console.log(
          `  - Task ${task.id} (${task.name}) - ended ${task.endedAt?.toISOString()}`,
        );
      });
      if (oldTasks.length > 10) {
        console.log(`  ... and ${oldTasks.length - 10} more tasks`);
      }
    }

    // Prune orphaned agents (no active tasks and not used recently)
    const orphanedAgents = this.data.agents.filter((agent) => {
      const isOld = agent.lastActivity && agent.lastActivity < cutoffDate;
      const hasNoActiveTasks = !this.data.tasks.some((task) =>
        task.agentId === agent.id && !task.isDeleted &&
        ["running", "pending", "scheduled"].includes(task.status)
      );
      return isOld && hasNoActiveTasks;
    });

    console.log(
      `Found ${orphanedAgents.length} orphaned agents eligible for pruning`,
    );

    if (!dryRun) {
      for (const agent of orphanedAgents) {
        const agentIndex = this.data.agents.findIndex((a) => a.id === agent.id);
        if (agentIndex !== -1) {
          this.data.agents.splice(agentIndex, 1);
          agentsRemoved++;
        }
      }
    } else {
      agentsRemoved = orphanedAgents.length;
      console.log(`DRY RUN: Would remove ${agentsRemoved} agents`);

      orphanedAgents.slice(0, 5).forEach((agent) => {
        console.log(
          `  - Agent ${agent.id} (${agent.name}) - last activity ${agent.lastActivity?.toISOString()}`,
        );
      });
      if (orphanedAgents.length > 5) {
        console.log(`  ... and ${orphanedAgents.length - 5} more agents`);
      }
    }

    // Calculate space after pruning
    const spaceAfter = JSON.stringify(this.data).length;
    spaceFreed = spaceBefore - spaceAfter;

    const result = { tasksRemoved, agentsRemoved, spaceFreed };

    console.log(`Pruning completed:`);
    console.log(`   - Tasks removed: ${tasksRemoved}`);
    console.log(`   - Agents removed: ${agentsRemoved}`);
    console.log(`   - Space freed: ${this.formatBytes(spaceFreed)}`);
    console.log(
      `   - Database size: ${this.formatBytes(spaceBefore)} → ${
        this.formatBytes(spaceAfter)
      }`,
    );

    if (!dryRun) {
      await this.saveDatabase();
    }

    return result;
  }

  async pruneLogs(config: PruningConfig): Promise<number> {
    const cutoffDate = new Date(
      Date.now() - (config.retentionDays * 24 * 60 * 60 * 1000),
    );
    const dryRun = config.dryRun || false;

    console.log(`Pruning task logs older than ${cutoffDate.toISOString()}`);

    let totalLogsRemoved = 0;

    for (const task of this.data.tasks) {
      const oldLogs = task.logs.filter((log) => log.timestamp < cutoffDate);
      const logsBefore = task.logs.length;

      if (oldLogs.length > 0) {
        if (!dryRun) {
          // Keep only recent logs
          task.logs = task.logs.filter((log) => log.timestamp >= cutoffDate);
        }

        const logsRemoved = oldLogs.length;
        totalLogsRemoved += logsRemoved;

        if (logsRemoved > 0) {
          console.log(
            `  - Task ${task.id}: ${logsBefore} → ${task.logs.length} logs (removed ${logsRemoved})`,
          );
        }
      }
    }

    console.log(
      `Total logs ${
        dryRun ? "that would be" : ""
      } removed: ${totalLogsRemoved}`,
    );

    if (!dryRun && totalLogsRemoved > 0) {
      await this.saveDatabase();
    }

    return totalLogsRemoved;
  }

  // Get pruning statistics
  getPruningStats(retentionDays: number): {
    eligibleTasks: number;
    eligibleAgents: number;
    eligibleLogs: number;
    estimatedSpaceSaved: number;
  } {
    const cutoffDate = new Date(
      Date.now() - (retentionDays * 24 * 60 * 60 * 1000),
    );

    const eligibleTasks = this.data.tasks.filter((task) => {
      const isOld = task.endedAt && task.endedAt < cutoffDate;
      const isEligibleForPruning =
        ["completed", "failed", "cancelled"].includes(task.status) &&
        !task.isDeleted;
      return isOld && isEligibleForPruning;
    }).length;

    const eligibleAgents = this.data.agents.filter((agent) => {
      const isOld = agent.lastActivity && agent.lastActivity < cutoffDate;
      const hasNoActiveTasks = !this.data.tasks.some((task) =>
        task.agentId === agent.id && !task.isDeleted &&
        ["running", "pending", "scheduled"].includes(task.status)
      );
      return isOld && hasNoActiveTasks;
    }).length;

    let eligibleLogs = 0;
    for (const task of this.data.tasks) {
      eligibleLogs += task.logs.filter((log) =>
        log.timestamp < cutoffDate
      ).length;
    }

    // Rough estimation of space saved
    const estimatedSpaceSaved = (eligibleTasks * 1000) +
      (eligibleAgents * 200) + (eligibleLogs * 100);

    return { eligibleTasks, eligibleAgents, eligibleLogs, estimatedSpaceSaved };
  }

  async getPruningPreview(retentionDays: number): Promise<{
    cutoffDate: Date;
    eligibleTasks: Array<{
      id: string;
      name: string;
      status: string;
      endedAt: Date | null;
      agentId: string;
    }>;
    eligibleAgents: Array<{
      id: string;
      name: string;
      lastActivity: Date | null;
    }>;
    eligibleLogsCount: number;
    retentionPolicy: string;
  }> {
    const cutoffDate = new Date(
      Date.now() - (retentionDays * 24 * 60 * 60 * 1000),
    );

    const eligibleTasks = this.data.tasks.filter((task) => {
      const isOld = task.endedAt && task.endedAt < cutoffDate;
      const isEligibleForPruning =
        ["completed", "failed", "cancelled"].includes(task.status) &&
        !task.isDeleted;
      return isOld && isEligibleForPruning;
    }).map((task) => ({
      id: task.id,
      name: task.name,
      status: task.status,
      endedAt: task.endedAt || null,
      agentId: task.agentId,
    }));

    const eligibleAgents = this.data.agents.filter((agent) => {
      const isOld = agent.lastActivity && agent.lastActivity < cutoffDate;
      const hasNoActiveTasks = !this.data.tasks.some((task) =>
        task.agentId === agent.id && !task.isDeleted &&
        ["running", "pending", "scheduled"].includes(task.status)
      );
      return isOld && hasNoActiveTasks;
    }).map((agent) => ({
      id: agent.id,
      name: agent.name,
      lastActivity: agent.lastActivity || null,
    }));

    let eligibleLogsCount = 0;
    for (const task of this.data.tasks) {
      eligibleLogsCount += task.logs.filter((log) =>
        log.timestamp < cutoffDate
      ).length;
    }

    const retentionPolicy =
      `Data older than ${retentionDays} days (before ${cutoffDate.toISOString()}) will be removed`;

    return {
      cutoffDate,
      eligibleTasks,
      eligibleAgents,
      eligibleLogsCount,
      retentionPolicy,
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  // Secrets management methods
  async getAllSecrets(): Promise<Secret[]> {
    return [...this.data.secrets];
  }

  async getSecretsForNames(names: string[]): Promise<Secret[]> {
    return this.data.secrets.filter((secret) => names.includes(secret.name));
  }

  async getSecretsPaginated(
    page: number,
    limit: number,
  ): Promise<SecretListResponse> {
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const secrets = this.data.secrets.slice(startIndex, endIndex);

    // Remove values from response for security
    const sanitizedSecrets = secrets.map(({ value, ...secret }) => secret);

    return {
      secrets: sanitizedSecrets,
      total: this.data.secrets.length,
      page,
      limit,
      hasNext: endIndex < this.data.secrets.length,
      hasPrev: page > 1,
    };
  }

  async getSecret(id: string): Promise<Secret | null> {
    return this.data.secrets.find((s) => s.id === id) || null;
  }

  async getSecretByName(name: string): Promise<Secret | null> {
    return this.data.secrets.find((s) => s.name === name) || null;
  }

  async createSecret(secretData: Omit<Secret, "id">): Promise<Secret> {
    const secret: Secret = {
      id: crypto.randomUUID(),
      ...secretData,
    };

    this.data.secrets.push(secret);
    this.data.lastUpdated = new Date();
    await this.saveDatabase();

    return secret;
  }

  async updateSecret(
    id: string,
    updates: Partial<Omit<Secret, "id" | "createdAt">>,
  ): Promise<Secret | null> {
    const index = this.data.secrets.findIndex((s) => s.id === id);
    if (index === -1) return null;

    this.data.secrets[index] = {
      ...this.data.secrets[index],
      ...updates,
      id, // Ensure ID doesn't change
      updatedAt: new Date(),
    };

    this.data.lastUpdated = new Date();
    await this.saveDatabase();

    return this.data.secrets[index];
  }

  async deleteSecret(id: string): Promise<boolean> {
    const index = this.data.secrets.findIndex((s) => s.id === id);
    if (index === -1) return false;

    this.data.secrets.splice(index, 1);
    this.data.lastUpdated = new Date();
    await this.saveDatabase();

    return true;
  }

  async updateSecretLastUsed(id: string): Promise<void> {
    const secret = this.data.secrets.find((s) => s.id === id);
    if (secret) {
      secret.lastUsed = new Date();
      this.data.lastUpdated = new Date();
      await this.saveDatabase();
    }
  }

  async searchSecrets(query: string, tags?: string[]): Promise<Secret[]> {
    const lowerQuery = query.toLowerCase();

    return this.data.secrets.filter((secret) => {
      const matchesQuery = !query ||
        secret.name.toLowerCase().includes(lowerQuery) ||
        (secret.description &&
          secret.description.toLowerCase().includes(lowerQuery));

      const matchesTags = !tags || tags.length === 0 ||
        (secret.tags && tags.some((tag) => secret.tags!.includes(tag)));

      return matchesQuery && matchesTags;
    });
  }

  // Get all unique tags across secrets
  async getSecretTags(): Promise<string[]> {
    const tagSet = new Set<string>();

    for (const secret of this.data.secrets) {
      if (secret.tags) {
        for (const tag of secret.tags) {
          tagSet.add(tag);
        }
      }
    }

    return Array.from(tagSet).sort();
  }
}
