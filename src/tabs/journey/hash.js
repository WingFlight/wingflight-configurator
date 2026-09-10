// Stable hashing of "the settings this check depends on".
//
// An acknowledged check stores a hash of exactly the settings it depends on.
// If any of them changes, the hash no longer matches and the acknowledgment
// turns stale -- and nothing else does. Keys are sorted so object insertion
// order never matters; undefined values are dropped so an optional field that
// was never fetched hashes the same as one that is absent.

export function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value)
      .filter((k) => value[k] !== undefined && typeof value[k] !== "function")
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return "null";
}

// FNV-1a, 32-bit, as 8 hex characters. Not cryptographic -- it only needs to
// detect that a dependency changed, and it must be cheap enough to run on
// every refresh.
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function configHash(deps) {
  return hashString(stableStringify(deps));
}
