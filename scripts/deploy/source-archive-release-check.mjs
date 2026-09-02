#!/usr/bin/env node

import crypto from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { findBrokenLocalMarkdownLinks } from "../qa/lib/markdown-links.mjs";

const DEFAULT_CUSTOMER = "yoyoosun";
const DEFAULT_REF = "HEAD";
const CUSTOMER_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const VERSION_PATTERN = /^[0-9A-Za-z](?:[0-9A-Za-z._-]{0,62}[0-9A-Za-z])?$/u;
const MODES = new Set(["plan", "light", "release"]);
const MAX_COMMAND_DIAGNOSTIC_CHARS = 4096;
const BUILDKIT_CACHE_MODES = new Set(["builder", "gha"]);
const ANSI_ESCAPE_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/gu;
const CUSTOMER_SOURCE_EXTENSIONS = new Set([
  ".doc",
  ".docx",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".xls",
  ".xlsx",
]);

function isCustomerSourceLikeFile(relativePath) {
  return CUSTOMER_SOURCE_EXTENSIONS.has(
    path.posix.extname(relativePath).toLowerCase(),
  );
}

function isApprovedCustomerPublicAsset(relativePath) {
  return relativePath.split("/").includes("public-assets");
}

export const CUSTOMER_WEB_OVERLAY_ARCHIVE_INPUTS = Object.freeze([
  "scripts/build/apply-customer-web-config.mjs",
  "config/customers/index.mjs",
  "config/customers/demo/customerPackage.mjs",
  "config/customers/reference-customer/customerPackage.mjs",
  "config/customers/yoyoosun/customerPackage.mjs",
  "config/customers/yoyoosun/releasePackage.mjs",
  "config/customers/yoyoosun/roleFlowMatrix.mjs",
]);

export const REQUIRED_ARCHIVE_PATHS = Object.freeze([
  ".dockerignore",
  ".gitattributes",
  ...CUSTOMER_WEB_OVERLAY_ARCHIVE_INPUTS,
  "scripts/gen-error-codes.mjs",
  "scripts/lib/pnpm.sh",
  "scripts/qa/secrets.sh",
  "web/Dockerfile",
  "web/index.html",
  "web/package.json",
  "web/pnpm-lock.yaml",
  "web/public/customer-config.js",
  "web/vite.config.mjs",
  "web/vite.shared.mjs",
  "server/Dockerfile",
  "server/cmd/server/main.go",
  "server/configs/prod/config.yaml",
  "server/go.mod",
  "server/go.sum",
  "server/internal/errcode/catalog.go",
]);

const ALLOWED_ENV_FILES = new Set([
  "web/.env.development",
  "web/.env.production",
]);
const TEMPORARY_MARKER_PATH_PATTERN =
  /(?:^|\/)(?:[^/]*_DELETE_ME(?:\.[^/]*)?|[^/]*GITHUB_WRITE_TEST[^/]*)$/iu;

const USAGE = `Source archive release check

Usage:
  node scripts/deploy/source-archive-release-check.mjs
  node scripts/deploy/source-archive-release-check.mjs --light [--ref HEAD]
  node scripts/deploy/source-archive-release-check.mjs --execute [--docker] [--ref HEAD] [--version <version>]

Modes:
  plan       Default. Read Git metadata and print the committed-tree release plan.
  light      Create and inspect a temporary git archive, then run the customer Web overlay.
  release    --execute only. Requires a clean worktree, then runs archive scan and strict
             secret scan. Without --docker it runs host Web/Go builds; with --docker it builds
             the Web and Server runtime targets from one shared Dockerfile cache graph.

Options:
  --customer <key>  Customer Web package key. Defaults to yoyoosun.
  --ref <commit>    Committed Git tree to archive. Defaults to HEAD.
  --version <value> Human-readable release version embedded with the exact Git SHA.
  --light           Run the lightweight archive extraction check.
  --execute         Run the clean-worktree release check.
  --docker          With --execute, build both Web and server Docker images.
  --json            Print JSON only.
  --help            Print this help.

The script never archives the live worktree. A dirty worktree may be inspected in plan/light
mode, but it is never eligible for formal release evidence and --execute fails closed.`;

class ReleaseCheckError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ReleaseCheckError";
    this.details = details;
  }
}

export function parseCliArgs(argv) {
  const options = {
    customer: DEFAULT_CUSTOMER,
    ref: DEFAULT_REF,
    mode: "plan",
    docker: false,
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--light") {
      if (options.mode === "release") {
        throw new ReleaseCheckError(
          "--light cannot be combined with --execute",
        );
      }
      options.mode = "light";
      continue;
    }
    if (token === "--execute") {
      if (options.mode === "light") {
        throw new ReleaseCheckError(
          "--execute cannot be combined with --light",
        );
      }
      options.mode = "release";
      continue;
    }
    if (token === "--docker") {
      options.docker = true;
      continue;
    }
    if (token === "--customer" || token === "--ref" || token === "--version") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new ReleaseCheckError(`missing value for ${token}`);
      }
      options[token.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new ReleaseCheckError(`unsupported argument: ${token}`);
  }
  if (options.docker && options.mode !== "release") {
    throw new ReleaseCheckError("--docker requires --execute");
  }
  return options;
}

function commandDisplay(command, args) {
  return [command, ...args]
    .map((part) =>
      /^[A-Za-z0-9_./:=@+-]+$/u.test(part) ? part : JSON.stringify(part),
    )
    .join(" ");
}

function formatCommandDiagnostic(value) {
  const sanitized = String(value || "")
    .replace(ANSI_ESCAPE_PATTERN, "")
    .replace(/\r\n?/gu, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "�")
    .trim();
  if (sanitized.length <= MAX_COMMAND_DIAGNOSTIC_CHARS) {
    return sanitized;
  }

  const marker = "\n...[stderr truncated]...\n";
  const retained = MAX_COMMAND_DIAGNOSTIC_CHARS - marker.length;
  const headLength = Math.ceil(retained / 2);
  return `${sanitized.slice(0, headLength)}${marker}${sanitized.slice(
    -(retained - headLength),
  )}`;
}

export function runCommand({
  command,
  args = [],
  cwd,
  env = process.env,
  label,
  stdio = "pipe",
}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio,
  });
  if (result.error) {
    throw new ReleaseCheckError(
      `${label} could not start: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    const stderr = formatCommandDiagnostic(result.stderr);
    const stderrDetails = stderr ? `\nstderr:\n${stderr}` : "";
    throw new ReleaseCheckError(
      `${label} failed with exit ${result.status}: ${commandDisplay(command, args)}${stderrDetails}`,
    );
  }
  return {
    label,
    command: commandDisplay(command, args),
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
  };
}

export function resolveProjectPnpm({ archiveRoot, env = process.env }) {
  const resolverPath = path.join(archiveRoot, "scripts/lib/pnpm.sh");
  const resolverResult = runCommand({
    command: "bash",
    args: [
      "-c",
      'source "$1"; require_project_node "$2"; resolve_project_pnpm "$2"',
      "source-archive-toolchain",
      resolverPath,
      archiveRoot,
    ],
    cwd: archiveRoot,
    env: {
      ...env,
      PATH: [path.dirname(process.execPath), env.PATH]
        .filter(Boolean)
        .join(path.delimiter),
    },
    label: "resolve locked Node and pnpm toolchain",
  });
  const resolved = resolverResult.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
  if (!resolved) {
    throw new ReleaseCheckError(
      "locked Node and pnpm resolver returned an empty pnpm path",
    );
  }
  const pnpmBin = path.isAbsolute(resolved)
    ? resolved
    : path.resolve(archiveRoot, resolved);
  if (!existsSync(pnpmBin)) {
    throw new ReleaseCheckError(
      `locked Node and pnpm resolver returned a missing pnpm path: ${pnpmBin}`,
    );
  }
  return pnpmBin;
}

function gitOutput(repoRoot, args, label) {
  return runCommand({
    command: "git",
    args,
    cwd: repoRoot,
    label,
  }).stdout.trim();
}

function assertCustomerKey(customer) {
  if (!CUSTOMER_KEY_PATTERN.test(customer)) {
    throw new ReleaseCheckError(
      `customer key must match ${CUSTOMER_KEY_PATTERN.source}: ${customer}`,
    );
  }
}

function readGitState(repoRoot, ref) {
  const root = realpathSync(repoRoot);
  const commit = gitOutput(
    root,
    ["rev-parse", `${ref}^{commit}`],
    "resolve Git ref",
  );
  const head = gitOutput(root, ["rev-parse", "HEAD"], "resolve Git HEAD");
  const dirtyEntries = gitOutput(
    root,
    ["status", "--porcelain", "--untracked-files=all"],
    "read Git worktree state",
  )
    .split(/\r?\n/u)
    .filter(Boolean);
  return {
    repoRoot: root,
    ref,
    commit,
    shortCommit: commit.slice(0, 12),
    head,
    refIsHead: commit === head,
    clean: dirtyEntries.length === 0,
    dirtyEntryCount: dirtyEntries.length,
  };
}

function inspectCommittedCustomerBoundary({ repoRoot, commit }) {
  const trackedFiles = runCommand({
    command: "git",
    args: ["ls-tree", "-r", "--name-only", "-z", commit],
    cwd: repoRoot,
    label: "inspect committed Product Core customer-source boundary",
  })
    .stdout.split("\0")
    .filter(Boolean);
  const isRawSource = (relativePath) =>
    /^docs\/customers\/[^/]+\/raw-source-files\//u.test(relativePath);
  const isPrivateManifest = (relativePath) =>
    relativePath.startsWith("docs/customers/") &&
    path.posix.extname(relativePath).toLowerCase() === ".json";
  const counts = {
    rawSources: trackedFiles.filter(isRawSource).length,
    privateManifests: trackedFiles.filter(isPrivateManifest).length,
    customerDocumentBinaries: trackedFiles.filter(
      (relativePath) =>
        relativePath.startsWith("docs/customers/") &&
        !isRawSource(relativePath) &&
        !isApprovedCustomerPublicAsset(relativePath) &&
        isCustomerSourceLikeFile(relativePath),
    ).length,
    privateConfigAssets: trackedFiles.filter(
      (relativePath) =>
        relativePath.startsWith("config/customers/") &&
        !isApprovedCustomerPublicAsset(relativePath) &&
        isCustomerSourceLikeFile(relativePath),
    ).length,
    deploymentSourceBinaries: trackedFiles.filter(
      (relativePath) =>
        /^deployments\/[^/]+\//u.test(relativePath) &&
        isCustomerSourceLikeFile(relativePath),
    ).length,
  };
  const violationCount = Object.values(counts).reduce(
    (total, count) => total + count,
    0,
  );
  return {
    passed: violationCount === 0,
    violationCount,
    counts,
  };
}

function sha256File(filePath) {
  return `sha256:${crypto.createHash("sha256").update(readFileSync(filePath)).digest("hex")}`;
}

function normalizeRelative(root, targetPath) {
  return path.relative(root, targetPath).split(path.sep).join("/");
}

function walkArchive(root) {
  const files = [];
  const symlinks = [];
  const visit = (currentPath) => {
    for (const entry of readdirSync(currentPath)) {
      const entryPath = path.join(currentPath, entry);
      const stat = lstatSync(entryPath);
      const relativePath = normalizeRelative(root, entryPath);
      if (stat.isSymbolicLink()) {
        symlinks.push(relativePath);
        continue;
      }
      if (stat.isDirectory()) {
        visit(entryPath);
      } else if (stat.isFile()) {
        files.push(relativePath);
      }
    }
  };
  visit(root);
  return { files: files.sort(), symlinks: symlinks.sort() };
}

function isAllowedEnvFile(relativePath) {
  return (
    relativePath.endsWith("/.env.example") ||
    ALLOWED_ENV_FILES.has(relativePath)
  );
}

function scanArchiveInventory({ archiveRoot, customer }) {
  const inventory = walkArchive(archiveRoot);
  const missingPaths = [
    ...REQUIRED_ARCHIVE_PATHS,
    `config/customers/${customer}/customer-config.example.js`,
    `config/customers/${customer}/public-assets`,
  ].filter((relativePath) => !existsSync(path.join(archiveRoot, relativePath)));
  const forbiddenPaths = inventory.files.filter((relativePath) => {
    if (TEMPORARY_MARKER_PATH_PATTERN.test(relativePath)) {
      return true;
    }
    if (relativePath.startsWith("docs/customers/")) {
      return true;
    }
    if (
      relativePath.startsWith("config/customers/") &&
      !isApprovedCustomerPublicAsset(relativePath) &&
      isCustomerSourceLikeFile(relativePath)
    ) {
      return true;
    }
    if (
      /^deployments\/[^/]+\//u.test(relativePath) &&
      isCustomerSourceLikeFile(relativePath)
    ) {
      return true;
    }
    if (/(^|\/)raw-source-files\//u.test(relativePath)) {
      return true;
    }
    if (
      /(^|\/)\.env($|\.)/u.test(relativePath) &&
      !isAllowedEnvFile(relativePath)
    ) {
      return true;
    }
    return false;
  });
  const markdownFiles = inventory.files.filter((relativePath) =>
    relativePath.endsWith(".md"),
  );
  const brokenMarkdownLinks = findBrokenLocalMarkdownLinks({
    rootDir: archiveRoot,
    sourceFiles: markdownFiles,
    ignoredPrefixes: ["docs/archive/", "progress.md"],
  });
  if (
    missingPaths.length > 0 ||
    forbiddenPaths.length > 0 ||
    inventory.symlinks.length > 0 ||
    brokenMarkdownLinks.length > 0
  ) {
    throw new ReleaseCheckError("source archive inventory check failed", {
      missingPaths,
      forbiddenPaths,
      symlinks: inventory.symlinks,
      brokenMarkdownLinks,
    });
  }
  return {
    fileCount: inventory.files.length,
    markdownFileCount: markdownFiles.length,
    missingPaths,
    forbiddenPaths,
    symlinks: inventory.symlinks,
    brokenMarkdownLinks,
  };
}

function verifyOverlayOutput({ archiveRoot, buildDir, customer }) {
  const configPath = path.join(buildDir, "customer-config.js");
  const assetsDir = path.join(buildDir, "customer-assets", customer);
  if (!existsSync(configPath) || !statSync(configPath).isFile()) {
    throw new ReleaseCheckError(
      "customer overlay did not publish customer-config.js",
    );
  }
  if (!existsSync(assetsDir) || !statSync(assetsDir).isDirectory()) {
    throw new ReleaseCheckError(
      `customer overlay did not publish assets for ${customer}`,
    );
  }
  const configSource = readFileSync(configPath, "utf8");
  if (!configSource.includes(`customerKey: "${customer}"`)) {
    throw new ReleaseCheckError(
      "published customer-config.js customer key mismatch",
    );
  }
  const sourcePrivateAssets = path.join(
    archiveRoot,
    "config",
    "customers",
    customer,
    "assets",
  );
  if (
    existsSync(sourcePrivateAssets) &&
    walkArchive(sourcePrivateAssets).files.length > 0
  ) {
    throw new ReleaseCheckError(
      "private customer assets unexpectedly exist in source archive",
    );
  }
  return {
    configPath: normalizeRelative(archiveRoot, configPath),
    assetsPath: normalizeRelative(archiveRoot, assetsDir),
  };
}

function applyArchivedCustomerOverlay({ archiveRoot, buildDir, customer }) {
  mkdirSync(buildDir, { recursive: true });
  runCommand({
    command: process.execPath,
    args: [
      path.join(archiveRoot, "scripts/build/apply-customer-web-config.mjs"),
      "--customer",
      customer,
      "--config-root",
      path.join(archiveRoot, "config"),
      "--web-build-dir",
      buildDir,
    ],
    cwd: archiveRoot,
    label: "apply customer Web overlay",
  });
  return verifyOverlayOutput({ archiveRoot, buildDir, customer });
}

function createArchive({ repoRoot, commit, workspace }) {
  const archivePath = path.join(workspace, "source.tar");
  const archiveRoot = path.join(workspace, "source");
  mkdirSync(archiveRoot, { recursive: true });
  runCommand({
    command: "git",
    args: ["archive", "--format=tar", `--output=${archivePath}`, commit],
    cwd: repoRoot,
    label: "create committed source archive",
  });
  runCommand({
    command: "tar",
    args: ["-xf", archivePath, "-C", archiveRoot],
    cwd: workspace,
    label: "extract committed source archive",
  });
  return {
    archivePath,
    archiveRoot: realpathSync(archiveRoot),
    archiveSha256: sha256File(archivePath),
  };
}

function buildPlan({ customer, gitState, docker }) {
  return [
    "git archive committed tree",
    "extract into isolated temporary directory",
    "verify required build inputs and reject broken active Markdown links, symlinks, raw customer sources, private customer assets, and runtime env files",
    "run strict source-package secret scan",
    ...(docker
      ? [
          `apply reviewed ${customer} Web config contract in an isolated check directory`,
          "build Web and Server runtime targets in one parallel Buildx Bake graph",
          "record BuildKit cache hits without weakening exact-SHA identity",
        ]
      : [
          "install locked Web dependencies and build production Web assets",
          `apply reviewed ${customer} Web config and public assets`,
          "build the Go server binary",
        ]),
    `bind result to commit ${gitState.commit}`,
  ];
}

function parseBuildTimestamp(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function summarizeBuildxRawJson(rawOutput) {
  const vertices = new Map();
  for (const line of String(rawOutput || "").split(/\r?\n/u)) {
    if (!line.trim().startsWith("{")) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const entries = Array.isArray(event?.vertexes) ? event.vertexes : [event];
    for (const entry of entries) {
      const id = entry?.digest || entry?.id;
      if (!id || typeof entry.name !== "string") continue;
      vertices.set(id, { ...(vertices.get(id) || {}), ...entry });
    }
  }
  const completed = [...vertices.values()].filter((entry) => {
    if (!parseBuildTimestamp(entry.completed)) return false;
    return !/(?:^|\])\s*(?:load build definition|load metadata|load build context|resolve image config|importing cache manifest|exporting cache|exporting to image)/iu.test(
      entry.name,
    );
  });
  const cacheHitCount = completed.filter(
    (entry) => entry.cached === true,
  ).length;
  const cacheMissCount = completed.length - cacheHitCount;
  return Object.freeze({
    completedVertexCount: completed.length,
    cacheHitCount,
    cacheMissCount,
    cacheHitRateBasisPoints:
      completed.length === 0
        ? 0
        : Math.round((cacheHitCount * 10_000) / completed.length),
  });
}

function releaseBuildCacheMode(environment) {
  const requested = String(
    environment.RELEASE_BUILDKIT_CACHE_MODE ||
      (environment.GITHUB_ACTIONS === "true" ? "gha" : "builder"),
  );
  if (!BUILDKIT_CACHE_MODES.has(requested)) {
    throw new ReleaseCheckError(
      `unsupported RELEASE_BUILDKIT_CACHE_MODE: ${requested}`,
    );
  }
  return requested;
}

function buildBakeDefinition({
  archiveRoot,
  customer,
  gitState,
  releaseVersion,
  webImage,
  serverImage,
  cacheMode,
}) {
  const shared = {
    context: archiveRoot,
    dockerfile: "server/Dockerfile",
    platforms: ["linux/amd64"],
    output: ["type=docker"],
    args: {
      ERP_CUSTOMER_PACKAGE: customer,
      GIT_SHA: gitState.commit,
      RELEASE_VERSION: releaseVersion,
    },
  };
  const withCache = (target, scope) => ({
    ...shared,
    target,
    ...(cacheMode === "gha"
      ? {
          "cache-from": [`type=gha,scope=${scope}`],
          "cache-to": [`type=gha,mode=max,scope=${scope}`],
        }
      : {}),
  });
  return {
    group: {
      default: {
        targets: ["release-web", "release-server"],
      },
    },
    target: {
      "release-web": {
        ...withCache("web-runtime", "plush-release-web-v1"),
        tags: [webImage],
      },
      "release-server": {
        ...withCache("server-runtime", "plush-release-server-v1"),
        tags: [serverImage],
        args: {
          ...shared.args,
          GIT_SHA_SHORT: gitState.shortCommit,
          IMAGE_TAG: gitState.shortCommit,
        },
      },
    },
  };
}

async function runReleaseBuilds({
  archiveRoot,
  customer,
  gitState,
  releaseVersion,
  docker,
  buildCommand,
  resolvePnpm,
  environment,
}) {
  const commands = [];
  const run = async (spec) => {
    const result = await buildCommand(spec);
    commands.push({
      label: spec.label,
      command: commandDisplay(spec.command, spec.args),
    });
    return result;
  };
  await run({
    command: "bash",
    args: ["scripts/qa/secrets.sh"],
    cwd: archiveRoot,
    env: { ...environment, SECRETS_STRICT: "1" },
    label: "strict source archive secret scan",
    stdio: "inherit",
  });

  if (docker) {
    const overlay = applyArchivedCustomerOverlay({
      archiveRoot,
      buildDir: path.join(archiveRoot, ".source-archive-overlay-check"),
      customer,
    });
    const webImage = `plush-source-archive-web:${gitState.shortCommit}`;
    const serverImage = `plush-source-archive-server:${gitState.shortCommit}`;
    const cacheMode = releaseBuildCacheMode(environment);
    const bakePath = path.join(
      path.dirname(archiveRoot),
      "release-buildx-bake.json",
    );
    writeFileSync(
      bakePath,
      `${JSON.stringify(
        buildBakeDefinition({
          archiveRoot,
          customer,
          gitState,
          releaseVersion,
          webImage,
          serverImage,
          cacheMode,
        }),
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    );
    const buildStartedAt = Date.now();
    let bakeResult;
    try {
      bakeResult = await run({
        command: "docker",
        args: [
          "buildx",
          "bake",
          "--file",
          bakePath,
          "--progress",
          "rawjson",
          "--provenance=false",
          "--sbom=false",
          ...(environment.RELEASE_BUILDX_BUILDER
            ? ["--builder", environment.RELEASE_BUILDX_BUILDER]
            : []),
        ],
        cwd: archiveRoot,
        label: "build Web and Server runtime targets in parallel",
        stdio: "pipe",
      });
    } finally {
      rmSync(bakePath, { force: true });
    }
    const buildDurationMs = Math.max(0, Date.now() - buildStartedAt);
    const cache = summarizeBuildxRawJson(
      `${String(bakeResult?.stdout || "")}\n${String(bakeResult?.stderr || "")}`,
    );
    return {
      commands,
      overlay,
      serverBinaryBuilt: true,
      dockerBuilt: true,
      dockerImages: [webImage, serverImage],
      buildReuse: {
        graph: "server/Dockerfile",
        webCompileCount: 1,
        goCompileCount: 1,
        targetsBuiltInParallel: true,
      },
      buildPerformance: {
        schemaVersion: "plush.release-build-performance/v1",
        durationMs: buildDurationMs,
        cacheMode,
        ...cache,
      },
    };
  }

  const pnpmBin = resolvePnpm({ archiveRoot });
  await run({
    command: pnpmBin,
    args: ["install", "--frozen-lockfile"],
    cwd: path.join(archiveRoot, "web"),
    label: "install locked Web dependencies",
    stdio: "inherit",
  });
  await run({
    command: pnpmBin,
    args: ["build:all"],
    cwd: path.join(archiveRoot, "web"),
    env: {
      ...environment,
      VITE_GIT_SHA: gitState.commit,
      VITE_RELEASE_VERSION: releaseVersion,
    },
    label: "build production Web assets",
    stdio: "inherit",
  });

  const webBuildDir = path.join(archiveRoot, "web", "build");
  if (!existsSync(webBuildDir) || !statSync(webBuildDir).isDirectory()) {
    throw new ReleaseCheckError("Web build did not create web/build");
  }
  const overlay = applyArchivedCustomerOverlay({
    archiveRoot,
    buildDir: webBuildDir,
    customer,
  });

  const serverBinary = path.join(
    path.dirname(archiveRoot),
    "source-archive-server-bin",
  );
  await run({
    command: "go",
    args: ["build", "-o", serverBinary, "./cmd/server"],
    cwd: path.join(archiveRoot, "server"),
    label: "build Go server binary",
    stdio: "inherit",
  });
  if (!existsSync(serverBinary) || !statSync(serverBinary).isFile()) {
    throw new ReleaseCheckError("Go build did not create the server binary");
  }

  return {
    commands,
    overlay,
    serverBinaryBuilt: true,
    dockerBuilt: false,
    dockerImages: [],
    buildReuse: {
      graph: "host",
      webCompileCount: 1,
      goCompileCount: 1,
      targetsBuiltInParallel: false,
    },
    buildPerformance: null,
  };
}

export async function runSourceArchiveReleaseCheck(options = {}, runtime = {}) {
  const normalized = {
    customer: DEFAULT_CUSTOMER,
    ref: DEFAULT_REF,
    mode: "plan",
    docker: false,
    ...options,
  };
  if (!MODES.has(normalized.mode)) {
    throw new ReleaseCheckError(`unsupported mode: ${normalized.mode}`);
  }
  if (normalized.docker && normalized.mode !== "release") {
    throw new ReleaseCheckError("Docker builds require release mode");
  }
  assertCustomerKey(normalized.customer);

  const repoRoot = runtime.repoRoot || process.cwd();
  const gitState = readGitState(repoRoot, normalized.ref);
  const releaseVersion = String(
    normalized.version || gitState.shortCommit,
  ).trim();
  if (!VERSION_PATTERN.test(releaseVersion)) {
    throw new ReleaseCheckError("release version is invalid");
  }
  const repositoryBoundary = inspectCommittedCustomerBoundary({
    repoRoot: gitState.repoRoot,
    commit: gitState.commit,
  });
  const plan = buildPlan({
    customer: normalized.customer,
    gitState,
    docker: normalized.docker,
  });
  const baseReport = {
    scope: "committed-source-archive-release-check",
    mode: normalized.mode,
    customer: normalized.customer,
    ref: gitState.ref,
    commit: gitState.commit,
    releaseVersion,
    head: gitState.head,
    refIsHead: gitState.refIsHead,
    worktreeClean: gitState.clean,
    dirtyEntryCount: gitState.dirtyEntryCount,
    source: "git archive committed tree",
    repositoryBoundary,
    plan,
    formalEvidenceEligible: false,
    notProven: [
      "target environment deployment",
      "target migration, backup restore, smoke, rollback, or customer sign-off",
      "current dirty worktree contents",
    ],
  };
  if (normalized.mode === "plan") {
    return baseReport;
  }
  if (!repositoryBoundary.passed) {
    throw new ReleaseCheckError(
      "committed Product Core customer-source boundary failed",
      { repositoryBoundary },
    );
  }
  if (normalized.mode === "release" && !gitState.refIsHead) {
    throw new ReleaseCheckError(
      "release source archive check requires --ref to resolve to the current HEAD",
      { gitState },
    );
  }
  if (normalized.mode === "release" && !gitState.clean) {
    throw new ReleaseCheckError(
      `release source archive check requires a clean worktree; dirty entries=${gitState.dirtyEntryCount}`,
      { gitState },
    );
  }

  const workspace = mkdtempSync(
    path.join(os.tmpdir(), "plush-source-archive-release-"),
  );
  try {
    const archive = createArchive({
      repoRoot: gitState.repoRoot,
      commit: gitState.commit,
      workspace,
    });
    const inventory = scanArchiveInventory({
      archiveRoot: archive.archiveRoot,
      customer: normalized.customer,
    });
    if (normalized.mode === "light") {
      const overlay = applyArchivedCustomerOverlay({
        archiveRoot: archive.archiveRoot,
        buildDir: path.join(
          archive.archiveRoot,
          ".source-archive-overlay-check",
        ),
        customer: normalized.customer,
      });
      return {
        ...baseReport,
        archiveSha256: archive.archiveSha256,
        inventory,
        overlay,
        lightCheckPassed: true,
      };
    }

    const buildCommand =
      runtime.runBuildCommand || ((spec) => runCommand(spec));
    const builds = await runReleaseBuilds({
      archiveRoot: archive.archiveRoot,
      customer: normalized.customer,
      gitState,
      releaseVersion,
      docker: normalized.docker,
      buildCommand,
      resolvePnpm: runtime.resolveProjectPnpm || resolveProjectPnpm,
      environment: runtime.environment || process.env,
    });
    return {
      ...baseReport,
      archiveSha256: archive.archiveSha256,
      inventory,
      ...builds,
      releaseCheckPassed: true,
      formalEvidenceEligible: true,
    };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function printHumanReport(report) {
  console.log(
    `source archive release check: mode=${report.mode}, version=${report.releaseVersion}, commit=${report.commit}, clean=${report.worktreeClean}`,
  );
  console.log(`formalEvidenceEligible: ${report.formalEvidenceEligible}`);
  for (const item of report.plan) {
    console.log(`- ${item}`);
  }
  if (report.lightCheckPassed) {
    console.log(
      `light check passed: files=${report.inventory.fileCount}, archive=${report.archiveSha256}`,
    );
  }
  if (report.releaseCheckPassed) {
    console.log(
      `release check passed: dockerBuilt=${report.dockerBuilt}, archive=${report.archiveSha256}`,
    );
  }
}

export function isMainModule(
  moduleUrl = import.meta.url,
  argvPath = process.argv[1],
) {
  if (!argvPath) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argvPath);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    if (options.help) {
      console.log(USAGE);
      process.exit(0);
    }
    const report = await runSourceArchiveReleaseCheck(options);
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHumanReport(report);
    }
  } catch (error) {
    const details =
      error?.details && Object.keys(error.details).length > 0
        ? ` ${JSON.stringify(error.details)}`
        : "";
    console.error(`[source-archive-release-check] ${error.message}${details}`);
    process.exit(1);
  }
}

export { ReleaseCheckError, USAGE };
