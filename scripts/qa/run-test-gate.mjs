#!/usr/bin/env node

import { spawnSync } from "node:child_process";
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

export function formatIncompleteSummary(kind, result) {
  if (kind === "node") {
    return `tests=${result.tests ?? "missing"} pass=${result.pass ?? "missing"} fail=${result.fail ?? "missing"} cancelled=${result.cancelled ?? "missing"} skipped=${result.skipped ?? "missing"} todo=${result.todo ?? "missing"}`;
  }
  if (kind === "go") {
    return `run=${result.run} pass=${result.pass} fail=${result.fail} skip=${result.skip} excluded=${result.excluded ?? 0} unresolved=${result.unresolvedTests.length}`;
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const child = spawnSync(options.command, options.args, {
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
      ? ` ${formatIncompleteSummary(options.kind, outcome.result)}`
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
