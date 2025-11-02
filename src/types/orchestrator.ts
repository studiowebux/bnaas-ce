// Core types for the orchestrator system

export interface Task {
  id: string;
  agentId: string;
  configPath: string;
  configContent?: string | Record<string, any>; // Optional inline config content (string or parsed object)
  configType?: "file" | "json" | "yaml"; // How config is provided
  name: string;
  description?: string;
  status: TaskStatus;
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  duration?: number; // milliseconds
  currentState: Record<string, any>;
  logs: TaskLog[];
  schedule?: ScheduleConfig;
  containerId?: string;
  exitCode?: number;
  error?: string;
  resources?: ResourceLimits; // Optional per-task resource overrides
  timeoutMs?: number; // Optional task timeout in milliseconds
  timedOut?: boolean; // Flag indicating if task was terminated due to timeout
  // Soft delete fields
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: string; // Could track user/admin who deleted it
}

export interface TaskLog {
  timestamp: Date;
  level: LogLevel;
  message: string;
  data?: any;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
  status: AgentStatus;
  currentTaskId?: string;
  lastActivity?: Date;
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  secretMapping: Record<string, string>; // Map: "API_KEY" -> secret-uuid, "DB_PASS" -> secret-uuid
}

export interface ScheduleConfig {
  enabled: boolean;
  cronExpression: string;
  timezone?: string;
  maxRuns?: number;
  currentRuns: number;
}

export interface TaskStatistics {
  totalTasks: number;
  runningTasks: number;
  completedTasks: number;
  failedTasks: number;
  scheduledTasks: number;
  averageRuntime: number;
  tasksByAgent: Record<string, number>;
  tasksByStatus: Record<TaskStatus, number>;
  recentActivity: TaskActivity[];
}

export interface TaskActivity {
  taskId: string;
  agentId: string;
  action: TaskAction;
  timestamp: Date;
  details?: string;
}

// Enums
export enum TaskStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
  SCHEDULED = "scheduled",
  DELETED = "deleted", // For soft-deleted tasks
}

export enum AgentStatus {
  IDLE = "idle",
  BUSY = "busy",
  ERROR = "error",
  OFFLINE = "offline",
}

export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
}

export enum TaskAction {
  CREATED = "created",
  STARTED = "started",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
  SCHEDULED = "scheduled",
  LOG_ADDED = "log_added",
}

// API Request/Response types
export interface CreateTaskRequest {
  agentId: string;
  configPath?: string; // Optional when using configContent
  configContent?: string; // Optional inline config content
  configType?: "file" | "json" | "yaml"; // How config is provided
  name: string;
  description?: string;
  schedule?: Omit<ScheduleConfig, "currentRuns">;
  resources?: ResourceLimits;
  timeoutMs?: number;
}

export interface UpdateTaskRequest {
  name?: string;
  description?: string;
  agentId?: string;
  configPath?: string;
  configContent?: string | Record<string, any>; // Optional inline config content
  configType?: "file" | "json" | "yaml"; // How config is provided
  schedule?: Omit<ScheduleConfig, "currentRuns">;
  resources?: ResourceLimits;
  timeoutMs?: number;
}

export interface SwarmTaskRequest {
  name: string;
  description?: string;
  configContent: string;
  configType: string;
  agentIds: string[]; // List of agents to create tasks for
  schedule?: Omit<ScheduleConfig, "currentRuns">;
  resources?: ResourceLimits;
  timeoutMs?: number;
  secretMapping?: Record<string, string>; // Override secret mappings for all tasks
}

export interface AgentSecretAssignment {
  agentId: string;
  secretMapping: Record<string, string>; // Variable name -> secret ID mapping
}

export interface AgentSecretVariable {
  variableName: string; // e.g., "API_KEY"
  secretId: string;     // UUID of the secret to use
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface TaskListResponse {
  tasks: Task[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Configuration types
export interface ResourceLimits {
  memory?: string; // e.g., "512m", "1g", "2048m"
  cpus?: string; // e.g., "0.5", "1", "2"
}

export interface PruningConfig {
  enabled: boolean;
  retentionDays: number; // Keep data for this many days
  batchSize?: number; // Number of records to process at once (default: 100)
  dryRun?: boolean; // If true, only log what would be deleted
}

export interface OrchestratorConfig {
  database: {
    path: string;
  };
  container: {
    image: string;
    workDir: string;
    network?: string;
    volumes?: Array<{ host: string; container: string }>;
    resources?: ResourceLimits;
    defaultTimeoutMs?: number; // Default task timeout in milliseconds
  };
  api: {
    port: number;
    cors: boolean;
    logLevel: LogLevel;
  };
  scheduler: {
    enabled: boolean;
    checkInterval: number; // milliseconds
  };
  pruning?: PruningConfig; // Optional data pruning configuration
}

// Database schema
export interface Secret {
  id: string;
  name: string;
  description?: string;
  value: string; // Encrypted value
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  lastUsed?: Date;
  tags?: string[];
}

export interface CreateSecretRequest {
  name: string;
  description?: string;
  value: string; // Plain text value (will be encrypted)
  tags?: string[];
}

export interface UpdateSecretRequest {
  name?: string;
  description?: string;
  value?: string; // Plain text value (will be encrypted)
  tags?: string[];
}

export interface SecretListResponse {
  secrets: Omit<Secret, "value">[]; // Never return actual values in lists
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface Database {
  tasks: Task[];
  agents: Agent[];
  secrets: Secret[];
  version: string;
  lastUpdated: Date;
}
