const HEX_ID = /^[A-F0-9]{8}$/;

/** Internal relation key. The separate roster number is the human-facing ID. */
export function createTutorRegistryId(seed?: string) {
  const source = seed?.replace(/[^a-fA-F0-9]/g, "")
    || globalThis.crypto?.randomUUID?.().replaceAll("-", "")
    || fallbackHex();
  const segment = source.slice(0, 8).toUpperCase();
  return `T-${HEX_ID.test(segment) ? segment : fallbackHex()}`;
}

function fallbackHex() {
  const first = Math.floor(Math.random() * 0x1_0000).toString(16).padStart(4, "0");
  const second = Math.floor(Math.random() * 0x1_0000).toString(16).padStart(4, "0");
  return `${first}${second}`.toUpperCase();
}
