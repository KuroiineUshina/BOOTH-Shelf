import {
  MAX_FOLDER_DEPTH,
  buildFolderTree,
  canMoveFolder,
  createFolder,
  deleteFolderAndPromote,
  filterItems,
  folderDepth,
  getFolderPath,
  moveFolder,
  renameFolder,
  setItemFolderAssignment,
  sortItems,
} from "./domain.js";
import {
  BoothAuthError,
  calculateBoothSpending,
  loadBoothDownloadOptions,
  syncBoothLibrary,
} from "./booth.js";
import {
  PREFERENCES_KEY,
  SPENDING_SUMMARY_KEY,
  STORAGE_KEY,
  clearState,
  loadPreferences,
  loadSpendingSummary,
  loadState,
  restrictStorageAccess,
  savePreferences,
  saveSpendingSummary,
  saveState,
} from "./storage.js";
import { startBoothDownload } from "./download.js";

const PAGE_SIZE = 48;
const IS_DEMO = new URLSearchParams(window.location.search).has("demo");
const STATE_LOCK_NAME = "booth-shelf-state-write";
const SPENDING_LOCK_NAME = "booth-shelf-spending-scan";
const BOOTH_HOST_PERMISSION = "https://accounts.booth.pm/*";
const CARD_FLIP_FOCUS_DELAY_MS = 360;
const ITEM_DRAG_MIME = "application/x-booth-shelf-item";
const DRAG_CLICK_SUPPRESSION_MS = 320;
const DROP_SUCCESS_DURATION_MS = 760;

const ui = {
  source: "all",
  folderId: "all",
  favoritesOnly: false,
  query: "",
  searchField: "all",
  sort: "purchase",
  visibleLimit: PAGE_SIZE,
  selectedFolderId: null,
  folderDialogMode: null,
  assigningItemKey: null,
  dropSuccessFolderId: null,
  syncing: false,
  calculatingSpending: false,
};

let state;
let preferences;
let spendingSummary;
let renderTimer;
let dropSuccessTimer;
let fallbackSaveQueue = Promise.resolve();
const downloadCardStates = new Map();
const itemDrag = {
  itemKey: null,
  target: null,
  blockedByControl: false,
  openedSidebar: false,
  suppressClickUntil: 0,
};

const refs = Object.fromEntries(
  [
    "sidebar", "sidebar-close", "sidebar-open", "sidebar-backdrop",
    "all-count", "purchased-count", "gift-count", "favorites-count",
    "favorites-nav", "add-root-folder", "all-folders", "unfiled-folder",
    "unfiled-count", "folder-drop-hint", "folder-tree", "folder-actions", "add-child-folder",
    "rename-folder", "move-folder", "delete-folder", "search-input",
    "search-field", "sync-button", "view-eyebrow", "view-title",
    "view-description", "last-sync", "sort-select", "sync-panel",
    "sync-message", "sync-detail", "sync-progress", "login-link",
    "result-summary", "clear-filter", "item-grid", "empty-state",
    "empty-title", "empty-description", "empty-sync-button",
    "empty-login-link", "load-more-wrap", "load-more", "toast",
    "folder-dialog", "folder-form", "folder-dialog-title",
    "folder-name-field", "folder-name-input", "folder-parent-field",
    "folder-parent-select", "folder-form-error", "folder-submit",
    "assign-dialog", "assign-form", "assign-item-name",
    "assign-folder-select", "confirm-dialog", "confirm-form", "confirm-copy",
    "clear-local-data", "data-delete-dialog", "data-delete-form",
    "theme-toggle", "theme-toggle-icon", "theme-toggle-label",
    "red-pill-button", "red-pill-dialog", "red-pill-intro",
    "red-pill-progress", "red-pill-progress-message", "red-pill-progress-detail",
    "red-pill-progress-value", "red-pill-result", "red-pill-total",
    "red-pill-other-currencies", "red-pill-order-count", "red-pill-average",
    "red-pill-free-count", "red-pill-verdict", "red-pill-calculated-at",
    "red-pill-error", "red-pill-calculate",
  ].map((id) => [id, document.getElementById(id)]),
);

function demoState() {
  const folders = [
    { id: "avatars", name: "아바타", parentId: null, order: 0, createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "clothes", name: "의상", parentId: "avatars", order: 0, createdAt: "2026-01-02T00:00:00.000Z" },
    { id: "casual", name: "캐주얼", parentId: "clothes", order: 0, createdAt: "2026-01-03T00:00:00.000Z" },
    { id: "tools", name: "툴", parentId: null, order: 1, createdAt: "2026-01-04T00:00:00.000Z" },
    { id: "world", name: "월드 소품", parentId: null, order: 2, createdAt: "2026-01-05T00:00:00.000Z" },
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
    ["Avatar Utility Box", "Mono Tools", "purchased"],
  ];

  const items = samples.map(([title, sellerName, source], index) => ({
    key: `${source}:demo-${index + 1}`,
    productId: `demo-${index + 1}`,
    source,
    title,
    sellerName,
    sellerUrl: "",
    imageUrl: "",
    productUrl: "https://booth.pm/",
    sourcePageUrl: source === "gift"
      ? "https://accounts.booth.pm/library/gifts?page=1"
      : "https://accounts.booth.pm/library?page=1",
    page: 1,
    orderOnPage: index,
    globalOrder: index,
  }));

  return {
    schemaVersion: 1,
    items,
    folders,
    favorites: [items[0].key, items[4].key, items[8].key],
    assignments: {
      [items[0].key]: "clothes",
      [items[3].key]: "avatars",
      [items[5].key]: "tools",
      [items[6].key]: "casual",
      [items[9].key]: "world",
      [items[11].key]: "tools",
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

function formatCount(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function formatMoney(amount, currency = "JPY") {
  const value = Number(amount || 0);
  if (currency === "JPY") return `${Math.round(value).toLocaleString("ko-KR")}엔`;
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })} ${currency}`;
}

function applyTheme(theme) {
  const normalized = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = normalized;
  const dark = normalized === "dark";
  refs["theme-toggle"].setAttribute("aria-pressed", String(dark));
  refs["theme-toggle"].setAttribute("aria-label", dark ? "라이트 모드로 전환" : "다크 모드로 전환");
  refs["theme-toggle-icon"].textContent = dark ? "☀" : "☾";
  refs["theme-toggle-label"].textContent = dark ? "라이트" : "다크";
}

async function toggleTheme() {
  const nextTheme = preferences?.theme === "dark" ? "light" : "dark";
  preferences = { theme: nextTheme };
  applyTheme(nextTheme);
  try {
    preferences = await savePreferences(preferences);
  } catch (error) {
    showToast(`테마 설정을 저장하지 못했어요: ${error.message}`, "error");
  }
}

function formatSyncTime(value) {
  if (!value) return "아직 동기화하지 않았어요";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "동기화 시간 알 수 없음";
  return `최근 동기화 ${new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)}`;
}

function persistState({ alreadyLocked = false } = {}) {
  const write = async () => {
    state = await saveState(state);
    return state;
  };
  const reportFailure = (error) => {
    showToast(`저장하지 못했어요: ${error.message}`, "error");
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
        const error = new Error("다른 BOOTH Shelf 창에서 동기화 또는 삭제 작업이 진행 중입니다.");
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
        const error = new Error("다른 BOOTH Shelf 창에서 이미 결제 금액을 계산하고 있어요.");
        error.code = "SPENDING_BUSY";
        throw error;
      }
      return task();
    },
  );
}

async function requestBoothAccess() {
  if (typeof chrome === "undefined" || !chrome.permissions?.request) return false;
  return chrome.permissions.request({ origins: [BOOTH_HOST_PERMISSION] });
}

async function removeBoothAccess() {
  if (typeof chrome === "undefined" || !chrome.permissions?.remove) return false;
  return chrome.permissions.remove({ origins: [BOOTH_HOST_PERMISSION] });
}

function showToast(message, tone = "default") {
  refs.toast.textContent = message;
  refs.toast.dataset.tone = tone;
  refs.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => refs.toast.classList.remove("is-visible"), 2800);
}

function getSpendingVerdict(jpyTotal) {
  if (jpyTotal === 0) return "아직 빨간약이 투명합니다. 무료 상품 수집가의 기운이 느껴져요.";
  if (jpyTotal < 50_000) return "아직은 침착합니다. 취향 소비를 꽤 이성적으로 관리하고 있어요.";
  if (jpyTotal < 150_000) return "취향에 성실한 편이군요. 장바구니와 좋은 관계를 유지 중입니다.";
  if (jpyTotal < 500_000) return "BOOTH가 당신의 취향을 아주 잘 알고 있습니다.";
  if (jpyTotal < 1_000_000) return "결제 버튼과 오래 알고 지낸 사이군요. 빨간약이 제법 진합니다.";
  return "빨간약 최대 농도. 이제 라이브러리가 하나의 세계관입니다.";
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
  refs["red-pill-order-count"].textContent = `${formatCount(summary.orderCount)}건`;
  refs["red-pill-free-count"].textContent = `${formatCount(summary.freeOrderCount)}건`;
  refs["red-pill-average"].textContent = entries.length === 1 && summary.orderCount
    ? formatMoney(primary[1] / summary.orderCount, primary[0])
    : summary.orderCount ? "통화별 집계" : formatMoney(0, primary[0]);
  refs["red-pill-verdict"].textContent = getSpendingVerdict(summary.totals.JPY || 0);
  refs["red-pill-calculated-at"].textContent = `마지막 계산 ${new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(summary.scannedAt))}`;
  refs["red-pill-other-currencies"].hidden = !otherEntries.length;
  refs["red-pill-other-currencies"].textContent = otherEntries.length
    ? `다른 통화: ${otherEntries.map(([currency, amount]) => formatMoney(amount, currency)).join(" · ")}`
    : "";
  refs["red-pill-calculate"].textContent = "다시 계산";
}

function showRedPillError(error) {
  refs["red-pill-intro"].hidden = true;
  refs["red-pill-progress"].hidden = true;
  refs["red-pill-result"].hidden = true;
  refs["red-pill-error"].hidden = false;
  refs["red-pill-error"].textContent = error?.message || "결제 금액을 계산하지 못했어요.";
}

async function runDemoSpending() {
  const phases = [
    [18, "구매 내역 페이지 확인 중"],
    [52, "완료된 주문 모으는 중"],
    [82, "결제 금액 더하는 중"],
    [100, "빨간약 제조 완료"],
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
    showRedPillError(new Error("전체 동기화가 끝난 뒤 계산해 주세요."));
    return;
  }
  ui.calculatingSpending = true;
  refs["red-pill-calculate"].disabled = true;
  refs["red-pill-button"].disabled = true;
  refs["sync-button"].disabled = true;
  refs["clear-local-data"].disabled = true;
  refs["red-pill-calculate"].textContent = "계산 중…";
  setRedPillProgress({ message: "BOOTH 구매 내역 연결 중", detail: "완료 주문만 합산합니다.", percent: 3 });

  try {
    if (!IS_DEMO) {
      const permissionGranted = await requestBoothAccess();
      if (!permissionGranted) {
        const error = new Error("결제 금액을 계산하려면 BOOTH 계정 페이지 접근을 허용해 주세요.");
        error.code = "PERMISSION_REQUIRED";
        throw error;
      }
    }

    const result = IS_DEMO
      ? await runDemoSpending()
      : await runWithSpendingLock(() => calculateBoothSpending((progress) => {
        setRedPillProgress({
          message: progress.message,
          detail: progress.total ? `${progress.completed} / ${progress.total}` : "주문 수를 확인하고 있어요.",
          percent: progress.percent,
        });
      }));
    spendingSummary = await saveSpendingSummary(result);
    renderSpendingSummary(spendingSummary);
    showToast("BOOTH 결제 금액 계산을 마쳤어요.");
  } catch (error) {
    const authError = error instanceof BoothAuthError || error?.code === "AUTH_REQUIRED";
    showRedPillError(authError
      ? new Error("같은 브라우저 프로필에서 BOOTH에 로그인한 뒤 다시 시도해 주세요.")
      : error);
  } finally {
    ui.calculatingSpending = false;
    refs["red-pill-calculate"].disabled = false;
    refs["red-pill-button"].disabled = false;
    refs["sync-button"].disabled = false;
    refs["clear-local-data"].disabled = false;
    refs["red-pill-calculate"].textContent = spendingSummary ? "다시 계산" : "다시 시도";
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

function getViewCopy() {
  if (ui.favoritesOnly) {
    return {
      eyebrow: "빠르게 다시 찾기",
      title: "즐겨찾기",
      description: "별표로 표시한 상품만 모아봤어요.",
    };
  }

  if (ui.folderId === "unfiled") {
    return {
      eyebrow: "정리가 필요한 상품",
      title: "미분류",
      description: "아직 폴더에 넣지 않은 상품이에요.",
    };
  }

  if (ui.folderId !== "all") {
    const folder = state.folders.find((candidate) => candidate.id === ui.folderId);
    const path = folder ? getFolderPath(state.folders, folder.id) : [];
    return {
      eyebrow: path.slice(0, -1).map((entry) => entry.name).join(" / ") || "내 폴더",
      title: folder?.name || "폴더",
      description: "이 폴더에 분류한 상품을 보여드려요.",
    };
  }

  if (ui.source === "purchased") {
    return {
      eyebrow: "내 BOOTH 보관함",
      title: "구매한 상품",
      description: "직접 구매해 라이브러리에 보관 중인 상품이에요.",
    };
  }

  if (ui.source === "gift") {
    return {
      eyebrow: "내 BOOTH 보관함",
      title: "받은 기프트",
      description: "선물받아 기프트함에 보관 중인 상품이에요.",
    };
  }

  return {
    eyebrow: "내 BOOTH 보관함",
    title: "전체 상품",
    description: "구매한 상품과 받은 기프트를 한눈에 확인하세요.",
  };
}

function renderNavigation() {
  const purchasedCount = state.items.filter((item) => item.source === "purchased").length;
  const giftCount = state.items.filter((item) => item.source === "gift").length;
  const favoriteCount = state.favorites.filter((key) => state.items.some((item) => item.key === key)).length;
  const unfiledCount = state.items.filter((item) => !state.assignments[item.key]).length;

  refs["all-count"].textContent = formatCount(state.items.length);
  refs["purchased-count"].textContent = formatCount(purchasedCount);
  refs["gift-count"].textContent = formatCount(giftCount);
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
  return state.items.filter((item) => state.assignments[item.key] === folderId).length;
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
        title: `${folder.name} 폴더 · 상품 카드를 끌어 놓아 분류`,
      },
    });
    row.style.setProperty("--folder-depth", String(depth - 1));
    row.append(
      element("span", { className: "folder-glyph", text: folder.children.length ? "▰" : "▱", attrs: { "aria-hidden": "true" } }),
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

function renderFolders() {
  refs["folder-tree"].replaceChildren(renderFolderBranch(buildFolderTree(state.folders)));
  const selected = getSelectedFolder();
  refs["folder-actions"].hidden = !selected;
  if (selected) {
    const depth = folderDepth(state.folders, selected.id);
    refs["add-child-folder"].disabled = depth >= MAX_FOLDER_DEPTH;
    refs["add-child-folder"].title = depth >= MAX_FOLDER_DEPTH ? "폴더는 3계층까지 만들 수 있어요." : "";
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
    label: `${item.title} ${index ? `추가 파일 ${index + 1}` : "메인 파일"}.zip`,
    detail: `${18 + (sampleNumber * 7) + (index * 13)} MB`,
    url: `https://booth.pm/downloadables/${9_000_000 + (sampleNumber * 20) + index}?variation_id=${sampleNumber}`,
  }));
}

function createDownloadBack(item, downloadState) {
  const back = element("section", {
    className: "item-card-face item-card-back",
    attrs: {
      "aria-label": `${item.title} 다운로드 옵션`,
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
    text: "←",
    attrs: {
      type: "button",
      "data-download-close": item.key,
      "aria-label": "상품 카드로 돌아가기",
    },
  });
  header.append(headingCopy, closeButton);

  const body = element("div", {
    className: "download-back-body",
    attrs: { "aria-live": "polite" },
  });

  if (downloadState.status === "loading") {
    const loading = element("div", { className: "download-state" });
    loading.append(
      element("span", { className: "download-spinner", attrs: { "aria-hidden": "true" } }),
      element("strong", { text: "다운로드 목록 불러오는 중" }),
      element("p", { text: "BOOTH에서 최신 파일 정보를 확인하고 있어요." }),
    );
    body.append(loading);
  } else if (downloadState.status === "error") {
    const failed = element("div", { className: "download-state download-error-state" });
    failed.append(
      element("span", { className: "download-error-mark", text: "!", attrs: { "aria-hidden": "true" } }),
      element("strong", { text: "다운로드 목록을 불러오지 못했어요" }),
      element("p", { text: downloadState.error || "잠시 후 다시 시도해 주세요." }),
    );
    const retry = element("button", {
      className: "download-retry-button",
      text: "다시 시도",
      attrs: { type: "button", "data-download-retry": item.key },
    });
    failed.append(retry);
    if (item.productUrl) {
      failed.append(element("a", {
        className: "download-product-link",
        text: "상품 상세 페이지 열기 ↗",
        attrs: {
          href: item.productUrl,
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }));
    }
    body.append(failed);
  } else if (downloadState.status === "ready") {
    body.append(element("p", {
      className: "download-list-summary",
      text: `${formatCount(downloadState.options.length)}개의 파일 · 누르면 바로 다운로드`,
    }));
    const list = element("div", {
      className: "download-option-list",
      attrs: { role: "list", "aria-label": "다운로드할 파일" },
    });
    downloadState.options.forEach((option, optionIndex) => {
      const button = element("button", {
        className: "download-option",
        attrs: {
          type: "button",
          role: "listitem",
          "data-download-key": item.key,
          "data-download-option-index": optionIndex,
          "aria-label": `${option.label}${option.detail ? `, ${option.detail}` : ""} 다운로드`,
        },
      });
      const copy = element("span", { className: "download-option-copy" });
      copy.append(
        element("strong", { text: option.label, attrs: { title: option.label } }),
        element("small", { text: option.detail || "BOOTH 다운로드" }),
      );
      button.append(
        element("span", { className: "download-file-index", text: String(optionIndex + 1).padStart(2, "0"), attrs: { "aria-hidden": "true" } }),
        copy,
        element("span", { className: "download-option-arrow", text: "↓", attrs: { "aria-hidden": "true" } }),
      );
      list.append(button);
    });
    body.append(list);
  } else {
    const idle = element("div", { className: "download-state" });
    idle.append(element("p", { text: "다운로드하기를 누르면 파일 목록을 확인합니다." }));
    body.append(idle);
  }

  back.append(header, body);
  return back;
}

function createCard(item, index) {
  const downloadState = getDownloadCardState(item.key);
  const card = element("article", {
    className: `item-card${downloadState.flipped ? " is-flipped" : ""}`,
    attrs: {
      "data-item-key": item.key,
      draggable: downloadState.flipped ? "false" : "true",
      "aria-grabbed": "false",
      title: downloadState.flipped ? null : "폴더로 끌어 놓아 정리",
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

  visual.append(element("span", {
    className: `source-badge source-${item.source}`,
    text: item.source === "gift" ? "GIFT" : "BOUGHT",
  }));

  const content = element("div", { className: "item-content" });
  const seller = element("p", { className: "item-seller", text: item.sellerName || "알 수 없는 판매자" });
  const title = item.productUrl
    ? element("a", {
      className: "item-title",
      text: item.title,
      attrs: {
        href: item.productUrl,
        target: "_blank",
        rel: "noopener noreferrer",
        draggable: "false",
        "aria-label": `${item.title} 상품 상세 페이지 열기`,
      },
    })
    : element("span", { className: "item-title item-title-disabled", text: item.title });
  const revealButton = element("button", {
    className: "download-reveal-button",
    attrs: {
      type: "button",
      "data-download-reveal": item.key,
      "aria-label": `${item.title} 다운로드 옵션 보기`,
    },
  });
  revealButton.append(
    element("span", { className: "download-reveal-icon", text: "↓", attrs: { "aria-hidden": "true" } }),
    element("span", { text: "다운로드하기" }),
    element("span", { className: "download-reveal-arrow", text: "›", attrs: { "aria-hidden": "true" } }),
  );
  content.append(seller, title, revealButton);

  const assignedFolderId = state.assignments[item.key];
  if (assignedFolderId) {
    const path = getFolderPath(state.folders, assignedFolderId);
    if (path.length) {
      content.append(element("p", {
        className: "folder-chip",
        text: path.map((folder) => folder.name).join(" / "),
        attrs: { title: path.map((folder) => folder.name).join(" / ") },
      }));
    }
  }

  const actions = element("div", { className: "item-actions" });
  const assignButton = element("button", {
    className: "organize-button",
    text: assignedFolderId ? "폴더 변경" : "폴더에 넣기",
    attrs: { type: "button", "data-assign-key": item.key },
  });
  const isFavorite = state.favorites.includes(item.key);
  const favoriteButton = element("button", {
    className: `favorite-button${isFavorite ? " is-favorite" : ""}`,
    text: isFavorite ? "★" : "☆",
    attrs: {
      type: "button",
      "data-favorite-key": item.key,
      "aria-label": isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가",
      "aria-pressed": String(isFavorite),
    },
  });
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

function createItemDragPreview(item) {
  const preview = element("div", { className: "item-drag-preview" });
  const copy = element("span", { className: "item-drag-preview-copy" });
  copy.append(
    element("strong", { text: item.title }),
    element("small", { text: "폴더로 이동" }),
  );
  preview.append(
    element("span", { className: "item-drag-preview-icon", text: "▰", attrs: { "aria-hidden": "true" } }),
    copy,
  );
  document.body.append(preview);
  return preview;
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
  const draggedItemKey = itemDrag.itemKey;
  const shouldCloseSidebar = itemDrag.openedSidebar;
  if (draggedItemKey) {
    const card = findRenderedCard(draggedItemKey);
    card?.classList.remove("is-dragging");
    card?.setAttribute("aria-grabbed", "false");
    itemDrag.suppressClickUntil = Date.now() + DRAG_CLICK_SUPPRESSION_MS;
  }
  setFolderDropTarget(null);
  document.body.classList.remove("is-item-dragging");
  refs["folder-drop-hint"].textContent = "카드를 폴더에 끌어 놓아 분류";
  itemDrag.itemKey = null;
  itemDrag.blockedByControl = false;
  itemDrag.openedSidebar = false;
  if (shouldCloseSidebar) {
    window.setTimeout(closeSidebar, dropped ? 460 : 0);
  }
}

function startItemDrag(event) {
  const card = event.target instanceof Element
    ? event.target.closest(".item-card[data-item-key]")
    : null;
  if (!card || itemDrag.blockedByControl || card.classList.contains("is-flipped") || !event.dataTransfer) {
    event.preventDefault();
    return;
  }

  const item = findItem(card.dataset.itemKey);
  if (!item) {
    event.preventDefault();
    return;
  }

  clearFolderDropSuccess();
  itemDrag.itemKey = item.key;
  itemDrag.openedSidebar = false;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(ITEM_DRAG_MIME, item.key);
  event.dataTransfer.setData("text/plain", item.title);

  const preview = createItemDragPreview(item);
  event.dataTransfer.setDragImage(preview, 22, 22);
  window.setTimeout(() => preview.remove(), 0);

  card.classList.add("is-dragging");
  card.setAttribute("aria-grabbed", "true");
  document.body.classList.add("is-item-dragging");
  refs["folder-drop-hint"].textContent = "놓을 폴더를 선택하세요";

  if (window.matchMedia("(max-width: 980px)").matches
    && !document.body.classList.contains("sidebar-visible")) {
    itemDrag.openedSidebar = true;
    openSidebar();
  }
}

function handleFolderDragOver(event) {
  if (!itemDrag.itemKey) return;
  const target = getFolderDropTarget(event.target);
  if (!target) {
    setFolderDropTarget(null);
    return;
  }
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  setFolderDropTarget(target);
}

async function handleFolderDrop(event) {
  const target = getFolderDropTarget(event.target);
  const transferredItemKey = event.dataTransfer?.getData(ITEM_DRAG_MIME);
  const itemKey = itemDrag.itemKey || transferredItemKey;
  if (!target || !itemKey) return;

  event.preventDefault();
  event.stopPropagation();
  const folderId = target.dataset.dropFolderId || null;
  finishItemDrag({ dropped: true });

  try {
    await updateItemFolderAssignment(itemKey, folderId, { fromDrop: true });
  } catch (error) {
    showToast(`상품을 옮기지 못했어요: ${error.message}`, "error");
  }
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
  card.draggable = !flipped;
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
        const error = new Error("다운로드 목록을 읽으려면 BOOTH 계정 페이지 접근을 허용해 주세요.");
        error.code = "PERMISSION_REQUIRED";
        throw error;
      }
      options = await loadBoothDownloadOptions(item);
    }

    if (downloadCardStates.get(itemKey) !== downloadState) return;
    downloadState.status = "ready";
    downloadState.options = options;
  } catch (error) {
    if (downloadCardStates.get(itemKey) !== downloadState) return;
    downloadState.status = "error";
    downloadState.error = error.message || "잠시 후 다시 시도해 주세요.";
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
  if (arrow) arrow.textContent = "…";

  try {
    if (IS_DEMO) {
      await new Promise((resolve) => window.setTimeout(resolve, 280));
      showToast("미리보기에서는 실제 파일을 다운로드하지 않아요.");
    } else {
      startBoothDownload(option.url);
      showToast(`${option.label} 다운로드를 시작했어요.`);
    }
  } catch (error) {
    showToast(`다운로드를 시작하지 못했어요: ${error.message}`, "error");
  } finally {
    button.disabled = false;
    button.classList.remove("is-starting");
    if (arrow) arrow.textContent = "↓";
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
  return sortItems(filtered, ui.sort);
}

function hasActiveFilter() {
  return Boolean(ui.query)
    || ui.searchField !== "all"
    || ui.source !== "all"
    || ui.folderId !== "all"
    || ui.favoritesOnly
    || ui.sort !== "purchase";
}

function renderItems() {
  const results = currentResults();
  const visible = results.slice(0, ui.visibleLimit);
  refs["item-grid"].replaceChildren(...visible.map(createCard));

  refs["result-summary"].replaceChildren(
    element("strong", { text: formatCount(results.length) }),
    document.createTextNode("개의 상품"),
  );
  refs["clear-filter"].hidden = !hasActiveFilter();
  refs["load-more-wrap"].hidden = results.length <= visible.length;

  const noStoredItems = state.items.length === 0;
  const noResults = !noStoredItems && results.length === 0;
  refs["empty-state"].hidden = !(noStoredItems || noResults);
  refs["item-grid"].hidden = noStoredItems || noResults;

  if (noStoredItems) {
    refs["empty-title"].textContent = "라이브러리를 불러와 주세요";
    refs["empty-description"].textContent = "BOOTH에 로그인한 뒤 전체 동기화를 누르면 구매 상품과 기프트를 읽어옵니다.";
    refs["empty-sync-button"].hidden = false;
    refs["empty-login-link"].hidden = false;
  } else if (noResults) {
    refs["empty-title"].textContent = "조건에 맞는 상품이 없어요";
    refs["empty-description"].textContent = "검색어나 필터를 바꾸면 다른 상품을 찾을 수 있어요.";
    refs["empty-sync-button"].hidden = true;
    refs["empty-login-link"].hidden = true;
  }
}

function renderHeader() {
  const copy = getViewCopy();
  refs["view-eyebrow"].textContent = copy.eyebrow;
  refs["view-title"].textContent = copy.title;
  refs["view-description"].textContent = copy.description;
  refs["last-sync"].textContent = IS_DEMO ? "미리보기 데이터" : formatSyncTime(state.lastSyncedAt);
  refs["sort-select"].value = ui.sort;
  refs["search-field"].value = ui.searchField;
  if (refs["search-input"].value !== ui.query) refs["search-input"].value = ui.query;
}

function render() {
  renderNavigation();
  renderFolders();
  renderHeader();
  renderItems();
}

function scheduleRender() {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(render, 90);
}

function setSource(source) {
  ui.source = source;
  ui.favoritesOnly = false;
  ui.folderId = "all";
  ui.selectedFolderId = null;
  resetResultWindow();
  closeSidebar();
  render();
}

function selectFolder(folderId) {
  ui.folderId = folderId;
  ui.selectedFolderId = folderId === "all" || folderId === "unfiled" ? null : folderId;
  ui.favoritesOnly = false;
  resetResultWindow();
  closeSidebar();
  render();
}

function clearFilters() {
  Object.assign(ui, {
    source: "all",
    folderId: "all",
    favoritesOnly: false,
    query: "",
    searchField: "all",
    sort: "purchase",
    selectedFolderId: null,
    visibleLimit: PAGE_SIZE,
  });
  render();
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
  const keys = new Set(items.map((item) => item.key));
  state = {
    ...state,
    items,
    lastSyncedAt: syncedAt,
    favorites: state.favorites.filter((key) => keys.has(key)),
    assignments: Object.fromEntries(
      Object.entries(state.assignments).filter(([key, folderId]) => (
        keys.has(key) && (!folderId || state.folders.some((folder) => folder.id === folderId))
      )),
    ),
  };
}

async function runDemoSync() {
  const phases = [
    [18, "구매 목록 확인 중"],
    [46, "라이브러리 페이지 읽는 중"],
    [72, "기프트함 읽는 중"],
    [100, "미리보기 데이터를 불러왔어요"],
  ];
  for (const [percent, message] of phases) {
    setSyncPanel({ message, detail: `${percent}%`, percent });
    await new Promise((resolve) => window.setTimeout(resolve, 240));
  }
}

async function syncLibrary() {
  if (ui.syncing) return;
  if (ui.calculatingSpending) {
    showToast("빨간약 계산이 끝난 뒤 동기화해 주세요.", "error");
    return;
  }
  ui.syncing = true;
  refs["sync-button"].disabled = true;
  refs["red-pill-button"].disabled = true;
  refs["clear-local-data"].disabled = true;
  refs["sync-button"].classList.add("is-syncing");
  setSyncPanel({ message: "라이브러리 연결 중", detail: "BOOTH 로그인 상태를 확인하고 있어요.", percent: 5 });

  try {
    if (!IS_DEMO) {
      const permissionGranted = await requestBoothAccess();
      if (!permissionGranted) {
        const error = new Error("라이브러리를 읽으려면 BOOTH 계정 페이지 접근을 허용해 주세요.");
        error.code = "PERMISSION_REQUIRED";
        throw error;
      }
    }

    await runWithStateLock(async () => {
      if (IS_DEMO) {
        await runDemoSync();
        showToast("미리보기 동기화를 완료했어요.");
        return;
      }

      const result = await syncBoothLibrary(({ message, completed, total }) => {
        const percent = total ? Math.round((completed / total) * 100) : 8;
        setSyncPanel({ message, detail: total ? `${completed} / ${total} 페이지` : "", percent });
      });
      mergeSyncedItems(result.items, result.syncedAt);
      await persistState({ alreadyLocked: true });
      resetResultWindow();
      render();
      setSyncPanel({
        message: "동기화가 끝났어요",
        detail: `${formatCount(result.items.length)}개 상품을 이 기기에 저장했습니다.`,
        percent: 100,
        tone: "success",
      });
      window.setTimeout(() => setSyncPanel({ hidden: true }), 4200);
      showToast("라이브러리를 최신 상태로 업데이트했어요.");
    });
  } catch (error) {
    const authError = error instanceof BoothAuthError || error?.code === "AUTH_REQUIRED";
    const busyError = error?.code === "STATE_BUSY";
    const permissionError = error?.code === "PERMISSION_REQUIRED";
    setSyncPanel({
      message: authError
        ? "BOOTH 로그인이 필요해요"
        : permissionError
          ? "BOOTH 접근 권한이 필요해요"
        : busyError
          ? "다른 창에서 작업 중이에요"
          : "동기화하지 못했어요",
      detail: authError
        ? "같은 브라우저 프로필에서 BOOTH에 로그인한 뒤 다시 시도해 주세요."
        : permissionError
          ? "전체 동기화를 다시 누르고 계정 페이지 읽기 권한을 허용해 주세요."
        : busyError
          ? "진행 중인 작업이 끝난 뒤 다시 시도해 주세요."
          : (error.message || "잠시 후 다시 시도해 주세요."),
      percent: 100,
      tone: busyError || permissionError ? "default" : "error",
      login: authError,
    });
  } finally {
    ui.syncing = false;
    refs["sync-button"].disabled = false;
    refs["red-pill-button"].disabled = false;
    refs["clear-local-data"].disabled = false;
    refs["sync-button"].classList.remove("is-syncing");
  }
}

function openDataDeleteConfirmation() {
  if (ui.syncing || ui.calculatingSpending) {
    showToast("진행 중인 작업이 끝난 뒤 데이터를 삭제해 주세요.", "error");
    return;
  }
  refs["data-delete-dialog"].showModal();
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
    applyTheme(preferences.theme);
    downloadCardStates.clear();
    refs["data-delete-dialog"].close();
    setSyncPanel({ hidden: true });
    clearFilters();
    showToast("이 기기에 저장된 BOOTH Shelf 데이터를 모두 삭제했어요.");
  } catch (error) {
    showToast(error?.code === "STATE_BUSY"
      ? "다른 창의 작업이 끝난 뒤 다시 시도해 주세요."
      : `데이터를 삭제하지 못했어요: ${error.message}`, "error");
  } finally {
    submitButton.disabled = false;
  }
}

function populateParentSelect(mode) {
  const selected = getSelectedFolder();
  const select = refs["folder-parent-select"];
  select.replaceChildren();

  const options = [{ id: "", label: "최상위" }];
  for (const folder of state.folders) {
    const path = getFolderPath(state.folders, folder.id);
    const allowed = mode === "move"
      ? canMoveFolder(state.folders, selected.id, folder.id)
      : folderDepth(state.folders, folder.id) < MAX_FOLDER_DEPTH;
    if (allowed) options.push({ id: folder.id, label: path.map((entry) => entry.name).join(" / ") });
  }

  for (const optionData of options) {
    select.append(element("option", {
      text: optionData.label,
      attrs: { value: optionData.id },
    }));
  }
}

function openFolderDialog(mode) {
  const selected = getSelectedFolder();
  ui.folderDialogMode = mode;
  refs["folder-form-error"].textContent = "";

  const isMove = mode === "move";
  const isRename = mode === "rename";
  refs["folder-name-field"].hidden = isMove;
  refs["folder-parent-field"].hidden = !isMove;
  refs["folder-name-input"].required = !isMove;
  refs["folder-name-input"].value = isRename ? selected?.name || "" : "";
  refs["folder-dialog-title"].textContent = isMove
    ? "폴더 이동"
    : isRename
      ? "폴더 이름 변경"
      : "새 폴더";
  refs["folder-submit"].textContent = isMove ? "이동" : "저장";

  if (isMove) {
    populateParentSelect(mode);
    refs["folder-parent-select"].value = selected?.parentId || "";
  }

  refs["folder-dialog"].showModal();
  if (!isMove) window.setTimeout(() => refs["folder-name-input"].focus(), 0);
}

async function submitFolderForm(event) {
  event.preventDefault();
  const selected = getSelectedFolder();
  const mode = ui.folderDialogMode;

  try {
    if (mode === "add-root") {
      state.folders = createFolder(state.folders, { name: refs["folder-name-input"].value });
    } else if (mode === "add-child") {
      state.folders = createFolder(state.folders, {
        name: refs["folder-name-input"].value,
        parentId: selected.id,
      });
    } else if (mode === "rename") {
      state.folders = renameFolder(state.folders, selected.id, refs["folder-name-input"].value);
    } else if (mode === "move") {
      state.folders = moveFolder(state.folders, selected.id, refs["folder-parent-select"].value || null);
    }

    await persistState();
    refs["folder-dialog"].close();
    render();
    showToast(mode === "move" ? "폴더를 이동했어요." : "폴더를 저장했어요.");
  } catch (error) {
    refs["folder-form-error"].textContent = error.message;
  }
}

function openAssignDialog(itemKey) {
  const item = state.items.find((candidate) => candidate.key === itemKey);
  if (!item) return;
  ui.assigningItemKey = itemKey;
  refs["assign-item-name"].textContent = item.title;
  refs["assign-folder-select"].replaceChildren(
    element("option", { text: "미분류", attrs: { value: "" } }),
  );

  const orderedFolders = state.folders
    .map((folder) => ({ folder, path: getFolderPath(state.folders, folder.id) }))
    .sort((left, right) => left.path.map((entry) => entry.name).join("/").localeCompare(
      right.path.map((entry) => entry.name).join("/"),
      ["ko", "ja", "en"],
      { numeric: true },
    ));

  for (const { folder, path } of orderedFolders) {
    refs["assign-folder-select"].append(element("option", {
      text: path.map((entry) => entry.name).join(" / "),
      attrs: { value: folder.id },
    }));
  }
  refs["assign-folder-select"].value = state.assignments[itemKey] || "";
  refs["assign-dialog"].showModal();
}

async function updateItemFolderAssignment(itemKey, folderId, { fromDrop = false } = {}) {
  const item = findItem(itemKey);
  if (!item) throw new Error("상품을 찾을 수 없어요.");

  const normalizedFolderId = folderId || null;
  const previousFolderId = state.assignments[itemKey] || null;
  const folderPath = normalizedFolderId ? getFolderPath(state.folders, normalizedFolderId) : [];
  const folderLabel = normalizedFolderId
    ? folderPath.map((folder) => folder.name).join(" / ")
    : "미분류";

  if (previousFolderId === normalizedFolderId) {
    if (fromDrop) markFolderDropSuccess(normalizedFolderId);
    render();
    showToast(`이미 ${folderLabel}에 들어 있어요.`);
    return false;
  }

  state.assignments = setItemFolderAssignment(
    state.items,
    state.folders,
    state.assignments,
    itemKey,
    normalizedFolderId,
  );
  await persistState();
  if (fromDrop) markFolderDropSuccess(normalizedFolderId);
  render();
  showToast(normalizedFolderId
    ? `${folderLabel} 폴더로 옮겼어요.`
    : "상품을 미분류로 옮겼어요.");
  return true;
}

async function submitAssignment(event) {
  event.preventDefault();
  const folderId = refs["assign-folder-select"].value;
  try {
    await updateItemFolderAssignment(ui.assigningItemKey, folderId);
    refs["assign-dialog"].close();
  } catch (error) {
    showToast(`상품을 옮기지 못했어요: ${error.message}`, "error");
  }
}

function openDeleteConfirmation() {
  const selected = getSelectedFolder();
  if (!selected) return;
  const childCount = state.folders.filter((folder) => folder.parentId === selected.id).length;
  refs["confirm-copy"].textContent = childCount
    ? `“${selected.name}” 폴더를 삭제합니다. 하위 폴더 ${childCount}개와 이 폴더의 상품은 한 단계 위로 이동해요.`
    : `“${selected.name}” 폴더를 삭제합니다. 이 폴더의 상품은 한 단계 위로 이동해요.`;
  refs["confirm-dialog"].showModal();
}

async function confirmDelete(event) {
  event.preventDefault();
  const selected = getSelectedFolder();
  if (!selected) return;
  const parentId = selected.parentId ?? "all";
  const result = deleteFolderAndPromote(state.folders, state.assignments, selected.id);
  state.folders = result.folders;
  state.assignments = result.assignments;
  ui.folderId = parentId;
  ui.selectedFolderId = parentId === "all" ? null : parentId;
  await persistState();
  refs["confirm-dialog"].close();
  render();
  showToast("폴더를 삭제했어요.");
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

function bindEvents() {
  refs["theme-toggle"].addEventListener("click", toggleTheme);
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
    resetResultWindow();
    closeSidebar();
    render();
  });

  refs["all-folders"].addEventListener("click", () => selectFolder("all"));
  refs["unfiled-folder"].addEventListener("click", () => selectFolder("unfiled"));
  refs["folder-tree"].addEventListener("click", (event) => {
    const button = event.target.closest("[data-folder-id]");
    if (button) selectFolder(button.dataset.folderId);
  });

  refs["item-grid"].addEventListener("pointerdown", (event) => {
    itemDrag.blockedByControl = isInteractiveDragOrigin(event.target);
  });
  refs["item-grid"].addEventListener("pointerup", () => {
    if (!itemDrag.itemKey) itemDrag.blockedByControl = false;
  });
  refs["item-grid"].addEventListener("pointercancel", () => {
    if (!itemDrag.itemKey) itemDrag.blockedByControl = false;
  });
  refs["item-grid"].addEventListener("dragstart", startItemDrag);
  refs["item-grid"].addEventListener("dragend", () => finishItemDrag());
  refs.sidebar.addEventListener("dragover", handleFolderDragOver);
  refs.sidebar.addEventListener("drop", (event) => {
    void handleFolderDrop(event);
  });

  refs["add-root-folder"].addEventListener("click", () => openFolderDialog("add-root"));
  refs["add-child-folder"].addEventListener("click", () => openFolderDialog("add-child"));
  refs["rename-folder"].addEventListener("click", () => openFolderDialog("rename"));
  refs["move-folder"].addEventListener("click", () => openFolderDialog("move"));
  refs["delete-folder"].addEventListener("click", openDeleteConfirmation);
  refs["clear-local-data"].addEventListener("click", openDataDeleteConfirmation);

  refs["search-input"].addEventListener("input", (event) => {
    ui.query = event.target.value;
    resetResultWindow();
    scheduleRender();
  });
  refs["search-field"].addEventListener("change", (event) => {
    ui.searchField = event.target.value;
    resetResultWindow();
    render();
  });
  refs["sort-select"].addEventListener("change", (event) => {
    ui.sort = event.target.value;
    resetResultWindow();
    render();
  });

  refs["sync-button"].addEventListener("click", syncLibrary);
  refs["empty-sync-button"].addEventListener("click", syncLibrary);
  refs["clear-filter"].addEventListener("click", clearFilters);
  refs["load-more"].addEventListener("click", () => {
    ui.visibleLimit += PAGE_SIZE;
    renderItems();
  });

  refs["item-grid"].addEventListener("click", (event) => {
    if (Date.now() < itemDrag.suppressClickUntil) {
      event.preventDefault();
      event.stopPropagation();
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
      toggleFavorite(favoriteButton.dataset.favoriteKey);
      return;
    }
    const assignButton = event.target.closest("[data-assign-key]");
    if (assignButton) openAssignDialog(assignButton.dataset.assignKey);
  });

  refs["folder-form"].addEventListener("submit", submitFolderForm);
  refs["assign-form"].addEventListener("submit", submitAssignment);
  refs["confirm-form"].addEventListener("submit", confirmDelete);
  refs["data-delete-form"].addEventListener("submit", confirmDataDelete);

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
    if (event.key === "Escape") closeSidebar();
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
        resetResultWindow();
        render();
      }
      if (Object.hasOwn(changes, PREFERENCES_KEY)) {
        preferences = await loadPreferences();
        applyTheme(preferences.theme);
      }
      if (Object.hasOwn(changes, SPENDING_SUMMARY_KEY)) {
        spendingSummary = await loadSpendingSummary();
        if (spendingSummary && refs["red-pill-dialog"].open) {
          renderSpendingSummary(spendingSummary);
        }
      }
    } catch (error) {
      showToast(`다른 창의 변경사항을 불러오지 못했어요: ${error.message}`, "error");
    }
  });
}

async function init() {
  if (IS_DEMO) {
    state = demoState();
    preferences = await loadPreferences();
    spendingSummary = null;
    refs["clear-local-data"].hidden = true;
  } else {
    await restrictStorageAccess();
    [state, preferences, spendingSummary] = await Promise.all([
      loadState(),
      loadPreferences(),
      loadSpendingSummary(),
    ]);
  }
  applyTheme(preferences.theme);
  bindEvents();
  bindStorageChanges();
  render();
}

init().catch((error) => {
  refs["empty-state"].hidden = false;
  refs["empty-title"].textContent = "화면을 시작하지 못했어요";
  refs["empty-description"].textContent = error.message || "확장프로그램을 다시 열어 주세요.";
  refs["empty-sync-button"].hidden = true;
});
