#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { sha256File } from "../lib/file-digest.mjs";
import { assertReleaseArtifactManifest } from "./release-artifact-bundle.mjs";
import {
  validateReleaseArtifactBinding,
  validateReleaseManifest,
  validateReleaseRehearsalReceipt,
} from "./release-catalog.mjs";

export { validateReleaseRehearsalReceipt };

export const GITLAB_RELEASE_CANDIDATE_SCHEMA = "plush.gitlab-release-candidate/v1";
export const GITLAB_RELEASE_CANDIDATE_PACKAGE = "plush-release-candidate";
export const GITLAB_RELEASE_REHEARSAL_PACKAGE = "plush-release-rehearsal";
const RELEASE_PACKAGE = "plush-release";
const CANDIDATE_FILE = "candidate.tar";
const REHEARSAL_FILE = "receipt.json";
const CANDIDATE_PAYLOADS = Object.freeze([
  "checksums.sha256",
  "release-artifact.json",
  "sbom.cdx.json",
  "server-image.tar",
  "web-image.tar",
]);
const FORMAL_RELEASE_FILES = Object.freeze([
  "checksums.sha256",
  "release-artifact.json",
  "release-manifest.json",
  "release-rehearsal.json",
  "sbom.cdx.json",
  "server-image.tar",
  "web-image.tar",
]);
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const VERSION_PATTERN = /^[0-9A-Za-z](?:[0-9A-Za-z._-]{0,62}[0-9A-Za-z])?$/u;

export class MissingGitlabReleaseEvidenceError extends Error {
  constructor(message) {
    super(message);
    this.name = "MissingGitlabReleaseEvidenceError";
  }
}

function identity(options) {
  if (
    !SHA_PATTERN.test(String(options.sha || "")) ||
    !VERSION_PATTERN.test(String(options.version || "")) ||
    options.customer !== "yoyoosun"
  ) {
    throw new Error("release candidate identity is invalid");
  }
  return Object.freeze({
    sha: options.sha,
    version: options.version,
    customer: options.customer,
    packageVersion: `artifact-${options.sha}`,
  });
}

function apiContext(env) {
  const token = String(env.GITLAB_RELEASE_TOKEN || "");
  const baseUrl = String(env.CI_API_V4_URL || "");
  const projectId = String(env.CI_PROJECT_ID || "");
  if (!token || !/^https:\/\/gitlab\.saurick\.me\/api\/v4$/u.test(baseUrl) || !/^\d+$/u.test(projectId)) {
    throw new Error("release candidate GitLab API environment is incomplete");
  }
  return { token, baseUrl, projectId };
}

async function response(request, url, token, options = {}) {
  const value = await request(url, {
    ...options,
    headers: { "PRIVATE-TOKEN": token, ...(options.headers || {}) },
  });
  if (!value?.ok) {
    throw new Error(`release candidate GitLab request failed with status ${String(value?.status || "unknown")}`);
  }
  return value;
}

async function json(request, url, token) {
  return (await response(request, url, token, { headers: { accept: "application/json" } })).json();
}

async function listPackages(context, request, name, packageVersion) {
  const values = await json(
    request,
    `${context.baseUrl}/projects/${context.projectId}/packages?package_type=generic&package_name=${encodeURIComponent(name)}&package_version=${encodeURIComponent(packageVersion)}&per_page=20`,
    context.token,
  );
  if (!Array.isArray(values) || values.length > 20) {
    throw new Error("release candidate package list is invalid");
  }
  return values.filter(
    (value) =>
      value?.package_type === "generic" &&
      value?.name === name &&
      value?.version === packageVersion,
  );
}

async function onePackage(context, request, name, packageVersion, { missing = true } = {}) {
  const values = await listPackages(context, request, name, packageVersion);
  if (values.length === 0 && missing) {
    throw new MissingGitlabReleaseEvidenceError(`${name} package is missing`);
  }
  if (values.length !== 1 || !Number.isSafeInteger(values[0]?.id) || values[0].id < 1) {
    throw new Error(`${name} package identity is not unique`);
  }
  return values[0];
}

async function packageFiles(context, request, packageValue) {
  const values = await json(
    request,
    `${context.baseUrl}/projects/${context.projectId}/packages/${packageValue.id}/package_files?per_page=20`,
    context.token,
  );
  if (!Array.isArray(values) || values.length > 20) {
    throw new Error("release candidate package files are invalid");
  }
  return values;
}

function exactRemoteFile(files, name, { maximum = 20 * 1024 * 1024 * 1024 } = {}) {
  const matching = files.filter((file) => file?.file_name === name);
  if (
    matching.length !== 1 ||
    !Number.isSafeInteger(matching[0]?.size) ||
    matching[0].size < 1 ||
    matching[0].size > maximum ||
    !SHA256_PATTERN.test(String(matching[0]?.file_sha256 || ""))
  ) {
    throw new Error(`release candidate package file is invalid: ${name}`);
  }
  return matching[0];
}

async function download(context, request, packageName, packageVersion, file, metadata) {
  const value = await response(
    request,
    `${context.baseUrl}/projects/${context.projectId}/packages/generic/${encodeURIComponent(packageName)}/${encodeURIComponent(packageVersion)}/${encodeURIComponent(file)}`,
    context.token,
    { headers: { accept: "application/octet-stream" } },
  );
  const buffer = Buffer.from(await value.arrayBuffer());
  if (
    buffer.length !== metadata.size ||
    sha256Buffer(buffer) !== metadata.file_sha256
  ) {
    throw new Error(`release candidate download identity mismatch: ${file}`);
  }
  return buffer;
}

function atomicBuffer(file, buffer) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, buffer, { mode: 0o600, flag: "wx" });
    if (sha256File(temporary) !== sha256Buffer(buffer)) {
      throw new Error("release candidate local write digest mismatch");
    }
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function parseChecksums(source, expectedNames) {
  const values = new Map();
  for (const line of String(source).split(/\r?\n/u)) {
    if (!line) continue;
    const match = /^([0-9a-f]{64})  ([A-Za-z0-9._-]+)$/u.exec(line);
    if (!match || values.has(match[2])) throw new Error("release checksum file is malformed");
    values.set(match[2], match[1]);
  }
  if (
    values.size !== expectedNames.length ||
    expectedNames.some((name) => !values.has(name))
  ) {
    throw new Error("release checksum file has an incomplete payload set");
  }
  return values;
}

function plainFile(file, label) {
  if (!existsSync(file)) throw new Error(`${label} is missing`);
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1) {
    throw new Error(`${label} must be a non-empty plain file`);
  }
  return stat;
}

export function buildGitlabReleaseCandidateManifest(
  { artifactDir, sha, version, customer, pipelineId = "", jobId = "", runnerId = "" },
  { createdAt = new Date().toISOString() } = {},
) {
  const releaseIdentity = identity({ sha, version, customer });
  const directory = path.resolve(artifactDir);
  const names = readdirSync(directory, { withFileTypes: true }).map((entry) => {
    if (!entry.isFile()) throw new Error("release candidate directory contains a non-file entry");
    return entry.name;
  }).sort();
  if (JSON.stringify(names) !== JSON.stringify([...CANDIDATE_PAYLOADS].sort())) {
    throw new Error("release candidate directory must contain exactly five build outputs");
  }
  const artifact = assertReleaseArtifactManifest(
    JSON.parse(readFileSync(path.join(directory, "release-artifact.json"), "utf8")),
  );
  if (
    artifact.git.commit !== sha ||
    artifact.releaseVersion !== version ||
    artifact.customer !== customer ||
    artifact.git.worktreeClean !== true
  ) {
    throw new Error("release candidate artifact identity mismatch");
  }
  const checksums = parseChecksums(
    readFileSync(path.join(directory, "checksums.sha256"), "utf8"),
    CANDIDATE_PAYLOADS.filter((name) => name !== "checksums.sha256"),
  );
  for (const [name, digest] of checksums) {
    if (sha256File(path.join(directory, name)) !== digest) {
      throw new Error(`release candidate checksum mismatch: ${name}`);
    }
  }
  const files = CANDIDATE_PAYLOADS.map((name) => {
    const file = path.join(directory, name);
    return { name, size: plainFile(file, name).size, sha256: sha256File(file) };
  });
  return validateGitlabReleaseCandidateManifest({
    schemaVersion: GITLAB_RELEASE_CANDIDATE_SCHEMA,
    status: "frozen",
    gitSha: releaseIdentity.sha,
    version: releaseIdentity.version,
    customer: releaseIdentity.customer,
    platform: "linux/amd64",
    createdAt,
    build: {
      pipelineId: String(pipelineId || "local"),
      jobId: String(jobId || "local"),
      runnerId: String(runnerId || "unknown"),
      buildCount: 1,
    },
    artifact: {
      schemaVersion: artifact.schemaVersion,
      manifestSha256: sha256File(path.join(directory, "release-artifact.json")),
      serverContentId: artifact.images.find((item) => item.kind === "server")?.contentId,
      webContentId: artifact.images.find((item) => item.kind === "web")?.contentId,
      migrationSequenceSha256: artifact.migration.sequenceSha256,
      sourceArchiveSha256: artifact.sourceArchive.sha256,
    },
    files,
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsAbsoluteWorkspacePaths: false,
    },
  });
}

export function validateGitlabReleaseCandidateManifest(manifest) {
  const files = new Map((manifest?.files || []).map((file) => [file.name, file]));
  if (
    manifest?.schemaVersion !== GITLAB_RELEASE_CANDIDATE_SCHEMA ||
    manifest?.status !== "frozen" ||
    !SHA_PATTERN.test(String(manifest?.gitSha || "")) ||
    !VERSION_PATTERN.test(String(manifest?.version || "")) ||
    manifest?.customer !== "yoyoosun" ||
    manifest?.platform !== "linux/amd64" ||
    Number.isNaN(Date.parse(manifest?.createdAt)) ||
    manifest?.build?.buildCount !== 1 ||
    !["pipelineId", "jobId", "runnerId"].every(
      (key) => typeof manifest?.build?.[key] === "string" && manifest.build[key].length > 0,
    ) ||
    manifest?.artifact?.schemaVersion !== "plush-release-artifact/v1" ||
    !["manifestSha256", "migrationSequenceSha256", "sourceArchiveSha256"].every(
      (key) => SHA256_PATTERN.test(String(manifest?.artifact?.[key] || "")),
    ) ||
    !["serverContentId", "webContentId"].every(
      (key) => /^sha256:[0-9a-f]{64}$/u.test(String(manifest?.artifact?.[key] || "")),
    ) ||
    files.size !== CANDIDATE_PAYLOADS.length ||
    CANDIDATE_PAYLOADS.some((name) => {
      const file = files.get(name);
      return (
        !file ||
        !Number.isSafeInteger(file.size) ||
        file.size < 1 ||
        !SHA256_PATTERN.test(String(file.sha256 || ""))
      );
    }) ||
    manifest?.redaction?.containsSecrets !== false ||
    manifest?.redaction?.containsCredentials !== false ||
    manifest?.redaction?.containsAbsoluteWorkspacePaths !== false
  ) {
    throw new Error("release candidate manifest contract is invalid");
  }
  return manifest;
}

function createCandidateArchive({ artifactDir, manifestFile, archive }) {
  const args = ["--format=posix", "-cf", path.resolve(archive), "-C", path.resolve(artifactDir), ...CANDIDATE_PAYLOADS, "-C", path.dirname(path.resolve(manifestFile)), path.basename(manifestFile)];
  const result = spawnSync("tar", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error || result.status !== 0) throw new Error("release candidate archive creation failed");
  plainFile(path.resolve(archive), "release candidate archive");
  return path.resolve(archive);
}

function extractCandidateArchive(archive, directory) {
  const listing = spawnSync("tar", ["-tf", archive], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const expected = [...CANDIDATE_PAYLOADS, "release-candidate.json"].sort();
  const entries = String(listing.stdout || "").split(/\r?\n/u).filter(Boolean).sort();
  if (listing.error || listing.status !== 0 || JSON.stringify(entries) !== JSON.stringify(expected)) {
    throw new Error("release candidate archive inventory is invalid");
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const extracted = spawnSync("tar", ["-xf", archive, "-C", directory], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (extracted.error || extracted.status !== 0) throw new Error("release candidate archive extraction failed");
  for (const name of expected) plainFile(path.join(directory, name), name);
}

function assertExtractedCandidate(directory, releaseIdentity) {
  const manifest = validateGitlabReleaseCandidateManifest(
    JSON.parse(readFileSync(path.join(directory, "release-candidate.json"), "utf8")),
  );
  if (
    manifest.gitSha !== releaseIdentity.sha ||
    manifest.version !== releaseIdentity.version ||
    manifest.customer !== releaseIdentity.customer
  ) {
    throw new Error("release candidate requested identity mismatch");
  }
  for (const descriptor of manifest.files) {
    const file = path.join(directory, descriptor.name);
    if (plainFile(file, descriptor.name).size !== descriptor.size || sha256File(file) !== descriptor.sha256) {
      throw new Error(`release candidate extracted digest mismatch: ${descriptor.name}`);
    }
  }
  return manifest;
}

async function assertCatalogIdentity(context, request, releaseIdentity) {
  const releases = await json(
    request,
    `${context.baseUrl}/projects/${context.projectId}/releases?per_page=100`,
    context.token,
  );
  if (!Array.isArray(releases) || releases.length > 100) throw new Error("release catalog response is invalid");
  const tag = releaseIdentity.packageVersion;
  if (releases.some((item) => item?.name === releaseIdentity.version && item?.tag_name !== tag)) {
    throw new Error("release version is already bound to another SHA");
  }
  if (releases.some((item) => item?.tag_name === tag && item?.name !== releaseIdentity.version)) {
    throw new Error("release SHA is already bound to another version");
  }
  const release = releases.find((item) => item?.tag_name === tag) || null;
  if (release && release?.commit?.id !== releaseIdentity.sha) {
    throw new Error("release tag does not resolve to the requested SHA");
  }
  return release;
}

export async function prepareCandidate(options, runtime = {}) {
  const releaseIdentity = identity(options);
  const manifest = buildGitlabReleaseCandidateManifest({
    artifactDir: options.artifactDir,
    ...releaseIdentity,
    pipelineId: runtime.env?.CI_PIPELINE_ID || process.env.CI_PIPELINE_ID,
    jobId: runtime.env?.CI_JOB_ID || process.env.CI_JOB_ID,
    runnerId: runtime.env?.CI_RUNNER_ID || process.env.CI_RUNNER_ID,
  });
  const manifestFile = path.resolve(options.manifestOut);
  mkdirSync(path.dirname(manifestFile), { recursive: true, mode: 0o700 });
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  const archive = createCandidateArchive({
    artifactDir: options.artifactDir,
    manifestFile,
    archive: options.archive,
  });
  return { status: "prepared", archive, sha256: sha256File(archive), manifest };
}

export async function verifyRemoteCandidate(options, runtime = {}) {
  const releaseIdentity = identity(options);
  const env = runtime.env || process.env;
  const request = runtime.request || globalThis.fetch;
  const context = apiContext(env);
  await assertCatalogIdentity(context, request, releaseIdentity);
  const packageValue = await onePackage(
    context,
    request,
    GITLAB_RELEASE_CANDIDATE_PACKAGE,
    releaseIdentity.packageVersion,
  );
  const files = await packageFiles(context, request, packageValue);
  if (files.length !== 1) throw new Error("release candidate package must contain one archive");
  const remote = exactRemoteFile(files, CANDIDATE_FILE);
  const local = path.resolve(options.archive);
  if (plainFile(local, "release candidate archive").size !== remote.size || sha256File(local) !== remote.file_sha256) {
    throw new Error("release candidate remote archive digest mismatch");
  }
  return { status: "verified", packageId: packageValue.id, fileSha256: remote.file_sha256 };
}

export async function recoverCandidate(options, runtime = {}) {
  const releaseIdentity = identity(options);
  const env = runtime.env || process.env;
  const request = runtime.request || globalThis.fetch;
  const context = apiContext(env);
  await assertCatalogIdentity(context, request, releaseIdentity);
  const packageValue = await onePackage(
    context,
    request,
    GITLAB_RELEASE_CANDIDATE_PACKAGE,
    releaseIdentity.packageVersion,
  );
  const files = await packageFiles(context, request, packageValue);
  if (files.length !== 1) throw new Error("release candidate package must contain one archive");
  const metadata = exactRemoteFile(files, CANDIDATE_FILE);
  const buffer = await download(
    context,
    request,
    GITLAB_RELEASE_CANDIDATE_PACKAGE,
    releaseIdentity.packageVersion,
    CANDIDATE_FILE,
    metadata,
  );
  const workspace = mkdtempSync(path.join(os.tmpdir(), "plush-release-candidate-"));
  try {
    const archive = path.join(workspace, CANDIDATE_FILE);
    atomicBuffer(archive, buffer);
    if (sha256File(archive) !== metadata.file_sha256) {
      throw new Error("release candidate downloaded archive digest mismatch");
    }
    const extracted = path.join(workspace, "extracted");
    extractCandidateArchive(archive, extracted);
    const manifest = assertExtractedCandidate(extracted, releaseIdentity);
    const artifactDir = path.resolve(options.artifactDir);
    if (existsSync(artifactDir)) throw new Error("release candidate output already exists");
    mkdirSync(artifactDir, { recursive: true, mode: 0o700 });
    for (const name of CANDIDATE_PAYLOADS) {
      renameSync(path.join(extracted, name), path.join(artifactDir, name));
    }
    const manifestOut = path.resolve(options.manifestOut);
    mkdirSync(path.dirname(manifestOut), { recursive: true, mode: 0o700 });
    renameSync(path.join(extracted, "release-candidate.json"), manifestOut);
    return { status: "recovered", packageId: packageValue.id, manifest };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

async function rehearsalPackage(options, runtime, { recover }) {
  const releaseIdentity = identity(options);
  const env = runtime.env || process.env;
  const request = runtime.request || globalThis.fetch;
  const context = apiContext(env);
  await assertCatalogIdentity(context, request, releaseIdentity);
  const packageValue = await onePackage(
    context,
    request,
    GITLAB_RELEASE_REHEARSAL_PACKAGE,
    releaseIdentity.packageVersion,
  );
  const files = await packageFiles(context, request, packageValue);
  if (files.length !== 1) throw new Error("release rehearsal package must contain one receipt");
  const metadata = exactRemoteFile(files, REHEARSAL_FILE, { maximum: 4 * 1024 * 1024 });
  const artifact = assertReleaseArtifactManifest(
    JSON.parse(readFileSync(path.join(options.artifactDir, "release-artifact.json"), "utf8")),
  );
  if (recover) {
    const buffer = await download(
      context,
      request,
      GITLAB_RELEASE_REHEARSAL_PACKAGE,
      releaseIdentity.packageVersion,
      REHEARSAL_FILE,
      metadata,
    );
    const receipt = validateReleaseRehearsalReceipt(
      JSON.parse(buffer.toString("utf8")),
      artifact,
      releaseIdentity,
    );
    atomicBuffer(path.resolve(options.receipt), buffer);
    return { status: "recovered", packageId: packageValue.id, sha256: metadata.file_sha256, receipt };
  }
  const receiptFile = path.resolve(options.receipt);
  const receipt = validateReleaseRehearsalReceipt(
    JSON.parse(readFileSync(receiptFile, "utf8")),
    artifact,
    releaseIdentity,
  );
  if (plainFile(receiptFile, "release rehearsal receipt").size !== metadata.size || sha256File(receiptFile) !== metadata.file_sha256) {
    throw new Error("release rehearsal remote receipt digest mismatch");
  }
  return { status: "verified", packageId: packageValue.id, sha256: metadata.file_sha256, receipt };
}

export async function recoverRehearsal(options, runtime = {}) {
  return rehearsalPackage(options, runtime, { recover: true });
}

export async function verifyRemoteRehearsal(options, runtime = {}) {
  return rehearsalPackage(options, runtime, { recover: false });
}

export function verifyLocalRehearsal(options) {
  const releaseIdentity = identity(options);
  const artifact = assertReleaseArtifactManifest(
    JSON.parse(readFileSync(path.join(options.artifactDir, "release-artifact.json"), "utf8")),
  );
  const receipt = validateReleaseRehearsalReceipt(
    JSON.parse(readFileSync(options.receipt, "utf8")),
    artifact,
    releaseIdentity,
  );
  return { status: "prepared", sha256: sha256File(options.receipt), receipt };
}

export async function inspectPublishedRelease(options, runtime = {}) {
  const releaseIdentity = identity(options);
  const env = runtime.env || process.env;
  const request = runtime.request || globalThis.fetch;
  const context = apiContext(env);
  const release = await assertCatalogIdentity(context, request, releaseIdentity);
  if (!release) throw new MissingGitlabReleaseEvidenceError("formal release is missing");
  const packageValue = await onePackage(
    context,
    request,
    RELEASE_PACKAGE,
    releaseIdentity.packageVersion,
  );
  const files = await packageFiles(context, request, packageValue);
  const byName = new Map(files.map((file) => [file.file_name, file]));
  if (
    byName.size !== FORMAL_RELEASE_FILES.length ||
    FORMAL_RELEASE_FILES.some((name) => !byName.has(name))
  ) {
    throw new Error("formal immutable release package is incomplete");
  }
  const small = {};
  for (const name of [
    "checksums.sha256",
    "release-artifact.json",
    "release-manifest.json",
    "release-rehearsal.json",
  ]) {
    const metadata = exactRemoteFile(files, name, { maximum: 4 * 1024 * 1024 });
    small[name] = await download(
      context,
      request,
      RELEASE_PACKAGE,
      releaseIdentity.packageVersion,
      name,
      metadata,
    );
    if (sha256Buffer(small[name]) !== metadata.file_sha256) {
      throw new Error(`formal release small asset digest mismatch: ${name}`);
    }
  }
  const artifact = assertReleaseArtifactManifest(
    JSON.parse(small["release-artifact.json"].toString("utf8")),
  );
  const manifest = validateReleaseManifest(
    JSON.parse(small["release-manifest.json"].toString("utf8")),
  );
  validateReleaseArtifactBinding(
    manifest,
    artifact,
    sha256Buffer(small["release-artifact.json"]),
  );
  const rehearsal = validateReleaseRehearsalReceipt(
    JSON.parse(small["release-rehearsal.json"].toString("utf8")),
    artifact,
    releaseIdentity,
  );
  const checksums = parseChecksums(
    small["checksums.sha256"].toString("utf8"),
    FORMAL_RELEASE_FILES.filter((name) => name !== "checksums.sha256"),
  );
  if (
    artifact.git.commit !== releaseIdentity.sha ||
    artifact.releaseVersion !== releaseIdentity.version ||
    manifest.gitSha !== releaseIdentity.sha ||
    manifest.version !== releaseIdentity.version ||
    manifest.schemaVersion !== "plush.release-manifest/v2" ||
    manifest.rehearsal?.status !== "passed" ||
    manifest.rehearsal?.receiptSha256 !==
      sha256Buffer(small["release-rehearsal.json"]) ||
    rehearsal.git.commit !== manifest.gitSha
  ) {
    throw new Error("formal immutable release identity or rehearsal evidence is invalid");
  }
  for (const name of FORMAL_RELEASE_FILES.filter((value) => value !== "checksums.sha256")) {
    const metadata = exactRemoteFile(files, name);
    if (checksums.get(name) !== metadata.file_sha256) {
      throw new Error(`formal release server checksum mismatch: ${name}`);
    }
  }
  return {
    status: "published",
    packageId: packageValue.id,
    releaseTag: releaseIdentity.packageVersion,
    releaseManifestSha256: byName.get("release-manifest.json").file_sha256,
  };
}

function parseArgs(argv) {
  const [command, ...args] = argv;
  const options = {
    command,
    sha: "",
    version: "",
    customer: "yoyoosun",
    artifactDir: "",
    manifestOut: "",
    archive: "",
    receipt: "",
    json: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    const key = {
      "--sha": "sha",
      "--version": "version",
      "--customer": "customer",
      "--artifact-dir": "artifactDir",
      "--manifest-out": "manifestOut",
      "--archive": "archive",
      "--receipt": "receipt",
    }[arg];
    const value = args[index + 1];
    if (!key || !value || value.startsWith("--")) throw new Error(`invalid argument: ${arg}`);
    options[key] = value;
    index += 1;
  }
  if (![
    "prepare",
    "verify",
    "recover",
    "prepare-rehearsal",
    "verify-rehearsal",
    "recover-rehearsal",
    "published",
  ].includes(command)) {
    throw new Error("release candidate command is invalid");
  }
  identity(options);
  return options;
}

const isDirectRun =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    const options = parseArgs(process.argv.slice(2));
    let result;
    if (options.command === "prepare") result = await prepareCandidate(options);
    if (options.command === "verify") result = await verifyRemoteCandidate(options);
    if (options.command === "recover") result = await recoverCandidate(options);
    if (options.command === "prepare-rehearsal") result = verifyLocalRehearsal(options);
    if (options.command === "verify-rehearsal") result = await verifyRemoteRehearsal(options);
    if (options.command === "recover-rehearsal") result = await recoverRehearsal(options);
    if (options.command === "published") result = await inspectPublishedRelease(options);
    process.stdout.write(
      options.json
        ? `${JSON.stringify({ status: result.status, sha: options.sha, version: options.version, sha256: result.sha256 || result.fileSha256 || result.releaseManifestSha256 || "" }, null, 2)}\n`
        : `[gitlab-release-candidate] command=${options.command} status=${result.status} sha=${options.sha}\n`,
    );
  } catch (error) {
    if (error instanceof MissingGitlabReleaseEvidenceError) {
      process.stderr.write(`[gitlab-release-candidate] status=missing reason=${error.message}\n`);
      process.exitCode = 3;
    } else {
      process.stderr.write(`[gitlab-release-candidate] status=blocked reason=${error.message}\n`);
      process.exitCode = 2;
    }
  }
}
