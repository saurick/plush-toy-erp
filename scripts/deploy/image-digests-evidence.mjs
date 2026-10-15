#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const DEFAULT_EVIDENCE_FILE = "image-digests.txt";

const USAGE = `Image digests release evidence generator

Usage:
  node scripts/deploy/image-digests-evidence.mjs \\
    --server-image registry.example.invalid/plush/server:20260629T1200 \\
    --server-digest sha256:<64-hex> \\
    --web-image registry.example.invalid/plush/web:20260629T1200 \\
    --web-digest sha256:<64-hex> \\
    --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>

Options:
  --server-image <ref>   Required. Server image ref without credentials.
  --server-digest <sha>  Required. Server image digest as sha256:<64-hex>.
  --web-image <ref>      Required. Web image ref without credentials.
  --web-digest <sha>     Required. Web image digest as sha256:<64-hex>.
  --evidence-dir <dir>   Existing release evidence directory. Writes image-digests.txt.
  --out <path>           Alternative explicit output path.
  --help                 Print this help.

If --evidence-dir contains release-evidence.md with filled sha256 image digest
fields, this script cross-checks the generated digest artifact against it. It
does not build images, push images, inspect registries, read env files, or write
any target environment state.`;

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export function parseCliArgs(argv) {
  const options = { help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      options.help = true;
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
      case "evidence-dir":
        options.evidenceDir = value;
        break;
      case "out":
        options.out = value;
        break;
      default:
        throw new CliError(`Unknown option --${key}`, 2);
    }
  }
  return options;
}

function requireOption(options, key) {
  if (!options[key]) {
    throw new CliError(
      `Missing required --${key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`,
      2,
    );
  }
}

function assertDigest(value, field) {
  if (!DIGEST_PATTERN.test(String(value || "").trim())) {
    throw new CliError(`${field} must be sha256:<64-hex>`, 2);
  }
}

function assertImageRef(value, field) {
  const ref = String(value || "").trim();
  if (!ref) {
    throw new CliError(`${field} must not be empty`, 2);
  }
  if (/[\s\r\n]/.test(ref)) {
    throw new CliError(`${field} must not contain whitespace`, 2);
  }
  if (/^[a-z][a-z0-9+.-]*:\/\/[^/]+:[^/@]+@/i.test(ref)) {
    throw new CliError(`${field} must not contain URL credentials`, 2);
  }
}

function normalizeDigest(value) {
  return String(value || "").trim().toLowerCase();
}

function findMarkdownTableValue(content, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`^\\|\\s*${escaped}\\s*\\|\\s*([^|]+?)\\s*\\|\\s*$`, "im"));
  return match ? match[1].trim() : "";
}

async function validateReleaseEvidenceIfFilled(evidenceDir, payload) {
  const releaseEvidencePath = path.join(evidenceDir, "release-evidence.md");
  if (!fs.existsSync(releaseEvidencePath)) {
    return;
  }
  const content = await readFile(releaseEvidencePath, "utf8");
  const releaseServerDigest = normalizeDigest(
    findMarkdownTableValue(content, "serverImageDigest"),
  );
  const releaseWebDigest = normalizeDigest(
    findMarkdownTableValue(content, "webImageDigest"),
  );
  if (DIGEST_PATTERN.test(releaseServerDigest) && releaseServerDigest !== payload.serverImageDigest) {
    throw new CliError("server digest must match release-evidence.md serverImageDigest");
  }
  if (DIGEST_PATTERN.test(releaseWebDigest) && releaseWebDigest !== payload.webImageDigest) {
    throw new CliError("web digest must match release-evidence.md webImageDigest");
  }
}

export function buildImageDigestsEvidence(options) {
  requireOption(options, "serverImage");
  requireOption(options, "serverDigest");
  requireOption(options, "webImage");
  requireOption(options, "webDigest");
  if (!options.evidenceDir && !options.out) {
    throw new CliError("Missing required --evidence-dir or --out", 2);
  }
  if (options.evidenceDir && options.out) {
    throw new CliError("--evidence-dir and --out cannot be used together", 2);
  }
  assertImageRef(options.serverImage, "--server-image");
  assertImageRef(options.webImage, "--web-image");
  assertDigest(options.serverDigest, "--server-digest");
  assertDigest(options.webDigest, "--web-digest");
  return {
    serverImage: String(options.serverImage).trim(),
    serverImageDigest: normalizeDigest(options.serverDigest),
    webImage: String(options.webImage).trim(),
    webImageDigest: normalizeDigest(options.webDigest),
  };
}

export function formatImageDigestsEvidence(payload) {
  return [
    `serverImage=${payload.serverImage}`,
    `serverImageDigest=${payload.serverImageDigest}`,
    `webImage=${payload.webImage}`,
    `webImageDigest=${payload.webImageDigest}`,
    "",
  ].join("\n");
}

export async function writeImageDigestsEvidence(options, runtime = {}) {
  const repoRoot = runtime.repoRoot || process.cwd();
  const payload = buildImageDigestsEvidence(options);
  const outputPath = options.out
    ? path.resolve(repoRoot, options.out)
    : path.join(path.resolve(repoRoot, options.evidenceDir), DEFAULT_EVIDENCE_FILE);
  const evidenceDir = path.dirname(outputPath);
  if (!fs.existsSync(evidenceDir) || !fs.statSync(evidenceDir).isDirectory()) {
    throw new CliError(`output directory must already exist: ${evidenceDir}`, 2);
  }
  if (options.evidenceDir) {
    await validateReleaseEvidenceIfFilled(path.resolve(repoRoot, options.evidenceDir), payload);
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, formatImageDigestsEvidence(payload), "utf8");
  return { outputPath, evidence: payload };
}

async function runCli() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  const result = await writeImageDigestsEvidence(options);
  console.log(`image digests evidence: ${result.outputPath}`);
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
