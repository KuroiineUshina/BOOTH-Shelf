import test from "node:test";
import assert from "node:assert/strict";

import {
  SOURCES,
  extractProductId,
  getOrdersPageNumber,
  getPageNumber,
  groupBoothLibraryItems,
  summarizeBoothOrderDetails,
} from "../src/booth.js";

test("다국어 BOOTH 상품 URL에서 상품 ID를 읽는다", () => {
  assert.equal(extractProductId("https://booth.pm/ko/items/7234297"), "7234297");
  assert.equal(extractProductId("/ja/items/12345", "https://booth.pm"), "12345");
  assert.equal(extractProductId("https://example.com/items/not-a-number"), null);
  assert.equal(extractProductId("https://example.com/items/12345"), null);
  assert.equal(extractProductId("http://booth.pm/items/12345"), null);
});

test("라이브러리 경로가 일치하는 페이지 번호만 읽는다", () => {
  assert.equal(getPageNumber("/library?page=26", "/library"), 26);
  assert.equal(getPageNumber("/library", "/library"), 1);
  assert.equal(getPageNumber("/library/gifts?page=3", "/library/gifts"), 3);
  assert.equal(getPageNumber("/library/gifts?page=3", "/library"), null);
  assert.equal(getPageNumber("/library/free_downloads?page=6", "/library/free_downloads"), 6);
  assert.equal(getPageNumber("https://example.com/library?page=3", "/library"), null);
  assert.deepEqual(SOURCES.map(({ id }) => id), ["purchased", "gift", "free"]);
});

test("같은 상품의 구매·기프트 위치를 카드 하나에 모두 보존한다", () => {
  const grouped = groupBoothLibraryItems([
    {
      productId: "101",
      source: "free",
      title: "아바타 대응 의상",
      sellerName: "Maker",
      sourcePageUrl: "https://accounts.booth.pm/library/free_downloads?page=3",
      page: 3,
      orderOnPage: 1,
      globalOrder: 15,
      downloadFiles: [
        { label: "Trial-avatar.zip", detail: "8 MB" },
      ],
    },
    {
      productId: "101",
      source: "purchased",
      title: "아바타 대응 의상",
      sellerName: "Maker",
      sellerUrl: "https://maker.booth.pm/",
      imageUrl: "https://booth.pximg.net/c/300x300/i/101/image.jpg",
      productUrl: "https://booth.pm/ko/items/101",
      sourcePageUrl: "https://accounts.booth.pm/library?page=2",
      page: 2,
      orderOnPage: 4,
      globalOrder: 3,
      downloadFiles: [
        { label: "A-avatar.zip", detail: "10 MB" },
      ],
    },
    {
      productId: "101",
      source: "gift",
      title: "아바타 대응 의상",
      sellerName: "Maker",
      sellerUrl: "https://maker.booth.pm/",
      imageUrl: "https://booth.pximg.net/c/300x300/i/101/image.jpg",
      productUrl: "https://booth.pm/ko/items/101",
      sourcePageUrl: "https://accounts.booth.pm/library/gifts?page=4",
      page: 4,
      orderOnPage: 1,
      globalOrder: 9,
      downloadFiles: [
        { label: "B-avatar.zip", detail: "12 MB" },
      ],
    },
    {
      productId: "101",
      source: "purchased",
      title: "아바타 대응 의상",
      sellerName: "Maker",
      sourcePageUrl: "https://accounts.booth.pm/library?page=5",
      page: 5,
      orderOnPage: 2,
      globalOrder: 12,
      downloadFiles: [
        { label: "A-avatar.zip", detail: "10 MB" },
      ],
    },
  ]);

  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].key, "product:101");
  assert.deepEqual(grouped[0].sources, ["purchased", "gift", "free"]);
  assert.deepEqual(
    grouped[0].locations.map(({ source, page }) => ({ source, page })),
    [
      { source: "purchased", page: 2 },
      { source: "purchased", page: 5 },
      { source: "gift", page: 4 },
      { source: "free", page: 3 },
    ],
  );
  assert.equal(grouped[0].globalOrder, 3);
  assert.deepEqual(grouped[0].downloadFiles, [
    { label: "Trial-avatar.zip", detail: "8 MB" },
    { label: "A-avatar.zip", detail: "10 MB" },
    { label: "B-avatar.zip", detail: "12 MB" },
  ]);
});

test("구매 내역 페이지 번호는 orders 목록에서만 읽는다", () => {
  assert.equal(getOrdersPageNumber("/orders?page=14"), 14);
  assert.equal(getOrdersPageNumber("/orders"), 1);
  assert.equal(getOrdersPageNumber("/orders/83065237"), null);
  assert.equal(getOrdersPageNumber("/orders?page=2&keyword=test"), null);
});

test("완료 주문 결제 금액은 주문 번호별로 한 번만 합산한다", () => {
  const summary = summarizeBoothOrderDetails([
    { orderId: "9001", completed: true, money: { amount: 800, currency: "JPY" } },
    { orderId: "9001", completed: true, money: { amount: 800, currency: "JPY" } },
    { orderId: "9002", completed: true, money: { amount: 0, currency: "JPY" } },
    { orderId: "9003", completed: false, money: null },
    { orderId: "9004", completed: true, money: { amount: 5, currency: "USD" } },
  ], "2026-07-19T00:00:00.000Z");

  assert.deepEqual(summary.totals, { JPY: 800, USD: 5 });
  assert.equal(summary.orderCount, 3);
  assert.equal(summary.freeOrderCount, 1);
});
