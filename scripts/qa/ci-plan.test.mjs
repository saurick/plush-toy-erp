import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { buildCIPlan } from "./ci-plan.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");

test("CI plan keeps a documentation pull request lightweight", () => {
  const plan = buildCIPlan({
    files: ["docs/product/自动化测试策略.md"],
    mode: "affected",
    root: ROOT,
  });
  assert.equal(plan.effectiveMode, "affected");
  assert.deepEqual(plan.flags, {
    full: false,
    makeData: false,
    needsAtlas: false,
    needsChromium: false,
    needsGo: false,
    needsPostgres: false,
    needsSystemTools: false,
    needsWeb: false,
    sourceArchive: false,
  });
});

test("CI plan installs only Web dependencies for focused Web changes", () => {
  const plan = buildCIPlan({
    files: ["web/src/erp/utils/dateRange.mjs"],
    mode: "affected",
    root: ROOT,
  });
  assert.equal(plan.flags.needsWeb, true);
  assert.equal(plan.flags.needsGo, false);
  assert.equal(plan.flags.needsChromium, false);
});

test("CI plan runs make data for schema changes and prepares Go and Atlas", () => {
  const plan = buildCIPlan({
    files: ["server/internal/data/model/schema/product_sku.go"],
    mode: "affected",
    root: ROOT,
  });
  assert.equal(plan.flags.makeData, true);
  assert.equal(plan.flags.needsGo, true);
  assert.equal(plan.flags.needsAtlas, true);
});

test("CI plan treats main full as the complete environment", () => {
  const plan = buildCIPlan({ files: ["README.md"], mode: "full", root: ROOT });
  assert.equal(plan.effectiveMode, "full");
  assert(Object.values(plan.flags).every(Boolean));
});

test("CI workflow contract parsing selects Go without forcing full", () => {
  const plan = buildCIPlan({
    files: [".github/workflows/ci.yml"],
    mode: "affected",
    root: ROOT,
  });
  assert.equal(plan.flags.needsGo, true);
  assert.equal(plan.flags.full, false);
});
