import assert from "node:assert/strict";
import test from "node:test";
import { roundRequiredMaterialQuantity } from "./lib/unit-quantity.mjs";

test("acceptance material demand matches unit-specific ceil without floating point rounding", () => {
  for (const [coefficient, planned, loss, precision, expected] of [
    ["0.2", "3", "0", 0, "1"],
    ["1.2", "22", "0", 0, "27"],
    ["0.3", "10", "0", 0, "3"],
    ["0.2", "3", "0.02", 3, "0.612"],
    ["0.004381", "3", "0.03", 3, "0.014"],
    ["0.004381", "3", "0.03", 6, "0.013538"],
    ["0.000001", "0.000001", "0", 3, "0.001"],
    ["99999999999999", "1", "0", 0, "99999999999999"],
  ]) {
    assert.equal(
      roundRequiredMaterialQuantity(coefficient, planned, loss, precision),
      expected,
    );
  }
  for (const args of [
    ["1", "3", "0", undefined],
    ["1", "3", "0", 7],
    ["1", "0", "0", 0],
    ["1", "3", "-0.01", 0],
    ["0.0000001", "3", "0", 6],
    ["99999999999999", "2", "0", 6],
  ])
    assert.throws(() => roundRequiredMaterialQuantity(...args));
});
