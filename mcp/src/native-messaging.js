// Chrome native messaging framing: a 32-bit little-endian length followed by
// UTF-8 JSON. Chrome sends up to 64 MiB; a host may send at most 1 MB back.
export const MAX_INCOMING_MESSAGE_BYTES = 64 * 1024 * 1024;
export const MAX_OUTGOING_MESSAGE_BYTES = 1024 * 1024;

export function encodeNativeMessage(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  if (body.length > MAX_OUTGOING_MESSAGE_BYTES) {
    throw new Error(`Native message is ${body.length} bytes; Chrome accepts at most ${MAX_OUTGOING_MESSAGE_BYTES}.`);
  }
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

export class NativeMessageReader {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.buffer = Buffer.alloc(0);
  }

  push(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : Buffer.from(chunk);
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (length > MAX_INCOMING_MESSAGE_BYTES) {
        throw new Error(`Native message of ${length} bytes exceeds the ${MAX_INCOMING_MESSAGE_BYTES} byte limit.`);
      }
      if (this.buffer.length < 4 + length) return;
      const body = this.buffer.subarray(4, 4 + length);
      this.buffer = this.buffer.subarray(4 + length);
      this.onMessage(JSON.parse(body.toString("utf8")));
    }
  }
}
