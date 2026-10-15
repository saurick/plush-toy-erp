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

export const RELEASE_MANIFEST_CONTRACT_V1 = "plush.release-manifest/v1";
export const RELEASE_MANIFEST_CONTRACT_V2 = "plush.release-manifest/v2";
export const RELEASE_MANIFEST_CONTRACT = RELEASE_MANIFEST_CONTRACT_V2;
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
    ((strict.provenance?.eventName === "push" &&
      strict.provenance?.job === "quality_aggregate") ||
      (["api", "push", "trigger", "web"].includes(
        strict.provenance?.eventName,
      ) &&
        strict.provenance?.job === "strict")) &&
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
  if (
    manifest.schemaVersion === RELEASE_MANIFEST_CONTRACT_V2 &&
    !(
      strict.contract === "plush.exact-sha-strict/v3" &&
      strict.provenance?.source === "gitlab-ci" &&
      strict.provenance?.eventName === "push" &&
      strict.provenance?.job === "quality_aggregate"
    )
  ) {
    throw new Error("release v2 requires canonical GitLab push CI evidence");
  }
  return strict;
}

function validateRuntimeReadback(value, gitSha) {
  return (
    value?.serverHealth === "passed" &&
    value?.serverReady === "passed" &&
    value?.webHealth === "passed" &&
    value?.webRoot === "passed" &&
    value?.runtimeIdentity === "passed" &&
    value?.authenticatedAdmin === "passed" &&
    value?.embeddedGitSha === gitSha
  );
}

export function validateReleaseRehearsalReceipt(
  receipt,
  artifact,
  releaseIdentity,
) {
  const server = artifact?.images?.find((item) => item.kind === "server");
  const web = artifact?.images?.find((item) => item.kind === "web");
  const runtimePassed = (value) =>
    value?.serverHealth === "passed" &&
    value?.serverReady === "passed" &&
    value?.webHealth === "passed" &&
    value?.webRoot === "passed" &&
    value?.runtimeIdentity === "passed" &&
    value?.authenticatedAdmin === "passed" &&
    value?.embeddedGitSha === releaseIdentity?.sha;
  if (
    receipt?.schemaVersion !== "plush-local-release-rehearsal/v1" ||
    receipt?.passed !== true ||
    receipt?.customer !== releaseIdentity?.customer ||
    !Number.isFinite(Date.parse(String(receipt?.generatedAt || ""))) ||
    !Number.isFinite(Date.parse(String(receipt?.finishedAt || ""))) ||
    Date.parse(receipt.finishedAt) < Date.parse(receipt.generatedAt) ||
    receipt?.git?.commit !== releaseIdentity?.sha ||
    receipt?.git?.head !== releaseIdentity?.sha ||
    receipt?.git?.worktreeClean !== true ||
    artifact?.releaseVersion !== releaseIdentity?.version ||
    receipt?.artifact?.manifestSchema !== artifact?.schemaVersion ||
    receipt?.artifact?.server !== server?.contentId ||
    receipt?.artifact?.web !== web?.contentId ||
    receipt?.artifact?.migrationSequenceSha256 !==
      artifact?.migration?.sequenceSha256 ||
    receipt?.artifact?.sbomSha256 !== artifact?.sbom?.sha256 ||
    receipt?.environment?.kind !== "local-isolated-release-compose" ||
    receipt?.environment?.databaseIdentityBound !== true ||
    receipt?.environment?.composeSource !==
      "server/deploy/compose/prod/compose.yml" ||
    receipt?.migration?.latest !== artifact?.migration?.latest ||
    receipt?.migration?.sequenceSha256 !==
      artifact?.migration?.sequenceSha256 ||
    receipt?.migration?.directoryValidation !== "passed" ||
    receipt?.migration?.dryRun !== "passed" ||
    receipt?.migration?.apply !== "passed" ||
    receipt?.migration?.readback !== "passed" ||
    !runtimePassed(receipt?.runtime?.initial) ||
    !runtimePassed(receipt?.runtime?.steadyStateRestart) ||
    receipt?.backupRestore?.status !== "passed" ||
    !SHA256_PATTERN.test(
      String(receipt?.backupRestore?.backupSha256 || ""),
    ) ||
    !Number.isSafeInteger(receipt?.backupRestore?.backupSizeBytes) ||
    receipt.backupRestore.backupSizeBytes < 1 ||
    receipt?.backupRestore?.dumpRetained !== false ||
    receipt?.recoveryRestart?.status !== "passed" ||
    receipt?.recoveryRestart?.bootstrapSecretRemoved !== true ||
    receipt?.recoveryRestart?.sameServerContentId !== true ||
    receipt?.recoveryRestart?.sameWebContentId !== true ||
    receipt?.recoveryRestart?.healthReadyAndLoginRecovered !== true ||
    receipt?.recoveryRestart?.customerConfigRecovered !== true ||
    receipt?.cleanup?.attempted !== true ||
    receipt?.cleanup?.passed !== true ||
    receipt?.cleanup?.residualContainers !== 0 ||
    receipt?.cleanup?.temporaryDatabaseRetained !== false ||
    receipt?.failure !== null ||
    receipt?.redaction?.containsSecrets !== false ||
    receipt?.redaction?.containsCredentials !== false ||
    receipt?.redaction?.containsFullDsn !== false ||
    receipt?.redaction?.containsAbsoluteWorkspacePaths !== false ||
    receipt?.redaction?.containsRawCustomerRows !== false
  ) {
    throw new Error("release rehearsal receipt contract is incomplete");
  }
  return receipt;
}

function validateReleaseRehearsalEvidence(rehearsal, manifest) {
  if (
    rehearsal?.contract !== "plush-local-release-rehearsal/v1" ||
    rehearsal?.status !== "passed" ||
    !SHA256_PATTERN.test(String(rehearsal?.receiptSha256 || "")) ||
    !Number.isFinite(Date.parse(String(rehearsal?.generatedAt || ""))) ||
    !Number.isFinite(Date.parse(String(rehearsal?.finishedAt || ""))) ||
    Date.parse(rehearsal.finishedAt) < Date.parse(rehearsal.generatedAt) ||
    rehearsal?.gitSha !== manifest.gitSha ||
    rehearsal?.artifact?.manifestSchema !== manifest.artifact?.schemaVersion ||
    rehearsal?.artifact?.serverContentId !==
      manifest.images.find((image) => image.kind === "server")?.sourceContentId ||
    rehearsal?.artifact?.webContentId !==
      manifest.images.find((image) => image.kind === "web")?.sourceContentId ||
    rehearsal?.artifact?.migrationSequenceSha256 !== manifest.migration?.sequenceSha256 ||
    rehearsal?.artifact?.sbomSha256 !== manifest.sbom?.sha256 ||
    rehearsal?.environment?.kind !== "local-isolated-release-compose" ||
    rehearsal?.environment?.composeSource !== "server/deploy/compose/prod/compose.yml" ||
    rehearsal?.environment?.databaseIdentityBound !== true ||
    rehearsal?.migration?.latest !== manifest.migration?.latest ||
    rehearsal?.migration?.sequenceSha256 !== manifest.migration?.sequenceSha256 ||
    rehearsal?.migration?.directoryValidation !== "passed" ||
    rehearsal?.migration?.dryRun !== "passed" ||
    rehearsal?.migration?.apply !== "passed" ||
    rehearsal?.migration?.readback !== "passed" ||
    !validateRuntimeReadback(rehearsal?.runtime?.initial, manifest.gitSha) ||
    !validateRuntimeReadback(rehearsal?.runtime?.steadyStateRestart, manifest.gitSha) ||
    rehearsal?.backupRestore?.status !== "passed" ||
    !SHA256_PATTERN.test(String(rehearsal?.backupRestore?.backupSha256 || "")) ||
    !Number.isSafeInteger(rehearsal?.backupRestore?.backupSizeBytes) ||
    rehearsal.backupRestore.backupSizeBytes < 1 ||
    rehearsal?.backupRestore?.dumpRetained !== false ||
    rehearsal?.recoveryRestart?.status !== "passed" ||
    rehearsal?.recoveryRestart?.bootstrapSecretRemoved !== true ||
    rehearsal?.recoveryRestart?.sameServerContentId !== true ||
    rehearsal?.recoveryRestart?.sameWebContentId !== true ||
    rehearsal?.recoveryRestart?.healthReadyAndLoginRecovered !== true ||
    rehearsal?.recoveryRestart?.customerConfigRecovered !== true ||
    rehearsal?.cleanup?.attempted !== true ||
    rehearsal?.cleanup?.passed !== true ||
    rehearsal?.cleanup?.residualContainers !== 0 ||
    rehearsal?.cleanup?.temporaryDatabaseRetained !== false ||
    rehearsal?.redaction?.containsSecrets !== false ||
    rehearsal?.redaction?.containsCredentials !== false ||
    rehearsal?.redaction?.containsFullDsn !== false ||
    rehearsal?.redaction?.containsAbsoluteWorkspacePaths !== false ||
    rehearsal?.redaction?.containsRawCustomerRows !== false
  ) {
    throw new Error("release rehearsal evidence is invalid");
  }
  return rehearsal;
}

function buildReleaseRehearsalEvidence(receipt, receiptSha256) {
  return {
    contract: receipt?.schemaVersion,
    status: receipt?.passed === true ? "passed" : "failed",
    receiptSha256,
    generatedAt: receipt?.generatedAt,
    finishedAt: receipt?.finishedAt,
    gitSha: receipt?.git?.commit,
    artifact: {
      manifestSchema: receipt?.artifact?.manifestSchema,
      serverContentId: receipt?.artifact?.server,
      webContentId: receipt?.artifact?.web,
      migrationSequenceSha256: receipt?.artifact?.migrationSequenceSha256,
      sbomSha256: receipt?.artifact?.sbomSha256,
    },
    environment: {
      kind: receipt?.environment?.kind,
      composeSource: receipt?.environment?.composeSource,
      databaseIdentityBound: receipt?.environment?.databaseIdentityBound,
    },
    migration: receipt?.migration,
    runtime: receipt?.runtime,
    backupRestore: receipt?.backupRestore,
    recoveryRestart: receipt?.recoveryRestart,
    cleanup: receipt?.cleanup,
    redaction: receipt?.redaction,
  };
}

function strictManifestEvidence(strictTerminal) {
  return {
    contract: strictTerminal?.contract,
    profile: strictTerminal?.profile,
    status: strictTerminal?.status,
    fingerprint: strictTerminal?.fingerprint,
    receiptSha256: strictTerminal?.receipt?.sha256,
    ...(strictTerminal?.contract === "plush.exact-sha-strict/v3"
      ? {
          identity: strictTerminal.identity,
          checks: strictTerminal.checks,
          timeSensitiveChecks: strictTerminal.timeSensitiveChecks,
        }
      : {}),
    provenance: {
      source: strictTerminal?.provenance?.source,
      repository: strictTerminal?.provenance?.repository,
      workflowRef: strictTerminal?.provenance?.workflowRef,
      runId: strictTerminal?.provenance?.runId,
      runAttempt: strictTerminal?.provenance?.runAttempt,
      job: strictTerminal?.provenance?.job,
      ...(strictTerminal?.contract === "plush.exact-sha-strict/v3"
        ? {
            eventName: strictTerminal.provenance?.eventName,
            ref: strictTerminal.provenance?.ref,
            refName: strictTerminal.provenance?.refName,
            headRepository: strictTerminal.provenance?.headRepository,
            conclusion: strictTerminal.provenance?.conclusion,
          }
        : {}),
    },
  };
}

export function validateReleasePublicationEvidence({
  version,
  gitSha,
  strictTerminal,
  artifactManifest,
  artifactManifestSha256,
  rehearsalReceipt,
  rehearsalReceiptSha256,
}) {
  if (
    !VERSION_PATTERN.test(String(version || "")) ||
    !SHA_PATTERN.test(String(gitSha || "")) ||
    strictTerminal?.status !== "passed" ||
    strictTerminal?.gitSha !== gitSha
  ) {
    throw new Error("passed exact-SHA strict terminal is required");
  }
  if (
    artifactManifest?.passed !== true ||
    artifactManifest?.git?.commit !== gitSha ||
    !SHA256_PATTERN.test(String(artifactManifestSha256 || ""))
  ) {
    throw new Error("release artifact does not match exact SHA");
  }
  const sourceByKind = new Map(
    (artifactManifest.images || []).map((image) => [image.kind, image]),
  );
  if (
    sourceByKind.size !== 2 ||
    !sourceByKind.has("server") ||
    !sourceByKind.has("web") ||
    !SHA256_PATTERN.test(String(rehearsalReceiptSha256 || ""))
  ) {
    throw new Error("new release publication evidence is incomplete");
  }
  validateReleaseRehearsalReceipt(rehearsalReceipt, artifactManifest, {
    sha: gitSha,
    version,
    customer: "yoyoosun",
  });
  validateStrictManifestEvidence({
    schemaVersion: RELEASE_MANIFEST_CONTRACT_V2,
    gitSha,
    strict: strictManifestEvidence(strictTerminal),
    artifact: {
      manifestSha256: artifactManifestSha256,
      sourceArchiveSha256: artifactManifest.sourceArchive?.sha256,
    },
    migration: artifactManifest.migration,
    customerConfig: artifactManifest.customerConfig,
  });
  return { sourceByKind };
}

export function validateReleaseManifest(manifest) {
  if (
    ![RELEASE_MANIFEST_CONTRACT_V1, RELEASE_MANIFEST_CONTRACT_V2].includes(
      manifest?.schemaVersion,
    ) ||
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
  if (manifest.schemaVersion === RELEASE_MANIFEST_CONTRACT_V2) {
    validateReleaseRehearsalEvidence(manifest.rehearsal, manifest);
  } else if (manifest.rehearsal !== undefined) {
    throw new Error("release v1 cannot claim rehearsal evidence");
  }
  return manifest;
}

export function validateReleaseArtifactBinding(
  manifestInput,
  artifact,
  artifactManifestSha256,
) {
  const manifest = validateReleaseManifest(manifestInput);
  const releaseImages = new Map(
    manifest.images.map((image) => [image.kind, image]),
  );
  const artifactImages = new Map(
    (artifact?.images || []).map((image) => [image.kind, image]),
  );
  if (
    artifact?.schemaVersion !== "plush-release-artifact/v1" ||
    artifact?.passed !== true ||
    artifact?.git?.commit !== manifest.gitSha ||
    artifact?.releaseVersion !== manifest.version ||
    artifactManifestSha256 !== manifest.artifact.manifestSha256 ||
    (manifest.artifact.schemaVersion !== undefined &&
      artifact.schemaVersion !== manifest.artifact.schemaVersion) ||
    artifact?.sourceArchive?.sha256 !==
      manifest.artifact.sourceArchiveSha256 ||
    artifact?.migration?.latest !== manifest.migration.latest ||
    artifact?.migration?.sequenceSha256 !== manifest.migration.sequenceSha256 ||
    artifact?.customerConfig?.sourceSha256 !==
      manifest.customerConfig.sourceSha256 ||
    artifact?.sbom?.sha256 !== manifest.sbom?.sha256 ||
    releaseImages.size !== 2 ||
    artifactImages.size !== 2 ||
    [...releaseImages].some(([kind, image]) => {
      const source = artifactImages.get(kind);
      return (
        !source ||
        source.contentId !== image.sourceContentId ||
        source.platform !== image.platform
      );
    })
  ) {
    throw new Error("release artifact is not bound to the release manifest");
  }
  return artifact;
}

export function buildReleaseManifest({
  version,
  gitSha,
  strictTerminal,
  artifactManifest,
  artifactManifestSha256,
  images,
  rehearsalReceipt,
  rehearsalReceiptSha256,
  createdAt = new Date().toISOString(),
}) {
  if (
    rehearsalReceipt === undefined ||
    rehearsalReceiptSha256 === undefined
  ) {
    throw new Error(
      "new release publication requires the rehearsal receipt and digest",
    );
  }
  const { sourceByKind } = validateReleasePublicationEvidence({
    version,
    gitSha,
    strictTerminal,
    artifactManifest,
    artifactManifestSha256,
    rehearsalReceipt,
    rehearsalReceiptSha256,
  });
  return validateReleaseManifest({
    schemaVersion: RELEASE_MANIFEST_CONTRACT_V2,
    passed: true,
    version,
    createdAt,
    gitSha,
    strict: strictManifestEvidence(strictTerminal),
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
    rehearsal: buildReleaseRehearsalEvidence(
      rehearsalReceipt,
      rehearsalReceiptSha256,
    ),
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
  if (manifest.schemaVersion !== RELEASE_MANIFEST_CONTRACT_V2) {
    throw new Error("only release manifest v2 can be newly written");
  }
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
