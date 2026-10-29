import { execFile, spawn } from "node:child_process";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENTRY = fileURLToPath(import.meta.url);
export const NODE_TEST_LIMITS = Object.freeze({
  heapMiB: 1024,
  processRssMiB: 2048,
  totalRssMiB: 6144,
  outputBytes: 32 * 1024 * 1024,
  timeoutMs: 120_000,
  workerTimeoutMs: 300_000,
  pollMs: 100,
});
export const NODE_TEST_SUITE_TIMEOUT_MS = 1_800_000;

function verifyNativeKernelGuard() {
  if (process.platform !== "darwin") return null;
  const result = spawnSync(process.execPath, ["--plush-guard-status"], {
    encoding: "utf8", timeout: 3000, maxBuffer: 4096,
  });
  if (result.error || result.status !== 0) {
    throw new Error("macOS Node tests require the installed native kernel guard; run scripts/qa/native/install-node-test-guard.py --install");
  }
  const evidence = JSON.parse(result.stdout);
  const hash = createHash("sha256");
  for (const file of ["node-test-guard.c", "node-test-bootstrap.cjs"]) {
    hash.update(readFileSync(new URL(`../native/${file}`, import.meta.url)));
  }
  if (evidence.schema !== "plush.node-kernel-guard/v1" || evidence.source !== hash.digest("hex") ||
      !Number.isInteger(evidence.budgetMiB) || evidence.budgetMiB <= 0 || evidence.budgetMiB > 6144) {
    throw new Error("native Node test guard does not match the current source or memory budget; reinstall and validate it before testing");
  }
  return evidence;
}

export function nodeTestProcessArgs(args, { timeoutMs = NODE_TEST_LIMITS.timeoutMs } = {}) {
  return [ENTRY, "--timeout-ms", String(timeoutMs), "--", ...args];
}

function processSnapshot() {
  return new Promise((resolve, reject) => {
    execFile("ps", ["-axo", "pid=,ppid=,pgid=,rss=,stat=,comm="], {
      encoding: "utf8", timeout: 2000, maxBuffer: 4 * 1024 * 1024,
    }, (error, stdout) => {
      if (error) return reject(error);
      resolve(stdout.split("\n").flatMap((line) => {
        const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/u.exec(line);
        return match ? [{
          pid: Number(match[1]), ppid: Number(match[2]), pgid: Number(match[3]),
          rssMiB: Number(match[4]) / 1024, zombie: match[5].startsWith("Z"), executable: path.basename(match[6]),
        }] : [];
      }));
    });
  });
}

function ownedProcesses(rows, rootPid) {
  const owned = new Set([rootPid]);
  let size;
  do {
    size = owned.size;
    for (const row of rows) if (owned.has(row.ppid)) owned.add(row.pid);
  } while (owned.size !== size);
  return rows.filter((row) => owned.has(row.pid));
}

// Each invocation owns a fresh process group. Detached descendants are killed
// only when the current snapshot proves that their whole group belongs to it.
function killOwnedProcesses(child, rows) {
  if (!child.pid) return;
  const owned = ownedProcesses(rows, child.pid).filter((row) => !row.zombie);
  const pids = new Set(owned.map((row) => row.pid));
  const groups = new Set([child.pid]);
  for (const row of owned) {
    if (rows.every((member) => member.pgid !== row.pgid || pids.has(member.pid))) {
      groups.add(row.pgid);
    }
  }
  for (const group of groups) {
    if (!Number.isSafeInteger(group) || group <= 1 || group > 0x7fffffff) continue;
    try { process.kill(-group, "SIGKILL"); }
    catch (error) { if (error.code !== "ESRCH") { error.group = group; throw error; } }
  }
}

export async function runNodeTestProcess(args, {
  cwd = process.cwd(), env = process.env, limits = {},
} = {}) {
  const policy = { ...NODE_TEST_LIMITS, ...limits };
  if (!["darwin", "linux"].includes(process.platform)) {
    throw new Error("Node test resource supervision requires macOS or Linux");
  }
  for (const [key, value] of Object.entries(policy)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`invalid Node test limit: ${key}`);
  }
  if (!args.includes("--test")) throw new Error("supervised Node command requires --test");
  if (args.some((arg, index) => arg === "--test-isolation=none" ||
      (arg === "--test-isolation" && args[index + 1] === "none"))) {
    throw new Error("supervised Node tests require process isolation");
  }
  if (args.some((arg) => /^--max[-_](?:old|semi)[-_]space[-_]size/u.test(arg)) ||
      /--max[-_]old[-_]space[-_]size[-_]percentage/u.test(env.NODE_OPTIONS || "")) {
    throw new Error("Node test heap limits must be controlled by the shared runner");
  }
  const kernelGuard = verifyNativeKernelGuard();
  const nodeExecutable = path.basename(kernelGuard ? process.argv0 : process.execPath);
  const heapOptions = `--max-old-space-size=${policy.heapMiB} --max-semi-space-size=16`;
  const started = Date.now();
  const parentPid = process.ppid;
  const child = spawn(process.execPath, [
    ...heapOptions.split(" "), "--test-concurrency=1", ...args,
  ], {
    cwd,
    env: { ...env, GIT_OPTIONAL_LOCKS: "0", NODE_OPTIONS: `${env.NODE_OPTIONS || ""} ${heapOptions}`.trim() },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = { stdout: [], stderr: [] };
  const workers = new Map();
  let outputBytes = 0;
  let reason = "";
  let cleanupError = "";
  let rows = [];
  let sampling = false;
  let closed = false;
  let exited = false;
  let exitCleanup = Promise.resolve();
  let peakProcessRssMiB = 0;
  let peakTotalRssMiB = 0;
  let limitProcess = null;
  const stop = (cause) => {
    if (reason) return;
    reason = cause;
    try { killOwnedProcesses(child, rows); }
    catch (error) { cleanupError = error.code || error.name; }
  };
  const interrupted = () => stop("interrupted");
  process.once("SIGINT", interrupted);
  process.once("SIGTERM", interrupted);
  const sample = async () => {
    if (closed || exited || sampling || reason) return;
    if (process.ppid !== parentPid) return stop("parent-exited");
    sampling = true;
    try {
      const snapshot = await processSnapshot();
      if (closed || reason) return;
      rows = snapshot;
      const owned = ownedProcesses(rows, child.pid).filter((row) => !row.zombie);
      const total = owned.reduce((sum, row) => sum + row.rssMiB, 0);
      peakTotalRssMiB = Math.max(peakTotalRssMiB, total);
      for (const row of owned) {
        peakProcessRssMiB = Math.max(peakProcessRssMiB, row.rssMiB);
        if (row.rssMiB > policy.processRssMiB) {
          limitProcess = { pid: row.pid, executable: row.executable, rssMiB: Math.ceil(row.rssMiB) };
          return stop("process-rss-limit");
        }
        if (row.ppid !== child.pid) continue;
        // Linux comm is a mutable thread name (Node uses MainThread). Resolve
        // the executable instead so file deadlines cannot silently disappear.
        let executable = row.executable;
        if (process.platform === "linux") {
          try { executable = path.basename(await readlink(`/proc/${row.pid}/exe`)); }
          catch (error) { if (error.code === "ENOENT" || error.code === "ESRCH") continue; throw error; }
        }
        if (executable === nodeExecutable) {
          if (!workers.has(row.pid)) workers.set(row.pid, Date.now());
          if (Date.now() - workers.get(row.pid) > policy.workerTimeoutMs) return stop("worker-timeout");
        }
      }
      if (total > policy.totalRssMiB) stop("total-rss-limit");
    } catch { if (!closed) stop("process-inspection-failed"); }
    finally { sampling = false; }
  };
  const deadline = setTimeout(() => stop("timeout"), policy.timeoutMs);
  const poll = setInterval(sample, policy.pollMs);
  void sample();
  for (const stream of ["stdout", "stderr"]) {
    child[stream].on("data", (chunk) => {
      const remaining = policy.outputBytes - outputBytes;
      if (remaining > 0) output[stream].push(chunk.subarray(0, remaining));
      outputBytes += chunk.length;
      if (outputBytes > policy.outputBytes) stop("output-limit");
    });
  }
  child.once("error", () => stop("process-start-failed"));
  child.once("exit", () => {
    // A worker must not survive a test runner which exits before its children.
    exited = true;
    if (reason) return;
    exitCleanup = (async () => {
      try {
        const fresh = await processSnapshot();
        if (fresh.some((row) => row.pgid === child.pid && !row.zombie)) killOwnedProcesses(child, fresh);
      } catch (error) {
        // macOS can return EPERM while the last group members are exiting.
        // Suppress it only after proving that no live group member remains.
        const fresh = await processSnapshot();
        if (fresh.some((row) => row.pgid === (error.group || child.pid) && !row.zombie)) {
          cleanupError = error.code || error.name;
          reason ||= "process-cleanup-failed";
        }
      }
    })().catch(() => { cleanupError = "inspection-failed"; reason ||= "process-cleanup-failed"; });
  });
  const result = await new Promise((resolve) => child.once("close", (status, signal) => resolve({ status, signal })));
  await exitCleanup;
  closed = true;
  clearTimeout(deadline);
  clearInterval(poll);
  process.removeListener("SIGINT", interrupted);
  process.removeListener("SIGTERM", interrupted);
  return {
    ...result, reason, cleanupError, kernelGuard, limitProcess, durationMs: Date.now() - started,
    peakProcessRssMiB: Math.ceil(peakProcessRssMiB),
    peakTotalRssMiB: Math.ceil(peakTotalRssMiB),
    stdout: Buffer.concat(output.stdout).toString("utf8"),
    stderr: Buffer.concat(output.stderr).toString("utf8"),
  };
}

async function main(argv) {
  if (argv[0] !== "--timeout-ms" || argv[2] !== "--" || !/^[1-9]\d*$/u.test(argv[1] || "")) {
    throw new Error("expected --timeout-ms <positive integer> -- <native Node test arguments>");
  }
  const result = await runNodeTestProcess(argv.slice(3), { limits: { timeoutMs: Number(argv[1]) } });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.reason) {
    console.error(`[qa:node-process] status=incomplete reason=${result.reason} cleanupError=${result.cleanupError || "none"} durationMs=${result.durationMs} peakProcessRssMiB=${result.peakProcessRssMiB} peakTotalRssMiB=${result.peakTotalRssMiB} limitProcess=${JSON.stringify(result.limitProcess)}`);
  }
  process.exitCode = result.reason ? 1 : result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === ENTRY) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`[qa:node-process] ${error.message}`);
    process.exitCode = 1;
  });
}
