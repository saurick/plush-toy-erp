#!/usr/bin/env node

import {
  existsSync,
  lstatSync,
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
import { DELIVERY_RELEASE_ASSETS } from "./delivery-provider.mjs";
import { assertReleaseArtifactManifest } from "./release-artifact-bundle.mjs";
import {
  validateReleaseArtifactBinding,
  validateReleaseManifest,
  validateReleaseRehearsalReceipt,
} from "./release-catalog.mjs";

const CHECKSUM_PAYLOAD_NAMES = DELIVERY_RELEASE_ASSETS.filter(
  (name) => name !== "checksums.sha256",
);

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const VERSION_PATTERN = /^[0-9A-Za-z](?:[0-9A-Za-z._-]{0,62}[0-9A-Za-z])?$/u;

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

function finalizeReleaseChecksums(directory) {
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
  const artifactFile = path.join(directory, "release-artifact.json");
  const artifact = assertReleaseArtifactManifest(
    JSON.parse(readFileSync(artifactFile, "utf8")),
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
  validateReleaseArtifactBinding(release, artifact, sha256File(artifactFile));
  return { artifact, release };
}

function assertRehearsalAsset(root, artifact, release, sha, version) {
  const receiptFile = path.join(root, "release-rehearsal.json");
  const receipt = validateReleaseRehearsalReceipt(
    JSON.parse(readFileSync(receiptFile, "utf8")),
    artifact,
    { sha, version, customer: "yoyoosun" },
  );
  if (
    sha256File(receiptFile) !== release.rehearsal?.receiptSha256 ||
    receipt.git.commit !== release.gitSha
  ) {
    throw new Error("release rehearsal asset does not match release manifest");
  }
}

function assetDescriptor(file, name) {
  const stat = plainFile(file, name);
  return Object.freeze({
    name,
    size: stat.size,
    digest: `sha256:${sha256File(file)}`,
  });
}

function inspectLocalReleaseAssets(directory, { sha, version }) {
  assertIdentity(sha, version);
  const root = path.resolve(directory);
  const entries = readdirSync(root, { withFileTypes: true });
  const names = entries.map((entry) => entry.name).sort();
  if (
    entries.some((entry) => !entry.isFile()) ||
    JSON.stringify(names) !== JSON.stringify([...DELIVERY_RELEASE_ASSETS].sort())
  ) {
    throw new Error(
      "release directory must contain exactly the seven public assets",
    );
  }
  const { artifact, release } = assertManifestIdentity(root, sha, version);
  const checksums = parseReleaseChecksums(
    readFileSync(path.join(root, "checksums.sha256"), "utf8"),
  );
  for (const [name, expected] of checksums) {
    if (sha256File(path.join(root, name)) !== expected) {
      throw new Error(`release checksum mismatch: ${name}`);
    }
  }
  assertRehearsalAsset(root, artifact, release, sha, version);
  return DELIVERY_RELEASE_ASSETS.map((name) =>
    assetDescriptor(path.join(root, name), name),
  );
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command !== "finalize") throw new Error("expected finalize");
  const options = { directory: "", sha: "", version: "", json: false };
  const flags = { "--dir": "directory", "--sha": "sha", "--version": "version" };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--json") {
      options.json = true;
      continue;
    }
    if (!Object.hasOwn(flags, flag)) throw new Error("unknown argument: " + flag);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(flag + " requires a value");
    }
    options[flags[flag]] = value;
    index += 1;
  }
  if (!options.directory) throw new Error("--dir is required");
  assertIdentity(options.sha, options.version);
  finalizeReleaseChecksums(options.directory);
  const assets = inspectLocalReleaseAssets(options.directory, options);
  const output = {
    status: "passed",
    state: "local",
    releaseId: null,
    missingAssets: [],
    assets,
  };
  console.log(
    options.json
      ? JSON.stringify(output, null, 2)
      : "[release-assets] state=local missing=0",
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
