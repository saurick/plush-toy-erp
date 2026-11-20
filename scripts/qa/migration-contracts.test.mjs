import assert from "node:assert/strict";
import test from "node:test";
import {
  checkMigrationContracts,
  MIGRATION_CONTRACT_TESTS,
} from "./migration-contracts.mjs";

function summary({ tests = 1, pass = 1, fail = 0, skipped = 0 } = {}) {
  return Object.entries({ tests, pass, fail, skipped, cancelled: 0, todo: 0 })
    .map(([key, value]) => `# ${key} ${value}`)
    .join("\n");
}

test("migration contracts run current files without a Git clean or database prerequisite", () => {
  const outcome = checkMigrationContracts({
    execute(command, args, options) {
      assert.equal(command, process.execPath);
      assert.deepEqual(args.slice(3), MIGRATION_CONTRACT_TESTS);
      assert.equal(options.env.GIT_OPTIONAL_LOCKS, "0");
      assert.equal(
        options.cwd,
        new URL("../..", import.meta.url).pathname.replace(/\/$/u, ""),
      );
      return { status: 0, stdout: summary() };
    },
  });
  assert.equal(outcome.exitCode, 0);
});

test("migration contracts fail closed on failure, empty, skipped or missing test evidence", () => {
  for (const result of [
    { status: 1, stdout: summary({ pass: 0, fail: 1 }) },
    { status: 0, stdout: summary({ tests: 0, pass: 0 }) },
    { status: 0, stdout: summary({ pass: 0, skipped: 1 }) },
    { status: 0, stdout: "" },
    { status: null, signal: "SIGTERM", stdout: summary() },
  ]) {
    assert.notEqual(
      checkMigrationContracts({ execute: () => result }).exitCode,
      0,
    );
  }
});
