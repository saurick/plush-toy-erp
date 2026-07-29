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
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

export const COVERAGE_OPERATION_SCHEMA =
  "plush.dev-qa-coverage-operation/v1";
export const COVERAGE_OPERATION_PROFILE = "baseline";
export const COVERAGE_OPERATION_ACTIVE_STATUSES = Object.freeze([
  "queued",
  "running",
]);
export const COVERAGE_OPERATION_TERMINAL_STATUSES = Object.freeze([
  "completed",
  "failed",
  "not_proven",
]);
export const COVERAGE_OPERATION_STAGES = Object.freeze([
  "queued",
  "t0-static",
  "t1-docs",
  "go",
  "web-lint",
  "web-css",
  "web",
  "import",
  "field-linkage",
  "identity-check",
  "aggregate",
  "finished",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const IDEMPOTENCY_PATTERN =
  /^coverage:collect:baseline:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HASH_PATTERN = /^[0-9a-f]{64}$/u;
const STATUS_TRANSITIONS = Object.freeze({
  queued: new Set(["running", "failed", "not_proven"]),
  running: new Set(["running", "completed", "failed", "not_proven"]),
  completed: new Set(),
  failed: new Set(),
  not_proven: new Set(),
});
const STAGE_INDEX = new Map(
  COVERAGE_OPERATION_STAGES.map((stage, index) => [stage, index]),
);
const MAX_RECORD_BYTES = 128 * 1024;

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
    /(?:^|[\s"'=])(?:[A-Za-z]:[\\/]|\\\\|\/(?:Users|home|private|var|tmp)\/)/u.test(
      value,
    ) ||
    /(?:^|[\s"'=])[a-z][a-z0-9+.-]*:\/\//iu.test(value)
  ) {
    throw new Error(`${field} contains unsafe content`);
  }
  return value;
}

function validateRepository(repository) {
  assertExactKeys(
    repository,
    ["commit", "dirty", "fingerprint"],
    "coverage repository",
  );
  if (
    !/^[0-9a-f]{40,64}$/u.test(repository.commit) ||
    typeof repository.dirty !== "boolean" ||
    !HASH_PATTERN.test(repository.fingerprint)
  ) {
    throw new Error("coverage repository is invalid");
  }
  return repository;
}

function validateEvent(event) {
  assertExactKeys(
    event,
    ["at", "message", "stage", "status"],
    "coverage operation event",
  );
  if (
    Number.isNaN(Date.parse(event.at)) ||
    !Object.hasOwn(STATUS_TRANSITIONS, event.status) ||
    !STAGE_INDEX.has(event.stage)
  ) {
    throw new Error("coverage operation event is invalid");
  }
  assertSafeText(event.message, "coverage operation event message");
  return event;
}

export function validateCoverageOperation(operation) {
  assertExactKeys(
    operation,
    [
      "createdAt",
      "events",
      "exitCode",
      "finishedAt",
      "id",
      "idempotencyKey",
      "message",
      "outcome",
      "profile",
      "repository",
      "revision",
      "schemaVersion",
      "stage",
      "status",
      "updatedAt",
    ],
    "coverage operation",
  );
  if (
    operation.schemaVersion !== COVERAGE_OPERATION_SCHEMA ||
    !UUID_PATTERN.test(operation.id) ||
    !IDEMPOTENCY_PATTERN.test(operation.idempotencyKey) ||
    operation.profile !== COVERAGE_OPERATION_PROFILE ||
    !Object.hasOwn(STATUS_TRANSITIONS, operation.status) ||
    !STAGE_INDEX.has(operation.stage) ||
    !Number.isSafeInteger(operation.revision) ||
    operation.revision < 1 ||
    !Array.isArray(operation.events) ||
    operation.events.length < 1 ||
    operation.events.length > 100 ||
    Number.isNaN(Date.parse(operation.createdAt)) ||
    Number.isNaN(Date.parse(operation.updatedAt))
  ) {
    throw new Error("coverage operation is invalid");
  }
  validateRepository(operation.repository);
  assertSafeText(operation.message, "coverage operation message");
  operation.events.forEach(validateEvent);
  const terminal = COVERAGE_OPERATION_TERMINAL_STATUSES.includes(
    operation.status,
  );
  if (
    operation.createdAt !== operation.events[0].at ||
    operation.updatedAt !== operation.events.at(-1).at ||
    operation.status !== operation.events.at(-1).status ||
    operation.stage !== operation.events.at(-1).stage ||
    (terminal &&
      (operation.stage !== "finished" ||
        Number.isNaN(Date.parse(operation.finishedAt)))) ||
    (!terminal && operation.finishedAt !== null) ||
    (operation.status === "completed" &&
      (!["passed", "issues"].includes(operation.outcome) ||
        ![0, 2].includes(operation.exitCode))) ||
    (operation.status !== "completed" && operation.outcome !== null) ||
    (operation.exitCode !== null &&
      (!Number.isSafeInteger(operation.exitCode) ||
        operation.exitCode < 0 ||
        operation.exitCode > 255))
  ) {
    throw new Error("coverage operation state is inconsistent");
  }
  return operation;
}

function ensureDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stats = lstatSync(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("coverage operation directory is invalid");
  }
}

function readPrivateJson(file) {
  const stats = lstatSync(file);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.size > MAX_RECORD_BYTES
  ) {
    throw new Error("coverage operation record is invalid");
  }
  const descriptor = openSync(
    file,
    constants.O_RDONLY | (constants.O_NOFOLLOW || 0),
  );
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.size > MAX_RECORD_BYTES) {
      throw new Error("coverage operation record is invalid");
    }
    return JSON.parse(readFileSync(descriptor, "utf8"));
  } finally {
    closeSync(descriptor);
  }
}

function writePrivateJson(file, value, { overwrite = false } = {}) {
  ensureDirectory(path.dirname(file));
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(content) > MAX_RECORD_BYTES) {
    throw new Error("coverage operation record is too large");
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
      throw new Error("coverage operation record already exists");
    }
    renameSync(temporary, file);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function resolveCoverageOperationStore(repoRoot) {
  return path.join(
    path.resolve(repoRoot || process.cwd()),
    "output",
    "dev-workbench",
    "coverage-operations",
  );
}

function operationFile(store, operationId) {
  if (!UUID_PATTERN.test(String(operationId || ""))) {
    throw new Error("coverage operation id is invalid");
  }
  return path.join(store, "operations", `${operationId}.json`);
}

function idempotencyFile(store, idempotencyKey) {
  if (!IDEMPOTENCY_PATTERN.test(String(idempotencyKey || ""))) {
    throw new Error("coverage idempotency key is invalid");
  }
  return path.join(
    store,
    "idempotency",
    `${createHash("sha256").update(idempotencyKey).digest("hex")}.json`,
  );
}

export function readCoverageOperation(store, operationId) {
  return validateCoverageOperation(
    readPrivateJson(operationFile(store, operationId)),
  );
}

export function readCoverageOperationByIdempotencyKey(
  store,
  idempotencyKey,
) {
  const file = idempotencyFile(store, idempotencyKey);
  if (!existsSync(file)) return null;
  const index = readPrivateJson(file);
  assertExactKeys(
    index,
    ["idempotencyKey", "operationId", "schemaVersion"],
    "coverage idempotency index",
  );
  if (
    index.schemaVersion !== "plush.dev-qa-coverage-idempotency/v1" ||
    index.idempotencyKey !== idempotencyKey ||
    !UUID_PATTERN.test(index.operationId)
  ) {
    throw new Error("coverage idempotency index is invalid");
  }
  return readCoverageOperation(store, index.operationId);
}

export function listCoverageOperations(store, { limit = 20 } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("coverage operation list limit is invalid");
  }
  const directory = path.join(store, "operations");
  if (!existsSync(directory)) return [];
  const stats = lstatSync(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("coverage operation list directory is invalid");
  }
  return readdirSync(directory)
    .filter((entry) => UUID_PATTERN.test(entry.replace(/\.json$/u, "")))
    .map((entry) =>
      readCoverageOperation(store, entry.replace(/\.json$/u, "")),
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit);
}

export function createOrReuseCoverageOperation(
  store,
  {
    idempotencyKey,
    repository,
    operationId = randomUUID(),
    now = new Date().toISOString(),
  },
) {
  const existing = readCoverageOperationByIdempotencyKey(
    store,
    idempotencyKey,
  );
  if (existing) return { operation: existing, reused: true };
  const operation = validateCoverageOperation({
    schemaVersion: COVERAGE_OPERATION_SCHEMA,
    id: operationId,
    idempotencyKey,
    profile: COVERAGE_OPERATION_PROFILE,
    repository,
    status: "queued",
    stage: "queued",
    outcome: null,
    exitCode: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
    message: "覆盖采集任务已进入队列",
    events: [
      {
        at: now,
        status: "queued",
        stage: "queued",
        message: "覆盖采集任务已进入队列",
      },
    ],
  });
  writePrivateJson(operationFile(store, operation.id), operation);
  try {
    writePrivateJson(idempotencyFile(store, idempotencyKey), {
      schemaVersion: "plush.dev-qa-coverage-idempotency/v1",
      idempotencyKey,
      operationId: operation.id,
    });
  } catch (error) {
    if (existsSync(operationFile(store, operation.id))) {
      unlinkSync(operationFile(store, operation.id));
    }
    throw error;
  }
  return { operation, reused: false };
}

export function transitionCoverageOperation(
  store,
  operationId,
  {
    status,
    stage,
    message,
    outcome = null,
    exitCode = null,
    now = new Date().toISOString(),
  },
) {
  const current = readCoverageOperation(store, operationId);
  if (!STATUS_TRANSITIONS[current.status].has(status)) {
    throw new Error(
      `coverage operation transition is invalid: ${current.status} -> ${status}`,
    );
  }
  if (
    !STAGE_INDEX.has(stage) ||
    (status === "running" &&
      STAGE_INDEX.get(stage) < STAGE_INDEX.get(current.stage)) ||
    (COVERAGE_OPERATION_TERMINAL_STATUSES.includes(status) &&
      stage !== "finished")
  ) {
    throw new Error("coverage operation stage transition is invalid");
  }
  assertSafeText(message, "coverage operation transition message");
  const next = validateCoverageOperation({
    ...current,
    status,
    stage,
    outcome,
    exitCode,
    revision: current.revision + 1,
    updatedAt: now,
    finishedAt: COVERAGE_OPERATION_TERMINAL_STATUSES.includes(status)
      ? now
      : null,
    message,
    events: [
      ...current.events,
      {
        at: now,
        status,
        stage,
        message,
      },
    ],
  });
  writePrivateJson(operationFile(store, operationId), next, {
    overwrite: true,
  });
  return next;
}

function executionLockFile(store) {
  return path.join(store, "execution.lock");
}

export function readCoverageExecutionLock(store) {
  const file = executionLockFile(store);
  if (!existsSync(file)) return null;
  const lock = readPrivateJson(file);
  assertExactKeys(
    lock,
    ["acquiredAt", "childPid", "operationId", "ownerPid", "schemaVersion"],
    "coverage execution lock",
  );
  if (
    lock.schemaVersion !== "plush.dev-qa-coverage-execution-lock/v1" ||
    !UUID_PATTERN.test(lock.operationId) ||
    !Number.isSafeInteger(lock.ownerPid) ||
    lock.ownerPid < 1 ||
    (lock.childPid !== null &&
      (!Number.isSafeInteger(lock.childPid) || lock.childPid < 1)) ||
    Number.isNaN(Date.parse(lock.acquiredAt))
  ) {
    throw new Error("coverage execution lock is invalid");
  }
  return lock;
}

export function acquireCoverageExecutionLock(
  store,
  operationId,
  {
    ownerPid = process.pid,
    now = new Date().toISOString(),
  } = {},
) {
  if (
    !UUID_PATTERN.test(String(operationId || "")) ||
    !Number.isSafeInteger(ownerPid) ||
    ownerPid < 1 ||
    Number.isNaN(Date.parse(now))
  ) {
    throw new Error("coverage execution lock identity is invalid");
  }
  const file = executionLockFile(store);
  ensureDirectory(store);
  let descriptor;
  try {
    descriptor = openSync(file, "wx", 0o600);
    writeFileSync(
      descriptor,
      `${JSON.stringify({
        schemaVersion: "plush.dev-qa-coverage-execution-lock/v1",
        operationId,
        ownerPid,
        childPid: null,
        acquiredAt: now,
      })}\n`,
    );
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if (error?.code === "EEXIST") {
      const conflict = new Error("another coverage operation is running");
      conflict.code = "COVERAGE_OPERATION_LOCKED";
      throw conflict;
    }
    throw error;
  }
  return readCoverageExecutionLock(store);
}

export function attachCoverageExecutionChild(
  store,
  operationId,
  childPid,
) {
  const lock = readCoverageExecutionLock(store);
  if (
    !lock ||
    lock.operationId !== operationId ||
    !Number.isSafeInteger(childPid) ||
    childPid < 1
  ) {
    throw new Error("coverage execution child identity is invalid");
  }
  const next = { ...lock, childPid };
  writePrivateJson(executionLockFile(store), next, { overwrite: true });
  return readCoverageExecutionLock(store);
}

export function releaseCoverageExecutionLock(store, operationId) {
  const lock = readCoverageExecutionLock(store);
  if (!lock) return false;
  if (lock.operationId !== operationId) {
    throw new Error("coverage execution lock belongs to another operation");
  }
  unlinkSync(executionLockFile(store));
  return true;
}
