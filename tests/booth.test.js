import test from "node:test";
import assert from "node:assert/strict";

import {
  extractProductId,
  getOrdersPageNumber,
  getPageNumber,
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
  assert.equal(getPageNumber("https://example.com/library?page=3", "/library"), null);
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
