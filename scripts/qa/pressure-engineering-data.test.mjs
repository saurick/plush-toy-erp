import assert from "node:assert/strict";
import test from "node:test";
import { prepareEngineeringPressureData, ENGINEERING_DATA_FILES, engineeringDataFingerprint } from "./pressure-engineering-data.mjs";

test("engineering data preparation rejects shared, remote and undersized targets before API writes", async () => {
  const args = { baseURL: "http://127.0.0.1:1", databaseName: "plush_erp_capacity_test",
    databaseURL: "postgres://u:p@127.0.0.1:5432/plush_erp_capacity_test", tokens: {}, runID: "test", poolSize: 10 };
  for (const changes of [
    { databaseName: "plush_erp", databaseURL: "postgres://u:p@127.0.0.1:5432/plush_erp" },
    { databaseURL: "postgres://u:p@192.168.0.133:5432/plush_erp_capacity_test" },
    { poolSize: 9 }, { poolSize: 1001 }, { poolSize: 10.5 },
  ]) await assert.rejects(prepareEngineeringPressureData({ ...args, ...changes }));
});
test("data dependency fingerprint includes reusable engineering preparation and quantity truth", () => {
  for (const file of ["scripts/qa/manual-acceptance-engineering-data.mjs", "server/internal/unitpolicy/units.json",
    "server/internal/biz/unit_quantity.go", "server/internal/data/engineering_material_request_repo.go"])
    assert.ok(ENGINEERING_DATA_FILES.includes(file));
  assert.equal(new Set(ENGINEERING_DATA_FILES).size, ENGINEERING_DATA_FILES.length);
  assert.match(engineeringDataFingerprint(), /^[0-9a-f]{64}$/u);
});
