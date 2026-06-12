import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runPhase11PrivateDeploymentClosure } from "./phase11-private-deployment-closure.mjs";

test("phase11 private deployment closure writes simulation-only evidence", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "phase11-private-"));
  const result = runPhase11PrivateDeploymentClosure({ out });

  assert.equal(result.report.phase, "Phase 11");
  assert.equal(result.report.runtimeEnabled, false);
  assert.equal(result.report.simulatedCustomerKey, "SIM-PRIVATE-PHASE11");
  assert.equal(result.report.simulatedAcceptance.noTenant, true);
  assert.equal(result.report.simulatedAcceptance.noSaas, true);
  assert.equal(result.report.simulatedAcceptance.noRealImport, true);
  assert.equal(result.report.simulatedAcceptance.noCodeFork, true);
  assert.equal(result.report.simulatedAcceptance.industryTemplateStillCandidate, true);
  assert.equal(result.report.finalDecision.phase11ClosedBySimulation, true);
  assert(result.report.packageChecklist.packageRoots.includes("docs/customers/<customer-key>/"));
  assert(result.report.packageChecklist.deploymentDocs.includes("runbooks/01-first-deploy.md"));
  assert(result.report.packageChecklist.deploymentDocs.includes("evidence/releases/release-evidence-template.md"));
  assert(fs.existsSync(result.jsonPath));
  assert(fs.existsSync(result.mdPath));
});
