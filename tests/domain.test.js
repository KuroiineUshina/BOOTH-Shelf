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
  moveFolder,
  renameFolder,
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

test("상품명·판매자·출처·즐겨찾기·폴더 필터를 조합한다", () => {
  const items = [
    { key: "purchased:1", title: "Moon Dress", sellerName: "Lumen", source: "purchased" },
    { key: "gift:2", title: "Garden Prop", sellerName: "Tiny Orbit", source: "gift" },
    { key: "purchased:3", title: "Garden Hair", sellerName: "Lumen", source: "purchased" },
  ];

  assert.deepEqual(filterItems(items, { query: "garden" }).map((item) => item.key), ["gift:2", "purchased:3"]);
  assert.deepEqual(filterItems(items, { query: "lumen", searchField: "seller" }).map((item) => item.key), ["purchased:1", "purchased:3"]);
  assert.deepEqual(filterItems(items, { source: "gift" }).map((item) => item.key), ["gift:2"]);
  assert.deepEqual(filterItems(items, { favoritesOnly: true, favorites: ["purchased:3"] }).map((item) => item.key), ["purchased:3"]);
  assert.deepEqual(filterItems(items, { folderId: "unfiled", assignments: { "gift:2": "world" } }).map((item) => item.key), ["purchased:1", "purchased:3"]);
});

test("구매순과 이름 오름·내림차순을 정렬한다", () => {
  const items = [
    { key: "3", title: "상품 10", globalOrder: 2 },
    { key: "1", title: "상품 2", globalOrder: 0 },
    { key: "2", title: "Apple", globalOrder: 1 },
  ];

  assert.deepEqual(sortItems(items, "purchase").map((item) => item.key), ["1", "2", "3"]);
  assert.deepEqual(sortItems(items, "title-asc").map((item) => item.key), ["1", "3", "2"]);
  assert.deepEqual(sortItems(items, "title-desc").map((item) => item.key), ["2", "3", "1"]);
});
