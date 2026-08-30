#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  constants as fsConstants,
  copyFileSync,
  createReadStream,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const CI_PLAYWRIGHT_RUNTIME_SCHEMA = "plush.ci-playwright-runtime/v1";
const EXPECTED_PROJECT = "saurick/plush-toy-erp";
const EXPECTED_API_URL = "https://gitlab.saurick.me/api/v4";
const PLAYWRIGHT_VERSION = "1.58.2";
const CHROMIUM_VERSION = "145.0.7632.6";
const CHROMIUM_REVISION = "1208";
const FFMPEG_REVISION = "1011";
const PACKAGE_NAME = "plush-ci-playwright-runtime";
const PACKAGE_VERSION = "playwright-1.58.2-linux-x64-r1208-v1";
const PACKAGE_FILE = "runtime.tar";
const PACKAGE_TIMEOUT_MS = 10 * 60 * 1_000;
export const CI_PLAYWRIGHT_RUNTIME_LOCAL_SEED_DIRECTORY =
  "/home/gitlab-runner/.plush-ci-playwright-runtime-seed-" + PACKAGE_VERSION;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;

export const CI_PLAYWRIGHT_RUNTIME_ASSETS = Object.freeze([
  Object.freeze({
    name: "chrome-linux64.zip",
    size: 175_440_843,
    sha256: "b5e3195041af345a668d110f5daf5581961fa3608626ea588c97dd0fe81c4e38",
    url: "https://edgedl.me.gvt1.com/edgedl/chrome/chrome-for-testing/145.0.7632.6/linux64/chrome-linux64.zip",
    directory: "chromium-1208",
    executable: path.join("chrome-linux64", "chrome"),
    sandbox: path.join("chrome-linux64", "chrome_sandbox"),
  }),
  Object.freeze({
    name: "chrome-headless-shell-linux64.zip",
    size: 116_288_461,
    sha256: "2536e97d8f410df0394b3e7c4252e88ce9f239f04f3af4e247a26caf45baf49e",
    url: "https://edgedl.me.gvt1.com/edgedl/chrome/chrome-for-testing/145.0.7632.6/linux64/chrome-headless-shell-linux64.zip",
    directory: "chromium_headless_shell-1208",
    executable: path.join(
      "chrome-headless-shell-linux64",
      "chrome-headless-shell",
    ),
    sandbox: null,
  }),
  Object.freeze({
    name: "ffmpeg-linux.zip",
    size: 2_376_500,
    sha256: "ebc74fc5b94830176a3c2914ae96bd8bc7f6a91f4f33890230f84a172ee61ccc",
    url: "https://cdn.playwright.dev/dbazure/download/playwright/builds/ffmpeg/1011/ffmpeg-linux.zip",
    directory: "ffmpeg-1011",
    executable: "ffmpeg-linux",
    sandbox: null,
  }),
]);

const ASSET_NAMES = Object.freeze(
  CI_PLAYWRIGHT_RUNTIME_ASSETS.map((asset) => asset.name),
);
const PACKAGE_MAX_BYTES =
  CI_PLAYWRIGHT_RUNTIME_ASSETS.reduce((total, asset) => total + asset.size, 0) +
  1024 * 1024;
const ARCHIVE_SET_SHA256 = createHash("sha256")
  .update(
    CI_PLAYWRIGHT_RUNTIME_ASSETS.map(
      ({ name, sha256, size }) => [name, size, sha256].join("\t") + "\n",
    ).join(""),
  )
  .digest("hex");

export const CI_PLAYWRIGHT_RUNTIME = Object.freeze({
  schemaVersion: CI_PLAYWRIGHT_RUNTIME_SCHEMA,
  playwrightVersion: PLAYWRIGHT_VERSION,
  chromiumVersion: CHROMIUM_VERSION,
  chromiumRevision: CHROMIUM_REVISION,
  ffmpegRevision: FFMPEG_REVISION,
  platform: "ubuntu24.04-x64",
  packageName: PACKAGE_NAME,
  packageVersion: PACKAGE_VERSION,
  packageFile: PACKAGE_FILE,
  archiveSetSha256: ARCHIVE_SET_SHA256,
});

function assertRegularFile(file) {
  const observed = lstatSync(file);
  if (!observed.isFile() || observed.isSymbolicLink()) {
    throw new Error("Playwright runtime input is not a regular file");
  }
  return observed;
}

function assertPrivateDirectory(directory) {
  const observed = lstatSync(directory);
  if (!observed.isDirectory() || observed.isSymbolicLink()) {
    throw new Error("Playwright runtime directory identity is invalid");
  }
}

function assertExactEntries(directory, expected) {
  const observed = readdirSync(directory).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(observed) !== JSON.stringify(wanted)) {
    throw new Error("Playwright runtime inventory is not exact");
  }
}

async function sha256File(file) {
  const digest = createHash("sha256");
  const stream = createReadStream(file);
  for await (const chunk of stream) digest.update(chunk);
  return digest.digest("hex");
}

export function assertRuntimeAssetObservation(asset, observation) {
  if (
    !asset ||
    !observation ||
    observation.size !== asset.size ||
    observation.sha256 !== asset.sha256 ||
    !SHA256_PATTERN.test(observation.sha256)
  ) {
    throw new Error("Playwright runtime asset checksum mismatch");
  }
  return true;
}

async function verifyAssetFile(directory, asset) {
  const file = path.join(directory, asset.name);
  const observed = assertRegularFile(file);
  assertRuntimeAssetObservation(asset, {
    size: observed.size,
    sha256: await sha256File(file),
  });
}

function assertRunnerLocalSeedIdentity(directory) {
  if (process.platform !== "linux" || typeof process.getuid !== "function") {
    throw new Error("Runner-local Playwright seed requires Linux identity");
  }
  const uid = process.getuid();
  const observedDirectory = lstatSync(directory);
  if (
    !observedDirectory.isDirectory() ||
    observedDirectory.isSymbolicLink() ||
    observedDirectory.uid !== uid ||
    (observedDirectory.mode & 0o777) !== 0o700
  ) {
    throw new Error("Runner-local Playwright seed directory is untrusted");
  }
  assertExactEntries(directory, ASSET_NAMES);
  for (const asset of CI_PLAYWRIGHT_RUNTIME_ASSETS) {
    const observedFile = lstatSync(path.join(directory, asset.name));
    if (
      !observedFile.isFile() ||
      observedFile.isSymbolicLink() ||
      observedFile.uid !== uid ||
      (observedFile.mode & 0o777) !== 0o600
    ) {
      throw new Error("Runner-local Playwright seed file is untrusted");
    }
  }
}

async function verifyRunnerLocalSeed(directory) {
  assertRunnerLocalSeedIdentity(directory);
  await verifyRuntimeArchiveSet(directory);
  assertRunnerLocalSeedIdentity(directory);
}

export async function verifyRuntimeArchiveSet(directory) {
  assertPrivateDirectory(directory);
  assertExactEntries(directory, ASSET_NAMES);
  for (const asset of CI_PLAYWRIGHT_RUNTIME_ASSETS) {
    await verifyAssetFile(directory, asset);
  }
  return Object.freeze({
    schemaVersion: CI_PLAYWRIGHT_RUNTIME_SCHEMA,
    archiveSetSha256: ARCHIVE_SET_SHA256,
    assetCount: CI_PLAYWRIGHT_RUNTIME_ASSETS.length,
  });
}

export function assertPinnedPlaywrightMetadata({ version, browsers }) {
  const byName = new Map(
    Array.isArray(browsers)
      ? browsers.map((browser) => [browser.name, browser])
      : [],
  );
  const chromium = byName.get("chromium");
  const headless = byName.get("chromium-headless-shell");
  const ffmpeg = byName.get("ffmpeg");
  if (
    version !== PLAYWRIGHT_VERSION ||
    chromium?.revision !== CHROMIUM_REVISION ||
    chromium?.browserVersion !== CHROMIUM_VERSION ||
    chromium?.installByDefault !== true ||
    headless?.revision !== CHROMIUM_REVISION ||
    headless?.browserVersion !== CHROMIUM_VERSION ||
    headless?.installByDefault !== true ||
    ffmpeg?.revision !== FFMPEG_REVISION ||
    ffmpeg?.installByDefault !== true
  ) {
    throw new Error(
      "Playwright package metadata does not match the pinned runtime",
    );
  }
  return true;
}

function assertInstalledPlaywrightMetadata(root) {
  const packageFile = path.join(
    root,
    "web",
    "node_modules",
    "playwright-core",
    "package.json",
  );
  const browsersFile = path.join(
    root,
    "web",
    "node_modules",
    "playwright-core",
    "browsers.json",
  );
  const packageJson = JSON.parse(readFileSync(packageFile, "utf8"));
  const browsersJson = JSON.parse(readFileSync(browsersFile, "utf8"));
  assertPinnedPlaywrightMetadata({
    version: packageJson.version,
    browsers: browsersJson.browsers,
  });
}

export function canBootstrapRuntimePackage(env) {
  return (
    env.GITLAB_CI === "true" &&
    env.CI_PROJECT_PATH === EXPECTED_PROJECT &&
    env.CI_PIPELINE_SOURCE === "push" &&
    env.CI_COMMIT_BRANCH === "main" &&
    env.CI_DEFAULT_BRANCH === "main" &&
    env.CI_COMMIT_REF_PROTECTED === "true" &&
    env.CI_JOB_NAME === "prepare" &&
    SHA_PATTERN.test(String(env.CI_COMMIT_SHA || "")) &&
    !env.RELEASE_SHA
  );
}

function assertGitLabIdentity(env) {
  if (
    env.GITLAB_CI !== "true" ||
    env.CI_PROJECT_PATH !== EXPECTED_PROJECT ||
    env.CI_DEFAULT_BRANCH !== "main" ||
    !/^\d+$/u.test(String(env.CI_PROJECT_ID || "")) ||
    !/^\d+$/u.test(String(env.CI_JOB_ID || "")) ||
    !SHA_PATTERN.test(String(env.CI_COMMIT_SHA || "")) ||
    env.CI_API_V4_URL !== EXPECTED_API_URL ||
    !String(env.CI_JOB_TOKEN || "") ||
    process.platform !== "linux" ||
    process.arch !== "x64"
  ) {
    throw new Error("Playwright runtime GitLab identity is untrusted");
  }
}

export function runtimePackageUrl(env) {
  if (
    env.CI_API_V4_URL !== EXPECTED_API_URL ||
    !/^\d+$/u.test(String(env.CI_PROJECT_ID || ""))
  ) {
    throw new Error("Playwright runtime package endpoint is untrusted");
  }
  return [
    env.CI_API_V4_URL,
    "projects",
    env.CI_PROJECT_ID,
    "packages",
    "generic",
    PACKAGE_NAME,
    PACKAGE_VERSION,
    PACKAGE_FILE,
  ].join("/");
}

export function expectedRuntimePaths(root, env) {
  if (!/^\d+$/u.test(String(env.CI_JOB_ID || ""))) {
    throw new Error("Playwright runtime job identity is invalid");
  }
  const archiveDirectory = path.join(
    root,
    "output",
    "cache",
    "gitlab",
    "playwright-runtime",
  );
  const browserDirectory = path.join(
    root,
    "output",
    "runtime",
    "gitlab",
    "playwright-" + env.CI_JOB_ID,
  );
  if (
    path.resolve(String(env.PLAYWRIGHT_RUNTIME_ARCHIVE_DIR || "")) !==
      archiveDirectory ||
    path.resolve(String(env.PLAYWRIGHT_BROWSERS_PATH || "")) !==
      browserDirectory
  ) {
    throw new Error("Playwright runtime paths do not match the job contract");
  }
  return Object.freeze({ archiveDirectory, browserDirectory });
}

async function downloadResponse(
  response,
  file,
  { exactBytes = null, maxBytes },
) {
  if (!response.body)
    throw new Error("Playwright runtime response body is missing");
  const declared = Number(response.headers.get("content-length"));
  if (
    (Number.isFinite(declared) && declared > maxBytes) ||
    (exactBytes !== null &&
      Number.isFinite(declared) &&
      declared > 0 &&
      declared !== exactBytes)
  ) {
    await response.body.cancel();
    throw new Error("Playwright runtime response size is invalid");
  }
  const handle = await open(file, "wx", 0o600);
  let observed = 0;
  const digest = createHash("sha256");
  try {
    for await (const chunk of response.body) {
      observed += chunk.byteLength;
      if (observed > maxBytes) {
        throw new Error("Playwright runtime response exceeded its size cap");
      }
      digest.update(chunk);
      let offset = 0;
      while (offset < chunk.byteLength) {
        const { bytesWritten } = await handle.write(
          chunk,
          offset,
          chunk.byteLength - offset,
        );
        if (bytesWritten <= 0) {
          throw new Error("Playwright runtime response write is incomplete");
        }
        offset += bytesWritten;
      }
    }
    await handle.sync();
  } catch (error) {
    await handle.close();
    rmSync(file, { force: true });
    throw error;
  }
  await handle.close();
  if (exactBytes !== null && observed !== exactBytes) {
    rmSync(file, { force: true });
    throw new Error("Playwright runtime response is incomplete");
  }
  return Object.freeze({ size: observed, sha256: digest.digest("hex") });
}

function runTool(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) {
    throw new Error("Playwright runtime " + command + " operation failed");
  }
  return String(result.stdout || "");
}

function assertBundleInventory(bundle, cwd) {
  const entries = runTool("tar", ["--list", "--file", bundle], cwd)
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (
    entries.length !== ASSET_NAMES.length ||
    JSON.stringify(entries.sort()) !== JSON.stringify([...ASSET_NAMES].sort())
  ) {
    throw new Error("Playwright runtime package inventory is not exact");
  }
}

function extractBundle(bundle, destination, cwd) {
  assertBundleInventory(bundle, cwd);
  mkdirSync(destination, { mode: 0o700 });
  runTool(
    "tar",
    [
      "--extract",
      "--file",
      bundle,
      "--directory",
      destination,
      "--no-same-owner",
      "--no-same-permissions",
    ],
    cwd,
  );
}

function createBundle(archiveDirectory, bundle, cwd) {
  runTool(
    "tar",
    [
      "--create",
      "--file",
      bundle,
      "--format=ustar",
      "--owner=0",
      "--group=0",
      "--numeric-owner",
      "--mtime=@0",
      "--sort=name",
      "--directory",
      archiveDirectory,
      ...ASSET_NAMES,
    ],
    cwd,
  );
  const observed = assertRegularFile(bundle);
  if (observed.size <= 0 || observed.size > PACKAGE_MAX_BYTES) {
    throw new Error("Playwright runtime package size is invalid");
  }
  assertBundleInventory(bundle, cwd);
}

function packageHeaders(env) {
  return Object.freeze({ "JOB-TOKEN": env.CI_JOB_TOKEN });
}

async function downloadPackageBundle(env, bundle) {
  const response = await fetch(runtimePackageUrl(env), {
    method: "GET",
    headers: packageHeaders(env),
    redirect: "error",
    signal: AbortSignal.timeout(PACKAGE_TIMEOUT_MS),
  });
  if (response.status === 404) {
    await response.body?.cancel();
    return false;
  }
  if (response.status !== 200) {
    await response.body?.cancel();
    throw new Error("GitLab Playwright runtime package is unreadable");
  }
  await downloadResponse(response, bundle, {
    exactBytes: null,
    maxBytes: PACKAGE_MAX_BYTES,
  });
  return true;
}

async function uploadPackageBundle(env, bundle) {
  const size = statSync(bundle).size;
  let status = 0;
  try {
    const response = await fetch(runtimePackageUrl(env), {
      method: "PUT",
      headers: {
        ...packageHeaders(env),
        "content-length": String(size),
        "content-type": "application/x-tar",
      },
      body: createReadStream(bundle),
      duplex: "half",
      redirect: "error",
      signal: AbortSignal.timeout(PACKAGE_TIMEOUT_MS),
    });
    status = response.status;
    await response.body?.cancel();
  } catch {
    status = 0;
  }
  return status;
}

function createPrivateStaging(parent, prefix) {
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  assertPrivateDirectory(parent);
  const staging = mkdtempSync(path.join(parent, prefix));
  chmodSync(staging, 0o700);
  assertPrivateDirectory(staging);
  return staging;
}

function removeExactDirectory(directory) {
  if (!existsSync(directory)) return;
  assertPrivateDirectory(directory);
  rmSync(directory, { recursive: true, force: false });
  if (existsSync(directory)) {
    throw new Error("Playwright runtime cleanup is incomplete");
  }
}

async function publishRuntimePackage(env, staging, root, candidate) {
  await verifyRuntimeArchiveSet(candidate);

  const bundle = path.join(staging, PACKAGE_FILE);
  createBundle(candidate, bundle, root);
  const uploadStatus = await uploadPackageBundle(env, bundle);
  if (![0, 200, 201, 409].includes(uploadStatus)) {
    throw new Error("GitLab Playwright runtime package upload was rejected");
  }

  const readbackBundle = path.join(staging, "readback.tar");
  if (!(await downloadPackageBundle(env, readbackBundle))) {
    throw new Error("GitLab Playwright runtime package readback is missing");
  }
  const readback = path.join(staging, "readback");
  extractBundle(readbackBundle, readback, root);
  await verifyRuntimeArchiveSet(readback);
  return readback;
}

async function bootstrapPackageFromRunnerLocalSeed(env, staging, root) {
  const seedDirectory = CI_PLAYWRIGHT_RUNTIME_LOCAL_SEED_DIRECTORY;
  const candidate = path.join(staging, "candidate");
  mkdirSync(candidate, { mode: 0o700 });
  let seedAccepted = false;
  process.stderr.write(
    "[ci-playwright-runtime] phase=runner-local-seed status=started\n",
  );
  try {
    await verifyRunnerLocalSeed(seedDirectory);
    seedAccepted = true;
    for (const asset of CI_PLAYWRIGHT_RUNTIME_ASSETS) {
      const destination = path.join(candidate, asset.name);
      copyFileSync(
        path.join(seedDirectory, asset.name),
        destination,
        fsConstants.COPYFILE_EXCL,
      );
      chmodSync(destination, 0o600);
    }
    await verifyRuntimeArchiveSet(candidate);
    const readback = await publishRuntimePackage(
      env,
      staging,
      root,
      candidate,
    );
    process.stderr.write(
      "[ci-playwright-runtime] phase=runner-local-seed status=complete\n",
    );
    return readback;
  } catch (error) {
    process.stderr.write(
      "[ci-playwright-runtime] phase=runner-local-seed status=failed\n",
    );
    throw error;
  } finally {
    if (seedAccepted && existsSync(seedDirectory)) {
      await verifyRunnerLocalSeed(seedDirectory);
      removeExactDirectory(seedDirectory);
    }
  }
}

export async function ensurePlaywrightRuntimeArchives({
  root = path.resolve(import.meta.dirname, "../.."),
  env = process.env,
} = {}) {
  assertGitLabIdentity(env);
  assertInstalledPlaywrightMetadata(root);
  const { archiveDirectory } = expectedRuntimePaths(root, env);
  if (existsSync(archiveDirectory)) {
    try {
      const verified = await verifyRuntimeArchiveSet(archiveDirectory);
      return Object.freeze({ ...verified, source: "runner-cache" });
    } catch {
      removeExactDirectory(archiveDirectory);
    }
  }

  const cacheParent = path.dirname(archiveDirectory);
  const staging = createPrivateStaging(
    cacheParent,
    ".playwright-runtime-" + env.CI_JOB_ID + "-",
  );
  try {
    const bundle = path.join(staging, PACKAGE_FILE);
    let candidate;
    if (await downloadPackageBundle(env, bundle)) {
      candidate = path.join(staging, "package");
      extractBundle(bundle, candidate, root);
      await verifyRuntimeArchiveSet(candidate);
    } else {
      if (!canBootstrapRuntimePackage(env)) {
        throw new Error(
          "GitLab Playwright runtime package is absent outside the protected prepare job",
        );
      }
      if (!existsSync(CI_PLAYWRIGHT_RUNTIME_LOCAL_SEED_DIRECTORY)) {
        throw new Error("Runner-local Playwright seed is absent");
      }
      candidate = await bootstrapPackageFromRunnerLocalSeed(
        env,
        staging,
        root,
      );
    }
    renameSync(candidate, archiveDirectory);
    const verified = await verifyRuntimeArchiveSet(archiveDirectory);
    return Object.freeze({ ...verified, source: "gitlab-package" });
  } finally {
    removeExactDirectory(staging);
  }
}

function assertExecutable(file) {
  const observed = assertRegularFile(file);
  if ((observed.mode & 0o111) === 0) {
    throw new Error("Playwright runtime executable mode is invalid");
  }
}

function verifyMaterializedRuntime(browserDirectory) {
  assertPrivateDirectory(browserDirectory);
  assertExactEntries(
    browserDirectory,
    CI_PLAYWRIGHT_RUNTIME_ASSETS.map((asset) => asset.directory),
  );
  for (const asset of CI_PLAYWRIGHT_RUNTIME_ASSETS) {
    const directory = path.join(browserDirectory, asset.directory);
    assertPrivateDirectory(directory);
    assertRegularFile(path.join(directory, "INSTALLATION_COMPLETE"));
    assertExecutable(path.join(directory, asset.executable));
    if (asset.sandbox) assertRegularFile(path.join(directory, asset.sandbox));
  }
  const chromium = CI_PLAYWRIGHT_RUNTIME_ASSETS[0];
  return Object.freeze({
    chromePath: path.join(
      browserDirectory,
      chromium.directory,
      chromium.executable,
    ),
    sandboxSource: path.join(
      browserDirectory,
      chromium.directory,
      chromium.sandbox,
    ),
  });
}

export async function materializePlaywrightRuntime({
  root = path.resolve(import.meta.dirname, "../.."),
  env = process.env,
} = {}) {
  const archives = await ensurePlaywrightRuntimeArchives({ root, env });
  const { archiveDirectory, browserDirectory } = expectedRuntimePaths(
    root,
    env,
  );
  if (existsSync(browserDirectory)) {
    throw new Error("Playwright per-job runtime has stale residue");
  }
  const runtimeParent = path.dirname(browserDirectory);
  const staging = createPrivateStaging(
    runtimeParent,
    ".playwright-" + env.CI_JOB_ID + "-",
  );
  let moved = false;
  try {
    for (const asset of CI_PLAYWRIGHT_RUNTIME_ASSETS) {
      const destination = path.join(staging, asset.directory);
      mkdirSync(destination, { mode: 0o700 });
      runTool(
        "unzip",
        ["-q", path.join(archiveDirectory, asset.name), "-d", destination],
        root,
      );
      writeFileSync(path.join(destination, "INSTALLATION_COMPLETE"), "", {
        flag: "wx",
        mode: 0o600,
      });
    }
    verifyMaterializedRuntime(staging);
    renameSync(staging, browserDirectory);
    moved = true;
    const runtime = verifyMaterializedRuntime(browserDirectory);
    return Object.freeze({
      schemaVersion: CI_PLAYWRIGHT_RUNTIME_SCHEMA,
      status: "materialized",
      archiveSetSha256: archives.archiveSetSha256,
      browserDirectory,
      ...runtime,
    });
  } catch (error) {
    if (moved && existsSync(browserDirectory)) {
      removeExactDirectory(browserDirectory);
    }
    throw error;
  } finally {
    if (existsSync(staging)) removeExactDirectory(staging);
  }
}

export function cleanupPlaywrightRuntime({
  root = path.resolve(import.meta.dirname, "../.."),
  env = process.env,
} = {}) {
  assertGitLabIdentity(env);
  const { browserDirectory } = expectedRuntimePaths(root, env);
  removeExactDirectory(browserDirectory);
  return Object.freeze({
    schemaVersion: CI_PLAYWRIGHT_RUNTIME_SCHEMA,
    status: "cleaned",
  });
}

async function seedPlaywrightRuntime(options = {}) {
  const env = options.env || process.env;
  if (env.CI_JOB_NAME !== "prepare") {
    throw new Error("Playwright runtime seed is restricted to prepare");
  }
  const archives = await ensurePlaywrightRuntimeArchives(options);
  let materialized = false;
  try {
    await materializePlaywrightRuntime(options);
    materialized = true;
  } finally {
    if (materialized) cleanupPlaywrightRuntime(options);
  }
  return archives;
}

function parseMode(argv) {
  if (
    argv.length !== 1 ||
    !["seed", "materialize", "cleanup"].includes(argv[0])
  ) {
    throw new Error(
      "usage: ci-playwright-runtime.mjs seed|materialize|cleanup",
    );
  }
  return argv[0];
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    const mode = parseMode(process.argv.slice(2));
    if (mode === "seed") await seedPlaywrightRuntime();
    if (mode === "materialize") await materializePlaywrightRuntime();
    if (mode === "cleanup") cleanupPlaywrightRuntime();
    process.stderr.write(
      "[ci-playwright-runtime] mode=" +
        mode +
        " status=complete schema=" +
        CI_PLAYWRIGHT_RUNTIME_SCHEMA +
        "\n",
    );
  } catch {
    process.stderr.write("[ci-playwright-runtime] status=failed\n");
    process.exitCode = 1;
  }
}
