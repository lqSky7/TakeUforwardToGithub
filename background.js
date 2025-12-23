chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed.");
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background received message:", request.action);
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
    console.log("Scheduling revision for:", request.problemName, request.difficulty, request.tries);
    scheduleRevision(request.problemName, request.difficulty, request.tries)
      .then(() => sendResponse({ success: true }))
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

async function getProblemState(problemName) {
  const data = await chrome.storage.local.get('problem_states');
  return data.problem_states?.[problemName] || null;
}

async function setProblemState(problemName, state) {
  const data = await chrome.storage.local.get('problem_states');
  const states = data.problem_states || {};
  states[problemName] = state;
  await chrome.storage.local.set({ problem_states: states });
}

async function scheduleRevision(problemName, difficulty, tries) {
  // Get Craft config
  const data = await chrome.storage.sync.get(['craft_enabled', 'craft_url']);
  if (!data.craft_enabled || !data.craft_url) {
    console.log('Craft integration not enabled or URL not set');
    return;
  }
  const apiUrl = data.craft_url;

  // Get or initialize problem state
  const state = await getProblemState(problemName);
  if (!state) {
    state = { ease: 2.5, interval: 1, lastReview: null };
  }

  // Calculate quality based on tries and difficulty
  let quality = 5;
  if (tries >= 2) quality -= 1;
  if (tries >= 4) quality -= 1;
  if (difficulty.toLowerCase() === 'hard') quality -= 1;
  if (difficulty.toLowerCase() === 'easy') quality += 1;
  quality = Math.max(0, Math.min(5, quality));

  // Update state using SM2 algorithm
  if (quality >= 3) {
    state.interval = Math.round(state.interval * state.ease);
  } else {
    state.interval = 1;
  }
  state.ease = state.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  state.ease = Math.max(1.3, state.ease);
  state.lastReview = new Date().toISOString().split('T')[0];

  // Save updated state
  await setProblemState(problemName, state);

  // Schedule next 5 reviews
  const intervals = [];
  let currentInterval = state.interval;
  for (let i = 0; i < 5; i++) {
    intervals.push(currentInterval);
    currentInterval = Math.round(currentInterval * state.ease);
  }

  const today = new Date();
  const dates = intervals.map(days => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  });

  // Add tasks
  for (const date of dates) {
    const payload = {
      tasks: [
        {
          markdown: `Revise: ${problemName}`,
          location: {
            type: "dailyNote",
            date: date
          }
        }
      ]
    };
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        console.error('Failed to add task for date', date, response.status);
      } else {
        console.log('Added revision task for', date);
      }
    } catch (error) {
      console.error('Error adding task:', error);
    }
  }
}
