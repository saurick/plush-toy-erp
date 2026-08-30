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

import { validateReleaseManifest } from "./release-catalog.mjs";
import { validateGitAncestryRelation } from "./git-ancestry-relation.mjs";
import { getDeploymentTarget } from "./deployment-targets.mjs";

export const DATABASE_REBUILD_MANIFEST_CONTRACT =
  "plush.database-rebuild-manifest/v1";

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

export function validateDatabaseRebuildManifest(manifest) {
  const ancestry = validateGitAncestryRelation(manifest?.ancestry);
  const target = getDeploymentTarget(manifest?.target?.key);
  if (
    manifest?.schemaVersion !== DATABASE_REBUILD_MANIFEST_CONTRACT ||
    !["eligible", "blocked"].includes(manifest?.status) ||
    !UUID_V4_PATTERN.test(String(manifest?.operationId || "")) ||
    manifest?.target?.purpose !== target.purpose ||
    manifest?.target?.customer !== "yoyoosun" ||
    manifest?.target?.trialTarget !== target.trialTarget ||
    manifest?.target?.database !== target.database.name ||
    manifest?.target?.dataDirectoryAlias !== `${target.key}-primary` ||
    !SHA_PATTERN.test(String(manifest?.release?.gitSha || "")) ||
    ancestry.currentGitSha !== manifest?.before?.runtimeSha ||
    ancestry.candidateGitSha !== manifest?.release?.gitSha ||
    !SHA256_PATTERN.test(String(manifest?.release?.manifestSha256 || "")) ||
    !SHA256_PATTERN.test(
      String(manifest?.release?.artifactManifestSha256 || ""),
    ) ||
    manifest?.release?.strictStatus !== "passed" ||
    !/^20[0-9]{12}$/u.test(String(manifest?.release?.migration?.latest || "")) ||
    !SHA256_PATTERN.test(
      String(manifest?.release?.migration?.sequenceSha256 || ""),
    ) ||
    !Array.isArray(manifest?.blockers) ||
    manifest.blockers.some((item) => !BLOCKER_PATTERN.test(item)) ||
    new Set(manifest.blockers).size !== manifest.blockers.length ||
    !Array.isArray(manifest?.steps) ||
    manifest.steps.length < 8 ||
    !SHA256_PATTERN.test(String(manifest?.fingerprint || ""))
  ) {
    throw new Error("database rebuild manifest contract is invalid");
  }
  if (
    manifest.status === "blocked" !== (manifest.blockers.length > 0) ||
    (manifest.status === "eligible" && ancestry.actionClass !== "current") ||
    manifest.rollback?.preservePreviousDataDirectory !== true ||
    manifest.rollback?.preserveFreshBackup !== true ||
    manifest.rollback?.automaticDataDeletion !== false ||
    manifest.rollback?.automaticDatabaseDownMigration !== false ||
    manifest.execution?.requiresExplicitConfirmation !== true ||
    manifest.execution?.sameLogicalDatabaseName !== true ||
    manifest.execution?.freshPhysicalDataDirectory !== true ||
    manifest.execution?.unknownOutcomeRetryAllowed !== false ||
    !/^rollback-[0-9a-f]{12}-[0-9a-f]{8}$/u.test(
      String(manifest?.execution?.preservedDataAlias || ""),
    ) ||
    manifest.redaction?.containsSecrets !== false ||
    manifest.redaction?.containsCredentials !== false ||
    manifest.redaction?.containsSshTarget !== false ||
    manifest.redaction?.containsAbsolutePaths !== false ||
    manifest.fingerprint !== manifestFingerprint(manifest)
  ) {
    throw new Error("database rebuild manifest safety contract is invalid");
  }
  return manifest;
}

export function buildDatabaseRebuildManifest({
  operationId,
  releaseManifest,
  releaseManifestSha256,
  targetPreflight,
  ancestry,
  createdAt = new Date().toISOString(),
}) {
  const release = validateReleaseManifest(releaseManifest);
  if (
    !UUID_V4_PATTERN.test(String(operationId || "")) ||
    !SHA256_PATTERN.test(String(releaseManifestSha256 || ""))
  ) {
    throw new Error("database rebuild identity is invalid");
  }
  if (
    targetPreflight?.schemaVersion !== "plush.target-preflight/v1" ||
    !targetPreflight?.target ||
    targetPreflight?.customer !== "yoyoosun" ||
    !["passed", "blocked"].includes(targetPreflight?.status)
  ) {
    throw new Error("fixed target preflight is required");
  }
  const target = getDeploymentTarget(targetPreflight.target);

  const runtimeSha =
    targetPreflight.remote?.runtime?.serverSha || "unknown";
  const webSha = targetPreflight.remote?.runtime?.webSha || "unknown";
  const gitRelation = validateGitAncestryRelation(ancestry);
  if (
    gitRelation.currentGitSha !== runtimeSha ||
    gitRelation.candidateGitSha !== release.gitSha
  ) {
    throw new Error("database rebuild ancestry does not match target release");
  }
  const databaseName =
    targetPreflight.remote?.runtime?.databaseName || "unknown";
  const blockers = new Set(targetPreflight.blockers || []);
  if (targetPreflight.status !== "passed" && blockers.size === 0) {
    blockers.add("database_rebuild_target_preflight_blocked");
  }
  if (runtimeSha !== release.gitSha || webSha !== release.gitSha) {
    blockers.add("database_rebuild_runtime_release_mismatch");
  }
  if (databaseName !== target.database.name) {
    blockers.add("database_rebuild_target_database_mismatch");
  }
  if (gitRelation.actionClass !== "current") {
    blockers.add("database_rebuild_git_relation_not_current");
  }
  const blockerList = [...blockers].sort();
  const manifest = {
    schemaVersion: DATABASE_REBUILD_MANIFEST_CONTRACT,
    status: blockerList.length === 0 ? "eligible" : "blocked",
    operationId,
    createdAt,
    target: {
      key: target.key,
      purpose: target.purpose,
      customer: "yoyoosun",
      trialTarget: target.trialTarget,
      database: target.database.name,
      dataDirectoryAlias: `${target.key}-primary`,
    },
    ancestry: gitRelation,
    release: {
      version: release.version,
      gitSha: release.gitSha,
      manifestSha256: releaseManifestSha256,
      artifactManifestSha256: release.artifact.manifestSha256,
      strictStatus: release.strict.status,
      strictFingerprint: release.strict.fingerprint,
      migration: release.migration,
      customerConfig: release.customerConfig,
    },
    before: {
      runtimeSha,
      webSha,
      databaseName,
      serverHealth: targetPreflight.remote.runtime.serverHealth,
      serverReady: targetPreflight.remote.runtime.serverReady,
      webHealth: targetPreflight.remote.runtime.webHealth,
      availableBytes: targetPreflight.remote.capacity.availableBytes,
      minimumAvailableBytes:
        targetPreflight.remote.capacity.minimumAvailableBytes,
    },
    blockers: blockerList,
    steps: [
      "verify the immutable current release and fixed target identity",
      "take a fresh backup of the populated predecessor and restore-check it",
      `stop only the fixed ${target.key} application and PostgreSQL services`,
      "move the predecessor data directory to an immutable rollback alias",
      "initialize a fresh physical PostgreSQL data directory with the same logical database name",
      "run migration status, audit, dry-run, apply and status readback",
      "bootstrap the first administrator from a one-use private secret file",
      "start the exact release and verify runtime identity, health and readiness",
      "prove a fixed empty-business SQL baseline and preserve both rollback points",
      "write an atomic redacted receipt without deleting either data generation",
    ],
    execution: {
      requiresExplicitConfirmation: true,
      sameLogicalDatabaseName: true,
      freshPhysicalDataDirectory: true,
      preservedDataAlias:
        `rollback-${release.gitSha.slice(0, 12)}-${operationId.slice(0, 8)}`,
      unknownOutcomeRetryAllowed: false,
    },
    rollback: {
      preservePreviousDataDirectory: true,
      preserveFreshBackup: true,
      automaticDataDeletion: false,
      automaticDatabaseDownMigration: false,
      beforeMigrationFailureAction: "restore_predecessor_directory_and_runtime",
      afterSwitchUnknownAction: "read_back_before_any_retry",
    },
    notProven: [
      "customer configuration and effective-session readback",
      "customer clean-baseline login and browser/PDF regression",
      "customer account ownership and role smoke",
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
  return validateDatabaseRebuildManifest(manifest);
}

export function writeDatabaseRebuildManifest(file, manifest) {
  validateDatabaseRebuildManifest(manifest);
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  if (existsSync(file)) {
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error("database rebuild manifest output is not a plain file");
    }
    const existing = validateDatabaseRebuildManifest(
      JSON.parse(readFileSync(file, "utf8")),
    );
    if (stableStringify(existing) !== stableStringify(manifest)) {
      throw new Error(
        "database rebuild manifest already exists with different content",
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
