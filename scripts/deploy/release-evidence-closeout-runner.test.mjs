import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildCloseoutRunPlan,
  parseCliArgs,
  runCloseoutActions,
} from "./release-evidence-closeout-runner.mjs";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const scriptPath = path.join(repoRoot, "scripts/deploy/release-evidence-closeout-runner.mjs");
const collectEvidencePath = path.join(repoRoot, "deployments/yoyoosun/scripts/collect-evidence.sh");

const VALID_ENV = {
  RELEASE_CLOSEOUT_CONFIRM: "RUN_YOOSUN_RELEASE_CLOSEOUT_INVALID",
  RELEASE_VERSION: "20260629T1200-draft",
  RELEASE_ENVIRONMENT: "customer-trial",
  OPERATOR_ROLE: "release-operator",
  GIT_COMMIT: "6da29ddcde7b",
  SERVER_IMAGE: "registry.example.invalid/plush/server:20260629T1200",
  SERVER_IMAGE_DIGEST: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  WEB_IMAGE: "registry.example.invalid/plush/web:20260629T1200",
  WEB_IMAGE_DIGEST: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  MIGRATION_BEFORE: "20260601000000",
  MIGRATION_AFTER: "20260628123354",
  BACKUP_ID: "backup-20260629T1200",
  SOURCE_POSTGRES_DSN: "postgres://release-source.example.invalid/plush",
  SMOKE_ENDPOINT: "https://erp.example.invalid",
  ROLLBACK_TARGET_RELEASE: "20260628T1200-previous",
  ROLLBACK_TRIGGER_SCENARIO: "smoke failed after activation",
};

function writeDraftEvidence() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-closeout-runner-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-29");
  const result = spawnSync(
    "bash",
    [
      collectEvidencePath,
      "--release-version",
      "20260629T1200-draft",
      "--output",
      evidenceDir,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return { root, evidenceDir };
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

function writeCustomerConfigManifestEvidence(evidenceDir) {
  fs.writeFileSync(
    path.join(evidenceDir, "customer-config-manifest-evidence.json"),
    JSON.stringify(
      {
        customerKey: "yoyoosun",
        revision: "yoyoosun-customer-package-v7.runtime-manifest-v1",
        manifestSha256: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
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

function runCli(args = [], env = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    env: {
      PATH: process.env.PATH,
      ...env,
    },
    encoding: "utf8",
  });
}

test("parseCliArgs supports runner options", () => {
  assert.deepEqual(parseCliArgs([
    "--evidence-dir",
    "deployments/yoyoosun/evidence/releases/2026-06-29",
    "--runtime-env-file",
    "server/deploy/compose/prod/.env",
    "--only",
    "immutable-version,target-smoke",
    "--json",
    "--execute",
  ]), {
    customer: "yoyoosun",
    envFile: "server/deploy/compose/prod/.env",
    evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-29",
    execute: true,
    json: true,
    only: ["immutable-version", "target-smoke"],
    reportPath: "",
  });
});

test("closeout runner report-only materializes commands without writing evidence", () => {
  const { evidenceDir } = writeDraftEvidence();
  const report = runCloseoutActions({
    repoRoot,
    evidenceDir,
    only: ["immutable-version"],
    env: VALID_ENV,
    execute: false,
  });

  assert.equal(report.ok, true);
  assert.equal(report.executed, false);
  assert.equal(report.plan.executeReady, true);
  assert.equal(report.plan.actions[0].commands.length, 1);
  assert.match(
    report.plan.actions[0].inputTemplateCommand,
    /immutable-version-evidence\.mjs .*--print-input-template/,
  );
  assert(
    report.plan.actions[0].operatorChecklist.some(
      (item) =>
        item.id === "SERVER_IMAGE_DIGEST" &&
        item.status === "resolved" &&
        item.validation === "sha256:<64-hex>",
    ),
  );
  assert.match(report.plan.actions[0].commands[0].displayCommand, /immutable-version-evidence\.mjs/);
  assert.equal(report.plan.actions[0].resolvedInputs.RELEASE_VERSION.value, VALID_ENV.RELEASE_VERSION);
  assert.equal(report.plan.actions[0].resolvedInputs.RELEASE_VERSION.source, "env");
  assert.equal("env" in report.plan.actions[0].commands[0], false);
  assert.equal(fs.existsSync(path.join(evidenceDir, "image-digests.txt")), true);
  assert.match(
    fs.readFileSync(path.join(evidenceDir, "image-digests.txt"), "utf8"),
    /待填写/,
  );
});

test("closeout runner writes sanitized report without raw env or command output", () => {
  const { root, evidenceDir } = writeDraftEvidence();
  const reportPath = path.join(root, "closeout-runner-report.json");
  const report = runCloseoutActions({
    repoRoot,
    evidenceDir,
    only: ["immutable-version"],
    env: VALID_ENV,
    execute: false,
    reportPath,
  });

  assert.equal(report.ok, true);
  assert.equal(fs.existsSync(reportPath), true);
  const content = fs.readFileSync(reportPath, "utf8");
  assert.doesNotMatch(content, /SOURCE_POSTGRES_DSN/);
  assert.doesNotMatch(content, /CUSTOMER_CONFIG_ADMIN_TOKEN/);
  assert.doesNotMatch(content, /postgres:\/\/release-source/);
  const payload = JSON.parse(content);
  assert.equal(payload.executed, false);
  assert.equal(payload.generatedAt.length > 0, true);
  assert.equal("stdout" in payload.results, false);
  assert.equal(payload.plan.actions[0].resolvedInputs.RELEASE_VERSION.value, VALID_ENV.RELEASE_VERSION);
  assert.equal(payload.plan.actions[0].resolvedInputs.SERVER_IMAGE_DIGEST.value, VALID_ENV.SERVER_IMAGE_DIGEST);
  assert.match(
    payload.plan.actions[0].inputTemplateCommand,
    /immutable-version-evidence\.mjs .*--print-input-template/,
  );
  assert(
    payload.plan.actions[0].operatorChecklist.some(
      (item) =>
        item.id === "SERVER_IMAGE" &&
        item.status === "resolved" &&
        item.evidenceTarget.includes("release-evidence.md"),
    ),
  );
  assert.equal(payload.plan.actions[0].commands[0].displayCommand.includes("immutable-version-evidence.mjs"), true);
});

test("closeout runner report-only keeps secret env values out of sanitized reports", () => {
  const { root, evidenceDir } = writeDraftEvidence();
  const reportPath = path.join(root, "backup-restore-runner-report.json");
  const report = runCloseoutActions({
    repoRoot,
    evidenceDir,
    only: ["backup-restore-rehearsal"],
    env: {
      RELEASE_VERSION: VALID_ENV.RELEASE_VERSION,
      SOURCE_POSTGRES_DSN: "postgres://release-user:secret-password@release-source.example.invalid/plush",
    },
    execute: false,
    reportPath,
  });

  assert.equal(report.ok, true);
  assert.equal(report.executed, false);
  assert.equal(fs.existsSync(reportPath), true);
  const content = fs.readFileSync(reportPath, "utf8");
  assert.match(content, /SOURCE_POSTGRES_DSN=<redacted>/);
  assert.doesNotMatch(content, /secret-password/);
  assert.doesNotMatch(content, /postgres:\/\/release-user/);
  const payload = JSON.parse(content);
  assert.equal(payload.plan.executeReady, true);
  assert.deepEqual(payload.plan.actions[0].commands[0].envKeys, [
    "SOURCE_POSTGRES_DSN",
  ]);
  assert.equal("stdout" in payload.results, false);
});

test("closeout runner report-only keeps target smoke report sanitized", () => {
  const { root, evidenceDir } = writeDraftEvidence();
  const reportPath = path.join(root, "target-smoke-runner-report.json");
  const report = runCloseoutActions({
    repoRoot,
    evidenceDir,
    only: ["target-smoke"],
    env: {
      ...VALID_ENV,
      CUSTOMER_CONFIG_ADMIN_TOKEN: "target-admin-token-secret",
      SOURCE_POSTGRES_DSN:
        "postgres://release-user:secret-password@release-source.example.invalid/plush",
    },
    execute: false,
    reportPath,
  });

  assert.equal(report.ok, true);
  assert.equal(report.executed, false);
  assert.equal(fs.existsSync(reportPath), true);
  const content = fs.readFileSync(reportPath, "utf8");
  assert.doesNotMatch(content, /target-admin-token-secret/);
  assert.doesNotMatch(content, /secret-password/);
  assert.doesNotMatch(content, /postgres:\/\/release-user/);
  assert.doesNotMatch(content, /https?:\/\/[^/\s"]+:[^@\s"]+@/);
  const payload = JSON.parse(content);
  assert.equal(payload.executed, false);
  assert.equal(payload.results.length, 0);
  assert.equal(payload.plan.executeReady, true);
  assert.equal(payload.plan.actions[0].commands[0].envKeys.length, 0);
  assert.match(
    payload.plan.actions[0].commands[0].displayCommand,
    /run-smoke\.sh .*--endpoint https:\/\/erp\.example\.invalid/,
  );
});

test("closeout runner report-only keeps customer config smoke token sanitized", () => {
  const { root, evidenceDir } = writeDraftEvidence();
  writeCustomerConfigManifestEvidence(evidenceDir);
  const reportPath = path.join(root, "customer-config-smoke-runner-report.json");
  const report = runCloseoutActions({
    repoRoot,
    evidenceDir,
    only: ["customer-config-effective-session"],
    env: {
      ...VALID_ENV,
      SMOKE_BACKEND_URL: "https://backend.example.invalid",
      CUSTOMER_CONFIG_ADMIN_TOKEN: "target-admin-token-secret",
    },
    execute: false,
    reportPath,
  });

  assert.equal(report.ok, true);
  assert.equal(report.executed, false);
  assert.equal(fs.existsSync(reportPath), true);
  const content = fs.readFileSync(reportPath, "utf8");
  assert.doesNotMatch(content, /target-admin-token-secret/);
  assert.doesNotMatch(content, /https?:\/\/[^/\s"]+:[^@\s"]+@/);
  assert.match(content, /CUSTOMER_CONFIG_ADMIN_TOKEN=<redacted>/);
  const payload = JSON.parse(content);
  assert.equal(payload.executed, false);
  assert.equal(payload.results.length, 0);
  assert.equal(payload.plan.executeReady, true);
  assert.equal(payload.plan.actions[0].id, "customer-config-effective-session");
  const smokeCommand = payload.plan.actions[0].commands.find((command) =>
    command.displayCommand.includes("run-smoke.sh"),
  );
  assert(smokeCommand);
  assert.deepEqual(smokeCommand.envKeys, ["CUSTOMER_CONFIG_ADMIN_TOKEN"]);
  assert.match(smokeCommand.displayCommand, /CUSTOMER_CONFIG_ADMIN_TOKEN=<redacted>/);
  assert.match(smokeCommand.displayCommand, /--backend-url https:\/\/backend\.example\.invalid/);
  assert.match(
    smokeCommand.displayCommand,
    /--customer-config-revision yoyoosun-customer-package-v7\.runtime-manifest-v1/,
  );
});

test("closeout runner refuses report paths inside deployments evidence tree", () => {
  const { root, evidenceDir } = writeDraftEvidence();
  assert.throws(
    () =>
      runCloseoutActions({
        repoRoot,
        evidenceDir,
        only: ["immutable-version"],
        env: VALID_ENV,
        execute: false,
        reportPath: path.join(evidenceDir, "closeout-runner-report.json"),
      }),
    /--report must be outside deployments evidence directories/,
  );
  assert.throws(
    () =>
      runCloseoutActions({
        repoRoot,
        evidenceDir,
        only: ["immutable-version"],
        env: VALID_ENV,
        execute: false,
        reportPath: path.join(root, "deployments/yoyoosun/evidence/closeout-runner-report.json"),
      }),
    /--report must be outside deployments evidence directories/,
  );
});

test("closeout runner execute requires explicit confirmation phrase", () => {
  const { evidenceDir } = writeDraftEvidence();
  assert.throws(
    () =>
      runCloseoutActions({
        repoRoot,
        evidenceDir,
        only: ["immutable-version"],
        env: VALID_ENV,
        execute: true,
      }),
    /RELEASE_CLOSEOUT_CONFIRM must be RUN_YOYOOSUN_RELEASE_CLOSEOUT/,
  );
});

test("closeout runner CLI execute requires explicit confirmation phrase", () => {
  const { evidenceDir } = writeDraftEvidence();
  const imageDigestsPath = path.join(evidenceDir, "image-digests.txt");
  const beforeImageDigests = fs.readFileSync(imageDigestsPath, "utf8");
  const envWithoutConfirm = { ...VALID_ENV };
  delete envWithoutConfirm.RELEASE_CLOSEOUT_CONFIRM;
  const result = runCli([
    "--evidence-dir",
    evidenceDir,
    "--only",
    "immutable-version",
    "--execute",
    "--json",
  ], envWithoutConfirm);

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.match(
    payload.error,
    /RELEASE_CLOSEOUT_CONFIRM must be RUN_YOYOOSUN_RELEASE_CLOSEOUT/,
  );
  assert.equal(result.stderr, "");
  assert.equal(
    fs.readFileSync(imageDigestsPath, "utf8"),
    beforeImageDigests,
  );
});

test("closeout runner reuses evidence-backed release fields for later actions", () => {
  const { evidenceDir } = writeDraftEvidence();
  updateReleaseEvidenceField(evidenceDir, "environment", "customer-trial");
  const {
    RELEASE_VERSION,
    RELEASE_ENVIRONMENT,
    ...envWithoutReleaseBatch
  } = VALID_ENV;

  const plan = buildCloseoutRunPlan({
    repoRoot,
    evidenceDir,
    only: ["target-smoke"],
    env: envWithoutReleaseBatch,
  });

  assert.equal(plan.executeReady, true);
  assert.equal(plan.actions[0].canRun, true);
  assert.equal(plan.actions[0].resolvedInputs.RELEASE_VERSION.source, "release-evidence.md");
  assert.equal(plan.actions[0].resolvedInputs.RELEASE_ENVIRONMENT.source, "release-evidence.md");
  assert.match(
    plan.actions[0].commands[0].displayCommand,
    /--release-version 20260629T1200-draft --environment customer-trial/,
  );
  assert.equal(plan.actions[0].commands[0].envKeys.includes("RELEASE_VERSION"), false);
  assert.equal(plan.actions[0].commands[0].envKeys.includes("RELEASE_ENVIRONMENT"), false);
});

test("closeout runner executes only selected runnable action", () => {
  const { evidenceDir } = writeDraftEvidence();
  const {
    RELEASE_VERSION,
    GIT_COMMIT,
    ...envWithoutEvidenceBackedInputs
  } = VALID_ENV;
  const report = runCloseoutActions({
    repoRoot,
    evidenceDir,
    only: ["immutable-version"],
    env: {
      ...envWithoutEvidenceBackedInputs,
      RELEASE_CLOSEOUT_CONFIRM: "RUN_YOYOOSUN_RELEASE_CLOSEOUT",
    },
    execute: true,
  });

  assert.equal(report.ok, true);
  assert.equal(report.executed, true);
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].actionId, "immutable-version");
  assert.equal(report.results[0].exitCode, 0);
  assert.equal("stdout" in report.results[0], false);
  assert.equal("stderr" in report.results[0], false);
  assert.equal(report.results[0].stdoutLineCount >= 0, true);
  assert.equal(fs.readFileSync(path.join(evidenceDir, "image-digests.txt"), "utf8"), [
    "serverImage=registry.example.invalid/plush/server:20260629T1200",
    `serverImageDigest=${VALID_ENV.SERVER_IMAGE_DIGEST}`,
    "webImage=registry.example.invalid/plush/web:20260629T1200",
    `webImageDigest=${VALID_ENV.WEB_IMAGE_DIGEST}`,
    "",
  ].join("\n"));
  const releaseEvidence = fs.readFileSync(path.join(evidenceDir, "release-evidence.md"), "utf8");
  assert.match(releaseEvidence, /\| releaseVersion \| 20260629T1200-draft \|/);
  assert.match(releaseEvidence, /\| environment \| customer-trial \|/);
  assert.match(releaseEvidence, /\| migrationBefore \| 20260601000000 \|/);
  assert.match(releaseEvidence, /\| backupId \| backup-20260629T1200 \|/);
});

test("closeout runner CLI execute writes sanitized success report", () => {
  const { root, evidenceDir } = writeDraftEvidence();
  const reportPath = path.join(root, "immutable-version-execute-runner-report.json");
  const {
    RELEASE_VERSION,
    GIT_COMMIT,
    ...envWithoutEvidenceBackedInputs
  } = VALID_ENV;
  const result = runCli([
    "--evidence-dir",
    evidenceDir,
    "--only",
    "immutable-version",
    "--execute",
    "--report",
    reportPath,
    "--json",
  ], {
    ...envWithoutEvidenceBackedInputs,
    RELEASE_CLOSEOUT_CONFIRM: "RUN_YOYOOSUN_RELEASE_CLOSEOUT",
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.stderr, "");
  assert.equal(fs.existsSync(reportPath), true);
  assert.doesNotMatch(result.stdout, /RELEASE_CLOSEOUT_CONFIRM/);
  const stdoutPayload = JSON.parse(result.stdout);
  assert.equal(stdoutPayload.ok, true);
  assert.equal(stdoutPayload.executed, true);
  assert.equal(
    stdoutPayload.plan.scope.requiresConfirm,
    "RUN_YOYOOSUN_RELEASE_CLOSEOUT",
  );
  assert.equal(stdoutPayload.results.length, 1);
  assert.equal(stdoutPayload.results[0].actionId, "immutable-version");
  assert.equal(stdoutPayload.results[0].exitCode, 0);
  assert.equal("stdout" in stdoutPayload.results[0], false);
  assert.equal("stderr" in stdoutPayload.results[0], false);

  const content = fs.readFileSync(reportPath, "utf8");
  assert.doesNotMatch(content, /RELEASE_CLOSEOUT_CONFIRM/);
  const filePayload = JSON.parse(content);
  assert.equal(typeof filePayload.generatedAt, "string");
  assert.equal(filePayload.ok, true);
  assert.equal(filePayload.executed, true);
  assert.equal(
    filePayload.plan.scope.requiresConfirm,
    "RUN_YOYOOSUN_RELEASE_CLOSEOUT",
  );
  assert.equal(filePayload.results.length, 1);
  assert.equal(filePayload.results[0].actionId, "immutable-version");
  assert.equal(filePayload.results[0].exitCode, 0);
  assert.equal("stdout" in filePayload.results[0], false);
  assert.equal("stderr" in filePayload.results[0], false);
  assert.equal(filePayload.results[0].stdoutLineCount >= 0, true);
  assert.equal(filePayload.results[0].stderrLineCount >= 0, true);
  assert.equal(filePayload.plan.actions[0].commands[0].envKeys.length, 0);
});

test("closeout runner refuses smoke URLs with embedded credentials", () => {
  const { evidenceDir } = writeDraftEvidence();
  const plan = buildCloseoutRunPlan({
    repoRoot,
    evidenceDir,
    only: ["target-smoke"],
    env: {
      ...VALID_ENV,
      SMOKE_ENDPOINT: "https://deploy:secret@erp.example.invalid",
    },
  });

  assert.equal(plan.actions[0].id, "target-smoke");
  assert.equal(plan.actions[0].canRun, false);
  assert.match(plan.actions[0].missingPrerequisites.map((item) => item.id).join("\n"), /SMOKE_ENDPOINT/);
  const result = runCli([
    "--evidence-dir",
    evidenceDir,
    "--only",
    "target-smoke",
    "--json",
  ], {
    ...VALID_ENV,
    SMOKE_ENDPOINT: "https://deploy:secret@erp.example.invalid",
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.plan.executeReady, false);
  assert.match(payload.plan.actions[0].missingPrerequisites.map((item) => item.id).join("\n"), /SMOKE_ENDPOINT/);
});

test("closeout runner refuses customer config smoke backend URLs with embedded credentials", () => {
  const { evidenceDir } = writeDraftEvidence();
  writeCustomerConfigManifestEvidence(evidenceDir);
  const plan = buildCloseoutRunPlan({
    repoRoot,
    evidenceDir,
    only: ["customer-config-effective-session"],
    env: {
      ...VALID_ENV,
      SMOKE_BACKEND_URL: "https://deploy:secret@backend.example.invalid",
    },
  });

  assert.equal(plan.actions[0].id, "customer-config-effective-session");
  assert.equal(plan.actions[0].canRun, false);
  assert.match(
    plan.actions[0].missingPrerequisites.map((item) => item.id).join("\n"),
    /SMOKE_BACKEND_URL/,
  );

  const result = runCli([
    "--evidence-dir",
    evidenceDir,
    "--only",
    "customer-config-effective-session",
    "--json",
  ], {
    ...VALID_ENV,
    SMOKE_BACKEND_URL: "https://deploy:secret@backend.example.invalid",
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.plan.executeReady, false);
  assert.match(payload.plan.actions[0].missingPrerequisites.map((item) => item.id).join("\n"), /SMOKE_BACKEND_URL/);
});

test("closeout runner refuses selected blocked actions", () => {
  const { evidenceDir } = writeDraftEvidence();
  assert.throws(
    () =>
      runCloseoutActions({
        repoRoot,
        evidenceDir,
        only: ["production-preflight"],
        env: {
          ...VALID_ENV,
          RELEASE_CLOSEOUT_CONFIRM: "RUN_YOYOOSUN_RELEASE_CLOSEOUT",
        },
        execute: true,
      }),
    /selected closeout actions are not all runnable/,
  );
});

test("closeout runner execute all actions refuses partial evidence writes", () => {
  const { evidenceDir } = writeDraftEvidence();
  const imageDigestsPath = path.join(evidenceDir, "image-digests.txt");
  const releaseEvidencePath = path.join(evidenceDir, "release-evidence.md");
  const beforeImageDigests = fs.readFileSync(imageDigestsPath, "utf8");
  const beforeReleaseEvidence = fs.readFileSync(releaseEvidencePath, "utf8");

  assert.throws(
    () =>
      runCloseoutActions({
        repoRoot,
        evidenceDir,
        env: {
          ...VALID_ENV,
          RELEASE_CLOSEOUT_CONFIRM: "RUN_YOYOOSUN_RELEASE_CLOSEOUT",
        },
        execute: true,
      }),
    /selected closeout actions are not all runnable/,
  );

  assert.equal(fs.readFileSync(imageDigestsPath, "utf8"), beforeImageDigests);
  assert.equal(fs.readFileSync(releaseEvidencePath, "utf8"), beforeReleaseEvidence);
});

test("closeout runner keeps release signoff manual and non-executable", () => {
  const { evidenceDir } = writeDraftEvidence();
  const plan = buildCloseoutRunPlan({
    repoRoot,
    evidenceDir,
    only: ["release-signoff"],
    env: VALID_ENV,
  });

  assert.equal(plan.executeReady, false);
  assert.equal(plan.actions.length, 1);
  assert.equal(plan.actions[0].id, "release-signoff");
  assert.equal(plan.actions[0].manualOnly, true);
  assert.equal(plan.actions[0].canRun, false);
  assert.deepEqual(plan.actions[0].commands, []);
  assert.deepEqual(plan.actions[0].executionCommands, []);
  assert(
    plan.actions[0].missingPrerequisites.some(
      (item) => item.id === "manual-release-signoff",
    ),
  );
  assert.equal(plan.scope.doesNotExecuteManualSignoff, true);
});

test("closeout runner CLI refuses selected blocked actions", () => {
  const { root, evidenceDir } = writeDraftEvidence();
  const reportPath = path.join(root, "blocked-action-runner-report.json");
  const result = runCli([
    "--evidence-dir",
    evidenceDir,
    "--only",
    "production-preflight",
    "--execute",
    "--report",
    reportPath,
    "--json",
  ], {
    RELEASE_CLOSEOUT_CONFIRM: "RUN_YOYOOSUN_RELEASE_CLOSEOUT",
  });

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.match(payload.error, /selected closeout actions are not all runnable/);
  assert.equal(result.stderr, "");
  assert.equal(fs.existsSync(reportPath), false);
});

test("closeout runner CLI execute all actions refuses partial writes and report", () => {
  const { root, evidenceDir } = writeDraftEvidence();
  const imageDigestsPath = path.join(evidenceDir, "image-digests.txt");
  const releaseEvidencePath = path.join(evidenceDir, "release-evidence.md");
  const reportPath = path.join(root, "all-actions-runner-report.json");
  const beforeImageDigests = fs.readFileSync(imageDigestsPath, "utf8");
  const beforeReleaseEvidence = fs.readFileSync(releaseEvidencePath, "utf8");

  const result = runCli([
    "--evidence-dir",
    evidenceDir,
    "--execute",
    "--report",
    reportPath,
    "--json",
  ], {
    ...VALID_ENV,
    RELEASE_CLOSEOUT_CONFIRM: "RUN_YOYOOSUN_RELEASE_CLOSEOUT",
  });

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.match(payload.error, /selected closeout actions are not all runnable/);
  assert.equal(result.stderr, "");
  assert.equal(fs.existsSync(reportPath), false);
  assert.equal(fs.readFileSync(imageDigestsPath, "utf8"), beforeImageDigests);
  assert.equal(fs.readFileSync(releaseEvidencePath, "utf8"), beforeReleaseEvidence);
});

test("closeout runner CLI refuses manual release signoff execution without writing report", () => {
  const { root, evidenceDir } = writeDraftEvidence();
  const reportPath = path.join(root, "manual-signoff-runner-report.json");
  const result = runCli([
    "--evidence-dir",
    evidenceDir,
    "--only",
    "release-signoff",
    "--execute",
    "--report",
    reportPath,
    "--json",
  ], {
    RELEASE_CLOSEOUT_CONFIRM: "RUN_YOYOOSUN_RELEASE_CLOSEOUT",
  });

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.match(payload.error, /selected closeout actions are not all runnable/);
  assert.equal(result.stderr, "");
  assert.equal(fs.existsSync(reportPath), false);
});

test("closeout runner CLI JSON stays report-only by default", () => {
  const { evidenceDir } = writeDraftEvidence();
  const result = runCli([
    "--evidence-dir",
    evidenceDir,
    "--only",
    "immutable-version",
    "--json",
  ], VALID_ENV);

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.executed, false);
  assert.equal(payload.plan.scope.reportOnlyByDefault, true);
  assert.match(
    payload.plan.actions[0].inputTemplateCommand,
    /immutable-version-evidence\.mjs .*--print-input-template/,
  );
  assert(
    payload.plan.actions[0].operatorChecklist.some(
      (item) => item.id === "SERVER_IMAGE_DIGEST" && item.status === "resolved",
    ),
  );
});

test("closeout runner CLI report writes sanitized JSON report", () => {
  const { root, evidenceDir } = writeDraftEvidence();
  const reportPath = path.join(root, "cli-backup-restore-runner-report.json");
  const result = runCli([
    "--evidence-dir",
    evidenceDir,
    "--only",
    "backup-restore-rehearsal",
    "--report",
    reportPath,
    "--json",
  ], {
    RELEASE_VERSION: VALID_ENV.RELEASE_VERSION,
    SOURCE_POSTGRES_DSN:
      "postgres://release-user:secret-password@release-source.example.invalid/plush",
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(fs.existsSync(reportPath), true);
  assert.doesNotMatch(result.stdout, /secret-password/);
  assert.doesNotMatch(result.stdout, /postgres:\/\/release-user/);
  assert.match(result.stdout, /SOURCE_POSTGRES_DSN=<redacted>/);
  const stdoutPayload = JSON.parse(result.stdout);
  assert.equal(stdoutPayload.executed, false);
  assert.equal(stdoutPayload.results.length, 0);

  const content = fs.readFileSync(reportPath, "utf8");
  assert.doesNotMatch(content, /secret-password/);
  assert.doesNotMatch(content, /postgres:\/\/release-user/);
  assert.match(content, /SOURCE_POSTGRES_DSN=<redacted>/);
  const filePayload = JSON.parse(content);
  assert.equal(filePayload.executed, false);
  assert.equal(filePayload.results.length, 0);
  assert.equal(filePayload.plan.actions[0].id, "backup-restore-rehearsal");
  assert.deepEqual(filePayload.plan.actions[0].commands[0].envKeys, [
    "SOURCE_POSTGRES_DSN",
  ]);
});

test("closeout runner CLI refuses report paths inside deployments evidence tree", () => {
  const { root, evidenceDir } = writeDraftEvidence();
  const reportPath = path.join(
    root,
    "deployments/yoyoosun/evidence/cli-closeout-runner-report.json",
  );
  const result = runCli([
    "--evidence-dir",
    evidenceDir,
    "--only",
    "immutable-version",
    "--report",
    reportPath,
    "--json",
  ], VALID_ENV);

  assert.equal(result.status, 2);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.match(
    payload.error,
    /--report must be outside deployments evidence directories/,
  );
  assert.equal(result.stderr, "");
  assert.equal(fs.existsSync(reportPath), false);
});

test("closeout runner CLI rejects unknown action ids without writing report", () => {
  const { root, evidenceDir } = writeDraftEvidence();
  const reportPath = path.join(root, "unknown-action-runner-report.json");
  const result = runCli([
    "--evidence-dir",
    evidenceDir,
    "--only",
    "not-a-closeout-action",
    "--execute",
    "--report",
    reportPath,
    "--json",
  ], {
    RELEASE_CLOSEOUT_CONFIRM: "RUN_YOYOOSUN_RELEASE_CLOSEOUT",
  });

  assert.equal(result.status, 2);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.match(
    payload.error,
    /Unknown or not-needed action id\(s\): not-a-closeout-action/,
  );
  assert.equal(result.stderr, "");
  assert.equal(fs.existsSync(reportPath), false);
});

test("closeout runner text output includes input template for immutable version", () => {
  const { evidenceDir } = writeDraftEvidence();
  const result = runCli([
    "--evidence-dir",
    evidenceDir,
    "--only",
    "immutable-version",
  ], {});

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(
    result.stdout,
    /input template: node scripts\/deploy\/immutable-version-evidence\.mjs .*--print-input-template/,
  );
  assert.match(
    result.stdout,
    /operator input: RELEASE_ENVIRONMENT -> approved target environment name/,
  );
});

test("buildCloseoutRunPlan rejects unknown action ids", () => {
  const { evidenceDir } = writeDraftEvidence();
  assert.throws(
    () =>
      buildCloseoutRunPlan({
        repoRoot,
        evidenceDir,
        only: ["not-a-closeout-action"],
        env: VALID_ENV,
      }),
    /Unknown or not-needed action id/,
  );
});
