import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  assertScenarioGenerationId,
  validateScenarioGeneration,
} from "../../config/scenario-generation.mjs";

export const SCENARIO_GENERATION_ROOT = "output/qa/scenario-generations";
const ROOTS = ["scripts/", "server/", "config/", "web/", "deployments/"];
const ROOT_FILES = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ".node-version",
  ".nvmrc",
];
const OMIT =
  /(?:^|\/)(?:node_modules|\.git|output|logs|build|bin|dist|coverage|docs|\.vite-cache|\.env[^/]*|[^/]*\.local\.[^/]*|[^/]*(?:credentials|secrets)[^/]*)(?:\/|$)|(?:\.test\.[^/]+|_test\.go|\.(?:md|pem|key|p12|pfx))$/u;
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_SOURCE_BYTES = 256 * 1024 * 1024;
const hash = (value) => createHash("sha256").update(value).digest("hex");

function git(root, args) {
  return execFileSync("git", ["-c", "diff.autoRefreshIndex=false", ...args], {
    cwd: root,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    maxBuffer: 16 * 1024 * 1024,
  });
}

function sourcePath(file) {
  return (
    (ROOT_FILES.includes(file) ||
      ROOTS.some((prefix) => file.startsWith(prefix))) &&
    !OMIT.test(file) &&
    !file.split("/").some((part) => part === ".." || part === "." || !part)
  );
}

function privateDirectory(directory) {
  let ancestor = path.resolve(directory);
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  if (fs.realpathSync(ancestor) !== ancestor)
    throw new Error("snapshot directory must not contain symbolic links");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (fs.realpathSync(directory) !== path.resolve(directory))
    throw new Error("snapshot directory must not contain symbolic links");
  fs.chmodSync(directory, 0o700);
}

function privateJSON(file, value, { replace = false } = {}) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx",
  });
  try {
    if (replace) fs.renameSync(temporary, file);
    else fs.linkSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function readPrivateJSON(file) {
  const stat = fs.lstatSync(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    fs.realpathSync(file) !== path.resolve(file) ||
    stat.size > 16 * 1024 * 1024
  ) {
    throw new Error("snapshot metadata is invalid");
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function archiveHash(file) {
  const stat = fs.lstatSync(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    fs.realpathSync(file) !== path.resolve(file) ||
    stat.size < 1 ||
    stat.size > MAX_SOURCE_BYTES
  ) {
    throw new Error("scenario code archive is invalid");
  }
  return hash(fs.readFileSync(file));
}

export function readScenarioGenerationSource(projectRoot) {
  const root = fs.realpathSync(projectRoot);
  const paths = [
    ...new Set(
      git(root, [
        "ls-files",
        "-z",
        "--cached",
        "--others",
        "--exclude-standard",
      ])
        .toString("utf8")
        .split("\0")
        .filter(sourcePath),
    ),
  ].sort();
  const contents = new Map();
  const files = [];
  let totalBytes = 0;
  for (const file of paths) {
    const absolute = path.join(root, file);
    let stat;
    try {
      stat = fs.lstatSync(absolute);
    } catch (error) {
      if (error.code === "ENOENT") continue; // A local deletion belongs to this source snapshot.
      throw error;
    }
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      fs.realpathSync(absolute) !== absolute ||
      stat.size > MAX_FILE_BYTES
    ) {
      throw new Error(`snapshot source is not a bounded regular file: ${file}`);
    }
    const content = fs.readFileSync(absolute);
    totalBytes += content.length;
    if (totalBytes > MAX_SOURCE_BYTES)
      throw new Error("scenario source snapshot exceeds 256 MiB");
    const executable = Boolean(stat.mode & 0o111);
    files.push({
      path: file,
      sha256: hash(content),
      bytes: content.length,
      executable,
    });
    contents.set(file, content);
  }
  if (!contents.has("scripts/qa/scenario-demo-data.mjs"))
    throw new Error("scenario source entrypoint is missing");
  return { fingerprint: hash(JSON.stringify(files)), files, contents };
}

// The local generator may differ, but undispatched backend changes cannot be
// assumed to work against the deployed service merely because its API responds.
export function assertScenarioServerCompatibility(projectRoot, release) {
  if (!/^[a-f0-9]{40}$/u.test(String(release)))
    throw new Error("server release identity is invalid");
  try {
    git(projectRoot, ["cat-file", "-e", `${release}^{commit}`]);
  } catch {
    throw new Error("无法核对服务器版本源码，请先同步已部署提交后重新准备数据");
  }
  const changed = git(projectRoot, [
    "diff",
    "--no-ext-diff",
    "--name-only",
    "-z",
    release,
    "--",
    "server/",
  ])
    .toString("utf8")
    .split("\0");
  const untracked = git(projectRoot, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
    "server/",
  ])
    .toString("utf8")
    .split("\0");
  if ([...changed, ...untracked].some((file) => file && sourcePath(file))) {
    throw new Error(
      "本地后端或数据库定义与服务器版本不同；请先发布对应改动，再向服务器造数",
    );
  }
}

function storeRoot(projectRoot) {
  return path.join(fs.realpathSync(projectRoot), SCENARIO_GENERATION_ROOT);
}

function codeDirectory(projectRoot, fingerprint) {
  if (!/^[a-f0-9]{64}$/u.test(fingerprint))
    throw new Error("source fingerprint is invalid");
  return path.join(storeRoot(projectRoot), "code", fingerprint);
}

function persistCode(projectRoot, source) {
  const directory = codeDirectory(projectRoot, source.fingerprint);
  if (fs.existsSync(directory)) {
    const manifest = readPrivateJSON(path.join(directory, "manifest.json"));
    if (
      manifest.sourceFingerprint !== source.fingerprint ||
      hash(JSON.stringify(manifest.files)) !== source.fingerprint ||
      manifest.archiveSha256 !==
        archiveHash(path.join(directory, "source.tar.gz"))
    ) {
      throw new Error(
        "saved scenario source snapshot failed integrity verification",
      );
    }
    return manifest;
  }
  const parent = path.dirname(directory);
  privateDirectory(parent);
  const staging = fs.mkdtempSync(path.join(parent, ".capture-"));
  try {
    const sourceRoot = path.join(staging, "source");
    privateDirectory(sourceRoot);
    for (const file of source.files) {
      const destination = path.join(sourceRoot, file.path);
      privateDirectory(path.dirname(destination));
      fs.writeFileSync(destination, source.contents.get(file.path), {
        flag: "wx",
        mode: file.executable ? 0o700 : 0o600,
      });
    }
    const archive = path.join(staging, "source.tar.gz");
    execFileSync("tar", ["-czf", archive, "-C", sourceRoot, "."], {
      env: { ...process.env, COPYFILE_DISABLE: "1" },
      maxBuffer: 1024 * 1024,
    });
    fs.chmodSync(archive, 0o600);
    const manifest = {
      sourceFingerprint: source.fingerprint,
      archiveSha256: hash(fs.readFileSync(archive)),
      files: source.files,
    };
    privateJSON(path.join(staging, "manifest.json"), manifest);
    fs.rmSync(sourceRoot, { recursive: true });
    fs.renameSync(staging, directory);
    return manifest;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

export function captureScenarioGeneration({
  projectRoot,
  plan,
  executionId = randomUUID(),
  now = new Date(),
}) {
  assertScenarioGenerationId(executionId);
  const source = readScenarioGenerationSource(projectRoot);
  if (source.fingerprint !== plan.sourceFingerprint)
    throw new Error("造数代码在准备后发生变化，请重新准备");
  const code = persistCode(projectRoot, source);
  const parameters = {
    schemaVersion: "plush.scenario-generation-parameters/v1",
    sourceFingerprint: source.fingerprint,
    repository: plan.repository,
    planDigest: plan.planDigest,
    target: {
      key: plan.targetEnvironment,
      fingerprint: plan.target.targetFingerprint,
      backendURL: plan.backendURL,
      databaseName: plan.databaseName,
      release:
        plan.targetEnvironment === "customer-trial-133" ? plan.release : null,
      migrationVersion: plan.migrationVersion,
      runtime: plan.runtime,
    },
    sourceScaleProfile: plan.sourceScaleProfile,
    semanticPlan: plan.canonicalPlan.semanticPlan,
    nodeVersion: process.version,
  };
  const startedAt = now.toISOString();
  const receipt = validateScenarioGeneration({
    schemaVersion: "plush.scenario-generation/v1",
    id: executionId,
    batchId: `${startedAt.replace(/[-:.]/gu, "")}_${source.fingerprint.slice(0, 12)}`,
    startedAt,
    completedAt: null,
    status: "running",
    targetKey: plan.targetEnvironment,
    sourceFingerprint: source.fingerprint,
    parametersFingerprint: hash(JSON.stringify(parameters)),
    archiveSha256: code.archiveSha256,
    fileCount: source.files.length,
    repositoryFingerprint: plan.repository.fingerprint,
    planDigest: plan.planDigest,
  });
  const directory = path.join(storeRoot(projectRoot), "runs", executionId);
  privateDirectory(path.dirname(directory));
  fs.mkdirSync(directory, { mode: 0o700 });
  privateJSON(path.join(directory, "parameters.json"), parameters);
  privateJSON(path.join(directory, "receipt.json"), receipt);
  return receipt;
}

export function readScenarioGeneration(projectRoot, executionId) {
  assertScenarioGenerationId(executionId);
  const directory = path.join(storeRoot(projectRoot), "runs", executionId);
  if (!fs.existsSync(directory)) return null;
  const receipt = validateScenarioGeneration(
    readPrivateJSON(path.join(directory, "receipt.json")),
  );
  const parameters = readPrivateJSON(path.join(directory, "parameters.json"));
  if (
    receipt.id !== executionId ||
    hash(JSON.stringify(parameters)) !== receipt.parametersFingerprint ||
    parameters.sourceFingerprint !== receipt.sourceFingerprint ||
    parameters.planDigest !== receipt.planDigest ||
    parameters.repository?.fingerprint !== receipt.repositoryFingerprint ||
    parameters.target?.key !== receipt.targetKey
  ) {
    throw new Error(
      "scenario generation parameters failed integrity verification",
    );
  }
  const manifest = readPrivateJSON(
    path.join(
      codeDirectory(projectRoot, receipt.sourceFingerprint),
      "manifest.json",
    ),
  );
  if (
    manifest.sourceFingerprint !== receipt.sourceFingerprint ||
    manifest.archiveSha256 !== receipt.archiveSha256 ||
    hash(JSON.stringify(manifest.files)) !== receipt.sourceFingerprint ||
    manifest.files.length !== receipt.fileCount ||
    archiveHash(
      path.join(
        codeDirectory(projectRoot, receipt.sourceFingerprint),
        "source.tar.gz",
      ),
    ) !== receipt.archiveSha256
  ) {
    throw new Error(
      "scenario generation code manifest failed integrity verification",
    );
  }
  return receipt;
}

export function finishScenarioGeneration(
  projectRoot,
  executionId,
  status,
  now = new Date(),
  result = null,
) {
  const receipt = readScenarioGeneration(projectRoot, executionId);
  if (
    !receipt ||
    receipt.status !== "running" ||
    !["passed", "not_proven"].includes(status)
  )
    throw new Error("scenario generation cannot finish");
  if (
    status === "passed" &&
    readScenarioGenerationSource(projectRoot).fingerprint !==
      receipt.sourceFingerprint
  ) {
    throw new Error("造数期间代码发生变化，结果需要重新核对");
  }
  const completed = validateScenarioGeneration({
    ...receipt,
    status,
    completedAt: now.toISOString(),
  });
  if (result)
    privateJSON(
      path.join(storeRoot(projectRoot), "runs", executionId, "result.json"),
      result,
    );
  privateJSON(
    path.join(storeRoot(projectRoot), "runs", executionId, "receipt.json"),
    completed,
    { replace: true },
  );
  return completed;
}
