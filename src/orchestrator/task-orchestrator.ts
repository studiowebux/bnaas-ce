// Task orchestrator with integration
import {
  Agent,
  AgentStatus,
  LogLevel,
  OrchestratorConfig,
  Task,
  TaskStatus,
} from "../types/orchestrator.ts";
import { JsonDatabase } from "../database/json-db.ts";
import { loadConfigFromString } from "../runner/graph-executor.ts";
import { SecretsService } from "../services/secrets-service.ts";
import { CONFIG_PATH, ENGINE, RUNNER_PATH } from "../constant.ts";

export class TaskOrchestrator {
  private database: JsonDatabase;
  private config: OrchestratorConfig;
  private runningContainers: Map<string, string> = new Map(); // taskId -> containerId
  private taskTimeouts: Map<string, number> = new Map(); // taskId -> timeoutId
  private secretsService?: SecretsService;

  constructor(
    database: JsonDatabase,
    config: OrchestratorConfig,
    secretsService?: SecretsService,
  ) {
    this.database = database;
    this.config = config;
    this.secretsService = secretsService;
  }

  // Extract secret references from config content
  private extractSecretReferences(configContent: string): string[] {
    const secretRefs: string[] = [];

    // Match both ${secret.VARIABLE_NAME} and ${SECRET.VARIABLE_NAME} patterns
    const regexLowercase = /\$\{secret\.([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
    const regexUppercase = /\$\{SECRET\.([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

    // Extract from both patterns
    [regexLowercase, regexUppercase].forEach((regex) => {
      let match;
      while ((match = regex.exec(configContent)) !== null) {
        const secretName = match[1];
        if (!secretRefs.includes(secretName)) {
          secretRefs.push(secretName);
        }
      }
    });

    return secretRefs;
  }

  async startTask(taskId: string): Promise<boolean> {
    await Deno.mkdir(CONFIG_PATH, { recursive: true });
    const task = await this.database.getTask(taskId);
    if (!task) {
      console.error(`Task ${taskId} not found`);
      return false;
    }

    if (
      task.status !== TaskStatus.PENDING && task.status !== TaskStatus.SCHEDULED
    ) {
      console.error(
        `Task ${taskId} cannot be started, current status: ${task.status}`,
      );
      return false;
    }

    // Check if agent is already running a task
    const runningTask = await this.database.getRunningTaskForAgent(
      task.agentId,
    );
    if (runningTask) {
      console.error(
        `Agent ${task.agentId} is already running task ${runningTask.id}`,
      );
      return false;
    }

    // Get config content - it should always be available now
    const configContent = task.configContent;
    if (!configContent) {
      await this.database.updateTask(taskId, {
        status: TaskStatus.FAILED,
        error: "No config content provided",
        endedAt: new Date(),
      });
      return false;
    }

    // Convert config object to string for processing (available throughout function)
    const configString = typeof configContent === "string"
      ? configContent
      : JSON.stringify(configContent);

    try {
      // Log config info
      await this.database.addTaskLog(
        taskId,
        LogLevel.DEBUG,
        `Using config content (${configString.length} bytes, type: ${task.configType})`,
      );

      // Note: Secrets will be injected as environment variables during container startup

      // Validate config structure
      try {
        await this.database.addTaskLog(
          taskId,
          LogLevel.DEBUG,
          `Validating config structure (${configString.length} bytes)`,
        );

        // If configContent is already an object, use it; otherwise parse it
        const config = typeof configContent === "object"
          ? configContent
          : loadConfigFromString(
            configString,
            task.configType as "yaml" | "json",
          );

        await this.database.addTaskLog(
          taskId,
          LogLevel.DEBUG,
          `Config validated - Graph nodes: ${Object.keys(config.graph).length}`,
        );
      } catch (error) {
        await this.database.addTaskLog(
          taskId,
          LogLevel.ERROR,
          `Config validation failed: ${(error as Error).message}`,
        );
        await this.database.updateTask(taskId, {
          status: TaskStatus.FAILED,
          error: `Invalid config: ${(error as Error).message}`,
          endedAt: new Date(),
        });
        return false;
      }

      // Validate task runner exists
      try {
        const runnerStat = await Deno.stat(`${RUNNER_PATH}/task-runner.ts`);
        await this.database.addTaskLog(
          taskId,
          LogLevel.DEBUG,
          `Task runner found:src ${RUNNER_PATH}/task-runner.ts (${runnerStat.size} bytes)`,
        );
      } catch (error) {
        await this.database.addTaskLog(
          taskId,
          LogLevel.ERROR,
          `Task runner not found: ${(error as Error).message}`,
        );
        await this.database.updateTask(taskId, {
          status: TaskStatus.FAILED,
          error: `Task runner not found: ${RUNNER_PATH}/task-runner.ts`,
          endedAt: new Date(),
        });
        return false;
      }

      // Start container
      await this.database.addTaskLog(
        taskId,
        LogLevel.DEBUG,
        `Starting container with config content (${configString.length} bytes, type: ${task.configType})`,
      );

      const containerId = await this.startContainer(
        task,
        undefined,
        configString,
      );
      if (!containerId) {
        await this.database.addTaskLog(
          taskId,
          LogLevel.ERROR,
          "Failed to start container",
        );
        await this.database.updateTask(taskId, {
          status: TaskStatus.FAILED,
          error: "Failed to start container",
          endedAt: new Date(),
        });
        return false;
      }

      // Update task status
      const startedAt = new Date();
      await this.database.updateTask(taskId, {
        status: TaskStatus.RUNNING,
        startedAt,
        containerId,
      });

      // Update agent status
      await this.database.updateAgent(task.agentId, {
        status: AgentStatus.BUSY,
        currentTaskId: taskId,
        lastActivity: startedAt,
      });

      this.runningContainers.set(taskId, containerId);

      await this.database.addTaskLog(
        taskId,
        LogLevel.INFO,
        `Task started with container ${containerId}`,
      );

      // Set up timeout if specified
      const timeoutMs = task.timeoutMs ||
        this.config.container.defaultTimeoutMs;
      if (timeoutMs && timeoutMs > 0) {
        const timeoutId = setTimeout(async () => {
          await this.database.addTaskLog(
            taskId,
            LogLevel.WARN,
            `Task timeout reached (${timeoutMs}ms), terminating container`,
          );
          await this.handleTaskTimeout(taskId, containerId);
        }, timeoutMs);

        this.taskTimeouts.set(taskId, timeoutId);

        await this.database.addTaskLog(
          taskId,
          LogLevel.INFO,
          `Task timeout set to ${timeoutMs}ms (${
            this.formatDuration(timeoutMs)
          })`,
        );
      }

      // Monitor container in background
      this.monitorContainer(taskId, containerId);

      return true;
    } catch (error) {
      console.error(`Error starting task ${taskId}:`, error);
      await this.database.addTaskLog(
        taskId,
        LogLevel.ERROR,
        `Task start failed: ${(error as Error).message}`,
      );
      await this.database.updateTask(taskId, {
        status: TaskStatus.FAILED,
        error: (error as Error).message,
        endedAt: new Date(),
      });
      return false;
    }
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const task = await this.database.getTask(taskId);
    if (!task) {
      console.error(`Task ${taskId} not found`);
      return false;
    }

    if (task.status !== TaskStatus.RUNNING) {
      console.error(
        `Task ${taskId} cannot be cancelled, current status: ${task.status}`,
      );
      return false;
    }

    try {
      // Stop container container
      if (task.containerId) {
        await this.stopContainer(task.containerId, taskId);
      }

      const endedAt = new Date();
      const duration = task.startedAt
        ? endedAt.getTime() - task.startedAt.getTime()
        : 0;

      // Update task status
      await this.database.updateTask(taskId, {
        status: TaskStatus.CANCELLED,
        endedAt,
        duration,
      });

      // Update agent status
      await this.database.updateAgent(task.agentId, {
        status: AgentStatus.IDLE,
        currentTaskId: undefined,
        lastActivity: endedAt,
      });

      // Clean up timeout if exists
      this.clearTaskTimeout(taskId);

      this.runningContainers.delete(taskId);

      await this.database.addTaskLog(
        taskId,
        LogLevel.INFO,
        "Task cancelled by user",
      );

      return true;
    } catch (error) {
      console.error(`Error cancelling task ${taskId}:`, error);
      await this.database.addTaskLog(
        taskId,
        LogLevel.ERROR,
        `Task cancellation failed: ${(error as Error).message}`,
      );
      return false;
    }
  }

  async getTaskLogs(
    taskId: string,
    follow = false,
  ): Promise<AsyncGenerator<string> | string[]> {
    const task = await this.database.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (
      follow && task.containerId && task.status === TaskStatus.RUNNING
    ) {
      return this.followContainerLogs(task.containerId);
    } else {
      // Return existing logs from database (which now includes container logs)
      return task.logs.map((log) =>
        `[${log.timestamp.toISOString()}] ${log.level.toUpperCase()}: ${log.message}${
          log.data ? ` ${JSON.stringify(log.data)}` : ""
        }`
      );
    }
  }

  private async startContainer(
    task: Task,
    configPath?: string,
    configContent?: string,
  ): Promise<string | null> {
    // Debug logging
    await this.database.addTaskLog(
      task.id,
      LogLevel.DEBUG,
      `startContainer called with configPath: ${
        configPath || "undefined"
      }, configContent: ${
        configContent !== undefined
          ? `${configContent.length} bytes`
          : "undefined"
      }`,
    );
    const containerName = `botnet-task-${task.id}`;
    const volumes =
      this.config.container.volumes?.map((v) =>
        `--volume=${v.host}:${v.container}`
      ) || [];

    const args = [
      "run",
      "-d", // detached
      "--name",
      containerName,
      "--workdir",
      this.config.container.workDir,
      ...volumes,
    ];

    if (this.config.container.network) {
      args.push("--network", this.config.container.network);
    }

    // Add resource limits (task-specific overrides global config)
    const resources = task.resources || this.config.container.resources;
    if (resources) {
      if (resources.memory) {
        args.push("--memory", resources.memory);
        await this.database.addTaskLog(
          task.id,
          LogLevel.DEBUG,
          `Applied memory limit: ${resources.memory}`,
        );
      }
      if (resources.cpus) {
        args.push("--cpus", resources.cpus);
        await this.database.addTaskLog(
          task.id,
          LogLevel.DEBUG,
          `Applied CPU limit: ${resources.cpus}`,
        );
      }
    }

    // Extract secret references from config and pass only those as environment variables
    const envVars: string[] = [];
    if (configContent) {
      // Scan for ${secret.VARIABLE_NAME} patterns in the config
      const secretRefs = this.extractSecretReferences(configContent);

      if (secretRefs.length > 0 && this.secretsService) {
        await this.database.addTaskLog(
          task.id,
          LogLevel.DEBUG,
          `Found ${secretRefs.length} secret references: ${
            secretRefs.join(", ")
          }`,
        );

        // Get all secrets from database
        const secrets = await this.database.getAllSecrets();
        const agent = await this.database.getAgent(task.agentId);

        // For each referenced secret, decrypt and add as environment variable
        for (const secretRef of secretRefs) {
          try {
            let secret = secrets.find((s) => s.name === secretRef);

            // Check agent-specific mapping if no direct match
            if (!secret && agent?.secretMapping?.[secretRef]) {
              secret = secrets.find((s) =>
                s.id === agent.secretMapping[secretRef]
              );
            }

            if (secret) {
              const decryptedValue = await this.secretsService.revealSecret(
                secret,
              );
              envVars.push("--env", `${secretRef}=${decryptedValue}`);

              await this.database.addTaskLog(
                task.id,
                LogLevel.DEBUG,
                `Added secret "${secretRef}" to container environment`,
              );
            } else {
              await this.database.addTaskLog(
                task.id,
                LogLevel.WARN,
                `Secret "${secretRef}" referenced in config but not found in database`,
              );
            }
          } catch (error) {
            await this.database.addTaskLog(
              task.id,
              LogLevel.ERROR,
              `Failed to decrypt secret "${secretRef}": ${
                (error as Error).message
              }`,
            );
          }
        }
      }
    }

    args.push(...envVars);

    if (configContent !== undefined && configContent !== null) {
      // Convert config object to JSON string for container
      let jsonConfig: string;
      try {
        // Parse the config content string to get object
        const configObj = loadConfigFromString(
          configContent,
          task.configType as "yaml" | "json",
        );

        // Convert to formatted JSON
        jsonConfig = JSON.stringify(configObj, null, 2);

        await this.database.addTaskLog(
          task.id,
          LogLevel.DEBUG,
          `Converted config to JSON format for container (${jsonConfig.length} bytes)`,
        );
      } catch (error) {
        await this.database.addTaskLog(
          task.id,
          LogLevel.ERROR,
          `Failed to convert config to JSON: ${(error as Error).message}`,
        );
        return null;
      }

      // Use stdin for configuration content (no temporary file needed)
      args.push(
        this.config.container.image,
        "sh",
        "-c",
        `
          echo "=== CONTAINER START ==="
          echo "Working directory: $(pwd)"
          echo "Files in src/: $(ls -la src/ 2>/dev/null || echo 'src directory not found')"
          echo "Using config from stdin..."
          echo "Starting task runner..."

          deno install
          echo '${
          jsonConfig?.replace(/'/g, "'\"'\"'")
        }' | deno run --env-file --allow-all ${RUNNER_PATH}/task-runner.ts --stdin
          EXIT_CODE=$?

          if [ $EXIT_CODE -eq 0 ]; then
            echo "=== CONTAINER END: SUCCESS ==="
          else
            echo "=== CONTAINER END: FAILED with exit code $EXIT_CODE ==="
          fi

          exit $EXIT_CODE
        `,
      );
    } else if (configPath) {
      // Use file-based configuration (existing behavior)
      args.push(
        this.config.container.image,
        "sh",
        "-c",
        `
          echo "=== CONTAINER START ==="
          echo "Working directory: $(pwd)"
          echo "Files in src/: $(ls -la src/ 2>/dev/null || echo 'src directory not found')"
          echo "Config file: $(ls -la ${configPath} 2>/dev/null || echo 'Config file not found')"
          echo "Starting task runner..."

          deno install
          deno run --env-file --allow-all ${RUNNER_PATH}/task-runner.ts ${configPath}
          EXIT_CODE=$?

          if [ $EXIT_CODE -eq 0 ]; then
            echo "=== CONTAINER END: SUCCESS ==="
          else
            echo "=== CONTAINER END: FAILED with exit code $EXIT_CODE ==="
          fi

          exit $EXIT_CODE
        `,
      );
    } else {
      throw new Error("Either configPath or configContent must be provided");
    }

    // Log additional debugging info
    const configInfo = configContent
      ? `stdin (${configContent.length} bytes)`
      : `file: ${configPath}`;
    await this.database.addTaskLog(
      task.id,
      LogLevel.DEBUG,
      `Container config - Image: ${this.config.container.image}, WorkDir: ${this.config.container.workDir}, Config: ${configInfo}`,
    );

    // Build the full command string for logging
    const fullCommand = `${ENGINE} ${args.join(" ")}`;

    // Log the exact command being executed
    await this.database.addTaskLog(
      task.id,
      LogLevel.INFO,
      `Executing container command: ${fullCommand}`,
    );
    console.log(`Executing container command: ${fullCommand}`);

    try {
      const command = new Deno.Command(ENGINE, { args });
      const { success, stdout, stderr } = await command.output();

      if (!success) {
        const errorOutput = new TextDecoder().decode(stderr);
        console.error("Container start failed:", errorOutput);
        await this.database.addTaskLog(
          task.id,
          LogLevel.ERROR,
          `Container command failed: ${errorOutput}`,
        );
        return null;
      }

      const containerId = new TextDecoder().decode(stdout).trim();
      console.log(`Started container ${containerId} for task ${task.id}`);
      await this.database.addTaskLog(
        task.id,
        LogLevel.INFO,
        `Container started successfully: ${containerId}`,
      );

      return containerId;
    } catch (error) {
      console.error("Error starting container:", error);
      await this.database.addTaskLog(
        task.id,
        LogLevel.ERROR,
        `Failed to execute container command: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private async stopContainer(
    containerId: string,
    taskId?: string,
  ): Promise<void> {
    try {
      // Log stop command
      const stopCommand = `${ENGINE} stop ${containerId}`;
      console.log(`Executing: ${stopCommand}`);
      if (taskId) {
        await this.database.addTaskLog(
          taskId,
          LogLevel.INFO,
          `Executing: ${stopCommand}`,
        );
      }

      const command = new Deno.Command(ENGINE, {
        args: ["stop", containerId],
      });
      const { success, stderr } = await command.output();

      if (!success) {
        const errorOutput = new TextDecoder().decode(stderr);
        console.error("Container stop failed:", errorOutput);
        if (taskId) {
          await this.database.addTaskLog(
            taskId,
            LogLevel.ERROR,
            `Container stop failed: ${errorOutput}`,
          );
        }
      } else if (taskId) {
        await this.database.addTaskLog(
          taskId,
          LogLevel.INFO,
          `Container stopped successfully`,
        );
      }

      // Remove container
      const rmCommand = `${ENGINE} rm ${containerId}`;
      console.log(`Executing: ${rmCommand}`);
      if (taskId) {
        await this.database.addTaskLog(
          taskId,
          LogLevel.INFO,
          `Executing: ${rmCommand}`,
        );
      }

      const rmCommandObj = new Deno.Command(ENGINE, {
        args: ["rm", containerId],
      });
      const { success: rmSuccess, stderr: rmStderr } = await rmCommandObj
        .output();

      if (!rmSuccess) {
        const errorOutput = new TextDecoder().decode(rmStderr);
        console.error("Container rm failed:", errorOutput);
        if (taskId) {
          await this.database.addTaskLog(
            taskId,
            LogLevel.WARN,
            `Container removal failed: ${errorOutput}`,
          );
        }
      } else if (taskId) {
        await this.database.addTaskLog(
          taskId,
          LogLevel.INFO,
          `Container removed successfully`,
        );
      }
    } catch (error) {
      console.error("Error stopping container:", error);
      if (taskId) {
        await this.database.addTaskLog(
          taskId,
          LogLevel.ERROR,
          `Error stopping container: ${(error as Error).message}`,
        );
      }
    }
  }

  private async monitorContainer(
    taskId: string,
    containerId: string,
  ): Promise<void> {
    try {
      // Start log streaming in background
      this.streamContainerLogs(taskId, containerId);

      // Monitor container status
      const monitorLoop = async () => {
        while (this.runningContainers.has(taskId)) {
          try {
            const inspectCommand = new Deno.Command(ENGINE, {
              args: ["inspect", containerId, "--format", "{{.State.Status}}"],
            });
            const { success, stdout } = await inspectCommand.output();

            if (!success) {
              console.error(`Failed to inspect container ${containerId}`);
              await this.database.addTaskLog(
                taskId,
                LogLevel.ERROR,
                `Failed to inspect container ${containerId}`,
              );
              break;
            }

            const status = new TextDecoder().decode(stdout).trim();

            await this.database.addTaskLog(
              taskId,
              LogLevel.DEBUG,
              `Container status check: ${status}`,
            );

            if (status === "exited") {
              // Get exit code and timing info
              const exitCommand = new Deno.Command(ENGINE, {
                args: [
                  "inspect",
                  containerId,
                  "--format",
                  "{{.State.ExitCode}}:{{.State.StartedAt}}:{{.State.FinishedAt}}",
                ],
              });
              const { stdout: exitStdout } = await exitCommand.output();
              const inspectResult = new TextDecoder().decode(exitStdout).trim();
              const [exitCodeStr, startedAt, finishedAt] = inspectResult.split(
                ":",
              );
              const exitCode = parseInt(exitCodeStr);

              await this.database.addTaskLog(
                taskId,
                LogLevel.INFO,
                `Container exited with code ${exitCode}. Started: ${startedAt}, Finished: ${finishedAt}`,
              );

              // Get final logs before completion
              await this.getContainerFinalLogs(taskId, containerId);

              await this.handleTaskCompletion(taskId, exitCode);
              break;
            }

            // Wait before next check
            await new Promise((resolve) => setTimeout(resolve, 5000));
          } catch (error) {
            console.error(`Error monitoring container ${containerId}:`, error);
            await this.database.addTaskLog(
              taskId,
              LogLevel.ERROR,
              `Container monitoring error: ${(error as Error).message}`,
            );
            break;
          }
        }
      };

      // Start monitoring in background
      monitorLoop();
    } catch (error) {
      console.error(
        `Error setting up container monitoring for ${containerId}:`,
        error,
      );
      await this.database.addTaskLog(
        taskId,
        LogLevel.ERROR,
        `Monitor setup failed: ${(error as Error).message}`,
      );
    }
  }

  private async streamContainerLogs(
    taskId: string,
    containerId: string,
  ): Promise<void> {
    try {
      console.log(`Starting log stream for container ${containerId}`);
      await this.database.addTaskLog(
        taskId,
        LogLevel.INFO,
        `Started log streaming for container ${containerId}`,
      );

      const command = new Deno.Command(ENGINE, {
        args: ["logs", "-f", "--timestamps", containerId],
        stdout: "piped",
        stderr: "piped",
      });

      const process = command.spawn();

      // Stream stdout
      this.streamOutput(process.stdout, taskId, "STDOUT");
      // Stream stderr
      this.streamOutput(process.stderr, taskId, "STDERR");

      // Handle process completion
      process.status.then(async (status) => {
        if (this.runningContainers.has(taskId)) {
          const message = status.success
            ? "Container log stream ended normally"
            : `Container log stream ended with error (code: ${status.code})`;

          await this.database.addTaskLog(
            taskId,
            status.success ? LogLevel.INFO : LogLevel.ERROR,
            message,
          );
        }
      }).catch(async (error) => {
        if (this.runningContainers.has(taskId)) {
          await this.database.addTaskLog(
            taskId,
            LogLevel.ERROR,
            `Log stream error: ${error.message}`,
          );
        }
      });
    } catch (error) {
      console.error(`Error starting log stream for ${containerId}:`, error);
      await this.database.addTaskLog(
        taskId,
        LogLevel.ERROR,
        `Failed to start log streaming: ${(error as Error).message}`,
      );
    }
  }

  private async streamOutput(
    readable: ReadableStream<Uint8Array>,
    taskId: string,
    source: "STDOUT" | "STDERR",
  ): Promise<void> {
    try {
      const reader = readable.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (this.runningContainers.has(taskId)) {
        try {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.trim()) {
              // Parse timestamp if present (podman --timestamps format)
              const timestampMatch = line.match(
                /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s+(.*)$/,
              );
              const logMessage = timestampMatch ? timestampMatch[2] : line;

              // Determine log level from content
              const logLevel = this.determineLogLevel(logMessage, source);

              // Add to database with source prefix
              await this.database.addTaskLog(
                taskId,
                logLevel,
                `[${source}] ${logMessage}`,
              );
            }
          }
        } catch (error) {
          if ((error as Error).name === "Interrupted") {
            // Stream was intentionally closed
            break;
          }
          console.error(`Error reading ${source} stream:`, error);
          await this.database.addTaskLog(
            taskId,
            LogLevel.ERROR,
            `${source} stream error: ${(error as Error).message}`,
          );
          break;
        }
      }

      // Process any remaining buffer content
      if (buffer.trim() && this.runningContainers.has(taskId)) {
        const logLevel = this.determineLogLevel(buffer, source);
        await this.database.addTaskLog(
          taskId,
          logLevel,
          `[${source}] ${buffer.trim()}`,
        );
      }

      reader.releaseLock();
    } catch (error) {
      console.error(`Error in ${source} stream handler:`, error);
      if (this.runningContainers.has(taskId)) {
        await this.database.addTaskLog(
          taskId,
          LogLevel.ERROR,
          `${source} handler error: ${(error as Error).message}`,
        );
      }
    }
  }

  private determineLogLevel(
    message: string,
    source: "STDOUT" | "STDERR",
  ): LogLevel {
    // Default stderr to WARN level
    if (source === "STDERR") {
      return LogLevel.WARN;
    }

    // Check message content for log level indicators
    const lowerMessage = message.toLowerCase();

    if (
      lowerMessage.includes("error") || lowerMessage.includes("failed") ||
      lowerMessage.includes("exception")
    ) {
      return LogLevel.ERROR;
    }

    if (lowerMessage.includes("warn") || lowerMessage.includes("warning")) {
      return LogLevel.WARN;
    }

    if (lowerMessage.includes("debug") || lowerMessage.includes("trace")) {
      return LogLevel.DEBUG;
    }

    // Default to INFO for stdout
    return LogLevel.INFO;
  }

  private async getContainerFinalLogs(
    taskId: string,
    containerId: string,
  ): Promise<void> {
    try {
      // Get any remaining logs that might not have been streamed
      const logsCommand = new Deno.Command(ENGINE, {
        args: ["logs", "--timestamps", "--tail", "50", containerId],
        stdout: "piped",
        stderr: "piped",
      });

      const { success, stdout, stderr } = await logsCommand.output();

      if (success) {
        const stdoutLogs = new TextDecoder().decode(stdout);
        const stderrLogs = new TextDecoder().decode(stderr);

        await this.database.addTaskLog(
          taskId,
          LogLevel.DEBUG,
          "=== FINAL CONTAINER LOGS ===",
        );

        if (stdoutLogs.trim()) {
          await this.database.addTaskLog(
            taskId,
            LogLevel.INFO,
            `Final STDOUT:\n${stdoutLogs}`,
          );
        }

        if (stderrLogs.trim()) {
          await this.database.addTaskLog(
            taskId,
            LogLevel.WARN,
            `Final STDERR:\n${stderrLogs}`,
          );
        }

        await this.database.addTaskLog(
          taskId,
          LogLevel.DEBUG,
          "=== END FINAL LOGS ===",
        );
      }
    } catch (error) {
      await this.database.addTaskLog(
        taskId,
        LogLevel.DEBUG,
        `Could not retrieve final logs: ${(error as Error).message}`,
      );
    }
  }

  private async handleTaskCompletion(
    taskId: string,
    exitCode: number,
  ): Promise<void> {
    const task = await this.database.getTask(taskId);
    if (!task) return;

    const endedAt = new Date();
    const duration = task.startedAt
      ? endedAt.getTime() - task.startedAt.getTime()
      : 0;
    const status = exitCode === 0 ? TaskStatus.COMPLETED : TaskStatus.FAILED;

    // Update task
    await this.database.updateTask(taskId, {
      status,
      endedAt,
      duration,
      exitCode,
    });

    // Update agent
    const agent = await this.database.getAgent(task.agentId);
    if (agent) {
      const updates: Partial<Agent> = {
        status: AgentStatus.IDLE,
        currentTaskId: undefined,
        lastActivity: endedAt,
        totalTasks: agent.totalTasks + 1,
      };

      if (status === TaskStatus.COMPLETED) {
        updates.successfulTasks = agent.successfulTasks + 1;
      } else {
        updates.failedTasks = agent.failedTasks + 1;
      }

      await this.database.updateAgent(task.agentId, updates);
    }

    // Clean up timeout if exists
    this.clearTaskTimeout(taskId);

    // Clean up container
    if (task.containerId) {
      await this.stopContainer(task.containerId, taskId);
    }
    this.runningContainers.delete(taskId);

    const logMessage = status === TaskStatus.COMPLETED
      ? `Task completed successfully (exit code: ${exitCode})`
      : `Task failed with exit code: ${exitCode}`;

    await this.database.addTaskLog(taskId, LogLevel.INFO, logMessage);
  }

  private async *followContainerLogs(
    containerId: string,
  ): AsyncGenerator<string> {
    try {
      const command = new Deno.Command(ENGINE, {
        args: ["logs", "-f", containerId],
        stdout: "piped",
        stderr: "piped",
      });

      const process = command.spawn();
      const reader = process.stdout.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          const lines = text.split("\n").filter((line) => line.trim());

          for (const line of lines) {
            yield line;
          }
        }
      } finally {
        reader.releaseLock();
        process.kill();
      }
    } catch (error) {
      console.error("Error following container logs:", error);
    }
  }

  async cleanup(): Promise<void> {
    // Clear all timeouts
    for (const [_taskId, timeoutId] of this.taskTimeouts) {
      clearTimeout(timeoutId);
    }
    this.taskTimeouts.clear();

    // Stop all running containers
    for (const [taskId, containerId] of this.runningContainers) {
      try {
        await this.stopContainer(containerId, taskId);
        await this.database.addTaskLog(
          taskId,
          LogLevel.INFO,
          "Task stopped due to orchestrator shutdown",
        );
      } catch (error) {
        console.error(`Error stopping container ${containerId}:`, error);
      }
    }

    this.runningContainers.clear();
  }

  private clearTaskTimeout(taskId: string): void {
    const timeoutId = this.taskTimeouts.get(taskId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.taskTimeouts.delete(taskId);
    }
  }

  private async handleTaskTimeout(
    taskId: string,
    containerId: string,
  ): Promise<void> {
    try {
      console.log(
        `Task ${taskId} timed out, terminating container ${containerId}`,
      );

      // Stop the container
      await this.stopContainer(containerId, taskId);

      // Update task as failed with timeout flag
      const endedAt = new Date();
      const task = await this.database.getTask(taskId);
      const duration = task?.startedAt
        ? endedAt.getTime() - task.startedAt.getTime()
        : 0;

      await this.database.updateTask(taskId, {
        status: TaskStatus.FAILED,
        endedAt,
        duration,
        timedOut: true,
        error: "Task terminated due to timeout",
      });

      // Update agent status
      if (task) {
        await this.database.updateAgent(task.agentId, {
          status: AgentStatus.IDLE,
          currentTaskId: undefined,
          lastActivity: endedAt,
          totalTasks:
            (await this.database.getAgent(task.agentId))?.totalTasks || 0,
          failedTasks:
            ((await this.database.getAgent(task.agentId))?.failedTasks || 0) +
            1,
        });
      }

      // Clean up
      this.runningContainers.delete(taskId);
      this.taskTimeouts.delete(taskId);

      await this.database.addTaskLog(
        taskId,
        LogLevel.ERROR,
        "Task terminated due to timeout",
      );
    } catch (error) {
      console.error(`Error handling timeout for task ${taskId}:`, error);
      await this.database.addTaskLog(
        taskId,
        LogLevel.ERROR,
        `Timeout handling failed: ${(error as Error).message}`,
      );
    }
  }

  private formatDuration(milliseconds: number): string {
    if (!milliseconds) return "0ms";

    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else if (seconds > 0) {
      return `${seconds}s`;
    } else {
      return `${milliseconds}ms`;
    }
  }

  // Get system status
  async getSystemStatus(): Promise<{
    runningTasks: number;
    activeAgents: number;
    containerStats: Array<
      { taskId: string; containerId: string; status: string }
    >;
  }> {
    const runningTasks = await this.database.getTasksByStatus(
      TaskStatus.RUNNING,
    );
    const agents = await this.database.getAllAgents();
    const activeAgents =
      agents.filter((agent) => agent.status === AgentStatus.BUSY).length;

    const containerStats = [];
    for (const [taskId, containerId] of this.runningContainers) {
      try {
        const inspectCommand = new Deno.Command(ENGINE, {
          args: ["inspect", containerId, "--format", "{{.State.Status}}"],
        });
        const { success, stdout } = await inspectCommand.output();
        const status = success
          ? new TextDecoder().decode(stdout).trim()
          : "unknown";

        containerStats.push({ taskId, containerId, status });
      } catch (_error) {
        containerStats.push({ taskId, containerId, status: "error" });
      }
    }

    return {
      runningTasks: runningTasks.length,
      activeAgents,
      containerStats,
    };
  }
}
