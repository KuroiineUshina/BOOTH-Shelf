// Offscreen document for the AI connection: the service worker has no
// DOMParser, so BOOTH library pages are fetched and parsed here.
import { BoothAuthError, loadBoothDownloadOptions } from "./booth.js";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.target !== "offscreen") return false;
  if (message.type !== "list-download-options") return false;
  loadBoothDownloadOptions(message.item)
    .then((options) => sendResponse({
      ok: true,
      options: options.map(({ id, label, detail, url }) => ({ id, label, detail, url })),
    }))
    .catch((error) => sendResponse({
      ok: false,
      code: error instanceof BoothAuthError ? "AUTH_REQUIRED" : error?.code || "BOOTH_ERROR",
      error: error instanceof BoothAuthError
        ? "Log in to BOOTH in this browser profile, then try again."
        : error?.message || "Could not read BOOTH download files.",
    }));
  return true;
});
