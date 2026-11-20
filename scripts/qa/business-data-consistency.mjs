#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  businessConsistencyTests,
  businessTestKey,
} from "./lib/business-rule-catalog.mjs";
import {
  BUSINESS_CONSISTENCY_SCHEMA,
  validateBusinessConsistencyEvidence,
} from "./lib/business-consistency-evidence.mjs";
import {
  assertRepositoryIdentityEqual,
  readRepositoryIdentity,
} from "./lib/repository-identity.mjs";
import { businessRuleTestResults } from "./verify-go-test-json.mjs";
import { verifyNodeTestSummary } from "./verify-node-test-summary.mjs";
import { buildCoverageReport } from "./test-coverage-report.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const reportName = "business-consistency.latest.json";
const emptyCounts = () => ({ executed: 0, passed: 0, failed: 0, skipped: 0 });
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

export function consistencyCommands() {
  const web = [
    ...new Set(businessConsistencyTests("web").map((entry) => entry.file)),
  ].map((file) => ({
    kind: "web",
    file,
    command: process.execPath,
    args: ["--test", "--test-reporter=tap", file],
    cwd: root,
  }));
  const packages = [
    ...new Set(
      businessConsistencyTests("server").map((entry) => entry.package),
    ),
  ];
  return [
    ...web,
    ...packages.map((pkg) => ({
      kind: "server",
      package: pkg,
      command: "go",
      args: [
        "test",
        `./${pkg.slice("server/".length)}`,
        "-count=1",
        "-json",
        "-run",
        `^(${businessConsistencyTests("server")
          .filter((entry) => entry.package === pkg)
          .map((entry) => escaped(entry.name))
          .join("|")})$`,
      ],
      cwd: path.join(root, "server"),
    })),
  ];
}

export function parseConsistencyTap(text, file) {
  const lines = String(text).split("\n");
  return businessConsistencyTests("web")
    .filter((entry) => entry.file === file)
    .map((entry) => {
      const matches = lines.flatMap((line, index) =>
        /^(?:not ok|ok) \d+ - /u.test(line) &&
        line.replace(/^(?:not ok|ok) \d+ - /u, "").replace(/ #.*$/u, "") === entry.name
          ? [index] : [],
      );
      const counts = emptyCounts();
      let status = "missing";
      if (matches.length === 1) {
        const end = matches[0];
        const start = lines.lastIndexOf(`# Subtest: ${entry.name}`, end);
        const children = start < 0 ? [] : lines.slice(start + 1, end)
          .filter((line) => /^\s+(?:not ok|ok) \d+ - /u.test(line));
        for (const line of [...children, lines[end]]) {
          counts.executed += 1;
          if (/#\s+(?:SKIP|TODO)\b/iu.test(line)) counts.skipped += 1;
          else if (line.trimStart().startsWith("not ok")) counts.failed += 1;
          else counts.passed += 1;
        }
        status = counts.failed ? "failed" : counts.skipped ? "skipped" : "passed";
      }
      return { id: businessTestKey(entry), status, counts };
    });
}

export function runConsistencyCommand(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      size = 0;
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > 32 * 1024 * 1024) child.kill();
      else stdout += chunk.toString();
    });
    child.stderr.resume();
    child.once("error", () => reject(new Error("专项测试进程无法启动")));
    child.once("close", (code) => resolve({ code, stdout }));
  });
}

export async function runBusinessConsistency({
  execute = runConsistencyCommand,
  repositoryReader = () => readRepositoryIdentity(root),
  write = false,
} = {}) {
  const repository = await repositoryReader();
  const results = [],
    events = [];
  let commandsPassed = true;
  for (const command of consistencyCommands()) {
    const result = await execute(command);
    commandsPassed &&= result.code === 0;
    if (command.kind === "web") {
      commandsPassed &&= verifyNodeTestSummary(result.stdout).ok;
      results.push(...parseConsistencyTap(result.stdout, command.file));
    } else
      for (const line of result.stdout.split("\n").filter(Boolean))
        events.push(JSON.parse(line));
  }
  const selected = new Set(
    businessConsistencyTests("server").map(businessTestKey),
  );
  results.push(
    ...businessRuleTestResults(events, "server").filter((entry) =>
      selected.has(entry.id),
    ),
  );
  const generatedAt = new Date().toISOString();
  const report = {
    schemaVersion: BUSINESS_CONSISTENCY_SCHEMA,
    generatedAt,
    repository,
    status:
      commandsPassed && results.every((entry) => entry.status === "passed")
        ? "passed"
        : "failed",
    tests: results,
  };
  validateBusinessConsistencyEvidence(report);
  assertRepositoryIdentityEqual(repository, await repositoryReader());
  if (write) {
    const directory = path.join(root, "output/qa/coverage");
    await mkdir(directory, { recursive: true });
    const staging = await mkdtemp(path.join(directory, ".consistency-"));
    try {
      const stagedReport = path.join(staging, reportName);
      await writeFile(stagedReport, `${JSON.stringify(report, null, 2)}\n`);
      const paths = (await readdir(directory))
        .filter(
          (name) =>
            name.endsWith(".json") &&
            !["latest.json", reportName].includes(name),
        )
        .map((name) => path.join(directory, name));
      const aggregate = await buildCoverageReport({
        projectRoot: root,
        repository,
        generatedAt,
        artifactPaths: [...paths, stagedReport],
      });
      // Public evidence refers to the canonical artifact, never its temporary directory.
      const content = JSON.stringify(aggregate).replaceAll(
        path.relative(root, stagedReport),
        `output/qa/coverage/${reportName}`,
      );
      const stagedAggregate = path.join(staging, "latest.json");
      await writeFile(
        stagedAggregate,
        `${JSON.stringify(JSON.parse(content), null, 2)}\n`,
      );
      assertRepositoryIdentityEqual(repository, await repositoryReader());
      await rename(stagedReport, path.join(directory, reportName));
      await rename(stagedAggregate, path.join(directory, "latest.json"));
      await readFile(path.join(directory, reportName), "utf8");
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }
  return report;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (
    process.argv
      .slice(2)
      .some((arg) => !["--write", "--help", "--plan"].includes(arg))
  )
    throw new Error("unknown business consistency argument");
  if (process.argv.includes("--help"))
    process.stdout.write(
      "node scripts/qa/business-data-consistency.mjs [--write|--plan]\n运行登记的前端与后端专项；PostgreSQL 复用现有隔离数据库门禁。\n",
    );
  else if (process.argv.includes("--plan"))
    process.stdout.write(
      `${JSON.stringify(
        consistencyCommands().map(({ kind, args }) => ({ kind, args })),
        null,
        2,
      )}\n`,
    );
  else
    runBusinessConsistency({ write: process.argv.includes("--write") })
      .then((report) => {
        process.stdout.write(
          `业务数据一致性: ${report.status}; ${report.tests.filter((entry) => entry.status === "passed").length}/${report.tests.length} 个登记用例通过\n`,
        );
        process.exitCode = report.status === "passed" ? 0 : 2;
      })
      .catch(() => {
        process.stderr.write(
          "业务数据一致性采集失败或源码变化，报告未更新。\n",
        );
        process.exitCode = 1;
      });
}
