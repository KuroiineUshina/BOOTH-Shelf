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
  PREFERENCES_KEY,
  SPENDING_SUMMARY_KEY,
  STORAGE_KEY,
  clearState,
  createOrganizationBackup,
  loadPreferences,
  loadSpendingSummary,
  loadState,
  restoreOrganizationBackup,
  restrictStorageAccess,
  savePreferences,
  saveSpendingSummary,
  saveState,
} from "./storage.js";
import { startBoothDownload } from "./download.js";
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
const STATE_LOCK_NAME = "booth-shelf-state-write";
const SPENDING_LOCK_NAME = "booth-shelf-spending-scan";
const BOOTH_ACCOUNT_PERMISSION = "https://accounts.booth.pm/*";
const BOOTH_PRODUCT_PERMISSION = "https://booth.pm/*";
const CARD_FLIP_FOCUS_DELAY_MS = 360;
const DRAG_CLICK_SUPPRESSION_MS = 320;
const POINTER_DRAG_THRESHOLD_PX = 7;
const SORT_SWITCH_ROLL_DURATION_MS = 360;
const DROP_SUCCESS_DURATION_MS = 760;
const MAX_ORGANIZATION_BACKUP_BYTES = 2 * 1024 * 1024;
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
  calculatingSpending: false,
};
const selectedItemKeys = new Set();
const sortSwitchAnimationTimers = new WeakMap();

let state;
let preferences;
let spendingSummary;
let renderTimer;
let dropSuccessTimer;
let contextMenuCloseTimer;
let contextMenuReturnFocus;
let loadMoreObserver;
let themeSwitchFrame;
let hasShownCards = false;
let pendingOrganizationBackup = null;
let fallbackSaveQueue = Promise.resolve();
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
    "sidebar", "sidebar-close", "sidebar-open", "sidebar-backdrop",
    "all-count", "purchased-count", "gift-count", "free-count", "favorites-count",
    "favorites-nav", "add-root-folder", "add-category", "all-folders", "unfiled-folder",
    "unfiled-count", "folder-drop-hint", "folder-tree", "folder-actions", "add-child-folder",
    "rename-folder", "move-folder", "delete-folder", "search-input",
    "search-field", "sync-button", "view-eyebrow", "view-title",
    "view-description", "last-sync", "sort-kind-toggle", "sort-kind-icon",
    "sort-kind-value", "sort-direction-toggle", "sort-direction-value", "sync-panel",
    "sync-message", "sync-detail", "sync-progress", "login-link",
    "result-summary", "selection-summary", "selection-count", "selection-clear",
    "clear-filter", "item-grid", "empty-state",
    "empty-title", "empty-description", "empty-sync-button",
    "empty-login-link", "load-more-sentinel", "toast", "context-menu",
    "folder-dialog", "folder-form", "folder-dialog-title",
    "folder-name-field", "folder-name-label", "folder-name-input", "folder-parent-field",
    "folder-parent-label", "folder-parent-select", "folder-parent-hint", "folder-form-error", "folder-submit",
    "assign-dialog", "assign-form", "assign-item-name",
    "assign-folder-list", "assign-submit", "confirm-dialog", "confirm-form", "confirm-copy",
    "confirm-dialog-eyebrow", "confirm-dialog-title", "confirm-submit",
    "clear-local-data", "organization-backup-actions",
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

function demoState() {
  const categories = [
    { id: "avatar-assets", name: "아바타 에셋", order: 0, collapsed: false, createdAt: "2025-12-30T00:00:00.000Z" },
    { id: "utilities", name: "도구와 월드", order: 1, collapsed: false, createdAt: "2025-12-31T00:00:00.000Z" },
  ];
  const folders = [
    { id: "avatars", name: "아바타", parentId: null, categoryId: "avatar-assets", order: 0, createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "clothes", name: "의상", parentId: "avatars", categoryId: null, order: 0, createdAt: "2026-01-02T00:00:00.000Z" },
    { id: "casual", name: "캐주얼", parentId: "clothes", categoryId: null, order: 0, createdAt: "2026-01-03T00:00:00.000Z" },
    { id: "tools", name: "툴", parentId: null, categoryId: "utilities", order: 0, createdAt: "2026-01-04T00:00:00.000Z" },
    { id: "world", name: "월드 소품", parentId: null, categoryId: "utilities", order: 1, createdAt: "2026-01-05T00:00:00.000Z" },
  ];

  const samples = [
    ["Moonlit Wardrobe", "Lumen Atelier", "purchased"],
    ["Soft Motion Presets", "Frame Picnic", "purchased"],
    ["Cloud Room Collection", "Mellow Works", "gift"],
    ["Everyday Hair Pack", "Plain Bloom", "purchased"],
    ["Glass Garden Props", "Tiny Orbit", "gift"],
    ["Studio Light Toolkit", "North Window", "purchased"],
    ["Sunday Knit Set", "Cider Closet", "purchased"],
    ["Paper Town Miniatures", "Little Draft", "gift"],
    ["Warm Skin Materials", "Peach Lab", "purchased"],
    ["Quiet Cafe World", "Blue Hour", "purchased"],
    ["Ribbon Accessory Kit", "Fine Loop", "gift"],
    ["ミルティナ Casual Set", "Mono Tools", "free"],
  ];

  const items = samples.map(([title, sellerName, source], index) => ({
    key: `product:demo-${index + 1}`,
    productId: `demo-${index + 1}`,
    source,
    sources: index === 0 ? ["purchased", "gift"] : [source],
    title,
    sellerName,
    sellerUrl: `https://demo-seller-${index + 1}.booth.pm/`,
    imageUrl: index === 0 ? "assets/icon128.png" : "",
    productUrl: "https://booth.pm/",
    sourcePageUrl: source === "gift"
      ? "https://accounts.booth.pm/library/gifts?page=1"
      : source === "free"
        ? "https://accounts.booth.pm/library/free_downloads?page=1"
        : "https://accounts.booth.pm/library?page=1",
    page: 1,
    orderOnPage: index,
    globalOrder: index,
    downloadFiles: Array.from({ length: index === 0 ? 4 : (index % 3) + 1 }, (_, fileIndex) => ({
      label: `${title.replace(/\s+/gu, "_")}_${fileIndex + 1}.zip`,
      detail: `${18 + (index * 7) + (fileIndex * 11)} MB`,
    })),
    locations: [
      {
        source,
        sourcePageUrl: source === "gift"
          ? "https://accounts.booth.pm/library/gifts?page=1"
          : source === "free"
            ? "https://accounts.booth.pm/library/free_downloads?page=1"
            : "https://accounts.booth.pm/library?page=1",
        page: 1,
        orderOnPage: index,
        globalOrder: index,
      },
      ...(index === 0 ? [{
        source: "gift",
        sourcePageUrl: "https://accounts.booth.pm/library/gifts?page=1",
        page: 1,
        orderOnPage: index,
        globalOrder: index,
      }] : []),
    ],
  }));

  return {
    schemaVersion: 5,
    items,
    categories,
    folders,
    favorites: [items[0].key, items[4].key, items[8].key],
    assignments: {
      [items[0].key]: ["clothes", "casual"],
      [items[3].key]: ["avatars"],
      [items[5].key]: ["tools"],
      [items[6].key]: ["casual"],
      [items[9].key]: ["world"],
      [items[11].key]: ["tools"],
    },
    lastSyncedAt: "2026-07-19T06:20:00.000Z",
  };
}

function element(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) {
    for (const [name, value] of Object.entries(options.attrs)) {
      if (value !== null && value !== undefined) node.setAttribute(name, String(value));
    }
  }
  return node;
}

function lucideIcon(name, className = "") {
  return element("span", {
    className: `${className ? `${className} ` : ""}licon licon-${name}`,
    attrs: { "aria-hidden": "true" },
  });
}

function setLucideIcon(node, name) {
  if (!node) return;
  for (const className of [...node.classList]) {
    if (className.startsWith("licon-")) node.classList.remove(className);
  }
  node.classList.add("licon", `licon-${name}`);
}

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
  const currentTheme = normalizeThemePreference(preferences?.theme);
  const currentIndex = THEME_SEQUENCE.indexOf(currentTheme);
  const nextTheme = THEME_SEQUENCE[(currentIndex + 1) % THEME_SEQUENCE.length];
  preferences = { ...preferences, theme: nextTheme };
  applyTheme(nextTheme);
  try {
    preferences = await savePreferences(preferences);
  } catch (error) {
    showToast(t("테마 설정을 저장하지 못했어요: {message}", { message: error.message }), "error");
  }
}

async function changeLocale(locale) {
  preferences = { ...preferences, locale };
  applyLocalePreference(locale);
  render();
  try {
    preferences = await savePreferences(preferences);
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

function persistState({ alreadyLocked = false } = {}) {
  const write = async () => {
    state = await saveState(state);
    return state;
  };
  const reportFailure = (error) => {
    showToast(t("저장하지 못했어요: {message}", { message: error.message }), "error");
    return state;
  };

  if (alreadyLocked) return write();
  if (navigator.locks?.request) {
    return runWithStateLock(write, { wait: true }).catch(reportFailure);
  }

  fallbackSaveQueue = fallbackSaveQueue.then(write).catch(reportFailure);
  return fallbackSaveQueue;
}

async function runWithStateLock(task, { wait = false } = {}) {
  if (!navigator.locks?.request) return task();

  return navigator.locks.request(
    STATE_LOCK_NAME,
    wait ? { mode: "exclusive" } : { mode: "exclusive", ifAvailable: true },
    async (lock) => {
      if (!lock) {
        const error = new Error(t("다른 BOOTH Shelf 창에서 동기화 또는 삭제 작업이 진행 중입니다."));
        error.code = "STATE_BUSY";
        throw error;
      }
      return task();
    },
  );
}

async function runWithSpendingLock(task) {
  if (!navigator.locks?.request) return task();

  return navigator.locks.request(
    SPENDING_LOCK_NAME,
    { mode: "exclusive", ifAvailable: true },
    async (lock) => {
      if (!lock) {
        const error = new Error(t("다른 BOOTH Shelf 창에서 이미 결제 금액을 계산하고 있어요."));
        error.code = "SPENDING_BUSY";
        throw error;
      }
      return task();
    },
  );
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
    origins: [BOOTH_ACCOUNT_PERMISSION, BOOTH_PRODUCT_PERMISSION],
  });
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
    [52, t("완료된 주문 모으는 중")],
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
    detail: t("완료 주문만 합산합니다."),
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

    const result = IS_DEMO
      ? await runDemoSpending()
      : await runWithSpendingLock(() => calculateBoothSpending((progress) => {
        setRedPillProgress({
          message: progress.message,
          detail: progress.total
            ? `${progress.completed} / ${progress.total}`
            : t("주문 수를 확인하고 있어요."),
          percent: progress.percent,
        });
      }));
    spendingSummary = await saveSpendingSummary(result);
    renderSpendingSummary(spendingSummary);
    showToast(t("BOOTH 결제 금액 계산을 마쳤어요."));
  } catch (error) {
    const authError = error instanceof BoothAuthError || error?.code === "AUTH_REQUIRED";
    showRedPillError(authError
      ? new Error(t("같은 브라우저 프로필에서 BOOTH에 로그인한 뒤 다시 시도해 주세요."))
      : error);
  } finally {
    ui.calculatingSpending = false;
    refs["red-pill-calculate"].disabled = false;
    refs["red-pill-button"].disabled = false;
    refs["sync-button"].disabled = false;
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
  document.body.classList.remove("sidebar-visible");
}

function openSidebar() {
  document.body.classList.add("sidebar-visible");
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
      description: t("이 폴더에 분류한 상품을 보여드려요."),
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
    button.classList.toggle("is-active", !ui.favoritesOnly && ui.source === button.dataset.source);
  });
  refs["favorites-nav"].classList.toggle("is-active", ui.favoritesOnly);
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
        role: "treeitem",
        "aria-level": depth,
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
  if (!document.body.classList.contains("is-item-dragging")) {
    refs["folder-drop-hint"].textContent = t("카드를 폴더에 끌어 놓아 분류");
  }
  const selected = getSelectedFolder();
  refs["folder-actions"].hidden = !selected;
  if (selected) {
    const depth = folderDepth(state.folders, selected.id);
    refs["add-child-folder"].disabled = depth >= MAX_FOLDER_DEPTH;
    refs["add-child-folder"].title = depth >= MAX_FOLDER_DEPTH ? t("폴더는 3계층까지 만들 수 있어요.") : "";
  }
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

function demoDownloadOptions(item) {
  const sampleNumber = Number.parseInt(String(item.productId).replace(/\D/g, ""), 10) || 1;
  const optionCount = sampleNumber === 1 ? 10 : (sampleNumber % 3) + 1;
  return Array.from({ length: optionCount }, (_, index) => ({
    id: `demo-${sampleNumber}-${index + 1}`,
    label: t("{title} {kind}.zip", {
      title: item.title,
      kind: index ? t("추가 파일 {number}", { number: index + 1 }) : t("메인 파일"),
    }),
    detail: `${18 + (sampleNumber * 7) + (index * 13)} MB`,
    url: `https://booth.pm/downloadables/${9_000_000 + (sampleNumber * 20) + index}?variation_id=${sampleNumber}`,
  }));
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
    const list = element("div", {
      className: "download-option-list",
      attrs: { role: "list", "aria-label": t("다운로드할 파일") },
    });
    downloadState.options.forEach((option, optionIndex) => {
      const button = element("button", {
        className: "download-option",
        attrs: {
          type: "button",
          role: "listitem",
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
      list.append(button);
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
  const revealButton = card.querySelector(".download-reveal-button");
  if (nextMatch && revealButton) revealButton.before(nextMatch);
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
      "aria-selected": String(isSelected),
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

  const isPurchased = itemHasSource(item, "purchased");
  const isGift = itemHasSource(item, "gift");
  const isFree = itemHasSource(item, "free");
  const assignedFolderIds = getItemFolderIds(state.assignments, item.key);
  const sourceLabels = [
    isPurchased ? t("구매") : "",
    isGift ? t("선물") : "",
    isFree ? t("무료") : "",
  ].filter(Boolean);
  const sourceClass = sourceLabels.length > 1
    ? "mixed"
    : isGift ? "gift" : isFree ? "free" : "purchased";
  const sourceBadge = element("span", {
    className: `source-badge source-${sourceClass}`,
    text: sourceLabels.join(" + "),
  });
  const selectionBadge = element("span", {
    className: "item-selection-badge",
    text: t("선택됨"),
    attrs: { "aria-hidden": "true" },
  });
  const visualControls = element("div", { className: "item-visual-controls" });
  visualControls.append(selectionBadge);
  const visualHeader = element("div", { className: "item-visual-header" });
  visualHeader.append(sourceBadge, visualControls);
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
    lucideIcon("chevron-right", "download-reveal-arrow"),
  );
  content.append(seller, title);
  const downloadMatch = createDownloadSearchMatch(item);
  if (downloadMatch) content.append(downloadMatch);
  content.append(revealButton);

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
        text: label,
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
    text: t(assignedFolderIds.length ? "폴더 관리" : "폴더에 넣기"),
    attrs: { type: "button", "data-assign-key": item.key },
  });
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
  actions.append(assignButton, favoriteButton);
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
    if (card.getAttribute("aria-selected") !== String(selected)) {
      card.setAttribute("aria-selected", String(selected));
    }
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
  refs["folder-drop-hint"].textContent = t("카드를 폴더에 끌어 놓아 분류");
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
  refs["folder-drop-hint"].textContent = itemKeys.length > 1
    ? t("{count}개 상품을 놓을 폴더를 선택하세요", { count: formatCount(itemKeys.length) })
    : t("놓을 폴더를 선택하세요");

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
      const nextItems = setItemDownloadFiles(state.items, itemKey, options);
      if (nextItems !== state.items) {
        state = { ...state, items: nextItems };
        await persistState();
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

function hasActiveFilter() {
  return Boolean(ui.query)
    || ui.searchField !== "all"
    || ui.source !== "all"
    || ui.folderId !== "all"
    || ui.favoritesOnly
    || ui.sortKind !== "purchase"
    || ui.sortDirection !== "asc";
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
  refs["clear-filter"].hidden = !hasActiveFilter();
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
  if (refs["search-input"].value !== ui.query) refs["search-input"].value = ui.query;
}

function render({ reconcileItems = false, animateItems = false } = {}) {
  renderNavigation();
  renderFolders();
  renderHeader();
  renderItems({ reconcile: reconcileItems, animateLayout: animateItems });
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

function setSource(source) {
  selectedItemKeys.clear();
  ui.source = source;
  ui.favoritesOnly = false;
  ui.folderId = "all";
  ui.selectedFolderId = null;
  ui.selectedCategoryId = null;
  resetResultWindow();
  closeSidebar();
  render();
}

function selectFolder(folderId) {
  selectedItemKeys.clear();
  ui.folderId = folderId;
  ui.selectedFolderId = folderId === "all" || folderId === "unfiled" ? null : folderId;
  ui.selectedCategoryId = null;
  ui.favoritesOnly = false;
  resetResultWindow();
  closeSidebar();
  render();
}

function clearFilters() {
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
  refs["sync-panel"].hidden = hidden;
  refs["sync-panel"].dataset.tone = tone;
  refs["sync-message"].textContent = message;
  refs["sync-detail"].textContent = detail;
  refs["sync-progress"].style.width = `${Math.max(0, Math.min(100, percent))}%`;
  refs["login-link"].hidden = !login;
}

function mergeSyncedItems(items, syncedAt) {
  downloadCardStates.clear();
  selectedItemKeys.clear();
  const previousItems = new Map(state.items.map((item) => [item.key, item]));
  const mergedItems = items.map((item) => {
    const previous = previousItems.get(item.key);
    if (!previous?.supportIndexedAt) return item;
    return {
      ...item,
      supportedAvatarIds: [...(previous.supportedAvatarIds || [])],
      supportIndexedAt: previous.supportIndexedAt,
      supportIndexVersion: previous.supportIndexVersion,
    };
  });
  const keys = new Set(mergedItems.map((item) => item.key));
  state = {
    ...state,
    items: mergedItems,
    lastSyncedAt: syncedAt,
    favorites: state.favorites.filter((key) => keys.has(key)),
    assignments: Object.fromEntries(
      Object.keys(state.assignments).map((key) => [
        key,
        getItemFolderIds(state.assignments, key).filter(
          (folderId) => state.folders.some((folder) => folder.id === folderId),
        ),
      ]).filter(([key, folderIds]) => keys.has(key) && folderIds.length),
    ),
  };
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
  if (ui.syncing) return;
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

  try {
    if (!IS_DEMO) {
      const permissionGranted = await requestBoothAccess({ productPages: true });
      if (!permissionGranted) {
        const error = new Error(t("라이브러리와 상품 설명을 읽으려면 BOOTH 계정 및 상품 페이지 접근을 허용해 주세요."));
        error.code = "PERMISSION_REQUIRED";
        throw error;
      }
    }

    await runWithStateLock(async () => {
      if (IS_DEMO) {
        await runDemoSync();
        showToast(t("미리보기 동기화를 완료했어요."));
        return;
      }

      const result = await syncBoothLibrary(({ message, completed, total }) => {
        const percent = total ? Math.round(8 + (completed / total) * 44) : 8;
        setSyncPanel({
          message,
          detail: total ? t("{completed} / {total} 페이지", { completed, total }) : "",
          percent,
        });
      });
      mergeSyncedItems(result.items, result.syncedAt);
      await persistState({ alreadyLocked: true });

      const supportResult = await indexBoothProductSupport(state.items, {
        onProgress: ({ message, completed, total }) => {
          const percent = total ? Math.round(55 + (completed / total) * 43) : 98;
          setSyncPanel({
            message,
            detail: total ? t("{completed} / {total}개 상품", { completed, total }) : "",
            percent,
          });
        },
        onCheckpoint: async (items) => {
          state = { ...state, items };
          await persistState({ alreadyLocked: true });
        },
      });
      state = { ...state, items: supportResult.items };
      await persistState({ alreadyLocked: true });
      resetResultWindow();
      render();
      const supportRetryDetail = supportResult.failedCount
        ? t(" · {failed}개 상품 설명은 다음 동기화에서 다시 확인", {
          failed: formatCount(supportResult.failedCount),
        })
        : "";
      setSyncPanel({
        message: t("동기화가 끝났어요"),
        detail: `${t("{items}개 상품 · {files}개 파일명 · {supported}개 상품의 지원 아바타 정보를 저장했습니다.", {
          items: formatCount(result.items.length),
          files: formatCount(result.downloadFileCount),
          supported: formatCount(supportResult.supportedProductCount),
        })}${supportRetryDetail}`,
        percent: 100,
        tone: supportResult.failedCount ? "default" : "success",
      });
      window.setTimeout(() => setSyncPanel({ hidden: true }), 4200);
      showToast(supportResult.failedCount
        ? t("일부 상품 설명은 다음 동기화에서 다시 확인해요.")
        : t("라이브러리를 최신 상태로 업데이트했어요."));
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
    refs["sync-button"].disabled = false;
    refs["red-pill-button"].disabled = false;
    refs["clear-local-data"].disabled = false;
    refs["export-organization-data"].disabled = false;
    refs["import-organization-data"].disabled = false;
    refs["sync-button"].classList.remove("is-syncing");
  }
}

function openDataDeleteConfirmation() {
  if (ui.syncing || ui.calculatingSpending) {
    showToast(t("진행 중인 작업이 끝난 뒤 데이터를 삭제해 주세요."), "error");
    return;
  }
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
    const backup = createOrganizationBackup(state);
    const blob = new Blob([`${JSON.stringify(backup, null, 2)}\n`], {
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
      message: error?.message || t("알 수 없는 오류"),
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
    if (file.size > MAX_ORGANIZATION_BACKUP_BYTES) {
      throw new Error(t("백업 파일은 2MB 이하여야 합니다."));
    }
    const content = (await file.text()).replace(/^\uFEFF/u, "");
    const backup = JSON.parse(content);
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
    await fallbackSaveQueue;
    await runWithStateLock(async () => {
      const latestState = await loadState();
      const restored = restoreOrganizationBackup(latestState, backup);
      state = await saveState(restored.state);
    });
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
    await fallbackSaveQueue;
    await runWithStateLock(async () => {
      state = await clearState();
      await removeBoothAccess();
    });
    preferences = await loadPreferences();
    spendingSummary = await loadSpendingSummary();
    applyLocalePreference(preferences.locale);
    downloadCardStates.clear();
    refs["data-delete-dialog"].close();
    setSyncPanel({ hidden: true });
    clearFilters();
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
  refs["folder-parent-field"].hidden = !(isMove || isAddRoot);
  refs["folder-name-input"].required = !isMove;
  refs["folder-name-label"].textContent = t(isCategory ? "카테고리 이름" : "폴더 이름");
  refs["folder-name-input"].value = isRename
    ? (isCategory ? selectedCategory?.name : selected?.name) || ""
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
  const selected = state.folders.find((folder) => folder.id === ui.folderDialogFolderId) ?? null;
  const mode = ui.folderDialogMode;

  try {
    if (mode === "add-root") {
      const location = parseFolderLocation(refs["folder-parent-select"].value);
      state.folders = createFolder(state.folders, {
        name: refs["folder-name-input"].value,
        categoryId: location.categoryId,
      });
    } else if (mode === "add-child") {
      state.folders = createFolder(state.folders, {
        name: refs["folder-name-input"].value,
        parentId: selected.id,
      });
    } else if (mode === "rename") {
      state.folders = renameFolder(state.folders, selected.id, refs["folder-name-input"].value);
    } else if (mode === "move") {
      const location = parseFolderLocation(refs["folder-parent-select"].value);
      state.folders = moveFolder(state.folders, selected.id, location.parentId, location.categoryId);
    } else if (mode === "add-category") {
      state.categories = createCategory(state.categories, { name: refs["folder-name-input"].value });
    } else if (mode === "rename-category") {
      state.categories = renameCategory(
        state.categories,
        ui.folderDialogCategoryId,
        refs["folder-name-input"].value,
      );
    }

    await persistState();
    refs["folder-dialog"].close();
    render();
    showToast(t(
      mode === "move"
        ? "폴더를 이동했어요."
        : mode.includes("category")
          ? "카테고리를 저장했어요."
          : "폴더를 저장했어요.",
    ));
  } catch (error) {
    refs["folder-form-error"].textContent = t(error.message);
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
  const folderPath = normalizedFolderId ? getFolderPath(state.folders, normalizedFolderId) : [];
  const folderLabel = normalizedFolderId
    ? folderPath.map((folder) => folder.name).join(" / ")
    : t("미분류");
  const changedCount = uniqueKeys.filter(
    (itemKey) => {
      const assignedFolderIds = getItemFolderIds(state.assignments, itemKey);
      return normalizedFolderId
        ? !assignedFolderIds.includes(normalizedFolderId)
        : assignedFolderIds.length > 0;
    },
  ).length;

  state.assignments = setItemsFolderAssignment(
    state.items,
    state.folders,
    state.assignments,
    uniqueKeys,
    normalizedFolderId,
  );
  await persistState();
  if (fromDrop) markFolderDropSuccess(normalizedFolderId);
  if (clearSelection) selectedItemKeys.clear();
  render();

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
  const item = findItem(itemKey);
  if (!item) throw new Error(t("상품을 찾을 수 없어요."));

  const nextFolderIds = [...new Set(Array.isArray(folderIds) ? folderIds : [])];
  const previousFolderIds = getItemFolderIds(state.assignments, itemKey);
  const unchanged = previousFolderIds.length === nextFolderIds.length
    && previousFolderIds.every((folderId) => nextFolderIds.includes(folderId));
  if (unchanged) {
    showToast(t("폴더 배치가 바뀌지 않았어요."));
    return false;
  }

  state.assignments = setItemFolderAssignments(
    state.items,
    state.folders,
    state.assignments,
    itemKey,
    nextFolderIds,
  );
  await persistState();
  render();
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
  if (ui.confirmDeleteType === "category") {
    const selectedCategory = getSelectedCategory();
    if (!selectedCategory) return;
    const result = deleteCategoryAndReleaseFolders(
      state.categories,
      state.folders,
      selectedCategory.id,
    );
    state.categories = result.categories;
    state.folders = result.folders;
    ui.selectedCategoryId = null;
    await persistState();
    refs["confirm-dialog"].close();
    render();
    showToast(t("카테고리를 삭제했어요."));
    return;
  }

  const selected = state.folders.find((folder) => folder.id === ui.confirmDeleteFolderId) ?? null;
  if (!selected) return;
  const parentId = selected.parentId ?? "all";
  const result = deleteFolderAndPromote(state.folders, state.assignments, selected.id);
  state.folders = result.folders;
  state.assignments = result.assignments;
  ui.folderId = parentId;
  ui.selectedFolderId = parentId === "all" ? null : parentId;
  ui.selectedCategoryId = null;
  await persistState();
  refs["confirm-dialog"].close();
  render();
  showToast(t("폴더를 삭제했어요."));
}

async function toggleFolderCategory(categoryId) {
  state.categories = toggleCategoryCollapsed(state.categories, categoryId);
  await persistState();
  renderFolders();
}

async function toggleFavorite(itemKey) {
  if (state.favorites.includes(itemKey)) {
    state.favorites = state.favorites.filter((key) => key !== itemKey);
  } else {
    state.favorites = [...state.favorites, itemKey];
  }
  await persistState();
  render();
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
  refs["red-pill-button"].addEventListener("click", openRedPillDialog);
  refs["red-pill-calculate"].addEventListener("click", calculateSpending);
  refs["sidebar-open"].addEventListener("click", openSidebar);
  refs["sidebar-close"].addEventListener("click", closeSidebar);
  refs["sidebar-backdrop"].addEventListener("click", closeSidebar);

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
    render();
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
  refs["add-child-folder"].addEventListener("click", () => openFolderDialog("add-child"));
  refs["rename-folder"].addEventListener("click", () => openFolderDialog("rename"));
  refs["move-folder"].addEventListener("click", () => openFolderDialog("move"));
  refs["delete-folder"].addEventListener("click", () => openDeleteConfirmation());
  refs["clear-local-data"].addEventListener("click", openDataDeleteConfirmation);
  refs["export-organization-data"].addEventListener("click", exportOrganizationData);
  refs["import-organization-data"].addEventListener("click", chooseOrganizationBackup);
  refs["organization-backup-file"].addEventListener("change", prepareOrganizationRestore);

  refs["search-input"].addEventListener("input", (event) => {
    ui.query = event.target.value;
    resetResultWindow();
    scheduleResultRender();
  });
  refs["search-field"].addEventListener("change", (event) => {
    ui.searchField = event.target.value;
    resetResultWindow();
    renderItems({ reconcile: true, animateLayout: true });
  });
  refs["sort-kind-toggle"].addEventListener("click", toggleSortKind);
  refs["sort-direction-toggle"].addEventListener("click", toggleSortDirection);
  refs["sync-button"].addEventListener("click", syncLibrary);
  refs["empty-sync-button"].addEventListener("click", syncLibrary);
  refs["clear-filter"].addEventListener("click", clearFilters);
  refs["selection-clear"].addEventListener("click", clearItemSelection);
  refs["item-grid"].addEventListener("click", (event) => {
    if (Date.now() < itemDrag.suppressClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const card = event.target.closest(".item-card[data-item-key]");
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
      toggleFavorite(favoriteButton.dataset.favoriteKey);
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
      if (Object.hasOwn(changes, STORAGE_KEY)) {
        state = await loadState();
        downloadCardStates.clear();
        selectedItemKeys.clear();
        resetResultWindow();
        render();
      }
      if (Object.hasOwn(changes, PREFERENCES_KEY)) {
        preferences = await loadPreferences();
        applyLocalePreference(preferences.locale);
        render();
      }
      if (Object.hasOwn(changes, SPENDING_SUMMARY_KEY)) {
        spendingSummary = await loadSpendingSummary();
        if (spendingSummary && refs["red-pill-dialog"].open) {
          renderSpendingSummary(spendingSummary);
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
    state = demoState();
    preferences = await loadPreferences();
    spendingSummary = null;
    refs["clear-local-data"].hidden = true;
    refs["organization-backup-actions"].hidden = true;
  } else {
    await restrictStorageAccess();
    [state, preferences, spendingSummary] = await Promise.all([
      loadState(),
      loadPreferences(),
      loadSpendingSummary(),
    ]);
  }
  applyLocalePreference(preferences.locale);
  bindEvents();
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
