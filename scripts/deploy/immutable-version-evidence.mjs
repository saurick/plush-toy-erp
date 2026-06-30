#!/usr/bin/env node

import fs from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildImageDigestsEvidence,
  formatImageDigestsEvidence,
} from "./image-digests-evidence.mjs";

const RELEASE_EVIDENCE_FILE = "release-evidence.md";
const IMAGE_DIGESTS_FILE = "image-digests.txt";
const DEFAULT_EVIDENCE_DIR = "deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>";
const IMMUTABLE_VERSION_INPUTS = [
  ["RELEASE_VERSION", "release-version", "<release-version>"],
  ["RELEASE_ENVIRONMENT", "environment", "<target-environment>"],
  ["OPERATOR_ROLE", "operator-role", "<operator-role>"],
  ["GIT_COMMIT", "git-commit", "<git-commit>"],
  ["SERVER_IMAGE", "server-image", "<server-image-ref>"],
  ["SERVER_IMAGE_DIGEST", "server-digest", "sha256:<64-hex>"],
  ["WEB_IMAGE", "web-image", "<web-image-ref>"],
  ["WEB_IMAGE_DIGEST", "web-digest", "sha256:<64-hex>"],
  ["MIGRATION_BEFORE", "migration-before", "<atlas-version-before>"],
  ["MIGRATION_AFTER", "migration-after", "<atlas-version-after>"],
  ["BACKUP_ID", "backup-id", "<backup-id>"],
];

const USAGE = `Immutable version release evidence writer

Usage:
  node scripts/deploy/immutable-version-evidence.mjs \\
    --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \\
    --release-version <release-version> \\
    --environment <target-environment> \\
    --operator-role <operator-role> \\
    --git-commit <git-commit> \\
    --server-image <server-image-ref> \\
    --server-digest sha256:<64-hex> \\
    --web-image <web-image-ref> \\
    --web-digest sha256:<64-hex> \\
    --migration-before <atlas-version> \\
    --migration-after <atlas-version> \\
    --backup-id <backup-id>

  node scripts/deploy/immutable-version-evidence.mjs \\
    --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \\
    --print-input-template

Purpose:
  Update release-evidence.md immutable version fields and write
  image-digests.txt from explicit release inputs. This script does not build
  images, inspect registries, read env files, run migrations, run smoke tests,
  restore backups, or contact the target environment.`;

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export function parseCliArgs(argv) {
  const options = { help: false, printInputTemplate: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--print-input-template") {
      options.printInputTemplate = true;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new CliError(`Unexpected argument: ${token}`, 2);
    }
    const equalIndex = token.indexOf("=");
    const key = token.slice(2, equalIndex === -1 ? undefined : equalIndex);
    const inlineValue =
      equalIndex === -1 ? undefined : token.slice(equalIndex + 1);
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) {
      index += 1;
    }
    if (value === undefined || String(value).startsWith("--")) {
      throw new CliError(`Missing value for --${key}`, 2);
    }
    switch (key) {
      case "evidence-dir":
        options.evidenceDir = value;
        break;
      case "release-version":
        options.releaseVersion = value;
        break;
      case "environment":
        options.environment = value;
        break;
      case "operator-role":
        options.operatorRole = value;
        break;
      case "git-commit":
        options.gitCommit = value;
        break;
      case "server-image":
        options.serverImage = value;
        break;
      case "server-digest":
        options.serverDigest = value;
        break;
      case "web-image":
        options.webImage = value;
        break;
      case "web-digest":
        options.webDigest = value;
        break;
      case "migration-before":
        options.migrationBefore = value;
        break;
      case "migration-after":
        options.migrationAfter = value;
        break;
      case "backup-id":
        options.backupId = value;
        break;
      default:
        throw new CliError(`Unknown option --${key}`, 2);
    }
  }
  return options;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

export function buildImmutableVersionInputTemplate(options = {}) {
  const evidenceDir = options.evidenceDir || DEFAULT_EVIDENCE_DIR;
  const env = IMMUTABLE_VERSION_INPUTS.map(([envKey, cliKey, placeholder]) => ({
    envKey,
    cliKey,
    placeholder,
    assignment: `${envKey}=${shellQuote(placeholder)}`,
  }));
  const commandParts = [
    "node",
    "scripts/deploy/immutable-version-evidence.mjs",
    "--evidence-dir",
    evidenceDir,
  ];
  for (const [envKey, cliKey] of IMMUTABLE_VERSION_INPUTS) {
    commandParts.push(`--${cliKey}`, `"$${envKey}"`);
  }
  const command = [
    ...env.map((item) => item.assignment),
    commandParts.join(" "),
  ].join(" \\\n  ");
  return {
    evidenceDir,
    purpose:
      "Fill these values from one release batch, then run the command to update release-evidence.md and image-digests.txt.",
    doesNotDo: [
      "build images",
      "inspect registries",
      "read .env",
      "run migrations",
      "run smoke tests",
      "restore backups",
      "contact the target environment",
    ],
    env,
    command,
  };
}

export function formatImmutableVersionInputTemplate(template) {
  return [
    "immutable-version input template",
    `evidenceDir: ${template.evidenceDir}`,
    "",
    template.purpose,
    "",
    "Required values:",
    ...template.env.map(
      (item) => `  ${item.envKey}=${shellQuote(item.placeholder)}`,
    ),
    "",
    "Command:",
    template.command,
    "",
    `Does not: ${template.doesNotDo.join(", ")}.`,
  ].join("\n");
}

function requireOption(options, key) {
  if (!options[key]) {
    throw new CliError(
      `Missing required --${key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`,
      2,
    );
  }
}

function assertPlainField(value, label) {
  const text = String(value || "").trim();
  if (!text || /待填写|placeholder|sample|example/i.test(text)) {
    throw new CliError(`${label} must be a real value`, 2);
  }
  if (/[\r\n|]/.test(text)) {
    throw new CliError(`${label} must not contain a table separator or newline`, 2);
  }
  return text;
}

function assertGitCommit(value) {
  const text = assertPlainField(value, "--git-commit");
  if (!/^[a-f0-9]{7,40}$/i.test(text)) {
    throw new CliError("--git-commit must be a 7-40 character git hash", 2);
  }
  return text;
}

function assertAtlasVersion(value, label) {
  const text = assertPlainField(value, label);
  if (!/^\d{14}$/.test(text)) {
    throw new CliError(`${label} must be a 14-digit Atlas migration version`, 2);
  }
  return text;
}

function updateMarkdownField(content, field, value) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(^\\|\\s*${escaped}\\s*\\|\\s*)([^|]*?)(\\s*\\|\\s*$)`,
    "m",
  );
  if (!pattern.test(content)) {
    throw new CliError(`${RELEASE_EVIDENCE_FILE} is missing field: ${field}`);
  }
  return content.replace(pattern, `$1${value}$3`);
}

export function buildImmutableVersionEvidence(options) {
  for (const key of [
    "evidenceDir",
    "releaseVersion",
    "environment",
    "operatorRole",
    "gitCommit",
    "migrationBefore",
    "migrationAfter",
    "backupId",
  ]) {
    requireOption(options, key);
  }
  const imageEvidence = buildImageDigestsEvidence({
    serverImage: options.serverImage,
    serverDigest: options.serverDigest,
    webImage: options.webImage,
    webDigest: options.webDigest,
    out: "image-digests.txt",
  });
  return {
    releaseVersion: assertPlainField(options.releaseVersion, "--release-version"),
    environment: assertPlainField(options.environment, "--environment"),
    operatorRole: assertPlainField(options.operatorRole, "--operator-role"),
    gitCommit: assertGitCommit(options.gitCommit),
    serverImage: imageEvidence.serverImage,
    serverImageDigest: imageEvidence.serverImageDigest,
    webImage: imageEvidence.webImage,
    webImageDigest: imageEvidence.webImageDigest,
    migrationBefore: assertAtlasVersion(options.migrationBefore, "--migration-before"),
    migrationAfter: assertAtlasVersion(options.migrationAfter, "--migration-after"),
    backupId: assertPlainField(options.backupId, "--backup-id"),
  };
}

export function applyImmutableVersionEvidenceToMarkdown(content, evidence) {
  let next = content;
  for (const [field, value] of Object.entries({
    releaseVersion: evidence.releaseVersion,
    environment: evidence.environment,
    operatorRole: evidence.operatorRole,
    gitCommit: evidence.gitCommit,
    serverImage: evidence.serverImage,
    serverImageDigest: evidence.serverImageDigest,
    webImage: evidence.webImage,
    webImageDigest: evidence.webImageDigest,
    migrationBefore: evidence.migrationBefore,
    migrationAfter: evidence.migrationAfter,
    backupId: evidence.backupId,
  })) {
    next = updateMarkdownField(next, field, value);
  }
  return next;
}

export async function writeImmutableVersionEvidence(options, runtime = {}) {
  const repoRoot = runtime.repoRoot || process.cwd();
  const evidenceDir = path.resolve(repoRoot, options.evidenceDir || "");
  if (!fs.existsSync(evidenceDir) || !fs.statSync(evidenceDir).isDirectory()) {
    throw new CliError(`evidence directory must already exist: ${options.evidenceDir}`, 2);
  }
  const evidence = buildImmutableVersionEvidence(options);
  const releaseEvidencePath = path.join(evidenceDir, RELEASE_EVIDENCE_FILE);
  if (!fs.existsSync(releaseEvidencePath)) {
    throw new CliError(`${RELEASE_EVIDENCE_FILE} is required in evidence directory`, 2);
  }
  const releaseEvidence = await readFile(releaseEvidencePath, "utf8");
  await writeFile(
    releaseEvidencePath,
    applyImmutableVersionEvidenceToMarkdown(releaseEvidence, evidence),
    "utf8",
  );
  await writeFile(
    path.join(evidenceDir, IMAGE_DIGESTS_FILE),
    formatImageDigestsEvidence(evidence),
    "utf8",
  );
  return {
    releaseEvidencePath,
    imageDigestsPath: path.join(evidenceDir, IMAGE_DIGESTS_FILE),
    evidence,
  };
}

async function runCli() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  if (options.printInputTemplate) {
    console.log(formatImmutableVersionInputTemplate(
      buildImmutableVersionInputTemplate(options),
    ));
    return 0;
  }
  const result = await writeImmutableVersionEvidence(options);
  console.log(`immutable version evidence: ${result.releaseEvidencePath}`);
  console.log(`image digests evidence: ${result.imageDigestsPath}`);
  console.log(`gitCommit: ${result.evidence.gitCommit}`);
  console.log(`serverImageDigest: ${result.evidence.serverImageDigest}`);
  console.log(`webImageDigest: ${result.evidence.webImageDigest}`);
  return 0;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  runCli()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      if (error instanceof CliError) {
        console.error(error.message);
        process.exitCode = error.exitCode;
        return;
      }
      console.error(error);
      process.exitCode = 1;
    });
}
