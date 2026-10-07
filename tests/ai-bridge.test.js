import test from "node:test";
import assert from "node:assert/strict";

import { buildDownloadFilename, createAiBridge, safePathSegment } from "../src/ai-bridge.js";
import { sanitizeState } from "../src/storage.js";

function libraryState() {
  return sanitizeState({
    items: [
      {
        productId: "101",
        source: "purchased",
        title: "Moonlit Wardrobe【マヌカ対応】",
        sellerName: "Lumen Atelier",
        productCategory: { id: 209, name: "3D衣装", parentName: "3Dモデル" },
        supportedAvatarIds: ["manuka"],
        downloadFiles: [{ label: "Moonlit_Manuka.zip", detail: "25 MB" }],
      },
      {
        productId: "202",
        source: "gift",
        title: "Ribbon Hair",
        sellerName: "Plain Bloom",
        productCategory: { id: 230, name: "3D髪型", parentName: "3Dモデル" },
        downloadFiles: [{ label: "RibbonHair.unitypackage" }],
      },
    ],
    folders: [{ id: "clothes", name: "의상" }],
    assignments: { "product:101": ["clothes"] },
    favorites: ["product:202"],
    lastSyncedAt: "2026-10-01T00:00:00.000Z",
  });
}

function createHarness({ approve = true, downloadState = "complete" } = {}) {
  const calls = { approvals: [], downloads: [], loads: [] };
  let clock = 0;
  const bridge = createAiBridge({
    loadState: async () => libraryState(),
    loadDownloadOptions: async (item) => {
      calls.loads.push(item.productId);
      return [
        { id: "7001", label: `${item.productId}_main.zip`, detail: "10 MB", url: "https://booth.pm/downloadables/7001" },
        { id: "7002", label: `${item.productId}_extra.zip`, detail: "", url: "https://booth.pm/downloadables/7002" },
      ];
    },
    requestApproval: async (request) => {
      calls.approvals.push(request);
      return approve;
    },
    startDownload: async ({ url, filename }) => {
      calls.downloads.push({ url, filename });
      return calls.downloads.length;
    },
    getDownload: async (id) => ({
      id,
      state: downloadState,
      filename: `C:\\Users\\me\\Downloads\\${calls.downloads[id - 1].filename.replaceAll("/", "\\")}`,
      bytesReceived: 10,
      totalBytes: 10,
    }),
    sleep: async (ms) => { clock += ms; },
    now: () => clock,
    downloadWaitMs: 5_000,
    downloadPollMs: 1_000,
    extensionVersion: "1.0.12",
  });
  return { bridge, calls };
}

test("AI 검색은 아바타·종류로 찾고 다운로드 주소 없이 요약 정보만 돌려준다", async () => {
  const { bridge } = createHarness();
  const byAvatar = await bridge.handle("search_library", { query: "마누카" });
  assert.equal(byAvatar.total, 1);
  assert.deepEqual(byAvatar.items[0], {
    productId: "101",
    title: "Moonlit Wardrobe【マヌカ対応】",
    shop: "Lumen Atelier",
    sources: ["purchased"],
    type: { name: "3D衣装", english: "3D outfits", parent: "3Dモデル" },
    supportedAvatars: ["manuka"],
    ownedAvatarVariants: ["manuka"],
    files: ["Moonlit_Manuka.zip (25 MB)"],
    favorite: false,
    folders: ["의상"],
    productUrl: "https://booth.pm/ja/items/101",
  });
  assert.deepEqual((await bridge.handle("search_library", { type: "hair" })).items.map((item) => item.productId), ["202"]);
  assert.deepEqual((await bridge.handle("search_library", { favoritesOnly: true })).items.map((item) => item.productId), ["202"]);
  assert.equal((await bridge.handle("search_library", { source: "gift", limit: 1 })).items.length, 1);
  assert.doesNotMatch(JSON.stringify(await bridge.handle("search_library", {})), /downloadables/);
  const status = await bridge.handle("status");
  assert.equal(status.itemCount, 2);
  assert.equal(status.itemsWithType, 2);
});

test("AI 요청 값은 엄격히 검사하고 알 수 없는 메서드를 거부한다", async () => {
  const { bridge } = createHarness();
  await assert.rejects(bridge.handle("search_library", { limit: 0 }), { code: "INVALID_PARAMS" });
  await assert.rejects(bridge.handle("search_library", { limit: 51 }), { code: "INVALID_PARAMS" });
  await assert.rejects(bridge.handle("search_library", { source: "everything" }), { code: "INVALID_PARAMS" });
  await assert.rejects(bridge.handle("search_library", { query: 3 }), { code: "INVALID_PARAMS" });
  await assert.rejects(bridge.handle("search_library", []), { code: "INVALID_PARAMS" });
  await assert.rejects(bridge.handle("list_files", { productId: "../1" }), { code: "INVALID_PARAMS" });
  await assert.rejects(bridge.handle("list_files", { productId: "999" }), { code: "NOT_FOUND" });
  await assert.rejects(bridge.handle("constructor", {}), { code: "UNKNOWN_METHOD" });
  await assert.rejects(bridge.handle("download", { items: [] }), { code: "INVALID_PARAMS" });
  await assert.rejects(bridge.handle("download", { items: [{ productId: "101", fileIds: ["nope"] }] }), { code: "NOT_FOUND" });
});

test("파일 목록은 AI에게 다운로드 주소를 넘기지 않는다", async () => {
  const { bridge } = createHarness();
  const files = await bridge.handle("list_files", { productId: "101" });
  assert.deepEqual(files.files, [
    { fileId: "7001", name: "101_main.zip", size: "10 MB" },
    { fileId: "7002", name: "101_extra.zip", size: null },
  ]);
  assert.doesNotMatch(JSON.stringify(files), /https:/);
});

test("다운로드는 사용자 승인 뒤에만 시작하고 완료 경로를 돌려준다", async () => {
  const { bridge, calls } = createHarness();
  const job = await bridge.handle("download", { items: [{ productId: "101", fileIds: ["7002"] }, { productId: "202" }] });
  assert.equal(calls.approvals.length, 1);
  assert.deepEqual(calls.approvals[0].items.map((item) => item.files.map((file) => file.name)), [
    ["101_extra.zip"],
    ["202_main.zip", "202_extra.zip"],
  ]);
  assert.doesNotMatch(JSON.stringify(calls.approvals[0]), /downloadables/);
  assert.deepEqual(calls.downloads.map((download) => download.filename), [
    "BOOTH Shelf/Lumen Atelier/Moonlit Wardrobe【マヌカ対応】 (101)/101_extra.zip",
    "BOOTH Shelf/Plain Bloom/Ribbon Hair (202)/202_main.zip",
    "BOOTH Shelf/Plain Bloom/Ribbon Hair (202)/202_extra.zip",
  ]);
  assert.equal(job.status, "complete");
  assert.ok(job.files.every((file) => file.status === "complete" && file.path.endsWith(".zip")));
  assert.deepEqual(await bridge.handle("download_status", { jobId: job.jobId }), job);
});

test("거절한 다운로드는 아무 파일도 받지 않는다", async () => {
  const { bridge, calls } = createHarness({ approve: false });
  const job = await bridge.handle("download", { items: [{ productId: "101" }] });
  assert.equal(job.status, "denied");
  assert.equal(calls.downloads.length, 0);
  assert.ok(job.files.every((file) => file.status === "denied"));
});

test("오래 걸리는 다운로드는 작업 번호를 돌려주고 나중에 상태를 조회한다", async () => {
  const { bridge } = createHarness({ downloadState: "in_progress" });
  const job = await bridge.handle("download", { items: [{ productId: "101", fileIds: ["7001"] }] });
  assert.equal(job.status, "downloading");
  assert.match(job.jobId, /^job-/);
  assert.equal((await bridge.handle("download_status", { jobId: job.jobId })).status, "downloading");
  await assert.rejects(bridge.handle("download_status", { jobId: "job-missing" }), { code: "NOT_FOUND" });
});

test("다운로드 경로 조각은 Windows에서 안전한 이름으로 바꾼다", () => {
  assert.equal(safePathSegment('a<b>c:d"e/f\\g|h?i*j'), "a_b_c_d_e_f_g_h_i_j");
  assert.equal(safePathSegment("..\\..\\Windows"), "_.._Windows");
  assert.equal(safePathSegment("../../etc"), "_.._etc");
  assert.equal(safePathSegment("CON"), "_CON");
  assert.equal(safePathSegment("name. . "), "name");
  assert.equal(safePathSegment(""), "item");
  assert.equal(safePathSegment("x".repeat(100)).length, 60);
  assert.equal(
    buildDownloadFilename({ productId: "5", title: "A/B", sellerName: "" }, "f.zip"),
    "BOOTH Shelf/shop/A_B (5)/f.zip",
  );
});
