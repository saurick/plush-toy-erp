#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { parsePostgresURL, writePostgresFields } from "../lib/postgres-url.mjs";

function parseTarget(raw) {
  const url = parsePostgresURL(raw, [
    "sslmode",
    "application_name",
    "connect_timeout",
  ]);
  for (const [key, value] of url.searchParams) {
    if (
      key === "sslmode" &&
      !["disable", "prefer", "require"].includes(value)
    ) {
      throw new Error("PostgreSQL target sslmode is invalid");
    }
    if (key === "connect_timeout" && !/^[1-9][0-9]{0,2}$/u.test(value)) {
      throw new Error("PostgreSQL target connect_timeout is invalid");
    }
    if (key === "application_name" && !/^[A-Za-z0-9_.-]{1,64}$/u.test(value)) {
      throw new Error("PostgreSQL target application_name is invalid");
    }
  }
  return url;
}

function baseTarget(profile, raw, command) {
  const url = parseTarget(raw);
  const host = url.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  const database = url.pathname.replace(/^\/+/, "");
  if (
    !["purchase-receipt", "purchase-return", "inventory", "bom-lot"].includes(
      profile,
    )
  ) {
    throw new Error("unsupported PostgreSQL target profile");
  }
  if (
    ![
      "localhost",
      "127.0.0.1",
      "::1",
      "postgres",
      "host.docker.internal",
      `${profile}-postgres`,
      `plush-toy-erp-${profile}-postgres`,
    ].includes(host)
  ) {
    throw new Error("refuse non-local PostgreSQL target host");
  }
  const ownsLifecycle =
    profile === "purchase-receipt" &&
    ["test-critical-disposable", "test-populated-upgrade"].includes(command);
  if (
    !/^plush_erp_ci_[a-z0-9_]+$/u.test(database) &&
    !(ownsLifecycle && database === "postgres")
  ) {
    throw new Error(
      "database name must match the disposable PostgreSQL contract",
    );
  }
  const safeURL = new URL(url);
  safeURL.password = "";
  safeURL.port ||= "5432";
  const adminURL = new URL(url);
  adminURL.pathname = "/postgres";
  return [host, database, safeURL.href, adminURL.href, "ok"];
}

function disposableTarget(raw, baseName, suffix) {
  const url = parseTarget(raw);
  const database = baseName.slice(0, 63 - suffix.length) + suffix;
  if (database.length > 63 || !/^[A-Za-z0-9_]+$/u.test(database)) {
    throw new Error("unsafe disposable PostgreSQL database name");
  }
  url.pathname = `/${database}`;
  return [database, url.href, "ok"];
}

try {
  const [mode, ...args] = process.argv.slice(2);
  const expectedArguments = { base: 2, critical: 1, populated: 3 }[mode];
  if (typeof expectedArguments !== "number" || args.length !== expectedArguments) {
    throw new Error("invalid PostgreSQL target contract invocation");
  }
  const raw = readFileSync(0, "utf8").replace(/\r?\n$/u, "");
  let fields;
  if (mode === "base") {
    fields = baseTarget(args[0], raw, args[1]);
  } else if (mode === "critical") {
    const [processID] = args;
    fields = disposableTarget(
      raw,
      new URL(raw).pathname.replace(/^\/+/, ""),
      `_critical_${processID}_${randomBytes(4).toString("hex")}`,
    );
  } else if (mode === "populated") {
    const [baseName, processID, randomValue] = args;
    fields = disposableTarget(
      raw,
      baseName === "postgres" ? "plush_erp_ci" : baseName,
      `_populated_${processID}_${randomValue}`,
    );
  } else {
    throw new Error("invalid PostgreSQL target contract invocation");
  }
  writePostgresFields(fields);
} catch {
  console.error("ERROR: PostgreSQL target contract validation failed");
  process.exitCode = 1;
}
