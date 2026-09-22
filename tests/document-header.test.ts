import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { readDocumentHeaderFromUrl } from "../utils/files/document-header.ts";

const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

async function serve(handler: Parameters<typeof createServer>[1]) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}/doc.png` };
}

function close(server: Server) {
  server.closeAllConnections();
  return new Promise<void>((resolve) => server.close(() => resolve()));
}

test("returns the header from an ordinary range response", async () => {
  const { server, url } = await serve((_request, response) => {
    response.writeHead(206, { "content-length": "16" });
    response.end(PNG_HEADER);
  });
  try {
    assert.deepEqual(await readDocumentHeaderFromUrl(url), new Uint8Array(PNG_HEADER));
  } finally {
    await close(server);
  }
});

// The contract the 2026-09-22 fix relies on: once 16 bytes are in, return, even
// if the body never ends. The production hang itself needs Next's patched fetch
// to reproduce, which plain node:test does not load, so this guards the
// behaviour rather than replaying the exact failure.
test("returns promptly when the body stays open after the header", async () => {
  const { server, url } = await serve((_request, response) => {
    response.writeHead(206, { "content-type": "image/png" });
    response.write(PNG_HEADER);
    // Never call end(): the connection stays open.
  });
  try {
    const started = Date.now();
    const header = await readDocumentHeaderFromUrl(url, { timeoutMs: 5_000 });
    assert.deepEqual(header, new Uint8Array(PNG_HEADER));
    assert.ok(Date.now() - started < 1_000, "took the deadline instead of returning at 16 bytes");
  } finally {
    await close(server);
  }
});

test("gives up at the deadline when no body ever arrives", async () => {
  const { server, url } = await serve((_request, response) => {
    response.writeHead(206, { "content-type": "image/png" });
    response.flushHeaders();
  });
  try {
    const started = Date.now();
    assert.equal(await readDocumentHeaderFromUrl(url, { timeoutMs: 300 }), null);
    assert.ok(Date.now() - started < 2_000, "did not stop at the deadline");
  } finally {
    await close(server);
  }
});

test("rejects an error response instead of reading it as a header", async () => {
  const { server, url } = await serve((_request, response) => {
    response.writeHead(403);
    response.end("forbidden");
  });
  try {
    assert.equal(await readDocumentHeaderFromUrl(url), null);
  } finally {
    await close(server);
  }
});
