#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { requireCompatibleNode } from "./runtime.mjs";
import {
  ReplicaError,
  loadConfig,
  requireValue,
  resolveVolume,
} from "./config.mjs";
import {
  atomicJSON,
  checkDestinationAccess,
  destination,
  now,
  privateDirectory,
} from "./storage.mjs";
import { SSHSource } from "./transport.mjs";
import { synchronize } from "./sync.mjs";
import { verifyRestore } from "./restore.mjs";
import { GitlabSource, synchronizeGitlab } from "./gitlab-sync.mjs";
import { verifyGitlab } from "./gitlab-restore.mjs";
import { prepareInstallation, finishInstallation } from "./install.mjs";
import { checkHealth } from "./health.mjs";

export function restoreDue(c, previous, clock = Date.now()) {
  return (
    !previous ||
    previous.status !== "passed" ||
    previous.sourceId !== c.source.id ||
    previous.destinationId !== c.destination.id ||
    previous.volumeUUID !== c.destination.volumeUUID ||
    !Number.isFinite(Date.parse(previous.checkedAt)) ||
    clock < Date.parse(previous.checkedAt) ||
    clock - Date.parse(previous.checkedAt) >= c.restore.everyDays * 86400_000
  );
}
export async function execute(
  action,
  c,
  configFile,
  { signal, volume = resolveVolume, source, restore } = {},
) {
  const state = privateDirectory(c.stateDirectory);
  const gitlab = c.source.kind === "gitlab";
  source ??= gitlab ? new GitlabSource(c, signal) : new SSHSource(c, signal);
  restore ??= gitlab ? verifyGitlab : verifyRestore;
  let mount;
  try {
    mount = volume(c);
  } catch (error) {
    if (error.code === "volume_not_mounted" && ["sync", "run"].includes(action))
      return {
        status: "skipped",
        reason: error.code,
        checkedAt: now(),
        destinationId: c.destination.id,
      };
    throw error;
  }
  if (["sync", "verify", "run", "check"].includes(action))
    await checkDestinationAccess(c, mount, { signal });
  const root = destination(c, mount, action === "init");
  if (action === "check") return checkHealth(c, root);
  if (action === "init")
    return {
      status: "passed",
      action,
      checkedAt: now(),
      destinationId: c.destination.id,
    };
  if (action === "prepare-install")
    return prepareInstallation(c, configFile, state, { signal });
  const attemptFile = path.join(state, "latest-restore-attempt.json");
  const performRestore = async () => {
    const identity = {
      sourceId: c.source.id,
      destinationId: c.destination.id,
      volumeUUID: c.destination.volumeUUID,
    };
    atomicJSON(attemptFile, {
      ...identity,
      status: "running",
      checkedAt: now(),
    });
    try {
      const result = await restore(c, root, state, { signal });
      atomicJSON(attemptFile, {
        ...identity,
        status: "passed",
        checkedAt: result.checkedAt ?? now(),
      });
      return result;
    } catch (error) {
      atomicJSON(attemptFile, {
        ...identity,
        status: "failed",
        checkedAt: now(),
        reason: error.code ?? error.name,
        stage: error.stage,
      });
      throw error;
    }
  };
  if (action === "verify") return performRestore();
  const result = await (gitlab ? synchronizeGitlab : synchronize)(
    c,
    root,
    source,
    {
      signal,
      ensureTarget: () => {
        requireValue(volume(c) === mount, "volume_identity_mismatch");
        destination(c, mount);
      },
    },
  );
  atomicJSON(path.join(state, "latest-sync.json"), result);
  if (action === "run") {
    const file = path.join(state, "latest-restore.json"),
      previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : null;
    const attempt = fs.existsSync(attemptFile)
      ? JSON.parse(fs.readFileSync(attemptFile))
      : null;
    result.restore =
      restoreDue(c, previous) || (attempt && restoreDue(c, attempt))
        ? await performRestore()
        : { status: "not_due", lastVerifiedAt: previous.checkedAt };
  }
  atomicJSON(path.join(state, "last-success.json"), result);
  return result;
}
export function lockArguments(state, entry, action, configFile) {
  const file = path.join(state, "replica.lock");
  if (process.platform === "darwin")
    return [
      "/usr/bin/lockf",
      "-s",
      "-t",
      "0",
      "-k",
      file,
      process.execPath,
      entry,
      action,
      "--config",
      configFile,
    ];
  return [
    "flock",
    "-n",
    file,
    process.execPath,
    entry,
    action,
    "--config",
    configFile,
  ];
}
async function locked(action, c, configFile, signal) {
  const args = lockArguments(
    privateDirectory(c.stateDirectory),
    fileURLToPath(import.meta.url),
    action,
    configFile,
  );
  const child = spawn(args[0], args.slice(1), {
    stdio: ["ignore", "pipe", "pipe", "pipe"],
    env: { ...process.env, PLUSH_BACKUP_REPLICA_LOCKED: "1" },
  });
  let innerPid = null,
    requested = false,
    out = "",
    pidText = "";
  const forward = () => {
    requested = true;
    if (innerPid)
      try {
        process.kill(innerPid, "SIGTERM");
      } catch {
        // The worker can exit between sending its PID and receiving a signal.
      }
  };
  signal.addEventListener("abort", forward, { once: true });
  child.stdio[3].on("data", (chunk) => {
    pidText += chunk.toString();
    if (pidText.includes("\n")) {
      requireValue(/^[1-9][0-9]*\n$/u.test(pidText), "worker_pid_invalid");
      innerPid = Number(pidText.trim());
      if (requested) forward();
    }
  });
  child.stdout.on("data", (chunk) => (out += chunk));
  child.stderr.on("data", () => {});
  const outcome = await new Promise((resolve) => {
    child.once("error", (error) => resolve({ error }));
    child.once("close", (code) => resolve({ code }));
  });
  signal.removeEventListener("abort", forward);
  if (outcome.error) throw new ReplicaError("kernel_lock_tool_unavailable");
  if (!out.trim())
    throw new ReplicaError(
      outcome.code === 0 ? "worker_receipt_missing" : "replica_already_running",
    );
  const result = JSON.parse(out);
  if (outcome.code !== 0) {
    const error = new ReplicaError(result.reason ?? "worker_failed");
    error.stage = result.stage;
    throw error;
  }
  return result;
}
function producer() {
  const file = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "artifact.json",
  );
  if (!fs.existsSync(file))
    return { sourceState: "working-tree", nodeVersion: process.version };
  const identity = JSON.parse(fs.readFileSync(file));
  requireCompatibleNode(identity.nodeVersion);
  requireValue(
    Array.isArray(identity.files) && identity.files.length > 0,
    "runtime_artifact_invalid",
  );
  const hash = createHash("sha256");
  for (const name of identity.files) {
    requireValue(
      /^[a-z0-9-]+\.(?:mjs|sh|rb)$/u.test(name),
      "runtime_artifact_invalid",
    );
    hash.update(name + "\0");
    hash.update(fs.readFileSync(path.join(path.dirname(file), name)));
  }
  requireValue(
    hash.digest("hex") === identity.sha256,
    "runtime_artifact_drift",
  );
  return {
    sourceCommit:
      identity.sourceState === "content-snapshot" ? undefined : identity.gitSha,
    baseCommit: identity.gitSha,
    sourceState: identity.sourceState ?? "committed",
    contentSha256: identity.sha256,
    nodeVersion: process.version,
  };
}
export async function main(argv = process.argv.slice(2)) {
  process.umask(0o077);
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    console.log(
      "node cli.mjs <init|sync|verify|run|check|status|install> --config <private.json>",
    );
    return 0;
  }
  const abort = new AbortController();
  const interrupted = () => abort.abort(new ReplicaError("interrupted"));
  process.on("SIGTERM", interrupted);
  process.on("SIGINT", interrupted);
  let c,
    action = argv[0],
    result,
    exit = 0,
    identity = { nodeVersion: process.version };
  try {
    requireValue(
      argv.length === 3 &&
        argv[1] === "--config" &&
        [
          "init",
          "sync",
          "verify",
          "run",
          "check",
          "status",
          "install",
          ...(process.env.PLUSH_BACKUP_REPLICA_LOCKED === "1"
            ? ["prepare-install"]
            : []),
        ].includes(action),
      "invalid_arguments",
    );
    const file = path.resolve(argv[2]);
    c = loadConfig(file);
    identity = producer();
    if (action === "status") {
      const status = path.join(c.stateDirectory, "latest-operation.json");
      result = fs.existsSync(status)
        ? JSON.parse(fs.readFileSync(status))
        : { status: "not_run" };
    } else if (process.env.PLUSH_BACKUP_REPLICA_LOCKED === "1") {
      fs.writeSync(3, String(process.pid) + "\n");
      result = await execute(action, c, file, { signal: abort.signal });
    } else {
      result = await locked(
        action === "install" ? "prepare-install" : action,
        c,
        file,
        abort.signal,
      );
      if (action === "install")
        result = await finishInstallation(result, c.stateDirectory, {
          signal: abort.signal,
        });
    }
  } catch (error) {
    exit = 1;
    result = {
      status: "failed",
      checkedAt: now(),
      action,
      reason: abort.signal.aborted ? "interrupted" : (error.code ?? error.name),
      ...(error.stage ? { stage: error.stage } : {}),
    };
  }
  if (action !== "status" || !result.producer) result.producer = identity;
  if (c && !["status", "check", "install", "prepare-install"].includes(action))
    atomicJSON(
      path.join(privateDirectory(c.stateDirectory), "latest-operation.json"),
      result,
    );
  console.log(JSON.stringify(result));
  process.removeListener("SIGTERM", interrupted);
  process.removeListener("SIGINT", interrupted);
  return exit;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  process.exitCode = await main();
