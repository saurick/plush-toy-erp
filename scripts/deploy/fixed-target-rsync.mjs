import path from "node:path";
import { spawnSync } from "node:child_process";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const MINIMUM_RSYNC_MAJOR = 3;
const FIXED_REMOTE_RSYNC_PATH = "/usr/bin/rsync";

function assertFixedTarget(target) {
  if (
    target?.key !== "test-133" ||
    target?.ssh?.host !== "192.168.0.133" ||
    target?.ssh?.port !== 22 ||
    target?.ssh?.user !== "simon" ||
    target?.filesystem?.root !== "/home/simon/plush-toy-erp-v5"
  ) {
    throw new Error("rsync target does not match the fixed test-133 contract");
  }
}

export function assertLocalRsync(runCommand = spawnSync) {
  const result = runCommand("rsync", ["--version"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024,
    timeout: 10_000,
  });
  if (result.error) {
    throw new Error(`local rsync could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `local rsync check failed with exit ${String(result.status)}`,
    );
  }
  const match =
    /^rsync\s+version\s+(\d+)\.(\d+)\.(\d+)\s+protocol version\s+(\d+)/mu.exec(
      String(result.stdout || ""),
    );
  if (!match || Number(match[1]) < MINIMUM_RSYNC_MAJOR) {
    throw new Error("local rsync 3.x or newer is required");
  }
  return Object.freeze({
    version: `${match[1]}.${match[2]}.${match[3]}`,
    protocol: Number(match[4]),
  });
}

export function buildFixedTargetRsyncTransfer({
  target,
  operationId,
  sourceFiles,
}) {
  assertFixedTarget(target);
  if (!UUID_V4_PATTERN.test(String(operationId || ""))) {
    throw new Error("rsync operation id is invalid");
  }
  if (
    !Array.isArray(sourceFiles) ||
    sourceFiles.length === 0 ||
    sourceFiles.length > 32 ||
    sourceFiles.some(
      (file) =>
        typeof file !== "string" ||
        !path.isAbsolute(file) ||
        file.includes("\0") ||
        file.includes("\n"),
    )
  ) {
    throw new Error("rsync source file list is invalid");
  }

  const remoteShell = [
    "ssh",
    "-o BatchMode=yes",
    "-o ConnectTimeout=8",
    "-o StrictHostKeyChecking=yes",
    `-p ${String(target.ssh.port)}`,
  ].join(" ");
  const remoteDestination =
    `${target.ssh.user}@${target.ssh.host}:` +
    `${target.filesystem.root}/incoming/${operationId}/`;

  return Object.freeze({
    command: "rsync",
    args: Object.freeze([
      "--archive",
      "--no-owner",
      "--no-group",
      "--chmod=F600",
      "--inplace",
      "--protect-args",
      "--timeout=600",
      `--rsync-path=${FIXED_REMOTE_RSYNC_PATH}`,
      `--rsh=${remoteShell}`,
      "--",
      ...sourceFiles,
      remoteDestination,
    ]),
    remoteDestination,
  });
}
