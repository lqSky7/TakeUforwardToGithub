console.log('[craft] Background script loaded');

chrome.runtime.onInstalled.addListener(() => {
  console.log("[craft] Extension installed.");
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[DEBUG] Message received in background:', request.action, request);
  
  if (request.action === 'notionAPI') {
    console.log("Handling notionAPI call...");
    handleNotionAPICall(request.data)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'createNotionDatabase') {
    console.log("Creating Notion database...");
    createNotionDatabase(request.token, request.pageId)
      .then(databaseId => sendResponse({ success: true, databaseId }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'findNotionPage') {
    console.log("Finding Notion page...");
    findNotionPageByName(request.token, request.pageName)
      .then(pageId => sendResponse({ success: true, pageId }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'testNotionConnection') {
    console.log("Testing Notion connection...");
    testNotionConnection(request.token)
      .then(isValid => sendResponse({ success: true, isValid }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'addProblemToNotion') {
    console.log("Adding problem to Notion:", request.problemData);
    addProblemToNotion(request.config, request.problemData)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'scheduleRevision') {
    console.log('[craft] Received scheduleRevision message:', request);
    scheduleRevision(request.problemName, request.difficulty, request.tries, request.link)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (request.action === 'getCraftTasks') {
    console.log('[craft] Getting craft tasks');
    getCraftTasks()
      .then(tasks => sendResponse({ success: true, tasks }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'deleteCraftTasks') {
    console.log('[craft] Deleting tasks for:', request.problemName);
    deleteCraftTasks(request.problemName)
      .then(success => sendResponse({ success }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

async function handleNotionAPICall(data) {
  const { url, method, headers, body } = data;
  
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  
  return await response.json();
}

async function testNotionConnection(token) {
  try {
    console.log('Testing Notion connection with token:', token.substring(0, 10) + '...');
    
    const response = await fetch('https://api.notion.com/v1/users/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28'
      }
    });
    
    console.log('Notion test response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('Notion user data:', data);
      return true;
    } else {
      const errorText = await response.text();
      console.error('Notion API error:', response.status, errorText);
      return false;
    }
  } catch (error) {
    console.error('Notion connection test failed:', error);
    return false;
  }
}

async function findNotionPageByName(token, pageName) {
  try {
    const response = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        query: pageName,
        filter: {
          property: 'object',
          value: 'page'
        }
      })
    });

    if (response.ok) {
      const data = await response.json();
      const page = data.results.find(p => {
        const title = p.properties?.title?.title?.[0]?.text?.content || '';
        return title === pageName;
      });
      return page?.id || null;
    }
    return null;
  } catch (error) {
    console.error('Error finding page:', error);
    return null;
  }
}

async function createNotionDatabase(token, pageId) {
  try {
    const response = await fetch('https://api.notion.com/v1/databases', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        parent: {
          type: 'page_id',
          page_id: pageId
        },
        title: [
          {
            type: 'text',
            text: {
              content: 'TakeUforward Solutions'
            }
          }
        ],
        properties: {
          'Problem Name': {
            title: {}
          },
          'Link': {
            url: {}
          },
          'Difficulty': {
            select: {
              options: [
                { name: 'Easy', color: 'green' },
                { name: 'Medium', color: 'yellow' },
                { name: 'Hard', color: 'red' }
              ]
            }
          },
          'Topic': {
            multi_select: {
              options: []
            }
          },
          'Date Solved': {
            date: {}
          },
          'Next Review': {
            date: {}
          }
        }
      })
    });

    if (response.ok) {
      const database = await response.json();
      return database.id;
    } else {
      console.error('Failed to create Notion database:', await response.text());
      return null;
    }
  } catch (error) {
    console.error('Error creating Notion database:', error);
    return null;
  }
}

async function addProblemToNotion(config, problemData) {
  console.log("Adding problem to Notion with config:", config, "data:", problemData);
  if (!config.enabled || !config.token || !config.databaseId) {
    console.log("Notion config incomplete");
    return false;
  }

  try {
    const dateSolved = new Date().toISOString().split('T')[0];
    const nextReview = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    console.log("Dates:", { dateSolved, nextReview });

    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        parent: {
          database_id: config.databaseId
        },
        properties: {
          'Problem Name': {
            title: [
              {
                type: 'text',
                text: {
                  content: problemData.name || 'Untitled Problem'
                }
              }
            ]
          },
          'Link': {
            url: problemData.link || ''
          },
          'Difficulty': {
            select: {
              name: getDifficultyFromText(problemData.difficulty)
            }
          },
          'Topic': {
            multi_select: getTopicsFromText(problemData.topic)
          },
          'Date Solved': {
            date: {
              start: dateSolved
            }
          },
          'Next Review': {
            date: {
              start: nextReview
            }
          }
        }
      })
    });

    if (response.ok) {
      console.log('Problem added to Notion successfully');
      return true;
    } else {
      console.error('Failed to add problem to Notion:', await response.text());
      return false;
    }
  } catch (error) {
    console.error('Error adding problem to Notion:', error);
    return false;
  }
}

function getDifficultyFromText(text) {
  if (!text) return 'Medium';
  
  const lower = text.toLowerCase();
  if (lower.includes('easy')) return 'Easy';
  if (lower.includes('hard')) return 'Hard';
  return 'Medium';
}

function getTopicsFromText(topic) {
  if (!topic) return [];
  
  const topics = topic.split(/[,;]/).map(t => t.trim()).filter(t => t);
  return topics.map(name => ({ name })).slice(0, 5);
}

// Craft integration functions
async function setCraftTasks(problemName, link, taskIds) {
  const data = await chrome.storage.local.get('craft_tasks');
  const tasks = data.craft_tasks || {};
  tasks[problemName] = { link, taskIds };
  await chrome.storage.local.set({ craft_tasks: tasks });
}

async function getCraftTasks() {
  const data = await chrome.storage.local.get('craft_tasks');
  return data.craft_tasks || {};
}

async function deleteCraftTasks(problemName) {
  const tasks = await getCraftTasks();
  if (tasks[problemName]) {
    const taskIds = tasks[problemName].taskIds;
    // Call delete API
    const config = await chrome.storage.sync.get(['craft_url']);
    if (config.craft_url && taskIds.length > 0) {
      const deleteEndpoint = config.craft_url.endsWith('/') ? config.craft_url + 'tasks' : config.craft_url + '/tasks';
      console.log('[craft] Deleting from endpoint:', deleteEndpoint, 'taskIds:', taskIds);
      
      try {
        const response = await fetch(deleteEndpoint, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ idsToDelete: taskIds })
        });
        if (response.ok) {
          console.log('[craft] Deleted tasks for', problemName);
          delete tasks[problemName];
          await chrome.storage.local.set({ craft_tasks: tasks });
          return true;
        } else {
          console.error('[craft] Failed to delete tasks');
        }
      } catch (error) {
        console.error('[craft] Error deleting tasks:', error);
      }
    }
  }
  return false;
}

async function scheduleRevision(problemName, difficulty, tries, link) {
  console.log('[craft] scheduleRevision STARTED for:', problemName, 'link:', link);

  // Get Craft config
  const data = await chrome.storage.sync.get(['craft_enabled', 'craft_url']);
  console.log('[craft] Craft config loaded:', data);

  if (!data.craft_enabled || !data.craft_url) {
    console.log('[craft] Craft integration not enabled or URL not set - EXITING');
    return;
  }
  const apiUrl = data.craft_url;
  const tasksEndpoint = apiUrl.endsWith('/') ? apiUrl + 'tasks' : apiUrl + '/tasks';
  console.log('[craft] Using API URL:', apiUrl, 'tasks endpoint:', tasksEndpoint);

  // Determine revision schedule based on difficulty and tries
  let baseIntervals = [2, 4, 7, 14]; // Base schedule
  
  // Adjust based on difficulty
  if (difficulty.toLowerCase() === 'easy') {
    baseIntervals = [7, 14]; // Fewer, later revisions for easy
  } else if (difficulty.toLowerCase() === 'medium') {
    baseIntervals = [2, 7, 14]; // Standard
  } else if (difficulty.toLowerCase() === 'hard') {
    baseIntervals = [1, 2, 4, 7, 14]; // More frequent for hard
  }
  
  // Add more revisions based on tries
  if (tries >= 2) {
    baseIntervals.push(30); // Add 30-day review
  }
  if (tries >= 4) {
    baseIntervals.push(60); // Add 60-day review
  }
  
  const intervals = baseIntervals;
  console.log('[craft] Intervals based on difficulty:', difficulty, 'tries:', tries, '->', intervals);

  const today = new Date();
  const dates = intervals.map(days => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  });
  console.log('[craft] Scheduled dates:', dates);

  // Add tasks
  const taskIds = [];
  for (const date of dates) {
    const payload = {
      tasks: [
        {
          markdown: `Revise: ${problemName}\n${link}`,
          location: {
            type: "dailyNote",
            date: date
          }
        }
      ]
    };
    console.log('[craft] Making API call to:', tasksEndpoint, 'with payload:', payload);
    
    try {
      const response = await fetch(tasksEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      console.log('[craft] API response status:', response.status, 'headers:', [...response.headers.entries()]);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[craft] API error response:', errorText);
        console.error('[craft] Failed to add task for date', date, response.status, errorText);
      } else {
        const result = await response.json();
        console.log('[craft] Task added successfully, result:', result);

        if (result.items && result.items[0]) {
          taskIds.push(result.items[0].id);
        }
      }
    } catch (error) {
      console.error('[craft] Network error making API call:', error);
      console.error('[craft] Error adding task:', error);
    }
  }

  console.log('[craft] Collected taskIds:', taskIds);

  // Store the task IDs for this problem
  if (taskIds.length > 0) {
    await setCraftTasks(problemName, link, taskIds);
    console.log('[craft] Stored craft tasks');
  } else {
    console.log('[craft] No tasks added, not storing');
  }
}
