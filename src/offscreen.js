// Offscreen document for the AI connection: the service worker has no
// DOMParser, so BOOTH library pages are fetched and parsed here. Offscreen
// documents cannot use chrome.storage, so results go back to the service
// worker, which saves them.
import {
  BoothAuthError,
  indexBoothProductSupport,
  loadBoothDownloadOptions,
  syncBoothLibrary,
} from "./booth.js";

function failure(error, fallback) {
  return {
    ok: false,
    code: error instanceof BoothAuthError ? "AUTH_REQUIRED" : error?.code || "BOOTH_ERROR",
    error: error instanceof BoothAuthError
      ? "Log in to BOOTH in this browser profile, then try again."
      : error?.message || fallback,
  };
}

const handlers = {
  async "list-download-options"(message) {
    const options = await loadBoothDownloadOptions(message.item);
    return { options: options.map(({ id, label, detail, url }) => ({ id, label, detail, url })) };
  },
  async "sync-library"() {
    const result = await syncBoothLibrary();
    return { items: result.items, syncedAt: result.syncedAt, downloadFileCount: result.downloadFileCount };
  },
  async "index-support"(message) {
    const result = await indexBoothProductSupport(message.items, {
      onCheckpoint: (items) => chrome.runtime.sendMessage({ type: "support-index-checkpoint", items }),
    });
    return {
      scannedCount: result.scannedCount,
      failedCount: result.failedCount,
      supportedProductCount: result.supportedProductCount,
    };
  },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.target !== "offscreen") return false;
  const handler = Object.hasOwn(handlers, message.type) ? handlers[message.type] : null;
  if (!handler) return false;
  handler(message)
    .then((value) => sendResponse({ ok: true, ...value }))
    .catch((error) => sendResponse(failure(error, "Could not read the BOOTH library.")));
  return true;
});
