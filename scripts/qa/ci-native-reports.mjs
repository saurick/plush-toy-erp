#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "../..");
const xml = (value) =>
  String(value).replace(
    /[<>&"']/gu,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );

// Explicit arguments prevent nested test fixtures from inheriting report writers.
export function nativeNodeReportArgs(root, label, { coverage = false } = {}) {
  if (!/^[a-z][a-z0-9_-]*$/u.test(label))
    throw new Error("invalid native report label");
  const directory = path.join(root, "output/ci/reports");
  mkdirSync(path.join(directory, "tests"), { recursive: true });
  const args = [
    "--test-reporter=tap",
    "--test-reporter-destination=stdout",
    `--test-reporter=${path.join(import.meta.dirname, "ci-junit-reporter.mjs")}`,
    `--test-reporter-destination=${directory}/tests/${label}.xml`,
  ];
  if (coverage) {
    mkdirSync(path.join(directory, "coverage"), { recursive: true });
    args.push(
      "--experimental-test-coverage",
      `--test-coverage-include=${root}/web/src/**`,
      `--test-coverage-include=${root}/web/dev-server/**`,
      "--test-coverage-exclude=**/*.test.*",
      "--test-coverage-exclude=**/node_modules/**",
      "--test-reporter=lcov",
      `--test-reporter-destination=${directory}/coverage/web.lcov`,
    );
  }
  return args;
}

function relativeSource(root, file) {
  const relative = path
    .relative(root, path.resolve(root, file))
    .split(path.sep)
    .join("/");
  if (!relative || relative.startsWith("../"))
    throw new Error("coverage source outside repository");
  return relative;
}

export function lcovLines(source, root) {
  const files = new Map();
  let lines;
  for (const row of source.split(/\r?\n/u)) {
    if (row.startsWith("SF:")) {
      const file = relativeSource(root, row.slice(3));
      lines = files.get(file) || new Map();
      files.set(file, lines);
    } else if (row.startsWith("DA:")) {
      const match = /^DA:(\d+),(\d+)(?:,.*)?$/u.exec(row);
      if (!match || !lines || Number(match[1]) < 1)
        throw new Error("invalid LCOV line");
      lines.set(
        Number(match[1]),
        Math.max(lines.get(Number(match[1])) || 0, Number(match[2])),
      );
    } else if (row === "end_of_record") lines = undefined;
  }
  return files;
}

export function goCoverage(source, moduleName) {
  const files = new Map();
  let covered = 0;
  let total = 0;
  const rows = source.trim().split(/\r?\n/u);
  if (!/^mode: (set|count|atomic)$/u.test(rows.shift() || ""))
    throw new Error("invalid Go coverprofile");
  for (const row of rows) {
    const match = /^(.*):(\d+)\.\d+,(\d+)\.\d+ (\d+) (\d+)$/u.exec(row);
    if (!match || !match[1].startsWith(`${moduleName}/`))
      throw new Error("invalid Go coverage source");
    const file = `server/${match[1].slice(moduleName.length + 1)}`;
    relativeSource(ROOT, file);
    const hits = Number(match[5]);
    const statements = Number(match[4]);
    total += statements;
    if (hits > 0) covered += statements;
    const lines = files.get(file) || new Map();
    for (let line = Number(match[2]); line <= Number(match[3]); line += 1)
      lines.set(line, Math.max(lines.get(line) || 0, hits));
    files.set(file, lines);
  }
  if (total === 0) throw new Error("Go coverage has no statements");
  return { files, percent: (covered * 100) / total };
}

export function cobertura(files) {
  const all = [...files.values()].flatMap((lines) => [...lines.values()]);
  if (!all.length) throw new Error("coverage has no executable lines");
  const covered = all.filter((hits) => hits > 0).length;
  const classes = [...files]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, lines]) => {
      const rate =
        [...lines.values()].filter((hits) => hits > 0).length / lines.size;
      return `<class name="${xml(file)}" filename="${xml(file)}" line-rate="${rate}" branch-rate="0"><methods/><lines>${[
        ...lines,
      ]
        .sort(([a], [b]) => a - b)
        .map(([line, hits]) => `<line number="${line}" hits="${hits}"/>`)
        .join("")}</lines></class>`;
    })
    .join("");
  return {
    percent: (covered * 100) / all.length,
    xml: `<?xml version="1.0" encoding="UTF-8"?><coverage version="1" lines-valid="${all.length}" lines-covered="${covered}" line-rate="${covered / all.length}" branch-rate="0"><sources><source>.</source></sources><packages><package name="source" line-rate="${covered / all.length}" branch-rate="0"><classes>${classes}</classes></package></packages></coverage>\n`,
  };
}

export function goJUnit(source) {
  const tests = new Map();
  const packages = new Map();
  for (const row of source.split(/\r?\n/u).filter(Boolean)) {
    const event = JSON.parse(row);
    if (!event.Package) continue;
    if (!event.Test) {
      if (event.Action === "fail") packages.set(event.Package, event);
      continue;
    }
    const key = `${event.Package}\n${event.Test}`;
    const item = tests.get(key) || {
      package: event.Package,
      name: event.Test,
      status: "run",
      time: 0,
    };
    if (["pass", "fail", "skip"].includes(event.Action)) {
      item.status = event.Action;
      item.time = event.Elapsed || 0;
    }
    tests.set(key, item);
  }
  // Keep leaf cases; retain independent parent/package failures as real failures.
  const parents = new Set();
  for (const item of tests.values()) {
    const parts = item.name.split("/");
    while (parts.length > 1) {
      parts.pop();
      parents.add(`${item.package}\n${parts.join("/")}`);
    }
  }
  const cases = [...tests.values()].filter(
    (item) =>
      !parents.has(`${item.package}\n${item.name}`) || item.status === "fail",
  );
  for (const [name] of packages)
    if (!cases.some((item) => item.package === name && item.status === "fail"))
      cases.push({
        package: name,
        name: "package build or execution",
        status: "fail",
        time: 0,
      });
  if (!cases.length) throw new Error("Go report contains no tests");
  const failures = cases.filter(
    (item) => !["pass", "skip"].includes(item.status),
  ).length;
  return `<?xml version="1.0" encoding="UTF-8"?><testsuites><testsuite name="Go" tests="${cases.length}" failures="${failures}" skipped="${cases.filter((item) => item.status === "skip").length}">${cases.map((item) => `<testcase classname="${xml(item.package)}" name="${xml(item.name)}" time="${item.time}">${item.status === "skip" ? "<skipped/>" : item.status !== "pass" ? '<failure message="Test failed or did not finish; see this GitLab Job log"/>' : ""}</testcase>`).join("")}</testsuite></testsuites>\n`;
}

function run() {
  const [kind, ...extra] = process.argv.slice(2);
  const directory = path.join(ROOT, "output/ci/reports");
  if (kind === "print") {
    const [language] = extra;
    if (!["web", "go"].includes(language)) throw new Error("invalid coverage language");
    const percent = JSON.parse(readFileSync(`${directory}/coverage/${language}.summary.json`, "utf8")).percent;
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error("invalid coverage percent");
    console.log(`${language === "web" ? "CI_WEB_LINE_COVERAGE" : "CI_GO_STATEMENT_COVERAGE"}=${percent.toFixed(2)}%`);
    return;
  }
  mkdirSync(path.join(directory, "coverage"), { recursive: true });
  mkdirSync(path.join(directory, "tests"), { recursive: true });
  let result;
  if (kind === "web") {
    result = spawnSync(
      "pnpm",
      ["test", ...nativeNodeReportArgs(ROOT, "web", { coverage: true })],
      { cwd: path.join(ROOT, "web"), stdio: "inherit" },
    );
    const report = cobertura(
      lcovLines(readFileSync(`${directory}/coverage/web.lcov`, "utf8"), ROOT),
    );
    writeFileSync(`${directory}/coverage/web.xml`, report.xml);
    writeFileSync(`${directory}/coverage/web.summary.json`, JSON.stringify({ percent: report.percent }));
    console.log(`CI_WEB_LINE_COVERAGE=${report.percent.toFixed(2)}%`);
  } else if (kind === "go") {
    result = spawnSync(
      "go",
      [
        "test",
        "-count=1",
        "-json",
        `-coverprofile=${directory}/coverage/go.out`,
        ...extra,
      ],
      {
        cwd: path.join(ROOT, "server"),
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
      },
    );
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    writeFileSync(`${directory}/tests/go.xml`, goJUnit(result.stdout || ""));
    const moduleName = /^module\s+(\S+)/mu.exec(
      readFileSync(path.join(ROOT, "server/go.mod"), "utf8"),
    )[1];
    const coverage = goCoverage(
      readFileSync(`${directory}/coverage/go.out`, "utf8"),
      moduleName,
    );
    writeFileSync(
      `${directory}/coverage/go.xml`,
      cobertura(coverage.files).xml,
    );
    writeFileSync(`${directory}/coverage/go.summary.json`, JSON.stringify({ percent: coverage.percent }));
    console.error(`CI_GO_STATEMENT_COVERAGE=${coverage.percent.toFixed(2)}%`);
  } else throw new Error("expected web or go report mode");
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  run();
