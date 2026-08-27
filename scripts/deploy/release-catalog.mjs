import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { sha256File } from "../lib/file-digest.mjs";
import { validateStrictReceiptEvidence } from "../qa/strict-receipt-identity.mjs";

export const RELEASE_MANIFEST_CONTRACT = "plush.release-manifest/v1";
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const VERSION_PATTERN = /^[0-9A-Za-z](?:[0-9A-Za-z._-]{0,62}[0-9A-Za-z])?$/u;
const REGISTRY_REPOSITORY_PATTERN =
  /^ghcr\.io\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._/-]*[a-z0-9])?$/u;

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

export { sha256File };

function validateStrictManifestEvidence(manifest) {
  const strict = manifest?.strict;
  if (strict?.contract === "plush.exact-sha-strict/v2") {
    if (
      strict?.provenance?.source !== "github-actions" ||
      !String(strict?.provenance?.workflowRef || "").includes(
        "/.github/workflows/release.yml@",
      ) ||
      strict?.provenance?.job !== "strict"
    ) {
      throw new Error("legacy strict release provenance is invalid");
    }
    return strict;
  }
  validateStrictReceiptEvidence({
    ...strict,
    profile: "strict",
    status: "passed",
    exitCode: 0,
  });
  const ciProvenance =
    strict.provenance?.source === "github-actions" &&
    strict.provenance?.eventName === "push" &&
    strict.provenance?.job === "quality" &&
    String(strict.provenance?.workflowRef || "").includes(
      "/.github/workflows/ci.yml@",
    );
  const releaseFallbackProvenance =
    strict.provenance?.source === "github-actions" &&
    strict.provenance?.eventName === "workflow_dispatch" &&
    strict.provenance?.job === "strict" &&
    String(strict.provenance?.workflowRef || "").includes(
      "/.github/workflows/release.yml@",
    );
  const gitlabCanonicalProvenance =
    strict.provenance?.source === "gitlab-ci" &&
    ["api", "push", "trigger", "web"].includes(
      strict.provenance?.eventName,
    ) &&
    strict.provenance?.job === "strict" &&
    String(strict.provenance?.workflowRef || "").includes(
      "/.gitlab-ci.yml@",
    );
  if (
    strict.identity.gitSha !== manifest.gitSha ||
    strict.fingerprint !== strict.identity.policyFingerprint ||
    strict.identity.repository !== strict.provenance?.repository ||
    strict.identity.sourceArchiveSha256 !==
      manifest.artifact?.sourceArchiveSha256 ||
    strict.identity.migrationSequenceSha256 !==
      manifest.migration?.sequenceSha256 ||
    strict.identity.customerConfigFingerprint !==
      manifest.customerConfig?.sourceSha256 ||
    !["github-actions", "gitlab-ci"].includes(strict.provenance?.source) ||
    strict.provenance?.ref !== "refs/heads/main" ||
    strict.provenance?.refName !== "main" ||
    strict.provenance?.headRepository !== strict.provenance?.repository ||
    strict.provenance?.conclusion !== "success" ||
    (!ciProvenance && !releaseFallbackProvenance &&
      !gitlabCanonicalProvenance)
  ) {
    throw new Error("strict release identity or CI provenance is invalid");
  }
  return strict;
}

export function validateReleaseManifest(manifest) {
  if (
    manifest?.schemaVersion !== RELEASE_MANIFEST_CONTRACT ||
    manifest?.passed !== true ||
    !VERSION_PATTERN.test(String(manifest?.version || "")) ||
    !SHA_PATTERN.test(String(manifest?.gitSha || "")) ||
    !["plush.exact-sha-strict/v2", "plush.exact-sha-strict/v3"].includes(
      manifest?.strict?.contract,
    ) ||
    manifest?.strict?.status !== "passed" ||
    !SHA256_PATTERN.test(String(manifest?.strict?.fingerprint || "")) ||
    !SHA256_PATTERN.test(String(manifest?.strict?.receiptSha256 || "")) ||
    !["github-actions", "gitlab-ci"].includes(
      manifest?.strict?.provenance?.source,
    ) ||
    !REGISTRY_REPOSITORY_PATTERN.test(
      `ghcr.io/${String(manifest?.strict?.provenance?.repository || "")}`,
    ) ||
    !/^\d+$/u.test(String(manifest?.strict?.provenance?.runId || "")) ||
    !/^\d+$/u.test(String(manifest?.strict?.provenance?.runAttempt || "")) ||
    !SHA256_PATTERN.test(String(manifest?.artifact?.manifestSha256 || "")) ||
    !/^[0-9]{14}$/u.test(String(manifest?.migration?.latest || "")) ||
    !SHA256_PATTERN.test(String(manifest?.migration?.sequenceSha256 || "")) ||
    !SHA256_PATTERN.test(
      String(manifest?.customerConfig?.sourceSha256 || ""),
    ) ||
    !Array.isArray(manifest?.images) ||
    manifest.images.length !== 2
  ) {
    throw new Error("release manifest contract is invalid");
  }
  validateStrictManifestEvidence(manifest);
  const kinds = new Set();
  for (const image of manifest.images) {
    if (
      !["server", "web"].includes(image?.kind) ||
      kinds.has(image.kind) ||
      !REGISTRY_REPOSITORY_PATTERN.test(String(image?.repository || "")) ||
      !DIGEST_PATTERN.test(String(image?.digest || "")) ||
      image?.ref !== `${image.repository}@${image.digest}` ||
      !DIGEST_PATTERN.test(String(image?.sourceContentId || ""))
    ) {
      throw new Error(
        `release manifest image is invalid: ${image?.kind || "unknown"}`,
      );
    }
    kinds.add(image.kind);
  }
  if (!kinds.has("server") || !kinds.has("web")) {
    throw new Error("release manifest must contain server and web images");
  }
  if (
    manifest?.redaction?.containsSecrets !== false ||
    manifest?.redaction?.containsCredentials !== false ||
    manifest?.redaction?.containsAbsoluteWorkspacePaths !== false
  ) {
    throw new Error("release manifest redaction boundary is invalid");
  }
  return manifest;
}

export function buildReleaseManifest({
  version,
  gitSha,
  strictTerminal,
  artifactManifest,
  artifactManifestSha256,
  images,
  createdAt = new Date().toISOString(),
}) {
  if (
    strictTerminal?.status !== "passed" ||
    strictTerminal?.gitSha !== gitSha
  ) {
    throw new Error("passed exact-SHA strict terminal is required");
  }
  if (
    artifactManifest?.passed !== true ||
    artifactManifest?.git?.commit !== gitSha
  ) {
    throw new Error("release artifact does not match exact SHA");
  }
  const sourceByKind = new Map(
    artifactManifest.images.map((image) => [image.kind, image]),
  );
  return validateReleaseManifest({
    schemaVersion: RELEASE_MANIFEST_CONTRACT,
    passed: true,
    version,
    createdAt,
    gitSha,
    strict: {
      contract: strictTerminal.contract,
      profile: strictTerminal.profile,
      status: strictTerminal.status,
      fingerprint: strictTerminal.fingerprint,
      receiptSha256: strictTerminal.receipt?.sha256,
      ...(strictTerminal.contract === "plush.exact-sha-strict/v3"
        ? {
            identity: strictTerminal.identity,
            checks: strictTerminal.checks,
            timeSensitiveChecks: strictTerminal.timeSensitiveChecks,
          }
        : {}),
      provenance: {
        source: strictTerminal.provenance?.source,
        repository: strictTerminal.provenance?.repository,
        workflowRef: strictTerminal.provenance?.workflowRef,
        runId: strictTerminal.provenance?.runId,
        runAttempt: strictTerminal.provenance?.runAttempt,
        job: strictTerminal.provenance?.job,
        ...(strictTerminal.contract === "plush.exact-sha-strict/v3"
          ? {
              eventName: strictTerminal.provenance?.eventName,
              ref: strictTerminal.provenance?.ref,
              refName: strictTerminal.provenance?.refName,
              headRepository: strictTerminal.provenance?.headRepository,
              conclusion: strictTerminal.provenance?.conclusion,
            }
          : {}),
      },
    },
    artifact: {
      schemaVersion: artifactManifest.schemaVersion,
      manifestFile: "release-artifact.json",
      manifestSha256: artifactManifestSha256,
      sourceArchiveSha256: artifactManifest.sourceArchive.sha256,
    },
    migration: artifactManifest.migration,
    customerConfig: artifactManifest.customerConfig,
    sbom: artifactManifest.sbom,
    images: images
      .map((image) => ({
        kind: image.kind,
        repository: image.repository,
        digest: image.digest,
        ref: `${image.repository}@${image.digest}`,
        sourceContentId: sourceByKind.get(image.kind)?.contentId || "",
        platform: sourceByKind.get(image.kind)?.platform || "",
      }))
      .sort((left, right) => left.kind.localeCompare(right.kind)),
    rollback: {
      targetRollbackPointRequiredBeforePromotion: true,
      databaseDownMigrationAutomatic: false,
    },
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsAbsoluteWorkspacePaths: false,
      containsRawCustomerRows: false,
    },
    notProven: [
      "133 promotion",
      "target migration readback",
      "target active/effective customer config",
      "target role smoke",
      "customer UAT and sign-off",
    ],
  });
}

export function writeReleaseManifest(file, manifest) {
  validateReleaseManifest(manifest);
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  if (existsSync(file)) {
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error("release manifest output is not a plain file");
    }
    const existing = readFileSync(file, "utf8");
    if (stableStringify(JSON.parse(existing)) !== stableStringify(manifest)) {
      throw new Error("release manifest already exists with different content");
    }
    return { path: file, reused: true };
  }
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, file);
    const directory = openSync(path.dirname(file), "r");
    fsyncSync(directory);
    closeSync(directory);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  return { path: file, reused: false };
}

function parseArgs(argv) {
  const options = { manifest: "", sha: "", version: "", json: false };
  const [command, ...args] = argv;
  if (command === "--help" || command === "-h" || !command) {
    return { help: true };
  }
  if (command !== "verify") throw new Error("expected command: verify");
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (["--manifest", "--sha", "--version"].includes(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      options[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown option: ${arg}`);
  }
  if (!options.manifest) throw new Error("--manifest is required");
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/deploy/release-catalog.mjs verify --manifest <release-manifest.json> [--sha <40-char-sha>] [--version <name>] [--json]

This verifier is provider-neutral. It validates immutable registry digests,
exact-SHA strict evidence and manifest identity; it does not contact GitHub,
GHCR or a deployment target.`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const file = path.resolve(options.manifest);
  const manifest = validateReleaseManifest(
    JSON.parse(readFileSync(file, "utf8")),
  );
  if (options.sha && manifest.gitSha !== options.sha) {
    throw new Error("release manifest SHA mismatch");
  }
  if (options.version && manifest.version !== options.version) {
    throw new Error("release manifest version mismatch");
  }
  const result = {
    status: "passed",
    gitSha: manifest.gitSha,
    version: manifest.version,
    manifestSha256: sha256File(file),
    images: manifest.images.map(({ kind, ref }) => ({ kind, ref })),
  };
  console.log(
    options.json
      ? JSON.stringify(result, null, 2)
      : `[release-catalog] status=passed version=${result.version} sha=${result.gitSha} manifestSha256=${result.manifestSha256}`,
  );
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(`[release-catalog] status=blocked reason=${error.message}`);
    process.exitCode = 2;
  }
}
