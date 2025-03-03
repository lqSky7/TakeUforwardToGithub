document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('github-config-form');
  const tokenInput = document.getElementById('github-token');
  const ownerInput = document.getElementById('github-owner');
  const repoInput = document.getElementById('github-repo');
  const branchInput = document.getElementById('github-branch');
  const statusMessage = document.getElementById('status-message');

  // Add token creation link after token input
  const tokenLink = document.createElement('a');
  tokenLink.href = 'https://github.com/settings/tokens/new';
  tokenLink.textContent = 'Create a new GitHub token';
  tokenLink.target = '_blank';
  tokenLink.style.display = 'inline-block';
  tokenLink.style.fontSize = '0.8em';
  tokenLink.style.marginTop = '5px';
  tokenInput.parentNode.insertBefore(tokenLink, tokenInput.nextSibling);
  
  // Add security note
  const securityNote = document.createElement('p');
  securityNote.textContent = 'Note: Your token is stored locally in your browser and no data is collected!';
  securityNote.style.fontSize = '0.8em';
  securityNote.style.color = '#666';
  securityNote.style.marginTop = '5px';
  tokenLink.parentNode.insertBefore(securityNote, tokenLink.nextSibling);

  // Load saved settings
  chrome.storage.sync.get(['github_token', 'github_owner', 'github_repo', 'github_branch'], function(data) {
    if (data.github_token) tokenInput.value = data.github_token;
    if (data.github_owner) ownerInput.value = data.github_owner;
    if (data.github_repo) repoInput.value = data.github_repo;
    if (data.github_branch) branchInput.value = data.github_branch;
  });

  // Save settings
  form.addEventListener('submit', function(event) {
    event.preventDefault();
    
    const token = tokenInput.value.trim();
    const owner = ownerInput.value.trim();
    const repo = repoInput.value.trim();
    const branch = branchInput.value.trim() || 'main';

    if (!token || !owner || !repo) {
      showStatus('Please fill all required fields', 'error');
      return;
    }

    // Save to Chrome storage
    chrome.storage.sync.set({
      'github_token': token,
      'github_owner': owner,
      'github_repo': repo,
      'github_branch': branch
    }, function() {
      showStatus('Settings saved successfully!', 'success');
    });
  });

  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = type;
    
    // Clear message after 3 seconds
    setTimeout(() => {
      statusMessage.textContent = '';
      statusMessage.className = '';
    }, 3000);
  }
});
