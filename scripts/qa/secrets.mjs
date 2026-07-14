import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectGitChangedFiles,
  normalizeHistoryRange,
  readNullDelimited,
  resolveDefaultRange,
  runGit,
  validateGitRange,
} from "./lib/git-range.mjs";

const NPM_CONFIG_FILES = [
  ".npmrc",
  ".npmrc.local",
  ".yarnrc.yml",
  "web/.npmrc",
  "web/.npmrc.local",
  "web/.yarnrc.yml",
];
const GITLEAKS_CONFIG_FILE = ".gitleaks.toml";

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "build",
  "dist",
  "output",
  "tmp",
  "coverage",
  "bin",
]);

function commandExists(command) {
  const result = spawnSync(command, ["version"], {
    encoding: "utf8",
    stdio: "ignore",
  });
  return !result.error && result.status === 0;
}

function isRepositoryRoot(root) {
  try {
    return (
      realpathSync(runGit(root, ["rev-parse", "--show-toplevel"]).trim()) ===
      realpathSync(root)
    );
  } catch {
    return false;
  }
}

function assertSafeRelativePath(file) {
  if (!file || path.isAbsolute(file) || file.split(/[\\/]/u).includes("..")) {
    throw new Error(`[qa:secrets] unsafe candidate path: ${file}`);
  }
}

function walkPackageFiles(root) {
  const files = [];
  const visit = (current, relativeBase = "") => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const relativePath = relativeBase ? `${relativeBase}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
        visit(path.join(current, entry.name), relativePath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  };
  visit(root);
  return files;
}

function indexFileExists(root, file) {
  try {
    runGit(root, ["cat-file", "-e", `:${file}`]);
    return true;
  } catch {
    return false;
  }
}

function collectCandidateFiles({ root, mode, range }) {
  if (mode === "package") return walkPackageFiles(root);
  if (mode === "staged") {
    const files = readNullDelimited(
      runGit(
        root,
        ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z", "--"],
        { encoding: null },
      ),
    );
    for (const file of NPM_CONFIG_FILES) {
      if (indexFileExists(root, file)) files.push(file);
    }
    if (indexFileExists(root, GITLEAKS_CONFIG_FILE)) {
      files.push(GITLEAKS_CONFIG_FILE);
    }
    return [...new Set(files)].sort();
  }

  const files = collectGitChangedFiles({
    root,
    range,
    includeWorktree: true,
    includeStaged: true,
    diffFilter: "ACMR",
  });
  for (const file of NPM_CONFIG_FILES) {
    if (existsSync(path.join(root, file))) files.push(file);
  }
  if (existsSync(path.join(root, GITLEAKS_CONFIG_FILE))) {
    files.push(GITLEAKS_CONFIG_FILE);
  }
  return [...new Set(files)].sort();
}

function readCandidate(root, mode, file) {
  assertSafeRelativePath(file);
  if (mode === "staged") {
    if (!indexFileExists(root, file)) return null;
    return runGit(root, ["show", `:${file}`], { encoding: null });
  }
  const target = path.join(root, file);
  if (!existsSync(target) || !statSync(target).isFile()) return null;
  return readFileSync(target);
}

function materializeCandidates(root, mode, files) {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "plush-secrets-"));
  const materialized = [];
  try {
    for (const file of files) {
      const content = readCandidate(root, mode, file);
      if (content === null) continue;
      const target = path.join(tempRoot, file);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content);
      materialized.push(file);
    }
    return { tempRoot, files: materialized };
  } catch (error) {
    rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

function extractConfiguredToken(line) {
  const match = line.match(/(?:_authToken\s*=|npmAuthToken\s*:)(.*)$/u);
  if (!match) return "";
  return match[1].trim().replace(/^["'`]|["'`]$/gu, "");
}

function isTokenPlaceholder(value) {
  return (
    !value ||
    /^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$/u.test(value) ||
    /^<[^>]+>$/u.test(value)
  );
}

function findNpmTokenHits(tempRoot, files) {
  const hits = [];
  for (const file of files.filter((candidate) => NPM_CONFIG_FILES.some((name) => candidate.endsWith(name)))) {
    const content = readFileSync(path.join(tempRoot, file), "utf8");
    content.split("\n").forEach((line, index) => {
      const value = extractConfiguredToken(line);
      if (value && !isTokenPlaceholder(value)) hits.push(`${file}:${index + 1}`);
    });
  }
  return hits;
}

function runGitleaks(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "ignore",
    timeout: 120_000,
  });
  if (result.error) {
    throw new Error(`[qa:secrets] gitleaks execution failed: ${result.error.message}`);
  }
  return result.status === 0;
}

export function scanSecrets({
  root,
  mode = "range",
  range = "",
  strict = false,
  gitleaksCommand = "gitleaks",
} = {}) {
  if (!root) throw new Error("[qa:secrets] root is required");
  if (!new Set(["staged", "range", "package"]).has(mode)) {
    throw new Error(`[qa:secrets] unsupported mode: ${mode}`);
  }

  const inGitRepository = isRepositoryRoot(root);
  if (mode !== "package" && !inGitRepository) {
    throw new Error(`[qa:secrets] ${mode} mode requires the project Git repository`);
  }
  if (mode === "package" && range) {
    throw new Error("[qa:secrets] package mode does not accept a Git range");
  }

  let effectiveRange = range;
  let historyRange = "";
  if (mode === "range") {
    effectiveRange ||= resolveDefaultRange(root);
    if (effectiveRange) {
      validateGitRange(root, effectiveRange);
      historyRange = normalizeHistoryRange(root, effectiveRange);
    }
  }

  const hasGitleaks = commandExists(gitleaksCommand);
  if (!hasGitleaks && strict) {
    return { ok: false, reason: "missing-gitleaks", mode, range: effectiveRange };
  }

  if (hasGitleaks && historyRange) {
    const configPath = path.join(root, GITLEAKS_CONFIG_FILE);
    const clean = runGitleaks(
      gitleaksCommand,
      [
        "git",
        ...(existsSync(configPath) ? ["--config", configPath] : []),
        "--log-opts",
        historyRange,
        "--no-banner",
        "--redact",
        root,
      ],
      root,
    );
    if (!clean) return { ok: false, reason: "history-leak", mode, range: effectiveRange };
  }

  const candidates = collectCandidateFiles({ root, mode, range: effectiveRange });
  const materialized = materializeCandidates(root, mode, candidates);
  try {
    const npmTokenHits = findNpmTokenHits(materialized.tempRoot, materialized.files);
    if (npmTokenHits.length > 0) {
      return { ok: false, reason: "npm-token", files: npmTokenHits, mode, range: effectiveRange };
    }

    if (hasGitleaks && materialized.files.length > 0) {
      const materializedConfig = path.join(
        materialized.tempRoot,
        GITLEAKS_CONFIG_FILE,
      );
      const clean = runGitleaks(
        gitleaksCommand,
        [
          "detect",
          ...(existsSync(materializedConfig)
            ? ["--config", materializedConfig]
            : []),
          "--no-git",
          "--source",
          materialized.tempRoot,
          "--no-banner",
          "--redact",
        ],
        root,
      );
      if (!clean) return { ok: false, reason: "content-leak", mode, range: effectiveRange };
    }

    return {
      ok: true,
      mode,
      range: effectiveRange,
      scannedFiles: materialized.files.length,
      gitleaks: hasGitleaks,
    };
  } finally {
    rmSync(materialized.tempRoot, { recursive: true, force: true });
  }
}

function printHelp() {
  console.log(`用法:
  bash scripts/qa/secrets.sh

模式:
  staged   扫描 index 内容（SECRETS_STAGED_ONLY=1）
  range    扫描 revision range 的 commits/blobs 与当前变更（默认）
  package  非 Git 源码包内容扫描

环境变量:
  SKIP_SECRETS_SCAN=1
  SECRETS_STRICT=1
  SECRETS_STAGED_ONLY=1
  QA_BASE_RANGE=origin/main...HEAD
`);
}

function main() {
  if (process.argv.slice(2).some((arg) => arg === "-h" || arg === "--help")) {
    printHelp();
    return;
  }
  if (process.argv.length > 2) {
    throw new Error(`[qa:secrets] unsupported arguments: ${process.argv.slice(2).join(" ")}`);
  }
  if (process.env.SKIP_SECRETS_SCAN === "1") {
    console.log("[qa:secrets] SKIP_SECRETS_SCAN=1，跳过");
    return;
  }

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const inGitRepository = isRepositoryRoot(root);
  const mode = !inGitRepository
    ? "package"
    : process.env.SECRETS_STAGED_ONLY === "1"
      ? "staged"
      : "range";
  if (!inGitRepository && process.env.QA_BASE_RANGE) {
    throw new Error("[qa:secrets] 非 Git 源码包不支持 QA_BASE_RANGE");
  }
  const result = scanSecrets({
    root,
    mode,
    range: process.env.QA_BASE_RANGE || "",
    strict: process.env.SECRETS_STRICT === "1",
  });

  if (!result.ok) {
    const messages = {
      "missing-gitleaks": "SECRETS_STRICT=1 且缺少 gitleaks",
      "history-leak": "提交历史中检测到疑似密钥泄露",
      "content-leak": "待提交或待外发内容中检测到疑似密钥泄露",
      "npm-token": "检测到 npm registry token 明文配置",
    };
    console.error(`[qa:secrets] ${messages[result.reason] || result.reason}`);
    for (const file of result.files || []) console.error(`  - ${file}`);
    process.exitCode = 1;
    return;
  }
  if (!result.gitleaks) {
    console.log(`[qa:secrets] npm token 检查通过；跳过 gitleaks（mode=${result.mode}）`);
  } else {
    console.log(`[qa:secrets] 通过（mode=${result.mode}, files=${result.scannedFiles}）`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
