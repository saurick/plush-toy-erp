import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

import { validateReleaseManifest } from "./release-catalog.mjs";
import { validateGitAncestryRelation } from "./git-ancestry-relation.mjs";
import { getDeploymentTarget } from "./deployment-targets.mjs";
import { readBoundedPlainFile } from "../lib/file-digest.mjs";

export const ROLLBACK_MANIFEST_CONTRACT = "plush.rollback-manifest/v1";

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

function fingerprint(manifest) {
  const copy = structuredClone(manifest);
  delete copy.fingerprint;
  return createHash("sha256")
    .update(JSON.stringify(stableValue(copy)))
    .digest("hex");
}

function releaseIdentity(manifest, manifestSha256) {
  const release = validateReleaseManifest(manifest);
  if (!SHA256_PATTERN.test(String(manifestSha256 || ""))) {
    throw new Error("rollback release manifest SHA-256 is invalid");
  }
  return {
    schemaVersion: release.schemaVersion,
    gitSha: release.gitSha,
    version: release.version,
    manifestSha256,
    migration: {
      latest: release.migration.latest,
      sequenceSha256: release.migration.sequenceSha256,
    },
    customerConfig: {
      sourceSha256: release.customerConfig.sourceSha256,
    },
    images: release.images.map((image) => ({
      kind: image.kind,
      registryDigest: image.digest,
      sourceContentId: image.sourceContentId,
      platform: image.platform,
    })),
  };
}

export function validateRollbackManifest(manifest) {
  const ancestry = validateGitAncestryRelation(manifest?.ancestry);
  const target = getDeploymentTarget(manifest?.target?.key);
  if (
    manifest?.schemaVersion !== ROLLBACK_MANIFEST_CONTRACT ||
    !["eligible", "blocked", "already_current"].includes(manifest?.status) ||
    !UUID_V4_PATTERN.test(String(manifest?.operationId || "")) ||
    manifest?.target?.purpose !== target.purpose ||
    manifest?.target?.customer !== target.customer ||
    manifest?.target?.trialTarget !== target.trialTarget ||
    !SHA_PATTERN.test(String(manifest?.from?.gitSha || "")) ||
    !SHA_PATTERN.test(String(manifest?.to?.gitSha || "")) ||
    ancestry.currentGitSha !== manifest?.from?.gitSha ||
    ancestry.candidateGitSha !== manifest?.to?.gitSha ||
    !SHA256_PATTERN.test(String(manifest?.from?.manifestSha256 || "")) ||
    !SHA256_PATTERN.test(String(manifest?.to?.manifestSha256 || "")) ||
    !SHA256_PATTERN.test(String(manifest?.from?.migration?.sequenceSha256 || "")) ||
    !SHA256_PATTERN.test(String(manifest?.to?.migration?.sequenceSha256 || "")) ||
    !SHA256_PATTERN.test(
      String(manifest?.from?.customerConfig?.sourceSha256 || ""),
    ) ||
    !SHA256_PATTERN.test(
      String(manifest?.to?.customerConfig?.sourceSha256 || ""),
    ) ||
    !Array.isArray(manifest?.blockers) ||
    manifest.blockers.some((item) => !BLOCKER_PATTERN.test(item)) ||
    new Set(manifest.blockers).size !== manifest.blockers.length ||
    !Array.isArray(manifest?.steps) ||
    manifest.steps.length === 0 ||
    !SHA256_PATTERN.test(String(manifest?.fingerprint || ""))
  ) {
    throw new Error("rollback manifest contract is invalid");
  }
  for (const release of [manifest.from, manifest.to]) {
    if (
      ![
        "plush.release-manifest/v1",
        "plush.release-manifest/v2",
      ].includes(release.schemaVersion) ||
      !Array.isArray(release.images) ||
      release.images.length !== 2 ||
      new Set(release.images.map((image) => image.kind)).size !== 2 ||
      release.images.some(
        (image) =>
          !["server", "web"].includes(image.kind) ||
          !/^sha256:[0-9a-f]{64}$/u.test(image.registryDigest) ||
          !/^sha256:[0-9a-f]{64}$/u.test(image.sourceContentId) ||
          image.platform !== "linux/amd64",
      )
    ) {
      throw new Error("rollback image identity is invalid");
    }
  }
  if (
    !manifest.transport ||
    Object.keys(manifest.transport).sort().join(",") !==
      "mode,targetManifestSha256" ||
    ![
      "legacy_target_cache",
      "gitlab_internal_or_target_cache",
    ].includes(manifest.transport.mode) ||
    manifest.transport.targetManifestSha256 !==
      manifest.to.manifestSha256 ||
    (manifest.transport.mode === "legacy_target_cache") !==
      (manifest.to.schemaVersion === "plush.release-manifest/v1")
  ) {
    throw new Error("rollback transport identity is invalid");
  }
  if (
    (manifest.status === "blocked") !== (manifest.blockers.length > 0) ||
    (manifest.status === "eligible" &&
      (manifest.from.gitSha === manifest.to.gitSha ||
        ancestry.actionClass !== "rollback" ||
        manifest.from.migration.latest !== manifest.to.migration.latest ||
        manifest.from.migration.sequenceSha256 !==
          manifest.to.migration.sequenceSha256 ||
        manifest.from.customerConfig.sourceSha256 !==
          manifest.to.customerConfig.sourceSha256)) ||
    (manifest.status === "already_current" &&
      (manifest.from.gitSha !== manifest.to.gitSha ||
        ancestry.actionClass !== "current")) ||
    manifest.rollback?.mode !== "code_and_images_only" ||
    manifest.rollback?.automaticDatabaseDownMigration !== false ||
    manifest.rollback?.databaseRestoreAutomatic !== false ||
    manifest.redaction?.containsSecrets !== false ||
    manifest.redaction?.containsCredentials !== false ||
    manifest.redaction?.containsSshTarget !== false ||
    manifest.redaction?.containsAbsolutePaths !== false ||
    manifest.fingerprint !== fingerprint(manifest)
  ) {
    throw new Error("rollback status or safety boundary is invalid");
  }
  return manifest;
}

export function buildRollbackManifest({
  operationId,
  currentReleaseManifest,
  currentReleaseManifestSha256,
  targetReleaseManifest,
  targetReleaseManifestSha256,
  targetPreflight,
  ancestry,
  createdAt = new Date().toISOString(),
}) {
  if (!UUID_V4_PATTERN.test(String(operationId || ""))) {
    throw new Error("rollback operation identity is invalid");
  }
  const from = releaseIdentity(
    currentReleaseManifest,
    currentReleaseManifestSha256,
  );
  const to = releaseIdentity(
    targetReleaseManifest,
    targetReleaseManifestSha256,
  );
  const gitRelation = validateGitAncestryRelation(ancestry);
  if (
    gitRelation.currentGitSha !== from.gitSha ||
    gitRelation.candidateGitSha !== to.gitSha
  ) {
    throw new Error("rollback ancestry does not match the release pair");
  }
  if (
    targetPreflight?.schemaVersion !== "plush.target-preflight/v1" ||
    !targetPreflight?.target ||
    targetPreflight?.customer !== "yoyoosun"
  ) {
    throw new Error("fixed target preflight is required for rollback");
  }
  const target = getDeploymentTarget(targetPreflight.target);
  const blockers = new Set(targetPreflight.blockers || []);
  const runtimeSha = targetPreflight.remote?.runtime?.serverSha || "unknown";
  if (runtimeSha !== from.gitSha) {
    blockers.add("rollback_current_release_mismatch");
  }
  if (
    from.migration.latest !== to.migration.latest ||
    from.migration.sequenceSha256 !== to.migration.sequenceSha256
  ) {
    blockers.add("rollback_migration_incompatible");
  }
  if (
    from.customerConfig.sourceSha256 !== to.customerConfig.sourceSha256
  ) {
    blockers.add("rollback_customer_config_incompatible");
  }
  if (!["rollback", "current"].includes(gitRelation.actionClass)) {
    blockers.add("rollback_git_relation_not_behind");
  }
  const sortedBlockers = [...blockers].sort();
  const status =
    sortedBlockers.length > 0
      ? "blocked"
      : from.gitSha === to.gitSha
        ? "already_current"
        : "eligible";
  const manifest = {
    schemaVersion: ROLLBACK_MANIFEST_CONTRACT,
    status,
    operationId,
    createdAt,
    target: {
      key: target.key,
      purpose: target.purpose,
      customer: target.customer,
      trialTarget: target.trialTarget,
    },
    ancestry: gitRelation,
    from,
    to,
    transport: {
      mode:
        to.schemaVersion === "plush.release-manifest/v1"
          ? "legacy_target_cache"
          : "gitlab_internal_or_target_cache",
      targetManifestSha256: to.manifestSha256,
    },
    before: {
      runtimeSha,
      serverHealth: targetPreflight.remote.runtime.serverHealth,
      serverReady: targetPreflight.remote.runtime.serverReady,
      webHealth: targetPreflight.remote.runtime.webHealth,
      migrationLock: targetPreflight.remote.locks.migration,
    },
    blockers: sortedBlockers,
    steps: [
      "recheck fixed target identity, health and the current exact SHA",
      "verify both release manifests and equal migration/config fingerprints",
      "load the existing target release images and read back content IDs",
      "switch only APP_IMAGE, WEB_IMAGE and release source under one target lock",
      "start without build or pull and verify health, ready and exact SHA",
      "write an atomic redacted rollback receipt",
    ],
    rollback: {
      mode: "code_and_images_only",
      automaticDatabaseDownMigration: false,
      databaseRestoreAutomatic: false,
      incompatibleAction: "forward_fix_or_explicit_verified_backup_restore",
    },
    notProven: [
      "database backup restore rollback",
      "credentialed role matrix and PDF smoke",
      "customer UAT and sign-off",
    ],
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsSshTarget: false,
      containsAbsolutePaths: false,
      containsRawLogs: false,
    },
  };
  manifest.fingerprint = fingerprint(manifest);
  return validateRollbackManifest(manifest);
}

export function writeRollbackManifest(file, manifest) {
  validateRollbackManifest(manifest);
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  if (existsSync(file)) {
    let snapshot;
    try {
      snapshot = readBoundedPlainFile(file, {
        maximumBytes: 512 * 1024,
      });
    } catch (error) {
      throw new Error("rollback manifest output is not a bounded plain file", {
        cause: error,
      });
    }
    const existing = validateRollbackManifest(
      JSON.parse(snapshot.content.toString("utf8")),
    );
    if (
      JSON.stringify(stableValue(existing)) !==
      JSON.stringify(stableValue(manifest))
    ) {
      throw new Error("rollback manifest already exists with different content");
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
