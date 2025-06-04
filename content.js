let QUES = "";
let DESCRIPTION = "";
let currentPathname = window.location.pathname;

// Time tracking variables
let sessionStartTime = null;
let lastActivityTime = Date.now();

const fetchQuestionDetails = () => {
  const headingElem = document.querySelector(
    ".text-2xl.font-bold.text-new_primary.dark\\:text-new_dark_primary.relative",
  );
  const paragraphElem = document.querySelector('p.text-new_secondary'); 
// <p class="mt-6 w-full text-new_secondary text-[14px] dark:text-zinc-200"> we use a more specific selector now

  if (headingElem && paragraphElem) {
    QUES = headingElem.textContent?.trim() || "";
    DESCRIPTION = paragraphElem.textContent?.trim() || "";
    console.log("Question details fetched:", QUES);
  }
};

const fetchLatestCodeData = () => {
  const storedData = localStorage.getItem("storedData");
  const parsedData = JSON.parse(storedData || "[]");

  if (parsedData.length > 0) {
    const { problemSlug, selectedLanguage, publicCodeOfSelected } =
      parsedData.at(-1);
    PROBLEM_SLUG = problemSlug;
    SELECTED_LANGUAGE = selectedLanguage;
    PUBLIC_CODE = publicCodeOfSelected;
    console.log("Latest code data fetched for language:", SELECTED_LANGUAGE);
  }
};

const urlChangeDetector = setInterval(() => {
  if (currentPathname !== window.location.pathname) {
    console.log(
      "Path changed from",
      currentPathname,
      "to",
      window.location.pathname,
    );
    currentPathname = window.location.pathname;

    setTimeout(() => {
      fetchQuestionDetails();
      fetchLatestCodeData();
    }, 4000);
  }
}, 4000);

const pollForQuestion = setInterval(() => {
  fetchQuestionDetails();
  if (QUES && DESCRIPTION) {
    clearInterval(pollForQuestion);
  }
}, 1000);

fetchLatestCodeData();

const GITHUB_CONFIG = {
  token: "",
  owner: "",
  repo: "",
  branch: "",
};

const NOTION_CONFIG = {
  enabled: false,
  token: "",
  page: "",
  databaseId: "",
};

const initGitHubConfig = () => {
  chrome.storage.sync.get(
    ["github_token", "github_owner", "github_repo", "github_branch", "notion_enabled", "notion_token", "notion_page", "notion_database_id"],
    (data) => {
      GITHUB_CONFIG.token = data.github_token || "";
      GITHUB_CONFIG.owner = data.github_owner || "";
      GITHUB_CONFIG.repo = data.github_repo || "";
      GITHUB_CONFIG.branch = data.github_branch || "main";

      NOTION_CONFIG.enabled = data.notion_enabled || false;
      NOTION_CONFIG.token = data.notion_token || "";
      NOTION_CONFIG.page = data.notion_page || "";
      NOTION_CONFIG.databaseId = data.notion_database_id || "";

      console.log("Loaded config:", { GITHUB_CONFIG, NOTION_CONFIG });

      if (!GITHUB_CONFIG.token || !GITHUB_CONFIG.owner || !GITHUB_CONFIG.repo) {
        alert(
          "Please configure your GitHub settings by clicking on the extension icon",
        );
      }
    },
  );
};

// Time tracking functions
const startTimeTracking = () => {
  sessionStartTime = Date.now();
  chrome.storage.sync.set({ last_session_start: new Date().toISOString() });
  console.log("Started tracking time on TakeUforward");
};

const updateTimeTracking = () => {
  if (sessionStartTime) {
    const sessionDuration = Math.floor((Date.now() - sessionStartTime) / 60000); // in minutes
    chrome.storage.sync.get(['takeuforward_time'], (data) => {
      const currentTime = data.takeuforward_time || 0;
      const newTotalTime = currentTime + sessionDuration;
      chrome.storage.sync.set({ 
        takeuforward_time: newTotalTime,
        last_activity: new Date().toISOString()
      });
    });
    sessionStartTime = Date.now(); // Reset session start
  }
};

const handleUserActivity = () => {
  lastActivityTime = Date.now();
  if (!sessionStartTime) {
    startTimeTracking();
  }
};

// Track user activity
document.addEventListener('click', handleUserActivity);
document.addEventListener('keypress', handleUserActivity);
document.addEventListener('scroll', handleUserActivity);
document.addEventListener('mousemove', handleUserActivity);

// Update time every 5 minutes if user is active
setInterval(() => {
  const timeSinceLastActivity = Date.now() - lastActivityTime;
  if (timeSinceLastActivity < 300000) { // 5 minutes
    updateTimeTracking();
  }
}, 300000);

const createOrUpdateFile = async (filePath, content, commitMessage) => {
  try {
    console.log("Creating/updating file...");
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${filePath}`,
      {
        headers: {
          Authorization: `token ${GITHUB_CONFIG.token}`,
          Accept: "application/vnd.github.v3+json",
        },
      },
    );

    const payload = {
      message: commitMessage,
      content: btoa(content),
      branch: GITHUB_CONFIG.branch,
    };

    if (response.ok) {
      const data = await response.json();
      payload.sha = data.sha;
    }

    const updateResponse = await fetch(
      `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${filePath}`,
      {
        method: "PUT",
        headers: {
          Authorization: `token ${GITHUB_CONFIG.token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    if (!updateResponse.ok) {
      throw new Error(`GitHub API responded with ${updateResponse.status}`);
    }
    console.log("File successfully created/updated!");
    return true;
  } catch (error) {
    console.error("Error creating/updating file:", error);
    return false;
  }
};

const handleSubmissionPush = async (Sdata) => {
  try {
    console.log("Handling submission push...");
    if (!Sdata.success) return false;

    // Re-fetch latest question details and code before pushing
    fetchQuestionDetails();
    fetchLatestCodeData();

    // Initialize GitHub and Notion config
    await new Promise((resolve) => {
      chrome.storage.sync.get(
        ["github_token", "github_owner", "github_repo", "github_branch", "notion_enabled", "notion_token", "notion_page", "notion_database_id"],
        (data) => {
          GITHUB_CONFIG.token = data.github_token;
          GITHUB_CONFIG.owner = data.github_owner;
          GITHUB_CONFIG.repo = data.github_repo;
          GITHUB_CONFIG.branch = data.github_branch || "main";
          
          NOTION_CONFIG.enabled = data.notion_enabled || false;
          NOTION_CONFIG.token = data.notion_token || "";
          NOTION_CONFIG.page = data.notion_page || "";
          NOTION_CONFIG.databaseId = data.notion_database_id || "";
          
          console.log("Refreshed config for submission:", { GITHUB_CONFIG, NOTION_CONFIG });
          resolve();
        },
      );
    });

    if (!GITHUB_CONFIG.token || !GITHUB_CONFIG.owner || !GITHUB_CONFIG.repo) {
      console.error("GitHub configuration is incomplete");
      alert(
        "Please configure your GitHub settings by clicking on the extension icon",
      );
      return false;
    }

    const commitMessage =
      `Solved: ${QUES}\n\n` +
      `Problem Link: ${window.location.href}\n\n` +
      `Description:\n${DESCRIPTION}\n\n` +
      `Stats:\n` +
      `- Success: ${Sdata.success}\n` +
      `- Test Cases: ${Sdata.totalTestCases}\n` +
      `- Time: ${Sdata.averageTime}\n` +
      `- Memory: ${Sdata.averageMemory}`;

    const fileContent = `// Solution for: ${QUES}
${PUBLIC_CODE}`;

    const urlPath = window.location.pathname
      .replace("/plus/", "") // Remove 'plus'
      .replace("/data-structures-and-algorithm/", "") // Remove DSA prefix
      .replace("/submissions", "") // Remove submissions
      .split("/")
      .filter(
        (part) => part.length > 0 && part !== "data-structures-and-algorithm",
      ); // Remove

    // Create directory path from URL parts
    const dirPath = urlPath.join("/");

    const fileExtension =
      SELECTED_LANGUAGE === "cpp"
        ? "cpp"
        : SELECTED_LANGUAGE === "python"
          ? "py"
          : SELECTED_LANGUAGE === "javascript"
            ? "js"
            : "txt";

    const filePath = `${dirPath}/solution.${fileExtension}`;
    const success = await createOrUpdateFile(
      filePath,
      fileContent,
      commitMessage,
    );

    if (success) {
      console.log("Successfully pushed to GitHub!");
      
      // Debug Notion config
      console.log("Notion config:", NOTION_CONFIG);
      
      // Push to Notion if enabled
      if (NOTION_CONFIG.enabled) {
        console.log("Notion is enabled, pushing to Notion...");
        await pushToNotion();
      } else {
        console.log("Notion is disabled or not configured");
      }
    } else {
      console.error("Failed to push to GitHub");
    }
    return success;
  } catch (error) {
    console.error("Error in GitHub push:", error);
    return false;
  }
};

const injectInterceptor = () => {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("interceptor.js");
  (document.head || document.documentElement).appendChild(script);
  script.onload = () => script.remove();
};

window.addEventListener("message", async (event) => {
  console.log("Received submission response");
  if (event.data.type === "SUBMISSION_RESPONSE") {
    const submissionData = event.data.payload;
    console.log("Submission success status:", submissionData.success);
    if (submissionData.success === true) {
      await handleSubmissionPush(submissionData);
    } else {
      console.log("Submission was not successful. Not pushing to GitHub.");
    }
  }
});

function initSubmitButtonMonitor() {
  document.addEventListener("DOMContentLoaded", () => {
    const submitBtn = document.querySelector(
      'button[data-tooltip-id="Submit"]',
    );
    if (submitBtn) {
      submitBtn.addEventListener("click", () => {
        console.log("Submit button clicked");
      });
    }
  });
}
const pushToNotion = async () => {
  if (!NOTION_CONFIG.enabled || !NOTION_CONFIG.token || !NOTION_CONFIG.databaseId) {
    console.log('Notion not configured properly:', {
      enabled: NOTION_CONFIG.enabled,
      hasToken: !!NOTION_CONFIG.token,
      hasDatabaseId: !!NOTION_CONFIG.databaseId,
      hasPage: !!NOTION_CONFIG.page
    });
    return false;
  }

  try {
    // Extract topic from URL: /plus/dsa/topic-name/
    const urlPath = window.location.pathname;
    console.log('Full URL:', window.location.href);
    console.log('URL pathname:', urlPath);
    
    const match = urlPath.match(/\/plus\/dsa\/([^\/]+)/);
    console.log('Regex match result:', match);
    
    let topic = 'General';
    if (match && match[1]) {
      const rawTopic = match[1];
      console.log('Raw topic from URL:', rawTopic);
      topic = rawTopic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      console.log('Formatted topic:', topic);
    } else {
      console.log('No topic match found, using General');
    }
    
    // Extract difficulty from page content
    const difficultyElement = document.querySelector('[class*="difficulty"], [class*="Difficulty"]');
    const difficulty = difficultyElement?.textContent?.trim() || 'Medium';
    
    console.log('Extracted data:', { 
      topic, 
      difficulty, 
      url: window.location.href,
      urlPath: urlPath 
    });

    const problemData = {
      name: QUES || 'Untitled Problem',
      link: window.location.href,
      difficulty: difficulty,
      topic: topic
    };

    // Use background script to make Notion API call
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'addProblemToNotion',
        config: NOTION_CONFIG,
        problemData: problemData
      }, resolve);
    });

    if (response.success) {
      console.log('Problem added to Notion successfully');
      return true;
    } else {
      console.error('Failed to add problem to Notion:', response.error);
      return false;
    }
  } catch (error) {
    console.error('Error adding problem to Notion:', error);
    return false;
  }
};



// Call initialization methods immediately
initGitHubConfig();
injectInterceptor();
initSubmitButtonMonitor();
startTimeTracking();

// Clean up intervals when the page is unloaded
window.addEventListener("beforeunload", () => {
  clearInterval(urlChangeDetector);
  clearInterval(pollForQuestion);
  updateTimeTracking(); // Save time before leaving
});
