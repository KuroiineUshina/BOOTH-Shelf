export const BOOTH_ACCOUNTS_ORIGIN = "https://accounts.booth.pm";
export const BOOTH_PRODUCT_ORIGIN = "https://booth.pm";

const SOURCE_PATHS = Object.freeze({
  purchased: "/library",
  gift: "/library/gifts",
  free: "/library/free_downloads",
});
const ORDERS_PATH = "/orders";

function parseHttpsUrl(value, baseUrl) {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    return url;
  } catch {
    return null;
  }
}

export function isBoothHostname(hostname) {
  const normalized = String(hostname || "").toLocaleLowerCase("en-US");
  return normalized === "booth.pm" || normalized.endsWith(".booth.pm");
}

export function getBoothProductId(value, baseUrl = BOOTH_ACCOUNTS_ORIGIN) {
  const url = parseHttpsUrl(value, baseUrl);
  if (!url || !isBoothHostname(url.hostname)) return null;
  return url.pathname.match(/\/items\/(\d+)(?:\/|$)/)?.[1] ?? null;
}

export function sanitizeProductUrl(value, productId, baseUrl = BOOTH_ACCOUNTS_ORIGIN) {
  const url = parseHttpsUrl(value, baseUrl);
  if (!url || !isBoothHostname(url.hostname)) return "";

  const resolvedProductId = getBoothProductId(url.href, baseUrl);
  if (!resolvedProductId || String(productId) !== resolvedProductId) return "";

  if (url.hostname === "accounts.booth.pm") {
    return new URL(`${url.pathname}${url.search}${url.hash}`, BOOTH_PRODUCT_ORIGIN).href;
  }
  return url.href;
}

export function sanitizeSellerUrl(value, baseUrl = BOOTH_ACCOUNTS_ORIGIN) {
  const url = parseHttpsUrl(value, baseUrl);
  if (!url) return "";

  const hostname = url.hostname.toLocaleLowerCase("en-US");
  if (!hostname.endsWith(".booth.pm")) return "";
  if (["accounts.booth.pm", "www.booth.pm"].includes(hostname)) return "";
  return url.href;
}

export function sanitizeImageUrl(value, productId, baseUrl = BOOTH_ACCOUNTS_ORIGIN) {
  const url = parseHttpsUrl(value, baseUrl);
  if (!url || url.hostname !== "booth.pximg.net") return "";
  if (!url.pathname.includes(`/i/${String(productId)}/`)) return "";
  return url.href;
}

export function sanitizeDownloadUrl(value, baseUrl = BOOTH_PRODUCT_ORIGIN) {
  const url = parseHttpsUrl(value, baseUrl);
  if (!url || ![BOOTH_PRODUCT_ORIGIN, BOOTH_ACCOUNTS_ORIGIN].includes(url.origin)) return "";
  if (!/^\/downloadables\/\d+(?:\/download)?\/?$/.test(url.pathname)) return "";
  url.hash = "";
  return url.href;
}

export function getBoothOrderId(value, baseUrl = BOOTH_ACCOUNTS_ORIGIN) {
  const url = parseHttpsUrl(value, baseUrl);
  if (!url || url.origin !== BOOTH_ACCOUNTS_ORIGIN) return null;
  return url.pathname.match(/^\/orders\/(\d+)\/?$/)?.[1] ?? null;
}

export function buildOrdersPageUrl(page = 1) {
  const normalizedPage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  return `${BOOTH_ACCOUNTS_ORIGIN}${ORDERS_PATH}?page=${normalizedPage}`;
}

export function buildOrderDetailUrl(orderId) {
  return /^\d+$/.test(String(orderId || ""))
    ? `${BOOTH_ACCOUNTS_ORIGIN}${ORDERS_PATH}/${orderId}`
    : "";
}

export function isAllowedOrdersUrl(value) {
  const url = parseHttpsUrl(value, BOOTH_ACCOUNTS_ORIGIN);
  if (!url || url.origin !== BOOTH_ACCOUNTS_ORIGIN) return false;

  if (url.pathname === ORDERS_PATH) {
    if ([...url.searchParams.keys()].some((key) => key !== "page")) return false;
    const page = url.searchParams.get("page") || "1";
    return /^\d+$/.test(page) && Number(page) > 0;
  }

  return /^\/orders\/\d+\/?$/.test(url.pathname) && !url.search;
}

export function buildSourcePageUrl(source, page = 1) {
  const path = SOURCE_PATHS[source];
  const normalizedPage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  return path ? `${BOOTH_ACCOUNTS_ORIGIN}${path}?page=${normalizedPage}` : "";
}

export function sanitizeSourcePageUrl(value, source, fallbackPage = 1) {
  const path = SOURCE_PATHS[source];
  if (!path) return "";

  const url = parseHttpsUrl(value, BOOTH_ACCOUNTS_ORIGIN);
  if (!url || url.origin !== BOOTH_ACCOUNTS_ORIGIN || url.pathname !== path) {
    return buildSourcePageUrl(source, fallbackPage);
  }

  const rawPage = url.searchParams.get("page") || "1";
  if (!/^\d+$/.test(rawPage)) return buildSourcePageUrl(source, fallbackPage);
  const page = Number.parseInt(rawPage, 10);
  return buildSourcePageUrl(source, Number.isSafeInteger(page) && page > 0 ? page : fallbackPage);
}

export function isAllowedLibraryUrl(value, expectedPath) {
  const url = parseHttpsUrl(value, BOOTH_ACCOUNTS_ORIGIN);
  if (!url || url.origin !== BOOTH_ACCOUNTS_ORIGIN) return false;
  if (expectedPath) return url.pathname === expectedPath;
  return Object.values(SOURCE_PATHS).includes(url.pathname);
}
