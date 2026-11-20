import nodeTest from "node:test";

export const PRODUCTION_PREFLIGHT_TEST_LANES = Object.freeze(["a", "b"]);

const selectedLane = String(
  process.env.PRODUCTION_PREFLIGHT_TEST_LANE || "",
).trim();

if (
  selectedLane &&
  !PRODUCTION_PREFLIGHT_TEST_LANES.includes(selectedLane)
) {
  throw new Error("PRODUCTION_PREFLIGHT_TEST_LANE must be a or b");
}

let registrationIndex = 0;

export function productionPreflightLaneForIndex(index) {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new Error("production preflight test index must be non-negative");
  }
  return PRODUCTION_PREFLIGHT_TEST_LANES[index % 2];
}

export function productionPreflightTest(...args) {
  const lane = productionPreflightLaneForIndex(registrationIndex);
  registrationIndex += 1;
  if (!selectedLane || selectedLane === lane) {
    return nodeTest(...args);
  }
  return undefined;
}
