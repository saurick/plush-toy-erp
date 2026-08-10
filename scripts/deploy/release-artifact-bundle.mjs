#!/usr/bin/env node

import crypto from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

import { sha256File } from "../lib/file-digest.mjs";
import { runSourceArchiveReleaseCheck } from "./source-archive-release-check.mjs";

const SCHEMA_VERSION = "plush-release-artifact/v1";
const CUSTOMER_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const IMAGE_ID_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const MIGRATION_VERSION_PATTERN = /^[0-9]{14}$/u;
const SENSITIVE_ENV_KEY_PATTERN =
  /(?:PASSWORD|PASSWD|SECRET|TOKEN|PRIVATE_KEY|ACCESS_KEY|POSTGRES_DSN|DATABASE_URL)/iu;
const CREDENTIAL_URL_PATTERN = /[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/iu;
const DEFAULT_CUSTOMER = "yoyoosun";
const IMAGE_ARCHIVE_COMPRESSION = "zstd";
const IMAGE_ARCHIVE_COMPRESSION_LEVEL = 3;
const MAX_CHILD_DIAGNOSTIC_BYTES = 8 * 1024;
const MAX_CHILD_DIAGNOSTIC_MESSAGE_LENGTH = 2 * 1024;

class ReleaseArtifactError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ReleaseArtifactError";
    this.details = details;
  }
}

function commandDisplay(command, args) {
  return [command, ...args]
    .map((part) =>
      /^[A-Za-z0-9_./:=@+-]+$/u.test(part) ? part : JSON.stringify(part),
    )
    .join(" ");
}

export function runArtifactCommand({
  command,
  args = [],
  cwd,
  env = process.env,
  label,
  stdio = "pipe",
}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio,
  });
  if (result.error) {
    throw new ReleaseArtifactError(
      `${label} could not start: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new ReleaseArtifactError(
      `${label} failed with exit ${result.status}: ${commandDisplay(command, args)}`,
    );
  }
  return String(result.stdout || "");
}

function redactChildDiagnostic(value) {
  return String(value || "")
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/giu, "$1[REDACTED]@")
    .replace(/\b(Bearer|Basic)\s+[^\s]+/giu, "$1 [REDACTED]")
    .replace(
      /\b((?:PASSWORD|PASSWD|SECRET|TOKEN|PRIVATE_KEY|ACCESS_KEY|POSTGRES_DSN|DATABASE_URL)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s]+)/giu,
      "$1[REDACTED]",
    )
    .replace(/\b(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]+\b/gu, "[REDACTED]")
    .replace(/\b[A-Za-z0-9_+/=-]{64,}\b/gu, "[REDACTED_LONG_VALUE]")
    .replace(/[\u0000-\u001f\u007f]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, MAX_CHILD_DIAGNOSTIC_MESSAGE_LENGTH);
}

function collectBoundedChildDiagnostic(stream) {
  const chunks = [];
  let capturedBytes = 0;
  let truncated = false;
  stream?.on("data", (chunk) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const remaining = MAX_CHILD_DIAGNOSTIC_BYTES - capturedBytes;
    if (remaining <= 0) {
      truncated = true;
      return;
    }
    const captured = buffer.subarray(0, remaining);
    chunks.push(captured);
    capturedBytes += captured.length;
    if (captured.length < buffer.length) truncated = true;
  });
  return () => {
    const message = redactChildDiagnostic(
      Buffer.concat(chunks).toString("utf8"),
    );
    if (!message) return "";
    return truncated ? `${message} [truncated]` : message;
  };
}

function terminateChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    child.kill("SIGTERM");
  } catch {
    // The final child outcome below remains the source of truth.
  }
}

function waitForChild(child, startedAt, abortPeer) {
  return new Promise((resolve) => {
    let startError = null;
    child.once("error", (error) => {
      startError = error;
      abortPeer();
    });
    child.once("exit", (code, signal) => {
      if (code !== 0 || signal) abortPeer();
    });
    child.once("close", (code, signal) => {
      resolve({
        code,
        signal,
        startError,
        durationMs: Math.max(0, Date.now() - startedAt),
      });
    });
  });
}

function childFailure(label, outcome, diagnostic) {
  let summary = "";
  if (outcome.startError) {
    summary = `${label} could not start`;
  } else if (outcome.signal) {
    summary = `${label} terminated by ${outcome.signal}`;
  } else if (outcome.code !== 0) {
    summary = `${label} failed with exit ${String(outcome.code)}`;
  }
  if (!summary) return "";
  return diagnostic ? `${summary}: ${diagnostic}` : summary;
}

export async function streamImageArchive({
  fixedRef,
  tarPath,
  repoRoot,
  env = process.env,
  spawnProcess = spawn,
}) {
  rmSync(tarPath, { force: true });
  const dockerStartedAt = Date.now();
  let docker;
  let zstd;
  try {
    docker = spawnProcess("docker", ["image", "save", fixedRef], {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const zstdStartedAt = Date.now();
    zstd = spawnProcess(
      "zstd",
      [
        "--quiet",
        `-${String(IMAGE_ARCHIVE_COMPRESSION_LEVEL)}`,
        "--force",
        "-o",
        tarPath,
        "-",
      ],
      {
        cwd: repoRoot,
        env,
        stdio: ["pipe", "ignore", "pipe"],
      },
    );
    const dockerDiagnostic = collectBoundedChildDiagnostic(docker.stderr);
    const zstdDiagnostic = collectBoundedChildDiagnostic(zstd.stderr);
    let uncompressedSizeBytes = 0;
    const byteCounter = new Transform({
      transform(chunk, _encoding, callback) {
        uncompressedSizeBytes += chunk.length;
        callback(null, chunk);
      },
    });
    let streamError = null;
    const streamPromise = pipeline(
      docker.stdout,
      byteCounter,
      zstd.stdin,
    ).catch((error) => {
      streamError = error;
      terminateChild(docker);
      terminateChild(zstd);
    });
    const [dockerOutcome, zstdOutcome] = await Promise.all([
      waitForChild(docker, dockerStartedAt, () => terminateChild(zstd)),
      waitForChild(zstd, zstdStartedAt, () => terminateChild(docker)),
    ]);
    await streamPromise;

    const failures = [
      childFailure("docker image save", dockerOutcome, dockerDiagnostic()),
      childFailure("zstd", zstdOutcome, zstdDiagnostic()),
    ].filter(Boolean);
    if (streamError && failures.length === 0) {
      const diagnostic = redactChildDiagnostic(streamError.message);
      failures.push(
        diagnostic
          ? `image archive stream failed: ${diagnostic}`
          : "image archive stream failed",
      );
    }
    if (uncompressedSizeBytes === 0 && failures.length === 0) {
      failures.push("docker image save produced an empty stream");
    }
    if (
      failures.length === 0 &&
      (!existsSync(tarPath) || statSync(tarPath).size === 0)
    ) {
      failures.push("zstd produced an empty image archive");
    }
    if (failures.length > 0) {
      rmSync(tarPath, { force: true });
      throw new ReleaseArtifactError(failures.join("; "));
    }
    return {
      saveDurationMs: dockerOutcome.durationMs,
      compressionDurationMs: zstdOutcome.durationMs,
      uncompressedSizeBytes,
    };
  } catch (error) {
    terminateChild(docker);
    terminateChild(zstd);
    rmSync(tarPath, { force: true });
    if (error instanceof ReleaseArtifactError) throw error;
    const diagnostic = redactChildDiagnostic(error?.message);
    throw new ReleaseArtifactError(
      diagnostic
        ? `image archive stream could not start: ${diagnostic}`
        : "image archive stream could not start",
    );
  }
}

function sha256Buffer(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeSha256(value, field) {
  const normalized = String(value || "").replace(/^sha256:/u, "");
  if (!SHA256_PATTERN.test(normalized)) {
    throw new ReleaseArtifactError(`${field} is invalid`);
  }
  return normalized;
}

function writeJSON(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
}

function assertPlainRelativeFile(value, field) {
  const text = String(value || "").trim();
  if (
    !text ||
    path.isAbsolute(text) ||
    text.includes("\\") ||
    text.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new ReleaseArtifactError(`${field} must be a safe relative file`);
  }
  return text;
}

function assertNoSymlinkParents(targetPath, stopPath) {
  const stop = path.resolve(stopPath);
  let cursor = path.resolve(targetPath);
  while (cursor !== stop) {
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) {
      throw new ReleaseArtifactError(
        `release output path must not contain symbolic links: ${cursor}`,
      );
    }
    const parent = path.dirname(cursor);
    if (
      parent === cursor ||
      (parent !== stop && !parent.startsWith(`${stop}${path.sep}`))
    ) {
      throw new ReleaseArtifactError(
        "release output must remain inside repository output/",
      );
    }
    cursor = parent;
  }
}

export function resolveReleaseOutput(repoRoot, requested, commit) {
  if (!COMMIT_PATTERN.test(commit)) {
    throw new ReleaseArtifactError("release commit must be a 40-character SHA");
  }
  const realRepoRoot = realpathSync(repoRoot);
  const outputRoot = path.join(realRepoRoot, "output");
  const candidate = requested
    ? path.resolve(realRepoRoot, requested)
    : path.join(outputRoot, "releases", commit);
  if (
    candidate !== outputRoot &&
    !candidate.startsWith(`${outputRoot}${path.sep}`)
  ) {
    throw new ReleaseArtifactError(
      "release output must remain inside repository output/",
    );
  }
  assertNoSymlinkParents(candidate, outputRoot);
  return candidate;
}

function gitShow(repoRoot, commit, relativePath, runCommand) {
  return runCommand({
    command: "git",
    args: ["show", `${commit}:${relativePath}`],
    cwd: repoRoot,
    label: `read committed ${relativePath}`,
  });
}

function committedPaths(repoRoot, commit, prefix, runCommand) {
  return runCommand({
    command: "git",
    args: ["ls-tree", "-r", "--name-only", commit, "--", prefix],
    cwd: repoRoot,
    label: `list committed ${prefix}`,
  })
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .sort();
}

export function buildMigrationEvidence({
  repoRoot,
  commit,
  runCommand = runArtifactCommand,
}) {
  const files = committedPaths(
    repoRoot,
    commit,
    "server/internal/data/model/migrate",
    runCommand,
  ).filter((item) => item.endsWith(".sql"));
  const versions = files.map((item) => path.basename(item).slice(0, 14));
  if (
    files.length === 0 ||
    versions.some((item) => !MIGRATION_VERSION_PATTERN.test(item)) ||
    new Set(versions).size !== versions.length
  ) {
    throw new ReleaseArtifactError(
      "committed migration sequence is empty, malformed, or duplicated",
    );
  }
  const sequenceHash = crypto.createHash("sha256");
  for (const relativePath of files) {
    sequenceHash.update(relativePath);
    sequenceHash.update("\0");
    sequenceHash.update(
      gitShow(repoRoot, commit, relativePath, runCommand),
      "utf8",
    );
    sequenceHash.update("\0");
  }
  return {
    latest: versions.at(-1),
    fileCount: files.length,
    first: versions[0],
    sequenceSha256: sequenceHash.digest("hex"),
  };
}

export function buildCustomerConfigEvidence({
  repoRoot,
  commit,
  customer = DEFAULT_CUSTOMER,
  runCommand = runArtifactCommand,
}) {
  if (!CUSTOMER_KEY_PATTERN.test(customer)) {
    throw new ReleaseArtifactError("customer key is invalid");
  }
  const inputs = [
    `config/customers/${customer}/customerPackage.mjs`,
    `config/customers/${customer}/roleFlowMatrix.mjs`,
  ];
  const hash = crypto.createHash("sha256");
  let customerPackageSource = "";
  for (const relativePath of inputs) {
    const source = gitShow(repoRoot, commit, relativePath, runCommand);
    if (relativePath.endsWith("/customerPackage.mjs")) {
      customerPackageSource = source;
    }
    hash.update(relativePath);
    hash.update("\0");
    hash.update(source);
    hash.update("\0");
  }
  const packageKey = customerPackageSource.match(
    /\bpackageKey:\s*"([^"]+)"/u,
  )?.[1];
  if (!packageKey || !packageKey.startsWith(`${customer}-customer-package-`)) {
    throw new ReleaseArtifactError(
      "committed customer package key is missing or invalid",
    );
  }
  const status =
    customerPackageSource.match(/\bstatus:\s*"([^"]+)"/u)?.[1] || "";
  const runtimeEnabled =
    customerPackageSource.match(/\bruntimeEnabled:\s*(true|false)/u)?.[1] ===
    "true";
  return {
    customer,
    packageKey,
    expectedRuntimeRevision: `${packageKey}.runtime-manifest-v1`,
    sourceStatus: status,
    sourceRuntimeEnabled: runtimeEnabled,
    sourceInputCount: inputs.length,
    sourceSha256: hash.digest("hex"),
    boundary:
      "This is a committed Product Core customer-config source fingerprint; target active revision still requires runtime readback.",
  };
}

function parseGoComponents(goSum) {
  const components = new Map();
  for (const line of goSum.split(/\r?\n/u)) {
    const [module, rawVersion] = line.trim().split(/\s+/u);
    if (!module || !rawVersion) continue;
    const version = rawVersion.replace(/\/go\.mod$/u, "");
    const key = `${module}@${version}`;
    components.set(key, {
      type: "library",
      group: "golang",
      name: module,
      version,
      "bom-ref": `pkg:golang/${encodeURIComponent(module)}@${encodeURIComponent(version)}`,
    });
  }
  return [...components.values()];
}

function parsePnpmComponents(lockfile) {
  const packagesIndex = lockfile.search(/^packages:\s*$/mu);
  const snapshotsIndex = lockfile.search(/^snapshots:\s*$/mu);
  if (packagesIndex < 0) {
    throw new ReleaseArtifactError("pnpm lockfile packages section is missing");
  }
  const section = lockfile.slice(
    packagesIndex,
    snapshotsIndex > packagesIndex ? snapshotsIndex : undefined,
  );
  const components = new Map();
  for (const line of section.split(/\r?\n/u)) {
    const match = line.match(/^  (['"]?)(.+)\1:\s*$/u);
    if (!match) continue;
    const raw = match[2].replace(/\(.+$/u, "");
    const separator = raw.lastIndexOf("@");
    if (separator <= 0 || separator === raw.length - 1) continue;
    const name = raw.slice(0, separator);
    const version = raw.slice(separator + 1);
    const key = `${name}@${version}`;
    components.set(key, {
      type: "library",
      group: "npm",
      name,
      version,
      "bom-ref": `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}`,
    });
  }
  return [...components.values()];
}

function parseContainerComponents(...dockerfiles) {
  const refs = new Set();
  for (const source of dockerfiles) {
    for (const match of source.matchAll(
      /^ARG\s+[A-Z0-9_]+_IMAGE=([^\s]+)\s*$/gmu,
    )) {
      refs.add(match[1]);
    }
  }
  return [...refs].sort().map((ref) => ({
    type: "container",
    group: "oci-base-image",
    name: ref,
    version: ref.includes(":") ? ref.slice(ref.lastIndexOf(":") + 1) : "",
    "bom-ref": `pkg:oci/${encodeURIComponent(ref)}`,
  }));
}

function uuidFromCommit(commit) {
  const hex = sha256Buffer(`plush-release-sbom:${commit}`).slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20),
  ].join("-");
}

export function buildDependencySbom({
  repoRoot,
  commit,
  customer,
  migrationLatest,
  createdAt,
  runCommand = runArtifactCommand,
}) {
  const goSum = gitShow(repoRoot, commit, "server/go.sum", runCommand);
  const pnpmLock = gitShow(repoRoot, commit, "web/pnpm-lock.yaml", runCommand);
  const serverDockerfile = gitShow(
    repoRoot,
    commit,
    "server/Dockerfile",
    runCommand,
  );
  const components = [
    ...parseGoComponents(goSum),
    ...parsePnpmComponents(pnpmLock),
    // Formal Web and Server artifacts now share this one committed graph.
    // Do not report bases from the independent development Web Dockerfile.
    ...parseContainerComponents(serverDockerfile),
  ].sort((left, right) => left["bom-ref"].localeCompare(right["bom-ref"]));
  if (components.length === 0) {
    throw new ReleaseArtifactError("dependency SBOM is empty");
  }
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: `urn:uuid:${uuidFromCommit(commit)}`,
    version: 1,
    metadata: {
      timestamp: createdAt,
      tools: {
        components: [
          {
            type: "application",
            name: "plush-release-artifact-bundle",
            version: "1",
          },
        ],
      },
      component: {
        type: "application",
        name: "plush-toy-erp",
        version: commit,
        properties: [
          { name: "customer", value: customer },
          { name: "migration.latest", value: migrationLatest },
        ],
      },
    },
    components,
  };
}

function inspectImage(imageRef, repoRoot, runCommand) {
  const raw = runCommand({
    command: "docker",
    args: ["image", "inspect", imageRef],
    cwd: repoRoot,
    label: `inspect image ${imageRef}`,
  });
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new ReleaseArtifactError(`image inspect was not unique: ${imageRef}`);
  }
  return parsed[0];
}

function scanImageMetadata(image) {
  const environment = Array.isArray(image?.Config?.Env) ? image.Config.Env : [];
  const sensitiveKeys = [];
  for (const entry of environment) {
    const separator = entry.indexOf("=");
    const key = separator >= 0 ? entry.slice(0, separator) : entry;
    const value = separator >= 0 ? entry.slice(separator + 1) : "";
    if (SENSITIVE_ENV_KEY_PATTERN.test(key) && value.trim()) {
      sensitiveKeys.push(key);
    }
    if (CREDENTIAL_URL_PATTERN.test(value)) {
      sensitiveKeys.push(`${key}:credential-url`);
    }
  }
  const labels = image?.Config?.Labels || {};
  if (CREDENTIAL_URL_PATTERN.test(JSON.stringify(labels))) {
    sensitiveKeys.push("labels:credential-url");
  }
  if (sensitiveKeys.length > 0) {
    throw new ReleaseArtifactError(
      "image metadata secret scan found populated sensitive values",
      { sensitiveKeys: [...new Set(sensitiveKeys)].sort() },
    );
  }
  return {
    passed: true,
    scannedEnvironmentEntries: environment.length,
    scannedLabelEntries: Object.keys(labels).length,
    populatedSensitiveValues: 0,
  };
}

function assertReleaseImage(image, imageRef, commit) {
  if (
    !IMAGE_ID_PATTERN.test(String(image?.Id || "")) ||
    image?.Os !== "linux" ||
    image?.Architecture !== "amd64"
  ) {
    throw new ReleaseArtifactError(
      `release image identity/platform is invalid: ${imageRef}`,
    );
  }
  const gitSha = (image?.Config?.Env || [])
    .find((entry) => entry.startsWith("GIT_SHA="))
    ?.slice("GIT_SHA=".length);
  if (gitSha !== commit) {
    throw new ReleaseArtifactError(
      `release image GIT_SHA does not match commit: ${imageRef}`,
    );
  }
}

async function imageArtifact({
  kind,
  sourceRef,
  fixedRef,
  commit,
  repoRoot,
  outputDir,
  runCommand,
  streamArchive,
}) {
  runCommand({
    command: "docker",
    args: ["image", "tag", sourceRef, fixedRef],
    cwd: repoRoot,
    label: `tag immutable ${kind} image`,
  });
  const image = inspectImage(fixedRef, repoRoot, runCommand);
  assertReleaseImage(image, fixedRef, commit);
  const metadataSecretScan = scanImageMetadata(image);
  const tarFile = `${kind}-image.tar`;
  const tarPath = path.join(outputDir, tarFile);
  const { saveDurationMs, compressionDurationMs, uncompressedSizeBytes } =
    await streamArchive({ fixedRef, tarPath, repoRoot });
  return {
    kind,
    ref: fixedRef,
    contentId: image.Id,
    platform: `${image.Os}/${image.Architecture}`,
    gitSha: commit,
    sizeBytes: Number(image.Size || 0),
    archive: {
      file: tarFile,
      sizeBytes: statSync(tarPath).size,
      sha256: sha256File(tarPath),
      saveDurationMs,
      compression: IMAGE_ARCHIVE_COMPRESSION,
      compressionLevel: IMAGE_ARCHIVE_COMPRESSION_LEVEL,
      compressionDurationMs,
      uncompressedSizeBytes,
    },
    metadataSecretScan,
  };
}

function toolVersion(command, args, repoRoot, runCommand) {
  return runCommand({
    command,
    args,
    cwd: repoRoot,
    label: `read ${command} version`,
  })
    .split(/\r?\n/u)[0]
    .trim();
}

function declaredGoToolchain(repoRoot, commit, runCommand) {
  const source = gitShow(repoRoot, commit, "server/go.mod", runCommand);
  const version = source.match(/^toolchain go([^\s]+)$/mu)?.[1];
  if (!version) {
    throw new ReleaseArtifactError("committed Go toolchain is missing");
  }
  return `go${version}`;
}

export function assertReleaseArtifactManifest(manifest) {
  const buildPerformance = manifest?.performance?.build;
  const optionalBuildPerformance =
    buildPerformance === undefined ||
    (buildPerformance?.schemaVersion === "plush.release-build-performance/v1" &&
      Number.isSafeInteger(buildPerformance.durationMs) &&
      buildPerformance.durationMs >= 0 &&
      ["builder", "gha"].includes(buildPerformance.cacheMode) &&
      Number.isSafeInteger(buildPerformance.completedVertexCount) &&
      buildPerformance.completedVertexCount >= 0 &&
      Number.isSafeInteger(buildPerformance.cacheHitCount) &&
      buildPerformance.cacheHitCount >= 0 &&
      Number.isSafeInteger(buildPerformance.cacheMissCount) &&
      buildPerformance.cacheMissCount >= 0 &&
      buildPerformance.cacheHitCount + buildPerformance.cacheMissCount ===
        buildPerformance.completedVertexCount &&
      Number.isSafeInteger(buildPerformance.cacheHitRateBasisPoints) &&
      buildPerformance.cacheHitRateBasisPoints >= 0 &&
      buildPerformance.cacheHitRateBasisPoints <= 10_000);
  if (
    manifest?.schemaVersion !== SCHEMA_VERSION ||
    manifest?.passed !== true ||
    !COMMIT_PATTERN.test(String(manifest?.git?.commit || "")) ||
    manifest?.git?.commit !== manifest?.git?.head ||
    manifest?.git?.worktreeClean !== true ||
    manifest?.sourceArchive?.secretScan !== "passed" ||
    !SHA256_PATTERN.test(String(manifest?.sourceArchive?.sha256 || "")) ||
    !MIGRATION_VERSION_PATTERN.test(
      String(manifest?.migration?.latest || ""),
    ) ||
    !SHA256_PATTERN.test(String(manifest?.migration?.sequenceSha256 || "")) ||
    !SHA256_PATTERN.test(
      String(manifest?.customerConfig?.sourceSha256 || ""),
    ) ||
    !SHA256_PATTERN.test(String(manifest?.sbom?.sha256 || "")) ||
    !Array.isArray(manifest?.images) ||
    manifest.images.length !== 2 ||
    !optionalBuildPerformance
  ) {
    throw new ReleaseArtifactError("release artifact manifest is invalid");
  }
  for (const image of manifest.images) {
    assertPlainRelativeFile(image?.archive?.file, "image archive file");
    const compression = image?.archive?.compression;
    const compressionEvidenceValid =
      compression === undefined
        ? image?.archive?.compressionLevel === undefined &&
          image?.archive?.compressionDurationMs === undefined &&
          image?.archive?.uncompressedSizeBytes === undefined
        : compression === IMAGE_ARCHIVE_COMPRESSION &&
          image?.archive?.compressionLevel ===
            IMAGE_ARCHIVE_COMPRESSION_LEVEL &&
          Number.isSafeInteger(image?.archive?.compressionDurationMs) &&
          image.archive.compressionDurationMs >= 0 &&
          Number.isSafeInteger(image?.archive?.uncompressedSizeBytes) &&
          image.archive.uncompressedSizeBytes > 0;
    if (
      !["server", "web"].includes(image?.kind) ||
      !IMAGE_ID_PATTERN.test(String(image?.contentId || "")) ||
      image?.gitSha !== manifest.git.commit ||
      image?.platform !== "linux/amd64" ||
      !SHA256_PATTERN.test(String(image?.archive?.sha256 || "")) ||
      !Number.isSafeInteger(image?.archive?.sizeBytes) ||
      image.archive.sizeBytes <= 0 ||
      (image?.archive?.saveDurationMs !== undefined &&
        (!Number.isSafeInteger(image.archive.saveDurationMs) ||
          image.archive.saveDurationMs < 0)) ||
      !compressionEvidenceValid ||
      image?.metadataSecretScan?.passed !== true
    ) {
      throw new ReleaseArtifactError(
        `release artifact image entry is invalid: ${image?.kind || "unknown"}`,
      );
    }
  }
  if (new Set(manifest.images.map((item) => item.kind)).size !== 2) {
    throw new ReleaseArtifactError(
      "release artifact must contain one server and one web image",
    );
  }
  return manifest;
}

export async function buildReleaseArtifact(options = {}, runtime = {}) {
  const repoRoot = realpathSync(runtime.repoRoot || process.cwd());
  const customer = options.customer || DEFAULT_CUSTOMER;
  if (!CUSTOMER_KEY_PATTERN.test(customer)) {
    throw new ReleaseArtifactError("customer key is invalid");
  }
  const sourceReport = await (
    runtime.runSourceArchiveReleaseCheck || runSourceArchiveReleaseCheck
  )(
    {
      customer,
      ref: options.ref || "HEAD",
      mode: "release",
      docker: true,
    },
    { repoRoot },
  );
  const commit = sourceReport.commit;
  if (
    sourceReport.formalEvidenceEligible !== true ||
    sourceReport.releaseCheckPassed !== true ||
    sourceReport.dockerBuilt !== true ||
    !COMMIT_PATTERN.test(commit)
  ) {
    throw new ReleaseArtifactError(
      "source archive release check did not produce eligible Docker evidence",
    );
  }
  const finalDir = resolveReleaseOutput(repoRoot, options.out, commit);
  if (existsSync(finalDir)) {
    throw new ReleaseArtifactError(
      `release output already exists: ${path.relative(repoRoot, finalDir)}`,
    );
  }
  mkdirSync(path.dirname(finalDir), { recursive: true, mode: 0o700 });
  const temporaryDir = `${finalDir}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
  mkdirSync(temporaryDir, { mode: 0o700 });
  const runCommand = runtime.runCommand || runArtifactCommand;
  const streamArchive = runtime.streamImageArchive || streamImageArchive;
  try {
    const createdAt = new Date().toISOString();
    const migration = buildMigrationEvidence({
      repoRoot,
      commit,
      runCommand,
    });
    const customerConfig = buildCustomerConfigEvidence({
      repoRoot,
      commit,
      customer,
      runCommand,
    });
    const sbom = buildDependencySbom({
      repoRoot,
      commit,
      customer,
      migrationLatest: migration.latest,
      createdAt,
      runCommand,
    });
    const sbomFile = "sbom.cdx.json";
    const sbomPath = path.join(temporaryDir, sbomFile);
    writeJSON(sbomPath, sbom);

    const sourceWeb = sourceReport.dockerImages.find((item) =>
      item.startsWith("plush-source-archive-web:"),
    );
    const sourceServer = sourceReport.dockerImages.find((item) =>
      item.startsWith("plush-source-archive-server:"),
    );
    if (!sourceWeb || !sourceServer) {
      throw new ReleaseArtifactError(
        "source archive release images are incomplete",
      );
    }
    const fixedSuffix = `${customer}-${commit}`;
    const images = [
      await imageArtifact({
        kind: "server",
        sourceRef: sourceServer,
        fixedRef: `plush-toy-erp-server:${fixedSuffix}`,
        commit,
        repoRoot,
        outputDir: temporaryDir,
        runCommand,
        streamArchive,
      }),
      await imageArtifact({
        kind: "web",
        sourceRef: sourceWeb,
        fixedRef: `plush-toy-erp-web:${fixedSuffix}`,
        commit,
        repoRoot,
        outputDir: temporaryDir,
        runCommand,
        streamArchive,
      }),
    ];
    const manifest = assertReleaseArtifactManifest({
      schemaVersion: SCHEMA_VERSION,
      passed: true,
      createdAt,
      customer,
      git: {
        commit,
        head: sourceReport.head,
        ref: sourceReport.ref,
        refIsHead: sourceReport.refIsHead,
        worktreeClean: sourceReport.worktreeClean,
      },
      sourceArchive: {
        sha256: normalizeSha256(
          sourceReport.archiveSha256,
          "source archive sha256",
        ),
        secretScan: "passed",
        inventoryFileCount: sourceReport.inventory.fileCount,
        customerBoundaryPassed:
          sourceReport.repositoryBoundary?.passed === true,
      },
      toolchain: {
        node: process.version,
        docker: toolVersion(
          "docker",
          ["version", "--format", "{{.Client.Version}}"],
          repoRoot,
          runCommand,
        ),
        dockerBuildx: toolVersion(
          "docker",
          ["buildx", "version"],
          repoRoot,
          runCommand,
        ),
        zstd: toolVersion("zstd", ["--version"], repoRoot, runCommand),
        go: declaredGoToolchain(repoRoot, commit, runCommand),
        declaredPnpm: JSON.parse(
          gitShow(repoRoot, commit, "web/package.json", runCommand),
        ).packageManager,
      },
      migration,
      customerConfig,
      ...(sourceReport.buildPerformance
        ? { performance: { build: sourceReport.buildPerformance } }
        : {}),
      sbom: {
        format: "CycloneDX",
        specVersion: sbom.specVersion,
        file: sbomFile,
        componentCount: sbom.components.length,
        sizeBytes: statSync(sbomPath).size,
        sha256: sha256File(sbomPath),
      },
      images,
      rollback: {
        artifactSelfContained: true,
        targetRollbackPointRequiredBeforePromotion: true,
        targetRollbackPoint: null,
      },
      redaction: {
        containsSecrets: false,
        containsCredentials: false,
        containsFullDsn: false,
        containsAbsoluteWorkspacePaths: false,
        containsRawCustomerRows: false,
      },
      notProven: [
        "remote exact-SHA CI terminal status",
        "target active customer-config revision",
        "target deployment, migration, smoke, rollback, UAT, or sign-off",
      ],
    });
    const manifestFile = "release-artifact.json";
    writeJSON(path.join(temporaryDir, manifestFile), manifest);
    const checksumLines = [
      `${sha256File(path.join(temporaryDir, manifestFile))}  ${manifestFile}`,
      `${manifest.sbom.sha256}  ${manifest.sbom.file}`,
      ...manifest.images.map(
        (item) => `${item.archive.sha256}  ${item.archive.file}`,
      ),
      "",
    ];
    writeFileSync(
      path.join(temporaryDir, "checksums.sha256"),
      checksumLines.join("\n"),
      { mode: 0o600 },
    );
    renameSync(temporaryDir, finalDir);
    return {
      ...manifest,
      outputDirectory: path.relative(repoRoot, finalDir),
      manifestPath: path.relative(repoRoot, path.join(finalDir, manifestFile)),
    };
  } catch (error) {
    rmSync(temporaryDir, { recursive: true, force: true });
    throw error;
  }
}

export function parseReleaseArtifactArgs(argv) {
  const options = {
    customer: DEFAULT_CUSTOMER,
    ref: "HEAD",
    execute: false,
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--execute") {
      options.execute = true;
      continue;
    }
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (["--customer", "--ref", "--out"].includes(token)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new ReleaseArtifactError(`missing value for ${token}`);
      }
      options[token.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new ReleaseArtifactError(`unsupported argument: ${token}`);
  }
  return options;
}

const USAGE = `Immutable release artifact bundle

Usage:
  node scripts/deploy/release-artifact-bundle.mjs --execute [--ref HEAD] [--customer yoyoosun] [--out output/releases/<sha>] [--json]

The command requires a clean current HEAD. It builds linux/amd64 images only from
the committed git archive, embeds the exact 40-character SHA, records image content
IDs, saves zstd level-3 loadable image archives, writes a CycloneDX dependency SBOM,
migration sequence and customer-config source fingerprints, and fails on populated
sensitive image metadata. It does not push images, contact 133, deploy, migrate a
target, or prove remote CI/UAT. Existing output directories are never overwritten.`;

function isMainModule() {
  try {
    return (
      realpathSync(fileURLToPath(import.meta.url)) ===
      realpathSync(process.argv[1])
    );
  } catch {
    return false;
  }
}

if (isMainModule()) {
  try {
    const options = parseReleaseArtifactArgs(process.argv.slice(2));
    if (options.help) {
      console.log(USAGE);
      process.exit(0);
    }
    if (!options.execute) {
      throw new ReleaseArtifactError(
        "artifact build requires explicit --execute",
      );
    }
    const report = await buildReleaseArtifact(options);
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(
        `release artifact passed commit=${report.git.commit} output=${report.outputDirectory}`,
      );
      for (const image of report.images) {
        console.log(
          `${image.kind}: ref=${image.ref} contentId=${image.contentId} archiveSha256=${image.archive.sha256}`,
        );
      }
    }
  } catch (error) {
    const details =
      error?.details && Object.keys(error.details).length > 0
        ? ` ${JSON.stringify(error.details)}`
        : "";
    console.error(`[release-artifact] ${error.message}${details}`);
    process.exit(1);
  }
}
