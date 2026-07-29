#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parseLoopbackDatabaseURL } from "./database-target.mjs";

export const DATABASE_BASE_URL_ENV = "DISPOSABLE_DATABASE_BASE_URL";

const CREATE_CAPABILITY_QUERY =
  "SELECT CASE WHEN rolcreatedb OR rolsuper THEN 'allowed' ELSE 'denied' END FROM pg_roles WHERE rolname = current_user";

function decodeURLComponent(value, label) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error(`database URL ${label} encoding is invalid`);
  }
}

export function buildDatabaseProbeEnvironment(
  databaseURL,
  baseEnvironment = process.env,
) {
  const target = parseLoopbackDatabaseURL(databaseURL);
  const url = new URL(databaseURL);
  const environment = { ...baseEnvironment };
  for (const key of [
    DATABASE_BASE_URL_ENV,
    "PGHOSTADDR",
    "PGOPTIONS",
    "PGPASSFILE",
    "PGREQUIRESSL",
    "PGSERVICE",
    "PGSERVICEFILE",
    "PGTARGETSESSIONATTRS",
  ]) {
    delete environment[key];
  }
  Object.assign(environment, {
    PGAPPNAME: "plush_qa_database_base_preflight",
    PGCONNECT_TIMEOUT: "3",
    PGDATABASE: target.databaseName,
    PGHOST: target.host,
    PGPASSWORD: decodeURLComponent(url.password, "password"),
    PGPORT: String(target.port),
    PGSSLMODE: url.searchParams.get("sslmode") || "prefer",
    PGUSER: decodeURLComponent(url.username, "username"),
  });
  return { environment, target };
}

export function probeDatabaseBase({
  baseEnvironment = process.env,
  databaseURL = baseEnvironment[DATABASE_BASE_URL_ENV] || "",
  run = spawnSync,
} = {}) {
  if (!databaseURL) {
    return Object.freeze({
      status: "incomplete",
      reason: "missing_database_base",
      safeTarget: "",
    });
  }

  let prepared;
  try {
    prepared = buildDatabaseProbeEnvironment(databaseURL, baseEnvironment);
  } catch {
    return Object.freeze({
      status: "incomplete",
      reason: "invalid_database_base",
      safeTarget: "",
    });
  }

  const result = run(
    "psql",
    ["-X", "-v", "ON_ERROR_STOP=1", "-Atqc", CREATE_CAPABILITY_QUERY],
    {
      encoding: "utf8",
      env: prepared.environment,
      maxBuffer: 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    },
  );
  if (result.error?.code === "ENOENT") {
    return Object.freeze({
      status: "incomplete",
      reason: "missing_database_client",
      safeTarget: prepared.target.safeTarget,
    });
  }
  if (result.error || result.status !== 0) {
    return Object.freeze({
      status: "incomplete",
      reason: "database_base_unavailable",
      safeTarget: prepared.target.safeTarget,
    });
  }
  if (String(result.stdout || "").trim() !== "allowed") {
    return Object.freeze({
      status: "incomplete",
      reason: "database_create_forbidden",
      safeTarget: prepared.target.safeTarget,
    });
  }
  return Object.freeze({
    status: "complete",
    reason: "",
    safeTarget: prepared.target.safeTarget,
  });
}

function main() {
  const report = probeDatabaseBase();
  const target = report.safeTarget ? ` target="${report.safeTarget}"` : "";
  if (report.status !== "complete") {
    process.stderr.write(
      `[qa:database-base-preflight] status=incomplete reason=${report.reason} variable=${DATABASE_BASE_URL_ENV}${target}\n`,
    );
    process.exitCode = 2;
    return;
  }
  process.stdout.write(
    `[qa:database-base-preflight] status=complete${target}\n`,
  );
}

const isDirectRun =
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
