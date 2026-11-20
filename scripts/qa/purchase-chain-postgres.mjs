import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { planChainRuleCheck } from "./business-chain-rule-check.mjs";
import {
  businessRuleTestResults,
  verifyGoTestJson,
} from "./verify-go-test-json.mjs";
import { businessTestKey } from "./lib/business-rule-catalog.mjs";
import {
  classifyDatabaseName,
  parseLoopbackDatabaseURL,
} from "./database-target.mjs";

export function purchaseChainPostgresTests() {
  return planChainRuleCheck("purchase_to_inventory").tests.filter(
    (test) => test.gate === "postgres",
  );
}
export function validatePurchaseChainPostgresOutput(output) {
  const counts = verifyGoTestJson(output);
  assert.equal(
    counts.ok,
    true,
    "PostgreSQL execution requires nonzero tests and zero failures or skips",
  );
  const rows = businessRuleTestResults(
    output
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)),
    "postgres",
  );
  const byID = new Map(rows.map((row) => [row.id, row]));
  const required = purchaseChainPostgresTests();
  assert.ok(required.length > 0);
  for (const test of required)
    assert.equal(byID.get(businessTestKey(test))?.status, "passed", test.name);
  return counts;
}
export function runPurchaseChainPostgres(databaseURL, serverRoot) {
  parseLoopbackDatabaseURL(databaseURL);
  const target = classifyDatabaseName(
    decodeURIComponent(new URL(databaseURL).pathname.slice(1)),
  );
  assert.equal(target.disposable, true);
  assert.equal(target.profile, "ci");
  const tests = purchaseChainPostgresTests();
  assert.ok(
    tests.length > 0 &&
      tests.every((test) => test.package === "server/internal/data"),
  );
  const result = spawnSync(
    "go",
    [
      "test",
      "-json",
      "-count=1",
      "-timeout=4m",
      "./internal/data",
      "-run",
      `^(${tests.map((test) => test.name).join("|")})$`,
    ],
    {
      cwd: serverRoot,
      encoding: "utf8",
      timeout: 300000,
      maxBuffer: 64 * 1024 * 1024,
      env: {
        ...process.env,
        GIT_OPTIONAL_LOCKS: "0",
        PURCHASE_RECEIPT_PG_TEST: "1",
        PURCHASE_RECEIPT_PG_TEST_DB_URL: databaseURL,
        INVENTORY_PG_TEST: "1",
        INVENTORY_PG_TEST_DB_URL: databaseURL,
        BOM_LOT_PG_TEST: "1",
        BOM_LOT_PG_TEST_DB_URL: databaseURL,
        PURCHASE_RETURN_PG_TEST: "1",
        PURCHASE_RETURN_PG_TEST_DB_URL: databaseURL,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (!result.error && result.status === 0) {
    try {
      validatePurchaseChainPostgresOutput(result.stdout);
    } catch (error) {
      return { ...result, status: 1, error };
    }
  }
  return result;
}
