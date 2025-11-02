# Graph Executor - Standalone Workflow Engine

A powerful, standalone workflow execution engine that runs graph-based configurations defined in YAML or JSON.

## Features

- **Standalone Executable** - Compile to a single binary, run anywhere
- **Environment Variables** - Load from .env files in current directory
- **Graph-Based Workflows** - Define complex workflows with nodes and edges
- **HTTP Support** - Make API requests with full header/body support
- **Conditional Logic** - Branch workflows based on state conditions
- **String Interpolation** - Use `${VAR}` syntax for dynamic values
- **Before Hooks** - Execute setup code before workflows
- **Custom Exit Codes** - Return specific exit codes for automation
- **JSON Schema** - Full schema validation support
- **Verbose Mode** - Detailed logging for debugging

## Quick Start

### Build the Executable

```bash
# Build bnaas-cli
deno task build:executor

# Or build everything
deno task build:all
```

### Run a Workflow

```bash
# Run with automatic .env loading
./bin/bnaas-cli examples/workflow-example.yaml

# Run with verbose logging
./bin/bnaas-cli examples/workflow-example.yaml --verbose

# Run with custom .env file
./bin/bnaas-cli workflow.yaml --env production.env

# Start from a specific node
./bin/bnaas-cli workflow.yaml --start node2
```

## Installation

### Using the Binary

After building, copy the binary to your PATH:

```bash
# Linux/macOS
sudo cp bin/bnaas-cli /usr/local/bin/

# Or add to your PATH
export PATH="$PATH:$(pwd)/bin"
```

### Running from Source

```bash
deno task executor examples/workflow-example.yaml
```

## Workflow Configuration

Workflows are defined in YAML or JSON format with the following structure:

```yaml
# Initial state variables
initialState:
  user_id: 1
  api_token: "${API_TOKEN}"

# Global configuration
config:
  verbose: true
  http:
    base_url: "https://api.example.com"
    headers:
      Authorization: "Bearer ${API_TOKEN}"

# Workflow graph
graph:
  start:
    description: "Fetch user data"
    executor:
      type: http
      method: GET
      endpoint: "/users/${user_id}"
      mutate: "user"
    edges:
      - to: process_user

  process_user:
    description: "Process the user data"
    executor:
      type: none
    edges:
      - to: success

  success:
    type: end
    code: 0
```

## Configuration Sections

### initialState

Variables available at workflow start:

```yaml
initialState:
  user_id: 1
  api_token: "${API_TOKEN}"  # Load from environment
  retry_count: 0
```

### config

Global workflow settings:

```yaml
config:
  verbose: true  # Enable detailed logging
  http:
    base_url: "${API_BASE_URL}"
    headers:
      Content-Type: "application/json"
      Authorization: "Bearer ${API_TOKEN}"
```

### before (Optional)

Hooks executed before nodes:

```yaml
before:
  start:
    initialize:
      executor:
        type: none
  all:
    check_auth:
      executor:
        type: http
        method: GET
        endpoint: "/auth/validate"
```

### conditions (Optional)

Named conditions for reuse:

```yaml
conditions:
  hasData:
    path: "data"
    operator: "!="
    value: null

  dataValid:
    and:
      - path: "data.length"
        operator: ">"
        value: 0
      - path: "data.status"
        operator: "="
        value: "success"
```

### graph

The workflow nodes and edges:

```yaml
graph:
  node_id:
    description: "What this node does"
    executor:
      type: http
      method: GET
      endpoint: "/api/data"
      mutate: "result"
    edges:
      - to: next_node
        condition: hasData
      - to: error_node
        condition:
          path: "result"
          operator: "="
          value: null
```

## Executor Types

### HTTP Executor

Make HTTP requests:

```yaml
executor:
  type: http
  method: GET|POST|PUT|DELETE|PATCH
  endpoint: "/api/endpoint"
  body:  # For POST, PUT, PATCH
    key: "value"
    dynamic: "${state_var}"
  mutate: "response_var"  # Store response in state
  headers:  # Optional additional headers
    X-Custom-Header: "value"
```

### Sleep Executor

Wait for a specified time:

```yaml
executor:
  type: sleep
  value: 2000  # milliseconds
```

### None Executor

No-op (useful for decision points):

```yaml
executor:
  type: none
```

### End Executor

Terminate with exit code:

```yaml
executor:
  type: end
  code: 0  # Exit code (default: 0)
```

Or as a node type:

```yaml
success:
  type: end
  code: 0
```

## Conditions

### Simple Condition

```yaml
condition:
  path: "user.age"
  operator: ">="
  value: 18
```

Operators: `=`, `!=`, `>`, `<`, `>=`, `<=`

### AND Condition

```yaml
condition:
  and:
    - path: "user.active"
      operator: "="
      value: true
    - path: "user.verified"
      operator: "="
      value: true
```

### OR Condition

```yaml
condition:
  or:
    - path: "user.role"
      operator: "="
      value: "admin"
    - path: "user.role"
      operator: "="
      value: "moderator"
```

### Named Condition Reference

```yaml
# Define in conditions section
conditions:
  isAdmin:
    path: "user.role"
    operator: "="
    value: "admin"

# Use in edges
graph:
  check_role:
    edges:
      - to: admin_panel
        condition: isAdmin
```

## Environment Variables

### Automatic Loading

Place a `.env` file in the directory where you run the command:

```bash
# .env
API_TOKEN=your-token-here
API_BASE_URL=https://api.example.com
USER_ID=123
```

Then use in your workflow:

```yaml
initialState:
  api_token: "${API_TOKEN}"
  user_id: "${USER_ID}"

config:
  http:
    base_url: "${API_BASE_URL}"
```

### Custom .env File

```bash
./bin/bnaas-cli workflow.yaml --env production.env
```

### System Environment

Environment variables are automatically available:

```bash
export API_TOKEN="secret"
./bin/bnaas-cli workflow.yaml
```

## String Interpolation

Use `${VAR}` syntax anywhere in your workflow:

```yaml
# From state
endpoint: "/users/${user_id}/posts"

# From environment
headers:
  Authorization: "Bearer ${API_TOKEN}"

# Nested paths
body:
  user_email: "${user.profile.email}"

# In conditions
condition:
  path: "posts.length"
  operator: ">"
  value: "${MIN_POSTS}"
```

## Path Expressions

Access nested data with dot notation:

```yaml
# Simple path
path: "user"

# Nested path
path: "user.profile.email"

# Array access
path: "posts.0.title"

# Array length
path: "posts.length"

# Array find
path: "users.find({id: 'admin'}).name"
```

## CLI Usage

```
Graph Executor CLI v1.0.0

USAGE:
  bnaas-cli <file> [options]

ARGUMENTS:
  <file>                    Path to YAML or JSON configuration file

OPTIONS:
  --start <node>           Start execution from a specific node
  --env <file>             Load environment variables from .env file
  --verbose, -v            Enable verbose logging
  --version                Show version information
  --help, -h               Show this help message

EXAMPLES:
  bnaas-cli workflow.yaml
  bnaas-cli workflow.yaml --start node2
  bnaas-cli workflow.yaml --env production.env
  bnaas-cli workflow.yaml --verbose
```

## Exit Codes

- `0` - Success
- `1` - Error (configuration, network, etc.)
- `N` - Custom exit code from `end` node

Example:

```yaml
graph:
  success:
    type: end
    code: 0

  partial_success:
    type: end
    code: 2

  error:
    type: end
    code: 1
```

Check exit code in shell:

```bash
./bin/bnaas-cli workflow.yaml
echo $?  # 0, 1, 2, etc.
```

## JSON Schema

A complete JSON Schema is available at `schema/workflow-schema.json` for IDE validation and autocompletion.

### VSCode Setup

Add to your `.vscode/settings.json`:

```json
{
  "yaml.schemas": {
    "./schema/workflow-schema.json": ["*.workflow.yaml", "workflows/*.yaml"]
  }
}
```

### YAML File Header

Add to your workflow files:

```yaml
# yaml-language-server: $schema=../schema/workflow-schema.json

initialState:
  # Your workflow here...
```

## Examples

### Simple API Workflow

```yaml
initialState:
  user_id: 1

config:
  verbose: true
  http:
    base_url: "https://jsonplaceholder.typicode.com"

graph:
  start:
    executor:
      type: http
      method: GET
      endpoint: "/users/${user_id}"
      mutate: "user"
    edges:
      - to: get_posts

  get_posts:
    executor:
      type: http
      method: GET
      endpoint: "/posts?userId=${user_id}"
      mutate: "posts"
    edges:
      - to: success

  success:
    type: end
    code: 0
```

### Conditional Workflow

```yaml
graph:
  check_status:
    executor:
      type: http
      method: GET
      endpoint: "/status"
      mutate: "status"
    edges:
      - to: healthy
        condition:
          path: "status.health"
          operator: "="
          value: "ok"
      - to: unhealthy
        condition:
          path: "status.health"
          operator: "!="
          value: "ok"

  healthy:
    executor:
      type: none
    edges:
      - to: proceed

  unhealthy:
    type: end
    code: 2
```

### Retry Logic

```yaml
initialState:
  retry_count: 0
  max_retries: 3

graph:
  try_request:
    executor:
      type: http
      method: GET
      endpoint: "/api/data"
      mutate: "result"
    edges:
      - to: success
        condition:
          path: "result.success"
          operator: "="
          value: true
      - to: retry
        condition:
          path: "retry_count"
          operator: "<"
          value: "${max_retries}"
      - to: failed
```

## Advanced Features

### Before Hooks

Execute code before nodes:

```yaml
before:
  # Executed once at start
  start:
    load_config:
      executor:
        type: http
        method: GET
        endpoint: "/config"
        mutate: "config"

  # Executed before every node
  all:
    check_rate_limit:
      executor:
        type: http
        method: GET
        endpoint: "/rate-limit"
        mutate: "rate_limit"
```

### Custom Functions

Available functions in string interpolation:

- `min(a, b)` - Minimum of two numbers
- `max(a, b)` - Maximum of two numbers

```yaml
body:
  value: "{{ min(10, ${max_value}) }}"
```

### Path Functions

Available in path expressions:

- `find(criteria)` - Find item in array
- `first()` - Get first item
- `last()` - Get last item

```yaml
path: "users.find({role: 'admin'}).name"
path: "items.first().id"
```

## Troubleshooting

### Workflow not found

```bash
❌ Error: Configuration file not found: workflow.yaml
```

Solution: Check the file path is correct and relative to current directory.

### Invalid JSON/YAML

```bash
❌ Execution failed
Error: Failed to parse configuration as JSON or YAML: ...
```

Solution: Validate your YAML/JSON syntax. Use the JSON schema for validation.

### Environment variable not loaded

```bash
# Value shows as "${API_TOKEN}" in logs
```

Solution:
1. Ensure `.env` file exists in current directory
2. Or export the variable: `export API_TOKEN=value`
3. Or use `--env` flag: `--env production.env`

### Node not found

```bash
❌ Execution failed
Error: Node not found: unknown_node
```

Solution: Check the `to` field in edges references valid node IDs.
