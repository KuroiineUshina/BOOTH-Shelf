// Requests from local AI tools (Claude Code, Codex) arrive through the
// booth-shelf-mcp native host. This module answers them from the synced
// library; Chrome APIs (storage, offscreen parsing, approval, downloads) are
// injected so the logic stays testable.
import { filterItems, getFolderPath, getItemFolderIds, getOwnedAvatarProfileIds, sortItems } from "./domain.js";
import { productCategoryLabel } from "./product-categories.js";

export const AI_BRIDGE_PROTOCOL_VERSION = 1;
export const AI_BRIDGE_HOST_NAME = "com.kuroiineushina.booth_shelf";
export const AI_BRIDGE_PERMISSIONS = Object.freeze(["nativeMessaging", "downloads", "offscreen"]);

const MAX_SEARCH_RESULTS = 50;
const DEFAULT_SEARCH_RESULTS = 20;
const MAX_DOWNLOAD_ITEMS = 10;
const MAX_DOWNLOAD_FILES = 30;
const DOWNLOAD_WAIT_MS = 40_000;
const DOWNLOAD_POLL_MS = 1_000;
const MAX_FINISHED_JOBS = 20;
const SOURCES = Object.freeze(["all", "purchased", "gift", "free"]);

export class AiBridgeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function invalid(message) {
  return new AiBridgeError("INVALID_PARAMS", message);
}

function optionalString(value, name, maxLength = 200) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw invalid(`${name} must be a string.`);
  return value.trim().slice(0, maxLength);
}

function productIdParam(value) {
  const productId = String(value ?? "").trim();
  if (!/^\d{1,20}$/.test(productId)) throw invalid("productId must be a BOOTH item number.");
  return productId;
}

// Windows-safe relative path segment for chrome.downloads (no "..", reserved
// characters, trailing dots/spaces or device names).
export function safePathSegment(value, fallback = "item", maxLength = 60) {
  let segment = String(value ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, maxLength)
    .replace(/[. ]+$/, "");
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(segment)) segment = `_${segment}`;
  return segment || fallback;
}

export function buildDownloadFilename(item, fileName) {
  return [
    "BOOTH Shelf",
    safePathSegment(item.sellerName, "shop"),
    safePathSegment(`${item.title} (${item.productId})`, item.productId),
    safePathSegment(fileName, "download", 120),
  ].join("/");
}

function compactItem(item, state) {
  const folderNames = getItemFolderIds(state.assignments, item.key)
    .map((folderId) => getFolderPath(state.folders, folderId).map((folder) => folder.name).join(" / "))
    .filter(Boolean);
  const category = item.productCategory;
  return {
    productId: item.productId,
    title: item.title,
    shop: item.sellerName,
    sources: item.sources,
    type: category
      ? { name: category.name, english: productCategoryLabel(category, "en"), parent: category.parentName || null }
      : null,
    supportedAvatars: item.supportedAvatarIds || [],
    ownedAvatarVariants: getOwnedAvatarProfileIds(item),
    files: (item.downloadFiles || []).map((file) => (file.detail ? `${file.label} (${file.detail})` : file.label)),
    favorite: state.favorites.includes(item.key),
    folders: folderNames,
    productUrl: item.productUrl || `https://booth.pm/ja/items/${item.productId}`,
  };
}

export function createAiBridge({
  loadState,
  loadDownloadOptions,
  requestApproval,
  startDownload,
  getDownload,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
  extensionVersion = "",
  downloadWaitMs = DOWNLOAD_WAIT_MS,
  downloadPollMs = DOWNLOAD_POLL_MS,
}) {
  const jobs = new Map();
  let jobSequence = 0;

  async function findItem(productId) {
    const state = await loadState();
    const item = state.items.find((entry) => entry.productId === productId);
    if (!item) {
      throw new AiBridgeError("NOT_FOUND", `Item ${productId} is not in the synced BOOTH library.`);
    }
    return { state, item };
  }

  async function status() {
    const state = await loadState();
    return {
      protocol: AI_BRIDGE_PROTOCOL_VERSION,
      extensionVersion,
      itemCount: state.items.length,
      lastSyncedAt: state.lastSyncedAt,
      itemsWithType: state.items.filter((item) => item.productCategory).length,
      itemsWithSupportedAvatars: state.items.filter((item) => item.supportedAvatarIds?.length).length,
    };
  }

  async function searchLibrary(params = {}) {
    const query = optionalString(params.query, "query");
    const type = optionalString(params.type, "type", 80);
    const source = params.source ?? "all";
    if (!SOURCES.includes(source)) throw invalid(`source must be one of ${SOURCES.join(", ")}.`);
    const limit = params.limit === undefined ? DEFAULT_SEARCH_RESULTS : Number(params.limit);
    const offset = params.offset === undefined ? 0 : Number(params.offset);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_SEARCH_RESULTS) {
      throw invalid(`limit must be an integer from 1 to ${MAX_SEARCH_RESULTS}.`);
    }
    if (!Number.isSafeInteger(offset) || offset < 0) throw invalid("offset must be a non-negative integer.");

    const state = await loadState();
    let results = filterItems(state.items, {
      query,
      source,
      favoritesOnly: params.favoritesOnly === true,
      favorites: state.favorites,
      assignments: state.assignments,
    });
    if (type) results = filterItems(results, { query: type, searchField: "kind" });
    results = sortItems(results, { purchase: "asc", name: "off" });
    return {
      total: results.length,
      offset,
      lastSyncedAt: state.lastSyncedAt,
      items: results.slice(offset, offset + limit).map((item) => compactItem(item, state)),
    };
  }

  async function listFiles(params = {}) {
    const { item } = await findItem(productIdParam(params.productId));
    const options = await loadDownloadOptions(item);
    return {
      productId: item.productId,
      title: item.title,
      files: options.map((option) => ({ fileId: String(option.id), name: option.label, size: option.detail || null })),
    };
  }

  function jobSnapshot(job) {
    return {
      jobId: job.id,
      status: job.status,
      files: job.files.map((file) => ({
        productId: file.productId,
        name: file.name,
        status: file.status,
        path: file.path || null,
        bytesReceived: file.bytesReceived ?? null,
        totalBytes: file.totalBytes ?? null,
        error: file.error || null,
      })),
    };
  }

  function finishJob(job, statusValue) {
    job.status = statusValue;
    job.finishedAt = now();
    const finished = [...jobs.values()].filter((entry) => entry.finishedAt).sort((a, b) => a.finishedAt - b.finishedAt);
    for (const old of finished.slice(0, Math.max(0, finished.length - MAX_FINISHED_JOBS))) jobs.delete(old.id);
  }

  async function refreshJob(job) {
    if (job.status !== "downloading") return;
    for (const file of job.files) {
      if (file.downloadId === undefined || ["complete", "failed"].includes(file.status)) continue;
      const download = await getDownload(file.downloadId);
      if (!download) {
        file.status = "failed";
        file.error = "Download was removed from the browser.";
        continue;
      }
      file.bytesReceived = download.bytesReceived;
      file.totalBytes = download.totalBytes;
      if (download.state === "complete") {
        file.status = "complete";
        file.path = download.filename;
      } else if (download.state === "interrupted") {
        file.status = "failed";
        file.error = download.error || "interrupted";
      }
    }
    if (job.files.every((file) => ["complete", "failed"].includes(file.status))) {
      finishJob(job, job.files.every((file) => file.status === "complete") ? "complete" : "failed");
    }
  }

  async function runJob(job) {
    const approved = await requestApproval({
      jobId: job.id,
      items: job.items.map(({ item, files }) => ({
        productId: item.productId,
        title: item.title,
        shop: item.sellerName,
        files: files.map((file) => ({ name: file.label, size: file.detail || null })),
      })),
    });
    if (!approved) {
      job.files.forEach((file) => { file.status = "denied"; });
      finishJob(job, "denied");
      return;
    }
    job.status = "downloading";
    for (const file of job.files) {
      try {
        file.downloadId = await startDownload({ url: file.url, filename: file.filename });
        file.status = "downloading";
      } catch (error) {
        file.status = "failed";
        file.error = error?.message || "Could not start the download.";
      }
    }
    await refreshJob(job);
  }

  async function waitForJob(job, waitMs) {
    const deadline = now() + waitMs;
    while (!job.finishedAt && now() < deadline) {
      await sleep(downloadPollMs);
      await refreshJob(job);
    }
    return jobSnapshot(job);
  }

  async function download(params = {}) {
    const requested = Array.isArray(params.items) ? params.items : null;
    if (!requested?.length || requested.length > MAX_DOWNLOAD_ITEMS) {
      throw invalid(`items must list 1 to ${MAX_DOWNLOAD_ITEMS} BOOTH items.`);
    }
    const items = [];
    for (const entry of requested) {
      const { item } = await findItem(productIdParam(entry?.productId));
      if (items.some((existing) => existing.item.productId === item.productId)) continue;
      const fileIds = entry.fileIds === undefined ? null : entry.fileIds;
      if (fileIds !== null && (!Array.isArray(fileIds) || !fileIds.length)) {
        throw invalid("fileIds must be a non-empty array when given.");
      }
      const options = await loadDownloadOptions(item);
      const wanted = fileIds === null ? options : options.filter((option) => fileIds.map(String).includes(String(option.id)));
      if (fileIds !== null && wanted.length !== new Set(fileIds.map(String)).size) {
        throw new AiBridgeError("NOT_FOUND", `Some fileIds are not available for item ${item.productId}. Call booth_list_files first.`);
      }
      items.push({ item, files: wanted });
    }
    const fileCount = items.reduce((count, entry) => count + entry.files.length, 0);
    if (!fileCount) throw new AiBridgeError("NOT_FOUND", "No downloadable files were found.");
    if (fileCount > MAX_DOWNLOAD_FILES) throw invalid(`At most ${MAX_DOWNLOAD_FILES} files per request.`);

    jobSequence += 1;
    const job = {
      id: `job-${now().toString(36)}-${jobSequence}`,
      status: "awaiting_approval",
      items,
      files: items.flatMap(({ item, files }) => files.map((file) => ({
        productId: item.productId,
        name: file.label,
        url: file.url,
        filename: buildDownloadFilename(item, file.label),
        status: "awaiting_approval",
      }))),
    };
    jobs.set(job.id, job);
    runJob(job).catch((error) => {
      job.files.forEach((file) => {
        if (!["complete", "failed", "denied"].includes(file.status)) {
          file.status = "failed";
          file.error = error?.message || "Download request failed.";
        }
      });
      finishJob(job, "failed");
    });
    return waitForJob(job, downloadWaitMs);
  }

  async function downloadStatus(params = {}) {
    const jobId = optionalString(params.jobId, "jobId", 80);
    const job = jobs.get(jobId);
    if (!job) throw new AiBridgeError("NOT_FOUND", `Unknown jobId ${jobId}.`);
    await refreshJob(job);
    return jobSnapshot(job);
  }

  const methods = {
    status,
    search_library: searchLibrary,
    list_files: listFiles,
    download,
    download_status: downloadStatus,
  };

  return {
    async handle(method, params) {
      const handler = Object.hasOwn(methods, method) ? methods[method] : null;
      if (!handler) throw new AiBridgeError("UNKNOWN_METHOD", `Unknown method ${method}.`);
      if (params !== undefined && (params === null || typeof params !== "object" || Array.isArray(params))) {
        throw invalid("params must be an object.");
      }
      return handler(params ?? {});
    },
  };
}
