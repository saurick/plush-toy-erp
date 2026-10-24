import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import {
  nativeNodeReportArgs,
  lcovLines,
  goCoverage,
  cobertura,
  goJUnit,
} from "./ci-native-reports.mjs";

test("native Node reporters publish the same execution including failed and skipped cases", (t) => {
  const root = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), "plush-native-report-")),
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "web/src"), { recursive: true });
  writeFileSync(
    path.join(root, "web/src/value.mjs"),
    "export const value = 2;\n",
  );
  writeFileSync(
    path.join(root, "web/src/case.test.mjs"),
    `import test from 'node:test'; import assert from 'node:assert/strict'; import {value} from './value.mjs'; test('pass & escape',()=>assert.equal(value,2)); test.skip('skipped',()=>{}); test('failure',()=>assert.equal(value,3));`,
  );
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  writeFileSync(
    path.join(root, "web/src/other.test.mjs"),
    `import test from 'node:test'; test('pass & escape',()=>{}); test('parent',async(t)=>{for(let i=0;i<2;i++)await t.test('same child',()=>{});});`,
  );
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      ...nativeNodeReportArgs(root, "fixture", { coverage: true }),
      path.join(root, "web/src/case.test.mjs"),
      path.join(root, "web/src/other.test.mjs"),
    ],
    { cwd: root, env, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stdout, /# tests 7/u);
  const junit = readFileSync(
    path.join(root, "output/ci/reports/tests/fixture.xml"),
    "utf8",
  );
  assert.match(junit, /pass &amp; escape/u);
  assert.match(junit, /classname="web\/src\/case\.test\.mjs:1 \[1\]"/u);
  assert.match(junit, /classname="web\/src\/other\.test\.mjs:1 \[1\]"/u);
  assert.match(junit, /classname="web\/src\/other\.test\.mjs:1 \[2\]"/u);
  assert.doesNotMatch(junit, /<\/?undefined\b/u);
  const cases = [...junit.matchAll(/<testcase\s+([^>]+)>?/gu)].map((match) => {
    const name = /\bname="([^"]+)"/u.exec(match[1])[1];
    const classname = /\bclassname="([^"]+)"/u.exec(match[1])[1];
    return `${classname}\n${name}`;
  });
  assert.equal(cases.length, 6);
  assert.equal(new Set(cases).size, 6);
  assert.match(junit, /<failure/u);
  assert.match(junit, /<skipped/u);
  const lines = lcovLines(
    readFileSync(
      path.join(root, "output/ci/reports/coverage/web.lcov"),
      "utf8",
    ),
    root,
  );
  assert.deepEqual([...lines.keys()], ["web/src/value.mjs"]);
  assert.match(cobertura(lines).xml, /filename="web\/src\/value.mjs"/u);
  assert.equal(cobertura(lines).percent, 100);
});

test("Go JUnit retains failing packages, unfinished tests and skips without fabricating pass", () => {
  const events = [
    { Package: "p", Test: "parent", Action: "run" },
    { Package: "p", Test: "parent/leaf & x", Action: "pass", Elapsed: 0.1 },
    { Package: "p", Test: "parent", Action: "pass" },
    { Package: "p", Test: "skip", Action: "skip" },
    { Package: "p", Test: "unfinished", Action: "run" },
    { Package: "broken", Action: "fail" },
  ];
  const report = goJUnit(events.map(JSON.stringify).join("\n"));
  assert.match(report, /tests="4" failures="2" skipped="1"/u);
  assert.match(report, /parent\/leaf &amp; x/u);
  assert.doesNotMatch(report, /name="parent"/u);
  assert.throws(() => goJUnit(""), /no tests/u);
  assert.throws(() => goJUnit("not-json"));
});

test("coverage percentage can be published after the bounded test gate without rerunning tests", (t) => {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "plush-coverage-summary-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "scripts/qa"), { recursive: true });
  mkdirSync(path.join(root, "output/ci/reports/coverage"), { recursive: true });
  const script = path.join(root, "scripts/qa/ci-native-reports.mjs");
  writeFileSync(script, readFileSync(new URL("./ci-native-reports.mjs", import.meta.url)));
  const file = path.join(root, "output/ci/reports/coverage/go.summary.json");
  writeFileSync(file, JSON.stringify({ percent: 65.42 }));
  const result = spawnSync(process.execPath, [script, "print", "go"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "CI_GO_STATEMENT_COVERAGE=65.42%\n");
  writeFileSync(file, JSON.stringify({ percent: 101 }));
  assert.equal(spawnSync(process.execPath, [script, "print", "go"]).status, 1);
});

test("coverage is source-relative, merged by line and preserves the Go statement denominator", () => {
  const go = goCoverage(
    "mode: set\nm/a.go:1.1,2.4 2 1\nm/a.go:2.4,3.9 1 0",
    "m",
  );
  assert.equal(go.percent, 200 / 3);
  assert.match(cobertura(go.files).xml, /filename="server\/a.go"/u);
  assert.equal(cobertura(go.files).percent, 200 / 3);
  assert.throws(
    () => goCoverage("mode: set\nelsewhere/a.go:1.1,1.2 1 1", "m"),
    /invalid/u,
  );
  assert.throws(
    () => lcovLines("SF:/outside/file.mjs\nDA:1,1", "/repo"),
    /outside/u,
  );
  assert.throws(() => cobertura(new Map()), /no executable/u);
  assert.throws(() => nativeNodeReportArgs("/repo", "../escape"), /invalid/u);
});
