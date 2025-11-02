export const INDEX = `
  <!doctype html>
  <html lang="en">
      <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Botnet Orchestrator</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
          <link
              href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css"
              rel="stylesheet"
          />
          <style>
              /* Custom scrollbar */
              .custom-scrollbar::-webkit-scrollbar {
                  width: 6px;
              }
              .custom-scrollbar::-webkit-scrollbar-track {
                  background: #f1f1f1;
              }
              .custom-scrollbar::-webkit-scrollbar-thumb {
                  background: #888;
                  border-radius: 3px;
              }
              .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                  background: #555;
              }

              /* Animation classes */
              .fade-in {
                  animation: fadeIn 0.3s ease-in-out;
              }
              @keyframes fadeIn {
                  from {
                      opacity: 0;
                      transform: translateY(10px);
                  }
                  to {
                      opacity: 1;
                      transform: translateY(0);
                  }
              }

              .status-running {
                  @apply bg-blue-100 text-blue-800;
              }
              .status-completed {
                  @apply bg-green-100 text-green-800;
              }
              .status-failed {
                  @apply bg-red-100 text-red-800;
              }
              .status-pending {
                  @apply bg-yellow-100 text-yellow-800;
              }
              .status-cancelled {
                  @apply bg-gray-100 text-gray-800;
              }
              .status-scheduled {
                  @apply bg-purple-100 text-purple-800;
              }
              .status-deleted {
                  @apply bg-red-100 text-red-800;
              }
          </style>
      </head>
      <body class="bg-gray-50 text-gray-900">
          <div id="app" class="min-h-screen">
              <!-- Navigation -->
              <nav class="bg-white shadow-sm border-b border-gray-200">
                  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                      <div class="flex justify-between h-16">
                          <div class="flex items-center">
                              <div class="flex-shrink-0 flex items-center">
                                  <i
                                      class="fas fa-robot text-blue-600 text-2xl mr-3"
                                  ></i>
                                  <h1 class="text-xl font-bold text-gray-900">
                                      Botnet Orchestrator
                                  </h1>
                              </div>
                          </div>
                          <div class="flex items-center space-x-4">
                              <div
                                  id="system-status"
                                  class="flex items-center text-sm"
                              >
                                  <div
                                      class="w-2 h-2 bg-green-400 rounded-full mr-2"
                                  ></div>
                                  <span>System Online</span>
                              </div>
                              <button
                                  id="refresh-btn"
                                  class="text-gray-500 hover:text-gray-700"
                              >
                                  <i class="fas fa-sync-alt"></i>
                              </button>
                          </div>
                      </div>
                  </div>
              </nav>

              <!-- Main Content -->
              <div class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                  <!-- Dashboard Overview -->
                  <div class="mb-8">
                      <h2 class="text-2xl font-bold text-gray-900 mb-4">
                          Dashboard
                      </h2>

                      <!-- Statistics Cards -->
                      <div
                          id="stats-cards"
                          class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6"
                      >
                          <!-- Stats will be populated by JavaScript -->
                      </div>

                      <!-- Charts and Activity Row -->
                      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                          <!-- Task Status Chart -->
                          <div class="bg-white rounded-lg shadow p-6">
                              <h3 class="text-lg font-medium text-gray-900 mb-4">
                                  Task Status Distribution
                              </h3>
                              <div class="relative h-64">
                                  <canvas id="status-chart"></canvas>
                              </div>
                          </div>

                          <!-- Recent Activity -->
                          <div class="bg-white rounded-lg shadow p-6">
                              <h3 class="text-lg font-medium text-gray-900 mb-4">
                                  Recent Activity
                              </h3>
                              <div
                                  id="recent-activity"
                                  class="space-y-3 h-64 overflow-y-auto custom-scrollbar"
                              >
                                  <!-- Activity items will be populated by JavaScript -->
                              </div>
                          </div>

                          <!-- Next Scheduled -->
                          <div class="bg-white rounded-lg shadow p-6">
                              <div class="flex justify-between items-center mb-4">
                                  <h3 class="text-lg font-medium text-gray-900">
                                      Next Scheduled
                                  </h3>
                                  <button
                                      id="refresh-scheduled-btn"
                                      class="text-gray-500 hover:text-gray-700"
                                  >
                                      <i class="fas fa-sync-alt text-sm"></i>
                                  </button>
                              </div>
                              <div
                                  id="next-scheduled"
                                  class="space-y-3 h-64 overflow-y-auto custom-scrollbar"
                              >
                                  <!-- Next scheduled items will be populated by JavaScript -->
                              </div>
                          </div>
                      </div>
                  </div>

                  <!-- Tabs -->
                  <div class="bg-white shadow rounded-lg">
                      <div class="border-b border-gray-200">
                          <nav class="-mb-px flex space-x-8" aria-label="Tabs">
                              <button
                                  class="tab-btn active border-b-2 border-blue-500 py-4 px-1 text-sm font-medium text-blue-600"
                                  data-tab="tasks"
                              >
                                  <i class="fas fa-tasks mr-2"></i>Tasks
                              </button>
                              <button
                                  class="tab-btn border-b-2 border-transparent py-4 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                  data-tab="agents"
                              >
                                  <i class="fas fa-robot mr-2"></i>Agents
                              </button>
                              <button
                                  class="tab-btn border-b-2 border-transparent py-4 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                  data-tab="swarm"
                              >
                                  <i class="fas fa-swatchbook mr-2"></i>Bot Swarm
                              </button>
                              <button
                                  class="tab-btn border-b-2 border-transparent py-4 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                  data-tab="deleted"
                              >
                                  <i class="fas fa-trash-restore mr-2"></i>Deleted
                                  Tasks
                              </button>
                              <button
                                  class="tab-btn border-b-2 border-transparent py-4 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                  data-tab="logs"
                              >
                                  <i class="fas fa-file-alt mr-2"></i>Logs
                              </button>
                              <button
                                  class="tab-btn border-b-2 border-transparent py-4 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                  data-tab="pruning"
                              >
                                  <i class="fas fa-broom mr-2"></i>Pruning
                              </button>
                              <button
                                  class="tab-btn border-b-2 border-transparent py-4 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                  data-tab="secrets"
                              >
                                  <i class="fas fa-key mr-2"></i>Secrets
                              </button>
                          </nav>
                      </div>

                      <!-- Tab Content -->
                      <div class="p-6">
                          <!-- Tasks Tab -->
                          <div id="tasks-tab" class="tab-content">
                              <div class="flex justify-between items-center mb-6">
                                  <div class="flex items-center space-x-4">
                                      <h3
                                          class="text-lg font-medium text-gray-900"
                                      >
                                          Tasks
                                      </h3>
                                      <select
                                          id="status-filter"
                                          class="border border-gray-300 rounded-md px-3 py-2 text-sm"
                                      >
                                          <option value="">All Status</option>
                                          <option value="running">Running</option>
                                          <option value="completed">
                                              Completed
                                          </option>
                                          <option value="failed">Failed</option>
                                          <option value="pending">Pending</option>
                                          <option value="cancelled">
                                              Cancelled
                                          </option>
                                          <option value="scheduled">
                                              Scheduled
                                          </option>
                                      </select>
                                      <select
                                          id="agent-filter"
                                          class="border border-gray-300 rounded-md px-3 py-2 text-sm"
                                      >
                                          <option value="">All Agents</option>
                                          <!-- Populated by JavaScript -->
                                      </select>
                                  </div>
                                  <button
                                      id="new-task-btn"
                                      class="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
                                  >
                                      <i class="fas fa-plus mr-2"></i>New Task
                                  </button>
                              </div>

                              <!-- Tasks Table -->
                              <div
                                  class="bg-white shadow overflow-hidden rounded-md"
                              >
                                  <div
                                      id="tasks-table-container"
                                      class="overflow-x-auto"
                                  >
                                      <!-- Table will be populated by JavaScript -->
                                  </div>

                                  <!-- Pagination -->
                                  <div
                                      id="tasks-pagination"
                                      class="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6"
                                  >
                                      <!-- Pagination will be populated by JavaScript -->
                                  </div>
                              </div>
                          </div>

                          <!-- Agents Tab -->
                          <div id="agents-tab" class="tab-content hidden">
                              <div class="flex justify-between items-center mb-6">
                                  <h3 class="text-lg font-medium text-gray-900">
                                      Agents
                                  </h3>
                                  <button
                                      id="new-agent-btn"
                                      class="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
                                  >
                                      <i class="fas fa-plus mr-2"></i>New Agent
                                  </button>
                              </div>

                              <!-- Agents Grid -->
                              <div
                                  id="agents-grid"
                                  class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                              >
                                  <!-- Agent cards will be populated by JavaScript -->
                              </div>
                          </div>

                          <!-- Bot Swarm Tab -->
                          <div id="swarm-tab" class="tab-content hidden">
                              <div class="flex justify-between items-center mb-6">
                                  <h3 class="text-lg font-medium text-gray-900">
                                      Bot Swarm Management
                                  </h3>
                                  <button
                                      id="create-swarm-btn"
                                      class="bg-purple-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-purple-700"
                                  >
                                      <i class="fas fa-plus-circle mr-2"></i
                                      >Create Swarm
                                  </button>
                              </div>

                              <!-- Agent Secret Assignment Section -->
                              <div
                                  class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6"
                              >
                                  <!-- Agent Secret Assignment -->
                                  <div class="bg-white shadow rounded-lg p-6">
                                      <h4
                                          class="text-md font-medium text-gray-900 mb-4"
                                      >
                                          <i
                                              class="fas fa-key mr-2 text-purple-600"
                                          ></i
                                          >Agent Secret Assignment
                                      </h4>
                                      <div class="space-y-4">
                                          <div>
                                              <label
                                                  class="block text-sm font-medium text-gray-700 mb-1"
                                                  >Agent</label
                                              >
                                              <select
                                                  id="secret-agent-select"
                                                  class="w-full border border-gray-300 rounded-md px-3 py-2"
                                              >
                                                  <option value="">
                                                      Select an agent...
                                                  </option>
                                              </select>
                                          </div>
                                          <div>
                                              <label
                                                  class="block text-sm font-medium text-gray-700 mb-1"
                                                  >Variable Name</label
                                              >
                                              <input
                                                  type="text"
                                                  id="secret-variable-name"
                                                  placeholder="e.g., API_KEY, DB_PASSWORD"
                                                  class="w-full border border-gray-300 rounded-md px-3 py-2"
                                              />
                                              <p
                                                  class="text-xs text-gray-500 mt-1"
                                              >
                                                  This is how the secret will be
                                                  referenced in task configs:
                                                  \${SECRET.API_KEY}
                                              </p>
                                          </div>
                                          <div>
                                              <label
                                                  class="block text-sm font-medium text-gray-700 mb-1"
                                                  >Secret</label
                                              >
                                              <select
                                                  id="agent-secret-select"
                                                  class="w-full border border-gray-300 rounded-md px-3 py-2"
                                              >
                                                  <option value="">
                                                      Select a secret...
                                                  </option>
                                              </select>
                                          </div>
                                          <button
                                              id="assign-secret-btn"
                                              class="w-full bg-purple-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-purple-700"
                                          >
                                              Assign Secret to Agent
                                          </button>

                                          <!-- Current Agent Secret Mappings -->
                                          <div
                                              id="current-mappings"
                                              class="mt-4 p-3 bg-gray-50 rounded border"
                                          >
                                              <h5
                                                  class="text-sm font-medium text-gray-700 mb-2"
                                              >
                                                  Current Secret Mappings
                                              </h5>
                                              <div
                                                  id="mappings-display"
                                                  class="text-sm text-gray-600"
                                              >
                                                  Select an agent to view its
                                                  secret mappings
                                              </div>
                                          </div>
                                      </div>
                                  </div>

                                  <!-- Quick Swarm Creator -->
                                  <div class="bg-white shadow rounded-lg p-6">
                                      <h4
                                          class="text-md font-medium text-gray-900 mb-4"
                                      >
                                          <i
                                              class="fas fa-rocket mr-2 text-purple-600"
                                          ></i
                                          >Quick Swarm Creator
                                      </h4>
                                      <div class="space-y-4">
                                          <div>
                                              <label
                                                  class="block text-sm font-medium text-gray-700 mb-1"
                                                  >Task Name</label
                                              >
                                              <input
                                                  type="text"
                                                  id="swarm-task-name"
                                                  class="w-full border border-gray-300 rounded-md px-3 py-2"
                                                  placeholder="My Bot Swarm"
                                              />
                                          </div>
                                          <div>
                                              <label
                                                  class="block text-sm font-medium text-gray-700 mb-1"
                                                  >Config Content</label
                                              >
                                              <div class="flex items-center space-x-4 mb-2">
                                                  <label class="flex items-center">
                                                      <input
                                                          type="radio"
                                                          name="swarm-config-type"
                                                          value="yaml"
                                                          class="mr-2"
                                                          checked
                                                      />
                                                      <span class="text-sm">YAML</span>
                                                  </label>
                                                  <label class="flex items-center">
                                                      <input
                                                          type="radio"
                                                          name="swarm-config-type"
                                                          value="json"
                                                          class="mr-2"
                                                      />
                                                      <span class="text-sm">JSON</span>
                                                  </label>
                                              </div>
                                              <textarea
                                                  id="swarm-config-content"
                                                  class="w-full border border-gray-300 rounded-md px-3 py-2 font-mono text-sm"
                                                  rows="8"
                                                  placeholder="Paste your YAML or JSON configuration here..."
                                                  required
                                              ></textarea>
                                          </div>
                                          <div>
                                              <label
                                                  class="block text-sm font-medium text-gray-700 mb-1"
                                                  >Select Agents</label
                                              >
                                              <div
                                                  id="swarm-agents-list"
                                                  class="max-h-32 overflow-y-auto border border-gray-300 rounded-md p-2"
                                              >
                                                  <!-- Agent checkboxes populated by JavaScript -->
                                              </div>
                                          </div>

                                          <!-- Swarm Configuration Options -->
                                          <div class="border-t pt-4">
                                              <h5
                                                  class="text-sm font-medium text-gray-900 mb-3"
                                              >
                                                  Configuration Options
                                              </h5>

                                              <!-- Schedule Option -->
                                              <div class="flex items-center mb-3">
                                                  <input
                                                      type="checkbox"
                                                      id="swarm-schedule-checkbox"
                                                      class="mr-2"
                                                  />
                                                  <label
                                                      class="text-sm text-gray-700"
                                                      >Schedule tasks (run
                                                      automatically)</label
                                                  >
                                              </div>
                                              <div
                                                  id="swarm-schedule-options"
                                                  class="hidden mb-3 ml-6 space-y-2"
                                              >
                                                  <div>
                                                      <label
                                                          class="block text-sm text-gray-600 mb-1"
                                                          >Cron Expression</label
                                                      >
                                                      <input
                                                          type="text"
                                                          id="swarm-cron-input"
                                                          class="w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                                                          placeholder="0 */1 * * *"
                                                      />
                                                      <p
                                                          class="text-xs text-gray-500 mt-1"
                                                      >
                                                          Examples: "0 */1 * * *"
                                                          (hourly), "0 9 * * 1"
                                                          (Mondays 9 AM)
                                                      </p>
                                                  </div>
                                              </div>

                                              <!-- Resource Limits Option -->
                                              <div class="flex items-center mb-3">
                                                  <input
                                                      type="checkbox"
                                                      id="swarm-resources-checkbox"
                                                      class="mr-2"
                                                  />
                                                  <label
                                                      class="text-sm text-gray-700"
                                                      >Set resource limits</label
                                                  >
                                              </div>
                                              <div
                                                  id="swarm-resource-options"
                                                  class="hidden mb-3 ml-6 space-y-2"
                                              >
                                                  <div
                                                      class="grid grid-cols-2 gap-2"
                                                  >
                                                      <div>
                                                          <label
                                                              class="block text-sm text-gray-600 mb-1"
                                                              >Memory</label
                                                          >
                                                          <input
                                                              type="text"
                                                              id="swarm-memory-input"
                                                              class="w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                                                              placeholder="512m"
                                                          />
                                                      </div>
                                                      <div>
                                                          <label
                                                              class="block text-sm text-gray-600 mb-1"
                                                              >CPU</label
                                                          >
                                                          <input
                                                              type="text"
                                                              id="swarm-cpus-input"
                                                              class="w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                                                              placeholder="1"
                                                          />
                                                      </div>
                                                  </div>
                                              </div>

                                              <!-- Timeout Option -->
                                              <div>
                                                  <label
                                                      class="block text-sm text-gray-600 mb-1"
                                                      >Timeout (minutes)</label
                                                  >
                                                  <input
                                                      type="number"
                                                      id="swarm-timeout-input"
                                                      class="w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                                                      placeholder="30"
                                                      min="1"
                                                      max="1440"
                                                  />
                                                  <p
                                                      class="text-xs text-gray-500 mt-1"
                                                  >
                                                      Maximum execution time
                                                      (default: 30 minutes)
                                                  </p>
                                              </div>
                                          </div>

                                          <button
                                              id="quick-swarm-btn"
                                              class="w-full bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-700"
                                          >
                                              <i class="fas fa-magic mr-2"></i
                                              >Create Quick Swarm
                                          </button>
                                      </div>
                                  </div>
                              </div>

                              <!-- Agent Status Overview -->
                              <div class="bg-white shadow rounded-lg p-6">
                                  <h4
                                      class="text-md font-medium text-gray-900 mb-4"
                                  >
                                      <i
                                          class="fas fa-users mr-2 text-purple-600"
                                      ></i
                                      >Agent Secret Status
                                  </h4>
                                  <div
                                      id="agent-secret-status"
                                      class="overflow-x-auto"
                                  >
                                      <!-- Table populated by JavaScript -->
                                  </div>
                              </div>
                          </div>

                          <!-- Deleted Tasks Tab -->
                          <div id="deleted-tab" class="tab-content hidden">
                              <div class="flex justify-between items-center mb-6">
                                  <h3 class="text-lg font-medium text-gray-900">
                                      Deleted Tasks
                                  </h3>
                                  <div class="flex items-center space-x-4">
                                      <span
                                          id="deleted-count"
                                          class="text-sm text-gray-500"
                                          >0 deleted tasks</span
                                      >
                                      <button
                                          id="refresh-deleted-btn"
                                          class="text-gray-500 hover:text-gray-700"
                                      >
                                          <i class="fas fa-sync-alt"></i>
                                      </button>
                                  </div>
                              </div>

                              <!-- Deleted Tasks Table -->
                              <div
                                  class="bg-white shadow overflow-hidden rounded-md"
                              >
                                  <div
                                      id="deleted-tasks-table-container"
                                      class="overflow-x-auto"
                                  >
                                      <!-- Table will be populated by JavaScript -->
                                  </div>
                              </div>
                          </div>

                          <!-- Logs Tab -->
                          <div id="logs-tab" class="tab-content hidden">
                              <div class="flex justify-between items-center mb-6">
                                  <h3 class="text-lg font-medium text-gray-900">
                                      System Logs
                                  </h3>
                                  <div class="flex items-center space-x-4">
                                      <select
                                          id="log-task-filter"
                                          class="border border-gray-300 rounded-md px-3 py-2 text-sm"
                                      >
                                          <option value="">All Tasks</option>
                                          <!-- Populated by JavaScript -->
                                      </select>
                                      <button
                                          id="follow-logs-btn"
                                          class="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-700"
                                      >
                                          <i class="fas fa-play mr-2"></i>Follow
                                          Logs
                                      </button>
                                  </div>
                              </div>

                              <!-- Logs Container -->
                              <div
                                  class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm h-96 overflow-y-auto custom-scrollbar"
                              >
                                  <div id="logs-content">
                                      <div class="text-gray-500">
                                          Select a task to view logs...
                                      </div>
                                  </div>
                              </div>
                          </div>

                          <!-- Pruning Tab -->
                          <div id="pruning-tab" class="tab-content hidden">
                              <div class="flex justify-between items-center mb-6">
                                  <h3 class="text-lg font-medium text-gray-900">
                                      Data Pruning
                                  </h3>
                                  <button
                                      id="refresh-pruning-btn"
                                      class="text-gray-500 hover:text-gray-700"
                                  >
                                      <i class="fas fa-sync-alt"></i>
                                  </button>
                              </div>

                              <!-- Pruning Statistics -->
                              <div
                                  class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6"
                              >
                                  <div
                                      class="bg-white overflow-hidden shadow rounded-lg"
                                  >
                                      <div class="p-5">
                                          <div class="flex items-center">
                                              <div class="flex-shrink-0">
                                                  <i
                                                      class="fas fa-tasks text-gray-400 text-2xl"
                                                  ></i>
                                              </div>
                                              <div class="ml-5 w-0 flex-1">
                                                  <dl>
                                                      <dt
                                                          class="text-sm font-medium text-gray-500 truncate"
                                                      >
                                                          Eligible Tasks
                                                      </dt>
                                                      <dd
                                                          id="pruning-tasks"
                                                          class="text-lg font-medium text-gray-900"
                                                      >
                                                          -
                                                      </dd>
                                                  </dl>
                                              </div>
                                          </div>
                                      </div>
                                  </div>

                                  <div
                                      class="bg-white overflow-hidden shadow rounded-lg"
                                  >
                                      <div class="p-5">
                                          <div class="flex items-center">
                                              <div class="flex-shrink-0">
                                                  <i
                                                      class="fas fa-robot text-gray-400 text-2xl"
                                                  ></i>
                                              </div>
                                              <div class="ml-5 w-0 flex-1">
                                                  <dl>
                                                      <dt
                                                          class="text-sm font-medium text-gray-500 truncate"
                                                      >
                                                          Eligible Agents
                                                      </dt>
                                                      <dd
                                                          id="pruning-agents"
                                                          class="text-lg font-medium text-gray-900"
                                                      >
                                                          -
                                                      </dd>
                                                  </dl>
                                              </div>
                                          </div>
                                      </div>
                                  </div>

                                  <div
                                      class="bg-white overflow-hidden shadow rounded-lg"
                                  >
                                      <div class="p-5">
                                          <div class="flex items-center">
                                              <div class="flex-shrink-0">
                                                  <i
                                                      class="fas fa-file-alt text-gray-400 text-2xl"
                                                  ></i>
                                              </div>
                                              <div class="ml-5 w-0 flex-1">
                                                  <dl>
                                                      <dt
                                                          class="text-sm font-medium text-gray-500 truncate"
                                                      >
                                                          Eligible Logs
                                                      </dt>
                                                      <dd
                                                          id="pruning-logs"
                                                          class="text-lg font-medium text-gray-900"
                                                      >
                                                          -
                                                      </dd>
                                                  </dl>
                                              </div>
                                          </div>
                                      </div>
                                  </div>

                                  <div
                                      class="bg-white overflow-hidden shadow rounded-lg"
                                  >
                                      <div class="p-5">
                                          <div class="flex items-center">
                                              <div class="flex-shrink-0">
                                                  <i
                                                      class="fas fa-hdd text-gray-400 text-2xl"
                                                  ></i>
                                              </div>
                                              <div class="ml-5 w-0 flex-1">
                                                  <dl>
                                                      <dt
                                                          class="text-sm font-medium text-gray-500 truncate"
                                                      >
                                                          Space to Free
                                                      </dt>
                                                      <dd
                                                          id="pruning-space"
                                                          class="text-lg font-medium text-gray-900"
                                                      >
                                                          -
                                                      </dd>
                                                  </dl>
                                              </div>
                                          </div>
                                      </div>
                                  </div>
                              </div>

                              <!-- Pruning Actions -->
                              <div class="bg-white shadow rounded-lg p-6">
                                  <h4
                                      class="text-lg font-medium text-gray-900 mb-4"
                                  >
                                      Pruning Actions
                                  </h4>
                                  <div class="space-y-4">
                                      <div
                                          class="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
                                      >
                                          <div>
                                              <h5
                                                  class="font-medium text-gray-900"
                                              >
                                                  Dry Run
                                              </h5>
                                              <p class="text-sm text-gray-500">
                                                  Preview what would be deleted
                                                  without actually removing
                                                  anything
                                              </p>
                                          </div>
                                          <button
                                              id="dry-run-btn"
                                              class="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
                                          >
                                              <i class="fas fa-eye mr-2"></i
                                              >Preview
                                          </button>
                                      </div>

                                      <div
                                          class="flex items-center justify-between p-4 border border-red-200 rounded-lg bg-red-50"
                                      >
                                          <div>
                                              <h5
                                                  class="font-medium text-red-900"
                                              >
                                                  Run Pruning
                                              </h5>
                                              <p class="text-sm text-red-700">
                                                  Permanently delete old data.
                                                  This action cannot be undone!
                                              </p>
                                          </div>
                                          <button
                                              id="run-pruning-btn"
                                              class="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700"
                                          >
                                              <i class="fas fa-broom mr-2"></i>Run
                                              Pruning
                                          </button>
                                      </div>
                                  </div>

                                  <!-- Pruning Results -->
                                  <div id="pruning-results" class="mt-6 hidden">
                                      <h5 class="font-medium text-gray-900 mb-2">
                                          Last Pruning Results
                                      </h5>
                                      <div
                                          id="pruning-results-content"
                                          class="bg-gray-50 p-4 rounded-lg text-sm font-mono"
                                      >
                                          <!-- Results will be populated here -->
                                      </div>
                                  </div>
                              </div>
                          </div>

                          <!-- Secrets Tab -->
                          <div id="secrets-tab" class="tab-content hidden">
                              <div class="flex justify-between items-center mb-6">
                                  <div class="flex items-center space-x-4">
                                      <h3
                                          class="text-lg font-medium text-gray-900"
                                      >
                                          Secrets Management
                                      </h3>
                                      <select
                                          id="secrets-tag-filter"
                                          class="border border-gray-300 rounded-md px-3 py-2 text-sm"
                                      >
                                          <option value="">All Tags</option>
                                          <!-- Populated by JavaScript -->
                                      </select>
                                  </div>
                                  <div class="flex items-center space-x-4">
                                      <button
                                          id="new-secret-btn"
                                          class="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
                                      >
                                          <i class="fas fa-plus mr-2"></i>New
                                          Secret
                                      </button>
                                      <button
                                          id="refresh-secrets-btn"
                                          class="text-gray-500 hover:text-gray-700"
                                      >
                                          <i class="fas fa-sync-alt"></i>
                                      </button>
                                  </div>
                              </div>

                              <!-- Secrets Grid -->
                              <div
                                  class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                                  id="secrets-grid"
                              >
                                  <!-- Secret cards will be populated by JavaScript -->
                              </div>

                              <!-- Secrets Pagination -->
                              <div
                                  id="secrets-pagination"
                                  class="mt-6 flex justify-center"
                              >
                                  <!-- Pagination controls will be populated by JavaScript -->
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          </div>

          <!-- Modals -->

          <!-- New Task Modal -->
          <div
              id="new-task-modal"
              class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden z-50"
          >
              <div class="flex items-center justify-center min-h-screen py-4">
                  <div
                      class="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 max-h-screen overflow-y-auto"
                  >
                      <div class="px-6 py-4 border-b border-gray-200">
                          <h3 class="text-lg font-medium text-gray-900">
                              Create New Task
                          </h3>
                      </div>
                      <form id="new-task-form" class="p-6 space-y-4">
                          <div>
                              <label
                                  class="block text-sm font-medium text-gray-700 mb-1"
                                  >Agent</label
                              >
                              <select
                                  id="task-agent-select"
                                  class="w-full border border-gray-300 rounded-md px-3 py-2"
                                  required
                              >
                                  <option value="">Select an agent</option>
                              </select>
                          </div>
                          <div>
                              <label
                                  class="block text-sm font-medium text-gray-700 mb-1"
                                  >Task Name</label
                              >
                              <input
                                  type="text"
                                  id="task-name-input"
                                  class="w-full border border-gray-300 rounded-md px-3 py-2"
                                  required
                              />
                          </div>
                          <div>
                              <label
                                  class="block text-sm font-medium text-gray-700 mb-1"
                                  >Configuration</label
                              >
                              <div class="space-y-3">
                                  <!-- Config Input Type Selection -->
                                  <div class="flex items-center space-x-4">
                                      <label class="flex items-center">
                                          <input
                                              type="radio"
                                              name="config-type"
                                              value="upload"
                                              class="mr-2"
                                              checked
                                          />
                                          <span class="text-sm">Upload File</span>
                                      </label>
                                      <label class="flex items-center">
                                          <input
                                              type="radio"
                                              name="config-type"
                                              value="paste"
                                              class="mr-2"
                                          />
                                          <span class="text-sm"
                                              >Paste Content</span
                                          >
                                      </label>
                                  </div>

                                  <!-- File Upload Input -->
                                  <div
                                      id="config-file-upload"
                                      class="config-input-section"
                                  >
                                      <div
                                          class="border-2 border-dashed border-gray-300 rounded-lg p-4"
                                      >
                                          <input
                                              type="file"
                                              id="config-file-input"
                                              accept=".json,.yml,.yaml"
                                              class="hidden"
                                          />
                                          <div class="text-center">
                                              <i
                                                  class="fas fa-cloud-upload-alt text-gray-400 text-3xl mb-2"
                                              ></i>
                                              <p
                                                  class="text-sm text-gray-600 mb-2"
                                              >
                                                  <button
                                                      type="button"
                                                      id="config-upload-btn"
                                                      class="text-blue-600 hover:text-blue-500 font-medium"
                                                  >
                                                      Click to upload
                                                  </button>
                                                  or drag and drop
                                              </p>
                                              <p class="text-xs text-gray-500">
                                                  JSON or YAML files only
                                              </p>
                                          </div>
                                          <div
                                              id="uploaded-file-info"
                                              class="hidden mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700"
                                          >
                                              <i
                                                  class="fas fa-check-circle mr-1"
                                              ></i>
                                              <span
                                                  id="uploaded-file-name"
                                              ></span>
                                          </div>
                                      </div>
                                  </div>

                                  <!-- Paste Content Input -->
                                  <div
                                      id="config-paste-content"
                                      class="config-input-section hidden"
                                  >
                                      <div
                                          class="flex items-center mb-2 space-x-4"
                                      >
                                          <label class="flex items-center">
                                              <input
                                                  type="radio"
                                                  name="paste-format"
                                                  value="json"
                                                  class="mr-1"
                                                  checked
                                              />
                                              <span class="text-sm">JSON</span>
                                          </label>
                                          <label class="flex items-center">
                                              <input
                                                  type="radio"
                                                  name="paste-format"
                                                  value="yaml"
                                                  class="mr-1"
                                              />
                                              <span class="text-sm">YAML</span>
                                          </label>
                                          <button
                                              type="button"
                                              id="validate-config-btn"
                                              class="ml-auto text-blue-600 hover:text-blue-500 text-sm font-medium"
                                          >
                                              <i class="fas fa-check mr-1"></i
                                              >Validate
                                          </button>
                                      </div>
                                      <textarea
                                          id="config-content-input"
                                          class="w-full border border-gray-300 rounded-md px-3 py-2 font-mono text-sm"
                                          rows="8"
                                          placeholder="Paste your JSON or YAML configuration here..."
                                      ></textarea>
                                      <div
                                          id="config-validation-result"
                                          class="hidden mt-2 p-2 rounded text-sm"
                                      >
                                          <!-- Validation results will appear here -->
                                      </div>
                                  </div>
                              </div>
                          </div>
                          <div>
                              <label
                                  class="block text-sm font-medium text-gray-700 mb-1"
                                  >Description (optional)</label
                              >
                              <textarea
                                  id="task-description-input"
                                  class="w-full border border-gray-300 rounded-md px-3 py-2 h-20"
                              ></textarea>
                          </div>
                          <div class="flex items-center">
                              <input
                                  type="checkbox"
                                  id="task-schedule-checkbox"
                                  class="mr-2"
                              />
                              <label class="text-sm font-medium text-gray-700"
                                  >Schedule this task</label
                              >
                          </div>
                          <div id="schedule-options" class="space-y-3 hidden">
                              <div>
                                  <label
                                      class="block text-sm font-medium text-gray-700 mb-1"
                                      >Cron Expression</label
                                  >
                                  <input
                                      type="text"
                                      id="task-cron-input"
                                      class="w-full border border-gray-300 rounded-md px-3 py-2"
                                      placeholder="0 */1 * * *"
                                  />
                                  <p class="text-xs text-gray-500 mt-1">
                                      Examples: "0 */1 * * *" (every hour), "0 9 *
                                      * 1" (every Monday at 9 AM)
                                  </p>
                              </div>
                              <div>
                                  <label
                                      class="block text-sm font-medium text-gray-700 mb-1"
                                      >Max Runs (optional)</label
                                  >
                                  <input
                                      type="number"
                                      id="task-maxruns-input"
                                      class="w-full border border-gray-300 rounded-md px-3 py-2"
                                      min="1"
                                  />
                              </div>
                          </div>
                          <div class="flex items-center">
                              <input
                                  type="checkbox"
                                  id="task-resources-checkbox"
                                  class="mr-2"
                              />
                              <label class="text-sm font-medium text-gray-700"
                                  >Set custom resource limits</label
                              >
                          </div>
                          <div id="resource-options" class="space-y-3 hidden">
                              <div>
                                  <label
                                      class="block text-sm font-medium text-gray-700 mb-1"
                                      >Memory Limit</label
                                  >
                                  <input
                                      type="text"
                                      id="task-memory-input"
                                      class="w-full border border-gray-300 rounded-md px-3 py-2"
                                      placeholder="512m"
                                  />
                                  <p class="text-xs text-gray-500 mt-1">
                                      Examples: "256m", "1g", "2048m" (default:
                                      512m)
                                  </p>
                              </div>
                              <div>
                                  <label
                                      class="block text-sm font-medium text-gray-700 mb-1"
                                      >CPU Limit</label
                                  >
                                  <input
                                      type="text"
                                      id="task-cpus-input"
                                      class="w-full border border-gray-300 rounded-md px-3 py-2"
                                      placeholder="1"
                                  />
                                  <p class="text-xs text-gray-500 mt-1">
                                      Examples: "0.5", "1", "2" (default: 1)
                                  </p>
                              </div>
                          </div>
                          <div>
                              <label
                                  class="block text-sm font-medium text-gray-700 mb-1"
                                  >Timeout (minutes)</label
                              >
                              <input
                                  type="number"
                                  id="task-timeout-input"
                                  class="w-full border border-gray-300 rounded-md px-3 py-2"
                                  placeholder="30"
                                  min="1"
                                  max="1440"
                              />
                              <p class="text-xs text-gray-500 mt-1">
                                  Maximum execution time in minutes (default: 30
                                  minutes, max: 24 hours)
                              </p>
                          </div>
                      </form>
                      <div
                          class="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3"
                      >
                          <button
                              id="cancel-task-btn"
                              class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                          >
                              Cancel
                          </button>
                          <button
                              id="create-task-btn"
                              class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                          >
                              Create Task
                          </button>
                      </div>
                  </div>
              </div>
          </div>

          <!-- New Agent Modal -->
          <div
              id="new-agent-modal"
              class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden z-50"
          >
              <div class="flex items-center justify-center min-h-screen">
                  <div class="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
                      <div class="px-6 py-4 border-b border-gray-200">
                          <h3 class="text-lg font-medium text-gray-900">
                              Create New Agent
                          </h3>
                      </div>
                      <form id="new-agent-form" class="p-6 space-y-4">
                          <div>
                              <label
                                  class="block text-sm font-medium text-gray-700 mb-1"
                                  >Agent Name</label
                              >
                              <input
                                  type="text"
                                  id="agent-name-input"
                                  class="w-full border border-gray-300 rounded-md px-3 py-2"
                                  required
                              />
                          </div>
                          <div>
                              <label
                                  class="block text-sm font-medium text-gray-700 mb-1"
                                  >Description (optional)</label
                              >
                              <textarea
                                  id="agent-description-input"
                                  class="w-full border border-gray-300 rounded-md px-3 py-2 h-20"
                              ></textarea>
                          </div>
                      </form>
                      <div
                          class="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3"
                      >
                          <button
                              id="cancel-agent-btn"
                              class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                          >
                              Cancel
                          </button>
                          <button
                              id="create-agent-btn"
                              class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                          >
                              Create Agent
                          </button>
                      </div>
                  </div>
              </div>
          </div>

          <!-- Edit Agent Modal -->
          <div
              id="edit-agent-modal"
              class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden z-50"
          >
              <div class="flex items-center justify-center min-h-screen">
                  <div class="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
                      <div class="px-6 py-4 border-b border-gray-200">
                          <h3 class="text-lg font-medium text-gray-900">
                              Edit Agent
                          </h3>
                      </div>
                      <form id="edit-agent-form" class="p-6 space-y-4">
                          <input type="hidden" id="edit-agent-id" />

                          <div>
                              <label
                                  class="block text-sm font-medium text-gray-700 mb-1"
                                  >Agent Name</label
                              >
                              <input
                                  type="text"
                                  id="edit-agent-name"
                                  class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  required
                              />
                          </div>

                          <div>
                              <label
                                  class="block text-sm font-medium text-gray-700 mb-1"
                                  >Description (optional)</label
                              >
                              <textarea
                                  id="edit-agent-description"
                                  class="w-full border border-gray-300 rounded-md px-3 py-2 h-20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              ></textarea>
                          </div>
                      </form>
                      <div
                          class="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3"
                      >
                          <button
                              id="cancel-edit-agent-btn"
                              class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                          >
                              Cancel
                          </button>
                          <button
                              id="save-edit-agent-btn"
                              class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                          >
                              Save Changes
                          </button>
                      </div>
                  </div>
              </div>
          </div>

          <!-- Task Details Modal -->
          <div
              id="task-details-modal"
              class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden z-50"
          >
              <div class="flex items-center justify-center min-h-screen">
                  <div
                      class="bg-white rounded-lg shadow-lg max-w-4xl w-full mx-4 max-h-screen overflow-y-auto"
                  >
                      <div class="px-6 py-4 border-b border-gray-200">
                          <h3
                              id="task-details-title"
                              class="text-lg font-medium text-gray-900"
                          >
                              Task Details
                          </h3>
                      </div>
                      <div id="task-details-content" class="p-6">
                          <!-- Task details will be populated by JavaScript -->
                      </div>
                      <div
                          class="px-6 py-4 border-t border-gray-200 flex justify-end"
                      >
                          <button
                              id="close-task-details-btn"
                              class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                          >
                              Close
                          </button>
                      </div>
                  </div>
              </div>
          </div>

          <!-- New Secret Modal -->
          <div
              id="new-secret-modal"
              class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden z-50"
          >
              <div class="flex items-center justify-center min-h-screen py-4">
                  <div
                      class="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 max-h-screen overflow-y-auto"
                  >
                      <div class="px-6 py-4 border-b border-gray-200">
                          <h3 class="text-lg font-medium text-gray-900">
                              Create New Secret
                          </h3>
                      </div>
                      <form id="new-secret-form" class="p-6 space-y-4">
                          <div>
                              <label
                                  class="block text-sm font-medium text-gray-700 mb-1"
                                  >Secret Name</label
                              >
                              <input
                                  type="text"
                                  id="secret-name-input"
                                  class="w-full border border-gray-300 rounded-md px-3 py-2"
                                  placeholder="API_KEY"
                                  required
                              />
                              <p class="text-xs text-gray-500 mt-1">
                                  Use this name to reference the secret as
                                  \${SECRET.API_KEY}
                              </p>
                          </div>
                          <div>
                              <label
                                  class="block text-sm font-medium text-gray-700 mb-1"
                                  >Secret Value</label
                              >
                              <div class="relative">
                                  <textarea
                                      id="secret-value-input"
                                      rows="3"
                                      class="w-full border border-gray-300 rounded-md px-3 py-2 font-mono text-sm break-all"
                                      placeholder="Enter secret value"
                                      required
                                  ></textarea>
                                  <p class="text-xs text-gray-500 mt-1">
                                      The secret value will be encrypted when
                                      saved
                                  </p>
                              </div>
                          </div>
                          <div>
                              <label
                                  class="block text-sm font-medium text-gray-700 mb-1"
                                  >Description (optional)</label
                              >
                              <textarea
                                  id="secret-description-input"
                                  class="w-full border border-gray-300 rounded-md px-3 py-2 h-20"
                                  placeholder="What this secret is for..."
                              ></textarea>
                          </div>
                          <div>
                              <label
                                  class="block text-sm font-medium text-gray-700 mb-1"
                                  >Tags (optional)</label
                              >
                              <input
                                  type="text"
                                  id="secret-tags-input"
                                  class="w-full border border-gray-300 rounded-md px-3 py-2"
                                  placeholder="api, production, external"
                              />
                              <p class="text-xs text-gray-500 mt-1">
                                  Comma-separated tags for organization
                              </p>
                          </div>
                      </form>
                      <div
                          class="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3"
                      >
                          <button
                              id="cancel-secret-btn"
                              class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                          >
                              Cancel
                          </button>
                          <button
                              id="create-secret-btn"
                              class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                          >
                              Create Secret
                          </button>
                      </div>
                  </div>
              </div>
          </div>

          <!-- Secret Details Modal -->
          <div
              id="secret-details-modal"
              class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden z-50"
          >
              <div class="flex items-center justify-center min-h-screen py-4">
                  <div
                      class="bg-white rounded-lg shadow-lg max-w-2xl w-full mx-4 max-h-screen overflow-y-auto"
                  >
                      <div class="px-6 py-4 border-b border-gray-200">
                          <h3
                              id="secret-details-title"
                              class="text-lg font-medium text-gray-900"
                          >
                              Secret Details
                          </h3>
                      </div>
                      <div id="secret-details-content" class="p-6">
                          <!-- Secret details will be populated by JavaScript -->
                      </div>
                      <div
                          class="px-6 py-4 border-t border-gray-200 flex justify-between"
                      >
                          <div class="flex space-x-2">
                              <button
                                  id="edit-secret-btn"
                                  class="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200"
                              >
                                  Edit
                              </button>
                              <button
                                  id="delete-secret-btn"
                                  class="px-4 py-2 text-sm font-medium text-red-700 bg-red-100 rounded-md hover:bg-red-200"
                              >
                                  Delete
                              </button>
                          </div>
                          <button
                              id="close-secret-details-btn"
                              class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                          >
                              Close
                          </button>
                      </div>
                  </div>
              </div>
          </div>

          <!-- Edit Secret Modal -->
          <div
              id="edit-secret-modal"
              class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden z-50"
          >
              <div class="flex items-center justify-center min-h-screen py-4">
                  <div class="bg-white rounded-lg shadow-lg max-w-lg w-full mx-4">
                      <div class="px-6 py-4 border-b border-gray-200">
                          <h3 class="text-lg font-medium text-gray-900">
                              Edit Secret
                          </h3>
                      </div>
                      <form id="edit-secret-form" class="p-6 space-y-4">
                          <input type="hidden" id="edit-secret-id" />

                          <div>
                              <label
                                  for="edit-secret-name"
                                  class="block text-sm font-medium text-gray-700 mb-1"
                                  >Name</label
                              >
                              <input
                                  type="text"
                                  id="edit-secret-name"
                                  class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  required
                              />
                          </div>

                          <div>
                              <label
                                  for="edit-secret-description"
                                  class="block text-sm font-medium text-gray-700 mb-1"
                                  >Description</label
                              >
                              <textarea
                                  id="edit-secret-description"
                                  rows="3"
                                  class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder="Optional description"
                              ></textarea>
                          </div>

                          <div>
                              <label
                                  for="edit-secret-value"
                                  class="block text-sm font-medium text-gray-700 mb-1"
                                  >Value</label
                              >
                              <textarea
                                  id="edit-secret-value"
                                  rows="4"
                                  class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm break-all"
                                  placeholder="Secret value"
                                  required
                              ></textarea>
                              <p class="text-xs text-gray-500 mt-1">
                                  The secret value will be encrypted when saved
                              </p>
                          </div>

                          <div>
                              <label
                                  for="edit-secret-tags"
                                  class="block text-sm font-medium text-gray-700 mb-1"
                                  >Tags</label
                              >
                              <input
                                  type="text"
                                  id="edit-secret-tags"
                                  class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder="tag1, tag2, tag3"
                              />
                              <p class="text-xs text-gray-500 mt-1">
                                  Separate tags with commas
                              </p>
                          </div>
                      </form>
                      <div
                          class="px-6 py-4 border-t border-gray-200 flex justify-end space-x-2"
                      >
                          <button
                              id="cancel-edit-secret-btn"
                              class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                          >
                              Cancel
                          </button>
                          <button
                              id="save-edit-secret-btn"
                              class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                          >
                              Save Changes
                          </button>
                      </div>
                  </div>
              </div>
          </div>

          <!-- Edit Task Modal -->
          <div
              id="edit-task-modal"
              class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden z-50"
          >
              <div class="flex items-center justify-center min-h-screen py-4">
                  <div
                      class="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 max-h-screen overflow-y-auto"
                  >
                      <div class="px-6 py-4 border-b border-gray-200">
                          <h3 class="text-lg font-medium text-gray-900">
                              Edit Task
                          </h3>
                      </div>
                      <form id="edit-task-form" class="px-6 py-4 space-y-4">
                          <input type="hidden" id="edit-task-id" />

                          <div>
                              <label
                                  class="block text-sm font-medium text-gray-700 mb-1"
                                  >Task Name</label
                              >
                              <input
                                  type="text"
                                  id="edit-task-name"
                                  class="w-full border border-gray-300 rounded-md px-3 py-2"
                                  required
                              />
                          </div>

                          <div>
                              <label
                                  class="block text-sm font-medium text-gray-700 mb-1"
                                  >Description</label
                              >
                              <textarea
                                  id="edit-task-description"
                                  class="w-full border border-gray-300 rounded-md px-3 py-2"
                                  rows="3"
                              ></textarea>
                          </div>

                          <div>
                              <label
                                  class="block text-sm font-medium text-gray-700 mb-1"
                                  >Agent</label
                              >
                              <select
                                  id="edit-task-agent"
                                  class="w-full border border-gray-300 rounded-md px-3 py-2"
                                  required
                              >
                                  <option value="">Select an agent...</option>
                              </select>
                          </div>

                          <div>
                              <label
                                  class="block text-sm font-medium text-gray-700 mb-1"
                                  >Config Content</label
                              >
                              <textarea
                                  id="edit-task-config"
                                  class="w-full border border-gray-300 rounded-md px-3 py-2 font-mono text-sm"
                                  rows="10"
                                  placeholder="Paste your YAML or JSON configuration here..."
                                  required
                              ></textarea>
                          </div>

                          <div>
                              <div class="flex items-center">
                                  <input
                                      type="checkbox"
                                      id="edit-task-schedule-enabled"
                                      class="mr-2"
                                  />
                                  <label class="text-sm font-medium text-gray-700"
                                      >Enable Scheduling</label
                                  >
                              </div>
                              <div
                                  id="edit-schedule-options"
                                  class="mt-2 space-y-2 hidden"
                              >
                                  <input
                                      type="text"
                                      id="edit-task-cron"
                                      class="w-full border border-gray-300 rounded-md px-3 py-2"
                                      placeholder="0 */6 * * *"
                                  />
                                  <p class="text-xs text-gray-500">
                                      Cron expression for scheduling
                                  </p>
                              </div>
                          </div>

                          <div>
                              <label
                                  class="block text-sm font-medium text-gray-700 mb-1"
                                  >Timeout (minutes)</label
                              >
                              <input
                                  type="number"
                                  id="edit-task-timeout"
                                  class="w-full border border-gray-300 rounded-md px-3 py-2"
                                  min="1"
                                  max="60"
                                  value="30"
                              />
                          </div>
                      </form>
                      <div
                          class="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3"
                      >
                          <button
                              type="button"
                              onclick="app.hideModal('edit-task-modal')"
                              class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                          >
                              Cancel
                          </button>
                          <button
                              type="button"
                              onclick="app.updateTask()"
                              class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                          >
                              Update Task
                          </button>
                      </div>
                  </div>
              </div>
          </div>

          <!-- JavaScript -->
          <script src="/static/js/app.js"></script>
      </body>
  </html>
`;
