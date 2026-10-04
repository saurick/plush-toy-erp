import {
  numeric20Scale6Units,
  numeric20Scale6TextFromUnits,
} from "../../../web/src/erp/utils/numeric20Scale6.mjs";
import { NumericContract } from "../../../web/src/common/consts/numeric.generated.mjs";

const DECIMAL_FACTOR = 10n ** BigInt(NumericContract.scale);

// Acceptance plans follow the production requirement rule before any write.
// Keep all three factors exact and ceil once at the persisted unit precision.
export function roundRequiredMaterialQuantity(
  quantity,
  planned,
  lossRate,
  precision,
) {
  if (!Number.isInteger(precision) || precision < 0 || precision > NumericContract.scale) {
    throw new Error(
      `material requirement needs a unit precision between 0 and ${NumericContract.scale}`,
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
  const numerator = coefficient * plannedQuantity * (DECIMAL_FACTOR + loss);
  const divisor = 10n ** BigInt(NumericContract.scale * 3 - precision);
  const rounded =
    ((numerator + divisor - 1n) / divisor) * 10n ** BigInt(NumericContract.scale - precision);
  const result = numeric20Scale6TextFromUnits(rounded.toString());
  if (numeric20Scale6Units(result) === null) {
    throw new Error("material requirement exceeds numeric(20,6)");
  }
  return result;
}
