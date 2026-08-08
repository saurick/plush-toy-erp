import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

export const DEV_QUALITY_GATE_OPERATION_SCHEMA =
  "plush.dev-quality-gate-operation/v1";
export const DEV_QUALITY_GATE_PROFILES = Object.freeze(["full", "strict"]);
export const DEV_QUALITY_GATE_ACTIVE_STATUSES = Object.freeze([
  "queued",
  "running",
  "cancelling",
]);
export const DEV_QUALITY_GATE_TERMINAL_STATUSES = Object.freeze([
  "passed",
  "failed",
  "cancelled",
  "timed_out",
  "blocked",
  "not_proven",
]);
export const DEV_QUALITY_GATE_STAGE_IDS = Object.freeze([
  "queued",
  "preparing",
  "strict_profile",
  "shellcheck",
  "shfmt",
  "yamllint",
  "environment_profile",
  "shared",
  "secrets",
  "web",
  "browser",
  "server",
  "govulncheck",
  "cleanup",
  "finished",
]);
export const DEV_QUALITY_GATE_HISTORY_LIMIT_PER_PROFILE = 20;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const IDEMPOTENCY_PATTERN =
  /^quality-gate:(full|strict):([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const HASH_PATTERN = /^[0-9a-f]{64}$/u;
const MAX_RECORD_BYTES = 256 * 1024;
const STAGE_STATUS_VALUES = Object.freeze([
  "pending",
  "running",
  "passed",
  "failed",
]);
const CLEANUP_STATUS_VALUES = Object.freeze([
  "pending",
  "complete",
  "failed",
  "not_required",
]);
const STATUS_TRANSITIONS = Object.freeze({
  queued: new Set(["running", "blocked", "failed", "not_proven"]),
  running: new Set([
    "running",
    "cancelling",
    "passed",
    "failed",
    "timed_out",
    "not_proven",
  ]),
  cancelling: new Set(["cancelled", "timed_out", "failed", "not_proven"]),
  passed: new Set(),
  failed: new Set(),
  cancelled: new Set(),
  timed_out: new Set(),
  blocked: new Set(),
  not_proven: new Set(),
});

function assertExactKeys(value, expected, field) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${field} must be a plain object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new Error(`${field} contains unsupported fields`);
  }
  return value;
}

function assertSafeText(value, field, { allowEmpty = false, max = 1000 } = {}) {
  if (
    typeof value !== "string" ||
    (!allowEmpty && value.length < 1) ||
    value.length > max ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    /(?:password|secret|token|authorization|cookie|dsn)/iu.test(value) ||
    /(?:^|[\s"'=])(?:[A-Za-z]:[\\/]|\\\\|\/(?:Users|home|private|var|tmp)\/)/u.test(
      value,
    ) ||
    /(?:^|[\s"'=])[a-z][a-z0-9+.-]*:\/\//iu.test(value)
  ) {
    throw new Error(`${field} contains unsafe content`);
  }
  return value;
}

function isIsoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function validateRepository(repository) {
  assertExactKeys(
    repository,
    ["commit", "dirty", "fingerprint"],
    "quality gate repository",
  );
  if (
    !COMMIT_PATTERN.test(repository.commit) ||
    typeof repository.dirty !== "boolean" ||
    !HASH_PATTERN.test(repository.fingerprint)
  ) {
    throw new Error("quality gate repository is invalid");
  }
  return repository;
}

function validateStageTiming(stage) {
  assertExactKeys(
    stage,
    ["durationMs", "finishedAt", "id", "label", "startedAt", "status"],
    "quality gate stage timing",
  );
  if (
    !DEV_QUALITY_GATE_STAGE_IDS.includes(stage.id) ||
    !STAGE_STATUS_VALUES.includes(stage.status) ||
    !isIsoDate(stage.startedAt) ||
    (stage.finishedAt !== null && !isIsoDate(stage.finishedAt)) ||
    (stage.durationMs !== null &&
      (!Number.isSafeInteger(stage.durationMs) || stage.durationMs < 0)) ||
    (stage.status === "running" &&
      (stage.finishedAt !== null || stage.durationMs !== null)) ||
    (["passed", "failed"].includes(stage.status) &&
      (!isIsoDate(stage.finishedAt) || stage.durationMs === null))
  ) {
    throw new Error("quality gate stage timing is invalid");
  }
  assertSafeText(stage.label, "quality gate stage label", { max: 120 });
  return stage;
}

function validateCleanup(cleanup) {
  assertExactKeys(cleanup, ["message", "status"], "quality gate cleanup");
  if (!CLEANUP_STATUS_VALUES.includes(cleanup.status)) {
    throw new Error("quality gate cleanup is invalid");
  }
  assertSafeText(cleanup.message, "quality gate cleanup message", {
    max: 300,
  });
  return cleanup;
}

function validateReceipt(receipt, profile) {
  if (receipt === null) return null;
  assertExactKeys(
    receipt,
    [
      "bottleneckStageId",
      "durationMs",
      "environmentFingerprint",
      "executed",
      "failed",
      "finishedAt",
      "gitCommit",
      "passed",
      "profile",
      "skipped",
      "stageTimings",
      "status",
      "treeState",
    ],
    "quality gate receipt projection",
  );
  if (
    receipt.profile !== profile ||
    !["passed", "failed"].includes(receipt.status) ||
    !COMMIT_PATTERN.test(receipt.gitCommit) ||
    !["clean", "dirty"].includes(receipt.treeState) ||
    !isIsoDate(receipt.finishedAt) ||
    !HASH_PATTERN.test(receipt.environmentFingerprint) ||
    (receipt.bottleneckStageId !== "" &&
      !DEV_QUALITY_GATE_STAGE_IDS.includes(receipt.bottleneckStageId)) ||
    !["durationMs", "executed", "passed", "failed", "skipped"].every(
      (field) => Number.isSafeInteger(receipt[field]) && receipt[field] >= 0,
    ) ||
    !Array.isArray(receipt.stageTimings)
  ) {
    throw new Error("quality gate receipt projection is invalid");
  }
  receipt.stageTimings.forEach(validateStageTiming);
  return receipt;
}

export function validateDevQualityGateOperation(operation) {
  assertExactKeys(
    operation,
    [
      "cancelRequestedAt",
      "cleanup",
      "createdAt",
      "finishedAt",
      "firstFailure",
      "id",
      "idempotencyKey",
      "message",
      "profile",
      "receipt",
      "repository",
      "revision",
      "schemaVersion",
      "stage",
      "stageTimings",
      "status",
      "updatedAt",
    ],
    "quality gate operation",
  );
  const keyMatch = IDEMPOTENCY_PATTERN.exec(
    String(operation.idempotencyKey || ""),
  );
  const terminal = DEV_QUALITY_GATE_TERMINAL_STATUSES.includes(
    operation.status,
  );
  if (
    operation.schemaVersion !== DEV_QUALITY_GATE_OPERATION_SCHEMA ||
    !UUID_PATTERN.test(String(operation.id || "")) ||
    !DEV_QUALITY_GATE_PROFILES.includes(operation.profile) ||
    keyMatch?.[1] !== operation.profile ||
    !Object.hasOwn(STATUS_TRANSITIONS, operation.status) ||
    !DEV_QUALITY_GATE_STAGE_IDS.includes(operation.stage) ||
    !Number.isSafeInteger(operation.revision) ||
    operation.revision < 1 ||
    !isIsoDate(operation.createdAt) ||
    !isIsoDate(operation.updatedAt) ||
    (terminal &&
      (operation.stage !== "finished" || !isIsoDate(operation.finishedAt))) ||
    (!terminal && operation.finishedAt !== null) ||
    (operation.cancelRequestedAt !== null &&
      !isIsoDate(operation.cancelRequestedAt)) ||
    (["cancelling", "cancelled"].includes(operation.status) &&
      !isIsoDate(operation.cancelRequestedAt)) ||
    !Array.isArray(operation.stageTimings)
  ) {
    throw new Error("quality gate operation is invalid");
  }
  validateRepository(operation.repository);
  assertSafeText(operation.message, "quality gate operation message");
  assertSafeText(operation.firstFailure, "quality gate first failure", {
    allowEmpty: true,
  });
  const seenStages = new Set();
  for (const stage of operation.stageTimings) {
    validateStageTiming(stage);
    if (seenStages.has(stage.id)) {
      throw new Error("quality gate stage timing is duplicated");
    }
    seenStages.add(stage.id);
  }
  validateCleanup(operation.cleanup);
  validateReceipt(operation.receipt, operation.profile);
  if (
    operation.status === "passed" &&
    (operation.receipt?.status !== "passed" ||
      operation.cleanup.status !== "complete")
  ) {
    throw new Error("passed quality gate operation lacks complete proof");
  }
  return operation;
}

function ensureDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stats = lstatSync(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("quality gate operation directory is invalid");
  }
}

function readPrivateJson(file) {
  const stats = lstatSync(file);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.size > MAX_RECORD_BYTES
  ) {
    throw new Error("quality gate operation record is invalid");
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

function writePrivateJson(file, value, { overwrite = false } = {}) {
  ensureDirectory(path.dirname(file));
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    if (!overwrite && existsSync(file)) {
      throw new Error("quality gate operation record already exists");
    }
    renameSync(temporary, file);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function resolveDevQualityGateOperationStore(repoRoot) {
  return path.join(
    path.resolve(repoRoot || process.cwd()),
    "output",
    "dev-workbench",
    "quality-gate-operations",
  );
}

function operationFile(store, operationId) {
  if (!UUID_PATTERN.test(String(operationId || ""))) {
    throw new Error("quality gate operation id is invalid");
  }
  return path.join(store, "operations", `${operationId}.json`);
}

export function readDevQualityGateOperation(store, operationId) {
  return validateDevQualityGateOperation(
    readPrivateJson(operationFile(store, operationId)),
  );
}

export function listDevQualityGateOperations(store, { limit = 40 } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error("quality gate operation list limit is invalid");
  }
  const directory = path.join(store, "operations");
  if (!existsSync(directory)) return [];
  const stats = lstatSync(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("quality gate operation list directory is invalid");
  }
  return readdirSync(directory)
    .filter((entry) => UUID_PATTERN.test(entry.replace(/\.json$/u, "")))
    .map((entry) =>
      readDevQualityGateOperation(store, entry.replace(/\.json$/u, "")),
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit);
}

export function readDevQualityGateOperationByIdempotencyKey(
  store,
  idempotencyKey,
) {
  if (!IDEMPOTENCY_PATTERN.test(String(idempotencyKey || ""))) {
    throw new Error("quality gate idempotency key is invalid");
  }
  return (
    listDevQualityGateOperations(store, { limit: 1000 }).find(
      (operation) => operation.idempotencyKey === idempotencyKey,
    ) || null
  );
}

function pruneDevQualityGateHistory(store) {
  for (const profile of DEV_QUALITY_GATE_PROFILES) {
    const terminal = listDevQualityGateOperations(store, { limit: 1000 })
      .filter(
        (operation) =>
          operation.profile === profile &&
          DEV_QUALITY_GATE_TERMINAL_STATUSES.includes(operation.status),
      )
      .slice(DEV_QUALITY_GATE_HISTORY_LIMIT_PER_PROFILE);
    for (const operation of terminal) {
      unlinkSync(operationFile(store, operation.id));
    }
  }
}

export function createOrReuseDevQualityGateOperation(
  store,
  {
    profile,
    idempotencyKey,
    repository,
    operationId = randomUUID(),
    now = new Date().toISOString(),
  },
) {
  const existing = readDevQualityGateOperationByIdempotencyKey(
    store,
    idempotencyKey,
  );
  if (existing) return { operation: existing, reused: true };
  const operation = validateDevQualityGateOperation({
    schemaVersion: DEV_QUALITY_GATE_OPERATION_SCHEMA,
    id: operationId,
    idempotencyKey,
    profile,
    repository,
    status: "queued",
    stage: "queued",
    stageTimings: [],
    receipt: null,
    cleanup: {
      status: "pending",
      message: "等待运行结束后确认清理结果",
    },
    firstFailure: "",
    cancelRequestedAt: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
    message: "质量门禁已进入队列",
  });
  writePrivateJson(operationFile(store, operation.id), operation);
  pruneDevQualityGateHistory(store);
  return { operation, reused: false };
}

export function transitionDevQualityGateOperation(store, operationId, changes) {
  const allowed = new Set([
    "cancelRequestedAt",
    "cleanup",
    "firstFailure",
    "message",
    "receipt",
    "stage",
    "stageTimings",
    "status",
    "now",
  ]);
  if (Object.keys(changes).some((key) => !allowed.has(key))) {
    throw new Error("quality gate transition contains unsupported fields");
  }
  const current = readDevQualityGateOperation(store, operationId);
  const status = changes.status || current.status;
  if (
    status !== current.status &&
    !STATUS_TRANSITIONS[current.status].has(status)
  ) {
    throw new Error(
      `quality gate operation transition is invalid: ${current.status} -> ${status}`,
    );
  }
  const stage = changes.stage || current.stage;
  const now = changes.now || new Date().toISOString();
  const persistedChanges = { ...changes };
  delete persistedChanges.now;
  const terminal = DEV_QUALITY_GATE_TERMINAL_STATUSES.includes(status);
  const next = validateDevQualityGateOperation({
    ...current,
    ...persistedChanges,
    status,
    stage: terminal ? "finished" : stage,
    revision: current.revision + 1,
    updatedAt: now,
    finishedAt: terminal ? now : null,
  });
  writePrivateJson(operationFile(store, operationId), next, {
    overwrite: true,
  });
  if (terminal) pruneDevQualityGateHistory(store);
  return next;
}
