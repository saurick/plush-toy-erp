#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyGoTestJson } from "./verify-go-test-json.mjs";
import { verifyNodeTestSummary } from "./verify-node-test-summary.mjs";

export function evaluateTestGate({
  kind,
  status,
  stdout = "",
  stderr = "",
  error,
  excludedSkipPattern = "",
}) {
  if (error) throw error;
  let result = null;
  try {
    result =
      kind === "node"
        ? verifyNodeTestSummary(`${stdout}\n${stderr}`)
        : kind === "go"
          ? verifyGoTestJson(stdout, [], { excludedSkipPattern })
          : null;
  } catch (summaryError) {
    if (status !== 0) {
      return { ok: false, reason: "child-exit", exitCode: status ?? 1 };
    }
    throw summaryError;
  }
  if (!result) throw new Error(`unsupported test kind: ${kind}`);
  if (status !== 0) {
    return {
      ok: false,
      reason: "child-exit",
      exitCode: status ?? 1,
      result,
    };
  }
  return { ok: result.ok, reason: result.ok ? "complete" : "invalid-summary", result };
}

export function formatIncompleteSummary(kind, result, output = "") {
  if (kind === "node") {
    const failedTests = [...String(output).matchAll(/^\s*not ok \d+ - ([^\r\n]+)/gmu)]
      .slice(0, 20)
      .map((match) => match[1].slice(0, 512));
    const failures = failedTests.length
      ? ` failedTests=${JSON.stringify(failedTests)}`
      : "";
    return `tests=${result.tests ?? "missing"} pass=${result.pass ?? "missing"} fail=${result.fail ?? "missing"} cancelled=${result.cancelled ?? "missing"} skipped=${result.skipped ?? "missing"} todo=${result.todo ?? "missing"}${failures}`;
  }
  if (kind === "go") {
    const failedTests = (result.failedTests || [])
      .slice(0, 20)
      .map((name) => String(name).slice(0, 512));
    const failures = failedTests.length
      ? ` failedTests=${JSON.stringify(failedTests)}`
      : "";
    return `run=${result.run} pass=${result.pass} fail=${result.fail} skip=${result.skip} excluded=${result.excluded ?? 0} unresolved=${result.unresolvedTests.length}${failures}`;
  }
  throw new Error(`unsupported test kind: ${kind}`);
}

export function parseArgs(argv) {
  const separator = argv.indexOf("--");
  if (separator < 0) throw new Error("expected -- before the test command");
  const options = {
    kind: "",
    label: "",
    excludedSkipPattern: "",
    outputMode: "full",
    timeoutMs: 0,
  };
  let excludedSkipPatternSeen = false;
  let outputModeSeen = false;
  for (let index = 0; index < separator; index += 1) {
    const arg = argv[index];
    if (arg === "--kind" || arg === "--label") {
      const value = argv[++index];
      if (!value || index >= separator) throw new Error(`${arg} requires a value`);
      options[arg.slice(2)] = value;
      continue;
    }
    if (arg === "--exclude-skip-pattern") {
      if (excludedSkipPatternSeen) {
        throw new Error("--exclude-skip-pattern may be provided only once");
      }
      const value = argv[++index];
      if (!value || index >= separator) {
        throw new Error("--exclude-skip-pattern requires a value");
      }
      options.excludedSkipPattern = value;
      excludedSkipPatternSeen = true;
      continue;
    }
    if (arg === "--output-mode") {
      if (outputModeSeen) {
        throw new Error("--output-mode may be provided only once");
      }
      const value = argv[++index];
      if (!value || index >= separator) {
        throw new Error("--output-mode requires a value");
      }
      options.outputMode = value;
      outputModeSeen = true;
      continue;
    }
    if (arg === "--timeout-ms") {
      if (options.timeoutMs) throw new Error("--timeout-ms may be provided only once");
      const value = argv[++index];
      const timeoutMs = Number(value);
      if (!/^[1-9]\d*$/u.test(value || "") || !Number.isSafeInteger(timeoutMs) || timeoutMs > 3_600_000 || index >= separator) {
        throw new Error("--timeout-ms must be an integer from 1 to 3600000");
      }
      options.timeoutMs = timeoutMs;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }
  if (!new Set(["node", "go"]).has(options.kind)) {
    throw new Error("--kind must be node or go");
  }
  if (!options.label) throw new Error("--label is required");
  if (!new Set(["full", "summary"]).has(options.outputMode)) {
    throw new Error("--output-mode must be full or summary");
  }
  if (excludedSkipPatternSeen && options.kind !== "go") {
    throw new Error("--exclude-skip-pattern is supported only for --kind go");
  }
  if (excludedSkipPatternSeen) {
    try {
      new RegExp(options.excludedSkipPattern, "u");
    } catch {
      throw new Error("--exclude-skip-pattern must be a valid regex");
    }
  }
  const command = argv[separator + 1];
  if (!command) throw new Error("test command is required");
  return { ...options, command, args: argv.slice(separator + 2) };
}

function writeStream(stream, content) {
  return new Promise((resolve, reject) => {
    stream.write(content, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export async function emitCapturedOutput(
  { stdout = "", stderr = "" },
  write = writeStream,
) {
  if (stdout) await write(process.stdout, stdout);
  if (stderr) await write(process.stderr, stderr);
}

function runWithDeadline(options) {
  return new Promise((resolve) => {
    const child = spawn(options.command, options.args, {
      cwd: process.cwd(),
      env: process.env,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output = { stdout: [], stderr: [] };
    const sizes = { stdout: 0, stderr: 0 };
    let error;
    const stop = (reason) => {
      error ||= new Error(reason);
      if (!child.pid) return;
      try {
        if (process.platform === "win32") child.kill("SIGKILL");
        else process.kill(-child.pid, "SIGKILL");
      } catch (killError) {
        if (killError.code !== "ESRCH") error = killError;
      }
    };
    const interrupted = () => stop("test command interrupted");
    process.once("SIGINT", interrupted);
    process.once("SIGTERM", interrupted);
    const timer = setTimeout(
      () => stop(`test command timed out after ${options.timeoutMs}ms`),
      options.timeoutMs,
    );
    for (const stream of ["stdout", "stderr"]) {
      child[stream].on("data", (chunk) => {
        sizes[stream] += chunk.length;
        if (sizes[stream] > 256 * 1024 * 1024) stop("test output exceeded maxBuffer");
        else output[stream].push(chunk);
      });
    }
    child.on("error", (cause) => { error = cause; });
    child.on("close", (status) => {
      clearTimeout(timer);
      process.removeListener("SIGINT", interrupted);
      process.removeListener("SIGTERM", interrupted);
      resolve({
        status,
        error,
        stdout: Buffer.concat(output.stdout).toString("utf8"),
        stderr: Buffer.concat(output.stderr).toString("utf8"),
      });
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const child = options.timeoutMs ? await runWithDeadline(options) : spawnSync(options.command, options.args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (options.outputMode === "full") {
    await emitCapturedOutput(child);
  }
  const outcome = evaluateTestGate({
    kind: options.kind,
    status: child.status,
    stdout: child.stdout,
    stderr: child.stderr,
    error: child.error,
    excludedSkipPattern: options.excludedSkipPattern,
  });
  if (!outcome.ok) {
    const summary = outcome.result
      ? ` ${formatIncompleteSummary(options.kind, outcome.result, child.stdout)}`
      : "";
    console.error(
      `[qa:test-gate] label=${options.label} status=incomplete reason=${outcome.reason}${summary}`,
    );
    process.exitCode = outcome.exitCode || 1;
    return;
  }
  const result = outcome.result;
  if (options.kind === "node") {
    console.log(
      `[qa:test-gate] label=${options.label} status=complete tests=${result.tests} pass=${result.pass} fail=${result.fail} skipped=${result.skipped}`,
    );
  } else {
    console.log(
      `[qa:test-gate] label=${options.label} status=complete run=${result.run} pass=${result.pass} fail=${result.fail} skip=${result.skip} excluded=${result.excluded ?? 0}`,
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[qa:test-gate] ${error.message}`);
    process.exitCode = 1;
  });
}
