#!/usr/bin/env node

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  assertReleaseArtifactManifest,
  runArtifactCommand,
} from "./release-artifact-bundle.mjs";

class VerificationError extends Error {}

const IMAGE_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;

function sha256File(filePath) {
  return crypto
    .createHash("sha256")
    .update(readFileSync(filePath))
    .digest("hex");
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safeArtifactFile(bundleDir, relativeFile) {
  const target = path.resolve(bundleDir, relativeFile);
  if (!target.startsWith(`${bundleDir}${path.sep}`)) {
    throw new VerificationError("artifact file escapes its bundle directory");
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    throw new VerificationError(`artifact file is missing: ${relativeFile}`);
  }
  return target;
}

function inspectLoadedImage(imageRef, repoRoot, runCommand) {
  const raw = runCommand({
    command: "docker",
    args: ["image", "inspect", imageRef],
    cwd: repoRoot,
    label: `inspect loaded image ${imageRef}`,
  });
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new VerificationError(`loaded image is not unique: ${imageRef}`);
  }
  return parsed[0];
}

function readImageArchiveJson(
  archivePath,
  member,
  repoRoot,
  runCommand,
) {
  const raw = runCommand({
    command: "tar",
    args: ["-xOf", archivePath, member],
    cwd: repoRoot,
    label: `read image archive member ${member}`,
  });
  try {
    return { raw, value: JSON.parse(raw) };
  } catch {
    throw new VerificationError(`image archive member is not JSON: ${member}`);
  }
}

export function inspectPortableImageArchiveIdentity(
  archivePath,
  image,
  repoRoot,
  runCommand,
) {
  const configPath = `blobs/sha256/${image.contentId.slice("sha256:".length)}`;
  const dockerManifest = readImageArchiveJson(
    archivePath,
    "manifest.json",
    repoRoot,
    runCommand,
  ).value;
  if (
    !Array.isArray(dockerManifest) ||
    dockerManifest.length !== 1 ||
    dockerManifest[0]?.Config !== configPath ||
    !Array.isArray(dockerManifest[0]?.RepoTags) ||
    dockerManifest[0].RepoTags.length !== 1 ||
    dockerManifest[0].RepoTags[0] !== image.ref
  ) {
    throw new VerificationError(
      `${image.kind} image archive tag or config identity is invalid`,
    );
  }
  const archiveConfig = readImageArchiveJson(
    archivePath,
    configPath,
    repoRoot,
    runCommand,
  );
  if (
    sha256Text(archiveConfig.raw) !==
    image.contentId.slice("sha256:".length)
  ) {
    throw new VerificationError(
      `${image.kind} image archive config checksum does not match`,
    );
  }
  const index = readImageArchiveJson(
    archivePath,
    "index.json",
    repoRoot,
    runCommand,
  ).value;
  const manifestDigest =
    index?.schemaVersion === 2 && index?.manifests?.length === 1
      ? index.manifests[0]?.digest
      : "";
  if (!IMAGE_DIGEST_PATTERN.test(String(manifestDigest || ""))) {
    throw new VerificationError(
      `${image.kind} image archive manifest identity is invalid`,
    );
  }
  const manifestMember =
    `blobs/sha256/${manifestDigest.slice("sha256:".length)}`;
  const archiveManifest = readImageArchiveJson(
    archivePath,
    manifestMember,
    repoRoot,
    runCommand,
  );
  if (
    sha256Text(archiveManifest.raw) !==
      manifestDigest.slice("sha256:".length) ||
    archiveManifest.value?.schemaVersion !== 2 ||
    archiveManifest.value?.config?.digest !== image.contentId
  ) {
    throw new VerificationError(
      `${image.kind} image archive manifest does not bind the config identity`,
    );
  }
  return {
    configDigest: image.contentId,
    manifestDigest,
  };
}

export function verifyReleaseArtifact(
  manifestPath,
  options = {},
  runtime = {},
) {
  const absoluteManifest = realpathSync(manifestPath);
  const bundleDir = path.dirname(absoluteManifest);
  const manifest = assertReleaseArtifactManifest(
    JSON.parse(readFileSync(absoluteManifest, "utf8")),
  );
  const sbomPath = safeArtifactFile(bundleDir, manifest.sbom.file);
  if (
    statSync(sbomPath).size !== manifest.sbom.sizeBytes ||
    sha256File(sbomPath) !== manifest.sbom.sha256
  ) {
    throw new VerificationError("SBOM checksum or size does not match");
  }
  const sbom = JSON.parse(readFileSync(sbomPath, "utf8"));
  if (
    sbom?.bomFormat !== "CycloneDX" ||
    sbom?.specVersion !== manifest.sbom.specVersion ||
    sbom?.components?.length !== manifest.sbom.componentCount
  ) {
    throw new VerificationError("SBOM identity does not match manifest");
  }

  const runCommand = runtime.runCommand || runArtifactCommand;
  const repoRoot = runtime.repoRoot || process.cwd();
  const images = [];
  for (const image of manifest.images) {
    const archivePath = safeArtifactFile(bundleDir, image.archive.file);
    if (
      statSync(archivePath).size !== image.archive.sizeBytes ||
      sha256File(archivePath) !== image.archive.sha256
    ) {
      throw new VerificationError(
        `${image.kind} image archive checksum or size does not match`,
      );
    }
    if (options.load === true) {
      const archiveIdentity = inspectPortableImageArchiveIdentity(
        archivePath,
        image,
        repoRoot,
        runCommand,
      );
      runCommand({
        command: "docker",
        args: ["image", "load", "--input", archivePath],
        cwd: repoRoot,
        label: `load ${image.kind} image archive`,
      });
      const inspected = inspectLoadedImage(image.ref, repoRoot, runCommand);
      const embeddedGitSha = (inspected?.Config?.Env || [])
        .find((item) => item.startsWith("GIT_SHA="))
        ?.slice("GIT_SHA=".length);
      if (
        ![image.contentId, archiveIdentity.manifestDigest].includes(
          inspected?.Id,
        ) ||
        inspected?.Os !== "linux" ||
        inspected?.Architecture !== "amd64" ||
        embeddedGitSha !== manifest.git.commit
      ) {
        throw new VerificationError(
          `${image.kind} loaded image identity does not match manifest`,
        );
      }
      images.push({
        kind: image.kind,
        contentId: image.contentId,
        archiveManifestDigest: archiveIdentity.manifestDigest,
        loadedImageId: inspected.Id,
        gitSha: embeddedGitSha,
        platform: `${inspected.Os}/${inspected.Architecture}`,
      });
    }
  }
  return {
    schemaVersion: "plush-release-artifact-verification/v1",
    passed: true,
    commit: manifest.git.commit,
    customer: manifest.customer,
    manifestFile: path.basename(absoluteManifest),
    checks: {
      manifest: "passed",
      sbom: "passed",
      imageArchives: "passed",
      loadedImageIdentity: options.load === true ? "passed" : "not-executed",
    },
    images,
    redaction: {
      containsSecrets: false,
      containsFullDsn: false,
      containsAbsolutePaths: false,
    },
  };
}

function parseArgs(argv) {
  const options = { load: false, json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--load") {
      options.load = true;
      continue;
    }
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--manifest") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new VerificationError("missing value for --manifest");
      }
      options.manifest = value;
      index += 1;
      continue;
    }
    throw new VerificationError(`unsupported argument: ${token}`);
  }
  return options;
}

const USAGE = `Release artifact verifier

Usage:
  node scripts/deploy/release-artifact-verify.mjs --manifest output/releases/<sha>/release-artifact.json [--load] [--json]

Without --load, verifies the manifest, SBOM and archive checksums. With --load,
also loads both archives and proves image content IDs, linux/amd64 platform and
embedded GIT_SHA. It does not start services or contact a target environment.`;

function isMainModule() {
  try {
    return (
      realpathSync(fileURLToPath(import.meta.url)) ===
      realpathSync(process.argv[1])
    );
  } catch {
    return false;
  }
}

if (isMainModule()) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(USAGE);
      process.exit(0);
    }
    if (!options.manifest) {
      throw new VerificationError("--manifest is required");
    }
    const report = verifyReleaseArtifact(options.manifest, options);
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(
        `release artifact verification passed commit=${report.commit} loaded=${options.load}`,
      );
    }
  } catch (error) {
    console.error(`[release-artifact-verify] ${error.message}`);
    process.exit(1);
  }
}
