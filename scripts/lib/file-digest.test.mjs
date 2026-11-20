import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  readBoundedPlainFile,
  sha256DigestFile,
  sha256File,
} from "./file-digest.mjs";

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

test("bounded plain-file read binds validation, content and digest to one descriptor", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-bounded-file-"));
  try {
    const file = path.join(root, "manifest.json");
    const empty = path.join(root, "empty.json");
    const link = path.join(root, "manifest-link.json");
    const directory = path.join(root, "directory");
    const content = Buffer.from('{"schemaVersion":"example/v1"}\n');
    writeFileSync(file, content);
    writeFileSync(empty, "");
    mkdirSync(directory);
    symlinkSync(file, link);

    const snapshot = readBoundedPlainFile(file, { maximumBytes: 1024 });
    assert.deepEqual(snapshot.content, content);
    assert.equal(
      snapshot.sha256,
      createHash("sha256").update(content).digest("hex"),
    );
    assert.throws(
      () => readBoundedPlainFile(link, { maximumBytes: 1024 }),
      /plain file/u,
    );
    assert.throws(
      () => readBoundedPlainFile(file, { maximumBytes: 4 }),
      /size/u,
    );
    assert.throws(
      () => readBoundedPlainFile(empty, { maximumBytes: 1024 }),
      /size/u,
    );
    assert.throws(
      () => readBoundedPlainFile(directory, { maximumBytes: 1024 }),
      /plain file/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
