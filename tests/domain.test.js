import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_FOLDER_DEPTH,
  canMoveFolder,
  createCategory,
  createFolder,
  deleteCategoryAndReleaseFolders,
  deleteFolderAndPromote,
  filterItems,
  folderDepth,
  getDescendantIds,
  getItemFolderIds,
  itemHasSource,
  matchingDownloadFiles,
  moveFolder,
  reorderSortPriority,
  renameCategory,
  renameFolder,
  setItemDownloadFiles,
  setItemFolderAssignment,
  setItemFolderAssignments,
  setItemsFolderAssignment,
  sortItems,
  toggleCategoryCollapsed,
  updateSortMode,
} from "../src/domain.js";

const folders = [
  { id: "root", name: "아바타", parentId: null, order: 0 },
  { id: "child", name: "의상", parentId: "root", order: 0 },
  { id: "grandchild", name: "캐주얼", parentId: "child", order: 0 },
  { id: "tools", name: "툴", parentId: null, order: 1 },
];

test("카테고리를 만들고 이름과 접힘 상태를 관리한다", () => {
  const created = createCategory([], {
    id: "avatars",
    name: " 아바타 ",
    createdAt: "2026-08-08T00:00:00.000Z",
  });
  assert.deepEqual(created, [{
    id: "avatars",
    name: "아바타",
    order: 0,
    collapsed: false,
    createdAt: "2026-08-08T00:00:00.000Z",
  }]);

  const renamed = renameCategory(created, "avatars", "캐릭터");
  assert.equal(renamed[0].name, "캐릭터");
  assert.equal(toggleCategoryCollapsed(renamed, "avatars")[0].collapsed, true);
  assert.throws(
    () => createCategory(renamed, { id: "duplicate", name: " 캐릭터 " }),
    /동일한 이름/,
  );
});

test("카테고리는 폴더 계층 밖에 있고 삭제해도 안의 폴더를 보존한다", () => {
  const categorizedFolders = [
    { id: "avatar-root", name: "의상", parentId: null, categoryId: "avatars", order: 0 },
    { id: "avatar-child", name: "캐주얼", parentId: "avatar-root", categoryId: null, order: 0 },
    { id: "world-root", name: "의상", parentId: null, categoryId: "worlds", order: 0 },
  ];
  const result = deleteCategoryAndReleaseFolders(
    [
      { id: "avatars", name: "아바타", collapsed: false },
      { id: "worlds", name: "월드", collapsed: false },
    ],
    categorizedFolders,
    "avatars",
  );

  assert.deepEqual(result.categories.map((category) => category.id), ["worlds"]);
  assert.equal(result.folders.find((folder) => folder.id === "avatar-root").categoryId, null);
  assert.equal(result.folders.find((folder) => folder.id === "avatar-child").parentId, "avatar-root");
  assert.equal(result.folders.find((folder) => folder.id === "world-root").categoryId, "worlds");
});

test("서로 다른 카테고리의 최상위 폴더는 같은 이름을 쓸 수 있고 카테고리 간 이동할 수 있다", () => {
  const initial = createFolder([], {
    id: "avatar-clothes",
    name: "의상",
    categoryId: "avatars",
  });
  const withWorldFolder = createFolder(initial, {
    id: "world-clothes",
    name: "의상",
    categoryId: "worlds",
  });
  assert.throws(
    () => createFolder(withWorldFolder, {
      id: "duplicate",
      name: "의상",
      categoryId: "avatars",
    }),
    /동일한 이름/,
  );

  const moved = moveFolder(withWorldFolder, "avatar-clothes", null, "tools");
  assert.equal(moved.find((folder) => folder.id === "avatar-clothes").categoryId, "tools");
  assert.equal(folderDepth(moved, "avatar-clothes"), 1);
});

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
    "purchased:1": ["child", "tools"],
    "gift:2": ["grandchild"],
    "product:3": ["root", "child"],
  }, "child");

  assert.equal(result.folders.some((folder) => folder.id === "child"), false);
  assert.equal(result.folders.find((folder) => folder.id === "grandchild").parentId, "root");
  assert.deepEqual(result.assignments["purchased:1"], ["root", "tools"]);
  assert.deepEqual(result.assignments["gift:2"], ["grandchild"]);
  assert.deepEqual(result.assignments["product:3"], ["root"]);
});

test("상품의 여러 폴더 배치를 한 번에 편집하고 기존 입력은 변경하지 않는다", () => {
  const items = [{ key: "purchased:1" }, { key: "gift:2" }];
  const assignments = { "purchased:1": ["root"] };

  const classified = setItemFolderAssignments(
    items,
    folders,
    assignments,
    "purchased:1",
    ["root", "tools", "tools"],
  );
  assert.deepEqual(classified, { "purchased:1": ["root", "tools"] });
  assert.deepEqual(assignments, { "purchased:1": ["root"] });
  assert.deepEqual(getItemFolderIds(classified, "purchased:1"), ["root", "tools"]);

  const single = setItemFolderAssignment(items, folders, classified, "purchased:1", "tools");
  assert.deepEqual(single, { "purchased:1": ["tools"] });
  const unfiled = setItemFolderAssignment(items, folders, single, "purchased:1", null);
  assert.deepEqual(unfiled, {});
});

test("선택한 여러 상품을 기존 분류를 유지한 채 같은 폴더에도 추가한다", () => {
  const items = [
    { key: "product:1" },
    { key: "product:2" },
    { key: "product:3" },
  ];
  const assignments = {
    "product:1": ["root"],
    "product:3": ["child"],
  };

  const moved = setItemsFolderAssignment(
    items,
    folders,
    assignments,
    ["product:1", "product:2", "product:2"],
    "tools",
  );
  assert.deepEqual(moved, {
    "product:1": ["root", "tools"],
    "product:3": ["child"],
    "product:2": ["tools"],
  });
  assert.deepEqual(assignments, {
    "product:1": ["root"],
    "product:3": ["child"],
  });

  assert.deepEqual(
    setItemsFolderAssignment(items, folders, moved, ["product:1", "product:2"], null),
    { "product:3": ["child"] },
  );
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
  const assignments = { "gift:2": ["world", "root"] };
  assert.deepEqual(filterItems(items, { folderId: "unfiled", assignments }).map((item) => item.key), ["purchased:1", "purchased:3", "product:4", "free:5"]);
  assert.deepEqual(filterItems(items, { folderId: "world", assignments }).map((item) => item.key), ["gift:2"]);
  assert.deepEqual(filterItems(items, { folderId: "root", assignments }).map((item) => item.key), ["gift:2"]);
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
    {
      key: "product:4",
      title: "Stay Over Rose",
      sellerName: "Another Shop",
      downloadFiles: [{ label: "Stay_Over_Rose_Misaki.zip", detail: "BOOTH 다운로드" }],
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
    assert.deepEqual(filterItems(items, { query }).map((item) => item.key), ["product:3", "product:4"], query);
  }
  assert.deepEqual(
    filterItems(items, { query: "misaki", searchField: "download" }).map((item) => item.key),
    ["product:3", "product:4"],
  );
  assert.deepEqual(
    matchingDownloadFiles(items[3], "misaki").map((file) => file.label),
    ["Stay_Over_Rose_Misaki.zip"],
  );
});

test("Misaki 검색이 변환 문자열 내부의 Maya 대응 상품을 잘못 찾지 않는다", () => {
  const items = [{
    key: "product:ribbon-long-hair",
    title: "[MANUKA/舞夜/Shinra/ウルフェリア] Ribbon Long Hair",
    sellerName: "TOYO",
    downloadFiles: [],
  }];

  assert.deepEqual(filterItems(items, { query: "misaki." }), []);
  assert.deepEqual(filterItems(items, { query: "마야" }).map((item) => item.key), [
    "product:ribbon-long-hair",
  ]);
});

test("akdi는 마야로만 인식하고 Misaki 상품과 파일을 찾지 않는다", () => {
  const items = [
    {
      key: "product:misaki-avatar",
      title: "오리지널 3D 모델 해소-Misaki-",
      sellerName: "VISION TOKYO",
      downloadFiles: [{ label: "Misaki_VRM_V1.01.zip", detail: "24 MB" }],
    },
    {
      key: "product:misaki-outfit",
      title: "Stay Over Rose",
      sellerName: "SONOFUKU",
      downloadFiles: [{ label: "Stay_Over_Rose_Misaki.zip", detail: "20 MB" }],
    },
    {
      key: "product:maya-outfit",
      title: "舞夜 Maya Casual Outfit",
      sellerName: "Maya Shop",
      downloadFiles: [{ label: "Maya_Casual.zip", detail: "18 MB" }],
    },
  ];

  assert.deepEqual(filterItems(items, { query: "akdi" }).map((item) => item.key), [
    "product:maya-outfit",
  ]);
  assert.deepEqual(filterItems(items, { query: "마야" }).map((item) => item.key), [
    "product:maya-outfit",
  ]);
  assert.deepEqual(
    filterItems(items, { query: "akdi", searchField: "download" }).map((item) => item.key),
    ["product:maya-outfit"],
  );
});

test("상품명과 파일명에 없어도 상품 설명에서 확인한 지원 아바타로 검색한다", () => {
  const items = [{
    key: "product:description-only",
    title: "Ribbon Long Hair",
    sellerName: "TOYO",
    downloadFiles: [{ label: "ribbon-hair.zip", detail: "20 MB" }],
    supportedAvatarIds: ["misaki"],
  }];

  for (const query of ["Misaki", "미사키", "ミサキ", "海咲"]) {
    assert.deepEqual(filterItems(items, { query }).map((item) => item.key), [
      "product:description-only",
    ]);
  }
  assert.deepEqual(filterItems(items, { query: "마야" }), []);
  assert.deepEqual(filterItems(items, { query: "미사키", searchField: "title" }), []);
});

test("카드에서 새로 확인한 다운로드 파일명을 검색용 상품 데이터에 반영한다", () => {
  const items = [{
    key: "product:rose",
    title: "Stay Over Rose",
    sellerName: "Another Shop",
    downloadFiles: [],
  }];
  const updated = setItemDownloadFiles(items, "product:rose", [
    { label: "Stay_Over_Rose_Misaki.zip", detail: "24 MB", url: "https://booth.pm/downloadables/1" },
    { label: "Stay_Over_Rose_Misaki.zip", detail: "24 MB", url: "https://booth.pm/downloadables/2" },
  ]);

  assert.notEqual(updated, items);
  assert.deepEqual(updated[0].downloadFiles, [
    { label: "Stay_Over_Rose_Misaki.zip", detail: "24 MB" },
  ]);
  assert.equal("url" in updated[0].downloadFiles[0], false);
  assert.deepEqual(
    filterItems(updated, { query: "misaki", searchField: "download" }).map((item) => item.key),
    ["product:rose"],
  );
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

test("구매순과 이름순을 동시에 켜면 지정한 우선순위대로 모두 적용한다", () => {
  const items = [
    { key: "b-first", title: "B", globalOrder: 0 },
    { key: "a-first", title: "A", globalOrder: 1 },
    { key: "c", title: "C", globalOrder: 2 },
    { key: "a-later", title: "A", globalOrder: 3 },
  ];

  assert.deepEqual(
    sortItems(
      items,
      { purchase: "desc", name: "asc" },
      ["name", "purchase"],
    ).map((item) => item.key),
    ["a-later", "a-first", "b-first", "c"],
  );
  assert.deepEqual(
    sortItems(
      items,
      { purchase: "asc", name: "desc" },
      ["purchase", "name"],
    ).map((item) => item.key),
    ["b-first", "a-first", "c", "a-later"],
  );
});

test("정렬 드롭다운은 둘 다 켤 수 있고 드래그로 정한 우선순위를 유지한다", () => {
  const initial = {
    sort: { purchase: "asc", name: "off" },
    lastSortDirection: { purchase: "asc", name: "asc" },
    sortPriority: ["purchase", "name"],
  };
  const bothEnabled = updateSortMode(
    initial.sort,
    initial.lastSortDirection,
    "name",
    "desc",
    initial.sortPriority,
  );
  assert.deepEqual(bothEnabled.sort, { purchase: "asc", name: "desc" });
  assert.deepEqual(bothEnabled.sortPriority, ["purchase", "name"]);

  const purchaseDisabled = updateSortMode(
    bothEnabled.sort,
    bothEnabled.lastSortDirection,
    "purchase",
    "off",
    bothEnabled.sortPriority,
  );
  assert.deepEqual(purchaseDisabled.sort, { purchase: "off", name: "desc" });
  assert.deepEqual(purchaseDisabled.sortPriority, ["purchase", "name"]);

  const attemptedBothOff = updateSortMode(
    purchaseDisabled.sort,
    purchaseDisabled.lastSortDirection,
    "name",
    "off",
    purchaseDisabled.sortPriority,
  );
  assert.deepEqual(attemptedBothOff.sort, { purchase: "asc", name: "off" });
  assert.deepEqual(attemptedBothOff.sortPriority, ["purchase", "name"]);
});

test("구매순과 이름순을 끌어 놓은 위치에 맞춰 우선순위를 바꾼다", () => {
  assert.deepEqual(
    reorderSortPriority(["purchase", "name"], "purchase", "name"),
    ["name", "purchase"],
  );
  assert.deepEqual(
    reorderSortPriority(["name", "purchase"], "purchase", "name"),
    ["purchase", "name"],
  );
  assert.deepEqual(
    reorderSortPriority(["name"], "missing", "purchase"),
    ["name", "purchase"],
  );
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
