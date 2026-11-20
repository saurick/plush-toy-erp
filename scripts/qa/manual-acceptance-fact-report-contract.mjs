export const MANUAL_ACCEPTANCE_OUTSOURCING_RETURN_COUNT = 45;

function array(value) {
  return Array.isArray(value) ? value : [];
}

function numberField(record, ...keys) {
  for (const key of keys) {
    if (record?.[key] != null) return Number(record[key]);
  }
  return Number.NaN;
}

function textField(record, ...keys) {
  for (const key of keys) {
    if (record?.[key] != null) return String(record[key]).trim();
  }
  return "";
}

export function evaluateManualAcceptanceOutsourcingInventoryCoverage(
  referenceRecords,
) {
  const outsourcingReturns = array(referenceRecords?.outsourcingFacts).filter(
    (item) =>
      textField(item, "fact_type", "factType").toUpperCase() ===
      "RETURN_RECEIPT",
  );
  const returnFactIDs = outsourcingReturns.map((item) => Number(item?.id));
  const returnFactNos = outsourcingReturns.map((item) =>
    textField(item, "fact_no", "factNo"),
  );
  const returnLotIDs = outsourcingReturns.map((item) =>
    numberField(item, "lot_id", "lotID", "lotId"),
  );
  const lotIDs = new Set(
    array(referenceRecords?.inventoryLots).map((item) => Number(item?.id)),
  );
  const balanceCountByLot = new Map();
  for (const balance of array(referenceRecords?.inventoryBalances)) {
    const lotID = numberField(balance, "lot_id", "lotID", "lotId");
    if (Number(balance?.quantity) > 0) {
      balanceCountByLot.set(lotID, (balanceCountByLot.get(lotID) || 0) + 1);
    }
  }
  const inventoryTxns = array(referenceRecords?.inventoryTxns);
  const validReturnLotIDs = returnLotIDs.filter(
    (lotID) => Number.isSafeInteger(lotID) && lotID > 0,
  );
  const uniqueReturnLotIDs = new Set(validReturnLotIDs);
  const coveredLotCount = [...uniqueReturnLotIDs].filter((lotID) =>
    lotIDs.has(lotID),
  ).length;
  const exactlyOneBalanceCount = [...uniqueReturnLotIDs].filter(
    (lotID) => balanceCountByLot.get(lotID) === 1,
  ).length;
  const matchedInboundTxnLots = outsourcingReturns.filter((returnFact) => {
    const factID = Number(returnFact?.id);
    const lotID = numberField(returnFact, "lot_id", "lotID", "lotId");
    const matches = inventoryTxns.filter(
      (txn) =>
        numberField(txn, "lot_id", "lotID", "lotId") === lotID &&
        textField(txn, "source_type", "sourceType").toUpperCase() ===
          "OUTSOURCING_FACT" &&
        numberField(txn, "source_id", "sourceID", "sourceId") === factID &&
        numberField(
          txn,
          "source_line_id",
          "sourceLineID",
          "sourceLineId",
        ) === factID &&
        textField(txn, "txn_type", "txnType").toUpperCase() === "IN" &&
        Number(txn?.direction) === 1 &&
        Number(txn?.quantity) > 0,
    );
    return matches.length === 1;
  }).length;
  const exactReturnFacts =
    outsourcingReturns.length ===
      MANUAL_ACCEPTANCE_OUTSOURCING_RETURN_COUNT &&
    returnFactIDs.every(
      (id) => Number.isSafeInteger(id) && id > 0,
    ) &&
    new Set(returnFactIDs).size === outsourcingReturns.length &&
    returnFactNos.every(Boolean) &&
    new Set(returnFactNos).size === outsourcingReturns.length &&
    outsourcingReturns.every(
      (item) => textField(item, "status").toUpperCase() === "POSTED",
    );
  const exactReturnLots =
    validReturnLotIDs.length === outsourcingReturns.length &&
    uniqueReturnLotIDs.size === MANUAL_ACCEPTANCE_OUTSOURCING_RETURN_COUNT;
  const complete =
    exactReturnFacts &&
    exactReturnLots &&
    coveredLotCount === MANUAL_ACCEPTANCE_OUTSOURCING_RETURN_COUNT &&
    exactlyOneBalanceCount === MANUAL_ACCEPTANCE_OUTSOURCING_RETURN_COUNT &&
    matchedInboundTxnLots === MANUAL_ACCEPTANCE_OUTSOURCING_RETURN_COUNT;
  return {
    expectedReturnFacts: MANUAL_ACCEPTANCE_OUTSOURCING_RETURN_COUNT,
    returnFacts: outsourcingReturns.length,
    uniqueReturnLots: uniqueReturnLotIDs.size,
    coveredLots: coveredLotCount,
    exactlyOneBalanceLots: exactlyOneBalanceCount,
    matchedInboundTxnLots,
    complete,
  };
}

export function manualAcceptanceOutsourcingInventoryCoverageIsComplete(
  report,
) {
  const coverage = evaluateManualAcceptanceOutsourcingInventoryCoverage(
    report?.referenceRecords,
  );
  const declared = report?.summary?.outsourcingReturnInventoryCoverage;
  const coverageMatches =
    declared != null &&
    typeof declared === "object" &&
    !Array.isArray(declared) &&
    Object.keys(declared).length === Object.keys(coverage).length &&
    Object.entries(coverage).every(
      ([key, value]) => declared[key] === value,
    );
  return (
    coverage.complete === true &&
    coverageMatches &&
    Number(report?.summary?.businessDashboardInventoryTotal) ===
      array(report?.referenceRecords?.inventoryBalances).length
  );
}
