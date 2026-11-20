import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildNodeTestFailureDiagnostic,
  buildNodeTestArgs,
  catalogNodeTests,
  classifyNodeTestResult,
  discoverNodeTests,
  parseArgs,
  validateNodeTestCatalog,
  writeNodeTestFailureDiagnostic,
} from "./run-node-tests.mjs";
import { NODE_TEST_GROUPS } from "./node-test-groups.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

test("all scripts Node tests in the current tree are assigned to one explicit group", async () => {
  const validation = validateNodeTestCatalog();
  assert.deepEqual(validation.invalid, []);
  assert.deepEqual(validation.unsorted, []);
  assert.deepEqual(validation.duplicates, []);
  assert.equal(validation.ok, true);

  const discovered = (await discoverNodeTests(path.join(repoRoot, "scripts")))
    .map((file) => path.relative(repoRoot, file).replaceAll(path.sep, "/"))
    .sort();
  assert.deepEqual([...catalogNodeTests("full")].sort(), discovered);

  assert(NODE_TEST_GROUPS.fast.includes("scripts/qa/run-node-tests.test.mjs"));
  assert(
    NODE_TEST_GROUPS.database.includes(
      "scripts/qa/critical-postgres-gate.test.mjs",
    ),
  );
  assert(
    NODE_TEST_GROUPS.database.includes(
      "scripts/qa/database-programmability.test.mjs",
    ),
  );
  assert(
    NODE_TEST_GROUPS.browser.includes(
      "scripts/qa/exception-flow-real-write-browser.test.mjs",
    ),
  );
  assert(
    NODE_TEST_GROUPS.release.includes(
      "scripts/qa/local-acceptance-lifecycle.test.mjs",
    ),
  );
  assert.deepEqual(NODE_TEST_GROUPS.resource_sensitive, [
    "scripts/deploy/bootstrap-production-admin.contract-b.test.mjs",
    "scripts/deploy/bootstrap-production-admin.contract.test.mjs",
    "scripts/deploy/bootstrap-production-admin.runtime-b.test.mjs",
    "scripts/deploy/bootstrap-production-admin.runtime.test.mjs",
  ]);
  for (const file of NODE_TEST_GROUPS.resource_sensitive) {
    assert.equal(NODE_TEST_GROUPS.release.includes(file), false);
  }

  const parallelSafe = catalogNodeTests("parallel_safe");
  for (const file of NODE_TEST_GROUPS.resource_sensitive) {
    assert.equal(parallelSafe.includes(file), false);
    assert.equal(
      catalogNodeTests("full").filter((candidate) => candidate === file)
        .length,
      1,
    );
  }
  assert.deepEqual(
    [...parallelSafe, ...NODE_TEST_GROUPS.resource_sensitive].sort(),
    validation.tests,
  );
});

test("discovery accepts supported Node test suffixes and ignores unrelated files", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "plush-node-tests-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, "nested"), { recursive: true });
  await Promise.all([
    writeFile(path.join(root, "alpha.test.mjs"), ""),
    writeFile(path.join(root, "nested", "beta.test.cjs"), ""),
    writeFile(path.join(root, "nested", "gamma.test.js"), ""),
    writeFile(path.join(root, "nested", "ignored.spec.mjs"), ""),
  ]);

  const discovered = await discoverNodeTests(root);
  assert.deepEqual(
    discovered.map((file) => path.relative(root, file)),
    ["alpha.test.mjs", "nested/beta.test.cjs", "nested/gamma.test.js"],
  );
});

test("runner CLI options fail closed", () => {
  assert.deepEqual(parseArgs(["--list"]), {
    list: true,
    profile: "full",
    rootDir: path.resolve(repoRoot, "scripts"),
  });
  assert.equal(parseArgs(["--profile", "fast"]).profile, "fast");
  assert.equal(
    parseArgs(["--profile", "parallel_safe"]).profile,
    "parallel_safe",
  );
  assert.throws(() => parseArgs(["--root"]), /requires a directory/u);
  assert.throws(() => parseArgs(["--profile"]), /requires a value/u);
  assert.throws(() => parseArgs(["--profile", "unknown"]), /unknown profile/u);
  assert.throws(() => parseArgs(["--unknown"]), /unknown option/u);
});

test("runner serializes Node tests to avoid cross-test process contention", () => {
  assert.deepEqual(buildNodeTestArgs(["a.test.mjs"]), [
    "--test",
    "--test-reporter=tap",
    "--test-concurrency=1",
    "a.test.mjs",
  ]);
});

test("runner outcome fails closed when a discovered test is skipped", () => {
  const skipped = classifyNodeTestResult({
    status: 0,
    stdout:
      "# tests 1\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0\n",
  });
  assert.equal(skipped.exitCode, 1);
  assert.equal(skipped.summary.skipped, 1);

  const passed = classifyNodeTestResult({
    status: 0,
    stdout:
      "# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n",
  });
  assert.equal(passed.exitCode, 0);
  assert.equal(passed.summary.tests, 1);

  const zero = classifyNodeTestResult({
    status: 0,
    stdout:
      "# tests 0\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n",
  });
  assert.equal(zero.exitCode, 1);
  assert.deepEqual(
    classifyNodeTestResult({ status: 7, stdout: "# skipped 0\n" }),
    { exitCode: 7, summary: null },
  );
  const failed = classifyNodeTestResult({
    status: 1,
    stdout:
      "# tests 1\n# pass 0\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0\n",
  });
  assert.equal(failed.exitCode, 1);
  assert.equal(failed.summary.fail, 1);
  assert.throws(
    () => classifyNodeTestResult({ error: new Error("spawn failed") }),
    /spawn failed/u,
  );
});

test("failure diagnostics retain bounded test identity and redact raw secrets", async (t) => {
  const stdout = [
    "TAP version 13",
    "not ok 7 - deployment password=visible-secret token:second-secret",
    "  ---",
    "  duration_ms: 30116.137",
    `  location: '${path.join(repoRoot, "scripts/deploy/example.test.mjs")}:42:3'`,
    "  failureType: 'testCodeFailure'",
    "  code: 'ERR_ASSERTION'",
    "  name: 'AssertionError'",
    "  operator: 'strictEqual'",
    "  error: 'postgres://admin:database-secret@127.0.0.1:5432/postgres'",
    "  stack: 'Authorization: Bearer raw-token'",
    "  ...",
    "1..1",
    "# tests 1",
    "# pass 0",
    "# fail 1",
    "# cancelled 0",
    "# skipped 0",
    "# todo 0",
    "# duration_ms 30120.5",
  ].join("\n");
  const result = { status: 1, signal: null, stdout, stderr: "" };
  const outcome = classifyNodeTestResult(result);
  const diagnostic = buildNodeTestFailureDiagnostic({
    profile: "resource_sensitive",
    result,
    outcome,
  });
  const serialized = JSON.stringify(diagnostic);

  assert.equal(
    diagnostic.schemaVersion,
    "plush.node-test-failure-diagnostic/v1",
  );
  assert.equal(diagnostic.summary.fail, 1);
  assert.equal(diagnostic.durationMs, 30120.5);
  assert.deepEqual(diagnostic.failures, [
    {
      index: 7,
      test: "deployment password=[REDACTED] token:[REDACTED]",
      durationMs: 30116.137,
      location: "<repo>/scripts/deploy/example.test.mjs:42:3",
      failureType: "testCodeFailure",
      code: "ERR_ASSERTION",
      name: "AssertionError",
      operator: "strictEqual",
    },
  ]);
  assert.equal(diagnostic.failuresTruncated, false);
  assert.doesNotMatch(
    serialized,
    /visible-secret|second-secret|database-secret|raw-token/u,
  );
  assert.doesNotMatch(serialized, /postgres:\/\/|Authorization|Bearer/u);
  for (const forbidden of [
    "error",
    "stack",
    "stdout",
    "stderr",
    "environment",
    "argv",
  ]) {
    assert.equal(Object.hasOwn(diagnostic, forbidden), false);
    assert.equal(Object.hasOwn(diagnostic.failures[0], forbidden), false);
  }

  const boundedStdout = [
    ...Array.from(
      { length: 101 },
      (_, index) => `not ok ${String(index + 1)} - bounded failure`,
    ),
    "# tests 101",
    "# pass 0",
    "# fail 101",
    "# cancelled 0",
    "# skipped 0",
    "# todo 0",
  ].join("\n");
  const boundedResult = {
    status: 1,
    signal: null,
    stdout: boundedStdout,
    stderr: "",
  };
  const boundedDiagnostic = buildNodeTestFailureDiagnostic({
    profile: "parallel_safe",
    result: boundedResult,
    outcome: classifyNodeTestResult(boundedResult),
  });
  assert.equal(boundedDiagnostic.failures.length, 100);
  assert.equal(boundedDiagnostic.failuresTruncated, true);

  const root = await mkdtemp(path.join(os.tmpdir(), "plush-node-diagnostic-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const diagnosticPath = path.join(root, "nested", "failure.json");
  await writeNodeTestFailureDiagnostic(diagnosticPath, diagnostic);
  assert.deepEqual(
    JSON.parse(await readFile(diagnosticPath, "utf8")),
    diagnostic,
  );
  assert.equal((await stat(diagnosticPath)).mode & 0o777, 0o600);
});

test("QA gates compose explicit Node groups without repeating full-only work", async () => {
  const [fast, full, strict] = await Promise.all(
    ["scripts/qa/fast.sh", "scripts/qa/full.sh", "scripts/qa/strict.sh"].map(
      (file) => readFile(path.join(repoRoot, file), "utf8"),
    ),
  );

  assert.match(fast, /scripts\/qa\/run-node-tests\.mjs/u);
  assert.match(fast, /--profile "\$node_test_profile"/u);
  assert.match(full, /QA_FAST_SCOPE=base/u);
  assert.match(full, /local node_test_profile=parallel_safe/u);
  assert.match(full, /node_test_profile=ci_lanes/u);
  assert.match(full, /QA_NODE_TEST_PROFILE="\$node_test_profile"/u);
  assert.match(full, /run-node-tests\.mjs" --profile resource_sensitive/u);
  assert.match(full, /QA_CI_RESOURCE_LANES/u);
  assert.match(full, /ci-resource-test-lane\.mjs" --aggregate/u);
  assert.match(fast, /base:ci_lanes/u);
  assert.match(fast, /ci-node-test-lane\.mjs/u);
  assert.match(fast, /QA_CI_NODE_LANES/u);
  assert.match(full, /bash "\$ROOT_DIR\/scripts\/qa\/fast\.sh"/u);
  assert.match(strict, /bash "\$ROOT_DIR\/scripts\/qa\/full\.sh"/u);
  assert.match(strict, /QA_BROWSER_SCENARIOS=/u);
  assert.doesNotMatch(strict, /scripts\/qa\/govulncheck\.sh/u);

  const manuallyEnumeratedScriptTest =
    /scripts\/(?:deploy|import|qa)\/[^"'\s]+\.test\.(?:cjs|js|mjs)/u;
  assert.doesNotMatch(fast, manuallyEnumeratedScriptTest);
  assert.doesNotMatch(strict, manuallyEnumeratedScriptTest);
});
