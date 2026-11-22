import { createServer } from "node:http";
import { createApp } from "./app.js";
import { MAX_BODY_BYTES } from "./http/limits.js";
import { REMOTE_ADDRESS_HEADER } from "./http/client.js";
const app = createApp();
const port = Number(process.env.PORT || 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
if (process.env.NODE_ENV === "production" && !process.env.FRONTEND_ORIGIN?.startsWith("https://")) throw new Error("Set FRONTEND_ORIGIN to the HTTPS frontend origin in production");
const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of incoming) {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        outgoing.writeHead(413, { "Content-Type": "application/json", "Connection": "close" });
        outgoing.end(JSON.stringify({ error: "REQUEST_TOO_LARGE" })); return;
      }
      chunks.push(chunk);
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join("; ") : value);
    }
    headers.set(REMOTE_ADDRESS_HEADER, incoming.socket.remoteAddress ?? "unknown");
    const request = new Request(new URL(incoming.url || "/", `http://localhost:${port}`), {
      method: incoming.method, headers,
      ...(incoming.method !== "GET" && incoming.method !== "HEAD" ? { body: Buffer.concat(chunks) } : {}),
    });
    const response = await app(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    // The app answers request errors itself; anything reaching here is an internal failure.
    if (!outgoing.headersSent) outgoing.writeHead(500, { "Content-Type": "application/json" });
    outgoing.end(JSON.stringify({ error: "SERVICE_UNAVAILABLE" }));
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(port, process.env.HOST || "127.0.0.1", () => console.log(`Backend listening on port ${port}`));
server.on("error", () => { console.error("Backend could not listen. Check HOST/PORT and whether the port is in use."); process.exitCode = 1; });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => {
  server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 5000).unref();
});
