import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runPrivateDeploymentPackageClosure } from "./private-deployment-package-closure.mjs";

test("private-deployment template report proves boundaries without claiming delivery", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "private-deployment-private-"));
  const result = runPrivateDeploymentPackageClosure({ out });

  assert.equal(result.report.reviewMilestone, "private-deployment-package-candidate");
  assert.equal(result.report.runtimeEnabled, false);
  assert.equal(result.report.simulatedCustomerKey, "SIM-PRIVATE-DEPLOYMENT");
  assert.equal(result.report.boundaryChecks.noTenant, true);
  assert.equal(result.report.boundaryChecks.noSaas, true);
  assert.equal(result.report.boundaryChecks.noRealImport, true);
  assert.equal(result.report.boundaryChecks.noCodeFork, true);
  assert.equal(result.report.boundaryChecks.industryTemplateStillCandidate, true);
  assert.equal(result.report.finalDecision.boundariesSatisfied, true);
  assert.equal(result.report.finalDecision.deliveryCompleted, false);
  assert.equal(result.report.finalDecision.releaseEvidencePresent, false);
  assert.equal(result.report.finalDecision.customerAccepted, false);
  assert(result.report.packageChecklist.packageRoots.includes("docs/customers/<customer-key>/"));
  assert.deepEqual(result.report.packageChecklist.customerDocs, [
    "README.md",
    "差异与边界.md",
    "实施测试部署验收.md",
  ]);
  assert.deepEqual(result.report.packageChecklist.customerConfigFiles, [
    "README.md",
    "customerPackage.mjs",
    "customer-config.example.js",
  ]);
  assert.deepEqual(result.report.packageChecklist.deploymentDocs, [
    "README.md",
    "reference-customer.env.example",
  ]);
  assert(fs.existsSync(result.jsonPath));
  assert(fs.existsSync(result.mdPath));
});
