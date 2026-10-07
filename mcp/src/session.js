// Where the host and the MCP server meet: the running native host writes a
// session file (pipe address + random token) that only this OS user can read.
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const HOST_NAME = "com.kuroiineushina.booth_shelf";
export const STORE_EXTENSION_ID = "aibjhdieagkjmcodaiopaklonjbdmbpj";
export const SESSION_FILE_NAME = "session.json";

export function appDirectory({ platform = process.platform, env = process.env, home = os.homedir() } = {}) {
  if (platform === "win32") {
    return path.win32.join(env.LOCALAPPDATA || path.win32.join(home, "AppData", "Local"), "BOOTH Shelf MCP");
  }
  if (platform === "darwin") {
    return path.posix.join(home, "Library", "Application Support", "BOOTH Shelf MCP");
  }
  return path.posix.join(env.XDG_DATA_HOME || path.posix.join(home, ".local", "share"), "booth-shelf-mcp");
}

export function createPipePath(directory, { platform = process.platform } = {}) {
  const suffix = randomBytes(12).toString("hex");
  return platform === "win32"
    ? `\\\\.\\pipe\\booth-shelf-mcp-${suffix}`
    : path.posix.join(directory, `bridge-${suffix}.sock`);
}

export function createToken() {
  return randomBytes(32).toString("hex");
}

export function writeSession(directory, session) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, SESSION_FILE_NAME);
  const temporary = `${target}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(session), { mode: 0o600 });
  renameSync(temporary, target);
}

export function readSession(directory) {
  try {
    const session = JSON.parse(readFileSync(path.join(directory, SESSION_FILE_NAME), "utf8"));
    if (typeof session?.pipe !== "string" || !/^[0-9a-f]{64}$/.test(session?.token || "")) return null;
    return session;
  } catch {
    return null;
  }
}

// Only the host that wrote the session removes it, so a stale host cannot
// delete the file of a newer one.
export function removeSession(directory, token) {
  if (readSession(directory)?.token === token) {
    rmSync(path.join(directory, SESSION_FILE_NAME), { force: true });
  }
}
