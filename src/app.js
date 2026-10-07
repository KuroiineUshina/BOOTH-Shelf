import {
  MAX_FOLDER_DEPTH,
  buildFolderTree,
  canMoveFolder,
  createCategory,
  createFolder,
  deleteCategoryAndReleaseFolders,
  deleteFolderAndPromote,
  filterItems,
  folderDepth,
  getFolderPath,
  getItemFolderIds,
  itemHasSource,
  matchingDownloadFiles,
  moveFolder,
  renameCategory,
  renameFolder,
  setItemDownloadFiles,
  setItemFolderAssignments,
  setItemsFolderAssignment,
  sortItems,
  toggleCategoryCollapsed,
} from "./domain.js";
import {
  BoothAuthError,
  calculateBoothSpending,
  indexBoothProductSupport,
  loadBoothDownloadOptions,
  syncBoothLibrary,
} from "./booth.js";
import {
  DEFAULT_GRID_COLUMNS,
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  PREFERENCES_KEY,
  SPENDING_SUMMARY_KEY,
  STORAGE_KEY,
  clearState,
  assertBackupSize,
  decodeOrganizationBackup,
  encodeOrganizationBackup,
  isOwnStorageChange,
  loadPreferences,
  loadSpendingSummary,
  loadState,
  restoreOrganizationBackup,
  restrictStorageAccess,
  runLibraryOperation,
  runSupportIndexOperation,
  sanitizeState,
  saveSpendingSummary,
  updatePreferences,
  updateState,
  useMemoryStorage,
} from "./storage.js";
import { startBoothDownload } from "./download.js";
import { demoDownloadOptions, demoState } from "./demo.js";
import { element, lucideIcon, setLucideIcon } from "./dom.js";
import { productCategoryLabel } from "./product-categories.js";
import { AI_BRIDGE_PERMISSIONS } from "./ai-bridge.js";
import {
  applyDocumentTranslations,
  formatLocalizedDate,
  formatLocalizedNumber,
  getLocale,
  resolveLocale,
  setLocale,
  t,
} from "./i18n.js";

const PAGE_SIZE = 48;
const CARD_CACHE_LIMIT = PAGE_SIZE * 4;
const CARD_LAYOUT_DURATION_MS = 260;
const IS_DEMO = new URLSearchParams(window.location.search).has("demo");
const BOOTH_ACCOUNT_PERMISSION = "https://accounts.booth.pm/*";
const BOOTH_PRODUCT_PERMISSION = "https://booth.pm/*";
const CARD_FLIP_FOCUS_DELAY_MS = 360;
const DRAG_CLICK_SUPPRESSION_MS = 320;
const POINTER_DRAG_THRESHOLD_PX = 7;
const SORT_SWITCH_ROLL_DURATION_MS = 360;
const DROP_SUCCESS_DURATION_MS = 760;
const LOCALE_SEQUENCE = Object.freeze(["ko", "en", "ja"]);
const LOCALE_NAMES = Object.freeze({
  ko: "한국어",
  en: "English",
  ja: "日本語",
});
const THEME_SEQUENCE = Object.freeze(["light", "dark", "system"]);
const THEME_LABELS = Object.freeze({
  light: "라이트 모드",
  dark: "다크 모드",
  system: "시스템 설정",
});
const THEME_ICONS = Object.freeze({
  light: "sun",
  dark: "moon",
  system: "monitor",
});
const SYSTEM_THEME_MEDIA = window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;

const ui = {
  source: "all",
  folderId: "all",
  favoritesOnly: false,
  query: "",
  searchField: "all",
  sortKind: "purchase",
  sortDirection: "asc",
  visibleLimit: PAGE_SIZE,
  selectedFolderId: null,
  folderDialogMode: null,
  folderDialogFolderId: null,
  folderDialogCategoryId: null,
  assigningItemKey: null,
  selectedCategoryId: null,
  confirmDeleteType: null,
  confirmDeleteFolderId: null,
  dropSuccessFolderId: null,
  syncing: false,
  indexingSupport: false,
  calculatingSpending: false,
};
const selectedItemKeys = new Set();
const sortSwitchAnimationTimers = new WeakMap();
const sidebarResize = {
  active: false,
  pointerId: null,
  startX: 0,
  startWidth: DEFAULT_SIDEBAR_WIDTH,
};

let state;
let preferences;
let spendingSummary;
let renderTimer;
let syncPanelHideTimer;
// Set when a type label (not the user) switched the search field to "kind".
let searchFieldSetByLabel = false;
let supportIndexController = null;
let dropSuccessTimer;
let contextMenuCloseTimer;
let contextMenuReturnFocus;
let loadMoreObserver;
let themeSwitchFrame;
let hasShownCards = false;
let pendingOrganizationBackup = null;
const downloadCardStates = new Map();
const itemDrag = {
  itemKeys: [],
  originItemKey: null,
  target: null,
  openedSidebar: false,
  suppressClickUntil: 0,
  pointerId: null,
  pointerStartX: 0,
  pointerStartY: 0,
  pointerOffsetX: 0,
  pointerOffsetY: 0,
  pointerCard: null,
  preview: null,
  previewWidth: 0,
  previewHeight: 0,
};
const refs = Object.fromEntries(
  [
    "sidebar", "sidebar-close", "sidebar-open", "sidebar-backdrop", "sidebar-resizer",
    "all-count", "purchased-count", "gift-count", "free-count", "favorites-count",
    "favorites-nav", "add-root-folder", "add-category", "all-folders", "unfiled-folder",
    "unfiled-count", "folder-tree", "search-input",
    "search-field", "search-clear", "sync-button", "view-eyebrow", "view-title",
    "view-description", "last-sync", "grid-density", "sort-kind-toggle", "sort-kind-icon",
    "sort-kind-value", "sort-direction-toggle", "sort-direction-value", "sync-panel",
    "sync-message", "sync-detail", "sync-progress", "login-link",
    "result-summary", "selection-summary", "selection-count", "selection-clear",
    "item-grid", "empty-state",
    "empty-title", "empty-description", "empty-sync-button",
    "empty-login-link", "load-more-sentinel", "toast", "context-menu",
    "folder-dialog", "folder-form", "folder-dialog-title",
    "folder-name-field", "folder-name-label", "folder-name-input",
    "folder-description-field", "folder-description-input", "folder-parent-field",
    "folder-parent-label", "folder-parent-select", "folder-parent-hint", "folder-form-error", "folder-submit",
    "assign-dialog", "assign-form", "assign-item-name",
    "assign-folder-list", "assign-submit", "confirm-dialog", "confirm-form", "confirm-copy",
    "confirm-dialog-eyebrow", "confirm-dialog-title", "confirm-submit",
    "settings-button", "settings-dialog", "clear-local-data",
    "ai-bridge-status", "ai-bridge-command", "ai-bridge-toggle", "ai-approve-downloads",
    "export-organization-data", "import-organization-data",
    "organization-backup-file", "organization-restore-dialog",
    "organization-restore-form", "organization-restore-summary",
    "data-delete-dialog", "data-delete-form",
    "theme-toggle", "theme-toggle-icon", "language-toggle",
    "red-pill-button", "red-pill-dialog", "red-pill-intro",
    "red-pill-progress", "red-pill-progress-message", "red-pill-progress-detail",
    "red-pill-progress-value", "red-pill-result", "red-pill-total",
    "red-pill-other-currencies", "red-pill-order-count", "red-pill-average",
    "red-pill-free-count", "red-pill-verdict", "red-pill-calculated-at",
    "red-pill-error", "red-pill-calculate",
  ].map((id) => [id, document.getElementById(id)]),
);

function formatCount(value) {
  return formatLocalizedNumber(value);
}

function formatMoney(amount, currency = "JPY") {
  const value = Number(amount || 0);
  if (currency === "JPY") {
    return t("{amount}엔", { amount: formatLocalizedNumber(Math.round(value)) });
  }
  return `${formatLocalizedNumber(value, { maximumFractionDigits: 2 })} ${currency}`;
}

function normalizeThemePreference(theme) {
  return THEME_SEQUENCE.includes(theme) ? theme : "light";
}

function normalizeSidebarWidth(value) {
  const width = Number.isFinite(Number(value)) ? Math.round(Number(value)) : DEFAULT_SIDEBAR_WIDTH;
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

function applySidebarWidth(value) {
  const width = normalizeSidebarWidth(value);
  document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
  refs["sidebar-resizer"].setAttribute("aria-valuenow", String(width));
  return width;
}

function normalizeGridColumns(value) {
  const columns = Number(value);
  return [4, 5, 6].includes(columns) ? columns : DEFAULT_GRID_COLUMNS;
}

function applyGridColumns(value) {
  const columns = normalizeGridColumns(value);
  const labels = { 4: "큰 카드", 5: "보통 카드", 6: "작은 카드" };
  document.documentElement.style.setProperty("--grid-columns", String(columns));
  document.documentElement.dataset.gridColumns = String(columns);
  refs["grid-density"].value = String(columns);
  refs["grid-density"].style.setProperty("--grid-density-progress", `${(columns - 4) * 50}%`);
  refs["grid-density"].setAttribute("aria-valuetext", t(labels[columns]));
  return columns;
}

function applyLayoutPreferences() {
  applySidebarWidth(preferences?.sidebarWidth);
  applyGridColumns(preferences?.gridColumns);
}

function applyTheme(theme) {
  const preference = normalizeThemePreference(theme);
  const resolvedTheme = preference === "system"
    ? (SYSTEM_THEME_MEDIA?.matches ? "dark" : "light")
    : preference;
  const currentIndex = THEME_SEQUENCE.indexOf(preference);
  const nextTheme = THEME_SEQUENCE[(currentIndex + 1) % THEME_SEQUENCE.length];
  const label = t("테마 변경: 현재 {current}, 다음 {next}", {
    current: t(THEME_LABELS[preference]),
    next: t(THEME_LABELS[nextTheme]),
  });
  const root = document.documentElement;
  window.cancelAnimationFrame(themeSwitchFrame);
  root.classList.add("is-theme-switching");
  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = preference;
  refs["theme-toggle"].dataset.themePreference = preference;
  refs["theme-toggle"].setAttribute("aria-label", label);
  refs["theme-toggle"].title = label;
  setLucideIcon(refs["theme-toggle-icon"], THEME_ICONS[preference]);
  void root.offsetWidth;
  themeSwitchFrame = window.requestAnimationFrame(() => {
    root.classList.remove("is-theme-switching");
  });
}

function handleSystemThemeChange() {
  if (preferences?.theme === "system") applyTheme("system");
}

function applyLocalePreference(localePreference) {
  const browserLocale = navigator.languages?.[0] || navigator.language || "ko";
  const locale = resolveLocale(localePreference, browserLocale);
  setLocale(locale);
  applyDocumentTranslations();
  updateLanguageToggle(locale);
  applyTheme(preferences?.theme);
  applyGridColumns(preferences?.gridColumns);
}

function updateLanguageToggle(locale = getLocale()) {
  const currentIndex = Math.max(0, LOCALE_SEQUENCE.indexOf(locale));
  const nextLocale = LOCALE_SEQUENCE[(currentIndex + 1) % LOCALE_SEQUENCE.length];
  const label = t("언어 변경: 현재 {current}, 다음 {next}", {
    current: LOCALE_NAMES[locale] || LOCALE_NAMES.ko,
    next: LOCALE_NAMES[nextLocale],
  });
  refs["language-toggle"].dataset.locale = locale;
  refs["language-toggle"].setAttribute("aria-label", label);
  refs["language-toggle"].title = label;
}

async function toggleTheme() {
  try {
    preferences = await updatePreferences((latest) => {
      const currentIndex = THEME_SEQUENCE.indexOf(normalizeThemePreference(latest.theme));
      return { ...latest, theme: THEME_SEQUENCE[(currentIndex + 1) % THEME_SEQUENCE.length] };
    });
    applyTheme(preferences.theme);
  } catch (error) {
    showToast(t("테마 설정을 저장하지 못했어요: {message}", { message: error.message }), "error");
  }
}

async function changeLocale(locale) {
  try {
    preferences = await updatePreferences((latest) => ({ ...latest, locale }));
    applyLocalePreference(preferences.locale);
    renderPreservingViewport();
  } catch (error) {
    showToast(t("언어 설정을 저장하지 못했어요: {message}", { message: error.message }), "error");
  }
}

async function cycleLocale() {
  const currentIndex = Math.max(0, LOCALE_SEQUENCE.indexOf(getLocale()));
  const nextLocale = LOCALE_SEQUENCE[(currentIndex + 1) % LOCALE_SEQUENCE.length];
  await changeLocale(nextLocale);
}

function formatSyncTime(value) {
  if (!value) return t("아직 동기화하지 않았어요");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("동기화 시간 알 수 없음");
  return t("최근 동기화 {date}", { date: formatLocalizedDate(date, {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }) });
}

async function persistState(mutate) {
  const committed = await updateState(mutate);
  state = committed;
  return committed;
}

async function requestBoothAccess({ productPages = false } = {}) {
  if (typeof chrome === "undefined" || !chrome.permissions?.request) return false;
  return chrome.permissions.request({
    origins: [
      BOOTH_ACCOUNT_PERMISSION,
      ...(productPages ? [BOOTH_PRODUCT_PERMISSION] : []),
    ],
  });
}

async function removeBoothAccess() {
  if (typeof chrome === "undefined" || !chrome.permissions?.remove) return false;
  return chrome.permissions.remove({
    permissions: [...AI_BRIDGE_PERMISSIONS],
    origins: [BOOTH_ACCOUNT_PERMISSION, BOOTH_PRODUCT_PERMISSION],
  });
}

const AI_BRIDGE_STATUS_MESSAGES = Object.freeze({
  off: "꺼져 있어요.",
  connecting: "연결 프로그램에 연결하는 중이에요.",
  connected: "연결됐어요. AI 도구에서 BOOTH Shelf 도구를 쓸 수 있어요.",
  host_missing: "연결 프로그램이 아직 설치되지 않았어요. 아래 명령을 한 번 실행한 뒤 Chrome을 다시 시작해 주세요.",
  permission_missing: "권한이 없어 연결하지 못했어요. AI 연결을 다시 켜 주세요.",
  error: "연결 프로그램을 시작하지 못했어요. 설정을 다시 열면 다시 연결해요.",
});

async function saveAiApproveDownloads(checked) {
  try {
    preferences = await updatePreferences((latest) => ({ ...latest, aiApproveDownloads: checked }));
    showToast(t(checked
      ? "AI가 다운로드할 때마다 승인 창을 띄워요."
      : "이제 AI가 요청한 파일을 묻지 않고 바로 받아요."));
  } catch (error) {
    refs["ai-approve-downloads"].checked = !checked;
    showToast(t("AI 연결 설정을 바꾸지 못했어요: {message}", { message: error.message }), "error");
  }
}

async function renderAiBridgeStatus({ reconnect = false } = {}) {
  const enabled = Boolean(preferences?.aiBridge);
  refs["ai-bridge-toggle"].textContent = t(enabled ? "AI 연결 끄기" : "AI 연결 켜기");
  refs["ai-bridge-toggle"].disabled = IS_DEMO;
  refs["ai-approve-downloads"].checked = preferences?.aiApproveDownloads !== false;
  refs["ai-approve-downloads"].disabled = IS_DEMO;
  let status = "off";
  let detail = "";
  if (!IS_DEMO && enabled && typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
    if (reconnect) {
      refs["ai-bridge-status"].dataset.state = "connecting";
      refs["ai-bridge-status"].textContent = t(AI_BRIDGE_STATUS_MESSAGES.connecting);
    }
    try {
      const response = await chrome.runtime.sendMessage({ type: "ai-bridge-status", reconnect });
      status = response?.status || "error";
      detail = response?.error || "";
    } catch (error) {
      status = "error";
      detail = error?.message || "";
    }
  }
  refs["ai-bridge-status"].dataset.state = status;
  const message = IS_DEMO
    ? t("미리보기에서는 AI 연결을 사용할 수 없어요.")
    : t(AI_BRIDGE_STATUS_MESSAGES[status] || AI_BRIDGE_STATUS_MESSAGES.error);
  // Chrome's own error text helps when the helper is installed but won't start.
  refs["ai-bridge-status"].textContent = detail && ["host_missing", "error"].includes(status)
    ? `${message} (${detail})`
    : message;
  const showCommand = status === "host_missing";
  refs["ai-bridge-command"].hidden = !showCommand;
  if (showCommand) {
    refs["ai-bridge-command"].textContent = `npx booth-shelf-mcp install --extension-id ${chrome.runtime.id}`;
  }
}

async function toggleAiBridge() {
  if (IS_DEMO || typeof chrome === "undefined" || !chrome.permissions) return;
  const enable = !preferences?.aiBridge;
  refs["ai-bridge-toggle"].disabled = true;
  try {
    if (enable) {
      const granted = await chrome.permissions.request({
        permissions: [...AI_BRIDGE_PERMISSIONS],
        origins: [BOOTH_ACCOUNT_PERMISSION, BOOTH_PRODUCT_PERMISSION],
      });
      if (!granted) {
        showToast(t("AI 연결에 필요한 권한을 허용하지 않았어요."), "error");
        return;
      }
    }
    preferences = await updatePreferences((latest) => ({ ...latest, aiBridge: enable }));
    if (!enable) await chrome.permissions.remove({ permissions: [...AI_BRIDGE_PERMISSIONS] });
  } catch (error) {
    showToast(t("AI 연결 설정을 바꾸지 못했어요: {message}", { message: error.message }), "error");
  } finally {
    refs["ai-bridge-toggle"].disabled = false;
    await renderAiBridgeStatus({ reconnect: enable });
  }
}

function showToast(message, tone = "default") {
  refs.toast.textContent = message;
  refs.toast.dataset.tone = tone;
  refs.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => refs.toast.classList.remove("is-visible"), 2800);
}

function getSpendingVerdict(jpyTotal) {
  if (jpyTotal === 0) return t("아직 빨간약이 투명합니다. 무료 상품 수집가의 기운이 느껴져요.");
  if (jpyTotal < 50_000) return t("아직은 침착합니다. 취향 소비를 꽤 이성적으로 관리하고 있어요.");
  if (jpyTotal < 150_000) return t("취향에 성실한 편이군요. 장바구니와 좋은 관계를 유지 중입니다.");
  if (jpyTotal < 500_000) return t("BOOTH가 당신의 취향을 아주 잘 알고 있습니다.");
  if (jpyTotal < 1_000_000) return t("결제 버튼과 오래 알고 지낸 사이군요. 빨간약이 제법 진합니다.");
  return t("빨간약 최대 농도. 이제 라이브러리가 하나의 세계관입니다.");
}

function setRedPillProgress({ message, detail = "", percent = 0 }) {
  refs["red-pill-intro"].hidden = true;
  refs["red-pill-result"].hidden = true;
  refs["red-pill-error"].hidden = true;
  refs["red-pill-progress"].hidden = false;
  refs["red-pill-progress-message"].textContent = message;
  refs["red-pill-progress-detail"].textContent = detail;
  refs["red-pill-progress-value"].style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function renderSpendingSummary(summary) {
  const entries = Object.entries(summary?.totals || {});
  const primary = entries.find(([currency]) => currency === "JPY") || entries[0] || ["JPY", 0];
  const otherEntries = entries.filter(([currency]) => currency !== primary[0]);
  refs["red-pill-intro"].hidden = true;
  refs["red-pill-progress"].hidden = true;
  refs["red-pill-error"].hidden = true;
  refs["red-pill-result"].hidden = false;
  refs["red-pill-total"].textContent = formatMoney(primary[1], primary[0]);
  refs["red-pill-order-count"].textContent = t("{count}건", { count: formatCount(summary.orderCount) });
  refs["red-pill-free-count"].textContent = t("{count}건", { count: formatCount(summary.freeOrderCount) });
  refs["red-pill-average"].textContent = entries.length === 1 && summary.orderCount
    ? formatMoney(primary[1] / summary.orderCount, primary[0])
    : summary.orderCount ? t("통화별 집계") : formatMoney(0, primary[0]);
  refs["red-pill-verdict"].textContent = getSpendingVerdict(summary.totals.JPY || 0);
  refs["red-pill-calculated-at"].textContent = t("마지막 계산 {date}", { date: formatLocalizedDate(new Date(summary.scannedAt), {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }) });
  refs["red-pill-other-currencies"].hidden = !otherEntries.length;
  refs["red-pill-other-currencies"].textContent = otherEntries.length
    ? t("다른 통화: {amounts}", {
      amounts: otherEntries.map(([currency, amount]) => formatMoney(amount, currency)).join(" · "),
    })
    : "";
  refs["red-pill-calculate"].textContent = t("다시 계산");
}

function showRedPillError(error) {
  refs["red-pill-intro"].hidden = true;
  refs["red-pill-progress"].hidden = true;
  refs["red-pill-result"].hidden = true;
  refs["red-pill-error"].hidden = false;
  refs["red-pill-error"].textContent = error?.message || t("결제 금액을 계산하지 못했어요.");
}

async function runDemoSpending() {
  const phases = [
    [18, t("구매 내역 페이지 확인 중")],
    [52, t("결제 확인된 주문 모으는 중")],
    [82, t("결제 금액 더하는 중")],
    [100, t("빨간약 제조 완료")],
  ];
  for (const [percent, message] of phases) {
    setRedPillProgress({ message, detail: `${percent}%`, percent });
    await new Promise((resolve) => window.setTimeout(resolve, 180));
  }
  return {
    totals: { JPY: 287_400 },
    orderCount: 73,
    freeOrderCount: 11,
    scannedAt: new Date().toISOString(),
  };
}

async function calculateSpending() {
  if (ui.calculatingSpending) return;
  if (ui.syncing) {
    showRedPillError(new Error(t("전체 동기화가 끝난 뒤 계산해 주세요.")));
    return;
  }
  ui.calculatingSpending = true;
  refs["red-pill-calculate"].disabled = true;
  refs["red-pill-button"].disabled = true;
  refs["sync-button"].disabled = true;
  refs["clear-local-data"].disabled = true;
  refs["export-organization-data"].disabled = true;
  refs["import-organization-data"].disabled = true;
  refs["red-pill-calculate"].textContent = t("계산 중…");
  setRedPillProgress({
    message: t("BOOTH 구매 내역 연결 중"),
    detail: t("결제가 확인된 주문만 합산합니다."),
    percent: 3,
  });

  try {
    if (!IS_DEMO) {
      const permissionGranted = await requestBoothAccess();
      if (!permissionGranted) {
        const error = new Error(t("결제 금액을 계산하려면 BOOTH 계정 페이지 접근을 허용해 주세요."));
        error.code = "PERMISSION_REQUIRED";
        throw error;
      }
    }

    spendingSummary = await runLibraryOperation(async () => {
      const result = IS_DEMO
        ? await runDemoSpending()
        : await calculateBoothSpending((progress) => {
          setRedPillProgress({
            message: progress.message,
            detail: progress.total
              ? `${progress.completed} / ${progress.total}`
              : t("주문 수를 확인하고 있어요."),
            percent: progress.percent,
          });
        });
      return saveSpendingSummary(result);
    });
    renderSpendingSummary(spendingSummary);
    showToast(t("BOOTH 결제 금액 계산을 마쳤어요."));
  } catch (error) {
    const authError = error instanceof BoothAuthError || error?.code === "AUTH_REQUIRED";
    showRedPillError(authError
      ? new Error(t("같은 브라우저 프로필에서 BOOTH에 로그인한 뒤 다시 시도해 주세요."))
      : new Error(t(error.message)));
  } finally {
    ui.calculatingSpending = false;
    refs["red-pill-calculate"].disabled = false;
    refs["red-pill-button"].disabled = false;
    refs["sync-button"].disabled = syncButtonBlocked();
    refs["clear-local-data"].disabled = false;
    refs["export-organization-data"].disabled = false;
    refs["import-organization-data"].disabled = false;
    refs["red-pill-calculate"].textContent = t(spendingSummary ? "다시 계산" : "다시 시도");
  }
}

function openRedPillDialog() {
  refs["red-pill-dialog"].showModal();
  if (spendingSummary) renderSpendingSummary(spendingSummary);
  else calculateSpending();
}

function closeSidebar() {
  const wasOpen = document.body.classList.contains("sidebar-visible");
  document.body.classList.remove("sidebar-visible");
  syncSidebarAccessibility();
  if (wasOpen && window.matchMedia("(max-width: 980px)").matches) refs["sidebar-open"].focus();
}

function openSidebar() {
  document.body.classList.add("sidebar-visible");
  syncSidebarAccessibility();
  refs["sidebar-close"].focus();
}

function syncSidebarAccessibility() {
  const compact = window.matchMedia("(max-width: 980px)").matches;
  const open = compact && document.body.classList.contains("sidebar-visible");
  refs.sidebar.inert = compact && !open;
  document.getElementById("main-content").inert = open;
  document.getElementById("global-header").inert = open;
  refs["sidebar-open"].setAttribute("aria-expanded", String(open));
  refs.sidebar.setAttribute("role", open ? "dialog" : "complementary");
  if (open) refs.sidebar.setAttribute("aria-modal", "true");
  else refs.sidebar.removeAttribute("aria-modal");
}

function openSettingsDialog() {
  refs["settings-dialog"].showModal();
  void renderAiBridgeStatus({ reconnect: true });
}

async function saveSidebarWidth(width) {
  try {
    preferences = await updatePreferences((latest) => ({ ...latest, sidebarWidth: normalizeSidebarWidth(width) }));
    applySidebarWidth(preferences.sidebarWidth);
  } catch (error) {
    showToast(t("사이드바 너비를 저장하지 못했어요: {message}", { message: error.message }), "error");
  }
}

function beginSidebarResize(event) {
  if (event.button !== 0 || window.matchMedia("(max-width: 980px)").matches) return;
  event.preventDefault();
  sidebarResize.active = true;
  sidebarResize.pointerId = event.pointerId;
  sidebarResize.startX = event.clientX;
  sidebarResize.startWidth = refs.sidebar.getBoundingClientRect().width;
  refs["sidebar-resizer"].setPointerCapture?.(event.pointerId);
  document.body.classList.add("is-resizing-sidebar");
}

function updateSidebarResize(event) {
  if (!sidebarResize.active || event.pointerId !== sidebarResize.pointerId) return;
  event.preventDefault();
  applySidebarWidth(sidebarResize.startWidth + event.clientX - sidebarResize.startX);
}

function finishSidebarResize(event) {
  if (!sidebarResize.active || event.pointerId !== sidebarResize.pointerId) return;
  const width = Number.parseInt(refs["sidebar-resizer"].getAttribute("aria-valuenow"), 10);
  if (refs["sidebar-resizer"].hasPointerCapture?.(event.pointerId)) {
    refs["sidebar-resizer"].releasePointerCapture(event.pointerId);
  }
  sidebarResize.active = false;
  sidebarResize.pointerId = null;
  document.body.classList.remove("is-resizing-sidebar");
  void saveSidebarWidth(width);
}

function handleSidebarResizeKeydown(event) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const current = Number.parseInt(refs["sidebar-resizer"].getAttribute("aria-valuenow"), 10);
  const width = event.key === "Home"
    ? MIN_SIDEBAR_WIDTH
    : event.key === "End"
      ? MAX_SIDEBAR_WIDTH
      : current + (event.key === "ArrowRight" ? 8 : -8);
  const nextWidth = applySidebarWidth(width);
  void saveSidebarWidth(nextWidth);
}

async function saveGridColumns(value) {
  const gridColumns = applyGridColumns(value);
  try {
    preferences = await updatePreferences((latest) => ({ ...latest, gridColumns }));
  } catch (error) {
    showToast(t("카드 배열을 저장하지 못했어요: {message}", { message: error.message }), "error");
  }
}

function resetResultWindow() {
  ui.visibleLimit = PAGE_SIZE;
}

function getSelectedFolder() {
  return state.folders.find((folder) => folder.id === ui.selectedFolderId) ?? null;
}

function getSelectedCategory() {
  return state.categories.find((category) => category.id === ui.selectedCategoryId) ?? null;
}

function getViewCopy() {
  if (ui.favoritesOnly) {
    return {
      eyebrow: t("빠르게 다시 찾기"),
      title: t("즐겨찾기"),
      description: t("별표로 표시한 상품만 모아봤어요."),
    };
  }

  if (ui.folderId === "unfiled") {
    return {
      eyebrow: t("정리가 필요한 상품"),
      title: t("미분류"),
      description: t("아직 폴더에 넣지 않은 상품이에요."),
    };
  }

  if (ui.folderId !== "all") {
    const folder = state.folders.find((candidate) => candidate.id === ui.folderId);
    const path = folder ? getFolderPath(state.folders, folder.id) : [];
    const category = path.length
      ? state.categories.find((candidate) => candidate.id === path[0].categoryId)
      : null;
    return {
      eyebrow: [category?.name, ...path.slice(0, -1).map((entry) => entry.name)].filter(Boolean).join(" / ") || t("내 폴더"),
      title: folder?.name || t("폴더"),
      description: folder?.description || t("이 폴더에 분류한 상품을 보여드려요."),
    };
  }

  if (ui.source === "purchased") {
    return {
      eyebrow: t("내 BOOTH 보관함"),
      title: t("구매한 상품"),
      description: t("직접 구매해 라이브러리에 보관 중인 상품이에요."),
    };
  }

  if (ui.source === "gift") {
    return {
      eyebrow: t("내 BOOTH 보관함"),
      title: t("받은 기프트"),
      description: t("선물받아 기프트함에 보관 중인 상품이에요."),
    };
  }

  if (ui.source === "free") {
    return {
      eyebrow: t("내 BOOTH 보관함"),
      title: t("무료 상품"),
      description: t("무료 다운로드함에 보관 중인 상품이에요."),
    };
  }

  return {
    eyebrow: t("내 BOOTH 보관함"),
    title: t("전체 상품"),
    description: t("구매한 상품, 받은 기프트와 무료 다운로드를 한눈에 확인하세요."),
  };
}

function renderNavigation() {
  const purchasedCount = state.items.filter((item) => itemHasSource(item, "purchased")).length;
  const giftCount = state.items.filter((item) => itemHasSource(item, "gift")).length;
  const freeCount = state.items.filter((item) => itemHasSource(item, "free")).length;
  const favoriteCount = state.favorites.filter((key) => state.items.some((item) => item.key === key)).length;
  const unfiledCount = state.items.filter(
    (item) => !getItemFolderIds(state.assignments, item.key).length,
  ).length;

  refs["all-count"].textContent = formatCount(state.items.length);
  refs["purchased-count"].textContent = formatCount(purchasedCount);
  refs["gift-count"].textContent = formatCount(giftCount);
  refs["free-count"].textContent = formatCount(freeCount);
  refs["favorites-count"].textContent = formatCount(favoriteCount);
  refs["unfiled-count"].textContent = formatCount(unfiledCount);

  document.querySelectorAll("[data-source]").forEach((button) => {
    const active = !ui.favoritesOnly && ui.source === button.dataset.source;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  refs["favorites-nav"].classList.toggle("is-active", ui.favoritesOnly);
  refs["favorites-nav"].setAttribute("aria-pressed", String(ui.favoritesOnly));
  refs["all-folders"].classList.toggle("is-active", ui.folderId === "all");
  refs["unfiled-folder"].classList.toggle("is-active", ui.folderId === "unfiled");
  refs["unfiled-folder"].classList.toggle("is-drop-success", ui.dropSuccessFolderId === "unfiled");
}

function directFolderCount(folderId) {
  return state.items.filter(
    (item) => getItemFolderIds(state.assignments, item.key).includes(folderId),
  ).length;
}

function getFolderCategory(folderId) {
  const rootFolder = getFolderPath(state.folders, folderId)[0];
  return rootFolder
    ? state.categories.find((category) => category.id === rootFolder.categoryId) ?? null
    : null;
}

function getFolderDisplayPath(folderId) {
  const category = getFolderCategory(folderId);
  const path = getFolderPath(state.folders, folderId).map((folder) => folder.name);
  return [category?.name, ...path].filter(Boolean);
}

function countFolderNodes(branch) {
  return branch.reduce((count, folder) => count + 1 + countFolderNodes(folder.children), 0);
}

function renderFolderBranch(branch, depth = 1) {
  const fragment = document.createDocumentFragment();

  for (const folder of branch) {
    const wrapper = element("div", { className: "folder-branch" });
    const row = element("button", {
      className: `folder-row${ui.folderId === folder.id ? " is-active" : ""}${ui.selectedFolderId === folder.id ? " is-selected" : ""}${ui.dropSuccessFolderId === folder.id ? " is-drop-success" : ""}`,
      attrs: {
        type: "button",
        "aria-pressed": String(ui.folderId === folder.id),
        "data-folder-id": folder.id,
        "data-drop-folder-id": folder.id,
        title: t("{name} 폴더 · 상품 카드를 끌어 놓아 분류", { name: folder.name }),
      },
    });
    row.style.setProperty("--folder-depth", String(depth - 1));
    row.append(
      lucideIcon(folder.children.length ? "folders" : "folder", "folder-glyph"),
      element("span", { className: "folder-name", text: folder.name }),
      element("span", { className: "folder-count", text: formatCount(directFolderCount(folder.id)) }),
    );
    wrapper.append(row);

    if (folder.children.length) {
      const children = element("div", { className: "folder-children", attrs: { role: "group" } });
      children.append(renderFolderBranch(folder.children, depth + 1));
      wrapper.append(children);
    }

    fragment.append(wrapper);
  }

  return fragment;
}

function renderCategory(category, roots) {
  const wrapper = element("section", {
    className: `folder-category${category.collapsed ? " is-collapsed" : ""}`,
    attrs: { "data-category-wrapper-id": category.id },
  });
  const row = element("button", {
    className: "folder-category-row",
    attrs: {
      type: "button",
      "data-category-id": category.id,
      "aria-expanded": String(!category.collapsed),
      title: t("{name} 카테고리 접기 또는 펼치기", { name: category.name }),
    },
  });
  row.append(
    lucideIcon("chevron-right", "folder-category-chevron"),
    lucideIcon("folders", "folder-category-glyph"),
    element("span", { className: "folder-category-name", text: category.name }),
    element("span", { className: "folder-category-count", text: formatCount(countFolderNodes(roots)) }),
  );

  const contents = element("div", {
    className: "folder-category-contents",
    attrs: { "aria-hidden": String(category.collapsed) },
  });
  contents.inert = category.collapsed;
  const inner = element("div", { className: "folder-category-contents-inner" });
  if (roots.length) {
    inner.append(renderFolderBranch(roots));
  } else {
    inner.append(element("p", { className: "folder-category-empty", text: t("아직 폴더가 없어요.") }));
  }
  contents.append(inner);
  wrapper.append(row, contents);
  return wrapper;
}

function renderFolders() {
  const tree = buildFolderTree(state.folders);
  const fragment = document.createDocumentFragment();
  const orderedCategories = [...state.categories].sort((left, right) => (
    (left.order ?? 0) - (right.order ?? 0)
      || left.name.localeCompare(right.name, ["ko", "ja", "en"], { numeric: true })
  ));
  for (const category of orderedCategories) {
    fragment.append(renderCategory(
      category,
      tree.filter((folder) => folder.categoryId === category.id),
    ));
  }
  const uncategorizedRoots = tree.filter((folder) => !folder.categoryId);
  if (orderedCategories.length && uncategorizedRoots.length) {
    fragment.append(element("p", {
      className: "folder-uncategorized-label",
      text: t("카테고리 없음"),
    }));
  }
  fragment.append(renderFolderBranch(uncategorizedRoots));
  refs["folder-tree"].replaceChildren(fragment);
}

function getDownloadCardState(itemKey) {
  return downloadCardStates.get(itemKey) ?? {
    flipped: false,
    status: "idle",
    options: [],
    error: "",
    authRequired: false,
  };
}

function createDownloadBack(item, downloadState) {
  const back = element("section", {
    className: "item-card-face item-card-back",
    attrs: {
      "aria-label": t("{title} 다운로드 옵션", { title: item.title }),
      "aria-hidden": String(!downloadState.flipped),
    },
  });
  back.inert = !downloadState.flipped;

  const header = element("div", { className: "download-back-header" });
  const headingCopy = element("div", { className: "download-back-heading" });
  headingCopy.append(
    element("span", { className: "download-back-kicker", text: "DOWNLOAD" }),
    element("h2", { className: "download-back-title", text: item.title, attrs: { title: item.title } }),
  );
  const closeButton = element("button", {
    className: "download-close-button",
    attrs: {
      type: "button",
      "data-download-close": item.key,
      "aria-label": t("상품 카드로 돌아가기"),
    },
  });
  closeButton.append(lucideIcon("arrow-left"));
  header.append(headingCopy, closeButton);

  const body = element("div", {
    className: "download-back-body",
    attrs: { "aria-live": "polite" },
  });

  if (downloadState.status === "loading") {
    const loading = element("div", { className: "download-state" });
    loading.append(
      element("span", { className: "download-spinner", attrs: { "aria-hidden": "true" } }),
      element("strong", { text: t("다운로드 목록 불러오는 중") }),
      element("p", { text: t("BOOTH에서 최신 파일 정보를 확인하고 있어요.") }),
    );
    body.append(loading);
  } else if (downloadState.status === "error") {
    const failed = element("div", { className: "download-state download-error-state" });
    failed.append(
      lucideIcon("circle-alert", "download-error-mark"),
      element("strong", { text: t("다운로드 목록을 불러오지 못했어요") }),
      element("p", { text: downloadState.error || t("잠시 후 다시 시도해 주세요.") }),
    );
    const retry = element("button", {
      className: "download-retry-button",
      text: t("다시 시도"),
      attrs: { type: "button", "data-download-retry": item.key },
    });
    failed.append(retry);
    if (item.productUrl) {
      const productLink = element("a", {
        className: "download-product-link",
        text: t("상품 상세 페이지 열기"),
        attrs: {
          href: item.productUrl,
          target: "_blank",
          rel: "noopener noreferrer",
        },
      });
      productLink.append(lucideIcon("external-link", "download-product-link-icon"));
      failed.append(productLink);
    }
    body.append(failed);
  } else if (downloadState.status === "ready") {
    body.append(element("p", {
      className: "download-list-summary",
      text: t("{count}개의 파일 · 누르면 바로 다운로드", {
        count: formatCount(downloadState.options.length),
      }),
    }));
    const list = element("ul", {
      className: "download-option-list",
      attrs: { "aria-label": t("다운로드할 파일") },
    });
    downloadState.options.forEach((option, optionIndex) => {
      const button = element("button", {
        className: "download-option",
        attrs: {
          type: "button",
          "data-download-key": item.key,
          "data-download-option-index": optionIndex,
          "aria-label": t("{file} 다운로드", {
            file: `${option.label}${option.detail ? `, ${option.detail}` : ""}`,
          }),
        },
      });
      const copy = element("span", { className: "download-option-copy" });
      copy.append(
        element("strong", { text: option.label, attrs: { title: option.label } }),
        element("small", { text: option.detail || t("BOOTH 다운로드") }),
      );
      button.append(
        element("span", { className: "download-file-index", text: String(optionIndex + 1).padStart(2, "0"), attrs: { "aria-hidden": "true" } }),
        copy,
        lucideIcon("download", "download-option-arrow"),
      );
      const listItem = element("li", { className: "download-option-item" });
      listItem.append(button);
      list.append(listItem);
    });
    body.append(list);
  } else {
    const idle = element("div", { className: "download-state" });
    idle.append(element("p", { text: t("다운로드하기를 누르면 파일 목록을 확인합니다.") }));
    body.append(idle);
  }

  back.append(header, body);
  return back;
}

function createDownloadSearchMatch(item) {
  if (!ui.query || !["all", "download"].includes(ui.searchField)) return null;
  const matches = matchingDownloadFiles(item, ui.query);
  if (!matches.length) return null;

  const match = element("div", {
    className: "download-search-match",
    attrs: {
      title: matches.map((file) => file.label).join("\n"),
      "aria-label": t("일치하는 다운로드 파일 {count}개: {files}", {
        count: matches.length,
        files: matches.map((file) => file.label).join(", "),
      }),
    },
  });
  match.append(
    lucideIcon("download", "download-search-match-icon"),
    element("span", { className: "download-search-match-name", text: matches[0].label }),
  );
  if (matches.length > 1) {
    match.append(element("span", {
      className: "download-search-match-count",
      text: `+${matches.length - 1}`,
    }));
  }
  return match;
}

// BOOTH's own item category, shown under the title. It is filled in by the
// background support index, so reused cards are updated in place.
function createProductCategoryTag(item) {
  const label = productCategoryLabel(item.productCategory, getLocale());
  if (!label) return null;
  const original = [item.productCategory.parentName, item.productCategory.name].filter(Boolean).join(" / ");
  return element("button", {
    className: "item-kind",
    text: label,
    attrs: {
      type: "button",
      "data-kind-search": label,
      title: `BOOTH: ${original}`,
      "aria-label": t("{label} 종류만 보기", { label }),
    },
  });
}

// Clicking a type label searches by type, so the active filter stays visible
// (and clearable) in the search box instead of adding sidebar navigation.
function searchByProductCategory(label) {
  selectedItemKeys.clear();
  ui.query = label;
  if (ui.searchField !== "kind") searchFieldSetByLabel = true;
  ui.searchField = "kind";
  refs["search-input"].value = label;
  refs["search-field"].value = "kind";
  refs["search-clear"].hidden = false;
  resetResultWindow();
  render({ reconcileItems: true, animateItems: true });
  refs["search-input"].scrollIntoView?.({ block: "nearest" });
}

function updateCardProductCategory(card, item) {
  const currentTag = card.querySelector(".item-kind");
  const nextTag = createProductCategoryTag(item);
  if (currentTag && nextTag) {
    if (currentTag.textContent !== nextTag.textContent) currentTag.replaceWith(nextTag);
    return;
  }
  if (currentTag) {
    currentTag.remove();
    return;
  }
  if (nextTag) card.querySelector(".item-title")?.after(nextTag);
}

function updateCardSearchMatch(card, item) {
  const currentMatch = card.querySelector(".download-search-match");
  const nextMatch = createDownloadSearchMatch(item);
  if (currentMatch && nextMatch) {
    currentMatch.replaceWith(nextMatch);
    return;
  }
  if (currentMatch) {
    currentMatch.remove();
    return;
  }
  const contentFooter = card.querySelector(".folder-chip-list, .item-actions");
  if (nextMatch && contentFooter) contentFooter.before(nextMatch);
}

function createCard(item, index) {
  const downloadState = getDownloadCardState(item.key);
  const isSelected = selectedItemKeys.has(item.key);
  const card = element("article", {
    className: `item-card${downloadState.flipped ? " is-flipped" : ""}${isSelected ? " is-multi-selected" : ""}`,
    attrs: {
      "data-item-key": item.key,
      draggable: "false",
      "aria-grabbed": "false",
      title: downloadState.flipped ? null : t("카드 이미지·여백을 클릭해 선택 또는 해제 · 선택한 카드를 폴더로 끌어 놓아 정리"),
    },
  });
  card.style.setProperty("--card-index", String(Math.min(index, 12)));

  const inner = element("div", { className: "item-card-inner" });
  const front = element("section", {
    className: "item-card-face item-card-front",
    attrs: { "aria-hidden": String(downloadState.flipped) },
  });
  front.inert = downloadState.flipped;

  const visual = element("div", { className: "item-visual" });
  if (item.imageUrl) {
    visual.append(element("img", {
      attrs: {
        src: item.imageUrl,
        alt: "",
        loading: "lazy",
        decoding: "async",
        draggable: "false",
      },
    }));
  } else {
    const initial = Array.from(item.title || "B")[0]?.toLocaleUpperCase() || "B";
    visual.dataset.tone = String((Number.parseInt(item.productId, 10) || index) % 5);
    visual.append(element("span", { className: "placeholder-letter", text: initial, attrs: { "aria-hidden": "true" } }));
  }

  const isGift = itemHasSource(item, "gift");
  const isFree = itemHasSource(item, "free");
  const assignedFolderIds = getItemFolderIds(state.assignments, item.key);
  if (isGift) {
    visual.append(element("span", {
      className: "gift-ribbon-corner",
      attrs: {
        role: "img",
        "aria-label": t("선물"),
      },
    }));
  }
  const selectionBadge = element("span", {
    className: "item-selection-badge",
    text: t("선택됨"),
    attrs: { "aria-hidden": "true" },
  });
  const visualControls = element("div", { className: "item-visual-controls" });
  visualControls.append(selectionBadge);
  const selectButton = element("button", {
    className: "item-select-button",
    attrs: {
      type: "button",
      "data-select-key": item.key,
      "aria-pressed": String(isSelected),
      "aria-label": t("상품 선택: {title}", { title: item.title }),
      title: t("상품 선택: {title}", { title: item.title }),
    },
  });
  selectButton.append(element("span", { className: "selection-check", attrs: { "aria-hidden": "true" } }));
  visualControls.append(selectButton);
  const visualHeader = element("div", { className: "item-visual-header" });
  if (isFree && !isGift) {
    visualHeader.append(element("span", {
      className: "source-badge source-free",
      text: t("무료"),
    }));
  }
  visualHeader.append(visualControls);
  visual.append(visualHeader);

  const content = element("div", { className: "item-content" });
  const sellerName = !item.sellerName || item.sellerName === "알 수 없는 판매자"
    ? t("알 수 없는 판매자")
    : item.sellerName;
  const seller = element("p", { className: "item-seller" });
  if (item.sellerUrl) {
    seller.append(element("a", {
      className: "item-seller-link",
      text: sellerName,
      attrs: {
        href: item.sellerUrl,
        target: "_blank",
        rel: "noopener noreferrer",
        draggable: "false",
        "aria-label": t("{seller} BOOTH 상점 페이지 열기", { seller: sellerName }),
      },
    }));
  } else {
    seller.textContent = sellerName;
  }
  const title = item.productUrl
    ? element("a", {
      className: "item-title",
      text: item.title,
      attrs: {
        href: item.productUrl,
        target: "_blank",
        rel: "noopener noreferrer",
        draggable: "false",
        "aria-label": t("{title} 상품 상세 페이지 열기", { title: item.title }),
      },
    })
    : element("span", { className: "item-title item-title-disabled", text: item.title });
  const revealButton = element("button", {
    className: "download-reveal-button",
    attrs: {
      type: "button",
      "data-download-reveal": item.key,
      "aria-label": t("{title} 다운로드 옵션 보기", { title: item.title }),
    },
  });
  revealButton.append(
    lucideIcon("download", "download-reveal-icon"),
    element("span", { text: t("다운로드하기") }),
  );
  content.append(seller, title);
  const productCategoryTag = createProductCategoryTag(item);
  if (productCategoryTag) content.append(productCategoryTag);
  const downloadMatch = createDownloadSearchMatch(item);
  if (downloadMatch) content.append(downloadMatch);

  const assignedFolderPaths = assignedFolderIds
    .map((folderId) => getFolderDisplayPath(folderId))
    .filter((path) => path.length)
    .sort((left, right) => left.join("/").localeCompare(
      right.join("/"),
      ["ko", "ja", "en"],
      { numeric: true },
    ));
  if (assignedFolderPaths.length) {
    const chipList = element("div", { className: "folder-chip-list" });
    for (const path of assignedFolderPaths.slice(0, 2)) {
      const label = path.join(" / ");
      chipList.append(element("span", {
        className: "folder-chip",
        text: path.at(-1),
        attrs: { title: label },
      }));
    }
    if (assignedFolderPaths.length > 2) {
      const remainingLabels = assignedFolderPaths.slice(2)
        .map((path) => path.join(" / "));
      chipList.append(element("span", {
        className: "folder-chip folder-chip-more",
        text: `+${formatCount(remainingLabels.length)}`,
        attrs: { title: remainingLabels.join("\n") },
      }));
    }
    content.append(chipList);
  }

  const actions = element("div", { className: "item-actions" });
  const assignButton = element("button", {
    className: "organize-button",
    attrs: {
      type: "button",
      "data-assign-key": item.key,
      title: t(assignedFolderIds.length ? "폴더 관리" : "폴더에 넣기"),
      "aria-label": t(assignedFolderIds.length ? "폴더 관리" : "폴더에 넣기"),
    },
  });
  assignButton.append(
    lucideIcon("folder-input"),
    element("span", { text: t(assignedFolderIds.length ? "폴더 관리" : "폴더에 넣기") }),
  );
  const isFavorite = state.favorites.includes(item.key);
  const favoriteButton = element("button", {
    className: `favorite-button${isFavorite ? " is-favorite" : ""}`,
    attrs: {
      type: "button",
      "data-favorite-key": item.key,
      "aria-label": t(isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"),
      "aria-pressed": String(isFavorite),
    },
  });
  favoriteButton.append(lucideIcon("star"));
  visualControls.append(favoriteButton);
  actions.append(revealButton, assignButton);
  content.append(actions);
  front.append(visual, content);
  inner.append(front, createDownloadBack(item, downloadState));
  card.append(inner);
  return card;
}

function findItem(itemKey) {
  return state.items.find((item) => item.key === itemKey);
}

function findRenderedCard(itemKey) {
  return Array.from(refs["item-grid"].querySelectorAll(".item-card[data-item-key]"))
    .find((card) => card.dataset.itemKey === itemKey) ?? null;
}

function syncSelectionUI() {
  const selectedCards = [];
  for (const card of refs["item-grid"].querySelectorAll(".item-card[data-item-key]")) {
    const selected = selectedItemKeys.has(card.dataset.itemKey);
    if (card.classList.contains("is-multi-selected") !== selected) {
      card.classList.toggle("is-multi-selected", selected);
    }
    card.querySelector("[data-select-key]")?.setAttribute("aria-pressed", String(selected));
    if (selected) selectedCards.push(card);
  }

  selectedCards.forEach((card, index) => {
    const badge = card.querySelector(".item-selection-badge");
    const selectionNumber = String(index + 1);
    if (badge && badge.textContent !== selectionNumber) {
      badge.textContent = selectionNumber;
    }
  });

  const selectionCount = formatCount(selectedItemKeys.size);
  if (refs["selection-count"].textContent !== selectionCount) {
    refs["selection-count"].textContent = selectionCount;
  }
  const selectionIsEmpty = selectedItemKeys.size === 0;
  if (refs["selection-summary"].hidden !== selectionIsEmpty) {
    refs["selection-summary"].hidden = selectionIsEmpty;
  }
}

function clearItemSelection() {
  if (!selectedItemKeys.size) return false;
  selectedItemKeys.clear();
  syncSelectionUI();
  return true;
}

function toggleItemSelection(itemKey) {
  const item = findItem(itemKey);
  const card = findRenderedCard(itemKey);
  if (!item || !card || card.classList.contains("is-flipped")) return false;
  if (selectedItemKeys.has(itemKey)) selectedItemKeys.delete(itemKey);
  else selectedItemKeys.add(itemKey);
  syncSelectionUI();
  return true;
}

function pruneItemSelection(allowedKeys) {
  for (const itemKey of selectedItemKeys) {
    if (!allowedKeys.has(itemKey)) selectedItemKeys.delete(itemKey);
  }
}

function clearFolderDropSuccess() {
  window.clearTimeout(dropSuccessTimer);
  ui.dropSuccessFolderId = null;
  refs["unfiled-folder"].classList.remove("is-drop-success");
  refs["folder-tree"].querySelectorAll(".is-drop-success").forEach((row) => {
    row.classList.remove("is-drop-success");
  });
}

function markFolderDropSuccess(folderId) {
  clearFolderDropSuccess();
  ui.dropSuccessFolderId = folderId || "unfiled";
  dropSuccessTimer = window.setTimeout(clearFolderDropSuccess, DROP_SUCCESS_DURATION_MS);
}

function isInteractiveDragOrigin(target) {
  return target instanceof Element
    && Boolean(target.closest("a, button, input, select, textarea, [contenteditable='true']"));
}

function cloneCardFrontForDrag(item) {
  const card = findRenderedCard(item.key);
  const front = card?.querySelector(".item-card-front");
  if (!front) return null;

  const clone = front.cloneNode(true);
  clone.classList.add("item-drag-preview-face");
  clone.setAttribute("aria-hidden", "true");
  clone.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  clone.querySelectorAll("a, button, input, select, textarea").forEach((control) => {
    control.setAttribute("tabindex", "-1");
  });
  return clone;
}

function createItemDragPreview(items, originCard) {
  const originRect = originCard.getBoundingClientRect();
  const preview = element("div", {
    className: `item-drag-preview${items.length > 1 ? " is-group" : ""}`,
    attrs: { "aria-hidden": "true" },
  });
  preview.inert = true;
  preview.style.width = `${originRect.width}px`;
  preview.style.height = `${originRect.height}px`;
  preview.style.setProperty("--drag-grab-x", `${itemDrag.pointerOffsetX}px`);
  preview.style.setProperty("--drag-grab-y", `${itemDrag.pointerOffsetY}px`);
  preview.style.setProperty("--drag-count-x", `${originRect.width - 18}px`);
  preview.style.setProperty("--drag-count-y", "-15px");
  const cluster = element("div", { className: "item-drag-preview-cluster" });
  const stack = element("div", { className: "item-drag-preview-stack" });
  const originItem = items.find((item) => item.key === originCard.dataset.itemKey) ?? items[0];
  const previewItems = [
    ...items.filter((item) => item.key !== originItem.key).slice(0, 3),
    originItem,
  ];
  previewItems.forEach((item, index) => {
    const depth = previewItems.length - index - 1;
    const layer = element("div", {
      className: "item-drag-preview-card",
      attrs: { "aria-hidden": "true" },
    });
    layer.style.setProperty("--stack-depth", String(depth));
    layer.style.setProperty("--stack-x", `${depth * 7}px`);
    layer.style.setProperty("--stack-y", `${depth * -6}px`);
    layer.style.setProperty(
      "--stack-rotate",
      `${depth === 0 ? 0 : (depth % 2 === 0 ? 0.75 : -0.75)}deg`,
    );
    layer.style.zIndex = String(index + 1);
    const cardFront = cloneCardFrontForDrag(item);
    if (cardFront) layer.append(cardFront);
    stack.append(layer);
  });
  if (items.length > 1) {
    cluster.append(element("span", {
      className: "item-drag-preview-count",
      text: formatCount(items.length),
    }));
  }

  cluster.append(stack);
  preview.append(cluster);
  document.body.append(preview);
  itemDrag.previewWidth = originRect.width;
  itemDrag.previewHeight = originRect.height;
  return preview;
}

function selectedItemsForDrag(originItemKey) {
  const renderedKeys = Array.from(
    refs["item-grid"].querySelectorAll(".item-card[data-item-key]:not([hidden])"),
    (card) => card.dataset.itemKey,
  );
  const renderedSelection = renderedKeys.filter((itemKey) => selectedItemKeys.has(itemKey));
  const itemKeys = selectedItemKeys.size > 1 && renderedSelection.length
    ? renderedSelection
    : [originItemKey];
  return itemKeys.map(findItem).filter(Boolean);
}

function gatherCardsForDrag(itemKeys, originCard) {
  const originRect = originCard.getBoundingClientRect();
  itemKeys.forEach((itemKey, index) => {
    const card = findRenderedCard(itemKey);
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const stackOffset = Math.min(index, 4) * 3;
    card.style.setProperty("--drag-gather-x", `${originRect.left - rect.left + stackOffset}px`);
    card.style.setProperty("--drag-gather-y", `${originRect.top - rect.top + stackOffset}px`);
    card.style.setProperty("--drag-gather-rotate", `${(index - ((itemKeys.length - 1) / 2)) * 0.45}deg`);
    card.classList.add("is-dragging");
    card.classList.toggle("is-drag-origin", itemKey === originCard.dataset.itemKey);
    card.setAttribute("aria-grabbed", "true");
  });
}

function setFolderDropTarget(target) {
  if (itemDrag.target === target) return;
  itemDrag.target?.classList.remove("is-drop-target");
  itemDrag.target = target;
  itemDrag.target?.classList.add("is-drop-target");
}

function getFolderDropTarget(target) {
  if (!(target instanceof Element)) return null;
  const row = target.closest(".folder-row[data-drop-folder-id]");
  if (!row || !refs.sidebar.contains(row)) return null;
  const folderId = row.dataset.dropFolderId || null;
  if (folderId && !state.folders.some((folder) => folder.id === folderId)) return null;
  return row;
}

function finishItemDrag({ dropped = false } = {}) {
  const draggedItemKeys = [...itemDrag.itemKeys];
  const shouldCloseSidebar = itemDrag.openedSidebar;
  if (draggedItemKeys.length) {
    for (const itemKey of draggedItemKeys) {
      const card = findRenderedCard(itemKey);
      card?.classList.remove("is-dragging", "is-drag-origin");
      card?.style.removeProperty("--drag-gather-x");
      card?.style.removeProperty("--drag-gather-y");
      card?.style.removeProperty("--drag-gather-rotate");
      card?.setAttribute("aria-grabbed", "false");
    }
    itemDrag.suppressClickUntil = Date.now() + DRAG_CLICK_SUPPRESSION_MS;
  }
  itemDrag.preview?.remove();
  if (itemDrag.pointerCard?.hasPointerCapture?.(itemDrag.pointerId)) {
    itemDrag.pointerCard.releasePointerCapture(itemDrag.pointerId);
  }
  setFolderDropTarget(null);
  document.body.classList.remove("is-item-dragging");
  itemDrag.itemKeys = [];
  itemDrag.originItemKey = null;
  itemDrag.openedSidebar = false;
  itemDrag.pointerId = null;
  itemDrag.pointerStartX = 0;
  itemDrag.pointerStartY = 0;
  itemDrag.pointerOffsetX = 0;
  itemDrag.pointerOffsetY = 0;
  itemDrag.pointerCard = null;
  itemDrag.preview = null;
  itemDrag.previewWidth = 0;
  itemDrag.previewHeight = 0;
  if (shouldCloseSidebar) {
    window.setTimeout(closeSidebar, dropped ? 460 : 0);
  }
}

function beginPointerItemDrag(event) {
  const card = itemDrag.pointerCard;
  if (!card || card.classList.contains("is-flipped")) return false;
  const item = findItem(card.dataset.itemKey);
  if (!item) return false;

  clearFolderDropSuccess();
  const dragItems = selectedItemsForDrag(item.key);
  const itemKeys = dragItems.map((candidate) => candidate.key);
  itemDrag.itemKeys = itemKeys;
  itemDrag.originItemKey = item.key;
  itemDrag.openedSidebar = false;
  itemDrag.preview = createItemDragPreview(dragItems, card);
  itemDrag.preview.classList.add("is-pointer-preview");

  gatherCardsForDrag(itemKeys, card);
  document.body.classList.add("is-item-dragging");

  if (window.matchMedia("(max-width: 980px)").matches
    && !document.body.classList.contains("sidebar-visible")) {
    itemDrag.openedSidebar = true;
    openSidebar();
  }
  card.setPointerCapture?.(event.pointerId);
  updatePointerDragPosition(event);
  return true;
}

function updatePointerDragPosition(event) {
  if (!itemDrag.preview) return;
  const previewWidth = itemDrag.previewWidth || 280;
  const previewHeight = itemDrag.previewHeight || 360;
  const left = Math.min(
    event.clientX - itemDrag.pointerOffsetX,
    Math.max(8, window.innerWidth - previewWidth - 24),
  );
  const top = Math.min(
    event.clientY - itemDrag.pointerOffsetY,
    Math.max(18, window.innerHeight - previewHeight - 18),
  );
  const previewLeft = Math.max(8, left);
  const previewTop = Math.max(18, top);
  itemDrag.preview.style.transform = `translate3d(${previewLeft}px, ${previewTop}px, 0)`;

  const sidebarRect = refs.sidebar.getBoundingClientRect();
  const verticallyTouchesSidebar = previewTop <= sidebarRect.bottom
    && previewTop + previewHeight >= sidebarRect.top;
  const horizontalOverlap = verticallyTouchesSidebar
    ? Math.max(
      0,
      Math.min(previewLeft + previewWidth, sidebarRect.right)
        - Math.max(previewLeft, sidebarRect.left),
    )
    : 0;
  itemDrag.preview.classList.toggle("is-over-sidebar", horizontalOverlap > 0);

  const pointerTarget = document.elementFromPoint(event.clientX, event.clientY);
  setFolderDropTarget(getFolderDropTarget(pointerTarget));
}

function handleItemPointerDown(event) {
  if (event.button !== 0 || event.isPrimary === false || isInteractiveDragOrigin(event.target)) return;
  const card = event.target instanceof Element
    ? event.target.closest(".item-card[data-item-key]")
    : null;
  if (!card || card.classList.contains("is-flipped")) return;
  itemDrag.pointerId = event.pointerId;
  itemDrag.pointerStartX = event.clientX;
  itemDrag.pointerStartY = event.clientY;
  const cardRect = card.getBoundingClientRect();
  itemDrag.pointerOffsetX = event.clientX - cardRect.left;
  itemDrag.pointerOffsetY = event.clientY - cardRect.top;
  itemDrag.pointerCard = card;
}

function handleItemPointerMove(event) {
  if (event.pointerId !== itemDrag.pointerId || !itemDrag.pointerCard) return;
  if (!itemDrag.itemKeys.length) {
    const distance = Math.hypot(
      event.clientX - itemDrag.pointerStartX,
      event.clientY - itemDrag.pointerStartY,
    );
    if (distance < POINTER_DRAG_THRESHOLD_PX) return;
    if (!beginPointerItemDrag(event)) {
      finishItemDrag();
      return;
    }
  }
  event.preventDefault();
  updatePointerDragPosition(event);
}

function handleItemPointerUp(event) {
  if (event.pointerId !== itemDrag.pointerId) return;
  if (!itemDrag.itemKeys.length) {
    itemDrag.pointerId = null;
    itemDrag.pointerStartX = 0;
    itemDrag.pointerStartY = 0;
    itemDrag.pointerOffsetX = 0;
    itemDrag.pointerOffsetY = 0;
    itemDrag.pointerCard = null;
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  updatePointerDragPosition(event);
  const target = itemDrag.target;
  const itemKeys = [...itemDrag.itemKeys];
  if (!target) {
    finishItemDrag();
    return;
  }
  const folderId = target.dataset.dropFolderId || null;
  const draggedCurrentSelection = itemKeys.some((itemKey) => selectedItemKeys.has(itemKey));
  finishItemDrag({ dropped: true });

  void updateItemsFolderAssignment(itemKeys, folderId, {
    fromDrop: true,
    clearSelection: draggedCurrentSelection,
  })
    .catch((error) => {
      showToast(t("상품을 옮기지 못했어요: {message}", { message: error.message }), "error");
    });
}

function handleItemPointerCancel(event) {
  if (event.pointerId !== itemDrag.pointerId) return;
  finishItemDrag();
}

function updateRenderedDownloadBack(itemKey) {
  const item = findItem(itemKey);
  const card = findRenderedCard(itemKey);
  const currentBack = card?.querySelector(".item-card-back");
  if (!item || !card || !currentBack) return;
  currentBack.replaceWith(createDownloadBack(item, getDownloadCardState(itemKey)));
}

function setCardFlipped(card, flipped, { moveFocus = false } = {}) {
  if (!card) return;
  const front = card.querySelector(".item-card-front");
  const back = card.querySelector(".item-card-back");
  card.classList.toggle("is-flipped", flipped);
  card.draggable = false;
  front?.setAttribute("aria-hidden", String(flipped));
  back?.setAttribute("aria-hidden", String(!flipped));
  if (front) front.inert = flipped;
  if (back) back.inert = !flipped;

  if (!moveFocus) return;
  const itemKey = card.dataset.itemKey;
  window.setTimeout(() => {
    if (!card.isConnected || getDownloadCardState(itemKey).flipped !== flipped) return;
    const focusTarget = flipped
      ? card.querySelector("[data-download-close]")
      : card.querySelector("[data-download-reveal]");
    focusTarget?.focus();
  }, CARD_FLIP_FOCUS_DELAY_MS);
}

async function revealDownloadOptions(itemKey, trigger) {
  const item = findItem(itemKey);
  const card = trigger?.closest(".item-card") ?? findRenderedCard(itemKey);
  if (!item || !card) return;

  const existing = downloadCardStates.get(itemKey);
  if (existing?.status === "ready" || existing?.status === "loading") {
    existing.flipped = true;
    updateRenderedDownloadBack(itemKey);
    window.requestAnimationFrame(() => setCardFlipped(card, true, { moveFocus: true }));
    return;
  }

  const downloadState = {
    flipped: true,
    status: "loading",
    options: [],
    error: "",
    authRequired: false,
  };
  downloadCardStates.set(itemKey, downloadState);
  updateRenderedDownloadBack(itemKey);
  window.requestAnimationFrame(() => setCardFlipped(card, true, { moveFocus: true }));

  try {
    let options;
    if (IS_DEMO) {
      await new Promise((resolve) => window.setTimeout(resolve, 520));
      options = demoDownloadOptions(item);
    } else {
      const permissionGranted = await requestBoothAccess();
      if (!permissionGranted) {
        const error = new Error(t("다운로드 목록을 읽으려면 BOOTH 계정 페이지 접근을 허용해 주세요."));
        error.code = "PERMISSION_REQUIRED";
        throw error;
      }
      options = await loadBoothDownloadOptions(item);
    }

    if (downloadCardStates.get(itemKey) !== downloadState) return;
    downloadState.status = "ready";
    downloadState.options = options;
    if (!IS_DEMO) {
      if (setItemDownloadFiles(state.items, itemKey, options) !== state.items) {
        await persistState((latest) => ({
          ...latest,
          items: setItemDownloadFiles(latest.items, itemKey, options),
        }));
      }
    }
  } catch (error) {
    if (downloadCardStates.get(itemKey) !== downloadState) return;
    downloadState.status = "error";
    downloadState.error = error.message || t("잠시 후 다시 시도해 주세요.");
    downloadState.authRequired = error instanceof BoothAuthError || error?.code === "AUTH_REQUIRED";
  }

  updateRenderedDownloadBack(itemKey);
}

function closeDownloadOptions(itemKey, trigger) {
  const downloadState = downloadCardStates.get(itemKey);
  const card = trigger?.closest(".item-card") ?? findRenderedCard(itemKey);
  if (!downloadState || !card) return;
  downloadState.flipped = false;
  setCardFlipped(card, false, { moveFocus: true });
}

async function startDownload(button) {
  const itemKey = button.dataset.downloadKey;
  const optionIndex = Number.parseInt(button.dataset.downloadOptionIndex, 10);
  const downloadState = downloadCardStates.get(itemKey);
  const option = Number.isInteger(optionIndex) ? downloadState?.options[optionIndex] : null;
  if (!option || button.disabled) return;

  const arrow = button.querySelector(".download-option-arrow");
  button.disabled = true;
  button.classList.add("is-starting");
  setLucideIcon(arrow, "loader-circle");

  try {
    if (IS_DEMO) {
      await new Promise((resolve) => window.setTimeout(resolve, 280));
      showToast(t("미리보기에서는 실제 파일을 다운로드하지 않아요."));
    } else {
      startBoothDownload(option.url);
      showToast(t("{file} 다운로드를 시작했어요.", { file: option.label }));
    }
  } catch (error) {
    showToast(t("다운로드를 시작하지 못했어요: {message}", { message: error.message }), "error");
  } finally {
    button.disabled = false;
    button.classList.remove("is-starting");
    setLucideIcon(arrow, "download");
  }
}

function currentResults() {
  const filtered = filterItems(state.items, {
    query: ui.query,
    searchField: ui.searchField,
    source: ui.source,
    folderId: ui.folderId,
    favoritesOnly: ui.favoritesOnly,
    favorites: state.favorites,
    assignments: state.assignments,
  });
  const sort = {
    purchase: ui.sortKind === "purchase" ? ui.sortDirection : "off",
    name: ui.sortKind === "name" ? ui.sortDirection : "off",
  };
  return sortItems(filtered, sort, [ui.sortKind]);
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function settleCardAnimations(card) {
  for (const animation of card.getAnimations()) {
    try {
      animation.commitStyles();
    } catch {
      // 이미 끝난 애니메이션은 현재 계산된 위치만 사용합니다.
    }
    animation.cancel();
  }
  const rect = card.getBoundingClientRect();
  card.style.removeProperty("opacity");
  card.style.removeProperty("transform");
  card.classList.remove("is-initial-entry");
  return rect;
}

function clearInitialEntryAnimation(card) {
  if (!card.classList.contains("is-initial-entry")) return;
  card.classList.remove("is-initial-entry");
}

function playInitialEntryAnimation(card) {
  card.classList.add("is-initial-entry");
  const handleAnimationEnd = (event) => {
    if (event.target !== card || event.animationName !== "cardReveal") return;
    card.removeEventListener("animationend", handleAnimationEnd);
    clearInitialEntryAnimation(card);
  };
  card.addEventListener("animationend", handleAnimationEnd);

  const cardIndex = Number.parseInt(card.style.getPropertyValue("--card-index"), 10) || 0;
  window.setTimeout(() => {
    card.removeEventListener("animationend", handleAnimationEnd);
    clearInitialEntryAnimation(card);
  }, 520 + (Math.min(cardIndex, 12) * 24));
}

function replaceCards(visible) {
  const cards = visible.map(createCard);
  if (!hasShownCards && cards.length) {
    cards.forEach(playInitialEntryAnimation);
    hasShownCards = true;
  }
  refs["item-grid"].replaceChildren(...cards);
}

function reconcileCards(visible, { animateLayout = false } = {}) {
  const grid = refs["item-grid"];
  const existingCards = Array.from(grid.querySelectorAll(".item-card[data-item-key]"));
  const existingByKey = new Map(existingCards.map((card) => [card.dataset.itemKey, card]));
  const oldRects = new Map();

  for (const card of existingCards) {
    if (!card.hidden) oldRects.set(card, settleCardAnimations(card));
  }

  const desiredKeys = new Set(visible.map((item) => item.key));
  for (const card of existingCards) {
    if (!desiredKeys.has(card.dataset.itemKey)) card.hidden = true;
  }

  const desiredCards = visible.map((item, index) => {
    const card = existingByKey.get(item.key) ?? createCard(item, index);
    updateCardProductCategory(card, item);
    updateCardSearchMatch(card, item);
    card.hidden = false;
    card.style.setProperty("--card-index", String(Math.min(index, 12)));
    grid.append(card);
    return card;
  });

  const shouldAnimate = animateLayout && !prefersReducedMotion() && typeof Element.prototype.animate === "function";
  if (shouldAnimate) {
    grid.getBoundingClientRect();
    for (const card of desiredCards) {
      const nextRect = card.getBoundingClientRect();
      const previousRect = oldRects.get(card);
      if (previousRect?.width && nextRect.width) {
        const deltaX = previousRect.left - nextRect.left;
        const deltaY = previousRect.top - nextRect.top;
        if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
          card.animate(
            [
              { transform: `translate(${deltaX}px, ${deltaY}px)` },
              { transform: "translate(0, 0)" },
            ],
            {
              duration: CARD_LAYOUT_DURATION_MS,
              easing: "cubic-bezier(0.2, 0.72, 0.25, 1)",
            },
          );
        }
      } else {
        card.animate(
          [
            { opacity: 0, transform: "scale(0.965)" },
            { opacity: 1, transform: "scale(1)" },
          ],
          {
            duration: CARD_LAYOUT_DURATION_MS,
            easing: "cubic-bezier(0.2, 0.72, 0.25, 1)",
          },
        );
      }
    }
  }

  const hiddenCards = Array.from(grid.querySelectorAll(".item-card[data-item-key][hidden]"));
  hiddenCards.slice(CARD_CACHE_LIMIT).forEach((card) => card.remove());
}

function renderItems({ reconcile = false, animateLayout = false } = {}) {
  const results = currentResults();
  const visible = results.slice(0, ui.visibleLimit);
  pruneItemSelection(new Set(visible.map((item) => item.key)));
  const noStoredItems = state.items.length === 0;
  const noResults = !noStoredItems && results.length === 0;

  if (visible.length) refs["item-grid"].hidden = false;
  if (reconcile) reconcileCards(visible, { animateLayout });
  else replaceCards(visible);
  syncSelectionUI();

  refs["result-summary"].replaceChildren(
    element("strong", { text: formatCount(results.length) }),
    document.createTextNode(t("개의 상품")),
  );
  refs["load-more-sentinel"].hidden = results.length <= visible.length;

  refs["empty-state"].hidden = !(noStoredItems || noResults);
  refs["item-grid"].hidden = noStoredItems || noResults;

  if (noStoredItems) {
    refs["empty-title"].textContent = t("라이브러리를 불러와 주세요");
    refs["empty-description"].textContent = t("BOOTH에 로그인한 뒤 전체 동기화를 누르면 구매 상품, 기프트와 무료 다운로드를 읽어옵니다.");
    refs["empty-sync-button"].hidden = false;
    refs["empty-login-link"].hidden = false;
  } else if (noResults) {
    refs["empty-title"].textContent = t("조건에 맞는 상품이 없어요");
    refs["empty-description"].textContent = t("검색어나 필터를 바꾸면 다른 상품을 찾을 수 있어요.");
    refs["empty-sync-button"].hidden = true;
    refs["empty-login-link"].hidden = true;
  }
}

function setSortSwitchValue(
  button,
  valueElement,
  nextLabel,
  { animate = false, direction = "up" } = {},
) {
  const previousLabel = valueElement.textContent;
  if (previousLabel === nextLabel) return;

  const activeTimer = sortSwitchAnimationTimers.get(button);
  if (activeTimer) window.clearTimeout(activeTimer);
  button.querySelector(".sort-switch-outgoing")?.remove();
  button.classList.remove("is-wheel-rolling");
  valueElement.classList.remove("is-switch-incoming");

  if (!animate || prefersReducedMotion()) {
    valueElement.textContent = nextLabel;
    return;
  }

  const outgoing = document.createElement("span");
  outgoing.className = "sort-switch-value sort-switch-outgoing";
  outgoing.textContent = previousLabel;
  valueElement.textContent = nextLabel;
  valueElement.classList.add("is-switch-incoming");
  valueElement.parentElement.prepend(outgoing);
  button.dataset.rollDirection = direction;
  button.getBoundingClientRect();
  button.classList.add("is-wheel-rolling");

  const timer = window.setTimeout(() => {
    outgoing.remove();
    valueElement.classList.remove("is-switch-incoming");
    button.classList.remove("is-wheel-rolling");
    delete button.dataset.rollDirection;
    sortSwitchAnimationTimers.delete(button);
  }, SORT_SWITCH_ROLL_DURATION_MS);
  sortSwitchAnimationTimers.set(button, timer);
}

function renderHeader({ animateSortSwitch = null } = {}) {
  const copy = getViewCopy();
  refs["view-eyebrow"].textContent = copy.eyebrow;
  refs["view-title"].textContent = copy.title;
  refs["view-description"].textContent = copy.description;
  refs["last-sync"].textContent = IS_DEMO ? t("미리보기 데이터") : formatSyncTime(state.lastSyncedAt);
  const kindLabel = t(ui.sortKind === "purchase" ? "구매순" : "이름순");
  const directionLabel = t(ui.sortDirection === "asc" ? "오름차순" : "내림차순");
  setSortSwitchValue(
    refs["sort-kind-toggle"],
    refs["sort-kind-value"],
    kindLabel,
    {
      animate: animateSortSwitch === "kind",
      direction: ui.sortKind === "name" ? "up" : "down",
    },
  );
  refs["sort-kind-icon"].className = `sort-switch-icon licon ${
    ui.sortKind === "purchase" ? "licon-shopping-bag" : "licon-arrow-down-a-z"
  }`;
  refs["sort-kind-toggle"].setAttribute(
    "aria-label",
    t("정렬 기준 변경: 현재 {value}", { value: kindLabel }),
  );
  setSortSwitchValue(
    refs["sort-direction-toggle"],
    refs["sort-direction-value"],
    directionLabel,
    {
      animate: animateSortSwitch === "direction",
      direction: ui.sortDirection === "desc" ? "up" : "down",
    },
  );
  refs["sort-direction-toggle"].dataset.direction = ui.sortDirection;
  refs["sort-direction-toggle"].setAttribute(
    "aria-label",
    t("정렬 방향 변경: 현재 {value}", { value: directionLabel }),
  );
  refs["search-field"].value = ui.searchField;
  refs["search-clear"].hidden = !ui.query;
  if (refs["search-input"].value !== ui.query) refs["search-input"].value = ui.query;
}

function render({ reconcileItems = false, animateItems = false } = {}) {
  renderNavigation();
  renderFolders();
  renderHeader();
  renderItems({ reconcile: reconcileItems, animateLayout: animateItems });
}

function captureViewportPosition() {
  const anchors = Array.from(
    refs["item-grid"].querySelectorAll(".item-card[data-item-key]:not([hidden])"),
  )
    .map((card) => ({
      itemKey: card.dataset.itemKey,
      rect: card.getBoundingClientRect(),
    }))
    .filter(({ rect }) => rect.bottom > 0)
    .slice(0, 8)
    .map(({ itemKey, rect }) => ({ itemKey, top: rect.top }));

  return {
    x: window.scrollX,
    y: window.scrollY,
    visibleLimit: ui.visibleLimit,
    anchors,
  };
}

function restoreViewportPosition(snapshot) {
  if (!snapshot) return;
  const anchor = snapshot.anchors.find(({ itemKey }) => {
    const card = findRenderedCard(itemKey);
    return card && !card.hidden;
  });

  if (anchor) {
    const card = findRenderedCard(anchor.itemKey);
    const deltaY = card.getBoundingClientRect().top - anchor.top;
    window.scrollTo(snapshot.x, window.scrollY + deltaY);
    return;
  }

  window.scrollTo(snapshot.x, snapshot.y);
}

function renderPreservingViewport(options) {
  const snapshot = captureViewportPosition();
  ui.visibleLimit = Math.max(ui.visibleLimit, snapshot.visibleLimit || PAGE_SIZE);
  render(options);
  restoreViewportPosition(snapshot);
  window.requestAnimationFrame?.(() => restoreViewportPosition(snapshot));
}

function scheduleResultRender() {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => {
    renderItems({ reconcile: true, animateLayout: true });
  }, 90);
}

function loadNextResultPage() {
  const results = currentResults();
  if (ui.visibleLimit >= results.length) return;
  ui.visibleLimit = Math.min(results.length, ui.visibleLimit + PAGE_SIZE);
  renderItems({ reconcile: true, animateLayout: true });
}

function bindInfiniteScroll() {
  if ("IntersectionObserver" in window) {
    loadMoreObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadNextResultPage();
    }, {
      rootMargin: "360px 0px",
    });
    loadMoreObserver.observe(refs["load-more-sentinel"]);
    return;
  }

  window.addEventListener("scroll", () => {
    const sentinel = refs["load-more-sentinel"];
    if (!sentinel.hidden && sentinel.getBoundingClientRect().top < window.innerHeight + 360) {
      loadNextResultPage();
    }
  }, { passive: true });
}

function preparePressFeedback(event) {
  if (event.type === "keydown" && (event.repeat || !["Enter", " "].includes(event.key))) return;
  if (event.type === "pointerdown" && event.button !== 0) return;
  if (!(event.target instanceof Element) || prefersReducedMotion()) return;
  const button = event.target.closest("button, a.header-icon-button");
  if (!button || button.disabled || button.matches(".nav-row, .folder-row, .folder-category-row")) return;
  const basis = Math.max(button.offsetHeight, button.offsetWidth / 4, 24);
  button.style.setProperty("--pressed-scale", String((basis - 2) / basis));
}

function animateLibraryHeading() {
  const heading = refs["view-title"].parentElement;
  if (prefersReducedMotion() || typeof heading?.animate !== "function") return;
  heading.getAnimations().forEach((animation) => animation.cancel());
  heading.animate(
    [{ opacity: 0.6, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }],
    { duration: 250, easing: "cubic-bezier(0, 0, 0.15, 1)" },
  );
}

function setSource(source) {
  selectedItemKeys.clear();
  ui.source = source;
  ui.favoritesOnly = false;
  ui.folderId = "all";
  ui.selectedFolderId = null;
  ui.selectedCategoryId = null;
  resetResultWindow();
  closeSidebar();
  render({ reconcileItems: true, animateItems: true });
  animateLibraryHeading();
}

function selectFolder(folderId) {
  selectedItemKeys.clear();
  ui.folderId = folderId;
  ui.selectedFolderId = folderId === "all" || folderId === "unfiled" ? null : folderId;
  ui.selectedCategoryId = null;
  ui.favoritesOnly = false;
  resetResultWindow();
  closeSidebar();
  render({ reconcileItems: true, animateItems: true });
  animateLibraryHeading();
}

function resetLibraryView() {
  selectedItemKeys.clear();
  Object.assign(ui, {
    source: "all",
    folderId: "all",
    favoritesOnly: false,
    query: "",
    searchField: "all",
    sortKind: "purchase",
    sortDirection: "asc",
    selectedFolderId: null,
    selectedCategoryId: null,
    visibleLimit: PAGE_SIZE,
  });
  render({ reconcileItems: true, animateItems: true });
}

function applySortSwitchChange(target) {
  resetResultWindow();
  renderHeader({ animateSortSwitch: target });
  renderItems({ reconcile: true, animateLayout: true });
}

function toggleSortKind() {
  ui.sortKind = ui.sortKind === "purchase" ? "name" : "purchase";
  applySortSwitchChange("kind");
}

function toggleSortDirection() {
  ui.sortDirection = ui.sortDirection === "asc" ? "desc" : "asc";
  applySortSwitchChange("direction");
}

function setSyncPanel({ message, detail = "", percent = 0, tone = "default", login = false, hidden = false }) {
  window.clearTimeout(syncPanelHideTimer);
  refs["sync-panel"].hidden = hidden;
  refs["sync-panel"].dataset.tone = tone;
  refs["sync-message"].textContent = message;
  refs["sync-detail"].textContent = detail;
  refs["sync-progress"].style.width = `${Math.max(0, Math.min(100, percent))}%`;
  refs["login-link"].hidden = !login;
}

function mergeSyncedItems(previousState, items, syncedAt) {
  const previousItems = new Map(previousState.items.map((item) => [item.key, item]));
  const mergedItems = items.map((item) => {
    const previous = previousItems.get(item.key);
    if (!previous?.supportIndexedAt) return item;
    return {
      ...item,
      supportedAvatarIds: [...(previous.supportedAvatarIds || [])],
      supportIndexedAt: previous.supportIndexedAt,
      supportIndexVersion: previous.supportIndexVersion,
      productCategory: previous.productCategory ?? null,
    };
  });
  const keys = new Set(mergedItems.map((item) => item.key));
  return {
    ...previousState,
    items: mergedItems,
    lastSyncedAt: syncedAt,
    favorites: previousState.favorites.filter((key) => keys.has(key)),
    assignments: Object.fromEntries(
      Object.keys(previousState.assignments).map((key) => [
        key,
        getItemFolderIds(previousState.assignments, key).filter(
          (folderId) => previousState.folders.some((folder) => folder.id === folderId),
        ),
      ]).filter(([key, folderIds]) => keys.has(key) && folderIds.length),
    ),
  };
}

function mergeSupportIndex(currentItems, indexedItems) {
  const indexedByKey = new Map(indexedItems.map((item) => [item.key, item]));
  return currentItems.map((item) => {
    const indexed = indexedByKey.get(item.key);
    if (!indexed) return item;
    return {
      ...item,
      supportedAvatarIds: indexed.supportedAvatarIds,
      supportIndexedAt: indexed.supportIndexedAt,
      supportIndexVersion: indexed.supportIndexVersion,
      productCategory: indexed.productCategory ?? item.productCategory ?? null,
    };
  });
}

function hideSyncPanelLater() {
  window.clearTimeout(syncPanelHideTimer);
  syncPanelHideTimer = window.setTimeout(() => setSyncPanel({ hidden: true }), 4200);
}

function syncButtonBlocked() {
  return ui.syncing || ui.indexingSupport || ui.calculatingSpending;
}

function cancelSupportIndexing() {
  supportIndexController?.abort();
}

// Avatar-support indexing runs after the library is saved, so the list is usable
// right away; progress stays in the sync panel and checkpoints persist results.
async function startSupportIndexing() {
  if (IS_DEMO || ui.indexingSupport) return;
  const controller = new AbortController();
  supportIndexController = controller;
  ui.indexingSupport = true;
  refs["sync-button"].disabled = true;
  refs["sync-button"].classList.add("is-syncing");

  try {
    const result = await runSupportIndexOperation(() => indexBoothProductSupport(state.items, {
      signal: controller.signal,
      onProgress: ({ completed, total }) => {
        if (controller.signal.aborted || !total) return;
        setSyncPanel({
          message: t("상품 목록은 준비됐어요 · 지원 아바타 정보 확인 중"),
          detail: t("{completed} / {total}개 상품 · 기다리지 않고 바로 사용할 수 있어요", {
            completed: formatCount(completed),
            total: formatCount(total),
          }),
          percent: Math.round((completed / total) * 100),
        });
      },
      onCheckpoint: async (items) => {
        await persistState((latest) => ({ ...latest, items: mergeSupportIndex(latest.items, items) }));
      },
    }));
    if (controller.signal.aborted || !(result.scannedCount + result.failedCount)) return;

    renderPreservingViewport();
    setSyncPanel({
      message: t("지원 아바타 정보를 모두 확인했어요"),
      detail: `${t("{supported}개 상품의 지원 아바타 정보를 저장했습니다.", {
        supported: formatCount(result.supportedProductCount),
      })}${result.failedCount
        ? t(" · {failed}개 상품 설명은 다음 동기화에서 다시 확인", { failed: formatCount(result.failedCount) })
        : ""}`,
      percent: 100,
      tone: result.failedCount ? "default" : "success",
    });
    hideSyncPanelLater();
  } catch (error) {
    // Another window is already indexing, or the user deleted the data.
    if (error?.code === "STATE_BUSY" || error?.code === "SUPPORT_INDEX_CANCELLED") return;
    setSyncPanel({
      message: t("지원 아바타 정보를 확인하지 못했어요"),
      detail: error.message || t("잠시 후 다시 시도해 주세요."),
      percent: 100,
      tone: "error",
    });
  } finally {
    if (supportIndexController === controller) supportIndexController = null;
    ui.indexingSupport = false;
    refs["sync-button"].classList.remove("is-syncing");
    refs["sync-button"].disabled = syncButtonBlocked();
  }
}

async function runDemoSync() {
  const phases = [
    [16, t("구매 목록 확인 중")],
    [42, t("라이브러리 페이지 읽는 중")],
    [67, t("기프트함 읽는 중")],
    [86, t("무료 다운로드함 읽는 중")],
    [100, t("미리보기 데이터를 불러왔어요")],
  ];
  for (const [percent, message] of phases) {
    setSyncPanel({ message, detail: `${percent}%`, percent });
    await new Promise((resolve) => window.setTimeout(resolve, 240));
  }
}

async function syncLibrary() {
  if (ui.syncing || ui.indexingSupport) return;
  if (ui.calculatingSpending) {
    showToast(t("빨간약 계산이 끝난 뒤 동기화해 주세요."), "error");
    return;
  }
  ui.syncing = true;
  refs["sync-button"].disabled = true;
  refs["red-pill-button"].disabled = true;
  refs["clear-local-data"].disabled = true;
  refs["export-organization-data"].disabled = true;
  refs["import-organization-data"].disabled = true;
  refs["sync-button"].classList.add("is-syncing");
  setSyncPanel({
    message: t("라이브러리 연결 중"),
    detail: t("BOOTH 로그인 상태를 확인하고 있어요."),
    percent: 5,
  });

  let librarySynced = false;
  try {
    if (!IS_DEMO) {
      const permissionGranted = await requestBoothAccess({ productPages: true });
      if (!permissionGranted) {
        const error = new Error(t("라이브러리와 상품 설명을 읽으려면 BOOTH 계정 및 상품 페이지 접근을 허용해 주세요."));
        error.code = "PERMISSION_REQUIRED";
        throw error;
      }
    }

    await runLibraryOperation(async () => {
      if (IS_DEMO) {
        await runDemoSync();
        showToast(t("미리보기 동기화를 완료했어요."));
        return;
      }

      const result = await syncBoothLibrary(({ message, completed, total }) => {
        const percent = total ? Math.round(8 + (completed / total) * 92) : 8;
        setSyncPanel({
          message,
          detail: total ? t("{completed} / {total} 페이지", { completed, total }) : "",
          percent,
        });
      });
      await persistState((latest) => mergeSyncedItems(latest, result.items, result.syncedAt));
      downloadCardStates.clear();
      selectedItemKeys.clear();
      renderPreservingViewport();
      setSyncPanel({
        message: t("동기화가 끝났어요"),
        detail: t("{items}개 상품 · {files}개 파일명을 저장했습니다.", {
          items: formatCount(result.items.length),
          files: formatCount(result.downloadFileCount),
        }),
        percent: 100,
        tone: "success",
      });
      hideSyncPanelLater();
      showToast(t("라이브러리를 최신 상태로 업데이트했어요."));
      librarySynced = true;
    });
  } catch (error) {
    const authError = error instanceof BoothAuthError || error?.code === "AUTH_REQUIRED";
    const busyError = error?.code === "STATE_BUSY";
    const permissionError = error?.code === "PERMISSION_REQUIRED";
    setSyncPanel({
      message: authError
        ? t("BOOTH 로그인이 필요해요")
        : permissionError
          ? t("BOOTH 접근 권한이 필요해요")
        : busyError
          ? t("다른 창에서 작업 중이에요")
          : t("동기화하지 못했어요"),
      detail: authError
        ? t("같은 브라우저 프로필에서 BOOTH에 로그인한 뒤 다시 시도해 주세요.")
        : permissionError
          ? t("전체 동기화를 다시 누르고 BOOTH 계정 및 상품 페이지 읽기 권한을 허용해 주세요.")
        : busyError
          ? t("진행 중인 작업이 끝난 뒤 다시 시도해 주세요.")
          : (error.message || t("잠시 후 다시 시도해 주세요.")),
      percent: 100,
      tone: busyError || permissionError ? "default" : "error",
      login: authError,
    });
  } finally {
    ui.syncing = false;
    refs["sync-button"].disabled = syncButtonBlocked();
    refs["red-pill-button"].disabled = false;
    refs["clear-local-data"].disabled = false;
    refs["export-organization-data"].disabled = false;
    refs["import-organization-data"].disabled = false;
    refs["sync-button"].classList.remove("is-syncing");
  }
  if (librarySynced) startSupportIndexing();
}

function openDataDeleteConfirmation() {
  if (ui.syncing || ui.calculatingSpending) {
    showToast(t("진행 중인 작업이 끝난 뒤 데이터를 삭제해 주세요."), "error");
    return;
  }
  if (refs["settings-dialog"].open) refs["settings-dialog"].close();
  refs["data-delete-dialog"].showModal();
}

function organizationDataActionBlocked() {
  if (!ui.syncing && !ui.calculatingSpending) return false;
  showToast(t("진행 중인 작업이 끝난 뒤 정리 데이터를 백업하거나 복원해 주세요."), "error");
  return true;
}

function exportOrganizationData() {
  if (organizationDataActionBlocked()) return;

  try {
    const blob = new Blob([encodeOrganizationBackup(state)], {
      type: "application/json;charset=utf-8",
    });
    const now = new Date();
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    const objectUrl = URL.createObjectURL(blob);
    const download = element("a", {
      attrs: {
        href: objectUrl,
        download: `booth-shelf-organization-${date}.json`,
      },
    });
    document.body.append(download);
    download.click();
    download.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    showToast(t("정리 데이터 백업 파일을 저장했어요."));
  } catch (error) {
    showToast(t("정리 데이터 백업을 만들지 못했어요: {message}", {
      message: t(error?.message || "알 수 없는 오류"),
    }), "error");
  }
}

function chooseOrganizationBackup() {
  if (organizationDataActionBlocked()) return;
  refs["organization-backup-file"].value = "";
  refs["organization-backup-file"].click();
}

async function prepareOrganizationRestore(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  try {
    assertBackupSize(file.size);
    const backup = decodeOrganizationBackup(await file.text());
    const preview = restoreOrganizationBackup(state, backup);
    pendingOrganizationBackup = backup;
    const summary = t("{categories}개 카테고리, {folders}개 폴더, {assignments}개 상품 배치, {favorites}개 즐겨찾기를 복원합니다.", {
      categories: formatCount(preview.stats.categoryCount),
      folders: formatCount(preview.stats.folderCount),
      assignments: formatCount(preview.stats.assignmentCount),
      favorites: formatCount(preview.stats.favoriteCount),
    });
    const skipped = preview.stats.skippedItemCount
      ? ` ${t("{count}개 상품은 현재 라이브러리에 없어 건너뜁니다.", {
        count: formatCount(preview.stats.skippedItemCount),
      })}`
      : "";
    refs["organization-restore-summary"].textContent = `${summary}${skipped}`;
    if (refs["settings-dialog"].open) refs["settings-dialog"].close();
    refs["organization-restore-dialog"].showModal();
  } catch (error) {
    pendingOrganizationBackup = null;
    showToast(t("백업 파일을 읽지 못했어요: {message}", {
      message: t(error?.message || "알 수 없는 오류"),
    }), "error");
  }
}

async function confirmOrganizationRestore(event) {
  event.preventDefault();
  if (!pendingOrganizationBackup) {
    refs["organization-restore-dialog"].close();
    return;
  }

  const submitButton = refs["organization-restore-form"].querySelector('[type="submit"]');
  const backup = pendingOrganizationBackup;
  submitButton.disabled = true;

  try {
    await runLibraryOperation(() => persistState((latest) => restoreOrganizationBackup(latest, backup).state));
    pendingOrganizationBackup = null;
    selectedItemKeys.clear();
    ui.folderId = "all";
    ui.selectedFolderId = null;
    ui.selectedCategoryId = null;
    resetResultWindow();
    refs["organization-restore-dialog"].close();
    render({ reconcileItems: true, animateItems: true });
    showToast(t("정리 데이터를 복원했어요."));
  } catch (error) {
    showToast(t("정리 데이터를 복원하지 못했어요: {message}", {
      message: t(error?.message || "알 수 없는 오류"),
    }), "error");
  } finally {
    submitButton.disabled = false;
  }
}

async function confirmDataDelete(event) {
  event.preventDefault();
  const submitButton = refs["data-delete-form"].querySelector('[type="submit"]');
  submitButton.disabled = true;

  try {
    cancelSupportIndexing();
    await runLibraryOperation(async () => {
      state = await clearState();
      if (!IS_DEMO) await removeBoothAccess();
    });
    preferences = await loadPreferences();
    spendingSummary = await loadSpendingSummary();
    applyLocalePreference(preferences.locale);
    applyLayoutPreferences();
    downloadCardStates.clear();
    refs["data-delete-dialog"].close();
    setSyncPanel({ hidden: true });
    resetLibraryView();
    showToast(t("이 기기에 저장된 BOOTH Shelf 데이터를 모두 삭제했어요."));
  } catch (error) {
    showToast(error?.code === "STATE_BUSY"
      ? t("다른 창의 작업이 끝난 뒤 다시 시도해 주세요.")
      : t("데이터를 삭제하지 못했어요: {message}", { message: error.message }), "error");
  } finally {
    submitButton.disabled = false;
  }
}

function populateParentSelect(mode) {
  const selected = state.folders.find((folder) => folder.id === ui.folderDialogFolderId) ?? null;
  const select = refs["folder-parent-select"];
  select.replaceChildren();

  const options = [{ id: "root", label: t("카테고리 없음 (최상위)") }];
  for (const category of [...state.categories].sort((left, right) => (
    (left.order ?? 0) - (right.order ?? 0)
      || left.name.localeCompare(right.name, ["ko", "ja", "en"], { numeric: true })
  ))) {
    options.push({
      id: `category:${category.id}`,
      label: t("카테고리 · {name}", { name: category.name }),
    });
  }

  if (mode === "move") {
    for (const folder of state.folders) {
      if (!canMoveFolder(state.folders, selected.id, folder.id)) continue;
      options.push({
        id: `folder:${folder.id}`,
        label: t("폴더 · {path}", { path: getFolderDisplayPath(folder.id).join(" / ") }),
      });
    }
  }

  for (const optionData of options) {
    select.append(element("option", {
      text: optionData.label,
      attrs: { value: optionData.id },
    }));
  }
}

function parseFolderLocation(value) {
  if (value.startsWith("category:")) {
    return { parentId: null, categoryId: value.slice("category:".length) || null };
  }
  if (value.startsWith("folder:")) {
    return { parentId: value.slice("folder:".length) || null, categoryId: null };
  }
  return { parentId: null, categoryId: null };
}

function openFolderDialog(mode, { folderId = null, categoryId = null } = {}) {
  const selected = folderId
    ? state.folders.find((folder) => folder.id === folderId) ?? null
    : getSelectedFolder();
  const selectedCategory = categoryId
    ? state.categories.find((category) => category.id === categoryId) ?? null
    : getSelectedCategory();
  ui.folderDialogMode = mode;
  ui.folderDialogFolderId = selected?.id ?? null;
  ui.folderDialogCategoryId = selectedCategory?.id ?? null;
  refs["folder-form-error"].textContent = "";

  const isMove = mode === "move";
  const isAddRoot = mode === "add-root";
  const isCategory = mode === "add-category" || mode === "rename-category";
  const isRename = mode === "rename" || mode === "rename-category";
  refs["folder-name-field"].hidden = isMove;
  refs["folder-description-field"].hidden = isMove || isCategory;
  refs["folder-parent-field"].hidden = !(isMove || isAddRoot);
  refs["folder-name-input"].required = !isMove;
  refs["folder-name-label"].textContent = t(isCategory ? "카테고리 이름" : "폴더 이름");
  refs["folder-name-input"].value = isRename
    ? (isCategory ? selectedCategory?.name : selected?.name) || ""
    : "";
  refs["folder-description-input"].value = isRename && !isCategory
    ? selected?.description || ""
    : "";
  refs["folder-dialog-title"].textContent = isMove
    ? t("폴더 이동")
    : mode === "add-category"
      ? t("새 카테고리")
      : mode === "rename-category"
        ? t("카테고리 이름 변경")
        : isRename
          ? t("폴더 이름 변경")
          : t("새 폴더");
  refs["folder-submit"].textContent = t(isMove ? "이동" : "저장");

  if (isMove || isAddRoot) {
    refs["folder-parent-label"].textContent = t(isMove ? "이동할 위치" : "추가할 위치");
    refs["folder-parent-hint"].textContent = t("카테고리는 폴더 3계층에 포함되지 않아요.");
    populateParentSelect(mode);
    refs["folder-parent-select"].value = isMove
      ? selected?.parentId
        ? `folder:${selected.parentId}`
        : selected?.categoryId
          ? `category:${selected.categoryId}`
          : "root"
      : selectedCategory?.id
        ? `category:${selectedCategory.id}`
        : "root";
  }

  refs["folder-dialog"].showModal();
  if (!isMove) window.setTimeout(() => refs["folder-name-input"].focus(), 0);
}

async function submitFolderForm(event) {
  event.preventDefault();
  const mode = ui.folderDialogMode;
  const folderId = ui.folderDialogFolderId;
  const categoryId = ui.folderDialogCategoryId;
  const name = refs["folder-name-input"].value;
  const description = refs["folder-description-input"].value;
  const location = parseFolderLocation(refs["folder-parent-select"].value);
  refs["folder-submit"].disabled = true;

  try {
    await persistState((latest) => {
      let folders = latest.folders;
      let categories = latest.categories;
      if (mode === "add-root") {
        folders = createFolder(folders, { name, description, categoryId: location.categoryId });
      } else if (mode === "add-child") {
        folders = createFolder(folders, { name, description, parentId: folderId });
      } else if (mode === "rename") {
        folders = renameFolder(folders, folderId, name, description);
      } else if (mode === "move") {
        folders = moveFolder(folders, folderId, location.parentId, location.categoryId);
      } else if (mode === "add-category") {
        categories = createCategory(categories, { name });
      } else if (mode === "rename-category") {
        categories = renameCategory(categories, categoryId, name);
      }
      return { ...latest, folders, categories };
    });
    refs["folder-dialog"].close();
    renderPreservingViewport();
    showToast(t(
      mode === "move"
        ? "폴더를 이동했어요."
        : mode.includes("category")
          ? "카테고리를 저장했어요."
          : "폴더를 저장했어요.",
    ));
  } catch (error) {
    refs["folder-form-error"].textContent = t(error.message);
  } finally {
    refs["folder-submit"].disabled = false;
  }
}

function openAssignDialog(itemKey) {
  const item = state.items.find((candidate) => candidate.key === itemKey);
  if (!item) return;
  ui.assigningItemKey = itemKey;
  refs["assign-item-name"].textContent = item.title;
  refs["assign-folder-list"].replaceChildren();
  const assignedFolderIds = new Set(getItemFolderIds(state.assignments, itemKey));

  const orderedFolders = state.folders
    .map((folder) => ({ folder, path: getFolderDisplayPath(folder.id) }))
    .sort((left, right) => left.path.join("/").localeCompare(
      right.path.join("/"),
      ["ko", "ja", "en"],
      { numeric: true },
    ));

  for (const { folder, path } of orderedFolders) {
    const checkbox = element("input", {
      attrs: {
        type: "checkbox",
        name: "assign-folder",
        value: folder.id,
      },
    });
    checkbox.checked = assignedFolderIds.has(folder.id);
    const choice = element("label", { className: "folder-choice" });
    choice.append(
      checkbox,
      element("span", { text: path.join(" / ") }),
    );
    refs["assign-folder-list"].append(choice);
  }
  if (!orderedFolders.length) {
    refs["assign-folder-list"].append(element("p", {
      className: "folder-choice-empty",
      text: t("먼저 폴더를 만들어 주세요."),
    }));
  }
  refs["assign-submit"].disabled = !orderedFolders.length;
  refs["assign-dialog"].showModal();
}

async function updateItemsFolderAssignment(
  itemKeys,
  folderId,
  { fromDrop = false, clearSelection = true } = {},
) {
  const uniqueKeys = [...new Set(itemKeys)];
  const normalizedFolderId = folderId || null;
  let folderLabel;
  let changedCount = 0;
  await persistState((latest) => {
    folderLabel = normalizedFolderId
      ? getFolderPath(latest.folders, normalizedFolderId).map((folder) => folder.name).join(" / ")
      : t("미분류");
    changedCount = uniqueKeys.filter((itemKey) => {
      const assignedFolderIds = getItemFolderIds(latest.assignments, itemKey);
      return normalizedFolderId
        ? !assignedFolderIds.includes(normalizedFolderId)
        : assignedFolderIds.length > 0;
    }).length;

    const assignments = setItemsFolderAssignment(
      latest.items,
      latest.folders,
      latest.assignments,
      uniqueKeys,
      normalizedFolderId,
    );
    return { ...latest, assignments };
  });
  if (fromDrop) markFolderDropSuccess(normalizedFolderId);
  if (clearSelection) selectedItemKeys.clear();
  renderPreservingViewport();

  if (!changedCount) {
    showToast(t("선택한 상품이 이미 {folder}에 들어 있어요.", { folder: folderLabel }));
    return false;
  }

  showToast(normalizedFolderId
    ? t("{count}개 상품을 {folder} 폴더에도 추가했어요.", {
      count: formatCount(changedCount),
      folder: folderLabel,
    })
    : t("{count}개 상품의 폴더 배치를 모두 해제했어요.", { count: formatCount(changedCount) }));
  return true;
}

async function updateItemFolderAssignments(itemKey, folderIds) {
  const nextFolderIds = [...new Set(Array.isArray(folderIds) ? folderIds : [])];
  let unchanged;
  await persistState((latest) => {
    const previousFolderIds = getItemFolderIds(latest.assignments, itemKey);
    unchanged = previousFolderIds.length === nextFolderIds.length
      && previousFolderIds.every((folderId) => nextFolderIds.includes(folderId));
    return {
      ...latest,
      assignments: setItemFolderAssignments(latest.items, latest.folders, latest.assignments, itemKey, nextFolderIds),
    };
  });
  renderPreservingViewport();
  if (unchanged) {
    showToast(t("폴더 배치가 바뀌지 않았어요."));
    return false;
  }
  showToast(nextFolderIds.length
    ? t("상품을 {count}개 폴더에 분류했어요.", { count: formatCount(nextFolderIds.length) })
    : t("상품을 미분류로 옮겼어요."));
  return true;
}

async function submitAssignment(event) {
  event.preventDefault();
  const folderIds = Array.from(
    refs["assign-folder-list"].querySelectorAll('input[name="assign-folder"]:checked'),
    (input) => input.value,
  );
  try {
    await updateItemFolderAssignments(ui.assigningItemKey, folderIds);
    refs["assign-dialog"].close();
  } catch (error) {
    showToast(t("상품 폴더를 바꾸지 못했어요: {message}", { message: error.message }), "error");
  }
}

function openDeleteConfirmation(folderId = ui.selectedFolderId) {
  const selected = state.folders.find((folder) => folder.id === folderId) ?? null;
  if (!selected) return;
  ui.confirmDeleteType = "folder";
  ui.confirmDeleteFolderId = selected.id;
  refs["confirm-dialog-eyebrow"].textContent = t("폴더 삭제");
  refs["confirm-dialog-title"].textContent = t("이 폴더를 삭제할까요?");
  refs["confirm-submit"].textContent = t("폴더 삭제");
  const childCount = state.folders.filter((folder) => folder.parentId === selected.id).length;
  const hasParent = Boolean(selected.parentId);
  const message = hasParent
    ? (childCount
      ? "“{name}” 폴더를 삭제합니다. 하위 폴더 {count}개와 이 폴더에 넣은 배치는 한 단계 위로 옮겨요. 다른 폴더 배치는 유지됩니다."
      : "“{name}” 폴더를 삭제합니다. 이 폴더에 넣은 배치는 한 단계 위로 옮겨요. 다른 폴더 배치는 유지됩니다.")
    : (childCount
      ? "“{name}” 폴더를 삭제합니다. 하위 폴더 {count}개는 최상위로 옮기고, 이 폴더에 넣은 배치만 해제해요. 다른 폴더 배치는 유지됩니다."
      : "“{name}” 폴더를 삭제합니다. 이 폴더에 넣은 배치만 해제해요. 다른 폴더 배치는 유지됩니다.");
  refs["confirm-copy"].textContent = t(message, {
    name: selected.name,
    count: childCount,
  });
  refs["confirm-dialog"].showModal();
}

function openCategoryDeleteConfirmation(categoryId = ui.selectedCategoryId) {
  const category = state.categories.find((candidate) => candidate.id === categoryId);
  if (!category) return;
  ui.selectedCategoryId = category.id;
  ui.confirmDeleteType = "category";
  const folderCount = countFolderNodes(
    buildFolderTree(state.folders).filter((folder) => folder.categoryId === category.id),
  );
  refs["confirm-dialog-eyebrow"].textContent = t("카테고리 삭제");
  refs["confirm-dialog-title"].textContent = t("이 카테고리를 삭제할까요?");
  refs["confirm-submit"].textContent = t("카테고리 삭제");
  refs["confirm-copy"].textContent = t(
    folderCount
      ? "“{name}” 카테고리를 삭제합니다. 안의 폴더 {count}개는 삭제하지 않고 카테고리 없음으로 옮겨요."
      : "“{name}” 카테고리를 삭제합니다. 폴더와 상품에는 영향을 주지 않아요.",
    { name: category.name, count: folderCount },
  );
  refs["confirm-dialog"].showModal();
}

async function confirmDelete(event) {
  event.preventDefault();
  try {
    if (ui.confirmDeleteType === "category") {
      const selectedCategory = getSelectedCategory();
      if (!selectedCategory) return;
      const categoryId = selectedCategory.id;
      await persistState((latest) => ({
        ...latest,
        ...deleteCategoryAndReleaseFolders(latest.categories, latest.folders, categoryId),
      }));
      ui.selectedCategoryId = null;
      refs["confirm-dialog"].close();
      render();
      showToast(t("카테고리를 삭제했어요."));
      return;
    }

    const folderId = ui.confirmDeleteFolderId;
    let parentId;
    await persistState((latest) => {
      const selected = latest.folders.find((folder) => folder.id === folderId);
      if (!selected) throw new Error(t("폴더를 찾을 수 없어요."));
      parentId = selected.parentId ?? "all";
      return { ...latest, ...deleteFolderAndPromote(latest.folders, latest.assignments, folderId) };
    });
    ui.folderId = parentId;
    ui.selectedFolderId = parentId === "all" ? null : parentId;
    ui.selectedCategoryId = null;
    refs["confirm-dialog"].close();
    render();
    showToast(t("폴더를 삭제했어요."));
  } catch (error) {
    showToast(t("저장하지 못했어요: {message}", { message: t(error.message) }), "error");
  }
}

async function toggleFolderCategory(categoryId) {
  await persistState((latest) => ({
    ...latest,
    categories: toggleCategoryCollapsed(latest.categories, categoryId),
  }));
  renderFolders();
}

async function toggleFavorite(itemKey) {
  await persistState((latest) => ({
    ...latest,
    favorites: latest.favorites.includes(itemKey)
      ? latest.favorites.filter((key) => key !== itemKey)
      : [...latest.favorites, itemKey],
  }));
  renderPreservingViewport();
}

function closeContextMenu({ immediate = false, restoreFocus = false } = {}) {
  const menu = refs["context-menu"];
  if (!menu || menu.hidden) return false;
  window.clearTimeout(contextMenuCloseTimer);
  menu.classList.remove("is-open");
  const finish = () => {
    menu.hidden = true;
    menu.replaceChildren();
    if (restoreFocus && contextMenuReturnFocus?.isConnected) {
      contextMenuReturnFocus.focus({ preventScroll: true });
    }
    contextMenuReturnFocus = null;
  };
  if (immediate || prefersReducedMotion()) finish();
  else contextMenuCloseTimer = window.setTimeout(finish, 120);
  return true;
}

function createContextMenuHeading(title, subtitle = "") {
  const heading = element("div", { className: "context-menu-heading", attrs: { role: "presentation" } });
  heading.append(element("strong", { text: title, attrs: { title } }));
  if (subtitle) heading.append(element("span", { text: subtitle, attrs: { title: subtitle } }));
  return heading;
}

function createContextMenuSeparator() {
  return element("div", { className: "context-menu-separator", attrs: { role: "separator" } });
}

function createContextMenuAction({ label, icon = "", danger = false, disabled = false, action }) {
  const button = element("button", {
    className: `context-menu-action${danger ? " is-danger" : ""}`,
    attrs: { type: "button", role: "menuitem", disabled: disabled ? "" : null },
  });
  if (icon) button.append(lucideIcon(icon, "context-menu-action-icon"));
  button.append(element("span", { text: label }));
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    if (button.disabled) return;
    closeContextMenu({ immediate: true });
    try {
      const result = action?.();
      if (result && typeof result.catch === "function") {
        result.catch((error) => {
          showToast(t("작업을 완료하지 못했어요: {message}", { message: error.message }), "error");
        });
      }
    } catch (error) {
      showToast(t("작업을 완료하지 못했어요: {message}", { message: error.message }), "error");
    }
  });
  return button;
}

function openContextMenu(event, children, label) {
  const menu = refs["context-menu"];
  closeContextMenu({ immediate: true });
  contextMenuReturnFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  menu.replaceChildren(...children);
  menu.setAttribute("aria-label", label);
  menu.hidden = false;
  menu.classList.remove("is-open");

  let left = event.clientX;
  let top = event.clientY;
  if (!left && !top && event.target instanceof Element) {
    const anchorRect = event.target.getBoundingClientRect();
    left = anchorRect.left + Math.min(28, anchorRect.width / 2);
    top = anchorRect.top + Math.min(28, anchorRect.height / 2);
  }
  const margin = 8;
  menu.style.left = `${Math.max(margin, left)}px`;
  menu.style.top = `${Math.max(margin, top)}px`;
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin))}px`;
  menu.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin))}px`;

  window.requestAnimationFrame(() => {
    if (menu.hidden) return;
    menu.classList.add("is-open");
    menu.querySelector('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
  });
}

function openExternalPage(url) {
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

function openCardContextMenu(event, itemKey) {
  const item = findItem(itemKey);
  const card = findRenderedCard(itemKey);
  if (!item || !card) return;
  const downloadState = getDownloadCardState(itemKey);
  const isFavorite = state.favorites.includes(itemKey);
  const assigned = getItemFolderIds(state.assignments, itemKey).length > 0;
  const actions = [
    createContextMenuHeading(item.title, item.sellerName),
    createContextMenuAction({
      label: t(downloadState.flipped ? "상품 카드로 돌아가기" : "다운로드 옵션 보기"),
      icon: downloadState.flipped ? "arrow-left" : "download",
      action: () => (downloadState.flipped
        ? closeDownloadOptions(itemKey, card)
        : revealDownloadOptions(itemKey, card)),
    }),
  ];
  if (item.productUrl) {
    actions.push(createContextMenuAction({
      label: t("상품 상세 페이지 열기"),
      icon: "external-link",
      action: () => openExternalPage(item.productUrl),
    }));
  }
  if (item.sellerUrl) {
    actions.push(createContextMenuAction({
      label: t("판매자 상점 열기"),
      icon: "shopping-bag",
      action: () => openExternalPage(item.sellerUrl),
    }));
  }
  actions.push(
    createContextMenuSeparator(),
    createContextMenuAction({
      label: t(assigned ? "폴더 관리" : "폴더에 넣기"),
      icon: "folder-input",
      action: () => openAssignDialog(itemKey),
    }),
    createContextMenuAction({
      label: t(isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"),
      icon: "star",
      action: () => toggleFavorite(itemKey),
    }),
  );
  openContextMenu(event, actions, t("{title} 빠른 메뉴", { title: item.title }));
}

function openFolderContextMenu(event, folderId) {
  const folder = state.folders.find((candidate) => candidate.id === folderId);
  if (!folder) return;
  openContextMenu(event, [
    createContextMenuHeading(folder.name, getFolderDisplayPath(folder.id).slice(0, -1).join(" / ")),
    createContextMenuAction({
      label: t("하위 추가"),
      icon: "folder-plus",
      disabled: folderDepth(state.folders, folder.id) >= MAX_FOLDER_DEPTH,
      action: () => openFolderDialog("add-child", { folderId }),
    }),
    createContextMenuAction({
      label: t("이름 변경"),
      icon: "pencil",
      action: () => openFolderDialog("rename", { folderId }),
    }),
    createContextMenuAction({
      label: t("이동"),
      icon: "move",
      action: () => openFolderDialog("move", { folderId }),
    }),
    createContextMenuSeparator(),
    createContextMenuAction({
      label: t("삭제"),
      icon: "trash-2",
      danger: true,
      action: () => openDeleteConfirmation(folderId),
    }),
  ], t("{name} 폴더 빠른 메뉴", { name: folder.name }));
}

function openCategoryContextMenu(event, categoryId) {
  const category = state.categories.find((candidate) => candidate.id === categoryId);
  if (!category) return;
  openContextMenu(event, [
    createContextMenuHeading(category.name, t("카테고리")),
    createContextMenuAction({
      label: t("폴더 추가"),
      icon: "folder-plus",
      action: () => openFolderDialog("add-root", { categoryId }),
    }),
    createContextMenuAction({
      label: t("이름 변경"),
      icon: "pencil",
      action: () => openFolderDialog("rename-category", { categoryId }),
    }),
    createContextMenuAction({
      label: t(category.collapsed ? "펼치기" : "접기"),
      icon: "chevron-right",
      action: () => toggleFolderCategory(categoryId),
    }),
    createContextMenuSeparator(),
    createContextMenuAction({
      label: t("삭제"),
      icon: "trash-2",
      danger: true,
      action: () => openCategoryDeleteConfirmation(categoryId),
    }),
  ], t("{name} 카테고리 빠른 메뉴", { name: category.name }));
}

function shouldKeepNativeContextMenu(target) {
  return target instanceof Element && Boolean(target.closest(
    'input, textarea, select, [contenteditable="true"]',
  ));
}

function handleContextMenu(event) {
  if (shouldKeepNativeContextMenu(event.target)) {
    closeContextMenu({ immediate: true });
    return;
  }
  event.preventDefault();
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  if (target.closest("#context-menu")) return;

  const card = target.closest(".item-card[data-item-key]");
  if (card) {
    openCardContextMenu(event, card.dataset.itemKey);
    return;
  }
  const folder = target.closest("[data-folder-id]");
  if (folder) {
    openFolderContextMenu(event, folder.dataset.folderId);
    return;
  }
  const category = target.closest("[data-category-id]");
  if (category) {
    openCategoryContextMenu(event, category.dataset.categoryId);
    return;
  }
  closeContextMenu({ immediate: true });
}

function handleContextMenuKeydown(event) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const items = [...refs["context-menu"].querySelectorAll('[role="menuitem"]:not(:disabled)')];
  if (!items.length) return;
  event.preventDefault();
  const currentIndex = items.indexOf(document.activeElement);
  const nextIndex = event.key === "Home"
    ? 0
    : event.key === "End"
      ? items.length - 1
      : event.key === "ArrowDown"
        ? (currentIndex + 1 + items.length) % items.length
        : (currentIndex - 1 + items.length) % items.length;
  items[nextIndex].focus({ preventScroll: true });
}

function bindEvents() {
  document.addEventListener("pointerdown", preparePressFeedback);
  document.addEventListener("keydown", preparePressFeedback);
  document.addEventListener("contextmenu", handleContextMenu);
  document.addEventListener("pointerdown", (event) => {
    if (!(event.target instanceof Element) || !event.target.closest("#context-menu")) {
      closeContextMenu();
    }
  });
  window.addEventListener("scroll", () => closeContextMenu({ immediate: true }), true);
  window.addEventListener("resize", () => closeContextMenu({ immediate: true }));
  window.addEventListener("blur", () => closeContextMenu({ immediate: true }));
  refs["context-menu"].addEventListener("keydown", handleContextMenuKeydown);
  refs["theme-toggle"].addEventListener("click", toggleTheme);
  SYSTEM_THEME_MEDIA?.addEventListener("change", handleSystemThemeChange);
  refs["language-toggle"].addEventListener("click", () => {
    void cycleLocale();
  });
  refs["settings-button"].addEventListener("click", openSettingsDialog);
  refs["ai-bridge-toggle"].addEventListener("click", () => { void toggleAiBridge(); });
  refs["ai-approve-downloads"].addEventListener("change", (event) => {
    void saveAiApproveDownloads(event.target.checked);
  });
  refs["red-pill-button"].addEventListener("click", openRedPillDialog);
  refs["red-pill-calculate"].addEventListener("click", calculateSpending);
  refs["sidebar-open"].addEventListener("click", openSidebar);
  refs["sidebar-close"].addEventListener("click", closeSidebar);
  refs["sidebar-backdrop"].addEventListener("click", closeSidebar);
  window.matchMedia("(max-width: 980px)").addEventListener("change", syncSidebarAccessibility);
  refs["sidebar-resizer"].addEventListener("pointerdown", beginSidebarResize);
  refs["sidebar-resizer"].addEventListener("keydown", handleSidebarResizeKeydown);
  document.addEventListener("pointermove", updateSidebarResize, { passive: false });
  document.addEventListener("pointerup", finishSidebarResize);
  document.addEventListener("pointercancel", finishSidebarResize);

  refs["grid-density"].addEventListener("input", (event) => {
    applyGridColumns(event.target.value);
  });
  refs["grid-density"].addEventListener("change", (event) => {
    void saveGridColumns(event.target.value);
  });

  document.querySelectorAll("[data-source]").forEach((button) => {
    button.addEventListener("click", () => setSource(button.dataset.source));
  });
  refs["favorites-nav"].addEventListener("click", () => {
    ui.favoritesOnly = true;
    ui.source = "all";
    ui.folderId = "all";
    ui.selectedFolderId = null;
    ui.selectedCategoryId = null;
    resetResultWindow();
    closeSidebar();
    render({ reconcileItems: true, animateItems: true });
    animateLibraryHeading();
  });

  refs["all-folders"].addEventListener("click", () => selectFolder("all"));
  refs["unfiled-folder"].addEventListener("click", () => selectFolder("unfiled"));
  refs["folder-tree"].addEventListener("click", (event) => {
    const categoryButton = event.target.closest("[data-category-id]");
    if (categoryButton) {
      void toggleFolderCategory(categoryButton.dataset.categoryId).catch((error) => {
        showToast(t("카테고리를 변경하지 못했어요: {message}", { message: error.message }), "error");
      });
      return;
    }
    const button = event.target.closest("[data-folder-id]");
    if (button) selectFolder(button.dataset.folderId);
  });

  refs["item-grid"].addEventListener("pointerdown", handleItemPointerDown);
  document.addEventListener("pointermove", handleItemPointerMove, { passive: false });
  document.addEventListener("pointerup", handleItemPointerUp);
  document.addEventListener("pointercancel", handleItemPointerCancel);

  refs["add-root-folder"].addEventListener("click", () => openFolderDialog("add-root"));
  refs["add-category"].addEventListener("click", () => openFolderDialog("add-category"));
  refs["clear-local-data"].addEventListener("click", openDataDeleteConfirmation);
  refs["export-organization-data"].addEventListener("click", exportOrganizationData);
  refs["import-organization-data"].addEventListener("click", chooseOrganizationBackup);
  refs["organization-backup-file"].addEventListener("change", prepareOrganizationRestore);

  refs["search-input"].addEventListener("input", (event) => {
    ui.query = event.target.value;
    refs["search-clear"].hidden = !ui.query;
    resetResultWindow();
    scheduleResultRender();
  });
  refs["search-clear"].addEventListener("click", () => {
    ui.query = "";
    refs["search-input"].value = "";
    if (searchFieldSetByLabel) {
      ui.searchField = "all";
      refs["search-field"].value = "all";
      searchFieldSetByLabel = false;
    }
    refs["search-clear"].hidden = true;
    resetResultWindow();
    scheduleResultRender();
    refs["search-input"].focus();
  });
  refs["search-field"].addEventListener("change", (event) => {
    searchFieldSetByLabel = false;
    ui.searchField = event.target.value;
    resetResultWindow();
    renderItems({ reconcile: true, animateLayout: true });
  });
  refs["sort-kind-toggle"].addEventListener("click", toggleSortKind);
  refs["sort-direction-toggle"].addEventListener("click", toggleSortDirection);
  refs["sync-button"].addEventListener("click", syncLibrary);
  refs["empty-sync-button"].addEventListener("click", syncLibrary);
  refs["selection-clear"].addEventListener("click", clearItemSelection);
  refs["item-grid"].addEventListener("click", (event) => {
    if (Date.now() < itemDrag.suppressClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const card = event.target.closest(".item-card[data-item-key]");
    const kindButton = event.target.closest("[data-kind-search]");
    if (kindButton) {
      searchByProductCategory(kindButton.dataset.kindSearch);
      return;
    }
    const selectButton = event.target.closest("[data-select-key]");
    if (selectButton) {
      toggleItemSelection(selectButton.dataset.selectKey);
      return;
    }
    const downloadOption = event.target.closest("[data-download-option-index]");
    if (downloadOption) {
      startDownload(downloadOption);
      return;
    }
    const downloadClose = event.target.closest("[data-download-close]");
    if (downloadClose) {
      closeDownloadOptions(downloadClose.dataset.downloadClose, downloadClose);
      return;
    }
    const downloadRetry = event.target.closest("[data-download-retry]");
    if (downloadRetry) {
      revealDownloadOptions(downloadRetry.dataset.downloadRetry, downloadRetry);
      return;
    }
    const downloadReveal = event.target.closest("[data-download-reveal]");
    if (downloadReveal) {
      revealDownloadOptions(downloadReveal.dataset.downloadReveal, downloadReveal);
      return;
    }
    const favoriteButton = event.target.closest("[data-favorite-key]");
    if (favoriteButton) {
      void toggleFavorite(favoriteButton.dataset.favoriteKey).catch((error) => {
        showToast(t("저장하지 못했어요: {message}", { message: error.message }), "error");
      });
      return;
    }
    const assignButton = event.target.closest("[data-assign-key]");
    if (assignButton) {
      openAssignDialog(assignButton.dataset.assignKey);
      return;
    }
    if (card && !card.classList.contains("is-flipped") && !isInteractiveDragOrigin(event.target)) {
      toggleItemSelection(card.dataset.itemKey);
    }
  });

  refs["folder-form"].addEventListener("submit", submitFolderForm);
  refs["assign-form"].addEventListener("submit", submitAssignment);
  refs["confirm-form"].addEventListener("submit", confirmDelete);
  refs["organization-restore-form"].addEventListener("submit", confirmOrganizationRestore);
  refs["data-delete-form"].addEventListener("submit", confirmDataDelete);
  refs["organization-restore-dialog"].addEventListener("close", () => {
    pendingOrganizationBackup = null;
  });

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => document.getElementById(button.dataset.closeDialog).close());
  });

  document.addEventListener("keydown", (event) => {
    const drawerOpen = window.matchMedia("(max-width: 980px)").matches
      && document.body.classList.contains("sidebar-visible")
      && !document.querySelector("dialog[open]")
      && refs["context-menu"].hidden;
    if (drawerOpen && event.key === "Escape") {
      event.preventDefault();
      closeSidebar();
      return;
    }
    if (drawerOpen && event.key === "Tab") {
      const controls = [...refs.sidebar.querySelectorAll('button, a[href], [tabindex="0"]')]
        .filter((control) => !control.disabled && !control.closest("[inert]") && control.getClientRects().length);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    const target = event.target;
    const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    if (event.key === "/" && !isTyping) {
      event.preventDefault();
      refs["search-input"].focus();
    }
    if (event.key === "Escape") {
      if (closeContextMenu({ restoreFocus: true })) {
        event.preventDefault();
        return;
      }
      if (!clearItemSelection()) closeSidebar();
    }
  });
}

function bindStorageChanges() {
  if (IS_DEMO || typeof chrome === "undefined" || !chrome.storage?.onChanged) return;

  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== "local") return;
    try {
      if (Object.hasOwn(changes, STORAGE_KEY) && !isOwnStorageChange(changes[STORAGE_KEY].newValue)) {
        const viewportPosition = captureViewportPosition();
        state = sanitizeState(changes[STORAGE_KEY].newValue);
        const keys = new Set(state.items.map((item) => item.key));
        for (const key of downloadCardStates.keys()) {
          if (!keys.has(key)) downloadCardStates.delete(key);
        }
        pruneItemSelection(keys);
        if (ui.folderId !== "all" && ui.folderId !== "unfiled"
          && !state.folders.some((folder) => folder.id === ui.folderId)) {
          ui.folderId = "all";
          ui.selectedFolderId = null;
        }
        // Keep the already loaded result window so storage writes cannot collapse the page height.
        ui.visibleLimit = Math.max(viewportPosition.visibleLimit || PAGE_SIZE, PAGE_SIZE);
        render();
        restoreViewportPosition(viewportPosition);
        window.requestAnimationFrame?.(() => restoreViewportPosition(viewportPosition));
      }
      if (Object.hasOwn(changes, PREFERENCES_KEY) && !isOwnStorageChange(changes[PREFERENCES_KEY].newValue)) {
        const previousLocale = preferences?.locale;
        preferences = await loadPreferences();
        applyLocalePreference(preferences.locale);
        applyLayoutPreferences();
        if (preferences.locale !== previousLocale) renderPreservingViewport();
      }
      if (Object.hasOwn(changes, SPENDING_SUMMARY_KEY) && !isOwnStorageChange(changes[SPENDING_SUMMARY_KEY].newValue)) {
        spendingSummary = await loadSpendingSummary();
        if (spendingSummary && refs["red-pill-dialog"].open) {
          renderSpendingSummary(spendingSummary);
        } else if (!spendingSummary) {
          refs["red-pill-result"].hidden = true;
          refs["red-pill-intro"].hidden = false;
          for (const id of ["red-pill-total", "red-pill-other-currencies", "red-pill-order-count",
            "red-pill-average", "red-pill-free-count", "red-pill-verdict", "red-pill-calculated-at"]) {
            refs[id].textContent = "";
          }
        }
      }
    } catch (error) {
      showToast(t("다른 창의 변경사항을 불러오지 못했어요: {message}", {
        message: error.message,
      }), "error");
    }
  });
}

async function init() {
  if (IS_DEMO) {
    state = sanitizeState(demoState());
    useMemoryStorage(state);
    preferences = await loadPreferences();
    spendingSummary = null;
  } else {
    await restrictStorageAccess();
    [state, preferences, spendingSummary] = await Promise.all([
      loadState(),
      loadPreferences(),
      loadSpendingSummary(),
    ]);
  }
  applyLocalePreference(preferences.locale);
  applyLayoutPreferences();
  bindEvents();
  syncSidebarAccessibility();
  bindInfiniteScroll();
  bindStorageChanges();
  render();
}

init().catch((error) => {
  refs["empty-state"].hidden = false;
  refs["empty-title"].textContent = t("화면을 시작하지 못했어요");
  refs["empty-description"].textContent = error.message || t("확장프로그램을 다시 열어 주세요.");
  refs["empty-sync-button"].hidden = true;
});
