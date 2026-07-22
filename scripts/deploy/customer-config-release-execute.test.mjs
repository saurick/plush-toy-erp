import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildRuntimeManifest } from "../qa/customer-config-runtime-manifest.mjs";
import { releaseReadyYoyoosunCustomerPackage } from "./customer-config-test-fixtures.mjs";
import { writeCredentialEvidenceTestFixture } from "./credential-evidence-test-fixture.mjs";
import {
  buildInputTemplate,
  parseCliArgs,
  runCustomerConfigRelease,
} from "./customer-config-release-execute.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const releaseCli = path.join(testDir, "customer-config-release-execute.mjs");

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

function effectiveSessionPayload(root, manifest) {
  const payload = JSON.parse(
    fs.readFileSync(path.join(root, manifest), "utf8"),
  );
  return {
    configRevision: payload.revision,
    configHash: manifestSha256(root, manifest),
    configHashVersion: 1,
    customer: {
      key: payload.customer_key,
      name: "永绅 yoyoosun",
    },
    modules: {},
    roles: ["boss"],
    pages: payload.compiled_snapshot.pages,
    actions: ["customer.read"],
    workPools: ["boss"],
    fieldPolicies: payload.compiled_snapshot.fieldPolicies,
    source: "active_customer_config_revision",
  };
}

function successfulCustomerConfigRpcData(root, manifestPath, body) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, manifestPath), "utf8"),
  );
  const configHash = manifestSha256(root, manifestPath);
  if (body.method === "validate_customer_config") {
    return {
      validation: {
        customer_key: manifest.customer_key,
        revision: manifest.revision,
        config_hash: configHash,
        config_hash_version: 1,
        compiled_snapshot_ok: true,
      },
    };
  }
  if (body.method === "check_customer_config_transition") {
    return {
      transition: {
        action: body.params.action,
        customer_key: manifest.customer_key,
        target_revision: manifest.revision,
        target_config_hash: configHash,
        target_product_version: manifest.product_version,
        expected_active_revision: body.params.expected_active_revision,
        observed_active_revision: "",
        allowed: true,
        noop: false,
        blockers: [],
      },
    };
  }
  if (body.method === "get_effective_session") {
    return { session: effectiveSessionPayload(root, manifestPath) };
  }
  return {
    revision: {
      customer_key: manifest.customer_key,
      revision: manifest.revision,
      product_version: manifest.product_version,
      config_hash: configHash,
      config_hash_version: 1,
      status:
        body.method === "publish_customer_config" ? "published" : "active",
    },
  };
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
| releaseVersion | 20260628T2200-config-release |
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
    `serverImage=registry.example.invalid/plush/server:20260628T2200-config-release
serverImageDigest=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
webImage=registry.example.invalid/plush/web:20260628T2200-config-release
webImageDigest=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
`,
  );
  fs.writeFileSync(
    path.join(dir, "backup-evidence.md"),
    `# yoyoosun Backup Evidence

| 字段 | 值 |
| --- | --- |
| releaseVersion | 20260628T2200-config-release |
| environment | customer-trial |
| backupId | backup-20260628 |
| backupTime | 2026-06-28T22:00:00+08:00 |
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
        releaseVersion: "20260628T2200-config-release",
        backupId: "backup-20260628",
        verifiedAt: "2026-06-28T14:00:00Z",
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
releaseVersion=20260628T2200-config-release
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
        releaseVersion: "20260628T2200-config-release",
        endpointAlias: "https://erp.example.invalid",
        backendEndpointAlias: "https://api.example.invalid",
        summary: { total: 5, passed: 5, failed: 0 },
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
| verificationAfterRollback | healthz / readyz / web smoke / release evidence review |

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
        releaseVersion: "20260628T2200-config-release",
        rehearsedAt: "2026-06-28T14:30:00Z",
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
          smokeCheckCount: 5,
          evidenceReviewStatus: "passed",
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
| releaseVersion | 20260628T2200-config-release |
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
  writeCredentialEvidenceTestFixture(dir);
}

test("help 输出可运行", () => {
  const result = spawnSync(process.execPath, [releaseCli, "--help"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Customer config release executor/);
  assert.match(result.stdout, /--activate/);
  assert.match(result.stdout, /--rollback/);
  assert.match(result.stdout, /--print-input-template/);
});

test("input template 只输出前置清单且不读取目标文件", () => {
  const template = buildInputTemplate();

  assert.equal(
    template.scope,
    "customer-config-release-execute-input-template",
  );
  assert.equal(template.writesDatabase, false);
  assert.equal(template.callsBackend, false);
  assert.equal(template.readsManifest, false);
  assert.equal(template.validatesReleaseEvidence, false);
  assert.deepEqual(template.secretInputs, [
    "CUSTOMER_CONFIG_ADMIN_TOKEN or CUSTOMER_CONFIG_ADMIN_USERNAME/CUSTOMER_CONFIG_ADMIN_PASSWORD",
    "CUSTOMER_CONFIG_VERIFY_TOKEN when activation is executed by a technical admin whose customer role has no business pages",
  ]);
  assert.equal(template.confirmPhrases.publish, "PUBLISH_YOYOOSUN_CONFIG");
  assert.equal(template.confirmPhrases.activate, "ACTIVATE_YOYOOSUN_CONFIG");
  assert.equal(template.confirmPhrases.rollback, "ROLLBACK_YOYOOSUN_CONFIG");
  assert(
    template.operations.includes(
      "get_effective_session after activate or rollback",
    ),
  );
  assert.match(template.commands.join("\n"), /--execute --activate/);
  assert.match(
    template.commands.join("\n"),
    /--require-executed --require-activated/,
  );
  assert.match(template.boundary, /does not publish/);
  assert.match(template.boundary, /effectiveSessionVerification/);
  assert.match(template.boundary, /customer-config-effective-session/);
});

test("CLI input template 不要求 manifest 或 out", () => {
  const result = spawnSync(
    process.execPath,
    [releaseCli, "--print-input-template"],
    {
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0);
  const template = JSON.parse(result.stdout);
  assert.equal(
    template.scope,
    "customer-config-release-execute-input-template",
  );
  assert.equal(template.callsBackend, false);
  assert.equal(template.writesDatabase, false);
  assert.match(
    template.commands.join("\n"),
    /customer-config-release-readiness\.mjs/,
  );
});

test("parseCliArgs 支持发布和激活参数", () => {
  const options = parseCliArgs([
    "--manifest",
    "manifest.json",
    "--out=out",
    "--evidence-dir",
    "evidence",
    "--backend-url",
    "http://127.0.0.1:8300",
    "--execute",
    "--activate",
  ]);
  assert.equal(options.manifest, "manifest.json");
  assert.equal(options.out, "out");
  assert.equal(options.evidenceDir, "evidence");
  assert.equal(options.backendURL, "http://127.0.0.1:8300");
  assert.equal(options.execute, true);
  assert.equal(options.activate, true);
});

test("parseCliArgs 支持 input template", () => {
  const options = parseCliArgs(["--print-input-template"]);
  assert.equal(options.printInputTemplate, true);
});

test("parseCliArgs 支持 activate-only 重试路径", () => {
  const options = parseCliArgs([
    "--manifest",
    "manifest.json",
    "--out",
    "out",
    "--evidence-dir",
    "evidence",
    "--activate-only",
  ]);
  assert.equal(options.activate, true);
  assert.equal(options.activateOnly, true);
});

test("parseCliArgs 支持 rollback 路径", () => {
  const options = parseCliArgs([
    "--manifest",
    "manifest.json",
    "--out",
    "out",
    "--evidence-dir",
    "evidence",
    "--rollback",
  ]);
  assert.equal(options.rollback, true);
  assert.equal(options.activate, false);
});

test("默认只生成发布计划报告，不调用真实后端", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "customer-config-release-"),
  );
  const manifest = writeRuntimeManifest(root);
  const out = path.join(root, "out");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("fetch should not be called in report-only mode");
  };
  try {
    const report = await runCustomerConfigRelease(
      {
        manifest,
        out,
      },
      { repoRoot: root },
    );
    assert.equal(report.executed, false);
    assert.equal(report.activate, false);
    assert.equal(report.operations.length, 2);
    assert.equal(report.noRawFileUpload, true);
    assert.equal(report.manifest, manifest);
    assert.equal(path.isAbsolute(report.manifest), false);
    assert.match(report.manifestSha256, /^sha256:[a-f0-9]{64}$/);
    const saved = JSON.parse(
      await readFile(
        path.join(out, "customer-config-release-report.json"),
        "utf8",
      ),
    );
    assert.equal(
      saved.revision,
      "yoyoosun-customer-package-v7.runtime-manifest-v1",
    );
    assert.equal(saved.manifest, manifest);
    const markdown = await readFile(
      path.join(out, "customer-config-release-report.md"),
      "utf8",
    );
    assert.match(
      markdown,
      /\| manifest \| output\/customers\/yoyoosun\/customer-config-runtime-manifest\.json \|/,
    );
    assert.equal(markdown.includes(root), false);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("拒绝把 release executor 报告写入 deployments evidence 目录", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "customer-config-release-"),
  );
  const manifest = writeRuntimeManifest(root);
  try {
    await assert.rejects(
      () =>
        runCustomerConfigRelease(
          {
            manifest,
            out: "deployments/yoyoosun/evidence/releases/2026-06-28/customer-config-release",
          },
          { repoRoot: root },
        ),
      /--out must not be inside deployments evidence or customer delivery directories/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("execute 模式没有确认短语时拒绝", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "customer-config-release-"),
  );
  const manifest = writeRuntimeManifest(root);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("fetch should not happen before confirmation");
  };
  try {
    await assert.rejects(
      () =>
        runCustomerConfigRelease(
          {
            manifest,
            out: path.join(root, "out"),
            backendURL: "http://127.0.0.1:8300",
            execute: true,
          },
          { repoRoot: root },
        ),
      /CUSTOMER_CONFIG_CONFIRM=PUBLISH_YOYOOSUN_CONFIG/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("execute 模式拒绝带账号密码的 backend URL", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "customer-config-release-"),
  );
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir));
  writeManifestEvidence(root, evidenceDir, manifest);
  const originalConfirm = process.env.CUSTOMER_CONFIG_CONFIRM;
  const originalToken = process.env.CUSTOMER_CONFIG_ADMIN_TOKEN;
  process.env.CUSTOMER_CONFIG_CONFIRM = "PUBLISH_YOYOOSUN_CONFIG";
  process.env.CUSTOMER_CONFIG_ADMIN_TOKEN = "test-token";
  try {
    await assert.rejects(
      () =>
        runCustomerConfigRelease(
          {
            manifest,
            evidenceDir,
            out: path.join(root, "out"),
            backendURL: "https://operator:secret@erp.example.invalid",
            execute: true,
          },
          { repoRoot: root },
        ),
      /backend URL must not contain username or password/,
    );
  } finally {
    if (originalConfirm === undefined) {
      delete process.env.CUSTOMER_CONFIG_CONFIRM;
    } else {
      process.env.CUSTOMER_CONFIG_CONFIRM = originalConfirm;
    }
    if (originalToken === undefined) {
      delete process.env.CUSTOMER_CONFIG_ADMIN_TOKEN;
    } else {
      process.env.CUSTOMER_CONFIG_ADMIN_TOKEN = originalToken;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("activate 模式要求 release evidence gate", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "customer-config-release-"),
  );
  const manifest = writeRuntimeManifest(root);
  try {
    await assert.rejects(
      () =>
        runCustomerConfigRelease(
          {
            manifest,
            out: path.join(root, "out"),
            activate: true,
          },
          { repoRoot: root },
        ),
      /Missing required --evidence-dir/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rollback 模式要求 release evidence gate", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "customer-config-release-"),
  );
  const manifest = writeRuntimeManifest(root);
  try {
    await assert.rejects(
      () =>
        runCustomerConfigRelease(
          {
            manifest,
            out: path.join(root, "out"),
            rollback: true,
          },
          { repoRoot: root },
        ),
      /Missing required --evidence-dir/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rollback 不能和 activate 合并", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "customer-config-release-"),
  );
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir));
  writeManifestEvidence(root, evidenceDir, manifest);
  try {
    await assert.rejects(
      () =>
        runCustomerConfigRelease(
          {
            manifest,
            evidenceDir,
            out: path.join(root, "out"),
            activate: true,
            rollback: true,
          },
          { repoRoot: root },
        ),
      /--rollback cannot be combined/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("execute activate 通过 JSON-RPC 调用 validate、publish、transition check、activate", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "customer-config-release-"),
  );
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir));
  writeManifestEvidence(root, evidenceDir, manifest);
  const calls = [];
  const originalFetch = globalThis.fetch;
  const originalConfirm = process.env.CUSTOMER_CONFIG_CONFIRM;
  const originalToken = process.env.CUSTOMER_CONFIG_ADMIN_TOKEN;
  process.env.CUSTOMER_CONFIG_CONFIRM = "ACTIVATE_YOYOOSUN_CONFIG";
  process.env.CUSTOMER_CONFIG_ADMIN_TOKEN = "test-token";
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({
      url: String(url),
      method: body.method,
      params: body.params,
      auth: init.headers.Authorization,
    });
    return {
      ok: true,
      async json() {
        return {
          result: {
            code: 0,
            data: successfulCustomerConfigRpcData(root, manifest, body),
          },
        };
      },
    };
  };

  try {
    const report = await runCustomerConfigRelease(
      {
        manifest,
        evidenceDir,
        out: path.join(root, "out"),
        backendURL: "http://127.0.0.1:8300",
        execute: true,
        activate: true,
      },
      { repoRoot: root },
    );
    assert.equal(report.executed, true);
    assert.equal(report.activate, true);
    assert.deepEqual(
      calls.map((call) => call.method),
      [
        "validate_customer_config",
        "publish_customer_config",
        "check_customer_config_transition",
        "activate_customer_config",
        "get_effective_session",
      ],
    );
    assert.equal(calls[0].url, "http://127.0.0.1:8300/rpc/customer_config");
    assert.equal(calls[0].auth, "Bearer test-token");
    assert.deepEqual(
      Object.keys(calls[2].params).sort(),
      [
        "action",
        "customer_key",
        "expected_active_revision",
        "expected_config_hash",
        "expected_product_version",
        "target_revision",
      ].sort(),
    );
    assert.equal(calls[2].params.action, "activate");
    assert.equal(calls[2].params.expected_active_revision, "");
    assert.deepEqual(
      Object.keys(calls[3].params).sort(),
      [
        "customer_key",
        "expected_active_revision",
        "expected_config_hash",
        "expected_product_version",
        "revision",
      ].sort(),
    );
    assert.equal(calls[3].params.revision, report.revision);
    assert.equal(
      calls[3].params.expected_config_hash,
      calls[2].params.expected_config_hash,
    );
    assert.equal(
      calls[3].params.expected_product_version,
      calls[2].params.expected_product_version,
    );
    assert.equal(calls[3].params.expected_active_revision, "");
    assert.equal(report.backendEndpointAlias, "http://127.0.0.1:8300");
    assert.equal(report.transitionCheck.allowed, true);
    assert.equal(report.transitionCheck.attempts, 1);
    assert.equal(
      report.validatedConfigIdentity.configHash,
      calls[3].params.expected_config_hash,
    );
    assert.equal(report.validatedConfigIdentity.configHashVersion, 1);
    assert.equal(report.effectiveSessionVerification.status, "verified");
    assert.equal(
      report.effectiveSessionVerification.configHash,
      calls[3].params.expected_config_hash,
    );
    assert.equal(report.effectiveSessionVerification.configHashVersion, 1);
    assert.equal(
      report.effectiveSessionVerification.configRevision,
      "yoyoosun-customer-package-v7.runtime-manifest-v1",
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalConfirm === undefined) {
      delete process.env.CUSTOMER_CONFIG_CONFIRM;
    } else {
      process.env.CUSTOMER_CONFIG_CONFIRM = originalConfirm;
    }
    if (originalToken === undefined) {
      delete process.env.CUSTOMER_CONFIG_ADMIN_TOKEN;
    } else {
      process.env.CUSTOMER_CONFIG_ADMIN_TOKEN = originalToken;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("execute rollback 先 validate 和 transition check 再调用 rollback", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "customer-config-release-"),
  );
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir));
  writeManifestEvidence(root, evidenceDir, manifest);
  const calls = [];
  const originalFetch = globalThis.fetch;
  const originalConfirm = process.env.CUSTOMER_CONFIG_CONFIRM;
  const originalToken = process.env.CUSTOMER_CONFIG_ADMIN_TOKEN;
  process.env.CUSTOMER_CONFIG_CONFIRM = "ROLLBACK_YOYOOSUN_CONFIG";
  process.env.CUSTOMER_CONFIG_ADMIN_TOKEN = "test-token";
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({
      url: String(url),
      method: body.method,
      params: body.params,
      auth: init.headers.Authorization,
    });
    return {
      ok: true,
      async json() {
        return {
          result: {
            code: 0,
            data: successfulCustomerConfigRpcData(root, manifest, body),
          },
        };
      },
    };
  };

  try {
    const report = await runCustomerConfigRelease(
      {
        manifest,
        evidenceDir,
        out: path.join(root, "out"),
        backendURL: "http://127.0.0.1:8300",
        execute: true,
        rollback: true,
      },
      { repoRoot: root },
    );
    assert.equal(report.executed, true);
    assert.equal(report.rollback, true);
    assert.deepEqual(
      calls.map((call) => call.method),
      [
        "validate_customer_config",
        "check_customer_config_transition",
        "rollback_customer_config",
        "get_effective_session",
      ],
    );
    assert.equal(calls[1].params.action, "rollback");
    assert.deepEqual(
      Object.keys(calls[2].params).sort(),
      [
        "customer_key",
        "expected_active_revision",
        "expected_config_hash",
        "expected_product_version",
        "target_revision",
      ].sort(),
    );
    assert.equal(calls[2].params.target_revision, report.revision);
    assert.equal("revision" in calls[2].params, false);
    assert.equal(
      calls[2].params.expected_config_hash,
      calls[1].params.expected_config_hash,
    );
    assert.equal(calls[0].auth, "Bearer test-token");
    assert.equal(report.backendEndpointAlias, "http://127.0.0.1:8300");
    assert.equal(report.effectiveSessionVerification.status, "verified");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalConfirm === undefined) {
      delete process.env.CUSTOMER_CONFIG_CONFIRM;
    } else {
      process.env.CUSTOMER_CONFIG_CONFIRM = originalConfirm;
    }
    if (originalToken === undefined) {
      delete process.env.CUSTOMER_CONFIG_ADMIN_TOKEN;
    } else {
      process.env.CUSTOMER_CONFIG_ADMIN_TOKEN = originalToken;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("execute activate-only 先 validate 和 transition check 再调用 activate", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "customer-config-release-"),
  );
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir));
  writeManifestEvidence(root, evidenceDir, manifest);
  const calls = [];
  const originalFetch = globalThis.fetch;
  const originalConfirm = process.env.CUSTOMER_CONFIG_CONFIRM;
  const originalToken = process.env.CUSTOMER_CONFIG_ADMIN_TOKEN;
  process.env.CUSTOMER_CONFIG_CONFIRM = "ACTIVATE_YOYOOSUN_CONFIG";
  process.env.CUSTOMER_CONFIG_ADMIN_TOKEN = "test-token";
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({
      url: String(url),
      method: body.method,
      params: body.params,
      auth: init.headers.Authorization,
    });
    return {
      ok: true,
      async json() {
        return {
          result: {
            code: 0,
            data: successfulCustomerConfigRpcData(root, manifest, body),
          },
        };
      },
    };
  };

  try {
    const report = await runCustomerConfigRelease(
      {
        manifest,
        evidenceDir,
        out: path.join(root, "out"),
        backendURL: "http://127.0.0.1:8300",
        execute: true,
        activate: true,
        activateOnly: true,
      },
      { repoRoot: root },
    );
    assert.equal(report.executed, true);
    assert.equal(report.activateOnly, true);
    assert.deepEqual(
      calls.map((call) => call.method),
      [
        "validate_customer_config",
        "check_customer_config_transition",
        "activate_customer_config",
        "get_effective_session",
      ],
    );
    assert.equal(calls[1].params.action, "activate");
    assert.equal(calls[2].params.revision, report.revision);
    assert.equal(calls[2].params.expected_active_revision, "");
    assert.equal(
      calls[2].params.expected_config_hash,
      calls[1].params.expected_config_hash,
    );
    assert.equal(report.backendEndpointAlias, "http://127.0.0.1:8300");
    assert.equal(report.effectiveSessionVerification.status, "verified");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalConfirm === undefined) {
      delete process.env.CUSTOMER_CONFIG_CONFIRM;
    } else {
      process.env.CUSTOMER_CONFIG_CONFIRM = originalConfirm;
    }
    if (originalToken === undefined) {
      delete process.env.CUSTOMER_CONFIG_ADMIN_TOKEN;
    } else {
      process.env.CUSTOMER_CONFIG_ADMIN_TOKEN = originalToken;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("transition preflight 只用首次观测 active revision 再确认一次", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "customer-config-release-"),
  );
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir));
  writeManifestEvidence(root, evidenceDir, manifest);
  const calls = [];
  const originalFetch = globalThis.fetch;
  const originalConfirm = process.env.CUSTOMER_CONFIG_CONFIRM;
  const originalToken = process.env.CUSTOMER_CONFIG_ADMIN_TOKEN;
  process.env.CUSTOMER_CONFIG_CONFIRM = "ACTIVATE_YOYOOSUN_CONFIG";
  process.env.CUSTOMER_CONFIG_ADMIN_TOKEN = "test-token";
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ method: body.method, params: body.params });
    let data = successfulCustomerConfigRpcData(root, manifest, body);
    if (body.method === "check_customer_config_transition") {
      const confirmed = body.params.expected_active_revision === "active-v1";
      data = {
        transition: {
          ...data.transition,
          observed_active_revision: "active-v1",
          allowed: confirmed,
          blockers: confirmed ? [] : [{ code: "active_revision_changed" }],
        },
      };
    }
    return {
      ok: true,
      async json() {
        return { result: { code: 0, data } };
      },
    };
  };

  try {
    const report = await runCustomerConfigRelease(
      {
        manifest,
        evidenceDir,
        out: path.join(root, "out"),
        backendURL: "http://127.0.0.1:8300",
        execute: true,
        activate: true,
        activateOnly: true,
      },
      { repoRoot: root },
    );
    assert.deepEqual(
      calls.map((call) => call.method),
      [
        "validate_customer_config",
        "check_customer_config_transition",
        "check_customer_config_transition",
        "activate_customer_config",
        "get_effective_session",
      ],
    );
    assert.equal(calls[1].params.expected_active_revision, "");
    assert.equal(calls[2].params.expected_active_revision, "active-v1");
    assert.equal(calls[3].params.expected_active_revision, "active-v1");
    assert.equal(report.transitionCheck.attempts, 2);
    assert.equal(report.transitionCheck.observedActiveRevision, "active-v1");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalConfirm === undefined) {
      delete process.env.CUSTOMER_CONFIG_CONFIRM;
    } else {
      process.env.CUSTOMER_CONFIG_CONFIRM = originalConfirm;
    }
    if (originalToken === undefined) {
      delete process.env.CUSTOMER_CONFIG_ADMIN_TOKEN;
    } else {
      process.env.CUSTOMER_CONFIG_ADMIN_TOKEN = originalToken;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("transition blocker fail closed 且不调用 mutation 或 effective readback", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "customer-config-release-"),
  );
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir));
  writeManifestEvidence(root, evidenceDir, manifest);
  const calls = [];
  const originalFetch = globalThis.fetch;
  const originalConfirm = process.env.CUSTOMER_CONFIG_CONFIRM;
  const originalToken = process.env.CUSTOMER_CONFIG_ADMIN_TOKEN;
  process.env.CUSTOMER_CONFIG_CONFIRM = "ACTIVATE_YOYOOSUN_CONFIG";
  process.env.CUSTOMER_CONFIG_ADMIN_TOKEN = "test-token";
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body.method);
    const data = successfulCustomerConfigRpcData(root, manifest, body);
    if (body.method === "check_customer_config_transition") {
      data.transition.allowed = false;
      data.transition.blockers = [{ code: "target_module_closure_invalid" }];
    }
    return {
      ok: true,
      async json() {
        return { result: { code: 0, data } };
      },
    };
  };

  try {
    await assert.rejects(
      () =>
        runCustomerConfigRelease(
          {
            manifest,
            evidenceDir,
            out: path.join(root, "out"),
            backendURL: "http://127.0.0.1:8300",
            execute: true,
            activate: true,
            activateOnly: true,
          },
          { repoRoot: root },
        ),
      /transition blocked: target_module_closure_invalid/,
    );
    assert.deepEqual(calls, [
      "validate_customer_config",
      "check_customer_config_transition",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalConfirm === undefined) {
      delete process.env.CUSTOMER_CONFIG_CONFIRM;
    } else {
      process.env.CUSTOMER_CONFIG_CONFIRM = originalConfirm;
    }
    if (originalToken === undefined) {
      delete process.env.CUSTOMER_CONFIG_ADMIN_TOKEN;
    } else {
      process.env.CUSTOMER_CONFIG_ADMIN_TOKEN = originalToken;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("executor 对 malformed validate 和 publish identity fail closed", async (t) => {
  const cases = [
    {
      name: "unexpected hash version",
      mutate(method, data) {
        if (method === "validate_customer_config") {
          data.validation.config_hash_version = 2;
        }
      },
      wantCalls: ["validate_customer_config"],
      wantError: /validate_customer_config response does not prove/,
    },
    {
      name: "publish hash mismatch",
      mutate(method, data) {
        if (method === "publish_customer_config") {
          data.revision.config_hash = "b".repeat(64);
        }
      },
      wantCalls: ["validate_customer_config", "publish_customer_config"],
      wantError: /publish_customer_config response does not match/,
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      const root = await mkdtemp(
        path.join(os.tmpdir(), "customer-config-release-"),
      );
      const manifest = writeRuntimeManifest(root);
      const calls = [];
      const originalFetch = globalThis.fetch;
      const originalConfirm = process.env.CUSTOMER_CONFIG_CONFIRM;
      const originalToken = process.env.CUSTOMER_CONFIG_ADMIN_TOKEN;
      process.env.CUSTOMER_CONFIG_CONFIRM = "PUBLISH_YOYOOSUN_CONFIG";
      process.env.CUSTOMER_CONFIG_ADMIN_TOKEN = "test-token";
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(init.body);
        calls.push(body.method);
        const data = successfulCustomerConfigRpcData(root, manifest, body);
        testCase.mutate(body.method, data);
        return {
          ok: true,
          async json() {
            return { result: { code: 0, data } };
          },
        };
      };

      try {
        await assert.rejects(
          () =>
            runCustomerConfigRelease(
              {
                manifest,
                out: path.join(root, "out"),
                backendURL: "http://127.0.0.1:8300",
                execute: true,
              },
              { repoRoot: root },
            ),
          testCase.wantError,
        );
        assert.deepEqual(calls, testCase.wantCalls);
      } finally {
        globalThis.fetch = originalFetch;
        if (originalConfirm === undefined) {
          delete process.env.CUSTOMER_CONFIG_CONFIRM;
        } else {
          process.env.CUSTOMER_CONFIG_CONFIRM = originalConfirm;
        }
        if (originalToken === undefined) {
          delete process.env.CUSTOMER_CONFIG_ADMIN_TOKEN;
        } else {
          process.env.CUSTOMER_CONFIG_ADMIN_TOKEN = originalToken;
        }
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});

test("publish-only 报告记录后端 canonical hash identity", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "customer-config-release-"),
  );
  const manifest = writeRuntimeManifest(root);
  const originalFetch = globalThis.fetch;
  const originalConfirm = process.env.CUSTOMER_CONFIG_CONFIRM;
  const originalToken = process.env.CUSTOMER_CONFIG_ADMIN_TOKEN;
  process.env.CUSTOMER_CONFIG_CONFIRM = "PUBLISH_YOYOOSUN_CONFIG";
  process.env.CUSTOMER_CONFIG_ADMIN_TOKEN = "test-token";
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    return {
      ok: true,
      async json() {
        return {
          result: {
            code: 0,
            data: successfulCustomerConfigRpcData(root, manifest, body),
          },
        };
      },
    };
  };

  try {
    const report = await runCustomerConfigRelease(
      {
        manifest,
        out: path.join(root, "out"),
        backendURL: "http://127.0.0.1:8300",
        execute: true,
      },
      { repoRoot: root },
    );
    assert.equal(report.transitionCheck, null);
    assert.equal(report.effectiveSessionVerification, null);
    assert.equal(
      report.validatedConfigIdentity.configHash,
      manifestSha256(root, manifest),
    );
    assert.equal(report.validatedConfigIdentity.configHashVersion, 1);
    assert.equal(
      report.validatedConfigIdentity.productVersion,
      JSON.parse(fs.readFileSync(path.join(root, manifest), "utf8"))
        .product_version,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalConfirm === undefined) {
      delete process.env.CUSTOMER_CONFIG_CONFIRM;
    } else {
      process.env.CUSTOMER_CONFIG_CONFIRM = originalConfirm;
    }
    if (originalToken === undefined) {
      delete process.env.CUSTOMER_CONFIG_ADMIN_TOKEN;
    } else {
      process.env.CUSTOMER_CONFIG_ADMIN_TOKEN = originalToken;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("executor 对 malformed transition、mutation 和 effective response fail closed", async (t) => {
  const cases = [
    {
      name: "blocker without code",
      transform(method, data) {
        if (method === "check_customer_config_transition") {
          data.transition.allowed = true;
          data.transition.blockers = [{}];
        }
        return data;
      },
      wantCalls: [
        "validate_customer_config",
        "check_customer_config_transition",
      ],
      wantError: /transition response does not match/,
    },
    {
      name: "mutation identity mismatch",
      transform(method, data) {
        if (method === "activate_customer_config") {
          data.revision.config_hash = "b".repeat(64);
        }
        return data;
      },
      wantCalls: [
        "validate_customer_config",
        "check_customer_config_transition",
        "activate_customer_config",
      ],
      wantError: /activate_customer_config response does not match/,
    },
    {
      name: "bare effective session shape",
      transform(method, data) {
        if (method === "get_effective_session") {
          return data.session;
        }
        return data;
      },
      wantCalls: [
        "validate_customer_config",
        "check_customer_config_transition",
        "activate_customer_config",
        "get_effective_session",
      ],
      wantError: /required session object/,
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      const root = await mkdtemp(
        path.join(os.tmpdir(), "customer-config-release-"),
      );
      const manifest = writeRuntimeManifest(root);
      const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
      writeReleaseEvidence(path.join(root, evidenceDir));
      writeManifestEvidence(root, evidenceDir, manifest);
      const calls = [];
      const originalFetch = globalThis.fetch;
      const originalConfirm = process.env.CUSTOMER_CONFIG_CONFIRM;
      const originalToken = process.env.CUSTOMER_CONFIG_ADMIN_TOKEN;
      process.env.CUSTOMER_CONFIG_CONFIRM = "ACTIVATE_YOYOOSUN_CONFIG";
      process.env.CUSTOMER_CONFIG_ADMIN_TOKEN = "test-token";
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(init.body);
        calls.push(body.method);
        let data = successfulCustomerConfigRpcData(root, manifest, body);
        data = testCase.transform(body.method, data);
        return {
          ok: true,
          async json() {
            return { result: { code: 0, data } };
          },
        };
      };

      try {
        await assert.rejects(
          () =>
            runCustomerConfigRelease(
              {
                manifest,
                evidenceDir,
                out: path.join(root, "out"),
                backendURL: "http://127.0.0.1:8300",
                execute: true,
                activate: true,
                activateOnly: true,
              },
              { repoRoot: root },
            ),
          testCase.wantError,
        );
        assert.deepEqual(calls, testCase.wantCalls);
      } finally {
        globalThis.fetch = originalFetch;
        if (originalConfirm === undefined) {
          delete process.env.CUSTOMER_CONFIG_CONFIRM;
        } else {
          process.env.CUSTOMER_CONFIG_CONFIRM = originalConfirm;
        }
        if (originalToken === undefined) {
          delete process.env.CUSTOMER_CONFIG_ADMIN_TOKEN;
        } else {
          process.env.CUSTOMER_CONFIG_ADMIN_TOKEN = originalToken;
        }
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});
