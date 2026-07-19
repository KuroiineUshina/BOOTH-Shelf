import test from "node:test";
import assert from "node:assert/strict";

import {
  clearState,
  loadPreferences,
  loadSpendingSummary,
  loadState,
  replaceMemoryState,
  sanitizePreferences,
  sanitizeSpendingSummary,
  savePreferences,
  saveSpendingSummary,
  sanitizeState,
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
      validItem({ key: "tampered", title: "중복 상품" }),
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

  assert.equal(sanitized.schemaVersion, 1);
  assert.equal("injected" in sanitized, false);
  assert.equal(sanitized.items.length, 1);
  assert.equal(sanitized.items[0].title, "안전한 상품");
  assert.equal(sanitized.items[0].productUrl, "");
  assert.equal(sanitized.items[0].imageUrl, "");
  assert.equal(sanitized.items[0].sourcePageUrl, "https://accounts.booth.pm/library?page=2");
  assert.equal("extra" in sanitized.items[0], false);
  assert.deepEqual(sanitized.favorites, ["purchased:101"]);
  assert.deepEqual(sanitized.assignments, { "purchased:101": "child" });
  assert.equal(sanitized.folders.some((folder) => folder.id === "__proto__"), false);
  assert.equal(sanitized.folders.find((folder) => folder.id === "too-deep").parentId, null);
  assert.equal(sanitized.lastSyncedAt, null);
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
  assert.deepEqual(sanitizePreferences({ theme: "dark", injected: true }), { theme: "dark" });
  assert.deepEqual(sanitizePreferences({ theme: "system" }), { theme: "light" });

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
