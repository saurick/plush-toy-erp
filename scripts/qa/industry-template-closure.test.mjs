import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { plushIndustryTemplateConfig } from "../../config/industry-templates/plush/templateConfig.mjs";
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

test("industry-template keeps shipment release source-generated and warehouse-owned", () => {
  const patterns = plushIndustryTemplateConfig.mobileTaskPatternTemplate.filter(
    (item) => item.key === "shipment_release",
  );

  assert.equal(patterns.length, 1);
  assert.deepEqual(patterns[0].roles, ["warehouse"]);
  assert.equal(patterns[0].ownerRoleKey, "warehouse");
  assert.equal(patterns[0].sourceGenerated, true);
  assert.equal(patterns[0].configurableProducer, false);
  assert.equal(patterns[0].producer, "shipment.submit_release");
  assert.equal(patterns[0].sourcePageKey, "shipments");
  assert.equal(patterns[0].sourceAction, "submit_shipment_release");
  assert.match(patterns[0].precondition, /成品检验.*提交放行/u);
  assert.match(patterns[0].downstream, /SHIPPED.*财务/u);
});
