#!/usr/bin/env node

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  consumeDeliveryOperationStore,
  listDeliveryOperations,
  readDeliveryOperation,
  resolveDeliveryOperationStore,
  transitionDeliveryOperation,
} from "./delivery-operation-store.mjs";
import { getDeploymentTarget } from "./deployment-targets.mjs";
import { parseReleaseChecksums } from "./github-release-asset-set.mjs";
import {
  assertLocalRsync,
  buildFixedTargetRsyncTransfer,
} from "./fixed-target-rsync.mjs";
import { assertReleaseArtifactManifest } from "./release-artifact-bundle.mjs";
import { readRollbackPlan } from "./rollback-controller.mjs";
import { validateRollbackManifest } from "./rollback-manifest.mjs";
import {
  sha256File,
  validateReleaseArtifactBinding,
  validateReleaseManifest,
} from "./release-catalog.mjs";
import { runTargetPreflight } from "./target-preflight.mjs";
import { classifyGitAncestryRelation } from "./git-ancestry-relation.mjs";
import { validateRemoteStageTimings } from "./remote-stage-timings.mjs";
import {
  buildTargetReleaseCacheIdentity,
  cleanupPreparedTargetReleaseIncoming,
  estimateAvoidedTransferDuration,
  prepareTargetReleaseIncoming,
  probeTargetReleaseCache,
  targetReleaseCacheEvidenceFingerprint,
} from "./target-release-cache.mjs";
import {
  TARGET_RELEASE_FETCH_FILE,
  requireTargetReleaseFetchCredential,
  validateTargetReleaseFetch,
} from "./target-release-fetch.mjs";
import { readBoundedPlainFile } from "../lib/file-digest.mjs";

export const REMOTE_ROLLBACK_RECEIPT_CONTRACT =
  "plush.remote-rollback-receipt/v5";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const IMAGE_ID_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const ISSUE_PATTERN = /^(?:none|[a-z][a-z0-9_]{2,63})$/u;
const MAX_RECEIPT_BYTES = 256 * 1024;
export const REMOTE_ROLLBACK_BOOTSTRAP = String.raw`set -euo pipefail
root=$1
incoming=$2
shift 2
current=$root/current
live_script=$current/scripts/deploy/remote-code-rollback.sh
incoming_script=$incoming/remote-code-rollback.sh
owned_private_directory() {
  local candidate="$1" canonical mode
  [[ -d "$candidate" && ! -L "$candidate" ]] || return 1
  canonical="$(readlink -f -- "$candidate")" || return 1
  [[ "$canonical" == "$candidate" && "$(stat -c '%u' "$candidate")" == "$(id -u)" ]] || return 1
  mode="$(stat -c '%a' "$candidate")"
  [[ "$mode" =~ ^[0-7]{3,4}$ ]] || return 1
  (( (8#$mode & 8#022) == 0 ))
}
owned_private_plain_file() {
  local candidate="$1" mode
  [[ -f "$candidate" && ! -L "$candidate" && "$(stat -c '%u' "$candidate")" == "$(id -u)" ]] || return 1
  mode="$(stat -c '%a' "$candidate")"
  [[ "$mode" =~ ^[0-7]{3,4}$ ]] || return 1
  (( (8#$mode & 8#022) == 0 ))
}
owned_private_directory "$root"
owned_private_directory "$current"
owned_private_directory "$current/scripts"
owned_private_directory "$current/scripts/deploy"
owned_private_directory "$incoming"
owned_private_plain_file "$live_script"
owned_private_plain_file "$incoming_script"
[[ "$(readlink -f -- "$live_script")" == "$live_script" ]]
cmp --silent "$incoming_script" "$live_script"
exec /bin/bash "$live_script" "$@"`;

export function consumeTargetReleaseFetchCredential(env = process.env) {
  const token = env.PLUSH_GITLAB_TARGET_FETCH_TOKEN;
  delete env.PLUSH_GITLAB_TOKEN;
  delete env.PLUSH_GITLAB_TARGET_FETCH_TOKEN;
  return token;
}

const ROLLBACK_STAGE_IDS = Object.freeze([
  "artifact_fetch",
  "package_verification",
  "target_identity_recheck",
  "release_materialization",
  "image_load_and_readback",
  "static_preflight",
  "service_switch",
  "runtime_verified",
  "public_entry_switch",
  "current_source_switch",
]);
const V2_TRANSFER_FILES = Object.freeze([
  "checksums.sha256",
  "current-release-manifest.json",
  "release-artifact.json",
  "release-manifest.json",
  "release-rehearsal.json",
  "remote-code-rollback.sh",
  "remote-release-acquire.sh",
  "rollback-manifest.json",
  "sbom.cdx.json",
  "server-image.tar",
  "source.tar",
  TARGET_RELEASE_FETCH_FILE,
  "web-image.tar",
]);
const LEGACY_TRANSFER_FILES = Object.freeze([
  "checksums.sha256",
  "current-release-manifest.json",
  "release-artifact.json",
  "release-manifest.json",
  "remote-code-rollback.sh",
  "rollback-manifest.json",
  "sbom.cdx.json",
  "server-image.tar",
  "source.tar",
  "web-image.tar",
]);
const V2_CONTROL_TRANSFER_FILES = Object.freeze([
  "current-release-manifest.json",
  "remote-code-rollback.sh",
  "remote-release-acquire.sh",
  "rollback-manifest.json",
  TARGET_RELEASE_FETCH_FILE,
  "transfer-checksums.sha256",
]);
const LEGACY_CONTROL_TRANSFER_FILES = Object.freeze([
  "checksums.sha256",
  "current-release-manifest.json",
  "remote-code-rollback.sh",
  "rollback-manifest.json",
  "transfer-checksums.sha256",
]);

function hasExactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return (
    actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index])
  );
}

function runChecked(runCommand, command, args, options, label) {
  const result = runCommand(command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.error) {
    throw new Error(`${label} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit ${String(result.status)}`);
  }
  return result;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function targetAcquisitionMetrics(receipt) {
  if (
    receipt?.acquisition?.mode !== "gitlab_internal" ||
    !Number.isSafeInteger(receipt.acquisition.downloadedBytes) ||
    receipt.acquisition.downloadedBytes <= 0 ||
    !Array.isArray(receipt.timings)
  ) {
    return {};
  }
  const timing = receipt.timings.find(
    (item) => item?.id === "artifact_fetch" && item?.status === "passed",
  );
  if (!Number.isSafeInteger(timing?.durationMs) || timing.durationMs <= 0) {
    return {};
  }
  return {
    targetAcquisitionDurationMs: timing.durationMs,
    targetAcquisitionBytesPerSecond: Math.round(
      (receipt.acquisition.downloadedBytes * 1000) / timing.durationMs,
    ),
  };
}

function safeBundleFile(bundleDir, relativeFile) {
  const candidate = path.resolve(bundleDir, relativeFile);
  if (!candidate.startsWith(`${bundleDir}${path.sep}`)) {
    throw new Error("rollback release file escapes its bundle");
  }
  const stat = lstatSync(candidate);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("rollback release file is not a plain file");
  }
  return candidate;
}

function plainDirectory(directory, label) {
  const input = path.resolve(directory);
  const stat = lstatSync(input);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} is invalid`);
  }
  return realpathSync(input);
}

function readReleaseManifest(file) {
  const input = path.resolve(file);
  const absolute = path.join(
    realpathSync(path.dirname(input)),
    path.basename(input),
  );
  let snapshot;
  try {
    snapshot = readBoundedPlainFile(absolute, {
      maximumBytes: 512 * 1024,
    });
  } catch (error) {
    throw new Error("rollback release manifest is invalid", { cause: error });
  }
  return {
    absolute,
    content: snapshot.content,
    sha256: snapshot.sha256,
    manifest: validateReleaseManifest(
      JSON.parse(snapshot.content.toString("utf8")),
    ),
  };
}

export function prepareRollbackTransfer(
  {
    repoRoot,
    bundleDir,
    currentReleaseManifestPath,
    targetReleaseManifestPath,
    rollbackPlan,
    destination,
  },
  { runCommand = spawnSync, cachedPackage = false } = {},
) {
  const root = plainDirectory(repoRoot, "rollback repository root");
  const bundle = plainDirectory(bundleDir, "rollback release bundle");
  const plan = validateRollbackManifest(rollbackPlan);
  if (plan.status !== "eligible") {
    throw new Error("only an eligible rollback plan can be transferred");
  }
  const current = readReleaseManifest(currentReleaseManifestPath);
  const target = readReleaseManifest(targetReleaseManifestPath);
  if (target.absolute !== path.join(bundle, "release-manifest.json")) {
    throw new Error("rollback target manifest is outside its bundle");
  }
  const legacyTarget =
    target.manifest.schemaVersion === "plush.release-manifest/v1";
  if (
    current.manifest.gitSha !== plan.from.gitSha ||
    target.manifest.gitSha !== plan.to.gitSha ||
    target.manifest.version !== plan.to.version ||
    current.sha256 !== plan.from.manifestSha256 ||
    target.sha256 !== plan.to.manifestSha256
  ) {
    throw new Error("rollback release manifests do not match the plan");
  }
  if (
    !plan.transport ||
    plan.transport.targetManifestSha256 !== plan.to.manifestSha256 ||
    (legacyTarget
      ? plan.transport.mode !== "legacy_target_cache"
      : plan.transport.mode !== "gitlab_internal_or_target_cache") ||
    (legacyTarget && !cachedPackage)
  ) {
    throw new Error("rollback transport does not match the release plan");
  }
  const artifactFile = safeBundleFile(bundle, "release-artifact.json");
  const artifactSnapshot = readBoundedPlainFile(artifactFile, {
    maximumBytes: 512 * 1024,
  });
  const artifact = assertReleaseArtifactManifest(
    JSON.parse(artifactSnapshot.content.toString("utf8")),
  );
  validateReleaseArtifactBinding(
    target.manifest,
    artifact,
    artifactSnapshot.sha256,
  );
  const checksumsFile = safeBundleFile(bundle, "checksums.sha256");
  const checksumsSnapshot = readBoundedPlainFile(checksumsFile, {
    maximumBytes: 4 * 1024 * 1024,
  });
  let rehearsalFile = null;
  let rehearsalSnapshot = null;
  let fetchFile = null;
  let fetchSnapshot = null;
  let fetch = null;
  if (legacyTarget) {
    const checksums = parseReleaseChecksums(
      checksumsSnapshot.content.toString("utf8"),
    );
    const expected = new Map([
      ["release-artifact.json", artifactSnapshot.sha256],
      ["release-manifest.json", target.sha256],
      ["sbom.cdx.json", artifact.sbom.sha256],
      [
        "server-image.tar",
        artifact.images.find((image) => image.kind === "server").archive.sha256,
      ],
      [
        "web-image.tar",
        artifact.images.find((image) => image.kind === "web").archive.sha256,
      ],
    ]);
    if ([...expected].some(([name, digest]) => checksums.get(name) !== digest)) {
      throw new Error("legacy rollback checksum catalog does not match the plan");
    }
  } else {
    rehearsalFile = safeBundleFile(bundle, "release-rehearsal.json");
    fetchFile = safeBundleFile(bundle, TARGET_RELEASE_FETCH_FILE);
    rehearsalSnapshot = readBoundedPlainFile(rehearsalFile, {
      maximumBytes: 4 * 1024 * 1024,
    });
    fetchSnapshot = readBoundedPlainFile(fetchFile, {
      maximumBytes: 512 * 1024,
    });
    fetch = validateTargetReleaseFetch(
      JSON.parse(fetchSnapshot.content.toString("utf8")),
    );
    if (
      fetch.gitSha !== target.manifest.gitSha ||
      fetch.version !== target.manifest.version ||
      fetch.formal.files.find((file) => file.name === "release-artifact.json")
        ?.sha256 !== artifactSnapshot.sha256 ||
      fetch.formal.files.find((file) => file.name === "release-manifest.json")
        ?.sha256 !== target.sha256 ||
      fetch.formal.files.find((file) => file.name === "release-rehearsal.json")
        ?.sha256 !== rehearsalSnapshot.sha256 ||
      fetch.formal.files.find((file) => file.name === "checksums.sha256")
        ?.sha256 !== checksumsSnapshot.sha256
    ) {
      throw new Error("target-direct rollback descriptor does not match the plan");
    }
  }
  for (const gitSha of [current.manifest.gitSha, target.manifest.gitSha]) {
    runChecked(
      runCommand,
      "git",
      ["cat-file", "-e", `${gitSha}^{commit}`],
      { cwd: root },
      "verify rollback release commit",
    );
    runChecked(
      runCommand,
      "git",
      ["merge-base", "--is-ancestor", gitSha, "origin/main"],
      { cwd: root },
      "verify rollback release is reachable from origin/main",
    );
  }
  if (existsSync(destination)) {
    throw new Error("rollback transfer destination already exists");
  }
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  try {
    writeFileSync(
      path.join(destination, "current-release-manifest.json"),
      current.content,
      { flag: "wx", mode: 0o600 },
    );
    if (legacyTarget) {
      writeFileSync(
        path.join(destination, "checksums.sha256"),
        checksumsSnapshot.content,
        { flag: "wx", mode: 0o600 },
      );
    } else {
      writeFileSync(
        path.join(destination, TARGET_RELEASE_FETCH_FILE),
        fetchSnapshot.content,
        { flag: "wx", mode: 0o600 },
      );
    }
    writeFileSync(
      path.join(destination, "rollback-manifest.json"),
      `${JSON.stringify(plan, null, 2)}\n`,
      { flag: "wx", mode: 0o600 },
    );
    // The control script belongs to the live release. The target release only
    // supplies the source and images; importing its historical orchestrator can
    // reintroduce an already-fixed rollback or receipt defect.
    const remoteScript = runChecked(
      runCommand,
      "git",
      [
        "show",
        `${current.manifest.gitSha}:scripts/deploy/remote-code-rollback.sh`,
      ],
      { cwd: root },
      "read committed rollback script",
    );
    writeFileSync(
      path.join(destination, "remote-code-rollback.sh"),
      String(remoteScript.stdout || ""),
      { flag: "wx", mode: 0o600 },
    );
    if (!legacyTarget) {
      const acquireScript = runChecked(
        runCommand,
        "git",
        [
          "show",
          `${current.manifest.gitSha}:scripts/deploy/remote-release-acquire.sh`,
        ],
        { cwd: root },
        "read committed release acquisition helper",
      );
      writeFileSync(
        path.join(destination, "remote-release-acquire.sh"),
        String(acquireScript.stdout || ""),
        { flag: "wx", mode: 0o600 },
      );
    }
    const immutableChecksums = {
      "checksums.sha256": checksumsSnapshot.sha256,
      "release-manifest.json": target.sha256,
      "release-artifact.json": artifactSnapshot.sha256,
      "sbom.cdx.json": artifact.sbom.sha256,
      "server-image.tar": artifact.images.find(
        (image) => image.kind === "server",
      ).archive.sha256,
      "source.tar": target.manifest.artifact.sourceArchiveSha256,
      "web-image.tar": artifact.images.find((image) => image.kind === "web")
        .archive.sha256,
    };
    if (!legacyTarget) {
      immutableChecksums["release-rehearsal.json"] = rehearsalSnapshot.sha256;
      immutableChecksums[TARGET_RELEASE_FETCH_FILE] = fetchSnapshot.sha256;
    }
    const transferFiles = legacyTarget
      ? LEGACY_TRANSFER_FILES
      : V2_TRANSFER_FILES;
    const checksumLines = transferFiles.map((file) => {
      const digest =
        immutableChecksums[file] || sha256File(path.join(destination, file));
      return `${digest}  ${file}`;
    });
    writeFileSync(
      path.join(destination, "transfer-checksums.sha256"),
      `${checksumLines.join("\n")}\n`,
      { flag: "wx", mode: 0o600 },
    );
    const files = [
      ...(legacyTarget
        ? LEGACY_CONTROL_TRANSFER_FILES
        : V2_CONTROL_TRANSFER_FILES),
    ];
    return {
      schemaVersion: "plush.rollback-transfer/v1",
      operationId: plan.operationId,
      fromGitSha: plan.from.gitSha,
      toGitSha: plan.to.gitSha,
      toVersion: plan.to.version,
      transportMode: plan.transport.mode,
      cachedPackage,
      acquisitionExpectedBytes: cachedPackage || legacyTarget
        ? 0
        : fetch.formal.files.reduce((total, file) => total + file.size, 0) +
          fetch.source.file.size,
      files,
      totalBytes: files.reduce(
        (total, file) => total + statSync(path.join(destination, file)).size,
        0,
      ),
      redaction: {
        containsSecrets: false,
        containsCredentials: false,
        containsAbsolutePaths: false,
      },
    };
  } catch (error) {
    rmSync(destination, { recursive: true, force: true });
    throw error;
  }
}

export function validateRemoteRollbackReceipt(receipt, expected) {
  const serverContentId = String(receipt?.images?.serverContentId || "");
  const webContentId = String(receipt?.images?.webContentId || "");
  const optionalImageId = (value) =>
    value === "unknown" || IMAGE_ID_PATTERN.test(value);
  validateRemoteStageTimings({
    timings: receipt?.timings,
    status: receipt?.status,
    stage: receipt?.stage,
    durationMs: receipt?.durationMs,
    startedAt: receipt?.startedAt,
    finishedAt: receipt?.finishedAt,
    requiredStages: ROLLBACK_STAGE_IDS,
  });
  if (
    !hasExactKeys(receipt, [
      "acquisition",
      "cache",
      "checks",
      "currentManifestSha256",
      "database",
      "durationMs",
      "finishedAt",
      "fromGitSha",
      "images",
      "issueCode",
      "notProven",
      "operationId",
      "redaction",
      "rollbackFingerprint",
      "schemaVersion",
      "serviceSwitchStarted",
      "stage",
      "startedAt",
      "status",
      "target",
      "targetManifestSha256",
      "timings",
      "toGitSha",
      "toVersion",
    ]) ||
    !hasExactKeys(receipt?.acquisition, [
      "catalogAndChecksumsVerified",
      "credentialCleanupProven",
      "downloadedBytes",
      "expectedBytes",
      "mode",
    ]) ||
    !hasExactKeys(receipt?.cache, [
      "avoidedBytes",
      "basis",
      "cacheSource",
      "dockerLoadSkipped",
      "imageHit",
      "packageHit",
      "stillExecuted",
    ]) ||
    !hasExactKeys(receipt?.images, ["serverContentId", "webContentId"]) ||
    !hasExactKeys(receipt?.database, [
      "changedByExecutor",
      "downMigrationAutomatic",
      "restoreAutomatic",
    ]) ||
    !hasExactKeys(receipt?.checks, [
      "basicSmoke",
      "customerConfigUnchanged",
      "health",
      "migrationUnchanged",
      "publicEntry",
      "ready",
      "releaseIdentity",
    ]) ||
    !hasExactKeys(receipt?.redaction, [
      "containsAbsolutePaths",
      "containsCredentials",
      "containsRawEnvironmentValues",
      "containsRawLogs",
      "containsSecrets",
    ]) ||
    receipt?.schemaVersion !== REMOTE_ROLLBACK_RECEIPT_CONTRACT ||
    !["passed", "failed", "not_proven"].includes(receipt?.status) ||
    receipt?.operationId !== expected.operationId ||
    receipt?.target !== expected.targetKey ||
    receipt?.fromGitSha !== expected.fromGitSha ||
    receipt?.toGitSha !== expected.toGitSha ||
    receipt?.toVersion !== expected.toVersion ||
    receipt?.currentManifestSha256 !== expected.currentManifestSha256 ||
    receipt?.targetManifestSha256 !== expected.targetManifestSha256 ||
    receipt?.rollbackFingerprint !== expected.rollbackFingerprint ||
    !/^[a-z][a-z0-9_]{2,63}$/u.test(String(receipt?.stage || "")) ||
    !ISSUE_PATTERN.test(String(receipt?.issueCode || "")) ||
    typeof receipt?.serviceSwitchStarted !== "boolean" ||
    typeof receipt?.finishedAt !== "string" ||
    Number.isNaN(Date.parse(receipt.finishedAt)) ||
    typeof receipt?.startedAt !== "string" ||
    Number.isNaN(Date.parse(receipt.startedAt)) ||
    Date.parse(receipt.finishedAt) < Date.parse(receipt.startedAt) ||
    !Array.isArray(receipt?.notProven) ||
    receipt.notProven.length !== 2 ||
    !optionalImageId(serverContentId) ||
    !optionalImageId(webContentId) ||
    !["none", "target_cache", "gitlab_internal"].includes(
      receipt?.acquisition?.mode,
    ) ||
    !Number.isSafeInteger(receipt?.acquisition?.downloadedBytes) ||
    receipt.acquisition.downloadedBytes < 0 ||
    !Number.isSafeInteger(receipt?.acquisition?.expectedBytes) ||
    receipt.acquisition.expectedBytes < 0 ||
    typeof receipt?.acquisition?.catalogAndChecksumsVerified !== "boolean" ||
    typeof receipt?.acquisition?.credentialCleanupProven !== "boolean" ||
    typeof receipt?.cache?.packageHit !== "boolean" ||
    typeof receipt?.cache?.imageHit !== "boolean" ||
    receipt?.cache?.dockerLoadSkipped !== receipt?.cache?.imageHit ||
    !["none", "formal", "retained_operation"].includes(
      receipt?.cache?.cacheSource,
    ) ||
    !Number.isSafeInteger(receipt?.cache?.avoidedBytes) ||
    receipt.cache.avoidedBytes < 0 ||
    !Array.isArray(receipt?.cache?.basis) ||
    !Array.isArray(receipt?.cache?.stillExecuted) ||
    receipt.cache.stillExecuted.join(",") !==
      "migration_status,health,ready,public_entry" ||
    (receipt.cache.packageHit
      ? receipt.cache.avoidedBytes <= 0 ||
        receipt.cache.cacheSource === "none" ||
        receipt.cache.basis.join(",") !==
          "release_manifest_sha256,archive_sha256,registry_digest,docker_content_id,embedded_git_sha"
      : receipt.cache.imageHit ||
        receipt.cache.avoidedBytes !== 0 ||
        receipt.cache.basis.length !== 0 ||
        receipt.cache.cacheSource !== "none") ||
    receipt.database.downMigrationAutomatic !== false ||
    receipt.database.restoreAutomatic !== false ||
    receipt.database.changedByExecutor !== false ||
    receipt.redaction.containsSecrets !== false ||
    receipt.redaction.containsCredentials !== false ||
    receipt.redaction.containsAbsolutePaths !== false ||
    receipt.redaction.containsRawEnvironmentValues !== false ||
    receipt.redaction.containsRawLogs !== false ||
    JSON.stringify(receipt).length > MAX_RECEIPT_BYTES
  ) {
    throw new Error("remote rollback receipt contract is invalid");
  }
  const expectedCache = expected.cache;
  const cacheMatchesExpected =
    expectedCache &&
    receipt.cache.packageHit === expectedCache.packageHit &&
    receipt.cache.imageHit === expectedCache.imageHit &&
    receipt.cache.cacheSource === expectedCache.cacheSource &&
    receipt.cache.avoidedBytes === expectedCache.avoidedBytes &&
    receipt.cache.dockerLoadSkipped === expectedCache.dockerLoadSkipped &&
    JSON.stringify(receipt.cache.basis) ===
      JSON.stringify(expectedCache.basis) &&
    JSON.stringify(receipt.cache.stillExecuted) ===
      JSON.stringify(expectedCache.stillExecuted);
  if (
    (receipt.status !== "not_proven" &&
      receipt.acquisition.credentialCleanupProven !== true) ||
    (receipt.status === "passed" &&
      (receipt.issueCode !== "none" ||
        !IMAGE_ID_PATTERN.test(serverContentId) ||
        !IMAGE_ID_PATTERN.test(webContentId) ||
        receipt.acquisition.catalogAndChecksumsVerified !== true ||
        receipt.acquisition.mode === "none" ||
        receipt.acquisition.expectedBytes !==
          expected.acquisitionExpectedBytes ||
        (receipt.acquisition.mode === "gitlab_internal" &&
          (receipt.acquisition.expectedBytes <= 0 ||
            receipt.acquisition.downloadedBytes !==
              receipt.acquisition.expectedBytes)) ||
        (receipt.acquisition.mode === "target_cache" &&
          (receipt.acquisition.downloadedBytes !== 0 ||
            receipt.acquisition.expectedBytes !== 0)) ||
        Object.values(receipt.checks).some((value) => value !== true) ||
        !cacheMatchesExpected)) ||
    (receipt.status !== "passed" && receipt.issueCode === "none")
  ) {
    throw new Error("remote rollback receipt status is inconsistent");
  }
  return receipt;
}

function fixedSshArgs(target) {
  return [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=8",
    "-o",
    "StrictHostKeyChecking=yes",
    "-p",
    String(target.ssh.port),
    `${target.ssh.user}@${target.ssh.host}`,
  ];
}

function terminalIssues(status) {
  if (status === "passed") return [];
  return [
    {
      code:
        status === "failed"
          ? "target_rollback_failed"
          : "target_rollback_outcome_unknown",
      level: "error",
      message:
        status === "failed"
          ? "代码回滚失败，旧版本已恢复或未开始切换；未自动重试"
          : "代码回滚结果未知，必须先读回；未自动重试",
    },
  ];
}

export function executeRollback(
  {
    repoRoot,
    operationId,
    currentReleaseManifestPath,
    targetBundleDir,
    targetReleaseManifestPath,
    confirmation,
    operationStore,
  },
  {
    runCommand = spawnSync,
    runPreflight = runTargetPreflight,
    classifyRelation = classifyGitAncestryRelation,
    buildCacheIdentity = buildTargetReleaseCacheIdentity,
    cleanupCache = cleanupPreparedTargetReleaseIncoming,
    probeCache = probeTargetReleaseCache,
    prepareCache = prepareTargetReleaseIncoming,
    fetchToken,
    now = () => new Date().toISOString(),
  } = {},
) {
  const inheritedFetchToken = consumeTargetReleaseFetchCredential();
  if (!UUID_V4_PATTERN.test(String(operationId || ""))) {
    throw new Error("rollback operation id is invalid");
  }
  const root = realpathSync(repoRoot || process.cwd());
  const store = operationStore || resolveDeliveryOperationStore(root);
  let operation = readDeliveryOperation(store, operationId);
  const plan = readRollbackPlan(store, operationId);
  const targetKey = plan?.target?.key;
  if (
    !["ready", "launching"].includes(operation.status) ||
    operation.action !== "rollback" ||
    operation.target !== targetKey ||
    !plan ||
    plan.status !== "eligible" ||
    operation.gitSha !== plan.to.gitSha ||
    operation.version !== plan.to.version ||
    operation.metadata?.rollbackFingerprint !== plan.fingerprint ||
    operation.metadata?.currentManifestSha256 !== plan.from.manifestSha256 ||
    operation.metadata?.targetManifestSha256 !== plan.to.manifestSha256 ||
    operation.metadata?.rollbackTransportMode !== plan.transport?.mode ||
    (plan.transport?.mode === "legacy_target_cache" &&
      !SHA256_PATTERN.test(
        String(operation.metadata?.rollbackTargetCacheFingerprint || ""),
      ))
  ) {
    throw new Error("rollback operation is not in the eligible ready state");
  }
  const expectedConfirmation = `ROLLBACK:${targetKey}:${plan.from.gitSha}:${plan.to.gitSha}:${operation.id}`;
  if (confirmation !== expectedConfirmation) {
    throw new Error(
      `explicit rollback confirmation is required: ${expectedConfirmation}`,
    );
  }
  const immediatePreflight = runPreflight(targetKey);
  const blockers = new Set(immediatePreflight.blockers || []);
  if (
    immediatePreflight.status !== "passed" ||
    immediatePreflight.remote.runtime.serverSha !== plan.from.gitSha ||
    immediatePreflight.remote.runtime.webSha !== plan.from.gitSha
  ) {
    if (
      immediatePreflight.remote?.runtime?.serverSha !== plan.from.gitSha ||
      immediatePreflight.remote?.runtime?.webSha !== plan.from.gitSha
    ) {
      blockers.add("rollback_current_release_mismatch");
    }
  }
  try {
    const immediateAncestry = classifyRelation({
      repoRoot: root,
      currentGitSha: immediatePreflight.remote?.runtime?.serverSha,
      candidateGitSha: plan.to.gitSha,
    });
    if (
      immediateAncestry.actionClass !== "rollback" ||
      JSON.stringify(immediateAncestry) !== JSON.stringify(plan.ancestry)
    ) {
      blockers.add("rollback_git_relation_not_behind");
    }
  } catch {
    blockers.add("rollback_git_relation_not_behind");
  }
  if (immediatePreflight.status !== "passed" || blockers.size > 0) {
    operation = transitionDeliveryOperation(store, operation.id, {
      status: "blocked",
      message: "rollback was blocked by the immediate target readback",
      issues: [...blockers].sort().map((code) => ({
        code,
        level: "error",
        message: `目标即时回滚预检阻断：${code}`,
      })),
      now: now(),
    });
    return {
      schemaVersion: "plush.rollback-execution/v1",
      operation,
      targetWriteStarted: false,
      receipt: null,
    };
  }

  const transferRoot = path.join(
    store,
    "transfers",
    `${operation.id}-rollback-${operation.requestFingerprint.slice(0, 12)}`,
  );
  const legacyTarget = plan.transport.mode === "legacy_target_cache";
  let cacheIdentity;
  let cacheProbe;
  let avoidedTransfer;
  try {
    cacheIdentity = buildCacheIdentity({
      bundleDir: targetBundleDir,
      releaseManifestPath: targetReleaseManifestPath,
    });
    cacheProbe = probeCache(cacheIdentity, { runCommand, targetKey });
    if (
      (legacyTarget &&
        (cacheIdentity.cacheMode !== "legacy_v1_existing_only" ||
          !cacheProbe.packageHit ||
          cacheProbe.cacheSource !== "formal" ||
          targetReleaseCacheEvidenceFingerprint({
            targetKey,
            identity: cacheIdentity,
            probe: cacheProbe,
          }) !== operation.metadata.rollbackTargetCacheFingerprint)) ||
      (!legacyTarget && cacheIdentity.cacheMode !== "v2_direct")
    ) {
      throw new Error("rollback target cache does not match the bound transport");
    }
    avoidedTransfer = estimateAvoidedTransferDuration(
      cacheProbe.avoidedBytes,
      listDeliveryOperations(store, { limit: 200 }),
    );
  } catch {
    operation = transitionDeliveryOperation(store, operation.id, {
      status: "blocked",
      message: "rollback is blocked because its target transport is unavailable",
      issues: [
        {
          code: "rollback_target_transport_unavailable",
          level: "error",
          message: "目标回滚制品或既有缓存资格不可用；未启动目标写操作",
        },
      ],
      now: now(),
    });
    return {
      schemaVersion: "plush.rollback-execution/v1",
      operation,
      targetWriteStarted: false,
      receipt: null,
    };
  }
  const consumedFetchToken =
    fetchToken === undefined ? inheritedFetchToken : fetchToken;
  const targetFetchToken =
    legacyTarget || cacheProbe.packageHit
      ? null
      : requireTargetReleaseFetchCredential(consumedFetchToken);
  const target = getDeploymentTarget(targetKey);
  const sshArgs = fixedSshArgs(target);
  let transfer;
  let rsyncTransfer;
  let remoteStarted = false;
  let targetPrepared = false;
  let controlTransferDurationMs = 0;
  let controlTransferBytesPerSecond = 0;
  try {
    transfer = prepareRollbackTransfer(
      {
        repoRoot: root,
        bundleDir: targetBundleDir,
        currentReleaseManifestPath,
        targetReleaseManifestPath,
        rollbackPlan: plan,
        destination: transferRoot,
      },
      { runCommand, cachedPackage: cacheProbe.packageHit },
    );
    assertLocalRsync(runCommand);
    rsyncTransfer = buildFixedTargetRsyncTransfer({
      target,
      operationId: operation.id,
      sourceFiles: transfer.files.map((file) => path.join(transferRoot, file)),
    });
    operation = transitionDeliveryOperation(store, operation.id, {
      status: "running",
      message: "code-only target rollback started with the fixed contract",
      metadata: {
        ...operation.metadata,
        controlTransferBytes: transfer.totalBytes,
        targetAcquisitionExpectedBytes: transfer.acquisitionExpectedBytes,
        targetCacheHit: cacheProbe.packageHit,
        targetImageCacheHit: cacheProbe.imageHit,
        targetCacheSource: cacheProbe.cacheSource,
        avoidedTransferBytes: cacheProbe.avoidedBytes,
        avoidedTransferDurationMs: avoidedTransfer.durationMs,
        avoidedTransferBaselineOperationId: avoidedTransfer.baselineOperationId,
        dockerLoadSkipped: cacheProbe.imageHit,
        cacheBasis: cacheProbe.basis,
        stillExecutedChecks: [
          "migration_status",
          "health",
          "ready",
          "public_entry",
        ],
      },
      now: now(),
    });
    targetPrepared = true;
    prepareCache(
      { operationId: operation.id, identity: cacheIdentity, probe: cacheProbe },
      { runCommand, targetKey },
    );
    const controlTransferStartedAt = Date.now();
    try {
      runChecked(
        runCommand,
        rsyncTransfer.command,
        rsyncTransfer.args,
        { timeout: 10 * 60_000 },
        "transfer rollback control package",
      );
    } finally {
      controlTransferDurationMs = Math.max(
        1,
        Date.now() - controlTransferStartedAt,
      );
      controlTransferBytesPerSecond = Math.round(
        (transfer.totalBytes * 1000) / controlTransferDurationMs,
      );
    }
    remoteStarted = true;
    const remoteRoot = target.filesystem.root;
    const remoteIncoming = `${remoteRoot}/incoming/${operation.id}`;
    const remoteCommand = [
      "/bin/bash",
      "-c",
      shellQuote(REMOTE_ROLLBACK_BOOTSTRAP),
      shellQuote("plush-rollback-bootstrap"),
      shellQuote(remoteRoot),
      shellQuote(remoteIncoming),
      ...[
        "rollback",
        targetKey,
        operation.id,
        plan.from.gitSha,
        plan.to.gitSha,
        plan.to.version,
        plan.from.manifestSha256,
        plan.to.manifestSha256,
        plan.fingerprint,
        confirmation,
      ].map(shellQuote),
    ].join(" ");
    const result = runCommand(
      "ssh",
      [...sshArgs, remoteCommand],
      {
        encoding: "utf8",
        input: targetFetchToken ? `${targetFetchToken}\n` : "",
        maxBuffer: 1024 * 1024,
        timeout: 60 * 60_000,
      },
    );
    const rawReceipt = String(result.stdout || "").trim();
    const receipt = validateRemoteRollbackReceipt(JSON.parse(rawReceipt), {
      targetKey,
      operationId: operation.id,
      fromGitSha: plan.from.gitSha,
      toGitSha: plan.to.gitSha,
      toVersion: plan.to.version,
      currentManifestSha256: plan.from.manifestSha256,
      targetManifestSha256: plan.to.manifestSha256,
      rollbackFingerprint: plan.fingerprint,
      acquisitionExpectedBytes: transfer.acquisitionExpectedBytes,
      cache: {
        packageHit: cacheProbe.packageHit,
        imageHit: cacheProbe.imageHit,
        cacheSource: cacheProbe.cacheSource,
        avoidedBytes: cacheProbe.avoidedBytes,
        dockerLoadSkipped: cacheProbe.imageHit,
        basis: cacheProbe.basis,
        stillExecuted: [
          "migration_status",
          "health",
          "ready",
          "public_entry",
        ],
      },
    });
    if (result.error) {
      throw new Error(`remote rollback SSH failed: ${result.error.message}`);
    }
    if (
      (result.status === 0) !== (receipt.status === "passed") &&
      !(result.status !== 0 && receipt.status !== "passed")
    ) {
      throw new Error("remote rollback exit status contradicts its receipt");
    }
    operation = transitionDeliveryOperation(store, operation.id, {
      status: receipt.status,
      message:
        receipt.status === "passed"
          ? "code-only rollback and basic runtime verification passed"
          : receipt.status === "failed"
            ? "code-only rollback failed and did not change the database"
            : "code-only rollback outcome requires target readback",
      issues: terminalIssues(receipt.status),
      metadata: {
        ...operation.metadata,
        remoteStage: receipt.stage,
        serverContentId: receipt.images.serverContentId,
        webContentId: receipt.images.webContentId,
        databaseChangedByExecutor: false,
        remoteStageTimings: receipt.timings,
        controlTransferDurationMs,
        controlTransferBytesPerSecond,
        targetAcquisitionMode: receipt.acquisition.mode,
        targetAcquisitionBytes: receipt.acquisition.downloadedBytes,
        targetAcquisitionExpectedBytes: receipt.acquisition.expectedBytes,
        targetAcquisitionVerified:
          receipt.acquisition.catalogAndChecksumsVerified,
        ...targetAcquisitionMetrics(receipt),
        targetCacheHit: cacheProbe.packageHit,
        targetImageCacheHit: cacheProbe.imageHit,
        targetCacheSource: cacheProbe.cacheSource,
        avoidedTransferBytes: cacheProbe.avoidedBytes,
        dockerLoadSkipped: cacheProbe.imageHit,
        cacheBasis: cacheProbe.basis,
        stillExecutedChecks: [
          "migration_status",
          "health",
          "ready",
          "public_entry",
        ],
      },
      now: now(),
    });
    return {
      schemaVersion: "plush.rollback-execution/v1",
      operation,
      targetWriteStarted: true,
      receipt,
    };
  } catch (error) {
    let executionError = error;
    let targetCleanupProven = true;
    if (!remoteStarted && targetPrepared) {
      try {
        cleanupCache(operation.id, { runCommand, targetKey });
      } catch (cleanupError) {
        targetCleanupProven = false;
        executionError = new Error(
          `${error.message}; target incoming cleanup failed: ${cleanupError.message}`,
          { cause: error },
        );
      }
    }
    const current = readDeliveryOperation(store, operation.id);
    if (["ready", "launching", "running"].includes(current.status)) {
      const outcomeUnknown = remoteStarted || !targetCleanupProven;
      operation = transitionDeliveryOperation(store, operation.id, {
        status: outcomeUnknown ? "not_proven" : "failed",
        message: remoteStarted
          ? "remote rollback result could not be proven; automatic retry is disabled"
          : !targetCleanupProven
            ? "rollback control transfer cleanup could not be proven; automatic retry is disabled"
          : "rollback package preparation or control transfer failed before remote execution",
        issues: terminalIssues(outcomeUnknown ? "not_proven" : "failed"),
        metadata: {
          ...current.metadata,
          ...(controlTransferDurationMs > 0
            ? {
                controlTransferDurationMs,
                controlTransferBytesPerSecond,
              }
            : {}),
        },
        now: now(),
      });
    }
    throw executionError;
  } finally {
    rmSync(transferRoot, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const options = {
    operationId: "",
    currentManifest: "",
    targetBundleDir: "",
    targetManifest: "",
    confirmation: "",
    json: false,
    help: false,
  };
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
    if (
      [
        "--operation-id",
        "--current-manifest",
        "--target-bundle-dir",
        "--target-manifest",
        "--confirmation",
      ].includes(token)
    ) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${token} requires a value`);
      }
      const key = token
        .slice(2)
        .replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
      options[key] = value;
      index += 1;
      continue;
    }
    throw new Error(`unsupported argument: ${token}`);
  }
  if (
    !options.help &&
    (!options.operationId ||
      !options.currentManifest ||
      !options.targetBundleDir ||
      !options.targetManifest ||
      !options.confirmation)
  ) {
    throw new Error(
      "--operation-id, --current-manifest, --target-bundle-dir, --target-manifest and --confirmation are required",
    );
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
  node scripts/deploy/rollback-executor.mjs \\
    --operation-id <uuid-v4> \\
    --current-manifest <release-manifest.json> \\
    --target-bundle-dir <immutable-release-directory> \\
    --target-manifest <release-manifest.json> \\
    --confirmation ROLLBACK:<target>:<from-sha>:<to-sha>:<operation-id> [--json]

The operation must already be ready. This executor changes code and images
only; it never builds, performs a database down migration, restores a database
or automatically retries a terminal or unknown operation.`);
      process.exit(0);
    }
    const report = executeRollback({
      repoRoot: process.cwd(),
      operationStore: consumeDeliveryOperationStore(process.cwd()),
      operationId: options.operationId,
      currentReleaseManifestPath: options.currentManifest,
      targetBundleDir: options.targetBundleDir,
      targetReleaseManifestPath: options.targetManifest,
      confirmation: options.confirmation,
    });
    console.log(
      options.json
        ? JSON.stringify(report, null, 2)
        : `rollback ${report.operation.status}: ${report.operation.id}`,
    );
    process.exit(report.operation.status === "passed" ? 0 : 2);
  } catch (error) {
    console.error(`[rollback-executor] ${error.message}`);
    process.exit(1);
  }
}
