import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

import { getDeploymentTarget } from "./deployment-targets.mjs";
import { validateReleaseManifest } from "./release-catalog.mjs";

export const TARGET_INITIALIZATION_MANIFEST_CONTRACT =
  "plush.target-initialization-manifest/v1";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const BLOCKER_PATTERN = /^[a-z][a-z0-9_]{2,63}$/u;
const VERSION_PATTERN = /^[0-9A-Za-z](?:[0-9A-Za-z._-]{0,62}[0-9A-Za-z])?$/u;

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

function fingerprint(value) {
  const copy = structuredClone(value);
  delete copy.fingerprint;
  return createHash("sha256")
    .update(JSON.stringify(stableValue(copy)))
    .digest("hex");
}

export function validateTargetInitializationManifest(manifest) {
  const target = getDeploymentTarget(manifest?.target?.key);
  if (
    manifest?.schemaVersion !== TARGET_INITIALIZATION_MANIFEST_CONTRACT ||
    manifest?.mode !== "initialize" ||
    !["eligible", "blocked"].includes(manifest?.status) ||
    !UUID_V4_PATTERN.test(String(manifest?.operationId || "")) ||
    !Number.isFinite(Date.parse(String(manifest?.createdAt || ""))) ||
    manifest?.target?.purpose !== target.purpose ||
    manifest?.target?.customer !== target.customer ||
    manifest?.target?.trialTarget !== target.trialTarget ||
    !["absent", "present"].includes(manifest?.before?.targetState) ||
    !["none", "unknown"].includes(manifest?.before?.runtimeSha) ||
    !["none", "unknown"].includes(manifest?.before?.backupState) ||
    !Number.isSafeInteger(manifest?.before?.availableBytes) ||
    manifest.before.availableBytes < 0 ||
    manifest?.before?.minimumAvailableBytes !== 30 * 1024 ** 3 ||
    !VERSION_PATTERN.test(String(manifest?.release?.version || "")) ||
    !/^[0-9a-f]{40}$/u.test(String(manifest?.release?.gitSha || "")) ||
    !SHA256_PATTERN.test(String(manifest?.release?.manifestSha256 || "")) ||
    !SHA256_PATTERN.test(
      String(manifest?.release?.artifactManifestSha256 || ""),
    ) ||
    !SHA256_PATTERN.test(
      String(manifest?.release?.rehearsalReceiptSha256 || ""),
    ) ||
    manifest?.release?.rehearsalReceiptFile !== "release-rehearsal.json" ||
    !SHA256_PATTERN.test(
      String(manifest?.release?.sourceArchiveSha256 || ""),
    ) ||
    !SHA256_PATTERN.test(String(manifest?.release?.strictFingerprint || "")) ||
    manifest?.release?.strictStatus !== "passed" ||
    manifest?.release?.rehearsalStatus !== "passed" ||
    !Array.isArray(manifest?.release?.images) ||
    manifest.release.images.length !== 2 ||
    !Array.isArray(manifest?.blockers) ||
    manifest.blockers.some((code) => !BLOCKER_PATTERN.test(code)) ||
    new Set(manifest.blockers).size !== manifest.blockers.length ||
    !Array.isArray(manifest?.steps) ||
    manifest.steps.length !== 9 ||
    manifest?.rollback?.removeOnlyCreatedTarget !== true ||
    manifest?.rollback?.preserveOtherTargets !== true ||
    manifest?.rollback?.preserveExternalCustomerData !== true ||
    manifest?.rollback?.databaseDownMigrationAutomatic !== false ||
    manifest?.redaction?.containsSecrets !== false ||
    manifest?.redaction?.containsCredentials !== false ||
    manifest?.redaction?.containsSshTarget !== false ||
    manifest?.redaction?.containsAbsolutePaths !== false ||
    manifest?.redaction?.containsRawEnvironmentValues !== false ||
    manifest?.redaction?.containsRawLogs !== false ||
    !Array.isArray(manifest?.notProven) ||
    manifest.notProven.length !== 2 ||
    !SHA256_PATTERN.test(String(manifest?.fingerprint || "")) ||
    manifest.fingerprint !== fingerprint(manifest)
  ) {
    throw new Error("target initialization manifest contract is invalid");
  }
  const kinds = new Set();
  for (const image of manifest.release.images) {
    if (
      !["server", "web"].includes(image?.kind) ||
      kinds.has(image.kind) ||
      !/^sha256:[0-9a-f]{64}$/u.test(String(image?.registryDigest || "")) ||
      !/^sha256:[0-9a-f]{64}$/u.test(String(image?.sourceContentId || "")) ||
      image?.platform !== "linux/amd64"
    ) {
      throw new Error("target initialization image identity is invalid");
    }
    kinds.add(image.kind);
  }
  if (
    (manifest.status === "eligible" &&
      (manifest.blockers.length !== 0 ||
        manifest.before.targetState !== "absent" ||
        manifest.before.runtimeSha !== "none" ||
        manifest.before.backupState !== "none")) ||
    (manifest.status === "blocked" && manifest.blockers.length === 0)
  ) {
    throw new Error("target initialization manifest status is invalid");
  }
  return manifest;
}

export function buildTargetInitializationManifest({
  operationId,
  releaseManifest,
  releaseManifestSha256,
  initializationPreflight,
  createdAt = new Date().toISOString(),
}) {
  const release = validateReleaseManifest(releaseManifest);
  if (
    !UUID_V4_PATTERN.test(String(operationId || "")) ||
    !SHA256_PATTERN.test(String(releaseManifestSha256 || "")) ||
    release.schemaVersion !== "plush.release-manifest/v2" ||
    release.rehearsal?.status !== "passed" ||
    release.rehearsal?.cleanup?.residualContainers !== 0 ||
    initializationPreflight?.schemaVersion !==
      "plush.target-initialization-preflight/v1" ||
    !["eligible", "blocked"].includes(initializationPreflight?.status) ||
    !["absent", "present"].includes(
      initializationPreflight?.remote?.rootState,
    ) ||
    !Array.isArray(initializationPreflight?.blockers) ||
    (initializationPreflight.status === "eligible" &&
      (initializationPreflight.remote.rootState !== "absent" ||
        initializationPreflight.blockers.length !== 0))
  ) {
    throw new Error("target initialization inputs are invalid");
  }
  const target = getDeploymentTarget(initializationPreflight.target);
  const manifest = {
    schemaVersion: TARGET_INITIALIZATION_MANIFEST_CONTRACT,
    mode: "initialize",
    status: initializationPreflight.status,
    operationId,
    createdAt,
    target: {
      key: target.key,
      purpose: target.purpose,
      customer: target.customer,
      trialTarget: target.trialTarget,
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
      targetState: initializationPreflight.remote.rootState,
      runtimeSha:
        initializationPreflight.remote.rootState === "absent"
          ? "none"
          : "unknown",
      backupState:
        initializationPreflight.remote.rootState === "absent"
          ? "none"
          : "unknown",
      availableBytes: initializationPreflight.remote.capacity.availableBytes,
      minimumAvailableBytes:
        initializationPreflight.remote.capacity.minimumAvailableBytes,
    },
    blockers: [...initializationPreflight.blockers].sort(),
    steps: [
      "revalidate pristine target identity, ports, tooling and base images",
      "verify and materialize the immutable seven-asset release",
      "create independent runtime secrets, database storage and migration lock",
      "start only target PostgreSQL and Jaeger, then apply the fixed migration",
      "bootstrap one target-specific administrator without steady secret injection",
      "start the target services and read back exact release identity",
      "create the target public entry and run bounded health, ready and smoke",
      "create and restore-check the first target rollback point",
      "write an atomic redacted receipt or remove only the created target",
    ],
    rollback: {
      removeOnlyCreatedTarget: true,
      preserveOtherTargets: true,
      preserveExternalCustomerData: true,
      databaseDownMigrationAutomatic: false,
    },
    notProven: [
      "demo seed or customer-test business acceptance data",
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
  manifest.fingerprint = fingerprint(manifest);
  return validateTargetInitializationManifest(manifest);
}

export function isTargetInitializationManifest(value) {
  return value?.schemaVersion === TARGET_INITIALIZATION_MANIFEST_CONTRACT;
}

export function writeTargetInitializationManifest(file, manifest) {
  validateTargetInitializationManifest(manifest);
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  if (existsSync(file)) {
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(
        "target initialization manifest output is not a plain file",
      );
    }
    const existing = validateTargetInitializationManifest(
      JSON.parse(readFileSync(file, "utf8")),
    );
    if (
      JSON.stringify(stableValue(existing)) !==
      JSON.stringify(stableValue(manifest))
    ) {
      throw new Error(
        "target initialization manifest already exists with different content",
      );
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
