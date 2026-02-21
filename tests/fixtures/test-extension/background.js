// Minimal service worker for testing
chrome.runtime.onInstalled.addListener(() => {
  console.log('Test extension installed');
  chrome.storage.local.set({ testKey: 'testValue', installedAt: Date.now() });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ping') {
    sendResponse({ type: 'pong', timestamp: Date.now() });
  }
});
