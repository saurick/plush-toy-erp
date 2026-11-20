import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildRuntimeManifest } from "../qa/customer-config-runtime-manifest.mjs";
import { writeBaseReleaseEvidenceTestFixture } from "./base-release-evidence-test-fixture.mjs";
import { validateCustomerConfigActivationGate } from "./customer-config-activation-gate.mjs";
import { runCustomerConfigRelease } from "./customer-config-release-execute.mjs";
import { validateCustomerConfigReleaseReadiness } from "./customer-config-release-readiness.mjs";
import { releaseReadyYoyoosunCustomerPackage } from "./customer-config-test-fixtures.mjs";
import { validateReleaseEvidenceGate } from "./release-evidence-gate.mjs";
import { buildReleaseEvidenceStatus } from "./release-evidence-status.mjs";

function productionEvidence(t) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-config-gate-"));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const manifest = "output/customer-config-runtime-manifest.json";
  const evidenceDir = "evidence";
  const payload = buildRuntimeManifest(releaseReadyYoyoosunCustomerPackage);
  const manifestPath = path.join(repoRoot, manifest);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(payload, null, 2) + "\n");
  writeBaseReleaseEvidenceTestFixture(path.join(repoRoot, evidenceDir), {
    deploymentTarget: "production-133",
  });
  fs.writeFileSync(
    path.join(repoRoot, evidenceDir, "customer-config-manifest-evidence.json"),
    JSON.stringify({
      customerKey: "yoyoosun",
      revision: payload.revision,
      manifestSha256: "sha256:" + crypto.createHash("sha256").update(fs.readFileSync(manifestPath)).digest("hex"),
      reviewStatus: "approved",
      redaction: { containsSecrets: false, containsRawCustomerRows: false, containsRawCustomerFiles: false },
    }),
  );
  return { repoRoot, manifest, evidenceDir, deploymentTarget: "production-133" };
}

test("production customer configuration shares the release evidence and readiness gates", async (t) => {
  const options = productionEvidence(t);
  const activation = validateCustomerConfigActivationGate(options);
  assert.equal(activation.deploymentTarget, "production-133");
  assert.equal(activation.runtimeIdentity.database, "plush_erp_production");
  assert.equal(buildReleaseEvidenceStatus(options).ready, true);
  const readiness = await validateCustomerConfigReleaseReadiness(options, { repoRoot: options.repoRoot });
  assert.equal(readiness.deploymentTarget, "production-133");
  assert.equal(readiness.revision, activation.revision);
  assert.equal(readiness.backendTouched, false);
  assert.equal(readiness.scope.evidenceOnly, true);
  const plan = await runCustomerConfigRelease(
    { ...options, activate: true, out: "output/production-config-release" },
    { repoRoot: options.repoRoot, fetchImpl: () => { throw new Error("dry-run must not call the backend"); } },
  );
  assert.equal(plan.executed, false);
  assert.equal(plan.activate, true);
  assert(plan.operations.length > 0);
});

test("production configuration remains closed for missing recovery evidence, target drift and test credentials", async (t) => {
  const options = productionEvidence(t);
  assert.throws(
    () => validateReleaseEvidenceGate({ ...options, profile: "customer-trial-acceptance" }),
    /production does not use the fixed test credential acceptance profile/u,
  );
  assert.throws(
    () => validateCustomerConfigActivationGate({ ...options, deploymentTarget: "customer-test-133" }),
    /customer-test-133/u,
  );
  fs.unlinkSync(path.join(options.repoRoot, options.evidenceDir, "backup-restore-report.json"));
  assert.throws(() => validateCustomerConfigActivationGate(options), /backup-restore-report/u);
  assert.equal(buildReleaseEvidenceStatus(options).ready, false);
  await assert.rejects(
    validateCustomerConfigReleaseReadiness(options, { repoRoot: options.repoRoot }),
    /backup-restore-report/u,
  );
});
