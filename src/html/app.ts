export const APP = `
  // Botnet Orchestrator Web UI Application
  class OrchestratorApp {
      constructor() {
          this.currentTab = 'tasks';
          this.tasks = [];
          this.agents = [];
          this.deletedTasks = [];
          this.statistics = {};
          this.currentPage = 1;
          this.tasksPerPage = 10;
          this.currentFilters = {
              status: '',
              agent: ''
          };
          this.charts = {};
          this.websocket = null;
          this.followingLogs = false;
          this.secrets = [];
          this.secretTags = [];
          this.currentSecretPage = 1;
          this.currentSecretTagFilter = '';

          this.init();
      }

      async init() {
          this.setupEventListeners();
          this.setupWebSocket();
          await this.loadInitialData();
          this.startPeriodicRefresh();
      }

      setupEventListeners() {
          // Tab navigation
          document.querySelectorAll('.tab-btn').forEach(btn => {
              btn.addEventListener('click', (e) => {
                  this.switchTab(e.target.dataset.tab);
              });
          });

          // Refresh button
          document.getElementById('refresh-btn').addEventListener('click', () => {
              this.loadInitialData();
          });

          // Task filters
          document.getElementById('status-filter').addEventListener('change', (e) => {
              this.currentFilters.status = e.target.value;
              this.currentPage = 1;
              this.loadTasks();
          });

          document.getElementById('agent-filter').addEventListener('change', (e) => {
              this.currentFilters.agent = e.target.value;
              this.currentPage = 1;
              this.loadTasks();
          });

          // Modal controls
          document.getElementById('new-task-btn').addEventListener('click', () => {
              this.showNewTaskModal();
          });

          document.getElementById('new-agent-btn').addEventListener('click', () => {
              this.showNewAgentModal();
          });

          document.getElementById('cancel-task-btn').addEventListener('click', () => {
              this.hideModal('new-task-modal');
          });

          document.getElementById('cancel-agent-btn').addEventListener('click', () => {
              this.hideModal('new-agent-modal');
          });

          // Edit agent modal controls
          document.getElementById('cancel-edit-agent-btn').addEventListener('click', () => {
              this.hideModal('edit-agent-modal');
          });

          document.getElementById('save-edit-agent-btn').addEventListener('click', () => {
              this.saveEditAgent();
          });

          document.getElementById('close-task-details-btn').addEventListener('click', () => {
              this.hideModal('task-details-modal');
          });

          // Form submissions
          document.getElementById('create-task-btn').addEventListener('click', () => {
              this.createTask();
          });

          document.getElementById('create-agent-btn').addEventListener('click', () => {
              this.createAgent();
          });

          // Schedule checkbox
          document.getElementById('task-schedule-checkbox').addEventListener('change', (e) => {
              const scheduleOptions = document.getElementById('schedule-options');
              if (e.target.checked) {
                  scheduleOptions.classList.remove('hidden');
              } else {
                  scheduleOptions.classList.add('hidden');
              }
          });

          // Resource checkbox
          document.getElementById('task-resources-checkbox').addEventListener('change', (e) => {
              const resourceOptions = document.getElementById('resource-options');
              if (e.target.checked) {
                  resourceOptions.classList.remove('hidden');
              } else {
                  resourceOptions.classList.add('hidden');
              }
          });

          // Log controls
          document.getElementById('log-task-filter').addEventListener('change', (e) => {
              if (e.target.value) {
                  this.loadTaskLogs(e.target.value);
              } else {
                  document.getElementById('logs-content').innerHTML = '<div class="text-gray-500">Select a task to view logs...</div>';
              }
          });

          document.getElementById('follow-logs-btn').addEventListener('click', () => {
              this.toggleFollowLogs();
          });

          // Deleted tasks controls
          document.getElementById('refresh-deleted-btn').addEventListener('click', () => {
              this.loadDeletedTasks();
          });

          // Next scheduled refresh button
          document.getElementById('refresh-scheduled-btn').addEventListener('click', () => {
              this.loadNextScheduled();
          });

          // Pruning controls
          document.getElementById('refresh-pruning-btn').addEventListener('click', () => {
              this.loadPruningStats();
          });

          document.getElementById('dry-run-btn').addEventListener('click', () => {
              this.runPruning(true);
          });

          document.getElementById('run-pruning-btn').addEventListener('click', () => {
              if (confirm('Are you sure you want to permanently delete old data? This action cannot be undone!')) {
                  this.runPruning(false);
              }
          });

          // Config upload controls
          this.setupConfigUploadListeners();

          // Secrets management controls
          this.setupSecretsListeners();
      }

      setupConfigUploadListeners() {
          // Config type radio buttons
          document.querySelectorAll('input[name="config-type"]').forEach(radio => {
              radio.addEventListener('change', (e) => {
                  this.switchConfigInputType(e.target.value);
              });
          });

          // File upload button
          document.getElementById('config-upload-btn').addEventListener('click', () => {
              document.getElementById('config-file-input').click();
          });

          // File input change
          document.getElementById('config-file-input').addEventListener('change', (e) => {
              const file = e.target.files[0];
              if (file) {
                  this.handleConfigFileUpload(file);
              }
          });

          // Drag and drop
          const uploadArea = document.querySelector('#config-file-upload .border-dashed');
          uploadArea.addEventListener('dragover', (e) => {
              e.preventDefault();
              uploadArea.classList.add('border-blue-400', 'bg-blue-50');
          });

          uploadArea.addEventListener('dragleave', (e) => {
              e.preventDefault();
              uploadArea.classList.remove('border-blue-400', 'bg-blue-50');
          });

          uploadArea.addEventListener('drop', (e) => {
              e.preventDefault();
              uploadArea.classList.remove('border-blue-400', 'bg-blue-50');

              const files = e.dataTransfer.files;
              if (files.length > 0) {
                  this.handleConfigFileUpload(files[0]);
              }
          });

          // Config validation button
          document.getElementById('validate-config-btn').addEventListener('click', () => {
              this.validateConfigContent();
          });
      }

      switchConfigInputType(type) {
          // Hide all config input sections
          document.querySelectorAll('.config-input-section').forEach(section => {
              section.classList.add('hidden');
          });

          // Show selected section
          document.getElementById(\`config-\${type === 'upload' ? 'file-upload' : 'paste-content'}\`).classList.remove('hidden');

          // Clear previous validation results
          const validationResult = document.getElementById('config-validation-result');
          if (validationResult) {
              validationResult.classList.add('hidden');
          }
      }

      async handleConfigFileUpload(file) {
          const allowedTypes = ['application/json', 'text/yaml', 'application/x-yaml', 'text/yml'];
          const allowedExtensions = ['.json', '.yml', '.yaml'];

          const fileName = file.name.toLowerCase();
          const isValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));

          if (!isValidExtension && !allowedTypes.includes(file.type)) {
              this.showNotification('Please upload a JSON or YAML file', 'error');
              return;
          }

          try {
              const content = await file.text();
              const fileType = fileName.endsWith('.json') ? 'json' : 'yaml';

              // Store the uploaded content
              this.uploadedConfigContent = content;
              this.uploadedConfigType = fileType;

              // Show file info
              const fileInfo = document.getElementById('uploaded-file-info');
              document.getElementById('uploaded-file-name').textContent = file.name;
              fileInfo.classList.remove('hidden');

              // Validate the uploaded content
              await this.validateConfig(content, fileType);

          } catch (error) {
              this.showNotification('Failed to read file: ' + error.message, 'error');
          }
      }

      async validateConfigContent() {
          const content = document.getElementById('config-content-input').value.trim();
          if (!content) {
              this.showNotification('Please enter configuration content', 'error');
              return;
          }

          const format = document.querySelector('input[name="paste-format"]:checked').value;
          await this.validateConfig(content, format);
      }

      async validateConfig(content, type) {
          try {
              const response = await fetch('/api/configs/validate', {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ content, type })
              });

              const result = await response.json();
              const validationResult = document.getElementById('config-validation-result');

              if (result.success) {
                  validationResult.className = 'mt-2 p-2 rounded text-sm bg-green-50 border border-green-200 text-green-700';
                  validationResult.innerHTML = \`
                      <i class="fas fa-check-circle mr-1"></i>
                      Configuration is valid
                      <div class="text-xs mt-1 text-green-600">
                          • \${result.data.nodeCount} nodes (\${result.data.format} format)
                          • \${result.data.hasStart ? 'Has start node' : 'Missing start node'}
                          • \${result.data.hasEnd ? 'Has end node' : 'Missing end node'}
                      </div>
                  \`;
              } else {
                  validationResult.className = 'mt-2 p-2 rounded text-sm bg-red-50 border border-red-200 text-red-700';
                  validationResult.innerHTML = \`
                      <i class="fas fa-exclamation-circle mr-1"></i>
                      \${result.error}
                  \`;
              }

              validationResult.classList.remove('hidden');

          } catch (error) {
              const validationResult = document.getElementById('config-validation-result');
              validationResult.className = 'mt-2 p-2 rounded text-sm bg-red-50 border border-red-200 text-red-700';
              validationResult.innerHTML = \`
                  <i class="fas fa-exclamation-circle mr-1"></i>
                  Validation failed: \${error.message}
              \`;
              validationResult.classList.remove('hidden');
          }
      }

      setupSecretsListeners() {
          // Secrets tab controls
          document.getElementById('new-secret-btn').addEventListener('click', () => {
              this.showNewSecretModal();
          });

          document.getElementById('refresh-secrets-btn').addEventListener('click', () => {
              this.loadSecrets();
          });

          document.getElementById('secrets-tag-filter').addEventListener('change', (e) => {
              this.currentSecretTagFilter = e.target.value;
              this.currentSecretPage = 1;
              this.loadSecrets();
          });

          // Secret modal controls
          document.getElementById('cancel-secret-btn').addEventListener('click', () => {
              this.hideModal('new-secret-modal');
          });

          document.getElementById('create-secret-btn').addEventListener('click', () => {
              this.createSecret();
          });

          document.getElementById('close-secret-details-btn').addEventListener('click', () => {
              this.hideModal('secret-details-modal');
          });

          document.getElementById('edit-secret-btn').addEventListener('click', () => {
              this.editCurrentSecret();
          });

          // Edit secret modal controls
          document.getElementById('cancel-edit-secret-btn').addEventListener('click', () => {
              this.hideModal('edit-secret-modal');
          });

          document.getElementById('save-edit-secret-btn').addEventListener('click', () => {
              this.saveEditSecret();
          });

          document.getElementById('delete-secret-btn').addEventListener('click', () => {
              this.deleteCurrentSecret();
          });

          // Secret visibility toggle removed - now using textarea for better handling of long secrets
      }

      async loadSecrets() {
          try {
              const queryParams = new URLSearchParams({
                  page: this.currentSecretPage.toString(),
                  limit: '12'
              });

              const response = await fetch(\`/api/secrets?\${queryParams}\`);
              const result = await response.json();

              if (result.success) {
                  this.secrets = result.data.secrets;
                  this.renderSecrets();
                  this.renderSecretsPagination(result.data);
              } else {
                  this.showNotification(result.error || 'Failed to load secrets', 'error');
              }
          } catch (error) {
              console.error('Error loading secrets:', error);
              this.showNotification('Failed to load secrets', 'error');
          }
      }

      async loadSecretTags() {
          try {
              const response = await fetch('/api/secrets/tags');
              const result = await response.json();

              if (result.success) {
                  this.secretTags = result.data;
                  this.renderSecretTagFilter();
              }
          } catch (error) {
              console.error('Error loading secret tags:', error);
          }
      }

      renderSecrets() {
          const grid = document.getElementById('secrets-grid');

          if (this.secrets.length === 0) {
              grid.innerHTML = \`
                  <div class="col-span-full text-center py-12">
                      <i class="fas fa-key text-gray-300 text-6xl mb-4"></i>
                      <h3 class="text-lg font-medium text-gray-900 mb-2">No secrets found</h3>
                      <p class="text-gray-500">Create your first secret to get started.</p>
                      <button onclick="app.showNewSecretModal()" class="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">
                          <i class="fas fa-plus mr-2"></i>New Secret
                      </button>
                  </div>
              \`;
              return;
          }

          grid.innerHTML = this.secrets.map(secret => this.renderSecretCard(secret)).join('');
      }

      renderSecretCard(secret) {
          const tagsHtml = secret.tags && secret.tags.length > 0
              ? secret.tags.map(tag => \`<span class="inline-block bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">\${tag}</span>\`).join(' ')
              : '<span class="text-gray-400 text-xs">No tags</span>';

          const lastUsed = secret.lastUsed
              ? \`Last used: \${new Date(secret.lastUsed).toLocaleDateString()}\`
              : 'Never used';

          return \`
              <div class="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer" onclick="app.showSecretDetails('\${secret.id}')">
                  <div class="flex justify-between items-start mb-2">
                      <h4 class="font-medium text-gray-900 truncate">\${secret.name}</h4>
                      <i class="fas fa-key text-blue-500"></i>
                  </div>

                  \${secret.description ? \`<p class="text-sm text-gray-600 mb-3 line-clamp-2">\${secret.description}</p>\` : ''}

                  <div class="mb-3">
                      \${tagsHtml}
                  </div>

                  <div class="flex justify-between items-center text-xs text-gray-500">
                      <span>Created: \${new Date(secret.createdAt).toLocaleDateString()}</span>
                      <span>\${lastUsed}</span>
                  </div>
              </div>
          \`;
      }

      renderSecretsPagination(data) {
          const container = document.getElementById('secrets-pagination');

          if (data.total <= data.limit) {
              container.innerHTML = '';
              return;
          }

          const totalPages = Math.ceil(data.total / data.limit);
          const currentPage = data.page;

          let paginationHtml = '<div class="flex space-x-2">';

          // Previous button
          if (data.hasPrev) {
              paginationHtml += \`<button onclick="app.loadSecretsPage(\${currentPage - 1})" class="px-3 py-2 text-sm border rounded hover:bg-gray-50">Previous</button>\`;
          }

          // Page numbers
          for (let i = 1; i <= totalPages; i++) {
              if (i === currentPage) {
                  paginationHtml += \`<button class="px-3 py-2 text-sm bg-blue-600 text-white rounded">\${i}</button>\`;
              } else {
                  paginationHtml += \`<button onclick="app.loadSecretsPage(\${i})" class="px-3 py-2 text-sm border rounded hover:bg-gray-50">\${i}</button>\`;
              }
          }

          // Next button
          if (data.hasNext) {
              paginationHtml += \`<button onclick="app.loadSecretsPage(\${currentPage + 1})" class="px-3 py-2 text-sm border rounded hover:bg-gray-50">Next</button>\`;
          }

          paginationHtml += '</div>';
          container.innerHTML = paginationHtml;
      }

      loadSecretsPage(page) {
          this.currentSecretPage = page;
          this.loadSecrets();
      }

      renderSecretTagFilter() {
          const filter = document.getElementById('secrets-tag-filter');
          filter.innerHTML = '<option value="">All Tags</option>';

          this.secretTags.forEach(tag => {
              const option = document.createElement('option');
              option.value = tag;
              option.textContent = tag;
              if (tag === this.currentSecretTagFilter) {
                  option.selected = true;
              }
              filter.appendChild(option);
          });
      }

      showNewSecretModal() {
          // Reset form
          document.getElementById('new-secret-form').reset();

          this.showModal('new-secret-modal');
      }

      async createSecret() {
          const name = document.getElementById('secret-name-input').value.trim();
          const value = document.getElementById('secret-value-input').value;
          const description = document.getElementById('secret-description-input').value.trim();
          const tagsInput = document.getElementById('secret-tags-input').value.trim();

          if (!name || !value) {
              this.showNotification('Name and value are required', 'error');
              return;
          }

          const tags = tagsInput ? tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag) : [];

          try {
              const response = await fetch('/api/secrets', {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                      name,
                      value,
                      description: description || undefined,
                      tags: tags.length > 0 ? tags : undefined
                  })
              });

              const result = await response.json();

              if (result.success) {
                  this.showNotification('Secret created successfully', 'success');
                  this.hideModal('new-secret-modal');
                  this.loadSecrets();
                  this.loadSecretTags();
              } else {
                  this.showNotification(result.error || 'Failed to create secret', 'error');
              }
          } catch (error) {
              console.error('Error creating secret:', error);
              this.showNotification('Failed to create secret', 'error');
          }
      }

      async showSecretDetails(secretId) {
          try {
              const response = await fetch(\`/api/secrets/\${secretId}\`);
              const result = await response.json();

              if (result.success) {
                  this.currentSecret = result.data;
                  this.renderSecretDetails(result.data);
                  this.showModal('secret-details-modal');
              } else {
                  this.showNotification(result.error || 'Failed to load secret details', 'error');
              }
          } catch (error) {
              console.error('Error loading secret details:', error);
              this.showNotification('Failed to load secret details', 'error');
          }
      }

      renderSecretDetails(secret) {
          document.getElementById('secret-details-title').textContent = \`Secret: \${secret.name}\`;

          const tagsHtml = secret.tags && secret.tags.length > 0
              ? secret.tags.map(tag => \`<span class="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm mr-1">\${tag}</span>\`).join('')
              : '<span class="text-gray-400">No tags</span>';

          const lastUsed = secret.lastUsed
              ? new Date(secret.lastUsed).toLocaleString()
              : 'Never used';

          document.getElementById('secret-details-content').innerHTML = \`
              <div class="space-y-4">
                  <div>
                      <label class="block text-sm font-medium text-gray-700">Name</label>
                      <div class="mt-1 text-sm text-gray-900 font-mono bg-gray-50 px-3 py-2 rounded">
                          \${secret.name}
                      </div>
                      <p class="text-xs text-gray-500 mt-1">Reference as: \\\${SECRET.\${secret.name}}</p>
                  </div>

                  <div>
                      <label class="block text-sm font-medium text-gray-700">Value</label>
                      <div class="mt-1 flex">
                          <div class="flex-1 text-sm text-gray-900 font-mono bg-gray-50 px-3 py-2 rounded-l border-r">
                              <span id="secret-value-display">••••••••••••••••</span>
                          </div>
                          <button id="reveal-secret-btn" onclick="app.toggleSecretValue('\${secret.id}')"
                                  class="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-r">
                              <i class="fas fa-eye"></i>
                          </button>
                      </div>
                  </div>

                  \${secret.description ? \`
                      <div>
                          <label class="block text-sm font-medium text-gray-700">Description</label>
                          <p class="mt-1 text-sm text-gray-900">\${secret.description}</p>
                      </div>
                  \` : ''}

                  <div>
                      <label class="block text-sm font-medium text-gray-700">Tags</label>
                      <div class="mt-1">\${tagsHtml}</div>
                  </div>

                  <div class="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                      <div>
                          <label class="block text-sm font-medium text-gray-700">Created</label>
                          <p class="text-sm text-gray-900">\${new Date(secret.createdAt).toLocaleString()}</p>
                      </div>
                      <div>
                          <label class="block text-sm font-medium text-gray-700">Last Used</label>
                          <p class="text-sm text-gray-900">\${lastUsed}</p>
                      </div>
                  </div>
              </div>
          \`;
      }

      async toggleSecretValue(secretId) {
          const valueDisplay = document.getElementById('secret-value-display');
          const revealBtn = document.getElementById('reveal-secret-btn');

          if (valueDisplay.textContent === '••••••••••••••••') {
              try {
                  const response = await fetch(\`/api/secrets/\${secretId}/value\`);
                  const result = await response.json();

                  if (result.success) {
                      valueDisplay.textContent = result.data.value;
                      revealBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
                  } else {
                      this.showNotification(result.error || 'Failed to reveal secret', 'error');
                  }
              } catch (error) {
                  console.error('Error revealing secret:', error);
                  this.showNotification('Failed to reveal secret', 'error');
              }
          } else {
              valueDisplay.textContent = '••••••••••••••••';
              revealBtn.innerHTML = '<i class="fas fa-eye"></i>';
          }
      }

      editCurrentSecret() {
          if (!this.currentSecret) {
              this.showNotification('No secret selected', 'error');
              return;
          }

          // Populate the edit form with current secret data
          document.getElementById('edit-secret-id').value = this.currentSecret.id;
          document.getElementById('edit-secret-name').value = this.currentSecret.name;
          document.getElementById('edit-secret-description').value = this.currentSecret.description || '';
          document.getElementById('edit-secret-tags').value = (this.currentSecret.tags || []).join(', ');

          // Get the actual secret value from the API
          this.loadSecretValueForEdit(this.currentSecret.id);

          // Hide the details modal and show the edit modal
          this.hideModal('secret-details-modal');
          this.showModal('edit-secret-modal');
      }

      async loadSecretValueForEdit(secretId) {
          try {
              const response = await fetch(\`/api/secrets/\${secretId}/value\`);
              const result = await response.json();

              if (result.success) {
                  document.getElementById('edit-secret-value').value = result.data.value;
              } else {
                  this.showNotification('Failed to load secret value', 'error');
                  document.getElementById('edit-secret-value').value = '[Failed to load secret value]';
              }
          } catch (error) {
              console.error('Error loading secret value:', error);
              this.showNotification('Failed to load secret value', 'error');
              document.getElementById('edit-secret-value').value = '[Error loading secret value]';
          }
      }

      async saveEditSecret() {
          try {
              const secretId = document.getElementById('edit-secret-id').value;
              const name = document.getElementById('edit-secret-name').value.trim();
              const description = document.getElementById('edit-secret-description').value.trim();
              const value = document.getElementById('edit-secret-value').value;
              const tagsInput = document.getElementById('edit-secret-tags').value.trim();

              if (!name) {
                  this.showNotification('Secret name is required', 'error');
                  return;
              }

              if (!value) {
                  this.showNotification('Secret value is required', 'error');
                  return;
              }

              const tags = tagsInput ? tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag) : [];

              const updateData = {
                  name,
                  description: description || undefined,
                  value,
                  tags
              };

              const response = await fetch(\`/api/secrets/\${secretId}\`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(updateData)
              });

              const result = await response.json();

              if (result.success) {
                  this.showNotification('Secret updated successfully', 'success');
                  this.hideModal('edit-secret-modal');
                  this.loadSecrets();
                  // If the secret details modal was open, refresh it
                  if (this.currentSecret && this.currentSecret.id === secretId) {
                      this.showSecretDetails(secretId);
                  }
              } else {
                  this.showNotification(result.error || 'Failed to update secret', 'error');
              }
          } catch (error) {
              console.error('Error updating secret:', error);
              this.showNotification('Failed to update secret', 'error');
          }
      }

      async deleteCurrentSecret() {
          if (!this.currentSecret) return;

          if (!confirm(\`Are you sure you want to delete the secret "\${this.currentSecret.name}"? This action cannot be undone.\`)) {
              return;
          }

          try {
              const response = await fetch(\`/api/secrets/\${this.currentSecret.id}\`, {
                  method: 'DELETE'
              });

              const result = await response.json();

              if (result.success) {
                  this.showNotification('Secret deleted successfully', 'success');
                  this.hideModal('secret-details-modal');
                  this.loadSecrets();
                  this.loadSecretTags();
              } else {
                  this.showNotification(result.error || 'Failed to delete secret', 'error');
              }
          } catch (error) {
              console.error('Error deleting secret:', error);
              this.showNotification('Failed to delete secret', 'error');
          }
      }

      setupWebSocket() {
          try {
              const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
              this.websocket = new WebSocket(\`\${protocol}//\${window.location.host}/ws\`);

              this.websocket.onopen = () => {
                  console.log('WebSocket connected');
                  this.updateSystemStatus(true);
              };

              this.websocket.onmessage = (event) => {
                  const data = JSON.parse(event.data);
                  this.handleWebSocketMessage(data);
              };

              this.websocket.onclose = () => {
                  console.log('WebSocket disconnected');
                  this.updateSystemStatus(false);
                  // Attempt to reconnect after 5 seconds
                  setTimeout(() => this.setupWebSocket(), 5000);
              };

              this.websocket.onerror = (error) => {
                  console.error('WebSocket error:', error);
                  this.updateSystemStatus(false);
              };
          } catch (error) {
              console.error('Failed to setup WebSocket:', error);
              this.updateSystemStatus(false);
          }
      }

      handleWebSocketMessage(data) {
          // Handle real-time updates from server
          if (data.type === 'task_update') {
              this.loadTasks();
              this.loadStatistics();
          } else if (data.type === 'agent_update') {
              this.loadAgents();
          } else if (data.type === 'log_update' && this.followingLogs) {
              this.appendLog(data.message);
          }
      }

      updateSystemStatus(online) {
          const statusEl = document.getElementById('system-status');
          const dot = statusEl.querySelector('.w-2');
          const text = statusEl.querySelector('span');

          if (online) {
              dot.className = 'w-2 h-2 bg-green-400 rounded-full mr-2';
              text.textContent = 'System Online';
          } else {
              dot.className = 'w-2 h-2 bg-red-400 rounded-full mr-2';
              text.textContent = 'System Offline';
          }
      }

      async loadInitialData() {
          try {
              await Promise.all([
                  this.loadStatistics(),
                  this.loadTasks(),
                  this.loadAgents(),
                  this.loadRecentActivity(),
                  this.loadNextScheduled(),
                  this.loadSecrets(),
                  this.loadSecretTags()
              ]);
          } catch (error) {
              console.error('Error loading initial data:', error);
              this.showNotification('Error loading data', 'error');
          }
      }

      async loadStatistics() {
          try {
              const response = await fetch('/api/statistics');
              const data = await response.json();

              if (data.success) {
                  this.statistics = data.data;
                  this.renderStatistics();
                  this.renderCharts();
              }
          } catch (error) {
              console.error('Error loading statistics:', error);
          }
      }

      async loadTasks() {
          try {
              const params = new URLSearchParams({
                  page: this.currentPage,
                  limit: this.tasksPerPage
              });

              if (this.currentFilters.status) {
                  params.append('status', this.currentFilters.status);
              }
              if (this.currentFilters.agent) {
                  params.append('agentId', this.currentFilters.agent);
              }

              const response = await fetch(\`/api/tasks?\${params}\`);
              const data = await response.json();

              if (data.success) {
                  this.tasks = data.data.tasks;
                  this.renderTasks();
                  this.renderTasksPagination(data.data);
                  this.populateLogTaskFilter();
              }
          } catch (error) {
              console.error('Error loading tasks:', error);
          }
      }

      async loadAgents() {
          try {
              const response = await fetch('/api/agents');
              const data = await response.json();

              if (data.success) {
                  this.agents = data.data;
                  this.renderAgents();
                  this.populateAgentFilters();
              }
          } catch (error) {
              console.error('Error loading agents:', error);
          }
      }

      async loadSecretsForSwarm() {
          try {
              const response = await fetch('/api/secrets');
              const data = await response.json();

              if (data.success) {
                  this.secrets = data.data.secrets;
              }
          } catch (error) {
              console.error('Error loading secrets for swarm:', error);
          }
      }

      async loadSwarmData() {
          // Load both agents and secrets for the swarm interface
          await Promise.all([
              this.loadAgents(),
              this.loadSecretsForSwarm()
          ]);

          // Populate swarm UI after both are loaded
          if (this.currentTab === 'bot-swarm') {
              this.populateSwarmDropdowns();
              this.renderAgentSecretStatus();
          }
      }

      async loadDeletedTasks() {
          try {
              const response = await fetch('/api/tasks/deleted');
              const data = await response.json();

              if (data.success) {
                  this.deletedTasks = data.data;
                  this.renderDeletedTasks();
                  document.getElementById('deleted-count').textContent = \`\${data.data.length} deleted tasks\`;
              }
          } catch (error) {
              console.error('Error loading deleted tasks:', error);
          }
      }

      async loadInitialData() {
          await Promise.all([
              this.loadTasks(),
              this.loadAgents(),
              this.loadSecrets(),
              this.loadStatistics(),
              this.loadDeletedTasks(),
              this.loadRecentActivity()
          ]);
      }

      switchTab(tabName) {
          this.currentTab = tabName;

          // Hide all tab contents
          document.querySelectorAll('.tab-content').forEach(tab => {
              tab.classList.add('hidden');
          });

          // Remove active class from all tab buttons
          document.querySelectorAll('.tab-btn').forEach(btn => {
              btn.classList.remove('border-blue-500', 'text-blue-600');
              btn.classList.add('border-transparent', 'text-gray-500');
          });

          // Show selected tab content
          const selectedTab = document.getElementById(tabName);
          if (selectedTab) {
              selectedTab.classList.remove('hidden');
          }

          // Add active class to selected tab button
          const selectedBtn = document.querySelector(\`[data-tab="\${tabName}"]\`);
          if (selectedBtn) {
              selectedBtn.classList.add('border-blue-500', 'text-blue-600');
              selectedBtn.classList.remove('border-transparent', 'text-gray-500');
          }

          // Load tab-specific data
          if (tabName === 'bot-swarm') {
              this.loadSwarmData();
          } else if (tabName === 'secrets') {
              this.loadSecrets();
          }
      }

      async loadRecentActivity() {
          try {
              const response = await fetch('/api/activity?limit=10');
              const data = await response.json();

              if (data.success) {
                  this.renderRecentActivity(data.data);
              }
          } catch (error) {
              console.error('Error loading recent activity:', error);
          }
      }

      async loadNextScheduled() {
          try {
              const response = await fetch('/api/scheduler/next?limit=10');
              const data = await response.json();

              if (data.success) {
                  this.renderNextScheduled(data.data);
              }
          } catch (error) {
              console.error('Error loading next scheduled:', error);
          }
      }

      renderStatistics() {
          const statsContainer = document.getElementById('stats-cards');
          const stats = this.statistics;

          statsContainer.innerHTML = \`
              <div class="bg-white overflow-hidden shadow rounded-lg">
                  <div class="p-5">
                      <div class="flex items-center">
                          <div class="flex-shrink-0">
                              <i class="fas fa-tasks text-gray-400 text-2xl"></i>
                          </div>
                          <div class="ml-5 w-0 flex-1">
                              <dl>
                                  <dt class="text-sm font-medium text-gray-500 truncate">Total Tasks</dt>
                                  <dd class="text-lg font-medium text-gray-900">\${stats.totalTasks || 0}</dd>
                              </dl>
                          </div>
                      </div>
                  </div>
              </div>

              <div class="bg-white overflow-hidden shadow rounded-lg">
                  <div class="p-5">
                      <div class="flex items-center">
                          <div class="flex-shrink-0">
                              <i class="fas fa-play text-blue-400 text-2xl"></i>
                          </div>
                          <div class="ml-5 w-0 flex-1">
                              <dl>
                                  <dt class="text-sm font-medium text-gray-500 truncate">Running Tasks</dt>
                                  <dd class="text-lg font-medium text-blue-600">\${stats.runningTasks || 0}</dd>
                              </dl>
                          </div>
                      </div>
                  </div>
              </div>

              <div class="bg-white overflow-hidden shadow rounded-lg">
                  <div class="p-5">
                      <div class="flex items-center">
                          <div class="flex-shrink-0">
                              <i class="fas fa-check text-green-400 text-2xl"></i>
                          </div>
                          <div class="ml-5 w-0 flex-1">
                              <dl>
                                  <dt class="text-sm font-medium text-gray-500 truncate">Completed Tasks</dt>
                                  <dd class="text-lg font-medium text-green-600">\${stats.completedTasks || 0}</dd>
                              </dl>
                          </div>
                      </div>
                  </div>
              </div>

              <div class="bg-white overflow-hidden shadow rounded-lg">
                  <div class="p-5">
                      <div class="flex items-center">
                          <div class="flex-shrink-0">
                              <i class="fas fa-clock text-purple-400 text-2xl"></i>
                          </div>
                          <div class="ml-5 w-0 flex-1">
                              <dl>
                                  <dt class="text-sm font-medium text-gray-500 truncate">Avg Runtime</dt>
                                  <dd class="text-lg font-medium text-purple-600">\${this.formatDuration(stats.averageRuntime || 0)}</dd>
                              </dl>
                          </div>
                      </div>
                  </div>
              </div>
          \`;
      }

      renderCharts() {
          // Status Distribution Chart
          const ctx = document.getElementById('status-chart').getContext('2d');

          if (this.charts.statusChart) {
              this.charts.statusChart.destroy();
          }

          const statusData = this.statistics.tasksByStatus || {};

          this.charts.statusChart = new Chart(ctx, {
              type: 'doughnut',
              data: {
                  labels: ['Running', 'Completed', 'Failed', 'Pending', 'Cancelled', 'Scheduled'],
                  datasets: [{
                      data: [
                          statusData.running || 0,
                          statusData.completed || 0,
                          statusData.failed || 0,
                          statusData.pending || 0,
                          statusData.cancelled || 0,
                          statusData.scheduled || 0
                      ],
                      backgroundColor: [
                          '#3B82F6', // blue
                          '#10B981', // green
                          '#EF4444', // red
                          '#F59E0B', // yellow
                          '#6B7280', // gray
                          '#8B5CF6'  // purple
                      ]
                  }]
              },
              options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                      legend: {
                          position: 'bottom'
                      }
                  }
              }
          });
      }

      renderTasks() {
          const container = document.getElementById('tasks-table-container');

          if (this.tasks.length === 0) {
              container.innerHTML = \`
                  <div class="text-center py-12">
                      <i class="fas fa-tasks text-gray-400 text-4xl mb-4"></i>
                      <p class="text-gray-500">No tasks found</p>
                  </div>
              \`;
              return;
          }

          const tableHTML = \`
              <table class="min-w-full divide-y divide-gray-200">
                  <thead class="bg-gray-50">
                      <tr>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task</th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent</th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Config</th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-gray-200">
                      \${this.tasks.map(task => this.renderTaskRow(task)).join('')}
                  </tbody>
              </table>
          \`;

          container.innerHTML = tableHTML;
      }

      renderTaskRow(task) {
          const agent = this.agents.find(a => a.id === task.agentId);
          const agentName = agent ? agent.name : task.agentId;
          const duration = task.duration ? this.formatDuration(task.duration) : '-';

          return \`
              <tr class="hover:bg-gray-50">
                  <td class="px-6 py-4 whitespace-nowrap">
                      <div>
                          <div class="text-sm font-medium text-gray-900">\${task.name}</div>
                          \${task.description ? \`<div class="text-sm text-gray-500">\${task.description}</div>\` : ''}
                      </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">\${agentName}</td>
                  <td class="px-6 py-4 whitespace-nowrap">
                      <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full status-\${task.status}">
                          \${task.status}\${task.timedOut ? ' (TIMEOUT)' : ''}
                      </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                      <div class="space-y-1">
                          \${task.schedule?.enabled ? \`<div class="text-purple-600">📅 \${task.schedule.cronExpression}</div>\` : ''}
                          \${task.resources ? \`<div class="text-blue-600">🖥️ \${task.resources.memory || ''}\${task.resources.memory && task.resources.cpus ? '/' : ''}\${task.resources.cpus || ''}</div>\` : ''}
                          \${task.timeoutMs ? \`<div class="text-orange-600">⏱️ \${Math.round(task.timeoutMs / 60000)}min</div>\` : ''}
                      </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      \${this.formatDate(task.createdAt)}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\${duration}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <button onclick="app.showTaskDetails('\${task.id}')" class="text-blue-600 hover:text-blue-900">
                          <i class="fas fa-eye"></i>
                      </button>
                      \${this.renderTaskActions(task)}
                  </td>
              </tr>
          \`;
      }

      renderTaskActions(task) {
          let actions = '';

          if (task.status === 'pending') {
              actions += \`
                  <button onclick="app.startTask('\${task.id}')" class="text-green-600 hover:text-green-900" title="Start Task">
                      <i class="fas fa-play"></i>
                  </button>
              \`;
          }

          if (task.status === 'scheduled') {
              // For scheduled tasks, show start manually and disable schedule options
              actions += \`
                  <button onclick="app.startTask('\${task.id}')" class="text-green-600 hover:text-green-900" title="Start Task Now">
                      <i class="fas fa-play-circle"></i>
                  </button>
                  <button onclick="app.toggleSchedule('\${task.id}', false)" class="text-orange-600 hover:text-orange-900" title="Disable Schedule">
                      <i class="fas fa-pause"></i>
                  </button>
              \`;
          }

          if (task.status === 'running') {
              actions += \`
                  <button onclick="app.cancelTask('\${task.id}')" class="text-red-600 hover:text-red-900" title="Cancel Task">
                      <i class="fas fa-stop"></i>
                  </button>
              \`;
          }

          // Add edit button for non-running tasks
          if (['pending', 'scheduled', 'failed', 'completed', 'cancelled'].includes(task.status)) {
              actions += \`
                  <button onclick="app.showEditTaskModal('\${task.id}')" class="text-yellow-600 hover:text-yellow-900" title="Edit Task">
                      <i class="fas fa-edit"></i>
                  </button>
              \`;
          }

          // Add duplicate button for non-running tasks
          if (['completed', 'failed', 'cancelled', 'scheduled', 'pending'].includes(task.status)) {
              actions += \`
                  <button onclick="app.duplicateTask('\${task.id}')" class="text-blue-600 hover:text-blue-900" title="Duplicate Task">
                      <i class="fas fa-copy"></i>
                  </button>
              \`;
          }

          if (['completed', 'failed', 'cancelled', 'scheduled', 'pending'].includes(task.status)) {
              const deleteTitle = task.status === 'scheduled' ? 'Delete Scheduled Task' : 'Delete Task';
              actions += \`
                  <button onclick="app.deleteTask('\${task.id}')" class="text-red-600 hover:text-red-900" title="\${deleteTitle}">
                      <i class="fas fa-trash"></i>
                  </button>
              \`;
          }

          return actions;
      }

      renderTasksPagination(data) {
          const container = document.getElementById('tasks-pagination');
          const { page, limit, total, hasNext, hasPrev } = data;

          const totalPages = Math.ceil(total / limit);

          container.innerHTML = \`
              <div class="flex-1 flex justify-between sm:hidden">
                  <button \${!hasPrev ? 'disabled' : ''} onclick="app.changePage(\${page - 1})"
                          class="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 \${!hasPrev ? 'opacity-50 cursor-not-allowed' : ''}">
                      Previous
                  </button>
                  <button \${!hasNext ? 'disabled' : ''} onclick="app.changePage(\${page + 1})"
                          class="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 \${!hasNext ? 'opacity-50 cursor-not-allowed' : ''}">
                      Next
                  </button>
              </div>
              <div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div>
                      <p class="text-sm text-gray-700">
                          Showing <span class="font-medium">\${(page - 1) * limit + 1}</span> to <span class="font-medium">\${Math.min(page * limit, total)}</span> of <span class="font-medium">\${total}</span> results
                      </p>
                  </div>
                  <div>
                      <nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                          <button \${!hasPrev ? 'disabled' : ''} onclick="app.changePage(\${page - 1})"
                                  class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 \${!hasPrev ? 'opacity-50 cursor-not-allowed' : ''}">
                              <i class="fas fa-chevron-left"></i>
                          </button>
                          \${this.renderPaginationNumbers(page, totalPages)}
                          <button \${!hasNext ? 'disabled' : ''} onclick="app.changePage(\${page + 1})"
                                  class="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 \${!hasNext ? 'opacity-50 cursor-not-allowed' : ''}">
                              <i class="fas fa-chevron-right"></i>
                          </button>
                      </nav>
                  </div>
              </div>
          \`;
      }

      renderPaginationNumbers(currentPage, totalPages) {
          let numbers = '';
          const maxVisible = 5;
          let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
          let end = Math.min(totalPages, start + maxVisible - 1);

          if (end - start < maxVisible - 1) {
              start = Math.max(1, end - maxVisible + 1);
          }

          for (let i = start; i <= end; i++) {
              const isActive = i === currentPage;
              numbers += \`
                  <button onclick="app.changePage(\${i})"
                          class="relative inline-flex items-center px-4 py-2 border text-sm font-medium \${
                              isActive
                                  ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                                  : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                          }">
                      \${i}
                  </button>
              \`;
          }

          return numbers;
      }

      renderAgents() {
          const container = document.getElementById('agents-grid');

          if (this.agents.length === 0) {
              container.innerHTML = \`
                  <div class="col-span-full text-center py-12">
                      <i class="fas fa-robot text-gray-400 text-4xl mb-4"></i>
                      <p class="text-gray-500">No agents found</p>
                  </div>
              \`;
              return;
          }

          container.innerHTML = this.agents.map(agent => \`
              <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div class="flex items-center justify-between mb-4">
                      <h3 class="text-lg font-medium text-gray-900">\${agent.name}</h3>
                      <span class="px-2 py-1 text-xs font-semibold rounded-full \${this.getAgentStatusClass(agent.status)}">
                          \${agent.status}
                      </span>
                  </div>
                  \${agent.description ? \`<p class="text-sm text-gray-600 mb-4">\${agent.description}</p>\` : ''}
                  <div class="space-y-2 text-sm">
                      <div class="flex justify-between">
                          <span class="text-gray-500">Total Tasks:</span>
                          <span class="font-medium">\${agent.totalTasks || 0}</span>
                      </div>
                      <div class="flex justify-between">
                          <span class="text-gray-500">Successful:</span>
                          <span class="font-medium text-green-600">\${agent.successfulTasks || 0}</span>
                      </div>
                      <div class="flex justify-between">
                          <span class="text-gray-500">Failed:</span>
                          <span class="font-medium text-red-600">\${agent.failedTasks || 0}</span>
                      </div>
                      \${agent.lastActivity ? \`
                          <div class="flex justify-between">
                              <span class="text-gray-500">Last Activity:</span>
                              <span class="font-medium">\${this.formatDate(agent.lastActivity)}</span>
                          </div>
                      \` : ''}
                      \${agent.currentTaskId ? \`
                          <div class="flex justify-between">
                              <span class="text-gray-500">Current Task:</span>
                              <button onclick="app.showTaskDetails('\${agent.currentTaskId}')" class="text-blue-600 hover:text-blue-800 text-xs">
                                  View Task
                              </button>
                          </div>
                      \` : ''}

                      <!-- Secret Mappings Section -->
                      \${agent.secretMapping && Object.keys(agent.secretMapping).length > 0 ? \`
                          <div class="mt-3 pt-3 border-t border-gray-200">
                              <span class="text-gray-500 text-xs font-medium">Secret Mappings:</span>
                              <div class="mt-1 space-y-1">
                                  \${Object.entries(agent.secretMapping).map(([varName, secretId]) => {
                                      const secret = this.secrets.find(s => s.id === secretId);
                                      const secretName = secret ? secret.name : 'Unknown';
                                      return \`
                                          <div class="flex justify-between text-xs">
                                              <span class="font-mono text-purple-600">\${varName}</span>
                                              <span class="text-gray-600">\${secretName}</span>
                                          </div>
                                      \`;
                                  }).join('')}
                              </div>
                          </div>
                      \` : \`
                          <div class="mt-3 pt-3 border-t border-gray-200">
                              <span class="text-gray-400 text-xs">No secret mappings configured</span>
                          </div>
                      \`}
                  </div>
                  <div class="mt-4 flex space-x-2">
                      <button onclick="app.editAgent('\${agent.id}')" class="flex-1 bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700">
                          Edit
                      </button>
                      <button onclick="app.deleteAgent('\${agent.id}')" class="flex-1 bg-red-600 text-white px-3 py-2 rounded text-sm hover:bg-red-700">
                          Delete
                      </button>
                  </div>
              </div>
          \`).join('');
      }

      renderDeletedTasks() {
          const container = document.getElementById('deleted-tasks-table-container');

          if (this.deletedTasks.length === 0) {
              container.innerHTML = \`
                  <div class="text-center py-12">
                      <i class="fas fa-trash text-gray-400 text-4xl mb-4"></i>
                      <p class="text-gray-500">No deleted tasks found</p>
                  </div>
              \`;
              return;
          }

          const tableHTML = \`
              <table class="min-w-full divide-y divide-gray-200">
                  <thead class="bg-gray-50">
                      <tr>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task</th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent</th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deleted</th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-gray-200">
                      \${this.deletedTasks.map(task => this.renderDeletedTaskRow(task)).join('')}
                  </tbody>
              </table>
          \`;

          container.innerHTML = tableHTML;
      }

      renderDeletedTaskRow(task) {
          const agent = this.agents.find(a => a.id === task.agentId);
          const agentName = agent ? agent.name : task.agentId;

          return \`
              <tr class="hover:bg-gray-50">
                  <td class="px-6 py-4 whitespace-nowrap">
                      <div>
                          <div class="text-sm font-medium text-gray-900">\${task.name}</div>
                          \${task.description ? \`<div class="text-sm text-gray-500">\${task.description}</div>\` : ''}
                      </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">\${agentName}</td>
                  <td class="px-6 py-4 whitespace-nowrap">
                      <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                          deleted
                      </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      \${this.formatDate(task.createdAt)}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      \${task.deletedAt ? this.formatDate(task.deletedAt) : '-'}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <button onclick="app.showTaskDetails('\${task.id}')" class="text-blue-600 hover:text-blue-900">
                          <i class="fas fa-eye"></i>
                      </button>
                      <button onclick="app.restoreTask('\${task.id}')" class="text-green-600 hover:text-green-900">
                          <i class="fas fa-undo"></i>
                      </button>
                      <button onclick="app.permanentlyDeleteTask('\${task.id}')" class="text-red-600 hover:text-red-900">
                          <i class="fas fa-trash-alt"></i>
                      </button>
                  </td>
              </tr>
          \`;
      }

      renderRecentActivity(activities) {
          const container = document.getElementById('recent-activity');

          if (activities.length === 0) {
              container.innerHTML = '<div class="text-gray-500 text-sm">No recent activity</div>';
              return;
          }

          container.innerHTML = activities.map(activity => \`
              <div class="flex items-center space-x-3 p-2 rounded hover:bg-gray-50">
                  <div class="flex-shrink-0">
                      <i class="fas \${this.getActivityIcon(activity.action)} text-gray-400"></i>
                  </div>
                  <div class="flex-1 min-w-0">
                      <p class="text-sm text-gray-900">\${activity.details || activity.action}</p>
                      <p class="text-xs text-gray-500">\${this.formatDate(activity.timestamp)}</p>
                  </div>
              </div>
          \`).join('');
      }

      renderNextScheduled(scheduledTasks) {
          const container = document.getElementById('next-scheduled');

          if (scheduledTasks.length === 0) {
              container.innerHTML = '<div class="text-gray-500 text-sm">No scheduled tasks</div>';
              return;
          }

          container.innerHTML = scheduledTasks.map(scheduled => {
              const agent = this.agents.find(a => a.id === scheduled.agentId);
              const agentName = agent ? agent.name : scheduled.agentId;
              const timeUntil = this.getTimeUntil(scheduled.nextRun);
              const runInfo = scheduled.maxRuns ?
                  \`\${scheduled.currentRuns}/\${scheduled.maxRuns} runs\` :
                  \`\${scheduled.currentRuns} runs\`;

              return \`
                  <div class="flex items-center space-x-3 p-2 rounded hover:bg-gray-50">
                      <div class="flex-shrink-0">
                          <i class="fas fa-clock text-purple-400"></i>
                      </div>
                      <div class="flex-1 min-w-0">
                          <p class="text-sm font-medium text-gray-900">\${scheduled.taskName}</p>
                          <p class="text-xs text-gray-600">Agent: \${agentName}</p>
                          <p class="text-xs text-gray-500">In \${timeUntil} • \${runInfo}</p>
                          <p class="text-xs text-gray-400">\${scheduled.cronExpression}</p>
                      </div>
                  </div>
              \`;
          }).join('');
      }

      populateAgentFilters() {
          const agentFilter = document.getElementById('agent-filter');
          const taskAgentSelect = document.getElementById('task-agent-select');

          const agentOptions = this.agents.map(agent =>
              \`<option value="\${agent.id}">\${agent.name}</option>\`
          ).join('');

          agentFilter.innerHTML = '<option value="">All Agents</option>' + agentOptions;
          taskAgentSelect.innerHTML = '<option value="">Select an agent</option>' + agentOptions;
      }

      populateLogTaskFilter() {
          const logTaskFilter = document.getElementById('log-task-filter');

          const taskOptions = this.tasks.map(task =>
              \`<option value="\${task.id}">\${task.name}</option>\`
          ).join('');

          logTaskFilter.innerHTML = '<option value="">All Tasks</option>' + taskOptions;
      }

      // Event handlers
      switchTab(tab) {
          // Update tab buttons
          document.querySelectorAll('.tab-btn').forEach(btn => {
              btn.classList.remove('active', 'border-blue-500', 'text-blue-600');
              btn.classList.add('border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
          });

          document.querySelector(\`[data-tab="\${tab}"]\`).classList.remove('border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
          document.querySelector(\`[data-tab="\${tab}"]\`).classList.add('active', 'border-blue-500', 'text-blue-600');

          // Show/hide tab content
          document.querySelectorAll('.tab-content').forEach(content => {
              content.classList.add('hidden');
          });
          document.getElementById(\`\${tab}-tab\`).classList.remove('hidden');

          this.currentTab = tab;

          // Load tab-specific data
          if (tab === 'agents' && this.agents.length === 0) {
              this.loadAgents();
          } else if (tab === 'deleted') {
              this.loadDeletedTasks();
          } else if (tab === 'swarm') {
              this.loadSwarmData();
          }
      }

      changePage(page) {
          this.currentPage = page;
          this.loadTasks();
      }

      showModal(modalId) {
          document.getElementById(modalId).classList.remove('hidden');
      }

      hideModal(modalId) {
          document.getElementById(modalId).classList.add('hidden');
          // Reset forms
          document.querySelectorAll(\`#\${modalId} form\`).forEach(form => form.reset());
          document.getElementById('schedule-options').classList.add('hidden');
          document.getElementById('resource-options').classList.add('hidden');
      }

      showNewTaskModal() {
          // Reset form and clear uploaded content
          this.resetTaskForm();
          this.showModal('new-task-modal');
      }

      resetTaskForm() {
          // Clear form inputs
          document.getElementById('new-task-form').reset();

          // Reset config type to file path
          document.querySelector('input[name="config-type"][value="upload"]').checked = true;
          this.switchConfigInputType('upload');

          // Clear uploaded content
          this.uploadedConfigContent = null;
          this.uploadedConfigType = null;

          // Hide file upload info
          document.getElementById('uploaded-file-info').classList.add('hidden');

          // Clear validation results
          const validationResult = document.getElementById('config-validation-result');
          if (validationResult) {
              validationResult.classList.add('hidden');
          }

          // Reset format to JSON for paste content
          document.querySelector('input[name="paste-format"][value="json"]').checked = true;
      }

      showNewAgentModal() {
          this.showModal('new-agent-modal');
      }

      async createTask() {
          const form = document.getElementById('new-task-form');
          const formData = new FormData(form);

          const taskData = {
              agentId: document.getElementById('task-agent-select').value,
              name: document.getElementById('task-name-input').value,
              description: document.getElementById('task-description-input').value || undefined
          };

          // Handle config input based on selected type
          const configType = document.querySelector('input[name="config-type"]:checked').value;

          if (configType === 'upload') {
              // File upload approach
              if (!this.uploadedConfigContent) {
                  this.showNotification('Please upload a configuration file', 'error');
                  return;
              }
              taskData.configContent = this.uploadedConfigContent;
              taskData.configType = this.uploadedConfigType;

          } else if (configType === 'paste') {
              // Paste content approach
              const content = document.getElementById('config-content-input').value.trim();
              if (!content) {
                  this.showNotification('Please paste configuration content', 'error');
                  return;
              }
              const format = document.querySelector('input[name="paste-format"]:checked').value;
              taskData.configContent = content;
              taskData.configType = format;
          }

          // Add schedule if enabled
          if (document.getElementById('task-schedule-checkbox').checked) {
              const cronExpression = document.getElementById('task-cron-input').value;
              const maxRuns = document.getElementById('task-maxruns-input').value;

              if (!cronExpression) {
                  this.showNotification('Cron expression is required for scheduled tasks', 'error');
                  return;
              }

              taskData.schedule = {
                  enabled: true,
                  cronExpression,
                  maxRuns: maxRuns ? parseInt(maxRuns) : undefined
              };
          }

          // Add resource limits if enabled
          if (document.getElementById('task-resources-checkbox').checked) {
              const memory = document.getElementById('task-memory-input').value;
              const cpus = document.getElementById('task-cpus-input').value;

              if (memory || cpus) {
                  taskData.resources = {};
                  if (memory) taskData.resources.memory = memory;
                  if (cpus) taskData.resources.cpus = cpus;
              }
          }

          // Add timeout if specified
          const timeoutMinutes = document.getElementById('task-timeout-input').value;
          if (timeoutMinutes && parseInt(timeoutMinutes) > 0) {
              taskData.timeoutMs = parseInt(timeoutMinutes) * 60 * 1000; // Convert minutes to milliseconds
          }

          try {
              const response = await fetch('/api/tasks', {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(taskData)
              });

              const result = await response.json();

              if (result.success) {
                  this.showNotification('Task created successfully', 'success');
                  this.hideModal('new-task-modal');
                  this.loadTasks();
                  this.loadStatistics();
              } else {
                  this.showNotification(result.error || 'Failed to create task', 'error');
              }
          } catch (error) {
              console.error('Error creating task:', error);
              this.showNotification('Failed to create task', 'error');
          }
      }

      async createAgent() {
          const agentData = {
              name: document.getElementById('agent-name-input').value,
              description: document.getElementById('agent-description-input').value || undefined
          };

          try {
              const response = await fetch('/api/agents', {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(agentData)
              });

              const result = await response.json();

              if (result.success) {
                  this.showNotification('Agent created successfully', 'success');
                  this.hideModal('new-agent-modal');
                  this.loadAgents();
              } else {
                  this.showNotification(result.error || 'Failed to create agent', 'error');
              }
          } catch (error) {
              console.error('Error creating agent:', error);
              this.showNotification('Failed to create agent', 'error');
          }
      }

      async startTask(taskId) {
          if (!confirm('Are you sure you want to start this task?')) return;

          try {
              const response = await fetch(\`/api/tasks/\${taskId}/start\`, {
                  method: 'POST'
              });

              const result = await response.json();

              if (result.success) {
                  this.showNotification('Task started successfully', 'success');
                  this.loadTasks();
                  this.loadStatistics();
              } else {
                  this.showNotification(result.error || 'Failed to start task', 'error');
              }
          } catch (error) {
              console.error('Error starting task:', error);
              this.showNotification('Failed to start task', 'error');
          }
      }

      async cancelTask(taskId) {
          if (!confirm('Are you sure you want to cancel this task?')) return;

          try {
              const response = await fetch(\`/api/tasks/\${taskId}/cancel\`, {
                  method: 'POST'
              });

              const result = await response.json();

              if (result.success) {
                  this.showNotification('Task cancelled successfully', 'success');
                  this.loadTasks();
                  this.loadStatistics();
              } else {
                  this.showNotification(result.error || 'Failed to cancel task', 'error');
              }
          } catch (error) {
              console.error('Error cancelling task:', error);
              this.showNotification('Failed to cancel task', 'error');
          }
      }

      async deleteTask(taskId) {
          const task = this.tasks.find(t => t.id === taskId);
          const taskType = task && task.status === 'scheduled' ? 'scheduled task' : 'task';

          if (!confirm(\`Are you sure you want to delete this \${taskType}? This action cannot be undone.\`)) return;

          try {
              const response = await fetch(\`/api/tasks/\${taskId}\`, {
                  method: 'DELETE'
              });

              const result = await response.json();

              if (result.success) {
                  this.showNotification(\`\${taskType.charAt(0).toUpperCase() + taskType.slice(1)} deleted successfully\`, 'success');
                  this.loadTasks();
                  this.loadStatistics();
              } else {
                  this.showNotification(result.error || \`Failed to delete \${taskType}\`, 'error');
              }
          } catch (error) {
              console.error(\`Error deleting \${taskType}:\`, error);
              this.showNotification(\`Failed to delete \${taskType}\`, 'error');
          }
      }

      async toggleSchedule(taskId, enable) {
          const action = enable ? 'enable' : 'disable';

          if (!confirm(\`Are you sure you want to \${action} the schedule for this task?\`)) return;

          try {
              const task = this.tasks.find(t => t.id === taskId);
              if (!task || !task.schedule) {
                  this.showNotification('Task schedule not found', 'error');
                  return;
              }

              const updatedSchedule = { ...task.schedule, enabled: enable };

              const response = await fetch(\`/api/tasks/\${taskId}\`, {
                  method: 'PUT',
                  headers: {
                      'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                      schedule: updatedSchedule
                  })
              });

              const result = await response.json();

              if (result.success) {
                  this.showNotification(\`Schedule \${action}d successfully\`, 'success');
                  this.loadTasks();
                  this.loadStatistics();
              } else {
                  this.showNotification(result.error || \`Failed to \${action} schedule\`, 'error');
              }
          } catch (error) {
              console.error(\`Error \${action}ing schedule:\`, error);
              this.showNotification(\`Failed to \${action} schedule\`, 'error');
          }
      }

      async deleteAgent(agentId) {
          if (!confirm('Are you sure you want to delete this agent? This action cannot be undone.')) return;

          try {
              const response = await fetch(\`/api/agents/\${agentId}\`, {
                  method: 'DELETE'
              });

              const result = await response.json();

              if (result.success) {
                  this.showNotification('Agent deleted successfully', 'success');
                  this.loadAgents();
              } else {
                  this.showNotification(result.error || 'Failed to delete agent', 'error');
              }
          } catch (error) {
              console.error('Error deleting agent:', error);
              this.showNotification('Failed to delete agent', 'error');
          }
      }

      async showTaskDetails(taskId) {
          try {
              const response = await fetch(\`/api/tasks/\${taskId}\`);
              const result = await response.json();

              if (result.success) {
                  const task = result.data;
                  const agent = this.agents.find(a => a.id === task.agentId);

                  document.getElementById('task-details-title').textContent = \`Task: \${task.name}\`;
                  document.getElementById('task-details-content').innerHTML = \`
                      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                              <h4 class="text-sm font-medium text-gray-900 mb-3">Basic Information</h4>
                              <dl class="space-y-2">
                                  <div>
                                      <dt class="text-sm text-gray-500">Name:</dt>
                                      <dd class="text-sm text-gray-900">\${task.name}</dd>
                                  </div>
                                  <div>
                                      <dt class="text-sm text-gray-500">Agent:</dt>
                                      <dd class="text-sm text-gray-900">\${agent ? agent.name : task.agentId}</dd>
                                  </div>
                                  <div>
                                      <dt class="text-sm text-gray-500">Status:</dt>
                                      <dd><span class="px-2 py-1 text-xs font-semibold rounded-full status-\${task.status}">\${task.status}</span></dd>
                                  </div>
                                  <div>
                                      <dt class="text-sm text-gray-500">Config Type:</dt>
                                      <dd class="text-sm text-gray-900">\${task.configType}</dd>
                                  </div>
                                  \${task.description ? \`
                                      <div>
                                          <dt class="text-sm text-gray-500">Description:</dt>
                                          <dd class="text-sm text-gray-900">\${task.description}</dd>
                                      </div>
                                  \` : ''}
                                  \${task.resources ? \`
                                      <div>
                                          <dt class="text-sm text-gray-500">Resource Limits:</dt>
                                          <dd class="text-sm text-gray-900">
                                              \${task.resources.memory ? \`Memory: \${task.resources.memory}\` : ''}
                                              \${task.resources.memory && task.resources.cpus ? ', ' : ''}
                                              \${task.resources.cpus ? \`CPU: \${task.resources.cpus}\` : ''}
                                          </dd>
                                      </div>
                                  \` : ''}
                                  \${task.timeoutMs ? \`
                                      <div>
                                          <dt class="text-sm text-gray-500">Timeout:</dt>
                                          <dd class="text-sm text-gray-900">
                                              \${Math.round(task.timeoutMs / 60000)} minutes
                                              \${task.timedOut ? '<span class="text-red-600 font-semibold">(TIMED OUT)</span>' : ''}
                                          </dd>
                                      </div>
                                  \` : ''}
                              </dl>
                          </div>

                          <div>
                              <h4 class="text-sm font-medium text-gray-900 mb-3">Timing</h4>
                              <dl class="space-y-2">
                                  <div>
                                      <dt class="text-sm text-gray-500">Created At:</dt>
                                      <dd class="text-sm text-gray-900">\${this.formatDate(task.createdAt)}</dd>
                                  </div>
                                  \${task.startedAt ? \`
                                      <div>
                                          <dt class="text-sm text-gray-500">Started At:</dt>
                                          <dd class="text-sm text-gray-900">\${this.formatDate(task.startedAt)}</dd>
                                      </div>
                                  \` : ''}
                                  \${task.endedAt ? \`
                                      <div>
                                          <dt class="text-sm text-gray-500">Ended At:</dt>
                                          <dd class="text-sm text-gray-900">\${this.formatDate(task.endedAt)}</dd>
                                      </div>
                                  \` : ''}
                                  \${task.duration ? \`
                                      <div>
                                          <dt class="text-sm text-gray-500">Duration:</dt>
                                          <dd class="text-sm text-gray-900">\${this.formatDuration(task.duration)}</dd>
                                      </div>
                                  \` : ''}
                                  \${task.exitCode !== undefined ? \`
                                      <div>
                                          <dt class="text-sm text-gray-500">Exit Code:</dt>
                                          <dd class="text-sm text-gray-900">\${task.exitCode}</dd>
                                      </div>
                                  \` : ''}
                              </dl>
                          </div>
                      </div>

                      \${task.schedule ? \`
                          <div class="mt-6">
                              <h4 class="text-sm font-medium text-gray-900 mb-3">Schedule</h4>
                              <dl class="grid grid-cols-2 gap-4">
                                  <div>
                                      <dt class="text-sm text-gray-500">Enabled:</dt>
                                      <dd class="text-sm text-gray-900">\${task.schedule.enabled ? 'Yes' : 'No'}</dd>
                                  </div>
                                  <div>
                                      <dt class="text-sm text-gray-500">Cron Expression:</dt>
                                      <dd class="text-sm text-gray-900 font-mono">\${task.schedule.cronExpression}</dd>
                                  </div>
                                  <div>
                                      <dt class="text-sm text-gray-500">Current Runs:</dt>
                                      <dd class="text-sm text-gray-900">\${task.schedule.currentRuns}</dd>
                                  </div>
                                  \${task.schedule.maxRuns ? \`
                                      <div>
                                          <dt class="text-sm text-gray-500">Max Runs:</dt>
                                          <dd class="text-sm text-gray-900">\${task.schedule.maxRuns}</dd>
                                      </div>
                                  \` : ''}
                              </dl>
                          </div>
                      \` : ''}

                      \${task.logs && task.logs.length > 0 ? \`
                          <div class="mt-6">
                              <h4 class="text-sm font-medium text-gray-900 mb-3">Recent Logs</h4>
                              <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-xs h-48 overflow-y-auto custom-scrollbar">
                                  \${task.logs.slice(-20).map(log => \`
                                      <div class="mb-1">
                                          <span class="text-gray-500">[\${this.formatDate(log.timestamp)}]</span>
                                          <span class="text-yellow-400">\${log.level.toUpperCase()}:</span>
                                          <span>\${log.message}</span>
                                      </div>
                                  \`).join('')}
                              </div>
                          </div>
                      \` : ''}
                  \`;

                  this.showModal('task-details-modal');
              } else {
                  this.showNotification(result.error || 'Failed to load task details', 'error');
              }
          } catch (error) {
              console.error('Error loading task details:', error);
              this.showNotification('Failed to load task details', 'error');
          }
      }

      async loadTaskLogs(taskId) {
          try {
              const response = await fetch(\`/api/tasks/\${taskId}/logs\`);
              const result = await response.json();

              if (result.success) {
                  const logsContent = document.getElementById('logs-content');
                  logsContent.innerHTML = result.data.logs.map(log => \`<div class="mb-1">\${log}</div>\`).join('');
                  logsContent.scrollTop = logsContent.scrollHeight;
              } else {
                  document.getElementById('logs-content').innerHTML = \`<div class="text-red-400">Error loading logs: \${result.error}</div>\`;
              }
          } catch (error) {
              console.error('Error loading task logs:', error);
              document.getElementById('logs-content').innerHTML = \`<div class="text-red-400">Error loading logs</div>\`;
          }
      }

      toggleFollowLogs() {
          const button = document.getElementById('follow-logs-btn');
          const taskId = document.getElementById('log-task-filter').value;

          if (!taskId) {
              this.showNotification('Please select a task first', 'warning');
              return;
          }

          if (this.followingLogs) {
              // Stop following
              this.followingLogs = false;
              if (this.logEventSource) {
                  this.logEventSource.close();
                  this.logEventSource = null;
              }
              button.innerHTML = '<i class="fas fa-play mr-2"></i>Follow Logs';
              button.classList.remove('bg-red-600', 'hover:bg-red-700');
              button.classList.add('bg-green-600', 'hover:bg-green-700');
          } else {
              // Start following
              this.followingLogs = true;
              this.logEventSource = new EventSource(\`/api/tasks/\${taskId}/logs?follow=true\`);

              this.logEventSource.onmessage = (event) => {
                  const data = JSON.parse(event.data);
                  if (data.log) {
                      this.appendLog(data.log);
                  } else if (data.error) {
                      this.appendLog(\`ERROR: \${data.error}\`);
                      this.stopFollowingLogs();
                  }
              };

              this.logEventSource.onerror = () => {
                  this.appendLog('ERROR: Connection to log stream lost');
                  this.stopFollowingLogs();
              };

              button.innerHTML = '<i class="fas fa-stop mr-2"></i>Stop Following';
              button.classList.remove('bg-green-600', 'hover:bg-green-700');
              button.classList.add('bg-red-600', 'hover:bg-red-700');
          }
      }

      appendLog(message) {
          const logsContent = document.getElementById('logs-content');
          const logDiv = document.createElement('div');
          logDiv.className = 'mb-1';
          logDiv.textContent = message;
          logsContent.appendChild(logDiv);
          logsContent.scrollTop = logsContent.scrollHeight;
      }

      stopFollowingLogs() {
          this.followingLogs = false;
          if (this.logEventSource) {
              this.logEventSource.close();
              this.logEventSource = null;
          }
          const button = document.getElementById('follow-logs-btn');
          button.innerHTML = '<i class="fas fa-play mr-2"></i>Follow Logs';
          button.classList.remove('bg-red-600', 'hover:bg-red-700');
          button.classList.add('bg-green-600', 'hover:bg-green-700');
      }

      async editAgent(agentId) {
          try {
              const response = await fetch(\`/api/agents/\${agentId}\`);
              const result = await response.json();

              if (result.success) {
                  const agent = result.data;

                  // Populate the edit form with current agent data
                  document.getElementById('edit-agent-id').value = agent.id;
                  document.getElementById('edit-agent-name').value = agent.name;
                  document.getElementById('edit-agent-description').value = agent.description || '';
                  document.getElementById('edit-agent-status').value = agent.status;

                  // Show the edit modal
                  this.showModal('edit-agent-modal');
              } else {
                  this.showNotification('Failed to load agent details', 'error');
              }
          } catch (error) {
              console.error('Error loading agent for edit:', error);
              this.showNotification('Failed to load agent details', 'error');
          }
      }

      async saveEditAgent() {
          try {
              const agentId = document.getElementById('edit-agent-id').value;
              const name = document.getElementById('edit-agent-name').value.trim();
              const description = document.getElementById('edit-agent-description').value.trim();
              const status = document.getElementById('edit-agent-status').value;

              if (!name) {
                  this.showNotification('Agent name is required', 'error');
                  return;
              }

              const updateData = {
                  name,
                  description: description || undefined,
                  status
              };

              const response = await fetch(\`/api/agents/\${agentId}\`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(updateData)
              });

              const result = await response.json();

              if (result.success) {
                  this.showNotification('Agent updated successfully', 'success');
                  this.hideModal('edit-agent-modal');
                  this.loadAgents(); // Refresh the agents list
              } else {
                  this.showNotification(result.error || 'Failed to update agent', 'error');
              }
          } catch (error) {
              console.error('Error updating agent:', error);
              this.showNotification('Failed to update agent', 'error');
          }
      }

      // Utility methods
      formatDate(dateString) {
          const date = new Date(dateString);
          return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
      }

      formatDuration(milliseconds) {
          if (!milliseconds) return '-';

          const seconds = Math.floor(milliseconds / 1000);
          const minutes = Math.floor(seconds / 60);
          const hours = Math.floor(minutes / 60);

          if (hours > 0) {
              return \`\${hours}h \${minutes % 60}m \${seconds % 60}s\`;
          } else if (minutes > 0) {
              return \`\${minutes}m \${seconds % 60}s\`;
          } else {
              return \`\${seconds}s\`;
          }
      }

      getTimeUntil(dateString) {
          const now = new Date();
          const targetDate = new Date(dateString);
          const diffMs = targetDate.getTime() - now.getTime();

          if (diffMs <= 0) {
              return 'now';
          }

          const seconds = Math.floor(diffMs / 1000);
          const minutes = Math.floor(seconds / 60);
          const hours = Math.floor(minutes / 60);
          const days = Math.floor(hours / 24);

          if (days > 0) {
              return \`\${days}d \${hours % 24}h\`;
          } else if (hours > 0) {
              return \`\${hours}h \${minutes % 60}m\`;
          } else if (minutes > 0) {
              return \`\${minutes}m \${seconds % 60}s\`;
          } else {
              return \`\${seconds}s\`;
          }
      }

      getAgentStatusClass(status) {
          const classes = {
              'idle': 'bg-green-100 text-green-800',
              'busy': 'bg-blue-100 text-blue-800',
              'error': 'bg-red-100 text-red-800',
              'offline': 'bg-gray-100 text-gray-800'
          };
          return classes[status] || 'bg-gray-100 text-gray-800';
      }

      getActivityIcon(action) {
          const icons = {
              'created': 'fa-plus',
              'started': 'fa-play',
              'completed': 'fa-check',
              'failed': 'fa-times',
              'cancelled': 'fa-stop',
              'scheduled': 'fa-clock'
          };
          return icons[action] || 'fa-info';
      }

      showNotification(message, type = 'info') {
          // Create notification element
          const notification = document.createElement('div');
          notification.className = \`fixed top-4 right-4 z-50 max-w-sm w-full bg-white shadow-lg rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 fade-in\`;

          const bgColor = {
              'success': 'bg-green-50 border-green-200',
              'error': 'bg-red-50 border-red-200',
              'warning': 'bg-yellow-50 border-yellow-200',
              'info': 'bg-blue-50 border-blue-200'
          }[type] || 'bg-blue-50 border-blue-200';

          const iconColor = {
              'success': 'text-green-400',
              'error': 'text-red-400',
              'warning': 'text-yellow-400',
              'info': 'text-blue-400'
          }[type] || 'text-blue-400';

          const icon = {
              'success': 'fa-check-circle',
              'error': 'fa-exclamation-circle',
              'warning': 'fa-exclamation-triangle',
              'info': 'fa-info-circle'
          }[type] || 'fa-info-circle';

          notification.innerHTML = \`
              <div class="p-4 \${bgColor} border rounded-lg">
                  <div class="flex">
                      <div class="flex-shrink-0">
                          <i class="fas \${icon} \${iconColor}"></i>
                      </div>
                      <div class="ml-3">
                          <p class="text-sm font-medium text-gray-900">\${message}</p>
                      </div>
                      <div class="ml-auto pl-3">
                          <button onclick="this.parentElement.parentElement.parentElement.remove()" class="inline-flex text-gray-400 hover:text-gray-600">
                              <i class="fas fa-times"></i>
                          </button>
                      </div>
                  </div>
              </div>
          \`;

          document.body.appendChild(notification);

          // Auto-remove after 5 seconds
          setTimeout(() => {
              if (notification.parentElement) {
                  notification.remove();
              }
          }, 5000);
      }

      startPeriodicRefresh() {
          // Refresh data every 30 seconds
          setInterval(() => {
              if (this.currentTab === 'tasks') {
                  this.loadTasks();
              } else if (this.currentTab === 'agents') {
                  this.loadAgents();
              } else if (this.currentTab === 'pruning') {
                  this.loadPruningStats();
              }
              this.loadStatistics();
              this.loadNextScheduled();
          }, 30000);
      }

      async loadPruningStats() {
          try {
              // Load both stats and preview data
              const [statsResponse, previewResponse] = await Promise.all([
                  fetch('/api/pruning/stats'),
                  fetch('/api/pruning/preview?retentionDays=30')
              ]);

              const statsData = await statsResponse.json();
              const previewData = await previewResponse.json();

              if (statsData.success) {
                  document.getElementById('pruning-tasks').textContent = statsData.data.eligibleTasks;
                  document.getElementById('pruning-agents').textContent = statsData.data.eligibleAgents;
                  document.getElementById('pruning-logs').textContent = statsData.data.eligibleLogs;
                  document.getElementById('pruning-space').textContent = this.formatBytes(statsData.data.estimatedSpaceSaved);
              }

              if (previewData.success) {
                  this.renderPruningPreview(previewData.data);
              }
          } catch (error) {
              console.error('Error loading pruning stats:', error);
          }
      }

      async runPruning(dryRun) {
          try {
              const button = dryRun ? document.getElementById('dry-run-btn') : document.getElementById('run-pruning-btn');
              const originalText = button.innerHTML;

              // Show loading state
              button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Running...';
              button.disabled = true;

              const response = await fetch('/api/pruning/run', {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ dryRun })
              });

              const result = await response.json();

              if (result.success) {
                  // Show results
                  const resultsDiv = document.getElementById('pruning-results');
                  const resultsContent = document.getElementById('pruning-results-content');

                  const results = result.data;
                  resultsContent.innerHTML = \`
                      <strong>\${dryRun ? 'DRY RUN RESULTS:' : 'PRUNING RESULTS:'}</strong><br/>
                      Tasks \${dryRun ? 'that would be' : ''} removed: \${results.tasksRemoved}<br/>
                      Agents \${dryRun ? 'that would be' : ''} removed: \${results.agentsRemoved}<br/>
                      Logs \${dryRun ? 'that would be' : ''} removed: \${results.logsRemoved}<br/>
                      Space \${dryRun ? 'that would be' : ''} freed: \${this.formatBytes(results.spaceFreed)}
                  \`;

                  resultsDiv.classList.remove('hidden');

                  // Refresh stats
                  this.loadPruningStats();

                  this.showNotification(
                      \`\${dryRun ? 'Dry run' : 'Pruning'} completed successfully\`,
                      'success'
                  );
              } else {
                  this.showNotification(result.error || 'Pruning failed', 'error');
              }
          } catch (error) {
              console.error('Error running pruning:', error);
              this.showNotification('Error running pruning operation', 'error');
          } finally {
              // Restore button state
              const button = dryRun ? document.getElementById('dry-run-btn') : document.getElementById('run-pruning-btn');
              button.innerHTML = dryRun ? '<i class="fas fa-eye mr-2"></i>Preview' : '<i class="fas fa-broom mr-2"></i>Run Pruning';
              button.disabled = false;
          }
      }

      renderPruningPreview(previewData) {
          // Check if preview container exists, if not create it
          let previewContainer = document.getElementById('pruning-preview');
          if (!previewContainer) {
              // Find the pruning results section and add preview before it
              const resultsSection = document.getElementById('pruning-results');
              previewContainer = document.createElement('div');
              previewContainer.id = 'pruning-preview';
              previewContainer.className = 'mt-6';
              resultsSection.parentNode.insertBefore(previewContainer, resultsSection);
          }

          const cutoffDate = new Date(previewData.cutoffDate).toLocaleDateString();
          const eligibleTasks = previewData.eligibleTasks || [];
          const eligibleAgents = previewData.eligibleAgents || [];

          previewContainer.innerHTML = \`
              <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h5 class="font-medium text-yellow-900 mb-3">
                      <i class="fas fa-eye mr-2"></i>Pruning Preview
                  </h5>
                  <p class="text-sm text-yellow-700 mb-4">\${previewData.retentionPolicy}</p>

                  \${eligibleTasks.length > 0 ? \`
                      <div class="mb-4">
                          <h6 class="text-sm font-medium text-yellow-900 mb-2">
                              Tasks to be removed (\${eligibleTasks.length}):
                          </h6>
                          <div class="bg-white rounded border max-h-32 overflow-y-auto">
                              \${eligibleTasks.slice(0, 10).map(task => \`
                                  <div class="px-3 py-2 border-b border-gray-100 text-xs">
                                      <span class="font-medium">\${task.name}</span>
                                      <span class="text-gray-500">(\${task.status})</span>
                                      \${task.endedAt ? \`<span class="text-gray-400">- ended \${new Date(task.endedAt).toLocaleDateString()}</span>\` : ''}
                                  </div>
                              \`).join('')}
                              \${eligibleTasks.length > 10 ? \`
                                  <div class="px-3 py-2 text-xs text-gray-500 text-center">
                                      ... and \${eligibleTasks.length - 10} more tasks
                                  </div>
                              \` : ''}
                          </div>
                      </div>
                  \` : '<p class="text-sm text-yellow-700 mb-2">No tasks eligible for removal.</p>'}

                  \${eligibleAgents.length > 0 ? \`
                      <div class="mb-4">
                          <h6 class="text-sm font-medium text-yellow-900 mb-2">
                              Agents to be removed (\${eligibleAgents.length}):
                          </h6>
                          <div class="bg-white rounded border max-h-24 overflow-y-auto">
                              \${eligibleAgents.slice(0, 5).map(agent => \`
                                  <div class="px-3 py-2 border-b border-gray-100 text-xs">
                                      <span class="font-medium">\${agent.name}</span>
                                      \${agent.lastActivity ? \`<span class="text-gray-400">- last active \${new Date(agent.lastActivity).toLocaleDateString()}</span>\` : ''}
                                  </div>
                              \`).join('')}
                              \${eligibleAgents.length > 5 ? \`
                                  <div class="px-3 py-2 text-xs text-gray-500 text-center">
                                      ... and \${eligibleAgents.length - 5} more agents
                                  </div>
                              \` : ''}
                          </div>
                      </div>
                  \` : '<p class="text-sm text-yellow-700 mb-2">No agents eligible for removal.</p>'}

                  \${previewData.eligibleLogsCount > 0 ? \`
                      <p class="text-sm text-yellow-700">
                          <strong>\${previewData.eligibleLogsCount}</strong> log entries will be removed from task histories.
                      </p>
                  \` : '<p class="text-sm text-yellow-700">No log entries eligible for removal.</p>'}
              </div>
          \`;
      }

      formatBytes(bytes) {
          if (bytes === 0) return '0 Bytes';
          const k = 1024;
          const sizes = ['Bytes', 'KB', 'MB', 'GB'];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      }

      // Bot Swarm Management Methods
      async loadSwarmData() {
          await this.loadAgents();
          await this.loadSecrets();
          this.setupSwarmEventListeners();
          this.populateSwarmDropdowns();
          this.renderAgentSecretStatus();
      }

      setupSwarmEventListeners() {
          // Agent Secret Assignment
          document.getElementById('assign-secret-btn').addEventListener('click', () => {
              this.assignSecretToAgent();
          });

          // Quick Swarm Creator
          document.getElementById('quick-swarm-btn').addEventListener('click', () => {
              this.createQuickSwarm();
          });

          // Create Swarm (advanced modal - to be added)
          document.getElementById('create-swarm-btn').addEventListener('click', () => {
              this.showAdvancedSwarmModal();
          });

          // Swarm schedule checkbox
          document.getElementById('swarm-schedule-checkbox').addEventListener('change', (e) => {
              const scheduleOptions = document.getElementById('swarm-schedule-options');
              if (e.target.checked) {
                  scheduleOptions.classList.remove('hidden');
              } else {
                  scheduleOptions.classList.add('hidden');
              }
          });

          // Swarm resource checkbox
          document.getElementById('swarm-resources-checkbox').addEventListener('change', (e) => {
              const resourceOptions = document.getElementById('swarm-resource-options');
              if (e.target.checked) {
                  resourceOptions.classList.remove('hidden');
              } else {
                  resourceOptions.classList.add('hidden');
              }
          });
      }

      populateSwarmDropdowns() {
          // Populate agent dropdown for secret assignment
          const secretAgentSelect = document.getElementById('secret-agent-select');
          secretAgentSelect.innerHTML = '<option value="">Select an agent...</option>' +
              this.agents.map(agent =>
                  \`<option value="\${agent.id}">\${agent.name}</option>\`
              ).join('');

          // Remove existing event listeners to prevent duplicates
          const newSecretAgentSelect = secretAgentSelect.cloneNode(true);
          secretAgentSelect.parentNode.replaceChild(newSecretAgentSelect, secretAgentSelect);

          // Add event listener for agent selection change
          newSecretAgentSelect.addEventListener('change', (e) => {
              this.displayAgentSecretMappings(e.target.value);
          });

          // Populate secret dropdown
          const agentSecretSelect = document.getElementById('agent-secret-select');
          agentSecretSelect.innerHTML = '<option value="">Select a secret...</option>' +
              this.secrets.map(secret =>
                  \`<option value="\${secret.id}">\${secret.name}</option>\`
              ).join('');

          // Populate agent checkboxes for swarm creation
          const swarmAgentsList = document.getElementById('swarm-agents-list');
          swarmAgentsList.innerHTML = this.agents.map(agent => \`
              <div class="flex items-center space-x-2 p-1">
                  <input type="checkbox" id="agent-\${agent.id}" value="\${agent.id}" class="swarm-agent-checkbox">
                  <label for="agent-\${agent.id}" class="text-sm">\${agent.name}</label>
                  <span class="text-xs text-gray-500">(\${agent.status})</span>
              </div>
          \`).join('');
      }

      async assignSecretToAgent() {
          const agentId = document.getElementById('secret-agent-select').value;
          const variableName = document.getElementById('secret-variable-name').value;
          const secretId = document.getElementById('agent-secret-select').value;

          if (!agentId) {
              this.showNotification('Please select an agent', 'error');
              return;
          }

          if (!variableName) {
              this.showNotification('Please enter a variable name (e.g., API_KEY)', 'error');
              return;
          }

          if (!secretId) {
              this.showNotification('Please select a secret', 'error');
              return;
          }

          try {
              // Get current agent to preserve existing secret mappings
              const agentResponse = await fetch(\`/api/agents/\${agentId}\`);
              const agentData = await agentResponse.json();
              const currentMappings = agentData.data?.secretMapping || {};

              // Update the mapping with the new variable
              const updatedMappings = {
                  ...currentMappings,
                  [variableName]: secretId
              };

              const response = await fetch(\`/api/agents/\${agentId}/secrets\`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ secretMapping: updatedMappings })
              });

              const result = await response.json();
              if (result.success) {
                  this.showNotification('Secret assigned to agent successfully', 'success');
                  // Refresh agent data and update display
                  await this.loadSwarmData();
                  this.displayAgentSecretMappings(agentId);
                  // Clear form fields but keep agent selected
                  document.getElementById('secret-variable-name').value = '';
                  document.getElementById('agent-secret-select').value = '';
              } else {
                  this.showNotification(\`Error: \${result.error}\`, 'error');
              }
          } catch (error) {
              console.error('Error assigning secret:', error);
              this.showNotification('Failed to assign secret to agent: ' + error.message, 'error');
          }
      }

      displayAgentSecretMappings(agentId) {
          const mappingsDisplay = document.getElementById('mappings-display');

          if (!agentId) {
              mappingsDisplay.innerHTML = 'Select an agent to view its secret mappings';
              return;
          }

          const agent = this.agents.find(a => a.id === agentId);
          if (!agent || !agent.secretMapping || Object.keys(agent.secretMapping).length === 0) {
              mappingsDisplay.innerHTML = '<span class="text-gray-500">No secret mappings configured for this agent</span>';
              return;
          }

          const mappingsHtml = Object.entries(agent.secretMapping)
              .map(([varName, secretId]) => {
                  const secret = this.secrets.find(s => s.id === secretId);
                  const secretName = secret ? secret.name : \`<span class="text-red-500">Unknown (\${secretId})</span>\`;
                  return \`
                      <div class="flex justify-between items-center py-1 px-2 bg-white rounded border mb-1">
                          <span class="font-mono text-xs">\${varName}</span>
                          <span class="text-xs text-gray-600">\${secretName}</span>
                          <button onclick="app.removeSecretMapping('\${agentId}', '\${varName}')" class="text-red-500 hover:text-red-700" title="Remove mapping">
                              <i class="fas fa-times"></i>
                          </button>
                      </div>
                  \`;
              })
              .join('');

          mappingsDisplay.innerHTML = mappingsHtml;
      }

      async removeSecretMapping(agentId, variableName) {
          try {
              // Get current agent to preserve other mappings
              const agentResponse = await fetch(\`/api/agents/\${agentId}\`);
              const agentData = await agentResponse.json();
              const currentMappings = agentData.data?.secretMapping || {};

              // Remove the specific variable
              delete currentMappings[variableName];

              const response = await fetch(\`/api/agents/\${agentId}/secrets\`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ secretMapping: currentMappings })
              });

              if (response.ok) {
                  // Refresh agent data and update display
                  await this.loadSwarmData();
                  this.displayAgentSecretMappings(agentId);
                  this.showNotification('Secret mapping removed successfully', 'success');
              } else {
                  const errorData = await response.json();
                  throw new Error(errorData.error || 'Failed to remove secret mapping');
              }
          } catch (error) {
              console.error('Error removing secret mapping:', error);
              this.showNotification('Failed to remove secret mapping: ' + error.message, 'error');
          }
      }

      async createQuickSwarm() {
          // Prevent multiple rapid clicks
          const swarmBtn = document.getElementById('quick-swarm-btn');
          if (swarmBtn.disabled) return;
          swarmBtn.disabled = true;
          swarmBtn.textContent = 'Creating...';

          const taskName = document.getElementById('swarm-task-name').value;
          const configContent = document.getElementById('swarm-config-content').value;
          const configType = document.querySelector('input[name="swarm-config-type"]:checked').value;
          const selectedAgents = Array.from(document.querySelectorAll('.swarm-agent-checkbox:checked'))
              .map(cb => cb.value);

          // Collect configuration options
          const scheduleEnabled = document.getElementById('swarm-schedule-checkbox').checked;
          const cronExpression = document.getElementById('swarm-cron-input').value;
          const resourcesEnabled = document.getElementById('swarm-resources-checkbox').checked;
          const memory = document.getElementById('swarm-memory-input').value;
          const cpus = document.getElementById('swarm-cpus-input').value;
          const timeoutMinutes = document.getElementById('swarm-timeout-input').value;

          try {
              if (!taskName) {
                  this.showNotification('Please enter a task name', 'error');
                  return;
              }

              if (!configContent) {
                  this.showNotification('Please enter config content', 'error');
                  return;
              }

              if (selectedAgents.length === 0) {
                  this.showNotification('Please select at least one agent', 'error');
                  return;
              }

              if (scheduleEnabled && !cronExpression) {
                  this.showNotification('Please enter a cron expression for scheduled tasks', 'error');
                  return;
              }

              // Build request data
              const requestData = {
                  name: taskName,
                  description: \`Quick swarm: \${selectedAgents.length} agents\` +
                             (scheduleEnabled ? \` (scheduled: \${cronExpression})\` : '') +
                             (resourcesEnabled ? \` (resources: \${memory || 'default'}/\${cpus || 'default'})\` : '') +
                             (timeoutMinutes ? \` (timeout: \${timeoutMinutes}min)\` : ''),
                  configContent: configContent,
                  configType: configType,
                  agentIds: selectedAgents
              };

              // Add schedule configuration if enabled
              if (scheduleEnabled && cronExpression) {
                  requestData.schedule = {
                      enabled: true,
                      cronExpression: cronExpression,
                      currentRuns: 0
                  };
              }

              // Add resource limits if enabled
              if (resourcesEnabled && (memory || cpus)) {
                  requestData.resources = {};
                  if (memory) requestData.resources.memory = memory;
                  if (cpus) requestData.resources.cpus = cpus;
              }

              // Add timeout if specified
              if (timeoutMinutes) {
                  requestData.timeoutMs = parseInt(timeoutMinutes) * 60 * 1000; // Convert minutes to milliseconds
              }

              const response = await fetch('/api/tasks/swarm', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(requestData)
              });

              const result = await response.json();
              if (result.success) {
                  this.showNotification(\`Successfully created \${result.data.length} tasks!\`, 'success');
                  // Clear form
                  document.getElementById('swarm-task-name').value = '';
                  document.getElementById('swarm-config-content').value = '';
                  document.querySelector('input[name="swarm-config-type"][value="yaml"]').checked = true;
                  document.querySelectorAll('.swarm-agent-checkbox').forEach(cb => cb.checked = false);

                  // Clear configuration options
                  document.getElementById('swarm-schedule-checkbox').checked = false;
                  document.getElementById('swarm-schedule-options').classList.add('hidden');
                  document.getElementById('swarm-cron-input').value = '';
                  document.getElementById('swarm-resources-checkbox').checked = false;
                  document.getElementById('swarm-resource-options').classList.add('hidden');
                  document.getElementById('swarm-memory-input').value = '';
                  document.getElementById('swarm-cpus-input').value = '';
                  document.getElementById('swarm-timeout-input').value = '';
                  // Switch to tasks tab to see results
                  this.switchTab('tasks');
                  this.loadTasks();
              } else {
                  this.showNotification(\`Error: \${result.error}\`, 'error');
              }
          } catch (error) {
              console.error('Error creating swarm:', error);
              this.showNotification('Failed to create swarm', 'error');
          } finally {
              // Re-enable button
              swarmBtn.disabled = false;
              swarmBtn.textContent = 'Create Quick Swarm';
          }
      }

      showAdvancedSwarmModal() {
          // For now, just show the quick swarm section
          alert('Advanced swarm creation coming soon! Use the Quick Swarm Creator for now.');
      }

      renderAgentSecretStatus() {
          const statusContainer = document.getElementById('agent-secret-status');

          if (this.agents.length === 0) {
              statusContainer.innerHTML = '<p class="text-gray-500">No agents available</p>';
              return;
          }

          // Create a map of secret IDs to secret names for quick lookup
          const secretMap = new Map();
          this.secrets.forEach(secret => {
              secretMap.set(secret.id, secret.name);
          });

          const tableHTML = \`
              <table class="min-w-full">
                  <thead class="bg-gray-50">
                      <tr>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent</th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Secret Mappings</th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tasks</th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-gray-200">
                      \${this.agents.map(agent => {
                          // Show secret mappings instead of single assigned secret
                          let secretDisplay = 'No secret mappings';
                          if (agent.secretMapping && Object.keys(agent.secretMapping).length > 0) {
                              const mappings = Object.entries(agent.secretMapping)
                                  .map(([varName, secretId]) => {
                                      const secretName = secretMap.get(secretId) || 'Unknown';
                                      return \`\${varName}: \${secretName}\`;
                                  })
                                  .join(', ');
                              secretDisplay = mappings;
                          }

                          const statusBadge = agent.status === 'idle' ?
                              '<span class="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">Idle</span>' :
                              '<span class="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">Busy</span>';

                          return \`
                              <tr>
                                  <td class="px-6 py-4 whitespace-nowrap">
                                      <div class="text-sm font-medium text-gray-900">\${agent.name}</div>
                                      <div class="text-sm text-gray-500">\${agent.id}</div>
                                  </td>
                                  <td class="px-6 py-4 whitespace-nowrap">\${statusBadge}</td>
                                  <td class="px-6 py-4 whitespace-nowrap">
                                      <div class="text-sm text-gray-900">\${secretDisplay}</div>
                                      \${agent.secretMapping && Object.keys(agent.secretMapping).length > 0 ?
                                          \`<div class="text-xs text-gray-500">\${Object.keys(agent.secretMapping).length} mapping(s)</div>\` :
                                          '<div class="text-xs text-red-500">⚠️ No secret mappings</div>'
                                      }
                                  </td>
                                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                      \${agent.totalTasks || 0} total, \${agent.successfulTasks || 0} success
                                  </td>
                                  <td class="px-6 py-4 whitespace-nowrap text-sm">
                                      <button onclick="app.editAgentSecret('\${agent.id}')"
                                              class="text-purple-600 hover:text-purple-900 mr-2">
                                          Edit Secret
                                      </button>
                                  </td>
                              </tr>
                          \`;
                      }).join('')}
                  </tbody>
              </table>
          \`;

          statusContainer.innerHTML = tableHTML;
      }

      editAgentSecret(agentId) {
          // Pre-select the agent in the assignment form
          document.getElementById('secret-agent-select').value = agentId;

          // Scroll to the assignment section
          document.querySelector('#secret-agent-select').scrollIntoView({
              behavior: 'smooth',
              block: 'center'
          });

          // Highlight the form briefly
          const form = document.querySelector('#secret-agent-select').closest('.bg-white');
          form.classList.add('ring-2', 'ring-purple-500');
          setTimeout(() => {
              form.classList.remove('ring-2', 'ring-purple-500');
          }, 2000);
      }

      // Agent Edit Methods
      async editAgent(agentId) {
          try {
              const response = await fetch(\`/api/agents/\${agentId}\`);
              const result = await response.json();

              if (!result.success) {
                  this.showNotification('Failed to load agent details', 'error');
                  return;
              }

              const agent = result.data;

              // Populate edit form
              document.getElementById('edit-agent-id').value = agent.id;
              document.getElementById('edit-agent-name').value = agent.name;
              document.getElementById('edit-agent-description').value = agent.description || '';

              // Show modal
              this.showModal('edit-agent-modal');
          } catch (error) {
              console.error('Error loading agent for edit:', error);
              this.showNotification('Failed to load agent details', 'error');
          }
      }

      async saveEditAgent() {
          const agentId = document.getElementById('edit-agent-id').value;
          const name = document.getElementById('edit-agent-name').value;
          const description = document.getElementById('edit-agent-description').value;

          if (!name.trim()) {
              this.showNotification('Agent name is required', 'error');
              return;
          }

          try {
              const response = await fetch(\`/api/agents/\${agentId}\`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      name: name.trim(),
                      description: description.trim()
                  })
              });

              const result = await response.json();
              if (result.success) {
                  this.showNotification('Agent updated successfully!', 'success');
                  this.hideModal('edit-agent-modal');
                  this.loadAgents(); // Refresh the agent list
              } else {
                  this.showNotification(\`Error: \${result.error}\`, 'error');
              }
          } catch (error) {
              console.error('Error saving agent:', error);
              this.showNotification('Failed to save agent', 'error');
          }
      }

      async deleteAgent(agentId) {
          const agent = this.agents.find(a => a.id === agentId);
          if (!agent) {
              this.showNotification('Agent not found', 'error');
              return;
          }

          if (!confirm(\`Are you sure you want to delete agent "\${agent.name}"? This action cannot be undone.\`)) {
              return;
          }

          try {
              const response = await fetch(\`/api/agents/\${agentId}\`, {
                  method: 'DELETE'
              });

              const result = await response.json();
              if (result.success) {
                  this.showNotification('Agent deleted successfully!', 'success');
                  this.loadAgents(); // Refresh the agent list
              } else {
                  this.showNotification(\`Error: \${result.error}\`, 'error');
              }
          } catch (error) {
              console.error('Error deleting agent:', error);
              this.showNotification('Failed to delete agent', 'error');
          }
      }

      // Task Edit Methods
      async showEditTaskModal(taskId) {
          const task = this.tasks.find(t => t.id === taskId);
          if (!task) {
              alert('Task not found');
              return;
          }

          // Populate form fields
          document.getElementById('edit-task-id').value = task.id;
          document.getElementById('edit-task-name').value = task.name;
          document.getElementById('edit-task-description').value = task.description || '';
          document.getElementById('edit-task-config').value = typeof task.configContent === 'object'
              ? JSON.stringify(task.configContent, null, 2)
              : task.configContent || '';
          document.getElementById('edit-task-timeout').value = task.timeoutMs ? task.timeoutMs / 60000 : 30;

          // Populate agent dropdown
          const agentSelect = document.getElementById('edit-task-agent');
          agentSelect.innerHTML = '<option value="">Select an agent...</option>' +
              this.agents.map(agent =>
                  \`<option value="\${agent.id}" \${agent.id === task.agentId ? 'selected' : ''}>\${agent.name}</option>\`
              ).join('');

          // Handle schedule
          const scheduleEnabled = document.getElementById('edit-task-schedule-enabled');
          const scheduleOptions = document.getElementById('edit-schedule-options');
          const cronInput = document.getElementById('edit-task-cron');

          if (task.schedule && task.schedule.enabled) {
              scheduleEnabled.checked = true;
              scheduleOptions.classList.remove('hidden');
              cronInput.value = task.schedule.cronExpression || '';
          } else {
              scheduleEnabled.checked = false;
              scheduleOptions.classList.add('hidden');
              cronInput.value = '';
          }

          // Add event listener for schedule toggle
          scheduleEnabled.addEventListener('change', function() {
              if (this.checked) {
                  scheduleOptions.classList.remove('hidden');
              } else {
                  scheduleOptions.classList.add('hidden');
              }
          });

          this.showModal('edit-task-modal');
      }

      async updateTask() {
          const taskId = document.getElementById('edit-task-id').value;
          const taskName = document.getElementById('edit-task-name').value;
          const description = document.getElementById('edit-task-description').value;
          const agentId = document.getElementById('edit-task-agent').value;
          const configContent = document.getElementById('edit-task-config').value;
          const timeoutMinutes = parseInt(document.getElementById('edit-task-timeout').value);
          const scheduleEnabled = document.getElementById('edit-task-schedule-enabled').checked;
          const cronExpression = document.getElementById('edit-task-cron').value;

          if (!taskName || !agentId || !configContent) {
              alert('Please fill in all required fields');
              return;
          }

          // Don't validate format here - let the backend handle it
          const updateData = {
              name: taskName,
              description: description,
              agentId: agentId,
              configContent: configContent,
              timeoutMs: timeoutMinutes * 60000
          };

          // Add schedule data if enabled
          if (scheduleEnabled && cronExpression) {
              updateData.schedule = {
                  enabled: true,
                  cronExpression: cronExpression
              };
          } else if (!scheduleEnabled) {
              updateData.schedule = {
                  enabled: false
              };
          }

          try {
              const response = await fetch(\`/api/tasks/\${taskId}\`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(updateData)
              });

              const result = await response.json();
              if (result.success) {
                  alert('Task updated successfully!');
                  this.hideModal('edit-task-modal');
                  this.loadTasks(); // Refresh task list
              } else {
                  alert(\`Error: \${result.error}\`);
              }
          } catch (error) {
              console.error('Error updating task:', error);
              alert('Failed to update task');
          }
      }

      async duplicateTask(taskId) {
          try {
              const response = await fetch(\`/api/tasks/\${taskId}/duplicate\`, {
                  method: 'POST'
              });

              const result = await response.json();
              if (result.success) {
                  this.showNotification('Task duplicated successfully', 'success');
                  this.loadTasks(); // Refresh the task list
              } else {
                  this.showNotification(\`Error: \${result.error}\`, 'error');
              }
          } catch (error) {
              console.error('Error duplicating task:', error);
              this.showNotification('Failed to duplicate task: ' + error.message, 'error');
          }
      }
  }

  // Initialize the app when DOM is loaded
  document.addEventListener('DOMContentLoaded', () => {
      window.app = new OrchestratorApp();
  });
`;
