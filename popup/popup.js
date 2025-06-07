class PopupController {
  constructor() {
    this.currentTab = 'config';
    this.isConnected = false;
    this.config = {};
    this.notionConfig = {};
    this.validators = {};
    this.debounceTimers = {};
    this.statusDataLoaded = false;
    this.statusData = {};
    this.revisionSystem = null;
    this.currentFilter = 'all';
    
    this.initializeEventListeners();
    this.initializeValidators();
    this.loadStoredConfiguration();
    this.initializeUI();
    this.initializeRevisionSystem();
  }

  initializeEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });

    // Form submission
    document.getElementById('github-config-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveConfiguration();
    });

    // Test connection
    document.getElementById('test-connection').addEventListener('click', () => {
      this.testConnection();
    });

    // Password toggle
    document.getElementById('toggle-token').addEventListener('click', () => {
      this.togglePasswordVisibility('github-token');
    });

    // Notion password toggle
    document.getElementById('toggle-notion-token').addEventListener('click', () => {
      this.togglePasswordVisibility('notion-token');
    });

    // Notion toggle
    document.getElementById('notion-enabled').addEventListener('change', (e) => {
      this.toggleNotionConfig(e.target.checked);
    });

    // Revision system handlers
    document.getElementById('refresh-revisions').addEventListener('click', () => {
      this.loadRevisions();
    });

    document.getElementById('clear-revisions').addEventListener('click', () => {
      this.clearRevisions();
    });

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.setFilter(e.target.dataset.filter);
      });
    });

    // Set default active filter
    document.querySelector('.filter-btn[data-filter="all"]').classList.add('active');
    document.querySelector('.filter-btn[data-filter="due"]').classList.remove('active');

    // Event delegation for revision buttons (removed - no longer needed)

    // Create Notion database button
    document.getElementById('create-notion-database').addEventListener('click', () => {
      this.createNotionDatabaseManually();
    });

    // Branch selector
    document.getElementById('github-branch').addEventListener('change', (e) => {
      this.handleBranchSelection(e.target.value);
    });

    // Real-time validation
    ['github-token', 'github-owner', 'github-repo', 'notion-token', 'notion-page'].forEach(fieldId => {
      const field = document.getElementById(fieldId);
      if (field) {
        field.addEventListener('input', () => {
          this.clearValidationMessages();
          this.debounceValidation(fieldId, field.value);
        });
        field.addEventListener('blur', () => {
          this.validateField(fieldId, field.value);
        });
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      this.handleKeyboardShortcuts(e);
    });
  }

  initializeValidators() {
    this.validators = {
      'github-token': {
        required: true,
        pattern: /^gh[ps]_[A-Za-z0-9_]{36,255}$/,
        message: 'Invalid token format. Should start with ghp_ or ghs_'
      },
      'github-owner': {
        required: true,
        pattern: /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/,
        message: 'Invalid username format'
      },
      'github-repo': {
        required: true,
        pattern: /^[a-zA-Z0-9._-]+$/,
        message: 'Repository name can only contain letters, numbers, dots, hyphens, and underscores'
      },
      'notion-token': {
        required: false,
        pattern: /^ntn/,
        message: 'Invalid Notion token format. Should start with ntn'
      },
      'notion-page': {
        required: false,
        pattern: /^.{1,}$/,
        message: 'Page name cannot be empty'
      }
    };
  }

  async loadStoredConfiguration() {
    try {
      const data = await chrome.storage.sync.get([
        'github_token', 'github_owner', 'github_repo', 'github_branch',
        'notion_enabled', 'notion_token', 'notion_page', 'notion_database_id',
        'last_sync', 'takeuforward_time', 'last_activity', 'repo_info'
      ]);

      this.config = {
        token: data.github_token || '',
        owner: data.github_owner || '',
        repo: data.github_repo || '',
        branch: data.github_branch || 'main'
      };

      this.notionConfig = {
        enabled: data.notion_enabled || false,
        token: data.notion_token || '',
        page: data.notion_page || '',
        databaseId: data.notion_database_id || ''
      };

      // Store status data for later use
      this.statusData = data;

      this.populateFormFields();
      this.updateConnectionStatus();
      this.preloadStatusData();
    this.updateAnalytics(data);
  } catch (error) {
    console.error('Failed to load config:', error);
  }
  }

  populateFormFields() {
    document.getElementById('github-token').value = this.config.token;
    document.getElementById('github-owner').value = this.config.owner;
    document.getElementById('github-repo').value = this.config.repo;
    
    const branchSelect = document.getElementById('github-branch');
    const customBranchInput = document.getElementById('custom-branch');
    
    if (['main', 'master', 'solutions'].includes(this.config.branch)) {
      branchSelect.value = this.config.branch;
      customBranchInput.classList.add('hidden');
    } else {
      branchSelect.value = 'custom';
      customBranchInput.value = this.config.branch;
      customBranchInput.classList.remove('hidden');
    }

    // Populate Notion fields
    document.getElementById('notion-enabled').checked = this.notionConfig.enabled;
    document.getElementById('notion-token').value = this.notionConfig.token;
    document.getElementById('notion-page').value = this.notionConfig.page;
    this.toggleNotionConfig(this.notionConfig.enabled);
  }

  initializeUI() {
    // Update version info
    this.updateVersionInfo();
    
    // Update TakeUforward time tracking
    this.updateTakeUforwardTime();
    
    // Check initial connection status
    if (this.config.token && this.config.owner && this.config.repo) {
      this.quickConnectionCheck();
    }
  }

  switchTab(tabName) {
    this.currentTab = tabName;
    
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `${tabName}-tab`);
    });
    
    // Load status data when switching to status tab
    if (tabName === 'status' && !this.statusDataLoaded) {
      this.refreshStatusData();
    }
    
    // Load revisions when switching to revisions tab
    if (tabName === 'revisions' && this.revisionSystem) {
      this.loadRevisions();
    }
  }

  debounceValidation(fieldId, value) {
    clearTimeout(this.debounceTimers[fieldId]);
    this.debounceTimers[fieldId] = setTimeout(() => {
      this.validateField(fieldId, value);
    }, 500);
  }

  validateField(fieldId, value) {
    const validator = this.validators[fieldId];
    if (!validator) return true;

    const isValid = this.performValidation(fieldId, value, validator);
    this.updateFieldValidation(fieldId, isValid, validator.message);
    return isValid;
  }

  performValidation(fieldId, value, validator) {
    if (validator.required && !value.trim()) {
      return false;
    }
    
    if (value && validator.pattern && !validator.pattern.test(value)) {
      return false;
    }
    
    return true;
  }

  updateFieldValidation(fieldId, isValid, message) {
    const field = document.getElementById(fieldId);
    const fieldGroup = field.closest('.form-group');
    
    // Remove existing validation classes
    field.classList.remove('valid', 'invalid');
    fieldGroup.classList.remove('has-error');
    
    // Remove existing validation message
    const existingMessage = fieldGroup.querySelector('.validation-message');
    if (existingMessage) {
      existingMessage.remove();
    }
    
    if (!isValid && field.value.trim()) {
      field.classList.add('invalid');
      fieldGroup.classList.add('has-error');
      
      const validationDiv = document.createElement('div');
      validationDiv.className = 'validation-message error';
      validationDiv.textContent = message;
      validationDiv.style.filter = 'blur(5px)';
      validationDiv.style.opacity = '0';
      fieldGroup.appendChild(validationDiv);
      
      // Trigger unblur animation
      setTimeout(() => {
        validationDiv.style.transition = 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        validationDiv.style.filter = 'blur(0px)';
        validationDiv.style.opacity = '1';
      }, 10);
    } else if (isValid && field.value.trim()) {
      field.classList.add('valid');
    }
  }

  async saveConfiguration() {
    const formData = this.collectFormData();
    
    if (!this.validateAllFields(formData)) {
      return;
    }

    this.showLoadingState(true);
    
    try {
      const saveData = {
        github_token: formData.token,
        github_owner: formData.owner,
        github_repo: formData.repo,
        github_branch: formData.branch,
        notion_enabled: formData.notionEnabled,
        notion_token: formData.notionToken,
        notion_page: formData.notionPage
      };

      await chrome.storage.sync.set(saveData);

      this.config = formData;
      this.notionConfig = {
        enabled: formData.notionEnabled,
        token: formData.notionToken,
        page: formData.notionPage,
        databaseId: this.notionConfig.databaseId
      };
      
      this.updateConnectionStatus();
      
      // Auto-test connection after save
      setTimeout(() => this.testConnection(), 1000);
      
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      this.showLoadingState(false);
    }
  }

  collectFormData() {
    const branchSelect = document.getElementById('github-branch');
    const customBranch = document.getElementById('custom-branch');
    
    return {
      token: document.getElementById('github-token').value.trim(),
      owner: document.getElementById('github-owner').value.trim(),
      repo: document.getElementById('github-repo').value.trim(),
      branch: branchSelect.value === 'custom' ? customBranch.value.trim() : branchSelect.value,
      notionEnabled: document.getElementById('notion-enabled').checked,
      notionToken: document.getElementById('notion-token').value.trim(),
      notionPage: document.getElementById('notion-page').value.trim()
    };
  }

  validateAllFields(data) {
    let isValid = true;
    
    Object.keys(this.validators).forEach(fieldId => {
      let fieldValue;
      if (fieldId.startsWith('github-')) {
        fieldValue = data[fieldId.replace('github-', '')];
      } else if (fieldId === 'notion-token') {
        fieldValue = data.notionToken;
      } else if (fieldId === 'notion-page') {
        fieldValue = data.notionPage;
      }
      
      // Skip validation for notion fields if notion is not enabled
      if ((fieldId === 'notion-token' || fieldId === 'notion-page') && !data.notionEnabled) {
        return;
      }
      
      if (!this.validateField(fieldId, fieldValue)) {
        isValid = false;
      }
    });
    
    return isValid;
  }

  async testConnection() {
    const formData = this.collectFormData();
    
    if (!formData.token || !formData.owner || !formData.repo) {
      return;
    }

    this.showLoadingState(true, 'Testing connection...');
    
    try {
      // Test repository access
      const response = await fetch(`https://api.github.com/repos/${formData.owner}/${formData.repo}`, {
        headers: {
          'Authorization': `token ${formData.token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (response.ok) {
        const repoData = await response.json();
        
        // Fetch commit count
        this.showLoadingState(true, 'Fetching commit count...');
        const commitCount = await this.fetchCommitCount(formData.token, formData.owner, formData.repo);
        
        let notionStatus = 'Not configured';
        
        // Test Notion connection if enabled
        if (formData.notionEnabled && formData.notionToken) {
          this.showLoadingState(true, 'Testing Notion connection...');
          try {
            const notionResponse = await new Promise((resolve) => {
              chrome.runtime.sendMessage({
                action: 'testNotionConnection',
                token: formData.notionToken
              }, (response) => {
                console.log('Notion test response:', response);
                resolve(response);
              });
            });
            
            if (notionResponse && notionResponse.success && notionResponse.isValid) {
              notionStatus = 'Connected';
            } else {
              notionStatus = `Failed: ${notionResponse?.error || 'Invalid token'}`;
            }
          } catch (error) {
            console.error('Notion test error:', error);
            notionStatus = `Error: ${error.message}`;
          }
        }
        
        this.isConnected = true;
        this.updateConnectionStatus(true);
        
        // Update stored data
        const newData = {
          last_sync: new Date().toISOString(),
          commit_count: commitCount,
          repo_info: {
            full_name: repoData.full_name,
            private: repoData.private,
            default_branch: repoData.default_branch
          }
        };
        
        await chrome.storage.sync.set(newData);
        
        // Show success message with Notion status
        const validationDiv = document.getElementById('validation-messages');
        validationDiv.innerHTML = `
          <div class="validation-message success">
            ✅ GitHub connection successful!<br>
            📝 Notion: ${notionStatus}
          </div>
        `;
        
        // Update stored data and UI
        this.statusData = { ...this.statusData, ...newData };
        this.updateStatusDetails(this.statusData);
        this.updateAnalytics(this.statusData);
        
      } else if (response.status === 404) {
        throw new Error(`Repository not found. Check owner/repo names.`);
      } else if (response.status === 401) {
        throw new Error(`Invalid token or insufficient permissions.`);
      } else if (response.status === 403) {
        throw new Error(`Access forbidden. Check token permissions.`);
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      this.isConnected = false;
      this.updateConnectionStatus(false);
    } finally {
      this.showLoadingState(false);
    }
  }

  async quickConnectionCheck() {
    if (!this.config.token || !this.config.owner || !this.config.repo) {
      this.isConnected = false;
      this.updateConnectionStatus(false);
      return;
    }
    
    try {
      const response = await fetch(`https://api.github.com/repos/${this.config.owner}/${this.config.repo}`, {
        headers: {
          'Authorization': `token ${this.config.token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      this.isConnected = response.ok;
      this.updateConnectionStatus(this.isConnected);
      
      // If connected and we don't have commit count, fetch it silently
      if (this.isConnected && !this.statusData.commit_count) {
        const commitCount = await this.fetchCommitCount();
        if (commitCount > 0) {
          this.statusData.commit_count = commitCount;
          await chrome.storage.sync.set({ commit_count: commitCount });
          if (this.currentTab === 'status') {
            this.updateAnalytics(this.statusData);
          }
        }
      }
    } catch (error) {
      this.isConnected = false;
      this.updateConnectionStatus(false);
    }
  }

  updateConnectionStatus(connected = this.isConnected) {
    const statusIndicator = document.getElementById('connection-status');
    const statusText = statusIndicator.querySelector('.status-text');
    
    statusIndicator.classList.remove('connected', 'connecting');
    
    if (connected) {
      statusIndicator.classList.add('connected');
      statusText.textContent = 'Connected';
    } else {
      statusText.textContent = 'Not Connected';
    }
  }

  preloadStatusData() {
    // Preload and populate status data immediately
    this.updateStatusDetails(this.statusData);
    this.updateAnalytics(this.statusData);
    this.statusDataLoaded = true;
  }

  async refreshStatusData() {
    try {
      const data = await chrome.storage.sync.get([
        'last_sync', 'takeuforward_time', 'commit_count', 'last_activity', 'repo_info'
      ]);
      
      // Only fetch fresh commit count if we have a valid configuration and are connected
      if (this.config.token && this.config.owner && this.config.repo && this.isConnected) {
        this.showLoadingState(true, 'Updating commit count...');
        const commitCount = await this.fetchCommitCount();
        if (commitCount > 0) {
          data.commit_count = commitCount;
          await chrome.storage.sync.set({ commit_count: commitCount });
        }
        this.showLoadingState(false);
      }
      
      // Update stored data
      this.statusData = { ...this.statusData, ...data };
      
      this.updateStatusDetails(this.statusData);
      this.updateAnalytics(this.statusData);
      this.statusDataLoaded = true;
    } catch (error) {
      console.error('Failed to refresh status data:', error);
      this.showLoadingState(false);
    }
  }

  updateStatusDetails(data) {
    const apiStatus = document.getElementById('api-status');
    const repoStatus = document.getElementById('repo-status');
    const lastSync = document.getElementById('last-sync');
    const notionStatus = document.getElementById('notion-status');
    
    apiStatus.textContent = this.isConnected ? 'Connected' : 'Disconnected';
    apiStatus.style.color = this.isConnected ? 'var(--success)' : 'var(--error)';
    
    if (data.repo_info) {
      repoStatus.textContent = data.repo_info.full_name;
      repoStatus.style.color = 'var(--success)';
    } else {
      repoStatus.textContent = 'Not configured';
      repoStatus.style.color = 'var(--error)';
    }
    
    if (this.notionConfig.enabled) {
      notionStatus.textContent = this.notionConfig.token ? 'Enabled' : 'Token missing';
      notionStatus.style.color = this.notionConfig.token ? 'var(--success)' : 'var(--warning)';
    } else {
      notionStatus.textContent = 'Disabled';
      notionStatus.style.color = 'var(--text-tertiary)';
    }
    
    if (data.last_sync) {
      const syncDate = new Date(data.last_sync);
      lastSync.textContent = this.formatRelativeTime(syncDate);
    } else {
      lastSync.textContent = 'Never';
    }
  }

  updateAnalytics(data) {
    // Update time spent on TakeUforward
    const timeSpent = data.takeuforward_time || 0; // in minutes
    const hours = Math.floor(timeSpent / 60);
    const minutes = timeSpent % 60;
    document.getElementById('time-spent').textContent = `${hours}h ${minutes}m`;
    
    // Update commit count
    document.getElementById('commit-count').textContent = data.commit_count || '-';
  }

  async fetchCommitCount(token = this.config.token, owner = this.config.owner, repo = this.config.repo) {
    try {
      // First, try to get the default branch commits count
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=1&sha=HEAD`, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (response.ok) {
        const linkHeader = response.headers.get('Link');
        if (linkHeader) {
          // Parse the last page number from Link header
          const lastPageMatch = linkHeader.match(/page=(\d+)>; rel="last"/);
          if (lastPageMatch) {
            return parseInt(lastPageMatch[1]);
          }
        }
        
        // If no pagination but we have commits, try to get a more accurate count
        const commits = await response.json();
        if (commits.length === 0) {
          return 0;
        }
        
        // For repos with few commits, get all commits to count them
        const allCommitsResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=100`, {
          headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });
        
        if (allCommitsResponse.ok) {
          const allCommits = await allCommitsResponse.json();
          return allCommits.length;
        }
        
        return commits.length;
      }
      return 0;
    } catch (error) {
      console.error('Failed to fetch commit count:', error);
      return 0;
    }
  }

  async updateTakeUforwardTime() {
    try {
      // Get current time tracking data
      const data = await chrome.storage.sync.get(['takeuforward_time', 'last_session_start']);
      const currentTime = data.takeuforward_time || 0;
      
      // Add time from current session if there was one
      if (data.last_session_start) {
        const sessionStart = new Date(data.last_session_start);
        const sessionDuration = Math.floor((new Date() - sessionStart) / 60000); // in minutes
        const newTotalTime = currentTime + sessionDuration;
        
        await chrome.storage.sync.set({ 
          takeuforward_time: newTotalTime,
          last_session_start: null 
        });
        
        this.statusData.takeuforward_time = newTotalTime;
        if (this.currentTab === 'status') {
          this.updateAnalytics(this.statusData);
        }
      }
    } catch (error) {
      console.error('Failed to update TakeUforward time:', error);
    }
  }

  formatRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  }

  togglePasswordVisibility(fieldId) {
    const field = document.getElementById(fieldId);
    const toggleBtnId = fieldId === 'notion-token' ? 'toggle-notion-token' : 'toggle-token';
    const toggleBtn = document.getElementById(toggleBtnId);
    const icon = toggleBtn.querySelector('.toggle-icon');
    
    if (field.type === 'password') {
      field.type = 'text';
      icon.textContent = '🙈';
    } else {
      field.type = 'password';
      icon.textContent = '👁';
    }
  }

  toggleNotionConfig(enabled) {
    const notionConfig = document.getElementById('notion-config');
    if (enabled) {
      notionConfig.classList.remove('hidden');
    } else {
      notionConfig.classList.add('hidden');
    }
  }

  async createNotionDatabaseManually() {
    const formData = this.collectFormData();
    
    if (!formData.notionToken || !formData.notionPage) {
      const validationDiv = document.getElementById('validation-messages');
      validationDiv.innerHTML = `
        <div class="validation-message error">
          ❌ Please provide both Notion token and page name
        </div>
      `;
      return;
    }

    this.showLoadingState(true, 'Creating Notion database...');
    
    try {
      // Find the page by name using background script
      const pageResponse = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'findNotionPage',
          token: formData.notionToken,
          pageName: formData.notionPage
        }, resolve);
      });

      if (!pageResponse.success || !pageResponse.pageId) {
        const validationDiv = document.getElementById('validation-messages');
        validationDiv.innerHTML = `
          <div class="validation-message error">
            ❌ Page "${formData.notionPage}" not found. Make sure the name matches exactly.
          </div>
        `;
        this.showLoadingState(false);
        return;
      }

      // Create the database in the found page using background script
      const databaseResponse = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'createNotionDatabase',
          token: formData.notionToken,
          pageId: pageResponse.pageId
        }, resolve);
      });

      if (databaseResponse.success && databaseResponse.databaseId) {
        // Save the database ID
        await chrome.storage.sync.set({ notion_database_id: databaseResponse.databaseId });
        this.notionConfig.databaseId = databaseResponse.databaseId;
        
        const validationDiv = document.getElementById('validation-messages');
        validationDiv.innerHTML = `
          <div class="validation-message success">
            📝 Notion database created successfully!
          </div>
        `;
      } else {
        const validationDiv = document.getElementById('validation-messages');
        validationDiv.innerHTML = `
          <div class="validation-message error">
            ❌ Failed to create Notion database. ${databaseResponse.error || 'Check your permissions.'}
          </div>
        `;
      }
    } catch (error) {
      console.error('Error creating database:', error);
      const validationDiv = document.getElementById('validation-messages');
      validationDiv.innerHTML = `
        <div class="validation-message error">
          ❌ Error: ${error.message}
        </div>
      `;
    } finally {
      this.showLoadingState(false);
    }
  }

  handleBranchSelection(value) {
    const customBranchInput = document.getElementById('custom-branch');
    
    if (value === 'custom') {
      customBranchInput.classList.remove('hidden');
      customBranchInput.focus();
    } else {
      customBranchInput.classList.add('hidden');
    }
  }

  handleKeyboardShortcuts(e) {
    // Ctrl/Cmd + S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (this.currentTab === 'config') {
        this.saveConfiguration();
      }
    }
    
    // Ctrl/Cmd + T to test connection
    if ((e.ctrlKey || e.metaKey) && e.key === 't') {
      e.preventDefault();
      this.testConnection();
    }
    
    // Tab navigation with Ctrl/Cmd + 1,2,3,4
    if ((e.ctrlKey || e.metaKey) && ['1', '2', '3', '4'].includes(e.key)) {
      e.preventDefault();
      const tabs = ['config', 'revisions', 'status', 'help'];
      this.switchTab(tabs[parseInt(e.key) - 1]);
    }
  }

  showLoadingState(isLoading, message = 'Loading...') {
    const overlay = document.getElementById('loading-overlay');
    const loadingText = overlay.querySelector('.loading-text');
    
    if (isLoading) {
      loadingText.textContent = message;
      overlay.classList.remove('hidden');
    } else {
      overlay.classList.add('hidden');
    }
  }

  clearValidationMessages() {
    const validationDiv = document.getElementById('validation-messages');
    if (validationDiv) {
      validationDiv.innerHTML = '';
    }
  }

  updateVersionInfo() {
    // Get version from manifest if available
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      const manifest = chrome.runtime.getManifest();
      if (manifest && manifest.version) {
        document.querySelector('.version').textContent = `v${manifest.version}`;
      }
    }
  }

  // Revision System Methods
  async initializeRevisionSystem() {
    try {
      // Import revision system
      const script = document.createElement('script');
      script.src = '../revision-system.js';
      document.head.appendChild(script);
      
      script.onload = () => {
        this.revisionSystem = new window.RevisionSystem();
        console.log('Revision system initialized in popup');
      };
    } catch (error) {
      console.error('Failed to initialize revision system:', error);
    }
  }

  async loadRevisions() {
    if (!this.revisionSystem) {
      console.log('Revision system not initialized yet');
      return;
    }

    try {
      const listContainer = document.getElementById('revisions-list');
      listContainer.innerHTML = '<div class="loading-message">Loading...</div>';

      let problems = [];
      const stats = await this.revisionSystem.getRevisionStats();

      // Update stats
      document.getElementById('due-count').textContent = stats.dueForRevision;
      document.getElementById('total-problems').textContent = stats.totalProblems;

      // Update extension badge
      try {
        chrome.runtime.sendMessage({
          action: 'updateBadge',
          count: stats.dueForRevision
        });
      } catch (badgeError) {
        console.error('Error updating badge:', badgeError);
      }

      // Get problems based on filter
      switch (this.currentFilter) {
        case 'due':
          problems = await this.revisionSystem.getProblemsForRevision();
          break;
        case 'upcoming':
          const allProblems = await this.revisionSystem.getAllProblems();
          const now = new Date();
          problems = allProblems.filter(p => new Date(p.nextRevisionDate) > now);
          break;
        case 'all':
          problems = await this.revisionSystem.getAllProblems();
          break;
      }

      this.renderRevisionsList(problems);
    } catch (error) {
      console.error('Error loading revisions:', error);
      document.getElementById('revisions-list').innerHTML = 
        '<div class="empty-message">Error loading revisions</div>';
    }
  }

  renderRevisionsList(problems) {
    const listContainer = document.getElementById('revisions-list');
    
    if (problems.length === 0) {
      listContainer.innerHTML = '<div class="empty-message">No problems found</div>';
      return;
    }

    const problemsHtml = problems.map(problem => {
      const now = new Date();
      const revisionDate = new Date(problem.nextRevisionDate);
      const isOverdue = revisionDate < now && this.currentFilter !== 'upcoming';
      const isDue = Math.abs(revisionDate - now) < 24 * 60 * 60 * 1000; // Within 24 hours
      
      let statusClass = '';
      if (isOverdue) statusClass = 'overdue';
      else if (isDue) statusClass = 'due';

      const calendarLink = this.revisionSystem.generateCalendarLink(problem);
      
      return `
        <div class="revision-item ${statusClass}">
          <div class="revision-info">
            <div class="revision-name">${problem.name}</div>
            <div class="revision-details">
              <span class="difficulty-badge difficulty-${problem.difficultyLevel}">
                ${problem.difficultyLevel}
              </span>
              <span>${problem.mistakes} mistakes</span>
              <span>${problem.timeInMinutes}m</span>
              <span>Rev #${problem.revisionCount}</span>
            </div>
            <div class="revision-meta">
              <span>${this.revisionSystem.formatDate(problem.nextRevisionDate)}</span>
            </div>
          </div>
          <div class="revision-actions">
            <a href="${calendarLink}" target="_blank" class="revision-btn calendar">
              + Add to Calendar
            </a>
            <a href="${problem.link}" target="_blank" class="revision-btn visit">
              > Solve Problem
            </a>
          </div>
        </div>
      `;
    }).join('');
    
    listContainer.innerHTML = problemsHtml;
  }

  // Removed markRevisionComplete method - no longer needed

  setFilter(filter) {
    this.currentFilter = filter;
    
    // Update active filter button
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    
    // Reload with new filter
    this.loadRevisions();
  }

  async clearRevisions() {
    if (confirm('Are you sure you want to clear all revision data? This cannot be undone.')) {
      try {
        await this.revisionSystem.clearAllData();
        this.loadRevisions();
        console.log('All revision data cleared');
      } catch (error) {
        console.error('Error clearing revision data:', error);
      }
    }
  }
}

// Initialize popup when DOM is loaded
let popupController;
document.addEventListener('DOMContentLoaded', () => {
  popupController = new PopupController();
});

// Handle popup resize for better UX
window.addEventListener('resize', () => {
  document.body.style.height = 'auto';
});

// Add CSS for dynamic validation styles
const dynamicStyles = `
  .field-input.valid {
    border-color: var(--success);
    box-shadow: 0 0 0 2px rgba(63, 185, 80, 0.2);
  }
  
  .field-input.invalid {
    border-color: var(--error);
    box-shadow: 0 0 0 2px rgba(248, 81, 73, 0.2);
  }
  
  .form-group.has-error .field-label {
    color: var(--error);
  }
  
  .validation-message {
    font-size: 10px;
    margin-top: 4px;
    padding: 4px 8px;
    border-radius: var(--radius-small);
  }
`;

// Inject dynamic styles
const styleSheet = document.createElement('style');
styleSheet.textContent = dynamicStyles;
document.head.appendChild(styleSheet);