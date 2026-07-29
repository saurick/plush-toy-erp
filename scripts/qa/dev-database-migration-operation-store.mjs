import { createHash, randomUUID } from "node:crypto";
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

export const DATABASE_MIGRATION_OPERATION_SCHEMA =
  "plush.dev-database-migration-operation/v1";

export const DATABASE_MIGRATION_OPERATION_STATUSES = Object.freeze([
  "preparing",
  "ready",
  "applying",
  "restarting",
  "passed",
  "failed",
  "blocked",
  "not_proven",
]);

const TERMINAL_STATUSES = new Set([
  "passed",
  "failed",
  "blocked",
  "not_proven",
]);
const TRANSITIONS = Object.freeze({
  preparing: new Set(["ready", "passed", "failed", "blocked", "not_proven"]),
  ready: new Set(["applying", "blocked", "not_proven"]),
  applying: new Set([
    "restarting",
    "passed",
    "failed",
    "blocked",
    "not_proven",
  ]),
  restarting: new Set(["passed", "failed", "not_proven"]),
  passed: new Set(),
  failed: new Set(),
  blocked: new Set(),
  not_proven: new Set(),
});
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const IDEMPOTENCY_PATTERN =
  /^database-migration:(?:prepare|restart):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const MAX_RECORD_BYTES = 256 * 1024;

function ensureDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stats = lstatSync(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("database migration operation directory is unsafe");
  }
}

function readPrivateJSON(file) {
  const stats = lstatSync(file);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.size < 2 ||
    stats.size > MAX_RECORD_BYTES
  ) {
    throw new Error("database migration operation record is unsafe");
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

function writePrivateJSON(file, value) {
  ensureDirectory(path.dirname(file));
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(bytes) > MAX_RECORD_BYTES) {
    throw new Error("database migration operation record is too large");
  }
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, file);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function assertTimestamp(value, field) {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error(`${field} is invalid`);
  }
}

function assertSafeText(value, field, { allowEmpty = false, max = 1000 } = {}) {
  if (
    typeof value !== "string" ||
    (!allowEmpty && value.length === 0) ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) ||
    /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/u.test(value)
  ) {
    throw new Error(`${field} is invalid`);
  }
}

function validateOperation(operation) {
  if (
    !operation ||
    typeof operation !== "object" ||
    Array.isArray(operation) ||
    operation.schemaVersion !== DATABASE_MIGRATION_OPERATION_SCHEMA ||
    !UUID_PATTERN.test(String(operation.id || "")) ||
    !IDEMPOTENCY_PATTERN.test(String(operation.idempotencyKey || "")) ||
    !["migration", "restart"].includes(operation.kind) ||
    !DATABASE_MIGRATION_OPERATION_STATUSES.includes(operation.status) ||
    !Number.isSafeInteger(operation.revision) ||
    operation.revision < 1
  ) {
    throw new Error("database migration operation is invalid");
  }
  assertTimestamp(operation.createdAt, "createdAt");
  assertTimestamp(operation.updatedAt, "updatedAt");
  assertSafeText(operation.message, "operation message");
  if (!Array.isArray(operation.issues) || !Array.isArray(operation.events)) {
    throw new Error("database migration operation history is invalid");
  }
  for (const issue of operation.issues) {
    if (
      !issue ||
      !/^[a-z][a-z0-9_]{2,63}$/u.test(String(issue.code || "")) ||
      !["warning", "blocked"].includes(issue.severity)
    ) {
      throw new Error("database migration operation issue is invalid");
    }
    assertSafeText(issue.message, "operation issue");
  }
  for (const event of operation.events) {
    assertTimestamp(event.at, "event timestamp");
    if (!DATABASE_MIGRATION_OPERATION_STATUSES.includes(event.status)) {
      throw new Error("database migration operation event is invalid");
    }
    assertSafeText(event.message, "operation event");
  }
  if (
    operation.confirmationPrompt !== null &&
    typeof operation.confirmationPrompt !== "string"
  ) {
    throw new Error("database migration confirmation prompt is invalid");
  }
  if (
    operation.internal !== null &&
    (typeof operation.internal !== "object" ||
      Array.isArray(operation.internal))
  ) {
    throw new Error("database migration operation internals are invalid");
  }
  return operation;
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

function executionLockFile(store) {
  return path.join(store, "execution.lock");
}

function readExecutionLock(store) {
  const file = executionLockFile(store);
  if (!existsSync(file)) return null;
  const lock = readPrivateJSON(file);
  if (
    lock.schemaVersion !== "plush.dev-database-migration-lock/v1" ||
    !UUID_PATTERN.test(String(lock.operationId || "")) ||
    !Number.isSafeInteger(lock.pid) ||
    lock.pid < 1
  ) {
    throw new Error("database migration execution lock is invalid");
  }
  assertTimestamp(lock.acquiredAt, "execution lock timestamp");
  return lock;
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

export function resolveDatabaseMigrationOperationStore(projectRoot) {
  const store = path.join(
    path.resolve(projectRoot),
    "output",
    "dev-workbench",
    "database-migration-operations",
  );
  ensureDirectory(path.join(store, "operations"));
  ensureDirectory(path.join(store, "idempotency"));
  return store;
}

export function publicDatabaseMigrationOperation(operation) {
  const { internal: _internal, ...publicOperation } =
    validateOperation(operation);
  return structuredClone(publicOperation);
}

export function readDatabaseMigrationOperation(store, operationId) {
  return validateOperation(readPrivateJSON(operationFile(store, operationId)));
}

export function listDatabaseMigrationOperations(
  store,
  { limit = 30, publicOnly = false } = {},
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("operation list limit is invalid");
  }
  const directory = path.join(store, "operations");
  if (!existsSync(directory)) return [];
  const operations = readdirSync(directory)
    .filter((entry) => UUID_PATTERN.test(entry.replace(/\.json$/u, "")))
    .map((entry) =>
      readDatabaseMigrationOperation(store, entry.replace(/\.json$/u, "")),
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit);
  return publicOnly
    ? operations.map(publicDatabaseMigrationOperation)
    : operations;
}

export function createOrReuseDatabaseMigrationOperation(
  store,
  {
    idempotencyKey,
    kind,
    status,
    message,
    operationId = randomUUID(),
    now = new Date().toISOString(),
  },
) {
  if (
    !["migration", "restart"].includes(kind) ||
    !["preparing", "restarting"].includes(status)
  ) {
    throw new Error("initial database migration operation state is invalid");
  }
  const indexFile = idempotencyFile(store, idempotencyKey);
  if (existsSync(indexFile)) {
    const index = readPrivateJSON(indexFile);
    if (
      index.schemaVersion !== "plush.dev-database-migration-idempotency/v1" ||
      index.idempotencyKey !== idempotencyKey ||
      index.kind !== kind ||
      !UUID_PATTERN.test(String(index.operationId || ""))
    ) {
      throw new Error("idempotency key was already used for another request");
    }
    return {
      operation: readDatabaseMigrationOperation(store, index.operationId),
      reused: true,
    };
  }
  assertSafeText(message, "operation message");
  const operation = validateOperation({
    schemaVersion: DATABASE_MIGRATION_OPERATION_SCHEMA,
    id: operationId,
    idempotencyKey,
    kind,
    status,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    message,
    target: null,
    source: null,
    plan: null,
    backup: null,
    readback: null,
    confirmationPrompt: null,
    issues: [],
    events: [{ at: now, status, message }],
    internal: null,
  });
  writePrivateJSON(operationFile(store, operation.id), operation);
  writePrivateJSON(indexFile, {
    schemaVersion: "plush.dev-database-migration-idempotency/v1",
    idempotencyKey,
    kind,
    operationId: operation.id,
  });
  return { operation, reused: false };
}

export function transitionDatabaseMigrationOperation(
  store,
  operationId,
  {
    status,
    message,
    target,
    source,
    plan,
    backup,
    readback,
    confirmationPrompt,
    issues,
    internal,
    now = new Date().toISOString(),
  },
) {
  const current = readDatabaseMigrationOperation(store, operationId);
  if (!TRANSITIONS[current.status].has(status)) {
    throw new Error(
      `operation transition is invalid: ${current.status} -> ${status}`,
    );
  }
  assertSafeText(message, "operation transition message");
  const operation = validateOperation({
    ...current,
    status,
    revision: current.revision + 1,
    updatedAt: now,
    message,
    target: target === undefined ? current.target : target,
    source: source === undefined ? current.source : source,
    plan: plan === undefined ? current.plan : plan,
    backup: backup === undefined ? current.backup : backup,
    readback: readback === undefined ? current.readback : readback,
    confirmationPrompt:
      confirmationPrompt === undefined
        ? current.confirmationPrompt
        : confirmationPrompt,
    issues: issues === undefined ? current.issues : issues,
    internal: internal === undefined ? current.internal : internal,
    events: [...current.events, { at: now, status, message }],
  });
  writePrivateJSON(operationFile(store, operation.id), operation);
  return operation;
}

export function acquireDatabaseMigrationExecutionLock(
  store,
  operationId,
  { now = new Date().toISOString() } = {},
) {
  if (!UUID_PATTERN.test(String(operationId || ""))) {
    throw new Error("operation id is invalid");
  }
  const file = executionLockFile(store);
  let descriptor;
  try {
    descriptor = openSync(file, "wx", 0o600);
    writeFileSync(
      descriptor,
      `${JSON.stringify({
        schemaVersion: "plush.dev-database-migration-lock/v1",
        operationId,
        pid: process.pid,
        acquiredAt: now,
      })}\n`,
    );
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if (error?.code === "EEXIST") {
      const conflict = new Error(
        "another database migration operation is running",
      );
      conflict.code = "DATABASE_MIGRATION_LOCKED";
      throw conflict;
    }
    throw error;
  }
}

export function releaseDatabaseMigrationExecutionLock(store, operationId) {
  const file = executionLockFile(store);
  if (!existsSync(file)) return false;
  const lock = readExecutionLock(store);
  if (lock.operationId !== operationId) {
    throw new Error("database migration execution lock ownership changed");
  }
  unlinkSync(file);
  return true;
}

export function recoverInterruptedDatabaseMigrationOperations(
  store,
  now = new Date().toISOString(),
  { processAlive = isProcessAlive } = {},
) {
  const lock = readExecutionLock(store);
  if (lock && processAlive(lock.pid)) {
    return [];
  }
  const recovered = [];
  for (const operation of listDatabaseMigrationOperations(store, {
    limit: 100,
  })) {
    if (!["preparing", "applying", "restarting"].includes(operation.status)) {
      continue;
    }
    recovered.push(
      transitionDatabaseMigrationOperation(store, operation.id, {
        status: "not_proven",
        message: "进程中断，最终结果尚未证明",
        issues: [
          {
            code: "interrupted_outcome_unknown",
            severity: "blocked",
            message:
              "操作结果未知，系统不会自动重试；请先刷新目标状态和运行状态",
          },
        ],
        now,
      }),
    );
  }
  if (lock) unlinkSync(executionLockFile(store));
  return recovered;
}

export function isTerminalDatabaseMigrationStatus(status) {
  return TERMINAL_STATUSES.has(status);
}
