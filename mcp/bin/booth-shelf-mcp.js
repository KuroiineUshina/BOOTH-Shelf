#!/usr/bin/env node
// booth-shelf-mcp — connects AI tools (Claude Code, Codex) to the BOOTH Shelf
// browser extension.
//
//   booth-shelf-mcp                 run the MCP server on stdio (for AI tools)
//   booth-shelf-mcp install [--extension-id <id>]... [--no-register]
//                                   register the browser helper for this user
//                                   and add the MCP server to Codex / Claude Code
//   booth-shelf-mcp uninstall [--no-register]
//                                   remove the browser helper and registrations
//   booth-shelf-mcp status          check the connection to the extension
//   booth-shelf-mcp host            started by Chrome; not for direct use
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callBridge } from "../src/bridge-client.js";
import { registerClaudeCode, registerCodex, unregisterClaudeCode, unregisterCodex } from "../src/clients.js";
import { createHost } from "../src/host.js";
import { applyInstall, applyUninstall, describeMcpSetup, findVirtualizedInstall, planInstall } from "../src/install.js";
import { createMcpServer } from "../src/mcp-server.js";
import { appDirectory } from "../src/session.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
const directory = appDirectory();
const [command = "serve", ...rest] = process.argv.slice(2);

function extensionIdsFromArgs(args) {
  const ids = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--extension-id" && args[index + 1]) ids.push(args[(index += 1)]);
    else if (args[index].startsWith("--extension-id=")) ids.push(args[index].slice("--extension-id=".length));
  }
  return ids;
}

async function serve() {
  const server = createMcpServer({
    version,
    call: (method, params) => callBridge(method, params, { directory }),
    write: (text) => process.stdout.write(text),
  });
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) await server.handleLine(line);
}

// Chrome hides a host's stderr, so starts and stops also go to a small log
// file next to the session file for troubleshooting.
function hostLogger() {
  const file = path.join(directory, "host.log");
  return (message) => {
    const line = `${new Date().toISOString()} [${process.pid}] ${message}\n`;
    process.stderr.write(line);
    try {
      mkdirSync(directory, { recursive: true });
      if (existsSync(file) && statSync(file).size > 64 * 1024) writeFileSync(file, "");
      appendFileSync(file, line);
    } catch {
      // Logging must never stop the host.
    }
  };
}

async function host() {
  const log = hostLogger();
  log(`Started by ${rest.find((arg) => arg.startsWith("chrome-extension://")) || "unknown caller"}`);
  process.on("uncaughtException", (error) => {
    log(`Crashed: ${error?.stack || error}`);
    process.exit(1);
  });
  const instance = createHost({ input: process.stdin, output: process.stdout, directory, version, log });
  await instance.start();
  process.exit(0);
}

async function status() {
  try {
    const result = await callBridge("status", {}, { directory, timeoutMs: 10_000 });
    console.log(`Connected to BOOTH Shelf ${result.extensionVersion}: ${result.itemCount} items (last sync ${result.lastSyncedAt ?? "never"}).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

function install() {
  const plan = planInstall({ extensionIds: extensionIdsFromArgs(rest) });
  applyInstall(plan, { packageRoot });
  const virtualized = findVirtualizedInstall(plan);
  if (virtualized) {
    applyUninstall(plan);
    console.error([
      "This terminal runs inside a packaged app (for example Claude Desktop), so Windows",
      `redirected the installation to a private copy (${virtualized}) that Chrome cannot see.`,
      "Nothing was installed. Open Windows Terminal or PowerShell from the Start menu and run the same command there.",
    ].join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log(`Installed the BOOTH Shelf browser helper in ${plan.directory}`);
  console.log(`Allowed extensions: ${plan.manifest.allowed_origins.join(", ")}`);

  if (rest.includes("--no-register")) {
    console.log("\nAdd the MCP server to your AI tool:\n");
    console.log(describeMcpSetup(plan));
  } else {
    console.log("\nAI tools:");
    const results = [registerCodex(plan.mcpCommand), registerClaudeCode(plan.mcpCommand)];
    for (const result of results) console.log(`  ${describeClientResult(result)}`);
    if (!results.some((result) => result.status === "registered")) {
      console.log("\nNo AI tool was found. Add the MCP server to your AI tool manually:\n");
      console.log(describeMcpSetup(plan));
    }
  }
  console.log("\nRestart Chrome, then turn on Settings > AI connection (MCP) in BOOTH Shelf.");
  console.log("Start a new Codex or Claude Code session to load the BOOTH tools.");
}

function describeClientResult({ client, status, detail }) {
  const messages = {
    registered: `${client}: registered booth-shelf${detail ? ` (${detail})` : ""}`,
    removed: `${client}: removed booth-shelf${detail ? ` (${detail})` : ""}`,
    not_found: `${client}: not installed, skipped`,
    not_registered: `${client}: booth-shelf was not registered`,
    failed: `${client}: could not register (${detail})`,
  };
  return messages[status] || `${client}: ${status}`;
}

function uninstall() {
  applyUninstall(planInstall());
  console.log("Removed the BOOTH Shelf browser helper.");
  if (!rest.includes("--no-register")) {
    for (const result of [unregisterCodex(), unregisterClaudeCode()]) console.log(`  ${describeClientResult(result)}`);
  }
}

const commands = { serve, host, status, install, uninstall };
if (!Object.hasOwn(commands, command)) {
  console.error(`Unknown command: ${command}\nUsage: booth-shelf-mcp [install|uninstall|status]`);
  process.exit(2);
}
Promise.resolve(commands[command]()).catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
