import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  LEGACY_SOURCE_EXECUTION_FILES,
  assertSourceExecutionDebtDoesNotGrow,
  auditTestCode,
  sourceExecutionUsage,
  summarizeTestCodeAudit,
  usesSourceExecutionHarness,
} from "./test-code-governance.mjs";

test("test code governance detects executable source rewrites without treating imports as debt", () => {
  assert.equal(
    usesSourceExecutionHarness(`vm.${"runInNewContext"}(source, sandbox)`),
    true,
  );
  assert.equal(
    usesSourceExecutionHarness(
      `import(${JSON.stringify(`data:${"text/javascript"},export default 1`)})`,
    ),
    true,
  );
  assert.equal(
    usesSourceExecutionHarness("import value from './runtime.mjs'"),
    false,
  );
  assert.deepEqual(
    sourceExecutionUsage(
      `vm.${"runInNewContext"}(source, sandbox); vm.${"runInNewContext"}(source, sandbox)`,
    ),
    { "vm.runInNewContext": 2 },
  );
});

test("test code governance also detects source execution moved into a shared helper", (t) => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "plush-test-code-governance-"),
  );
  t.after(() => rmSync(root, { force: true, recursive: true }));
  mkdirSync(path.join(root, "support"));
  writeFileSync(
    path.join(root, "sample.test.mjs"),
    'import "./support/runtime.mjs";\n',
  );
  writeFileSync(
    path.join(root, "support/runtime.mjs"),
    'import vm from "node:vm";\nvm.runInNewContext("1 + 1");\n',
  );
  mkdirSync(path.join(root, "web/.vite-cache"), { recursive: true });
  writeFileSync(
    path.join(root, "web/.vite-cache/generated.js"),
    `import(${JSON.stringify(
      ["data:text", "javascript,export default 1"].join("/"),
    )});\n`,
  );

  const report = auditTestCode(root);

  assert.equal(report.totalFiles, 1);
  assert.deepEqual(report.sourceExecutionFiles, ["support/runtime.mjs"]);
  assert.deepEqual(report.unexpectedSourceExecutionFiles, [
    "support/runtime.mjs",
  ]);
  assert.throws(
    () => assertSourceExecutionDebtDoesNotGrow(report),
    /unexpected source-execution files: support\/runtime\.mjs/u,
  );
  assert.throws(
    () =>
      assertSourceExecutionDebtDoesNotGrow({
        unexpectedSourceExecutionFiles: [],
        staleSourceExecutionAllowlist: ["resolved-helper.mjs"],
      }),
    /remove resolved allowlist entries: resolved-helper\.mjs/u,
  );

  const focusedAllowlist = {
    "support/runtime.mjs": {
      reason: "fixture source execution",
      exitCondition: "replace the fixture with a direct import",
      maxOccurrences: { "vm.runInNewContext": 1 },
    },
  };
  assert.doesNotThrow(() =>
    assertSourceExecutionDebtDoesNotGrow(auditTestCode(root, focusedAllowlist)),
  );

  writeFileSync(
    path.join(root, "support/runtime.mjs"),
    [
      'import vm from "node:vm";',
      `vm.${"runInNewContext"}("1 + 1");`,
      `vm.${"runInNewContext"}("2 + 2");`,
      "",
    ].join("\n"),
  );
  const grownReport = auditTestCode(root, focusedAllowlist);
  assert.deepEqual(grownReport.sourceExecutionPolicyViolations, [
    "support/runtime.mjs:vm.runInNewContext allowed=1 actual=2",
  ]);
  assert.throws(
    () => assertSourceExecutionDebtDoesNotGrow(grownReport),
    /source-execution policy exceeded/u,
  );
});

test("test code governance keeps source-execution debt shrink-only and reports size without gating it", () => {
  const report = auditTestCode();

  assert.doesNotThrow(() => assertSourceExecutionDebtDoesNotGrow(report));
  assert.deepEqual(
    report.sourceExecutionFiles,
    Object.keys(LEGACY_SOURCE_EXECUTION_FILES).sort(),
  );
  assert.equal(report.sourceExecutionEntries.length, 9);
  assert.deepEqual(report.sourceExecutionPolicyViolations, []);
  assert.deepEqual(report.staleSourceExecutionRules, []);
  assert.deepEqual(report.invalidSourceExecutionAllowlist, []);
  assert.equal(report.totalFiles > 0, true);
  assert.equal(report.totalLines > report.totalFiles, true);
  assert.equal(report.largeTestFiles.length > 0, true);
  assert.equal(
    report.largeTestFiles.every((entry, index, entries) =>
      index === 0 ? true : entries[index - 1].lines >= entry.lines,
    ),
    true,
  );
  const summary = summarizeTestCodeAudit(report);
  assert.equal(
    summary.directFileReadingTestCount,
    report.fileReadingTests.length,
  );
  assert.equal(summary.largeTestFileCount, report.largeTestFiles.length);
  assert.deepEqual(
    summary.largestTestFiles,
    report.largeTestFiles.slice(0, 20),
  );
});
