import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COMMON_GATES = Object.freeze([
  "diff-check",
  "agents-size",
  "db-guard",
  "error-codes",
  "domain-boundaries",
  "customer-config",
  "import-isolation",
  "deployment-contracts",
]);

const FAST_GATES = Object.freeze([
  ...COMMON_GATES,
  "scripts-node-tests-fast",
  "web-contracts",
  "web-lint",
  "web-css",
  "server-quick",
]);

const FULL_GATES = Object.freeze([
  ...COMMON_GATES,
  "scripts-node-tests-fast",
  "scripts-node-tests-database",
  "scripts-node-tests-browser",
  "scripts-node-tests-release",
  "secret-range",
  "web-lint",
  "web-css",
  "web-test",
  "web-build",
  "browser-smoke",
  "populated-upgrade-postgres",
  "critical-postgres",
  "server-all",
  "server-build",
  "govulncheck",
]);

const STRICT_GATES = Object.freeze([
  ...COMMON_GATES,
  "scripts-node-tests-fast",
  "scripts-node-tests-database",
  "scripts-node-tests-browser",
  "scripts-node-tests-release",
  "secret-range",
  "web-zero-warnings",
  "web-test",
  "web-build",
  "browser-smoke",
  "populated-upgrade-postgres",
  "critical-postgres",
  "server-all",
  "server-build",
  "govulncheck",
  "shellcheck-strict",
  "shfmt-strict",
  "yamllint-strict",
]);

export const GATE_PROFILES = Object.freeze({
  fast: FAST_GATES,
  full: FULL_GATES,
  strict: STRICT_GATES,
});

const SUPERSEDING_GATES = Object.freeze({
  "web-contracts": Object.freeze(["web-test"]),
  "web-lint": Object.freeze(["web-zero-warnings"]),
  "web-css": Object.freeze(["web-zero-warnings"]),
  "server-quick": Object.freeze(["server-all"]),
});

// This inventory intentionally contains only direct gate entrypoints. Transitive
// scripts and test files are proven by executing the gate and by test discovery;
// copying them here would create a second, hand-maintained topology.
const FAST_REQUIRED_FILES = Object.freeze([
  ".githooks/pre-commit",
  ".githooks/pre-push",
  "scripts/git-hooks/pre-commit.sh",
  "scripts/git-hooks/pre-push.sh",
  "scripts/qa/prepare-push.sh",
  "scripts/qa/affected.mjs",
  "scripts/qa/gate-profiles.mjs",
  "scripts/qa/fast.sh",
  "scripts/qa/node-test-groups.mjs",
  "scripts/qa/run-node-tests.mjs",
  "scripts/qa/run-test-gate.mjs",
  "scripts/qa/db-guard.sh",
  "scripts/qa/critical-postgres-tests.sh",
  "web/package.json",
  "server/go.mod",
]);

const FULL_REQUIRED_FILES = Object.freeze([
  "scripts/qa/full.sh",
  "scripts/qa/run-gate-with-receipt.mjs",
  "scripts/qa/secrets.sh",
  "scripts/qa/govulncheck.sh",
  "scripts/purchase-receipt-pg.sh",
  "scripts/purchase-return-pg.sh",
  "web/scripts/styleL1.mjs",
  "server/Makefile",
]);

const STRICT_REQUIRED_FILES = Object.freeze([
  "scripts/qa/strict.sh",
  "scripts/qa/shellcheck.sh",
  "scripts/qa/shfmt.sh",
  "scripts/qa/yamllint.sh",
]);

const FAST_REQUIRED_EXECUTABLES = Object.freeze([
  ".githooks/pre-commit",
  ".githooks/pre-push",
  "scripts/git-hooks/pre-commit.sh",
  "scripts/git-hooks/pre-push.sh",
  "scripts/qa/prepare-push.sh",
  "scripts/qa/fast.sh",
  "scripts/qa/db-guard.sh",
]);

const FULL_REQUIRED_EXECUTABLES = Object.freeze([
  "scripts/qa/full.sh",
  "scripts/qa/secrets.sh",
  "scripts/qa/govulncheck.sh",
  "scripts/purchase-receipt-pg.sh",
  "scripts/purchase-return-pg.sh",
]);

const STRICT_REQUIRED_EXECUTABLES = Object.freeze([
  "scripts/qa/strict.sh",
  "scripts/qa/shellcheck.sh",
  "scripts/qa/shfmt.sh",
  "scripts/qa/yamllint.sh",
]);

export const PROFILE_REQUIRED_FILES = Object.freeze({
  fast: FAST_REQUIRED_FILES,
  full: Object.freeze([...FAST_REQUIRED_FILES, ...FULL_REQUIRED_FILES]),
  strict: Object.freeze([
    ...FAST_REQUIRED_FILES,
    ...FULL_REQUIRED_FILES,
    ...STRICT_REQUIRED_FILES,
  ]),
});

export const PROFILE_REQUIRED_EXECUTABLES = Object.freeze({
  fast: FAST_REQUIRED_EXECUTABLES,
  full: Object.freeze([
    ...FAST_REQUIRED_EXECUTABLES,
    ...FULL_REQUIRED_EXECUTABLES,
  ]),
  strict: Object.freeze([
    ...FAST_REQUIRED_EXECUTABLES,
    ...FULL_REQUIRED_EXECUTABLES,
    ...STRICT_REQUIRED_EXECUTABLES,
  ]),
});

export function assertProfileHierarchy() {
  for (const [subsetName, supersetName] of [
    ["fast", "full"],
    ["full", "strict"],
  ]) {
    const superset = new Set(GATE_PROFILES[supersetName]);
    const missing = GATE_PROFILES[subsetName].filter((gate) => {
      if (superset.has(gate)) return false;
      return !(SUPERSEDING_GATES[gate] || []).some((replacement) =>
        superset.has(replacement),
      );
    });
    if (missing.length > 0) {
      throw new Error(
        `[qa:profiles] ${supersetName} is missing ${subsetName} gates: ${missing.join(", ")}`,
      );
    }
  }
}

function assertKnownProfile(profile) {
  if (!PROFILE_REQUIRED_FILES[profile]) {
    throw new Error(`[qa:profiles] unknown profile: ${profile}`);
  }
}

function runGit(root, args) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = String(
      error?.stderr || error?.message || "git command failed",
    )
      .trim()
      .split("\n")[0];
    throw new Error(`[qa:profiles] git ${args[0]} failed: ${detail}`);
  }
}

function assertCommit(root, ref) {
  if (
    !ref ||
    typeof ref !== "string" ||
    /\s|\0/u.test(ref) ||
    ref.startsWith("-")
  ) {
    throw new Error(`[qa:profiles] unsafe commit ref: ${ref || "(empty)"}`);
  }
  runGit(root, [
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${ref}^{commit}`,
  ]);
}

function treeMode(root, ref, file) {
  const output = runGit(root, ["ls-tree", "-z", ref, "--", file]);
  return output.match(/^(\d{6}) /u)?.[1] || "";
}

function indexMode(root, file) {
  const output = runGit(root, ["ls-files", "--stage", "-z", "--", file]);
  return output.match(/^(\d{6}) /u)?.[1] || "";
}

function gitModeInspection(mode) {
  return {
    exists: Boolean(mode),
    executable: mode === "100755",
    regular: /^100(?:644|755)$/u.test(mode),
  };
}

function validateInspections(profile, files, executableFiles, inspect) {
  const cache = new Map();
  const inspectionFor = (file) => {
    if (!cache.has(file)) cache.set(file, inspect(file));
    return cache.get(file);
  };
  const missing = files.filter((file) => !inspectionFor(file).exists);
  const invalidType = files.filter((file) => {
    const inspection = inspectionFor(file);
    return inspection.exists && !inspection.regular;
  });
  const nonExecutable = executableFiles.filter((file) => {
    const inspection = inspectionFor(file);
    return inspection.exists && inspection.regular && !inspection.executable;
  });
  return {
    ok:
      missing.length === 0 &&
      invalidType.length === 0 &&
      nonExecutable.length === 0,
    missing,
    invalidType,
    invalidContent: [],
    nonExecutable,
    profile,
  };
}

export function validateWebPackageTestContract(source) {
  try {
    const packageJson = JSON.parse(source);
    return (
      typeof packageJson?.scripts?.test === "string" &&
      packageJson.scripts.test.trim().length > 0
    );
  } catch {
    return false;
  }
}

function withProfileContentContracts(result, profile, readContent) {
  if (!GATE_PROFILES[profile].includes("web-test")) return result;
  let valid = false;
  try {
    valid = validateWebPackageTestContract(readContent("web/package.json"));
  } catch {
    valid = false;
  }
  if (valid || result.missing.includes("web/package.json")) return result;
  return {
    ...result,
    ok: false,
    invalidContent: ["web/package.json#scripts.test"],
  };
}

export function validateProfileFiles(
  profile,
  root,
  { source = "worktree", ref = "" } = {},
) {
  assertKnownProfile(profile);
  if (source === "worktree") {
    const result = validateInspections(
      profile,
      PROFILE_REQUIRED_FILES[profile],
      PROFILE_REQUIRED_EXECUTABLES[profile],
      (file) => {
        const target = path.join(root, file);
        if (!existsSync(target)) {
          return { exists: false, executable: false, regular: false };
        }
        const stat = lstatSync(target);
        return {
          exists: true,
          executable: (stat.mode & 0o111) !== 0,
          regular: stat.isFile(),
        };
      },
    );
    return withProfileContentContracts(result, profile, (file) =>
      readFileSync(path.join(root, file), "utf8"),
    );
  }
  if (source === "tree") {
    assertCommit(root, ref);
    const result = validateInspections(
      profile,
      PROFILE_REQUIRED_FILES[profile],
      PROFILE_REQUIRED_EXECUTABLES[profile],
      (file) => gitModeInspection(treeMode(root, ref, file)),
    );
    return withProfileContentContracts(result, profile, (file) =>
      runGit(root, ["show", `${ref}:${file}`]),
    );
  }
  throw new Error(`[qa:profiles] unknown validation source: ${source}`);
}

export function validateProfileIndexTransition(
  profile,
  root,
  baseline = "HEAD",
) {
  assertKnownProfile(profile);
  assertCommit(root, baseline);
  const result = validateInspections(
    profile,
    PROFILE_REQUIRED_FILES[profile],
    PROFILE_REQUIRED_EXECUTABLES[profile],
    (file) => gitModeInspection(indexMode(root, file)),
  );
  return withProfileContentContracts(result, profile, (file) =>
    runGit(root, ["show", `:${file}`]),
  );
}

function parseCliArgs(args) {
  const options = {
    baseline: "HEAD",
    profile: "",
    ref: "",
    source: "worktree",
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!["--baseline", "--profile", "--ref", "--source"].includes(arg)) {
      throw new Error(`[qa:profiles] unknown option: ${arg}`);
    }
    const value = args[index + 1];
    if (!value) throw new Error(`[qa:profiles] ${arg} requires a value`);
    options[arg.slice(2)] = value;
    index += 1;
  }
  if (!options.profile) {
    throw new Error(
      "usage: node scripts/qa/gate-profiles.mjs --profile fast|full|strict [--source worktree|tree|index-transition] [--ref COMMIT]",
    );
  }
  return options;
}

function main() {
  const options = parseCliArgs(process.argv.slice(2));
  assertProfileHierarchy();
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const result =
    options.source === "index-transition"
      ? validateProfileIndexTransition(options.profile, root, options.baseline)
      : validateProfileFiles(options.profile, root, options);
  if (!result.ok) {
    if (result.missing.length > 0) {
      console.error(`[qa:profiles] ${options.profile} 缺少 required 文件:`);
      for (const file of result.missing) console.error(`  - ${file}`);
    }
    if (result.invalidType.length > 0) {
      console.error(
        `[qa:profiles] ${options.profile} required 路径不是普通文件:`,
      );
      for (const file of result.invalidType) console.error(`  - ${file}`);
    }
    if (result.nonExecutable.length > 0) {
      console.error(`[qa:profiles] ${options.profile} required 脚本不可执行:`);
      for (const file of result.nonExecutable) console.error(`  - ${file}`);
    }
    if (result.invalidContent.length > 0) {
      console.error(`[qa:profiles] ${options.profile} required 内容合同无效:`);
      for (const file of result.invalidContent) console.error(`  - ${file}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(
    `[qa:profiles] ${options.profile} 通过（source=${options.source}, gates=${GATE_PROFILES[options.profile].length}, requiredFiles=${PROFILE_REQUIRED_FILES[options.profile].length}）`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
