import test from "node:test";
import assert from "node:assert/strict";

import { PREFERENCES_KEY, STORAGE_KEY, runLibraryOperation, sanitizeState } from "../src/storage.js";

// Drives the service worker the way the native host does: a "sync" request
// over the native port, offscreen parsing, then saving into chrome.storage.
const stored = {
  [PREFERENCES_KEY]: { aiBridge: true },
  [STORAGE_KEY]: sanitizeState({
    items: [
      { productId: "101", source: "purchased", title: "Old Coat", sellerName: "Lumen Atelier" },
      { productId: "202", source: "gift", title: "Gone Hair", sellerName: "Plain Bloom" },
    ],
    folders: [{ id: "clothes", name: "의상" }],
    assignments: { "product:101": ["clothes"] },
    favorites: ["product:101"],
    lastSyncedAt: "2026-10-14T00:00:00.000Z",
  }),
};
const offscreenCalls = [];
const posted = [];
let runtimeListener;
let portListener;
let grantedOrigins = true;

const syncedItems = [
  { key: "product:101", productId: "101", sources: ["purchased"], source: "purchased", title: "Old Coat", sellerName: "Lumen Atelier" },
  { key: "product:3484218", productId: "3484218", sources: ["free"], source: "free", title: "Free Pack", sellerName: "Room" },
];

globalThis.chrome = {
  action: { onClicked: { addListener() {} } },
  tabs: { create() {} },
  storage: {
    local: {
      async get(key) { return { [key]: structuredClone(stored[key]) }; },
      async set(values) { Object.assign(stored, structuredClone(values)); },
    },
    onChanged: { addListener() {} },
  },
  permissions: {
    async contains(request) { return request.origins ? grantedOrigins : true; },
    onAdded: { addListener() {} },
    onRemoved: { addListener() {} },
  },
  offscreen: { async createDocument() {} },
  windows: { onRemoved: { addListener() {} } },
  runtime: {
    id: "test-extension-id",
    getURL: (path) => `chrome-extension://test-extension-id/${path}`,
    getManifest: () => ({ version: "1.0.13" }),
    async getContexts() { return []; },
    onMessage: { addListener(listener) { runtimeListener = listener; } },
    onStartup: { addListener() {} },
    async sendMessage(message) {
      offscreenCalls.push(message.type);
      if (message.type === "sync-library") {
        return { ok: true, items: structuredClone(syncedItems), syncedAt: "2026-10-21T03:00:00.000Z", downloadFileCount: 0 };
      }
      if (message.type === "index-support") {
        // The offscreen indexer reports progress back as checkpoints.
        const indexed = message.items.map((item) => ({
          ...item,
          supportedAvatarIds: ["manuka"],
          supportIndexedAt: "2026-10-21T03:00:05.000Z",
          supportIndexVersion: 9,
        }));
        await new Promise((resolve) => {
          runtimeListener({ type: "support-index-checkpoint", items: indexed }, { id: "test-extension-id" }, resolve);
        });
        return { ok: true, scannedCount: indexed.length, failedCount: 0, supportedProductCount: indexed.length };
      }
      return { ok: false, error: "unexpected" };
    },
    connectNative() {
      return {
        postMessage(message) { posted.push(message); },
        disconnect() {},
        onMessage: { addListener(listener) { portListener = listener; } },
        onDisconnect: { addListener() {} },
      };
    },
  },
};

await import("../background.js");

async function waitFor(check, label) {
  for (let i = 0; i < 200; i += 1) {
    const value = check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function request(id, method) {
  portListener({ type: "request", id, method, params: {} });
  return waitFor(() => posted.find((message) => message.type === "response" && message.id === id), `response ${id}`);
}

test("AI 동기화 요청은 보관함을 새로 저장하되 즐겨찾기·폴더를 지키고 새 상품을 알려 준다", async () => {
  await waitFor(() => portListener, "native port");
  portListener({ type: "ready" });

  const response = await request("1", "sync");
  assert.equal(response.error, undefined);
  assert.equal(response.result.status, "complete");
  assert.equal(response.result.itemCount, 2);
  assert.deepEqual(response.result.newItems.map((item) => item.productId), ["3484218"]);
  assert.equal(response.result.removedItemCount, 1);
  assert.equal(response.result.lastSyncedAt, "2026-10-21T03:00:00.000Z");

  const state = stored[STORAGE_KEY];
  assert.deepEqual(state.items.map((item) => item.productId), ["101", "3484218"]);
  assert.deepEqual(state.favorites, ["product:101"]);
  assert.deepEqual(state.assignments, { "product:101": ["clothes"] });

  // The avatar-support index runs after the reply and lands through checkpoints.
  await waitFor(() => stored[STORAGE_KEY].items.every((item) => item.supportedAvatarIds?.includes("manuka")), "support index");
  assert.deepEqual(offscreenCalls, ["sync-library", "index-support"]);
});

test("BOOTH 접근 권한이 없으면 동기화하지 않고 이유를 알려 준다", async () => {
  grantedOrigins = false;
  // Past the one-minute reuse window of the previous result.
  const realNow = Date.now;
  Date.now = () => realNow() + 120_000;
  try {
    const response = await request("2", "sync");
    assert.equal(response.result.status, "failed");
    assert.equal(response.result.error.code, "PERMISSION_REQUIRED");
  } finally {
    Date.now = realNow;
    grantedOrigins = true;
  }
});

test("BOOTH Shelf 창에서 동기화 중이면 겹쳐 실행하지 않고 잠시 뒤 다시 하라고 알려 준다", async () => {
  const realNow = Date.now;
  Date.now = () => realNow() + 240_000;
  let release;
  const held = runLibraryOperation(() => new Promise((resolve) => { release = resolve; }));
  try {
    const response = await request("3", "sync");
    assert.equal(response.result.status, "failed");
    assert.equal(response.result.error.code, "BUSY");
  } finally {
    release();
    await held;
    Date.now = realNow;
  }
});
