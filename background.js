const DASHBOARD_PATH = "dashboard.html";

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL(DASHBOARD_PATH) });
});
