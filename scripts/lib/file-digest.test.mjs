import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { sha256DigestFile, sha256File } from "./file-digest.mjs";

test("file digest streams every chunk without loading a release archive at once", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-file-digest-"));
  try {
    const file = path.join(root, "artifact.bin");
    const content = Buffer.from("release-artifact:".repeat(257));
    writeFileSync(file, content);
    const expected = createHash("sha256").update(content).digest("hex");
    assert.equal(sha256File(file, { chunkBytes: 17 }), expected);
    assert.equal(sha256DigestFile(file, { chunkBytes: 19 }), `sha256:${expected}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("file digest rejects an invalid chunk size", () => {
  assert.throws(
    () => sha256File("unused", { chunkBytes: 0 }),
    /positive safe integer/u,
  );
});
