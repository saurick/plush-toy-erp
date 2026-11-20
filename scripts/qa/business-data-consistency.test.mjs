import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  businessConsistencyTests,
  businessTestKey,
} from "./lib/business-rule-catalog.mjs";
import {
  BUSINESS_CONSISTENCY_SCHEMA,
  businessConsistencyFastTests,
  validateBusinessConsistencyEvidence,
} from "./lib/business-consistency-evidence.mjs";
import {
  consistencyCommands,
  parseConsistencyTap,
  runBusinessConsistency,
} from "./business-data-consistency.mjs";
import { assembleCoverageReport } from "./test-coverage-report.mjs";

const repository = {
  commit: "a".repeat(40),
  dirty: true,
  fingerprint: "b".repeat(64),
};
const passCounts = { executed: 1, passed: 1, failed: 0, skipped: 0 };
const evidence = () => ({
  schemaVersion: BUSINESS_CONSISTENCY_SCHEMA,
  status: "passed",
  generatedAt: "2026-10-23T00:00:00Z",
  repository,
  tests: businessConsistencyFastTests().map((entry) => ({
    id: businessTestKey(entry),
    status: "passed",
    counts: { ...passCounts },
  })),
});
const execute = async (command) => {
  const tests = businessConsistencyTests(command.kind).filter((entry) =>
    command.kind === "web"
      ? entry.file === command.file
      : entry.package === command.package,
  );
  return {
    code: 0,
    stdout:
      command.kind === "web"
        ? tests.map((entry, i) => `# Subtest: ${entry.name}\nok ${i + 1} - ${entry.name}`).join("\n") +
          `\n1..${tests.length}\n# tests ${tests.length}\n# pass ${tests.length}\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n`
        : tests
            .flatMap((entry) =>
              ["run", "pass"].map((action) =>
                JSON.stringify({
                  Action: action,
                  Package: entry.package,
                  Test: entry.name,
                }),
              ),
            )
            .join("\n"),
  };
};

test("specialist uses registered tests and rejects missing, skipped, duplicate and false-green evidence", async () => {
  assert(consistencyCommands().length > 0);
  const report = await runBusinessConsistency({
    execute,
    repositoryReader: async () => repository,
  });
  assert.equal(report.status, "passed");
  assert.equal(report.tests.length, businessConsistencyFastTests().length);
  for (const mutate of [
    (value) => value.tests.pop(),
    (value) => {
      value.tests[1] = value.tests[0];
    },
    (value) => {
      value.tests[0].counts.executed = 0;
    },
    (value) => {
      value.tests[0].status = "skipped";
    },
  ]) {
    const value = evidence();
    mutate(value);
    assert.throws(() => validateBusinessConsistencyEvidence(value));
  }
  const target = businessConsistencyTests("web")[0];
  for (const line of [
    "",
    `ok 1 - ${target.name}Extra`,
    `ok 1 - ${target.name} # SKIP`,
    `ok 1 - ${target.name}\nok 2 - ${target.name}`,
  ])
    assert.notEqual(parseConsistencyTap(line, target.file)[0].status, "passed");
  const failed = await runBusinessConsistency({
    execute: async (command) => ({ ...(await execute(command)), code: 1 }),
    repositoryReader: async () => repository,
  });
  assert.equal(failed.status, "failed");
});

test("specialist counts nested Node cases and rejects skipped, todo or incomplete execution", async () => {
  const target = businessConsistencyTests("web")[0];
  const registered = businessConsistencyTests("web").filter((entry) => entry.file === target.file);
  for (const condition of ["passed", "skipped", "todo", "failed", "missing-summary"]) {
    const program = `import test from 'node:test';
      test(${JSON.stringify(target.name)}, async (t) => {
        await t.test('nested boundary', ${JSON.stringify({ skip: condition === "skipped", todo: condition === "todo" })}, () => {
          ${condition === "failed" ? "throw new Error('fixture failure')" : ""}
        });
      });
      ${registered.slice(1).map((entry) => `test(${JSON.stringify(entry.name)}, () => {});`).join("\n")}`;
    const execution = spawnSync(process.execPath, ["--input-type=module", "--test-reporter=tap", "-e", program], {
      encoding: "utf8", timeout: 10_000, env: { ...process.env, NODE_TEST_CONTEXT: "" },
    });
    assert.ifError(execution.error);
    const stdout = condition === "missing-summary"
      ? execution.stdout.replace(/^# (?:tests|pass|fail|cancelled|skipped|todo) .*\n/gmu, "")
      : execution.stdout;
    const selected = parseConsistencyTap(stdout, target.file)[0];
    if (condition !== "missing-summary") {
      assert.equal(selected.status, condition === "todo" ? "skipped" : condition, stdout);
      assert.equal(selected.counts.executed, 2);
      assert.equal(selected.counts.skipped, ["skipped", "todo"].includes(condition) ? 1 : 0);
    }
    const report = await runBusinessConsistency({
      execute: async (command) => command.file === target.file
        ? { code: execution.status, stdout }
        : execute(command),
      repositoryReader: async () => repository,
    });
    assert.equal(report.status, condition === "passed" ? "passed" : "failed", condition);
  }
});

test("specialist rejects source drift and aggregation preserves stale rather than green evidence", async () => {
  let reads = 0;
  await assert.rejects(
    runBusinessConsistency({
      execute,
      repositoryReader: async () => ({
        ...repository,
        fingerprint: (++reads === 1 ? "b" : "c").repeat(64),
      }),
    }),
    /identity changed/u,
  );
  for (const current of [true, false]) {
    const report = assembleCoverageReport({
      repository,
      generatedAt: "2026-10-23T01:00:00Z",
      artifacts: [
        {
          artifact: evidence(),
          evidence: "output/qa/coverage/business-consistency.latest.json",
          freshness: { status: current ? "current" : "stale", note: "" },
        },
      ],
    });
    assert.equal(report.businessConsistency.current, current);
    assert.equal(
      report.businessConsistency.tests.length,
      businessConsistencyFastTests().length,
    );
  }
  const invalid = evidence();
  invalid.tests = [];
  assert.equal(
    assembleCoverageReport({
      repository,
      generatedAt: "2026-10-23T01:00:00Z",
      artifacts: [
        {
          artifact: invalid,
          evidence: "test.json",
          freshness: { status: "current" },
        },
      ],
    }).businessConsistency,
    undefined,
  );
});
