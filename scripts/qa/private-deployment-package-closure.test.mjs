import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runPrivateDeploymentPackageClosure } from "./private-deployment-package-closure.mjs";

test("private-deployment private deployment closure writes simulation-only evidence", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "private-deployment-private-"));
  const result = runPrivateDeploymentPackageClosure({ out });

  assert.equal(result.report.reviewMilestone, "private-deployment-package-candidate");
  assert.equal(result.report.runtimeEnabled, false);
  assert.equal(result.report.simulatedCustomerKey, "SIM-PRIVATE-DEPLOYMENT");
  assert.equal(result.report.simulatedAcceptance.noTenant, true);
  assert.equal(result.report.simulatedAcceptance.noSaas, true);
  assert.equal(result.report.simulatedAcceptance.noRealImport, true);
  assert.equal(result.report.simulatedAcceptance.noCodeFork, true);
  assert.equal(result.report.simulatedAcceptance.industryTemplateStillCandidate, true);
  assert.equal(result.report.finalDecision.closedBySimulation, true);
  assert(result.report.packageChecklist.packageRoots.includes("docs/customers/<customer-key>/"));
  assert(result.report.packageChecklist.deploymentDocs.includes("runbooks/01-first-deploy.md"));
  assert(result.report.packageChecklist.deploymentDocs.includes("evidence/releases/release-evidence-template.md"));
  assert(fs.existsSync(result.jsonPath));
  assert(fs.existsSync(result.mdPath));
});
