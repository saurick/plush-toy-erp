#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { assertReleaseArtifactManifest } from "./release-artifact-bundle.mjs";
import {
  buildReleaseManifest,
  sha256File,
  validateReleasePublicationEvidence,
  validateReleaseRehearsalReceipt,
  writeReleaseManifest,
} from "./release-catalog.mjs";

const REPOSITORY_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?\/[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?$/u;
const DIGEST_PATTERN = /digest:\s*(sha256:[0-9a-f]{64})\b/iu;

function commandDisplay(command, args) {
  return [command, ...args]
    .map((part) =>
      /^[A-Za-z0-9_./:=@+-]+$/u.test(part) ? part : JSON.stringify(part),
    )
    .join(" ");
}

function runCommand(command, args, { cwd, acceptedStatuses = [0] } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || !acceptedStatuses.includes(result.status)) {
    const detail = String(
      result.stderr || result.stdout || result.error?.message || "",
    )
      .trim()
      .split("\n")[0];
    throw new Error(
      `${commandDisplay(command, args)} failed${detail ? `: ${detail}` : ""}`,
    );
  }
  return {
    status: result.status,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
  };
}

export function parseDockerPushDigest(output) {
  const matches = [
    ...String(output || "").matchAll(new RegExp(DIGEST_PATTERN, "giu")),
  ].map((match) => match[1].toLowerCase());
  const unique = [...new Set(matches)];
  if (unique.length !== 1) {
    throw new Error("docker push did not report one immutable digest");
  }
  return unique[0];
}

function inspectImage(root, ref, run = runCommand) {
  const result = run("docker", ["image", "inspect", ref], { cwd: root });
  const parsed = JSON.parse(result.stdout);
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new Error(`docker image inspect was not unique: ${ref}`);
  }
  return parsed[0];
}

export function assertLoadedImage(image, source, gitSha, releaseVersion) {
  const embeddedSha = (image?.Config?.Env || [])
    .find((item) => item.startsWith("GIT_SHA="))
    ?.slice("GIT_SHA=".length);
  const embeddedReleaseVersion = (image?.Config?.Env || [])
    .find((item) => item.startsWith("RELEASE_VERSION="))
    ?.slice("RELEASE_VERSION=".length);
  const allowedImageIds = [
    source.contentId,
    source.archive?.manifestDigest,
  ].filter(Boolean);
  if (
    !allowedImageIds.includes(image?.Id) ||
    image?.Os !== "linux" ||
    image?.Architecture !== "amd64" ||
    embeddedSha !== gitSha ||
    (releaseVersion !== undefined && embeddedReleaseVersion !== releaseVersion)
  ) {
    throw new Error(`loaded ${source.kind} image identity is invalid`);
  }
}

function existingDigest(
  root,
  targetTag,
  source,
  gitSha,
  releaseVersion,
  run = runCommand,
) {
  const probe = run("docker", ["manifest", "inspect", targetTag], {
    cwd: root,
    acceptedStatuses: [0, 1],
  });
  if (probe.status === 1) {
    const detail = `${probe.stdout}\n${probe.stderr}`;
    if (!/manifest unknown|no such manifest|not found/u.test(detail)) {
      throw new Error(`registry probe failed for ${targetTag}`);
    }
    return "";
  }
  run("docker", ["pull", targetTag], { cwd: root });
  const existing = inspectImage(root, targetTag, run);
  assertLoadedImage(existing, source, gitSha, releaseVersion);
  const repository = targetTag.slice(0, targetTag.lastIndexOf(":"));
  const digestRef = (existing.RepoDigests || []).find((item) =>
    item.startsWith(`${repository}@sha256:`),
  );
  if (!digestRef) {
    throw new Error(`existing registry image has no digest: ${targetTag}`);
  }
  return digestRef.slice(digestRef.indexOf("@") + 1);
}

function publishImage({
  root,
  artifactDir,
  source,
  gitSha,
  releaseVersion,
  repository,
  run = runCommand,
}) {
  const archive = path.join(artifactDir, source.archive.file);
  run("docker", ["load", "--input", archive], { cwd: root });
  const loaded = inspectImage(root, source.ref, run);
  assertLoadedImage(loaded, source, gitSha, releaseVersion);
  const targetTag = `${repository}:sha-${gitSha}`;
  const reusedDigest = existingDigest(
    root,
    targetTag,
    source,
    gitSha,
    releaseVersion,
    run,
  );
  if (reusedDigest) {
    return {
      kind: source.kind,
      repository,
      digest: reusedDigest,
      reused: true,
    };
  }
  run("docker", ["tag", source.ref, targetTag], { cwd: root });
  const pushed = run("docker", ["push", targetTag], { cwd: root });
  const digest = parseDockerPushDigest(`${pushed.stdout}\n${pushed.stderr}`);
  return { kind: source.kind, repository, digest, reused: false };
}

export function publishGitHubReleaseArtifact(
  {
    artifactDir,
    strictTerminalPath,
    rehearsalReceiptPath,
    version,
    repository,
    out,
  },
  { root = process.cwd(), run = runCommand } = {},
) {
  if (!REPOSITORY_PATTERN.test(String(repository || ""))) {
    throw new Error("GitHub repository must be owner/name");
  }
  const normalizedRepository = repository.toLowerCase();
  const resolvedArtifactDir = path.resolve(root, artifactDir);
  const artifactPath = path.join(resolvedArtifactDir, "release-artifact.json");
  const artifactManifest = assertReleaseArtifactManifest(
    JSON.parse(readFileSync(artifactPath, "utf8")),
  );
  const strictTerminal = JSON.parse(
    readFileSync(path.resolve(root, strictTerminalPath), "utf8"),
  );
  const gitSha = artifactManifest.git.commit;
  const resolvedRehearsalReceiptPath = path.resolve(root, rehearsalReceiptPath);
  if (
    resolvedRehearsalReceiptPath !==
    path.join(resolvedArtifactDir, "release-rehearsal.json")
  ) {
    throw new Error(
      "new publication requires artifact-dir/release-rehearsal.json",
    );
  }
  const rehearsalReceipt = validateReleaseRehearsalReceipt(
    JSON.parse(readFileSync(resolvedRehearsalReceiptPath, "utf8")),
    artifactManifest,
    { sha: gitSha, version, customer: "yoyoosun" },
  );
  const artifactManifestSha256 = sha256File(artifactPath);
  const rehearsalReceiptSha256 = sha256File(resolvedRehearsalReceiptPath);
  validateReleasePublicationEvidence({
    version,
    gitSha,
    strictTerminal,
    artifactManifest,
    artifactManifestSha256,
    rehearsalReceipt,
    rehearsalReceiptSha256,
  });
  const embeddedReleaseVersion = artifactManifest.releaseVersion;
  if (
    embeddedReleaseVersion !== undefined &&
    embeddedReleaseVersion !== version
  ) {
    throw new Error(
      "release artifact version does not match requested version",
    );
  }
  const images = artifactManifest.images.map((source) =>
    publishImage({
      root,
      artifactDir: resolvedArtifactDir,
      source,
      gitSha,
      releaseVersion: embeddedReleaseVersion,
      repository: `ghcr.io/${normalizedRepository}-${source.kind}`,
      run,
    }),
  );
  const manifest = buildReleaseManifest({
    version,
    gitSha,
    strictTerminal,
    artifactManifest,
    artifactManifestSha256,
    images,
    createdAt: rehearsalReceipt.finishedAt,
    rehearsalReceipt,
    rehearsalReceiptSha256,
  });
  const outputPath = path.resolve(
    root,
    out || path.join(resolvedArtifactDir, "release-manifest.json"),
  );
  const written = writeReleaseManifest(outputPath, manifest);
  return { manifest, outputPath, reused: written.reused };
}

function parseArgs(argv) {
  const options = {
    artifactDir: "",
    strictTerminalPath: "",
    rehearsalReceiptPath: "",
    version: "",
    repository: "",
    out: "",
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    const mapping = {
      "--artifact-dir": "artifactDir",
      "--strict-terminal": "strictTerminalPath",
      "--rehearsal-receipt": "rehearsalReceiptPath",
      "--version": "version",
      "--repository": "repository",
      "--out": "out",
    };
    if (mapping[arg]) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      options[mapping[arg]] = value;
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/deploy/github-release-publisher.mjs \\
    --artifact-dir output/releases/<sha> \\
    --strict-terminal output/qa/exact-sha/<sha>/<fingerprint>.json \\
    --rehearsal-receipt output/releases/<sha>/release-rehearsal.json \\
    --version <version> --repository <owner/name> [--out <file>] [--json]

The caller must authenticate Docker to ghcr.io first. This adapter never accepts
or logs a token. Existing sha tags are reused only when the pulled image config
digest, platform, embedded release version and GIT_SHA match the local immutable artifact.`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  for (const field of [
    "artifactDir",
    "strictTerminalPath",
    "rehearsalReceiptPath",
    "version",
    "repository",
  ]) {
    if (!options[field]) throw new Error(`${field} is required`);
  }
  const result = publishGitHubReleaseArtifact(options);
  console.log(
    options.json
      ? JSON.stringify(
          {
            status: "passed",
            gitSha: result.manifest.gitSha,
            version: result.manifest.version,
            outputPath: path.relative(process.cwd(), result.outputPath),
            images: result.manifest.images,
          },
          null,
          2,
        )
      : `[github-release-publisher] status=passed version=${result.manifest.version} sha=${result.manifest.gitSha} manifest=${path.relative(process.cwd(), result.outputPath)}`,
  );
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(
      `[github-release-publisher] status=blocked reason=${error.message}`,
    );
    process.exitCode = 2;
  }
}
