const ANONYMOUS_ID_KEY = "wc2026-anonymous-id-v1";

let memoryAnonymousId = null;

function makeUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return [...bytes].map((byte, index) => {
    const separator = [4, 6, 8, 10].includes(index) ? "-" : "";
    return separator + byte.toString(16).padStart(2, "0");
  }).join("");
}

export function createClientUuid() {
  return makeUuid();
}

export function getAnonymousId() {
  if (memoryAnonymousId) return memoryAnonymousId;

  try {
    const stored = localStorage.getItem(ANONYMOUS_ID_KEY);
    if (stored) {
      memoryAnonymousId = stored;
      return stored;
    }
  } catch { /* Fall back to an in-memory identity. */ }

  memoryAnonymousId = makeUuid();
  try { localStorage.setItem(ANONYMOUS_ID_KEY, memoryAnonymousId); }
  catch { /* Storage may be blocked. */ }
  return memoryAnonymousId;
}

