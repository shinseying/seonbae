// Reads the first bytes of a stored document so its real type can be checked
// against the MIME type the uploader claimed.
//
// On 2026-09-22 a tutor signup hung here for the full 300-second function limit:
// storage served the 16-byte range response, the route never reached the second
// document or signUp, and the applicant watched a spinner until the platform
// killed the request. The old read (manual reader, then an awaited
// reader.cancel()) reproduces the hang when it runs through Next's patched fetch
// inside a route handler against a real 206 response, and does not hang under
// plain Node fetch, so the wrapper is part of the trigger.
//
// Two rules keep it from happening again. Once the bytes are in hand the request
// is aborted rather than cancelled and awaited. And the whole read runs under a
// deadline, so a stall fails this one check instead of the whole request.
export const DOCUMENT_HEADER_BYTES = 16;
export const DOCUMENT_HEADER_TIMEOUT_MS = 8_000;

export async function readDocumentHeaderFromUrl(
  url: string,
  {
    byteCount = DOCUMENT_HEADER_BYTES,
    timeoutMs = DOCUMENT_HEADER_TIMEOUT_MS,
    fetchImpl = fetch,
  }: {
    byteCount?: number;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<Uint8Array | null> {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      cache: "no-store",
      headers: { Range: `bytes=0-${byteCount - 1}` },
      signal: controller.signal,
    });
    if (!response.ok || !response.body) return null;

    const reader = response.body.getReader();
    const bytes: number[] = [];
    while (bytes.length < byteCount) {
      const chunk = await reader.read();
      if (chunk.done) break;
      for (const byte of chunk.value) {
        bytes.push(byte);
        if (bytes.length === byteCount) break;
      }
    }
    return new Uint8Array(bytes);
  } catch {
    return null;
  } finally {
    clearTimeout(deadline);
    // Whatever remains of the body is not needed. Aborting releases the socket
    // without waiting on the other end, which is the step that used to hang.
    controller.abort();
  }
}
