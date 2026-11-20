export const BUSINESS_CHAIN_RULE_ACTION = "chain-rules";

export function requireBusinessChainRuleKey(value) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,99}$/u.test(value)) {
    throw new Error("business chain scope is invalid");
  }
  return value;
}

export function businessChainRuleBatch(operationId) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      operationId,
    )
  ) {
    throw new Error("business chain operation is invalid");
  }
  return "rules-" + operationId;
}
import { businessTestKey } from "./business-rule-catalog.mjs";


const sameSet = (left, right) =>
  Array.isArray(left) &&
  left.length === right.length &&
  new Set(left).size === left.length &&
  left.every((item) => right.includes(item));

function validRepository(value) {
  return (
    /^[a-f0-9]{40,64}$/u.test(value?.commit || "") &&
    typeof value?.dirty === "boolean" &&
    /^[a-f0-9]{64}$/u.test(value?.fingerprint || "")
  );
}

const sameRepository = (left, right) =>
  validRepository(left) &&
  validRepository(right) &&
  ["commit", "dirty", "fingerprint"].every((key) => left[key] === right[key]);

// A chain result covers named backend tests only. Other gates remain unexecuted.
export function inspectBusinessChainRuleResults(value, { chain, rules, repository }) {
  const fail = () => { throw new Error("业务链规则结果的来源、范围或计数不完整"); };
  const ids = new Set(chain.steps.flatMap((step) => step.verificationRuleIds));
  const selected = rules.filter((rule) => ids.has(rule.id));
  const tests = [...new Map(selected.flatMap((rule) => rule.tests).map((test) => [businessTestKey(test), test])).values()];
  if (
    !value ||
    !Number.isFinite(Date.parse(value.generatedAt)) ||
    !validRepository(value.repositoryBefore) ||
    !validRepository(value.repositoryAfter) ||
    typeof value.sourceUnchanged !== "boolean" ||
    value.sourceUnchanged !== sameRepository(value.repositoryBefore, value.repositoryAfter) ||
    !Array.isArray(value.tests) ||
    !sameSet(value.tests.map((test) => test.id), tests.map(businessTestKey)) ||
    !Array.isArray(value.steps) ||
    !sameSet(value.steps.map((step) => step.stepKey), chain.steps.map((step) => step.key))
  ) fail();
  for (const step of chain.steps) {
    const row = value.steps.find((item) => item.stepKey === step.key);
    const expected = [...new Set(selected.filter((rule) => step.verificationRuleIds.includes(rule.id)).flatMap((rule) => rule.tests.map(businessTestKey)))];
    if (row.chainKey !== chain.key || !sameSet(row.ruleIds, step.verificationRuleIds) || !sameSet(row.testIds, expected)) fail();
  }
  for (const test of value.tests) {
    const expected = tests.find((item) => businessTestKey(item) === test.id);
    if (!["passed", "failed", "skipped", "missing"].includes(test.status) || test.gate !== expected.gate) fail();
    if (test.gate !== "server" && test.status !== "missing") fail();
    if (test.status === "passed" && (
      !Number.isSafeInteger(test.counts?.executed) ||
      test.counts.executed < 1 ||
      test.counts.passed !== test.counts.executed ||
      test.counts.failed !== 0 ||
      test.counts.skipped !== 0
    )) fail();
  }
  const counts = value.counts;
  if (typeof counts?.ok !== "boolean" || ["run", "pass", "fail", "skip"].some((key) => !Number.isSafeInteger(counts[key]) || counts[key] < 0)) fail();
  const current = value.sourceUnchanged && sameRepository(value.repositoryBefore, repository);
  const backend = value.tests.filter((test) => test.gate === "server");
  return {
    ...value,
    current,
    passed: current && counts.ok && counts.run > 0 && counts.pass === counts.run && counts.fail === 0 && counts.skip === 0 && backend.length > 0 && backend.every((test) => test.status === "passed"),
  };
}
