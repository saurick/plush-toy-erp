import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { validateReleaseManifest } from "./release-catalog.mjs";

export const PROMOTION_MANIFEST_CONTRACT = "plush.promotion-manifest/v1";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const BLOCKER_PATTERN = /^[a-z][a-z0-9_]{2,63}$/u;

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function manifestFingerprint(manifest) {
  const copy = structuredClone(manifest);
  delete copy.fingerprint;
  return createHash("sha256")
    .update(stableStringify(copy))
    .digest("hex");
}

export function validatePromotionManifest(manifest) {
  if (
    manifest?.schemaVersion !== PROMOTION_MANIFEST_CONTRACT ||
    !["eligible", "blocked", "already_current"].includes(manifest?.status) ||
    !UUID_V4_PATTERN.test(String(manifest?.operationId || "")) ||
    manifest?.target?.key !== "test-133" ||
    manifest?.target?.purpose !== "customer-trial" ||
    manifest?.target?.customer !== "yoyoosun" ||
    manifest?.target?.trialTarget !== "customer-trial-133" ||
    !SHA_PATTERN.test(String(manifest?.release?.gitSha || "")) ||
    !SHA256_PATTERN.test(String(manifest?.release?.manifestSha256 || "")) ||
    !SHA256_PATTERN.test(String(manifest?.release?.artifactManifestSha256 || "")) ||
    manifest?.release?.strictStatus !== "passed" ||
    manifest?.release?.rehearsalStatus !== "passed" ||
    manifest?.release?.rehearsalReceiptFile !== "release-rehearsal.json" ||
    !SHA256_PATTERN.test(
      String(manifest?.release?.rehearsalReceiptSha256 || ""),
    ) ||
    !Array.isArray(manifest?.release?.images) ||
    manifest.release.images.length !== 2 ||
    !Array.isArray(manifest?.blockers) ||
    manifest.blockers.some((item) => !BLOCKER_PATTERN.test(item)) ||
    new Set(manifest.blockers).size !== manifest.blockers.length ||
    !Array.isArray(manifest?.steps) ||
    manifest.steps.length === 0 ||
    !SHA256_PATTERN.test(String(manifest?.fingerprint || ""))
  ) {
    throw new Error("promotion manifest contract is invalid");
  }
  const imageKinds = new Set();
  for (const image of manifest.release.images) {
    if (
      !["server", "web"].includes(image?.kind) ||
      imageKinds.has(image.kind) ||
      !/^sha256:[0-9a-f]{64}$/u.test(String(image?.registryDigest || "")) ||
      !/^sha256:[0-9a-f]{64}$/u.test(String(image?.sourceContentId || ""))
    ) {
      throw new Error("promotion manifest image identity is invalid");
    }
    imageKinds.add(image.kind);
  }
  if (
    manifest.status === "blocked" !== (manifest.blockers.length > 0) ||
    (manifest.status === "already_current" &&
      manifest.before?.runtimeSha !== manifest.release.gitSha) ||
    manifest.rollback?.automaticDatabaseDownMigration !== false ||
    manifest.rollback?.freshPreMigrationBackupRequired !== true ||
    manifest.redaction?.containsSecrets !== false ||
    manifest.redaction?.containsCredentials !== false ||
    manifest.redaction?.containsSshTarget !== false ||
    manifest.redaction?.containsAbsolutePaths !== false ||
    manifest.fingerprint !== manifestFingerprint(manifest)
  ) {
    throw new Error("promotion manifest status/rollback/redaction is invalid");
  }
  return manifest;
}

export function buildPromotionManifest({
  operationId,
  releaseManifest,
  releaseManifestSha256,
  targetPreflight,
  createdAt = new Date().toISOString(),
}) {
  const release = validateReleaseManifest(releaseManifest);
  if (
    !UUID_V4_PATTERN.test(String(operationId || "")) ||
    !SHA256_PATTERN.test(String(releaseManifestSha256 || ""))
  ) {
    throw new Error("promotion identity is invalid");
  }
  if (
    release.schemaVersion !== "plush.release-manifest/v2" ||
    release.rehearsal?.status !== "passed" ||
    release.rehearsal?.cleanup?.residualContainers !== 0
  ) {
    throw new Error("promotion requires a release v2 rehearsal receipt");
  }
  if (
    targetPreflight?.schemaVersion !== "plush.target-preflight/v1" ||
    targetPreflight?.target !== "test-133" ||
    targetPreflight?.customer !== "yoyoosun" ||
    !["passed", "blocked"].includes(targetPreflight?.status)
  ) {
    throw new Error("fixed target preflight is required");
  }
  const runtimeSha = targetPreflight.remote?.runtime?.serverSha || "unknown";
  const blockers = [...new Set(targetPreflight.blockers || [])].sort();
  const status =
    blockers.length > 0
      ? "blocked"
      : runtimeSha === release.gitSha
        ? "already_current"
        : "eligible";
  const manifest = {
    schemaVersion: PROMOTION_MANIFEST_CONTRACT,
    status,
    operationId,
    createdAt,
    target: {
      key: "test-133",
      purpose: "customer-trial",
      customer: "yoyoosun",
      trialTarget: "customer-trial-133",
    },
    release: {
      version: release.version,
      gitSha: release.gitSha,
      manifestSha256: releaseManifestSha256,
      artifactManifestSha256: release.artifact.manifestSha256,
      sourceArchiveSha256: release.artifact.sourceArchiveSha256,
      strictFingerprint: release.strict.fingerprint,
      strictStatus: release.strict.status,
      rehearsalReceiptSha256: release.rehearsal.receiptSha256,
      rehearsalReceiptFile: "release-rehearsal.json",
      rehearsalStatus: release.rehearsal.status,
      migration: release.migration,
      customerConfig: release.customerConfig,
      images: release.images.map((image) => ({
        kind: image.kind,
        registryDigest: image.digest,
        sourceContentId: image.sourceContentId,
        platform: image.platform,
      })),
    },
    before: {
      runtimeSha,
      serverHealth: targetPreflight.remote.runtime.serverHealth,
      serverReady: targetPreflight.remote.runtime.serverReady,
      webHealth: targetPreflight.remote.runtime.webHealth,
      availableBytes: targetPreflight.remote.capacity.availableBytes,
      minimumAvailableBytes:
        targetPreflight.remote.capacity.minimumAvailableBytes,
      latestBackupSha256: targetPreflight.remote.backup.latestSha256,
      latestBackupSizeBytes: targetPreflight.remote.backup.latestSizeBytes,
      latestBackupIsRollbackPointForThisOperation: false,
    },
    blockers,
    steps: [
      "verify immutable release and source/image checksums",
      "create and restore-check a fresh pre-migration backup",
      "load images and read back content IDs plus embedded GIT_SHA",
      "run migration status, audit and dry-run",
      "stop only test-133 application services and apply migration under lock",
      "start by fixed Compose identity and verify runtime release",
      "run health, ready and target smoke",
      "write an atomic redacted receipt and preserve the rollback point",
    ],
    rollback: {
      freshPreMigrationBackupRequired: true,
      previousReleaseManifestRequired: true,
      automaticDatabaseDownMigration: false,
      schemaIncompatibleAction: "forward_fix_or_verified_backup_restore",
    },
    notProven:
      status === "already_current"
        ? [
            "this operation did not create a new backup or replay migration",
            "customer UAT and sign-off",
          ]
        : [
            "fresh pre-migration backup and restore check",
            "target migration plan/apply/readback",
            "target release identity and smoke",
            "rollback rehearsal",
            "customer UAT and sign-off",
          ],
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsSshTarget: false,
      containsAbsolutePaths: false,
      containsRawEnvironmentValues: false,
      containsRawLogs: false,
    },
  };
  manifest.fingerprint = manifestFingerprint(manifest);
  return validatePromotionManifest(manifest);
}

export function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

export function writePromotionManifest(file, manifest) {
  validatePromotionManifest(manifest);
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  if (existsSync(file)) {
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error("promotion manifest output is not a plain file");
    }
    const existing = validatePromotionManifest(
      JSON.parse(readFileSync(file, "utf8")),
    );
    if (stableStringify(existing) !== stableStringify(manifest)) {
      throw new Error("promotion manifest already exists with different content");
    }
    return { path: file, reused: true };
  }
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, file);
    const directory = openSync(path.dirname(file), "r");
    fsyncSync(directory);
    closeSync(directory);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  return { path: file, reused: false };
}

function parseArgs(argv) {
  const options = { manifest: "", json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--manifest") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--manifest requires a value");
      }
      options.manifest = value;
      index += 1;
      continue;
    }
    throw new Error(`unsupported argument: ${token}`);
  }
  if (!options.help && !options.manifest) {
    throw new Error("--manifest is required");
  }
  return options;
}

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
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(`Usage:
  node scripts/deploy/promotion-manifest.mjs --manifest <promotion.json> [--json]

Validates a provider-neutral, redacted promotion plan. It does not contact or
change a deployment target.`);
      process.exit(0);
    }
    const manifest = validatePromotionManifest(
      JSON.parse(readFileSync(options.manifest, "utf8")),
    );
    console.log(
      options.json
        ? JSON.stringify(manifest, null, 2)
        : `promotion manifest ${manifest.status}: ${manifest.release.gitSha}`,
    );
  } catch (error) {
    console.error(`[promotion-manifest] ${error.message}`);
    process.exit(1);
  }
}
