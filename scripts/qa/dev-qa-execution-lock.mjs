import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

export const DEV_QA_EXECUTION_LOCK_SCHEMA =
  "plush.dev-qa-execution-lock/v1";
export const DEV_QA_EXECUTION_KINDS = Object.freeze([
  "coverage",
  "testing",
]);
export const DEV_QA_EXECUTION_PROFILES = Object.freeze([
  "baseline",
  "fast",
  "role-access",
  "field-linkage",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const MAX_LOCK_BYTES = 8 * 1024;

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

function validateKindProfile(kind, profile) {
  const valid =
    (kind === "coverage" && profile === "baseline") ||
    (kind === "testing" &&
      ["fast", "role-access", "field-linkage"].includes(profile));
  if (!valid) throw new Error("QA execution lock kind/profile is invalid");
}

export function validateDevQaExecutionLock(lock) {
  assertExactKeys(
    lock,
    [
      "acquiredAt",
      "childPid",
      "kind",
      "operationId",
      "ownerPid",
      "profile",
      "schemaVersion",
    ],
    "QA execution lock",
  );
  validateKindProfile(lock.kind, lock.profile);
  if (
    lock.schemaVersion !== DEV_QA_EXECUTION_LOCK_SCHEMA ||
    !UUID_PATTERN.test(String(lock.operationId || "")) ||
    !Number.isSafeInteger(lock.ownerPid) ||
    lock.ownerPid < 1 ||
    (lock.childPid !== null &&
      (!Number.isSafeInteger(lock.childPid) || lock.childPid < 1)) ||
    Number.isNaN(Date.parse(lock.acquiredAt))
  ) {
    throw new Error("QA execution lock is invalid");
  }
  return lock;
}

function ensureDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stats = lstatSync(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("QA execution lock directory is invalid");
  }
}

function readPrivateJson(file) {
  const stats = lstatSync(file);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.size > MAX_LOCK_BYTES
  ) {
    throw new Error("QA execution lock file is invalid");
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

function writePrivateJson(file, value) {
  ensureDirectory(path.dirname(file));
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, `${JSON.stringify(value)}\n`);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, file);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function resolveDevQaExecutionLockFile(operationStore) {
  return path.join(
    path.dirname(path.resolve(operationStore)),
    "qa-execution.lock",
  );
}

export function readDevQaExecutionLock(operationStore) {
  const file = resolveDevQaExecutionLockFile(operationStore);
  if (!existsSync(file)) return null;
  return validateDevQaExecutionLock(readPrivateJson(file));
}

export function acquireDevQaExecutionLock(
  operationStore,
  {
    kind,
    profile,
    operationId,
    ownerPid = process.pid,
    now = new Date().toISOString(),
  },
) {
  validateKindProfile(kind, profile);
  if (
    !UUID_PATTERN.test(String(operationId || "")) ||
    !Number.isSafeInteger(ownerPid) ||
    ownerPid < 1 ||
    Number.isNaN(Date.parse(now))
  ) {
    throw new Error("QA execution lock identity is invalid");
  }
  const file = resolveDevQaExecutionLockFile(operationStore);
  ensureDirectory(path.dirname(file));
  let descriptor;
  try {
    descriptor = openSync(file, "wx", 0o600);
    writeFileSync(
      descriptor,
      `${JSON.stringify({
        schemaVersion: DEV_QA_EXECUTION_LOCK_SCHEMA,
        kind,
        profile,
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
      const conflict = new Error("another DEV QA operation is running");
      conflict.code = "DEV_QA_EXECUTION_LOCKED";
      throw conflict;
    }
    throw error;
  }
  return readDevQaExecutionLock(operationStore);
}

export function attachDevQaExecutionChild(
  operationStore,
  { kind, profile, operationId, childPid },
) {
  const lock = readDevQaExecutionLock(operationStore);
  if (
    !lock ||
    lock.kind !== kind ||
    lock.profile !== profile ||
    lock.operationId !== operationId ||
    !Number.isSafeInteger(childPid) ||
    childPid < 1
  ) {
    throw new Error("QA execution child identity is invalid");
  }
  writePrivateJson(resolveDevQaExecutionLockFile(operationStore), {
    ...lock,
    childPid,
  });
  return readDevQaExecutionLock(operationStore);
}

export function releaseDevQaExecutionLock(
  operationStore,
  { kind, profile, operationId },
) {
  const lock = readDevQaExecutionLock(operationStore);
  if (!lock) return false;
  if (
    lock.kind !== kind ||
    lock.profile !== profile ||
    lock.operationId !== operationId
  ) {
    throw new Error("QA execution lock belongs to another operation");
  }
  unlinkSync(resolveDevQaExecutionLockFile(operationStore));
  return true;
}
