let QUES = '';
let DESCRIPTION = '';
//udca
const pollForQuestion = setInterval(() => {
    const headingElem = document.querySelector('.text-2xl.font-bold.text-new_primary.dark\\:text-new_dark_primary.relative');
    const paragraphElem = document.querySelector('p.mt-6');
    if (headingElem && paragraphElem) {
        QUES = headingElem.textContent || '';
        DESCRIPTION = paragraphElem.textContent || '';
        clearInterval(pollForQuestion);
    }
}, 2000);


const storedData = localStorage.getItem('storedData');
const parsedData = JSON.parse(storedData || '[]');
let PROBLEM_SLUG = '';
let SELECTED_LANGUAGE = '';
let PUBLIC_CODE = '';

if (parsedData.length > 0) {
    const { problemSlug, selectedLanguage, publicCodeOfSelected } = parsedData[-1];
    PROBLEM_SLUG = problemSlug;
    SELECTED_LANGUAGE = selectedLanguage;
    PUBLIC_CODE = publicCodeOfSelected;
}


const GITHUB_CONFIG = {
    token: "",
    owner: "",
    repo: "",
    branch: ""
};

const initGitHubConfig = () => {
    GITHUB_CONFIG.token = localStorage.getItem('github_token') || prompt('Enter your GitHub token:');
    GITHUB_CONFIG.owner = localStorage.getItem('github_owner') || prompt('Enter your GitHub username:');
    GITHUB_CONFIG.repo = localStorage.getItem('github_repo') || prompt('Enter your repository name:');

    localStorage.setItem('github_token', GITHUB_CONFIG.token);
    localStorage.setItem('github_owner', GITHUB_CONFIG.owner);
    localStorage.setItem('github_repo', GITHUB_CONFIG.repo);
};

const createOrUpdateFile = async (filePath, content, commitMessage) => {
    try {
        const response = await fetch(`https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${filePath}`, {
            headers: {
                'Authorization': `token ${GITHUB_CONFIG.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        const payload = {
            message: commitMessage,
            content: btoa(content),
            branch: GITHUB_CONFIG.branch
        };

        if (response.ok) {
            const data = await response.json();
            payload.sha = data.sha;
        }

        const updateResponse = await fetch(`https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${filePath}`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_CONFIG.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!updateResponse.ok) {
            throw new Error(`GitHub API responded with ${updateResponse.status}`);
        }
        return true;
    } catch (error) {
        console.error('Error creating/updating file:', error);
        return false;
    }
};

const handleSubmissionPush = async (Sdata) => {
    try {
        if (!Sdata.success) return false;
        if (!GITHUB_CONFIG.token) initGitHubConfig();

        const commitMessage = `Solved: ${QUES}\n\n` +
            `Success: ${Sdata.success}\n` +
            `Test Cases: ${Sdata.totalTestCases}\n` +
            `Time: ${Sdata.averageTime}\n` +
            `Memory: ${Sdata.averageMemory}`;

        const fileContent = `/*
Problem: ${QUES}
Problem Link: ${window.location.href}

Description:
${DESCRIPTION}

Stats:
- Success: ${Sdata.success}
- Test Cases: ${Sdata.totalTestCases}
- Time: ${Sdata.averageTime}
- Memory: ${Sdata.averageMemory}
*/

${PUBLIC_CODE}`;


        const urlPath = window.location.pathname
            .replace('/plus/', '') // Remove 'plus'
            .replace('/data-structures-and-algorithm/', '') // Remove DSA prefix
            .replace('/submissions', '') // Remove submissions
            .split('/') 
            .filter(part => part.length > 0 && part !== 'data-structures-and-algorithm'); // Remove 

        // Create directory path from URL parts
        const dirPath = urlPath.join('/');

        const fileExtension =
            SELECTED_LANGUAGE === 'cpp' ? 'cpp' :
            SELECTED_LANGUAGE === 'python' ? 'py' :
            SELECTED_LANGUAGE === 'javascript' ? 'js' : 'txt';

        const filePath = `${dirPath}/solution.${fileExtension}`;
        const success = await createOrUpdateFile(filePath, fileContent, commitMessage);

        if (success) {
            console.log('Successfully pushed to GitHub!');
        } else {
            console.error('Failed to push to GitHub');
        }
        return success;
    } catch (error) {
        console.error('Error in GitHub push:', error);
        return false;
    }
};


const injectInterceptor = () => {
    console.log('Injecting interceptor...');
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('interceptor.js');
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove();
  };
  

  window.addEventListener('message', async (event) => {
    if (event.data.type === 'SUBMISSION_RESPONSE') {
      const submissionData = event.data.payload;
      if (submissionData.success === true) {
        await handleSubmissionPush(submissionData);
      }
    }
  });
  
  injectInterceptor();
  initSubmitButtonMonitor();