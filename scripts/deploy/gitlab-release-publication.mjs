#!/usr/bin/env node

import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { RELEASE_ASSET_NAMES } from "./github-release-asset-set.mjs";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const VERSION_PATTERN = /^artifact-[0-9a-f]{40}$/u;
const PACKAGE_NAME = "plush-release";

function atomicText(file, value) {
  const target = path.resolve(file);
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, value, { mode: 0o600, flag: "wx" });
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function jsonFile(file, label) {
  try {
    return JSON.parse(readFileSync(path.resolve(file), "utf8"));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function localAssetMap(value) {
  if (
    value?.status !== "passed" ||
    !Array.isArray(value.assets) ||
    value.assets.length !== RELEASE_ASSET_NAMES.length
  ) {
    throw new Error("local release asset catalog is invalid");
  }
  const assets = new Map();
  for (const asset of value.assets) {
    const name = String(asset?.name || "");
    const digest = String(asset?.digest || "");
    if (
      !RELEASE_ASSET_NAMES.includes(name) ||
      assets.has(name) ||
      !Number.isSafeInteger(asset?.size) ||
      asset.size < 1 ||
      !digest.startsWith("sha256:") ||
      !SHA256_PATTERN.test(digest.slice(7))
    ) {
      throw new Error("local release asset descriptor is invalid");
    }
    assets.set(name, {
      name,
      size: asset.size,
      sha256: digest.slice(7),
    });
  }
  if (RELEASE_ASSET_NAMES.some((name) => !assets.has(name))) {
    throw new Error("local release asset catalog is incomplete");
  }
  return assets;
}

export function selectGitlabReleasePackage(packages, packageVersion) {
  if (
    !Array.isArray(packages) ||
    packages.length > 100 ||
    !VERSION_PATTERN.test(String(packageVersion || ""))
  ) {
    throw new Error("GitLab release package catalog is invalid");
  }
  const matching = packages.filter(
    (item) =>
      item?.package_type === "generic" &&
      item?.name === PACKAGE_NAME &&
      item?.version === packageVersion,
  );
  if (matching.length > 1) {
    throw new Error("GitLab release package identity is not unique");
  }
  if (matching.length === 0) return null;
  if (!Number.isSafeInteger(matching[0]?.id) || matching[0].id < 1) {
    throw new Error("GitLab release package identity is invalid");
  }
  return Object.freeze({ id: matching[0].id });
}

export function planGitlabReleasePublication({ local, remote }) {
  const assets = localAssetMap(local);
  if (!Array.isArray(remote) || remote.length > 100) {
    throw new Error("GitLab release package file catalog is invalid");
  }
  const existing = new Set();
  for (const file of remote) {
    const name = String(file?.file_name || "");
    const expected = assets.get(name);
    const sha256 = String(file?.file_sha256 || "");
    if (
      !expected ||
      existing.has(name) ||
      !Number.isSafeInteger(file?.size) ||
      file.size < 1 ||
      !SHA256_PATTERN.test(sha256)
    ) {
      throw new Error("GitLab release package contains an invalid file");
    }
    if (file.size !== expected.size || sha256 !== expected.sha256) {
      throw new Error(`GitLab release package asset mismatch: ${name}`);
    }
    existing.add(name);
  }
  const missingAssets = RELEASE_ASSET_NAMES.filter(
    (name) => !existing.has(name),
  );
  return Object.freeze({
    state:
      missingAssets.length === 0
        ? "complete"
        : existing.size === 0
          ? "missing"
          : "partial",
    existingCount: existing.size,
    missingAssets: Object.freeze(missingAssets),
  });
}

export function verifyGitlabReleasePublication(value) {
  const result = planGitlabReleasePublication(value);
  if (result.state !== "complete") {
    throw new Error("GitLab release package is incomplete after publication");
  }
  return result;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    command,
    catalog: "",
    version: "",
    local: "",
    remote: "",
    packageIdOut: "",
    missingOut: "",
    json: false,
  };
  const mapping = {
    "--catalog": "catalog",
    "--version": "version",
    "--local": "local",
    "--remote": "remote",
    "--package-id-out": "packageIdOut",
    "--missing-out": "missingOut",
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
  if (command === "select") {
    if (!options.catalog || !options.version || !options.packageIdOut) {
      throw new Error("select requires --catalog, --version and --package-id-out");
    }
  } else if (command === "plan" || command === "verify") {
    if (!options.local || !options.remote) {
      throw new Error(`${command} requires --local and --remote`);
    }
    if (command === "plan" && !options.missingOut) {
      throw new Error("plan requires --missing-out");
    }
  } else {
    throw new Error("expected select, plan or verify");
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  let result;
  if (options.command === "select") {
    const selected = selectGitlabReleasePackage(
      jsonFile(options.catalog, "GitLab release package catalog"),
      options.version,
    );
    atomicText(options.packageIdOut, selected ? `${selected.id}\n` : "");
    result = { state: selected ? "existing" : "missing" };
  } else {
    const input = {
      local: jsonFile(options.local, "local release asset catalog"),
      remote: jsonFile(options.remote, "GitLab release package file catalog"),
    };
    result =
      options.command === "verify"
        ? verifyGitlabReleasePublication(input)
        : planGitlabReleasePublication(input);
    if (options.command === "plan") {
      atomicText(
        options.missingOut,
        result.missingAssets.length > 0
          ? `${result.missingAssets.join("\n")}\n`
          : "",
      );
    }
  }
  process.stdout.write(
    options.json
      ? `${JSON.stringify({ status: "passed", ...result }, null, 2)}\n`
      : `[gitlab-release-publication] state=${result.state}\n`,
  );
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `[gitlab-release-publication] status=blocked reason=${error.message}\n`,
    );
    process.exitCode = 2;
  }
}
