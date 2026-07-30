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

export const DEV_TESTING_OPERATION_SCHEMA =
  "plush.dev-qa-testing-operation/v1";
export const DEV_TESTING_ACTIONS = Object.freeze([
  "fast",
  "role-access",
  "field-linkage",
]);
export const DEV_TESTING_OPERATION_ACTIVE_STATUSES = Object.freeze([
  "queued",
  "running",
]);
export const DEV_TESTING_OPERATION_TERMINAL_STATUSES = Object.freeze([
  "completed",
  "failed",
  "blocked",
  "not_proven",
]);
export const DEV_TESTING_OPERATION_STAGES = Object.freeze([
  "queued",
  "running",
  "identity-check",
  "finished",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const IDEMPOTENCY_PATTERN =
  /^testing:(fast|role-access|field-linkage):([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/u;
const HASH_PATTERN = /^[0-9a-f]{64}$/u;
const MAX_RECORD_BYTES = 64 * 1024;
const STAGE_INDEX = new Map(
  DEV_TESTING_OPERATION_STAGES.map((stage, index) => [stage, index]),
);
const STATUS_TRANSITIONS = Object.freeze({
  queued: new Set(["running", "failed", "not_proven"]),
  running: new Set([
    "running",
    "completed",
    "failed",
    "blocked",
    "not_proven",
  ]),
  completed: new Set(),
  failed: new Set(),
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

function assertSafeText(value, field, max = 500) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
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
    "testing repository",
  );
  if (
    !/^[0-9a-f]{40,64}$/u.test(repository.commit) ||
    typeof repository.dirty !== "boolean" ||
    !HASH_PATTERN.test(repository.fingerprint)
  ) {
    throw new Error("testing repository is invalid");
  }
  return repository;
}

export function validateDevTestingOperation(operation) {
  assertExactKeys(
    operation,
    [
      "action",
      "createdAt",
      "exitCode",
      "finishedAt",
      "id",
      "idempotencyKey",
      "message",
      "outcome",
      "repository",
      "revision",
      "schemaVersion",
      "stage",
      "status",
      "updatedAt",
    ],
    "testing operation",
  );
  const keyMatch = IDEMPOTENCY_PATTERN.exec(
    String(operation.idempotencyKey || ""),
  );
  if (
    operation.schemaVersion !== DEV_TESTING_OPERATION_SCHEMA ||
    !UUID_PATTERN.test(String(operation.id || "")) ||
    !DEV_TESTING_ACTIONS.includes(operation.action) ||
    keyMatch?.[1] !== operation.action ||
    !Object.hasOwn(STATUS_TRANSITIONS, operation.status) ||
    !STAGE_INDEX.has(operation.stage) ||
    !Number.isSafeInteger(operation.revision) ||
    operation.revision < 1 ||
    Number.isNaN(Date.parse(operation.createdAt)) ||
    Number.isNaN(Date.parse(operation.updatedAt))
  ) {
    throw new Error("testing operation is invalid");
  }
  validateRepository(operation.repository);
  assertSafeText(operation.message, "testing operation message");
  const terminal = DEV_TESTING_OPERATION_TERMINAL_STATUSES.includes(
    operation.status,
  );
  if (
    (terminal &&
      (operation.stage !== "finished" ||
        Number.isNaN(Date.parse(operation.finishedAt)))) ||
    (!terminal && operation.finishedAt !== null) ||
    (operation.status === "completed" &&
      (operation.outcome !== "passed" || operation.exitCode !== 0)) ||
    (operation.status === "blocked" &&
      (operation.outcome !== "blocked" || operation.exitCode !== 2)) ||
    (!["completed", "blocked"].includes(operation.status) &&
      operation.outcome !== null) ||
    (operation.exitCode !== null &&
      (!Number.isSafeInteger(operation.exitCode) ||
        operation.exitCode < 0 ||
        operation.exitCode > 255))
  ) {
    throw new Error("testing operation state is inconsistent");
  }
  return operation;
}

function ensureDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stats = lstatSync(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("testing operation directory is invalid");
  }
}

function readPrivateJson(file) {
  const stats = lstatSync(file);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.size > MAX_RECORD_BYTES
  ) {
    throw new Error("testing operation record is invalid");
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
      throw new Error("testing operation record already exists");
    }
    renameSync(temporary, file);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function resolveDevTestingOperationStore(repoRoot) {
  return path.join(
    path.resolve(repoRoot || process.cwd()),
    "output",
    "dev-workbench",
    "testing-operations",
  );
}

function operationFile(store, operationId) {
  if (!UUID_PATTERN.test(String(operationId || ""))) {
    throw new Error("testing operation id is invalid");
  }
  return path.join(store, "operations", `${operationId}.json`);
}

export function readDevTestingOperation(store, operationId) {
  return validateDevTestingOperation(
    readPrivateJson(operationFile(store, operationId)),
  );
}

export function listDevTestingOperations(store, { limit = 100 } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error("testing operation list limit is invalid");
  }
  const directory = path.join(store, "operations");
  if (!existsSync(directory)) return [];
  const stats = lstatSync(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("testing operation list directory is invalid");
  }
  return readdirSync(directory)
    .filter((entry) => UUID_PATTERN.test(entry.replace(/\.json$/u, "")))
    .map((entry) =>
      readDevTestingOperation(store, entry.replace(/\.json$/u, "")),
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit);
}

export function readDevTestingOperationByIdempotencyKey(
  store,
  idempotencyKey,
) {
  if (!IDEMPOTENCY_PATTERN.test(String(idempotencyKey || ""))) {
    throw new Error("testing idempotency key is invalid");
  }
  return (
    listDevTestingOperations(store, { limit: 1000 }).find(
      (operation) => operation.idempotencyKey === idempotencyKey,
    ) || null
  );
}

export function createOrReuseDevTestingOperation(
  store,
  {
    action,
    idempotencyKey,
    repository,
    operationId = randomUUID(),
    now = new Date().toISOString(),
  },
) {
  const existing = readDevTestingOperationByIdempotencyKey(
    store,
    idempotencyKey,
  );
  if (existing) return { operation: existing, reused: true };
  const operation = validateDevTestingOperation({
    schemaVersion: DEV_TESTING_OPERATION_SCHEMA,
    id: operationId,
    idempotencyKey,
    action,
    repository,
    status: "queued",
    stage: "queued",
    outcome: null,
    exitCode: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
    message: "固定验证任务已进入队列",
  });
  writePrivateJson(operationFile(store, operation.id), operation);
  return { operation, reused: false };
}

export function transitionDevTestingOperation(
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
  const current = readDevTestingOperation(store, operationId);
  if (!STATUS_TRANSITIONS[current.status].has(status)) {
    throw new Error(
      `testing operation transition is invalid: ${current.status} -> ${status}`,
    );
  }
  if (
    !STAGE_INDEX.has(stage) ||
    (status === "running" &&
      STAGE_INDEX.get(stage) < STAGE_INDEX.get(current.stage)) ||
    (DEV_TESTING_OPERATION_TERMINAL_STATUSES.includes(status) &&
      stage !== "finished")
  ) {
    throw new Error("testing operation stage transition is invalid");
  }
  assertSafeText(message, "testing operation transition message");
  const next = validateDevTestingOperation({
    ...current,
    status,
    stage,
    message,
    outcome,
    exitCode,
    revision: current.revision + 1,
    updatedAt: now,
    finishedAt: DEV_TESTING_OPERATION_TERMINAL_STATUSES.includes(status)
      ? now
      : null,
  });
  writePrivateJson(operationFile(store, operationId), next, {
    overwrite: true,
  });
  return next;
}
