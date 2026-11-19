import { createHash } from "node:crypto";

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

// Receipt and manifest digests depend on this key order and unchanged array order.
export function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

export function stableSha256(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}
