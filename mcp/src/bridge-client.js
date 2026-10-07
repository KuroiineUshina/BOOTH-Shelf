// Connects an MCP server process to the running native host.
import net from "node:net";
import { readSession } from "./session.js";

export class BridgeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const NOT_CONNECTED_MESSAGE = "BOOTH Shelf is not connected. Open Chrome, then in BOOTH Shelf open Settings and turn on the AI connection (MCP). If it says the helper is missing, run `npx booth-shelf-mcp install` once and restart Chrome.";

export function callBridge(method, params = {}, { directory, timeoutMs = 120_000, connect = net.connect } = {}) {
  const session = readSession(directory);
  if (!session) return Promise.reject(new BridgeError("NOT_CONNECTED", NOT_CONNECTED_MESSAGE));

  return new Promise((resolve, reject) => {
    const socket = connect(session.pipe);
    let buffer = "";
    let settled = false;
    const requestId = 1;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(() => {
      finish(new BridgeError("TIMEOUT", `BOOTH Shelf did not answer ${method} within ${Math.round(timeoutMs / 1000)} seconds.`));
    }, timeoutMs);

    socket.setEncoding("utf8");
    socket.on("connect", () => {
      socket.write(`${JSON.stringify({ type: "auth", token: session.token })}\n`);
    });
    socket.on("data", (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          finish(new BridgeError("PROTOCOL", "Received an invalid message from the BOOTH Shelf host."));
          return;
        }
        if (message.type === "ready") {
          socket.write(`${JSON.stringify({ id: requestId, method, params })}\n`);
        } else if (message.id === requestId) {
          if (message.error) finish(new BridgeError(message.error.code || "ERROR", message.error.message || "BOOTH Shelf error."));
          else finish(null, message.result);
        }
      }
    });
    socket.on("error", () => finish(new BridgeError("NOT_CONNECTED", NOT_CONNECTED_MESSAGE)));
    socket.on("close", () => finish(new BridgeError("NOT_CONNECTED", NOT_CONNECTED_MESSAGE)));
  });
}
