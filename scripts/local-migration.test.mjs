import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  applyConfirmation,
  classifyDevelopmentTarget,
  classifyFailedApply,
  maintenanceConfirmation,
  migrationPlanID,
  normalizeSchemaDiffOutput,
  targetConfirmation,
  unsafeRehearsalReason,
} from "./local-migration.mjs";

const identity = Object.freeze({
  database: "plush_erp_simon_dev",
  user: "test_user",
  systemIdentifier: "7572907083182862377",
});

test("local migration: only the exact application-config 106 development family is shared-dev", () => {
  const registered = classifyDevelopmentTarget(
    "postgres://user:secret@192.168.0.106:5432/plush_erp_simon_dev?sslmode=disable",
    "application-config",
  );
  assert.equal(registered.scope, "shared-dev");
  assert.equal(
    registered.safeTarget,
    "host=192.168.0.106 port=5432 database=plush_erp_simon_dev",
  );
  assert.doesNotMatch(registered.safeTarget, /user|secret/u);

  for (const [url, source] of [
    [
      "postgres://user:secret@192.168.0.106:5432/plush_erp_simon_dev",
      "environment",
    ],
    [
      "postgres://user:secret@192.168.0.106:5432/plush_erp_dev",
      "application-config",
    ],
    [
      "postgres://user:secret@192.168.0.133:5435/plush_erp_simon_dev",
      "application-config",
    ],
    [
      "postgres://user:secret@192.168.0.106:5432/unrelated_dev",
      "application-config",
    ],
  ]) {
    assert.equal(classifyDevelopmentTarget(url, source).scope, "untrusted");
  }
  assert.throws(
    () =>
      classifyDevelopmentTarget(
        "postgres://user:secret@127.0.0.1:5432/plush_erp_simon_dev?host=192.168.0.133",
        "environment",
      ),
    /不允许通过 query 参数覆盖 host/u,
  );
});

test("local migration: loopback isolated plush databases remain available", () => {
  for (const url of [
    "postgres://user:secret@127.0.0.1:55432/plush_erp_migration_test",
    "postgres://user:secret@localhost:5432/plush_erp",
    "postgres://user:secret@[::1]:5432/plush_erp_acceptance_dev",
  ]) {
    assert.equal(classifyDevelopmentTarget(url, "environment").scope, "local");
  }
});

test("local migration: confirmations bind target, migration hash, revision and pending set", () => {
  const target = classifyDevelopmentTarget(
    "postgres://user:secret@192.168.0.106:5432/plush_erp_simon_dev",
    "application-config",
  );
  const confirmation = targetConfirmation(target, identity);
  assert.match(confirmation.value, /^TRUST_SHARED_DEV_DATABASE:[a-f0-9]{20}$/u);

  const planID = migrationPlanID({
    targetID: confirmation.targetID,
    migrationHash: "a".repeat(64),
    currentVersion: "20260726173924",
    pendingVersions: ["20260726173943", "20260726174057"],
  });
  assert.match(
    applyConfirmation(planID),
    /^APPLY_DEV_MIGRATIONS:[a-f0-9]{24}$/u,
  );
  assert.match(
    maintenanceConfirmation(planID),
    /^SHARED_DEV_MAINTENANCE_READY:[a-f0-9]{24}$/u,
  );
  assert.notEqual(
    planID,
    migrationPlanID({
      targetID: confirmation.targetID,
      migrationHash: "b".repeat(64),
      currentVersion: "20260726173924",
      pendingVersions: ["20260726173943", "20260726174057"],
    }),
  );
});

test("local migration: rollback rehearsal allows PL/pgSQL blocks but rejects durable side effects", () => {
  assert.equal(unsafeRehearsalReason("DO $$ BEGIN PERFORM 1; END $$;"), "");
  assert.equal(
    unsafeRehearsalReason("-- COMMIT is only documentation\nSELECT 1;"),
    "",
  );
  assert.equal(unsafeRehearsalReason("COMMIT;"), "transaction control");
  assert.equal(
    unsafeRehearsalReason("SELECT nextval('business_number_seq');"),
    "sequence mutation",
  );
  assert.equal(
    unsafeRehearsalReason(
      "CREATE INDEX CONCURRENTLY example_idx ON example(id);",
    ),
    "concurrent index",
  );
});

test("local migration: failed apply distinguishes no revision advance from unknown commit", () => {
  const before = {
    Status: "PENDING",
    Current: "20260726173924",
    Next: "20260726173943",
    Available: [{ Version: "20260726173924" }, { Version: "20260726173943" }],
    Applied: [{ Version: "20260726173924" }],
  };
  assert.equal(
    classifyFailedApply(before, structuredClone(before)),
    "apply_failed_no_revision_advance",
  );
  assert.equal(classifyFailedApply(before, null), "committed_unverified");
  assert.equal(
    classifyFailedApply(before, {
      ...before,
      Status: "OK",
      Current: "20260726173943",
      Next: "Already at latest version",
      Applied: before.Available,
    }),
    "committed_unverified",
  );
});

test("local migration: Atlas zero-diff success text is not treated as schema drift", () => {
  assert.equal(normalizeSchemaDiffOutput(""), "");
  assert.equal(
    normalizeSchemaDiffOutput("Schemas are synced, no changes to be made.\n"),
    "",
  );
  assert.equal(
    normalizeSchemaDiffOutput('ALTER TABLE "example" ADD COLUMN "name" text;'),
    'ALTER TABLE "example" ADD COLUMN "name" text;',
  );
});

test("local migration: operational lifecycle audit is read-only and reports every blocker together", () => {
  const source = fs.readFileSync(
    path.join(
      import.meta.dirname,
      "qa/operational-fact-lifecycle-20260726173943.sql",
    ),
    "utf8",
  );
  for (const required of [
    "BEGIN TRANSACTION READ ONLY",
    "finance_facts",
    "production_facts",
    "outsourcing_facts",
    "posted_by",
    "settled_by",
    "cancelled_by",
    "finance=%, production=%, outsourcing=%",
    "authoritative source",
    "ROLLBACK",
  ]) {
    assert(
      source.includes(required),
      `missing lifecycle audit boundary: ${required}`,
    );
  }
  assert.doesNotMatch(
    source,
    /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|COPY)\b/iu,
  );
});
