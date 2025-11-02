// Main server file
import { JsonDatabase } from "./database/json-db.ts";
import { TaskOrchestrator } from "./orchestrator/task-orchestrator.ts";
import { TaskScheduler } from "./scheduler/task-scheduler.ts";
import { WebSocketManager } from "./websocket/websocket-manager.ts";
import { PruningService } from "./services/pruning-service.ts";
import { SecretsService } from "./services/secrets-service.ts";
import { createApp } from "./api/routes.ts";
import { createExampleConfig, loadConfig } from "./config/loader.ts";

async function main() {
  console.log("Starting Botnet Orchestrator...");

  // Load configuration
  const config = await loadConfig();

  // Handle --init flag to create example config
  if (Deno.args.includes("--init")) {
    await createExampleConfig();
    Deno.exit(0);
  }

  // Initialize database
  const database = new JsonDatabase(config.database.path);

  // Initialize secrets service with custom key path
  const secretsService = new SecretsService(config.secretsKeyPath);
  // Ensure secrets service is properly initialized before proceeding
  await secretsService.initialize();

  // Initialize orchestrator
  const orchestrator = new TaskOrchestrator(database, config, secretsService);

  // Initialize scheduler
  const scheduler = new TaskScheduler(database, orchestrator);

  if (config.scheduler.enabled) {
    await scheduler.start(config.scheduler.checkInterval);
  }

  // Initialize pruning service
  const pruningService = config.pruning
    ? new PruningService(database, config.pruning)
    : null;

  if (pruningService) {
    pruningService.start();
  }

  // Initialize WebSocket manager
  const wsManager = new WebSocketManager();

  // Create Hono app
  const app = createApp(
    database,
    orchestrator,
    scheduler,
    wsManager,
    pruningService || undefined,
    secretsService,
  );

  // Graceful shutdown
  const cleanup = async () => {
    console.log("\nShutting down gracefully...");

    try {
      await scheduler.stop();
      if (pruningService) {
        pruningService.stop();
      }
      await orchestrator.cleanup();
      wsManager.close();
      await database.cleanup();
      console.log("Cleanup completed");
    } catch (error) {
      console.error("Error during cleanup:", error);
    }

    Deno.exit(0);
  };

  // Handle shutdown signals
  Deno.addSignalListener("SIGINT", cleanup);
  Deno.addSignalListener("SIGTERM", cleanup);

  // Start server
  console.log(`Server starting on port ${config.api.port}`);
  console.log(`Dashboard: http://localhost:${config.api.port}`);
  console.log(`API: http://localhost:${config.api.port}/api`);

  Deno.serve({
    port: config.api.port,
    onListen: ({ port, hostname }) => {
      console.log(`Server running on http://${hostname}:${port}`);
    },
  }, app.fetch);
}

if (import.meta.main) {
  main().catch(console.error);
}
