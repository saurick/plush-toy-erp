import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  linkSync,
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

export const DELIVERY_OPERATION_CONTRACT = "plush.delivery-operation/v1";
export const DELIVERY_OPERATION_ACTIONS = Object.freeze([
  "verify-affected",
  "verify-full",
  "verify-strict",
  "release",
  "promote",
  "rebuild-database",
  "smoke",
  "rollback",
]);
export const DELIVERY_OPERATION_TERMINAL_STATUSES = Object.freeze([
  "passed",
  "failed",
  "blocked",
  "not_proven",
]);

const STATUS_TRANSITIONS = Object.freeze({
  queued: new Set(["running", "blocked", "failed"]),
  running: new Set([
    "ready",
    "waiting",
    "passed",
    "failed",
    "blocked",
    "not_proven",
  ]),
  ready: new Set(["launching", "running", "blocked", "failed"]),
  launching: new Set(["running", "blocked", "failed", "not_proven"]),
  waiting: new Set(["running", "passed", "failed", "not_proven"]),
  passed: new Set(),
  failed: new Set(),
  blocked: new Set(),
  not_proven: new Set(),
});
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const VERSION_PATTERN = /^[0-9A-Za-z](?:[0-9A-Za-z._-]{0,62}[0-9A-Za-z])?$/u;
const TARGET_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/u;
const CODE_PATTERN = /^[a-z][a-z0-9_]{2,63}$/u;
const MAX_OPERATION_BYTES = 256 * 1024;
const IDEMPOTENCY_INDEX_CONTRACT = "plush.delivery-operation-idempotency/v2";
const LEGACY_IDEMPOTENCY_INDEX_CONTRACT =
  "plush.delivery-operation-idempotency/v1";
const INTENT_INDEX_CONTRACT = "plush.delivery-operation-intent/v1";
const RETRY_INDEX_CONTRACT = "plush.delivery-operation-retry-intent/v1";

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

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function fingerprint(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function assertPlainRecord(value, field) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${field} must be a plain object`);
  }
  return value;
}

function assertPublicMetadata(value, field = "metadata", depth = 0) {
  if (depth > 4) throw new Error(`${field} is too deeply nested`);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${field} numbers must be safe integers`);
    }
    return value;
  }
  if (typeof value === "string") {
    if (
      value.length > 2048 ||
      /[\u0000-\u001f\u007f]/u.test(value) ||
      /(?:password|secret|token|private[_-]?key|authorization|cookie|dsn)/iu.test(
        value,
      ) ||
      /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/u.test(value) ||
      /(?:^|[\s"'=])\/(?:Users|home|private|var|tmp)\//u.test(value)
    ) {
      throw new Error(`${field} contains disallowed or sensitive content`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 100) throw new Error(`${field} is too large`);
    value.forEach((item, index) =>
      assertPublicMetadata(item, `${field}[${index}]`, depth + 1),
    );
    return value;
  }
  const record = assertPlainRecord(value, field);
  const entries = Object.entries(record);
  if (entries.length > 100) throw new Error(`${field} is too large`);
  for (const [key, nested] of entries) {
    if (
      !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/u.test(key) ||
      /(?:password|secret|token|private[_-]?key|authorization|cookie|dsn)/iu.test(
        key,
      )
    ) {
      throw new Error(`${field} contains a disallowed key`);
    }
    assertPublicMetadata(nested, `${field}.${key}`, depth + 1);
  }
  return value;
}

function validateIssue(issue) {
  assertPlainRecord(issue, "operation issue");
  if (
    !CODE_PATTERN.test(String(issue.code || "")) ||
    !["info", "warning", "error"].includes(issue.level) ||
    typeof issue.message !== "string" ||
    issue.message.length === 0 ||
    issue.message.length > 500
  ) {
    throw new Error("operation issue is invalid");
  }
  assertPublicMetadata(issue.message, "operation issue message");
  return issue;
}

export function validateDeliveryOperation(operation) {
  assertPlainRecord(operation, "delivery operation");
  const hasLineage =
    Object.hasOwn(operation, "attempt") ||
    Object.hasOwn(operation, "retryOfOperationId") ||
    Object.hasOwn(operation, "rootOperationId");
  if (
    operation.schemaVersion !== DELIVERY_OPERATION_CONTRACT ||
    !UUID_V4_PATTERN.test(String(operation.id || "")) ||
    !IDEMPOTENCY_PATTERN.test(String(operation.idempotencyKey || "")) ||
    !DELIVERY_OPERATION_ACTIONS.includes(operation.action) ||
    !TARGET_PATTERN.test(String(operation.target || "")) ||
    !SHA_PATTERN.test(String(operation.gitSha || "")) ||
    !VERSION_PATTERN.test(String(operation.version || "")) ||
    !Object.hasOwn(STATUS_TRANSITIONS, operation.status) ||
    !/^[0-9a-f]{64}$/u.test(String(operation.requestFingerprint || "")) ||
    !Number.isSafeInteger(operation.revision) ||
    operation.revision < 1 ||
    !Array.isArray(operation.issues) ||
    operation.issues.length > 100 ||
    !Array.isArray(operation.events) ||
    operation.events.length < 1 ||
    operation.events.length > 500 ||
    (hasLineage &&
      (!Number.isSafeInteger(operation.attempt) ||
        operation.attempt < 1 ||
        !UUID_V4_PATTERN.test(String(operation.rootOperationId || "")) ||
        (operation.retryOfOperationId !== null &&
          !UUID_V4_PATTERN.test(String(operation.retryOfOperationId || ""))) ||
        (operation.attempt === 1 && operation.retryOfOperationId !== null) ||
        (operation.attempt > 1 && operation.retryOfOperationId === null)))
  ) {
    throw new Error("delivery operation contract is invalid");
  }
  assertPublicMetadata(operation.metadata, "operation metadata");
  operation.issues.forEach(validateIssue);
  for (const event of operation.events) {
    assertPlainRecord(event, "operation event");
    if (
      !Object.hasOwn(STATUS_TRANSITIONS, event.status) ||
      typeof event.at !== "string" ||
      Number.isNaN(Date.parse(event.at)) ||
      typeof event.message !== "string" ||
      event.message.length === 0 ||
      event.message.length > 500
    ) {
      throw new Error("operation event is invalid");
    }
    assertPublicMetadata(event.message, "operation event message");
  }
  const lastEvent = operation.events.at(-1);
  if (
    lastEvent.status !== operation.status ||
    operation.createdAt !== operation.events[0].at ||
    operation.updatedAt !== lastEvent.at ||
    Number.isNaN(Date.parse(operation.createdAt)) ||
    Number.isNaN(Date.parse(operation.updatedAt))
  ) {
    throw new Error("operation event/status timestamps are inconsistent");
  }
  return operation;
}

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("operation store directory must be a plain directory");
  }
}

function assertStoreFile(file) {
  const stat = lstatSync(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > MAX_OPERATION_BYTES
  ) {
    throw new Error("operation store file is invalid");
  }
}

function readPrivateJson(file) {
  assertStoreFile(file);
  const descriptor = openSync(
    file,
    constants.O_RDONLY + (constants.O_NOFOLLOW || 0),
  );
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size > MAX_OPERATION_BYTES) {
      throw new Error("operation store file is invalid");
    }
    return JSON.parse(readFileSync(descriptor, "utf8"));
  } finally {
    closeSync(descriptor);
  }
}

function writePrivateJson(file, value, { overwrite = false } = {}) {
  const directory = path.dirname(file);
  ensurePrivateDirectory(directory);
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(content) > MAX_OPERATION_BYTES) {
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
    if (overwrite) {
      renameSync(temporary, file);
    } else {
      linkSync(temporary, file);
      unlinkSync(temporary);
    }
    const directoryDescriptor = openSync(directory, "r");
    fsyncSync(directoryDescriptor);
    closeSync(directoryDescriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function resolveDeliveryOperationStore(
  repoRoot,
  requested = "output/dev-workbench/delivery-operations",
) {
  const root = realpathSync(repoRoot);
  const outputRoot = path.join(root, "output");
  const candidate = path.resolve(root, requested);
  if (!candidate.startsWith(`${outputRoot}${path.sep}`)) {
    throw new Error("operation store must remain inside repository output/");
  }
  return candidate;
}

function operationFile(store, operationId) {
  if (!UUID_V4_PATTERN.test(String(operationId || ""))) {
    throw new Error("operation id is invalid");
  }
  return path.join(store, "operations", `${operationId}.json`);
}

function indexFile(store, idempotencyKey) {
  if (!IDEMPOTENCY_PATTERN.test(String(idempotencyKey || ""))) {
    throw new Error("idempotency key is invalid");
  }
  return path.join(
    store,
    "idempotency",
    `${createHash("sha256").update(idempotencyKey).digest("hex")}.json`,
  );
}

function intentIndexFile(store, requestFingerprint) {
  if (!/^[0-9a-f]{64}$/u.test(String(requestFingerprint || ""))) {
    throw new Error("operation request fingerprint is invalid");
  }
  return path.join(store, "intents", `${requestFingerprint}.json`);
}

function retryIndexFile(store, retryOfOperationId) {
  if (!UUID_V4_PATTERN.test(String(retryOfOperationId || ""))) {
    throw new Error("retry parent operation id is invalid");
  }
  return path.join(store, "retry-intents", `${retryOfOperationId}.json`);
}

function readOperationIfPresent(store, operationId) {
  const file = operationFile(store, operationId);
  return existsSync(file) ? readDeliveryOperation(store, operationId) : null;
}

function normalizedOperationLineage(operation) {
  return {
    attempt: Number.isSafeInteger(operation.attempt) ? operation.attempt : 1,
    retryOfOperationId: operation.retryOfOperationId || null,
    rootOperationId: operation.rootOperationId || operation.id,
  };
}

function validateIdempotencyIndex(index, idempotencyKey) {
  const schemaVersion = String(index?.schemaVersion || "");
  const retryOfOperationId =
    schemaVersion === IDEMPOTENCY_INDEX_CONTRACT
      ? index.retryOfOperationId
      : null;
  if (
    ![IDEMPOTENCY_INDEX_CONTRACT, LEGACY_IDEMPOTENCY_INDEX_CONTRACT].includes(
      schemaVersion,
    ) ||
    !IDEMPOTENCY_PATTERN.test(String(index?.idempotencyKey || "")) ||
    index?.idempotencyKey !== idempotencyKey ||
    !/^[0-9a-f]{64}$/u.test(String(index?.requestFingerprint || "")) ||
    !UUID_V4_PATTERN.test(String(index?.operationId || "")) ||
    (retryOfOperationId !== null &&
      !UUID_V4_PATTERN.test(String(retryOfOperationId || "")))
  ) {
    throw new Error("delivery operation idempotency index is invalid");
  }
  return { ...index, retryOfOperationId };
}

function readIdempotencyIndex(store, idempotencyKey) {
  const file = indexFile(store, idempotencyKey);
  return existsSync(file)
    ? validateIdempotencyIndex(readPrivateJson(file), idempotencyKey)
    : null;
}

function claimIdempotencyIndex(
  store,
  { idempotencyKey, requestFingerprint, operationId, retryOfOperationId },
) {
  const file = indexFile(store, idempotencyKey);
  const value = {
    schemaVersion: IDEMPOTENCY_INDEX_CONTRACT,
    idempotencyKey,
    requestFingerprint,
    operationId,
    retryOfOperationId,
  };
  try {
    writePrivateJson(file, value);
    return value;
  } catch (error) {
    if (!existsSync(file)) throw error;
    const existing = validateIdempotencyIndex(
      readPrivateJson(file),
      idempotencyKey,
    );
    if (
      existing.requestFingerprint !== requestFingerprint ||
      existing.operationId !== operationId ||
      existing.retryOfOperationId !== retryOfOperationId
    ) {
      throw new Error("idempotency key was already used for another request");
    }
    return existing;
  }
}

function validateIntentIndex(index, requestFingerprint) {
  if (
    index?.schemaVersion !== INTENT_INDEX_CONTRACT ||
    index?.requestFingerprint !== requestFingerprint ||
    !UUID_V4_PATTERN.test(String(index?.operationId || ""))
  ) {
    throw new Error("delivery operation intent index is invalid");
  }
  return index;
}

function readIntentOwner(store, requestFingerprint) {
  const file = intentIndexFile(store, requestFingerprint);
  if (existsSync(file)) {
    const index = validateIntentIndex(
      readPrivateJson(file),
      requestFingerprint,
    );
    const operation = readOperationIfPresent(store, index.operationId);
    if (operation && operation.requestFingerprint !== requestFingerprint) {
      throw new Error("delivery operation intent index is inconsistent");
    }
    return { operationId: index.operationId, operation };
  }
  const operation =
    listDeliveryOperations(store, { limit: 200 }).find(
      (candidate) => candidate.requestFingerprint === requestFingerprint,
    ) || null;
  return operation ? { operationId: operation.id, operation } : null;
}

function claimIntentIndex(store, requestFingerprint, operationId) {
  const file = intentIndexFile(store, requestFingerprint);
  const value = {
    schemaVersion: INTENT_INDEX_CONTRACT,
    requestFingerprint,
    operationId,
  };
  try {
    writePrivateJson(file, value);
    return value;
  } catch (error) {
    if (!existsSync(file)) throw error;
    return validateIntentIndex(readPrivateJson(file), requestFingerprint);
  }
}

function validateRetryIndex(index, requestFingerprint, retryOfOperationId) {
  if (
    index?.schemaVersion !== RETRY_INDEX_CONTRACT ||
    index?.requestFingerprint !== requestFingerprint ||
    index?.retryOfOperationId !== retryOfOperationId ||
    !UUID_V4_PATTERN.test(String(index?.operationId || ""))
  ) {
    throw new Error("delivery operation retry intent index is invalid");
  }
  return index;
}

function claimRetryIndex(
  store,
  requestFingerprint,
  retryOfOperationId,
  operationId,
) {
  const file = retryIndexFile(store, retryOfOperationId);
  const value = {
    schemaVersion: RETRY_INDEX_CONTRACT,
    requestFingerprint,
    retryOfOperationId,
    operationId,
  };
  try {
    writePrivateJson(file, value);
    return value;
  } catch (error) {
    if (!existsSync(file)) throw error;
    return validateRetryIndex(
      readPrivateJson(file),
      requestFingerprint,
      retryOfOperationId,
    );
  }
}

function resolveClaimedOperationId({
  requestedOperationId,
  indexedOperationId,
  claimedOperationId,
}) {
  if (indexedOperationId && indexedOperationId !== claimedOperationId) {
    throw new Error("idempotency and intent indexes are inconsistent");
  }
  if (
    requestedOperationId &&
    !UUID_V4_PATTERN.test(String(requestedOperationId || ""))
  ) {
    throw new Error("operation id is invalid");
  }
  return claimedOperationId;
}

function validateOperationTimestamp(now) {
  if (typeof now !== "string" || Number.isNaN(Date.parse(now))) {
    throw new Error("operation event is invalid");
  }
  return now;
}

function initialOperationId(
  store,
  requestFingerprint,
  { operationId, indexedOperationId, intentOwner },
) {
  if (intentOwner) {
    return resolveClaimedOperationId({
      requestedOperationId: operationId,
      indexedOperationId,
      claimedOperationId: intentOwner.operationId,
    });
  }
  const candidate = indexedOperationId || operationId || randomUUID();
  if (!UUID_V4_PATTERN.test(String(candidate || ""))) {
    throw new Error("operation id is invalid");
  }
  const claimed = claimIntentIndex(store, requestFingerprint, candidate);
  return resolveClaimedOperationId({
    requestedOperationId: operationId,
    indexedOperationId,
    claimedOperationId: claimed.operationId,
  });
}

function retryOperationId(
  store,
  requestFingerprint,
  retryOfOperationId,
  { operationId, indexedOperationId },
) {
  const candidate = indexedOperationId || operationId || randomUUID();
  if (!UUID_V4_PATTERN.test(String(candidate || ""))) {
    throw new Error("operation id is invalid");
  }
  const claimed = claimRetryIndex(
    store,
    requestFingerprint,
    retryOfOperationId,
    candidate,
  );
  return resolveClaimedOperationId({
    requestedOperationId: operationId,
    indexedOperationId,
    claimedOperationId: claimed.operationId,
  });
}

function ensureIntentIndex(store, requestFingerprint, operationId) {
  if (!existsSync(intentIndexFile(store, requestFingerprint))) {
    const claimed = claimIntentIndex(store, requestFingerprint, operationId);
    if (claimed.operationId !== operationId) {
      throw new Error("delivery operation intent already has another owner");
    }
  }
  return operationId;
}

function updateIntentIndex(store, requestFingerprint, operationId, overwrite) {
  const file = intentIndexFile(store, requestFingerprint);
  const value = {
    schemaVersion: INTENT_INDEX_CONTRACT,
    requestFingerprint,
    operationId,
  };
  try {
    writePrivateJson(file, value, { overwrite });
  } catch (error) {
    if (!existsSync(file)) throw error;
    const existing = validateIntentIndex(
      readPrivateJson(file),
      requestFingerprint,
    );
    if (existing.operationId !== operationId) {
      throw new Error("delivery operation intent already has another owner");
    }
  }
}

export function deliveryOperationRequestCounts(store) {
  const directory = path.join(store, "idempotency");
  const counts = new Map();
  if (!existsSync(directory)) return counts;
  const directoryStat = lstatSync(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error("operation idempotency directory is invalid");
  }
  for (const file of readdirSync(directory).filter((entry) =>
    /^[0-9a-f]{64}\.json$/u.test(entry),
  )) {
    const rawIndex = readPrivateJson(path.join(directory, file));
    const index = validateIdempotencyIndex(rawIndex, rawIndex?.idempotencyKey);
    counts.set(index.operationId, (counts.get(index.operationId) || 0) + 1);
  }
  return counts;
}

export function readDeliveryOperation(store, operationId) {
  return validateDeliveryOperation(
    readPrivateJson(operationFile(store, operationId)),
  );
}

export function listDeliveryOperations(store, { limit = 50 } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("operation list limit is invalid");
  }
  const directory = path.join(store, "operations");
  if (!existsSync(directory)) return [];
  const directoryStat = lstatSync(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error("operation directory is invalid");
  }
  return readdirSync(directory)
    .filter((file) => UUID_V4_PATTERN.test(file.replace(/\.json$/u, "")))
    .map((file) => readDeliveryOperation(store, file.replace(/\.json$/u, "")))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit);
}

export function recoverInterruptedDeliveryOperations(
  store,
  now = new Date().toISOString(),
) {
  return listDeliveryOperations(store, { limit: 200 }).map((operation) =>
    operation.status === "running" || operation.status === "launching"
      ? recoverInterruptedDeliveryOperation(store, operation.id, now)
      : { operation, recovered: false },
  );
}

export function createOrReuseDeliveryOperation(
  store,
  {
    action,
    target,
    gitSha,
    version,
    idempotencyKey,
    metadata = {},
    now = new Date().toISOString(),
    operationId,
    retryOfOperationId = null,
  },
) {
  if (!DELIVERY_OPERATION_ACTIONS.includes(action)) {
    throw new Error(`unsupported delivery action: ${String(action || "")}`);
  }
  if (!TARGET_PATTERN.test(String(target || ""))) {
    throw new Error("operation target is invalid");
  }
  if (!SHA_PATTERN.test(String(gitSha || ""))) {
    throw new Error("operation git SHA is invalid");
  }
  if (!VERSION_PATTERN.test(String(version || ""))) {
    throw new Error("operation version is invalid");
  }
  if (!IDEMPOTENCY_PATTERN.test(String(idempotencyKey || ""))) {
    throw new Error("operation idempotency key is invalid");
  }
  if (
    retryOfOperationId !== null &&
    !UUID_V4_PATTERN.test(String(retryOfOperationId || ""))
  ) {
    throw new Error("retry parent operation id is invalid");
  }
  assertPublicMetadata(metadata, "operation metadata");
  validateOperationTimestamp(now);
  const requestFingerprint = fingerprint({
    action,
    target,
    gitSha,
    version,
    metadata,
  });
  const existingKeyIndex = readIdempotencyIndex(store, idempotencyKey);
  if (existingKeyIndex) {
    if (
      existingKeyIndex.requestFingerprint !== requestFingerprint ||
      existingKeyIndex.retryOfOperationId !== retryOfOperationId
    ) {
      throw new Error("idempotency key was already used for another request");
    }
    const existingOperation = readOperationIfPresent(
      store,
      existingKeyIndex.operationId,
    );
    if (existingOperation) {
      return {
        operation: existingOperation,
        reused: true,
      };
    }
  }
  const intentOwner = readIntentOwner(store, requestFingerprint);
  const latestOperation = intentOwner?.operation || null;
  if (retryOfOperationId === null && latestOperation) {
    claimIdempotencyIndex(store, {
      idempotencyKey,
      requestFingerprint,
      operationId: latestOperation.id,
      retryOfOperationId: null,
    });
    ensureIntentIndex(store, requestFingerprint, latestOperation.id);
    return { operation: latestOperation, reused: true };
  }

  let attempt = 1;
  let rootOperationId = null;
  let retryParent = null;
  if (retryOfOperationId !== null) {
    retryParent = readDeliveryOperation(store, retryOfOperationId);
    if (retryParent.requestFingerprint !== requestFingerprint) {
      throw new Error("retry request does not match its parent operation");
    }
    if (latestOperation && latestOperation.id !== retryParent.id) {
      const latestLineage = normalizedOperationLineage(latestOperation);
      const parentLineage = normalizedOperationLineage(retryParent);
      if (latestLineage.rootOperationId !== parentLineage.rootOperationId) {
        throw new Error("delivery operation retry lineage is inconsistent");
      }
      claimIdempotencyIndex(store, {
        idempotencyKey,
        requestFingerprint,
        operationId: latestOperation.id,
        retryOfOperationId,
      });
      return { operation: latestOperation, reused: true };
    }
    if (retryParent.status === "not_proven") {
      throw new Error("unknown target outcome must be read back before retry");
    }
    if (!["failed", "blocked"].includes(retryParent.status)) {
      throw new Error("only failed or blocked operations can be retried");
    }
    const parentLineage = normalizedOperationLineage(retryParent);
    attempt = parentLineage.attempt + 1;
    rootOperationId = parentLineage.rootOperationId;
  }

  const indexedOperationId = existingKeyIndex?.operationId || null;
  const resolvedOperationId = retryParent
    ? retryOperationId(store, requestFingerprint, retryParent.id, {
        operationId,
        indexedOperationId,
      })
    : initialOperationId(store, requestFingerprint, {
        operationId,
        indexedOperationId,
        intentOwner,
      });
  rootOperationId ||= resolvedOperationId;
  const operation = validateDeliveryOperation({
    schemaVersion: DELIVERY_OPERATION_CONTRACT,
    id: resolvedOperationId,
    idempotencyKey,
    action,
    target,
    gitSha,
    version,
    requestFingerprint,
    attempt,
    retryOfOperationId,
    rootOperationId,
    status: "queued",
    revision: 1,
    createdAt: now,
    updatedAt: now,
    metadata,
    issues: [],
    events: [
      {
        at: now,
        status: "queued",
        message:
          attempt === 1
            ? "operation accepted"
            : "controlled retry operation accepted",
      },
    ],
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsAbsoluteWorkspacePaths: false,
      containsRawLogs: false,
    },
  });
  claimIdempotencyIndex(store, {
    idempotencyKey,
    requestFingerprint,
    operationId: resolvedOperationId,
    retryOfOperationId,
  });
  try {
    writePrivateJson(operationFile(store, resolvedOperationId), operation);
  } catch (error) {
    if (!existsSync(operationFile(store, resolvedOperationId))) throw error;
    const existingOperation = readDeliveryOperation(store, resolvedOperationId);
    const existingLineage = normalizedOperationLineage(existingOperation);
    if (
      existingOperation.requestFingerprint !== requestFingerprint ||
      existingLineage.retryOfOperationId !== retryOfOperationId ||
      existingLineage.attempt !== attempt
    ) {
      throw new Error("delivery operation identity collision");
    }
    if (retryOfOperationId !== null) {
      updateIntentIndex(store, requestFingerprint, existingOperation.id, true);
    } else {
      ensureIntentIndex(store, requestFingerprint, existingOperation.id);
    }
    return { operation: existingOperation, reused: true };
  }
  if (retryOfOperationId !== null) {
    updateIntentIndex(store, requestFingerprint, resolvedOperationId, true);
  } else {
    ensureIntentIndex(store, requestFingerprint, resolvedOperationId);
  }
  return { operation, reused: false };
}

export function transitionDeliveryOperation(
  store,
  operationId,
  { status, message, issues, metadata, now = new Date().toISOString() },
) {
  const current = readDeliveryOperation(store, operationId);
  if (!STATUS_TRANSITIONS[current.status].has(status)) {
    throw new Error(
      `operation transition is invalid: ${current.status} -> ${status}`,
    );
  }
  if (
    typeof message !== "string" ||
    message.length === 0 ||
    message.length > 500
  ) {
    throw new Error("operation transition message is invalid");
  }
  assertPublicMetadata(message, "operation transition message");
  const nextIssues =
    issues === undefined ? current.issues : issues.map(validateIssue);
  const nextMetadata =
    metadata === undefined ? current.metadata : assertPublicMetadata(metadata);
  const next = validateDeliveryOperation({
    ...current,
    status,
    revision: current.revision + 1,
    updatedAt: now,
    metadata: nextMetadata,
    issues: nextIssues,
    events: [...current.events, { at: now, status, message }],
  });
  writePrivateJson(operationFile(store, operationId), next, {
    overwrite: true,
  });
  return next;
}

export function recoverInterruptedDeliveryOperation(
  store,
  operationId,
  now = new Date().toISOString(),
) {
  const current = readDeliveryOperation(store, operationId);
  if (!["launching", "running"].includes(current.status)) {
    return { operation: current, recovered: false };
  }
  return {
    operation: transitionDeliveryOperation(store, operationId, {
      status: "not_proven",
      message:
        "process restarted while target outcome was unknown; read back before retry",
      issues: [
        {
          code: "interrupted_target_state_unknown",
          level: "error",
          message: "目标动作结果未知，必须先读回，禁止自动重试",
        },
      ],
      now,
    }),
    recovered: true,
  };
}
