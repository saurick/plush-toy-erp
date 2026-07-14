#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyGoTestJson } from "./verify-go-test-json.mjs";
import { verifyNodeTestSummary } from "./verify-node-test-summary.mjs";

export function evaluateTestGate({ kind, status, stdout = "", stderr = "", error }) {
  if (error) throw error;
  if (status !== 0) {
    return { ok: false, reason: "child-exit", exitCode: status ?? 1 };
  }
  const result =
    kind === "node"
      ? verifyNodeTestSummary(`${stdout}\n${stderr}`)
      : kind === "go"
        ? verifyGoTestJson(stdout)
        : null;
  if (!result) throw new Error(`unsupported test kind: ${kind}`);
  return { ok: result.ok, reason: result.ok ? "complete" : "invalid-summary", result };
}

export function formatIncompleteSummary(kind, result) {
  if (kind === "node") {
    return `tests=${result.tests ?? "missing"} pass=${result.pass ?? "missing"} fail=${result.fail ?? "missing"} cancelled=${result.cancelled ?? "missing"} skipped=${result.skipped ?? "missing"} todo=${result.todo ?? "missing"}`;
  }
  if (kind === "go") {
    return `run=${result.run} pass=${result.pass} fail=${result.fail} skip=${result.skip} unresolved=${result.unresolvedTests.length}`;
  }
  throw new Error(`unsupported test kind: ${kind}`);
}

function parseArgs(argv) {
  const separator = argv.indexOf("--");
  if (separator < 0) throw new Error("expected -- before the test command");
  const options = { kind: "", label: "" };
  for (let index = 0; index < separator; index += 1) {
    const arg = argv[index];
    if (arg === "--kind" || arg === "--label") {
      const value = argv[++index];
      if (!value || index >= separator) throw new Error(`${arg} requires a value`);
      options[arg.slice(2)] = value;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }
  if (!new Set(["node", "go"]).has(options.kind)) {
    throw new Error("--kind must be node or go");
  }
  if (!options.label) throw new Error("--label is required");
  const command = argv[separator + 1];
  if (!command) throw new Error("test command is required");
  return { ...options, command, args: argv.slice(separator + 2) };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const child = spawnSync(options.command, options.args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    maxBuffer: 256 * 1024 * 1024,
  });
  process.stdout.write(child.stdout || "");
  process.stderr.write(child.stderr || "");
  const outcome = evaluateTestGate({
    kind: options.kind,
    status: child.status,
    stdout: child.stdout,
    stderr: child.stderr,
    error: child.error,
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
      `[qa:test-gate] label=${options.label} status=complete run=${result.run} pass=${result.pass} fail=${result.fail} skip=${result.skip}`,
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`[qa:test-gate] ${error.message}`);
    process.exitCode = 1;
  }
}
