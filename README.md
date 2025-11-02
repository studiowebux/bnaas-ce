# Graph Execution Engine

A powerful, flexible graph execution engine for Deno that supports HTTP requests, conditions, string interpolation, data manipulation, and custom functions. Perfect for building complex automation workflows, API orchestration, and data processing pipelines.

## Features

- **Graph-based execution flow** with conditional branching
- **HTTP request execution** with full header and body support
- **String interpolation** with AST-based expression parsing
- **Data manipulation** with MongoDB-style queries (filter, sort, etc.)
- **Variables system** for configuration management
- **Before hooks** for state management and preparation
- **Conditional routing** with complex boolean logic
- **Nested property access** with dot notation and array indexing
- **YAML and JSON** configuration support

## Quick Start

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd botnetasaservice
```

### Running the Graph Executor (CLI)

```bash
# Run a single graph configuration file
deno run --allow-net --allow-read src/runner/graph-executor.ts config.yml

# With environment variables (for secrets)
API_TOKEN="your-token" USERNAME="user" deno run --allow-net --allow-read src/runner/graph-executor.ts config.yml
```

### Running the Web UI & Orchestrator

The project includes a web-based UI for managing and monitoring graph executions:

```bash
# Start the main orchestrator server (includes API and UI)
deno task start
# or
deno run -A src/server.ts

# The server will start on http://localhost:3000
# Default port can be changed with PORT environment variable
PORT=8080 deno task start
```

### Environment Variables

```bash
# Server Configuration
PORT=3000                           # API server port
TASK_RUNNER_IMAGE="denoland/deno:2.4.4"  # Docker image for task execution
TASK_DEFAULT_MEMORY_LIMIT="128m"    # Default memory limit for tasks
TASK_DEFAULT_CPU_LIMIT="0.25"       # Default CPU limit for tasks
TASK_DEFAULT_TIMEOUT="1800000"      # Default timeout (30 minutes)

# Secrets (used in graph configurations)
API_TOKEN="your-api-token"
USERNAME="your-username"
PASSWORD="your-password"
DATABASE_URL="your-database-url"
```

### Basic Example

Create a `config.yml` file:

```yaml
variables:
  API_VERSION: "v1"
  BASE_URL: "https://api.example.com"

initialState:
  users: []
  results: []

config:
  verbose: true
  http:
    base_url: "${var.BASE_URL}"
    headers:
      "Content-Type": "application/json"
      "Authorization": "Bearer ${var.API_TOKEN}"

before:
  start:
    setup_logging:
      executor:
        type: "none"
  all:
    refresh_token:
      executor:
        type: "http"
        method: "GET"
        endpoint: "/auth/refresh"
        mutate: "auth"

graph:
  start:
    description: "Fetch user list"
    executor:
      type: "http"
      method: "GET"
      endpoint: "/api/${var.API_VERSION}/users"
      mutate: "users"
    edges:
      - to: "process_users"

  process_users:
    description: "Filter and sort users"
    executor:
      type: "none"
    edges:
      - to: "end"
        condition:
          path: "users.filter({'active': true}).sort('name', 'asc').length"
          operator: ">"
          value: 0

  end:
    type: "end"
    code: 0
```

## Configuration Structure

### Root Configuration

```yaml
variables: # Optional: Define reusable variables (clear text)
  KEY: "value"

# Secrets are provided via environment variables, not in config file
# Use ${SECRET_NAME} to access them (e.g., ${API_TOKEN})

initialState: # Required: Initial state object
  property: value

config: # Required: Execution configuration
  verbose: boolean
  http:
    base_url: string
    headers: object

before: # Optional: Before hooks
  start: # Executed once at the beginning
    hook_name:
      executor: { ... }
  all: # Executed before each condition evaluation
    hook_name:
      executor: { ... }

conditions: # Optional: Named conditions
  condition_name: { ... }

graph: # Required: Execution nodes
  node_name:
    description: string
    executor: { ... }
    edges: [...]
```

## Variables

Variables provide a clean way to define reusable configuration values stored in **clear text**:

```yaml
variables:
  API_VERSION: "v2"
  TIMEOUT: 5000
  ENVIRONMENT: "production"

# Usage in any string field:
endpoint: "/api/${var.API_VERSION}/users"
headers:
  "X-Environment": "${var.ENVIRONMENT}"
  "X-Timeout": "${var.TIMEOUT}"
```

**Syntax:** `${var.VARIABLE_NAME}`

## Secrets

Secrets are designed for sensitive data and are **encrypted at rest** using AES-256-GCM encryption. The system provides secure secrets management with web UI access, and automatically injects only referenced secrets into task execution containers.

### How Secrets Work

1. **Encrypted Storage**: Secrets are encrypted using AES-256-GCM before storage in the database
2. **Web UI Management**: Create, update, and manage secrets through the web interface
3. **Smart Injection**: Only secrets referenced in task configurations are decrypted and passed to containers
4. **Container Isolation**: Each task execution gets only the secrets it needs as environment variables

### Secret Management

#### Via Web UI

1. Start the orchestrator: `deno task start`
2. Open http://localhost:3000
3. Navigate to the "Secrets" tab
4. Create, update, or delete encrypted secrets

#### Via API

```bash
# Create a secret
curl -X POST http://localhost:3000/api/secrets \
  -H "Content-Type: application/json" \
  -d '{
    "name": "API_TOKEN",
    "value": "your-secret-token",
    "description": "API authentication token"
  }'

# List secrets (values are hidden)
curl http://localhost:3000/api/secrets
```

### Usage in Configuration

**Syntax:** `${secret.SECRET_NAME}`

```yaml
variables:
  API_VERSION: "v2"
  ENVIRONMENT: "production"

config:
  http:
    base_url: "https://api.example.com"
    headers:
      "Content-Type": "application/json"
      "Authorization": "Bearer ${secret.API_TOKEN}" # From environment
      "X-API-Version": "${var.API_VERSION}" # From variables
      "X-Environment": "${var.ENVIRONMENT}" # From variables

graph:
  authenticate:
    executor:
      type: "http"
      method: "POST"
      endpoint: "/auth/login"
      body:
        username: "${secret.USERNAME}" # From environment
        password: "${secret.DATABASE_PASSWORD}" # From environment
        client_id: "${var.CLIENT_ID}" # From variables
      mutate: "auth"

  secure_upload:
    executor:
      type: "http"
      method: "POST"
      endpoint: "/api/upload"
      headers:
        "X-Webhook-Secret": "${secret.WEBHOOK_SECRET}" # From environment
```

### Variables vs Secrets

| Feature        | Variables                 | Secrets               |
| -------------- | ------------------------- | --------------------- |
| **Storage**    | Clear text in config file | Encrypted in database |
| **Syntax**     | `${var.NAME}`             | `${secret.NAME}`      |
| **Management** | Config file editing       | Web UI / API          |
| **Use Case**   | Configuration values      | Sensitive data        |
| **Security**   | Visible in config         | AES-256-GCM encrypted |
| **Injection**  | Always available          | Only when referenced  |
| **Example**    | API version, timeouts     | API tokens, passwords |

### Smart Secret Injection

The system automatically scans your task configurations for `${secret.NAME}` references and only injects the referenced secrets into the execution container. This provides several benefits:

- **Security**: Only necessary secrets are exposed to each task
- **Performance**: No overhead from unused secrets
- **Audit Trail**: Clear tracking of which secrets are used by which tasks
- **Isolation**: Each task gets its own isolated environment

#### Development Workflow

1. Create secrets via the web UI (http://localhost:3000)
2. Reference secrets in your graph configurations using `${secret.NAME}`
3. Run tasks - only referenced secrets are automatically injected

### Agent-Specific Secret Mapping

For advanced use cases, you can map different secret values to the same variable name for different agents:

```json
{
  "agentId": "prod-agent",
  "secretMapping": {
    "API_TOKEN": "secret-id-for-prod-api",
    "DB_PASSWORD": "secret-id-for-prod-db"
  }
}
```

This allows different agents to use different secret values for the same `${secret.API_TOKEN}` reference.

### Security Features

- **AES-256-GCM Encryption**: Industry-standard encryption for secret values at rest
- **Smart Injection**: Only referenced secrets are decrypted and passed to containers
- **Container Isolation**: Each task execution runs in an isolated container environment
- **Audit Trail**: Track which secrets are used by which tasks
- **Runtime Only**: Secrets are only available during task execution
- **Zero Overhead**: Unused secrets don't impact performance

### Best Practices

- **Use variables** for non-sensitive configuration (API versions, URLs, timeouts, flags)
- **Use secrets** for sensitive data (API tokens, passwords, keys, certificates)
- **Rotate secrets regularly** through the web UI
- **Use descriptive secret names** that clearly indicate their purpose
- **Add descriptions and tags** to organize secrets effectively
- **Monitor secret usage** through audit trails and logs
- **Use agent-specific mappings** for different environments

### Secret Validation

The system provides clear feedback during task execution:

```
Warning: Secret "API_TOKEN" not found in container environment
Found 3 secret references: API_TOKEN, DB_PASSWORD, WEBHOOK_SECRET
Added secret "API_TOKEN" to container environment
```

This helps identify missing or incorrectly configured secrets during development and testing.

## Before Hooks

Before hooks allow you to execute code at specific times during execution:

### Start Hooks

Executed **once** at the very beginning of graph execution:

```yaml
before:
  start:
    initialize_auth:
      executor:
        type: "http"
        method: "POST"
        endpoint: "/auth/login"
        body:
          username: "${var.USERNAME}"
          password: "${var.PASSWORD}"
        mutate: "auth_token"

    setup_logging:
      executor:
        type: "none" # Setup logging configuration
```

### All Hooks

Executed **before each condition evaluation** to refresh state:

```yaml
before:
  all:
    refresh_data:
      executor:
        type: "http"
        method: "GET"
        endpoint: "/api/status"
        mutate: "status"

    update_timestamp:
      executor:
        type: "none" # Update current timestamp
```

### Legacy Support

Direct hooks (backwards compatible) are treated as `all:` hooks:

```yaml
before:
  refresh_token: # Treated as 'all:' hook
    executor:
      type: "http"
      method: "GET"
      endpoint: "/auth/refresh"
```

## Executors

### HTTP Executor

```yaml
executor:
  type: "http"
  method: "GET" | "POST" | "PUT" | "DELETE"
  endpoint: "/api/path"
  body:                    # Optional: Request body
    key: "value"
  headers:                 # Optional: Additional headers
    "X-Custom": "value"
  mutate: "state_key"      # Optional: Store response in state
```

### Sleep Executor

```yaml
executor:
  type: "sleep"
  value: 1000 # Milliseconds
```

### None Executor

```yaml
executor:
  type: "none" # No-op, useful for planning/comments
```

### End Executor

```yaml
executor:
  type: "end"
  code: 0 # Optional: Exit code (default: 0)
```

## String Interpolation

### Variables: `${var.NAME}`

```yaml
endpoint: "/api/${var.VERSION}/users"
```

### Expressions: `{{ expression_or_state }}`

> Expressions and States

```yaml
# Simple property access
endpoint: "/users/{{ user.id }}/profile"

# Array access
endpoint: "/users/{{ users[0].id }}/profile"

# Function calls
body:
  count: "{{ max(10, users.length) }}"

# Complex expressions
endpoint: "/api/{{ users.find({active: true}).department }}/stats"
```

### Data Manipulation Functions

#### Filter

```yaml
# Basic filtering
{{ users.filter({'active': true}) }}

# Comparison operators
{{ users.filter({'age': {'>=': 18, '<=': 65}}) }}

# Multiple conditions
{{ users.filter({'department': 'engineering', 'level': {'>=': 3}}) }}

# Nested properties
{{ users.filter({'profile.experience': {'>': 5}}) }}
```

**Supported operators:** `<`, `>`, `<=`, `>=`, `!=`, `==`, `$lt`, `$gt`, `$lte`, `$gte`, `$ne`, `$eq`

#### Sort

Sort arrays by any field:

```yaml
# Ascending (default)
{{ users.sort('name', 'asc') }}

# Descending
{{ users.sort('salary', 'desc') }}

# Nested properties
{{ users.sort('profile.joinDate', 'desc') }}
```

#### First and Last

Get first or last items from arrays:

```yaml
# Get first user
{{ users.filter({'active': true}).first.name }}

# Get last user
{{ users.sort('createdAt', 'desc').last.id }}

# Chain operations
{{ workers.filter({'salary': {'<=': 100}}).sort('salary', 'asc').first.id }}
```

#### Find

Find specific items in arrays:

```yaml
# Find by object
{{ users.find({'id': 'user123'}) }}

# Find by string (searches common properties)
{{ users.find('john_doe') }}

# Find with specific property
{{ users.find('Manager', 'role') }}
```

## Conditions

### Simple Conditions

```yaml
condition:
  path: "users.length"
  operator: ">"
  value: 0
```

### Complex Conditions

```yaml
# AND condition
condition:
  and:
    - path: "users.length"
      operator: ">"
      value: 0
    - path: "status.active"
      operator: "="
      value: true

# OR condition
condition:
  or:
    - path: "users.length"
      operator: ">"
      value: 10
    - path: "override"
      operator: "="
      value: true

# Nested conditions
condition:
  and:
    - path: "users.length"
      operator: ">"
      value: 0
    - or:
        - path: "environment"
          operator: "="
          value: "production"
        - path: "force_run"
          operator: "="
          value: true
```

### Named Conditions

```yaml
conditions:
  has_active_users:
    path: "users.filter({'active': true}).length"
    operator: ">"
    value: 0

  is_business_hours:
    and:
      - path: "current_hour"
        operator: ">="
        value: 9
      - path: "current_hour"
        operator: "<"
        value: 17

graph:
  start:
    edges:
      - to: "process_users"
        condition: "has_active_users"
      - to: "wait"
        condition: "is_business_hours"
        fallback: "end"
```

## Graph Nodes

### Basic Node Structure

```yaml
node_name:
  description: "Human readable description"
  executor:
    type: "http"
    # ... executor configuration
  edges:
    - to: "next_node"
      condition: { ... } # Optional
      fallback: "other_node" # Optional
```

### End Nodes

```yaml
success_end:
  type: "end"
  code: 0

error_end:
  type: "end"
  code: 1
```

## Complete Example

```yaml
variables:
  API_BASE: "https://api.company.com"
  API_VERSION: "v2"
  DEPARTMENT: "engineering"

initialState:
  employees: []
  filtered_employees: []
  stats: {}

config:
  verbose: true
  http:
    base_url: "${var.API_BASE}"
    headers:
      "Content-Type": "application/json"
      "X-API-Version": "${var.API_VERSION}"

before:
  start:
    authenticate:
      executor:
        type: "http"
        method: "POST"
        endpoint: "/auth/login"
        body:
          service: "graph-executor"
        mutate: "auth"

  all:
    refresh_cache:
      executor:
        type: "http"
        method: "GET"
        endpoint: "/cache/refresh"

conditions:
  has_employees:
    path: "employees.length"
    operator: ">"
    value: 0

  has_senior_employees:
    path: "employees.filter({'level': {'>=': 5}}).length"
    operator: ">"
    value: 0

graph:
  start:
    description: "Fetch all employees"
    executor:
      type: "http"
      method: "GET"
      endpoint: "/api/${var.API_VERSION}/employees"
      headers:
        "Authorization": "Bearer {{ auth.token }}"
      mutate: "employees"
    edges:
      - to: "filter_employees"
        condition: "has_employees"
      - to: "no_employees"

  filter_employees:
    description: "Filter employees by department and experience"
    executor:
      type: "none"
    edges:
      - to: "calculate_stats"
        condition: "has_senior_employees"
      - to: "no_senior_staff"

  calculate_stats:
    description: "Calculate department statistics"
    executor:
      type: "http"
      method: "POST"
      endpoint: "/api/${var.API_VERSION}/stats"
      body:
        department: "${var.DEPARTMENT}"
        employees: "{{ employees.filter({'department': var.DEPARTMENT, 'level': {'>=': 5}}).sort('salary', 'desc') }}"
        count: "{{ employees.filter({'department': var.DEPARTMENT}).length }}"
        average_salary: "{{ employees.filter({'department': var.DEPARTMENT}).map(e => e.salary).reduce((a,b) => a+b, 0) / employees.filter({'department': var.DEPARTMENT}).length }}"
      mutate: "stats"
    edges:
      - to: "success"

  no_employees:
    description: "Handle no employees case"
    executor:
      type: "none"
    edges:
      - to: "error_end"

  no_senior_staff:
    description: "Handle no senior staff case"
    executor:
      type: "none"
    edges:
      - to: "warning_end"

  success:
    description: "Success completion"
    executor:
      type: "none"
    edges:
      - to: "success_end"

  success_end:
    type: "end"
    code: 0

  warning_end:
    type: "end"
    code: 2

  error_end:
    type: "end"
    code: 1
```

## Advanced Usage

### Chaining Data Operations

```yaml
# Complex data pipeline
body:
  # Get high-performing employees
  top_performers: "{{ employees.filter({'performance_score': {'>': 8.5}}).sort('performance_score', 'desc') }}"

  # Get department summary
  department_summary: "{{ employees.filter({'department': var.DEPARTMENT}).map(e => ({name: e.name, level: e.level, salary: e.salary})) }}"

  # Get first available manager
  assigned_manager: "{{ employees.filter({'role': 'manager', 'available': true}).first.id }}"

  # Statistics
  total_count: "{{ employees.length }}"
  active_count: "{{ employees.filter({'active': true}).length }}"
  senior_count: "{{ employees.filter({'level': {'>=': 5}}).length }}"
```

### Dynamic Endpoints

```yaml
executor:
  type: "http"
  method: "GET"
  endpoint: "/api/${var.API_VERSION}/departments/{{ user.department }}/employees/{{ user.filter({'active': true}).first.id }}"
```

### Conditional Headers

```yaml
executor:
  type: "http"
  method: "POST"
  endpoint: "/api/data"
  headers:
    "Authorization": "Bearer {{ auth.token }}"
    "X-Department": "{{ user.department || 'unknown' }}"
    "X-User-Count": "{{ users.length }}"
```

## Error Handling

- **HTTP errors**: Execution stops and throws an error
- **Missing variables**: Warning logged, original text preserved
- **Invalid expressions**: Error logged, execution continues
- **Missing nodes**: Execution stops and throws an error
- **Before hook failures**: Warning logged, execution continues

## Exit Codes

- `0`: Success
- `1`: Error (default for failures)
- `2+`: Custom exit codes defined in end nodes

## File Formats

Both YAML and JSON formats are supported:

### YAML (Recommended)

```yaml
variables:
  KEY: "value"
initialState:
  data: []
# ... rest of configuration
```

### JSON

```json
{
  "variables": {
    "KEY": "value"
  },
  "initialState": {
    "data": []
  }
}
```

## API Reference

### Custom Functions

Available in expressions (`{{ }}`):

- `min(a, b)`: Return minimum value
- `max(a, b)`: Return maximum value

### Path Functions

Available on arrays:

- `filter(query)`: Filter array with MongoDB-style queries
- `sort(key, direction)`: Sort array by key ('asc'/'desc')
- `find(criteria, property?)`: Find item in array
- `first`: Get first item (property access)
- `last`: Get last item (property access)

### Variable Access

- `${var.VARIABLE_NAME}`: Access defined variables
- `{{state}}`: Access defined states
- `${secret.ENV_VAR}`: Access defined secret

### Expression Syntax

- Property access: `object.property`
- Array access: `array[0]`, `object['key']`
- Method calls: `array.filter({})`
- Function calls: `max(a, b)`
- Complex paths: `users.filter({}).sort().first.name`

## License

MIT License - see LICENSE file for details.
