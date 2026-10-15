import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
} from "node:fs";

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

export function readBoundedPlainFile(
  file,
  { maximumBytes, minimumBytes = 1 } = {},
) {
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes <= 0 ||
    !Number.isSafeInteger(minimumBytes) ||
    minimumBytes < 0 ||
    minimumBytes > maximumBytes
  ) {
    throw new Error("bounded file limits are invalid");
  }
  if (!Number.isInteger(constants.O_NOFOLLOW) || constants.O_NOFOLLOW <= 0) {
    throw new Error("O_NOFOLLOW is required for bounded file reads");
  }
  const initial = lstatSync(file, { bigint: true });
  if (!initial.isFile() || initial.isSymbolicLink()) {
    throw new Error("bounded file is not a plain file");
  }
  const descriptor = openSync(
    file,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW || 0) |
      (constants.O_NONBLOCK || 0),
  );
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (
      !before.isFile() ||
      before.dev !== initial.dev ||
      before.ino !== initial.ino ||
      before.mode !== initial.mode ||
      before.nlink !== initial.nlink ||
      before.uid !== initial.uid ||
      before.gid !== initial.gid ||
      before.size !== initial.size ||
      before.mtimeNs !== initial.mtimeNs ||
      before.ctimeNs !== initial.ctimeNs ||
      before.size < BigInt(minimumBytes) ||
      before.size > BigInt(maximumBytes)
    ) {
      throw new Error("bounded file size is invalid");
    }
    const content = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (
      BigInt(content.byteLength) !== before.size ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.mode !== before.mode ||
      after.nlink !== before.nlink ||
      after.uid !== before.uid ||
      after.gid !== before.gid ||
      after.size !== before.size ||
      after.mtimeNs !== before.mtimeNs ||
      after.ctimeNs !== before.ctimeNs
    ) {
      throw new Error("bounded file changed while it was read");
    }
    return {
      content,
      sha256: createHash("sha256").update(content).digest("hex"),
    };
  } finally {
    closeSync(descriptor);
  }
}
