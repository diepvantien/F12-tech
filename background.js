// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  
  // Skip special pages
  if (tab.url?.startsWith('chrome://') || 
      tab.url?.startsWith('chrome-extension://') ||
      tab.url?.startsWith('https://chrome.google.com/webstore')) {
    // console.warn("F12 Tech: Cannot run on this page");
    return;
  }
  
  try {
    // Try to send message first
    await chrome.tabs.sendMessage(tab.id, { type: "F12TECH_TOGGLE" });
  } catch (e) {
    // If content script not loaded, inject it first
    // console.log("F12 Tech: Injecting content script...");
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["contentScript.js"]
      });
      // Wait a bit for script to initialize
      setTimeout(async () => {
        try {
          await chrome.tabs.sendMessage(tab.id, { type: "F12TECH_TOGGLE" });
        } catch (err) {
          // console.warn("F12 Tech: Failed to toggle after inject", err);
        }
      }, 100);
    } catch (injectErr) {
      // console.warn("F12 Tech: Cannot inject on this page", injectErr);
    }
  }
});

// Handle keyboard shortcut
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-editor") return;
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  
  // Skip special pages
  if (tab.url?.startsWith('chrome://') || 
      tab.url?.startsWith('chrome-extension://') ||
      tab.url?.startsWith('https://chrome.google.com/webstore')) {
    return;
  }
  
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "F12TECH_TOGGLE" });
  } catch (e) {
    // Inject and retry
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["contentScript.js"]
      });
      setTimeout(async () => {
        try {
          await chrome.tabs.sendMessage(tab.id, { type: "F12TECH_TOGGLE" });
        } catch (err) {
          // console.warn("F12 Tech: Failed to toggle", err);
        }
      }, 100);
    } catch (injectErr) {
      // console.warn("F12 Tech: Cannot inject", injectErr);
    }
  }
});
