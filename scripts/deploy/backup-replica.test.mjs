import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

test("backup replica validates media, immutable copies, retention and restore cleanup", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const result = spawnSync(
    "python3",
    [
      "-B",
      "-m",
      "unittest",
      "discover",
      "-s",
      "scripts/deploy/backup-replica",
      "-p",
      "test_*.py",
      "-v",
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 60_000,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    },
  );
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  assert.ifError(result.error);
  assert.equal(result.status, 0, output);
  assert.match(output, /Ran 26 tests/u);
  assert.match(output, /\bOK\b/u);
  assert.doesNotMatch(output, /skipped=/u);
});
