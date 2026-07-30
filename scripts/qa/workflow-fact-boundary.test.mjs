import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

const workflowSourceFiles = [
  ...readdirSync(path.join(repoRoot, "server/internal/biz"))
    .filter((fileName) => fileName.startsWith("workflow") && fileName.endsWith(".go"))
    .map((fileName) => `server/internal/biz/${fileName}`),
  ...readdirSync(path.join(repoRoot, "server/internal/data"))
    .filter((fileName) => fileName.startsWith("workflow") && fileName.endsWith(".go"))
    .map((fileName) => `server/internal/data/${fileName}`),
  ...readdirSync(path.join(repoRoot, "server/internal/service"))
    .filter((fileName) => fileName.startsWith("jsonrpc_workflow") && fileName.endsWith(".go"))
    .map((fileName) => `server/internal/service/${fileName}`),
];

const forbiddenRuntimeFactReferences = [
  "OperationalFactUsecase",
  "OperationalFactRepo",
  "CreateProductionFactDraft",
  "CreateOutsourcingFactDraft",
  "CreateFinanceFactDraft",
  "PostProductionFact",
  "PostOutsourcingFact",
  "PostFinanceFact",
  "ShipShipment",
  "inventory_txns",
  "inventory_balances",
  "inventory_lots",
  "production_facts",
  "outsourcing_facts",
  "finance_facts",
  "shipment_items",
];

test("workflow fact boundary: workflow runtime does not post domain facts", () => {
  assert(workflowSourceFiles.length > 0, "expected workflow runtime files");
  for (const relativePath of workflowSourceFiles) {
    const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
    for (const forbidden of forbiddenRuntimeFactReferences) {
      assert(
        !source.includes(forbidden),
        `${relativePath} must not reference ${forbidden}; call domain usecases from explicit domain entries instead`,
      );
    }
  }
});

test("workflow fact boundary: workflow explain exposes guarded domain command entry", () => {
  const source = readFileSync(
    path.join(repoRoot, "server/internal/service/jsonrpc_workflow_task.go"),
    "utf8",
  );
  for (const expected of [
    "domain_command_entry",
    "action_domain_command_entries",
    "guarded_no_domain_command_contract",
    "domain_command_contract_not_configured",
    "workflow_payload_command_key_ignored",
    "will_write_fact",
  ]) {
    assert(
      source.includes(expected),
      `jsonrpc_workflow_task.go should expose guarded domain command entry token ${expected}`,
    );
  }
});

test("status architecture is target-only and separates delivery evidence", () => {
  const statusIndex = readFileSync(
    path.join(repoRoot, "docs/architecture/状态字典与生命周期索引.md"),
    "utf8",
  );
  const workflowBoundary = readFileSync(
    path.join(repoRoot, "docs/architecture/状态工作流事实边界.md"),
    "utf8",
  );
  const roleProjection = readFileSync(
    path.join(repoRoot, "docs/product/多甲方角色能力与流程编排.md"),
    "utf8",
  );

  function extractH2Section(source, heading) {
    const marker = `## ${heading}`;
    const start = source.indexOf(marker);
    assert.notEqual(start, -1, `missing section ${heading}`);
    const end = source.indexOf("\n## ", start + marker.length);
    return source.slice(start, end === -1 ? source.length : end);
  }

  function extractTextTree(source, heading) {
    const marker = `### ${heading}`;
    const headingStart = source.indexOf(marker);
    assert.notEqual(headingStart, -1, `missing tree heading ${heading}`);
    const fenceStart = source.indexOf("```text", headingStart + marker.length);
    assert.notEqual(fenceStart, -1, `missing text fence for ${heading}`);
    const contentStart = source.indexOf("\n", fenceStart) + 1;
    const fenceEnd = source.indexOf("\n```", contentStart);
    assert.notEqual(fenceEnd, -1, `missing closing fence for ${heading}`);
    return source.slice(contentStart, fenceEnd);
  }

  function requireUniqueLine(scopeName, source, label, required, forbidden = []) {
    const matches = source.split("\n").filter((line) => line.includes(label));
    assert.equal(matches.length, 1, `${scopeName} must contain one ${label} line`);
    const line = matches[0];
    for (const token of required) {
      assert(line.includes(token), `${scopeName} ${label} line must include ${token}`);
    }
    for (const token of forbidden) {
      assert(!line.includes(token), `${scopeName} ${label} line must exclude ${token}`);
    }
  }

  function requirePrefixedLine(scopeName, source, prefix, required) {
    const matches = source
      .split("\n")
      .filter((line) => line.trimStart().startsWith(prefix));
    assert.equal(matches.length, 1, `${scopeName} must contain one ${prefix} line`);
    for (const token of required) {
      assert(
        matches[0].includes(token),
        `${scopeName} ${prefix} line must include ${token}`,
      );
    }
  }

  const chineseTree = extractTextTree(statusIndex, "中文状态字典树");
  const englishTree = extractTextTree(statusIndex, "English Status Dictionary Tree");
  requireUniqueLine(
    "English tree",
    englishTree,
    "WIP batch:",
    [
      "PLANNED",
      "SPLIT",
      "IN_PROGRESS",
      "OUTSOURCED",
      "CANCELLED",
      "WAITING_QUALITY",
      "ACCEPTED",
      "REJECTED",
    ],
  );
  assert.equal(
    englishTree.match(/\bPLANNED\b/gu)?.length ?? 0,
    1,
    "English tree must contain exactly one canonical PLANNED state",
  );
  for (const [treeName, tree] of [
    ["Chinese tree", chineseTree],
    ["English tree", englishTree],
  ]) {
    assert.doesNotMatch(
      tree,
      /\[(?:C|L|P|D)(?:\s*\/\s*(?:C|L|P|D))*\]/iu,
      `${treeName} must not use availability markers`,
    );
    const maturityMarkerScope =
      treeName === "English tree" ? tree.replace(/\bPLANNED\b/gu, "") : tree;
    for (const term of ["current", "legacy", "compatibility", "planned", "deferred"]) {
      assert(
        !maturityMarkerScope.toLowerCase().includes(term),
        `${treeName} must exclude ${term} maturity markers`,
      );
    }
    assert(!tree.includes("WorkflowReconcileJob"), `${treeName} must exclude draft jobs`);
  }

  requireUniqueLine(
    "Chinese tree",
    chineseTree,
    "协同任务",
    ["创建", "可执行", "阻塞", "已完成", "已退回"],
    ["待开始", "处理中", "已取消", "已关闭"],
  );
  requireUniqueLine(
    "Chinese tree",
    chineseTree,
    "物料清单",
    ["草稿", "生效", "已归档"],
    ["已停用"],
  );
  requireUniqueLine(
    "Chinese tree",
    chineseTree,
    "流程实例",
    ["运行中", "已完成", "已阻塞"],
    ["已取消"],
  );
  requireUniqueLine(
    "Chinese tree",
    chineseTree,
    "流程节点",
    ["等待中", "运行中", "已完成", "已阻塞"],
    ["已跳过", "已失败"],
  );

  requireUniqueLine(
    "English tree",
    englishTree,
    "task:",
    ["create", "ready", "blocked", "done", "rejected"],
    ["pending", "processing", "cancelled", "closed"],
  );
  requireUniqueLine(
    "English tree",
    englishTree,
    "BOM:",
    ["DRAFT", "ACTIVE", "ARCHIVED"],
    ["DISABLED"],
  );
  requireUniqueLine(
    "English tree",
    englishTree,
    "instance:",
    ["active", "completed", "blocked"],
    ["cancelled"],
  );
  requireUniqueLine(
    "English tree",
    englishTree,
    "node:",
    ["waiting", "active", "completed", "blocked"],
    ["skipped", "failed"],
  );

  assert(
    roleProjection.includes("状态字典与生命周期索引.md"),
    "role projection document must link the status dictionary source of truth",
  );

  const taskContract = extractH2Section(
    statusIndex,
    "Workflow 任务合同 / Workflow Task Contract",
  );
  requirePrefixedLine("task contract", taskContract, "ready", [
    "blocked",
    "done",
    "rejected",
  ]);
  requirePrefixedLine("task contract", taskContract, "blocked", ["ready"]);
  requireUniqueLine(
    "task contract",
    taskContract,
    "任务看板只接受",
    ["all", "ready", "blocked", "rejected", "done", "overdue", "dueSoon"],
  );
  requireUniqueLine(
    "task contract",
    taskContract,
    "`resume`",
    ["blocked → ready", "business_status_key", "workflow_business_states", "保持 `blocked`"],
  );

  const evidence = extractH2Section(
    statusIndex,
    "实现、迁移与发布证据 / Implementation, Migration And Release Evidence",
  );
  requireUniqueLine(
    "implementation evidence",
    evidence,
    "中央状态合同",
    ["registry", "transition", "只证明中央允许集合与转换图"],
  );
  requireUniqueLine(
    "implementation evidence",
    evidence,
    "跨层调用方与生成物",
    ["已收口", "repo", "service", "API", "UI", "seed", "fixture", "tests", "Ent generated"],
  );
  requireUniqueLine(
    "implementation evidence",
    evidence,
    "| versioned migration |",
    ["20260714055504", "不能证明", "目标数据库"],
  );
  requireUniqueLine("implementation evidence", evidence, "| 目标环境 |", ["未发布"]);
  requireUniqueLine(
    "implementation evidence",
    evidence,
    "一次性转换完成后",
    ["usecase", "repo", "API", "UI", "查询筛选"],
  );
  requireUniqueLine(
    "implementation evidence",
    evidence,
    "正式运行代码只识别目标集合",
    ["集合外 key", "失败"],
  );

  const dataBoundary = extractH2Section(
    workflowBoundary,
    "数据、迁移与发布边界",
  );
  requireUniqueLine(
    "workflow data boundary",
    dataBoundary,
    "中央 registry",
    ["transition", "跨层调用方", "Ent generated", "versioned migration", "本地 Product Core"],
  );
  requireUniqueLine(
    "workflow data boundary",
    dataBoundary,
    "运行时只接受目标状态集合",
    ["集合外 key", "失败"],
  );
  requireUniqueLine(
    "workflow data boundary",
    dataBoundary,
    "一次性转换只服务迁移窗口",
    ["usecase", "repo", "API", "UI", "查询筛选"],
  );
  requireUniqueLine("workflow data boundary", dataBoundary, "正式 Atlas migration", [
    "20260714055504",
    "不能证明",
    "目标数据库已迁移",
  ]);
  requireUniqueLine("workflow data boundary", dataBoundary, "发布证据", ["未发布"]);
});

test("chain and runtime trajectory documentation keeps chain, flow and evidence layers separate", () => {
  const chainBoundary = readFileSync(
    path.join(repoRoot, "docs/architecture/业务链与运行轨迹边界.md"),
    "utf8",
  );
  const workflowMap = readFileSync(
    path.join(repoRoot, "docs/workflow/业务与协同流程地图.md"),
    "utf8",
  );
  const presentation = readFileSync(
    path.join(repoRoot, "web/src/erp/utils/processRuntimePresentation.mjs"),
    "utf8",
  );

  for (const required of [
    "“流”描述系统应该怎样运转",
    "“链”是把一次真实运行中已经持久化的对象和事件",
    "ProcessRuntime 业务轨迹",
    "单任务处理记录",
    "审批处理链",
    "状态变化链",
    "数据来源链",
    "审计链",
    "请求 / Trace 链",
    "通知链",
    "get_task_process_context",
    "list_task_events",
    "当前状态不是状态历史",
    "失败关闭",
    "前端隐藏不是安全边界",
  ]) {
    assert(
      chainBoundary.includes(required),
      `chain boundary must preserve ${required}`,
    );
  }

  for (const processKey of [
    "sales_order_acceptance",
    "material_supply",
    "finished_goods_delivery",
    "sales_return_acceptance",
    "finance_payment_approval",
    "inventory_adjustment_approval",
    "production_exception_approval",
  ]) {
    assert(
      workflowMap.includes(processKey),
      `workflow map must cover current ProcessRuntime ${processKey}`,
    );
  }

  assert.match(
    workflowMap,
    /finished_goods_delivery[\s\S]*财务审批[\s\S]*财务放行/u,
  );
  assert.match(
    workflowMap,
    /业务轨迹[\s\S]*本任务处理记录/u,
  );
  assert.match(presentation, /finished_goods_delivery:\s*'出货财务放行'/u);
  assert.match(presentation, /业务轨迹暂时无法确认/u);
});

test("current documentation rejects stale Shipment, inventory approval and task-position wording", () => {
  const currentTruthFiles = [
    "README.md",
    "server/README.md",
    "server/docs/api.md",
    "web/README.md",
    "docs/architecture/各类流程建模边界评审.md",
    "docs/workflow/业务与协同流程地图.md",
    "docs/product/产品能力进度台账.md",
    "docs/product/页面来源生成入口规则.md",
    "docs/customers/yoyoosun/客户交付矩阵.md",
    "docs/customers/yoyoosun/试用人员全页面手工验收清单.md",
    "docs/product/prototypes/mobile-role-tasks-v2/README.md",
    "docs/product/prototypes/workflow-task-action-flow-v1/README.md",
  ];
  const forbiddenPhrases = [
    "生成仓库负责的出货放行任务",
    "仓库出货放行任务",
    "库存调整正式审批和预留专项读模型仍待补",
    "当前没有独立库存调整审批 Source Document / ProcessRuntime",
    "流程位置暂时无法确认",
  ];

  for (const relativePath of currentTruthFiles) {
    const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
    for (const forbidden of forbiddenPhrases) {
      assert(
        !source.includes(forbidden),
        `${relativePath} must not restore stale wording ${forbidden}`,
      );
    }
  }

  const capabilityLedger = readFileSync(
    path.join(repoRoot, "docs/product/产品能力进度台账.md"),
    "utf8",
  );
  assert.match(
    capabilityLedger,
    /inventory_adjustment_approval[\s\S]*批准不改库存[\s\S]*显式 post/u,
  );
  assert.match(
    capabilityLedger,
    /8 个本地代码边界已闭环，4 个部分，1 个[\s\S]*阻塞，1 个[\s\S]*范围外/u,
  );
  assert.match(capabilityLedger, /该汇总不包含审计 \/ 附件专项/u);
});

test("action and audit governance documents retain authorization and evidence matrices", () => {
  const actionMatrix = readFileSync(
    path.join(repoRoot, "docs/product/多甲方角色能力与流程编排.md"),
    "utf8",
  );
  const auditMatrix = readFileSync(
    path.join(repoRoot, "docs/observability/日志链路追踪审计第一版.md"),
    "utf8",
  );

  for (const required of [
    "实际动作 = 后端 RBAC ∩ enabled 模块 ∩ active revision entitlement - 当前角色 revoke",
    "页面 / 移动端入口",
    "后端命令或 JSON-RPC",
    "RBAC 权限码",
    "owner role / 责任池 / assignee",
    "版本 / CAS",
    "幂等键",
    "Source Document 变化",
    "Workflow / ProcessRuntime 变化",
    "Fact / Ledger 副作用",
    "审计证据",
    "目标环境证据",
  ]) {
    assert(actionMatrix.includes(required), `action matrix must preserve ${required}`);
  }

  for (const required of [
    "模块级覆盖矩阵",
    "Workflow 任务创建与状态动作",
    "任务转交 / 退回责任池",
    "库存",
    "质检",
    "出货",
    "生产 / 委外",
    "收付款 / 核销 / 财务",
    "附件上传 / 下载",
    "附件删除 / 作废",
    "request_id",
    "trace_id",
    "密码、密码 hash",
    "完整客户配置",
    "当前没有对象存储部署合同",
  ]) {
    assert(auditMatrix.includes(required), `audit matrix must preserve ${required}`);
  }
});
