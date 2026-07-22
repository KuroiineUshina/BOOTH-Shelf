export const MAX_FOLDER_DEPTH = 3;

const collator = new Intl.Collator(["ko", "ja", "en"], {
  numeric: true,
  sensitivity: "base",
});

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .trim();
}

export function itemHasSource(item, source) {
  if (!item || !["purchased", "gift"].includes(source)) return false;
  const sources = Array.isArray(item.sources) && item.sources.length
    ? item.sources
    : [item.source];
  return sources.includes(source);
}

export function filterItems(items, filters = {}) {
  const {
    query = "",
    searchField = "all",
    source = "all",
    folderId = "all",
    favoritesOnly = false,
    favorites = [],
    assignments = {},
  } = filters;

  const normalizedQuery = normalizeText(query);
  const favoriteSet = favorites instanceof Set ? favorites : new Set(favorites);

  return items.filter((item) => {
    if (source !== "all" && !itemHasSource(item, source)) return false;
    if (favoritesOnly && !favoriteSet.has(item.key)) return false;

    const assignedFolderId = assignments[item.key] ?? null;
    if (folderId === "unfiled" && assignedFolderId !== null) return false;
    if (folderId !== "all" && folderId !== "unfiled" && assignedFolderId !== folderId) {
      return false;
    }

    if (!normalizedQuery) return true;

    const title = normalizeText(item.title);
    const seller = normalizeText(item.sellerName);

    if (searchField === "title") return title.includes(normalizedQuery);
    if (searchField === "seller") return seller.includes(normalizedQuery);
    return title.includes(normalizedQuery) || seller.includes(normalizedQuery);
  });
}

export function sortItems(items, sort = "purchase") {
  const result = [...items];

  if (sort === "title-asc") {
    return result.sort((left, right) => collator.compare(left.title, right.title));
  }

  if (sort === "title-desc") {
    return result.sort((left, right) => collator.compare(right.title, left.title));
  }

  return result.sort((left, right) => {
    const sourceOrder = (left.globalOrder ?? Number.MAX_SAFE_INTEGER)
      - (right.globalOrder ?? Number.MAX_SAFE_INTEGER);
    if (sourceOrder !== 0) return sourceOrder;
    return collator.compare(left.title, right.title);
  });
}

export function setItemFolderAssignment(items, folders, assignments, itemKey, folderId) {
  const item = items.find((candidate) => candidate.key === itemKey);
  if (!item) throw new Error("상품을 찾을 수 없어요.");

  const normalizedFolderId = folderId || null;
  if (normalizedFolderId && !folders.some((folder) => folder.id === normalizedFolderId)) {
    throw new Error("폴더를 찾을 수 없어요.");
  }

  const nextAssignments = Object.fromEntries(
    Object.entries(assignments ?? {}).filter(([assignedItemKey]) => assignedItemKey !== itemKey),
  );
  if (normalizedFolderId) nextAssignments[itemKey] = normalizedFolderId;
  return nextAssignments;
}

export function folderDepth(folders, folderId) {
  if (!folderId) return 0;

  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const visited = new Set();
  let depth = 0;
  let currentId = folderId;

  while (currentId) {
    if (visited.has(currentId)) return Number.POSITIVE_INFINITY;
    visited.add(currentId);

    const folder = byId.get(currentId);
    if (!folder) return Number.POSITIVE_INFINITY;
    depth += 1;
    currentId = folder.parentId ?? null;
  }

  return depth;
}

export function getDescendantIds(folders, folderId) {
  const childrenByParent = new Map();
  for (const folder of folders) {
    const parentId = folder.parentId ?? null;
    const children = childrenByParent.get(parentId) ?? [];
    children.push(folder.id);
    childrenByParent.set(parentId, children);
  }

  const descendants = new Set();
  const queue = [...(childrenByParent.get(folderId) ?? [])];

  while (queue.length) {
    const id = queue.shift();
    if (descendants.has(id)) continue;
    descendants.add(id);
    queue.push(...(childrenByParent.get(id) ?? []));
  }

  return descendants;
}

export function subtreeHeight(folders, folderId) {
  const childrenByParent = new Map();
  for (const folder of folders) {
    const parentId = folder.parentId ?? null;
    const children = childrenByParent.get(parentId) ?? [];
    children.push(folder.id);
    childrenByParent.set(parentId, children);
  }

  function height(id, visited = new Set()) {
    if (visited.has(id)) return Number.POSITIVE_INFINITY;
    const nextVisited = new Set(visited).add(id);
    const children = childrenByParent.get(id) ?? [];
    if (!children.length) return 1;
    return 1 + Math.max(...children.map((childId) => height(childId, nextVisited)));
  }

  return height(folderId);
}

export function canMoveFolder(folders, folderId, newParentId) {
  if (!folders.some((folder) => folder.id === folderId)) return false;
  if (folderId === newParentId) return false;
  if (newParentId && !folders.some((folder) => folder.id === newParentId)) return false;

  const descendants = getDescendantIds(folders, folderId);
  if (newParentId && descendants.has(newParentId)) return false;

  const parentDepth = newParentId ? folderDepth(folders, newParentId) : 0;
  const height = subtreeHeight(folders, folderId);
  return Number.isFinite(parentDepth) && Number.isFinite(height)
    && parentDepth + height <= MAX_FOLDER_DEPTH;
}

export function createFolder(folders, { name, parentId = null, id, createdAt }) {
  const trimmedName = String(name ?? "").trim();
  if (!trimmedName) throw new Error("폴더 이름을 입력해 주세요.");
  if (trimmedName.length > 40) throw new Error("폴더 이름은 40자 이하로 입력해 주세요.");
  if (parentId && folderDepth(folders, parentId) >= MAX_FOLDER_DEPTH) {
    throw new Error("폴더는 3계층까지만 만들 수 있어요.");
  }

  const siblings = folders.filter((folder) => (folder.parentId ?? null) === parentId);
  if (siblings.some((folder) => normalizeText(folder.name) === normalizeText(trimmedName))) {
    throw new Error("같은 위치에 동일한 이름의 폴더가 있어요.");
  }

  return [
    ...folders,
    {
      id: id ?? crypto.randomUUID(),
      name: trimmedName,
      parentId,
      order: siblings.length,
      createdAt: createdAt ?? new Date().toISOString(),
    },
  ];
}

export function renameFolder(folders, folderId, name) {
  const current = folders.find((folder) => folder.id === folderId);
  if (!current) throw new Error("폴더를 찾을 수 없어요.");

  const trimmedName = String(name ?? "").trim();
  if (!trimmedName) throw new Error("폴더 이름을 입력해 주세요.");
  if (trimmedName.length > 40) throw new Error("폴더 이름은 40자 이하로 입력해 주세요.");

  const hasDuplicate = folders.some((folder) => (
    folder.id !== folderId
      && (folder.parentId ?? null) === (current.parentId ?? null)
      && normalizeText(folder.name) === normalizeText(trimmedName)
  ));
  if (hasDuplicate) throw new Error("같은 위치에 동일한 이름의 폴더가 있어요.");

  return folders.map((folder) => (
    folder.id === folderId ? { ...folder, name: trimmedName } : folder
  ));
}

export function moveFolder(folders, folderId, newParentId) {
  const parentId = newParentId || null;
  if (!canMoveFolder(folders, folderId, parentId)) {
    throw new Error("해당 위치로 폴더를 이동할 수 없어요.");
  }

  const siblingCount = folders.filter((folder) => (
    folder.id !== folderId && (folder.parentId ?? null) === parentId
  )).length;

  return folders.map((folder) => (
    folder.id === folderId
      ? { ...folder, parentId, order: siblingCount }
      : folder
  ));
}

export function deleteFolderAndPromote(folders, assignments, folderId) {
  const target = folders.find((folder) => folder.id === folderId);
  if (!target) throw new Error("폴더를 찾을 수 없어요.");

  const promotedParentId = target.parentId ?? null;
  const nextFolders = folders
    .filter((folder) => folder.id !== folderId)
    .map((folder) => (
      folder.parentId === folderId
        ? { ...folder, parentId: promotedParentId }
        : folder
    ));

  const nextAssignments = Object.fromEntries(
    Object.entries(assignments).map(([itemKey, assignedFolderId]) => [
      itemKey,
      assignedFolderId === folderId ? promotedParentId : assignedFolderId,
    ]),
  );

  return { folders: nextFolders, assignments: nextAssignments };
}

export function buildFolderTree(folders, parentId = null) {
  return folders
    .filter((folder) => (folder.parentId ?? null) === parentId)
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || collator.compare(left.name, right.name))
    .map((folder) => ({
      ...folder,
      children: buildFolderTree(folders, folder.id),
    }));
}

export function getFolderPath(folders, folderId) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path = [];
  const visited = new Set();
  let currentId = folderId;

  while (currentId) {
    if (visited.has(currentId)) return [];
    visited.add(currentId);
    const folder = byId.get(currentId);
    if (!folder) return [];
    path.unshift(folder);
    currentId = folder.parentId ?? null;
  }

  return path;
}
