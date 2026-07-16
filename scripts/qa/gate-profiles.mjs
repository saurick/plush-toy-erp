import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FAST_GATES = Object.freeze([
  "diff-check",
  "agents-size",
  "db-guard",
  "error-codes",
  "scripts-node-tests",
  "domain-boundaries",
  "customer-config",
  "import-isolation",
  "deployment-contracts",
  "web-contracts",
  "web-lint",
  "web-css",
  "server-quick",
]);

const FULL_ONLY_GATES = Object.freeze([
  "secret-range",
  "web-test",
  "web-build",
  "browser-smoke",
  "populated-upgrade-postgres",
  "critical-postgres",
  "server-all",
  "server-build",
  "govulncheck",
]);

const STRICT_ONLY_GATES = Object.freeze([
  "shellcheck-strict",
  "shfmt-strict",
  "yamllint-strict",
  "web-zero-warnings",
  "govulncheck-strict",
]);

export const GATE_PROFILES = Object.freeze({
  fast: FAST_GATES,
  full: Object.freeze([...FAST_GATES, ...FULL_ONLY_GATES]),
  strict: Object.freeze([
    ...FAST_GATES,
    ...FULL_ONLY_GATES,
    ...STRICT_ONLY_GATES,
  ]),
});

const FAST_REQUIRED_FILES = Object.freeze([
  ".gitleaks.toml",
  ".githooks/pre-commit",
  ".githooks/pre-push",
  "scripts/git-hooks/pre-commit.sh",
  "scripts/git-hooks/pre-push.sh",
  "scripts/qa/agents-size.sh",
  "scripts/qa/db-guard.sh",
  "scripts/qa/db-guard.mjs",
  "scripts/qa/db-guard.test.mjs",
  "scripts/qa/populated-upgrade-20260714055504.sql",
  "scripts/qa/customer-config-cutover-20260714055825.sql",
  "scripts/qa/populated-upgrade-preflight.sh",
  "scripts/qa/populated-upgrade-preflight.test.mjs",
  "scripts/qa/lib/git-range.mjs",
  "scripts/qa/lib/git-range.test.mjs",
  "scripts/qa/error-code-sync.sh",
  "scripts/qa/error-codes.sh",
  "scripts/qa/run-node-tests.mjs",
  "scripts/qa/run-node-tests.test.mjs",
  "scripts/qa/run-test-gate.mjs",
  "scripts/qa/run-test-gate.test.mjs",
  "scripts/qa/verify-node-test-summary.mjs",
  "scripts/qa/verify-node-test-summary.test.mjs",
  "scripts/qa/gate-profiles.mjs",
  "scripts/qa/gate-profiles.test.mjs",
  "scripts/qa/gate-orchestration.test.mjs",
  ".github/workflows/ci.yml",
  "scripts/qa/ci-workflow-yaml-check.go",
  "scripts/qa/ci-workflow.test.mjs",
  "scripts/qa/affected.mjs",
  "scripts/qa/affected.test.mjs",
  "scripts/qa/experimental/canonical-runtime-audit.mjs",
  "scripts/qa/canonical-runtime-audit-contract.test.mjs",
  "scripts/qa/core-boundary.test.mjs",
  "scripts/qa/workflow-fact-boundary.test.mjs",
  "scripts/qa/workflow-ui-action-boundary.test.mjs",
  "scripts/qa/formal-frontend-customer-config-boundary.test.mjs",
  "scripts/qa/customer-config-effective-session-probe.mjs",
  "scripts/qa/trial-account-rbac.mjs",
  "scripts/qa/phase-label-boundaries.mjs",
  "scripts/qa/industry-template-boundaries.mjs",
  "scripts/qa/customer-config-boundaries.mjs",
  "config/customers/index.mjs",
  "config/customers/index.test.mjs",
  "scripts/build/apply-customer-web-config.mjs",
  "scripts/build/apply-customer-web-config.test.mjs",
  "scripts/qa/customer-package-lint.mjs",
  "scripts/qa/customer-package-lint.test.mjs",
  "scripts/qa/customer-config-runtime-manifest.mjs",
  "scripts/qa/customer-config-runtime-manifest.test.mjs",
  "scripts/qa/private-deployment-boundaries.mjs",
  "scripts/qa/private-deployment-boundaries.test.mjs",
  "scripts/qa/private-deployment-package-closure.mjs",
  "scripts/qa/private-deployment-package-closure.test.mjs",
  "scripts/deploy/deployment-package-lint.mjs",
  "scripts/qa/test-data-isolation-boundary.test.mjs",
  "scripts/qa/docs-inventory.test.mjs",
  "scripts/qa/customer-source-repository-boundary.test.mjs",
  "scripts/qa/critical-postgres-gate.test.mjs",
  "scripts/qa/verify-go-test-json.mjs",
  "scripts/qa/verify-go-test-json.test.mjs",
  "scripts/qa/secrets.sh",
  "scripts/qa/secrets.mjs",
  "scripts/qa/secrets.test.mjs",
  "scripts/git-hooks/pre-commit.test.mjs",
  "scripts/git-hooks/pre-push.test.mjs",
  "scripts/import/customerSourceManifestCheck.test.mjs",
  "scripts/import/customerSourceExtract.test.mjs",
  "scripts/import/customerSourceSnapshotFreezeCheck.test.mjs",
  "scripts/import/customerImportDryRun.test.mjs",
  "scripts/deploy/deployment-package-lint.test.mjs",
  "scripts/deploy/migrate-online.test.mjs",
  "scripts/deploy/backup-restore-rehearsal-script.test.mjs",
  "server/deploy/compose/prod/migrate_online.sh",
  "deployments/yoyoosun/scripts/run-backup-restore-rehearsal.sh",
  "scripts/deploy/release-evidence-gate.test.mjs",
  "scripts/deploy/release-evidence-status.test.mjs",
  "scripts/deploy/release-evidence-closeout-plan.test.mjs",
  "scripts/deploy/release-evidence-closeout-runner.test.mjs",
  "web/scripts/trialDemoAccountBrowserSmoke.mjs",
  "web/src/erp/utils/adminProfileSync.test.mjs",
  "web/src/erp/config/entryConfig.test.mjs",
  "web/src/erp/config/menuPermissions.test.mjs",
  "web/src/erp/config/seedData.test.mjs",
  "web/src/erp/config/workflowStatus.test.mjs",
  "web/src/erp/config/devHub.test.mjs",
  "web/src/erp/config/devTesting.test.mjs",
  "web/src/erp/config/devDocs.test.mjs",
  "web/src/erp/config/devGovernance.test.mjs",
  "web/src/erp/config/devPrototypes.test.mjs",
  "web/src/erp/config/devCapabilityLedger.test.mjs",
  "web/src/erp/config/devCustomerConfig.test.mjs",
  "web/src/erp/config/printTemplates.test.mjs",
  "web/scripts/trialDemoAccountBrowserSmoke.test.mjs",
  "web/scripts/realLoginSmokeShared.test.mjs",
  "web/scripts/mobileAuthLoginRouteSmoke.test.mjs",
  "web/scripts/purchaseReceiptRealWriteBrowserE2E.test.mjs",
  "web/package.json",
  "server/go.mod",
]);

const FULL_REQUIRED_FILES = Object.freeze([
  "scripts/qa/fast.sh",
  "scripts/qa/full.sh",
  "scripts/purchase-receipt-pg.sh",
  "scripts/qa/fixtures/populated-upgrade-20260710150001.sql",
  "scripts/qa/fixtures/net-weight-kg-to-g-20260714165115.sql",
  "scripts/purchase-return-pg.sh",
  "scripts/qa/govulncheck.sh",
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
  "scripts/qa/agents-size.sh",
  "scripts/qa/db-guard.sh",
  "scripts/qa/populated-upgrade-preflight.sh",
  "scripts/qa/error-code-sync.sh",
  "scripts/qa/error-codes.sh",
  "server/deploy/compose/prod/migrate_online.sh",
  "deployments/yoyoosun/scripts/run-backup-restore-rehearsal.sh",
]);

const FULL_REQUIRED_EXECUTABLES = Object.freeze([
  "scripts/qa/fast.sh",
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
  full: Object.freeze([...FAST_REQUIRED_EXECUTABLES, ...FULL_REQUIRED_EXECUTABLES]),
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
    const missing = GATE_PROFILES[subsetName].filter((gate) => !superset.has(gate));
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
    const detail = String(error?.stderr || error?.message || "git command failed")
      .trim()
      .split("\n")[0];
    throw new Error(`[qa:profiles] git ${args[0]} failed: ${detail}`);
  }
}

function assertCommit(root, ref) {
  if (!ref || typeof ref !== "string" || /\s|\0/u.test(ref) || ref.startsWith("-")) {
    throw new Error(`[qa:profiles] unsafe commit ref: ${ref || "(empty)"}`);
  }
  runGit(root, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]);
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

export function validateProfileIndexTransition(profile, root, baseline = "HEAD") {
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
  const options = { baseline: "HEAD", profile: "", ref: "", source: "worktree" };
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
    throw new Error("usage: node scripts/qa/gate-profiles.mjs --profile fast|full|strict [--source worktree|tree|index-transition] [--ref COMMIT]");
  }
  return options;
}

function main() {
  const options = parseCliArgs(process.argv.slice(2));
  assertProfileHierarchy();
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
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
      console.error(`[qa:profiles] ${options.profile} required 路径不是普通文件:`);
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
