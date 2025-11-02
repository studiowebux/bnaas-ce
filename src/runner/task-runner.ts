// Task runner for containerized execution
import {
  executeFromConfig,
  executeFromFile,
  loadConfigFromStringAuto,
} from "./graph-executor.ts";

async function main() {
  const configPath = Deno.args[0];

  console.log(`Working directory: ${Deno.cwd()}`);
  console.log(`Started at: ${new Date().toISOString()}`);

  try {
    let executor;

    if (!configPath || configPath === "--stdin") {
      // Read configuration from stdin
      console.log("Starting bot task with config from stdin");
      console.log("Reading configuration from stdin...");

      const chunks = [];
      const reader = Deno.stdin.readable.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }

      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      const configContent = new TextDecoder().decode(combined);
      if (!configContent.trim()) {
        console.error("ERROR: No configuration content provided via stdin");
        Deno.exit(1);
      }

      console.log(`Config content received: ${configContent.length} bytes`);

      // Parse and execute the configuration
      console.log("Starting graph execution...");
      const config = loadConfigFromStringAuto(configContent);
      executor = await executeFromConfig(config);
    } else {
      // Read configuration from file (existing behavior)
      console.log(`Starting bot task with config: ${configPath}`);

      // Verify config file exists
      const stat = await Deno.stat(configPath);
      console.log(`Config file found: ${configPath} (${stat.size} bytes)`);

      // Execute the graph
      console.log("Starting graph execution...");
      executor = await executeFromFile(configPath);
    }

    const exitCode = executor.getExitCode();

    console.log(`Graph execution completed with exit code ${exitCode}`);
    console.log(`Finished at: ${new Date().toISOString()}`);

    if (exitCode === 0) {
      console.log("Task completed successfully");
    } else {
      console.log(`Task finished with exit code ${exitCode}`);
    }

    // Exit with the graph's exit code
    Deno.exit(exitCode);
  } catch (error) {
    console.error("Task execution failed:");
    console.error((error as Error).message);
    console.error("Stack trace:", (error as Error).stack);
    console.log(`Failed at: ${new Date().toISOString()}`);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
