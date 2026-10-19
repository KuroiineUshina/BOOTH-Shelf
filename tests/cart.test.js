import test from "node:test";
import assert from "node:assert/strict";

import {
  BoothAuthError,
  isBoothSignedInPage,
  loadBoothCart,
  loadBoothWishlist,
  parseBoothCartsData,
  parseBoothWishlistData,
} from "../src/booth.js";
import {
  buildCartsDataUrl,
  buildShopCartUrl,
  buildWishlistDataUrl,
  isAllowedCartsDataUrl,
  isAllowedCartsPageUrl,
  isAllowedWishlistDataUrl,
} from "../src/urls.js";

function cartEntry({ id, shop = "maker", items }) {
  return {
    id,
    errors: {},
    subtotal: "2,500 JPY",
    number_subtotal: 2500,
    quantity: items.length,
    shop: {
      subdomain: shop,
      name: `Shop ${shop}`,
      base_url: `https://${shop}.booth.pm/`,
      cart_url: `https://${shop}.booth.pm/cart?via=market`,
      checkout_url: "https://checkout.booth.pm/checkout/step1?uuid=secret-token",
    },
    deleted_cart_items: [],
    cart_items: items,
  };
}

function cartItem({ id, productId, price = 2500, quantity = 1, errors = {}, shop = "maker" }) {
  return {
    id,
    quantity,
    errors,
    boost: "0 JPY",
    is_gift: false,
    number_boost: 0,
    item: {
      id: productId,
      name: `  Item\n${productId}  `,
      category_id: 209,
      url: `https://${shop}.booth.pm/items/${productId}`,
      price: `${price.toLocaleString("en-US")} JPY`,
      number_price: price,
      primary_image: `https://booth.pximg.net/c/72x72_a2_g5/uuid/i/${productId}/image_base_resized.jpg`,
    },
    variation: { id: 1, type: "digital", name: "Chiffon / Lime", full_name: "Item - Chiffon / Lime" },
  };
}

test("장바구니 주소는 booth.pm의 carts.json과 숫자 커서만 허용한다", () => {
  assert.equal(buildCartsDataUrl(), "https://booth.pm/carts.json");
  assert.equal(buildCartsDataUrl("134744511"), "https://booth.pm/carts.json?lt_id=134744511");
  assert.equal(buildCartsDataUrl("1; drop"), "https://booth.pm/carts.json");
  assert.equal(isAllowedCartsDataUrl("https://booth.pm/carts.json"), true);
  assert.equal(isAllowedCartsDataUrl("https://booth.pm/carts.json?lt_id=12"), true);
  assert.equal(isAllowedCartsDataUrl("https://booth.pm/carts.json?lt_id=abc"), false);
  assert.equal(isAllowedCartsDataUrl("https://booth.pm/carts.json?lt_id=1&x=2"), false);
  assert.equal(isAllowedCartsDataUrl("https://maker.booth.pm/cart.json"), false);
  assert.equal(isAllowedCartsDataUrl("https://evil.example/carts.json"), false);
  assert.equal(isAllowedCartsPageUrl("https://booth.pm/carts"), true);
  assert.equal(isAllowedCartsPageUrl("https://booth.pm/carts?via=x"), false);
  assert.equal(buildShopCartUrl("https://maker.booth.pm/"), "https://maker.booth.pm/cart");
  assert.equal(buildShopCartUrl("https://evil.example/"), "");
});

test("장바구니 JSON을 상점별로 읽고 결제 주소는 버린다", () => {
  const parsed = parseBoothCartsData(JSON.stringify({
    next_lt_id: 200,
    carts: [
      cartEntry({ id: 300, items: [cartItem({ id: 1, productId: 11 }), cartItem({ id: 2, productId: 12, quantity: 2, price: 990 })] }),
      cartEntry({ id: 299, shop: "other", items: [cartItem({ id: 3, productId: 13, errors: { item: ["sold out"] }, shop: "other" })] }),
      cartEntry({ id: 298, items: [] }),
      { id: "not-a-number", cart_items: [] },
    ],
  }));

  assert.equal(parsed.nextCartId, "200");
  assert.equal(parsed.shops.length, 2);
  const [shop, other] = parsed.shops;
  assert.deepEqual(
    { id: shop.id, name: shop.name, url: shop.url, cartUrl: shop.cartUrl, subtotal: shop.subtotal, currency: shop.currency },
    { id: "300", name: "Shop maker", url: "https://maker.booth.pm/", cartUrl: "https://maker.booth.pm/cart", subtotal: 2500, currency: "JPY" },
  );
  assert.equal(JSON.stringify(parsed).includes("secret-token"), false);
  assert.equal(JSON.stringify(parsed).includes("checkout"), false);

  const [first, second] = shop.items;
  assert.equal(first.key, "cart:1");
  assert.equal(first.productId, "11");
  assert.equal(first.title, "Item 11");
  assert.equal(first.variationName, "Chiffon / Lime");
  assert.equal(first.productUrl, "https://maker.booth.pm/items/11");
  assert.equal(first.imageUrl, "https://booth.pximg.net/c/300x300_a2_g5/uuid/i/11/image_base_resized.jpg");
  assert.equal(first.unavailable, false);
  assert.equal(second.price, 990);
  assert.equal(second.quantity, 2);
  assert.equal(other.items[0].unavailable, true);
});

test("장바구니 JSON의 위험한 주소와 잘못된 응답은 받아들이지 않는다", () => {
  const entry = cartEntry({ id: 1, items: [cartItem({ id: 1, productId: 11 })] });
  entry.shop.base_url = "https://evil.example/";
  entry.cart_items[0].item.url = "https://evil.example/items/11";
  entry.cart_items[0].item.primary_image = "https://evil.example/i/11/a.jpg";
  const [shop] = parseBoothCartsData(JSON.stringify({ next_lt_id: null, carts: [entry] })).shops;
  assert.equal(shop.url, "");
  assert.equal(shop.cartUrl, "");
  assert.equal(shop.items[0].productUrl, "https://booth.pm/ja/items/11");
  assert.equal(shop.items[0].imageUrl, "");

  assert.throws(() => parseBoothCartsData("<html>maintenance</html>"));
  assert.throws(() => parseBoothCartsData(JSON.stringify({ carts: "nope" })));
});

test("BOOTH 페이지의 로그인 표시를 읽는다", () => {
  assert.equal(isBoothSignedInPage('<meta content="true" name="js_const_user_signed_in" />'), true);
  assert.equal(isBoothSignedInPage('<meta name="js_const_user_signed_in" content="false">'), false);
  assert.equal(isBoothSignedInPage("<html></html>"), null);
});

test("장바구니는 커서를 따라 모든 페이지를 읽고, 비어 있으면 로그인 상태를 확인한다", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const respond = (url, body) => ({ ok: true, status: 200, url, headers: new Headers(), text: async () => body });

  const requested = [];
  globalThis.fetch = async (url, options) => {
    requested.push([url, options.credentials]);
    if (url === "https://booth.pm/carts.json") {
      return respond(url, JSON.stringify({ next_lt_id: 50, carts: [cartEntry({ id: 60, items: [cartItem({ id: 1, productId: 11 })] })] }));
    }
    return respond(url, JSON.stringify({ next_lt_id: null, carts: [cartEntry({ id: 50, shop: "other", items: [cartItem({ id: 2, productId: 12, shop: "other" })] })] }));
  };
  const progress = [];
  const result = await loadBoothCart((entry) => progress.push(entry.pages));
  assert.deepEqual(requested, [
    ["https://booth.pm/carts.json", "include"],
    ["https://booth.pm/carts.json?lt_id=50", "include"],
  ]);
  assert.deepEqual(progress, [1, 2]);
  assert.deepEqual(result.shops.map((shop) => shop.id), ["60", "50"]);

  globalThis.fetch = async (url) => (url.endsWith(".json")
    ? respond(url, JSON.stringify({ next_lt_id: null, carts: [] }))
    : respond(url, '<meta content="false" name="js_const_user_signed_in" />'));
  await assert.rejects(loadBoothCart(), BoothAuthError);

  globalThis.fetch = async (url) => (url.endsWith(".json")
    ? respond(url, JSON.stringify({ next_lt_id: null, carts: [] }))
    : respond(url, '<meta content="true" name="js_const_user_signed_in" />'));
  assert.deepEqual((await loadBoothCart()).shops, []);
});

function wishItem({ id, price = "700 JPY~", soldOut = false, shop = "maker" }) {
  return {
    id,
    name: `Wish ${id}`,
    price,
    is_sold_out: soldOut,
    is_end_of_sale: false,
    is_placeholder: false,
    shop: { name: `Shop ${shop}`, url: `https://${shop}.booth.pm/`, thumbnail_url: "https://booth.pximg.net/c/48x48/users/1/icon.jpg" },
    shop_item_url: `https://${shop}.booth.pm/items/${id}`,
    url: `https://booth.pm/zh-cn/items/${id}`,
    thumbnail_image_urls: [`https://booth.pximg.net/c/300x300_a2_g5/uuid/i/${id}/a_base_resized.jpg`],
    wish_list_url: `https://accounts.booth.pm/items/${id}/wish_list`,
  };
}

function wishPage(items, page, totalPages) {
  return JSON.stringify({ items, pagination: { current_page: page, total_pages: totalPages, total_count: 99, limit_value: 20 } });
}

test("위시리스트 주소는 accounts.booth.pm의 페이지 번호만 허용한다", () => {
  assert.equal(buildWishlistDataUrl(), "https://accounts.booth.pm/wish_list_name_items.json?page=1");
  assert.equal(buildWishlistDataUrl(3), "https://accounts.booth.pm/wish_list_name_items.json?page=3");
  assert.equal(isAllowedWishlistDataUrl("https://accounts.booth.pm/wish_list_name_items.json?page=2"), true);
  assert.equal(isAllowedWishlistDataUrl("https://accounts.booth.pm/wish_list_name_items.json?page=0"), false);
  assert.equal(isAllowedWishlistDataUrl("https://accounts.booth.pm/wish_list_name_items.json"), false);
  assert.equal(isAllowedWishlistDataUrl("https://accounts.booth.pm/wish_list_name_items.json?page=1&x=1"), false);
  assert.equal(isAllowedWishlistDataUrl("https://booth.pm/wish_list_name_items.json?page=1"), false);
});

test("위시리스트 JSON의 가격·상점·판매 상태를 읽는다", () => {
  const parsed = parseBoothWishlistData(wishPage([
    wishItem({ id: 11 }),
    wishItem({ id: 12, price: "2,000 JPY", soldOut: true }),
    { ...wishItem({ id: 13 }), is_placeholder: true },
    { id: "bad" },
  ], 1, 5));
  assert.equal(parsed.totalPages, 5);
  assert.deepEqual(parsed.items.map((item) => item.productId), ["11", "12"]);
  const [first, second] = parsed.items;
  assert.equal(first.key, "wish:11");
  assert.equal(first.price, 700);
  assert.equal(first.currency, "JPY");
  assert.equal(first.priceFrom, true);
  assert.equal(first.shopName, "Shop maker");
  assert.equal(first.shopUrl, "https://maker.booth.pm/");
  assert.equal(first.productUrl, "https://maker.booth.pm/items/11");
  assert.equal(first.imageUrl, "https://booth.pximg.net/c/300x300_a2_g5/uuid/i/11/a_base_resized.jpg");
  assert.equal(second.price, 2000);
  assert.equal(second.priceFrom, false);
  assert.equal(second.unavailable, true);
  assert.throws(() => parseBoothWishlistData("{}"));
});

test("위시리스트는 모든 페이지를 순서대로 합치고, 로그아웃 응답은 로그인 오류로 바꾼다", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const respond = (url, body, status = 200) => ({ ok: status < 400, status, url, headers: new Headers(), text: async () => body });

  globalThis.fetch = async (url) => {
    const page = Number(new URL(url).searchParams.get("page"));
    const items = { 1: [wishItem({ id: 1 }), wishItem({ id: 2 })], 2: [wishItem({ id: 2 }), wishItem({ id: 3 })], 3: [wishItem({ id: 4 })] }[page];
    return respond(url, wishPage(items, page, 3));
  };
  const progress = [];
  const result = await loadBoothWishlist((entry) => progress.push(`${entry.pages}/${entry.totalPages}`));
  assert.deepEqual(result.items.map((item) => item.productId), ["1", "2", "3", "4"]);
  assert.deepEqual(progress, ["1/3", "2/3", "3/3"]);

  globalThis.fetch = async (url) => respond(url, '{"error":"You need to sign in or sign up before continuing."}', 401);
  await assert.rejects(loadBoothWishlist(), BoothAuthError);
});

test("저장된 장바구니·위시리스트는 안전한 항목만 남기고 다시 읽는다", async () => {
  const { clearState, loadShoppingLists, sanitizeShoppingLists, saveShoppingList, useMemoryStorage, SHOPPING_LISTS_VERSION } = await import("../src/storage.js");
  useMemoryStorage({});

  const cartGroups = parseBoothCartsData(JSON.stringify({
    next_lt_id: null,
    carts: [cartEntry({ id: 300, items: [cartItem({ id: 1, productId: 11 }), cartItem({ id: 2, productId: 12, quantity: 2, price: 990 })] })],
  })).shops;
  const wishItems = parseBoothWishlistData(wishPage([wishItem({ id: 21 }), wishItem({ id: 22, soldOut: true })], 1, 1)).items;
  const loadedAt = "2026-10-18T08:00:00.000Z";

  await saveShoppingList("cart", { groups: cartGroups, loadedAt });
  await saveShoppingList("wishlist", { groups: [{ id: "wishlist", name: "", url: "", items: wishItems }], loadedAt });
  const saved = await loadShoppingLists();

  assert.equal(saved.cart.loadedAt, loadedAt);
  assert.deepEqual(saved.cart.groups.map((group) => group.id), ["300"]);
  assert.equal(saved.cart.groups[0].cartUrl, "https://maker.booth.pm/cart");
  assert.deepEqual(saved.cart.groups[0].items.map((item) => [item.key, item.quantity, item.price]), [["cart:1", 1, 2500], ["cart:2", 2, 990]]);
  assert.deepEqual(saved.wishlist.groups[0].items.map((item) => [item.key, item.priceFrom, item.unavailable]), [["wish:21", true, false], ["wish:22", true, true]]);
  assert.equal(JSON.stringify(saved).includes("checkout"), false);

  // Saving one list keeps the other.
  await saveShoppingList("cart", { groups: [], loadedAt });
  const afterCartSync = await loadShoppingLists();
  assert.deepEqual(afterCartSync.cart.groups, []);
  assert.equal(afterCartSync.wishlist.groups[0].items.length, 2);

  const tampered = sanitizeShoppingLists({
    version: SHOPPING_LISTS_VERSION,
    cart: {
      loadedAt,
      groups: [{
        id: "300",
        name: "Shop",
        url: "https://evil.example/",
        items: [
          { cartItemId: "5", productId: "55", title: "Item", productUrl: "javascript:alert(1)", imageUrl: "https://evil.example/i/55/a.jpg", price: -1, currency: "jpy", quantity: 1e9 },
          { cartItemId: "x", productId: "56" },
        ],
      }, { id: "../etc", items: [] }],
    },
    wishlist: { loadedAt: "not a date", groups: [] },
  });
  const [item] = tampered.cart.groups[0].items;
  assert.equal(tampered.cart.groups.length, 1);
  assert.equal(tampered.cart.groups[0].url, "");
  assert.equal(tampered.cart.groups[0].items.length, 1);
  assert.equal(item.productUrl, "https://booth.pm/ja/items/55");
  assert.equal(item.imageUrl, "");
  assert.equal(item.price, 0);
  assert.equal(item.currency, "JPY");
  assert.equal(item.quantity, 1);
  assert.equal(tampered.wishlist, null);
  assert.deepEqual(sanitizeShoppingLists({ version: 999, cart: { loadedAt, groups: [] } }), { cart: null, wishlist: null });

  await clearState();
  assert.deepEqual(await loadShoppingLists(), { cart: null, wishlist: null });
});
