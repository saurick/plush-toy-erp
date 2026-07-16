#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { collectGitChangedFiles } from "./lib/git-range.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, "../..");
const LEVEL_ORDER = ["T0", "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"];
const CUSTOMER_SOURCE_BOUNDARY_TEST =
  "scripts/qa/customer-source-repository-boundary.test.mjs";
const PRIVATE_SOURCE_EXTENSIONS = new Set([
  ".doc",
  ".docx",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".xls",
  ".xlsx",
]);

const FIXED_COMMANDS = {
  diff: command("diff-check", "T0", "检查当前 diff 格式", "git", [
    "diff",
    "--check",
  ]),
  docs: command("docs-inventory", "T1", "检查长期文档登记", "node", [
    "--test",
    "scripts/qa/docs-inventory.test.mjs",
  ]),
  skillHealth: command(
    "skill-health",
    "T1",
    "检查项目 skill 结构、metadata、索引和引用",
    "node",
    ["scripts/qa/skill-health.mjs"],
  ),
  dbGuard: command("db-guard", "T2", "检查 schema 与 migration 同步", "bash", [
    "scripts/qa/db-guard.sh",
  ]),
  serverData: command(
    "server-data",
    "T2",
    "运行数据层测试",
    "go",
    ["test", "-count=1", "./internal/data/..."],
    "server",
  ),
  serverDomain: command(
    "server-domain",
    "T3",
    "运行领域、usecase 与 repo 测试",
    "go",
    [
      "test",
      "-count=1",
      "./internal/core/...",
      "./internal/biz",
      "./internal/data",
    ],
    "server",
  ),
  serverApi: command(
    "server-api",
    "T4",
    "运行领域、repo、JSON-RPC 与服务端合同测试",
    "go",
    [
      "test",
      "-count=1",
      "./internal/core/...",
      "./internal/biz",
      "./internal/data",
      "./internal/service",
      "./internal/server",
    ],
    "server",
  ),
  serverAll: command(
    "server-all",
    "T4",
    "运行全部服务端测试",
    "go",
    ["test", "-count=1", "./..."],
    "server",
  ),
  webLint: command("web-lint", "T5", "运行前端 lint", "pnpm", [
    "--dir",
    "web",
    "lint",
  ]),
  webCss: command("web-css", "T5", "运行前端 CSS 检查", "pnpm", [
    "--dir",
    "web",
    "css",
  ]),
  webTest: command("web-test", "T5", "运行前端单元与合同测试", "pnpm", [
    "--dir",
    "web",
    "test",
  ]),
  webBuild: command("web-build", "T5", "运行前端生产构建", "pnpm", [
    "--dir",
    "web",
    "build",
  ]),
  pgCreate: command(
    "critical-pg-create",
    "T7",
    "创建或确认本地隔离事务测试库",
    "make",
    ["purchase_receipt_pg_createdb"],
    "server",
  ),
  pgMigrate: command(
    "critical-pg-migrate",
    "T7",
    "应用本地隔离事务测试库 migration",
    "make",
    ["purchase_receipt_migrate_apply"],
    "server",
  ),
  pgTest: command(
    "critical-pg-test",
    "T7",
    "运行关键事务与并发门禁",
    "make",
    ["critical_transactions_pg_test"],
    "server",
  ),
  full: command("full", "T8", "运行推送前全量质量门禁", "bash", [
    "scripts/qa/full.sh",
  ]),
};

function command(id, level, label, bin, args, cwd = ".") {
  return { id, level, label, bin, args, cwd };
}

function normalizeFile(file) {
  const normalized = path.posix.normalize(
    String(file || "")
      .trim()
      .replaceAll("\\", "/")
      .replace(/^\.\//u, ""),
  );
  if (
    normalized === ".." ||
    normalized.startsWith("../") ||
    path.posix.isAbsolute(normalized) ||
    /^[A-Za-z]:\//u.test(normalized)
  ) {
    throw new Error(`path must stay inside the repository: ${file}`);
  }
  return normalized === "." ? "" : normalized;
}

function uniqueSorted(values) {
  return [...new Set([...values].map(normalizeFile).filter(Boolean))].sort();
}

function addReason(state, id, reason) {
  if (!state.reasons.has(id)) {
    state.reasons.set(id, new Set());
  }
  state.reasons.get(id).add(reason);
}

function addFixed(state, key, reason) {
  const selected = FIXED_COMMANDS[key];
  state.commands.set(selected.id, selected);
  addReason(state, selected.id, reason);
  state.levels.add(selected.level);
}

function siblingTestCandidates(file) {
  if (!/\.(?:js|jsx|mjs)$/u.test(file) || file.endsWith(".test.mjs")) {
    return [];
  }
  return [file.replace(/\.(?:js|jsx|mjs)$/u, ".test.mjs")];
}

function listTests(root, relativeDirectory) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  if (!fs.existsSync(absoluteDirectory)) {
    return [];
  }
  return fs
    .readdirSync(absoluteDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
    .map((entry) => `${relativeDirectory}/${entry.name}`)
    .sort();
}

function addNodeTests(state, files, reason, level) {
  const normalized = uniqueSorted(files);
  if (normalized.length === 0) {
    return;
  }
  const id = `node-tests:${normalized.join(",")}`;
  const commandLevel =
    level || (normalized.some((file) => file.startsWith("web/")) ? "T5" : "T1");
  state.commands.set(
    id,
    command(id, commandLevel, "运行直接关联的 Node 测试", "node", [
      "--test",
      ...normalized,
    ]),
  );
  addReason(state, id, reason);
  state.levels.add(commandLevel);
}

function addSyntaxCheck(state, file) {
  const id = `node-check:${file}`;
  state.commands.set(
    id,
    command(id, "T0", `检查 ${file} 语法`, "node", ["--check", file]),
  );
  addReason(state, id, file);
}

function addShellCheck(state, file) {
  const id = `bash-n:${file}`;
  state.commands.set(
    id,
    command(id, "T0", `检查 ${file} shell 语法`, "bash", ["-n", file]),
  );
  addReason(state, id, file);
}

function addFollowUp(state, id, level, text, reason) {
  if (!state.followUps.has(id)) {
    state.followUps.set(id, { id, level, text, reasons: new Set() });
  }
  state.followUps.get(id).reasons.add(reason);
  state.levels.add(level);
}

function isDocumentation(file) {
  return (
    file.endsWith(".md") ||
    file === "AGENTS.md" ||
    file === "progress.md" ||
    file.startsWith(".agents/skills/")
  );
}

function isCustomerPrivateSourcePath(file) {
  const segments = file.split("/");
  const extension = path.posix.extname(file).toLowerCase();
  const isPublicAsset = segments.includes("public-assets");
  if (/^docs\/customers\/[^/]+\/raw-source-files(?:\/|$)/u.test(file)) {
    return true;
  }
  if (file.startsWith("docs/customers/")) {
    return (
      extension === ".json" ||
      (!isPublicAsset && PRIVATE_SOURCE_EXTENSIONS.has(extension))
    );
  }
  if (file.startsWith("config/customers/")) {
    return !isPublicAsset && PRIVATE_SOURCE_EXTENSIONS.has(extension);
  }
  return (
    file.startsWith("deployments/") && PRIVATE_SOURCE_EXTENSIONS.has(extension)
  );
}

function isBusinessFactPath(file) {
  return (
    /^server\/internal\/(?:biz|data)\//u.test(file) &&
    /(?:inventory|purchase|quality|shipment|finance|operational_fact|process_runtime|process_domain_command|sales_order|stock_reservation|production|outsourcing|finished_goods|workflow|customer_config|source_document)/u.test(
      file,
    )
  );
}

export function buildAffectedPlan(files, { root = DEFAULT_ROOT } = {}) {
  const changedFiles = uniqueSorted(files);
  const state = {
    commands: new Map(),
    followUps: new Map(),
    levels: new Set(["T0"]),
    reasons: new Map(),
    requiresFull: false,
    webNeedsAllTests: false,
  };
  const directTests = new Set();

  addFixed(state, "diff", "所有改动");

  for (const file of changedFiles) {
    if (isCustomerPrivateSourcePath(file)) {
      addNodeTests(state, [CUSTOMER_SOURCE_BOUNDARY_TEST], file, "T6");
    }
    if (isDocumentation(file)) {
      addFixed(state, "docs", file);
      if (file.startsWith(".agents/skills/")) {
        addFixed(state, "skillHealth", file);
      }
      continue;
    }

    if (
      file === "Makefile" ||
      file.startsWith(".githooks/") ||
      file.startsWith("scripts/git-hooks/") ||
      file.startsWith("scripts/lib/") ||
      /^scripts\/qa\/(?:fast|full|strict)\.sh$/u.test(file)
    ) {
      state.requiresFull = true;
      addReason(state, "full", file);
      continue;
    }

    if (file.startsWith(".github/workflows/")) {
      directTests.add("scripts/qa/ci-workflow.test.mjs");
      addFollowUp(
        state,
        "remote-ci-enforcement",
        "T8",
        "确认本次 GitHub Actions 运行成功；仓库 workflow 只证明 CI 定义存在，branch protection / required check 仍需独立远端设置证据。",
        file,
      );
      continue;
    }

    if (
      file.startsWith("server/deploy/") ||
      file.startsWith("deployments/") ||
      file.startsWith("scripts/deploy/") ||
      /(?:^|\/)Dockerfile$/u.test(file) ||
      /(?:^|\/)compose[^/]*\.ya?ml$/u.test(file)
    ) {
      state.requiresFull = true;
      addReason(state, "full", file);
      addFollowUp(
        state,
        "release-validation",
        "T8",
        "发版前继续运行 strict、production preflight、目标 health/smoke、备份恢复和回滚 evidence；affected/full 不能替代目标环境证据。",
        file,
      );
      continue;
    }

    if (file === "server/go.mod" || file === "server/go.sum") {
      addFixed(state, "serverAll", file);
      continue;
    }

    if (
      file.startsWith("server/internal/data/model/schema/") ||
      file.startsWith("server/internal/data/model/migrate/") ||
      file.startsWith("server/internal/data/model/ent/")
    ) {
      addFixed(state, "dbGuard", file);
      addFixed(state, "serverData", file);
      addFollowUp(
        state,
        "schema-generation",
        "T2",
        "在 server/ 运行 make data，并检查生成代码、Atlas migration 与目标库 apply 状态；affected 不自动执行会改写文件或连接目标库的步骤。",
        file,
      );
      continue;
    }

    if (
      file.startsWith("server/internal/service/") ||
      file.startsWith("server/internal/server/")
    ) {
      addFixed(state, "serverApi", file);
      continue;
    }

    if (
      file.startsWith("server/internal/core/") ||
      file.startsWith("server/internal/biz/") ||
      file.startsWith("server/internal/data/")
    ) {
      addFixed(state, "serverDomain", file);
      if (isBusinessFactPath(file)) {
        addFixed(state, "pgCreate", file);
        addFixed(state, "pgMigrate", file);
        addFixed(state, "pgTest", file);
      }
      continue;
    }

    if (file.startsWith("server/") && file.endsWith(".go")) {
      addFixed(state, "serverAll", file);
      continue;
    }

    if (file.startsWith("config/") || file.startsWith("scripts/import/")) {
      const suite = file.startsWith("scripts/import/")
        ? listTests(root, "scripts/import")
        : [
            "config/customers/index.test.mjs",
            "scripts/build/apply-customer-web-config.test.mjs",
            "scripts/qa/private-deployment-boundaries.test.mjs",
            "scripts/qa/private-deployment-package-closure.test.mjs",
            "scripts/qa/customer-package-lint.test.mjs",
            "scripts/qa/customer-config-runtime-manifest.test.mjs",
            "scripts/qa/test-data-isolation-boundary.test.mjs",
          ];
      addNodeTests(state, suite, file, "T6");
      continue;
    }

    if (
      file === "web/package.json" ||
      file === "web/pnpm-lock.yaml" ||
      /^web\/vite.*\.mjs$/u.test(file)
    ) {
      addFixed(state, "webLint", file);
      addFixed(state, "webCss", file);
      addFixed(state, "webTest", file);
      addFixed(state, "webBuild", file);
      state.webNeedsAllTests = true;
      continue;
    }

    if (file.startsWith("web/src/")) {
      if (file.endsWith(".test.mjs")) {
        if (fs.existsSync(path.join(root, file))) {
          directTests.add(file);
        } else {
          addFixed(state, "webTest", file);
          state.webNeedsAllTests = true;
        }
      } else {
        const siblingTests = siblingTestCandidates(file).filter((candidate) =>
          fs.existsSync(path.join(root, candidate)),
        );
        siblingTests.forEach((candidate) => directTests.add(candidate));
        if (siblingTests.length === 0 && /\.(?:js|jsx|mjs|css)$/u.test(file)) {
          addFixed(state, "webTest", file);
          state.webNeedsAllTests = true;
        }
      }
      if (/\.(?:js|jsx|mjs)$/u.test(file)) {
        addFixed(state, "webLint", file);
      }
      if (file.endsWith(".css")) {
        addFixed(state, "webCss", file);
      }
      if (
        file.endsWith(".css") ||
        /\/(?:pages|components|mobile)\//u.test(file) ||
        /\/router(?:\.[^/]+)?$/u.test(file)
      ) {
        addFollowUp(
          state,
          "browser-regression",
          "T5",
          "选择受影响的 STYLE_L1_SCENARIOS 运行浏览器回归；共享布局、全局样式或无法可靠映射场景时扩大到完整 style:l1。",
          file,
        );
      }
      continue;
    }

    if (file.startsWith("web/scripts/")) {
      if (file.endsWith(".test.mjs")) {
        if (fs.existsSync(path.join(root, file))) {
          directTests.add(file);
        } else {
          state.requiresFull = true;
          addReason(state, "full", file);
        }
      } else {
        const siblingTests = siblingTestCandidates(file).filter((candidate) =>
          fs.existsSync(path.join(root, candidate)),
        );
        siblingTests.forEach((candidate) => directTests.add(candidate));
        if (file.endsWith(".mjs")) {
          addSyntaxCheck(state, file);
        }
      }
      if (/style(?:-l1|L1)/u.test(file)) {
        addFollowUp(
          state,
          "browser-regression",
          "T5",
          "选择受影响的 STYLE_L1_SCENARIOS 运行浏览器回归；共享布局、全局样式或无法可靠映射场景时扩大到完整 style:l1。",
          file,
        );
      }
      continue;
    }

    if (file.startsWith("scripts/qa/experimental/")) {
      if (file.endsWith(".mjs")) addSyntaxCheck(state, file);
      addFollowUp(
        state,
        "experimental-canonical-audit",
        "T1",
        "可显式运行 canonical runtime experimental audit；其 broad keyword 命中只作只读审查线索，不阻断 affected/fast，也不代表产品缺陷。",
        file,
      );
      continue;
    }

    if (file === "scripts/qa/ci-workflow-yaml-check.go") {
      directTests.add("scripts/qa/ci-workflow.test.mjs");
      continue;
    }

    if (
      file === "scripts/qa/populated-upgrade-20260714055504.sql" ||
      file === "scripts/qa/customer-config-cutover-20260714055825.sql"
    ) {
      directTests.add("scripts/qa/populated-upgrade-preflight.test.mjs");
      continue;
    }

    if (
      file === "scripts/qa/fixtures/populated-upgrade-20260710150001.sql" ||
      file === "scripts/qa/fixtures/net-weight-kg-to-g-20260714165115.sql"
    ) {
      directTests.add("scripts/qa/critical-postgres-gate.test.mjs");
      continue;
    }

    if (file.startsWith("scripts/qa/")) {
      if (file.endsWith(".test.mjs")) {
        if (fs.existsSync(path.join(root, file))) {
          directTests.add(file);
        } else {
          state.requiresFull = true;
          addReason(state, "full", file);
        }
      } else if (file.endsWith(".mjs")) {
        const siblingTests = siblingTestCandidates(file).filter((candidate) =>
          fs.existsSync(path.join(root, candidate)),
        );
        if (siblingTests.length === 0) {
          state.requiresFull = true;
          addReason(state, "full", file);
        } else {
          siblingTests.forEach((candidate) => directTests.add(candidate));
          addSyntaxCheck(state, file);
        }
      } else if (file.endsWith(".sh")) {
        addShellCheck(state, file);
        const sibling = file.replace(/\.sh$/u, ".test.mjs");
        if (fs.existsSync(path.join(root, sibling))) {
          directTests.add(sibling);
        } else {
          state.requiresFull = true;
          addReason(state, "full", file);
        }
      }
      continue;
    }

    if (file.endsWith(".test.mjs")) {
      if (fs.existsSync(path.join(root, file))) {
        directTests.add(file);
      } else {
        state.requiresFull = true;
        addReason(state, "full", file);
      }
      continue;
    }

    state.requiresFull = true;
    addReason(state, "full", file);
  }

  if (state.requiresFull) {
    const fullReasons = [...(state.reasons.get("full") || [])];
    const retainedCommands = [...state.commands].filter(
      ([, selected]) => selected.level === "T0",
    );
    const retainedReasons = new Map(
      retainedCommands.map(([id]) => [
        id,
        new Set(state.reasons.get(id) || []),
      ]),
    );
    state.commands = new Map(retainedCommands);
    state.reasons = retainedReasons;
    addFixed(
      state,
      "full",
      "全局入口、部署、无独立测试的 QA 脚本或未知路径采用保守全量门禁",
    );
    fullReasons.forEach((reason) => addReason(state, "full", reason));
  } else {
    if (state.webNeedsAllTests) {
      for (const testFile of [...directTests]) {
        if (testFile.startsWith("web/src/")) {
          directTests.delete(testFile);
        }
      }
    }
    addNodeTests(state, directTests, "改动文件或同名实现的直接测试");
  }

  const commands = [...state.commands.values()]
    .map((selected) => ({
      ...selected,
      reasons: [...(state.reasons.get(selected.id) || [])].sort(),
    }))
    .sort((left, right) => {
      const levelDifference =
        LEVEL_ORDER.indexOf(left.level) - LEVEL_ORDER.indexOf(right.level);
      return levelDifference || left.id.localeCompare(right.id);
    });
  const followUps = [...state.followUps.values()]
    .map((item) => ({ ...item, reasons: [...item.reasons].sort() }))
    .sort(
      (left, right) =>
        LEVEL_ORDER.indexOf(left.level) - LEVEL_ORDER.indexOf(right.level),
    );
  const levels = [...state.levels].sort(
    (left, right) => LEVEL_ORDER.indexOf(left) - LEVEL_ORDER.indexOf(right),
  );

  return {
    changedFiles,
    levels,
    highestLevel: levels.at(-1) || "T0",
    commands,
    followUps,
    requiresFull: state.requiresFull,
    prePushGate: "bash scripts/qa/full.sh",
  };
}

export function collectChangedFiles({
  root = DEFAULT_ROOT,
  base,
  staged = false,
} = {}) {
  const range = base ? (base.includes("..") ? base : `${base}...HEAD`) : "";
  return uniqueSorted(
    collectGitChangedFiles({
      root,
      range,
      includeWorktree: !staged,
      includeStaged: true,
      includeUntracked: !staged,
    }).map(normalizeFile),
  );
}

function shellQuote(value) {
  return /^[A-Za-z0-9_./:=@+-]+$/u.test(value)
    ? value
    : `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function formatCommand(selected, root = DEFAULT_ROOT) {
  const bin =
    selected.bin === "pnpm" ? process.env.PNPM_BIN || "pnpm" : selected.bin;
  const body = [bin, ...selected.args].map(shellQuote).join(" ");
  if (selected.cwd === ".") {
    return body;
  }
  return `(cd ${shellQuote(path.join(root, selected.cwd))} && ${body})`;
}

export function formatPlan(plan, { root = DEFAULT_ROOT } = {}) {
  const lines = [
    `[qa:affected] files=${plan.changedFiles.length} levels=${plan.levels.join(",")} highest=${plan.highestLevel}`,
  ];
  if (plan.changedFiles.length === 0) {
    lines.push("[qa:affected] 未检测到改动；仅保留静态 diff 检查。");
  } else {
    lines.push("[qa:affected] changed files:");
    plan.changedFiles.forEach((file) => lines.push(`  - ${file}`));
  }
  lines.push("[qa:affected] commands:");
  plan.commands.forEach((selected, index) => {
    lines.push(`  ${index + 1}. [${selected.level}] ${selected.label}`);
    lines.push(`     ${formatCommand(selected, root)}`);
  });
  if (plan.followUps.length > 0) {
    lines.push("[qa:affected] required follow-ups:");
    plan.followUps.forEach((item) =>
      lines.push(`  - [${item.level}] ${item.text}`),
    );
  }
  lines.push(
    `[qa:affected] pre-push 仍由 ${plan.prePushGate} 全量兜底；affected 通过不代表发布或目标环境验收完成。`,
  );
  return lines.join("\n");
}

function resolveProjectPnpm(root) {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(root, "web/package.json"), "utf8"),
  );
  const expected = String(packageJson.packageManager || "").match(
    /^pnpm@(.+)$/u,
  )?.[1];
  if (!expected) {
    throw new Error("web/package.json packageManager must pin pnpm@x.y.z");
  }
  const pathCandidates = String(process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean)
    .map((directory) => path.join(directory, "pnpm"));
  const candidates = [
    ...new Set(
      [
        process.env.PNPM_BIN || "",
        ...pathCandidates,
        "/usr/local/bin/pnpm",
        "/opt/homebrew/bin/pnpm",
      ].filter(Boolean),
    ),
  ];
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      const version = execFileSync(candidate, ["-v"], {
        encoding: "utf8",
      }).trim();
      if (version === expected) {
        return candidate;
      }
    } catch {
      // Continue until a project-compatible pnpm is found.
    }
  }
  throw new Error(
    `project pnpm ${expected} not found; run scripts/doctor.sh and fix PATH`,
  );
}

export function runPlan(plan, { root = DEFAULT_ROOT } = {}) {
  let pnpmBin = "";
  for (const selected of plan.commands) {
    if (selected.bin === "pnpm" && !pnpmBin) {
      pnpmBin = resolveProjectPnpm(root);
    }
    const bin = selected.bin === "pnpm" ? pnpmBin : selected.bin;
    const cwd = path.resolve(root, selected.cwd);
    const startedAt = Date.now();
    console.log(
      `[qa:affected] start ${selected.id}: ${formatCommand(selected, root)}`,
    );
    const result = spawnSync(bin, selected.args, {
      cwd,
      env: process.env,
      stdio: "inherit",
    });
    const durationMs = Date.now() - startedAt;
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(
        `${selected.id} failed with exit code ${result.status} after ${durationMs}ms`,
      );
    }
    console.log(`[qa:affected] pass ${selected.id} durationMs=${durationMs}`);
  }
}

function printHelp() {
  console.log(`用法:
  bash scripts/qa/affected.sh [--plan] [--json]
  bash scripts/qa/affected.sh --run
  bash scripts/qa/affected.sh --staged [--run]
  bash scripts/qa/affected.sh --base origin/main [--run]
  bash scripts/qa/affected.sh --file <repo-relative-path> [--file <path> ...] [--run]

作用:
  根据当前改动选择足够但不过度的本地测试。默认只打印计划，--run 才执行。
  未识别路径、全局入口和发布路径会保守升级为 full.sh。
  页面浏览器回归、make data、目标环境 smoke/evidence 会作为 required follow-up 明示。

边界:
  affected 不替代 pre-push 的 full.sh，也不替代 strict、目标环境 migration、smoke 或发布证据。`);
}

function parseArgs(argv) {
  const options = {
    files: [],
    planOnly: true,
    json: false,
    staged: false,
    base: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg === "--plan") {
      options.planOnly = true;
    } else if (arg === "--run") {
      options.planOnly = false;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--staged") {
      options.staged = true;
    } else if (arg === "--base") {
      options.base = argv[++index] || "";
      if (!options.base) throw new Error("--base requires a git ref or range");
    } else if (arg === "--file") {
      const file = argv[++index] || "";
      if (!file) throw new Error("--file requires a repo-relative path");
      options.files.push(file);
    } else {
      throw new Error(`unsupported argument: ${arg}`);
    }
  }
  if (options.staged && options.base) {
    throw new Error("--staged and --base cannot be used together");
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const files =
    options.files.length > 0
      ? options.files
      : collectChangedFiles({
          root: DEFAULT_ROOT,
          base: options.base,
          staged: options.staged,
        });
  const plan = buildAffectedPlan(files, { root: DEFAULT_ROOT });
  if (options.json) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    console.log(formatPlan(plan, { root: DEFAULT_ROOT }));
  }
  if (!options.planOnly) {
    runPlan(plan, { root: DEFAULT_ROOT });
    if (plan.followUps.length > 0) {
      console.log(
        "[qa:affected] 自动命令已通过；required follow-ups 仍需按计划完成并单独记录。",
      );
    }
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(`[qa:affected] ${error.message}`);
    process.exitCode = 1;
  });
}
