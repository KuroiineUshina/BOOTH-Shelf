// Native messaging host. Chrome starts this process when the BOOTH Shelf
// extension turns the AI connection on; it relays requests from local MCP
// servers (over a token-protected pipe) to the extension and back.
import net from "node:net";
import { rmSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { NativeMessageReader, encodeNativeMessage } from "./native-messaging.js";
import { createPipePath, createToken, removeSession, writeSession } from "./session.js";

export const ALLOWED_METHODS = Object.freeze(["status", "search_library", "list_files", "download", "download_status"]);
const MAX_PIPE_LINE_BYTES = 256 * 1024;
const MAX_CONNECTIONS = 8;
const MAX_PENDING_PER_CONNECTION = 16;

function tokensMatch(expected, received) {
  if (typeof received !== "string" || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export function createHost({
  input,
  output,
  directory,
  platform = process.platform,
  log = (message) => process.stderr.write(`[booth-shelf-mcp host] ${message}\n`),
  version = "",
}) {
  const token = createToken();
  const pipePath = createPipePath(directory, { platform });
  const pending = new Map();
  const sockets = new Set();
  let sequence = 0;
  let server = null;
  let stopped = false;
  let resolveStopped;
  const stoppedPromise = new Promise((resolve) => { resolveStopped = resolve; });

  const sendToChrome = (message) => output.write(encodeNativeMessage(message));

  function reply(socket, message) {
    if (!socket.destroyed) socket.write(`${JSON.stringify(message)}\n`);
  }

  function failPending(socket, message) {
    for (const [id, entry] of pending) {
      if (socket && entry.socket !== socket) continue;
      pending.delete(id);
      reply(entry.socket, { id: entry.clientId, error: { code: "BRIDGE_UNAVAILABLE", message } });
    }
  }

  function handleChromeMessage(message) {
    if (message?.type === "hello") {
      sendToChrome({ type: "ready", version });
      return;
    }
    if (message?.type !== "response") return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    reply(entry.socket, message.error
      ? { id: entry.clientId, error: message.error }
      : { id: entry.clientId, result: message.result });
  }

  function handleClientLine(socket, state, line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      socket.destroy();
      return;
    }
    if (!state.authenticated) {
      if (message?.type !== "auth" || !tokensMatch(token, message.token)) {
        log("Rejected a pipe client with a wrong token.");
        socket.destroy();
        return;
      }
      state.authenticated = true;
      reply(socket, { type: "ready" });
      return;
    }
    const clientId = message?.id;
    if (typeof clientId !== "string" && typeof clientId !== "number") return;
    if (!ALLOWED_METHODS.includes(message.method)) {
      reply(socket, { id: clientId, error: { code: "UNKNOWN_METHOD", message: `Unknown method ${message.method}.` } });
      return;
    }
    if ([...pending.values()].filter((entry) => entry.socket === socket).length >= MAX_PENDING_PER_CONNECTION) {
      reply(socket, { id: clientId, error: { code: "BUSY", message: "Too many requests in flight." } });
      return;
    }
    sequence += 1;
    const id = `r${sequence}`;
    pending.set(id, { socket, clientId });
    sendToChrome({ type: "request", id, method: message.method, params: message.params ?? {} });
  }

  function handleConnection(socket) {
    if (sockets.size >= MAX_CONNECTIONS) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    const state = { authenticated: false, buffer: "" };
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      state.buffer += chunk;
      if (Buffer.byteLength(state.buffer) > MAX_PIPE_LINE_BYTES) {
        socket.destroy();
        return;
      }
      let newline;
      while ((newline = state.buffer.indexOf("\n")) >= 0) {
        const line = state.buffer.slice(0, newline);
        state.buffer = state.buffer.slice(newline + 1);
        if (line.trim()) handleClientLine(socket, state, line);
      }
    });
    socket.on("close", () => {
      sockets.delete(socket);
      for (const [id, entry] of pending) if (entry.socket === socket) pending.delete(id);
    });
    socket.on("error", () => {});
  }

  function stop(reason = "stopped") {
    if (stopped) return stoppedPromise;
    stopped = true;
    log(`Stopping: ${reason}`);
    failPending(null, "The BOOTH Shelf extension disconnected.");
    for (const socket of sockets) socket.destroy();
    removeSession(directory, token);
    const finish = () => {
      if (platform !== "win32") rmSync(pipePath, { force: true });
      resolveStopped();
    };
    if (server) server.close(finish);
    else finish();
    return stoppedPromise;
  }

  async function start() {
    const reader = new NativeMessageReader(handleChromeMessage);
    input.on("data", (chunk) => {
      try {
        reader.push(chunk);
      } catch (error) {
        void stop(`invalid message from Chrome: ${error.message}`);
      }
    });
    input.on("end", () => { void stop("Chrome closed the connection"); });
    input.on("error", () => { void stop("input error"); });

    server = net.createServer(handleConnection);
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(pipePath, () => {
        server.off("error", reject);
        resolve();
      });
    });
    writeSession(directory, { pipe: pipePath, token, pid: process.pid, startedAt: new Date().toISOString(), version });
    log(`Listening for MCP clients (${pipePath}).`);
    return stoppedPromise;
  }

  return { start, stop, pipePath, token, pending };
}
