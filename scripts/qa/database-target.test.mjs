import assert from "node:assert/strict";
import test from "node:test";

import {
  DATABASE_LIFECYCLE_PROFILES,
  assertDisposableDatabaseTarget,
  buildDisposableDatabaseTarget,
  classifyDatabaseName,
  databaseNameForRun,
  isLoopbackDatabaseHost,
  normalizeDatabaseRunID,
  parseDatabaseURL,
  parseLoopbackDatabaseURL,
} from "./database-target.mjs";

const BASE_URL =
  "postgres://tester:local-secret@127.0.0.1:55432/postgres?sslmode=disable";

test("database target generates one exact name for every lifecycle profile", () => {
  const expected = {
    acceptance: "plush_erp_acceptance_20260728_a1b2_dev",
    "browser-actions":
      "plush_erp_acceptance_20260728_a1b2_browser_actions_dev",
    capacity: "plush_erp_capacity_20260728_a1b2",
    ci: "plush_erp_ci_20260728_a1b2",
    "release-rehearsal": "plush_erp_release_20260728_a1b2",
    restore: "plush_erp_restore_20260728_a1b2",
  };
  assert.deepEqual(Object.keys(DATABASE_LIFECYCLE_PROFILES), Object.keys(expected));
  for (const [profile, databaseName] of Object.entries(expected)) {
    assert.equal(databaseNameForRun(profile, "20260728-a1b2"), databaseName);
    assert.deepEqual(classifyDatabaseName(databaseName), {
      databaseName,
      disposable: true,
      profile,
      runID: "20260728_a1b2",
    });
  }
});

test("database target keeps long-lived and unclassified databases non-disposable", () => {
  assert.equal(classifyDatabaseName("plush_erp").disposable, false);
  assert.equal(classifyDatabaseName("plush_erp_simon_dev").disposable, false);
  assert.equal(classifyDatabaseName("plush_erp_capacity_legacy__bad").disposable, false);
  assert.throws(() => normalizeDatabaseRunID("../../escape"));
  assert.throws(() => databaseNameForRun("capacity", "x"));
});

test("database target accepts only loopback PostgreSQL URLs without identity overrides", () => {
  for (const host of ["localhost", "127.0.0.1", "127.42.7.9", "::1"]) {
    assert.equal(isLoopbackDatabaseHost(host), true, host);
  }
  for (const host of ["0.0.0.0", "192.168.0.133", "postgres", "::"]) {
    assert.equal(isLoopbackDatabaseHost(host), false, host);
  }
  const parsed = parseLoopbackDatabaseURL(
    "postgresql://u:p@[::1]:55432/plush_erp_ci_run_123?sslmode=require&connect_timeout=5",
  );
  assert.equal(parsed.databaseName, "plush_erp_ci_run_123");
  assert.doesNotMatch(JSON.stringify(parsed), /u:p|secret|password/u);

  for (const databaseURL of [
    "postgres://u:p@192.168.0.133:5432/plush_erp_ci_run_123",
    "mysql://u:p@127.0.0.1:5432/plush_erp_ci_run_123",
    "postgres://u:p@127.0.0.1:5432/plush_erp_ci_run_123?host=192.168.0.133",
    "postgres://u:p@127.0.0.1:5432/plush_erp_ci_run_123?dbname=plush_erp",
    "postgres://u:p@127.0.0.1:5432/plush_erp_ci_run_123?options=-csearch_path%3Dprivate",
    "postgres://u:p@127.0.0.1:5432/plush_erp_ci_run_123/extra",
    "postgres://u:p@127.0.0.1:5432/PLUSH_ERP_CI_RUN_123",
  ]) {
    assert.throws(() => parseLoopbackDatabaseURL(databaseURL), databaseURL);
  }
});

test("database target binds URL, profile, declared name and run identity", () => {
  const target = buildDisposableDatabaseTarget({
    baseDatabaseURL: BASE_URL,
    profile: "capacity",
    runID: "20260728-a1b2",
  });
  assert.equal(target.databaseName, "plush_erp_capacity_20260728_a1b2");
  assert.match(target.databaseURL, /local-secret/u);
  assert.doesNotMatch(JSON.stringify(target.identity), /local-secret/u);
  assert.equal(
    target.identity.databaseRunIdentity,
    "capacity:20260728_a1b2",
  );
  assert.throws(() =>
    assertDisposableDatabaseTarget({
      databaseName: "plush_erp",
      databaseURL: BASE_URL.replace("/postgres", "/plush_erp"),
      profile: "capacity",
    }),
  );
  assert.throws(() =>
    assertDisposableDatabaseTarget({
      databaseName: target.databaseName,
      databaseURL: target.databaseURL,
      profile: "restore",
    }),
  );
});

test("report-only inventory may read only the registered development cluster", () => {
  const target = parseDatabaseURL(
    "postgres://u:p@192.168.0.106:5432/plush_erp?sslmode=disable",
    { allowRegisteredDevelopment: true },
  );
  assert.equal(target.host, "192.168.0.106");
  assert.throws(() =>
    parseDatabaseURL(
      "postgres://u:p@192.168.0.133:5435/plush_erp?sslmode=disable",
      { allowRegisteredDevelopment: true },
    ),
  );
  assert.throws(() =>
    parseLoopbackDatabaseURL(
      "postgres://u:p@192.168.0.106:5432/plush_erp?sslmode=disable",
    ),
  );
  const disposableURL =
    "postgres://u:p@192.168.0.106:5432/plush_erp_ci_registered_fixture?sslmode=disable";
  assert.throws(() =>
    assertDisposableDatabaseTarget({
      databaseURL: disposableURL,
      profile: "ci",
    }),
  );
  assert.equal(
    assertDisposableDatabaseTarget({
      allowRegisteredDevelopment: true,
      databaseURL: disposableURL,
      profile: "ci",
    }).host,
    "192.168.0.106",
  );
});
