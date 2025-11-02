# Configuration Guide

## Overview

The Botnet as a Service (bnaas) application can be configured using external configuration files stored in `~/.bnaas/` directory. This allows you to customize the behavior without modifying the source code.

## Configuration Directory

By default, all configuration files are stored in:
```
~/.bnaas/
```

You can override this location using the `BNAAS_CONFIG_DIR` environment variable:
```bash
export BNAAS_CONFIG_DIR=/path/to/custom/config
```

## Files in ~/.bnaas/

- **config.json** - Main configuration file
- **orchestrator.json** - Database file (auto-generated)
- **encryption.key** - Encryption key for secrets (auto-generated)

## Initial Setup

### Automatic Setup (Recommended)

Simply run the application - it will automatically create `~/.bnaas/config.json` with default values:

```bash
./bin/bnaas
```

Or if running from source:
```bash
deno task start
```

On first run, you'll see:
```
 No config file found at ~/.bnaas/config.json
Creating default configuration file...
Created default configuration at: ~/.bnaas/config.json
Edit this file to customize your configuration
```

The application will then start with these defaults. You can stop it, edit the config file, and restart.

### Manual Setup (Alternative)

If you prefer to see an example first:

**1. Create Example Configuration**

Run the application with the `--init` flag:

```bash
./bin/bnaas --init
```

This creates `~/.bnaas/config.example.json` with all available options.

**2. Create Your Configuration**

Copy the example and customize it:
```bash
cp ~/.bnaas/config.example.json ~/.bnaas/config.json
```

Edit `~/.bnaas/config.json` to match your requirements.

## Configuration File Structure

```json
{
  "database": {
    "path": "/Users/username/.bnaas/orchestrator.json"
  },
  "container": {
    "image": "denoland/deno:2.4.4",
    "workDir": "/app",
    "volumes": [
      {
        "host": "./",
        "container": "/app"
      }
    ],
    "resources": {
      "memory": "128m",
      "cpus": "0.25"
    },
    "defaultTimeoutMs": 1800000
  },
  "api": {
    "port": 3000,
    "cors": true,
    "logLevel": "INFO"
  },
  "scheduler": {
    "enabled": true,
    "checkInterval": 60000
  },
  "pruning": {
    "enabled": true,
    "retentionDays": 7,
    "batchSize": 100,
    "dryRun": false
  },
  "secretsKeyPath": "/Users/username/.bnaas/encryption.key"
}
```

## Configuration Options

### Database

- **path**: Path to the JSON database file
  - Default: `~/.bnaas/orchestrator.json`

### Container

- **image**: Docker/Podman container image for task execution
  - Default: `"denoland/deno:2.4.4"`
  - Can be overridden with `TASK_RUNNER_IMAGE` env var

- **workDir**: Working directory inside the container
  - Default: `"/app"`

- **volumes**: Volume mounts for the container
  - Array of `{ host: string, container: string }` objects

- **resources.memory**: Default memory limit for tasks
  - Default: `"128m"`
  - Can be overridden with `TASK_DEFAULT_MEMORY_LIMIT` env var

- **resources.cpus**: Default CPU limit for tasks
  - Default: `"0.25"`
  - Can be overridden with `TASK_DEFAULT_CPU_LIMIT` env var

- **defaultTimeoutMs**: Default task timeout in milliseconds
  - Default: `1800000` (30 minutes)
  - Can be overridden with `TASK_DEFAULT_TIMEOUT` env var

### API

- **port**: Port for the API server
  - Default: `3000`
  - Can be overridden with `PORT` env var

- **cors**: Enable CORS
  - Default: `true`

- **logLevel**: Logging level
  - Options: `"DEBUG"`, `"INFO"`, `"WARN"`, `"ERROR"`
  - Default: `"INFO"`
  - Can be overridden with `LOG_LEVEL` env var

### Scheduler

- **enabled**: Enable task scheduling
  - Default: `true`

- **checkInterval**: Interval for checking scheduled tasks (ms)
  - Default: `60000` (1 minute)

### Pruning

- **enabled**: Enable automatic data pruning
  - Default: `true`

- **retentionDays**: Number of days to retain data
  - Default: `7`

- **batchSize**: Number of records to process at once
  - Default: `100`

- **dryRun**: If true, only log what would be deleted
  - Default: `false`

### Secrets

- **secretsKeyPath**: Path to the encryption key file
  - Default: `~/.bnaas/encryption.key`
  - Can be overridden with `SECRETS_KEY_PATH` env var

## Environment Variable Overrides

You can override configuration values using environment variables. These take precedence over the config file:

```bash
# Container configuration
export TASK_RUNNER_IMAGE="denoland/deno:2.5.0"
export TASK_DEFAULT_MEMORY_LIMIT="256m"
export TASK_DEFAULT_CPU_LIMIT="0.5"
export TASK_DEFAULT_TIMEOUT="3600000"

# API configuration
export PORT="8080"
export LOG_LEVEL="DEBUG"

# Paths
export DATABASE_PATH="/custom/path/db.json"
export SECRETS_KEY_PATH="/custom/path/encryption.key"

# Secrets encryption (instead of using a file)
export SECRETS_KEY="your-secure-passphrase-here"
```

## Priority Order

Configuration values are applied in this order (highest priority first):

1. Environment variables
2. Configuration file (`~/.bnaas/config.json`)
3. Default values

## Security Considerations

### Encryption Key

The encryption key at `~/.bnaas/encryption.key` is used to encrypt all secrets stored in the database.

**Important:**
- Keep this file secure and backed up
- If you lose this file, you will not be able to decrypt existing secrets
- Use appropriate file permissions: `chmod 600 ~/.bnaas/encryption.key`

**Alternatives:**
- Set the `SECRETS_KEY` environment variable instead of using a file
- Use a secrets management system to store the passphrase

### File Permissions

Recommended permissions for the config directory:
```bash
chmod 700 ~/.bnaas
chmod 600 ~/.bnaas/encryption.key
chmod 644 ~/.bnaas/config.json
chmod 644 ~/.bnaas/orchestrator.json
```

## Examples

### Development Configuration

```json
{
  "api": {
    "port": 3000,
    "logLevel": "DEBUG"
  },
  "container": {
    "resources": {
      "memory": "256m",
      "cpus": "0.5"
    }
  },
  "pruning": {
    "dryRun": true
  }
}
```

### Production Configuration

```json
{
  "api": {
    "port": 8080,
    "logLevel": "WARN"
  },
  "container": {
    "resources": {
      "memory": "512m",
      "cpus": "1"
    },
    "defaultTimeoutMs": 3600000
  },
  "pruning": {
    "enabled": true,
    "retentionDays": 30,
    "batchSize": 500
  }
}
```

## Troubleshooting

### Configuration not loading

Check the startup logs to see if the configuration file was found:

**If config exists:**
```
Loaded configuration from: /Users/username/.bnaas/config.json
```

**If config doesn't exist (auto-created):**
```
 No config file found at /Users/username/.bnaas/config.json
Creating default configuration file...
Created default configuration at: /Users/username/.bnaas/config.json
Edit this file to customize your configuration
```

### Invalid JSON

If your config file has invalid JSON, the application will log an error and use defaults:
```
 Error reading config file: Unexpected token...
Using default configuration
```

Use a JSON validator to check your configuration file.

### Permission denied

Ensure the config directory and files have appropriate permissions:
```bash
ls -la ~/.bnaas/
```

If needed, adjust permissions:
```bash
chmod 700 ~/.bnaas
chmod 644 ~/.bnaas/config.json
```
