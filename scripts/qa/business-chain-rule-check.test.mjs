import assert from "node:assert/strict";
import test from "node:test";
import {
  planChainRuleCheck,
  buildChainRuleCheckReport,
} from "./business-chain-rule-check.mjs";
import { validateBusinessChainDefinitionSnapshot } from "./manual-acceptance-business-chain-contract.mjs";
import { DEV_FLOW_STATE_CATALOG } from "../../web/src/dev-workbench/config/devFlowStateCatalog.mjs";
import { inspectBusinessChainRuleResults } from "./lib/business-chain-rule-contract.mjs";

const plan = planChainRuleCheck("purchase_to_inventory");
const repository = {
  commit: "a".repeat(40),
  dirty: true,
  fingerprint: "b".repeat(64),
};
const input = () => ({
  plan,
  repositoryBefore: repository,
  repositoryAfter: repository,
  generatedAt: "2026-10-25T10:00:00Z",
  runs: plan.commands.map((command) => ({
    ...command,
    status: 0,
    stdout: plan.tests
      .filter(
        (test) =>
          test.gate === "server" &&
          command.args.includes(`./${test.package.slice("server/".length)}`),
      )
      .flatMap((test) =>
        ["run", "pass"].map((Action) =>
          JSON.stringify({ Package: test.package, Test: test.name, Action }),
        ),
      )
      .join("\n"),
  })),
});

test("every registered chain has named checks and missing associations fail closed", () => {
  for (const chain of DEV_FLOW_STATE_CATALOG.businessChains) {
    assert(chain.steps.every((step) => step.verificationRuleIds.length > 0), chain.key);
    assert(planChainRuleCheck(chain.key).commands.length > 0, chain.key);
  }
  const broken = { ...DEV_FLOW_STATE_CATALOG, businessChains: [
    { ...plan.chain, steps: plan.chain.steps.map((step, index) => index ? step : { ...step, verificationRuleIds: [] }) },
  ] };
  assert.throws(() => planChainRuleCheck(plan.chain.key, broken), /关联具名规则/u);
});

test("rule results require exact scope, nonzero counts and the complete workspace identity", () => {
  const value = buildChainRuleCheckReport(input()).results;
  const scope = { chain: plan.chain, rules: plan.rules, repository };
  assert.equal(inspectBusinessChainRuleResults(value, scope).passed, true);
  assert.equal(inspectBusinessChainRuleResults(value, { ...scope, repository: { ...repository, fingerprint: "c".repeat(64) } }).current, false);
  for (const change of [
    (copy) => { copy.tests.find((test) => test.status === "passed").counts.executed = 0; },
    (copy) => { copy.steps[0].chainKey = "production_exception"; },
    (copy) => { copy.steps[0].testIds = []; },
    (copy) => { copy.tests.pop(); },
    (copy) => { copy.tests.find((test) => test.gate !== "server").status = "passed"; },
  ]) {
    const copy = structuredClone(value); change(copy);
    assert.throws(() => inspectBusinessChainRuleResults(copy, scope), /来源、范围或计数/u);
  }
});

test("采购定向检查从同源关联选取具名用例，命令只运行非数据库分区", () => {
  assert.throws(() => planChainRuleCheck("missing"));
  assert(planChainRuleCheck("production_to_inventory").commands.length > 0);
  assert(
    plan.commands.every(
      (command) =>
        command.command === "go" &&
        command.args.includes("-json") &&
        command.args.includes("-count=1"),
    ),
  );
  const patterns = plan.commands.map(
    (command) => new RegExp(command.args.at(-1), "u"),
  );
  assert(
    plan.tests
      .filter((test) => test.gate === "server")
      .every((test) => patterns.some((pattern) => pattern.test(test.name))),
  );
  assert(
    plan.tests
      .filter((test) => test.gate !== "server")
      .every((test) => patterns.every((pattern) => !pattern.test(test.name))),
  );
});

test("具名测试真实执行与源码稳定才通过；报告不把单层通过提升为完整链路通过", () => {
  const value = buildChainRuleCheckReport(input());
  assert.equal(value.ok, true);
  assert.equal(value.results.steps.length, plan.chain.steps.length);
  assert(
    value.results.steps.every(
      (step) =>
        step.testIds.length > 0 &&
        step.testIds.every((id) =>
          value.results.tests.some((test) => test.id === id),
        ),
    ),
  );
  assert(
    value.results.tests
      .filter((test) => test.gate === "server")
      .every((test) => test.status === "passed"),
  );
  assert(
    value.results.tests
      .filter((test) => test.gate !== "server")
      .every((test) => test.status === "missing"),
  );
  assert(
    value.report.chains[0].steps.every((step) => step.status === "not_proven"),
  );
  validateBusinessChainDefinitionSnapshot(
    value.report.definitionSnapshot,
    value.report.chains,
  );
});

test("零执行、同名错误包、缺父终态、跳过、失败和进程失败均保留失败证据", () => {
  const mutations = [
    (value) => {
      value.runs.forEach((run) => {
        run.stdout = "";
      });
    },
    (value) => {
      value.runs.forEach((run) => {
        run.stdout = run.stdout.replaceAll(
          "server/internal/",
          "other/internal/",
        );
      });
    },
    (value) => {
      value.runs.forEach((run) => {
        run.stdout = run.stdout
          .split("\n")
          .filter((line) => !line.includes('"pass"'))
          .join("\n");
      });
    },
    (value) => {
      value.runs[0].stdout = value.runs[0].stdout.replace('"pass"', '"skip"');
    },
    (value) => {
      value.runs[0].stdout = value.runs[0].stdout.replace('"pass"', '"fail"');
    },
    (value) => {
      value.runs[0].status = 1;
    },
    (value) => {
      value.runs[0].stdout = "{invalid";
    },
  ];
  for (const mutate of mutations) {
    const value = input();
    mutate(value);
    const result = buildChainRuleCheckReport(value);
    assert.equal(result.ok, false);
    assert(
      result.report.chains[0].steps.every((step) =>
        ["failed", "blocked"].includes(step.status),
      ),
    );
  }
});

test("同提交的脏工作区变化使执行结果失配，不能仅凭提交号复用", () => {
  const value = buildChainRuleCheckReport({
    ...input(),
    repositoryAfter: { ...repository, fingerprint: "c".repeat(64) },
  });
  assert.equal(value.ok, false);
  assert.equal(value.results.sourceUnchanged, false);
  assert(value.report.chains[0].steps.every((step) => step.status === "drift"));
});
