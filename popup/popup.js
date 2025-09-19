class PopupController {
  constructor() {
    this.currentTab = "config";
    this.isConnected = false;
    this.config = {};
    this.notionConfig = {};
    this.validators = {};
    this.debounceTimers = {};
    this.statusDataLoaded = false;
    this.statusData = {};
    this.tasks = [];
    this.scheduledTasks = [];

    this.initializeEventListeners();
    this.initializeValidators();
    this.loadStoredConfiguration();
    this.initializeUI();
    this.loadPredictionScript();
  }

  initializeEventListeners() {
    // Tab navigation
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });

    // Form submission
    document
      .getElementById("github-config-form")
      .addEventListener("submit", (e) => {
        e.preventDefault();
        this.saveConfiguration();
      });

    // Test connection
    document.getElementById("test-connection").addEventListener("click", () => {
      this.testConnection();
    });

    // Password toggle
    document.getElementById("toggle-token").addEventListener("click", () => {
      this.togglePasswordVisibility("github-token");
    });

    // Prediction controls
    document
      .getElementById("generate-schedule")
      ?.addEventListener("click", () => {
        this.generateSchedule();
      });

    document
      .getElementById("clear-schedule")
      ?.addEventListener("click", async () => {
        await this.clearScheduledTasks();
        await this.displayScheduledTasks(); // This will show "No tasks" message
        this.updateScheduledCount();
        this.showPredictionResults(false);
      });

    document.getElementById("focus-mode")?.addEventListener("change", () => {
      this.updateFocusModeDescription();
    });

    // Ignored tasks management
    document.getElementById("manage-ignored")?.addEventListener("click", () => {
      this.showIgnoredTasks();
    });

    document.getElementById("close-ignored")?.addEventListener("click", () => {
      this.hideIgnoredTasks();
    });

    // Notion password toggle
    document
      .getElementById("toggle-notion-token")
      .addEventListener("click", () => {
        this.togglePasswordVisibility("notion-token");
      });

    // Notion toggle
    document
      .getElementById("notion-enabled")
      .addEventListener("change", (e) => {
        this.toggleNotionConfig(e.target.checked);
      });

    // Create Notion database button
    document
      .getElementById("create-notion-database")
      .addEventListener("click", () => {
        this.createNotionDatabaseManually();
      });

    // Branch selector
    document.getElementById("github-branch").addEventListener("change", (e) => {
      this.handleBranchSelection(e.target.value);
    });

    // Real-time validation
    [
      "github-token",
      "github-owner",
      "github-repo",
      "notion-token",
      "notion-page",
    ].forEach((fieldId) => {
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

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      this.handleKeyboardShortcuts(e);
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
        message:
          "Repository name can only contain letters, numbers, dots, hyphens, and underscores",
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
        "last_sync",
        "last_activity",
        "repo_info",
      ]);

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

      // Store status data for later use
      this.statusData = data;

      this.populateFormFields();
      this.updateConnectionStatus();
      this.preloadStatusData();
      this.updateAnalytics(data);
    } catch (error) {
      console.error("Failed to load config:", error);
    }
  }

  populateFormFields() {
    document.getElementById("github-token").value = this.config.token;
    document.getElementById("github-owner").value = this.config.owner;
    document.getElementById("github-repo").value = this.config.repo;

    const branchSelect = document.getElementById("github-branch");
    const customBranchInput = document.getElementById("custom-branch");

    if (["main", "master", "solutions"].includes(this.config.branch)) {
      branchSelect.value = this.config.branch;
      customBranchInput.classList.add("hidden");
    } else {
      branchSelect.value = "custom";
      customBranchInput.value = this.config.branch;
      customBranchInput.classList.remove("hidden");
    }

    // Populate Notion fields
    document.getElementById("notion-enabled").checked =
      this.notionConfig.enabled;
    document.getElementById("notion-token").value = this.notionConfig.token;
    document.getElementById("notion-page").value = this.notionConfig.page;
    this.toggleNotionConfig(this.notionConfig.enabled);
  }

  initializeUI() {
    // Update version info
    this.updateVersionInfo();

    // Check initial connection status
    if (this.config.token && this.config.owner && this.config.repo) {
      this.quickConnectionCheck();
    }
  }

  switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll(".tab-content").forEach((content) => {
      content.classList.toggle("active", content.id === `${tabName}-tab`);
    });

    this.currentTab = tabName;

    // Only refresh status data if it hasn't been loaded yet
    if (tabName === "status" && !this.statusDataLoaded) {
      this.refreshStatusData();
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
    const fieldGroup = field.closest(".form-group");

    // Remove existing validation classes
    field.classList.remove("valid", "invalid");
    fieldGroup.classList.remove("has-error");

    // Remove existing validation message
    const existingMessage = fieldGroup.querySelector(".validation-message");
    if (existingMessage) {
      existingMessage.remove();
    }

    if (!isValid && field.value.trim()) {
      field.classList.add("invalid");
      fieldGroup.classList.add("has-error");

      const validationDiv = document.createElement("div");
      validationDiv.className = "validation-message error";
      validationDiv.textContent = message;
      validationDiv.style.filter = "blur(5px)";
      validationDiv.style.opacity = "0";
      fieldGroup.appendChild(validationDiv);

      // Trigger unblur animation
      setTimeout(() => {
        validationDiv.style.transition =
          "all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
        validationDiv.style.filter = "blur(0px)";
        validationDiv.style.opacity = "1";
      }, 10);
    } else if (isValid && field.value.trim()) {
      field.classList.add("valid");
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
        notion_page: formData.notionPage,
      };

      await chrome.storage.sync.set(saveData);

      this.config = formData;
      this.notionConfig = {
        enabled: formData.notionEnabled,
        token: formData.notionToken,
        page: formData.notionPage,
        databaseId: this.notionConfig.databaseId,
      };

      this.updateConnectionStatus();

      // Auto-test connection after save
      setTimeout(() => this.testConnection(), 1000);
    } catch (error) {
      console.error("Save error:", error);
    } finally {
      this.showLoadingState(false);
    }
  }

  collectFormData() {
    const branchSelect = document.getElementById("github-branch");
    const customBranch = document.getElementById("custom-branch");

    return {
      token: document.getElementById("github-token").value.trim(),
      owner: document.getElementById("github-owner").value.trim(),
      repo: document.getElementById("github-repo").value.trim(),
      branch:
        branchSelect.value === "custom"
          ? customBranch.value.trim()
          : branchSelect.value,
      notionEnabled: document.getElementById("notion-enabled").checked,
      notionToken: document.getElementById("notion-token").value.trim(),
      notionPage: document.getElementById("notion-page").value.trim(),
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
      }

      // Skip validation for notion fields if notion is not enabled
      if (
        (fieldId === "notion-token" || fieldId === "notion-page") &&
        !data.notionEnabled
      ) {
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

    this.showLoadingState(true, "Testing connection...");

    try {
      // Test repository access
      const response = await fetch(
        `https://api.github.com/repos/${formData.owner}/${formData.repo}`,
        {
          headers: {
            Authorization: `token ${formData.token}`,
            Accept: "application/vnd.github.v3+json",
          },
        },
      );

      if (response.ok) {
        const repoData = await response.json();

        // Fetch commit count
        this.showLoadingState(true, "Fetching commit count...");
        const commitCount = await this.fetchCommitCount(
          formData.token,
          formData.owner,
          formData.repo,
        );

        let notionStatus = "Not configured";

        // Test Notion connection if enabled
        if (formData.notionEnabled && formData.notionToken) {
          this.showLoadingState(true, "Testing Notion connection...");
          try {
            const notionResponse = await new Promise((resolve) => {
              chrome.runtime.sendMessage(
                {
                  action: "testNotionConnection",
                  token: formData.notionToken,
                },
                (response) => {
                  console.log("Notion test response:", response);
                  resolve(response);
                },
              );
            });

            if (
              notionResponse &&
              notionResponse.success &&
              notionResponse.isValid
            ) {
              notionStatus = "Connected";
            } else {
              notionStatus = `Failed: ${notionResponse?.error || "Invalid token"}`;
            }
          } catch (error) {
            console.error("Notion test error:", error);
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
            default_branch: repoData.default_branch,
          },
        };

        await chrome.storage.sync.set(newData);

        // Show success message with Notion status
        const validationDiv = document.getElementById("validation-messages");
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
      const response = await fetch(
        `https://api.github.com/repos/${this.config.owner}/${this.config.repo}`,
        {
          headers: {
            Authorization: `token ${this.config.token}`,
            Accept: "application/vnd.github.v3+json",
          },
        },
      );

      this.isConnected = response.ok;
      this.updateConnectionStatus(this.isConnected);

      // If connected and we don't have commit count, fetch it silently
      if (this.isConnected && !this.statusData.commit_count) {
        const commitCount = await this.fetchCommitCount();
        if (commitCount > 0) {
          this.statusData.commit_count = commitCount;
          await chrome.storage.sync.set({
            commit_count: commitCount,
          });
          if (this.currentTab === "status") {
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
    const statusIndicator = document.getElementById("connection-status");
    const statusText = statusIndicator.querySelector(".status-text");

    statusIndicator.classList.remove("connected", "connecting");

    if (connected) {
      statusIndicator.classList.add("connected");
      statusText.textContent = "Connected";
    } else {
      statusText.textContent = "Not Connected";
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
        "last_sync",
        "commit_count",
        "last_activity",
        "repo_info",
      ]);

      // Only fetch fresh commit count if we have a valid configuration and are connected
      if (
        this.config.token &&
        this.config.owner &&
        this.config.repo &&
        this.isConnected
      ) {
        this.showLoadingState(true, "Updating commit count...");
        const commitCount = await this.fetchCommitCount();
        if (commitCount > 0) {
          data.commit_count = commitCount;
          await chrome.storage.sync.set({
            commit_count: commitCount,
          });
        }
        this.showLoadingState(false);
      }

      // Update stored data
      this.statusData = { ...this.statusData, ...data };

      this.updateStatusDetails(this.statusData);
      this.updateAnalytics(this.statusData);
      this.statusDataLoaded = true;
    } catch (error) {
      console.error("Failed to refresh status data:", error);
      this.showLoadingState(false);
    }
  }

  updateStatusDetails(data) {
    const apiStatus = document.getElementById("api-status");
    const repoStatus = document.getElementById("repo-status");
    const lastSync = document.getElementById("last-sync");
    const notionStatus = document.getElementById("notion-status");

    apiStatus.textContent = this.isConnected ? "Connected" : "Disconnected";
    apiStatus.style.color = this.isConnected
      ? "var(--success)"
      : "var(--error)";

    if (data.repo_info) {
      repoStatus.textContent = data.repo_info.full_name;
      repoStatus.style.color = "var(--success)";
    } else {
      repoStatus.textContent = "Not configured";
      repoStatus.style.color = "var(--error)";
    }

    if (this.notionConfig.enabled) {
      notionStatus.textContent = this.notionConfig.token
        ? "Enabled"
        : "Token missing";
      notionStatus.style.color = this.notionConfig.token
        ? "var(--success)"
        : "var(--warning)";
    } else {
      notionStatus.textContent = "Disabled";
      notionStatus.style.color = "var(--text-tertiary)";
    }

    if (data.last_sync) {
      const syncDate = new Date(data.last_sync);
      lastSync.textContent = this.formatRelativeTime(syncDate);
    } else {
      lastSync.textContent = "Never";
    }
  }

  updateAnalytics(data) {
    // Update commit count
    document.getElementById("commit-count").textContent =
      data.commit_count || "-";
  }

  async fetchCommitCount(
    token = this.config.token,
    owner = this.config.owner,
    repo = this.config.repo,
  ) {
    try {
      // First, try to get the default branch commits count
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1&sha=HEAD`,
        {
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
        },
      );

      if (response.ok) {
        const linkHeader = response.headers.get("Link");
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
        const allCommitsResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/commits?per_page=100`,
          {
            headers: {
              Authorization: `token ${token}`,
              Accept: "application/vnd.github.v3+json",
            },
          },
        );

        if (allCommitsResponse.ok) {
          const allCommits = await allCommitsResponse.json();
          return allCommits.length;
        }

        return commits.length;
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
    const toggleBtnId =
      fieldId === "notion-token" ? "toggle-notion-token" : "toggle-token";
    const toggleBtn = document.getElementById(toggleBtnId);
    const icon = toggleBtn.querySelector(".toggle-icon");

    if (field.type === "password") {
      field.type = "text";
      icon.textContent = "🙈";
    } else {
      field.type = "password";
      icon.textContent = "👁";
    }
  }

  toggleNotionConfig(enabled) {
    const notionConfig = document.getElementById("notion-config");
    if (enabled) {
      notionConfig.classList.remove("hidden");
    } else {
      notionConfig.classList.add("hidden");
    }
  }

  async createNotionDatabaseManually() {
    const formData = this.collectFormData();

    if (!formData.notionToken || !formData.notionPage) {
      const validationDiv = document.getElementById("validation-messages");
      validationDiv.innerHTML = `
        <div class="validation-message error">
          ❌ Please provide both Notion token and page name
        </div>
      `;
      return;
    }

    this.showLoadingState(true, "Creating Notion database...");

    try {
      // Find the page by name using background script
      const pageResponse = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            action: "findNotionPage",
            token: formData.notionToken,
            pageName: formData.notionPage,
          },
          resolve,
        );
      });

      if (!pageResponse.success || !pageResponse.pageId) {
        const validationDiv = document.getElementById("validation-messages");
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
        chrome.runtime.sendMessage(
          {
            action: "createNotionDatabase",
            token: formData.notionToken,
            pageId: pageResponse.pageId,
          },
          resolve,
        );
      });

      if (databaseResponse.success && databaseResponse.databaseId) {
        // Save the database ID
        await chrome.storage.sync.set({
          notion_database_id: databaseResponse.databaseId,
        });
        this.notionConfig.databaseId = databaseResponse.databaseId;

        const validationDiv = document.getElementById("validation-messages");
        validationDiv.innerHTML = `
          <div class="validation-message success">
            📝 Notion database created successfully!
          </div>
        `;
      } else {
        const validationDiv = document.getElementById("validation-messages");
        validationDiv.innerHTML = `
          <div class="validation-message error">
            ❌ Failed to create Notion database. ${databaseResponse.error || "Check your permissions."}
          </div>
        `;
      }
    } catch (error) {
      console.error("Error creating database:", error);
      const validationDiv = document.getElementById("validation-messages");
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
    const customBranchInput = document.getElementById("custom-branch");

    if (value === "custom") {
      customBranchInput.classList.remove("hidden");
      customBranchInput.focus();
    } else {
      customBranchInput.classList.add("hidden");
    }
  }

  handleKeyboardShortcuts(e) {
    // Ctrl/Cmd + S to save
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      if (this.currentTab === "config") {
        this.saveConfiguration();
      }
    }

    // Ctrl/Cmd + T to test connection
    if ((e.ctrlKey || e.metaKey) && e.key === "t") {
      e.preventDefault();
      this.testConnection();
    }

    // Tab navigation with Ctrl/Cmd + 1,2,3
    if ((e.ctrlKey || e.metaKey) && ["1", "2", "3"].includes(e.key)) {
      e.preventDefault();
      const tabs = ["config", "status", "help"];
      this.switchTab(tabs[parseInt(e.key) - 1]);
    }
  }

  showLoadingState(isLoading, message = "Loading...") {
    const overlay = document.getElementById("loading-overlay");
    const loadingText = overlay.querySelector(".loading-text");

    if (isLoading) {
      loadingText.textContent = message;
      overlay.classList.remove("hidden");
    } else {
      overlay.classList.add("hidden");
    }
  }

  clearValidationMessages() {
    const validationDiv = document.getElementById("validation-messages");
    if (validationDiv) {
      validationDiv.innerHTML = "";
    }
  }

  updateVersionInfo() {
    // Get version from manifest if available
    if (typeof chrome !== "undefined" && chrome.runtime) {
      const manifest = chrome.runtime.getManifest();
      if (manifest && manifest.version) {
        document.querySelector(".version").textContent = `v${manifest.version}`;
      }
    }
  }

  // Prediction functionality methods
  async loadPredictionScript() {
    try {
      // Load prediction.js script dynamically
      const script = document.createElement("script");
      script.src = "prediction.js";
      script.onload = () => {
        console.log("Prediction script loaded");
        // Give it a small delay to ensure functions are available
        setTimeout(() => {
          this.loadTaskData();
        }, 100);
      };
      script.onerror = (error) => {
        console.error("Failed to load prediction script:", error);
        // Try to load task data anyway
        this.loadTaskData();
      };
      document.head.appendChild(script);
    } catch (error) {
      console.error("Error loading prediction script:", error);
      // Fallback to loading task data
      this.loadTaskData();
    }
  }

  async loadTaskData() {
    try {
      const response = await fetch("../data.json");
      if (!response.ok) {
        throw new Error(`Failed to load tasks: ${response.status}`);
      }
      this.tasks = await response.json();

      // Load saved ignore status
      await this.loadTaskIgnoreStatus();

      console.log(`Loaded ${this.tasks.length} tasks for prediction`);
      this.updateTaskStatistics();
      this.populateFilterOptions();

      // Load and display saved scheduled tasks if they exist
      const hasSavedTasks = await this.loadScheduledTasks();
      if (hasSavedTasks && this.scheduledTasks.length > 0) {
        await this.displayScheduledTasks();
        this.updateScheduledCount();
        this.showPredictionResults(true);
      }

      // Update button text based on whether we have saved tasks
      this.updateGenerateButtonText();
    } catch (error) {
      console.error("Error loading task data:", error);
      this.showPredictionError(`Failed to load tasks: ${error.message}`);
    }
  }

  populateFilterOptions() {
    if (!this.tasks.length) return;

    const grandparentSelect = document.getElementById("grandparent-filter");
    const parentSelect = document.getElementById("parent-filter");

    if (!grandparentSelect || !parentSelect) return;

    // Clear existing options except "All"
    grandparentSelect.innerHTML = '<option value="">All Categories</option>';
    parentSelect.innerHTML = '<option value="">All Topics</option>';

    const grandparentSet = new Set();
    const parentMap = new Map(); // Map grandparent -> Set of parent topics

    // Collect unique values and build relationships
    this.tasks.forEach(task => {
      if (task.grandparent) {
        grandparentSet.add(task.grandparent);

        // Build mapping of grandparent to parent topics
        if (task.parent_topic) {
          if (!parentMap.has(task.grandparent)) {
            parentMap.set(task.grandparent, new Set());
          }
          parentMap.get(task.grandparent).add(task.parent_topic);
        }
      }
    });

    // Store the parent map for later use
    this.parentTopicMap = parentMap;

    // Add options to grandparent filter
    Array.from(grandparentSet).sort().forEach(value => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      grandparentSelect.appendChild(option);
    });

    // Initially populate all parent topics
    this.updateParentTopicOptions();

    // Add event listener for grandparent changes
    grandparentSelect.addEventListener("change", () => {
      this.updateParentTopicOptions();
    });
  }

  updateParentTopicOptions() {
    const grandparentSelect = document.getElementById("grandparent-filter");
    const parentSelect = document.getElementById("parent-filter");

    if (!parentSelect || !this.parentTopicMap) return;

    // Clear existing options except "All"
    parentSelect.innerHTML = '<option value="">All Topics</option>';

    const selectedGrandparents = Array.from(grandparentSelect.selectedOptions)
      .map(option => option.value)
      .filter(value => value !== ""); // Remove empty "All Categories" option

    const parentTopics = new Set();

    if (selectedGrandparents.length === 0) {
      // No specific grandparents selected, show all parent topics
      this.parentTopicMap.forEach(topics => {
        topics.forEach(topic => parentTopics.add(topic));
      });
    } else {
      // Show only parent topics for selected grandparents
      selectedGrandparents.forEach(grandparent => {
        const topics = this.parentTopicMap.get(grandparent);
        if (topics) {
          topics.forEach(topic => parentTopics.add(topic));
        }
      });
    }

    // Add options to parent filter
    Array.from(parentTopics).sort().forEach(value => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      parentSelect.appendChild(option);
    });
  }

  updateTaskStatistics() {
    if (!this.tasks.length) return;

    // Calculate statistics directly
    const total = this.tasks.length;
    const ignored = this.tasks.filter((task) => task.ignored).length;
    const active = total - ignored;
    const solved = this.tasks.filter(
      (task) => task.solved.value === true && !task.ignored,
    ).length;
    const unsolved = this.tasks.filter(
      (task) => task.solved.value === false && !task.ignored,
    ).length;

    document.getElementById("total-tasks").textContent = total;
    document.getElementById("active-tasks").textContent = active;
    document.getElementById("solved-tasks").textContent = solved;
    document.getElementById("unsolved-tasks").textContent = unsolved;
    document.getElementById("ignored-tasks").textContent = ignored;

    // Show manage ignored button if there are ignored tasks
    const manageIgnoredBtn = document.getElementById("manage-ignored");
    if (manageIgnoredBtn) {
      manageIgnoredBtn.style.display = ignored > 0 ? "block" : "none";
    }

    // Show statistics section
    const statsSection = document.getElementById("prediction-stats");
    if (statsSection) {
      statsSection.style.display = "block";
    }
  }

  updateFocusModeDescription() {
    const focusMode = parseInt(document.getElementById("focus-mode").value);
    const descriptions = {
      0: "100% revision problems only",
      1: "70% revision problems, 30% new problems",
      2: "30% revision problems, 70% new problems",
      3: "100% new problems only",
    };

    const descElement = document.getElementById("focus-description");
    if (descElement) {
      descElement.textContent = descriptions[focusMode] || descriptions[1];
    }
  }

  async generateSchedule() {
    if (!this.tasks.length) {
      this.showPredictionError(
        "No tasks loaded. Please try refreshing the extension.",
      );
      return;
    }

    // Check if prediction functions are available
    if (
      typeof window.PredictionAlgorithm !== "object" ||
      typeof window.PredictionAlgorithm.scheduleToday !== "function"
    ) {
      this.showPredictionError(
        "Prediction algorithm not loaded. Please try refreshing.",
      );
      return;
    }

    try {
      this.showPredictionLoading(true);
      this.hidePredictionError();

      const targetCount =
        parseInt(document.getElementById("target-count").value) || 10;
      const focusMode =
        parseInt(document.getElementById("focus-mode").value) || 1;

      // Add small delay to show loading state
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Generate schedule using the prediction algorithm
      const grandparentSelect = document.getElementById("grandparent-filter");
      const selectedGrandparents = Array.from(grandparentSelect.selectedOptions)
        .map(option => option.value)
        .filter(value => value !== ""); // Remove empty "All Categories" option

      const filters = {
        grandparent: selectedGrandparents.length > 0 ? selectedGrandparents : null,
        parent_topic: document.getElementById("parent-filter").value || null,
      };
      this.scheduledTasks = window.PredictionAlgorithm.scheduleToday(
        this.tasks,
        targetCount,
        focusMode,
        filters,
      );

      // Save the generated schedule to storage
      await this.saveScheduledTasks();

      // Update button text to indicate schedule is saved
      this.updateGenerateButtonText();

      await this.displayScheduledTasks();
      this.updateScheduledCount();
    } catch (error) {
      console.error("Error generating schedule:", error);
      this.showPredictionError(`Schedule generation failed: ${error.message}`);
    } finally {
      this.showPredictionLoading(false);
    }
  }

  async displayScheduledTasks() {
    const taskList = document.getElementById("task-list");
    const timestampElement = document.getElementById("schedule-timestamp");
    if (!taskList) return;

    taskList.innerHTML = "";

    if (this.scheduledTasks.length === 0) {
      taskList.innerHTML = `
        <div class="task-item">
          <span class="task-name">No tasks to schedule with current settings.</span>
        </div>
      `;
      if (timestampElement) timestampElement.textContent = "";
      this.showPredictionResults(true);
      return;
    }

    // Show timestamp if we have saved schedule data
    if (timestampElement) {
      try {
        const data = await chrome.storage.local.get(["scheduledTasksData"]);
        if (data.scheduledTasksData && data.scheduledTasksData.generatedAt) {
          const generatedAt = new Date(data.scheduledTasksData.generatedAt);
          const now = new Date();
          const diffMs = now - generatedAt;
          const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
          const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

          let timeString = "";
          if (diffHours > 0) {
            timeString = `${diffHours}h ${diffMinutes}m ago`;
          } else if (diffMinutes > 0) {
            timeString = `${diffMinutes}m ago`;
          } else {
            timeString = "just now";
          }

          timestampElement.textContent = `(generated ${timeString})`;
        } else {
          timestampElement.textContent = "";
        }
      } catch (error) {
        console.error("Error loading timestamp:", error);
        timestampElement.textContent = "";
      }
    }

    this.scheduledTasks.forEach((task, index) => {
      const taskItem = document.createElement("div");
      taskItem.className = "task-item";

      const difficultyNames = ["Easy", "Medium", "Hard"];
      const difficultyClasses = ["badge-easy", "badge-medium", "badge-hard"];
      const isRevision = task.solved.value;

      const originalIndex = this.tasks.findIndex((t) => t.name === task.name);

      taskItem.innerHTML = `
        <div class="task-name">
          ${index + 1}. ${task.name}
        </div>
        <div class="task-meta">
          <span class="task-badge ${difficultyClasses[task.difficulty]}">
            ${difficultyNames[task.difficulty]}
          </span>
          <span class="task-badge ${isRevision ? "badge-revision" : "badge-new"}">
            ${isRevision ? "Rev" : "New"}
          </span>
          ${
            isRevision && task.solved.tries
              ? `
            <span style="font-size: 8px; color: var(--text-tertiary);">
              ${task.solved.tries}×
            </span>
          `
              : ""
          }
          ${
            task.problem_link
              ? `<button class="link-button" data-link="${task.problem_link}" title="Open problem link">
                  🔗
                </button>`
              : ""
          }
          <button class="ignore-button" data-task-index="${originalIndex}" title="Ignore this task">
            −
          </button>
        </div>
      `;

      // Add event listener for ignore button
      const ignoreBtn = taskItem.querySelector(".ignore-button");
      ignoreBtn.addEventListener("click", () => {
        this.ignoreTask(originalIndex);
      });

      // Add event listener for link button
      const linkBtn = taskItem.querySelector(".link-button");
      if (linkBtn) {
        linkBtn.addEventListener("click", () => {
          window.open(task.problem_link, "_blank");
        });
      }

      taskList.appendChild(taskItem);
    });

    this.showPredictionResults(true);
  }

  updateScheduledCount() {
    const scheduledCount = document.getElementById("scheduled-count");
    if (scheduledCount) {
      scheduledCount.textContent = this.scheduledTasks.length;
    }
  }

  showPredictionLoading(show) {
    const loadingElement = document.getElementById("prediction-loading");
    if (loadingElement) {
      loadingElement.style.display = show ? "flex" : "none";
    }
  }

  showPredictionResults(show) {
    const resultsElement = document.getElementById("prediction-results");
    if (resultsElement) {
      resultsElement.style.display = show ? "block" : "none";
    }
  }

  showPredictionError(message) {
    const errorElement = document.getElementById("prediction-error");
    const errorText = errorElement?.querySelector(".error-text");

    if (errorElement && errorText) {
      errorText.textContent = message;
      errorElement.style.display = "flex";
    }
  }

  hidePredictionError() {
    const errorElement = document.getElementById("prediction-error");
    if (errorElement) {
      errorElement.style.display = "none";
    }
  }

  async ignoreTask(taskIndex) {
    if (!this.tasks[taskIndex]) {
      console.error("Invalid task index:", taskIndex);
      return;
    }

    try {
      // Toggle ignore status directly
      this.tasks[taskIndex].ignored = !this.tasks[taskIndex].ignored;
      const newIgnoreStatus = this.tasks[taskIndex].ignored;

      console.log(
        `Task "${this.tasks[taskIndex].name}" ignore status: ${newIgnoreStatus}`,
      );

      // Save updated tasks data
      await this.saveTasksData();

      // Update statistics and regenerate schedule
      this.updateTaskStatistics();

      // If there are scheduled tasks, regenerate the schedule
      if (this.scheduledTasks.length > 0) {
        this.generateSchedule();
      }

      // Update ignored tasks display if it's open
      const ignoredSection = document.getElementById("ignored-tasks-section");
      if (ignoredSection && ignoredSection.style.display !== "none") {
        this.populateIgnoredTasks();
      }
    } catch (error) {
      console.error("Error ignoring task:", error);
      this.showPredictionError(`Failed to ignore task: ${error.message}`);
    }
  }

  async restoreTask(taskIndex) {
    if (!this.tasks[taskIndex]) return;

    try {
      // Toggle ignore status (restore)
      this.tasks[taskIndex].ignored = false;

      // Save updated tasks data
      await this.saveTasksData();

      // Update statistics
      this.updateTaskStatistics();

      // Update ignored tasks display
      this.populateIgnoredTasks();

      // If there are scheduled tasks, regenerate the schedule
      if (this.scheduledTasks.length > 0) {
        this.generateSchedule();
      }
    } catch (error) {
      console.error("Error restoring task:", error);
      this.showPredictionError(`Failed to restore task: ${error.message}`);
    }
  }

  showIgnoredTasks() {
    const ignoredSection = document.getElementById("ignored-tasks-section");
    if (ignoredSection) {
      ignoredSection.style.display = "block";
      this.populateIgnoredTasks();
    }
  }

  hideIgnoredTasks() {
    const ignoredSection = document.getElementById("ignored-tasks-section");
    if (ignoredSection) {
      ignoredSection.style.display = "none";
    }
  }

  populateIgnoredTasks() {
    const ignoredList = document.getElementById("ignored-tasks-list");
    if (!ignoredList) return;

    const ignoredTasks = this.tasks
      .map((task, index) => ({ ...task, originalIndex: index }))
      .filter((task) => task.ignored);

    ignoredList.innerHTML = "";

    if (ignoredTasks.length === 0) {
      ignoredList.innerHTML = `
        <div class="empty-ignored-message">
          No ignored tasks
        </div>
      `;
      return;
    }

    ignoredTasks.forEach((task) => {
      const taskItem = document.createElement("div");
      taskItem.className = "ignored-task-item";

      const difficultyNames = ["Easy", "Medium", "Hard"];
      const difficultyClasses = ["badge-easy", "badge-medium", "badge-hard"];
      const status = task.solved.value ? "Solved" : "Unsolved";

      taskItem.innerHTML = `
        <div class="ignored-task-name">
          ${task.name}
        </div>
        <div class="task-meta">
          <span class="task-badge ${difficultyClasses[task.difficulty]}">
            ${difficultyNames[task.difficulty]}
          </span>
          <span class="task-badge ${task.solved.value ? "badge-revision" : "badge-new"}">
            ${status}
          </span>
          <button class="restore-button" data-task-index="${task.originalIndex}" title="Restore this task">
            ✓
          </button>
        </div>
      `;

      // Add event listener for restore button
      const restoreBtn = taskItem.querySelector(".restore-button");
      restoreBtn.addEventListener("click", () => {
        this.restoreTask(task.originalIndex);
      });

      ignoredList.appendChild(taskItem);
    });
  }

  async saveTasksData() {
    try {
      // For now, we'll just store in chrome.storage.local
      // In a real implementation, you might want to sync this with your backend
      await chrome.storage.local.set({
        taskIgnoreStatus: this.tasks.map((task) => ({
          name: task.name,
          ignored: task.ignored,
        })),
      });
    } catch (error) {
      console.error("Failed to save tasks data:", error);
    }
  }

  async saveScheduledTasks() {
    try {
      const scheduleData = {
        scheduledTasks: this.scheduledTasks,
        generatedAt: Date.now(),
        targetCount: parseInt(document.getElementById("target-count").value) || 10,
        focusMode: parseInt(document.getElementById("focus-mode").value) || 1,
        filters: {
          grandparent: Array.from(document.getElementById("grandparent-filter").selectedOptions)
            .map(option => option.value)
            .filter(value => value !== ""),
          parent_topic: document.getElementById("parent-filter").value || null,
        }
      };
      await chrome.storage.local.set({
        scheduledTasksData: scheduleData
      });
      console.log("Scheduled tasks saved to storage");
    } catch (error) {
      console.error("Failed to save scheduled tasks:", error);
    }
  }

  async loadScheduledTasks() {
    try {
      const data = await chrome.storage.local.get(["scheduledTasksData"]);
      if (data.scheduledTasksData) {
        const scheduleData = data.scheduledTasksData;
        this.scheduledTasks = scheduleData.scheduledTasks || [];

        // Restore filter settings if they exist
        if (scheduleData.targetCount) {
          const targetInput = document.getElementById("target-count");
          if (targetInput) targetInput.value = scheduleData.targetCount;
        }

        if (scheduleData.focusMode !== undefined) {
          const focusSelect = document.getElementById("focus-mode");
          if (focusSelect) focusSelect.value = scheduleData.focusMode;
          this.updateFocusModeDescription();
        }

        if (scheduleData.filters) {
          // Restore grandparent filter selections
          if (scheduleData.filters.grandparent && scheduleData.filters.grandparent.length > 0) {
            const grandparentSelect = document.getElementById("grandparent-filter");
            if (grandparentSelect) {
              // Clear current selections
              Array.from(grandparentSelect.options).forEach(option => {
                option.selected = false;
              });
              // Select the saved options
              scheduleData.filters.grandparent.forEach(grandparent => {
                const option = Array.from(grandparentSelect.options).find(opt => opt.value === grandparent);
                if (option) option.selected = true;
              });
            }
          }

          // Restore parent topic filter
          if (scheduleData.filters.parent_topic) {
            const parentSelect = document.getElementById("parent-filter");
            if (parentSelect) parentSelect.value = scheduleData.filters.parent_topic;
          }
        }

        console.log(`Loaded ${this.scheduledTasks.length} scheduled tasks from storage`);
        this.updateGenerateButtonText();
        return true;
      }
    } catch (error) {
      console.error("Failed to load scheduled tasks:", error);
    }
    return false;
  }

  async clearScheduledTasks() {
    try {
      await chrome.storage.local.remove(["scheduledTasksData"]);
      this.scheduledTasks = [];
      this.updateGenerateButtonText();

      // Clear timestamp display
      const timestampElement = document.getElementById("schedule-timestamp");
      if (timestampElement) timestampElement.textContent = "";

      console.log("Scheduled tasks cleared from storage");
    } catch (error) {
      console.error("Failed to clear scheduled tasks:", error);
    }
  }

  updateGenerateButtonText() {
    const button = document.getElementById("generate-schedule");
    if (!button) return;

    const hasSavedTasks = this.scheduledTasks && this.scheduledTasks.length > 0;
    const iconSpan = button.querySelector(".btn-icon");

    if (hasSavedTasks) {
      button.innerHTML = `
        <span class="btn-icon">🔄</span>
        Update Schedule
      `;
      button.title = "Update your saved schedule with new settings";
    } else {
      button.innerHTML = `
        <span class="btn-icon">🔮</span>
        Generate Schedule
      `;
      button.title = "Generate a new schedule";
    }
  }

  async loadTaskIgnoreStatus() {
    try {
      const data = await chrome.storage.local.get(["taskIgnoreStatus"]);
      if (data.taskIgnoreStatus) {
        // Apply saved ignore status to tasks
        data.taskIgnoreStatus.forEach((savedTask) => {
          const taskIndex = this.tasks.findIndex(
            (task) => task.name === savedTask.name,
          );
          if (taskIndex !== -1) {
            this.tasks[taskIndex].ignored = savedTask.ignored;
          }
        });
      }
    } catch (error) {
      console.error("Failed to load task ignore status:", error);
    }
  }
}

// Global reference for onclick handlers
let popupController;

// Initialize popup when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  popupController = new PopupController();
});

// Handle popup resize for better UX
window.addEventListener("resize", () => {
  document.body.style.height = "auto";
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
const styleSheet = document.createElement("style");
styleSheet.textContent = dynamicStyles;
document.head.appendChild(styleSheet);
