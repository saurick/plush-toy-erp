import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildRuntimeManifest } from "../qa/customer-config-runtime-manifest.mjs";
import { writeBaseReleaseEvidenceTestFixture } from "./base-release-evidence-test-fixture.mjs";
import { PRODUCTION_PREFLIGHT_CHECKS } from "./production-preflight-receipt.mjs";
import { validateCustomerConfigActivationGate as validateCustomerConfigActivationGateImpl } from "./customer-config-activation-gate.mjs";
import { releaseReadyYoyoosunCustomerPackage } from "./customer-config-test-fixtures.mjs";

const scriptPath = path.resolve(
  new URL("customer-config-activation-gate.mjs", import.meta.url).pathname,
);
const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const releaseGitCommit = "abc1234000000000000000000000000000000000";

function runActivationGate(root, args) {
  return spawnSync(
    process.execPath,
    [scriptPath, "--deployment-target", "demo-133", ...args],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
}

function validateCustomerConfigActivationGate(options) {
  return validateCustomerConfigActivationGateImpl({
    deploymentTarget: "demo-133",
    ...options,
  });
}

function writeRuntimeManifest(root) {
  const manifestPath = path.join(
    root,
    "output/customers/yoyoosun/customer-config-runtime-manifest.json",
  );
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      buildRuntimeManifest(releaseReadyYoyoosunCustomerPackage),
      null,
      2,
    ),
  );
  return "output/customers/yoyoosun/customer-config-runtime-manifest.json";
}

function manifestSha256(root, manifest) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(root, manifest)))
    .digest("hex");
}

function writeManifestEvidence(root, evidenceDir, manifest, overrides = {}) {
  const manifestPayload = JSON.parse(
    fs.readFileSync(path.join(root, manifest), "utf8"),
  );
  fs.writeFileSync(
    path.join(root, evidenceDir, "customer-config-manifest-evidence.json"),
    JSON.stringify(
      {
        customerKey: "yoyoosun",
        revision: manifestPayload.revision,
        manifestSha256: `sha256:${manifestSha256(root, manifest)}`,
        reviewStatus: overrides.reviewStatus ?? "approved",
        redaction: {
          containsSecrets: false,
          containsRawCustomerRows: false,
          containsRawCustomerFiles: false,
        },
      },
      null,
      2,
    ),
  );
}

function writeReleaseEvidence(dir, overrides = {}) {
  return writeBaseReleaseEvidenceTestFixture(dir, {
    releaseId: overrides.releaseId ?? "20260628T2100-config-runtime",
    productCommit: releaseGitCommit,
    restoreCompleted: overrides.restoreCompleted ?? true,
    smokeFailed: overrides.smokeFailed ?? 0,
  });
}

test("customer config activation gate accepts manifest with filled release evidence", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "customer-config-activation-gate-"),
  );
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir));
  writeManifestEvidence(root, evidenceDir, manifest);

  const result = validateCustomerConfigActivationGate({
    repoRoot: root,
    manifest,
    evidenceDir,
  });

  assert.equal(result.customer, "yoyoosun");
  assert.equal(
    result.revision,
    "yoyoosun-customer-package-v7.runtime-manifest-v1",
  );
  assert.deepEqual(result.runtimeIdentity, {
    scope: "release-v1",
    database: "plush_erp_demo_v1",
    productCommit: "abc1234000000000000000000000000000000000",
    migrationVersion: "20260628123354",
    expectedDigestSha256: crypto
      .createHash("sha256")
      .update(
        [
          "release-v1",
          "plush_erp_demo_v1",
          "abc1234000000000000000000000000000000000",
          "20260628123354",
        ].join("\n"),
      )
      .digest("hex"),
  });
  assert.equal(result.scope.evidenceOnly, true);
});

test("customer config activation accepts a stronger customer acceptance preflight receipt", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "config-acceptance-preflight-"),
  );
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "evidence";
  writeReleaseEvidence(path.join(root, evidenceDir));
  writeManifestEvidence(root, evidenceDir, manifest);
  const reportPath = path.join(
    root,
    evidenceDir,
    "production-preflight-report.json",
  );
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  report.profile = "customer-trial-acceptance";
  for (const id of [
    PRODUCTION_PREFLIGHT_CHECKS.SMS_PROVIDER_RUNTIME,
    PRODUCTION_PREFLIGHT_CHECKS.PDF_RUNTIME,
    PRODUCTION_PREFLIGHT_CHECKS.CHROMIUM_RUNTIME,
  ])
    report.checks.push({ id, status: "passed" });
  report.summary = {
    total: report.checks.length,
    passed: report.checks.length,
    failed: 0,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report));
  assert.doesNotThrow(() =>
    validateCustomerConfigActivationGate({
      repoRoot: root,
      manifest,
      evidenceDir,
    }),
  );
  report.checks = report.checks.filter(
    (check) => check.id !== PRODUCTION_PREFLIGHT_CHECKS.RUNTIME_HEALTH_READY,
  );
  report.summary = {
    total: report.checks.length,
    passed: report.checks.length,
    failed: 0,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report));
  assert.throws(
    () =>
      validateCustomerConfigActivationGate({
        repoRoot: root,
        manifest,
        evidenceDir,
      }),
    /runtime-health-ready/u,
  );
});

test("customer config activation gate does not require acceptance-only PDF proof", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "customer-config-activation-gate-pre-activation-"),
  );
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  const absoluteEvidenceDir = path.join(root, evidenceDir);
  writeReleaseEvidence(absoluteEvidenceDir);
  writeManifestEvidence(root, evidenceDir, manifest);

  const smokePath = path.join(absoluteEvidenceDir, "smoke-test-report.json");
  const smoke = JSON.parse(fs.readFileSync(smokePath, "utf8"));
  assert.equal(
    smoke.checks.some((check) => check.name === "template-pdf-render"),
    false,
  );
  smoke.checks = smoke.checks.filter(
    (check) => check.name !== "template-pdf-render",
  );
  smoke.summary.total = smoke.checks.length;
  smoke.summary.passed = smoke.checks.length;
  fs.writeFileSync(smokePath, JSON.stringify(smoke, null, 2));

  const rollbackPath = path.join(
    absoluteEvidenceDir,
    "rollback-rehearsal-report.json",
  );
  const rollback = JSON.parse(fs.readFileSync(rollbackPath, "utf8"));
  rollback.postCheck.smokeCheckCount = smoke.checks.length;
  fs.writeFileSync(rollbackPath, JSON.stringify(rollback, null, 2));

  const result = validateCustomerConfigActivationGate({
    repoRoot: root,
    manifest,
    evidenceDir,
  });

  assert.equal(
    result.revision,
    "yoyoosun-customer-package-v7.runtime-manifest-v1",
  );
});

test("customer config activation gate CLI JSON reports ok success scope", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "customer-config-activation-gate-json-ok-"),
  );
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir));
  writeManifestEvidence(root, evidenceDir, manifest);

  const result = runActivationGate(root, [
    "--manifest",
    manifest,
    "--evidence-dir",
    evidenceDir,
    "--json",
  ]);

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.customer, "yoyoosun");
  assert.equal(payload.scope.evidenceOnly, true);
  assert.match(
    payload.scope.notProvenByThisGate.join("\n"),
    /customer config revision was activated/,
  );
});

test("customer config activation gate rejects missing restore rehearsal", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "customer-config-activation-gate-restore-"),
  );
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir), {
    restoreCompleted: false,
  });
  writeManifestEvidence(root, evidenceDir, manifest);

  assert.throws(
    () =>
      validateCustomerConfigActivationGate({
        repoRoot: root,
        manifest,
        evidenceDir,
      }),
    /summary\.restoreCompleted must be true/,
  );
});

test("customer config activation gate CLI JSON failure includes release evidence closeout next actions", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "customer-config-activation-gate-json-fail-"),
  );
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  const absoluteEvidenceDir = path.join(root, evidenceDir);
  writeReleaseEvidence(absoluteEvidenceDir);
  writeManifestEvidence(root, evidenceDir, manifest);
  fs.unlinkSync(
    path.join(absoluteEvidenceDir, "production-preflight-report.json"),
  );

  const result = runActivationGate(root, [
    "--manifest",
    manifest,
    "--evidence-dir",
    evidenceDir,
    "--json",
  ]);

  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.match(payload.error, /customer config activation gate failed/);
  assert.equal(payload.scope.evidenceOnly, true);
  assert.equal(payload.releaseEvidenceStatus.status, "incomplete");
  assert(
    payload.releaseEvidenceStatus.closeoutNextActions.some(
      (action) =>
        action.id === "production-preflight" &&
        action.commands.some((command) =>
          command.includes("production-preflight.sh"),
        ),
    ),
  );
});

test("customer config activation gate rejects invalid manifest payload", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "customer-config-activation-gate-manifest-"),
  );
  const manifest = writeRuntimeManifest(root);
  const absoluteManifest = path.join(root, manifest);
  const payload = JSON.parse(fs.readFileSync(absoluteManifest, "utf8"));
  payload.compiled_snapshot.secret = "bad";
  fs.writeFileSync(absoluteManifest, JSON.stringify(payload, null, 2));
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir));
  writeManifestEvidence(root, evidenceDir, manifest);

  assert.throws(
    () =>
      validateCustomerConfigActivationGate({
        repoRoot: root,
        manifest,
        evidenceDir,
      }),
    /must not embed raw rows, secrets, SQL or executable code payloads/,
  );
});

test("customer config activation gate rejects missing manifest fingerprint evidence", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "customer-config-activation-gate-fingerprint-"),
  );
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir));

  assert.throws(
    () =>
      validateCustomerConfigActivationGate({
        repoRoot: root,
        manifest,
        evidenceDir,
      }),
    /Missing customer-config-manifest-evidence\.json/,
  );
});

test("customer config activation gate rejects stale manifest fingerprint", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "customer-config-activation-gate-stale-"),
  );
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir));
  writeManifestEvidence(root, evidenceDir, manifest);
  const payload = JSON.parse(
    fs.readFileSync(path.join(root, manifest), "utf8"),
  );
  payload.product_version = "local-customer-package";
  payload.compiled_snapshot.customer.name = "stale-hash";
  fs.writeFileSync(path.join(root, manifest), JSON.stringify(payload, null, 2));

  assert.throws(
    () =>
      validateCustomerConfigActivationGate({
        repoRoot: root,
        manifest,
        evidenceDir,
      }),
    /manifestSha256 must match current manifest/,
  );
});
