import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export const DEV_CUSTOMER_CONFIG_OPERATION_SCHEMA =
  "plush.dev-customer-config-operation/v1";
export const DEV_CUSTOMER_CONFIG_OPERATION_ACTIONS = Object.freeze([
  "dry-run",
  "runtime-manifest",
  "release-readiness",
]);
export const DEV_CUSTOMER_CONFIG_OPERATION_TERMINAL_STATUSES = Object.freeze([
  "passed",
  "blocked",
  "failed",
  "not_proven",
]);

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CUSTOMER_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const IDEMPOTENCY_KEY_PATTERN =
  /^customer-config:(dry-run|runtime-manifest|release-readiness):([a-z0-9]+(?:-[a-z0-9]+)*):([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/u;
const STATUS_TRANSITIONS = Object.freeze({
  running: new Set(["passed", "blocked", "failed", "not_proven"]),
  passed: new Set(),
  blocked: new Set(),
  failed: new Set(),
  not_proven: new Set(),
});
const MAX_RECORD_BYTES = 256 * 1024;
const ACTIVE_EXECUTION_IDS = new Set();

function ensureDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stats = lstatSync(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("customer config operation store directory is invalid");
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

function digest(value) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function readPrivateJson(file) {
  const stats = lstatSync(file);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.size > MAX_RECORD_BYTES
  ) {
    throw new Error("customer config operation record is invalid");
  }
  const descriptor = openSync(
    file,
    constants.O_RDONLY | (constants.O_NOFOLLOW || 0),
  );
  try {
    return JSON.parse(readFileSync(descriptor, "utf8"));
  } finally {
    closeSync(descriptor);
  }
}

function writePrivateJson(file, value, { exclusive = false } = {}) {
  ensureDirectory(path.dirname(file));
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(serialized) > MAX_RECORD_BYTES) {
    throw new Error("customer config operation record is too large");
  }
  if (exclusive) {
    const descriptor = openSync(
      file,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600,
    );
    try {
      writeFileSync(descriptor, serialized);
    } finally {
      closeSync(descriptor);
    }
    return;
  }
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, serialized, { mode: 0o600, flag: "wx" });
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function operationFile(store, operationId) {
  if (!UUID_V4_PATTERN.test(String(operationId || ""))) {
    throw new Error("customer config operation id is invalid");
  }
  return path.join(store, "operations", `${operationId}.json`);
}

function idempotencyFile(store, idempotencyKey) {
  return path.join(store, "idempotency", `${digest(idempotencyKey)}.json`);
}

function readIdempotencyIndex(file) {
  const index = readPrivateJson(file);
  if (
    !index ||
    Object.keys(index).sort().join(",") !== "operationId,requestFingerprint" ||
    !UUID_V4_PATTERN.test(String(index.operationId || "")) ||
    !/^[0-9a-f]{64}$/u.test(String(index.requestFingerprint || ""))
  ) {
    throw new Error("customer config idempotency index is invalid");
  }
  return index;
}

function validateTimestamp(value) {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error("customer config operation timestamp is invalid");
  }
}

function validateOperation(operation) {
  if (
    !operation ||
    operation.schemaVersion !== DEV_CUSTOMER_CONFIG_OPERATION_SCHEMA ||
    !UUID_V4_PATTERN.test(String(operation.id || "")) ||
    !DEV_CUSTOMER_CONFIG_OPERATION_ACTIONS.includes(operation.action) ||
    !CUSTOMER_KEY_PATTERN.test(String(operation.customerKey || "")) ||
    !IDEMPOTENCY_KEY_PATTERN.test(String(operation.idempotencyKey || "")) ||
    !Object.hasOwn(STATUS_TRANSITIONS, operation.status) ||
    !/^[0-9a-f]{64}$/u.test(String(operation.requestFingerprint || "")) ||
    !Number.isSafeInteger(operation.revision) ||
    operation.revision < 1 ||
    !Array.isArray(operation.events) ||
    operation.events.length < 1 ||
    operation.events.length > 50 ||
    (operation.result !== null &&
      (!operation.result ||
        typeof operation.result !== "object" ||
        Array.isArray(operation.result)))
  ) {
    throw new Error("customer config operation contract is invalid");
  }
  if (
    !operation.input ||
    typeof operation.input !== "object" ||
    Array.isArray(operation.input) ||
    Object.getPrototypeOf(operation.input) !== Object.prototype
  ) {
    throw new Error("customer config operation input is invalid");
  }
  const inputKeys = Object.keys(operation.input);
  if (
    (operation.action === "release-readiness" &&
      (inputKeys.length !== 1 ||
        inputKeys[0] !== "releaseBatch" ||
        !/^\d{4}-\d{2}-\d{2}$/u.test(operation.input.releaseBatch))) ||
    (operation.action !== "release-readiness" && inputKeys.length !== 0)
  ) {
    throw new Error("customer config operation input contract is invalid");
  }
  const match = IDEMPOTENCY_KEY_PATTERN.exec(operation.idempotencyKey);
  if (match?.[1] !== operation.action || match?.[2] !== operation.customerKey) {
    throw new Error("customer config operation idempotency binding is invalid");
  }
  validateTimestamp(operation.createdAt);
  validateTimestamp(operation.updatedAt);
  for (const event of operation.events) {
    validateTimestamp(event?.at);
    if (
      !Object.hasOwn(STATUS_TRANSITIONS, event?.status) ||
      typeof event?.message !== "string" ||
      event.message.length < 1 ||
      event.message.length > 240
    ) {
      throw new Error("customer config operation event is invalid");
    }
  }
  if (
    operation.createdAt !== operation.events[0].at ||
    operation.updatedAt !== operation.events.at(-1).at ||
    operation.status !== operation.events.at(-1).status
  ) {
    throw new Error("customer config operation timeline is invalid");
  }
  return operation;
}

export function resolveDevCustomerConfigOperationStore(projectRoot) {
  const store = path.join(
    path.resolve(projectRoot),
    "output",
    "dev-customer-config-operations",
  );
  ensureDirectory(path.join(store, "operations"));
  ensureDirectory(path.join(store, "idempotency"));
  return store;
}

export function readDevCustomerConfigOperation(store, operationId) {
  return validateOperation(readPrivateJson(operationFile(store, operationId)));
}

function readAllDevCustomerConfigOperations(store) {
  const directory = path.join(store, "operations");
  ensureDirectory(directory);
  return readdirSync(directory)
    .filter((file) => UUID_V4_PATTERN.test(file.replace(/\.json$/u, "")))
    .map((file) =>
      readDevCustomerConfigOperation(store, file.replace(/\.json$/u, "")),
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function listDevCustomerConfigOperations(
  store,
  { customerKey = "", limit = 50 } = {},
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("customer config operation list limit is invalid");
  }
  return readAllDevCustomerConfigOperations(store)
    .filter(
      (operation) => !customerKey || operation.customerKey === customerKey,
    )
    .slice(0, limit);
}

export function createOrReuseDevCustomerConfigOperation(
  store,
  {
    action,
    customerKey,
    idempotencyKey,
    input = {},
    now = new Date().toISOString(),
  },
) {
  const idempotencyMatch = IDEMPOTENCY_KEY_PATTERN.exec(
    String(idempotencyKey || ""),
  );
  if (
    !DEV_CUSTOMER_CONFIG_OPERATION_ACTIONS.includes(action) ||
    !CUSTOMER_KEY_PATTERN.test(String(customerKey || "")) ||
    idempotencyMatch?.[1] !== action ||
    idempotencyMatch?.[2] !== customerKey ||
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw new Error("customer config operation request is invalid");
  }
  validateTimestamp(now);
  const requestFingerprint = digest({ action, customerKey, input });
  const indexFile = idempotencyFile(store, idempotencyKey);
  if (existsSync(indexFile)) {
    const index = readIdempotencyIndex(indexFile);
    if (index.requestFingerprint !== requestFingerprint) {
      throw new Error("customer config idempotency key was reused");
    }
    return {
      operation: readDevCustomerConfigOperation(store, index.operationId),
      reused: true,
    };
  }
  const operation = validateOperation({
    schemaVersion: DEV_CUSTOMER_CONFIG_OPERATION_SCHEMA,
    id: randomUUID(),
    action,
    customerKey,
    idempotencyKey,
    requestFingerprint,
    input,
    status: "running",
    revision: 1,
    createdAt: now,
    updatedAt: now,
    result: null,
    events: [{ at: now, status: "running", message: "受控本地操作已启动" }],
  });
  const createdOperationFile = operationFile(store, operation.id);
  writePrivateJson(createdOperationFile, operation);
  try {
    writePrivateJson(
      indexFile,
      {
        operationId: operation.id,
        requestFingerprint,
      },
      { exclusive: true },
    );
    return { operation, reused: false };
  } catch (error) {
    if (error?.code !== "EEXIST") {
      rmSync(createdOperationFile, { force: true });
      throw error;
    }
    let index;
    try {
      index = readIdempotencyIndex(indexFile);
    } finally {
      rmSync(createdOperationFile, { force: true });
    }
    if (index.requestFingerprint !== requestFingerprint) {
      throw new Error("customer config idempotency key was reused");
    }
    return {
      operation: readDevCustomerConfigOperation(store, index.operationId),
      reused: true,
    };
  }
}

export function transitionDevCustomerConfigOperation(
  store,
  operationId,
  { status, message, result = null, now = new Date().toISOString() },
) {
  const current = readDevCustomerConfigOperation(store, operationId);
  if (!STATUS_TRANSITIONS[current.status].has(status)) {
    throw new Error(
      `customer config operation transition is invalid: ${current.status} -> ${status}`,
    );
  }
  validateTimestamp(now);
  const next = validateOperation({
    ...current,
    status,
    revision: current.revision + 1,
    updatedAt: now,
    result,
    events: [...current.events, { at: now, status, message }],
  });
  writePrivateJson(operationFile(store, operationId), next);
  return next;
}

function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function executionLockFile(store) {
  return path.join(store, "execution.lock");
}

function readExecutionLock(file) {
  const lock = readPrivateJson(file);
  if (
    !UUID_V4_PATTERN.test(String(lock?.operationId || "")) ||
    !Number.isSafeInteger(lock?.pid) ||
    lock.pid < 1
  ) {
    throw new Error("customer config execution lock is invalid");
  }
  validateTimestamp(lock.acquiredAt);
  return lock;
}

export function acquireDevCustomerConfigExecutionLock(store, operationId) {
  if (!UUID_V4_PATTERN.test(String(operationId || ""))) {
    throw new Error("customer config execution lock operation is invalid");
  }
  const file = executionLockFile(store);
  ensureDirectory(store);
  try {
    const descriptor = openSync(
      file,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600,
    );
    try {
      writeFileSync(
        descriptor,
        `${JSON.stringify({ operationId, pid: process.pid, acquiredAt: new Date().toISOString() })}\n`,
      );
    } finally {
      closeSync(descriptor);
    }
    ACTIVE_EXECUTION_IDS.add(operationId);
    return true;
  } catch (error) {
    if (error?.code === "EEXIST") return false;
    throw error;
  }
}

export function releaseDevCustomerConfigExecutionLock(store, operationId) {
  const file = executionLockFile(store);
  try {
    if (!existsSync(file)) return;
    const lock = readExecutionLock(file);
    if (lock.operationId !== operationId) return;
    rmSync(file);
  } finally {
    ACTIVE_EXECUTION_IDS.delete(operationId);
  }
}

export function recoverInterruptedDevCustomerConfigOperations(
  store,
  now = new Date().toISOString(),
) {
  const file = executionLockFile(store);
  let liveOwner = null;
  if (existsSync(file)) {
    const lock = readExecutionLock(file);
    const ownerIsLive =
      lock.pid === process.pid
        ? ACTIVE_EXECUTION_IDS.has(lock.operationId)
        : processAlive(lock.pid);
    if (ownerIsLive) liveOwner = lock.operationId;
  }
  const recovered = [];
  for (const operation of readAllDevCustomerConfigOperations(store)) {
    if (operation.status !== "running" || operation.id === liveOwner) continue;
    recovered.push(
      transitionDevCustomerConfigOperation(store, operation.id, {
        status: "not_proven",
        message: "开发服务中断；结果未知，未自动重试",
        result: null,
        now,
      }),
    );
  }
  if (existsSync(file) && liveOwner === null) rmSync(file);
  return recovered;
}
