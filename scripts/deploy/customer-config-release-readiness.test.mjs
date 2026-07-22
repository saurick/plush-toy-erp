import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildRuntimeManifest } from "../qa/customer-config-runtime-manifest.mjs";
import { releaseReadyYoyoosunCustomerPackage } from "./customer-config-test-fixtures.mjs";
import {
  buildCustomerConfigReadbackPreflightReport,
  buildInputTemplate,
  parseCliArgs,
  validateCustomerConfigReleaseReadiness,
} from "./customer-config-release-readiness.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const readinessCli = path.join(
  testDir,
  "customer-config-release-readiness.mjs",
);

test("input template 只输出 readiness 前置清单且不读取证据", () => {
  const template = buildInputTemplate();

  assert.equal(
    template.scope,
    "customer-config-release-readiness-input-template",
  );
  assert.equal(template.writesDatabase, false);
  assert.equal(template.callsBackend, false);
  assert.equal(template.readsManifest, false);
  assert.equal(template.readsReleaseEvidence, false);
  assert.equal(template.readsReleaseReport, false);
  assert.equal(template.validatesReleaseEvidence, false);
  assert.deepEqual(template.secretInputs, []);
  assert.match(
    template.commands.join("\n"),
    /--require-executed --require-activated/,
  );
  assert.match(
    template.commands.join("\n"),
    /--require-executed --require-rollback/,
  );
  assert.match(template.commands.join("\n"), /--readback-preflight-report/);
  assert(
    template.requiredReadbackEvidence.includes(
      "release report effectiveSessionVerification.method=get_effective_session",
    ),
  );
  assert(
    template.requiredReadbackEvidence.includes(
      "target smoke check name=customer-config-effective-session",
    ),
  );
  assert.match(template.boundary, /does not read manifest/);
  assert.match(template.boundary, /does not .*call customer_config/);
  assert.match(template.boundary, /does not .*prove active revision readback/);
});

test("CLI input template 不要求 manifest 或 evidence-dir", () => {
  const result = spawnSync(
    process.execPath,
    [readinessCli, "--print-input-template"],
    {
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0);
  const template = JSON.parse(result.stdout);
  assert.equal(
    template.scope,
    "customer-config-release-readiness-input-template",
  );
  assert.equal(template.callsBackend, false);
  assert.equal(template.readsReleaseEvidence, false);
  assert.match(
    template.commands.join("\n"),
    /customer-config-release-readiness\.mjs/,
  );
  assert.match(template.boundary, /effectiveSessionVerification/);
});

function writeRuntimeManifest(root) {
  const manifestPath = path.join(
    root,
    "output/customers/yoyoosun/customer-config-runtime-manifest.json",
  );
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(buildRuntimeManifest(releaseReadyYoyoosunCustomerPackage), null, 2),
  );
  return "output/customers/yoyoosun/customer-config-runtime-manifest.json";
}

function manifestSha256(root, manifest) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(root, manifest)))
    .digest("hex");
}

function writeManifestEvidence(root, evidenceDir, manifest) {
  fs.writeFileSync(
    path.join(root, evidenceDir, "customer-config-manifest-evidence.json"),
    JSON.stringify(
      {
        customerKey: "yoyoosun",
        revision: "yoyoosun-customer-package-v7.runtime-manifest-v1",
        manifestSha256: `sha256:${manifestSha256(root, manifest)}`,
        reviewStatus: "approved",
        reviewer: "config-reviewer",
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

function writeReleaseEvidence(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "release-evidence.md"),
    `# yoyoosun Release Evidence

| 字段 | 值 |
| --- | --- |
| customerCode | yoyoosun |
| releaseVersion | 20260628T2300-config-readiness |
| environment | customer-trial |
| gitCommit | abc1234 |
| serverImageDigest | sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
| webImageDigest | sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb |
| migrationBefore | 20260601000000 |
| migrationAfter | 20260628123354 |
| backupId | backup-20260628 |
`,
  );
  fs.writeFileSync(
    path.join(dir, "production-preflight-report.txt"),
    `[production-preflight] ok: env 必需变量齐全
[production-preflight] ok: 生产 secret、镜像 tag、debug、后端端口和 PostgreSQL / Jaeger 暴露边界通过
[production-preflight] ok: Compose、低配部署边界和 migration 脚本通过
[production-preflight] ok: docker compose config -q 通过
[production-preflight] ok: Compose 运行服务存在
[production-preflight] ok: yoyoosun SMS 运行合同已绑定: mode=provider contract_sha256=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
[production-preflight] ok: 运行态 SMS 模式匹配合同: mode=provider
[production-preflight] ok: auth.capabilities 已读回 provider/enabled/not-mock
[production-preflight] ok: 运行态 ERP_PDF_WARMUP=async
[production-preflight] ok: 运行态 Chromium / chromium-common 版本与 Docker exact pin 一致: 150.0.7871.100-1~deb12u1
[production-preflight] ok: healthz / readyz 通过
[production-preflight] all checks passed
`,
  );
  fs.writeFileSync(
    path.join(dir, "image-digests.txt"),
    `serverImage=registry.example.invalid/plush/server:20260628T2300-config-readiness
serverImageDigest=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
webImage=registry.example.invalid/plush/web:20260628T2300-config-readiness
webImageDigest=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
`,
  );
  fs.writeFileSync(
    path.join(dir, "backup-evidence.md"),
    `# yoyoosun Backup Evidence

| 字段 | 值 |
| --- | --- |
| releaseVersion | 20260628T2300-config-readiness |
| environment | customer-trial |
| backupId | backup-20260628 |
| backupTime | 2026-06-28T23:00:00+08:00 |
| backupPurpose | pre-migration |
| migrationVersion | 20260601000000 |
| databaseBackupSize | 123456 |
| databaseBackupHash | sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd |
| storageLocationAlias | controlled-backup-store |
| restoreTestStatus | verified-on-staging |
| smokeQueryStatus | pass |
`,
  );
  fs.writeFileSync(
    path.join(dir, "backup-restore-report.json"),
    JSON.stringify(
      {
        customerCode: "yoyoosun",
        environment: "customer-trial",
        releaseVersion: "20260628T2300-config-readiness",
        backupId: "backup-20260628",
        verifiedAt: "2026-06-28T15:00:00Z",
        sourceAlias: "env:SOURCE_POSTGRES_DSN",
        restoreTarget: "temp-postgres-container:postgres:18:removed-after-run",
        artifacts: {
          backupEvidence: "artifacts/backup-evidence.md",
          preMigrationStatus: "artifacts/migration-status-before-apply.txt",
          migrationStatus: "artifacts/migration-status.txt",
          commandSummary: "artifacts/command-summary.txt",
        },
        backup: {
          databaseBackupSize: 123456,
          databaseBackupHash:
            "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
          storageLocationAlias: "controlled-backup-store",
          migrationVersion: "20260601000000",
        },
        restore: {
          restoreTestStatus: "passed-temp-container",
          migrationBeforeApply: "20260601000000",
          restoreMigrationVersion: "20260628123354",
          pendingFiles: "0",
        },
        smoke: {
          smokeQueryStatus: "passed",
          publicTableCount: 12,
          adminUserCount: 2,
          backendHealthStatus: "passed",
          backendReadyStatus: "passed",
          webSmokeStatus: "passed",
        },
        redaction: {
          containsSecrets: false,
          containsRawCustomerRows: false,
          containsDumpContent: false,
          containsFullDsn: false,
        },
        summary: {
          backupCreated: true,
          restoreCompleted: true,
          migrationStatus: "ok",
          smokeQueryStatus: "passed",
        },
      },
      null,
      2,
    ),
  );
  fs.mkdirSync(path.join(dir, "artifacts"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "artifacts/backup-evidence.md"),
    "backupId=backup-20260628\n",
  );
  fs.writeFileSync(
    path.join(dir, "artifacts/migration-status-before-apply.txt"),
    "Current Version: 20260601000000\nPending Files: 1\n",
  );
  fs.writeFileSync(
    path.join(dir, "artifacts/migration-status.txt"),
    "Current Version: 20260628123354\nPending Files: 0\n",
  );
  fs.writeFileSync(
    path.join(dir, "artifacts/command-summary.txt"),
    `backupId=backup-20260628
releaseVersion=20260628T2300-config-readiness
sourceAlias=env:SOURCE_POSTGRES_DSN
restoreTarget=temp-postgres-container:postgres:18:removed-after-run
steps=pg_dump source alias -> restore isolated target -> pre-apply atlas status -> atlas migrate apply -> post-apply atlas status -> smoke
`,
  );
  fs.writeFileSync(
    path.join(dir, "migration-status.txt"),
    `Migration Status: OK
Current Version: 20260628123354
Pending Files: 0
`,
  );
  fs.writeFileSync(
    path.join(dir, "smoke-test-report.json"),
    JSON.stringify(
      {
        customerCode: "yoyoosun",
        environment: "customer-trial",
        releaseVersion: "20260628T2300-config-readiness",
        endpointAlias: "https://erp.example.invalid",
        backendEndpointAlias: "https://erp.example.invalid",
        summary: { total: 6, passed: 6, failed: 0 },
        checks: [
          {
            name: "server-healthz",
            status: "pass",
            target: "https://erp.example.invalid/healthz",
            httpCode: "200",
          },
          {
            name: "server-readyz",
            status: "pass",
            target: "https://erp.example.invalid/readyz",
            httpCode: "200",
          },
          {
            name: "web-healthz",
            status: "pass",
            target: "https://erp.example.invalid/",
            httpCode: "200",
          },
          {
            name: "auth-sms-capabilities",
            status: "pass",
            target: "jsonrpc:auth.capabilities",
            expectedMode: "provider",
            enabled: true,
            mode: "provider",
            mockDelivery: false,
            responseBodyStored: false,
          },
          {
            name: "template-pdf-render",
            status: "pass",
            target: "/templates/render-pdf",
            httpCode: "200",
            contentType: "application/pdf",
            sha256:
              "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            sizeBytes: 1024,
            responseBodyStored: false,
          },
          {
            name: "customer-config-effective-session",
            status: "pass",
            target: "jsonrpc:customer_config.get_effective_session",
            expectedRevision:
              "yoyoosun-customer-package-v7.runtime-manifest-v1",
            tokenSourceEnv: "CUSTOMER_CONFIG_ADMIN_TOKEN",
            responseBodyStored: false,
          },
        ],
        redaction: { containsSecrets: false, containsRawCustomerRows: false },
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(dir, "rollback-forward-fix-plan.md"),
    `# yoyoosun Rollback / Forward-fix Plan

| 字段 | 值 |
| --- | --- |
| rollbackDecision | rollback-or-forward-fix-ready |
| rollbackTrigger | smoke failed / migration failed / activation failed |
| rollbackTargetRelease | previous-stable-release |
| rollbackRunbook | deployments/yoyoosun/runbooks/03-rollback.md |
| forwardFixOwner | release-owner |
| verificationAfterRollback | healthz / readyz / web smoke / customer_config.get_effective_session / release evidence review |

- [x] rollback target identified
- [x] forward-fix owner assigned
- [x] post-action smoke scope defined
`,
  );
  fs.writeFileSync(
    path.join(dir, "rollback-rehearsal-report.json"),
    JSON.stringify(
      {
        customerCode: "yoyoosun",
        environment: "customer-trial",
        releaseVersion: "20260628T2300-config-readiness",
        rehearsedAt: "2026-06-28T15:30:00Z",
        rehearsalType: "rollback-forward-fix",
        triggerScenario: "activation failed after publish",
        rollbackTargetRelease: "previous-stable-release",
        rollbackRunbook: "deployments/yoyoosun/runbooks/03-rollback.md",
        steps: [
          { name: "identify rollback target", status: "pass" },
          { name: "verify rollback command path", status: "pass" },
          { name: "verify forward-fix owner path", status: "pass" },
        ],
        postCheck: {
          smokeStatus: "passed",
          smokeReport:
            "deployments/yoyoosun/evidence/releases/2026-06-28/smoke-test-report.json",
          smokeCheckCount: 6,
          evidenceReviewStatus: "passed",
          customerConfigEffectiveSession: {
            status: "verified",
            expectedRevision:
              "yoyoosun-customer-package-v7.runtime-manifest-v1",
            target: "jsonrpc:customer_config.get_effective_session",
          },
        },
        summary: { rehearsalCompleted: true, rollbackPathStatus: "passed" },
        redaction: {
          containsSecrets: false,
          containsRawCustomerRows: false,
          containsFullDsn: false,
        },
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(dir, "release-signoff-checklist.md"),
    `# yoyoosun Release Sign-off

| 字段 | 值 |
| --- | --- |
| releaseVersion | 20260628T2300-config-readiness |
| environment | customer-trial |
| backupId | backup-20260628 |
| releaseConclusion | internal-only |
| deploymentOperator | deployment-operator |
| evidenceReviewer | reviewer |
| customerOrBusinessConfirmation | config-runtime-scope-confirmed |

- [x] pre-migration backup evidence verified
- [x] known limitations reviewed
`,
  );
}

function buildReleaseReport({ root, manifest, evidenceDir, overrides = {} }) {
  const executed = overrides.executed ?? false;
  const activate = overrides.activate ?? false;
  const rollback = overrides.rollback ?? false;
  const manifestPayload = JSON.parse(
    fs.readFileSync(path.join(root, manifest), "utf8"),
  );
  const defaultEffectiveSessionVerification =
    activate || rollback
      ? {
          status: "verified",
          method: "get_effective_session",
          customerKey: "yoyoosun",
          revision: "yoyoosun-customer-package-v7.runtime-manifest-v1",
          configRevision: "yoyoosun-customer-package-v7.runtime-manifest-v1",
          source: "active_customer_config_revision",
          pageCount: manifestPayload.compiled_snapshot.pages.length,
          actionCount: 1,
          workPoolCount: 1,
          fieldPolicySurfaceCount: Object.keys(
            manifestPayload.compiled_snapshot.fieldPolicies,
          ).length,
          pagesSubsetOfManifest: true,
          fieldPolicySurfacesMatchManifest: true,
        }
      : null;
  return {
    generatedAt: "2026-06-28T23:00:00.000Z",
    customerKey: overrides.customerKey ?? "yoyoosun",
    revision:
      overrides.revision ?? "yoyoosun-customer-package-v7.runtime-manifest-v1",
    executed,
    activate,
    activateOnly: overrides.activateOnly ?? false,
    rollback,
    manifest: path.join(root, manifest),
    manifestSha256:
      overrides.manifestSha256 ?? `sha256:${manifestSha256(root, manifest)}`,
    evidenceDir: overrides.evidenceDir ?? evidenceDir,
    backendEndpointAlias:
      overrides.backendEndpointAlias ?? "https://erp.example.invalid",
    activationGateChecked: Boolean(evidenceDir),
    manifestSummary: {
      customerKey: "yoyoosun",
      revision: "yoyoosun-customer-package-v7.runtime-manifest-v1",
    },
    operations: overrides.operations ?? [
      { key: "validate", method: "validate_customer_config" },
      { key: "publish", method: "publish_customer_config" },
    ],
    results:
      overrides.results ??
      (executed
        ? [
            {
              key: "publish",
              method: "publish_customer_config",
              resultRevision:
                "yoyoosun-customer-package-v7.runtime-manifest-v1",
              resultStatus: "published",
            },
          ]
        : []),
    effectiveSessionVerification:
      overrides.effectiveSessionVerification === undefined
        ? defaultEffectiveSessionVerification
        : overrides.effectiveSessionVerification,
    noRawFileUpload: true,
    noDirectDatabaseWrite: true,
    noSchemaOrMigrationChange: true,
    noBusinessDataImport: true,
    noWorkflowFactRuntimeWrite: true,
  };
}

async function writeReleaseReport(root, report) {
  const reportPath =
    "output/customers/yoyoosun/customer-config-release/customer-config-release-report.json";
  const absoluteReportPath = path.join(root, reportPath);
  fs.mkdirSync(path.dirname(absoluteReportPath), { recursive: true });
  await writeFile(absoluteReportPath, `${JSON.stringify(report, null, 2)}\n`);
  return reportPath;
}

async function setupReadyRoot() {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "customer-config-readiness-"),
  );
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir));
  writeManifestEvidence(root, evidenceDir, manifest);
  return { root, manifest, evidenceDir };
}

test("help 输出可运行", () => {
  const result = spawnSync(process.execPath, [readinessCli, "--help"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Customer config release readiness gate/);
  assert.match(result.stdout, /--require-activated/);
  assert.match(result.stdout, /--require-rollback/);
  assert.match(result.stdout, /--print-input-template/);
});

test("parseCliArgs 支持 readiness 参数", () => {
  const options = parseCliArgs([
    "--manifest",
    "manifest.json",
    "--evidence-dir=evidence",
    "--release-report",
    "report.json",
    "--json",
    "--require-activated",
    "--require-rollback",
  ]);
  assert.equal(options.manifest, "manifest.json");
  assert.equal(options.evidenceDir, "evidence");
  assert.equal(options.releaseReport, "report.json");
  assert.equal(options.json, true);
  assert.equal(options.requireExecuted, true);
  assert.equal(options.requireActivated, true);
  assert.equal(options.requireRollback, true);
});

test("parseCliArgs 支持 input template", () => {
  const options = parseCliArgs(["--print-input-template"]);
  assert.equal(options.printInputTemplate, true);
});

test("parseCliArgs 支持 readback preflight report", () => {
  const options = parseCliArgs([
    "--manifest",
    "manifest.json",
    "--evidence-dir",
    "evidence",
    "--release-report",
    "release-report.json",
    "--readback-preflight-report",
    "output/readback-preflight.json",
  ]);
  assert.equal(options.manifest, "manifest.json");
  assert.equal(options.evidenceDir, "evidence");
  assert.equal(options.releaseReport, "release-report.json");
  assert.equal(
    options.readbackPreflightReport,
    "output/readback-preflight.json",
  );
});

test("readback preflight report summarizes missing evidence without backend calls", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "customer-config-readback-missing-"),
  );
  try {
    const reportPath =
      "output/customers/yoyoosun/customer-config-readback-preflight.json";
    const result = spawnSync(
      process.execPath,
      [readinessCli, "--readback-preflight-report", reportPath],
      {
        cwd: root,
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /readback preflight report/);
    const report = JSON.parse(
      fs.readFileSync(path.join(root, reportPath), "utf8"),
    );
    assert.equal(
      report.scope,
      "customer-config-active-readback-preflight-report",
    );
    assert.equal(report.writesDatabase, false);
    assert.equal(report.writesReleaseEvidence, false);
    assert.equal(report.callsBackend, false);
    assert.equal(report.callsCustomerConfig, false);
    assert.equal(report.readsAdminTokenValue, false);
    assert.equal(report.storesAdminTokenValue, false);
    assert.equal(report.storesResponseBody, false);
    assert.equal(report.readyForReadinessGate, false);
    assert.match(report.blockers.join("\n"), /missing-manifest-option/);
    assert.match(report.blockers.join("\n"), /missing-release-report-option/);
    assert.match(report.blockers.join("\n"), /missing-evidence-dir-option/);
    assert.match(report.blockers.join("\n"), /missing-smoke-report-option/);
    assert.doesNotMatch(
      JSON.stringify(report),
      /Bearer|access_token|CUSTOMER_CONFIG_ADMIN_TOKEN=.*[^']/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readback preflight report accepts existing release and target smoke evidence", async () => {
  const { root, manifest, evidenceDir } = await setupReadyRoot();
  try {
    const releaseReport = buildReleaseReport({
      root,
      manifest,
      evidenceDir,
      overrides: { executed: true, activate: true },
    });
    const releaseReportPath = await writeReleaseReport(root, releaseReport);
    const report = await buildCustomerConfigReadbackPreflightReport(
      {
        customer: "yoyoosun",
        manifest,
        evidenceDir,
        releaseReport: releaseReportPath,
      },
      { repoRoot: root },
    );
    assert.equal(
      report.scope,
      "customer-config-active-readback-preflight-report",
    );
    assert.equal(report.readyForReadinessGate, true);
    assert.deepEqual(report.blockers, []);
    assert.equal(
      report.manifest.revision,
      "yoyoosun-customer-package-v7.runtime-manifest-v1",
    );
    assert.equal(
      report.releaseReport.effectiveSessionVerification.status,
      "verified",
    );
    assert.equal(
      report.targetSmoke.customerConfigEffectiveSession.target,
      "jsonrpc:customer_config.get_effective_session",
    );
    assert.equal(
      report.targetSmoke.customerConfigEffectiveSession.responseBodyStored,
      false,
    );
    assert.equal(
      report.targetSmoke.customerConfigEffectiveSession.responseBodyNotStored,
      true,
    );
    assert.equal(report.tokenEnv.expectedName, "CUSTOMER_CONFIG_ADMIN_TOKEN");
    assert.equal(report.storesResponseBody, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readback preflight report redacts credentialed backend aliases", async () => {
  const { root, manifest, evidenceDir } = await setupReadyRoot();
  try {
    const releaseReport = buildReleaseReport({
      root,
      manifest,
      evidenceDir,
      overrides: {
        executed: true,
        activate: true,
        backendEndpointAlias:
          "https://deploy:secret@erp.example.invalid/api?token=hidden",
      },
    });
    const releaseReportPath = await writeReleaseReport(root, releaseReport);
    const smokePath = path.join(root, evidenceDir, "smoke-test-report.json");
    const smoke = JSON.parse(fs.readFileSync(smokePath, "utf8"));
    smoke.backendEndpointAlias =
      "https://smoke:secret@erp.example.invalid/api?token=hidden";
    fs.writeFileSync(smokePath, `${JSON.stringify(smoke, null, 2)}\n`);

    const report = await buildCustomerConfigReadbackPreflightReport(
      {
        customer: "yoyoosun",
        manifest,
        evidenceDir,
        releaseReport: releaseReportPath,
      },
      { repoRoot: root },
    );
    const serialized = JSON.stringify(report);

    assert.equal(report.readyForReadinessGate, false);
    assert(
      report.blockers.includes(
        "release-report-backend-endpoint-alias-contains-credentials",
      ),
    );
    assert(
      report.blockers.includes(
        "smoke-report-backend-endpoint-alias-contains-credentials",
      ),
    );
    assert.equal(
      report.releaseReport.backendEndpointAlias,
      "https://erp.example.invalid/api",
    );
    assert.equal(
      report.targetSmoke.backendEndpointAlias,
      "https://erp.example.invalid/api",
    );
    assert(!serialized.includes("deploy:secret"));
    assert(!serialized.includes("smoke:secret"));
    assert(!serialized.includes("token=hidden"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readback preflight report blocks customer mismatches across report and smoke evidence", async () => {
  const { root, manifest, evidenceDir } = await setupReadyRoot();
  try {
    const releaseReport = buildReleaseReport({
      root,
      manifest,
      evidenceDir,
      overrides: {
        executed: true,
        activate: true,
        customerKey: "other-customer",
        effectiveSessionVerification: {
          status: "verified",
          method: "get_effective_session",
          customerKey: "other-customer",
          configRevision: "yoyoosun-customer-package-v7.runtime-manifest-v1",
          source: "active_customer_config_revision",
          pageCount: 3,
          fieldPolicySurfaceCount: 3,
          pagesSubsetOfManifest: true,
          fieldPolicySurfacesMatchManifest: true,
        },
      },
    });
    const releaseReportPath = await writeReleaseReport(root, releaseReport);
    const smokePath = path.join(root, evidenceDir, "smoke-test-report.json");
    const smoke = JSON.parse(fs.readFileSync(smokePath, "utf8"));
    smoke.customerCode = "other-customer";
    fs.writeFileSync(smokePath, `${JSON.stringify(smoke, null, 2)}\n`);

    const report = await buildCustomerConfigReadbackPreflightReport(
      {
        customer: "yoyoosun",
        manifest,
        evidenceDir,
        releaseReport: releaseReportPath,
      },
      { repoRoot: root },
    );

    assert.equal(report.readyForReadinessGate, false);
    assert(report.blockers.includes("release-report-customer-mismatch"));
    assert(
      report.blockers.includes(
        "effective-session-verification-customer-mismatch",
      ),
    );
    assert(report.blockers.includes("smoke-report-customer-mismatch"));
    assert.equal(report.releaseReport.customerKey, "other-customer");
    assert.equal(
      report.releaseReport.effectiveSessionVerification.customerMatchesManifest,
      false,
    );
    assert.equal(report.targetSmoke.customerCode, "other-customer");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("接受发布前 readiness：manifest + manifest evidence + release evidence", async () => {
  const { root, manifest, evidenceDir } = await setupReadyRoot();
  try {
    const result = await validateCustomerConfigReleaseReadiness(
      { manifest, evidenceDir },
      { repoRoot: root },
    );
    assert.equal(result.customer, "yoyoosun");
    assert.equal(
      result.revision,
      "yoyoosun-customer-package-v7.runtime-manifest-v1",
    );
    assert.equal(result.manifest, manifest);
    assert.equal(path.isAbsolute(result.manifest), false);
    assert.match(result.manifestSha256, /^sha256:[a-f0-9]{64}$/);
    assert.equal(result.releaseReport, null);
    assert.equal(result.backendTouched, false);
    assert.equal(result.scope.evidenceOnly, true);
    assert.match(result.scope.readyMeaning, /runtime manifest/);
    assert.ok(
      result.scope.notProvenByThisGate.includes(
        "target migration, backup restore, smoke, and rollback rehearsal were performed by this gate",
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI 输出 JSON 和文本范围声明", async () => {
  const { root, manifest, evidenceDir } = await setupReadyRoot();
  try {
    const jsonResult = spawnSync(
      process.execPath,
      [
        readinessCli,
        "--manifest",
        manifest,
        "--evidence-dir",
        evidenceDir,
        "--json",
      ],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(
      jsonResult.status,
      0,
      `${jsonResult.stdout}\n${jsonResult.stderr}`,
    );
    const parsed = JSON.parse(jsonResult.stdout);
    assert.equal(parsed.scope.evidenceOnly, true);
    assert.match(
      parsed.scope.readyMeaning,
      /requested executor evidence passed/,
    );
    assert.ok(
      parsed.scope.notProvenByThisGate.includes(
        "business data import, Workflow fact posting, inventory, shipment, finance, or quality facts were written",
      ),
    );

    const textResult = spawnSync(
      process.execPath,
      [readinessCli, "--manifest", manifest, "--evidence-dir", evidenceDir],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(
      textResult.status,
      0,
      `${textResult.stdout}\n${textResult.stderr}`,
    );
    assert.match(textResult.stdout, /ready means: runtime manifest/);
    assert.match(textResult.stdout, /not proven by this gate:/);
    assert.match(textResult.stdout, /target migration, backup restore, smoke/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI JSON 失败时输出 release evidence closeout next actions", async () => {
  const { root, manifest, evidenceDir } = await setupReadyRoot();
  try {
    fs.unlinkSync(
      path.join(root, evidenceDir, "production-preflight-report.txt"),
    );
    const result = spawnSync(
      process.execPath,
      [
        readinessCli,
        "--manifest",
        manifest,
        "--evidence-dir",
        evidenceDir,
        "--json",
      ],
      { cwd: root, encoding: "utf8" },
    );

    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /customer config activation gate failed/);
    assert.equal(parsed.releaseEvidenceStatus.status, "incomplete");
    assert.equal(parsed.releaseEvidenceStatus.closeoutSummary.ready, false);
    const productionPreflight =
      parsed.releaseEvidenceStatus.closeoutNextActions.find(
        (item) => item.id === "production-preflight",
      );
    assert.ok(productionPreflight);
    assert.match(
      productionPreflight.commands.join("\n"),
      /production-preflight\.sh/,
    );
    assert.match(
      productionPreflight.manualChecks.join("\n"),
      /real runtime \.env/,
    );
    assert.equal(parsed.scope.evidenceOnly, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("接受 report-only release report 并校验 manifest hash", async () => {
  const { root, manifest, evidenceDir } = await setupReadyRoot();
  try {
    const reportPath = await writeReleaseReport(
      root,
      buildReleaseReport({ root, manifest, evidenceDir }),
    );
    const result = await validateCustomerConfigReleaseReadiness(
      { manifest, evidenceDir, releaseReport: reportPath },
      { repoRoot: root },
    );
    assert.equal(result.releaseReport.executed, false);
    assert.equal(result.releaseReport.operationCount, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("接受 release report 中的绝对 evidenceDir", async () => {
  const { root, manifest, evidenceDir } = await setupReadyRoot();
  try {
    const reportPath = await writeReleaseReport(
      root,
      buildReleaseReport({
        root,
        manifest,
        evidenceDir,
        overrides: { evidenceDir: path.join(root, evidenceDir) },
      }),
    );
    const result = await validateCustomerConfigReleaseReadiness(
      { manifest, evidenceDir, releaseReport: reportPath },
      { repoRoot: root },
    );
    assert.equal(result.releaseReport.executed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("拒绝 release report manifest hash 不匹配", async () => {
  const { root, manifest, evidenceDir } = await setupReadyRoot();
  try {
    const reportPath = await writeReleaseReport(
      root,
      buildReleaseReport({
        root,
        manifest,
        evidenceDir,
        overrides: { manifestSha256: `sha256:${"0".repeat(64)}` },
      }),
    );
    await assert.rejects(
      () =>
        validateCustomerConfigReleaseReadiness(
          { manifest, evidenceDir, releaseReport: reportPath },
          { repoRoot: root },
        ),
      /manifestSha256 does not match current manifest/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("require-executed 要求已执行报告和 results", async () => {
  const { root, manifest, evidenceDir } = await setupReadyRoot();
  try {
    await assert.rejects(
      () =>
        validateCustomerConfigReleaseReadiness(
          { manifest, evidenceDir, requireExecuted: true },
          { repoRoot: root },
        ),
      /Missing required --release-report/,
    );
    const reportPath = await writeReleaseReport(
      root,
      buildReleaseReport({ root, manifest, evidenceDir }),
    );
    await assert.rejects(
      () =>
        validateCustomerConfigReleaseReadiness(
          {
            manifest,
            evidenceDir,
            releaseReport: reportPath,
            requireExecuted: true,
          },
          { repoRoot: root },
        ),
      /executed must be true/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("接受已执行 publish 报告", async () => {
  const { root, manifest, evidenceDir } = await setupReadyRoot();
  try {
    const reportPath = await writeReleaseReport(
      root,
      buildReleaseReport({
        root,
        manifest,
        evidenceDir,
        overrides: { executed: true },
      }),
    );
    const result = await validateCustomerConfigReleaseReadiness(
      {
        manifest,
        evidenceDir,
        releaseReport: reportPath,
        requireExecuted: true,
      },
      { repoRoot: root },
    );
    assert.equal(result.releaseReport.executed, true);
    assert.equal(result.releaseReport.resultCount, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("require-executed 拒绝带账号密码的 release backend alias", async () => {
  const { root, manifest, evidenceDir } = await setupReadyRoot();
  try {
    const reportPath = await writeReleaseReport(
      root,
      buildReleaseReport({
        root,
        manifest,
        evidenceDir,
        overrides: {
          executed: true,
          backendEndpointAlias: "https://deploy:secret@erp.example.invalid",
        },
      }),
    );
    await assert.rejects(
      () =>
        validateCustomerConfigReleaseReadiness(
          {
            manifest,
            evidenceDir,
            releaseReport: reportPath,
            requireExecuted: true,
          },
          { repoRoot: root },
        ),
      /release report backendEndpointAlias must not contain username or password/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("require-activated 要求 activate active 结果", async () => {
  const { root, manifest, evidenceDir } = await setupReadyRoot();
  try {
    const reportPath = await writeReleaseReport(
      root,
      buildReleaseReport({
        root,
        manifest,
        evidenceDir,
        overrides: {
          executed: true,
          activate: true,
          operations: [{ key: "activate", method: "activate_customer_config" }],
          results: [
            {
              key: "activate",
              method: "activate_customer_config",
              resultRevision:
                "yoyoosun-customer-package-v7.runtime-manifest-v1",
              resultStatus: "published",
            },
          ],
        },
      }),
    );
    await assert.rejects(
      () =>
        validateCustomerConfigReleaseReadiness(
          {
            manifest,
            evidenceDir,
            releaseReport: reportPath,
            requireActivated: true,
          },
          { repoRoot: root },
        ),
      /active activate_customer_config result/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("require-activated 要求 effective session 验证", async () => {
  const { root, manifest, evidenceDir } = await setupReadyRoot();
  try {
    const reportPath = await writeReleaseReport(
      root,
      buildReleaseReport({
        root,
        manifest,
        evidenceDir,
        overrides: {
          executed: true,
          activate: true,
          operations: [{ key: "activate", method: "activate_customer_config" }],
          results: [
            {
              key: "activate",
              method: "activate_customer_config",
              resultRevision:
                "yoyoosun-customer-package-v7.runtime-manifest-v1",
              resultStatus: "active",
            },
          ],
          effectiveSessionVerification: null,
        },
      }),
    );
    await assert.rejects(
      () =>
        validateCustomerConfigReleaseReadiness(
          {
            manifest,
            evidenceDir,
            releaseReport: reportPath,
            requireActivated: true,
          },
          { repoRoot: root },
        ),
      /effectiveSessionVerification after activation or rollback/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("require-activated 要求目标 smoke 读回 effective session", async () => {
  const { root, manifest, evidenceDir } = await setupReadyRoot();
  try {
    const smokePath = path.join(root, evidenceDir, "smoke-test-report.json");
    const smoke = JSON.parse(fs.readFileSync(smokePath, "utf8"));
    smoke.checks = smoke.checks.filter(
      (check) => check.name !== "customer-config-effective-session",
    );
    smoke.summary = {
      total: smoke.checks.length,
      passed: smoke.checks.length,
      failed: 0,
    };
    fs.writeFileSync(smokePath, `${JSON.stringify(smoke, null, 2)}\n`);
    const rollbackReportPath = path.join(
      root,
      evidenceDir,
      "rollback-rehearsal-report.json",
    );
    const rollbackReport = JSON.parse(
      fs.readFileSync(rollbackReportPath, "utf8"),
    );
    rollbackReport.postCheck.smokeCheckCount = smoke.checks.length;
    delete rollbackReport.postCheck.customerConfigEffectiveSession;
    fs.writeFileSync(
      rollbackReportPath,
      `${JSON.stringify(rollbackReport, null, 2)}\n`,
    );
    const reportPath = await writeReleaseReport(
      root,
      buildReleaseReport({
        root,
        manifest,
        evidenceDir,
        overrides: {
          executed: true,
          activate: true,
          operations: [{ key: "activate", method: "activate_customer_config" }],
          results: [
            {
              key: "activate",
              method: "activate_customer_config",
              resultRevision:
                "yoyoosun-customer-package-v7.runtime-manifest-v1",
              resultStatus: "active",
            },
          ],
        },
      }),
    );
    await assert.rejects(
      () =>
        validateCustomerConfigReleaseReadiness(
          {
            manifest,
            evidenceDir,
            releaseReport: reportPath,
            requireActivated: true,
          },
          { repoRoot: root },
        ),
      /smoke-test-report\.json must include customer-config-effective-session/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("require-activated 拒绝目标 smoke revision 不匹配", async () => {
  const { root, manifest, evidenceDir } = await setupReadyRoot();
  try {
    const smokePath = path.join(root, evidenceDir, "smoke-test-report.json");
    const smoke = JSON.parse(fs.readFileSync(smokePath, "utf8"));
    const smokeCheck = smoke.checks.find(
      (check) => check.name === "customer-config-effective-session",
    );
    smokeCheck.expectedRevision = "wrong-revision";
    fs.writeFileSync(smokePath, `${JSON.stringify(smoke, null, 2)}\n`);
    const rollbackReportPath = path.join(
      root,
      evidenceDir,
      "rollback-rehearsal-report.json",
    );
    const rollbackReport = JSON.parse(
      fs.readFileSync(rollbackReportPath, "utf8"),
    );
    rollbackReport.postCheck.customerConfigEffectiveSession.expectedRevision =
      "wrong-revision";
    fs.writeFileSync(
      rollbackReportPath,
      `${JSON.stringify(rollbackReport, null, 2)}\n`,
    );
    const reportPath = await writeReleaseReport(
      root,
      buildReleaseReport({
        root,
        manifest,
        evidenceDir,
        overrides: {
          executed: true,
          activate: true,
          operations: [{ key: "activate", method: "activate_customer_config" }],
          results: [
            {
              key: "activate",
              method: "activate_customer_config",
              resultRevision:
                "yoyoosun-customer-package-v7.runtime-manifest-v1",
              resultStatus: "active",
            },
          ],
        },
      }),
    );
    await assert.rejects(
      () =>
        validateCustomerConfigReleaseReadiness(
          {
            manifest,
            evidenceDir,
            releaseReport: reportPath,
            requireActivated: true,
          },
          { repoRoot: root },
        ),
      /customer-config-manifest-evidence\.json revision must match smoke-test-report\.json customer-config-effective-session expectedRevision/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("require-activated 拒绝执行报告与目标 smoke backend 不一致", async () => {
  const { root, manifest, evidenceDir } = await setupReadyRoot();
  try {
    const reportPath = await writeReleaseReport(
      root,
      buildReleaseReport({
        root,
        manifest,
        evidenceDir,
        overrides: {
          executed: true,
          activate: true,
          backendEndpointAlias: "https://local-dev.example.invalid",
          operations: [{ key: "activate", method: "activate_customer_config" }],
          results: [
            {
              key: "activate",
              method: "activate_customer_config",
              resultRevision:
                "yoyoosun-customer-package-v7.runtime-manifest-v1",
              resultStatus: "active",
            },
          ],
        },
      }),
    );
    await assert.rejects(
      () =>
        validateCustomerConfigReleaseReadiness(
          {
            manifest,
            evidenceDir,
            releaseReport: reportPath,
            requireActivated: true,
          },
          { repoRoot: root },
        ),
      /backendEndpointAlias must match target smoke backendEndpointAlias/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("require-activated 拒绝带账号密码的目标 smoke backend alias", async () => {
  const { root, manifest, evidenceDir } = await setupReadyRoot();
  try {
    const smokePath = path.join(root, evidenceDir, "smoke-test-report.json");
    const smoke = JSON.parse(fs.readFileSync(smokePath, "utf8"));
    smoke.backendEndpointAlias = "https://deploy:secret@erp.example.invalid";
    fs.writeFileSync(smokePath, `${JSON.stringify(smoke, null, 2)}\n`);
    const reportPath = await writeReleaseReport(
      root,
      buildReleaseReport({
        root,
        manifest,
        evidenceDir,
        overrides: {
          executed: true,
          activate: true,
          operations: [{ key: "activate", method: "activate_customer_config" }],
          results: [
            {
              key: "activate",
              method: "activate_customer_config",
              resultRevision:
                "yoyoosun-customer-package-v7.runtime-manifest-v1",
              resultStatus: "active",
            },
          ],
        },
      }),
    );
    await assert.rejects(
      () =>
        validateCustomerConfigReleaseReadiness(
          {
            manifest,
            evidenceDir,
            releaseReport: reportPath,
            requireActivated: true,
          },
          { repoRoot: root },
        ),
      /smoke-test-report\.json (contains a credentialed URL|backendEndpointAlias must not contain)/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("接受已激活报告", async () => {
  const { root, manifest, evidenceDir } = await setupReadyRoot();
  try {
    const reportPath = await writeReleaseReport(
      root,
      buildReleaseReport({
        root,
        manifest,
        evidenceDir,
        overrides: {
          executed: true,
          activate: true,
          operations: [
            { key: "validate", method: "validate_customer_config" },
            { key: "publish", method: "publish_customer_config" },
            { key: "activate", method: "activate_customer_config" },
          ],
          results: [
            {
              key: "publish",
              method: "publish_customer_config",
              resultRevision:
                "yoyoosun-customer-package-v7.runtime-manifest-v1",
              resultStatus: "published",
            },
            {
              key: "activate",
              method: "activate_customer_config",
              resultRevision:
                "yoyoosun-customer-package-v7.runtime-manifest-v1",
              resultStatus: "active",
            },
          ],
        },
      }),
    );
    const result = await validateCustomerConfigReleaseReadiness(
      {
        manifest,
        evidenceDir,
        releaseReport: reportPath,
        requireActivated: true,
      },
      { repoRoot: root },
    );
    assert.equal(result.releaseReport.activate, true);
    assert.equal(result.releaseReport.resultCount, 2);
    assert.equal(result.releaseReport.effectiveSessionVerified, true);
    assert.equal(result.targetSmokeEffectiveSession.status, "verified");
    assert.equal(
      result.targetSmokeEffectiveSession.expectedRevision,
      "yoyoosun-customer-package-v7.runtime-manifest-v1",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("require-rollback 要求 rollback active 结果", async () => {
  const { root, manifest, evidenceDir } = await setupReadyRoot();
  try {
    const reportPath = await writeReleaseReport(
      root,
      buildReleaseReport({
        root,
        manifest,
        evidenceDir,
        overrides: {
          executed: true,
          rollback: true,
          operations: [{ key: "rollback", method: "rollback_customer_config" }],
          results: [
            {
              key: "rollback",
              method: "rollback_customer_config",
              resultRevision:
                "yoyoosun-customer-package-v7.runtime-manifest-v1",
              resultStatus: "published",
            },
          ],
        },
      }),
    );
    await assert.rejects(
      () =>
        validateCustomerConfigReleaseReadiness(
          {
            manifest,
            evidenceDir,
            releaseReport: reportPath,
            requireRollback: true,
          },
          { repoRoot: root },
        ),
      /active rollback_customer_config result/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("require-rollback 拒绝 effective session revision 不匹配", async () => {
  const { root, manifest, evidenceDir } = await setupReadyRoot();
  try {
    const reportPath = await writeReleaseReport(
      root,
      buildReleaseReport({
        root,
        manifest,
        evidenceDir,
        overrides: {
          executed: true,
          rollback: true,
          operations: [{ key: "rollback", method: "rollback_customer_config" }],
          results: [
            {
              key: "rollback",
              method: "rollback_customer_config",
              resultRevision:
                "yoyoosun-customer-package-v7.runtime-manifest-v1",
              resultStatus: "active",
            },
          ],
          effectiveSessionVerification: {
            status: "verified",
            method: "get_effective_session",
            customerKey: "yoyoosun",
            configRevision: "wrong-revision",
            source: "active_customer_config_revision",
            pageCount: 1,
            fieldPolicySurfaceCount: 3,
            pagesSubsetOfManifest: true,
            fieldPolicySurfacesMatchManifest: true,
          },
        },
      }),
    );
    await assert.rejects(
      () =>
        validateCustomerConfigReleaseReadiness(
          {
            manifest,
            evidenceDir,
            releaseReport: reportPath,
            requireRollback: true,
          },
          { repoRoot: root },
        ),
      /effectiveSessionVerification configRevision does not match manifest/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("接受已回滚报告", async () => {
  const { root, manifest, evidenceDir } = await setupReadyRoot();
  try {
    const reportPath = await writeReleaseReport(
      root,
      buildReleaseReport({
        root,
        manifest,
        evidenceDir,
        overrides: {
          executed: true,
          rollback: true,
          operations: [{ key: "rollback", method: "rollback_customer_config" }],
          results: [
            {
              key: "rollback",
              method: "rollback_customer_config",
              resultRevision:
                "yoyoosun-customer-package-v7.runtime-manifest-v1",
              resultStatus: "active",
            },
          ],
        },
      }),
    );
    const result = await validateCustomerConfigReleaseReadiness(
      {
        manifest,
        evidenceDir,
        releaseReport: reportPath,
        requireRollback: true,
      },
      { repoRoot: root },
    );
    assert.equal(result.releaseReport.rollback, true);
    assert.equal(result.releaseReport.resultCount, 1);
    assert.equal(result.releaseReport.effectiveSessionVerified, true);
    assert.equal(result.targetSmokeEffectiveSession.status, "verified");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
