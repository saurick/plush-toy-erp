#!/usr/bin/env node

import {
  copyFileSync,
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
  listDeliveryOperations,
  readDeliveryOperation,
  resolveDeliveryOperationStore,
  transitionDeliveryOperation,
} from "./delivery-operation-store.mjs";
import { getDeploymentTarget } from "./deployment-targets.mjs";
import {
  assertLocalRsync,
  buildFixedTargetRsyncTransfer,
} from "./fixed-target-rsync.mjs";
import { assertReleaseArtifactManifest } from "./release-artifact-bundle.mjs";
import { verifyReleaseArtifact } from "./release-artifact-verify.mjs";
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
} from "./target-release-cache.mjs";

export const REMOTE_ROLLBACK_RECEIPT_CONTRACT =
  "plush.remote-rollback-receipt/v3";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const IMAGE_ID_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const ISSUE_PATTERN = /^(?:none|[a-z][a-z0-9_]{2,63})$/u;
const MAX_RECEIPT_BYTES = 256 * 1024;
const ROLLBACK_STAGE_IDS = Object.freeze([
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
const TRANSFER_FILES = Object.freeze([
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

function copyBoundedFile(source, destination, maximumBytes = 2 * 1024 ** 3) {
  const stat = lstatSync(source);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size <= 0 ||
    stat.size > maximumBytes
  ) {
    throw new Error("rollback transfer input is invalid or too large");
  }
  copyFileSync(source, destination);
}

function readReleaseManifest(file) {
  const absolute = realpathSync(file);
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 512 * 1024) {
    throw new Error("rollback release manifest is invalid");
  }
  return {
    absolute,
    manifest: validateReleaseManifest(
      JSON.parse(readFileSync(absolute, "utf8")),
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
  const root = realpathSync(repoRoot);
  const bundle = realpathSync(bundleDir);
  const plan = validateRollbackManifest(rollbackPlan);
  if (plan.status !== "eligible") {
    throw new Error("only an eligible rollback plan can be transferred");
  }
  const current = readReleaseManifest(currentReleaseManifestPath);
  const target = readReleaseManifest(targetReleaseManifestPath);
  if (
    current.manifest.gitSha !== plan.from.gitSha ||
    target.manifest.gitSha !== plan.to.gitSha ||
    target.manifest.version !== plan.to.version ||
    sha256File(current.absolute) !== plan.from.manifestSha256 ||
    sha256File(target.absolute) !== plan.to.manifestSha256
  ) {
    throw new Error("rollback release manifests do not match the plan");
  }
  const artifactFile = safeBundleFile(bundle, "release-artifact.json");
  const artifact = assertReleaseArtifactManifest(
    JSON.parse(readFileSync(artifactFile, "utf8")),
  );
  validateReleaseArtifactBinding(
    target.manifest,
    artifact,
    sha256File(artifactFile),
  );
  verifyReleaseArtifact(artifactFile);
  const sbomSource = safeBundleFile(bundle, artifact.sbom.file);
  const imageByKind = new Map(
    artifact.images.map((image) => [
      image.kind,
      safeBundleFile(bundle, image.archive.file),
    ]),
  );
  if (!imageByKind.has("server") || !imageByKind.has("web")) {
    throw new Error("rollback image archives are incomplete");
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
    copyBoundedFile(
      current.absolute,
      path.join(destination, "current-release-manifest.json"),
      512 * 1024,
    );
    if (!cachedPackage) {
      copyBoundedFile(
        target.absolute,
        path.join(destination, "release-manifest.json"),
        512 * 1024,
      );
      copyBoundedFile(
        artifactFile,
        path.join(destination, "release-artifact.json"),
        512 * 1024,
      );
      copyBoundedFile(
        sbomSource,
        path.join(destination, "sbom.cdx.json"),
        32 * 1024 * 1024,
      );
      copyBoundedFile(
        imageByKind.get("server"),
        path.join(destination, "server-image.tar"),
      );
      copyBoundedFile(
        imageByKind.get("web"),
        path.join(destination, "web-image.tar"),
      );
    }
    writeFileSync(
      path.join(destination, "rollback-manifest.json"),
      `${JSON.stringify(plan, null, 2)}\n`,
      { mode: 0o600 },
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
      { mode: 0o600 },
    );
    if (!cachedPackage) {
      runChecked(
        runCommand,
        "git",
        [
          "archive",
          "--format=tar",
          `--output=${path.join(destination, "source.tar")}`,
          target.manifest.gitSha,
        ],
        { cwd: root },
        "create rollback target source archive",
      );
      if (
        sha256File(path.join(destination, "source.tar")) !==
        target.manifest.artifact.sourceArchiveSha256
      ) {
        throw new Error("rollback source archive checksum does not match");
      }
    }
    const immutableChecksums = {
      "release-manifest.json": sha256File(target.absolute),
      "release-artifact.json": sha256File(artifactFile),
      "sbom.cdx.json": artifact.sbom.sha256,
      "server-image.tar": artifact.images.find(
        (image) => image.kind === "server",
      ).archive.sha256,
      "source.tar": target.manifest.artifact.sourceArchiveSha256,
      "web-image.tar": artifact.images.find((image) => image.kind === "web")
        .archive.sha256,
    };
    const checksumLines = TRANSFER_FILES.map((file) => {
      const digest =
        immutableChecksums[file] || sha256File(path.join(destination, file));
      return `${digest}  ${file}`;
    });
    writeFileSync(
      path.join(destination, "transfer-checksums.sha256"),
      `${checksumLines.join("\n")}\n`,
      { mode: 0o600 },
    );
    const files = cachedPackage
      ? [
          "current-release-manifest.json",
          "remote-code-rollback.sh",
          "rollback-manifest.json",
          "transfer-checksums.sha256",
        ]
      : [...TRANSFER_FILES, "transfer-checksums.sha256"];
    return {
      schemaVersion: "plush.rollback-transfer/v1",
      operationId: plan.operationId,
      fromGitSha: plan.from.gitSha,
      toGitSha: plan.to.gitSha,
      toVersion: plan.to.version,
      cachedPackage,
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
  if (
    (receipt.status === "passed" &&
      (receipt.issueCode !== "none" ||
        !IMAGE_ID_PATTERN.test(serverContentId) ||
        !IMAGE_ID_PATTERN.test(webContentId) ||
        Object.values(receipt.checks).some((value) => value !== true))) ||
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
    now = () => new Date().toISOString(),
  } = {},
) {
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
    operation.version !== plan.to.version
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
  const cacheIdentity = buildCacheIdentity({
    bundleDir: targetBundleDir,
    releaseManifestPath: targetReleaseManifestPath,
  });
  const cacheProbe = probeCache(cacheIdentity, { runCommand, targetKey });
  const avoidedTransfer = estimateAvoidedTransferDuration(
    cacheProbe.avoidedBytes,
    listDeliveryOperations(store, { limit: 200 }),
  );
  let transfer;
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
  } catch (error) {
    transitionDeliveryOperation(store, operation.id, {
      status: "failed",
      message: "rollback package preparation failed before target write",
      issues: [
        {
          code: "rollback_package_preparation_failed",
          level: "error",
          message: "回滚包准备失败；未写入目标",
        },
      ],
      now: now(),
    });
    throw error;
  }

  const target = getDeploymentTarget(targetKey);
  const sshArgs = fixedSshArgs(target);
  assertLocalRsync(runCommand);
  const rsyncTransfer = buildFixedTargetRsyncTransfer({
    target,
    operationId: operation.id,
    sourceFiles: transfer.files.map((file) => path.join(transferRoot, file)),
  });
  operation = transitionDeliveryOperation(store, operation.id, {
    status: "running",
    message: "code-only target rollback started with the fixed contract",
    metadata: {
      ...operation.metadata,
      transferBytes: transfer.totalBytes,
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
  let remoteStarted = false;
  let targetPrepared = false;
  let transferDurationMs = 0;
  let transferBytesPerSecond = 0;
  try {
    prepareCache(
      { operationId: operation.id, identity: cacheIdentity, probe: cacheProbe },
      { runCommand, targetKey },
    );
    targetPrepared = true;
    const transferStartedAt = Date.now();
    try {
      runChecked(
        runCommand,
        rsyncTransfer.command,
        rsyncTransfer.args,
        { timeout: 10 * 60_000 },
        "transfer immutable rollback package",
      );
    } finally {
      transferDurationMs = Math.max(1, Date.now() - transferStartedAt);
      transferBytesPerSecond = Math.round(
        (transfer.totalBytes * 1000) / transferDurationMs,
      );
    }
    remoteStarted = true;
    const remoteScript = `${target.filesystem.root}/incoming/${operation.id}/remote-code-rollback.sh`;
    const result = runCommand(
      "ssh",
      [
        ...sshArgs,
        "bash",
        remoteScript,
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
      ],
      {
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        timeout: 30 * 60_000,
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
        transferDurationMs,
        transferBytesPerSecond,
        targetCacheHit: receipt.cache.packageHit,
        targetImageCacheHit: receipt.cache.imageHit,
        targetCacheSource: receipt.cache.cacheSource,
        avoidedTransferBytes: receipt.cache.avoidedBytes,
        dockerLoadSkipped: receipt.cache.dockerLoadSkipped,
        cacheBasis: receipt.cache.basis,
        stillExecutedChecks: receipt.cache.stillExecuted,
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
    if (!remoteStarted && targetPrepared) {
      try {
        cleanupCache(operation.id, { runCommand, targetKey });
      } catch (cleanupError) {
        executionError = new Error(
          `${error.message}; target incoming cleanup failed: ${cleanupError.message}`,
          { cause: error },
        );
      }
    }
    const current = readDeliveryOperation(store, operation.id);
    if (current.status === "running") {
      operation = transitionDeliveryOperation(store, operation.id, {
        status: remoteStarted ? "not_proven" : "failed",
        message: remoteStarted
          ? "remote rollback result could not be proven; automatic retry is disabled"
          : "rollback transfer failed before remote execution",
        issues: terminalIssues(remoteStarted ? "not_proven" : "failed"),
        metadata: {
          ...current.metadata,
          ...(transferDurationMs > 0
            ? { transferDurationMs, transferBytesPerSecond }
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
