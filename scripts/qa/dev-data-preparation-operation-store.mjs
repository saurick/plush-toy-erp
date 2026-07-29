import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

export const DATA_PREPARATION_OPERATION_SCHEMA =
  "plush.dev-data-preparation-operation/v1";
export const DATA_PREPARATION_PROFILE_KEYS = Object.freeze([
  "core-demo",
  "scenario-demo",
  "full-acceptance",
]);
export const DATA_PREPARATION_TERMINAL_STATUSES = Object.freeze([
  "passed",
  "failed",
  "blocked",
  "not_proven",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/u;
const HASH_PATTERN = /^[0-9a-f]{64}$/u;
const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9_]{2,39}$/u;
const STATUS_TRANSITIONS = Object.freeze({
  ready: new Set(["launching", "blocked", "failed"]),
  launching: new Set(["running", "failed", "blocked", "not_proven"]),
  running: new Set(["passed", "failed", "blocked", "not_proven"]),
  passed: new Set(),
  failed: new Set(),
  blocked: new Set(),
  not_proven: new Set(),
});
const MAX_RECORD_BYTES = 256 * 1024;

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

export function hashDataPreparationPlan(value) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

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

function assertSafeText(value, field, max = 500) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > max ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    /(?:password|secret|token|authorization|cookie|dsn)/iu.test(value) ||
    /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/u.test(value) ||
    /(?:^|[\s"'=])\/(?:Users|home|private|var|tmp)\//u.test(value)
  ) {
    throw new Error(`${field} contains unsafe content`);
  }
  return value;
}

function validateRepository(value) {
  assertExactKeys(value, ["commit", "dirty", "fingerprint"], "repository");
  if (
    !/^[0-9a-f]{40}$/u.test(value.commit) ||
    typeof value.dirty !== "boolean" ||
    !HASH_PATTERN.test(value.fingerprint)
  ) {
    throw new Error("repository identity is invalid");
  }
  return value;
}

function validateTargetSummary(value) {
  assertExactKeys(
    value,
    [
      "automaticCleanup",
      "disposable",
      "preflightFingerprint",
      "safeTarget",
      "targetFingerprint",
    ],
    "target summary",
  );
  assertSafeText(value.safeTarget, "target summary", 300);
  if (
    typeof value.automaticCleanup !== "boolean" ||
    typeof value.disposable !== "boolean" ||
    !HASH_PATTERN.test(value.preflightFingerprint) ||
    !HASH_PATTERN.test(value.targetFingerprint)
  ) {
    throw new Error("target summary is invalid");
  }
  return value;
}

function validateIssue(value) {
  assertExactKeys(value, ["code", "message", "severity"], "operation issue");
  if (
    !/^[a-z][a-z0-9_]{2,63}$/u.test(value.code) ||
    !["warning", "blocked"].includes(value.severity)
  ) {
    throw new Error("operation issue is invalid");
  }
  assertSafeText(value.message, "operation issue message");
  return value;
}

function validateEvent(value) {
  assertExactKeys(value, ["at", "message", "status"], "operation event");
  if (
    Number.isNaN(Date.parse(value.at)) ||
    !Object.hasOwn(STATUS_TRANSITIONS, value.status)
  ) {
    throw new Error("operation event is invalid");
  }
  assertSafeText(value.message, "operation event message");
  return value;
}

function validateReadback(value, profileKey) {
  if (value === null) return value;
  if (profileKey === "core-demo") {
    assertExactKeys(
      value,
      [
        "cleanupSupported",
        "core",
        "preflight",
        "profileKey",
        "roleAccounts",
        "schemaVersion",
        "stableUpsert",
        "targetFingerprint",
      ],
      "core demo readback",
    );
    assertExactKeys(
      value.core,
      [
        "bomHeaders",
        "materials",
        "processes",
        "products",
        "units",
        "warehouses",
      ],
      "core demo counts",
    );
    if (
      value.schemaVersion !== "plush.dev-data-preparation-readback/v1" ||
      value.profileKey !== profileKey ||
      value.preflight !== "passed" ||
      !HASH_PATTERN.test(value.targetFingerprint) ||
      !Number.isSafeInteger(value.roleAccounts) ||
      value.roleAccounts < 1 ||
      value.stableUpsert !== true ||
      value.cleanupSupported !== false ||
      Object.values(value.core).some(
        (count) => !Number.isSafeInteger(count) || count < 0,
      )
    ) {
      throw new Error("core demo readback is invalid");
    }
    return value;
  }
  if (profileKey === "scenario-demo") {
    assertExactKeys(
      value,
      [
        "browserChecksPending",
        "catalogReadyCount",
        "catalogTargetCount",
        "cleanupSupported",
        "dataVersion",
        "datasetKey",
        "factCount",
        "manualAcceptanceCompleted",
        "processRuntimeCount",
        "profileKey",
        "replayMode",
        "runId",
        "schemaVersion",
        "sourceDocumentCount",
        "targetFingerprint",
      ],
      "scenario demo readback",
    );
    if (
      value.schemaVersion !== "plush.dev-data-preparation-readback/v1" ||
      value.profileKey !== profileKey ||
      value.datasetKey !== "yoyoosun-manual-acceptance" ||
      value.dataVersion !== "2026.07.16-v5" ||
      value.runId !== "20260716-V5" ||
      !HASH_PATTERN.test(value.targetFingerprint) ||
      !Number.isSafeInteger(value.sourceDocumentCount) ||
      value.sourceDocumentCount < 1 ||
      !Number.isSafeInteger(value.processRuntimeCount) ||
      value.processRuntimeCount < 1 ||
      !Number.isSafeInteger(value.factCount) ||
      value.factCount < 1 ||
      value.catalogReadyCount !== 40 ||
      value.catalogTargetCount !== 50 ||
      value.browserChecksPending !== 10 ||
      value.catalogReadyCount + value.browserChecksPending !==
        value.catalogTargetCount ||
      value.manualAcceptanceCompleted !== false ||
      value.cleanupSupported !== false ||
      value.replayMode !== "exact-create-or-readback"
    ) {
      throw new Error("scenario demo readback is invalid");
    }
    return value;
  }
  assertExactKeys(
    value,
    [
      "cleanupComplete",
      "profileKey",
      "reportStatus",
      "residualDatabaseCount",
      "schemaVersion",
      "targetFingerprint",
    ],
    "full acceptance readback",
  );
  if (
    value.schemaVersion !== "plush.dev-data-preparation-readback/v1" ||
    value.profileKey !== profileKey ||
    !["passed", "failed"].includes(value.reportStatus) ||
    typeof value.cleanupComplete !== "boolean" ||
    !Number.isSafeInteger(value.residualDatabaseCount) ||
    value.residualDatabaseCount < 0 ||
    !HASH_PATTERN.test(value.targetFingerprint)
  ) {
    throw new Error("full acceptance readback is invalid");
  }
  return value;
}

export function validateDataPreparationOperation(operation) {
  assertExactKeys(
    operation,
    [
      "createdAt",
      "events",
      "id",
      "idempotencyKey",
      "issues",
      "planHash",
      "profileKey",
      "readback",
      "repository",
      "revision",
      "runId",
      "schemaVersion",
      "status",
      "targetSummary",
      "updatedAt",
    ],
    "data preparation operation",
  );
  if (
    operation.schemaVersion !== DATA_PREPARATION_OPERATION_SCHEMA ||
    !UUID_PATTERN.test(operation.id) ||
    !IDEMPOTENCY_PATTERN.test(operation.idempotencyKey) ||
    !DATA_PREPARATION_PROFILE_KEYS.includes(operation.profileKey) ||
    !HASH_PATTERN.test(operation.planHash) ||
    !RUN_ID_PATTERN.test(operation.runId) ||
    !Object.hasOwn(STATUS_TRANSITIONS, operation.status) ||
    !Number.isSafeInteger(operation.revision) ||
    operation.revision < 1 ||
    !Array.isArray(operation.issues) ||
    operation.issues.length > 50 ||
    !Array.isArray(operation.events) ||
    operation.events.length < 1 ||
    operation.events.length > 200
  ) {
    throw new Error("data preparation operation is invalid");
  }
  validateRepository(operation.repository);
  validateTargetSummary(operation.targetSummary);
  operation.issues.forEach(validateIssue);
  operation.events.forEach(validateEvent);
  validateReadback(operation.readback, operation.profileKey);
  const last = operation.events.at(-1);
  if (
    operation.createdAt !== operation.events[0].at ||
    operation.updatedAt !== last.at ||
    operation.status !== last.status ||
    Number.isNaN(Date.parse(operation.createdAt)) ||
    Number.isNaN(Date.parse(operation.updatedAt))
  ) {
    throw new Error("operation event timeline is inconsistent");
  }
  return operation;
}

function ensureDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stats = lstatSync(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("operation store directory is invalid");
  }
}

function readPrivateJSON(file) {
  const stats = lstatSync(file);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.size > MAX_RECORD_BYTES
  ) {
    throw new Error("operation store record is invalid");
  }
  const descriptor = openSync(
    file,
    constants.O_RDONLY | (constants.O_NOFOLLOW || 0),
  );
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.size > MAX_RECORD_BYTES) {
      throw new Error("operation store record is invalid");
    }
    return JSON.parse(readFileSync(descriptor, "utf8"));
  } finally {
    closeSync(descriptor);
  }
}

function writePrivateJSON(file, value, { overwrite = false } = {}) {
  ensureDirectory(path.dirname(file));
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(content) > MAX_RECORD_BYTES) {
    throw new Error("operation store record is too large");
  }
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    if (!overwrite && existsSync(file)) {
      throw new Error("operation store record already exists");
    }
    renameSync(temporary, file);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function resolveDataPreparationOperationStore(repoRoot) {
  const root = realpathSync(repoRoot);
  return path.join(
    root,
    "output",
    "dev-workbench",
    "data-preparation-operations",
  );
}

function executionLockFile(store) {
  return path.join(store, "execution.lock");
}

export function readDataPreparationExecutionLock(store) {
  const file = executionLockFile(store);
  if (!existsSync(file)) return null;
  const lock = readPrivateJSON(file);
  assertExactKeys(
    lock,
    ["acquiredAt", "operationId", "pid", "schemaVersion"],
    "execution lock",
  );
  if (
    lock.schemaVersion !== "plush.dev-data-preparation-execution-lock/v1" ||
    !UUID_PATTERN.test(String(lock.operationId || "")) ||
    !Number.isSafeInteger(lock.pid) ||
    lock.pid < 1 ||
    Number.isNaN(Date.parse(lock.acquiredAt))
  ) {
    throw new Error("execution lock is invalid");
  }
  return lock;
}

export function acquireDataPreparationExecutionLock(
  store,
  operationId,
  { pid = process.pid, now = new Date().toISOString() } = {},
) {
  if (!UUID_PATTERN.test(String(operationId || ""))) {
    throw new Error("operation id is invalid");
  }
  if (!Number.isSafeInteger(pid) || pid < 1 || Number.isNaN(Date.parse(now))) {
    throw new Error("execution lock identity is invalid");
  }
  const file = executionLockFile(store);
  ensureDirectory(path.dirname(file));
  const content = `${JSON.stringify({
    schemaVersion: "plush.dev-data-preparation-execution-lock/v1",
    operationId,
    pid,
    acquiredAt: now,
  })}\n`;
  let descriptor;
  try {
    descriptor = openSync(file, "wx", 0o600);
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if (error?.code === "EEXIST") {
      throw new Error(
        "another data preparation process holds the execution lock",
      );
    }
    throw error;
  }
  return readDataPreparationExecutionLock(store);
}

export function releaseDataPreparationExecutionLock(store, operationId) {
  const lock = readDataPreparationExecutionLock(store);
  if (!lock) return false;
  if (lock.operationId !== operationId) {
    throw new Error("execution lock belongs to another operation");
  }
  unlinkSync(executionLockFile(store));
  return true;
}

function operationFile(store, operationId) {
  if (!UUID_PATTERN.test(String(operationId || ""))) {
    throw new Error("operation id is invalid");
  }
  return path.join(store, "operations", `${operationId}.json`);
}

function idempotencyFile(store, idempotencyKey) {
  if (!IDEMPOTENCY_PATTERN.test(String(idempotencyKey || ""))) {
    throw new Error("idempotency key is invalid");
  }
  return path.join(
    store,
    "idempotency",
    `${createHash("sha256").update(idempotencyKey).digest("hex")}.json`,
  );
}

function idempotencyLockFile(store, idempotencyKey) {
  if (!IDEMPOTENCY_PATTERN.test(String(idempotencyKey || ""))) {
    throw new Error("idempotency key is invalid");
  }
  return path.join(
    store,
    "prepare-locks",
    `${createHash("sha256").update(idempotencyKey).digest("hex")}.lock`,
  );
}

export function readDataPreparationIdempotencyLock(store, idempotencyKey) {
  const file = idempotencyLockFile(store, idempotencyKey);
  if (!existsSync(file)) return null;
  const lock = readPrivateJSON(file);
  assertExactKeys(
    lock,
    ["acquiredAt", "lockId", "pid", "schemaVersion"],
    "idempotency lock",
  );
  if (
    lock.schemaVersion !== "plush.dev-data-preparation-prepare-lock/v1" ||
    !UUID_PATTERN.test(String(lock.lockId || "")) ||
    !Number.isSafeInteger(lock.pid) ||
    lock.pid < 1 ||
    Number.isNaN(Date.parse(lock.acquiredAt))
  ) {
    throw new Error("idempotency lock is invalid");
  }
  return lock;
}

export function acquireDataPreparationIdempotencyLock(
  store,
  idempotencyKey,
  {
    lockId = randomUUID(),
    pid = process.pid,
    now = new Date().toISOString(),
  } = {},
) {
  if (
    !UUID_PATTERN.test(String(lockId || "")) ||
    !Number.isSafeInteger(pid) ||
    pid < 1 ||
    Number.isNaN(Date.parse(now))
  ) {
    throw new Error("idempotency lock identity is invalid");
  }
  const file = idempotencyLockFile(store, idempotencyKey);
  ensureDirectory(path.dirname(file));
  const content = `${JSON.stringify({
    schemaVersion: "plush.dev-data-preparation-prepare-lock/v1",
    lockId,
    pid,
    acquiredAt: now,
  })}\n`;
  let descriptor;
  try {
    descriptor = openSync(file, "wx", 0o600);
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if (error?.code === "EEXIST") {
      const conflict = new Error(
        "another data preparation process holds the idempotency lock",
      );
      conflict.code = "DATA_PREPARATION_IDEMPOTENCY_LOCKED";
      throw conflict;
    }
    throw error;
  }
  return readDataPreparationIdempotencyLock(store, idempotencyKey);
}

export function releaseDataPreparationIdempotencyLock(
  store,
  idempotencyKey,
  lockId,
) {
  const lock = readDataPreparationIdempotencyLock(store, idempotencyKey);
  if (!lock) return false;
  if (lock.lockId !== lockId) {
    throw new Error("idempotency lock belongs to another prepare request");
  }
  unlinkSync(idempotencyLockFile(store, idempotencyKey));
  return true;
}

export function readDataPreparationOperation(store, operationId) {
  return validateDataPreparationOperation(
    readPrivateJSON(operationFile(store, operationId)),
  );
}

export function readDataPreparationOperationByIdempotencyKey(
  store,
  idempotencyKey,
  profileKey,
) {
  const file = idempotencyFile(store, idempotencyKey);
  if (!existsSync(file)) return null;
  const index = readPrivateJSON(file);
  if (
    index?.schemaVersion !== "plush.dev-data-preparation-idempotency/v1" ||
    index?.idempotencyKey !== idempotencyKey ||
    index?.profileKey !== profileKey ||
    !UUID_PATTERN.test(String(index?.operationId || ""))
  ) {
    throw new Error("idempotency key was already used for another request");
  }
  return readDataPreparationOperation(store, index.operationId);
}

export function listDataPreparationOperations(store, { limit = 50 } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("operation list limit is invalid");
  }
  const directory = path.join(store, "operations");
  if (!existsSync(directory)) return [];
  const stats = lstatSync(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("operation directory is invalid");
  }
  return readdirSync(directory)
    .filter((entry) => UUID_PATTERN.test(entry.replace(/\.json$/u, "")))
    .map((entry) =>
      readDataPreparationOperation(store, entry.replace(/\.json$/u, "")),
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit);
}

export function createOrReuseDataPreparationOperation(
  store,
  {
    idempotencyKey,
    profileKey,
    repository,
    runId,
    targetSummary,
    planHash,
    operationId = randomUUID(),
    now = new Date().toISOString(),
  },
) {
  if (!DATA_PREPARATION_PROFILE_KEYS.includes(profileKey)) {
    throw new Error("profile is not allowlisted");
  }
  if (!IDEMPOTENCY_PATTERN.test(String(idempotencyKey || ""))) {
    throw new Error("idempotency key is invalid");
  }
  const indexPath = idempotencyFile(store, idempotencyKey);
  if (existsSync(indexPath)) {
    const index = readPrivateJSON(indexPath);
    if (
      index?.schemaVersion !== "plush.dev-data-preparation-idempotency/v1" ||
      index?.idempotencyKey !== idempotencyKey ||
      index?.profileKey !== profileKey ||
      !UUID_PATTERN.test(String(index?.operationId || ""))
    ) {
      throw new Error("idempotency key was already used for another request");
    }
    return {
      operation: readDataPreparationOperation(store, index.operationId),
      reused: true,
    };
  }
  const operation = validateDataPreparationOperation({
    schemaVersion: DATA_PREPARATION_OPERATION_SCHEMA,
    id: operationId,
    idempotencyKey,
    profileKey,
    repository,
    planHash,
    runId,
    targetSummary,
    status: "ready",
    revision: 1,
    createdAt: now,
    updatedAt: now,
    issues: [],
    events: [{ at: now, status: "ready", message: "immutable plan prepared" }],
    readback: null,
  });
  writePrivateJSON(operationFile(store, operationId), operation);
  writePrivateJSON(indexPath, {
    schemaVersion: "plush.dev-data-preparation-idempotency/v1",
    idempotencyKey,
    operationId,
    profileKey,
  });
  return { operation, reused: false };
}

export function transitionDataPreparationOperation(
  store,
  operationId,
  { status, message, issues, readback, now = new Date().toISOString() },
) {
  const current = readDataPreparationOperation(store, operationId);
  if (!STATUS_TRANSITIONS[current.status].has(status)) {
    throw new Error(
      `operation transition is invalid: ${current.status} -> ${status}`,
    );
  }
  assertSafeText(message, "operation transition message");
  const next = validateDataPreparationOperation({
    ...current,
    status,
    revision: current.revision + 1,
    updatedAt: now,
    issues: issues === undefined ? current.issues : issues.map(validateIssue),
    events: [...current.events, { at: now, status, message }],
    readback:
      readback === undefined
        ? current.readback
        : validateReadback(readback, current.profileKey),
  });
  writePrivateJSON(operationFile(store, operationId), next, {
    overwrite: true,
  });
  return next;
}

export function recoverInterruptedDataPreparationOperations(
  store,
  now = new Date().toISOString(),
) {
  return listDataPreparationOperations(store, { limit: 200 }).map(
    (operation) => {
      if (!["launching", "running"].includes(operation.status)) {
        return { operation, recovered: false };
      }
      return {
        operation: transitionDataPreparationOperation(store, operation.id, {
          status: "not_proven",
          message: "process restarted while the data outcome was unknown",
          issues: [
            {
              code: "interrupted_data_state_unknown",
              severity: "blocked",
              message: "数据准备结果未知，禁止自动重试，必须人工核对目标",
            },
          ],
          now,
        }),
        recovered: true,
      };
    },
  );
}
