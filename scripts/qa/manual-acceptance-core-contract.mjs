import standardUnits from "../../server/internal/unitpolicy/units.json" with { type: "json" };
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
  // Environment placement does not change the business-data contract.
  delete value.customerTrial133;
  return value;
}

function parseDatasetVersion(value) {
  const match = /^(\d{4})\.(\d{2})\.(\d{2})-v([1-9]\d*)$/u.exec(
    String(value || ""),
  );
  if (!match) return null;
  const [, year, month, day, sequence] = match;
  const isoDate = `${year}-${month}-${day}`;
  const parsedDate = new Date(`${isoDate}T00:00:00.000Z`);
  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== isoDate
  ) {
    return null;
  }
  return {
    compactDate: `${year}${month}${day}`,
    isoDate,
    sequence: Number(sequence),
  };
}

export function validateManualAcceptanceCoreContract(contract) {
  const schemaMatch = /^plush\.manual-acceptance-contract\/v([1-9]\d*)$/u.exec(
    String(contract?.schemaVersion || ""),
  );
  const dataset = parseDatasetVersion(contract?.dataVersion);
  if (
    !schemaMatch ||
    !dataset ||
    contract?.datasetKey !== "yoyoosun-manual-acceptance" ||
    contract?.runId !== `${dataset?.compactDate}-V${dataset?.sequence}` ||
    contract?.anchorDateUtc !== `${dataset?.isoDate}T12:00:00.000Z` ||
    contract?.visiblePrefix !== `YS${dataset?.sequence}` ||
    contract?.simulatedOnly !== true ||
    contract?.realCustomerImport !== false ||
    contract?.sourceNormalization?.trimWhitespace !== true ||
    contract?.sourceNormalization?.preserveCase !== true ||
    !Array.isArray(contract?.sourceNormalization?.distinctPairs) ||
    contract.sourceNormalization.distinctPairs.length < 5 ||
    !Array.isArray(contract?.units) ||
    contract.units.length !== 8 ||
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
        !standardUnits.some(
          (unit) =>
            unit.code === item.code &&
            unit.name === item.name &&
            unit.precision === item.precision,
        ) ||
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
    Object.keys(target).some((key) => ![
      "target", "deploymentTarget", "databaseName", "databaseLifecycle", "minimumMigration",
    ].includes(key))
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
