import test from "node:test";
import assert from "node:assert/strict";

import { parseBoothProductData } from "../src/booth.js";
import { filterItems } from "../src/domain.js";
import { productCategoryLabel } from "../src/product-categories.js";
import { sanitizeState } from "../src/storage.js";

test("상품 JSON의 BOOTH 카테고리를 번호·이름·상위 이름으로 읽는다", () => {
  const parsed = parseBoothProductData(JSON.stringify({
    id: 101,
    name: "Sample Outfit",
    description: "",
    shop: { name: "Shop" },
    category: { id: 209, name: "3D衣装", parent: { name: "3Dモデル", url: "https://booth.pm/ja/browse/x" } },
  }), { productId: "101" });
  assert.deepEqual(parsed.category, { id: 209, name: "3D衣装", parentName: "3Dモデル" });

  const categoryOf = (category) => parseBoothProductData(JSON.stringify({
    id: 101, name: "Sample", description: "", category,
  }), { productId: "101" }).category;
  for (const category of [undefined, null, { id: 0, name: "x" }, { id: 209, name: " " }, { id: "abc", name: "x" }]) {
    assert.equal(categoryOf(category), null);
  }
  // BOOTH IDs are numeric; a numeric string is accepted, without a parent name.
  assert.deepEqual(categoryOf({ id: "209", name: "3D衣装" }), { id: 209, name: "3D衣装", parentName: "" });
});

test("저장 상태는 올바른 상품 카테고리만 보존한다", () => {
  const base = { productId: "101", source: "purchased", title: "Item" };
  const [kept] = sanitizeState({ items: [{
    ...base, productCategory: { id: 209, name: " 3D衣装 ", parentName: "3Dモデル", extra: "x" },
  }] }).items;
  assert.deepEqual(kept.productCategory, { id: 209, name: "3D衣装", parentName: "3Dモデル" });
  for (const productCategory of [null, { id: -1, name: "x" }, { id: 1.5, name: "x" }, { id: 3, name: "" }, "209"]) {
    assert.equal(sanitizeState({ items: [{ ...base, productCategory }] }).items[0].productCategory, null);
  }
});

test("알려진 카테고리는 한국어·영어로, 일본어와 모르는 카테고리는 BOOTH 이름으로 표시한다", () => {
  const outfit = { id: 209, name: "3D衣装", parentName: "3Dモデル" };
  assert.equal(productCategoryLabel(outfit, "ko"), "3D 의상");
  assert.equal(productCategoryLabel(outfit, "en"), "3D outfits");
  assert.equal(productCategoryLabel(outfit, "ja"), "3D衣装");
  assert.equal(productCategoryLabel({ id: 99999, name: "新カテゴリ" }, "ko"), "新カテゴリ");
  assert.equal(productCategoryLabel(null, "ko"), "");
});

test("종류는 전체 검색과 종류 검색에서 한국어·영어·일본어 이름으로 찾는다", () => {
  const item = (productId, title, productCategory) => ({
    key: `product:${productId}`, productId, title, sellerName: "Shop", source: "purchased", productCategory,
  });
  const items = [
    item("1", "Moonlit Wardrobe", { id: 209, name: "3D衣装", parentName: "3Dモデル" }),
    item("2", "Ribbon Hair", { id: 230, name: "3D髪型", parentName: "3Dモデル" }),
    item("3", "Outfit Texture Pack", { id: 214, name: "3Dテクスチャ", parentName: "3Dモデル" }),
    item("4", "Unknown Item", null),
  ];
  const keys = (query, searchField = "all") => filterItems(items, { query, searchField }).map((entry) => entry.productId);

  assert.deepEqual(keys("3D 의상", "kind"), ["1"]);
  assert.deepEqual(keys("衣装", "kind"), ["1"]);
  assert.deepEqual(keys("outfit", "kind"), ["1"]);
  assert.deepEqual(keys("헤어", "kind"), ["2"]);
  // The parent "3Dモデル" is not searchable, so it does not match every item.
  assert.deepEqual(keys("モデル", "kind"), []);
  // The combined search adds type matches to title matches.
  assert.deepEqual(keys("outfit"), ["1", "3"]);
  assert.deepEqual(keys("의상", "title"), []);
});
