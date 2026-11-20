#!/usr/bin/env node

import {
  existsSync,
  lstatSync,
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
import { sha256File } from "../lib/file-digest.mjs";
import { assertReleaseArtifactManifest } from "./release-artifact-bundle.mjs";
import {
  validateReleaseArtifactBinding,
  validateReleaseManifest,
  validateReleaseRehearsalReceipt,
} from "./release-catalog.mjs";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const VERSION_PATTERN = /^artifact-[0-9a-f]{40}$/u;
const PACKAGE_NAME = "plush-release";
export const SOURCE_PACKAGE_NAME = "plush-release-source";
const SOURCE_FILE = "source.tar";
const ALLOWED_PACKAGES = Object.freeze([PACKAGE_NAME, SOURCE_PACKAGE_NAME]);
const SOURCE_BACKFILL_CONTROL_FILES = Object.freeze([
  "checksums.sha256",
  "release-artifact.json",
  "release-manifest.json",
  "release-rehearsal.json",
]);

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

export function selectGitlabReleasePackage(
  packages,
  packageVersion,
  packageName = PACKAGE_NAME,
) {
  if (
    !Array.isArray(packages) ||
    packages.length > 100 ||
    !VERSION_PATTERN.test(String(packageVersion || "")) ||
    !ALLOWED_PACKAGES.includes(packageName)
  ) {
    throw new Error("GitLab release package catalog is invalid");
  }
  const matching = packages.filter(
    (item) =>
      item?.package_type === "generic" &&
      item?.name === packageName &&
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

function localSourceFile(artifactFile, sourceFile, packageVersion) {
  const artifact = assertReleaseArtifactManifest(jsonFile(artifactFile, "release artifact"));
  const source = path.resolve(sourceFile);
  let stat;
  try {
    stat = lstatSync(source);
  } catch {
    throw new Error("local release source identity is invalid");
  }
  if (
    artifact?.git?.commit !== packageVersion.slice("artifact-".length) ||
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size < 1 ||
    stat.size > 8 * 1024 ** 3 ||
    sha256File(source) !== artifact.sourceArchive.sha256
  ) {
    throw new Error("local release source identity is invalid");
  }
  return Object.freeze({ name: SOURCE_FILE, size: stat.size, sha256: artifact.sourceArchive.sha256 });
}

function exactFormalRemoteFiles(remote) {
  if (!Array.isArray(remote) || remote.length !== RELEASE_ASSET_NAMES.length) {
    throw new Error("GitLab formal release package is not exact");
  }
  const files = new Map();
  for (const file of remote) {
    const name = String(file?.file_name || "");
    const sha256 = String(file?.file_sha256 || "");
    if (
      !RELEASE_ASSET_NAMES.includes(name) ||
      files.has(name) ||
      !Number.isSafeInteger(file?.size) ||
      file.size < 1 ||
      !SHA256_PATTERN.test(sha256)
    ) {
      throw new Error("GitLab formal release package metadata is invalid");
    }
    files.set(name, { name, size: file.size, sha256 });
  }
  if (RELEASE_ASSET_NAMES.some((name) => !files.has(name))) {
    throw new Error("GitLab formal release package is incomplete");
  }
  return files;
}

function checksumCatalog(file) {
  const entries = new Map();
  for (const line of readFileSync(file, "utf8").trim().split("\n")) {
    const match = line.match(/^([0-9a-f]{64})  ([a-z0-9.-]+)$/u);
    if (!match || entries.has(match[2])) {
      throw new Error("formal release checksum catalog is invalid");
    }
    entries.set(match[2], match[1]);
  }
  const expected = RELEASE_ASSET_NAMES.filter(
    (name) => name !== "checksums.sha256",
  );
  if (
    entries.size !== expected.length ||
    expected.some((name) => !entries.has(name))
  ) {
    throw new Error("formal release checksum catalog is incomplete");
  }
  return entries;
}

export function validateGitlabReleaseSourceBackfill({
  controlsDir,
  sourceFile,
  packageVersion,
  formalRemote,
}) {
  if (!VERSION_PATTERN.test(String(packageVersion || ""))) {
    throw new Error("release source backfill version is invalid");
  }
  const gitSha = packageVersion.slice("artifact-".length);
  const remote = exactFormalRemoteFiles(formalRemote);
  const directory = path.resolve(controlsDir);
  for (const name of SOURCE_BACKFILL_CONTROL_FILES) {
    const file = path.join(directory, name);
    if (!existsSync(file)) {
      throw new Error("release source backfill control identity is invalid");
    }
    const stat = lstatSync(file);
    const expected = remote.get(name);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size !== expected.size ||
      sha256File(file) !== expected.sha256
    ) {
      throw new Error("release source backfill control identity is invalid");
    }
  }
  const manifestFile = path.join(directory, "release-manifest.json");
  const manifest = validateReleaseManifest(jsonFile(manifestFile, "release manifest"));
  const artifactFile = path.join(directory, "release-artifact.json");
  const artifact = assertReleaseArtifactManifest(
    jsonFile(artifactFile, "release artifact"),
  );
  if (
    manifest.schemaVersion !== "plush.release-manifest/v2" ||
    manifest.gitSha !== gitSha ||
    artifact.git.commit !== gitSha
  ) {
    throw new Error("release source backfill requires an exact v2 release");
  }
  validateReleaseArtifactBinding(manifest, artifact, sha256File(artifactFile));
  const rehearsalFile = path.join(directory, "release-rehearsal.json");
  validateReleaseRehearsalReceipt(jsonFile(rehearsalFile, "release rehearsal"), artifact, {
    sha: gitSha,
    version: manifest.version,
    customer: "yoyoosun",
  });
  if (sha256File(rehearsalFile) !== manifest.rehearsal?.receiptSha256) {
    throw new Error("release source backfill rehearsal identity is invalid");
  }
  const checksums = checksumCatalog(path.join(directory, "checksums.sha256"));
  for (const [name, sha256] of checksums) {
    if (remote.get(name)?.sha256 !== sha256) {
      throw new Error("release source backfill checksum identity is invalid");
    }
  }
  const source = localSourceFile(artifactFile, sourceFile, packageVersion);
  return Object.freeze({
    state: "eligible",
    gitSha,
    version: manifest.version,
    sourceSha256: source.sha256,
    sourceSize: source.size,
  });
}

export function planGitlabReleaseSourcePublication({
  artifactFile,
  sourceFile,
  packageVersion,
  remote,
}) {
  if (!VERSION_PATTERN.test(String(packageVersion || "")) || !Array.isArray(remote)) {
    throw new Error("GitLab release source catalog is invalid");
  }
  const expected = localSourceFile(artifactFile, sourceFile, packageVersion);
  if (remote.length > 1) {
    throw new Error("GitLab release source package is not exact");
  }
  if (remote.length === 1) {
    const file = remote[0];
    if (
      file?.file_name !== SOURCE_FILE ||
      file?.size !== expected.size ||
      file?.file_sha256 !== expected.sha256
    ) {
      throw new Error("GitLab release source package identity mismatch");
    }
  }
  return Object.freeze({
    state: remote.length === 1 ? "complete" : "missing",
    missingAssets: Object.freeze(remote.length === 1 ? [] : [SOURCE_FILE]),
  });
}

export function verifyGitlabReleaseSourcePublication(value) {
  const result = planGitlabReleaseSourcePublication(value);
  if (result.state !== "complete") {
    throw new Error("GitLab release source package is incomplete after publication");
  }
  return result;
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
    packageName: PACKAGE_NAME,
    artifact: "",
    source: "",
    controls: "",
    formalRemote: "",
    json: false,
  };
  const mapping = {
    "--catalog": "catalog",
    "--version": "version",
    "--local": "local",
    "--remote": "remote",
    "--package-id-out": "packageIdOut",
    "--missing-out": "missingOut",
    "--package-name": "packageName",
    "--artifact": "artifact",
    "--source": "source",
    "--controls": "controls",
    "--formal-remote": "formalRemote",
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
  } else if (command === "plan-source" || command === "verify-source") {
    if (!options.artifact || !options.source || !options.version || !options.remote) {
      throw new Error(`${command} requires --artifact, --source, --version and --remote`);
    }
    if (command === "plan-source" && !options.missingOut) {
      throw new Error("plan-source requires --missing-out");
    }
  } else if (command === "validate-source-backfill") {
    if (
      !options.controls ||
      !options.source ||
      !options.version ||
      !options.formalRemote
    ) {
      throw new Error(
        "validate-source-backfill requires --controls, --source, --version and --formal-remote",
      );
    }
  } else {
    throw new Error(
      "expected select, plan, verify, plan-source, verify-source or validate-source-backfill",
    );
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
      options.packageName,
    );
    atomicText(options.packageIdOut, selected ? `${selected.id}\n` : "");
    result = { state: selected ? "existing" : "missing" };
  } else if (options.command === "plan" || options.command === "verify") {
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
  } else if (
    options.command === "plan-source" ||
    options.command === "verify-source"
  ) {
    const input = {
      artifactFile: options.artifact,
      sourceFile: options.source,
      packageVersion: options.version,
      remote: jsonFile(options.remote, "GitLab release source package file catalog"),
    };
    result = options.command === "verify-source"
      ? verifyGitlabReleaseSourcePublication(input)
      : planGitlabReleaseSourcePublication(input);
    if (options.command === "plan-source") {
      atomicText(
        options.missingOut,
        result.missingAssets.length > 0 ? `${result.missingAssets.join("\n")}\n` : "",
      );
    }
  } else {
    result = validateGitlabReleaseSourceBackfill({
      controlsDir: options.controls,
      sourceFile: options.source,
      packageVersion: options.version,
      formalRemote: jsonFile(
        options.formalRemote,
        "GitLab formal release package file catalog",
      ),
    });
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
