import {
  numeric20Scale6Units,
  numeric20Scale6TextFromUnits,
} from "../../../web/src/erp/utils/numeric20Scale6.mjs";

// Acceptance plans follow the production requirement rule before any write.
// Keep all three factors exact and ceil once at the persisted unit precision.
export function roundRequiredMaterialQuantity(
  quantity,
  planned,
  lossRate,
  precision,
) {
  if (!Number.isInteger(precision) || precision < 0 || precision > 6) {
    throw new Error(
      "material requirement needs a unit precision between 0 and 6",
    );
  }
  const factors = [quantity, planned, lossRate ?? "0"].map(
    numeric20Scale6Units,
  );
  if (factors.some((value) => value === null)) {
    throw new Error(
      "material requirement factors must be exact non-negative decimals",
    );
  }
  const [coefficient, plannedQuantity, loss] = factors.map(BigInt);
  if (coefficient <= 0n || plannedQuantity <= 0n) {
    throw new Error("material requirement quantities must be positive");
  }
  const numerator = coefficient * plannedQuantity * (1000000n + loss);
  const divisor = 10n ** BigInt(18 - precision);
  const rounded =
    ((numerator + divisor - 1n) / divisor) * 10n ** BigInt(6 - precision);
  const result = numeric20Scale6TextFromUnits(rounded.toString());
  if (numeric20Scale6Units(result) === null) {
    throw new Error("material requirement exceeds numeric(20,6)");
  }
  return result;
}
