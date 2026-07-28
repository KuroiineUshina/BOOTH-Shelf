import test from "node:test";
import assert from "node:assert/strict";

import {
  clearState,
  createOrganizationBackup,
  loadPreferences,
  loadSpendingSummary,
  loadState,
  replaceMemoryState,
  sanitizePreferences,
  sanitizeSpendingSummary,
  savePreferences,
  saveSpendingSummary,
  sanitizeState,
  restoreOrganizationBackup,
} from "../src/storage.js";

function validItem(overrides = {}) {
  return {
    key: "purchased:101",
    productId: "101",
    source: "purchased",
    title: "  안전한\n상품  ",
    sellerName: "Maker",
    sellerUrl: "https://maker.booth.pm/",
    imageUrl: "https://booth.pximg.net/c/300x300/i/101/image.jpg",
    productUrl: "https://booth.pm/ko/items/101",
    sourcePageUrl: "https://accounts.booth.pm/library?page=2",
    page: 2,
    orderOnPage: 3,
    globalOrder: 4,
    downloadFiles: [
      {
        label: " avatar_package_v2.zip ",
        detail: "42 MB",
        url: "https://booth.pm/downloadables/7001?variation_id=31",
      },
    ],
    ...overrides,
  };
}

test("저장 상태를 허용된 필드와 BOOTH URL로만 정규화한다", () => {
  const sanitized = sanitizeState({
    schemaVersion: 999,
    injected: "discard me",
    items: [
      validItem({
        productUrl: "javascript:alert(1)",
        imageUrl: "https://tracker.example/i/101/pixel.gif",
        sourcePageUrl: "https://phishing.example/library?page=2",
        extra: "discard me",
      }),
      validItem({
        key: "tampered",
        title: "중복 상품",
        productUrl: "javascript:alert(2)",
        imageUrl: "https://tracker.example/i/101/pixel-2.gif",
      }),
      validItem({ productId: "not-a-number", key: "purchased:not-a-number" }),
    ],
    folders: [
      { id: "root", name: " 루트 ", parentId: null, order: 0 },
      { id: "child", name: "자식", parentId: "root", order: 0 },
      { id: "grandchild", name: "손자", parentId: "child", order: 0 },
      { id: "too-deep", name: "깊이 초과", parentId: "grandchild", order: 0 },
      { id: "__proto__", name: "위험한 키", parentId: null, order: 0 },
    ],
    favorites: ["purchased:101", "purchased:101", "gift:999"],
    assignments: {
      "purchased:101": "child",
      "gift:999": "root",
    },
    lastSyncedAt: "not-a-date",
  });

  assert.equal(sanitized.schemaVersion, 3);
  assert.equal("injected" in sanitized, false);
  assert.equal(sanitized.items.length, 1);
  assert.equal(sanitized.items[0].title, "안전한 상품");
  assert.equal(sanitized.items[0].productUrl, "");
  assert.equal(sanitized.items[0].imageUrl, "");
  assert.equal(sanitized.items[0].sourcePageUrl, "https://accounts.booth.pm/library?page=2");
  assert.equal("extra" in sanitized.items[0], false);
  assert.equal(sanitized.items[0].key, "product:101");
  assert.deepEqual(sanitized.items[0].sources, ["purchased"]);
  assert.deepEqual(sanitized.items[0].downloadFiles, [{
    label: "avatar_package_v2.zip",
    detail: "42 MB",
  }]);
  assert.equal("url" in sanitized.items[0].downloadFiles[0], false);
  assert.deepEqual(sanitized.favorites, ["product:101"]);
  assert.deepEqual(sanitized.assignments, { "product:101": "child" });
  assert.equal(sanitized.folders.some((folder) => folder.id === "__proto__"), false);
  assert.equal(sanitized.folders.find((folder) => folder.id === "too-deep").parentId, null);
  assert.equal(sanitized.lastSyncedAt, null);
});

test("이전 버전의 같은 구매·기프트 상품과 정리 상태를 한 카드로 마이그레이션한다", () => {
  const sanitized = sanitizeState({
    schemaVersion: 1,
    items: [
      validItem(),
      validItem({
        key: "gift:101",
        source: "gift",
        sourcePageUrl: "https://accounts.booth.pm/library/gifts?page=7",
        page: 7,
        orderOnPage: 2,
        globalOrder: 22,
      }),
    ],
    folders: [
      { id: "purchase-folder", name: "구매", parentId: null, order: 0 },
      { id: "gift-folder", name: "선물", parentId: null, order: 1 },
    ],
    favorites: ["gift:101"],
    assignments: {
      "gift:101": "gift-folder",
      "purchased:101": "purchase-folder",
    },
  });

  assert.equal(sanitized.items.length, 1);
  assert.equal(sanitized.items[0].key, "product:101");
  assert.deepEqual(sanitized.items[0].sources, ["purchased", "gift"]);
  assert.deepEqual(
    sanitized.items[0].locations.map(({ source, page }) => ({ source, page })),
    [
      { source: "purchased", page: 2 },
      { source: "gift", page: 7 },
    ],
  );
  assert.deepEqual(sanitized.favorites, ["product:101"]);
  assert.deepEqual(sanitized.assignments, { "product:101": "purchase-folder" });
});

test("무료 다운로드 출처와 라이브러리 위치를 보존한다", () => {
  const sanitized = sanitizeState({
    items: [
      validItem({
        key: "free:101",
        source: "free",
        sourcePageUrl: "https://accounts.booth.pm/library/free_downloads?page=5",
        page: 5,
      }),
    ],
    favorites: ["free:101"],
  });

  assert.equal(sanitized.items[0].key, "product:101");
  assert.deepEqual(sanitized.items[0].sources, ["free"]);
  assert.equal(
    sanitized.items[0].sourcePageUrl,
    "https://accounts.booth.pm/library/free_downloads?page=5",
  );
  assert.deepEqual(sanitized.favorites, ["product:101"]);
});

test("정리 데이터 백업은 상품 목록 없이 폴더·배치·즐겨찾기만 내보낸다", () => {
  const backup = createOrganizationBackup({
    items: [validItem()],
    folders: [{ id: "avatar", name: "아바타", parentId: null, order: 0 }],
    favorites: ["purchased:101"],
    assignments: { "purchased:101": "avatar" },
    lastSyncedAt: "2026-07-27T00:00:00.000Z",
  }, new Date("2026-07-27T01:02:03.000Z"));

  assert.equal(backup.format, "booth-shelf-organization");
  assert.equal(backup.version, 1);
  assert.equal(backup.exportedAt, "2026-07-27T01:02:03.000Z");
  assert.equal("items" in backup.data, false);
  assert.equal("lastSyncedAt" in backup.data, false);
  assert.deepEqual(backup.data.favorites, ["product:101"]);
  assert.deepEqual(backup.data.assignments, { "product:101": "avatar" });
});

test("정리 데이터 복원은 현재 상품 목록을 보존하고 일치하는 상품만 연결한다", () => {
  const current = sanitizeState({
    items: [validItem()],
    folders: [{ id: "old", name: "이전 폴더", parentId: null, order: 0 }],
    favorites: [],
    assignments: {},
    lastSyncedAt: "2026-07-27T00:00:00.000Z",
  });
  const restored = restoreOrganizationBackup(current, {
    format: "booth-shelf-organization",
    version: 1,
    exportedAt: "2026-07-27T01:02:03.000Z",
    data: {
      folders: [{ id: "avatar", name: "아바타", parentId: null, order: 0 }],
      favorites: ["product:101", "product:999"],
      assignments: {
        "product:101": "avatar",
        "product:999": "avatar",
      },
    },
  });

  assert.equal(restored.state.items.length, 1);
  assert.equal(restored.state.items[0].productId, "101");
  assert.equal(restored.state.lastSyncedAt, "2026-07-27T00:00:00.000Z");
  assert.deepEqual(restored.state.folders.map((folder) => folder.id), ["avatar"]);
  assert.deepEqual(restored.state.favorites, ["product:101"]);
  assert.deepEqual(restored.state.assignments, { "product:101": "avatar" });
  assert.deepEqual(restored.stats, {
    folderCount: 1,
    favoriteCount: 1,
    assignmentCount: 1,
    skippedItemCount: 1,
  });
});

test("정리 데이터 복원은 형식 오류와 동기화 전 상품 배치를 차단한다", () => {
  assert.throws(
    () => restoreOrganizationBackup(sanitizeState({}), { format: "not-a-backup" }),
    /백업 파일이 아닙니다/,
  );
  assert.throws(
    () => restoreOrganizationBackup(sanitizeState({}), {
      format: "booth-shelf-organization",
      version: 1,
      data: {
        folders: [],
        favorites: ["product:101"],
        assignments: {},
      },
    }),
    /먼저 라이브러리를 전체 동기화/,
  );
});

test("전체 삭제는 메모리 저장소도 기본 상태로 되돌린다", async () => {
  replaceMemoryState({ items: [validItem()] });
  await savePreferences({ theme: "dark" });
  await saveSpendingSummary({
    totals: { JPY: 123456 },
    orderCount: 42,
    freeOrderCount: 3,
    scannedAt: "2026-07-19T00:00:00.000Z",
  });
  assert.equal((await loadState()).items.length, 1);
  assert.equal((await loadPreferences()).theme, "dark");
  assert.equal((await loadSpendingSummary()).totals.JPY, 123456);

  const cleared = await clearState();
  assert.deepEqual(cleared.items, []);
  assert.deepEqual((await loadState()).items, []);
  assert.equal((await loadPreferences()).theme, "light");
  assert.equal(await loadSpendingSummary(), null);
});

test("테마와 결제 합계 캐시는 허용된 값만 저장한다", () => {
  assert.deepEqual(
    sanitizePreferences({ theme: "dark", locale: "ja", injected: true }),
    { theme: "dark", locale: "ja" },
  );
  assert.deepEqual(
    sanitizePreferences({ theme: "system", locale: "invalid" }),
    { theme: "light", locale: "auto" },
  );

  const summary = sanitizeSpendingSummary({
    totals: { JPY: 1200, USD: 3.5, bad: 999, EUR: -1 },
    orderCount: 2,
    freeOrderCount: 1,
    scannedAt: "2026-07-19T00:00:00.000Z",
    orderIds: ["secret"],
  });
  assert.deepEqual(summary.totals, { JPY: 1200, USD: 3.5 });
  assert.equal("orderIds" in summary, false);
});
