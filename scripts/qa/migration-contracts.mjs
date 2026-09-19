import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildNodeTestArgs,
  classifyNodeTestResult,
} from "./run-node-tests.mjs";

// Read the current files, including uncommitted edits. These tests use isolated
// fixtures and never prepare or apply migrations against a real target.
export const MIGRATION_CONTRACT_TESTS = Object.freeze([
  "scripts/local-migration.test.mjs",
  "scripts/local-migration-workflow.test.mjs",
  "scripts/qa/migration-contracts.test.mjs",
  "scripts/qa/migration-makefile-contract.test.mjs",
  "scripts/qa/populated-upgrade-preflight.test.mjs",
  "web/dev-server/devDatabaseMigrationRuntime.test.mjs",
  "web/dev-server/devDatabaseMigrationPlugin.test.mjs",
]);

export function checkMigrationContracts({ execute = spawnSync } = {}) {
  const result = execute(
    process.execPath,
    buildNodeTestArgs(MIGRATION_CONTRACT_TESTS),
    {
      cwd: path.resolve(import.meta.dirname, "../.."),
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  return { result, ...classifyNodeTestResult(result) };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const outcome = checkMigrationContracts();
  process.stdout.write(outcome.result.stdout || "");
  process.stderr.write(outcome.result.stderr || "");
  console.log(
    `[qa:migration-contracts] status=${outcome.exitCode === 0 ? "passed" : "blocked"} tests=${outcome.summary?.tests ?? "missing"} pass=${outcome.summary?.pass ?? "missing"} skipped=${outcome.summary?.skipped ?? "missing"}`,
  );
  process.exitCode = outcome.exitCode;
}
