import {
  sanitizeImageUrl,
  sanitizeProductUrl,
  sanitizeSellerUrl,
  sanitizeSourcePageUrl,
} from "./urls.js";

export const STORAGE_KEY = "boothShelfState";
export const PREFERENCES_KEY = "boothShelfPreferences";
export const SPENDING_SUMMARY_KEY = "boothShelfSpendingSummary";
export const ORGANIZATION_BACKUP_FORMAT = "booth-shelf-organization";
export const ORGANIZATION_BACKUP_VERSION = 3;

const MAX_STORED_ITEMS = 50_000;
const MAX_ITEM_LOCATIONS = 256;
const MAX_DOWNLOAD_FILES_PER_ITEM = 512;
const MAX_SUPPORTED_AVATARS_PER_ITEM = 128;
const MAX_FOLDER_ASSIGNMENTS_PER_ITEM = 64;
const MAX_STORED_FOLDERS = 2_000;
const MAX_STORED_CATEGORIES = 200;
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const BLOCKED_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const ITEM_SOURCES = Object.freeze(["purchased", "gift", "free"]);
const AVATAR_PROFILE_ID_PATTERN = /^[a-z0-9]{1,64}$/;

export const DEFAULT_STATE = Object.freeze({
  schemaVersion: 5,
  items: [],
  categories: [],
  folders: [],
  favorites: [],
  assignments: {},
  lastSyncedAt: null,
});

function cloneDefaultState() {
  return {
    ...DEFAULT_STATE,
    items: [],
    categories: [],
    folders: [],
    favorites: [],
    assignments: {},
  };
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value, maxLength, fallback = "") {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : fallback;
}

function nonNegativeInteger(value, fallback = 0) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function positiveInteger(value, fallback = 1) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function cleanDate(value) {
  if (typeof value !== "string" || value.length > 64) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function sanitizePreferences(value) {
  const preferences = isRecord(value) ? value : {};
  return {
    theme: ["light", "dark", "system"].includes(preferences.theme) ? preferences.theme : "light",
    locale: ["ko", "en", "ja"].includes(preferences.locale) ? preferences.locale : "auto",
  };
}

export function sanitizeSpendingSummary(value) {
  if (!isRecord(value)) return null;
  const scannedAt = cleanDate(value.scannedAt);
  if (!scannedAt || !isRecord(value.totals)) return null;

  const totals = {};
  for (const [currency, amount] of Object.entries(value.totals).slice(0, 8)) {
    if (!/^[A-Z]{3}$/.test(currency)) continue;
    if (!Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER) continue;
    totals[currency] = amount;
  }
  if (!Object.keys(totals).length) return null;

  return {
    totals,
    orderCount: nonNegativeInteger(value.orderCount),
    freeOrderCount: nonNegativeInteger(value.freeOrderCount),
    scannedAt,
  };
}

function isSafeId(value) {
  return typeof value === "string"
    && SAFE_ID_PATTERN.test(value)
    && !BLOCKED_OBJECT_KEYS.has(value);
}

function isItemSource(value) {
  return ITEM_SOURCES.includes(value);
}

function sourceOrder(source) {
  const index = ITEM_SOURCES.indexOf(source);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function sanitizeLocation(value, fallback = {}) {
  if (!isRecord(value)) return null;
  const source = isItemSource(value.source)
    ? value.source
    : isItemSource(fallback.source) ? fallback.source : null;
  if (!source) return null;

  const fallbackPage = positiveInteger(value.page, positiveInteger(fallback.page));
  const sourcePageUrl = sanitizeSourcePageUrl(
    value.sourcePageUrl || fallback.sourcePageUrl,
    source,
    fallbackPage,
  );
  const resolvedPage = Number.parseInt(new URL(sourcePageUrl).searchParams.get("page") || "1", 10);
  return {
    source,
    sourcePageUrl,
    page: positiveInteger(resolvedPage, fallbackPage),
    orderOnPage: nonNegativeInteger(value.orderOnPage, nonNegativeInteger(fallback.orderOnPage)),
    globalOrder: nonNegativeInteger(value.globalOrder, nonNegativeInteger(fallback.globalOrder)),
  };
}

function sortLocations(locations) {
  return locations.sort((left, right) => (
    sourceOrder(left.source) - sourceOrder(right.source)
    || left.page - right.page
    || left.orderOnPage - right.orderOnPage
  ));
}

function mergeLocations(...locationLists) {
  const merged = new Map();
  for (const location of locationLists.flat()) {
    if (!location) continue;
    const key = `${location.source}:${location.page}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...location });
    } else {
      existing.orderOnPage = Math.min(existing.orderOnPage, location.orderOnPage);
      existing.globalOrder = Math.min(existing.globalOrder, location.globalOrder);
    }
  }
  return sortLocations([...merged.values()].slice(0, MAX_ITEM_LOCATIONS));
}

function sanitizeDownloadFiles(value) {
  if (!Array.isArray(value)) return [];
  const files = new Map();

  for (const candidate of value.slice(0, MAX_DOWNLOAD_FILES_PER_ITEM)) {
    if (!isRecord(candidate)) continue;
    const label = cleanString(candidate.label, 240);
    const detail = cleanString(candidate.detail, 80);
    if (!label) continue;
    const key = `${label.toLocaleLowerCase()}|${detail.toLocaleLowerCase()}`;
    if (!files.has(key)) files.set(key, { label, detail });
  }

  return [...files.values()];
}

function sanitizeSupportedAvatarIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .slice(0, MAX_SUPPORTED_AVATARS_PER_ITEM)
    .map((entry) => cleanString(entry, 64).toLocaleLowerCase("en-US"))
    .filter((entry) => AVATAR_PROFILE_ID_PATTERN.test(entry)))];
}

function mergeDownloadFiles(...fileLists) {
  return sanitizeDownloadFiles(fileLists.flat());
}

function withPrimaryLocation(item) {
  const primary = item.locations[0];
  return {
    ...item,
    source: primary?.source || item.sources[0],
    sourcePageUrl: primary?.sourcePageUrl || "",
    page: primary?.page || 1,
    orderOnPage: primary?.orderOnPage || 0,
  };
}

function sanitizeItem(value) {
  if (!isRecord(value)) return null;

  const productId = cleanString(value.productId, 64);
  if (!/^(?:\d+|demo-\d+)$/.test(productId)) return null;

  const title = cleanString(value.title, 500);
  if (!title) return null;

  const legacySource = isItemSource(value.source) ? value.source : null;
  const rawLocations = Array.isArray(value.locations)
    ? value.locations.slice(0, MAX_ITEM_LOCATIONS)
    : [];
  const locations = rawLocations
    .map((location) => sanitizeLocation(location))
    .filter(Boolean);
  if (legacySource) {
    locations.push(sanitizeLocation(value, { source: legacySource }));
  }

  const sources = Array.from(new Set([
    ...(Array.isArray(value.sources) ? value.sources.filter(isItemSource) : []),
    ...locations.map((location) => location.source),
    legacySource,
  ].filter(Boolean))).sort((left, right) => sourceOrder(left) - sourceOrder(right));
  if (!sources.length) return null;

  const normalizedLocations = mergeLocations(locations);
  if (!normalizedLocations.length) {
    normalizedLocations.push(sanitizeLocation({}, {
      source: sources[0],
      sourcePageUrl: value.sourcePageUrl,
      page: value.page,
      orderOnPage: value.orderOnPage,
      globalOrder: value.globalOrder,
    }));
  }

  return withPrimaryLocation({
    key: `product:${productId}`,
    productId,
    sources,
    locations: normalizedLocations,
    title,
    sellerName: cleanString(value.sellerName, 300, "알 수 없는 판매자"),
    sellerUrl: sanitizeSellerUrl(value.sellerUrl),
    imageUrl: sanitizeImageUrl(value.imageUrl, productId),
    productUrl: sanitizeProductUrl(value.productUrl, productId),
    downloadFiles: sanitizeDownloadFiles(value.downloadFiles),
    supportedAvatarIds: sanitizeSupportedAvatarIds(value.supportedAvatarIds),
    supportIndexedAt: cleanDate(value.supportIndexedAt),
    supportIndexVersion: nonNegativeInteger(value.supportIndexVersion),
    globalOrder: nonNegativeInteger(value.globalOrder),
  });
}

function mergeItems(existing, incoming) {
  const sources = Array.from(new Set([...existing.sources, ...incoming.sources]))
    .sort((left, right) => sourceOrder(left) - sourceOrder(right));
  const locations = mergeLocations(existing.locations, incoming.locations);
  const preferIncomingSeller = existing.sellerName === "알 수 없는 판매자"
    && incoming.sellerName !== "알 수 없는 판매자";
  const existingSupportTime = Date.parse(existing.supportIndexedAt) || 0;
  const incomingSupportTime = Date.parse(incoming.supportIndexedAt) || 0;
  const supportSource = incomingSupportTime > existingSupportTime ? incoming : existing;

  return withPrimaryLocation({
    ...existing,
    sources,
    locations,
    sellerName: preferIncomingSeller ? incoming.sellerName : existing.sellerName,
    sellerUrl: existing.sellerUrl || incoming.sellerUrl,
    imageUrl: existing.imageUrl || incoming.imageUrl,
    productUrl: existing.productUrl || incoming.productUrl,
    downloadFiles: mergeDownloadFiles(existing.downloadFiles, incoming.downloadFiles),
    supportedAvatarIds: [...supportSource.supportedAvatarIds],
    supportIndexedAt: supportSource.supportIndexedAt,
    supportIndexVersion: supportSource.supportIndexVersion,
    globalOrder: Math.min(existing.globalOrder, incoming.globalOrder),
  });
}

function sanitizeItems(value) {
  if (!Array.isArray(value)) return [];
  const uniqueItems = new Map();

  for (const candidate of value.slice(0, MAX_STORED_ITEMS)) {
    const item = sanitizeItem(candidate);
    if (!item) continue;
    const existing = uniqueItems.get(item.key);
    uniqueItems.set(item.key, existing ? mergeItems(existing, item) : item);
  }
  return [...uniqueItems.values()];
}

function normalizeStoredItemKey(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^(?:product|purchased|gift|free):((?:\d+|demo-\d+))$/);
  return match ? `product:${match[1]}` : null;
}

function sanitizeCategories(value) {
  if (!Array.isArray(value)) return [];
  const categories = [];
  const seen = new Set();

  for (const candidate of value.slice(0, MAX_STORED_CATEGORIES)) {
    if (!isRecord(candidate) || !isSafeId(candidate.id) || seen.has(candidate.id)) continue;
    const name = cleanString(candidate.name, 40);
    if (!name) continue;
    seen.add(candidate.id);
    categories.push({
      id: candidate.id,
      name,
      order: nonNegativeInteger(candidate.order),
      collapsed: candidate.collapsed === true,
      createdAt: cleanDate(candidate.createdAt),
    });
  }

  return categories;
}

function sanitizeFolders(value, categories = []) {
  if (!Array.isArray(value)) return [];
  const folders = [];
  const seen = new Set();
  const categoryIds = new Set(categories.map((category) => category.id));

  for (const candidate of value.slice(0, MAX_STORED_FOLDERS)) {
    if (!isRecord(candidate) || !isSafeId(candidate.id) || seen.has(candidate.id)) continue;
    const name = cleanString(candidate.name, 40);
    if (!name) continue;

    seen.add(candidate.id);
    folders.push({
      id: candidate.id,
      name,
      parentId: isSafeId(candidate.parentId) ? candidate.parentId : null,
      categoryId: isSafeId(candidate.categoryId) ? candidate.categoryId : null,
      order: nonNegativeInteger(candidate.order),
      createdAt: cleanDate(candidate.createdAt),
    });
  }

  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  for (const folder of folders) {
    if (folder.parentId === folder.id || !byId.has(folder.parentId)) folder.parentId = null;

    const visited = new Set([folder.id]);
    let cursor = folder;
    let depth = 1;
    while (cursor.parentId) {
      if (visited.has(cursor.parentId) || depth >= 3) {
        folder.parentId = null;
        break;
      }
      visited.add(cursor.parentId);
      cursor = byId.get(cursor.parentId);
      if (!cursor) {
        folder.parentId = null;
        break;
      }
      depth += 1;
    }

    if (folder.parentId || !categoryIds.has(folder.categoryId)) folder.categoryId = null;
  }

  return folders;
}

export function sanitizeState(value) {
  const state = isRecord(value) ? value : {};
  const items = sanitizeItems(state.items);
  const categories = sanitizeCategories(state.categories);
  const folders = sanitizeFolders(state.folders, categories);
  const itemKeys = new Set(items.map((item) => item.key));
  const folderIds = new Set(folders.map((folder) => folder.id));

  const favorites = [];
  const seenFavorites = new Set();
  if (Array.isArray(state.favorites)) {
    for (const storedKey of state.favorites) {
      const key = normalizeStoredItemKey(storedKey);
      if (!key || !itemKeys.has(key) || seenFavorites.has(key)) continue;
      seenFavorites.add(key);
      favorites.push(key);
    }
  }

  const assignments = {};
  if (isRecord(state.assignments)) {
    for (const [storedKey, storedFolderIds] of Object.entries(state.assignments)) {
      const key = normalizeStoredItemKey(storedKey);
      if (!key || !itemKeys.has(key)) continue;
      const candidates = Array.isArray(storedFolderIds) ? storedFolderIds : [storedFolderIds];
      const nextFolderIds = assignments[key] ?? [];
      for (const folderId of candidates) {
        if (nextFolderIds.length >= MAX_FOLDER_ASSIGNMENTS_PER_ITEM) break;
        if (!folderIds.has(folderId) || nextFolderIds.includes(folderId)) continue;
        nextFolderIds.push(folderId);
      }
      if (nextFolderIds.length) assignments[key] = nextFolderIds;
    }
  }

  return {
    ...cloneDefaultState(),
    items,
    categories,
    folders,
    favorites,
    assignments,
    lastSyncedAt: cleanDate(state.lastSyncedAt),
  };
}

export function createOrganizationBackup(value, exportedAt = new Date()) {
  const state = sanitizeState(value);
  const timestamp = exportedAt instanceof Date
    ? (Number.isFinite(exportedAt.getTime()) ? exportedAt.toISOString() : null)
    : cleanDate(exportedAt);
  return {
    format: ORGANIZATION_BACKUP_FORMAT,
    version: ORGANIZATION_BACKUP_VERSION,
    exportedAt: timestamp || new Date().toISOString(),
    data: {
      categories: state.categories.map((category) => ({ ...category })),
      folders: state.folders.map((folder) => ({ ...folder })),
      favorites: [...state.favorites],
      assignments: Object.fromEntries(
        Object.entries(state.assignments).map(([itemKey, folderIds]) => [itemKey, [...folderIds]]),
      ),
    },
  };
}

export function restoreOrganizationBackup(currentValue, backupValue) {
  const supportedBackupVersions = [1, 2, ORGANIZATION_BACKUP_VERSION];
  if (!isRecord(backupValue)
    || backupValue.format !== ORGANIZATION_BACKUP_FORMAT
    || !supportedBackupVersions.includes(backupValue.version)
    || !isRecord(backupValue.data)
    || (backupValue.version >= 3 && !Array.isArray(backupValue.data.categories))
    || !Array.isArray(backupValue.data.folders)
    || !Array.isArray(backupValue.data.favorites)
    || !isRecord(backupValue.data.assignments)) {
    throw new Error("BOOTH Shelf 정리 데이터 백업 파일이 아닙니다.");
  }

  const currentState = sanitizeState(currentValue);
  const requestedFavorites = new Set(
    backupValue.data.favorites.map(normalizeStoredItemKey).filter(Boolean),
  );
  const requestedAssignments = new Set(
    Object.keys(backupValue.data.assignments).map(normalizeStoredItemKey).filter(Boolean),
  );
  if (!currentState.items.length && (requestedFavorites.size || requestedAssignments.size)) {
    throw new Error("상품 배치를 복원하려면 먼저 라이브러리를 전체 동기화해 주세요.");
  }

  const restoredState = sanitizeState({
    ...currentState,
    categories: backupValue.version >= 3 ? backupValue.data.categories : [],
    folders: backupValue.data.folders,
    favorites: backupValue.data.favorites,
    assignments: backupValue.data.assignments,
  });
  const requestedItemKeys = new Set([...requestedFavorites, ...requestedAssignments]);
  const restoredItemKeys = new Set([
    ...restoredState.favorites,
    ...Object.keys(restoredState.assignments),
  ]);
  return {
    state: restoredState,
    stats: {
      categoryCount: restoredState.categories.length,
      folderCount: restoredState.folders.length,
      favoriteCount: restoredState.favorites.length,
      assignmentCount: Object.values(restoredState.assignments)
        .reduce((count, folderIds) => count + folderIds.length, 0),
      skippedItemCount: [...requestedItemKeys]
        .filter((itemKey) => !restoredItemKeys.has(itemKey))
        .length,
    },
  };
}

function hasChromeStorage() {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}

let memoryState = cloneDefaultState();
let memoryPreferences = sanitizePreferences(null);
let memorySpendingSummary = null;

export async function loadState() {
  if (!hasChromeStorage()) return sanitizeState(memoryState);
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return sanitizeState(result[STORAGE_KEY]);
}

export async function saveState(state) {
  const sanitized = sanitizeState(state);
  if (!hasChromeStorage()) {
    memoryState = sanitized;
    return sanitized;
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: sanitized });
  return sanitized;
}

export async function loadPreferences() {
  if (!hasChromeStorage()) return sanitizePreferences(memoryPreferences);
  const result = await chrome.storage.local.get(PREFERENCES_KEY);
  return sanitizePreferences(result[PREFERENCES_KEY]);
}

export async function savePreferences(preferences) {
  const sanitized = sanitizePreferences(preferences);
  if (!hasChromeStorage()) {
    memoryPreferences = sanitized;
    return sanitized;
  }
  await chrome.storage.local.set({ [PREFERENCES_KEY]: sanitized });
  return sanitized;
}

export async function loadSpendingSummary() {
  if (!hasChromeStorage()) return sanitizeSpendingSummary(memorySpendingSummary);
  const result = await chrome.storage.local.get(SPENDING_SUMMARY_KEY);
  return sanitizeSpendingSummary(result[SPENDING_SUMMARY_KEY]);
}

export async function saveSpendingSummary(summary) {
  const sanitized = sanitizeSpendingSummary(summary);
  if (!sanitized) throw new Error("저장할 결제 합계 정보가 올바르지 않습니다.");
  if (!hasChromeStorage()) {
    memorySpendingSummary = sanitized;
    return sanitized;
  }
  await chrome.storage.local.set({ [SPENDING_SUMMARY_KEY]: sanitized });
  return sanitized;
}

export async function clearState() {
  memoryState = cloneDefaultState();
  memoryPreferences = sanitizePreferences(null);
  memorySpendingSummary = null;
  if (hasChromeStorage()) {
    await chrome.storage.local.remove([STORAGE_KEY, PREFERENCES_KEY, SPENDING_SUMMARY_KEY]);
  }
  return cloneDefaultState();
}

export async function restrictStorageAccess() {
  if (!hasChromeStorage() || typeof chrome.storage.local.setAccessLevel !== "function") return;
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
}

export function replaceMemoryState(state) {
  memoryState = sanitizeState(state);
}
