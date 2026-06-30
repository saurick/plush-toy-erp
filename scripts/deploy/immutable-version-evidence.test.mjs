import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyImmutableVersionEvidenceToMarkdown,
  buildImmutableVersionEvidence,
  buildImmutableVersionInputTemplate,
  formatImmutableVersionInputTemplate,
  parseCliArgs,
  writeImmutableVersionEvidence,
} from "./immutable-version-evidence.mjs";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const scriptPath = path.join(repoRoot, "scripts/deploy/immutable-version-evidence.mjs");
const collectEvidencePath = path.join(repoRoot, "deployments/yoyoosun/scripts/collect-evidence.sh");

const VALID_INPUT = {
  releaseVersion: "20260629T1200-yoyoosun",
  environment: "customer-trial",
  operatorRole: "release-operator",
  gitCommit: "6da29ddcde7b",
  serverImage: "registry.example.invalid/plush/server:20260629T1200",
  serverDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  webImage: "registry.example.invalid/plush/web:20260629T1200",
  webDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  migrationBefore: "20260601000000",
  migrationAfter: "20260628123354",
  backupId: "backup-20260629T1200",
};

function writeDraftEvidence(root) {
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-29";
  const absoluteDir = path.join(root, evidenceDir);
  const result = spawnSync(
    "bash",
    [
      collectEvidencePath,
      "--release-version",
      "20260629T0802-draft",
      "--output",
      absoluteDir,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return { evidenceDir, absoluteDir };
}

function runCli({ cwd, args = [] }) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    env: { PATH: process.env.PATH },
    encoding: "utf8",
  });
}

function cliArgs(input = VALID_INPUT) {
  return [
    "--release-version",
    input.releaseVersion,
    "--environment",
    input.environment,
    "--operator-role",
    input.operatorRole,
    "--git-commit",
    input.gitCommit,
    "--server-image",
    input.serverImage,
    "--server-digest",
    input.serverDigest,
    "--web-image",
    input.webImage,
    "--web-digest",
    input.webDigest,
    "--migration-before",
    input.migrationBefore,
    "--migration-after",
    input.migrationAfter,
    "--backup-id",
    input.backupId,
  ];
}

test("parseCliArgs supports immutable version options", () => {
  assert.deepEqual(parseCliArgs([
    "--evidence-dir",
    "deployments/yoyoosun/evidence/releases/2026-06-29",
    ...cliArgs(),
  ]), {
    help: false,
    printInputTemplate: false,
    evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-29",
    ...VALID_INPUT,
  });
  assert.deepEqual(parseCliArgs([
    "--evidence-dir",
    "deployments/yoyoosun/evidence/releases/2026-06-29",
    "--print-input-template",
  ]), {
    help: false,
    printInputTemplate: true,
    evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-29",
  });
});

test("immutable version input template is read-only and complete", () => {
  const template = buildImmutableVersionInputTemplate({
    evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-29",
  });
  const formatted = formatImmutableVersionInputTemplate(template);

  assert.equal(
    template.evidenceDir,
    "deployments/yoyoosun/evidence/releases/2026-06-29",
  );
  assert(
    template.env.some(
      (item) =>
        item.envKey === "SERVER_IMAGE_DIGEST" &&
        item.placeholder === "sha256:<64-hex>",
    ),
  );
  assert.match(
    template.command,
    /--server-digest "\$SERVER_IMAGE_DIGEST"/,
  );
  assert.match(
    formatted,
    /RELEASE_ENVIRONMENT='<target-environment>'/,
  );
  assert.deepEqual(
    template.env.map((item) => item.envKey),
    [
      "RELEASE_VERSION",
      "RELEASE_ENVIRONMENT",
      "OPERATOR_ROLE",
      "GIT_COMMIT",
      "SERVER_IMAGE",
      "SERVER_IMAGE_DIGEST",
      "WEB_IMAGE",
      "WEB_IMAGE_DIGEST",
      "MIGRATION_BEFORE",
      "MIGRATION_AFTER",
      "BACKUP_ID",
    ],
  );
  assert.doesNotMatch(formatted, /RELEASE_CLOSEOUT_CONFIRM/);
  assert.doesNotMatch(formatted, /SOURCE_POSTGRES_DSN/);
  assert.doesNotMatch(formatted, /SMOKE_(ENDPOINT|BACKEND_URL)/);
  assert.doesNotMatch(formatted, /CUSTOMER_CONFIG_ADMIN_TOKEN/);
  assert.match(formatted, /Does not: build images, inspect registries/);
});

test("buildImmutableVersionEvidence validates release fields and image digests", () => {
  const evidence = buildImmutableVersionEvidence({
    evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-29",
    ...VALID_INPUT,
  });

  assert.equal(evidence.releaseVersion, VALID_INPUT.releaseVersion);
  assert.equal(evidence.environment, VALID_INPUT.environment);
  assert.equal(evidence.serverImageDigest, VALID_INPUT.serverDigest);
  assert.equal(evidence.webImageDigest, VALID_INPUT.webDigest);
});

test("buildImmutableVersionEvidence rejects placeholder and invalid migration versions", () => {
  assert.throws(
    () =>
      buildImmutableVersionEvidence({
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-29",
        ...VALID_INPUT,
        environment: "待填写",
      }),
    /--environment must be a real value/,
  );
  assert.throws(
    () =>
      buildImmutableVersionEvidence({
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-29",
        ...VALID_INPUT,
        migrationAfter: "latest",
      }),
    /--migration-after must be a 14-digit Atlas migration version/,
  );
});

test("applyImmutableVersionEvidenceToMarkdown updates only the first matching field", () => {
  const markdown = [
    "| 字段 | 值 |",
    "| --- | --- |",
    "| releaseVersion | 待填写 |",
    "| environment | 待填写 |",
    "| operatorRole | 待填写 |",
    "| gitCommit | 待填写 |",
    "| serverImage | 待填写 |",
    "| serverImageDigest | 待填写 |",
    "| webImage | 待填写 |",
    "| webImageDigest | 待填写 |",
    "| migrationBefore | 待填写 |",
    "| migrationAfter | 待填写 |",
    "| backupId | 待填写 |",
    "",
    "## 回滚信息",
    "",
    "| 字段 | 值 |",
    "| --- | --- |",
    "| backupId | 待填写 |",
    "",
  ].join("\n");

  const updated = applyImmutableVersionEvidenceToMarkdown(markdown, {
    releaseVersion: "20260629T1200-yoyoosun",
    environment: "customer-trial",
    operatorRole: "release-operator",
    gitCommit: "6da29ddcde7b",
    serverImage: "registry.example.invalid/plush/server:20260629T1200",
    serverImageDigest: VALID_INPUT.serverDigest,
    webImage: "registry.example.invalid/plush/web:20260629T1200",
    webImageDigest: VALID_INPUT.webDigest,
    migrationBefore: "20260601000000",
    migrationAfter: "20260628123354",
    backupId: "backup-20260629T1200",
  });

  assert.match(updated, /\| backupId \| backup-20260629T1200 \|/);
  assert.match(updated, /## 回滚信息[\s\S]*\| backupId \| 待填写 \|/);
});

test("writeImmutableVersionEvidence updates release evidence and image digest artifact", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "immutable-version-evidence-"));
  const { evidenceDir, absoluteDir } = writeDraftEvidence(root);

  const result = await writeImmutableVersionEvidence(
    {
      evidenceDir,
      ...VALID_INPUT,
    },
    { repoRoot: root },
  );

  assert.equal(result.releaseEvidencePath, path.join(absoluteDir, "release-evidence.md"));
  const releaseEvidence = fs.readFileSync(path.join(absoluteDir, "release-evidence.md"), "utf8");
  assert.match(releaseEvidence, /\| environment \| customer-trial \|/);
  assert.match(releaseEvidence, /\| gitCommit \| 6da29ddcde7b \|/);
  assert.match(releaseEvidence, /\| serverImageDigest \| sha256:a{64} \|/);
  assert.match(releaseEvidence, /\| migrationAfter \| 20260628123354 \|/);

  const imageDigests = fs.readFileSync(path.join(absoluteDir, "image-digests.txt"), "utf8");
  assert.match(imageDigests, /serverImage=registry\.example\.invalid\/plush\/server:20260629T1200/);
  assert.match(imageDigests, /webImageDigest=sha256:b{64}/);
});

test("immutable version CLI writes evidence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "immutable-version-evidence-cli-"));
  const { evidenceDir } = writeDraftEvidence(root);

  const result = runCli({
    cwd: root,
    args: [
      "--evidence-dir",
      evidenceDir,
      ...cliArgs(),
    ],
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /immutable version evidence:/);
  assert.match(result.stdout, /serverImageDigest: sha256:a{64}/);
});

test("immutable version CLI rejects invalid input without partial evidence writes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "immutable-version-invalid-cli-"));
  const { evidenceDir, absoluteDir } = writeDraftEvidence(root);
  const releaseEvidencePath = path.join(absoluteDir, "release-evidence.md");
  const imageDigestsPath = path.join(absoluteDir, "image-digests.txt");
  const releaseEvidenceBefore = fs.readFileSync(releaseEvidencePath, "utf8");
  const imageDigestsBefore = fs.readFileSync(imageDigestsPath, "utf8");

  const result = runCli({
    cwd: root,
    args: [
      "--evidence-dir",
      evidenceDir,
      ...cliArgs({
        ...VALID_INPUT,
        migrationAfter: "latest",
      }),
    ],
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /--migration-after must be a 14-digit Atlas migration version/);
  assert.equal(fs.readFileSync(releaseEvidencePath, "utf8"), releaseEvidenceBefore);
  assert.equal(fs.readFileSync(imageDigestsPath, "utf8"), imageDigestsBefore);
});

test("immutable version CLI rejects malformed release evidence without partial writes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "immutable-version-malformed-cli-"));
  const { evidenceDir, absoluteDir } = writeDraftEvidence(root);
  const releaseEvidencePath = path.join(absoluteDir, "release-evidence.md");
  const imageDigestsPath = path.join(absoluteDir, "image-digests.txt");
  const malformedReleaseEvidence = fs
    .readFileSync(releaseEvidencePath, "utf8")
    .replace(/^\| serverImageDigest \| [^|]+ \|\n/m, "");
  fs.writeFileSync(releaseEvidencePath, malformedReleaseEvidence);
  const imageDigestsBefore = fs.readFileSync(imageDigestsPath, "utf8");

  const result = runCli({
    cwd: root,
    args: [
      "--evidence-dir",
      evidenceDir,
      ...cliArgs(),
    ],
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /release-evidence\.md is missing field: serverImageDigest/);
  assert.equal(fs.readFileSync(releaseEvidencePath, "utf8"), malformedReleaseEvidence);
  assert.equal(fs.readFileSync(imageDigestsPath, "utf8"), imageDigestsBefore);
});

test("immutable version CLI prints input template without writing evidence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "immutable-version-template-cli-"));
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-29";

  const result = runCli({
    cwd: root,
    args: [
      "--evidence-dir",
      evidenceDir,
      "--print-input-template",
    ],
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /immutable-version input template/);
  assert.match(result.stdout, /SERVER_IMAGE_DIGEST='sha256:<64-hex>'/);
  assert.match(
    result.stdout,
    /--evidence-dir deployments\/yoyoosun\/evidence\/releases\/2026-06-29/,
  );
  assert.doesNotMatch(result.stdout, /RELEASE_CLOSEOUT_CONFIRM/);
  assert.doesNotMatch(result.stdout, /SOURCE_POSTGRES_DSN/);
  assert.doesNotMatch(result.stdout, /SMOKE_(ENDPOINT|BACKEND_URL)/);
  assert.doesNotMatch(result.stdout, /CUSTOMER_CONFIG_ADMIN_TOKEN/);
  assert.equal(
    fs.existsSync(path.join(root, evidenceDir, "release-evidence.md")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(root, evidenceDir, "image-digests.txt")),
    false,
  );
});
