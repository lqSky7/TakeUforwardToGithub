// Initialize logger
let logger = {
  enabled: false,
  log: (...args) => { if (logger.enabled) console.log(...args); },
  error: (...args) => { if (logger.enabled) console.error(...args); },
  warn: (...args) => { if (logger.enabled) console.warn(...args); },
  info: (...args) => { if (logger.enabled) console.info(...args); }
};

// Load developer mode setting
chrome.storage.sync.get(['developer_mode'], (data) => {
  logger.enabled = data.developer_mode || false;
});

chrome.runtime.onInstalled.addListener(() => {
  logger.log("Extension installed.");
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'setDeveloperMode') {
    logger.enabled = request.enabled;
    return;
  }
  
  if (request.action === 'notionAPI') {
    handleNotionAPICall(request.data)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'createNotionDatabase') {
    createNotionDatabase(request.token, request.pageId)
      .then(databaseId => sendResponse({ success: true, databaseId }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'findNotionPage') {
    findNotionPageByName(request.token, request.pageName)
      .then(pageId => sendResponse({ success: true, pageId }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'testNotionConnection') {
    testNotionConnection(request.token)
      .then(isValid => sendResponse({ success: true, isValid }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'addProblemToNotion') {
    addProblemToNotion(request.config, request.problemData)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});
</edits>

<old_text>
    return response.ok;
  } catch (error) {
    logger.error('Notion connection test failed:', error);
    return false;
  }

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
    const response = await fetch('https://api.notion.com/v1/users/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28'
      }
    });
    
    return response.ok;
  } catch (error) {
    logger.error('Notion connection test failed:', error);
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
    logger.error('Error finding page:', error);
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
      logger.error('Failed to create Notion database:', await response.text());
      return null;
    }
  } catch (error) {
    logger.error('Error creating Notion database:', error);
    return null;
  }
}

async function addProblemToNotion(config, problemData) {
  if (!config.enabled || !config.token || !config.databaseId) {
    return false;
  }

  try {
    const dateSolved = new Date().toISOString().split('T')[0];
    const nextReview = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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
      logger.log('Problem added to Notion successfully');
      return true;
    } else {
      logger.error('Failed to add problem to Notion:', await response.text());
      return false;
    }
  } catch (error) {
    logger.error('Error adding problem to Notion:', error);
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
