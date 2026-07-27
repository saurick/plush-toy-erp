import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  DATABASE_INVENTORY_SCHEMA,
  buildDatabaseInventoryReport,
  runDatabaseInventory,
} from "./database-inventory.mjs";

const atlasCurrent = Object.freeze({
  availability: "available",
  applied: 102,
  available: 102,
  currentVersion: "20260726174057",
  outOfOrder: 0,
  pending: 0,
  status: "OK",
});

test("database inventory is report-only and never authorizes cleanup", () => {
  const report = buildDatabaseInventoryReport({
    databaseRows: [
      {
        name: "plush_erp",
        owner: "simon",
        size_bytes: "1000",
        connections: "1",
        allow_connections: true,
      },
      {
        name: "plush_erp_capacity_20260728_a1b2",
        owner: "simon",
        size_bytes: "2000",
        connections: "0",
        allow_connections: true,
      },
      {
        name: "plush_erp_restore_20260728_a1b2",
        owner: "simon",
        size_bytes: "3000",
        connections: "0",
        allow_connections: true,
      },
    ],
    generatedAt: new Date("2026-07-28T00:00:00Z"),
    migrationByName: {
      plush_erp: atlasCurrent,
      plush_erp_capacity_20260728_a1b2: atlasCurrent,
      plush_erp_restore_20260728_a1b2: atlasCurrent,
    },
    referencesByName: {
      plush_erp_restore_20260728_a1b2: ["scripts/qa/example.test.mjs"],
    },
    server: { safeTarget: "host=127.0.0.1 port=55432" },
  });
  assert.equal(report.schemaVersion, DATABASE_INVENTORY_SCHEMA);
  assert.equal(report.mode, "report-only");
  assert.equal(report.status, "complete");
  assert.equal(
    report.databases.find((database) => database.name === "plush_erp")
      .recommendation,
    "keep_long_term_development",
  );
  assert.equal(
    report.databases.find((database) => database.name.includes("capacity"))
      .recommendation,
    "review_disposable_cleanup",
  );
  assert.equal(
    report.databases.find((database) => database.name.includes("restore"))
      .recommendation,
    "review_repository_references",
  );
  assert(
    report.databases.every(
      (database) =>
        database.deletion.authorized === false &&
        database.deletion.eligible === false,
    ),
  );
});

test("database inventory reports incomplete Atlas identity without hiding rows", () => {
  const report = buildDatabaseInventoryReport({
    databaseRows: [
      {
        name: "plush_erp_ci_20260728_a1b2",
        owner: "simon",
        size_bytes: "1000",
        connections: "0",
        allow_connections: true,
      },
    ],
    migrationByName: {},
    referencesByName: {},
    server: { safeTarget: "host=127.0.0.1 port=55432" },
  });
  assert.equal(report.status, "incomplete");
  assert.deepEqual(report.databases[0].blockers, [
    "migration_identity_unavailable",
  ]);
});

test("database inventory runtime never returns or logs the credential-bearing URL", () => {
  const databaseURL =
    "postgres://admin:inventory-secret@127.0.0.1:55432/postgres?sslmode=disable";
  const report = runDatabaseInventory({
    databaseURL,
    repoRoot: path.resolve(import.meta.dirname, "../.."),
    runtime: {
      readDatabaseRows: () => [
        {
          name: "plush_erp_ci_20260728_a1b2",
          owner: "admin",
          size_bytes: "1024",
          connections: "0",
          allow_connections: true,
        },
      ],
      readMigration: () => atlasCurrent,
      findEvidenceReferences: () => [],
    },
  });
  assert.doesNotMatch(JSON.stringify(report), /inventory-secret|postgres:\/\//u);
});

test("database inventory source has no destructive SQL or arbitrary command input", () => {
  const source = readFileSync(
    path.join(import.meta.dirname, "database-inventory.mjs"),
    "utf8",
  );
  assert.doesNotMatch(source, /\bDROP\s+DATABASE\b/iu);
  assert.doesNotMatch(source, /--command|--sql|--database-name/u);
});
