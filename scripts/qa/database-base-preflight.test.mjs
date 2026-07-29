import assert from "node:assert/strict";
import test from "node:test";

import {
  DATABASE_BASE_URL_ENV,
  buildDatabaseProbeEnvironment,
  probeDatabaseBase,
} from "./database-base-preflight.mjs";

const BASE_URL =
  "postgres://tester:local-secret@127.0.0.1:55432/postgres?sslmode=disable";

test("database base preflight keeps credentials out of psql arguments", () => {
  let observed;
  const report = probeDatabaseBase({
    baseEnvironment: {
      [DATABASE_BASE_URL_ENV]: BASE_URL,
      PGSERVICE: "must-not-leak",
    },
    run(command, args, options) {
      observed = { args, command, options };
      return { status: 0, stdout: "allowed\n", stderr: "" };
    },
  });

  assert.equal(report.status, "complete");
  assert.equal(
    report.safeTarget,
    "host=127.0.0.1 port=55432 database=postgres",
  );
  assert.equal(observed.command, "psql");
  assert.doesNotMatch(observed.args.join(" "), /tester|local-secret/u);
  assert.equal(observed.options.env.PGHOST, "127.0.0.1");
  assert.equal(observed.options.env.PGPORT, "55432");
  assert.equal(observed.options.env.PGDATABASE, "postgres");
  assert.equal(observed.options.env.PGUSER, "tester");
  assert.equal(observed.options.env.PGPASSWORD, "local-secret");
  assert.equal(observed.options.env.PGSSLMODE, "disable");
  assert.equal(DATABASE_BASE_URL_ENV in observed.options.env, false);
  assert.equal("PGSERVICE" in observed.options.env, false);
});

test("database base preflight rejects missing and non-loopback targets before psql", () => {
  let calls = 0;
  const run = () => {
    calls += 1;
    return { status: 0, stdout: "allowed\n", stderr: "" };
  };
  assert.equal(probeDatabaseBase({ databaseURL: "", run }).reason, "missing_database_base");
  assert.equal(
    probeDatabaseBase({
      databaseURL:
        "postgres://tester:local-secret@192.168.0.133:5432/postgres",
      run,
    }).reason,
    "invalid_database_base",
  );
  assert.equal(calls, 0);
});

test("database base preflight distinguishes client, connectivity and privilege blockers", () => {
  const missingClient = probeDatabaseBase({
    databaseURL: BASE_URL,
    run: () => ({
      error: Object.assign(new Error("missing"), { code: "ENOENT" }),
      status: null,
    }),
  });
  assert.equal(missingClient.reason, "missing_database_client");

  const unavailable = probeDatabaseBase({
    databaseURL: BASE_URL,
    run: () => ({ status: 2, stdout: "", stderr: "secret detail" }),
  });
  assert.equal(unavailable.reason, "database_base_unavailable");

  const forbidden = probeDatabaseBase({
    databaseURL: BASE_URL,
    run: () => ({ status: 0, stdout: "denied\n", stderr: "" }),
  });
  assert.equal(forbidden.reason, "database_create_forbidden");

  for (const report of [missingClient, unavailable, forbidden]) {
    assert.doesNotMatch(JSON.stringify(report), /tester|local-secret|secret detail/u);
  }
});
