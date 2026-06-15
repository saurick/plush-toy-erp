#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_OUT_DIR = "output/customers/yoyoosun/mvp-closure";

const REQUIRED_PATHS = [
  "docs/product/产品完成路线图.md",
  "docs/product/自动化测试策略.md",
  "scripts/qa/trial-simulated-data.mjs",
  "scripts/qa/operational-fact-simulated-closure.mjs",
  "scripts/qa/mobile-workflow-simulated-closure.mjs",
  "scripts/qa/trial-account-rbac.mjs",
  "scripts/seed-role-demo-admins.sh",
  "scripts/seed-core-demo-data.sh",
];

const FORBIDDEN_RUNTIME_EFFECTS = [
  "不连接数据库",
  "不调用后端",
  "不写 business_records",
  "不执行真实客户导入",
  "不修改 schema / migration / RBAC / Workflow / Fact 规则",
  "不把 workflow task done 当成 fact posted",
];

const MVP_PHASES = [
  {
    key: "preflight",
    title: "环境和真源预检",
    commands: [
      "git status --short",
      "git diff --check",
      "cd server && make print_db_url",
      "cd server && make migrate_status",
    ],
    acceptance: [
      "确认命中的数据库和目标环境一致。",
      "确认本轮没有把并行现场误写成本轮结果。",
      "确认 roadmap、测试策略和当前真源仍是验收口径。",
    ],
  },
  {
    key: "roles-and-seed",
    title: "角色和核心模拟基础资料",
    commands: [
      "ERP_ROLE_DEMO_PASSWORD='replace-with-local-demo-password' bash scripts/seed-role-demo-admins.sh",
      "bash scripts/seed-core-demo-data.sh",
      "TRIAL_ACCOUNT_PASSWORD='replace-with-local-demo-password' node scripts/qa/trial-account-rbac.mjs",
    ],
    acceptance: [
      "角色账号绑定真实 RBAC 角色，不写入客户配置包。",
      "核心 seed 只写单位、材料、产品、仓库和 BOM 模拟基础资料。",
      "RBAC 核对覆盖登录、角色、岗位入口和 debug 权限边界。",
    ],
  },
  {
    key: "source-document",
    title: "MVP 源单据试用数据",
    commands: [
      "node scripts/qa/trial-simulated-data.mjs --out output/customers/yoyoosun/trial-simulated-data",
      "TRIAL_SIM_CONFIRM=APPLY_SIMULATED_TRIAL_DATA TRIAL_SIM_PASSWORD='replace-with-demo-password' node scripts/qa/trial-simulated-data.mjs --apply --backend-url http://127.0.0.1:8300 --product-id <product_id> --unit-id <unit_id> --out output/customers/yoyoosun/trial-simulated-data",
    ],
    acceptance: [
      "客户、供应商、联系人、销售订单和订单行只作为 V1 模拟数据。",
      "销售订单仍是 Source Document / Business Commitment。",
      "该阶段不生成出货、库存、财务、发票或收付款事实。",
    ],
  },
  {
    key: "fact-foundation",
    title: "采购 / 质检 / 库存事实基础",
    commands: [
      "cd server && make inventory_pg_test",
      "cd server && make bom_lot_pg_test",
      "cd server && make purchase_receipt_pg_test",
      "cd server && make purchase_return_pg_test",
      "cd server && go test ./internal/core/... ./internal/biz ./internal/data",
    ],
    acceptance: [
      "库存变化来自事实 usecase 和 inventory_txns。",
      "采购入库、退货、调整、质检和批次状态互相不替代。",
      "错误通过 REVERSAL / 调整修正，不直接修改历史流水。",
    ],
  },
  {
    key: "operational-fact-simulation",
    title: "扩展业务事实模拟闭环",
    commands: [
      "node scripts/qa/operational-fact-simulated-closure.mjs --product-id <product_id> --unit-id <unit_id> --warehouse-id <warehouse_id> --out output/customers/yoyoosun/operational-fact-simulated-closure",
      "OPERATIONAL_FACT_SIM_CONFIRM=APPLY_SIMULATED_OPERATIONAL_FACTS OPERATIONAL_FACT_SIM_PASSWORD='replace-with-demo-password' node scripts/qa/operational-fact-simulated-closure.mjs --apply --backend-url http://127.0.0.1:8300 --product-id <product_id> --unit-id <unit_id> --warehouse-id <warehouse_id> --run-id target-yyyymmdd-closure --out output/customers/yoyoosun/operational-fact-simulated-closure-target",
    ],
    acceptance: [
      "只验证生产、预留、委外、出货和财务的模拟事实链。",
      "不等于真实客户数据导入，不代表完整财务、物流、装箱、核销交付。",
      "不绕过 OperationalFactUsecase 直接写事实表。",
    ],
  },
  {
    key: "mobile-workflow",
    title: "岗位任务端 Workflow 闭环",
    commands: [
      "node scripts/qa/mobile-workflow-simulated-closure.mjs --out output/customers/yoyoosun/mobile-workflow-simulated-closure",
      "MOBILE_WORKFLOW_SIM_CONFIRM=APPLY_SIMULATED_MOBILE_WORKFLOW_TASKS MOBILE_WORKFLOW_SIM_PASSWORD='replace-with-demo-password' node scripts/qa/mobile-workflow-simulated-closure.mjs --apply --backend-url http://127.0.0.1:8300 --run-id target-yyyymmdd-mobile --out output/customers/yoyoosun/mobile-workflow-simulated-closure-target",
    ],
    acceptance: [
      "只验证岗位协同、处理动作、异常和现场留痕。",
      "Workflow task done 不等于库存、出货或财务事实已过账。",
      "岗位任务端不绕过 WorkflowUsecase 或事实 usecase。",
    ],
  },
  {
    key: "frontend-regression",
    title: "前端菜单和浏览器回归",
    commands: [
      "cd web && pnpm lint",
      "cd web && pnpm css",
      "cd web && pnpm test",
      "cd web && pnpm style:l1",
      "TRIAL_ACCOUNT_PASSWORD='replace-with-local-demo-password' pnpm --dir web smoke:trial-demo-browser",
    ],
    acceptance: [
      "默认态、交互态、恢复态和相邻区域完成浏览器级回归。",
      "菜单隐藏不替代后端 RBAC。",
      "页面只提交业务动作，不补造后端事实。",
    ],
  },
];

function parseArgs(argv) {
  const options = {
    out: DEFAULT_OUT_DIR,
    runReportTools: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      options.out = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--run-report-tools") {
      options.runReportTools = true;
      continue;
    }
    if (arg === "--product-id") {
      options.productId = parsePositiveInt(argv[index + 1], "--product-id");
      index += 1;
      continue;
    }
    if (arg === "--unit-id") {
      options.unitId = parsePositiveInt(argv[index + 1], "--unit-id");
      index += 1;
      continue;
    }
    if (arg === "--warehouse-id") {
      options.warehouseId = parsePositiveInt(argv[index + 1], "--warehouse-id");
      index += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    if (arg === "--apply" || arg === "--execute") {
      throw new Error(
        `${arg} is not supported by mvp-closure. Run the specific simulated tool with its explicit confirmation instead.`,
      );
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  return options;
}

function parsePositiveInt(value, flag) {
  if (!/^[1-9][0-9]*$/.test(String(value || ""))) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return Number(value);
}

function printHelp() {
  console.log(`Usage:
  node scripts/qa/mvp-closure.mjs [--out <dir>]
  node scripts/qa/mvp-closure.mjs --run-report-tools --product-id <id> --unit-id <id> --warehouse-id <id>

Purpose:
  Generate ERP MVP closure evidence and, optionally, run no-write report-only tools.

Boundaries:
  - default mode writes local evidence only
  - --run-report-tools only runs report-only commands
  - does not support --apply or --execute
  - does not connect to DB or backend directly
`);
}

function checkRequiredPaths(rootDir) {
  return REQUIRED_PATHS.map((relativePath) => ({
    path: relativePath,
    exists: fs.existsSync(path.join(rootDir, relativePath)),
  }));
}

function createReport(options, rootDir, toolRuns = []) {
  const requiredPaths = checkRequiredPaths(rootDir);
  const missingRequiredPaths = requiredPaths
    .filter((item) => !item.exists)
    .map((item) => item.path);

  return {
    generatedAt: new Date().toISOString(),
    host: os.hostname(),
    scenario: "erp-mvp-closure",
    mode: options.runReportTools ? "report-with-no-write-tools" : "plan-only",
    simulatedOnly: true,
    realCustomerImport: false,
    writesDatabase: false,
    callsBackend: false,
    changesRuntime: false,
    out: options.out || DEFAULT_OUT_DIR,
    suppliedIds: {
      productId: options.productId || null,
      unitId: options.unitId || null,
      warehouseId: options.warehouseId || null,
    },
    requiredPaths,
    missingRequiredPaths,
    forbiddenRuntimeEffects: FORBIDDEN_RUNTIME_EFFECTS,
    phases: MVP_PHASES,
    noWriteToolRuns: toolRuns,
    finalDecision: {
      canReplaceDomainTests: false,
      canReplaceBrowserRegression: false,
      canReplaceDeploymentSmoke: false,
      canExecuteRealImport: false,
      canProveCustomerAcceptance: false,
      nextStep: options.runReportTools
        ? "Review generated no-write evidence, then run apply-mode scripts only in an explicitly approved environment."
        : "Review the plan, then rerun with --run-report-tools for no-write evidence if needed.",
    },
  };
}

function renderMarkdown(report) {
  const requiredPathRows = report.requiredPaths
    .map((item) => `| ${item.path} | ${item.exists ? "PASS" : "FAIL"} |`)
    .join("\n");
  const phaseSections = report.phases
    .map(
      (phase) => `### ${phase.title}

命令:

${phase.commands.map((command) => `\`\`\`bash\n${command}\n\`\`\``).join("\n\n")}

验收:

${phase.acceptance.map((item) => `- ${item}`).join("\n")}
`,
    )
    .join("\n");
  const toolRows =
    report.noWriteToolRuns.length === 0
      ? "| 未运行 | plan-only | - | - |"
      : report.noWriteToolRuns
          .map(
            (run) =>
              `| ${run.key} | ${run.status} | ${run.command.join(" ")} | ${run.out || "-"} |`,
          )
          .join("\n");

  return `# ERP MVP 闭环验收报告 / ERP MVP Closure Report

## 摘要

| 项目 | 结果 |
| --- | --- |
| scenario | ${report.scenario} |
| mode | ${report.mode} |
| simulatedOnly | ${report.simulatedOnly} |
| writesDatabase | ${report.writesDatabase} |
| callsBackend | ${report.callsBackend} |
| realCustomerImport | ${report.realCustomerImport} |
| productId | ${report.suppliedIds.productId || "-"} |
| unitId | ${report.suppliedIds.unitId || "-"} |
| warehouseId | ${report.suppliedIds.warehouseId || "-"} |

## 必需入口检查

| 路径 | 结果 |
| --- | --- |
${requiredPathRows}

## 禁止边界

${report.forbiddenRuntimeEffects.map((item) => `- ${item}`).join("\n")}

## No-write 工具运行

| 工具 | 状态 | 命令 | 输出 |
| --- | --- | --- | --- |
${toolRows}

## 验收流程

${phaseSections}

## 结论

- 本报告不能替代领域单测、PG 集成测试、浏览器回归或部署 smoke。
- 本报告不能证明客户真实验收通过。
- 真正写入模拟数据时，必须分别调用对应脚本的 \`--apply\`，并提供脚本要求的确认环境变量。
`;
}

function runCommand(rootDir, key, command, out) {
  const child = spawnSync(command[0], command.slice(1), {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
  });
  return {
    key,
    command,
    out,
    status: child.status === 0 ? "PASS" : "FAIL",
    exitCode: child.status,
    stdout: child.stdout,
    stderr: child.stderr,
  };
}

function runNoWriteToolReports(options, rootDir, outDir) {
  const runs = [];
  const node = process.execPath;

  const trialOut = path.join(outDir, "trial-simulated-data");
  runs.push(
    runCommand(
      rootDir,
      "trial-simulated-data",
      [node, "scripts/qa/trial-simulated-data.mjs", "--out", trialOut],
      trialOut,
    ),
  );

  if (options.productId && options.unitId && options.warehouseId) {
    const operationalOut = path.join(outDir, "operational-fact-simulated-closure");
    runs.push(
      runCommand(
        rootDir,
        "operational-fact-simulated-closure",
        [
          node,
          "scripts/qa/operational-fact-simulated-closure.mjs",
          "--product-id",
          String(options.productId),
          "--unit-id",
          String(options.unitId),
          "--warehouse-id",
          String(options.warehouseId),
          "--out",
          operationalOut,
        ],
        operationalOut,
      ),
    );
  } else {
    runs.push({
      key: "operational-fact-simulated-closure",
      command: [
        node,
        "scripts/qa/operational-fact-simulated-closure.mjs",
        "--product-id",
        "<product_id>",
        "--unit-id",
        "<unit_id>",
        "--warehouse-id",
        "<warehouse_id>",
      ],
      out: null,
      status: "SKIPPED",
      exitCode: null,
      stdout: "",
      stderr: "missing --product-id / --unit-id / --warehouse-id",
    });
  }

  const mobileOut = path.join(outDir, "mobile-workflow-simulated-closure");
  runs.push(
    runCommand(
      rootDir,
      "mobile-workflow-simulated-closure",
      [node, "scripts/qa/mobile-workflow-simulated-closure.mjs", "--out", mobileOut],
      mobileOut,
    ),
  );

  return runs;
}

function writeReport(report, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "mvp-closure-report.json");
  const mdPath = path.join(outDir, "mvp-closure-report.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(mdPath, renderMarkdown(report));
  return { jsonPath, mdPath };
}

export function runMvpClosure(options = {}) {
  const rootDir =
    options.rootDir || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const outDir = path.resolve(rootDir, options.out || DEFAULT_OUT_DIR);
  fs.mkdirSync(outDir, { recursive: true });

  const toolRuns = options.runReportTools
    ? runNoWriteToolReports(options, rootDir, outDir)
    : [];
  const report = createReport(options, rootDir, toolRuns);
  const output = writeReport(report, outDir);

  const failedRun = toolRuns.find((run) => run.status === "FAIL");
  if (failedRun) {
    const error = new Error(`no-write report tool failed: ${failedRun.key}`);
    error.report = report;
    error.output = output;
    throw error;
  }

  if (report.missingRequiredPaths.length > 0) {
    const error = new Error(
      `missing required MVP closure paths: ${report.missingRequiredPaths.join(", ")}`,
    );
    error.report = report;
    error.output = output;
    throw error;
  }

  return {
    outDir,
    ...output,
    report,
  };
}

const isCli = process.argv[1] === fileURLToPath(import.meta.url);

if (isCli) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      process.exit(0);
    }
    const result = runMvpClosure(options);
    console.log(
      `[qa:mvp-closure] ${result.report.mode} complete. json=${result.jsonPath} md=${result.mdPath}`,
    );
  } catch (error) {
    console.error(`[qa:mvp-closure][fatal] ${error?.stack || error?.message || error}`);
    process.exit(1);
  }
}
