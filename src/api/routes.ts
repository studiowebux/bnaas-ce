// API routes for the orchestrator
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import {
  Agent,
  AgentSecretAssignment,
  AgentStatus,
  ApiResponse,
  CreateSecretRequest,
  CreateTaskRequest,
  LogLevel,
  SecretListResponse,
  SwarmTaskRequest,
  Task,
  TaskListResponse,
  TaskStatus,
  UpdateSecretRequest,
  UpdateTaskRequest,
} from "../types/orchestrator.ts";
import { parse as parseYaml } from "yaml";
import { JsonDatabase } from "../database/json-db.ts";
import { loadConfigFromString } from "../runner/graph-executor.ts";
import { TaskOrchestrator } from "../orchestrator/task-orchestrator.ts";
import { TaskScheduler } from "../scheduler/task-scheduler.ts";
import { WebSocketManager } from "../websocket/websocket-manager.ts";
import { PruningService } from "../services/pruning-service.ts";
import { SecretsService } from "../services/secrets-service.ts";
import { INDEX } from "../html/index.ts";
import { APP } from "../html/app.ts";

export function createApp(
  database: JsonDatabase,
  orchestrator: TaskOrchestrator,
  scheduler: TaskScheduler,
  wsManager: WebSocketManager,
  pruningService?: PruningService,
  secretsService?: SecretsService,
): Hono {
  const app = new Hono();

  // WebSocket endpoint - MUST be before middleware to avoid header conflicts
  app.get("/ws", (c) => {
    if (c.req.header("upgrade") !== "websocket") {
      return c.text("Expected websocket", 400);
    }

    const { response, socket } = Deno.upgradeWebSocket(c.req.raw);

    socket.onopen = () => {
      console.log("WebSocket connection opened");
      wsManager.addConnection(socket);

      // Send initial connection message
      socket.send(JSON.stringify({
        type: "connection",
        message: "Connected to Botnet Orchestrator",
        timestamp: new Date().toISOString(),
      }));
    };

    socket.onmessage = (e) => {
      console.log("WebSocket message:", e.data);

      try {
        const message = JSON.parse(e.data);

        // Handle subscription requests
        if (message.type === "subscribe") {
          // TODO: Handle subscription to specific tasks/agents
          console.log("Subscription request:", message);
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    socket.onclose = () => {
      console.log("WebSocket connection closed");
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return response;
  });

  // Middleware - applied AFTER WebSocket route
  app.use("*", cors());
  app.use("*", logger());

  app.get("/static/js/app.js", (c) => {
    return c.html(APP);
  });

  app.get("/", (c) => {
    return c.html(INDEX);
  });

  // API Routes
  const api = new Hono();

  // Tasks endpoints
  api.get("/tasks", async (c) => {
    try {
      const query = c.req.query();
      const page = parseInt(query.page || "1");
      const limit = parseInt(query.limit || "20");
      const sortBy = query.sortBy || "createdAt";
      const sortOrder = (query.sortOrder as "asc" | "desc") || "desc";
      const status = query.status as TaskStatus;
      const agentId = query.agentId;

      let tasks: Task[];

      if (status) {
        tasks = await database.getTasksByStatus(status);
      } else if (agentId) {
        tasks = await database.getTasksByAgent(agentId);
      } else {
        const result = await database.getTasksPaginated(
          page,
          limit,
          sortBy,
          sortOrder,
        );
        const response: TaskListResponse = {
          tasks: result.tasks,
          total: result.total,
          page,
          limit,
          hasNext: result.hasNext,
          hasPrev: result.hasPrev,
        };
        return c.json(
          { success: true, data: response } as ApiResponse<TaskListResponse>,
        );
      }

      // For filtered results, apply manual pagination
      const startIndex = (page - 1) * limit;
      const paginatedTasks = tasks.slice(startIndex, startIndex + limit);

      const response: TaskListResponse = {
        tasks: paginatedTasks,
        total: tasks.length,
        page,
        limit,
        hasNext: startIndex + limit < tasks.length,
        hasPrev: page > 1,
      };

      return c.json(
        { success: true, data: response } as ApiResponse<TaskListResponse>,
      );
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  // Config validation endpoint
  api.post("/configs/validate", async (c) => {
    try {
      const body = await c.req.json();
      const { content, type } = body;

      if (!content || !type) {
        return c.json({
          success: false,
          error: "Content and type are required",
        } as ApiResponse, 400);
      }

      let parsedConfig: any;

      try {
        if (type === "json") {
          parsedConfig = JSON.parse(content);
        } else if (type === "yaml") {
          parsedConfig = parseYaml(content);
        } else {
          return c.json({
            success: false,
            error: "Unsupported config type. Use 'json' or 'yaml'",
          } as ApiResponse, 400);
        }
      } catch (parseError) {
        return c.json({
          success: false,
          error: `Invalid ${type.toUpperCase()} format: ${
            (parseError as Error).message
          }`,
        } as ApiResponse, 400);
      }

      // Basic validation - check for required graph structure
      if (!parsedConfig.graph) {
        return c.json({
          success: false,
          error: "Config must contain a 'graph' object",
        } as ApiResponse, 400);
      }

      let nodes = [];
      let nodeCount = 0;
      let hasStart = false;
      let hasEnd = false;

      // Handle both formats: array-based nodes and object-based nodes
      if (parsedConfig.graph.nodes && Array.isArray(parsedConfig.graph.nodes)) {
        // Array format: { graph: { nodes: [...] } }
        nodes = parsedConfig.graph.nodes;
        nodeCount = nodes.length;
        hasStart = nodes.some((n: any) => n.type === "start");
        hasEnd = nodes.some((n: any) => n.type === "end");
      } else {
        // Object format: { graph: { nodeName: {...}, ... } }
        const graphKeys = Object.keys(parsedConfig.graph);
        nodes = graphKeys.map((key) => ({
          id: key,
          ...parsedConfig.graph[key],
        }));
        nodeCount = nodes.length;

        // Check for start node (either type: 'start' or node named 'start')
        hasStart = nodes.some((n: any) =>
          n.type === "start" || n.id === "start"
        );

        // Check for end nodes (either type: 'end' or nodes with type: 'end')
        hasEnd = nodes.some((n: any) => n.type === "end");
      }

      if (nodeCount === 0) {
        return c.json({
          success: false,
          error: "Graph must contain at least one node",
        } as ApiResponse, 400);
      }

      return c.json({
        success: true,
        message: "Config is valid",
        data: {
          nodeCount,
          hasStart,
          hasEnd,
          format: parsedConfig.graph.nodes ? "array" : "object",
        },
      } as ApiResponse);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  api.post("/tasks", async (c) => {
    try {
      const body: CreateTaskRequest = await c.req.json();

      // Validate required fields
      if (!body.agentId || !body.name) {
        return c.json({
          success: false,
          error: "Missing required fields: agentId, name",
        } as ApiResponse, 400);
      }

      // Validate config input - must have configContent and configType
      if (!body.configContent || !body.configType) {
        return c.json({
          success: false,
          error: "configContent and configType are required",
        } as ApiResponse, 400);
      }

      // If configPath is provided but no content, read the file
      let configContent = body.configContent;
      if (body.configPath && !body.configContent) {
        try {
          configContent = await Deno.readTextFile(body.configPath);
        } catch (error) {
          return c.json({
            success: false,
            error: `Failed to read config file: ${(error as Error).message}`,
          } as ApiResponse, 400);
        }
      }

      // Parse and validate config content
      let parsedConfig;
      try {
        parsedConfig = loadConfigFromString(
          configContent,
          body.configType as "yaml" | "json",
        );
      } catch (error) {
        return c.json({
          success: false,
          error: `Invalid config format: ${(error as Error).message}`,
        } as ApiResponse, 400);
      }

      // Check if agent exists
      const agent = await database.getAgent(body.agentId);
      if (!agent) {
        return c.json({
          success: false,
          error: "Agent not found",
        } as ApiResponse, 404);
      }

      // Create task
      const task = await database.createTask({
        agentId: body.agentId,
        configPath: "", // No longer using file paths
        configContent: parsedConfig, // Store as parsed JSON object
        configType: body.configType,
        name: body.name,
        description: body.description,
        status: body.schedule ? TaskStatus.SCHEDULED : TaskStatus.PENDING,
        currentState: {},
        logs: [],
        schedule: body.schedule
          ? { ...body.schedule, currentRuns: 0 }
          : undefined,
        resources: body.resources,
        timeoutMs: body.timeoutMs,
      });

      // If scheduled, add to scheduler
      if (task.schedule && task.schedule.enabled) {
        await scheduler.addScheduledTask(task.id, task.schedule.cronExpression);
      }

      // Broadcast task update
      wsManager.broadcastTaskUpdate(task.id, task);

      return c.json({ success: true, data: task } as ApiResponse<Task>, 201);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  api.put("/tasks/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const body: UpdateTaskRequest = await c.req.json();

      const task = await database.getTask(id);
      if (!task) {
        return c.json(
          { success: false, error: "Task not found" } as ApiResponse,
          404,
        );
      }

      // Validate edit permissions based on task status
      if (task.status === TaskStatus.RUNNING) {
        return c.json({
          success: false,
          error: "Cannot edit running task",
        } as ApiResponse, 400);
      }

      // Validate agent exists if changing agent
      if (body.agentId && body.agentId !== task.agentId) {
        const agent = await database.getAgent(body.agentId);
        if (!agent) {
          return c.json({
            success: false,
            error: `Agent with ID ${body.agentId} not found`,
          } as ApiResponse, 400);
        }
      }

      // Parse and validate config content if provided
      let parsedConfig;
      if (body.configContent) {
        // If it's already an object, use it directly
        if (typeof body.configContent === "object") {
          parsedConfig = body.configContent;
        } else {
          // It's a string, so parse it
          try {
            // Try to parse as JSON first, then fall back to determining type
            parsedConfig = JSON.parse(body.configContent);
          } catch (error) {
            // If JSON parsing fails, try to parse based on content format
            try {
              // Auto-detect format and parse
              parsedConfig = body.configContent.trim().startsWith("{")
                ? JSON.parse(body.configContent)
                : parseYaml(body.configContent);
            } catch (parseError) {
              return c.json({
                success: false,
                error: `Invalid config format: ${
                  (parseError as Error).message
                }`,
              } as ApiResponse, 400);
            }
          }
        }
      }

      // Validate cron expression if provided
      if (body.schedule?.cronExpression) {
        const isValidCron = TaskScheduler.validateCronExpression(
          body.schedule.cronExpression,
        );
        if (!isValidCron) {
          return c.json({
            success: false,
            error: "Invalid cron expression",
          } as ApiResponse, 400);
        }
      }

      // Prepare update data with parsed config if provided
      const updateData: Partial<Task> = {};
      if (body.name !== undefined) updateData.name = body.name;
      if (body.description !== undefined) {
        updateData.description = body.description;
      }
      if (body.agentId !== undefined) updateData.agentId = body.agentId;
      if (body.configPath !== undefined) {
        updateData.configPath = body.configPath;
      }
      if (body.configType !== undefined) {
        updateData.configType = body.configType;
      }
      if (body.resources !== undefined) updateData.resources = body.resources;
      if (body.timeoutMs !== undefined) updateData.timeoutMs = body.timeoutMs;
      if (parsedConfig) {
        updateData.configContent = parsedConfig;
      }
      // Add currentRuns to schedule if provided
      if (body.schedule) {
        updateData.schedule = {
          ...body.schedule,
          currentRuns: task.schedule?.currentRuns || 0,
        };
      }

      // Update the task
      const updatedTask = await database.updateTask(id, updateData);
      if (!updatedTask) {
        return c.json({
          success: false,
          error: "Failed to update task",
        } as ApiResponse, 500);
      }

      // Handle schedule changes
      if (body.schedule) {
        if (body.schedule.enabled && body.schedule.cronExpression) {
          // Update scheduled task (this handles both new and existing schedules)
          await scheduler.updateScheduledTask(id, body.schedule.cronExpression);
          await database.updateTask(id, { status: TaskStatus.SCHEDULED });

          await database.addTaskLog(
            id,
            LogLevel.INFO,
            `Task scheduling updated: ${body.schedule.cronExpression}`,
          );
        } else if (body.schedule.enabled === false) {
          // Remove from scheduler and change status to pending
          await scheduler.removeScheduledTask(id);
          await database.updateTask(id, { status: TaskStatus.PENDING });

          await database.addTaskLog(
            id,
            LogLevel.INFO,
            "Task scheduling disabled",
          );
        }
      }

      // Log the edit action
      const changes = [];
      if (body.name && body.name !== task.name) {
        changes.push(`name: "${task.name}" → "${body.name}"`);
      }
      if (body.description && body.description !== task.description) {
        changes.push("description updated");
      }
      if (body.agentId && body.agentId !== task.agentId) {
        changes.push(`agent: ${task.agentId} → ${body.agentId}`);
      }
      if (body.configPath && body.configPath !== task.configPath) {
        changes.push(`config: ${task.configPath} → ${body.configPath}`);
      }
      if (body.timeoutMs && body.timeoutMs !== task.timeoutMs) {
        changes.push(`timeout: ${task.timeoutMs}ms → ${body.timeoutMs}ms`);
      }

      if (changes.length > 0) {
        await database.addTaskLog(
          id,
          LogLevel.INFO,
          `Task edited: ${changes.join(", ")}`,
        );
      }

      const finalTask = await database.getTask(id);

      // Broadcast task update
      wsManager.broadcastTaskUpdate(id, finalTask);

      return c.json({
        success: true,
        data: finalTask,
        message: "Task updated successfully",
      } as ApiResponse<Task>);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  api.delete("/tasks/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const task = await database.getTask(id);

      if (!task || task.isDeleted) {
        return c.json(
          { success: false, error: "Task not found" } as ApiResponse,
          404,
        );
      }

      // Cancel running task first
      if (task.status === TaskStatus.RUNNING) {
        const cancelled = await orchestrator.cancelTask(id);
        if (!cancelled) {
          return c.json({
            success: false,
            error: "Failed to cancel running task",
          } as ApiResponse, 500);
        }
      }

      // Remove from scheduler if scheduled
      if (task.schedule) {
        await scheduler.removeScheduledTask(id);
      }

      // Soft delete the task
      const deleted = await database.deleteTask(id, "system"); // Could track user later
      if (!deleted) {
        return c.json(
          { success: false, error: "Failed to delete task" } as ApiResponse,
          500,
        );
      }

      // Add deletion log
      await database.addTaskLog(id, LogLevel.INFO, "Task soft deleted");

      // Broadcast update
      const updatedTask = await database.getTask(id);
      wsManager.broadcastTaskUpdate(id, updatedTask);

      return c.json({ success: true, message: "Task deleted" } as ApiResponse);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  // Task actions
  api.post("/tasks/:id/start", async (c) => {
    try {
      const id = c.req.param("id");
      const started = await orchestrator.startTask(id);

      if (!started) {
        return c.json({
          success: false,
          error: "Failed to start task",
        } as ApiResponse, 500);
      }

      const task = await database.getTask(id);

      // Broadcast task update
      wsManager.broadcastTaskUpdate(id, task);

      return c.json({ success: true, data: task } as ApiResponse<Task>);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  api.post("/tasks/:id/cancel", async (c) => {
    try {
      const id = c.req.param("id");
      const cancelled = await orchestrator.cancelTask(id);

      if (!cancelled) {
        return c.json({
          success: false,
          error: "Failed to cancel task",
        } as ApiResponse, 500);
      }

      const task = await database.getTask(id);

      // Broadcast task update
      wsManager.broadcastTaskUpdate(id, task);

      return c.json({ success: true, data: task } as ApiResponse<Task>);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  api.post("/tasks/:id/duplicate", async (c) => {
    try {
      const id = c.req.param("id");
      const originalTask = await database.getTask(id);

      if (!originalTask) {
        return c.json({
          success: false,
          error: "Task not found",
        } as ApiResponse, 404);
      }

      // Create duplicate task data (preserve status for scheduled tasks)
      const duplicateStatus = originalTask.status === TaskStatus.SCHEDULED
        ? TaskStatus.SCHEDULED
        : TaskStatus.PENDING;

      const duplicateData = {
        agentId: originalTask.agentId,
        configPath: "", // No longer using file paths
        configContent: originalTask.configContent,
        configType: originalTask.configType,
        name: `${originalTask.name} (copy)`,
        description: originalTask.description,
        status: duplicateStatus,
        currentState: {}, // Reset state
        logs: [], // Reset logs
        schedule: originalTask.schedule
          ? {
            ...originalTask.schedule,
            enabled: originalTask.status === TaskStatus.SCHEDULED
              ? originalTask.schedule.enabled
              : false,
            currentRuns: 0, // Reset run count
          }
          : undefined,
      };

      const duplicatedTask = await database.createTask(duplicateData);

      await database.addTaskLog(
        duplicatedTask.id,
        LogLevel.INFO,
        `Task duplicated from ${originalTask.id} (${originalTask.name})`,
      );

      // If duplicating a scheduled task, add it to the scheduler
      if (
        duplicatedTask.status === TaskStatus.SCHEDULED &&
        duplicatedTask.schedule?.enabled &&
        duplicatedTask.schedule?.cronExpression
      ) {
        await scheduler.addScheduledTask(
          duplicatedTask.id,
          duplicatedTask.schedule.cronExpression,
        );
        await database.addTaskLog(
          duplicatedTask.id,
          LogLevel.INFO,
          `Scheduled task added to scheduler with cron expression: ${duplicatedTask.schedule.cronExpression}`,
        );
      }

      // Broadcast new task
      wsManager.broadcastTaskUpdate(duplicatedTask.id, duplicatedTask);

      return c.json({
        success: true,
        data: duplicatedTask,
        message: "Task duplicated successfully",
      } as ApiResponse<Task>);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  api.get("/tasks/:id/logs", async (c) => {
    try {
      const id = c.req.param("id");
      const follow = c.req.query("follow") === "true";

      if (follow) {
        const logs = await orchestrator.getTaskLogs(id, true) as AsyncGenerator<
          string
        >;

        // Stream logs using Server-Sent Events
        return new Response(
          new ReadableStream({
            async start(controller) {
              try {
                for await (const log of logs) {
                  controller.enqueue(
                    new TextEncoder().encode(
                      `data: ${JSON.stringify({ log })}\n\n`,
                    ),
                  );
                }
              } catch (error) {
                controller.enqueue(
                  new TextEncoder().encode(
                    `data: ${
                      JSON.stringify({ error: (error as Error).message })
                    }\n\n`,
                  ),
                );
              } finally {
                controller.close();
              }
            },
          }),
          {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
            },
          },
        );
      } else {
        const logs = await orchestrator.getTaskLogs(id, false) as string[];
        return c.json(
          { success: true, data: { logs } } as ApiResponse<{ logs: string[] }>,
        );
      }
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  // Deleted tasks management
  api.get("/tasks/deleted", async (c) => {
    try {
      const deletedTasks = await database.getDeletedTasks();
      return c.json(
        { success: true, data: deletedTasks } as ApiResponse<Task[]>,
      );
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  api.post("/tasks/:id/restore", async (c) => {
    try {
      const id = c.req.param("id");
      const task = await database.getTask(id);

      if (!task || !task.isDeleted) {
        return c.json(
          { success: false, error: "Deleted task not found" } as ApiResponse,
          404,
        );
      }

      const restored = await database.restoreTask(id);
      if (!restored) {
        return c.json(
          { success: false, error: "Failed to restore task" } as ApiResponse,
          500,
        );
      }

      // Re-add to scheduler if it was scheduled
      const restoredTask = await database.getTask(id);
      if (
        restoredTask && restoredTask.schedule && restoredTask.schedule.enabled
      ) {
        await scheduler.addScheduledTask(
          id,
          restoredTask.schedule.cronExpression,
        );
      }

      // Add restoration log
      await database.addTaskLog(
        id,
        LogLevel.INFO,
        "Task restored from deletion",
      );

      // Broadcast update
      wsManager.broadcastTaskUpdate(id, restoredTask);

      return c.json({ success: true, data: restoredTask } as ApiResponse<Task>);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  api.delete("/tasks/:id/permanent", async (c) => {
    try {
      const id = c.req.param("id");
      const task = await database.getTask(id);

      if (!task || !task.isDeleted) {
        return c.json(
          { success: false, error: "Deleted task not found" } as ApiResponse,
          404,
        );
      }

      const deleted = await database.permanentlyDeleteTask(id);
      if (!deleted) {
        return c.json(
          {
            success: false,
            error: "Failed to permanently delete task",
          } as ApiResponse,
          500,
        );
      }

      return c.json(
        { success: true, message: "Task permanently deleted" } as ApiResponse,
      );
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  api.get("/tasks/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const task = await database.getTask(id);

      if (!task) {
        return c.json(
          { success: false, error: "Task not found" } as ApiResponse,
          404,
        );
      }

      return c.json({ success: true, data: task } as ApiResponse<Task>);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  // Agents endpoints
  api.get("/agents", async (c) => {
    try {
      const agents = await database.getAllAgents();
      return c.json({ success: true, data: agents } as ApiResponse<Agent[]>);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  api.get("/agents/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const agent = await database.getAgent(id);

      if (!agent) {
        return c.json(
          { success: false, error: "Agent not found" } as ApiResponse,
          404,
        );
      }

      return c.json({ success: true, data: agent } as ApiResponse<Agent>);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  api.post("/agents", async (c) => {
    try {
      const body = await c.req.json();

      if (!body.name) {
        return c.json({
          success: false,
          error: "Agent name is required",
        } as ApiResponse, 400);
      }

      const agent = await database.createAgent({
        name: body.name,
        description: body.description,
        status: AgentStatus.IDLE,
        totalTasks: 0,
        successfulTasks: 0,
        failedTasks: 0,
        secretMapping: {},
      });

      // Broadcast agent update
      wsManager.broadcastAgentUpdate(agent.id, agent);

      return c.json({ success: true, data: agent } as ApiResponse<Agent>, 201);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  api.put("/agents/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const body = await c.req.json();

      const updatedAgent = await database.updateAgent(id, body);
      if (!updatedAgent) {
        return c.json(
          { success: false, error: "Agent not found" } as ApiResponse,
          404,
        );
      }

      return c.json(
        { success: true, data: updatedAgent } as ApiResponse<Agent>,
      );
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  api.delete("/agents/:id", async (c) => {
    try {
      const id = c.req.param("id");

      // Check for running tasks
      const runningTask = await database.getRunningTaskForAgent(id);
      if (runningTask) {
        return c.json({
          success: false,
          error: "Cannot delete agent with running tasks",
        } as ApiResponse, 400);
      }

      const deleted = await database.deleteAgent(id);
      if (!deleted) {
        return c.json(
          { success: false, error: "Agent not found" } as ApiResponse,
          404,
        );
      }

      return c.json({ success: true, message: "Agent deleted" } as ApiResponse);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  // Agent secret assignment endpoints
  api.put("/agents/:id/secrets", async (c) => {
    try {
      const id = c.req.param("id");
      const body: AgentSecretAssignment = await c.req.json();

      const agent = await database.getAgent(id);
      if (!agent) {
        return c.json(
          { success: false, error: "Agent not found" } as ApiResponse,
          404,
        );
      }

      // Validate secret mappings if provided
      if (body.secretMapping) {
        for (const [varName, secretId] of Object.entries(body.secretMapping)) {
          const secret = await database.getSecret(secretId as string);
          if (!secret) {
            return c.json({
              success: false,
              error:
                `Secret with ID ${secretId} not found for variable ${varName}`,
            } as ApiResponse, 400);
          }
        }
      }

      // Update agent with secret assignment
      const updatedAgent = await database.updateAgent(id, {
        secretMapping: body.secretMapping || {},
      });

      return c.json({
        success: true,
        data: updatedAgent,
        message: "Agent secret assignment updated",
      } as ApiResponse<Agent>);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  // Swarm task creation endpoint
  api.post("/tasks/swarm", async (c) => {
    try {
      const body: SwarmTaskRequest = await c.req.json();

      // Validate all agents exist
      const agents = [];
      for (const agentId of body.agentIds) {
        const agent = await database.getAgent(agentId);
        if (!agent) {
          return c.json({
            success: false,
            error: `Agent with ID ${agentId} not found`,
          } as ApiResponse, 400);
        }
        agents.push(agent);
      }

      // Validate and parse config content
      if (!body.configContent || !body.configType) {
        return c.json({
          success: false,
          error: "configContent and configType are required",
        } as ApiResponse, 400);
      }

      let parsedConfig;
      try {
        parsedConfig = loadConfigFromString(
          body.configContent,
          body.configType as "yaml" | "json",
        );
      } catch (error) {
        return c.json({
          success: false,
          error: `Invalid config format: ${(error as Error).message}`,
        } as ApiResponse, 400);
      }

      // Create tasks for each agent
      const createdTasks = [];
      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        const taskName = `${body.name} #${i + 1} (${agent.name})`;

        const taskData = {
          agentId: agent.id,
          configPath: "", // No longer using file paths
          configContent: parsedConfig, // Store as parsed JSON object
          configType: body.configType as "file" | "json" | "yaml",
          name: taskName,
          description: body.description,
          status: body.schedule ? TaskStatus.SCHEDULED : TaskStatus.PENDING,
          schedule: body.schedule
            ? { ...body.schedule, currentRuns: 0 }
            : undefined,
          resources: body.resources,
          timeoutMs: body.timeoutMs,
          // Initialize with empty state - the execution system will use agent's secretMapping
          currentState: {},
          logs: [],
        };

        const task = await database.createTask(taskData);
        createdTasks.push(task);

        // Add creation log
        await database.addTaskLog(
          task.id,
          LogLevel.INFO,
          `Task created as part of swarm: ${body.name}`,
        );

        // Handle scheduling if provided
        if (body.schedule?.enabled && body.schedule.cronExpression) {
          await scheduler.addScheduledTask(
            task.id,
            body.schedule.cronExpression,
          );
          await database.updateTask(task.id, { status: TaskStatus.SCHEDULED });

          await database.addTaskLog(
            task.id,
            LogLevel.INFO,
            `Scheduled with swarm cron: ${body.schedule.cronExpression}`,
          );
        }
      }

      // Broadcast updates for all created tasks
      for (const task of createdTasks) {
        wsManager.broadcastTaskUpdate(task.id, task);
      }

      return c.json({
        success: true,
        data: createdTasks,
        message: `Created ${createdTasks.length} swarm tasks`,
      } as ApiResponse<Task[]>);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  // Statistics endpoints
  api.get("/statistics", async (c) => {
    try {
      const stats = await database.getStatistics();
      return c.json({ success: true, data: stats } as ApiResponse);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  api.get("/activity", async (c) => {
    try {
      const limit = parseInt(c.req.query("limit") || "50");
      const activity = await database.getRecentActivity(limit);
      return c.json({ success: true, data: activity } as ApiResponse);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  // System status
  api.get("/system/status", async (c) => {
    try {
      const status = await orchestrator.getSystemStatus();
      return c.json({ success: true, data: status } as ApiResponse);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  // Scheduler status and next scheduled tasks
  api.get("/scheduler/status", async (c) => {
    try {
      const schedulerStatus = scheduler.getStatus();
      return c.json({ success: true, data: schedulerStatus } as ApiResponse);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  api.get("/scheduler/next", async (c) => {
    try {
      const limit = parseInt(c.req.query("limit") || "10");
      const schedulerStatus = scheduler.getStatus();

      // Get next scheduled executions with task details
      const nextScheduled = [];
      for (const job of schedulerStatus.jobs.slice(0, limit)) {
        if (job.nextRun) {
          const task = await database.getTask(job.taskId);
          if (task) {
            nextScheduled.push({
              taskId: job.taskId,
              taskName: task.name,
              agentId: task.agentId,
              nextRun: job.nextRun,
              cronExpression: task.schedule?.cronExpression || "",
              currentRuns: task.schedule?.currentRuns || 0,
              maxRuns: task.schedule?.maxRuns,
            });
          }
        }
      }

      return c.json({ success: true, data: nextScheduled } as ApiResponse);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  // Pruning endpoints
  api.get("/pruning/stats", async (c) => {
    try {
      if (!pruningService) {
        return c.json(
          {
            success: false,
            error: "Pruning service not available",
          } as ApiResponse,
          404,
        );
      }

      const stats = pruningService.getPruningStats();
      return c.json({ success: true, data: stats } as ApiResponse);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  api.post("/pruning/run", async (c) => {
    try {
      if (!pruningService) {
        return c.json(
          {
            success: false,
            error: "Pruning service not available",
          } as ApiResponse,
          404,
        );
      }

      const body = await c.req.json().catch(() => ({}));
      const dryRun = body.dryRun === true;

      const results = await pruningService.runManualPruning(dryRun);
      return c.json({ success: true, data: results } as ApiResponse);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  // Secrets endpoints
  api.get("/secrets", async (c) => {
    try {
      if (!secretsService) {
        return c.json(
          {
            success: false,
            error: "Secrets service not available",
          } as ApiResponse,
          404,
        );
      }

      const query = c.req.query();
      const page = parseInt(query.page || "1");
      const limit = parseInt(query.limit || "20");

      const result = await database.getSecretsPaginated(page, limit);
      return c.json(
        { success: true, data: result } as ApiResponse<SecretListResponse>,
      );
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  api.get("/secrets/tags", async (c) => {
    try {
      if (!secretsService) {
        return c.json(
          {
            success: false,
            error: "Secrets service not available",
          } as ApiResponse,
          404,
        );
      }

      const tags = await database.getSecretTags();
      return c.json({ success: true, data: tags } as ApiResponse<string[]>);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  api.get("/secrets/:id", async (c) => {
    try {
      if (!secretsService) {
        return c.json(
          {
            success: false,
            error: "Secrets service not available",
          } as ApiResponse,
          404,
        );
      }

      const id = c.req.param("id");
      const secret = await database.getSecret(id);

      if (!secret) {
        return c.json(
          { success: false, error: "Secret not found" } as ApiResponse,
          404,
        );
      }

      // Return sanitized secret (without value)
      const sanitized = secretsService.sanitizeSecret(secret);
      return c.json({ success: true, data: sanitized } as ApiResponse);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  api.get("/secrets/:id/value", async (c) => {
    try {
      if (!secretsService) {
        return c.json(
          {
            success: false,
            error: "Secrets service not available",
          } as ApiResponse,
          404,
        );
      }

      const id = c.req.param("id");
      const secret = await database.getSecret(id);

      if (!secret) {
        return c.json(
          { success: false, error: "Secret not found" } as ApiResponse,
          404,
        );
      }

      // Update last used timestamp
      await database.updateSecretLastUsed(id);

      // Return decrypted value
      const decryptedValue = await secretsService.revealSecret(secret);
      return c.json(
        { success: true, data: { value: decryptedValue } } as ApiResponse,
      );
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  api.post("/secrets", async (c) => {
    try {
      if (!secretsService) {
        return c.json(
          {
            success: false,
            error: "Secrets service not available",
          } as ApiResponse,
          404,
        );
      }

      const body: CreateSecretRequest = await c.req.json();

      // Validate required fields
      if (!body.name || !body.value) {
        return c.json({
          success: false,
          error: "Name and value are required",
        } as ApiResponse, 400);
      }

      // Check for duplicate name
      const existing = await database.getSecretByName(body.name);
      if (existing) {
        return c.json({
          success: false,
          error: "Secret with this name already exists",
        } as ApiResponse, 409);
      }

      // Create encrypted secret
      const secret = await secretsService.createSecret(body);
      await database.createSecret(secret);

      // Return sanitized secret
      const sanitized = secretsService.sanitizeSecret(secret);
      return c.json({ success: true, data: sanitized } as ApiResponse, 201);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  api.put("/secrets/:id", async (c) => {
    try {
      if (!secretsService) {
        return c.json(
          {
            success: false,
            error: "Secrets service not available",
          } as ApiResponse,
          404,
        );
      }

      const id = c.req.param("id");
      const body: UpdateSecretRequest = await c.req.json();

      const secret = await database.getSecret(id);
      if (!secret) {
        return c.json(
          { success: false, error: "Secret not found" } as ApiResponse,
          404,
        );
      }

      // Check for name conflicts if name is being changed
      if (body.name && body.name !== secret.name) {
        const existing = await database.getSecretByName(body.name);
        if (existing) {
          return c.json({
            success: false,
            error: "Secret with this name already exists",
          } as ApiResponse, 409);
        }
      }

      const updatedSecret = await secretsService.updateSecret(secret, body);
      await database.updateSecret(id, updatedSecret);

      const sanitized = secretsService.sanitizeSecret(updatedSecret);
      return c.json({ success: true, data: sanitized } as ApiResponse);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  api.delete("/secrets/:id", async (c) => {
    try {
      if (!secretsService) {
        return c.json(
          {
            success: false,
            error: "Secrets service not available",
          } as ApiResponse,
          404,
        );
      }

      const id = c.req.param("id");
      const secret = await database.getSecret(id);

      if (!secret) {
        return c.json(
          { success: false, error: "Secret not found" } as ApiResponse,
          404,
        );
      }

      await database.deleteSecret(id);
      return c.json(
        { success: true, message: "Secret deleted" } as ApiResponse,
      );
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  api.post("/secrets/search", async (c) => {
    try {
      if (!secretsService) {
        return c.json(
          {
            success: false,
            error: "Secrets service not available",
          } as ApiResponse,
          404,
        );
      }

      const body = await c.req.json().catch(() => ({}));
      const { query = "", tags = [] } = body;

      const secrets = await database.searchSecrets(query, tags);
      const sanitized = secrets.map((secret) =>
        secretsService.sanitizeSecret(secret)
      );

      return c.json({ success: true, data: sanitized } as ApiResponse);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  api.get("/pruning/preview", async (c) => {
    try {
      if (!pruningService) {
        return c.json(
          {
            success: false,
            error: "Pruning service not available",
          } as ApiResponse,
          404,
        );
      }

      const retentionDays = parseInt(c.req.query("retentionDays") || "30");
      const preview = await database.getPruningPreview(retentionDays);

      return c.json({ success: true, data: preview } as ApiResponse);
    } catch (error) {
      return c.json(
        { success: false, error: (error as Error).message } as ApiResponse,
        500,
      );
    }
  });

  // Mount API routes
  app.route("/api", api);

  return app;
}
