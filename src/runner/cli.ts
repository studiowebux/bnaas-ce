#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env --allow-write
// Standalone CLI for Graph Executor
// Can be compiled into a single executable

import { parseArgs } from "@std/cli/parse-args";
import { join } from "@std/path";
import { load as loadEnv } from "@std/dotenv";
import { executeFromFile } from "./graph-executor.ts";

const VERSION = "1.0.0";

interface CliArgs {
  file?: string;
  start?: string;
  env?: string;
  help?: boolean;
  version?: boolean;
  verbose?: boolean;
  _: string[];
}

function printHelp() {
  console.log(`
Graph Executor CLI v${VERSION}

A powerful workflow execution engine that runs graph-based configurations.

USAGE:
  bnaas-cli <file> [options]
  bnaas-cli [options] <file>

ARGUMENTS:
  <file>                    Path to YAML or JSON configuration file

OPTIONS:
  --start <node>           Start execution from a specific node
  --env <file>             Load environment variables from .env file
                           (default: .env in current directory if exists)
  --verbose, -v            Enable verbose logging
  --version                Show version information
  --help, -h               Show this help message

EXAMPLES:
  # Run a workflow
  bnaas-cli workflow.yaml

  # Start from a specific node
  bnaas-cli workflow.yaml --start node2

  # Use custom .env file
  bnaas-cli workflow.yaml --env production.env

  # Enable verbose mode
  bnaas-cli workflow.yaml --verbose

  # Load .env from current directory (automatic)
  bnaas-cli workflow.yaml
  # If .env exists in current directory, it's loaded automatically

ENVIRONMENT VARIABLES:
  Any environment variables are available in the workflow using \${ENV_VAR} syntax.
  Load them from:
    1. System environment
    2. .env file in current directory (automatic)
    3. Custom .env file (--env option)

CONFIGURATION FORMAT:
  Supports both YAML and JSON formats. Files must have .yaml, .yml, or .json extension.

  Example workflow.yaml:
    config:
      verbose: true
      http:
        base_url: "https://api.example.com"
        headers:
          Authorization: "Bearer \${API_TOKEN}"

    nodes:
      - id: start
        executor:
          type: http
          method: GET
          endpoint: "/users"

    edges:
      - from: start
        to: end

EXIT CODES:
  0   Success
  1   Error (configuration, network, etc.)
  N   Custom exit code (from 'end' executor with code: N)

DOCUMENTATION:
  For more information, see the documentation at:
  https://github.com/studiowebux/botnetasaservice
`);
}

function printVersion() {
  console.log(`Graph Executor CLI v${VERSION}`);
}

async function loadEnvFile(envPath: string): Promise<void> {
  try {
    const env = await loadEnv({ envPath, export: true });
    console.log(`Loaded environment variables from: ${envPath}`);
    if (Object.keys(env).length === 0) {
      console.log(`   Warning: .env file is empty`);
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.log(`No .env file found at: ${envPath}`);
    } else {
      console.error(`Error loading .env file: ${(error as Error).message}`);
      Deno.exit(1);
    }
  }
}

async function main() {
  const args = parseArgs(Deno.args, {
    string: ["start", "env"],
    boolean: ["help", "version", "verbose"],
    alias: {
      h: "help",
      v: "verbose",
    },
    default: {
      help: false,
      version: false,
      verbose: false,
    },
  }) as CliArgs;

  // Show help
  if (args.help) {
    printHelp();
    Deno.exit(0);
  }

  // Show version
  if (args.version) {
    printVersion();
    Deno.exit(0);
  }

  // Get config file path
  let configFile: string | undefined;

  // Check if file is in positional args
  if (args._.length > 0) {
    configFile = args._[0].toString();
  } else if (args.file) {
    configFile = args.file;
  }

  if (!configFile) {
    console.error("Error: No configuration file specified\n");
    console.log("Usage: bnaas-cli <file> [options]");
    console.log("Run 'bnaas-cli --help' for more information");
    Deno.exit(1);
  }

  // Load .env file
  const envFile = args.env || join(Deno.cwd(), ".env");

  // Try to load .env file (don't fail if it doesn't exist)
  try {
    const stat = await Deno.stat(envFile);
    if (stat.isFile) {
      await loadEnvFile(envFile);
    }
  } catch {
    // .env file doesn't exist, that's ok
    if (args.env) {
      // Only show error if user explicitly specified an env file
      console.error(`❌ Error: Environment file not found: ${envFile}`);
      Deno.exit(1);
    }
  }

  // Resolve config file path
  const configPath = configFile.startsWith("/")
    ? configFile
    : join(Deno.cwd(), configFile);

  // Check if config file exists
  try {
    await Deno.stat(configPath);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.error(`❌ Error: Configuration file not found: ${configPath}`);
      Deno.exit(1);
    }
    throw error;
  }

  // Display execution info
  console.log(`Graph Executor v${VERSION}`);
  console.log(`Configuration: ${configPath}`);
  if (args.start) {
    console.log(`Starting from node: ${args.start}`);
  }
  if (args.verbose) {
    console.log(`Verbose mode: enabled`);
  }
  console.log(`Working directory: ${Deno.cwd()}`);
  console.log("");

  // Execute the graph
  try {
    const startTime = Date.now();

    const executor = await executeFromFile(configPath, args.start);

    const duration = Date.now() - startTime;
    const state = executor.getState();

    console.log("");
    console.log("Execution completed successfully");
    console.log(` Duration: ${duration}ms`);

    if (args.verbose) {
      console.log(`Final state:`);
      console.log(JSON.stringify(state, null, 2));
    }

    // Get custom exit code from executor
    const exitCode = executor.getExitCode();
    if (exitCode !== 0) {
      console.log(`Exit code: ${exitCode}`);
    }

    Deno.exit(exitCode);
  } catch (error) {
    console.error("");
    console.error("Execution failed");
    console.error(`Error: ${(error as Error).message}`);

    if (args.verbose && error instanceof Error && error.stack) {
      console.error("");
      console.error("Stack trace:");
      console.error(error.stack);
    }

    Deno.exit(1);
  }
}

// Run main function if this is the main module
if (import.meta.main) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    Deno.exit(1);
  });
}
