#!/usr/bin/env node

import { randomBytes } from "node:crypto";
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

import { readDatabaseRebuildPlan } from "./database-rebuild-controller.mjs";
import { validateDatabaseRebuildManifest } from "./database-rebuild-manifest.mjs";
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
import { sha256File, validateReleaseManifest } from "./release-catalog.mjs";
import { runTargetPreflight } from "./target-preflight.mjs";
import { classifyGitAncestryRelation } from "./git-ancestry-relation.mjs";

export const REMOTE_DATABASE_REBUILD_RECEIPT_CONTRACT =
  "plush.remote-database-rebuild-receipt/v1";
export const DATABASE_REBUILD_RECEIPT_FILE_SUFFIX = ".database-rebuild.json";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const ISSUE_PATTERN = /^(?:none|[a-z][a-z0-9_]{2,63})$/u;
const SYSTEM_IDENTIFIER_PATTERN = /^(?:unknown|[0-9]{10,24})$/u;
const MAX_RECEIPT_BYTES = 256 * 1024;
const PUBLIC_TRANSFER_FILES = Object.freeze([
  "release-manifest.json",
  "database-rebuild-manifest.json",
  "remote-database-rebuild.sh",
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

function readReleaseManifest(file) {
  const absolute = realpathSync(file);
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 512 * 1024) {
    throw new Error("database rebuild release manifest is invalid");
  }
  return {
    absolute,
    manifest: validateReleaseManifest(
      JSON.parse(readFileSync(absolute, "utf8")),
    ),
  };
}

function generateBootstrapSecret() {
  return `R${randomBytes(7).toString("hex")}a9!`;
}

export function prepareDatabaseRebuildTransfer(
  { repoRoot, releaseManifestPath, databaseRebuildPlan, destination },
  { runCommand = spawnSync, createSecret = generateBootstrapSecret } = {},
) {
  const root = realpathSync(repoRoot);
  const plan = validateDatabaseRebuildManifest(databaseRebuildPlan);
  if (plan.status !== "eligible") {
    throw new Error(
      "only an eligible database rebuild plan can be transferred",
    );
  }
  const release = readReleaseManifest(releaseManifestPath);
  if (
    release.manifest.gitSha !== plan.release.gitSha ||
    release.manifest.version !== plan.release.version ||
    sha256File(release.absolute) !== plan.release.manifestSha256
  ) {
    throw new Error(
      "release manifest does not match the database rebuild plan",
    );
  }
  runChecked(
    runCommand,
    "git",
    ["cat-file", "-e", `${plan.release.gitSha}^{commit}`],
    { cwd: root },
    "verify database rebuild release commit",
  );
  runChecked(
    runCommand,
    "git",
    ["merge-base", "--is-ancestor", plan.release.gitSha, "origin/main"],
    { cwd: root },
    "verify database rebuild release is reachable from origin/main",
  );
  if (existsSync(destination)) {
    throw new Error("database rebuild transfer destination already exists");
  }
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  try {
    copyFileSync(
      release.absolute,
      path.join(destination, "release-manifest.json"),
    );
    writeFileSync(
      path.join(destination, "database-rebuild-manifest.json"),
      `${JSON.stringify(plan, null, 2)}\n`,
      { mode: 0o600 },
    );
    const remoteScript = runChecked(
      runCommand,
      "git",
      [
        "show",
        `${plan.release.gitSha}:scripts/deploy/remote-database-rebuild.sh`,
      ],
      { cwd: root },
      "read committed database rebuild script",
    );
    writeFileSync(
      path.join(destination, "remote-database-rebuild.sh"),
      String(remoteScript.stdout || ""),
      { mode: 0o600 },
    );
    const checksumLines = PUBLIC_TRANSFER_FILES.map(
      (file) => `${sha256File(path.join(destination, file))}  ${file}`,
    );
    writeFileSync(
      path.join(destination, "transfer-checksums.sha256"),
      `${checksumLines.join("\n")}\n`,
      { mode: 0o600 },
    );
    const secret = String(createSecret());
    if (
      secret.length < 12 ||
      secret.length > 20 ||
      !/[A-Z]/u.test(secret) ||
      !/[a-z]/u.test(secret) ||
      !/[0-9]/u.test(secret)
    ) {
      throw new Error(
        "generated bootstrap secret does not satisfy the contract",
      );
    }
    const secretFile = path.join(destination, "bootstrap-admin.secret");
    writeFileSync(secretFile, secret, { mode: 0o600 });
    const files = [
      ...PUBLIC_TRANSFER_FILES,
      "transfer-checksums.sha256",
      "bootstrap-admin.secret",
    ];
    return {
      schemaVersion: "plush.database-rebuild-transfer/v1",
      operationId: plan.operationId,
      gitSha: plan.release.gitSha,
      version: plan.release.version,
      files,
      secretFile,
      totalBytes: files.reduce(
        (total, file) => total + statSync(path.join(destination, file)).size,
        0,
      ),
      redaction: {
        containsSecrets: true,
        secretExcludedFromChecksumsAndReceipts: true,
        containsCredentialsInPublicFiles: false,
      },
    };
  } catch (error) {
    rmSync(destination, { recursive: true, force: true });
    throw error;
  }
}

export function validateRemoteDatabaseRebuildReceipt(receipt, expected) {
  const backupSha256 = String(receipt?.rollbackPoint?.backupSha256 || "");
  const backupSizeBytes = receipt?.rollbackPoint?.backupSizeBytes;
  const beforeSystem = String(receipt?.database?.systemIdentifierBefore || "");
  const afterSystem = String(receipt?.database?.systemIdentifierAfter || "");
  const optionalBackup =
    (backupSha256 === "none" &&
      backupSizeBytes === 0 &&
      receipt?.rollbackPoint?.restoreChecked === false) ||
    (SHA256_PATTERN.test(backupSha256) &&
      Number.isSafeInteger(backupSizeBytes) &&
      backupSizeBytes > 0 &&
      receipt?.rollbackPoint?.restoreChecked === true);
  if (
    !hasExactKeys(receipt, [
      "bootstrap",
      "checks",
      "database",
      "databaseRebuildFingerprint",
      "finishedAt",
      "gitSha",
      "issueCode",
      "migration",
      "notProven",
      "operationId",
      "redaction",
      "releaseManifestSha256",
      "rollbackPoint",
      "schemaVersion",
      "stage",
      "status",
      "target",
      "version",
    ]) ||
    !hasExactKeys(receipt?.database, [
      "automaticDeletion",
      "dataSwitchStarted",
      "freshDirectoryActive",
      "logicalName",
      "predecessorPreserved",
      "predecessorRecovered",
      "previousDataAlias",
      "systemIdentifierAfter",
      "systemIdentifierBefore",
    ]) ||
    !hasExactKeys(receipt?.rollbackPoint, [
      "backupAlias",
      "backupSha256",
      "backupSizeBytes",
      "restoreChecked",
    ]) ||
    !hasExactKeys(receipt?.migration, [
      "applyStarted",
      "automaticDownMigration",
      "readback",
    ]) ||
    !hasExactKeys(receipt?.bootstrap, [
      "completed",
      "secretPersistedOnTarget",
      "started",
    ]) ||
    !hasExactKeys(receipt?.checks, [
      "emptyBusinessBaseline",
      "freshDatabase",
      "health",
      "ready",
      "releaseIdentity",
      "webHealth",
    ]) ||
    !hasExactKeys(receipt?.redaction, [
      "containsAbsolutePaths",
      "containsCredentials",
      "containsRawEnvironmentValues",
      "containsRawLogs",
      "containsSecrets",
    ]) ||
    receipt?.schemaVersion !== REMOTE_DATABASE_REBUILD_RECEIPT_CONTRACT ||
    !["passed", "failed", "not_proven"].includes(receipt?.status) ||
    receipt?.operationId !== expected.operationId ||
    receipt?.target !== expected.targetKey ||
    receipt?.gitSha !== expected.gitSha ||
    receipt?.version !== expected.version ||
    receipt?.releaseManifestSha256 !== expected.releaseManifestSha256 ||
    receipt?.databaseRebuildFingerprint !==
      expected.databaseRebuildFingerprint ||
    receipt?.database?.logicalName !== expected.databaseName ||
    receipt?.database?.previousDataAlias !==
      `rollback-${expected.gitSha.slice(0, 12)}-${expected.operationId.slice(0, 8)}` ||
    receipt?.database?.automaticDeletion !== false ||
    receipt?.migration?.automaticDownMigration !== false ||
    receipt?.bootstrap?.secretPersistedOnTarget !== false ||
    typeof receipt?.database?.dataSwitchStarted !== "boolean" ||
    typeof receipt?.database?.predecessorRecovered !== "boolean" ||
    typeof receipt?.database?.predecessorPreserved !== "boolean" ||
    typeof receipt?.database?.freshDirectoryActive !== "boolean" ||
    typeof receipt?.migration?.applyStarted !== "boolean" ||
    typeof receipt?.bootstrap?.started !== "boolean" ||
    typeof receipt?.bootstrap?.completed !== "boolean" ||
    !optionalBackup ||
    !ISSUE_PATTERN.test(String(receipt?.issueCode || "")) ||
    !/^[a-z][a-z0-9_]{2,63}$/u.test(String(receipt?.stage || "")) ||
    !SYSTEM_IDENTIFIER_PATTERN.test(beforeSystem) ||
    !SYSTEM_IDENTIFIER_PATTERN.test(afterSystem) ||
    !Array.isArray(receipt?.notProven) ||
    receipt.notProven.length !== 4 ||
    receipt?.redaction?.containsSecrets !== false ||
    receipt?.redaction?.containsCredentials !== false ||
    receipt?.redaction?.containsAbsolutePaths !== false ||
    receipt?.redaction?.containsRawEnvironmentValues !== false ||
    receipt?.redaction?.containsRawLogs !== false ||
    typeof receipt?.finishedAt !== "string" ||
    Number.isNaN(Date.parse(receipt.finishedAt)) ||
    JSON.stringify(receipt).length > MAX_RECEIPT_BYTES
  ) {
    throw new Error("remote database rebuild receipt contract is invalid");
  }
  if (
    (receipt.status === "passed" &&
      (receipt.issueCode !== "none" ||
        !SHA256_PATTERN.test(backupSha256) ||
        !Number.isSafeInteger(backupSizeBytes) ||
        backupSizeBytes <= 0 ||
        receipt.rollbackPoint.restoreChecked !== true ||
        !receipt.database.dataSwitchStarted ||
        receipt.database.predecessorRecovered ||
        !receipt.database.predecessorPreserved ||
        !receipt.database.freshDirectoryActive ||
        beforeSystem === afterSystem ||
        beforeSystem === "unknown" ||
        afterSystem === "unknown" ||
        receipt.migration.readback !== expected.migration ||
        !receipt.migration.applyStarted ||
        !receipt.bootstrap.started ||
        !receipt.bootstrap.completed ||
        Object.values(receipt.checks).some((value) => value !== true))) ||
    (receipt.status !== "passed" && receipt.issueCode === "none")
  ) {
    throw new Error("remote database rebuild receipt status is inconsistent");
  }
  return receipt;
}

function persistDatabaseRebuildReceipt(store, receipt) {
  const operationId = String(receipt?.operationId || "");
  if (!UUID_V4_PATTERN.test(operationId)) {
    throw new Error("database rebuild receipt operation id is invalid");
  }
  const directory = path.join(store, "receipts");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(
    directory,
    `${operationId}${DATABASE_REBUILD_RECEIPT_FILE_SUFFIX}`,
  );
  writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return file;
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
target="$2"
[[ "$operation_id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]]
case "$target" in
  demo-133) root=/home/simon/plush-toy-erp-demo-v1 ;;
  customer-test-133) root=/home/simon/plush-toy-erp-test-v1 ;;
  *) exit 64 ;;
esac
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

const REMOVE_REMOTE_BOOTSTRAP_SECRET = String.raw`set -euo pipefail
umask 077
operation_id="$1"
target="$2"
[[ "$operation_id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]]
case "$target" in
  demo-133) root=/home/simon/plush-toy-erp-demo-v1 ;;
  customer-test-133) root=/home/simon/plush-toy-erp-test-v1 ;;
  *) exit 64 ;;
esac
incoming=$root/incoming/$operation_id
if [[ -e "$incoming" ]]; then
  [[ -d "$incoming" && ! -L "$incoming" ]]
  [[ "$(stat -c '%u' "$incoming")" == "$(id -u)" ]]
  secret=$incoming/bootstrap-admin.secret
  if [[ -e "$secret" ]]; then
    [[ -f "$secret" && ! -L "$secret" ]]
    [[ "$(stat -c '%u' "$secret")" == "$(id -u)" ]]
    rm -f -- "$secret"
  fi
fi
`;

function terminalIssue(status) {
  if (status === "passed") return [];
  return [
    {
      code:
        status === "failed"
          ? "target_database_rebuild_failed"
          : "target_database_rebuild_outcome_unknown",
      level: "error",
      message:
        status === "failed"
          ? "目标数据库重建在可恢复边界内失败，未自动重试"
          : "目标数据库重建已进入切换或 migration，必须先读回",
    },
  ];
}

export function executeDatabaseRebuild(
  { repoRoot, operationId, releaseManifestPath, confirmation, operationStore },
  {
    runCommand = spawnSync,
    runPreflight = runTargetPreflight,
    classifyRelation = classifyGitAncestryRelation,
    now = () => new Date().toISOString(),
    createSecret = generateBootstrapSecret,
  } = {},
) {
  if (!UUID_V4_PATTERN.test(String(operationId || ""))) {
    throw new Error("operation id is invalid");
  }
  const root = realpathSync(repoRoot || process.cwd());
  const store = operationStore || resolveDeliveryOperationStore(root);
  let operation = readDeliveryOperation(store, operationId);
  const plan = readDatabaseRebuildPlan(store, operationId);
  if (
    !["ready", "launching"].includes(operation.status) ||
    !plan ||
    plan.status !== "eligible" ||
    operation.action !== "rebuild-database" ||
    operation.gitSha !== plan.release.gitSha ||
    operation.version !== plan.release.version
  ) {
    throw new Error("database rebuild operation is not eligible and ready");
  }
  const expectedConfirmation = `REBUILD_DATABASE:${plan.target.key}:${operation.gitSha}:${operation.id}`;
  if (confirmation !== expectedConfirmation) {
    throw new Error(
      `explicit confirmation is required: ${expectedConfirmation}`,
    );
  }
  const immediatePreflight = runPreflight(plan.target.key);
  const immediateRuntime = immediatePreflight.remote?.runtime;
  const immediateBlockers = [...(immediatePreflight.blockers || [])];
  if (
    immediateRuntime?.serverSha !== operation.gitSha ||
    immediateRuntime?.webSha !== operation.gitSha
  ) {
    immediateBlockers.push("database_rebuild_runtime_release_mismatch");
  }
  if (immediateRuntime?.databaseName !== plan.target.database) {
    immediateBlockers.push("database_rebuild_target_database_mismatch");
  }
  try {
    const immediateAncestry = classifyRelation({
      repoRoot: root,
      currentGitSha: immediateRuntime?.serverSha,
      candidateGitSha: plan.release.gitSha,
    });
    if (
      immediateAncestry.actionClass !== "current" ||
      JSON.stringify(immediateAncestry) !== JSON.stringify(plan.ancestry)
    ) {
      immediateBlockers.push("database_rebuild_git_relation_not_current");
    }
  } catch {
    immediateBlockers.push("database_rebuild_git_relation_not_current");
  }
  if (
    immediatePreflight.status !== "passed" &&
    immediateBlockers.length === 0
  ) {
    immediateBlockers.push("database_rebuild_target_preflight_blocked");
  }
  if (immediatePreflight.status !== "passed" || immediateBlockers.length > 0) {
    operation = transitionDeliveryOperation(store, operation.id, {
      status: "blocked",
      message: "database rebuild was blocked by the immediate target preflight",
      issues: [...new Set(immediateBlockers)].map((code) => ({
        code,
        level: "error",
        message: `目标即时预检阻断：${code}`,
      })),
      now: now(),
    });
    return {
      schemaVersion: "plush.database-rebuild-execution/v1",
      operation,
      targetWriteStarted: false,
      receipt: null,
      bootstrapSecretFile: null,
    };
  }

  const transferRoot = path.join(
    store,
    "transfers",
    `${operation.id}-${operation.requestFingerprint.slice(0, 12)}-database-rebuild`,
  );
  const transfer = prepareDatabaseRebuildTransfer(
    {
      repoRoot: root,
      releaseManifestPath,
      databaseRebuildPlan: plan,
      destination: transferRoot,
    },
    { runCommand, createSecret },
  );
  const target = getDeploymentTarget(plan.target.key);
  const sshArgs = fixedSshArgs(target);
  assertLocalRsync(runCommand);
  const rsyncTransfer = buildFixedTargetRsyncTransfer({
    target,
    operationId: operation.id,
    sourceFiles: transfer.files.map((file) => path.join(transferRoot, file)),
  });
  operation = transitionDeliveryOperation(store, operation.id, {
    status: "running",
    message: "target write started with the fixed database rebuild contract",
    metadata: {
      ...operation.metadata,
      transferBytes: transfer.totalBytes,
    },
    now: now(),
  });
  let remoteIncomingPrepared = false;
  let remoteExecutionInvoked = false;
  try {
    runChecked(
      runCommand,
      "ssh",
      [...sshArgs, "bash", "-s", "--", operation.id, target.key],
      { input: PREPARE_REMOTE_INCOMING, timeout: 30_000 },
      "prepare fixed remote database rebuild directory",
    );
    remoteIncomingPrepared = true;
    runChecked(
      runCommand,
      rsyncTransfer.command,
      rsyncTransfer.args,
      { timeout: 10 * 60_000 },
      "transfer fixed database rebuild package",
    );
    const remoteScript = `${target.filesystem.root}/incoming/${operation.id}/remote-database-rebuild.sh`;
    remoteExecutionInvoked = true;
    const result = runCommand(
      "ssh",
      [
        ...sshArgs,
        "bash",
        remoteScript,
        "rebuild-database",
        target.key,
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
      receipt = validateRemoteDatabaseRebuildReceipt(JSON.parse(rawReceipt), {
        operationId: operation.id,
        targetKey: target.key,
        databaseName: target.database.name,
        gitSha: operation.gitSha,
        version: operation.version,
        migration: plan.release.migration.latest,
        releaseManifestSha256: plan.release.manifestSha256,
        databaseRebuildFingerprint: plan.fingerprint,
      });
    } catch (error) {
      throw new Error(
        `remote receipt is unavailable or invalid: ${error.message}`,
      );
    }
    if (result.error) {
      throw new Error(
        `remote database rebuild SSH failed: ${result.error.message}`,
      );
    }
    if (
      (result.status === 0) !== (receipt.status === "passed") &&
      !(result.status !== 0 && receipt.status !== "passed")
    ) {
      throw new Error(
        "remote database rebuild exit status contradicts its receipt",
      );
    }
    const receiptFile = persistDatabaseRebuildReceipt(store, receipt);
    const receiptSha256 = sha256File(receiptFile);
    if (receipt.status !== "passed" && existsSync(transfer.secretFile)) {
      rmSync(transfer.secretFile);
    }
    operation = transitionDeliveryOperation(store, operation.id, {
      status: receipt.status,
      message:
        receipt.status === "passed"
          ? "fresh database generation and basic runtime verification passed"
          : receipt.status === "failed"
            ? "database rebuild failed within a recovered boundary"
            : "database rebuild outcome requires target readback",
      issues: terminalIssue(receipt.status),
      metadata: {
        ...operation.metadata,
        remoteStage: receipt.stage,
        backupSha256: receipt.rollbackPoint.backupSha256,
        backupSizeBytes: receipt.rollbackPoint.backupSizeBytes,
        migrationReadback: receipt.migration.readback,
        predecessorPreserved: receipt.database.predecessorPreserved,
        databaseRebuildReceiptFile: path.relative(store, receiptFile),
        databaseRebuildReceiptSha256: receiptSha256,
      },
      now: now(),
    });
    return {
      schemaVersion: "plush.database-rebuild-execution/v1",
      operation,
      targetWriteStarted: true,
      receipt,
      databaseRebuildReceiptFile: path.relative(root, receiptFile),
      databaseRebuildReceiptSha256: receiptSha256,
      bootstrapSecretFile:
        receipt.status === "passed"
          ? path.relative(root, transfer.secretFile)
          : null,
    };
  } catch (error) {
    let localSecretCleanupProven = true;
    if (existsSync(transfer.secretFile)) {
      try {
        rmSync(transfer.secretFile);
      } catch {
        localSecretCleanupProven = false;
      }
    }
    let remoteSecretCleanupProven = !remoteIncomingPrepared;
    if (remoteIncomingPrepared) {
      try {
        runChecked(
          runCommand,
          "ssh",
          [...sshArgs, "bash", "-s", "--", operation.id, target.key],
          { input: REMOVE_REMOTE_BOOTSTRAP_SECRET, timeout: 30_000 },
          "remove fixed remote database rebuild bootstrap secret",
        );
        remoteSecretCleanupProven = true;
      } catch {
        remoteSecretCleanupProven = false;
      }
    }
    const outcomeUnknown =
      remoteExecutionInvoked ||
      !localSecretCleanupProven ||
      !remoteSecretCleanupProven;
    const current = readDeliveryOperation(store, operation.id);
    if (current.status === "running") {
      operation = transitionDeliveryOperation(store, operation.id, {
        status: outcomeUnknown ? "not_proven" : "failed",
        message: outcomeUnknown
          ? "remote database rebuild result is unproven; automatic retry is disabled"
          : "database rebuild transfer failed before remote execution",
        issues: terminalIssue(outcomeUnknown ? "not_proven" : "failed"),
        now: now(),
      });
    }
    if (!localSecretCleanupProven || !remoteSecretCleanupProven) {
      throw new Error(`${error.message}; bootstrap secret cleanup is unproven`);
    }
    throw error;
  }
}

function parseArgs(argv) {
  const options = {
    operationId: "",
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
      ["--operation-id", "--release-manifest", "--confirmation"].includes(token)
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
    (!options.operationId || !options.releaseManifest || !options.confirmation)
  ) {
    throw new Error(
      "--operation-id, --release-manifest and --confirmation are required",
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
  node scripts/deploy/database-rebuild-executor.mjs \\
    --operation-id <uuid-v4> \\
    --release-manifest <release-manifest.json> \\
    --confirmation REBUILD_DATABASE:<target>:<sha>:<operation-id> [--json]

The operation must already be ready. The executor retains the predecessor data
directory and backup, never deletes a database generation, and never retries an
unknown switch or migration outcome.`);
      process.exit(0);
    }
    const report = executeDatabaseRebuild({
      repoRoot: process.cwd(),
      operationId: options.operationId,
      releaseManifestPath: options.releaseManifest,
      confirmation: options.confirmation,
    });
    console.log(
      options.json
        ? JSON.stringify(report, null, 2)
        : `database rebuild ${report.operation.status}: ${report.operation.id}`,
    );
    process.exit(report.operation.status === "passed" ? 0 : 2);
  } catch (error) {
    console.error(`[database-rebuild-executor] ${error.message}`);
    process.exit(1);
  }
}
