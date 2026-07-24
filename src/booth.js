import {
  BOOTH_ACCOUNTS_ORIGIN,
  buildOrderDetailUrl,
  buildOrdersPageUrl,
  buildSourcePageUrl,
  getBoothOrderId,
  getBoothProductId,
  isAllowedLibraryUrl,
  isAllowedOrdersUrl,
  sanitizeDownloadUrl,
  sanitizeImageUrl,
  sanitizeProductUrl,
  sanitizeSellerUrl,
  sanitizeSourcePageUrl,
} from "./urls.js";
import { formatLocalizedNumber, t } from "./i18n.js";

const RETRIABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_RETRY_DELAY_MS = 30_000;
const MIN_REQUEST_INTERVAL_MS = 300;
let nextRequestAt = 0;

export const SOURCES = Object.freeze([
  {
    id: "purchased",
    label: "구매",
    path: "/library",
  },
  {
    id: "gift",
    label: "기프트",
    path: "/library/gifts",
  },
  {
    id: "free",
    label: "무료",
    path: "/library/free_downloads",
  },
]);

function sourceOrder(source) {
  const index = SOURCES.findIndex((entry) => entry.id === source);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function itemLocation(item) {
  if (!SOURCES.some((entry) => entry.id === item?.source)) return null;
  const page = Number.isSafeInteger(item.page) && item.page > 0 ? item.page : 1;
  return {
    source: item.source,
    sourcePageUrl: item.sourcePageUrl || buildSourcePageUrl(item.source, page),
    page,
    orderOnPage: Number.isSafeInteger(item.orderOnPage) && item.orderOnPage >= 0
      ? item.orderOnPage
      : 0,
    globalOrder: Number.isSafeInteger(item.globalOrder) && item.globalOrder >= 0
      ? item.globalOrder
      : 0,
  };
}

function mergeDownloadFiles(...fileLists) {
  const files = new Map();
  for (const file of fileLists.flat()) {
    const label = String(file?.label || "").replace(/\s+/gu, " ").trim().slice(0, 240);
    const detail = String(file?.detail || "").replace(/\s+/gu, " ").trim().slice(0, 80);
    if (!label) continue;
    const key = `${label.toLocaleLowerCase()}|${detail.toLocaleLowerCase()}`;
    if (!files.has(key)) files.set(key, { label, detail });
  }
  return [...files.values()];
}

/**
 * BOOTH can list the same product once per owned avatar variation and in both
 * the purchase and gift libraries. Keep one UI item per product while retaining
 * every page on which its downloadable variations can be found.
 */
export function groupBoothLibraryItems(items) {
  const grouped = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const productId = String(item?.productId || "");
    if (!/^\d+$/.test(productId)) continue;

    const key = `product:${productId}`;
    let group = grouped.get(key);
    if (!group) {
      group = {
        ...item,
        key,
        productId,
        sources: [],
        locations: [],
        downloadFiles: mergeDownloadFiles(item.downloadFiles),
        globalOrder: Number.isSafeInteger(item.globalOrder) && item.globalOrder >= 0
          ? item.globalOrder
          : 0,
      };
      grouped.set(key, group);
    } else {
      group.globalOrder = Math.min(
        group.globalOrder,
        Number.isSafeInteger(item.globalOrder) && item.globalOrder >= 0
          ? item.globalOrder
          : group.globalOrder,
      );
      if ((!group.imageUrl || group.sellerName === "알 수 없는 판매자") && item.imageUrl) {
        group.imageUrl = item.imageUrl;
      }
      if ((!group.sellerUrl || group.sellerName === "알 수 없는 판매자") && item.sellerUrl) {
        group.sellerUrl = item.sellerUrl;
        group.sellerName = item.sellerName || group.sellerName;
      }
      group.downloadFiles = mergeDownloadFiles(group.downloadFiles, item.downloadFiles);
    }

    const candidateSources = Array.isArray(item.sources) ? item.sources : [item.source];
    for (const source of candidateSources) {
      if (SOURCES.some((entry) => entry.id === source) && !group.sources.includes(source)) {
        group.sources.push(source);
      }
    }

    const candidateLocations = Array.isArray(item.locations) && item.locations.length
      ? item.locations
      : [itemLocation(item)];
    for (const candidate of candidateLocations) {
      const location = itemLocation({
        ...candidate,
        globalOrder: Number.isSafeInteger(candidate?.globalOrder)
          ? candidate.globalOrder
          : item.globalOrder,
      });
      if (!location) continue;
      if (!group.sources.includes(location.source)) group.sources.push(location.source);

      const existing = group.locations.find((entry) => (
        entry.source === location.source && entry.page === location.page
      ));
      if (existing) {
        existing.orderOnPage = Math.min(existing.orderOnPage, location.orderOnPage);
        existing.globalOrder = Math.min(existing.globalOrder, location.globalOrder);
      } else {
        group.locations.push(location);
      }
    }
  }

  return [...grouped.values()].map((item) => {
    item.sources.sort((left, right) => sourceOrder(left) - sourceOrder(right));
    item.locations.sort((left, right) => (
      sourceOrder(left.source) - sourceOrder(right.source)
      || left.page - right.page
      || left.orderOnPage - right.orderOnPage
    ));
    const primary = item.locations[0] || itemLocation({ source: item.sources[0] });
    return {
      ...item,
      source: primary?.source || item.sources[0],
      sourcePageUrl: primary?.sourcePageUrl || "",
      page: primary?.page || 1,
      orderOnPage: primary?.orderOnPage || 0,
    };
  });
}

export class BoothAuthError extends Error {
  constructor(message = t("BOOTH 로그인이 필요합니다.")) {
    super(message);
    this.name = "BoothAuthError";
    this.code = "AUTH_REQUIRED";
  }
}

export function extractProductId(href, baseUrl = BOOTH_ACCOUNTS_ORIGIN) {
  return getBoothProductId(href, baseUrl);
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function assertAuthenticated(documentNode) {
  const titleText = documentNode.querySelector("title")?.textContent || "";
  if (/sign in/i.test(titleText) || documentNode.querySelector('form[action*="sign_in"]')) {
    throw new BoothAuthError();
  }
}

function isShopUrl(href, baseUrl) {
  return Boolean(sanitizeSellerUrl(href, baseUrl));
}

function findProductCard(titleAnchor, productId, baseUrl) {
  let node = titleAnchor.parentElement;

  while (node && node.tagName !== "BODY") {
    const productIds = new Set(
      Array.from(node.querySelectorAll('a[href*="/items/"]'))
        .map((anchor) => extractProductId(anchor.getAttribute("href"), baseUrl))
        .filter(Boolean),
    );
    const hasProductImage = Array.from(node.querySelectorAll("img")).some((image) => {
      const source = image.getAttribute("src")
        || image.getAttribute("data-src")
        || image.getAttribute("srcset")
        || "";
      return source.includes(`/i/${productId}/`);
    });

    if (productIds.size === 1 && productIds.has(productId) && hasProductImage) return node;
    if (productIds.size > 1) break;
    node = node.parentElement;
  }

  return titleAnchor.parentElement;
}

function readSeller(card, baseUrl) {
  if (!card) return { sellerName: "알 수 없는 판매자", sellerUrl: "" };

  const link = Array.from(card.querySelectorAll("a[href]"))
    .find((anchor) => isShopUrl(anchor.getAttribute("href"), baseUrl));
  if (!link) return { sellerName: "알 수 없는 판매자", sellerUrl: "" };

  const sellerName = normalizeText(link.textContent || link.querySelector("img")?.getAttribute("alt"));

  return {
    sellerName: sellerName || "알 수 없는 판매자",
    sellerUrl: sanitizeSellerUrl(link.getAttribute("href"), baseUrl),
  };
}

function readProductImage(card, productId, baseUrl) {
  if (!card) return "";

  const images = Array.from(card.querySelectorAll("img"));
  const image = images.find((candidate) => {
    const source = candidate.getAttribute("src")
      || candidate.getAttribute("data-src")
      || candidate.getAttribute("srcset")
      || "";
    return source.includes(`/i/${productId}/`);
  }) ?? images.find((candidate) => !candidate.getAttribute("alt"));

  if (!image) return "";
  const source = image.getAttribute("src") || image.getAttribute("data-src") || "";
  return sanitizeImageUrl(source, productId, baseUrl);
}

export function getPageNumber(href, sourcePath, baseUrl = BOOTH_ACCOUNTS_ORIGIN) {
  try {
    const url = new URL(href, baseUrl);
    if (url.origin !== BOOTH_ACCOUNTS_ORIGIN || url.pathname !== sourcePath) return null;
    const page = Number.parseInt(url.searchParams.get("page") || "1", 10);
    return Number.isFinite(page) && page > 0 ? page : null;
  } catch {
    return null;
  }
}

export function parseBoothLibraryPage(html, { source, page, pageUrl }) {
  if (typeof DOMParser === "undefined") {
    throw new Error(t("이 환경에서는 BOOTH 페이지를 분석할 수 없습니다."));
  }

  const sourceConfig = SOURCES.find((entry) => entry.id === source);
  if (!sourceConfig) throw new Error(t("알 수 없는 라이브러리 유형입니다."));

  const documentNode = new DOMParser().parseFromString(html, "text/html");
  assertAuthenticated(documentNode);

  const seen = new Set();
  const items = [];
  const itemAnchors = Array.from(documentNode.querySelectorAll('a[href*="/items/"]'));

  for (const anchor of itemAnchors) {
    const href = anchor.getAttribute("href");
    const productId = extractProductId(href, pageUrl);
    const title = normalizeText(anchor.textContent);
    if (!productId || !title || seen.has(productId)) continue;

    seen.add(productId);
    const card = findProductCard(anchor, productId, pageUrl);
    const seller = readSeller(card, pageUrl);
    const downloads = readDownloadOptionsFromDocument(documentNode, {
      productId,
      pageUrl,
    });

    items.push({
      key: `product:${productId}`,
      productId,
      source,
      sources: [source],
      title,
      ...seller,
      imageUrl: readProductImage(card, productId, pageUrl),
      productUrl: sanitizeProductUrl(href, productId, pageUrl),
      downloadFiles: downloads.options.map(({ label, detail }) => ({ label, detail })),
      sourcePageUrl: buildSourcePageUrl(source, page),
      page,
      orderOnPage: items.length,
      locations: [{
        source,
        sourcePageUrl: buildSourcePageUrl(source, page),
        page,
        orderOnPage: items.length,
      }],
    });
  }

  const pageNumbers = Array.from(documentNode.querySelectorAll("a[href]"))
    .map((anchor) => getPageNumber(anchor.getAttribute("href"), sourceConfig.path, pageUrl))
    .filter(Boolean);

  return {
    items,
    pageCount: Math.max(1, ...pageNumbers),
  };
}

const DOWNLOAD_CONTROL_SELECTOR = '.js-download-button[data-href], a[href*="/downloadables/"]';
const ORDER_MONEY_PATTERN = /^([0-9][0-9,.]*)\s*(?:([A-Z]{3})|円)$/i;

function findDownloadCard(titleAnchor, productId, baseUrl) {
  let node = titleAnchor.parentElement;

  while (node && node.tagName !== "BODY") {
    const productIds = new Set(
      Array.from(node.querySelectorAll('a[href*="/items/"]'))
        .map((anchor) => extractProductId(anchor.getAttribute("href"), baseUrl))
        .filter(Boolean),
    );
    const hasDownloadControls = node.querySelector(DOWNLOAD_CONTROL_SELECTOR);

    if (productIds.size === 1 && productIds.has(productId) && hasDownloadControls) {
      return node;
    }
    if (productIds.size > 1) break;
    node = node.parentElement;
  }

  return null;
}

function readDownloadLabel(control, card, index) {
  let node = control.parentElement;

  while (node && node !== card) {
    if (node.querySelectorAll(DOWNLOAD_CONTROL_SELECTOR).length > 1) break;

    const clone = node.cloneNode(true);
    clone.querySelectorAll('.js-download-button, a[href*="/downloadables/"], button, pixiv-icon')
      .forEach((child) => child.remove());
    const text = normalizeText(clone.textContent);
    if (text && !/^(?:download|다운로드|ダウンロード)$/i.test(text)) {
      return text.slice(0, 240);
    }
    node = node.parentElement;
  }

  return t("다운로드 파일 {number}", { number: index + 1 });
}

function splitDownloadLabel(value, fallback) {
  const text = normalizeText(value) || fallback;
  const sizeMatch = text.match(/\s*[（(]?([\d.,]+\s*(?:B|KB|MB|GB|TB|KiB|MiB|GiB))[）)]?\s*$/i);
  if (!sizeMatch) return { label: text, detail: "" };

  const label = text.slice(0, sizeMatch.index).trim();
  return {
    label: label || fallback,
    detail: sizeMatch[1],
  };
}

function readDownloadOptionsFromDocument(documentNode, { productId, pageUrl }) {
  if (!/^\d+$/.test(String(productId || ""))) {
    throw new Error(t("올바르지 않은 BOOTH 상품 ID입니다."));
  }

  const productAnchors = Array.from(documentNode.querySelectorAll('a[href*="/items/"]'))
    .filter((anchor) => extractProductId(anchor.getAttribute("href"), pageUrl) === String(productId));
  if (!productAnchors.length) return { found: false, options: [] };

  const cards = Array.from(new Set(
    productAnchors
      .map((anchor) => findDownloadCard(anchor, String(productId), pageUrl))
      .filter(Boolean),
  ));
  if (!cards.length) return { found: true, options: [] };

  const seen = new Set();
  const options = [];
  for (const card of cards) {
    const controls = Array.from(card.querySelectorAll(DOWNLOAD_CONTROL_SELECTOR));
    for (const control of controls) {
      const rawUrl = control.getAttribute("data-href") || control.getAttribute("href");
      const url = sanitizeDownloadUrl(rawUrl, pageUrl);
      if (!url || seen.has(url)) continue;

      seen.add(url);
      const fallback = t("다운로드 파일 {number}", { number: options.length + 1 });
      const copy = splitDownloadLabel(readDownloadLabel(control, card, options.length), fallback);
      options.push({
        id: new URL(url).pathname.match(/\/downloadables\/(\d+)/)?.[1] || String(options.length + 1),
        ...copy,
        url,
      });
    }
  }

  return { found: true, options };
}

export function parseBoothDownloadOptions(html, { productId, pageUrl }) {
  if (typeof DOMParser === "undefined") {
    throw new Error(t("이 환경에서는 BOOTH 페이지를 분석할 수 없습니다."));
  }

  const documentNode = new DOMParser().parseFromString(html, "text/html");
  assertAuthenticated(documentNode);
  return readDownloadOptionsFromDocument(documentNode, { productId, pageUrl });
}

export function getOrdersPageNumber(href, baseUrl = BOOTH_ACCOUNTS_ORIGIN) {
  try {
    const url = new URL(href, baseUrl);
    if (url.origin !== BOOTH_ACCOUNTS_ORIGIN || url.pathname !== "/orders") return null;
    if ([...url.searchParams.keys()].some((key) => key !== "page")) return null;
    const page = Number.parseInt(url.searchParams.get("page") || "1", 10);
    return Number.isSafeInteger(page) && page > 0 ? page : null;
  } catch {
    return null;
  }
}

export function parseBoothOrdersPage(html, { pageUrl = buildOrdersPageUrl(1) } = {}) {
  if (typeof DOMParser === "undefined") {
    throw new Error(t("이 환경에서는 BOOTH 페이지를 분석할 수 없습니다."));
  }

  const documentNode = new DOMParser().parseFromString(html, "text/html");
  assertAuthenticated(documentNode);

  const orderIds = Array.from(new Set(
    Array.from(documentNode.querySelectorAll('a[href*="/orders/"]'))
      .map((anchor) => getBoothOrderId(anchor.getAttribute("href"), pageUrl))
      .filter(Boolean),
  ));
  const pageNumbers = Array.from(documentNode.querySelectorAll("a[href]"))
    .map((anchor) => getOrdersPageNumber(anchor.getAttribute("href"), pageUrl))
    .filter(Boolean);

  return {
    orderIds,
    pageCount: Math.max(1, ...pageNumbers),
  };
}

function parseOrderMoney(value) {
  const match = normalizeText(value).match(ORDER_MONEY_PATTERN);
  if (!match) return null;

  const amount = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount < 0) return null;
  return {
    amount,
    currency: (match[2] || "JPY").toUpperCase(),
  };
}

export function parseBoothOrderDetail(html, { orderId, pageUrl } = {}) {
  if (typeof DOMParser === "undefined") {
    throw new Error(t("이 환경에서는 BOOTH 페이지를 분석할 수 없습니다."));
  }

  const documentNode = new DOMParser().parseFromString(html, "text/html");
  assertAuthenticated(documentNode);

  const completedBadge = documentNode.querySelector(".order-state.completed");
  const headingOrderId = normalizeText(documentNode.querySelector("main h1, h1")?.textContent)
    .match(/\b(\d{4,})\b/)?.[1];
  const resolvedOrderId = headingOrderId || getBoothOrderId(pageUrl) || String(orderId || "");
  if (!/^\d+$/.test(resolvedOrderId)) {
    throw new Error(t("BOOTH 주문 번호를 확인하지 못했어요."));
  }

  if (!completedBadge) {
    return { orderId: resolvedOrderId, completed: false, money: null };
  }

  const summarySheet = completedBadge.closest(".sheet") || completedBadge.parentElement;
  const summaryRows = Array.from(summarySheet?.querySelectorAll(".l-row") || []);
  const money = summaryRows
    .flatMap((row) => Array.from(row.children))
    .map((node) => parseOrderMoney(node.textContent))
    .find(Boolean) || null;

  return {
    orderId: resolvedOrderId,
    completed: true,
    money,
  };
}

export function summarizeBoothOrderDetails(details, scannedAt = new Date().toISOString()) {
  const completedOrders = new Map();
  for (const detail of Array.isArray(details) ? details : []) {
    if (!detail?.completed) continue;
    if (!detail.money) {
      throw new Error(t("일부 완료 주문의 결제 금액을 읽지 못했어요. 잠시 후 다시 시도해 주세요."));
    }
    if (!/^\d+$/.test(String(detail.orderId || ""))) continue;
    if (!completedOrders.has(detail.orderId)) completedOrders.set(detail.orderId, detail.money);
  }

  const totals = {};
  let freeOrderCount = 0;
  for (const { amount, currency } of completedOrders.values()) {
    totals[currency] = (totals[currency] || 0) + amount;
    if (amount === 0) freeOrderCount += 1;
  }

  return {
    totals: Object.keys(totals).length ? totals : { JPY: 0 },
    orderCount: completedOrders.size,
    freeOrderCount,
    scannedAt,
  };
}

async function fetchHtml(url) {
  if (!isAllowedLibraryUrl(url) && !isAllowedOrdersUrl(url)) {
    throw new Error(t("허용되지 않은 BOOTH 주소 요청을 차단했습니다."));
  }

  const scheduledAt = Math.max(Date.now(), nextRequestAt);
  nextRequestAt = scheduledAt + MIN_REQUEST_INTERVAL_MS;
  const throttleDelay = scheduledAt - Date.now();
  if (throttleDelay > 0) {
    await new Promise((resolve) => setTimeout(resolve, throttleDelay));
  }

  const response = await fetch(url, {
    credentials: "include",
    redirect: "follow",
    cache: "no-store",
    headers: {
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (response.url.includes("/users/sign_in")) throw new BoothAuthError();
  if (!isAllowedLibraryUrl(response.url) && !isAllowedOrdersUrl(response.url)) {
    throw new Error(t("BOOTH가 예상하지 않은 주소로 이동해 응답을 차단했습니다."));
  }
  if (!response.ok) {
    const error = new Error(t("BOOTH 응답 오류 ({status})", { status: response.status }));
    error.status = response.status;
    error.retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
    throw error;
  }
  return response.text();
}

function parseRetryAfter(value) {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_RETRY_DELAY_MS, Math.round(seconds * 1000));
  }

  const retryAt = Date.parse(value);
  if (!Number.isFinite(retryAt)) return null;
  return Math.max(0, Math.min(MAX_RETRY_DELAY_MS, retryAt - Date.now()));
}

function shouldRetry(error) {
  return !Number.isInteger(error?.status) || RETRIABLE_STATUS_CODES.has(error.status);
}

async function fetchWithRetry(url, attempts = 3) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetchHtml(url);
    } catch (error) {
      if (error instanceof BoothAuthError) throw error;
      lastError = error;
      if (attempt < attempts - 1 && shouldRetry(error)) {
        const delay = error.retryAfterMs ?? Math.min(MAX_RETRY_DELAY_MS, 1000 * (2 ** attempt));
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        break;
      }
    }
  }

  throw lastError;
}

export async function loadBoothDownloadOptions(item) {
  if (!/^\d+$/.test(String(item?.productId || ""))) {
    throw new Error(t("다운로드할 상품 정보가 올바르지 않습니다."));
  }

  const candidates = Array.isArray(item.locations) && item.locations.length
    ? item.locations
    : [item];
  const locations = [];
  const seenPages = new Set();

  for (const candidate of candidates) {
    const sourceConfig = SOURCES.find((entry) => entry.id === candidate?.source);
    if (!sourceConfig) continue;
    const pageUrl = sanitizeSourcePageUrl(
      candidate.sourcePageUrl,
      candidate.source,
      candidate.page,
    );
    if (!isAllowedLibraryUrl(pageUrl, sourceConfig.path)) continue;
    const pageKey = `${candidate.source}:${pageUrl}`;
    if (seenPages.has(pageKey)) continue;
    seenPages.add(pageKey);
    locations.push({ source: candidate.source, pageUrl });
  }

  if (!locations.length) {
    throw new Error(t("다운로드할 상품 정보가 올바르지 않습니다."));
  }

  const results = await runPool(locations, 2, async ({ pageUrl }) => {
    const html = await fetchWithRetry(pageUrl);
    return parseBoothDownloadOptions(html, {
      productId: item.productId,
      pageUrl,
    });
  });

  const found = results.some((result) => result.found);
  const options = [];
  const seenOptions = new Set();
  for (const option of results.flatMap((result) => result.options)) {
    if (seenOptions.has(option.url)) continue;
    seenOptions.add(option.url);
    options.push(option);
  }

  if (!found) {
    const error = new Error(t("현재 페이지에서 상품을 찾지 못했어요. 전체 동기화 후 다시 시도해 주세요."));
    error.code = "PRODUCT_NOT_FOUND";
    throw error;
  }
  if (!options.length) {
    const error = new Error(t("이 상품에서 바로 받을 수 있는 다운로드 파일을 찾지 못했어요."));
    error.code = "DOWNLOADS_NOT_FOUND";
    throw error;
  }

  return options;
}

async function runPool(tasks, concurrency, worker) {
  const results = new Array(tasks.length);
  let cursor = 0;

  async function consume() {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(tasks[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, consume));
  return results;
}

export async function calculateBoothSpending(onProgress = () => {}) {
  onProgress({
    phase: "orders",
    completed: 0,
    total: 0,
    percent: 3,
    message: t("구매 내역 페이지 확인 중"),
  });

  const firstPageUrl = buildOrdersPageUrl(1);
  const firstHtml = await fetchWithRetry(firstPageUrl);
  const firstPage = parseBoothOrdersPage(firstHtml, { pageUrl: firstPageUrl });
  const pageTasks = Array.from(
    { length: Math.max(0, firstPage.pageCount - 1) },
    (_, index) => index + 2,
  );
  let pagesCompleted = 1;
  const remainingPages = await runPool(pageTasks, 2, async (page) => {
    const pageUrl = buildOrdersPageUrl(page);
    const html = await fetchWithRetry(pageUrl);
    const parsed = parseBoothOrdersPage(html, { pageUrl });
    pagesCompleted += 1;
    onProgress({
      phase: "orders",
      completed: pagesCompleted,
      total: firstPage.pageCount,
      percent: Math.round(5 + (pagesCompleted / firstPage.pageCount) * 15),
      message: t("구매 내역 {completed}/{total} 페이지", {
        completed: pagesCompleted,
        total: firstPage.pageCount,
      }),
    });
    return parsed;
  });

  const orderIds = Array.from(new Set(
    [firstPage, ...remainingPages].flatMap((page) => page.orderIds),
  ));
  if (!orderIds.length) {
    return {
      totals: { JPY: 0 },
      orderCount: 0,
      freeOrderCount: 0,
      scannedAt: new Date().toISOString(),
    };
  }

  let detailsCompleted = 0;
  const details = await runPool(orderIds, 2, async (requestedOrderId) => {
    const detailUrl = buildOrderDetailUrl(requestedOrderId);
    const html = await fetchWithRetry(detailUrl);
    const detail = parseBoothOrderDetail(html, { orderId: requestedOrderId, pageUrl: detailUrl });
    detailsCompleted += 1;
    onProgress({
      phase: "details",
      completed: detailsCompleted,
      total: orderIds.length,
      percent: Math.round(20 + (detailsCompleted / orderIds.length) * 80),
      message: t("결제 금액 {completed}/{total}건 확인 중", {
        completed: detailsCompleted,
        total: orderIds.length,
      }),
    });
    return detail;
  });

  return summarizeBoothOrderDetails(details);
}

export async function syncBoothLibrary(onProgress = () => {}) {
  onProgress({
    phase: "starting",
    completed: 0,
    total: 0,
    message: t("라이브러리 연결 중"),
  });

  let firstCompleted = 0;
  const firstPages = await Promise.all(SOURCES.map(async (sourceConfig, index) => {
    const pageUrl = `${BOOTH_ACCOUNTS_ORIGIN}${sourceConfig.path}?page=1`;
    const html = await fetchWithRetry(pageUrl);
    const parsed = parseBoothLibraryPage(html, {
      source: sourceConfig.id,
      page: 1,
      pageUrl,
    });
    firstCompleted += 1;
    onProgress({
      phase: "reading",
      completed: firstCompleted,
      total: 0,
      message: t("{source} 목록 확인 중", { source: t(sourceConfig.label) }),
    });
    return { sourceConfig, parsed };
  }));

  const tasks = [];
  for (const { sourceConfig, parsed } of firstPages) {
    for (let page = 2; page <= parsed.pageCount; page += 1) {
      tasks.push({ sourceConfig, page });
    }
  }

  let completed = firstPages.length;
  const total = firstPages.length + tasks.length;
  onProgress({
    phase: "reading",
    completed,
    total,
    message: t("전체 페이지 수를 확인했어요"),
  });
  const remainingPages = await runPool(tasks, 2, async ({ sourceConfig, page }) => {
    const pageUrl = `${BOOTH_ACCOUNTS_ORIGIN}${sourceConfig.path}?page=${page}`;
    const html = await fetchWithRetry(pageUrl);
    const parsed = parseBoothLibraryPage(html, {
      source: sourceConfig.id,
      page,
      pageUrl,
    });
    completed += 1;
    onProgress({
      phase: "reading",
      completed,
      total,
      message: t("{source} {page}/{total} 페이지", {
        source: t(sourceConfig.label),
        page,
        total: parsed.pageCount || page,
      }),
    });
    return { sourceConfig, parsed };
  });

  const allPages = [
    ...firstPages,
    ...remainingPages,
  ];

  const items = allPages
    .flatMap(({ parsed }) => parsed.items)
    .sort((left, right) => {
      const sourceDelta = SOURCES.findIndex((entry) => entry.id === left.source)
        - SOURCES.findIndex((entry) => entry.id === right.source);
      return sourceDelta || left.page - right.page || left.orderOnPage - right.orderOnPage;
    })
    .map((item, globalOrder) => ({ ...item, globalOrder }));

  const uniqueItems = groupBoothLibraryItems(items);
  const downloadFileCount = uniqueItems.reduce(
    (count, item) => count + (item.downloadFiles?.length || 0),
    0,
  );
  onProgress({
    phase: "complete",
    completed: total,
    total,
    message: t("{items}개 상품 · {files}개 파일을 불러왔어요", {
      items: formatLocalizedNumber(uniqueItems.length),
      files: formatLocalizedNumber(downloadFileCount),
    }),
  });

  return {
    items: uniqueItems,
    downloadFileCount,
    syncedAt: new Date().toISOString(),
  };
}
