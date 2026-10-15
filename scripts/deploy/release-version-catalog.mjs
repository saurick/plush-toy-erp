#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const RELEASE_VERSION_CATALOG_SCHEMA =
  "plush.release-version-catalog/v1";
export const RELEASE_VERSION_TIME_ZONE = "Asia/Shanghai";

const OFFICIAL_VERSION_PATTERN =
  /^(?<year>[0-9]{4})[.](?<month>[0-9]{2})[.](?<day>[0-9]{2})-(?<ordinal>[1-9][0-9]{0,3})$/u;

function normalizedReference(value) {
  const reference = String(value || "");
  if (
    !/(?:Z|[+-][0-9]{2}:[0-9]{2})$/u.test(reference) ||
    Number.isNaN(Date.parse(reference))
  ) {
    throw new Error("release version reference timestamp is invalid");
  }
  return new Date(reference);
}

function shanghaiDate(value) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RELEASE_VERSION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(normalizedReference(value));
  const field = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${field("year")}.${field("month")}.${field("day")}`;
}

function officialVersion(value) {
  const version = String(value || "");
  const match = OFFICIAL_VERSION_PATTERN.exec(version);
  if (!match) return null;
  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const ordinal = Number(match.groups.ordinal);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 2000 ||
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day ||
    !Number.isSafeInteger(ordinal)
  ) {
    throw new Error(`official release version is invalid: ${version}`);
  }
  return Object.freeze({
    version,
    date: `${match.groups.year}.${match.groups.month}.${match.groups.day}`,
    ordinal,
  });
}

function versionValue(entry) {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return "";
  return String(entry.version ?? entry.name ?? "");
}

export function buildReleaseVersionCatalog({ versions, reference }) {
  if (!Array.isArray(versions) || versions.length > 1000) {
    throw new Error("release version catalog input is invalid");
  }
  const date = shanghaiDate(reference);
  const seen = new Set();
  const official = [];
  for (const entry of versions) {
    const parsed = officialVersion(versionValue(entry));
    if (!parsed) continue;
    if (seen.has(parsed.version)) {
      throw new Error("official release version catalog contains a duplicate");
    }
    seen.add(parsed.version);
    official.push(parsed);
  }
  const today = official.filter((entry) => entry.date === date);
  const nextOrdinal =
    today.reduce((maximum, entry) => Math.max(maximum, entry.ordinal), 0) + 1;
  if (nextOrdinal > 9999) {
    throw new Error("official release version sequence is exhausted");
  }
  return Object.freeze({
    schemaVersion: RELEASE_VERSION_CATALOG_SCHEMA,
    timeZone: RELEASE_VERSION_TIME_ZONE,
    date,
    nextVersion: `${date}-${String(nextOrdinal)}`,
    officialVersionCount: official.length,
    dateVersionCount: today.length,
  });
}

export function assertOfficialReleaseVersion({ versions, reference, requested }) {
  const catalog = buildReleaseVersionCatalog({ versions, reference });
  if (requested !== catalog.nextVersion) {
    throw new Error("requested release version is not the catalog-derived next version");
  }
  return catalog;
}

export function assertReleaseVersionReference(reference, observedAt) {
  const requested = normalizedReference(reference).getTime();
  const observed = normalizedReference(observedAt).getTime();
  if (Math.abs(observed - requested) > 10 * 60 * 1000) {
    throw new Error("release version reference is outside the dispatch window");
  }
  return true;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    command,
    catalog: "",
    reference: "",
    observedAt: "",
    requested: "",
    json: false,
  };
  const mapping = {
    "--catalog": "catalog",
    "--reference": "reference",
    "--observed-at": "observedAt",
    "--requested": "requested",
  };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    const key = mapping[arg];
    const value = rest[index + 1];
    if (!key || !value || value.startsWith("--")) {
      throw new Error(`invalid argument: ${arg}`);
    }
    options[key] = value;
    index += 1;
  }
  if (
    command !== "verify" ||
    !options.catalog ||
    !options.reference ||
    !options.observedAt ||
    !options.requested
  ) {
    throw new Error(
      "verify requires --catalog, --reference, --observed-at and --requested",
    );
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  let versions;
  try {
    versions = JSON.parse(readFileSync(path.resolve(options.catalog), "utf8"));
  } catch {
    throw new Error("release version catalog is not valid JSON");
  }
  const result = assertOfficialReleaseVersion({
    versions,
    reference: options.reference,
    requested: options.requested,
  });
  assertReleaseVersionReference(options.reference, options.observedAt);
  process.stdout.write(
    options.json
      ? `${JSON.stringify({ status: "passed", ...result }, null, 2)}\n`
      : `[release-version] status=passed version=${result.nextVersion}\n`,
  );
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[release-version] status=blocked reason=${error.message}\n`);
    process.exitCode = 2;
  }
}
