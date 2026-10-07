// Registers the native messaging host with Chromium browsers for the current
// user (no administrator rights) and copies the package to a stable folder,
// so clearing the npx cache does not break Chrome's launcher.
import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { HOST_NAME, STORE_EXTENSION_ID, appDirectory } from "./session.js";

const EXTENSION_ID_PATTERN = /^[a-p]{32}$/;

const WINDOWS_REGISTRY_ROOTS = Object.freeze([
  "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts",
  "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts",
  "HKCU\\Software\\Chromium\\NativeMessagingHosts",
  "HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts",
]);

function manifestDirectories(platform, home) {
  if (platform === "darwin") {
    const support = path.posix.join(home, "Library", "Application Support");
    return ["Google/Chrome", "Microsoft Edge", "Chromium", "BraveSoftware/Brave-Browser"]
      .map((browser) => path.posix.join(support, browser, "NativeMessagingHosts"));
  }
  const config = path.posix.join(home, ".config");
  return ["google-chrome", "microsoft-edge", "chromium", "BraveSoftware/Brave-Browser"]
    .map((browser) => path.posix.join(config, browser, "NativeMessagingHosts"));
}

export function normalizeExtensionIds(extraIds = []) {
  const ids = [STORE_EXTENSION_ID, ...extraIds.map((id) => String(id).trim().toLowerCase())];
  for (const id of ids) {
    if (!EXTENSION_ID_PATTERN.test(id)) throw new Error(`Invalid Chrome extension id: ${id}`);
  }
  return [...new Set(ids)];
}

export function planInstall({
  extensionIds = [],
  platform = process.platform,
  env = process.env,
  home = os.homedir(),
  nodePath = process.execPath,
} = {}) {
  const join = platform === "win32" ? path.win32.join : path.posix.join;
  const directory = appDirectory({ platform, env, home });
  const appPath = join(directory, "app");
  const scriptPath = join(appPath, "bin", "booth-shelf-mcp.js");
  const launcherPath = join(directory, platform === "win32" ? "booth-shelf-host.cmd" : "booth-shelf-host.sh");
  const launcher = platform === "win32"
    ? `@echo off\r\n"${nodePath}" "${scriptPath}" host %*\r\n`
    : `#!/bin/sh\nexec "${nodePath}" "${scriptPath}" host "$@"\n`;
  const manifest = {
    name: HOST_NAME,
    description: "BOOTH Shelf AI connection (booth-shelf-mcp)",
    path: launcherPath,
    type: "stdio",
    allowed_origins: normalizeExtensionIds(extensionIds).map((id) => `chrome-extension://${id}/`),
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;

  const files = [{ path: launcherPath, content: launcher, mode: 0o755 }];
  const registry = [];
  if (platform === "win32") {
    const manifestPath = join(directory, `${HOST_NAME}.json`);
    files.push({ path: manifestPath, content: manifestText, mode: 0o644 });
    for (const root of WINDOWS_REGISTRY_ROOTS) registry.push({ key: `${root}\\${HOST_NAME}`, value: manifestPath });
  } else {
    for (const manifestDirectory of manifestDirectories(platform, home)) {
      files.push({ path: path.posix.join(manifestDirectory, `${HOST_NAME}.json`), content: manifestText, mode: 0o644 });
    }
  }

  return {
    platform,
    directory,
    appPath,
    scriptPath,
    manifest,
    files,
    registry,
    mcpCommand: { command: nodePath, args: [scriptPath] },
  };
}

export function applyInstall(plan, { packageRoot }) {
  mkdirSync(plan.directory, { recursive: true, mode: 0o700 });
  if (path.resolve(packageRoot) !== path.resolve(plan.appPath)) {
    rmSync(plan.appPath, { recursive: true, force: true });
    for (const entry of ["bin", "src", "package.json", "README.md", "LICENSE"]) {
      const source = path.join(packageRoot, entry);
      if (existsSync(source)) cpSync(source, path.join(plan.appPath, entry), { recursive: true });
    }
  }
  for (const file of plan.files) {
    mkdirSync(path.dirname(file.path), { recursive: true });
    writeFileSync(file.path, file.content, { mode: file.mode });
    if (plan.platform !== "win32") chmodSync(file.path, file.mode);
  }
  for (const { key, value } of plan.registry) {
    execFileSync("reg", ["add", key, "/ve", "/t", "REG_SZ", "/d", value, "/f"], { stdio: "ignore" });
  }
}

// Apps installed as MSIX packages (e.g. Claude Desktop) run child processes in
// a container whose AppData and HKCU writes are redirected to a private copy
// the browser never sees. Detect that by finding our manifest in a package's
// LocalCache right after writing it.
export function findVirtualizedInstall(plan, { env = process.env, platform = process.platform } = {}) {
  if (platform !== "win32" || !env.LOCALAPPDATA) return null;
  const packages = path.win32.join(env.LOCALAPPDATA, "Packages");
  let entries = [];
  try {
    entries = readdirSync(packages, { withFileTypes: true });
  } catch {
    return null;
  }
  const relative = path.win32.relative(env.LOCALAPPDATA, plan.directory);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.win32.join(packages, entry.name, "LocalCache", "Local", relative, `${HOST_NAME}.json`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function applyUninstall(plan) {
  for (const { key } of plan.registry) {
    try {
      execFileSync("reg", ["delete", key, "/f"], { stdio: "ignore" });
    } catch {
      // Not registered for this browser.
    }
  }
  for (const file of plan.files) rmSync(file.path, { force: true });
  rmSync(plan.directory, { recursive: true, force: true });
}

export function describeMcpSetup(plan) {
  const { command, args } = plan.mcpCommand;
  const quoted = (value) => (/[\s"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value);
  return [
    "Claude Code:",
    `  claude mcp add booth-shelf -- ${[command, ...args].map(quoted).join(" ")}`,
    "",
    "Codex (~/.codex/config.toml):",
    "  [mcp_servers.booth-shelf]",
    `  command = ${JSON.stringify(command)}`,
    `  args = ${JSON.stringify(args)}`,
  ].join("\n");
}
