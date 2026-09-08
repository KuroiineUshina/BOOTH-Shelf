import test from "node:test";
import assert from "node:assert/strict";
import { createSyncHarness, makeSupportItems } from "./sync-harness.js";

test("설명 요청은 300ms 간격을 유지하면서 최대 4개를 병렬 처리한다", async () => {
  const { items, products } = makeSupportItems(20);
  const h = await createSyncHarness({ products });
  const progress = [];
  const saved = [];
  const result = await h.clock.settle(h.api.indexBoothProductSupport(items, {
    onProgress: (state) => progress.push(state.completed),
    onCheckpoint: (snapshot, state) => saved.push({ snapshot: structuredClone(snapshot), ...state }),
  }));
  assert.equal(h.metrics().maxActive, 4);
  assert.equal(h.metrics().active, 0);
  for (let i = 1; i < h.requests.length; i += 1) {
    assert.ok(h.requests[i].start - h.requests[i - 1].start >= 300);
  }
  assert.ok(h.requests.every((request) => request.credentials === "omit"));
  assert.equal(result.scannedCount, 20);
  assert.equal(result.failedCount, 0);
  assert.equal(saved.at(-1).completed, 20);
  assert.deepEqual(saved.at(-1).snapshot.map((item) => item.key), items.map((item) => item.key));
  assert.deepEqual(progress, Array.from({ length: 21 }, (_, i) => i));
});

test("느린 중간 저장은 요청을 멈추지 않고 최종 저장까지 기다린다", async () => {
  const { items, products } = makeSupportItems(48);
  const h = await createSyncHarness({ products });
  const checkpoints = [];
  let activeWrites = 0;
  let maxWrites = 0;
  await h.clock.settle(h.api.indexBoothProductSupport(items, {
    onCheckpoint: async (snapshot, state) => {
      activeWrites += 1;
      maxWrites = Math.max(maxWrites, activeWrites);
      const checkpoint = { start: h.clock.time, ...state, snapshot: structuredClone(snapshot) };
      checkpoints.push(checkpoint);
      await h.clock.sleep(6000);
      checkpoint.end = h.clock.time;
      activeWrites -= 1;
    },
  }));
  assert.equal(maxWrites, 1);
  assert.equal(activeWrites, 0);
  assert.ok(h.requests[12].start < checkpoints[0].end);
  assert.ok(checkpoints.length < 4, "pending checkpoints should coalesce");
  assert.equal(checkpoints.at(-1).completed, 48);
  assert.ok(checkpoints.at(-1).snapshot.every((item) => item.supportIndexedAt));
  assert.equal(h.clock.time, checkpoints.at(-1).end);
  assert.equal(h.clock.timers.length, 0);
});

test("보유 상품과 서로 연결된 아바타 페이지는 한 번만 요청·분석한다", async () => {
  const { items, products } = makeSupportItems(2, { links: true });
  const h = await createSyncHarness({ products });
  const result = await h.clock.settle(h.api.indexBoothProductSupport(items));
  assert.equal(result.scannedCount, 2);
  assert.equal(h.requests.length, 2);
  assert.equal(h.metrics().parses, 2);
  assert.deepEqual(structuredClone(result.items.map((item) => item.supportedAvatarIds)), [["shinra"], ["misaki"]]);
});

test("유효한 설명 색인은 네트워크 요청과 중복 저장을 건너뛴다", async () => {
  const { items, products } = makeSupportItems(8);
  const h = await createSyncHarness({ products });
  const cached = items.map((item) => ({ ...item, supportedAvatarIds: ["misaki"],
    supportIndexVersion: h.api.PRODUCT_SUPPORT_INDEX_VERSION,
    supportIndexedAt: new Date(h.clock.epoch).toISOString(),
  }));
  let writes = 0;
  const result = await h.clock.settle(h.api.indexBoothProductSupport(cached, {
    onCheckpoint: () => { writes += 1; },
  }));
  assert.equal(h.requests.length, 0);
  assert.equal(writes, 0);
  assert.equal(result.scannedCount, 0);
  assert.deepEqual(structuredClone(result.items), cached);
});

test("저장 실패는 전파하고 이미 시작한 작업을 정리한 뒤 동기화를 종료한다", async () => {
  const { items, products } = makeSupportItems(100);
  const h = await createSyncHarness({ products });
  const diskError = new Error("checkpoint failed");
  let writes = 0;
  await assert.rejects(h.clock.settle(h.api.indexBoothProductSupport(items, {
    onCheckpoint: async () => {
      writes += 1;
      await h.clock.sleep(500);
      throw diskError;
    },
  })), (error) => error === diskError);
  assert.equal(writes, 1);
  assert.ok(h.requests.length < items.length);
  assert.equal(h.metrics().active, 0);
  assert.equal(h.clock.timers.length, 0);
});

test("공유 요청이 실패해도 다음 동기화에서는 다시 조회한다", async () => {
  const { items, products } = makeSupportItems(2, { links: true });
  const unavailable = { ...products[items[1].productId], status: 503 };
  const h = await createSyncHarness({ products: { ...products, [items[1].productId]: () => unavailable } });
  const first = await h.clock.settle(h.api.indexBoothProductSupport(items));
  assert.equal(first.failedCount, 2);
  assert.ok(first.items.every((item) => !item.supportIndexedAt));
  assert.equal(h.requests.filter((r) => r.productId === items[1].productId).length, 3);
  unavailable.status = 200;
  const second = await h.clock.settle(h.api.indexBoothProductSupport(first.items));
  assert.equal(second.scannedCount, 2);
  assert.equal(second.failedCount, 0);
  assert.equal(h.requests.filter((r) => r.productId === items[1].productId).length, 4);
});

test("429 응답의 재시도 대기 시간을 병렬 처리에서도 유지한다", async () => {
  const { items, products } = makeSupportItems(4);
  const productId = items[0].productId;
  const original = products[productId];
  products[productId] = (attempt) => attempt === 0
    ? { ...original, status: 429, retryAfter: "3", latency: 100 }
    : original;
  const h = await createSyncHarness({ products });
  const result = await h.clock.settle(h.api.indexBoothProductSupport(items));
  const retried = h.requests.filter((request) => request.productId === productId);
  assert.equal(result.failedCount, 0);
  assert.equal(retried.length, 2);
  assert.ok(retried[1].start - retried[0].end >= 3000);
  assert.ok(h.metrics().maxActive <= 4);
});

test("라이브러리 응답 순서가 달라도 상품 순서와 중복 위치를 보존한다", async () => {
  const libraryPages = {};
  for (const [sourceIndex, path] of ["/library", "/library/gifts", "/library/free_downloads"].entries()) {
    for (let page = 1; page <= 3; page += 1) {
      const productId = page === 2 ? "999" : String(100 + sourceIndex * 10 + page);
      libraryPages[`${path}?page=${page}`] = {
        pageCount: 3, latency: 600 + (4 - page) * 450 + sourceIndex * 90,
        items: [{ productId, title: `Item ${productId}`, downloadFiles: [{ label: `${sourceIndex}-${page}.zip` }] }],
      };
    }
  }
  const h = await createSyncHarness({ libraryPages });
  const result = await h.clock.settle(h.api.syncBoothLibrary());
  assert.equal(h.requests.length, 9);
  assert.equal(h.metrics().maxActive, 4);
  assert.deepEqual(structuredClone(result.items.map((item) => item.productId)), ["101", "999", "103", "111", "113", "121", "123"]);
  const shared = result.items.find((item) => item.productId === "999");
  assert.equal(shared.locations.length, 3);
  assert.equal(shared.downloadFiles.length, 3);
  assert.ok(h.requests.every((request) => request.credentials === "include"));
});

test("로그인 오류가 나면 다른 진행 중 요청까지 끝난 후 오류를 돌려준다", async () => {
  const h = await createSyncHarness({ libraryPages: {
    "/library?page=1": { latency: 100, redirect: "https://accounts.booth.pm/users/sign_in" },
    "/library/gifts?page=1": { pageCount: 9, latency: 2000 },
    "/library/free_downloads?page=1": { pageCount: 9, latency: 2000 },
  } });
  await assert.rejects(h.clock.settle(h.api.syncBoothLibrary()), { code: "AUTH_REQUIRED" });
  assert.equal(h.requests.length, 3);
  assert.equal(h.metrics().active, 0);
  assert.equal(h.clock.timers.length, 0);
  assert.ok(h.requests.every((request) => Number.isFinite(request.end)));
});
