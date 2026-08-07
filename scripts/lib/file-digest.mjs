import { createHash } from "node:crypto";
import { closeSync, openSync, readSync } from "node:fs";

const DEFAULT_CHUNK_BYTES = 1024 * 1024;

export function sha256File(file, { chunkBytes = DEFAULT_CHUNK_BYTES } = {}) {
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) {
    throw new Error("chunkBytes must be a positive safe integer");
  }
  const descriptor = openSync(file, "r");
  const buffer = Buffer.allocUnsafe(chunkBytes);
  const hash = createHash("sha256");
  try {
    while (true) {
      const bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    closeSync(descriptor);
  }
  return hash.digest("hex");
}

export function sha256DigestFile(file, options) {
  return `sha256:${sha256File(file, options)}`;
}
