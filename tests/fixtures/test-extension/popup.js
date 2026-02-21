document.getElementById('testBtn').addEventListener('click', async () => {
  const data = await chrome.storage.local.get(null);
  document.getElementById('output').textContent = JSON.stringify(data, null, 2);
});
