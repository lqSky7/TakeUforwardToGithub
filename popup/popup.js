class PopupController {
  constructor() {
    this.currentTab = "config";
    this.isConnected = false;
    this.config = {};
    this.notionConfig = {};
    this.craftConfig = {};
    this.debugMode = false;
    this.validators = {};
    this.debounceTimers = {};
    this.statusData = {};

    this.initializeEventListeners();
    this.initializeValidators();
    this.loadStoredConfiguration();
    this.initializeUI();
  }

  log(...args) {
    if (this.debugMode) {
      console.log(...args);
    }
  }

  logError(...args) {
    if (this.debugMode) {
      console.error(...args);
    }
  }

  initializeEventListeners() {
    // Tab navigation
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });

    // Form submission
    document.getElementById("config-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this.saveConfiguration();
    });

    // Test connection
    document.getElementById("test-connection").addEventListener("click", () => {
      this.testConnection();
    });

    // Password toggles
    document.getElementById("toggle-token").addEventListener("click", () => {
      this.togglePasswordVisibility("github-token");
    });

    document.getElementById("toggle-notion-token").addEventListener("click", () => {
      this.togglePasswordVisibility("notion-token");
    });

    // Notion toggle
    document.getElementById("notion-enabled").addEventListener("change", (e) => {
      this.toggleNotionConfig(e.target.checked);
    });

    document.getElementById("craft-enabled").addEventListener("change", (e) => {
      this.toggleCraftConfig(e.target.checked);
    });

    // Debug toggle
    document.getElementById("debug-enabled").addEventListener("change", (e) => {
      this.debugMode = e.target.checked;
      this.saveDebugMode(this.debugMode);
      this.log("Debug mode:", this.debugMode);
    });

    // Create Notion database
    document.getElementById("create-notion-database").addEventListener("click", () => {
      this.createNotionDatabaseManually();
    });

    // Real-time validation
    ["github-token", "github-owner", "github-repo", "notion-token", "notion-page", "craft-url"].forEach((fieldId) => {
      const field = document.getElementById(fieldId);
      if (field) {
        field.addEventListener("input", () => {
          this.clearValidationMessages();
          this.debounceValidation(fieldId, field.value);
        });
        field.addEventListener("blur", () => {
          this.validateField(fieldId, field.value);
        });
      }
    });
  }

  initializeValidators() {
    this.validators = {
      "github-token": {
        required: true,
        pattern: /^gh[ps]_[A-Za-z0-9_]{36,255}$/,
        message: "Invalid token format. Should start with ghp_ or ghs_",
      },
      "github-owner": {
        required: true,
        pattern: /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/,
        message: "Invalid username format",
      },
      "github-repo": {
        required: true,
        pattern: /^[a-zA-Z0-9._-]+$/,
        message: "Repository name can only contain letters, numbers, dots, hyphens, and underscores",
      },
      "notion-token": {
        required: false,
        pattern: /^ntn/,
        message: "Invalid Notion token format. Should start with ntn",
      },
      "notion-page": {
        required: false,
        pattern: /^.{1,}$/,
        message: "Page name cannot be empty",
      },
      "craft-url": {
        required: false,
        pattern: /^https:\/\/connect\.craft\.do\/links\/[^\/]+\/api\/v1$/,
        message: "Invalid Craft API URL format. Should be https://connect.craft.do/links/.../api/v1",
      },
    };
  }

  async loadStoredConfiguration() {
    try {
      const data = await chrome.storage.sync.get([
        "github_token",
        "github_owner",
        "github_repo",
        "github_branch",
        "notion_enabled",
        "notion_token",
        "notion_page",
        "notion_database_id",
        "craft_enabled",
        "craft_url",
        "last_sync",
        "repo_info",
        "commit_count",
        "debug_enabled",
      ]);

      this.debugMode = data.debug_enabled || false;

      this.config = {
        token: data.github_token || "",
        owner: data.github_owner || "",
        repo: data.github_repo || "",
        branch: data.github_branch || "main",
      };

      this.notionConfig = {
        enabled: data.notion_enabled || false,
        token: data.notion_token || "",
        page: data.notion_page || "",
        databaseId: data.notion_database_id || "",
      };

      this.craftConfig = {
        enabled: data.craft_enabled || false,
        url: data.craft_url || "",
      };

      this.statusData = data;

      this.populateFormFields();
      this.updateConnectionStatus();
      this.preloadStatusData();
    } catch (error) {
      this.logError("Failed to load config:", error);
    }
  }

  populateFormFields() {
    document.getElementById("github-token").value = this.config.token;
    document.getElementById("github-owner").value = this.config.owner;
    document.getElementById("github-repo").value = this.config.repo;
    document.getElementById("github-branch").value = this.config.branch;

    document.getElementById("notion-enabled").checked = this.notionConfig.enabled;
    document.getElementById("notion-token").value = this.notionConfig.token;
    document.getElementById("notion-page").value = this.notionConfig.page;
    document.getElementById("craft-enabled").checked = this.craftConfig.enabled;
    document.getElementById("craft-url").value = this.craftConfig.url;
    document.getElementById("debug-enabled").checked = this.debugMode;
    this.toggleNotionConfig(this.notionConfig.enabled);
    this.toggleCraftConfig(this.craftConfig.enabled);
  }

  initializeUI() {
    if (this.config.token && this.config.owner && this.config.repo) {
      this.quickConnectionCheck();
    }
    this.loadCraftTasks();
  }

  switchTab(tabName) {
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });

    document.querySelectorAll(".tab-panel").forEach((content) => {
      content.classList.toggle("active", content.id === tabName);
    });

    this.currentTab = tabName;
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
    if (!field) return;

    field.classList.remove("valid", "invalid");
    const existingMessage = field.parentElement.querySelector(".field-help");
    if (existingMessage) existingMessage.remove();

    if (!isValid && field.value.trim()) {
      field.classList.add("invalid");
      const helpDiv = document.createElement("div");
      helpDiv.className = "field-help error";
      helpDiv.textContent = message;
      field.parentElement.appendChild(helpDiv);
    } else if (isValid && field.value.trim()) {
      field.classList.add("valid");
    }
  }

  async saveConfiguration() {
    const formData = this.collectFormData();

    if (!this.validateAllFields(formData)) {
      return;
    }

    try {
      const saveData = {
        github_token: formData.token,
        github_owner: formData.owner,
        github_repo: formData.repo,
        github_branch: formData.branch,
        notion_enabled: formData.notionEnabled,
        notion_token: formData.notionToken,
        notion_page: formData.notionPage,
        craft_enabled: formData.craftEnabled,
        craft_url: formData.craftUrl,
      };

      await chrome.storage.sync.set(saveData);

      this.config = formData;
      this.notionConfig = {
        enabled: formData.notionEnabled,
        token: formData.notionToken,
        page: formData.notionPage,
        databaseId: this.notionConfig.databaseId,
      };
      this.craftConfig = {
        enabled: formData.craftEnabled,
        url: formData.craftUrl,
      };

      this.updateConnectionStatus();
      this.showMessage("Configuration saved successfully!", "success");

      setTimeout(() => this.testConnection(), 1000);
    } catch (error) {
      this.logError("Save error:", error);
      this.showMessage("Failed to save configuration", "error");
    }
  }

  collectFormData() {
    return {
      token: document.getElementById("github-token").value.trim(),
      owner: document.getElementById("github-owner").value.trim(),
      repo: document.getElementById("github-repo").value.trim(),
      branch: document.getElementById("github-branch").value.trim(),
      notionEnabled: document.getElementById("notion-enabled").checked,
      notionToken: document.getElementById("notion-token").value.trim(),
      notionPage: document.getElementById("notion-page").value.trim(),
      craftEnabled: document.getElementById("craft-enabled").checked,
      craftUrl: document.getElementById("craft-url").value.trim(),
    };
  }

  validateAllFields(data) {
    let isValid = true;

    Object.keys(this.validators).forEach((fieldId) => {
      let fieldValue;
      if (fieldId.startsWith("github-")) {
        fieldValue = data[fieldId.replace("github-", "")];
      } else if (fieldId === "notion-token") {
        fieldValue = data.notionToken;
      } else if (fieldId === "notion-page") {
        fieldValue = data.notionPage;
      } else if (fieldId === "craft-url") {
        fieldValue = data.craftUrl;
      }

      if ((fieldId === "notion-token" || fieldId === "notion-page") && !data.notionEnabled) {
        return;
      }

      if (fieldId === "craft-url" && !data.craftEnabled) {
        return;
      }

      // Check required when enabled
      if (fieldId === "notion-token" && data.notionEnabled && !fieldValue) {
        this.showFieldError(fieldId, "Notion token is required when enabled");
        isValid = false;
        return;
      }
      if (fieldId === "notion-page" && data.notionEnabled && !fieldValue) {
        this.showFieldError(fieldId, "Notion page name is required when enabled");
        isValid = false;
        return;
      }
      if (fieldId === "craft-url" && data.craftEnabled && !fieldValue) {
        this.showFieldError(fieldId, "Craft API URL is required when enabled");
        isValid = false;
        return;
      }

      if (!this.validateField(fieldId, fieldValue)) {
        isValid = false;
      }
    });

    return isValid;
  }

  async loadCraftTasks() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getCraftTasks' });
      if (response.success) {
        this.populateTasksList(response.tasks);
      } else {
        this.showTasksError('Failed to load tasks');
      }
    } catch (error) {
      this.logError('Error loading tasks:', error);
      this.showTasksError('Error loading tasks');
    }
  }

  populateTasksList(tasks) {
    const list = document.getElementById('tasks-list');
    list.innerHTML = '';

    if (Object.keys(tasks).length === 0) {
      list.innerHTML = '<p>No scheduled tasks.</p>';
      return;
    }

    for (const [problemName, data] of Object.entries(tasks)) {
      const taskItem = document.createElement('div');
      taskItem.className = 'task-item';
      taskItem.innerHTML = `
        <div class="task-info">
          <h4>${problemName}</h4>
          <a href="${data.link}" target="_blank">${data.link}</a>
          <span>${data.taskIds.length} scheduled revisions</span>
        </div>
        <button class="btn btn-danger delete-task" data-problem="${problemName}">Delete All</button>
      `;
      list.appendChild(taskItem);
    }

    // Add event listeners for delete buttons
    document.querySelectorAll('.delete-task').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const problemName = e.target.dataset.problem;
        this.deleteCraftTasks(problemName);
      });
    });
  }

  async deleteCraftTasks(problemName) {
    if (!confirm(`Delete all revision tasks for "${problemName}"?`)) return;

    try {
      const response = await chrome.runtime.sendMessage({ action: 'deleteCraftTasks', problemName });
      if (response.success) {
        this.showMessage('Tasks deleted successfully!', 'success');
        this.loadCraftTasks(); // Reload list
      } else {
        this.showMessage('Failed to delete tasks', 'error');
      }
    } catch (error) {
      this.logError('Error deleting tasks:', error);
      this.showMessage('Error deleting tasks', 'error');
    }
  }

  showTasksError(message) {
    const list = document.getElementById('tasks-list');
    list.innerHTML = `<p class="error">${message}</p>`;
  }

  async testConnection() {
    const formData = this.collectFormData();

    if (!formData.token || !formData.owner || !formData.repo) {
      return;
    }

    try {
      const response = await fetch(`https://api.github.com/repos/${formData.owner}/${formData.repo}`, {
        headers: {
          Authorization: `token ${formData.token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (response.ok) {
        const repoData = await response.json();
        const commitCount = await this.fetchCommitCount(formData.token, formData.owner, formData.repo);

        let notionStatus = "Not configured";
        if (formData.notionEnabled && formData.notionToken) {
          try {
            const notionResponse = await new Promise((resolve) => {
              chrome.runtime.sendMessage(
                {
                  action: "testNotionConnection",
                  token: formData.notionToken,
                },
                (response) => resolve(response)
              );
            });

            notionStatus = notionResponse?.success && notionResponse?.isValid ? "Connected" : "Failed";
          } catch (error) {
            console.error("Notion test error:", error);
            notionStatus = "Error";
          }
        }

        this.isConnected = true;
        this.updateConnectionStatus(true);

        const newData = {
          last_sync: new Date().toISOString(),
          commit_count: commitCount,
          repo_info: {
            full_name: repoData.full_name,
            private: repoData.private,
            default_branch: repoData.default_branch,
          },
        };

        await chrome.storage.sync.set(newData);
        this.statusData = { ...this.statusData, ...newData };
        this.updateStatusTab();

        this.showMessage(`✅ Connected! Notion: ${notionStatus}`, "success");
      } else if (response.status === 401) {
        throw new Error("Invalid token or insufficient permissions.");
      } else if (response.status === 404) {
        throw new Error("Repository not found.");
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      this.isConnected = false;
      this.updateConnectionStatus(false);
      this.showMessage(`❌ ${error.message}`, "error");
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
          Authorization: `token ${this.config.token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      this.isConnected = response.ok;
      this.updateConnectionStatus(this.isConnected);
    } catch (error) {
      this.isConnected = false;
      this.updateConnectionStatus(false);
    }
  }

  updateConnectionStatus(connected = this.isConnected) {
    const status = document.getElementById("status");
    const statusDot = document.getElementById("status-dot");
    const statusText = document.getElementById("status-text");

    statusDot.classList.toggle("connected", connected);
    statusText.textContent = connected ? "Connected" : "Disconnected";
  }

  preloadStatusData() {
    this.updateStatusTab();
  }

  updateStatusTab() {
    const apiStatus = document.getElementById("api-status");
    const repoStatus = document.getElementById("repo-status");
    const commitCount = document.getElementById("commit-count");
    const lastSync = document.getElementById("last-sync");
    const notionStatus = document.getElementById("notion-status");

    if (!apiStatus) return;

    apiStatus.textContent = this.isConnected ? "Connected" : "Disconnected";
    repoStatus.textContent = this.statusData.repo_info ? this.statusData.repo_info.full_name : "Unknown";
    commitCount.textContent = this.statusData.commit_count || "-";

    if (this.statusData.last_sync) {
      const syncDate = new Date(this.statusData.last_sync);
      lastSync.textContent = this.formatRelativeTime(syncDate);
    } else {
      lastSync.textContent = "Never";
    }

    notionStatus.textContent = this.notionConfig.enabled ? (this.notionConfig.token ? "Enabled" : "Token missing") : "Disabled";
  }

  async fetchCommitCount(token = this.config.token, owner = this.config.owner, repo = this.config.repo) {
    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`, {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (response.ok) {
        const linkHeader = response.headers.get("Link");
        if (linkHeader) {
          const lastPageMatch = linkHeader.match(/page=(\d+)>; rel="last"/);
          if (lastPageMatch) return parseInt(lastPageMatch[1]);
        }
        return 0;
      }
      return 0;
    } catch (error) {
      console.error("Failed to fetch commit count:", error);
      return 0;
    }
  }

  formatRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  }

  togglePasswordVisibility(fieldId) {
    const field = document.getElementById(fieldId);
    const btn = fieldId === "notion-token" ? document.getElementById("toggle-notion-token") : document.getElementById("toggle-token");

    if (field.type === "password") {
      field.type = "text";
      btn.textContent = "Hide";
    } else {
      field.type = "password";
      btn.textContent = "Show";
    }
  }

  toggleNotionConfig(enabled) {
    const notionConfig = document.getElementById("notion-config");
    const notionRow = document.getElementById("notion-row");
    if (enabled) {
      notionConfig.classList.remove("hidden");
      notionRow.classList.remove("hidden");
    } else {
      notionConfig.classList.add("hidden");
      notionRow.classList.add("hidden");
    }
  }

  toggleCraftConfig(enabled) {
    const craftConfig = document.getElementById("craft-config");
    if (enabled) {
      craftConfig.classList.remove("hidden");
    } else {
      craftConfig.classList.add("hidden");
    }
  }

  async createNotionDatabaseManually() {
    const formData = this.collectFormData();

    if (!formData.notionToken || !formData.notionPage) {
      this.showMessage("❌ Please provide both Notion token and page name", "error");
      return;
    }

    try {
      const pageResponse = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            action: "findNotionPage",
            token: formData.notionToken,
            pageName: formData.notionPage,
          },
          resolve
        );
      });

      if (!pageResponse.success || !pageResponse.pageId) {
        this.showMessage(`❌ Page "${formData.notionPage}" not found`, "error");
        return;
      }

      const databaseResponse = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            action: "createNotionDatabase",
            token: formData.notionToken,
            pageId: pageResponse.pageId,
          },
          resolve
        );
      });

      if (databaseResponse.success && databaseResponse.databaseId) {
        await chrome.storage.sync.set({ notion_database_id: databaseResponse.databaseId });
        this.notionConfig.databaseId = databaseResponse.databaseId;
        this.showMessage("📝 Notion database created successfully!", "success");
      } else {
        this.showMessage(`❌ Failed to create Notion database: ${databaseResponse.error}`, "error");
      }
    } catch (error) {
      console.error("Error creating database:", error);
      this.showMessage(`❌ Error: ${error.message}`, "error");
    }
  }

  showMessage(message, type = "info") {
    const messagesDiv = document.getElementById("validation-messages");
    if (!messagesDiv) return;

    const messageEl = document.createElement("div");
    messageEl.className = `message ${type}`;
    messageEl.textContent = message;
    messagesDiv.appendChild(messageEl);

    setTimeout(() => messageEl.remove(), 4000);
  }

  clearValidationMessages() {
    const messagesDiv = document.getElementById("validation-messages");
    if (messagesDiv) messagesDiv.innerHTML = "";
  }
}

let popupController;

document.addEventListener("DOMContentLoaded", () => {
  popupController = new PopupController();
});
