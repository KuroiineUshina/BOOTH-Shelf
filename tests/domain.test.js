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
  matchingDownloadFiles,
  moveFolder,
  renameFolder,
  setItemFolderAssignment,
  setItemsFolderAssignment,
  sortItems,
  updateSortMode,
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

test("선택한 여러 상품을 한 번에 같은 폴더로 옮긴다", () => {
  const items = [
    { key: "product:1" },
    { key: "product:2" },
    { key: "product:3" },
  ];
  const assignments = {
    "product:1": "root",
    "product:3": "child",
  };

  const moved = setItemsFolderAssignment(
    items,
    folders,
    assignments,
    ["product:1", "product:2", "product:2"],
    "tools",
  );
  assert.deepEqual(moved, {
    "product:3": "child",
    "product:1": "tools",
    "product:2": "tools",
  });
  assert.deepEqual(assignments, {
    "product:1": "root",
    "product:3": "child",
  });
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
    { key: "free:5", title: "Free Tool", sellerName: "Orbit", source: "free" },
  ];

  assert.deepEqual(filterItems(items, { query: "garden" }).map((item) => item.key), ["gift:2", "purchased:3"]);
  assert.deepEqual(filterItems(items, { query: "lumen", searchField: "seller" }).map((item) => item.key), ["purchased:1", "purchased:3"]);
  assert.deepEqual(
    filterItems([{ key: "avatar", title: "아바타 의상", sellerName: "상점" }], { query: "dkqkxk" }).map((item) => item.key),
    ["avatar"],
  );
  assert.deepEqual(filterItems(items, { source: "gift" }).map((item) => item.key), ["gift:2", "product:4"]);
  assert.deepEqual(filterItems(items, { source: "purchased" }).map((item) => item.key), ["purchased:1", "purchased:3", "product:4"]);
  assert.deepEqual(filterItems(items, { source: "free" }).map((item) => item.key), ["free:5"]);
  assert.equal(itemHasSource(items[4], "free"), true);
  assert.equal(itemHasSource(items[3], "gift"), true);
  assert.deepEqual(filterItems(items, { favoritesOnly: true, favorites: ["purchased:3"] }).map((item) => item.key), ["purchased:3"]);
  assert.deepEqual(filterItems(items, { folderId: "unfiled", assignments: { "gift:2": "world" } }).map((item) => item.key), ["purchased:1", "purchased:3", "product:4", "free:5"]);
});

test("아바타 별칭과 다운로드 파일명을 제안 없이 바로 검색한다", () => {
  const items = [
    {
      key: "product:1",
      title: "ミルティナ Casual Set",
      sellerName: "衣装工房",
      downloadFiles: [
        { label: "Milltina_body_texture.psd", detail: "28 MB" },
        { label: "readme.txt", detail: "2 KB" },
      ],
    },
    {
      key: "product:2",
      title: "別の商品",
      sellerName: "ショップ",
      downloadFiles: [{ label: "manuka_patch_v2.zip", detail: "14 MB" }],
    },
    {
      key: "product:3",
      title: "海咲-Misaki- Outfit",
      sellerName: "VISION TOKYO",
      downloadFiles: [{ label: "misaki_outfit.unitypackage", detail: "24 MB" }],
    },
  ];

  for (const query of ["Milltina", "밀티나", "ミルティナ"]) {
    assert.deepEqual(filterItems(items, { query }).map((item) => item.key), ["product:1"], query);
  }
  assert.deepEqual(
    filterItems(items, { query: "patch_v2", searchField: "download" }).map((item) => item.key),
    ["product:2"],
  );
  assert.deepEqual(
    matchingDownloadFiles(items[0], "밀티나").map((file) => file.label),
    ["Milltina_body_texture.psd"],
  );
  for (const query of ["Misaki", "미사키", "ミサキ", "みさき", "海咲"]) {
    assert.deepEqual(filterItems(items, { query }).map((item) => item.key), ["product:3"], query);
  }
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

test("구매순과 이름순을 동시에 켜면 이름순 뒤에 구매순을 적용한다", () => {
  const items = [
    { key: "b-first", title: "B", globalOrder: 0 },
    { key: "a-first", title: "A", globalOrder: 1 },
    { key: "c", title: "C", globalOrder: 2 },
    { key: "a-later", title: "A", globalOrder: 3 },
  ];

  assert.deepEqual(
    sortItems(items, { purchase: "desc", name: "asc" }).map((item) => item.key),
    ["a-later", "a-first", "b-first", "c"],
  );
  assert.deepEqual(
    sortItems(items, { purchase: "asc", name: "desc" }).map((item) => item.key),
    ["c", "b-first", "a-first", "a-later"],
  );
});

test("정렬 드롭다운은 둘 다 켤 수 있고 둘 다 꺼지는 것만 막는다", () => {
  const initial = {
    sort: { purchase: "asc", name: "off" },
    lastSortDirection: { purchase: "asc", name: "asc" },
  };
  const bothEnabled = updateSortMode(
    initial.sort,
    initial.lastSortDirection,
    "name",
    "desc",
  );
  assert.deepEqual(bothEnabled.sort, { purchase: "asc", name: "desc" });

  const purchaseDisabled = updateSortMode(
    bothEnabled.sort,
    bothEnabled.lastSortDirection,
    "purchase",
    "off",
  );
  assert.deepEqual(purchaseDisabled.sort, { purchase: "off", name: "desc" });

  const attemptedBothOff = updateSortMode(
    purchaseDisabled.sort,
    purchaseDisabled.lastSortDirection,
    "name",
    "off",
  );
  assert.deepEqual(attemptedBothOff.sort, { purchase: "asc", name: "off" });
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
