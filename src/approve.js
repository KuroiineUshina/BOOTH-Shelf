// Approval window for downloads requested through the AI connection.
import { element } from "./dom.js";
import { applyDocumentTranslations, resolveLocale, setLocale, t } from "./i18n.js";
import { loadPreferences } from "./storage.js";

const jobId = new URLSearchParams(window.location.search).get("job") || "";
const list = document.getElementById("approval-list");
const allowButton = document.getElementById("approval-allow");
const denyButton = document.getElementById("approval-deny");

function decide(approved) {
  allowButton.disabled = true;
  denyButton.disabled = true;
  chrome.runtime.sendMessage({ type: "ai-approval-decide", jobId, approved })
    .finally(() => window.close());
}

async function init() {
  try {
    const preferences = await loadPreferences();
    setLocale(resolveLocale(preferences.locale, navigator.language));
  } catch {
    // Keep the default language.
  }
  applyDocumentTranslations();

  const { request } = await chrome.runtime.sendMessage({ type: "ai-approval-get", jobId });
  if (!request) {
    document.getElementById("approval-lead").textContent = t("이미 처리했거나 만료된 요청이에요.");
    allowButton.hidden = true;
    denyButton.textContent = t("닫기");
    denyButton.addEventListener("click", () => window.close());
    return;
  }

  for (const item of request.items) {
    const entry = element("li", { className: "approval-item" });
    entry.append(
      element("strong", { text: item.title }),
      element("span", { className: "approval-shop", text: item.shop }),
    );
    const files = element("ul", { className: "approval-files" });
    for (const file of item.files) {
      files.append(element("li", { text: file.size ? `${file.name} · ${file.size}` : file.name }));
    }
    entry.append(files);
    list.append(entry);
  }
  allowButton.addEventListener("click", () => decide(true));
  denyButton.addEventListener("click", () => decide(false));
  allowButton.focus();
}

void init();
