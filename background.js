import {
  AI_BRIDGE_HOST_NAME,
  AI_BRIDGE_PERMISSIONS,
  AI_BRIDGE_PROTOCOL_VERSION,
  createAiBridge,
} from "./src/ai-bridge.js";
import { PREFERENCES_KEY, loadPreferences, loadState } from "./src/storage.js";
import { sanitizeDownloadUrl } from "./src/urls.js";

const DASHBOARD_PATH = "dashboard.html";
const OFFSCREEN_PATH = "offscreen.html";
const APPROVAL_PATH = "approve.html";
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;
const RECONNECT_DELAY_MS = 5_000;
const CONNECT_TIMEOUT_MS = 4_000;

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL(DASHBOARD_PATH) });
});

// --- AI connection (booth-shelf-mcp native host) -------------------------

const bridgeState = {
  port: null,
  status: "off", // off | connecting | connected | host_missing | permission_missing | error
  error: "",
  reconnectTimer: null,
  attempt: Promise.resolve(),
};
const pendingApprovals = new Map();

async function hasAiPermissions() {
  try {
    return Boolean(await chrome.permissions?.contains({ permissions: [...AI_BRIDGE_PERMISSIONS] }));
  } catch {
    return false;
  }
}

async function ensureOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (contexts.length) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ["DOM_PARSER"],
    justification: "Parse BOOTH library pages to list download files for the AI connection.",
  });
}

async function loadDownloadOptions(item) {
  await ensureOffscreenDocument();
  const response = await chrome.runtime.sendMessage({ target: "offscreen", type: "list-download-options", item });
  if (!response?.ok) {
    const error = new Error(response?.error || "Could not read BOOTH download files.");
    error.code = response?.code || "BOOTH_ERROR";
    throw error;
  }
  return response.options;
}

function requestApproval(request) {
  return new Promise((resolve) => {
    const entry = { request, resolve, windowId: null, timer: null };
    const settle = (approved) => {
      if (!pendingApprovals.has(request.jobId)) return;
      pendingApprovals.delete(request.jobId);
      clearTimeout(entry.timer);
      if (entry.windowId !== null) chrome.windows.remove(entry.windowId).catch(() => {});
      resolve(approved);
    };
    entry.settle = settle;
    entry.timer = setTimeout(() => settle(false), APPROVAL_TIMEOUT_MS);
    pendingApprovals.set(request.jobId, entry);
    chrome.windows.create({
      url: chrome.runtime.getURL(`${APPROVAL_PATH}?job=${encodeURIComponent(request.jobId)}`),
      type: "popup",
      width: 480,
      height: 620,
      focused: true,
    }).then((window) => {
      entry.windowId = window.id;
    }).catch(() => settle(false));
  });
}

async function startDownload({ url, filename }) {
  const safeUrl = sanitizeDownloadUrl(url);
  if (!safeUrl) throw new Error("Blocked a non-BOOTH download address.");
  return chrome.downloads.download({ url: safeUrl, filename, conflictAction: "uniquify", saveAs: false });
}

async function getDownload(downloadId) {
  const [item] = await chrome.downloads.search({ id: downloadId });
  return item || null;
}

const bridge = createAiBridge({
  loadState,
  loadDownloadOptions,
  requestApproval,
  shouldAskApproval: async () => (await loadPreferences().catch(() => null))?.aiApproveDownloads !== false,
  startDownload,
  getDownload,
  extensionVersion: chrome.runtime.getManifest?.().version || "",
});

function setBridgeStatus(status, error = "") {
  bridgeState.status = status;
  bridgeState.error = error;
}

async function handleHostMessage(message) {
  if (message?.type !== "request" || typeof message.id !== "string") return;
  try {
    const result = await bridge.handle(message.method, message.params);
    bridgeState.port?.postMessage({ type: "response", id: message.id, result });
  } catch (error) {
    bridgeState.port?.postMessage({
      type: "response",
      id: message.id,
      error: { code: error?.code || "ERROR", message: error?.message || String(error) },
    });
  }
}

function disconnectBridge(status = "off") {
  clearTimeout(bridgeState.reconnectTimer);
  bridgeState.reconnectTimer = null;
  const port = bridgeState.port;
  bridgeState.port = null;
  port?.disconnect();
  setBridgeStatus(status);
}

// Resolves once the attempt is decided: the host answered "ready", Chrome
// disconnected the port (with its error message), or the host stayed silent.
function connectBridge() {
  setBridgeStatus("connecting");
  let port;
  try {
    port = chrome.runtime.connectNative(AI_BRIDGE_HOST_NAME);
  } catch (error) {
    setBridgeStatus("host_missing", error?.message || "");
    return Promise.resolve();
  }
  bridgeState.port = port;
  const attempt = new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (bridgeState.port === port && bridgeState.status === "connecting") {
        setBridgeStatus("error", "The booth-shelf-mcp host did not answer.");
      }
      resolve();
    }, CONNECT_TIMEOUT_MS);
    port.onMessage.addListener((message) => {
      if (message?.type === "ready") {
        setBridgeStatus("connected");
        clearTimeout(timer);
        resolve();
      } else {
        void handleHostMessage(message);
      }
    });
    port.onDisconnect.addListener(() => {
      clearTimeout(timer);
      resolve();
      if (bridgeState.port !== port) return;
      bridgeState.port = null;
      const reason = chrome.runtime.lastError?.message || "";
      if (/not found|not exist|forbidden/i.test(reason)) {
        setBridgeStatus("host_missing", reason);
        return;
      }
      const wasConnected = bridgeState.status === "connected";
      setBridgeStatus("error", reason || "The booth-shelf-mcp host exited.");
      // Only an established connection is retried automatically; a failed
      // start waits for the user to reopen settings instead of looping.
      if (wasConnected) {
        clearTimeout(bridgeState.reconnectTimer);
        bridgeState.reconnectTimer = setTimeout(() => { void refreshBridge(); }, RECONNECT_DELAY_MS);
      }
    });
  });
  bridgeState.attempt = attempt;
  port.postMessage({ type: "hello", protocol: AI_BRIDGE_PROTOCOL_VERSION, version: chrome.runtime.getManifest().version });
  return attempt;
}

async function refreshBridge({ retry = true } = {}) {
  if (!chrome.runtime?.connectNative && !chrome.permissions) return;
  const preferences = await loadPreferences().catch(() => null);
  if (!preferences?.aiBridge) {
    disconnectBridge("off");
    return;
  }
  if (!(await hasAiPermissions())) {
    disconnectBridge("permission_missing");
    return;
  }
  if (bridgeState.port) {
    await bridgeState.attempt;
    return;
  }
  if (!retry && ["host_missing", "error"].includes(bridgeState.status)) return;
  await connectBridge();
}

chrome.runtime.onMessage?.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (message?.type === "ai-bridge-status") {
    refreshBridge({ retry: message.reconnect === true })
      .finally(() => sendResponse({ status: bridgeState.status, error: bridgeState.error }));
    return true;
  }
  if (message?.type === "ai-approval-get") {
    const entry = pendingApprovals.get(message.jobId);
    sendResponse(entry ? { request: entry.request } : { request: null });
    return false;
  }
  if (message?.type === "ai-approval-decide") {
    pendingApprovals.get(message.jobId)?.settle(message.approved === true);
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

chrome.windows?.onRemoved?.addListener((windowId) => {
  for (const entry of pendingApprovals.values()) {
    if (entry.windowId === windowId) entry.settle(false);
  }
});
chrome.storage?.onChanged?.addListener((changes, areaName) => {
  if (areaName === "local" && changes[PREFERENCES_KEY]) void refreshBridge();
});
chrome.permissions?.onAdded?.addListener(() => { void refreshBridge(); });
chrome.permissions?.onRemoved?.addListener(() => { void refreshBridge(); });
chrome.runtime.onStartup?.addListener(() => { void refreshBridge(); });
void refreshBridge();
