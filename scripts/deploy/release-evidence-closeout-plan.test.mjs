import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildReleaseEvidenceCloseoutPlan,
  parseCliArgs,
} from "./release-evidence-closeout-plan.mjs";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const scriptPath = path.join(
  repoRoot,
  "scripts/deploy/release-evidence-closeout-plan.mjs",
);
const collectEvidencePath = path.join(
  repoRoot,
  "deployments/yoyoosun/scripts/collect-evidence.sh",
);

const VALID_ENV = {
  RELEASE_VERSION: "20260629T1200-draft",
  RELEASE_ENVIRONMENT: "customer-trial",
  OPERATOR_ROLE: "release-operator",
  GIT_COMMIT: "6da29ddcde7b",
  SERVER_IMAGE: "registry.example.invalid/plush/server:20260629T1200",
  SERVER_IMAGE_DIGEST:
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  WEB_IMAGE: "registry.example.invalid/plush/web:20260629T1200",
  WEB_IMAGE_DIGEST:
    "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  MIGRATION_BEFORE: "20260601000000",
  MIGRATION_AFTER: "20260628123354",
  BACKUP_ID: "backup-20260629T1200",
  SOURCE_POSTGRES_DSN: "postgres://release-source.example.invalid/plush",
  SMOKE_ENDPOINT: "https://erp.example.invalid",
  ROLLBACK_TARGET_RELEASE: "20260628T1200-previous",
  ROLLBACK_TRIGGER_SCENARIO: "smoke failed after activation",
};

function writeDraftEvidence(root) {
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-29";
  const absoluteDir = path.join(root, evidenceDir);
  const result = spawnSync(
    "bash",
    [
      collectEvidencePath,
      "--release-version",
      "20260629T1200-draft",
      "--output",
      absoluteDir,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return { evidenceDir, absoluteDir };
}

function updateReleaseEvidenceField(evidenceDir, field, value) {
  const releaseEvidencePath = path.join(evidenceDir, "release-evidence.md");
  const content = fs.readFileSync(releaseEvidencePath, "utf8");
  fs.writeFileSync(
    releaseEvidencePath,
    content.replace(
      new RegExp(`^\\| ${field} \\| [^|]+ \\|$`, "m"),
      `| ${field} | ${value} |`,
    ),
  );
}

function writeToolScripts(root) {
  const backupScript = path.join(
    root,
    "deployments/yoyoosun/scripts/run-backup-restore-rehearsal.sh",
  );
  const smokeScript = path.join(
    root,
    "deployments/yoyoosun/scripts/run-smoke.sh",
  );
  fs.mkdirSync(path.dirname(backupScript), { recursive: true });
  fs.writeFileSync(backupScript, "#!/usr/bin/env bash\n");
  fs.writeFileSync(smokeScript, "#!/usr/bin/env bash\n");
}

function runPlan({ cwd, args = [], env = {} }) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    env: {
      PATH: process.env.PATH,
      ...env,
    },
    encoding: "utf8",
  });
}

test("parseCliArgs supports closeout plan options", () => {
  assert.deepEqual(
    parseCliArgs([
      "--evidence-dir",
      "deployments/yoyoosun/evidence/releases/2026-06-29",
      "--runtime-env-file",
      "server/deploy/compose/prod/.env",
      "--json",
      "--fail-on-blocked",
    ]),
    {
      customer: "yoyoosun",
      evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-29",
      envFile: "server/deploy/compose/prod/.env",
      json: true,
      failOnBlocked: true,
    },
  );
});

test("closeout plan reports missing local prerequisites for draft evidence", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "release-closeout-plan-missing-"),
  );
  const { evidenceDir } = writeDraftEvidence(root);

  const plan = buildReleaseEvidenceCloseoutPlan({
    repoRoot: root,
    evidenceDir,
    env: {},
  });

  assert.equal(plan.status.status, "draft");
  assert.equal(plan.status.ready, false);
  assert.equal(plan.scope.readOnly, true);
  assert(plan.summary.blocked >= 5);
  const immutable = plan.actions.find(
    (action) => action.id === "immutable-version",
  );
  assert.equal(
    immutable.resolvedInputs.RELEASE_VERSION.value,
    "20260629T1200-draft",
  );
  assert.equal(
    immutable.resolvedInputs.RELEASE_VERSION.source,
    "release-evidence.md",
  );
  assert.equal(
    immutable.prerequisiteChecks.find((item) => item.id === "RELEASE_VERSION")
      .kind,
    "evidence",
  );
  assert.equal(
    immutable.missingPrerequisites.some(
      (item) => item.id === "RELEASE_VERSION",
    ),
    false,
  );
  assert.match(
    immutable.missingPrerequisites.map((item) => item.id).join("\n"),
    /SERVER_IMAGE/,
  );
  assert.match(
    immutable.missingPrerequisites.map((item) => item.id).join("\n"),
    /MIGRATION_BEFORE/,
  );
  assert.equal(immutable.gateSummary.errorCount > 0, true);
  assert.match(
    immutable.gateSummary.sampleErrors.join("\n"),
    /release-evidence\.md|image-digests\.txt/,
  );
  assert.match(
    immutable.inputTemplateCommand,
    /immutable-version-evidence\.mjs .*--print-input-template/,
  );
  assert(
    immutable.operatorChecklist.some(
      (item) =>
        item.id === "SERVER_IMAGE_DIGEST" &&
        item.status === "missing" &&
        item.validation === "sha256:<64-hex>",
    ),
  );
  assert(
    immutable.operatorChecklist.some(
      (item) =>
        item.id === "RELEASE_VERSION" &&
        item.status === "resolved" &&
        item.source === "release-evidence.md",
    ),
  );
  const preflight = plan.actions.find(
    (action) => action.id === "production-preflight",
  );
  assert.equal(preflight.canRun, false);
  assert.equal(preflight.inputTemplateCommand, "");
  assert.equal(preflight.gateSummary.errorCount > 0, true);
  assert.match(
    preflight.commands.join("\n"),
    /production-preflight\.sh .*--runtime/,
  );
  assert.match(
    preflight.missingPrerequisites.map((item) => item.message).join("\n"),
    /env file is missing/,
  );
  const backup = plan.actions.find(
    (action) => action.id === "backup-restore-rehearsal",
  );
  assert.match(
    backup.missingPrerequisites.map((item) => item.id).join("\n"),
    /SOURCE_POSTGRES_DSN/,
  );
  assert.equal(
    backup.missingPrerequisites.some((item) => item.id === "RELEASE_VERSION"),
    false,
  );
  assert.equal(
    backup.resolvedInputs.RELEASE_VERSION.value,
    "20260629T1200-draft",
  );
});

test("closeout plan marks machine actions runnable when prerequisites are present", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "release-closeout-plan-ready-to-run-"),
  );
  const { evidenceDir } = writeDraftEvidence(root);
  writeToolScripts(root);
  const envFile = "server/deploy/compose/prod/.env";
  fs.mkdirSync(path.join(root, "server/deploy/compose/prod"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(root, envFile),
    "APP_IMAGE=registry.example.invalid/plush/server@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n",
  );

  const plan = buildReleaseEvidenceCloseoutPlan({
    repoRoot: root,
    evidenceDir,
    envFile,
    env: VALID_ENV,
  });

  assert.equal(plan.status.status, "draft");
  assert.equal(plan.summary.blocked, 0);
  assert.equal(plan.summary.runnable, 5);
  assert.equal(plan.summary.manualOnly, 1);
  assert.equal(
    plan.actions.find((action) => action.id === "production-preflight").canRun,
    true,
  );
  assert.equal(
    plan.actions.find((action) => action.id === "release-signoff").manualOnly,
    true,
  );
});

test("closeout plan requires target backend and token for customer config effective session", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "release-closeout-plan-config-"),
  );
  const { evidenceDir, absoluteDir } = writeDraftEvidence(root);
  fs.writeFileSync(
    path.join(absoluteDir, "customer-config-manifest-evidence.json"),
    JSON.stringify(
      {
        customerKey: "yoyoosun",
        revision: "yoyoosun-customer-package-v7.runtime-manifest-v1",
        manifestSha256:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
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

  const plan = buildReleaseEvidenceCloseoutPlan({
    repoRoot: root,
    evidenceDir,
    env: {
      ...VALID_ENV,
    },
  });

  const action = plan.actions.find(
    (item) => item.id === "customer-config-effective-session",
  );
  assert(action);
  assert.match(
    action.missingPrerequisites.map((item) => item.id).join("\n"),
    /SMOKE_BACKEND_URL/,
  );
  assert.match(
    action.missingPrerequisites.map((item) => item.id).join("\n"),
    /CUSTOMER_CONFIG_ADMIN_TOKEN/,
  );
});

test("closeout plan deduplicates missing prerequisites for composite actions", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "release-closeout-plan-dedupe-"),
  );
  const { evidenceDir, absoluteDir } = writeDraftEvidence(root);
  fs.writeFileSync(
    path.join(absoluteDir, "customer-config-manifest-evidence.json"),
    JSON.stringify(
      {
        customerKey: "yoyoosun",
        revision: "yoyoosun-customer-package-v7.runtime-manifest-v1",
        manifestSha256:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
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

  const plan = buildReleaseEvidenceCloseoutPlan({
    repoRoot: root,
    evidenceDir,
    env: {},
  });

  const action = plan.actions.find(
    (item) => item.id === "customer-config-effective-session",
  );
  assert(action);
  const missingIds = action.missingPrerequisites.map((item) => item.id);
  assert.deepEqual(missingIds, [...new Set(missingIds)]);
  assert.equal(missingIds.filter((id) => id === "RELEASE_VERSION").length, 0);
  assert.equal(
    missingIds.filter((id) => id === "RELEASE_ENVIRONMENT").length,
    1,
  );
  assert.equal(
    action.resolvedInputs.RELEASE_VERSION.value,
    "20260629T1200-draft",
  );
});

test("closeout plan reuses release batch fields from evidence across machine actions", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "release-closeout-plan-evidence-inputs-"),
  );
  const { evidenceDir, absoluteDir } = writeDraftEvidence(root);
  updateReleaseEvidenceField(absoluteDir, "environment", "customer-trial");
  writeToolScripts(root);

  const plan = buildReleaseEvidenceCloseoutPlan({
    repoRoot: root,
    evidenceDir,
    env: {
      SOURCE_POSTGRES_DSN: "postgres://release-source.example.invalid/plush",
      SMOKE_ENDPOINT: "https://erp.example.invalid",
      SMOKE_BACKEND_URL: "https://backend.example.invalid",
      CUSTOMER_CONFIG_ADMIN_TOKEN: "redacted-token",
      ROLLBACK_TARGET_RELEASE: "20260628T1200-previous",
      ROLLBACK_TRIGGER_SCENARIO: "smoke failed after activation",
    },
  });

  const backup = plan.actions.find(
    (action) => action.id === "backup-restore-rehearsal",
  );
  assert.equal(backup.canRun, true);
  assert.equal(
    backup.resolvedInputs.RELEASE_VERSION.source,
    "release-evidence.md",
  );

  const smoke = plan.actions.find((action) => action.id === "target-smoke");
  assert.equal(smoke.canRun, true);
  assert.equal(
    smoke.resolvedInputs.RELEASE_VERSION.source,
    "release-evidence.md",
  );
  assert.equal(
    smoke.resolvedInputs.RELEASE_ENVIRONMENT.value,
    "customer-trial",
  );

  const rollback = plan.actions.find(
    (action) => action.id === "rollback-forward-fix",
  );
  assert.equal(rollback.canRun, true);
  assert.equal(
    rollback.resolvedInputs.RELEASE_ENVIRONMENT.source,
    "release-evidence.md",
  );
});

test("closeout plan blocks smoke URLs that contain credentials", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "release-closeout-plan-url-"),
  );
  const { evidenceDir } = writeDraftEvidence(root);
  writeToolScripts(root);

  const plan = buildReleaseEvidenceCloseoutPlan({
    repoRoot: root,
    evidenceDir,
    env: {
      ...VALID_ENV,
      SMOKE_ENDPOINT: "https://release:secret@erp.example.invalid",
    },
  });

  const action = plan.actions.find((item) => item.id === "target-smoke");
  assert(action);
  assert.equal(action.canRun, false);
  assert.match(
    action.missingPrerequisites.map((item) => item.id).join("\n"),
    /SMOKE_ENDPOINT/,
  );
});

test("closeout plan CLI JSON can fail on blocked prerequisites", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "release-closeout-plan-cli-"),
  );
  const { evidenceDir } = writeDraftEvidence(root);

  const result = runPlan({
    cwd: root,
    args: ["--evidence-dir", evidenceDir, "--json", "--fail-on-blocked"],
  });

  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status.status, "draft");
  assert(payload.summary.blocked > 0);
  assert.equal(payload.scope.readOnly, true);
  assert.equal(
    Array.isArray(payload.actions[0].gateSummary.sampleErrors),
    true,
  );
  assert.equal(payload.actions[0].gateSummary.errorCount > 0, true);
  assert.match(
    payload.actions.find((action) => action.id === "immutable-version")
      .inputTemplateCommand,
    /immutable-version-evidence\.mjs .*--print-input-template/,
  );
});

test("closeout plan text output includes gate summary for present unverified actions", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "release-closeout-plan-text-"),
  );
  const { evidenceDir } = writeDraftEvidence(root);

  const result = runPlan({
    cwd: root,
    args: ["--evidence-dir", evidenceDir],
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /gate: errors=\d+, warnings=\d+/);
  assert.match(result.stdout, /gate error: /);
  assert.match(
    result.stdout,
    /input template: node scripts\/deploy\/immutable-version-evidence\.mjs .*--print-input-template/,
  );
  assert.match(
    result.stdout,
    /operator input: RELEASE_ENVIRONMENT -> approved target environment name/,
  );
});
