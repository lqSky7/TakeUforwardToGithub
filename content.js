let QUES = "";
let DESCRIPTION = "";
let currentPathname = window.location.pathname;
let PROBLEM_SLUG = "";
let SELECTED_LANGUAGE = "";
let PUBLIC_CODE = "";
let waitingForCode = false;
let DIFFICULTY = "";
let TRIES = 0;

const fetchQuestionDetails = () => {
    console.log("Fetching question details...");
    const headingElem = document.querySelector('h1.text-xl.font-bold');

    const paragraphElem = document.querySelector('.tuf-text-14');


    if (headingElem && paragraphElem) {
        QUES = headingElem.textContent?.trim() || "";
        DESCRIPTION = paragraphElem.textContent?.trim() || "";
        console.log("Question details fetched:", QUES);
    } else {
        console.log("Question elements not found:", { headingElem, paragraphElem });
    }

    const difficultyElement = document.querySelector('[class*="difficulty"], [class*="Difficulty"]');
    DIFFICULTY = difficultyElement?.textContent?.trim() || "Medium";
    console.log("Extracted difficulty:", DIFFICULTY);
};

const urlChangeDetector = setInterval(() => {
    if (currentPathname !== window.location.pathname) {
        currentPathname = window.location.pathname;
        TRIES = 0; // reset tries on problem change

        setTimeout(() => {
            fetchQuestionDetails();
        }, 4000);
    }
}, 4000);

const pollForQuestion = setInterval(() => {
    console.log("Polling for question details...");
    fetchQuestionDetails();
    if (QUES && DESCRIPTION) {
        console.log("Question polling stopped, details found.");
        clearInterval(pollForQuestion);
    } else {
        console.log("Question details not yet available.");
    }
}, 1000);

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
    console.log("Initializing GitHub config...");
    chrome.storage.sync.get(
        [
            "github_token",
            "github_owner",
            "github_repo",
            "github_branch",
            "notion_enabled",
            "notion_token",
            "notion_page",
            "notion_database_id",
        ],
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

            if (
                !GITHUB_CONFIG.token ||
                !GITHUB_CONFIG.owner ||
                !GITHUB_CONFIG.repo
            ) {
                alert(
                    "Please configure your GitHub settings by clicking on the extension icon",
                );
            }
        },
    );
};

const createOrUpdateFile = async (filePath, content, commitMessage) => {
    console.log("Creating/updating file:", filePath);
    try {
        if (!chrome.runtime || chrome.runtime.id === undefined) {
            console.log("Extension context invalidated, skipping GitHub push");
            return false;
        }
        const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${filePath}`;
        console.log("GitHub contents URL:", url);
        console.log("GitHub branch:", GITHUB_CONFIG.branch);

        console.log("Checking if file exists...");
        const response = await fetch(`${url}?ref=${GITHUB_CONFIG.branch}`, {
            headers: {
                Authorization: `Bearer ${GITHUB_CONFIG.token}`,
                Accept: "application/vnd.github.v3+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        });

        const payload = {
            message: commitMessage,
            content: btoa(content),
            branch: GITHUB_CONFIG.branch,
        };

        if (response.ok) {
            try {
                const data = await response.json();
                if (data && data.sha) {
                    payload.sha = data.sha;
                    console.log("File exists, updating with SHA:", data.sha);
                } else {
                    console.log("File exists but no SHA in response, will attempt to create/update anyway");
                }
            } catch (jsonError) {
                console.error("Failed to parse file existence response:", jsonError);
                console.log("Response status:", response.status, "Response text:", await response.text());
                // If we can't parse the response but the request was ok, something is wrong
                // Let's try to proceed without SHA and see what happens
            }
        } else if (response.status === 404) {
            console.log("File does not exist on this branch, creating new file");
        } else {
            const bodyText = await response.text().catch(() => "");
            console.log("GET file check failed:", {
                status: response.status,
                statusText: response.statusText,
                body: bodyText,
            });
            console.log("File may exist but check failed, attempting to create/update anyway");
            // If the GET failed for some reason, we might still need to provide SHA
            // But we don't have it, so this might fail. Let's try anyway.
        }

        console.log("Creating/updating via PUT with payload:", {
            hasSha: !!payload.sha,
            branch: payload.branch,
            messagePreview: (payload.message || "").slice(0, 80),
            contentLength: (payload.content || "").length,
        });

        const updateResponse = await fetch(url, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${GITHUB_CONFIG.token}`,
                Accept: "application/vnd.github.v3+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        if (!updateResponse.ok) {
            const errorText = await updateResponse.text().catch(() => "");
            console.error("GitHub PUT failed:", {
                status: updateResponse.status,
                statusText: updateResponse.statusText,
                body: errorText,
            });
            throw new Error(`GitHub API responded with ${updateResponse.status}: ${errorText}`);
        }
        console.log("File successfully created/updated!");
        return true;
    } catch (error) {
        if (error.message && error.message.includes("Extension context invalidated")) {
            console.log("Extension context was invalidated during GitHub push, this is expected if extension was reloaded.");
        } else {
            console.error("Error creating/updating file:", error);
        }
        return false;
    }
};

const handleSubmissionPush = async (Sdata) => {
    console.log("Handling submission push with data:", Sdata);
    try {
        console.log("Handling submission push...");
        if (!Sdata.success) {
            console.log("Submission not successful, skipping push.");
            return false;
        }

        // Re-fetch latest question details and code before pushing
        fetchQuestionDetails();
        
        // If code data is empty, try to retrieve from storage (in case of context reload)
        if (!PUBLIC_CODE || !SELECTED_LANGUAGE || !PROBLEM_SLUG) {
            console.log("Code data is empty, attempting to retrieve from storage...");
            const storedData = await new Promise((resolve) => {
                chrome.storage.local.get(['tuf_code_data'], (result) => {
                    resolve(result.tuf_code_data);
                });
            });
            
            if (storedData && storedData.timestamp && (Date.now() - storedData.timestamp) < 60000) { // Within 60 seconds
                SELECTED_LANGUAGE = storedData.SELECTED_LANGUAGE || SELECTED_LANGUAGE;
                PUBLIC_CODE = storedData.PUBLIC_CODE || PUBLIC_CODE;
                PROBLEM_SLUG = storedData.PROBLEM_SLUG || PROBLEM_SLUG;
                console.log("Retrieved code data from storage (age:", Math.round((Date.now() - storedData.timestamp)/1000), "seconds)");
            } else {
                console.log("No valid stored code data found or data too old");
            }
        }
        
        console.log("Current code data:", { SELECTED_LANGUAGE, PUBLIC_CODE: PUBLIC_CODE.substring(0, 100) + "...", PROBLEM_SLUG });

        // Check if we have the required code data
        if (!PUBLIC_CODE || !SELECTED_LANGUAGE || !PROBLEM_SLUG) {
            console.error("Missing required code data for GitHub push:", {
                hasCode: !!PUBLIC_CODE,
                hasLanguage: !!SELECTED_LANGUAGE,
                hasProblemSlug: !!PROBLEM_SLUG
            });
            return false;
        }

        // Initialize GitHub and Notion config
        await new Promise((resolve) => {
            console.log("Refreshing config for submission...");
            chrome.storage.sync.get(
                [
                    "github_token",
                    "github_owner",
                    "github_repo",
                    "github_branch",
                    "notion_enabled",
                    "notion_token",
                    "notion_page",
                    "notion_database_id",
                ],
                (data) => {
                    GITHUB_CONFIG.token = data.github_token;
                    GITHUB_CONFIG.owner = data.github_owner;
                    GITHUB_CONFIG.repo = data.github_repo;
                    GITHUB_CONFIG.branch = data.github_branch || "main";

                    NOTION_CONFIG.enabled = data.notion_enabled || false;
                    NOTION_CONFIG.token = data.notion_token || "";
                    NOTION_CONFIG.page = data.notion_page || "";
                    NOTION_CONFIG.databaseId = data.notion_database_id || "";

                    console.log("Refreshed config for submission:", {
                        GITHUB_CONFIG,
                        NOTION_CONFIG,
                    });
                    resolve();
                },
            );
        });

        if (
            !GITHUB_CONFIG.token ||
            !GITHUB_CONFIG.owner ||
            !GITHUB_CONFIG.repo
        ) {
            console.error("GitHub configuration is incomplete");
            alert(
                "Please configure your GitHub settings by clicking on the extension icon",
            );
            return false;
        }

        console.log("Using GitHub config:", {
            owner: GITHUB_CONFIG.owner,
            repo: GITHUB_CONFIG.repo,
            branch: GITHUB_CONFIG.branch,
            token: GITHUB_CONFIG.token,
        });

        const commitMessage =
            `Solved: ${QUES}\n\n` +
            `Problem Link: ${window.location.href}\n\n` +
            `Description:\n${DESCRIPTION}\n\n` +
            `Stats:\n` +
            `- Success: ${Sdata.success}\n` +
            `- Test Cases: ${Sdata.totalTestCases}\n` +
            `- Time: ${Sdata.averageTime}\n` +
            `- Memory: ${Sdata.averageMemory}`;

        // Get the appropriate language identifier for markdown code blocks
        // Map TakeUForward language codes to markdown language identifiers
        const languageMap = {
            "cpp": "cpp",
            "c++": "cpp",
            "python": "python",
            "python3": "python",
            "py": "python",
            "javascript": "javascript",
            "js": "javascript",
            "java": "java",
            "c": "c",
            "csharp": "csharp",
            "c#": "csharp",
            "go": "go",
            "golang": "go",
            "rust": "rust",
            "kotlin": "kotlin",
            "swift": "swift",
            "typescript": "typescript",
            "ts": "typescript",
            "ruby": "ruby",
            "php": "php",
            "scala": "scala",
            "dart": "dart"
        };
        
        const languageId = languageMap[SELECTED_LANGUAGE?.toLowerCase()] || SELECTED_LANGUAGE || "text";
        console.log("Using language ID:", languageId, "from SELECTED_LANGUAGE:", SELECTED_LANGUAGE);

        const fileContent = `# ${QUES}

## Problem Description
${DESCRIPTION}

## Solution

\`\`\`${languageId}
${PUBLIC_CODE}
\`\`\`

## Problem Link
${window.location.href}

## Stats
- Success: ${Sdata.success}
- Test Cases: ${Sdata.totalTestCases}
- Time: ${Sdata.averageTime}
- Memory: ${Sdata.averageMemory}
`;
        console.log("Generated file content, code length in content:", PUBLIC_CODE.length);

        const urlPath = window.location.pathname
            .replace("/plus/", "") // Remove 'plus'
            .replace("/data-structures-and-algorithm/", "") // Remove DSA prefix
            .replace("/submissions", "") // Remove submissions
            .split("/")
            .filter(
                (part) =>
                    part.length > 0 && part !== "data-structures-and-algorithm",
            ); // Remove

        // Create directory path from URL parts
        const dirPath = urlPath.join("/");
        console.log("Directory path:", dirPath);

        // Always use .md extension for all solutions to ensure consistency
        const filePath = `${dirPath}/solution.md`;
        console.log("File path:", filePath);
        const success = await createOrUpdateFile(
            filePath,
            fileContent,
            commitMessage,
        );

        if (success) {
            console.log("Successfully pushed to GitHub!");
            
            // Clear stored code data after successful push
            chrome.storage.local.remove(['tuf_code_data']);

            // Debug Notion config
            console.log("Notion config:", NOTION_CONFIG);

            // Push to Notion if enabled
            if (NOTION_CONFIG.enabled) {
                console.log("Notion is enabled, pushing to Notion...");
                await pushToNotion();
            } else {
                console.log("Notion is disabled or not configured");
            }

            // Schedule revisions
            chrome.runtime.sendMessage({
                action: "scheduleRevision",
                problemName: QUES,
                difficulty: DIFFICULTY,
                tries: TRIES
            });
        } else {
            console.error("Failed to push to GitHub");
            // Clear stored code data on failure too
            chrome.storage.local.remove(['tuf_code_data']);
        }
        return success;
    } catch (error) {
        if (error.message && error.message.includes("Extension context invalidated")) {
            console.log("Extension context was invalidated during submission push, this is expected if extension was reloaded.");
        } else {
            console.error("Error in GitHub push:", error);
        }
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
    console.log("Received message:", event.data.type, "from origin:", event.origin);
    if (event.data.type === "CODE_SUBMIT") {
        console.log("Code submit payload:", event.data.payload);
        // Always extract code data when submit request is intercepted
        SELECTED_LANGUAGE = event.data.payload.language;
        PUBLIC_CODE = event.data.payload.usercode;
        PROBLEM_SLUG = event.data.payload.problem_id;
        waitingForCode = false; // Reset the flag
        console.log("Code extracted for language:", SELECTED_LANGUAGE, "Code length:", PUBLIC_CODE.length);
        
        // Store in chrome storage to persist across potential context reloads
        chrome.storage.local.set({
            'tuf_code_data': {
                SELECTED_LANGUAGE,
                PUBLIC_CODE,
                PROBLEM_SLUG,
                timestamp: Date.now()
            }
        });
    } else if (event.data.type === "CODE_RUN") {
        console.log("Code run attempted");
        TRIES++;
        console.log("Tries now:", TRIES);
    } else if (event.data.type === "SUBMISSION_RESPONSE") {
        console.log("Received submission response");
        const submissionData = event.data.payload;
        console.log("Submission success status:", submissionData.success);
        if (submissionData.success === true) {
            await handleSubmissionPush(submissionData);
        } else {
            console.log(
                "Submission was not successful. Not pushing to GitHub.",
            );
        }
    }
});

function initSubmitButtonMonitor() {
    console.log("Initializing submit button monitor...");
    document.addEventListener("DOMContentLoaded", () => {
        const submitBtn = document.querySelector('button[data-slot="tooltip-trigger"] svg path[fill="#119933"]')
            ?.closest('button');
        console.log("Submit button found:", !!submitBtn);
        if (submitBtn) {
            submitBtn.addEventListener("click", () => {
                console.log("Submit button clicked");
                waitingForCode = true;
            });
        } else {
            console.log("Submit button not found.");
        }
    });
}
const pushToNotion = async () => {
    console.log("Pushing to Notion...");
    if (
        !NOTION_CONFIG.enabled ||
        !NOTION_CONFIG.token ||
        !NOTION_CONFIG.databaseId
    ) {
        console.log("Notion not configured properly:", {
            enabled: NOTION_CONFIG.enabled,
            hasToken: !!NOTION_CONFIG.token,
            hasDatabaseId: !!NOTION_CONFIG.databaseId,
            hasPage: !!NOTION_CONFIG.page,
        });
        return false;
    }

    try {
        // Extract topic from URL: /plus/dsa/topic-name/
        const urlPath = window.location.pathname;
        console.log("Full URL:", window.location.href);
        console.log("URL pathname:", urlPath);

        const match = urlPath.match(/\/plus\/dsa\/([^\/]+)/);
        console.log("Regex match result:", match);

        let topic = "General";
        if (match && match[1]) {
            const rawTopic = match[1];
            console.log("Raw topic from URL:", rawTopic);
            topic = rawTopic
                .replace(/-/g, " ")
                .replace(/\b\w/g, (l) => l.toUpperCase());
            console.log("Formatted topic:", topic);
        } else {
            console.log("No topic match found, using General");
        }

        // Extract difficulty from page content
        const difficultyElement = document.querySelector(
            '[class*="difficulty"], [class*="Difficulty"]',
        );
        const difficulty = difficultyElement?.textContent?.trim() || "Medium";
        console.log("Extracted difficulty:", difficulty);

        console.log("Extracted data:", {
            topic,
            difficulty,
            url: window.location.href,
            urlPath: urlPath,
        });

        const problemData = {
            name: QUES || "Untitled Problem",
            link: window.location.href,
            difficulty: difficulty,
            topic: topic,
        };
        console.log("Problem data for Notion:", problemData);

        // Use background script to make Notion API call
        const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage(
                {
                    action: "addProblemToNotion",
                    config: NOTION_CONFIG,
                    problemData: problemData,
                },
                resolve,
            );
        });

        if (response.success) {
            console.log("Problem added to Notion successfully");
            return true;
        } else {
            console.error("Failed to add problem to Notion:", response.error);
            return false;
        }
    } catch (error) {
        console.error("Error adding problem to Notion:", error);
        return false;
    }
};

// Call initialization methods immediately
console.log("Initializing extension...");
initGitHubConfig();
injectInterceptor();
initSubmitButtonMonitor();

// Clean up intervals when the page is unloaded
window.addEventListener("beforeunload", () => {
    clearInterval(urlChangeDetector);
    clearInterval(pollForQuestion);
});
