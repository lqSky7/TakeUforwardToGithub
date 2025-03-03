document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('github-config-form');
  const tokenInput = document.getElementById('github-token');
  const ownerInput = document.getElementById('github-owner');
  const repoInput = document.getElementById('github-repo');
  const branchInput = document.getElementById('github-branch');
  const statusMessage = document.getElementById('status-message');

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
