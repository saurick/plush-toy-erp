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
  readDeliveryOperation,
  resolveDeliveryOperationStore,
  transitionDeliveryOperation,
} from "./delivery-operation-store.mjs";
import { getDeploymentTarget } from "./deployment-targets.mjs";
import {
  assertLocalRsync,
  buildFixedTargetRsyncTransfer,
} from "./fixed-target-rsync.mjs";
import { readPromotionPlan } from "./promotion-controller.mjs";
import { validatePromotionManifest } from "./promotion-manifest.mjs";
import { verifyReleaseArtifact } from "./release-artifact-verify.mjs";
import { sha256File, validateReleaseManifest } from "./release-catalog.mjs";
import { runTargetPreflight } from "./target-preflight.mjs";
import { validateRemoteStageTimings } from "./remote-stage-timings.mjs";

export const REMOTE_PROMOTION_RECEIPT_CONTRACT =
  "plush.remote-promotion-receipt/v2";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const IMAGE_ID_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const ISSUE_PATTERN = /^(?:none|[a-z][a-z0-9_]{2,63})$/u;
const MAX_RECEIPT_BYTES = 256 * 1024;
const PROMOTION_STAGE_IDS = Object.freeze([
  "package_verification",
  "capacity_recheck",
  "release_materialization",
  "image_load_and_readback",
  "fresh_backup_and_restore_check",
  "env_and_static_preflight",
  "migration_plan",
  "maintenance_window",
  "migration_apply_started",
  "migration_applied",
  "compose_start",
  "runtime_verified",
  "public_entry_switch",
  "current_source_switch",
]);
const TRANSFER_FILES = Object.freeze([
  "promotion-manifest.json",
  "release-artifact.json",
  "release-manifest.json",
  "remote-promotion.sh",
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
    throw new Error("release artifact file escapes its bundle");
  }
  const stat = lstatSync(candidate);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("release artifact file is not a plain file");
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
    throw new Error("promotion transfer input is invalid or too large");
  }
  copyFileSync(source, destination);
}

function sourceFileAtCommit(repoRoot, gitSha, relativeFile, runCommand) {
  const result = runChecked(
    runCommand,
    "git",
    ["show", `${gitSha}:${relativeFile}`],
    { cwd: repoRoot },
    `read committed ${relativeFile}`,
  );
  return String(result.stdout || "");
}

export function preparePromotionTransfer(
  { repoRoot, bundleDir, releaseManifestPath, promotionPlan, destination },
  { runCommand = spawnSync } = {},
) {
  const root = realpathSync(repoRoot);
  const bundle = realpathSync(bundleDir);
  const plan = validatePromotionManifest(promotionPlan);
  if (plan.status !== "eligible") {
    throw new Error("only an eligible promotion plan can be transferred");
  }
  const releaseManifestFile = realpathSync(releaseManifestPath);
  const releaseManifest = validateReleaseManifest(
    JSON.parse(readFileSync(releaseManifestFile, "utf8")),
  );
  if (
    releaseManifest.gitSha !== plan.release.gitSha ||
    releaseManifest.version !== plan.release.version ||
    sha256File(releaseManifestFile) !== plan.release.manifestSha256
  ) {
    throw new Error("release manifest does not match the promotion plan");
  }
  const artifactFile = safeBundleFile(bundle, "release-artifact.json");
  const artifact = JSON.parse(readFileSync(artifactFile, "utf8"));
  if (
    sha256File(artifactFile) !== releaseManifest.artifact.manifestSha256 ||
    artifact?.git?.commit !== releaseManifest.gitSha
  ) {
    throw new Error("release artifact does not match the immutable release");
  }
  verifyReleaseArtifact(artifactFile);
  const sbomSource = safeBundleFile(bundle, artifact.sbom.file);
  const imageByKind = new Map(
    artifact.images.map((image) => [
      image.kind,
      safeBundleFile(bundle, image.archive.file),
    ]),
  );
  if (!imageByKind.has("server") || !imageByKind.has("web")) {
    throw new Error("release image archives are incomplete");
  }

  runChecked(
    runCommand,
    "git",
    ["cat-file", "-e", `${releaseManifest.gitSha}^{commit}`],
    { cwd: root },
    "verify release commit",
  );
  runChecked(
    runCommand,
    "git",
    ["merge-base", "--is-ancestor", releaseManifest.gitSha, "origin/main"],
    { cwd: root },
    "verify release is reachable from origin/main",
  );

  if (existsSync(destination)) {
    throw new Error("promotion transfer destination already exists");
  }
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  try {
    copyBoundedFile(
      releaseManifestFile,
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
    writeFileSync(
      path.join(destination, "promotion-manifest.json"),
      `${JSON.stringify(plan, null, 2)}\n`,
      { mode: 0o600 },
    );
    writeFileSync(
      path.join(destination, "remote-promotion.sh"),
      sourceFileAtCommit(
        root,
        releaseManifest.gitSha,
        "scripts/deploy/remote-promotion.sh",
        runCommand,
      ),
      { mode: 0o600 },
    );
    runChecked(
      runCommand,
      "git",
      [
        "archive",
        "--format=tar",
        `--output=${path.join(destination, "source.tar")}`,
        releaseManifest.gitSha,
      ],
      { cwd: root },
      "create committed source archive",
    );
    if (
      sha256File(path.join(destination, "source.tar")) !==
      releaseManifest.artifact.sourceArchiveSha256
    ) {
      throw new Error(
        "committed source archive checksum does not match release",
      );
    }
    const checksumLines = TRANSFER_FILES.map(
      (file) => `${sha256File(path.join(destination, file))}  ${file}`,
    );
    writeFileSync(
      path.join(destination, "transfer-checksums.sha256"),
      `${checksumLines.join("\n")}\n`,
      { mode: 0o600 },
    );
    return {
      schemaVersion: "plush.promotion-transfer/v1",
      gitSha: releaseManifest.gitSha,
      version: releaseManifest.version,
      operationId: plan.operationId,
      imageDigests: Object.fromEntries(
        releaseManifest.images.map((image) => [image.kind, image.digest]),
      ),
      imageArchiveBytes: Object.fromEntries(
        artifact.images.map((image) => [image.kind, image.archive.sizeBytes]),
      ),
      buildPerformance: artifact?.performance?.build || null,
      files: [...TRANSFER_FILES, "transfer-checksums.sha256"],
      totalBytes: [...TRANSFER_FILES, "transfer-checksums.sha256"].reduce(
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

export function validateRemotePromotionReceipt(receipt, expected) {
  const beforeSha = String(receipt?.before?.runtimeSha || "");
  const serverContentId = String(receipt?.images?.serverContentId || "");
  const webContentId = String(receipt?.images?.webContentId || "");
  const backupSha256 = String(receipt?.rollbackPoint?.backupSha256 || "");
  const backupSizeBytes = receipt?.rollbackPoint?.backupSizeBytes;
  const optionalSha = (value) => value === "unknown" || SHA_PATTERN.test(value);
  const optionalImageId = (value) =>
    value === "unknown" || IMAGE_ID_PATTERN.test(value);
  const optionalBackup =
    (backupSha256 === "none" &&
      backupSizeBytes === 0 &&
      receipt?.rollbackPoint?.restoreChecked === false) ||
    (SHA256_PATTERN.test(backupSha256) &&
      Number.isSafeInteger(backupSizeBytes) &&
      backupSizeBytes > 0 &&
      receipt?.rollbackPoint?.restoreChecked === true);
  validateRemoteStageTimings({
    timings: receipt?.timings,
    status: receipt?.status,
    stage: receipt?.stage,
    durationMs: receipt?.durationMs,
    startedAt: receipt?.startedAt,
    finishedAt: receipt?.finishedAt,
    requiredStages: PROMOTION_STAGE_IDS,
  });
  if (
    !hasExactKeys(receipt, [
      "before",
      "checks",
      "durationMs",
      "finishedAt",
      "gitSha",
      "images",
      "issueCode",
      "migration",
      "notProven",
      "operationId",
      "promotionFingerprint",
      "redaction",
      "releaseManifestSha256",
      "rollbackPoint",
      "schemaVersion",
      "stage",
      "startedAt",
      "status",
      "target",
      "timings",
      "version",
    ]) ||
    !hasExactKeys(receipt?.before, ["runtimeSha"]) ||
    !hasExactKeys(receipt?.images, ["serverContentId", "webContentId"]) ||
    !hasExactKeys(receipt?.rollbackPoint, [
      "backupAlias",
      "backupSha256",
      "backupSizeBytes",
      "restoreChecked",
    ]) ||
    !hasExactKeys(receipt?.migration, [
      "applyStarted",
      "automaticDownMigration",
    ]) ||
    !hasExactKeys(receipt?.checks, [
      "basicSmoke",
      "health",
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
    receipt?.schemaVersion !== REMOTE_PROMOTION_RECEIPT_CONTRACT ||
    !["passed", "failed", "not_proven"].includes(receipt?.status) ||
    receipt?.operationId !== expected.operationId ||
    receipt?.target !== "test-133" ||
    receipt?.gitSha !== expected.gitSha ||
    receipt?.version !== expected.version ||
    receipt?.releaseManifestSha256 !== expected.releaseManifestSha256 ||
    receipt?.promotionFingerprint !== expected.promotionFingerprint ||
    !/^[a-z][a-z0-9_]{2,63}$/u.test(String(receipt?.stage || "")) ||
    !ISSUE_PATTERN.test(String(receipt?.issueCode || "")) ||
    receipt?.rollbackPoint?.backupAlias !==
      `pre-migration-${expected.gitSha.slice(0, 12)}-${expected.operationId}` ||
    typeof receipt?.migration?.applyStarted !== "boolean" ||
    !Array.isArray(receipt?.notProven) ||
    receipt.notProven.length !== 2 ||
    receipt.notProven.some(
      (item) => typeof item !== "string" || item.length > 100,
    ) ||
    typeof receipt?.finishedAt !== "string" ||
    Number.isNaN(Date.parse(receipt.finishedAt)) ||
    typeof receipt?.startedAt !== "string" ||
    Number.isNaN(Date.parse(receipt.startedAt)) ||
    Date.parse(receipt.finishedAt) < Date.parse(receipt.startedAt) ||
    !optionalSha(beforeSha) ||
    !optionalImageId(serverContentId) ||
    !optionalImageId(webContentId) ||
    !optionalBackup ||
    receipt?.migration?.automaticDownMigration !== false ||
    receipt?.redaction?.containsSecrets !== false ||
    receipt?.redaction?.containsCredentials !== false ||
    receipt?.redaction?.containsAbsolutePaths !== false ||
    receipt?.redaction?.containsRawEnvironmentValues !== false ||
    receipt?.redaction?.containsRawLogs !== false ||
    JSON.stringify(receipt).length > MAX_RECEIPT_BYTES
  ) {
    throw new Error("remote promotion receipt contract is invalid");
  }
  if (
    (receipt.status === "passed" &&
      (receipt.issueCode !== "none" ||
        !SHA_PATTERN.test(beforeSha) ||
        !IMAGE_ID_PATTERN.test(serverContentId) ||
        !IMAGE_ID_PATTERN.test(webContentId) ||
        !SHA256_PATTERN.test(backupSha256) ||
        backupSizeBytes <= 0 ||
        receipt.rollbackPoint.restoreChecked !== true ||
        receipt.checks?.releaseIdentity !== true ||
        receipt.checks?.health !== true ||
        receipt.checks?.ready !== true ||
        receipt.checks?.basicSmoke !== true)) ||
    (receipt.status !== "passed" && receipt.issueCode === "none")
  ) {
    throw new Error("remote promotion receipt status is inconsistent");
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

const PREPARE_REMOTE_INCOMING = String.raw`set -euo pipefail
umask 077
operation_id="$1"
[[ "$operation_id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]]
root=/home/simon/plush-toy-erp-v5
incoming_root=$root/incoming
incoming=$incoming_root/$operation_id
mkdir -p "$incoming_root"
chmod 700 "$incoming_root"
if [[ -e "$incoming" ]]; then
  [[ -d "$incoming" && ! -L "$incoming" ]]
  [[ -z "$(find "$incoming" -mindepth 1 -maxdepth 1 -print -quit)" ]]
else
  mkdir "$incoming"
fi
chmod 700 "$incoming"
`;

function terminalIssue(status) {
  if (status === "passed") return [];
  return [
    {
      code:
        status === "failed"
          ? "target_promotion_failed"
          : "target_promotion_outcome_unknown",
      level: "error",
      message:
        status === "failed"
          ? "目标发布在 migration 前失败，未自动重试"
          : "目标发布结果未知或已进入 migration，必须先读回",
    },
  ];
}

export function executePromotion(
  {
    repoRoot,
    operationId,
    bundleDir,
    releaseManifestPath,
    confirmation,
    operationStore,
  },
  {
    runCommand = spawnSync,
    runPreflight = runTargetPreflight,
    now = () => new Date().toISOString(),
  } = {},
) {
  if (!UUID_V4_PATTERN.test(String(operationId || ""))) {
    throw new Error("operation id is invalid");
  }
  const root = realpathSync(repoRoot || process.cwd());
  const store = operationStore || resolveDeliveryOperationStore(root);
  let operation = readDeliveryOperation(store, operationId);
  const plan = readPromotionPlan(store, operationId);
  if (
    !["ready", "launching"].includes(operation.status) ||
    !plan ||
    plan.status !== "eligible" ||
    operation.requestFingerprint === "" ||
    operation.gitSha !== plan.release.gitSha ||
    operation.version !== plan.release.version
  ) {
    throw new Error("promotion operation is not in the eligible ready state");
  }
  const expectedConfirmation = `PROMOTE:test-133:${operation.gitSha}:${operation.id}`;
  if (confirmation !== expectedConfirmation) {
    throw new Error(
      `explicit confirmation is required: ${expectedConfirmation}`,
    );
  }
  const immediatePreflight = runPreflight("test-133");
  if (immediatePreflight.status !== "passed") {
    operation = transitionDeliveryOperation(store, operation.id, {
      status: "blocked",
      message: "promotion was blocked by the immediate target preflight",
      issues: immediatePreflight.blockers.map((code) => ({
        code,
        level: "error",
        message: `目标即时预检阻断：${code}`,
      })),
      now: now(),
    });
    return {
      schemaVersion: "plush.promotion-execution/v1",
      operation,
      targetWriteStarted: false,
      receipt: null,
    };
  }

  const transferRoot = path.join(
    store,
    "transfers",
    `${operation.id}-${operation.requestFingerprint.slice(0, 12)}`,
  );
  const transfer = preparePromotionTransfer(
    {
      repoRoot: root,
      bundleDir,
      releaseManifestPath,
      promotionPlan: plan,
      destination: transferRoot,
    },
    { runCommand },
  );
  const target = getDeploymentTarget("test-133");
  const sshArgs = fixedSshArgs(target);
  assertLocalRsync(runCommand);
  const rsyncTransfer = buildFixedTargetRsyncTransfer({
    target,
    operationId: operation.id,
    sourceFiles: transfer.files.map((file) => path.join(transferRoot, file)),
  });
  operation = transitionDeliveryOperation(store, operation.id, {
    status: "running",
    message: "target write started with the fixed promotion contract",
    metadata: {
      ...operation.metadata,
      transferBytes: transfer.totalBytes,
    },
    now: now(),
  });
  let remoteStarted = false;
  let transferDurationMs = 0;
  let transferBytesPerSecond = 0;
  try {
    runChecked(
      runCommand,
      "ssh",
      [...sshArgs, "bash", "-s", "--", operation.id],
      {
        input: PREPARE_REMOTE_INCOMING,
        timeout: 30_000,
      },
      "prepare fixed remote incoming directory",
    );
    const transferStartedAt = Date.now();
    try {
      runChecked(
        runCommand,
        rsyncTransfer.command,
        rsyncTransfer.args,
        { timeout: 10 * 60_000 },
        "transfer immutable promotion package",
      );
    } finally {
      transferDurationMs = Math.max(1, Date.now() - transferStartedAt);
      transferBytesPerSecond = Math.round(
        (transfer.totalBytes * 1000) / transferDurationMs,
      );
    }
    remoteStarted = true;
    const remoteScript = `${target.filesystem.root}/incoming/${operation.id}/remote-promotion.sh`;
    const result = runCommand(
      "ssh",
      [
        ...sshArgs,
        "bash",
        remoteScript,
        "promote",
        operation.id,
        operation.gitSha,
        operation.version,
        plan.release.manifestSha256,
        plan.fingerprint,
        confirmation,
      ],
      {
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        timeout: 60 * 60_000,
      },
    );
    const rawReceipt = String(result.stdout || "").trim();
    let receipt;
    try {
      receipt = validateRemotePromotionReceipt(JSON.parse(rawReceipt), {
        operationId: operation.id,
        gitSha: operation.gitSha,
        version: operation.version,
        releaseManifestSha256: plan.release.manifestSha256,
        promotionFingerprint: plan.fingerprint,
      });
    } catch (error) {
      throw new Error(
        `remote receipt is unavailable or invalid: ${error.message}`,
      );
    }
    if (result.error) {
      throw new Error(`remote promotion SSH failed: ${result.error.message}`);
    }
    if (
      (result.status === 0) !== (receipt.status === "passed") &&
      !(result.status !== 0 && receipt.status !== "passed")
    ) {
      throw new Error("remote promotion exit status contradicts its receipt");
    }
    operation = transitionDeliveryOperation(store, operation.id, {
      status: receipt.status,
      message:
        receipt.status === "passed"
          ? "target promotion and basic runtime verification passed"
          : receipt.status === "failed"
            ? "target promotion failed before migration apply"
            : "target promotion outcome requires readback",
      issues: terminalIssue(receipt.status),
      metadata: {
        ...operation.metadata,
        remoteStage: receipt.stage,
        backupSha256: receipt.rollbackPoint.backupSha256,
        backupSizeBytes: receipt.rollbackPoint.backupSizeBytes,
        serverContentId: receipt.images.serverContentId,
        webContentId: receipt.images.webContentId,
        remoteStageTimings: receipt.timings,
        transferDurationMs,
        transferBytesPerSecond,
        serverArchiveBytes: transfer.imageArchiveBytes.server,
        webArchiveBytes: transfer.imageArchiveBytes.web,
        serverDigest: transfer.imageDigests.server,
        webDigest: transfer.imageDigests.web,
        buildPerformance: transfer.buildPerformance,
      },
      now: now(),
    });
    return {
      schemaVersion: "plush.promotion-execution/v1",
      operation,
      targetWriteStarted: true,
      receipt,
    };
  } catch (error) {
    const current = readDeliveryOperation(store, operation.id);
    if (current.status === "running") {
      operation = transitionDeliveryOperation(store, operation.id, {
        status: remoteStarted ? "not_proven" : "failed",
        message: remoteStarted
          ? "remote promotion result could not be proven; automatic retry is disabled"
          : "promotion package transfer failed before remote execution",
        issues: terminalIssue(remoteStarted ? "not_proven" : "failed"),
        metadata: {
          ...current.metadata,
          ...(transferDurationMs > 0
            ? { transferDurationMs, transferBytesPerSecond }
            : {}),
        },
        now: now(),
      });
    }
    throw error;
  }
}

function parseArgs(argv) {
  const options = {
    operationId: "",
    bundleDir: "",
    releaseManifest: "",
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
        "--bundle-dir",
        "--release-manifest",
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
      !options.bundleDir ||
      !options.releaseManifest ||
      !options.confirmation)
  ) {
    throw new Error(
      "--operation-id, --bundle-dir, --release-manifest and --confirmation are required",
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
  node scripts/deploy/promotion-executor.mjs \\
    --operation-id <uuid-v4> \\
    --bundle-dir <immutable-release-directory> \\
    --release-manifest <release-manifest.json> \\
    --confirmation PROMOTE:test-133:<sha>:<operation-id> [--json]

The operation must already be ready. A terminal or unknown operation is never
automatically retried. The browser-facing Bridge chooses all local paths.`);
      process.exit(0);
    }
    const report = executePromotion({
      repoRoot: process.cwd(),
      operationId: options.operationId,
      bundleDir: options.bundleDir,
      releaseManifestPath: options.releaseManifest,
      confirmation: options.confirmation,
    });
    console.log(
      options.json
        ? JSON.stringify(report, null, 2)
        : `promotion ${report.operation.status}: ${report.operation.id}`,
    );
    process.exit(report.operation.status === "passed" ? 0 : 2);
  } catch (error) {
    console.error(`[promotion-executor] ${error.message}`);
    process.exit(1);
  }
}
