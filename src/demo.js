import { t } from "./i18n.js";

export function demoState() {
  const categories = [
    { id: "avatar-assets", name: "아바타 에셋", order: 0, collapsed: false, createdAt: "2025-12-30T00:00:00.000Z" },
    { id: "utilities", name: "도구와 월드", order: 1, collapsed: false, createdAt: "2025-12-31T00:00:00.000Z" },
  ];
  const folders = [
    { id: "avatars", name: "아바타", parentId: null, categoryId: "avatar-assets", order: 0, createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "clothes", name: "의상", parentId: "avatars", categoryId: null, order: 0, createdAt: "2026-01-02T00:00:00.000Z" },
    { id: "casual", name: "캐주얼", parentId: "clothes", categoryId: null, order: 0, createdAt: "2026-01-03T00:00:00.000Z" },
    { id: "tools", name: "툴", parentId: null, categoryId: "utilities", order: 0, createdAt: "2026-01-04T00:00:00.000Z" },
    { id: "world", name: "월드 소품", parentId: null, categoryId: "utilities", order: 1, createdAt: "2026-01-05T00:00:00.000Z" },
  ];

  const samples = [
    ["Moonlit Wardrobe", "Lumen Atelier", "purchased"],
    ["Soft Motion Presets", "Frame Picnic", "purchased"],
    ["Cloud Room Collection", "Mellow Works", "gift"],
    ["Everyday Hair Pack", "Plain Bloom", "purchased"],
    ["Glass Garden Props", "Tiny Orbit", "gift"],
    ["Studio Light Toolkit", "North Window", "purchased"],
    ["Sunday Knit Set", "Cider Closet", "purchased"],
    ["Paper Town Miniatures", "Little Draft", "gift"],
    ["Warm Skin Materials", "Peach Lab", "purchased"],
    ["Quiet Cafe World", "Blue Hour", "purchased"],
    ["Ribbon Accessory Kit", "Fine Loop", "gift"],
    ["ミルティナ Casual Set", "Mono Tools", "free"],
  ];

  const categories3d = [
    [209, "3D衣装"], [216, "3Dモーション・アニメーション"], [127, "3Dモデル（その他）"],
    [230, "3D髪型"], [210, "3D小道具"], [215, "3Dツール・システム"], [209, "3D衣装"],
    [210, "3D小道具"], [214, "3Dテクスチャ"], [127, "3Dモデル（その他）"], [217, "3D装飾品"],
    [209, "3D衣装"],
  ];
  const items = samples.map(([title, sellerName, source], index) => ({
    productCategory: { id: categories3d[index][0], name: categories3d[index][1], parentName: "3Dモデル" },
    key: `product:${990000000001 + index}`,
    productId: String(990000000001 + index),
    source,
    sources: index === 0 ? ["purchased", "gift"] : [source],
    title,
    sellerName,
    sellerUrl: `https://demo-seller-${index + 1}.booth.pm/`,
    imageUrl: index === 0 ? "assets/icon128.png" : "",
    productUrl: "https://booth.pm/",
    sourcePageUrl: source === "gift"
      ? "https://accounts.booth.pm/library/gifts?page=1"
      : source === "free"
        ? "https://accounts.booth.pm/library/free_downloads?page=1"
        : "https://accounts.booth.pm/library?page=1",
    page: 1,
    orderOnPage: index,
    globalOrder: index,
    downloadFiles: Array.from({ length: index === 0 ? 4 : (index % 3) + 1 }, (_, fileIndex) => ({
      label: `${title.replace(/\s+/gu, "_")}_${fileIndex + 1}.zip`,
      detail: `${18 + (index * 7) + (fileIndex * 11)} MB`,
    })),
    locations: [
      {
        source,
        sourcePageUrl: source === "gift"
          ? "https://accounts.booth.pm/library/gifts?page=1"
          : source === "free"
            ? "https://accounts.booth.pm/library/free_downloads?page=1"
            : "https://accounts.booth.pm/library?page=1",
        page: 1,
        orderOnPage: index,
        globalOrder: index,
      },
      ...(index === 0 ? [{
        source: "gift",
        sourcePageUrl: "https://accounts.booth.pm/library/gifts?page=1",
        page: 1,
        orderOnPage: index,
        globalOrder: index,
      }] : []),
    ],
  }));

  return {
    schemaVersion: 6,
    items,
    categories,
    folders,
    favorites: [items[0].key, items[4].key, items[8].key],
    assignments: {
      [items[0].key]: ["clothes", "casual"],
      [items[3].key]: ["avatars"],
      [items[5].key]: ["tools"],
      [items[6].key]: ["casual"],
      [items[9].key]: ["world"],
      [items[11].key]: ["tools"],
    },
    lastSyncedAt: "2026-07-19T06:20:00.000Z",
  };
}

export function demoDownloadOptions(item) {
  const sampleNumber = (Number.parseInt(String(item.productId).replace(/\D/g, ""), 10) % 1000) || 1;
  const optionCount = sampleNumber === 1 ? 10 : (sampleNumber % 3) + 1;
  return Array.from({ length: optionCount }, (_, index) => ({
    id: `demo-${sampleNumber}-${index + 1}`,
    label: t("{title} {kind}.zip", {
      title: item.title,
      kind: index ? t("추가 파일 {number}", { number: index + 1 }) : t("메인 파일"),
    }),
    detail: `${18 + (sampleNumber * 7) + (index * 13)} MB`,
    url: `https://booth.pm/downloadables/${9_000_000 + (sampleNumber * 20) + index}?variation_id=${sampleNumber}`,
  }));
}
