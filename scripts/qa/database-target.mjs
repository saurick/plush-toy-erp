#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const DATABASE_LIFECYCLE_PROFILES = Object.freeze({
  acceptance: Object.freeze({
    prefix: "plush_erp_acceptance_",
    suffix: "_dev",
  }),
  "browser-actions": Object.freeze({
    prefix: "plush_erp_acceptance_",
    suffix: "_browser_actions_dev",
  }),
  capacity: Object.freeze({
    prefix: "plush_erp_capacity_",
    suffix: "",
  }),
  ci: Object.freeze({
    prefix: "plush_erp_ci_",
    suffix: "",
  }),
  "release-rehearsal": Object.freeze({
    prefix: "plush_erp_release_",
    suffix: "",
  }),
  restore: Object.freeze({
    prefix: "plush_erp_restore_",
    suffix: "",
  }),
});

export const LONG_LIVED_DATABASE_NAMES = Object.freeze([
  "plush_erp",
  "plush_erp_simon_dev",
]);

const IDENTITY_QUERY_KEYS = new Set([
  "database",
  "dbname",
  "host",
  "hostaddr",
  "password",
  "port",
  "service",
  "servicefile",
  "user",
]);
const ALLOWED_QUERY_KEYS = new Set([
  "application_name",
  "connect_timeout",
  "sslmode",
]);
const ALLOWED_SSL_MODES = new Set(["disable", "prefer", "require"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeDatabaseRunID(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/-/gu, "_");
  if (
    !/^[a-z0-9][a-z0-9_]{2,39}$/u.test(normalized) ||
    normalized.endsWith("_") ||
    normalized.includes("__")
  ) {
    throw new Error(
      "database run id must be 3-40 lowercase letters, digits or single separators",
    );
  }
  return normalized;
}

export function createDatabaseRunID(date = new Date()) {
  const timestamp = date
    .toISOString()
    .replace(/\.\d{3}Z$/u, "z")
    .replace(/[-:T]/gu, "")
    .toLowerCase();
  return normalizeDatabaseRunID(`${timestamp}_${randomBytes(4).toString("hex")}`);
}

function assertKnownProfile(profile) {
  const contract = DATABASE_LIFECYCLE_PROFILES[profile];
  if (!contract) {
    throw new Error(`unknown database lifecycle profile: ${String(profile || "")}`);
  }
  return contract;
}

export function databaseNameForRun(profile, runID) {
  const contract = assertKnownProfile(profile);
  const normalizedRunID = normalizeDatabaseRunID(runID);
  const databaseName = `${contract.prefix}${normalizedRunID}${contract.suffix}`;
  if (
    databaseName.length > 63 ||
    !/^[a-z][a-z0-9_]+$/u.test(databaseName)
  ) {
    throw new Error("generated database name is not a safe PostgreSQL identifier");
  }
  return databaseName;
}

export function classifyDatabaseName(databaseName) {
  const normalizedName = String(databaseName || "").trim();
  if (LONG_LIVED_DATABASE_NAMES.includes(normalizedName)) {
    return Object.freeze({
      databaseName: normalizedName,
      disposable: false,
      profile: normalizedName === "plush_erp" ? "development" : "legacy-development",
      runID: "",
    });
  }
  const lifecycleEntries = Object.entries(DATABASE_LIFECYCLE_PROFILES).sort(
    ([, left], [, right]) =>
      right.suffix.length - left.suffix.length ||
      right.prefix.length - left.prefix.length,
  );
  for (const [profile, contract] of lifecycleEntries) {
    if (
      !normalizedName.startsWith(contract.prefix) ||
      !normalizedName.endsWith(contract.suffix)
    ) {
      continue;
    }
    const runID = normalizedName.slice(
      contract.prefix.length,
      contract.suffix ? -contract.suffix.length : undefined,
    );
    try {
      if (databaseNameForRun(profile, runID) !== normalizedName) continue;
    } catch {
      continue;
    }
    return Object.freeze({
      databaseName: normalizedName,
      disposable: true,
      profile,
      runID,
    });
  }
  return Object.freeze({
    databaseName: normalizedName,
    disposable: false,
    profile: "unclassified",
    runID: "",
  });
}

export function isLoopbackDatabaseHost(hostname) {
  const host = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/gu, "");
  if (host === "localhost" || host === "::1") return true;
  const match = host.match(/^(\d{1,3})(?:\.(\d{1,3})){3}$/u);
  if (!match) return false;
  const octets = host.split(".").map(Number);
  return (
    octets[0] === 127 &&
    octets.every((octet) => Number.isInteger(octet) && octet <= 255)
  );
}

function parsePort(url) {
  const port = url.port ? Number(url.port) : 5432;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("database URL port is invalid");
  }
  return port;
}

export function parseDatabaseURL(
  value,
  { allowRegisteredDevelopment = false } = {},
) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw new Error("database URL is invalid");
  }
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) {
    throw new Error("database URL must use postgres or postgresql");
  }
  if (url.hash) throw new Error("database URL fragments are not allowed");
  const rawPath = url.pathname.replace(/^\/+/u, "");
  let databaseName;
  try {
    databaseName = decodeURIComponent(rawPath);
  } catch {
    throw new Error("database URL path encoding is invalid");
  }
  if (
    !databaseName ||
    rawPath.includes("/") ||
    databaseName.includes("/") ||
    !/^[a-z][a-z0-9_]{0,62}$/u.test(databaseName)
  ) {
    throw new Error("database URL must contain one safe lowercase database name");
  }
  const seenQueryKeys = new Set();
  for (const [rawKey, queryValue] of url.searchParams.entries()) {
    const key = rawKey.toLowerCase();
    if (seenQueryKeys.has(key)) {
      throw new Error(`database URL query key is duplicated: ${key}`);
    }
    seenQueryKeys.add(key);
    if (IDENTITY_QUERY_KEYS.has(key)) {
      throw new Error(`database URL query cannot override identity: ${key}`);
    }
    if (!ALLOWED_QUERY_KEYS.has(key)) {
      throw new Error(`database URL query key is not allowed: ${key}`);
    }
    if (key === "sslmode" && !ALLOWED_SSL_MODES.has(queryValue)) {
      throw new Error("database URL sslmode is not allowed");
    }
    if (key === "connect_timeout" && !/^[1-9]\d{0,2}$/u.test(queryValue)) {
      throw new Error("database URL connect_timeout is invalid");
    }
    if (
      key === "application_name" &&
      !/^[a-zA-Z0-9_.-]{1,64}$/u.test(queryValue)
    ) {
      throw new Error("database URL application_name is invalid");
    }
  }
  const port = parsePort(url);
  const normalizedHost = url.hostname.replace(/^\[|\]$/gu, "");
  const registeredDevelopment =
    allowRegisteredDevelopment &&
    normalizedHost === "192.168.0.106" &&
    port === 5432;
  if (
    !isLoopbackDatabaseHost(normalizedHost) &&
    !registeredDevelopment
  ) {
    throw new Error(
      allowRegisteredDevelopment
        ? "database URL must use loopback or the registered development PostgreSQL"
        : "database URL must use a loopback host",
    );
  }
  const hostForDisplay = normalizedHost.includes(":")
    ? `[${normalizedHost}]`
    : normalizedHost;
  return Object.freeze({
    databaseName,
    host: normalizedHost,
    port,
    safeTarget: `host=${hostForDisplay} port=${port} database=${databaseName}`,
    targetFingerprint: sha256(
      `${url.protocol}//${normalizedHost}:${port}/${databaseName}`,
    ),
  });
}

export function parseLoopbackDatabaseURL(value) {
  return parseDatabaseURL(value);
}

export function assertDisposableDatabaseTarget({
  databaseName = "",
  databaseURL,
  profile,
  runID = "",
}) {
  assertKnownProfile(profile);
  const parsed = parseLoopbackDatabaseURL(databaseURL);
  const declaredName = String(databaseName || parsed.databaseName).trim();
  if (parsed.databaseName !== declaredName) {
    throw new Error("database URL does not match the declared database name");
  }
  const classification = classifyDatabaseName(declaredName);
  if (!classification.disposable || classification.profile !== profile) {
    throw new Error(
      `database must match the disposable ${profile} lifecycle contract`,
    );
  }
  if (
    runID &&
    normalizeDatabaseRunID(runID) !== classification.runID
  ) {
    throw new Error("database name does not match the declared run id");
  }
  return Object.freeze({
    ...parsed,
    databaseRunIdentity: `${profile}:${classification.runID}`,
    disposable: true,
    profile,
    runID: classification.runID,
  });
}

export function replaceDatabaseName(
  databaseURL,
  databaseName,
  { allowRegisteredDevelopment = false } = {},
) {
  const parsed = parseDatabaseURL(databaseURL, {
    allowRegisteredDevelopment,
  });
  const nextName = String(databaseName || "").trim();
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(nextName)) {
    throw new Error("replacement database name is invalid");
  }
  const url = new URL(String(databaseURL));
  url.pathname = `/${nextName}`;
  const next = url.toString();
  const nextTarget = parseDatabaseURL(next, {
    allowRegisteredDevelopment,
  });
  if (
    nextTarget.host !== parsed.host ||
    nextTarget.port !== parsed.port
  ) {
    throw new Error("database URL identity changed while replacing the name");
  }
  return next;
}

export function buildDisposableDatabaseTarget({
  baseDatabaseURL,
  profile,
  runID,
}) {
  parseLoopbackDatabaseURL(baseDatabaseURL);
  const databaseName = databaseNameForRun(profile, runID);
  const databaseURL = replaceDatabaseName(baseDatabaseURL, databaseName);
  return Object.freeze({
    databaseName,
    databaseURL,
    identity: assertDisposableDatabaseTarget({
      databaseName,
      databaseURL,
      profile,
      runID,
    }),
  });
}

function parseCLI(argv) {
  if (argv.length < 1) throw new Error("missing database-target command");
  const [command, ...rest] = argv;
  const options = new Map(
    rest.map((value, index, values) => [value, values[index + 1]]),
  );
  if (command === "name") {
    const profile = options.get("--profile");
    const runID = options.get("--run-id");
    process.stdout.write(`${databaseNameForRun(profile, runID)}\n`);
    return;
  }
  if (command === "validate-env") {
    const envName = options.get("--database-url-env");
    const profile = options.get("--profile");
    const databaseName = options.get("--database-name") || "";
    if (!/^[A-Z][A-Z0-9_]{2,63}$/u.test(envName || "")) {
      throw new Error("--database-url-env must be an uppercase environment key");
    }
    const databaseURL = process.env[envName];
    const target = assertDisposableDatabaseTarget({
      databaseName,
      databaseURL,
      profile,
      runID: options.get("--run-id") || "",
    });
    process.stdout.write(
      `${JSON.stringify({
        databaseRunIdentity: target.databaseRunIdentity,
        profile: target.profile,
        runID: target.runID,
        safeTarget: target.safeTarget,
        targetFingerprint: target.targetFingerprint,
      })}\n`,
    );
    return;
  }
  throw new Error(`unknown database-target command: ${command}`);
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    parseCLI(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`[database-target] ${error.message}\n`);
    process.exitCode = 1;
  }
}
