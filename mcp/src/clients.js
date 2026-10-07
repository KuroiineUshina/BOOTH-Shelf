// Registers the booth-shelf MCP server with AI tools found on this machine:
// Codex (config.toml, also used by the Codex desktop app) and Claude Code
// (through its own CLI, since Claude Code rewrites its config file itself).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const SERVER_NAME = "booth-shelf";

// --- Codex -------------------------------------------------------------------

export function codexConfigPath({ env = process.env, home = os.homedir() } = {}) {
  return path.join(env.CODEX_HOME || path.join(home, ".codex"), "config.toml");
}

const TABLE_HEADER = /^\s*\[\s*mcp_servers\.(?:booth-shelf|"booth-shelf")(?:\.[^\[\]]*)?\s*\]\s*(?:#.*)?$/;
const ANY_HEADER = /^\s*\[\[?\s*[A-Za-z0-9_"'-][^\[\]]*\]\]?\s*(?:#.*)?$/;

// Removes [mcp_servers.booth-shelf] and its sub-tables, keeping every other
// line (and the file's line endings) as they were.
export function removeCodexServer(text) {
  const source = String(text || "");
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const kept = [];
  let skipping = false;
  for (const line of source.split(/\r?\n/)) {
    if (ANY_HEADER.test(line)) skipping = TABLE_HEADER.test(line);
    if (!skipping) kept.push(line);
  }
  return kept.join(eol);
}

export function upsertCodexServer(text, { command, args }) {
  const source = String(text || "");
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const base = removeCodexServer(source).replace(/\s*$/, "");
  // TOML basic strings accept the same escapes JSON.stringify produces.
  const block = [
    `[mcp_servers.${SERVER_NAME}]`,
    `command = ${JSON.stringify(command)}`,
    `args = [${args.map((arg) => JSON.stringify(arg)).join(", ")}]`,
  ].join(eol);
  return `${base ? `${base}${eol}${eol}` : ""}${block}${eol}`;
}

function writeAtomically(file, content) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, content);
  renameSync(temporary, file);
}

// Codex counts as installed when its home folder exists (CLI or desktop app).
export function registerCodex({ command, args }, options = {}) {
  const file = codexConfigPath(options);
  if (!existsSync(path.dirname(file))) return { client: "Codex", status: "not_found" };
  const before = existsSync(file) ? readFileSync(file, "utf8") : "";
  writeAtomically(file, upsertCodexServer(before, { command, args }));
  return { client: "Codex", status: "registered", detail: file };
}

export function unregisterCodex(options = {}) {
  const file = codexConfigPath(options);
  if (!existsSync(file)) return { client: "Codex", status: "not_found" };
  const before = readFileSync(file, "utf8");
  const after = removeCodexServer(before);
  if (after === before) return { client: "Codex", status: "not_registered" };
  writeAtomically(file, after);
  return { client: "Codex", status: "removed", detail: file };
}

// --- Claude Code ---------------------------------------------------------------

function findExecutable(name, platform = process.platform) {
  try {
    const output = execFileSync(platform === "win32" ? "where" : "which", [name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const candidates = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    // Prefer a real executable over npm's .ps1 shim on Windows.
    return candidates.find((candidate) => /\.(exe|cmd|bat)$/i.test(candidate)) || (platform === "win32" ? null : candidates[0]) || null;
  } catch {
    return null;
  }
}

function quoteForCmd(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function runCli(executable, args) {
  if (/\.(cmd|bat)$/i.test(executable)) {
    // npm shims need cmd.exe; every argument is a path we built, quoted here.
    const line = [executable, ...args].map(quoteForCmd).join(" ");
    return execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `"${line}"`], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsVerbatimArguments: true,
    });
  }
  return execFileSync(executable, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

export function claudeAddArgs({ command, args }) {
  return ["mcp", "add", "--scope", "user", SERVER_NAME, "--", command, ...args];
}

export function registerClaudeCode(server, { find = findExecutable, run = runCli } = {}) {
  const claude = find("claude");
  if (!claude) return { client: "Claude Code", status: "not_found" };
  try {
    run(claude, ["mcp", "remove", SERVER_NAME, "--scope", "user"]);
  } catch {
    // Not registered yet.
  }
  try {
    run(claude, claudeAddArgs(server));
    return { client: "Claude Code", status: "registered", detail: "user scope" };
  } catch (error) {
    return { client: "Claude Code", status: "failed", detail: String(error?.stderr || error?.message || error).trim() };
  }
}

export function unregisterClaudeCode({ find = findExecutable, run = runCli } = {}) {
  const claude = find("claude");
  if (!claude) return { client: "Claude Code", status: "not_found" };
  try {
    run(claude, ["mcp", "remove", SERVER_NAME, "--scope", "user"]);
    return { client: "Claude Code", status: "removed" };
  } catch {
    return { client: "Claude Code", status: "not_registered" };
  }
}
