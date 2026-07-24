import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOrderDetailUrl,
  buildOrdersPageUrl,
  buildSourcePageUrl,
  getBoothOrderId,
  getBoothProductId,
  isAllowedOrdersUrl,
  sanitizeImageUrl,
  sanitizeDownloadUrl,
  sanitizeProductUrl,
  sanitizeSellerUrl,
  sanitizeSourcePageUrl,
} from "../src/urls.js";

test("상품과 판매자 URL은 HTTPS BOOTH 도메인만 허용한다", () => {
  assert.equal(getBoothProductId("https://booth.pm/ko/items/123"), "123");
  assert.equal(getBoothProductId("https://evil.example/items/123"), null);
  assert.equal(getBoothProductId("http://booth.pm/items/123"), null);
  assert.equal(sanitizeProductUrl("https://booth.pm/ko/items/123", "123"), "https://booth.pm/ko/items/123");
  assert.equal(sanitizeProductUrl("https://booth.pm/ko/items/999", "123"), "");
  assert.equal(sanitizeSellerUrl("https://maker.booth.pm/"), "https://maker.booth.pm/");
  assert.equal(sanitizeSellerUrl("https://accounts.booth.pm/"), "");
});

test("썸네일과 출처 페이지 URL을 정확한 허용 목록으로 제한한다", () => {
  assert.equal(
    sanitizeImageUrl("https://booth.pximg.net/c/300x300/i/123/image.jpg", "123"),
    "https://booth.pximg.net/c/300x300/i/123/image.jpg",
  );
  assert.equal(sanitizeImageUrl("https://tracker.example/i/123/pixel.gif", "123"), "");
  assert.equal(sanitizeImageUrl("https://booth.pximg.net/c/300x300/i/999/image.jpg", "123"), "");
  assert.equal(buildSourcePageUrl("gift", 4), "https://accounts.booth.pm/library/gifts?page=4");
  assert.equal(
    buildSourcePageUrl("free", 3),
    "https://accounts.booth.pm/library/free_downloads?page=3",
  );
  assert.equal(
    sanitizeSourcePageUrl(
      "https://accounts.booth.pm/library/free_downloads?page=7",
      "free",
      1,
    ),
    "https://accounts.booth.pm/library/free_downloads?page=7",
  );
  assert.equal(
    sanitizeSourcePageUrl("https://evil.example/library?page=4", "purchased", 2),
    "https://accounts.booth.pm/library?page=2",
  );
});

test("다운로드 URL은 BOOTH의 다운로드 엔드포인트만 허용한다", () => {
  assert.equal(
    sanitizeDownloadUrl("https://booth.pm/downloadables/12345?variation_id=99#ignored"),
    "https://booth.pm/downloadables/12345?variation_id=99",
  );
  assert.equal(
    sanitizeDownloadUrl("/downloadables/54321", "https://accounts.booth.pm/library"),
    "https://accounts.booth.pm/downloadables/54321",
  );
  assert.equal(sanitizeDownloadUrl("https://booth.pm/items/12345"), "");
  assert.equal(sanitizeDownloadUrl("https://evil.example/downloadables/12345"), "");
  assert.equal(sanitizeDownloadUrl("javascript:alert(1)"), "");
});

test("구매 내역 URL은 목록과 숫자 주문 상세만 허용한다", () => {
  assert.equal(buildOrdersPageUrl(4), "https://accounts.booth.pm/orders?page=4");
  assert.equal(buildOrderDetailUrl("83065237"), "https://accounts.booth.pm/orders/83065237");
  assert.equal(getBoothOrderId("/orders/83065237"), "83065237");
  assert.equal(isAllowedOrdersUrl("https://accounts.booth.pm/orders?page=14"), true);
  assert.equal(isAllowedOrdersUrl("https://accounts.booth.pm/orders/83065237"), true);
  assert.equal(isAllowedOrdersUrl("https://accounts.booth.pm/orders?keyword=secret"), false);
  assert.equal(isAllowedOrdersUrl("https://evil.example/orders/83065237"), false);
});
