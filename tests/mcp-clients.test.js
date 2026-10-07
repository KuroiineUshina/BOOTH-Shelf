import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  claudeAddArgs,
  codexConfigPath,
  registerClaudeCode,
  registerCodex,
  removeCodexServer,
  unregisterClaudeCode,
  unregisterCodex,
  upsertCodexServer,
} from "../mcp/src/clients.js";

const server = {
  command: "C:\\Program Files\\nodejs\\node.exe",
  args: ["C:\\Users\\me\\AppData\\Local\\BOOTH Shelf MCP\\app\\bin\\booth-shelf-mcp.js"],
};

const existingConfig = [
  'model = "gpt-5"',
  "",
  "[mcp_servers.unityMCP]",
  'command = "uvx"',
  'args = ["mcp-for-unity"]',
  "",
  "[mcp_servers.booth-shelf]",
  'command = "old-node"',
  'args = ["old.js"]',
  "",
  "[mcp_servers.booth-shelf.env]",
  'DEBUG = "1"',
  "",
  "[mcp_servers.blender]",
  'command = "blender-mcp"',
  "",
].join("\n");

test("Codex 설정은 booth-shelf 항목만 바꾸고 다른 서버 설정은 그대로 둔다", () => {
  const updated = upsertCodexServer(existingConfig, server);
  assert.match(updated, /^model = "gpt-5"$/m);
  assert.match(updated, /\[mcp_servers\.unityMCP\]\ncommand = "uvx"\nargs = \["mcp-for-unity"\]/);
  assert.match(updated, /\[mcp_servers\.blender\]\ncommand = "blender-mcp"/);
  assert.doesNotMatch(updated, /old-node|booth-shelf\.env|DEBUG/);
  assert.equal(updated.match(/\[mcp_servers\.booth-shelf\]/g).length, 1);
  assert.ok(updated.endsWith([
    "[mcp_servers.booth-shelf]",
    'command = "C:\\\\Program Files\\\\nodejs\\\\node.exe"',
    'args = ["C:\\\\Users\\\\me\\\\AppData\\\\Local\\\\BOOTH Shelf MCP\\\\app\\\\bin\\\\booth-shelf-mcp.js"]',
    "",
  ].join("\n")));
  assert.equal(upsertCodexServer(updated, server), updated, "registering twice changes nothing");
  assert.equal(removeCodexServer(updated).includes("booth-shelf"), false);
  assert.match(removeCodexServer(updated), /\[mcp_servers\.blender\]/);
});

test("Codex 설정의 줄바꿈 형식과 따옴표 표기 항목도 처리한다", () => {
  const crlf = existingConfig.replace(/\n/g, "\r\n").replace("[mcp_servers.booth-shelf]", '[mcp_servers."booth-shelf"]');
  const updated = upsertCodexServer(crlf, server);
  assert.doesNotMatch(updated.replace(/\r\n/g, ""), /\n/, "keeps CRLF line endings");
  assert.equal(updated.match(/booth-shelf/g).length, 1 + 1);
  assert.doesNotMatch(updated, /old-node/);
  assert.equal(upsertCodexServer("", server).startsWith("[mcp_servers.booth-shelf]\n"), true);
  // A nested array line is not mistaken for a table header.
  const nested = 'matrix = [\n  [1, 2],\n]\n\n[mcp_servers.booth-shelf]\ncommand = "x"\n';
  assert.match(removeCodexServer(nested), /\[1, 2\],/);
});

test("Codex가 설치된 경우에만 설정 파일에 등록하고 제거한다", (t) => {
  const home = mkdtempSync(path.join(os.tmpdir(), "booth-shelf-codex-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const env = { CODEX_HOME: path.join(home, "codex") };
  assert.equal(registerCodex(server, { env, home }).status, "not_found");

  mkdirSync(env.CODEX_HOME);
  const file = codexConfigPath({ env, home });
  writeFileSync(file, existingConfig);
  assert.deepEqual(registerCodex(server, { env, home }), { client: "Codex", status: "registered", detail: file });
  assert.match(readFileSync(file, "utf8"), /\[mcp_servers\.unityMCP\][\s\S]*\[mcp_servers\.booth-shelf\]/);
  assert.equal(unregisterCodex({ env, home }).status, "removed");
  assert.doesNotMatch(readFileSync(file, "utf8"), /booth-shelf/);
  assert.equal(unregisterCodex({ env, home }).status, "not_registered");
});

test("Claude Code는 CLI로 사용자 범위에 등록하고 없으면 건너뛴다", () => {
  const calls = [];
  const run = (executable, args) => {
    calls.push([executable, ...args]);
    if (args[1] === "remove") throw new Error("not registered");
    return "";
  };
  assert.deepEqual(registerClaudeCode(server, { find: () => null, run }), { client: "Claude Code", status: "not_found" });
  assert.deepEqual(registerClaudeCode(server, { find: () => "C:\\bin\\claude.exe", run }), {
    client: "Claude Code", status: "registered", detail: "user scope",
  });
  assert.deepEqual(calls.at(-1), ["C:\\bin\\claude.exe", ...claudeAddArgs(server)]);
  assert.deepEqual(claudeAddArgs(server).slice(0, 6), ["mcp", "add", "--scope", "user", "booth-shelf", "--"]);

  const failing = registerClaudeCode(server, {
    find: () => "claude",
    run: (executable, args) => {
      if (args[1] === "add") throw Object.assign(new Error("boom"), { stderr: "config locked" });
      return "";
    },
  });
  assert.deepEqual(failing, { client: "Claude Code", status: "failed", detail: "config locked" });
  assert.equal(unregisterClaudeCode({ find: () => "claude", run: () => "" }).status, "removed");
});
