import {
  parseBoothDownloadOptions,
  parseBoothLibraryPage,
  parseBoothOrderDetail,
  parseBoothOrdersPage,
} from "../src/booth.js";

const fixture = `
  <!doctype html>
  <html>
    <head><title>Library - BOOTH</title></head>
    <body>
      <main>
        <div class="card">
          <div class="card-header">
            <a href="https://booth.pm/ko/items/101">
              <img src="https://booth.pximg.net/c/300x300/i/101/image.jpg" alt="">
            </a>
            <div>
              <a href="https://booth.pm/ko/items/101">첫 번째 상품</a>
              <a href="https://maker-one.booth.pm/"><img src="seller.jpg" alt="Maker One">Maker One</a>
            </div>
          </div>
          <div class="downloads">
            <div class="download-row">
              <span>avatar_package_v2.zip (42 MB)</span>
              <div class="js-download-button" data-href="https://booth.pm/downloadables/7001?variation_id=31">
                <button type="button">다운로드</button>
              </div>
            </div>
            <div class="download-row">
              <span>manual.pdf 3.5 MB</span>
              <a href="https://booth.pm/downloadables/7002">Download</a>
            </div>
            <div class="download-row">
              <span>차단 대상</span>
              <div class="js-download-button" data-href="https://evil.example/downloadables/7003"></div>
            </div>
          </div>
        </div>
        <div class="card">
          <a href="/ja/items/202">
            <img src="https://booth.pximg.net/c/300x300/i/202/image.jpg" alt="">
          </a>
          <div>
            <a href="/ja/items/202">두 번째 상품</a>
            <a href="https://maker-two.booth.pm/">Maker Two</a>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <a href="https://booth.pm/ko/items/101">
              <img src="https://booth.pximg.net/c/300x300/i/101/image.jpg" alt="">
            </a>
            <a href="https://booth.pm/ko/items/101">첫 번째 상품의 다른 아바타 버전</a>
          </div>
          <div class="downloads">
            <div class="download-row">
              <span>avatar_b_package.zip (18 MB)</span>
              <a href="https://booth.pm/downloadables/7004">Download</a>
            </div>
          </div>
        </div>
        <nav>
          <a href="/library?page=1">1</a>
          <a href="/library?page=9">9</a>
        </nav>
      </main>
    </body>
  </html>
`;

const ordersFixture = `
  <html><head><title>Purchase History - BOOTH</title></head><body><main>
    <a href="/orders/9001">Completed 첫 상품</a>
    <a href="/orders/9001">Completed 같은 주문의 두 번째 상품</a>
    <a href="/orders/9002">Completed 다른 주문</a>
    <nav><a href="/orders?page=1">1</a><a href="/orders?page=4">4</a></nav>
  </main></body></html>
`;

const orderDetailFixture = `
  <html><head><title>Order Detail - BOOTH</title></head><body><main>
    <h1>Order Detail - Order Number: 9001</h1>
    <div class="sheet">
      <span class="order-state completed">Completed</span>
      <div class="l-row text-14">
        <div>Created At</div><div>2026/07/19 10:00:00</div>
        <div>Order Number</div><div>9001</div>
        <div>결제 금액</div><div>1,280 JPY</div>
      </div>
    </div>
  </main></body></html>
`;

try {
  const result = parseBoothLibraryPage(fixture, {
    source: "purchased",
    page: 1,
    pageUrl: "https://accounts.booth.pm/library?page=1",
  });
  const freeResult = parseBoothLibraryPage(fixture, {
    source: "free",
    page: 1,
    pageUrl: "https://accounts.booth.pm/library/free_downloads?page=1",
  });
  const downloads = parseBoothDownloadOptions(fixture, {
    productId: "101",
    pageUrl: "https://accounts.booth.pm/library?page=1",
  });
  const orders = parseBoothOrdersPage(ordersFixture, {
    pageUrl: "https://accounts.booth.pm/orders?page=1",
  });
  const orderDetail = parseBoothOrderDetail(orderDetailFixture, {
    orderId: "9001",
    pageUrl: "https://accounts.booth.pm/orders/9001",
  });
  let authDetected = false;
  try {
    parseBoothLibraryPage("<html><head><title>Sign in - BOOTH</title></head><body></body></html>", {
      source: "gift",
      page: 1,
      pageUrl: "https://accounts.booth.pm/library/gifts?page=1",
    });
  } catch (error) {
    authDetected = error?.code === "AUTH_REQUIRED";
  }
  document.getElementById("result").textContent = JSON.stringify({
    ok: result.items.length === 2
      && result.pageCount === 9
      && result.items[0].sellerName === "Maker One"
      && result.items[0].downloadFiles.length === 3
      && result.items[0].downloadFiles[0].label === "avatar_package_v2.zip"
      && result.items[1].productId === "202"
      && result.items[1].productUrl === "https://booth.pm/ja/items/202"
      && freeResult.items.length === 2
      && freeResult.items.every((item) => item.sources.includes("free"))
      && downloads.found
      && downloads.options.length === 3
      && downloads.options[0].label === "avatar_package_v2.zip"
      && downloads.options[0].detail === "42 MB"
      && downloads.options[1].url === "https://booth.pm/downloadables/7002"
      && downloads.options[2].url === "https://booth.pm/downloadables/7004"
      && orders.pageCount === 4
      && orders.orderIds.length === 2
      && orderDetail.completed
      && orderDetail.orderId === "9001"
      && orderDetail.money.amount === 1280
      && orderDetail.money.currency === "JPY"
      && authDetected,
    authDetected,
    itemCount: result.items.length,
    pageCount: result.pageCount,
    first: result.items[0],
    second: result.items[1],
    freeResult,
    downloads,
    orders,
    orderDetail,
  });
} catch (error) {
  document.getElementById("result").textContent = JSON.stringify({
    ok: false,
    error: error.message,
  });
}
