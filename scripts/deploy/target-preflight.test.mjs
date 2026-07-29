import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

import {
  REMOTE_TARGET_PREFLIGHT_CONTRACT,
  REMOTE_TARGET_PREFLIGHT_SCRIPT,
  parseRemoteTargetPreflight,
  runTargetPreflight,
} from "./target-preflight.mjs";

const SHA = "a".repeat(40);
const BACKUP_HASH = "b".repeat(64);

function remoteReport(overrides = {}) {
  const values = {
    SCHEMA_VERSION: REMOTE_TARGET_PREFLIGHT_CONTRACT,
    STATUS: "passed",
    TARGET: "test-133",
    HOSTNAME: "simon",
    USER: "simon",
    ROOT_AVAILABLE_BYTES: String(40 * 1024 ** 3),
    MINIMUM_AVAILABLE_BYTES: String(30 * 1024 ** 3),
    CAPACITY_STATUS: "passed",
    ENV_STATUS: "passed",
    COMPOSE_STATUS: "passed",
    DATABASE_STATUS: "passed",
    DATABASE_NAME: "plush_erp_uat_20260716_v5",
    SERVER_SHA: SHA,
    WEB_SHA: SHA,
    SERVER_HEALTH: "passed",
    SERVER_READY: "passed",
    WEB_HEALTH: "passed",
    MIGRATION_LOCK_STATUS: "free",
    BACKUP_TOOLING_STATUS: "passed",
    LATEST_BACKUP_SHA256: BACKUP_HASH,
    LATEST_BACKUP_SIZE_BYTES: "612412",
    BLOCKERS: "none",
    ...overrides,
  };
  return `${Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")}\n`;
}

test("target preflight parser returns bounded redacted evidence", () => {
  const report = parseRemoteTargetPreflight(remoteReport());
  assert.equal(report.status, "passed");
  assert.equal(report.runtime.serverSha, SHA);
  assert.equal(report.backup.freshBackupRequiredForPromotion, true);
  assert.equal("ssh" in report, false);
  assert.doesNotMatch(JSON.stringify(report), /192\.168|\/home\/simon/u);
});

test("target preflight parser fails closed on identity and blocker drift", () => {
  assert.throws(
    () => parseRemoteTargetPreflight(remoteReport({ HOSTNAME: "other" })),
    /identity/u,
  );
  assert.throws(
    () =>
      parseRemoteTargetPreflight(
        remoteReport({
          STATUS: "blocked",
          CAPACITY_STATUS: "blocked",
          BLOCKERS: "none",
        }),
      ),
    /blocker\/status/u,
  );
  assert.throws(
    () =>
      parseRemoteTargetPreflight(
        `${remoteReport()}UNEXPECTED=/private/path\n`,
      ),
    /key is invalid/u,
  );
});

test("target preflight uses only fixed SSH destination and streamed script", () => {
  let invocation;
  const report = runTargetPreflight("test-133", {
    now: "2026-07-29T02:00:00.000Z",
    runCommand: (command, args, options) => {
      invocation = { command, args, options };
      return { status: 0, stdout: remoteReport(), stderr: "" };
    },
  });
  assert.equal(report.status, "passed");
  assert.equal(invocation.command, "ssh");
  assert.deepEqual(invocation.args.slice(-3), [
    "simon@192.168.0.133",
    "bash",
    "-s",
  ]);
  assert.equal(invocation.options.input, REMOTE_TARGET_PREFLIGHT_SCRIPT);
  assert.doesNotMatch(
    invocation.args.join(" "),
    /docker|compose|\/home\/simon|plush_erp/u,
  );
  assert.equal(
    Object.keys(invocation.options).some((key) =>
      /password|secret|token/iu.test(key),
    ),
    false,
  );
});

test("target preflight CLI reports current disk blocker without mutation", () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(import.meta.dirname, "target-preflight.mjs"),
      "--target",
      "test-133",
      "--json",
    ],
    { encoding: "utf8", timeout: 30_000 },
  );
  assert.equal(result.status, 2, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "blocked");
  assert(report.blockers.includes("target_disk_capacity_low"));
  assert(report.remote.capacity.availableBytes < 30 * 1024 ** 3);
  assert.equal(report.notProven.includes("new release promotion and smoke"), true);
});

test("remote target preflight script is read-only and contains no build command", () => {
  assert.doesNotMatch(
    REMOTE_TARGET_PREFLIGHT_SCRIPT,
    /\b(?:docker\s+build|pnpm|go\s+build|make\s+build|git\s+clone|git\s+checkout)\b/u,
  );
  assert.doesNotMatch(
    REMOTE_TARGET_PREFLIGHT_SCRIPT,
    /\b(?:rm|mv|cp|mkdir|touch|truncate|docker\s+load|docker\s+compose.+up|atlas\s+migrate\s+apply)\b/u,
  );
  assert.match(REMOTE_TARGET_PREFLIGHT_SCRIPT, /minimum_available_bytes=32212254720/u);
  assert.match(REMOTE_TARGET_PREFLIGHT_SCRIPT, /fresh pre-migration/u);
});
