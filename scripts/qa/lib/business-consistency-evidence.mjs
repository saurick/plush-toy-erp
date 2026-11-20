import {
  businessConsistencyTests,
  businessTestKey,
} from "./business-rule-catalog.mjs";

export const BUSINESS_CONSISTENCY_SCHEMA = "plush.business-data-consistency/v1";
export const businessConsistencyFastTests = () =>
  ["web", "server"].flatMap(businessConsistencyTests);

// The report carries exact registered identities and counts, never raw tool output.
export function validateBusinessConsistencyEvidence(value) {
  const ids = new Set(businessConsistencyFastTests().map(businessTestKey));
  if (
    value?.schemaVersion !== BUSINESS_CONSISTENCY_SCHEMA ||
    !Array.isArray(value.tests) ||
    value.tests.length !== ids.size ||
    !["passed", "failed"].includes(value.status)
  )
    throw new Error("业务数据一致性证据不完整");
  for (const entry of value.tests) {
    if (
      !ids.delete(entry.id) ||
      !["passed", "failed", "skipped", "missing"].includes(entry.status)
    )
      throw new Error("业务数据一致性用例身份无效");
    const counts = entry.counts;
    if (
      !counts ||
      ["executed", "passed", "failed", "skipped"].some(
        (key) => !Number.isSafeInteger(counts[key]) || counts[key] < 0,
      )
    )
      throw new Error("业务数据一致性计数无效");
    if (
      entry.status === "passed" &&
      (counts.executed === 0 ||
        counts.passed !== counts.executed ||
        counts.failed ||
        counts.skipped)
    )
      throw new Error("业务数据一致性通过证据无效");
  }
  if (
    value.status === "passed" &&
    value.tests.some((entry) => entry.status !== "passed")
  )
    throw new Error("业务数据一致性存在未通过用例");
  return value;
}
