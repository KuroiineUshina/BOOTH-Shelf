import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_FOLDER_DEPTH,
  canMoveFolder,
  createFolder,
  deleteFolderAndPromote,
  filterItems,
  folderDepth,
  getDescendantIds,
  itemHasSource,
  moveFolder,
  renameFolder,
  setItemFolderAssignment,
  sortItems,
} from "../src/domain.js";

const folders = [
  { id: "root", name: "아바타", parentId: null, order: 0 },
  { id: "child", name: "의상", parentId: "root", order: 0 },
  { id: "grandchild", name: "캐주얼", parentId: "child", order: 0 },
  { id: "tools", name: "툴", parentId: null, order: 1 },
];

test("폴더 깊이는 최상위부터 1~3으로 계산한다", () => {
  assert.equal(folderDepth(folders, "root"), 1);
  assert.equal(folderDepth(folders, "child"), 2);
  assert.equal(folderDepth(folders, "grandchild"), MAX_FOLDER_DEPTH);
});

test("3계층 폴더 아래에는 새 폴더를 만들 수 없다", () => {
  assert.throws(
    () => createFolder(folders, { name: "너무 깊음", parentId: "grandchild", id: "too-deep" }),
    /3계층/,
  );
});

test("같은 위치의 폴더 이름 중복을 막는다", () => {
  assert.throws(
    () => createFolder(folders, { name: " 아바타 ", id: "duplicate" }),
    /동일한 이름/,
  );
  assert.throws(() => renameFolder(folders, "tools", "아바타"), /동일한 이름/);
});

test("폴더를 자신의 하위 또는 깊이 제한을 넘는 위치로 옮길 수 없다", () => {
  assert.equal(canMoveFolder(folders, "root", "grandchild"), false);
  assert.equal(canMoveFolder(folders, "child", "tools"), true);
  assert.equal(canMoveFolder(folders, "root", "tools"), false);
  assert.deepEqual([...getDescendantIds(folders, "root")].sort(), ["child", "grandchild"]);
});

test("유효한 이동은 부모를 바꾼다", () => {
  const moved = moveFolder(folders, "child", "tools");
  assert.equal(moved.find((folder) => folder.id === "child").parentId, "tools");
  assert.equal(folderDepth(moved, "grandchild"), 3);
});

test("폴더 삭제 시 하위 폴더와 상품 배치를 한 단계 위로 보존한다", () => {
  const result = deleteFolderAndPromote(folders, {
    "purchased:1": "child",
    "gift:2": "grandchild",
  }, "child");

  assert.equal(result.folders.some((folder) => folder.id === "child"), false);
  assert.equal(result.folders.find((folder) => folder.id === "grandchild").parentId, "root");
  assert.equal(result.assignments["purchased:1"], "root");
  assert.equal(result.assignments["gift:2"], "grandchild");
});

test("상품을 폴더에 넣거나 미분류로 옮길 때 기존 배치를 변경하지 않는다", () => {
  const items = [{ key: "purchased:1" }, { key: "gift:2" }];
  const assignments = { "purchased:1": "root" };

  const moved = setItemFolderAssignment(items, folders, assignments, "purchased:1", "tools");
  assert.deepEqual(moved, { "purchased:1": "tools" });
  assert.deepEqual(assignments, { "purchased:1": "root" });

  const unfiled = setItemFolderAssignment(items, folders, moved, "purchased:1", null);
  assert.deepEqual(unfiled, {});
});

test("존재하지 않는 상품이나 폴더로의 배치를 차단한다", () => {
  const items = [{ key: "purchased:1" }];
  assert.throws(
    () => setItemFolderAssignment(items, folders, {}, "missing", "root"),
    /상품을 찾을 수 없어요/,
  );
  assert.throws(
    () => setItemFolderAssignment(items, folders, {}, "purchased:1", "missing"),
    /폴더를 찾을 수 없어요/,
  );
});

test("상품명·판매자·출처·즐겨찾기·폴더 필터를 조합한다", () => {
  const items = [
    { key: "purchased:1", title: "Moon Dress", sellerName: "Lumen", source: "purchased" },
    { key: "gift:2", title: "Garden Prop", sellerName: "Tiny Orbit", source: "gift" },
    { key: "purchased:3", title: "Garden Hair", sellerName: "Lumen", source: "purchased" },
    { key: "product:4", title: "Twin Avatar Set", sellerName: "Orbit", source: "purchased", sources: ["purchased", "gift"] },
  ];

  assert.deepEqual(filterItems(items, { query: "garden" }).map((item) => item.key), ["gift:2", "purchased:3"]);
  assert.deepEqual(filterItems(items, { query: "lumen", searchField: "seller" }).map((item) => item.key), ["purchased:1", "purchased:3"]);
  assert.deepEqual(
    filterItems([{ key: "avatar", title: "아바타 의상", sellerName: "상점" }], { query: "dkqkxk" }).map((item) => item.key),
    ["avatar"],
  );
  assert.deepEqual(filterItems(items, { source: "gift" }).map((item) => item.key), ["gift:2", "product:4"]);
  assert.deepEqual(filterItems(items, { source: "purchased" }).map((item) => item.key), ["purchased:1", "purchased:3", "product:4"]);
  assert.equal(itemHasSource(items[3], "gift"), true);
  assert.deepEqual(filterItems(items, { favoritesOnly: true, favorites: ["purchased:3"] }).map((item) => item.key), ["purchased:3"]);
  assert.deepEqual(filterItems(items, { folderId: "unfiled", assignments: { "gift:2": "world" } }).map((item) => item.key), ["purchased:1", "purchased:3", "product:4"]);
});

test("구매순과 이름순을 각각 오름·내림차순으로 정렬한다", () => {
  const items = [
    { key: "3", title: "상품 10", globalOrder: 2 },
    { key: "1", title: "상품 2", globalOrder: 0 },
    { key: "2", title: "Apple", globalOrder: 1 },
  ];

  assert.deepEqual(sortItems(items, { purchase: "asc", name: "off" }).map((item) => item.key), ["1", "2", "3"]);
  assert.deepEqual(sortItems(items, { purchase: "desc", name: "off" }).map((item) => item.key), ["3", "2", "1"]);
  assert.deepEqual(sortItems(items, { purchase: "off", name: "asc" }).map((item) => item.key), ["1", "3", "2"]);
  assert.deepEqual(sortItems(items, { purchase: "off", name: "desc" }).map((item) => item.key), ["2", "3", "1"]);
});

test("두 정렬이 모두 꺼진 입력은 구매순 오름차순으로 복구한다", () => {
  const items = [
    { key: "later", title: "나중", globalOrder: 3 },
    { key: "first", title: "먼저", globalOrder: 0 },
  ];
  assert.deepEqual(
    sortItems(items, { purchase: "off", name: "off" }).map((item) => item.key),
    ["first", "later"],
  );
});
