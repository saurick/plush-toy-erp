import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runIndustryTemplateClosure } from "./industry-template-closure.mjs";

test("industry-template industry template closure writes dry-run-only evidence", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "industry-template-template-"));
  const result = runIndustryTemplateClosure({ out });

  assert.equal(result.report.templateKey, "plush");
  assert.equal(result.report.runtimeEnabled, false);
  assert.equal(result.report.simulatedAcceptance.noRealImport, true);
  assert.equal(result.report.simulatedAcceptance.noTenant, true);
  assert.equal(result.report.simulatedAcceptance.noFactWrite, true);
  assert(result.report.summary.roles >= 8);
  assert(result.report.summary.desktopMenuSections >= 6);
  assert(fs.existsSync(result.jsonPath));
  assert(fs.existsSync(result.mdPath));

  const persisted = JSON.parse(fs.readFileSync(result.jsonPath, "utf8"));
  assert.equal(persisted.importMode, undefined);
  assert.equal(persisted.simulatedAcceptance.dryRunOnly, true);
  assert(persisted.deferredItems.includes("真实客户数据导入"));
});
