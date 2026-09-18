import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildRuntimeManifest } from "../qa/customer-config-runtime-manifest.mjs";
import { writeBaseReleaseEvidenceTestFixture } from "./base-release-evidence-test-fixture.mjs";
import { validateCustomerConfigActivationGate } from "./customer-config-activation-gate.mjs";
import { releaseReadyYoyoosunCustomerPackage } from "./customer-config-test-fixtures.mjs";
import {
  parseCliArgs,
  writeCustomerConfigManifestEvidence,
} from "./customer-config-manifest-evidence.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const evidenceCli = path.join(testDir, "customer-config-manifest-evidence.mjs");

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

function writeReleaseEvidence(dir) {
  return writeBaseReleaseEvidenceTestFixture(dir, {
    deploymentTarget: "demo-133",
    releaseId: "20260628T2300-config-evidence",
  });
}

test("help 输出可运行", () => {
  const result = spawnSync(process.execPath, [evidenceCli, "--help"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Customer config manifest evidence generator/);
});

test("parseCliArgs 支持 manifest evidence 参数", () => {
  const options = parseCliArgs([
    "--manifest",
    "manifest.json",
    "--evidence-dir",
    "evidence",
    "--release-report=report.json",
    "--review-status=approved",
    "--reviewer",
    "ops",
  ]);
  assert.equal(options.manifest, "manifest.json");
  assert.equal(options.evidenceDir, "evidence");
  assert.equal(options.releaseReport, "report.json");
  assert.equal(options.reviewStatus, "approved");
  assert.equal(options.reviewer, "ops");
});

test("生成 manifest evidence 后 activation gate 可通过", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "customer-config-manifest-evidence-"),
  );
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir));

  const result = await writeCustomerConfigManifestEvidence(
    {
      manifest,
      evidenceDir,
      reviewStatus: "approved",
      reviewer: "ops-reviewer",
    },
    { repoRoot: root },
  );

  const evidence = JSON.parse(await readFile(result.evidencePath, "utf8"));
  assert.equal(evidence.customerKey, "yoyoosun");
  assert.equal(evidence.reviewStatus, "approved");
  assert.equal(
    evidence.manifestPath,
    "output/customers/yoyoosun/customer-config-runtime-manifest.json",
  );
  assert.equal(path.isAbsolute(evidence.manifestPath), false);
  assert.match(evidence.manifestSha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal(evidence.redaction.containsSecrets, false);

  const gate = validateCustomerConfigActivationGate({
    deploymentTarget: "demo-133",
    repoRoot: root,
    manifest,
    evidenceDir,
  });
  assert.equal(
    gate.revision,
    "yoyoosun-customer-package-v7.runtime-manifest-v1",
  );

  await rm(root, { recursive: true, force: true });
});

test("未显式 approved 时生成 draft，不自动通过 activation gate", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "customer-config-manifest-evidence-"),
  );
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir));

  const result = await writeCustomerConfigManifestEvidence(
    {
      manifest,
      evidenceDir,
      reviewer: "ops-reviewer",
    },
    { repoRoot: root },
  );

  const evidence = JSON.parse(await readFile(result.evidencePath, "utf8"));
  assert.equal(evidence.reviewStatus, "draft");
  assert.throws(
    () =>
      validateCustomerConfigActivationGate({
        deploymentTarget: "demo-133",
        repoRoot: root,
        manifest,
        evidenceDir,
      }),
    /reviewStatus must be approved/,
  );

  await rm(root, { recursive: true, force: true });
});

test("缺少 reviewer 时拒绝", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "customer-config-manifest-evidence-"),
  );
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir));

  await assert.rejects(
    () =>
      writeCustomerConfigManifestEvidence(
        {
          manifest,
          evidenceDir,
        },
        { repoRoot: root },
      ),
    /Missing required --reviewer/,
  );

  await rm(root, { recursive: true, force: true });
});

test("release evidence 目录不存在时拒绝", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "customer-config-manifest-evidence-"),
  );
  const manifest = writeRuntimeManifest(root);

  await assert.rejects(
    () =>
      writeCustomerConfigManifestEvidence(
        {
          manifest,
          evidenceDir: "deployments/yoyoosun/evidence/releases/missing",
          reviewer: "ops-reviewer",
        },
        { repoRoot: root },
      ),
    /evidence dir must already exist/,
  );

  await rm(root, { recursive: true, force: true });
});

test("release report hash 不匹配时拒绝", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "customer-config-manifest-evidence-"),
  );
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir));
  const reportPath = path.join(
    root,
    "output/customers/yoyoosun/customer-config-release/customer-config-release-report.json",
  );
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        customerKey: "yoyoosun",
        revision: "yoyoosun-customer-package-v7.runtime-manifest-v1",
        manifestSha256:
          "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      },
      null,
      2,
    ),
  );

  await assert.rejects(
    () =>
      writeCustomerConfigManifestEvidence(
        {
          manifest,
          evidenceDir,
          releaseReport:
            "output/customers/yoyoosun/customer-config-release/customer-config-release-report.json",
          reviewer: "ops-reviewer",
        },
        { repoRoot: root },
      ),
    /release report manifestSha256 does not match manifest/,
  );

  await rm(root, { recursive: true, force: true });
});
