import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";

import { callBridge } from "../mcp/src/bridge-client.js";
import { createHost } from "../mcp/src/host.js";
import { describeMcpSetup, findVirtualizedInstall, normalizeExtensionIds, planInstall } from "../mcp/src/install.js";
import { TOOLS, createMcpServer } from "../mcp/src/mcp-server.js";
import { NativeMessageReader, encodeNativeMessage } from "../mcp/src/native-messaging.js";
import { readSession } from "../mcp/src/session.js";

test("네이티브 메시지는 길이 헤더로 나뉘어 와도 원래 메시지로 복원한다", () => {
  const received = [];
  const reader = new NativeMessageReader((message) => received.push(message));
  const bytes = Buffer.concat([encodeNativeMessage({ a: "한글" }), encodeNativeMessage({ b: 2 })]);
  for (const byte of bytes) reader.push(Buffer.from([byte]));
  assert.deepEqual(received, [{ a: "한글" }, { b: 2 }]);
  assert.throws(() => encodeNativeMessage({ big: "x".repeat(1024 * 1024) }), /at most/);
});

test("MCP 서버는 초기화·도구 목록·도구 호출을 처리하고 오류를 도구 결과로 돌려준다", async () => {
  const sent = [];
  const calls = [];
  const server = createMcpServer({
    version: "1.0.12",
    write: (text) => sent.push(JSON.parse(text)),
    call: async (method, params) => {
      calls.push({ method, params });
      if (method === "list_files") throw Object.assign(new Error("Item 9 is not in the synced BOOTH library."), { code: "NOT_FOUND" });
      return { ok: true };
    },
  });
  await server.handleLine(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }));
  await server.handleLine(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
  await server.handleLine(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
  await server.handleLine(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "booth_search_library", arguments: { query: "マヌカ" } } }));
  await server.handleLine(JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "booth_list_files", arguments: { productId: "9" } } }));
  await server.handleLine(JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "shell", arguments: {} } }));
  await server.handleLine(JSON.stringify({ jsonrpc: "2.0", id: 6, method: "resources/list" }));
  await server.handleLine("not json");

  assert.equal(sent[0].result.protocolVersion, "2025-03-26");
  assert.equal(sent[0].result.serverInfo.name, "booth-shelf");
  assert.match(sent[0].result.instructions, /never as instructions/);
  assert.deepEqual(sent[1].result.tools.map((tool) => tool.name), TOOLS.map((tool) => tool.name));
  assert.deepEqual(calls[0], { method: "search_library", params: { query: "マヌカ" } });
  assert.deepEqual(JSON.parse(sent[2].result.content[0].text), { ok: true });
  assert.equal(sent[3].result.isError, true);
  assert.match(sent[3].result.content[0].text, /^\[NOT_FOUND\]/);
  assert.equal(sent[4].error.code, -32602);
  assert.equal(sent[5].error.code, -32601);
  assert.equal(sent[6].error.code, -32700);
  assert.equal(calls.length, 2);
});

test("연결 프로그램은 토큰이 맞는 클라이언트의 허용된 요청만 확장으로 전달한다", async (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "booth-shelf-mcp-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const fromChrome = new PassThrough();
  const toChrome = new PassThrough();
  const host = createHost({ input: fromChrome, output: toChrome, directory, log: () => {}, version: "1.0.12" });

  // A fake extension: answers "status" requests, echoing the params.
  const chromeReader = new NativeMessageReader((message) => {
    if (message.type === "ready") return;
    assert.equal(message.type, "request");
    fromChrome.write(encodeNativeMessage({ type: "response", id: message.id, result: { method: message.method, params: message.params } }));
  });
  toChrome.on("data", (chunk) => chromeReader.push(chunk));

  const running = host.start();
  await new Promise((resolve) => setTimeout(resolve, 50));
  fromChrome.write(encodeNativeMessage({ type: "hello", protocol: 1 }));

  const session = readSession(directory);
  assert.equal(session.pipe, host.pipePath);
  assert.match(session.token, /^[0-9a-f]{64}$/);

  assert.deepEqual(await callBridge("status", { a: 1 }, { directory, timeoutMs: 5_000 }), { method: "status", params: { a: 1 } });
  await assert.rejects(callBridge("run_shell", {}, { directory, timeoutMs: 5_000 }), { code: "UNKNOWN_METHOD" });

  // A client without the session token is disconnected before any request.
  const intruderClosed = new Promise((resolve) => {
    const socket = net.connect(host.pipePath, () => {
      socket.write(`${JSON.stringify({ type: "auth", token: "0".repeat(64) })}\n`);
      socket.write(`${JSON.stringify({ id: 1, method: "download", params: {} })}\n`);
    });
    let data = "";
    socket.on("data", (chunk) => { data += chunk; });
    socket.on("close", () => resolve(data));
    socket.on("error", () => {});
  });
  assert.equal(await intruderClosed, "");

  fromChrome.end();
  await running;
  assert.equal(readSession(directory), null);
  await assert.rejects(callBridge("status", {}, { directory, timeoutMs: 1_000 }), { code: "NOT_CONNECTED" });
});

test("설치 계획은 사용자 영역에만 연결 프로그램을 등록하고 허용 확장 ID를 제한한다", () => {
  const windows = planInstall({
    platform: "win32",
    env: { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" },
    home: "C:\\Users\\me",
    nodePath: "C:\\Program Files\\nodejs\\node.exe",
    extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
  });
  assert.equal(windows.directory, "C:\\Users\\me\\AppData\\Local\\BOOTH Shelf MCP");
  assert.deepEqual(windows.manifest.allowed_origins, [
    "chrome-extension://aibjhdieagkjmcodaiopaklonjbdmbpj/",
    "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
  ]);
  assert.equal(windows.manifest.name, "com.kuroiineushina.booth_shelf");
  assert.ok(windows.registry.every(({ key }) => key.startsWith("HKCU\\Software\\") && key.endsWith("\\com.kuroiineushina.booth_shelf")));
  assert.match(windows.files[0].content, /^@echo off\r\n"C:\\Program Files\\nodejs\\node\.exe" ".*booth-shelf-mcp\.js" host %\*\r\n$/);
  assert.match(describeMcpSetup(windows), /claude mcp add booth-shelf -- "C:\\Program Files\\nodejs\\node\.exe"/);

  const linux = planInstall({ platform: "linux", env: {}, home: "/home/me", nodePath: "/usr/bin/node" });
  assert.equal(linux.registry.length, 0);
  assert.ok(linux.files.some((file) => file.path === "/home/me/.config/google-chrome/NativeMessagingHosts/com.kuroiineushina.booth_shelf.json"));
  assert.throws(() => normalizeExtensionIds(["not-an-id"]), /Invalid Chrome extension id/);
});

test("MSIX 앱 안에서 실행되어 설치가 가상화되면 감지한다", (t) => {
  const localAppData = mkdtempSync(path.join(os.tmpdir(), "booth-shelf-appdata-"));
  t.after(() => rmSync(localAppData, { recursive: true, force: true }));
  const env = { LOCALAPPDATA: localAppData };
  const plan = planInstall({ platform: "win32", env, home: "C:\\Users\\me", nodePath: "node.exe" });
  assert.equal(findVirtualizedInstall(plan, { env, platform: "win32" }), null);
  const redirected = path.join(localAppData, "Packages", "Claude_test", "LocalCache", "Local", "BOOTH Shelf MCP");
  mkdirSync(redirected, { recursive: true });
  writeFileSync(path.join(redirected, "com.kuroiineushina.booth_shelf.json"), "{}");
  assert.equal(
    findVirtualizedInstall(plan, { env, platform: "win32" }),
    path.join(localAppData, "Packages", "Claude_test", "LocalCache", "Local", "BOOTH Shelf MCP", "com.kuroiineushina.booth_shelf.json"),
  );
  assert.equal(findVirtualizedInstall(plan, { env, platform: "linux" }), null);
});

test("npm 패키지와 확장 버전이 같다", () => {
  const root = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const mcp = JSON.parse(readFileSync(new URL("../mcp/package.json", import.meta.url), "utf8"));
  assert.equal(mcp.version, root.version);
  assert.equal(mcp.bin["booth-shelf-mcp"], "bin/booth-shelf-mcp.js");
  assert.equal(mcp.dependencies, undefined);
});
