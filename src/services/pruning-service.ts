// Pruning service for automated data cleanup
import { JsonDatabase } from "../database/json-db.ts";
import { PruningConfig } from "../types/orchestrator.ts";

export class PruningService {
  private database: JsonDatabase;
  private config: PruningConfig;
  private pruningTimer?: number;

  constructor(database: JsonDatabase, config: PruningConfig) {
    this.database = database;
    this.config = config;
  }

  start(): void {
    if (!this.config.enabled) {
      console.log("Pruning service disabled");
      return;
    }

    console.log(
      `Starting pruning service - retention: ${this.config.retentionDays} days`,
    );

    // Run initial pruning after 30 seconds
    setTimeout(() => {
      this.runPruning();
    }, 30000);

    // Schedule daily pruning at 2 AM
    this.scheduleDailyPruning();
  }

  stop(): void {
    if (this.pruningTimer) {
      clearTimeout(this.pruningTimer);
      this.pruningTimer = undefined;
    }
    console.log("Pruning service stopped");
  }

  private scheduleDailyPruning(): void {
    const now = new Date();
    const nextRun = new Date();
    nextRun.setHours(2, 0, 0, 0); // 2 AM

    // If it's already past 2 AM today, schedule for tomorrow
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    const msUntilNextRun = nextRun.getTime() - now.getTime();

    console.log(`Next pruning scheduled for: ${nextRun.toISOString()}`);

    this.pruningTimer = setTimeout(() => {
      this.runPruning();
      // Schedule the next run in 24 hours
      this.pruningTimer = setInterval(() => {
        this.runPruning();
      }, 24 * 60 * 60 * 1000);
    }, msUntilNextRun);
  }

  private async runPruning(): Promise<void> {
    try {
      console.log("Starting scheduled pruning operation...");

      const results = await this.database.pruneOldData(this.config);

      // Also prune old logs
      const logsRemoved = await this.database.pruneLogs(this.config);

      console.log(`Scheduled pruning completed successfully:`);
      console.log(`   - Tasks: ${results.tasksRemoved}`);
      console.log(`   - Agents: ${results.agentsRemoved}`);
      console.log(`   - Logs: ${logsRemoved}`);
      console.log(`   - Space freed: ${this.formatBytes(results.spaceFreed)}`);
    } catch (error) {
      console.error("❌ Pruning operation failed:", error);
    }
  }

  async runManualPruning(dryRun = false): Promise<{
    tasksRemoved: number;
    agentsRemoved: number;
    logsRemoved: number;
    spaceFreed: number;
  }> {
    const config = { ...this.config, dryRun };

    console.log(
      `Running manual pruning (${dryRun ? "DRY RUN" : "LIVE"})...`,
    );

    const results = await this.database.pruneOldData(config);
    const logsRemoved = await this.database.pruneLogs(config);

    return {
      tasksRemoved: results.tasksRemoved,
      agentsRemoved: results.agentsRemoved,
      logsRemoved,
      spaceFreed: results.spaceFreed,
    };
  }

  getPruningStats(): {
    eligibleTasks: number;
    eligibleAgents: number;
    eligibleLogs: number;
    estimatedSpaceSaved: number;
  } {
    return this.database.getPruningStats(this.config.retentionDays);
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }
}
