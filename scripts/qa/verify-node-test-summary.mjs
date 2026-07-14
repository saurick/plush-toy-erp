import path from "node:path";
import { fileURLToPath } from "node:url";

const SUMMARY_KEYS = Object.freeze([
  "tests",
  "pass",
  "fail",
  "cancelled",
  "skipped",
  "todo",
]);

function stripAnsi(value) {
  return String(value).replace(/\x1B\[[0-?]*[ -/]*[@-~]/gu, "");
}

export function verifyNodeTestSummary(output) {
  const summary = Object.fromEntries(SUMMARY_KEYS.map((key) => [key, null]));
  const counts = Object.fromEntries(SUMMARY_KEYS.map((key) => [key, 0]));
  for (const line of stripAnsi(output).split("\n")) {
    const match = line.trim().match(/^(?:#|ℹ) (tests|pass|fail|cancelled|skipped|todo) (\d+)$/u);
    if (match) {
      counts[match[1]] += 1;
      summary[match[1]] = Number(match[2]);
    }
  }

  const missing = SUMMARY_KEYS.filter((key) => summary[key] === null);
  const duplicate = SUMMARY_KEYS.filter((key) => counts[key] > 1);
  const ok =
    missing.length === 0 &&
    duplicate.length === 0 &&
    summary.tests > 0 &&
    summary.pass > 0 &&
    summary.pass === summary.tests &&
    summary.fail === 0 &&
    summary.cancelled === 0 &&
    summary.skipped === 0 &&
    summary.todo === 0;

  return { ok, ...summary, missing, duplicate };
}

function main() {
  const chunks = [];
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => chunks.push(chunk));
  process.stdin.on("end", () => {
    const result = verifyNodeTestSummary(chunks.join(""));
    console.log(
      `[qa:node-summary] tests=${result.tests ?? "missing"} pass=${result.pass ?? "missing"} fail=${result.fail ?? "missing"} cancelled=${result.cancelled ?? "missing"} skipped=${result.skipped ?? "missing"} todo=${result.todo ?? "missing"}`,
    );
    if (result.missing.length > 0) {
      console.error(`[qa:node-summary] missing=${result.missing.join(",")}`);
    }
    if (result.duplicate.length > 0) {
      console.error(`[qa:node-summary] duplicate=${result.duplicate.join(",")}`);
    }
    if (!result.ok) process.exitCode = 1;
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
