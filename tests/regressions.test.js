import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

import * as storage from "../src/storage.js";
import * as domain from "../src/domain.js";
import {
  assertLibraryPage,
  extractSupportedAvatarIds,
  indexBoothProductSupport,
  isProductSupportIndexFresh,
  parseBoothLibraryPage,
  PRODUCT_SUPPORT_INDEX_VERSION,
} from "../src/booth.js";
import { buildAvatarProfileIds, buildSearchVariants } from "../src/search.js";
import { withExclusiveLock } from "../src/concurrency.js";

const appSource = (await readFile(new URL("../src/app.js", import.meta.url), "utf8"))
  .replace(/\r\n/g, "\n");
let storageInstance = 0;

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function replaceGlobal(t, name, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, name, original);
    else delete globalThis[name];
  });
}

function installStorage(t, initial = {}, beforeSet = async () => {}) {
  const data = structuredClone(initial);
  const calls = { get: 0, set: 0, remove: 0, access: 0 };
  replaceGlobal(t, "chrome", {
    storage: {
      local: {
        async get(keys) {
          calls.get += 1;
          return Object.fromEntries([keys].flat().map((key) => [key, structuredClone(data[key])]));
        },
        async set(values) {
          calls.set += 1;
          await beforeSet(values, calls.set);
          Object.assign(data, structuredClone(values));
        },
        async remove(keys) {
          calls.remove += 1;
          for (const key of [keys].flat()) delete data[key];
        },
        async setAccessLevel() { calls.access += 1; },
      },
    },
  });
  return { data, calls };
}

function freshStorage() {
  storageInstance += 1;
  return import(`../src/storage.js?regression=${storageInstance}`);
}

function sampleState() {
  return storage.sanitizeState({
    items: [101, 202].map((productId) => ({
      productId: String(productId), source: "purchased", title: `Item ${productId}`,
    })),
    folders: [{ id: "clothes", name: "의상" }],
  });
}

// Run the actual application functions with only their browser/UI dependencies replaced.
function appContext(names, overrides = {}) {
  const context = vm.createContext({
    ...storage,
    ...domain,
    state: sampleState(),
    ui: { folderId: "all", visibleLimit: 96 },
    IS_DEMO: false,
    PAGE_SIZE: 48,
    selectedItemKeys: new Set(),
    downloadCardStates: new Map(),
    t: (value, params = {}) => value.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? ""),
    formatCount: String,
    showToast() {},
    render() {},
    renderPreservingViewport() {},
    markFolderDropSuccess() {},
    captureViewportPosition: () => ({ visibleLimit: 96 }),
    restoreViewportPosition() {},
    window: { requestAnimationFrame: (callback) => callback() },
    ...overrides,
  });
  for (const name of names) {
    const start = appSource.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
    assert.notEqual(start, -1, `missing app function: ${name}`);
    const end = appSource.indexOf("\n}", start) + 2;
    assert.ok(end > start, `missing function end: ${name}`);
    vm.runInContext(appSource.slice(start, end), context, { filename: `app.js:${name}` });
  }
  return context;
}

test("연속 즐겨찾기·폴더 저장은 첫 저장이 늦어도 모두 보존한다", async (t) => {
  const started = deferred();
  const release = deferred();
  const original = sampleState();
  const { data, calls } = installStorage(t, { [storage.STORAGE_KEY]: original }, async (_, count) => {
    if (count === 1) { started.resolve(); await release.promise; }
  });
  const api = await freshStorage();
  const app = appContext(["persistState", "toggleFavorite", "updateItemsFolderAssignment"], api);
  const favorite = app.toggleFavorite("product:101");
  await started.promise;
  const assignment = app.updateItemsFolderAssignment(["product:202"], "clothes");
  await Promise.resolve();
  assert.equal(calls.get, 1, "the second mutation must wait before reading storage");
  assert.deepEqual(app.state.favorites, [], "uncommitted state must not reach the UI");
  release.resolve();
  await Promise.all([favorite, assignment]);
  assert.deepEqual(data[storage.STORAGE_KEY].favorites, ["product:101"]);
  assert.deepEqual(data[storage.STORAGE_KEY].assignments, { "product:202": ["clothes"] });
  assert.deepEqual(app.state, storage.sanitizeState(data[storage.STORAGE_KEY]));
});

test("서로 다른 창의 변경과 환경 설정도 최신 저장값에 합친다", async (t) => {
  installStorage(t, { [storage.STORAGE_KEY]: sampleState() });
  const first = await freshStorage();
  const second = await freshStorage();
  await Promise.all([
    first.updateState((latest) => ({ ...latest, favorites: ["product:101"] })),
    second.updateState((latest) => ({ ...latest, assignments: { "product:202": ["clothes"] } })),
    first.updatePreferences((latest) => ({ ...latest, theme: "dark" })),
    second.updatePreferences((latest) => ({ ...latest, gridColumns: 6 })),
  ]);
  assert.deepEqual((await first.loadState()).favorites, ["product:101"]);
  assert.deepEqual((await first.loadState()).assignments, { "product:202": ["clothes"] });
  assert.equal((await first.loadPreferences()).theme, "dark");
  assert.equal((await first.loadPreferences()).gridColumns, 6);
});

test("저장 실패는 성공 알림·화면 변경 없이 전달하고 다음 저장은 재시도한다", async (t) => {
  const original = sampleState();
  const { data } = installStorage(t, { [storage.STORAGE_KEY]: original }, async (_, count) => {
    if (count === 1) throw new Error("QUOTA_BYTES exceeded");
  });
  const api = await freshStorage();
  const messages = [];
  const selected = new Set(["product:101"]);
  const app = appContext(["persistState", "toggleFavorite", "updateItemsFolderAssignment"], {
    ...api, selectedItemKeys: selected, showToast: (message) => messages.push(message),
  });
  await assert.rejects(app.updateItemsFolderAssignment(["product:101"], "clothes"), /QUOTA_BYTES/);
  assert.deepEqual(app.state, original);
  assert.deepEqual(data[storage.STORAGE_KEY], original);
  assert.equal(selected.size, 1);
  assert.deepEqual(messages, []);
  await app.toggleFavorite("product:202");
  assert.deepEqual((await api.loadState()).favorites, ["product:202"]);
});

test("계산 결과 저장이 끝나기 전 다른 창의 삭제를 막고 이후 삭제는 요약까지 지운다", async (t) => {
  const started = deferred();
  const release = deferred();
  const { calls } = installStorage(t, {}, async (values) => {
    if (values[storage.SPENDING_SUMMARY_KEY]) { started.resolve(); await release.promise; }
  });
  const calculating = await freshStorage();
  const deleting = await freshStorage();
  const refs = () => new Proxy({}, {
    get: (target, id) => target[id] ??= { querySelector: () => ({}), close() {} },
  });
  const calculationApp = appContext(["calculateSpending"], {
    ...calculating, refs: refs(), spendingSummary: null,
    requestBoothAccess: async () => true,
    calculateBoothSpending: async () => ({
      totals: { JPY: 2400 }, orderCount: 1, freeOrderCount: 0,
      scannedAt: "2026-09-05T00:00:00.000Z",
    }),
    setRedPillProgress() {}, renderSpendingSummary() {},
    BoothAuthError: class extends Error {},
    showRedPillError: (error) => { throw error; },
  });
  const deletionMessages = [];
  let permissionRemovals = 0;
  const deletionApp = appContext(["confirmDataDelete"], {
    ...deleting, refs: refs(), preferences: null, spendingSummary: null,
    removeBoothAccess: async () => { permissionRemovals += 1; },
    applyLocalePreference() {}, applyLayoutPreferences() {}, setSyncPanel() {}, resetLibraryView() {},
    showToast: (message, tone) => deletionMessages.push({ message, tone }),
  });
  const calculation = calculationApp.calculateSpending();
  await started.promise;
  await deletionApp.confirmDataDelete({ preventDefault() {} });
  assert.equal(calls.remove, 0);
  assert.equal(permissionRemovals, 0);
  assert.equal(deletionMessages[0].tone, "error");
  release.resolve();
  await calculation;
  await deletionApp.confirmDataDelete({ preventDefault() {} });
  assert.equal(permissionRemovals, 1);
  assert.equal(await calculating.loadSpendingSummary(), null);
  assert.deepEqual((await calculating.loadState()).items, []);
});

test("브라우저 Web Locks 경로는 대기 저장과 즉시 충돌 검사를 구분한다", async (t) => {
  const requests = [];
  replaceGlobal(t, "navigator", { locks: {
    async request(name, options, callback) {
      requests.push({ name, options });
      return callback(options.ifAvailable ? null : { name });
    },
  } });
  assert.equal(await withExclusiveLock("state", async () => 42), 42);
  await assert.rejects(withExclusiveLock("operation", () => assert.fail("busy task ran"), { wait: false }),
    { code: "STATE_BUSY" });
  assert.deepEqual(requests, [
    { name: "state", options: { mode: "exclusive" } },
    { name: "operation", options: { mode: "exclusive", ifAvailable: true } },
  ]);
});

test("데모의 읽기·저장·설정·요약·삭제는 실제 확장 저장소에 접근하지 않는다", async (t) => {
  const original = { [storage.STORAGE_KEY]: sampleState() };
  const { data, calls } = installStorage(t, original);
  const demo = await freshStorage();
  demo.useMemoryStorage(sampleState());
  await demo.restrictStorageAccess();
  await demo.updateState((latest) => ({ ...latest, favorites: ["product:101"] }));
  await demo.updatePreferences((latest) => ({ ...latest, theme: "dark" }));
  await demo.saveSpendingSummary({ totals: { JPY: 10 }, scannedAt: "2026-09-05T00:00:00Z" });
  assert.equal((await demo.loadPreferences()).theme, "dark");
  assert.deepEqual((await demo.loadState()).favorites, ["product:101"]);
  assert.equal((await demo.loadSpendingSummary()).totals.JPY, 10);
  await demo.runLibraryOperation(() => demo.clearState());
  assert.equal(await demo.loadSpendingSummary(), null);
  assert.deepEqual((await demo.loadState()).items, []);
  assert.deepEqual(calls, { get: 0, set: 0, remove: 0, access: 0 });
  assert.deepEqual(data, original);
});

test("2MiB를 넘는 실제 정리 백업도 내보낸 그대로 복원할 수 있다", () => {
  const folders = Array.from({ length: 10 }, (_, index) => ({ id: crypto.randomUUID(), name: `폴더 ${index}` }));
  const items = Array.from({ length: 5000 }, (_, index) => ({
    productId: String(10000 + index), source: "purchased", title: `상품 ${index}`,
  }));
  const state = storage.sanitizeState({
    items, folders,
    assignments: Object.fromEntries(items.map((item) => [`product:${item.productId}`, folders.map(({ id }) => id)])),
    favorites: ["product:10000"],
  });
  const text = storage.encodeOrganizationBackup(state);
  assert.ok(new TextEncoder().encode(text).byteLength > 2 * 1024 * 1024);
  const result = storage.restoreOrganizationBackup(state, storage.decodeOrganizationBackup(text));
  assert.deepEqual(result.state, state);
  assert.equal(result.stats.assignmentCount, 50000);
});

test("실제 화면용 데모 상품은 첫 즐겨찾기 저장 뒤에도 모두 유지된다", async () => {
  const api = await freshStorage();
  const app = appContext(["demoState", "demoDownloadOptions", "persistState", "toggleFavorite"], api);
  api.useMemoryStorage(app.demoState());
  app.state = await api.loadState();
  assert.equal(app.state.items.length, 12);
  assert.equal(app.demoDownloadOptions(app.state.items[0]).length, 10);
  assert.equal(app.demoDownloadOptions(app.state.items[0])[0].detail, "25 MB");
  const assignments = structuredClone(app.state.assignments);
  const key = app.state.items[1].key;
  await app.toggleFavorite(key);
  assert.equal((await api.loadState()).items.length, 12);
  assert.ok(app.state.favorites.includes(key));
  assert.deepEqual(app.state.assignments, assignments);
});

test("백업 크기 제한은 UTF-8 바이트 기준으로 내보내기·가져오기에 공통 적용한다", () => {
  const limit = storage.MAX_ORGANIZATION_BACKUP_BYTES;
  assert.doesNotThrow(() => storage.assertBackupSize(limit));
  assert.throws(() => storage.assertBackupSize(limit + 1), /32MB/);
  const tooLarge = "가".repeat(Math.floor(limit / 3) + 1);
  assert.ok(tooLarge.length < limit);
  assert.throws(() => storage.decodeOrganizationBackup(tooLarge), /32MB/);
});

test("라이브러리의 정상 빈 목록만 허용하고 점검·구조 변경·빈 후속 페이지는 거부한다", () => {
  const valid = { title: "Library - BOOTH", hasMain: true, itemCount: 0, page: 1 };
  for (const text of ["No items purchased", "You have not downloaded any items yet", "아직 구매한 상품이 없습니다.", "ギフトはありません。", "Library is empty"]) {
    assert.doesNotThrow(() => assertLibraryPage({ ...valid, text }));
  }
  assert.doesNotThrow(() => assertLibraryPage({ ...valid, itemCount: 2 }));
  for (const invalid of [
    { title: "Maintenance - BOOTH", text: "Library is empty" },
    { hasMain: false, itemCount: 2 },
    { text: "Please try again later" },
    { text: "No items available during maintenance" },
    { text: "Library is empty", page: 2 },
  ]) {
    assert.throws(() => assertLibraryPage({ ...valid, ...invalid }), { code: "LIBRARY_PARSE_FAILED" });
  }
});

test("실제 라이브러리 파서는 비정상 200 응답을 빈 동기화 결과로 돌려주지 않는다", (t) => {
  replaceGlobal(t, "DOMParser", class {
    parseFromString() {
      return {
        querySelector: (selector) => selector === "title" ? { textContent: "Maintenance - BOOTH" } : null,
        querySelectorAll: () => [],
      };
    }
  });
  assert.throws(() => parseBoothLibraryPage("maintenance response", {
    source: "purchased", page: 1, pageUrl: "https://accounts.booth.pm/library?page=1",
  }), { code: "LIBRARY_PARSE_FAILED" });
});

test("미지원 제목 아래 여러 줄과 링크는 다음 지원 구역까지 제외한다", () => {
  for (const heading of ["미지원 아바타", "非対応モデル", "Unsupported Avatars"]) {
    assert.deepEqual(extractSupportedAvatarIds(`${heading}\nMaya\nマヌカ\nhttps://booth.pm/ja/items/8325804`), []);
    assert.deepEqual(extractSupportedAvatarIds(`${heading}\nMaya\nSupported Avatars\nMisaki`), ["misaki"]);
    assert.deepEqual(extractSupportedAvatarIds(`${heading}\nSupported Avatars: https://booth.pm/ja/items/8325804`), ["misaki"]);
  }
});

test("일본어 복합 검색은 아바타 단어만 추출해 지원 상품 전체로 확장하지 않는다", () => {
  assert.deepEqual(buildAvatarProfileIds("ミサキ"), ["misaki"]);
  for (const query of ["ミサキ 衣装", "みさき test", "ミサキ용 의상", "미사키 의상"]) {
    assert.deepEqual(buildAvatarProfileIds(query), []);
    assert.equal(buildSearchVariants(query).includes("misaki"), false);
  }
});

test("상품 설명을 못 읽으면 기존 지원 정보·시각을 유지하고 다음 동기화에서 다시 시도한다", async (t) => {
  let fetched = 0;
  replaceGlobal(t, "DOMParser", class {
    parseFromString() { return { querySelector: () => null, querySelectorAll: () => [] }; }
  });
  replaceGlobal(t, "fetch", async (url, options) => {
    fetched += 1;
    assert.equal(options.credentials, "omit");
    return { url, ok: true, text: async () => "no description" };
  });
  const old = {
    ...sampleState().items[0], supportedAvatarIds: ["maya"],
    supportIndexVersion: PRODUCT_SUPPORT_INDEX_VERSION - 1,
    supportIndexedAt: "2026-09-01T00:00:00.000Z",
  };
  const now = Date.parse("2026-09-05T00:00:00Z");
  const result = await indexBoothProductSupport([old], { now });
  assert.equal(result.failedCount, 1);
  assert.equal(result.scannedCount, 0);
  assert.deepEqual(result.items[0], old);
  assert.equal(isProductSupportIndexFresh(result.items[0], now), false);
  await indexBoothProductSupport(result.items, { now });
  assert.equal(fetched, 2);
});

test("자신의 파일명 저장 이벤트와 다른 창의 폴더 변경은 열린 다운로드를 유지한다", async (t) => {
  const { data } = installStorage(t, { [storage.STORAGE_KEY]: sampleState() });
  const api = await freshStorage();
  let listener;
  let rendered = 0;
  let restored = 0;
  const downloads = new Map([["product:101", { status: "ready", flipped: true, options: [{ label: "avatar.zip" }] }]]);
  const app = appContext(["bindStorageChanges", "pruneItemSelection"], {
    ...api,
    downloadCardStates: downloads,
    render: () => { rendered += 1; },
    restoreViewportPosition: (position) => { assert.equal(position.visibleLimit, 96); restored += 1; },
    chrome: { storage: { onChanged: { addListener: (callback) => { listener = callback; } } } },
  });
  app.bindStorageChanges();
  await api.updateState((latest) => ({
    ...latest, items: domain.setItemDownloadFiles(latest.items, "product:101", [{ label: "avatar.zip" }]),
  }));
  const ownValue = data[storage.STORAGE_KEY];
  await listener({ [storage.STORAGE_KEY]: { newValue: ownValue } }, "local");
  assert.equal(rendered, 0);
  assert.equal(downloads.get("product:101").flipped, true);
  const external = { ...ownValue, _writerId: "another-window", favorites: ["product:202"] };
  await listener({ [storage.STORAGE_KEY]: { newValue: external } }, "local");
  assert.equal(rendered, 1);
  assert.equal(restored, 2);
  assert.equal(app.ui.visibleLimit, 96);
  assert.equal(downloads.get("product:101").status, "ready");
  assert.equal(downloads.get("product:101").flipped, true);
  assert.deepEqual(app.state.favorites, ["product:202"]);
  await listener({ [storage.STORAGE_KEY]: { oldValue: external } }, "local");
  assert.equal(downloads.size, 0);
  assert.deepEqual(app.state.items, []);
});

test("지원 정보 저장 중 바뀐 파일명·즐겨찾기·폴더 배치를 이전 스냅샷으로 덮지 않는다", () => {
  const app = appContext(["mergeSupportIndex", "mergeSyncedItems"]);
  const original = sampleState();
  const indexed = original.items.map((item) => ({ ...item, supportedAvatarIds: ["misaki"], supportIndexVersion: 2 }));
  const latest = {
    ...original, favorites: ["product:101"], assignments: { "product:202": ["clothes"] },
    items: domain.setItemDownloadFiles(original.items, "product:101", [{ label: "new.zip" }]),
  };
  const merged = app.mergeSupportIndex(latest.items, indexed);
  assert.equal(merged[0].downloadFiles[0].label, "new.zip");
  assert.deepEqual(merged[0].supportedAvatarIds, ["misaki"]);
  const synced = app.mergeSyncedItems(latest, merged, "2026-09-05T00:00:00Z");
  assert.deepEqual(synced.favorites, latest.favorites);
  assert.deepEqual(structuredClone(synced.assignments), latest.assignments);
  assert.equal(latest.items[0].supportedAvatarIds?.includes("misaki") ?? false, false);
});
