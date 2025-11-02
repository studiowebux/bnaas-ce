// Configuration loader for bnaas
import { LogLevel, OrchestratorConfig } from "../types/orchestrator.ts";
import { join } from "@std/path";

export interface BnaasConfig extends OrchestratorConfig {
  // Additional config fields can be added here
  secretsKeyPath?: string;
}

const DEFAULT_CONFIG_DIR = join(Deno.env.get("HOME") || "~", ".bnaas");

/**
 * Get the config directory path
 * Can be overridden with BNAAS_CONFIG_DIR environment variable
 */
export function getConfigDir(): string {
  return Deno.env.get("BNAAS_CONFIG_DIR") || DEFAULT_CONFIG_DIR;
}

/**
 * Ensure the config directory exists
 */
export async function ensureConfigDir(): Promise<string> {
  const configDir = getConfigDir();
  try {
    await Deno.mkdir(configDir, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) {
      throw error;
    }
  }
  return configDir;
}

/**
 * Get default configuration
 */
export function getDefaultConfig(): BnaasConfig {
  const configDir = getConfigDir();

  return {
    database: {
      path: join(configDir, "orchestrator.json"),
    },
    container: {
      image: "denoland/deno:2.4.4",
      workDir: "/app",
      volumes: [
        { host: "./", container: "/app" },
      ],
      resources: {
        memory: "128m",
        cpus: "0.25",
      },
      defaultTimeoutMs: 1800000, // 30 minutes
    },
    api: {
      port: 3000,
      cors: true,
      logLevel: LogLevel.INFO,
    },
    scheduler: {
      enabled: true,
      checkInterval: 60000, // 1 minute
    },
    pruning: {
      enabled: true,
      retentionDays: 7,
      batchSize: 100,
      dryRun: false,
    },
    secretsKeyPath: join(configDir, "encryption.key"),
  };
}

/**
 * Load configuration from file
 * Falls back to defaults if file doesn't exist
 */
export async function loadConfig(configPath?: string): Promise<BnaasConfig> {
  const configDir = await ensureConfigDir();
  const finalConfigPath = configPath || join(configDir, "config.json");

  let fileConfig: Partial<BnaasConfig> = {};

  try {
    const content = await Deno.readTextFile(finalConfigPath);
    fileConfig = JSON.parse(content);
    console.log(`Loaded configuration from: ${finalConfigPath}`);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.log(` No config file found at ${finalConfigPath}`);
      console.log(`Creating default configuration file...`);

      // Create default config.json automatically
      const defaultConfig = getDefaultConfig();
      try {
        await saveConfig(defaultConfig, finalConfigPath, true);
        console.log(`Created default configuration at: ${finalConfigPath}`);
        console.log(`Edit this file to customize your configuration`);
        fileConfig = defaultConfig;
      } catch (saveError) {
        console.error(
          ` Could not create config file: ${(saveError as Error).message}`,
        );
        console.log(`📝 Using defaults without saving to file`);
      }
    } else {
      console.error(
        ` Error reading config file: ${(error as Error).message}`,
      );
      console.log("📝 Using default configuration");
    }
  }

  // Merge with defaults
  const defaultConfig = getDefaultConfig();
  const config = mergeConfig(defaultConfig, fileConfig);

  // Apply environment variable overrides
  applyEnvOverrides(config);

  return config;
}

/**
 * Deep merge configuration objects
 */
function mergeConfig(
  defaults: BnaasConfig,
  overrides: Partial<BnaasConfig>,
): BnaasConfig {
  const result = { ...defaults };

  for (const key in overrides) {
    const value = overrides[key as keyof BnaasConfig];
    if (value !== undefined) {
      if (
        typeof value === "object" && !Array.isArray(value) && value !== null
      ) {
        result[key as keyof BnaasConfig] = {
          ...defaults[key as keyof BnaasConfig] as any,
          ...value,
        };
      } else {
        result[key as keyof BnaasConfig] = value as any;
      }
    }
  }

  return result;
}

/**
 * Apply environment variable overrides
 */
function applyEnvOverrides(config: BnaasConfig): void {
  // Container image
  if (Deno.env.get("TASK_RUNNER_IMAGE")) {
    config.container.image = Deno.env.get("TASK_RUNNER_IMAGE")!;
  }

  // Resource limits
  if (Deno.env.get("TASK_DEFAULT_MEMORY_LIMIT")) {
    config.container.resources!.memory = Deno.env.get(
      "TASK_DEFAULT_MEMORY_LIMIT",
    );
  }

  if (Deno.env.get("TASK_DEFAULT_CPU_LIMIT")) {
    config.container.resources!.cpus = Deno.env.get("TASK_DEFAULT_CPU_LIMIT");
  }

  // Timeout
  if (Deno.env.get("TASK_DEFAULT_TIMEOUT")) {
    config.container.defaultTimeoutMs = parseInt(
      Deno.env.get("TASK_DEFAULT_TIMEOUT")!,
    );
  }

  // API port
  if (Deno.env.get("PORT")) {
    config.api.port = parseInt(Deno.env.get("PORT")!);
  }

  // Log level
  if (Deno.env.get("LOG_LEVEL")) {
    const level = Deno.env.get("LOG_LEVEL")!.toUpperCase();
    if (["DEBUG", "INFO", "WARN", "ERROR"].includes(level)) {
      config.api.logLevel = level as any;
    }
  }

  // Database path
  if (Deno.env.get("DATABASE_PATH")) {
    config.database.path = Deno.env.get("DATABASE_PATH")!;
  }

  // Secrets key path
  if (Deno.env.get("SECRETS_KEY_PATH")) {
    config.secretsKeyPath = Deno.env.get("SECRETS_KEY_PATH");
  }
}

/**
 * Save configuration to file
 */
export async function saveConfig(
  config: BnaasConfig,
  configPath?: string,
  silent = false,
): Promise<void> {
  const configDir = await ensureConfigDir();
  const finalConfigPath = configPath || join(configDir, "config.json");

  await Deno.writeTextFile(
    finalConfigPath,
    JSON.stringify(config, null, 2),
  );

  if (!silent) {
    console.log(`Configuration saved to: ${finalConfigPath}`);
  }
}

/**
 * Create example configuration file
 */
export async function createExampleConfig(): Promise<void> {
  const configDir = await ensureConfigDir();
  const examplePath = join(configDir, "config.example.json");

  const exampleConfig = getDefaultConfig();

  await Deno.writeTextFile(
    examplePath,
    JSON.stringify(exampleConfig, null, 2),
  );

  console.log(`Example configuration created at: ${examplePath}`);
  console.log(`Copy to config.json and modify as needed`);
}
