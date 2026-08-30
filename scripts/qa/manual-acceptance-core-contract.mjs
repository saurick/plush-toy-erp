import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CONTRACT_PATH = fileURLToPath(
  new URL(
    "../../server/internal/manualacceptance/contract.json",
    import.meta.url,
  ),
);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function dataSemanticValue(contract) {
  const value = structuredClone(contract);
  // Deployment placement is not part of the V6 business-data topology. Keep
  // existing V6 Scenario receipts stable while moving the simulated dataset
  // from the customer-data test database to the isolated demo target.
  value.customerTrial133.databaseName = "plush_erp_uat_20260716_v5";
  delete value.customerTrial133.deploymentTarget;
  delete value.customerTrial133.previousConfigProductVersion;
  delete value.customerTrial133.previousDatasetVersion;
  return value;
}

export function validateManualAcceptanceCoreContract(contract) {
  if (
    contract?.schemaVersion !== "plush.manual-acceptance-contract/v6" ||
    contract?.datasetKey !== "yoyoosun-manual-acceptance" ||
    contract?.dataVersion !== "2026.08.15-v6" ||
    contract?.runId !== "20260815-V6" ||
    contract?.anchorDateUtc !== "2026-08-15T12:00:00.000Z" ||
    contract?.visiblePrefix !== "YS6" ||
    contract?.simulatedOnly !== true ||
    contract?.realCustomerImport !== false ||
    contract?.sourceNormalization?.trimWhitespace !== true ||
    contract?.sourceNormalization?.preserveCase !== true ||
    !Array.isArray(contract?.sourceNormalization?.distinctPairs) ||
    contract.sourceNormalization.distinctPairs.length < 5 ||
    !Array.isArray(contract?.units) ||
    contract.units.length !== 11 ||
    !Array.isArray(contract?.warehouses) ||
    contract.warehouses.length !== 4
  ) {
    throw new Error("manual acceptance core contract is invalid");
  }
  const unique = (values) => new Set(values).size === values.length;
  if (
    !unique(contract.units.map((item) => item.key)) ||
    !unique(contract.units.map((item) => item.code)) ||
    !unique(contract.units.map((item) => item.sourceLabel)) ||
    !contract.units.some((item) => item.key === contract.primaryUnitKey) ||
    contract.units.some(
      (item) =>
        !/^[A-Za-z][A-Za-z0-9]{1,31}$/u.test(String(item.key || "")) ||
        !String(item.code || "").startsWith(`${contract.visiblePrefix}-DW-`) ||
        String(item.name || "") !== String(item.sourceLabel || "") ||
        !Number.isInteger(item.precision) ||
        item.precision < 0 ||
        item.precision > 6,
    ) ||
    !unique(contract.warehouses.map((item) => item.key)) ||
    !unique(contract.warehouses.map((item) => item.code)) ||
    contract.warehouses.some(
      (item) =>
        !String(item.code || "").startsWith(`${contract.visiblePrefix}-CK-`) ||
        !String(item.name || "").trim() ||
        !String(item.type || "").trim(),
    )
  ) {
    throw new Error("manual acceptance unit or warehouse contract is invalid");
  }
  const target = contract.customerTrial133;
  if (
    target?.target !== "customer-trial-133" ||
    target?.deploymentTarget !== "demo-133" ||
    target?.databaseName !== "plush_erp_demo_v1" ||
    target?.databaseLifecycle !== "long-lived-registered-target" ||
    !/^[0-9]{14}$/u.test(String(target?.minimumMigration || "")) ||
    !String(target?.configRevision || "").includes("package-v8") ||
    !String(target?.configProductVersion || "").endsWith(
      contract.dataVersion,
    ) ||
    !String(target?.previousConfigRevision || "").includes("package-v7") ||
    target?.previousConfigProductVersion !==
      "customer-trial-133-test-2026.07.16-v5" ||
    target?.previousDatasetVersion !== "2026.07.16-v5" ||
    !String(target.previousConfigProductVersion).endsWith(
      target.previousDatasetVersion,
    )
  ) {
    throw new Error("manual acceptance customer-trial target is invalid");
  }
  return contract;
}

export const MANUAL_ACCEPTANCE_CORE_CONTRACT = deepFreeze(
  validateManualAcceptanceCoreContract(
    JSON.parse(readFileSync(CONTRACT_PATH, "utf8")),
  ),
);

export const MANUAL_ACCEPTANCE_CORE_SEMANTIC_DIGEST = createHash("sha256")
  .update(
    JSON.stringify(
      stableValue(dataSemanticValue(MANUAL_ACCEPTANCE_CORE_CONTRACT)),
    ),
  )
  .digest("hex");

export const MANUAL_ACCEPTANCE_CORE_UNITS =
  MANUAL_ACCEPTANCE_CORE_CONTRACT.units;
export const MANUAL_ACCEPTANCE_CORE_WAREHOUSES =
  MANUAL_ACCEPTANCE_CORE_CONTRACT.warehouses;
export const MANUAL_ACCEPTANCE_PRIMARY_UNIT = MANUAL_ACCEPTANCE_CORE_UNITS.find(
  (item) => item.key === MANUAL_ACCEPTANCE_CORE_CONTRACT.primaryUnitKey,
);
