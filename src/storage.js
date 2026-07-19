import {
  sanitizeImageUrl,
  sanitizeProductUrl,
  sanitizeSellerUrl,
  sanitizeSourcePageUrl,
} from "./urls.js";

export const STORAGE_KEY = "boothShelfState";
export const PREFERENCES_KEY = "boothShelfPreferences";
export const SPENDING_SUMMARY_KEY = "boothShelfSpendingSummary";

const MAX_STORED_ITEMS = 50_000;
const MAX_STORED_FOLDERS = 2_000;
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const BLOCKED_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export const DEFAULT_STATE = Object.freeze({
  schemaVersion: 1,
  items: [],
  folders: [],
  favorites: [],
  assignments: {},
  lastSyncedAt: null,
});

function cloneDefaultState() {
  return {
    ...DEFAULT_STATE,
    items: [],
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
    theme: preferences.theme === "dark" ? "dark" : "light",
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

function sanitizeItem(value) {
  if (!isRecord(value)) return null;

  const source = value.source === "gift" ? "gift" : value.source === "purchased" ? "purchased" : null;
  const productId = cleanString(value.productId, 64);
  if (!source || !/^(?:\d+|demo-\d+)$/.test(productId)) return null;

  const title = cleanString(value.title, 500);
  if (!title) return null;

  const page = positiveInteger(value.page);
  return {
    key: `${source}:${productId}`,
    productId,
    source,
    title,
    sellerName: cleanString(value.sellerName, 300, "알 수 없는 판매자"),
    sellerUrl: sanitizeSellerUrl(value.sellerUrl),
    imageUrl: sanitizeImageUrl(value.imageUrl, productId),
    productUrl: sanitizeProductUrl(value.productUrl, productId),
    sourcePageUrl: sanitizeSourcePageUrl(value.sourcePageUrl, source, page),
    page,
    orderOnPage: nonNegativeInteger(value.orderOnPage),
    globalOrder: nonNegativeInteger(value.globalOrder),
  };
}

function sanitizeItems(value) {
  if (!Array.isArray(value)) return [];
  const uniqueItems = new Map();

  for (const candidate of value.slice(0, MAX_STORED_ITEMS)) {
    const item = sanitizeItem(candidate);
    if (item && !uniqueItems.has(item.key)) uniqueItems.set(item.key, item);
  }
  return [...uniqueItems.values()];
}

function sanitizeFolders(value) {
  if (!Array.isArray(value)) return [];
  const folders = [];
  const seen = new Set();

  for (const candidate of value.slice(0, MAX_STORED_FOLDERS)) {
    if (!isRecord(candidate) || !isSafeId(candidate.id) || seen.has(candidate.id)) continue;
    const name = cleanString(candidate.name, 40);
    if (!name) continue;

    seen.add(candidate.id);
    folders.push({
      id: candidate.id,
      name,
      parentId: isSafeId(candidate.parentId) ? candidate.parentId : null,
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
  }

  return folders;
}

export function sanitizeState(value) {
  const state = isRecord(value) ? value : {};
  const items = sanitizeItems(state.items);
  const folders = sanitizeFolders(state.folders);
  const itemKeys = new Set(items.map((item) => item.key));
  const folderIds = new Set(folders.map((folder) => folder.id));

  const favorites = [];
  const seenFavorites = new Set();
  if (Array.isArray(state.favorites)) {
    for (const key of state.favorites) {
      if (typeof key !== "string" || !itemKeys.has(key) || seenFavorites.has(key)) continue;
      seenFavorites.add(key);
      favorites.push(key);
    }
  }

  const assignments = {};
  if (isRecord(state.assignments)) {
    for (const [key, folderId] of Object.entries(state.assignments)) {
      if (itemKeys.has(key) && folderIds.has(folderId)) assignments[key] = folderId;
    }
  }

  return {
    ...cloneDefaultState(),
    items,
    folders,
    favorites,
    assignments,
    lastSyncedAt: cleanDate(state.lastSyncedAt),
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
