import test from "node:test";
import assert from "node:assert/strict";

import {
  extractFreeDownloadOptions,
  indexBoothProductSupport,
  isProductSupportIndexFresh,
  loadBoothDownloadOptions,
} from "../src/booth.js";
import { mergeSupportIndex } from "../src/domain.js";

// Shape of BOOTH's public item JSON for an item with a free variation and
// paid "support" variations (only the free one carries downloadable files).
function itemJson(productId = 4943457) {
  return {
    id: productId,
    name: "【無料】Sample Pack",
    description: "VRChat向けの無料素材です。",
    category: { id: 134, name: "素材（その他）", parent: { name: "素材データ" } },
    shop: { name: "Sample Atelier" },
    variations: [
      {
        id: 8310278,
        name: "無償版",
        price: 0,
        status: "free_download",
        downloadable: {
          musics: [],
          no_musics: [
            { name: "Sample_v1.01.zip", file_size: "16.4 MB", url: "https://booth.pm/downloadables/3550585?variation_id=8310278" },
            { name: "Evil.zip", file_size: "1 MB", url: "https://example.com/downloadables/1" },
          ],
        },
      },
      { id: 8310371, name: "ご支援版", price: 100, status: "addable_to_cart", downloadable: null },
    ],
  };
}

function replaceGlobal(t, name, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, name, original);
    else delete globalThis[name];
  });
}

function serveItemJson(t, fetched) {
  replaceGlobal(t, "fetch", async (url, options) => {
    fetched.push({ path: new URL(url).pathname, credentials: options.credentials });
    return { url, ok: true, text: async () => JSON.stringify(itemJson()) };
  });
}

test("무료 다운로드 버전의 파일만 BOOTH 주소로 골라낸다", () => {
  assert.deepEqual(extractFreeDownloadOptions(itemJson()), [{
    id: "3550585",
    label: "Sample_v1.01.zip",
    detail: "16.4 MB",
    url: "https://booth.pm/downloadables/3550585?variation_id=8310278",
  }]);
  assert.deepEqual(extractFreeDownloadOptions({ variations: [{ status: "addable_to_cart", downloadable: null }] }), []);
  assert.deepEqual(extractFreeDownloadOptions(null), []);
});

test("무료 보관함 상품은 상품 JSON에서 파일 목록을 읽는다", async (t) => {
  const fetched = [];
  serveItemJson(t, fetched);
  const options = await loadBoothDownloadOptions({
    productId: "4943457",
    source: "free",
    sources: ["free"],
    locations: [{ source: "free", sourcePageUrl: "https://accounts.booth.pm/library/free_downloads?page=1", page: 1 }],
  });
  assert.deepEqual(options.map((option) => option.label), ["Sample_v1.01.zip"]);
  // Only the public item JSON is read, without the BOOTH login cookies.
  assert.deepEqual(fetched, [{ path: "/ja/items/4943457.json", credentials: "omit" }]);
});

test("지원 아바타 확인 때 무료 상품의 파일명을 채워 검색되게 한다", async (t) => {
  const fetched = [];
  serveItemJson(t, fetched);
  const now = Date.parse("2026-10-21T00:00:00Z");
  const free = {
    key: "product:4943457", productId: "4943457", source: "free", sources: ["free"],
    title: "【無料】Sample Pack", downloadFiles: [],
  };
  const result = await indexBoothProductSupport([free], { now });
  assert.deepEqual(result.items[0].downloadFiles, [{ label: "Sample_v1.01.zip", detail: "16.4 MB" }]);
  assert.equal(isProductSupportIndexFresh(result.items[0], now), true);
  // A free item indexed before file names were read is checked again.
  assert.equal(isProductSupportIndexFresh({ ...result.items[0], downloadFiles: [] }, now), false);

  const merged = mergeSupportIndex([free], result.items);
  assert.deepEqual(merged[0].downloadFiles, [{ label: "Sample_v1.01.zip", detail: "16.4 MB" }]);
  // File names from a library page always win over the JSON copy.
  const purchased = { ...free, downloadFiles: [{ label: "Library.zip", detail: "" }] };
  assert.deepEqual(mergeSupportIndex([purchased], result.items)[0].downloadFiles, purchased.downloadFiles);
});
