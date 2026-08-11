#!/usr/bin/env node

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { sha256File } from "../lib/file-digest.mjs";
import { assertReleaseArtifactManifest } from "./release-artifact-bundle.mjs";
import { validateReleaseManifest } from "./release-catalog.mjs";

export const RELEASE_ASSET_NAMES = Object.freeze([
  "checksums.sha256",
  "release-artifact.json",
  "release-manifest.json",
  "sbom.cdx.json",
  "server-image.tar",
  "web-image.tar",
]);
export const CHECKSUM_PAYLOAD_NAMES = Object.freeze(
  RELEASE_ASSET_NAMES.filter((name) => name !== "checksums.sha256"),
);
export const SMALL_RELEASE_ASSET_NAMES = Object.freeze(
  RELEASE_ASSET_NAMES.filter((name) => !name.endsWith("-image.tar")),
);

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const VERSION_PATTERN = /^[0-9A-Za-z](?:[0-9A-Za-z._-]{0,62}[0-9A-Za-z])?$/u;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;

function assertIdentity(sha, version) {
  if (!SHA_PATTERN.test(String(sha || ""))) throw new Error("sha is invalid");
  if (!VERSION_PATTERN.test(String(version || "")))
    throw new Error("version is invalid");
}

function plainFile(file, label) {
  if (!existsSync(file)) throw new Error(`${label} is missing`);
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error(`${label} must be a plain file`);
  return stat;
}

export function parseReleaseChecksums(source) {
  const entries = new Map();
  for (const line of String(source || "").split(/\r?\n/u)) {
    if (!line) continue;
    const match = line.match(/^([0-9a-f]{64})  ([A-Za-z0-9._-]+)$/u);
    if (!match || entries.has(match[2]))
      throw new Error("release checksum catalog is malformed");
    entries.set(match[2], match[1]);
  }
  if (
    entries.size !== CHECKSUM_PAYLOAD_NAMES.length ||
    CHECKSUM_PAYLOAD_NAMES.some((name) => !entries.has(name))
  ) {
    throw new Error(
      "release checksum catalog must cover every payload exactly once",
    );
  }
  return entries;
}

export function finalizeReleaseChecksums(directory) {
  const root = path.resolve(directory);
  const lines = CHECKSUM_PAYLOAD_NAMES.map((name) => {
    const file = path.join(root, name);
    plainFile(file, name);
    return `${sha256File(file)}  ${name}`;
  });
  const target = path.join(root, "checksums.sha256");
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, `${lines.join("\n")}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    renameSync(temporary, target);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  return target;
}

function assertManifestIdentity(directory, sha, version) {
  const artifact = assertReleaseArtifactManifest(
    JSON.parse(
      readFileSync(path.join(directory, "release-artifact.json"), "utf8"),
    ),
  );
  const release = validateReleaseManifest(
    JSON.parse(
      readFileSync(path.join(directory, "release-manifest.json"), "utf8"),
    ),
  );
  if (
    artifact.git.commit !== sha ||
    release.gitSha !== sha ||
    release.version !== version ||
    (artifact.releaseVersion !== undefined &&
      artifact.releaseVersion !== version)
  ) {
    throw new Error("release assets do not match requested identity");
  }
  return { artifact, release };
}

function assetDescriptor(file, name) {
  const stat = plainFile(file, name);
  return Object.freeze({
    name,
    size: stat.size,
    digest: `sha256:${sha256File(file)}`,
  });
}

export function inspectLocalReleaseAssets(directory, { sha, version }) {
  assertIdentity(sha, version);
  const root = path.resolve(directory);
  const entries = readdirSync(root, { withFileTypes: true });
  const names = entries.map((entry) => entry.name).sort();
  if (
    entries.some((entry) => !entry.isFile()) ||
    JSON.stringify(names) !== JSON.stringify([...RELEASE_ASSET_NAMES].sort())
  ) {
    throw new Error(
      "release directory must contain exactly the six public assets",
    );
  }
  assertManifestIdentity(root, sha, version);
  const checksums = parseReleaseChecksums(
    readFileSync(path.join(root, "checksums.sha256"), "utf8"),
  );
  for (const [name, expected] of checksums) {
    if (sha256File(path.join(root, name)) !== expected) {
      throw new Error(`release checksum mismatch: ${name}`);
    }
  }
  return RELEASE_ASSET_NAMES.map((name) =>
    assetDescriptor(path.join(root, name), name),
  );
}

function flattenReleases(value) {
  if (!Array.isArray(value))
    throw new Error("GitHub release catalog must be an array");
  return value.flatMap((item) => (Array.isArray(item) ? item : [item]));
}

export function analyzeReleaseCatalog({ releases, sha, version, localAssets }) {
  const identity = inspectReleaseIdentity({ releases, sha, version });
  if (identity.state === "missing") {
    return Object.freeze({
      state: "missing",
      releaseId: null,
      missingAssets: [...RELEASE_ASSET_NAMES],
    });
  }
  const release = identity.release;
  const expected = new Map(localAssets.map((asset) => [asset.name, asset]));
  if (
    expected.size !== RELEASE_ASSET_NAMES.length ||
    RELEASE_ASSET_NAMES.some((name) => !expected.has(name))
  ) {
    throw new Error("local release asset set is incomplete");
  }
  const remote = new Map();
  for (const asset of release.assets || []) {
    if (!expected.has(asset?.name) || remote.has(asset.name)) {
      throw new Error("remote release contains an unknown or duplicate asset");
    }
    const local = expected.get(asset.name);
    if (
      !DIGEST_PATTERN.test(String(asset?.digest || "")) ||
      asset.digest !== local.digest ||
      Number(asset.size) !== local.size
    ) {
      throw new Error(`remote release asset identity mismatch: ${asset.name}`);
    }
    remote.set(asset.name, asset);
  }
  const missingAssets = RELEASE_ASSET_NAMES.filter((name) => !remote.has(name));
  if (!release.draft && missingAssets.length > 0) {
    throw new Error("published immutable release is incomplete");
  }
  return Object.freeze({
    state: release.draft ? "draft" : "published",
    releaseId: Number(release.id),
    missingAssets,
  });
}

export function inspectReleaseIdentity({ releases, sha, version }) {
  assertIdentity(sha, version);
  const catalog = flattenReleases(releases);
  const tag = `artifact-${sha}`;
  const sameVersion = catalog.filter((release) => release?.name === version);
  if (sameVersion.some((release) => release?.tag_name !== tag)) {
    throw new Error("release version is already bound to another SHA");
  }
  const matching = catalog.filter((release) => release?.tag_name === tag);
  if (matching.length > 1) throw new Error("release tag is not unique");
  if (matching.length === 0) {
    return Object.freeze({ state: "missing", releaseId: null, release: null });
  }
  const release = matching[0];
  if (
    release?.target_commitish !== sha ||
    release?.name !== version ||
    !Number.isSafeInteger(Number(release?.id))
  ) {
    throw new Error("release tag identity does not match SHA and version");
  }
  return Object.freeze({
    state: release.draft ? "draft" : "published",
    releaseId: Number(release.id),
    release,
  });
}

function expectedAssetsFromDownloaded(directory, sha, version) {
  const root = path.resolve(directory);
  for (const name of SMALL_RELEASE_ASSET_NAMES)
    plainFile(path.join(root, name), name);
  const { artifact } = assertManifestIdentity(root, sha, version);
  const checksums = parseReleaseChecksums(
    readFileSync(path.join(root, "checksums.sha256"), "utf8"),
  );
  const descriptors = SMALL_RELEASE_ASSET_NAMES.map((name) =>
    assetDescriptor(path.join(root, name), name),
  );
  for (const descriptor of descriptors.filter(
    (item) => item.name !== "checksums.sha256",
  )) {
    if (descriptor.digest !== `sha256:${checksums.get(descriptor.name)}`) {
      throw new Error(
        `downloaded release checksum mismatch: ${descriptor.name}`,
      );
    }
  }
  for (const image of artifact.images) {
    if (checksums.get(image.archive.file) !== image.archive.sha256) {
      throw new Error(
        `downloaded image checksum catalog mismatch: ${image.archive.file}`,
      );
    }
    descriptors.push({
      name: image.archive.file,
      size: image.archive.sizeBytes,
      digest: `sha256:${image.archive.sha256}`,
    });
  }
  return descriptors.sort((left, right) => left.name.localeCompare(right.name));
}

export function verifyExistingPublishedRelease({
  directory,
  releases,
  sha,
  version,
}) {
  const localAssets = expectedAssetsFromDownloaded(directory, sha, version);
  const result = analyzeReleaseCatalog({ releases, sha, version, localAssets });
  if (result.state !== "published" || result.missingAssets.length > 0) {
    throw new Error(
      "existing release is not a complete published immutable release",
    );
  }
  return result;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    command,
    directory: "",
    catalog: "",
    sha: "",
    version: "",
    githubOutput: "",
    json: false,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    const mapping = {
      "--dir": "directory",
      "--catalog": "catalog",
      "--sha": "sha",
      "--version": "version",
      "--github-output": "githubOutput",
    };
    if (!mapping[arg]) throw new Error(`unknown argument: ${arg}`);
    const value = rest[index + 1];
    if (!value || value.startsWith("--"))
      throw new Error(`${arg} requires a value`);
    options[mapping[arg]] = value;
    index += 1;
  }
  if (
    !new Set([
      "finalize",
      "identity",
      "plan",
      "verify-existing",
      "verify-published",
    ]).has(command)
  ) {
    throw new Error(
      "expected finalize, identity, plan, verify-existing or verify-published",
    );
  }
  if (!options.sha || !options.version)
    throw new Error("--sha and --version are required");
  if (command !== "identity" && !options.directory)
    throw new Error("--dir is required");
  if (command !== "finalize" && !options.catalog)
    throw new Error("--catalog is required");
  return options;
}

function writeOutputs(file, result) {
  if (!file) return;
  mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  writeFileSync(
    file,
    `state=${result.state}\nrelease_id=${result.releaseId || ""}\nmissing_assets=${result.missingAssets.join(",")}\n`,
    { flag: "a" },
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const directory = options.directory ? path.resolve(options.directory) : "";
  if (options.command === "identity") {
    const releases = JSON.parse(
      readFileSync(path.resolve(options.catalog), "utf8"),
    );
    const identity = inspectReleaseIdentity({
      releases,
      sha: options.sha,
      version: options.version,
    });
    const result = {
      state: identity.state,
      releaseId: identity.releaseId,
      missingAssets: [],
    };
    writeOutputs(options.githubOutput, result);
    console.log(
      options.json
        ? JSON.stringify({ status: "passed", ...result }, null, 2)
        : `[release-assets] state=${result.state}`,
    );
    return;
  }
  if (options.command === "finalize") finalizeReleaseChecksums(directory);
  const localAssets =
    options.command === "verify-existing"
      ? expectedAssetsFromDownloaded(directory, options.sha, options.version)
      : inspectLocalReleaseAssets(directory, {
          sha: options.sha,
          version: options.version,
        });
  let result = { state: "local", releaseId: null, missingAssets: [] };
  if (options.command !== "finalize") {
    const releases = JSON.parse(
      readFileSync(path.resolve(options.catalog), "utf8"),
    );
    result = analyzeReleaseCatalog({
      releases,
      sha: options.sha,
      version: options.version,
      localAssets,
    });
    if (
      options.command === "verify-existing" ||
      options.command === "verify-published"
    ) {
      if (result.state !== "published" || result.missingAssets.length > 0) {
        throw new Error("release is not complete and published");
      }
    }
  }
  writeOutputs(options.githubOutput, result);
  const output = { status: "passed", ...result, assets: localAssets };
  console.log(
    options.json
      ? JSON.stringify(output, null, 2)
      : `[release-assets] state=${result.state} missing=${result.missingAssets.length}`,
  );
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(`[release-assets] status=blocked reason=${error.message}`);
    process.exitCode = 2;
  }
}
