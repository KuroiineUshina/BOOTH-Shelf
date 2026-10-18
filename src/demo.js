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

export function demoCart() {
  const samples = [
    ["Lumen Atelier", [["Moonlit Wardrobe", "Chiffon / Lime", 1800]]],
    ["Velvet Thread", [["Winter Coat Set", "", 2500], ["Knit Beret", "All avatars", 600]]],
    ["Frame Picnic", [["Idle Motion Pack Vol.2", "", 1200]]],
    ["Plain Bloom", [["Bob Hair Variants", "Manuka", 990], ["Twin Tail Hair", "Manuka", 990]]],
  ];
  let itemNumber = 0;
  return samples.map(([name, items], shopIndex) => {
    const url = `https://demo-cart-shop-${shopIndex + 1}.booth.pm/`;
    const shop = {
      id: String(800000 + shopIndex),
      name,
      url,
      cartUrl: `${url.slice(0, -1)}/cart`,
      currency: "JPY",
      unavailable: false,
      items: [],
    };
    shop.items = items.map(([title, variationName, price]) => {
      itemNumber += 1;
      // The first sample reuses an owned demo item so the "already owned" badge shows.
      const productId = itemNumber === 1 ? "990000000001" : String(980000000000 + itemNumber);
      return {
        key: `cart:${700000 + itemNumber}`,
        cartItemId: String(700000 + itemNumber),
        productId,
        title,
        variationName,
        price,
        currency: "JPY",
        quantity: 1,
        imageUrl: itemNumber === 1 ? "assets/icon128.png" : "",
        productUrl: "https://booth.pm/",
        productCategoryId: 209,
        shopName: name,
        isGift: itemNumber === 3,
        unavailable: itemNumber === 5,
      };
    });
    shop.subtotal = shop.items.reduce((sum, item) => sum + item.price, 0);
    return shop;
  });
}

export function demoWishlist() {
  const samples = [
    // Owned demo items: the wishlist view leaves these out.
    ["990000000002", "Soft Motion Presets", "Frame Picnic", 1200, false],
    ["990000000005", "Glass Garden Props", "Tiny Orbit", 800, false],
    // Also in the demo cart: hidden until "Include cart" is on.
    ["980000000002", "Winter Coat Set", "Velvet Thread", 2500, false],
    ["970000000001", "Starlight Dress", "Lumen Atelier", 2200, true],
    ["970000000002", "Rainy Day Raincoat", "Velvet Thread", 1500, false],
    ["970000000003", "Neon Room World", "Blue Hour", 3000, false],
    ["970000000004", "Cat Ear Headphones", "Fine Loop", 500, true],
    ["970000000005", "Retired Summer Set", "Cider Closet", 900, false],
  ];
  return samples.map(([productId, title, shopName, price, priceFrom], index) => ({
    key: `wish:${productId}`,
    productId,
    title,
    variationName: "",
    price,
    currency: "JPY",
    priceFrom,
    quantity: 1,
    imageUrl: "",
    productUrl: "https://booth.pm/",
    shopName,
    shopUrl: `https://demo-wish-shop-${index + 1}.booth.pm/`,
    isGift: false,
    unavailable: index === samples.length - 1,
  }));
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
