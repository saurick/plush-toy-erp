import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

const workflowSourceFiles = [
  ...readdirSync(path.join(repoRoot, "server/internal/biz"))
    .filter(
      (fileName) => fileName.startsWith("workflow") && fileName.endsWith(".go"),
    )
    .map((fileName) => `server/internal/biz/${fileName}`),
  ...readdirSync(path.join(repoRoot, "server/internal/data"))
    .filter(
      (fileName) => fileName.startsWith("workflow") && fileName.endsWith(".go"),
    )
    .map((fileName) => `server/internal/data/${fileName}`),
  ...readdirSync(path.join(repoRoot, "server/internal/service"))
    .filter(
      (fileName) =>
        fileName.startsWith("jsonrpc_workflow") && fileName.endsWith(".go"),
    )
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

  function requireUniqueLine(
    scopeName,
    source,
    label,
    required,
    forbidden = [],
  ) {
    const matches = source.split("\n").filter((line) => line.includes(label));
    assert.equal(
      matches.length,
      1,
      `${scopeName} must contain one ${label} line`,
    );
    const line = matches[0];
    for (const token of required) {
      assert(
        line.includes(token),
        `${scopeName} ${label} line must include ${token}`,
      );
    }
    for (const token of forbidden) {
      assert(
        !line.includes(token),
        `${scopeName} ${label} line must exclude ${token}`,
      );
    }
  }

  function requirePrefixedLine(scopeName, source, prefix, required) {
    const matches = source
      .split("\n")
      .filter((line) => line.trimStart().startsWith(prefix));
    assert.equal(
      matches.length,
      1,
      `${scopeName} must contain one ${prefix} line`,
    );
    for (const token of required) {
      assert(
        matches[0].includes(token),
        `${scopeName} ${prefix} line must include ${token}`,
      );
    }
  }

  const chineseTree = extractTextTree(statusIndex, "中文状态字典树");
  const englishTree = extractTextTree(
    statusIndex,
    "English Status Dictionary Tree",
  );
  requireUniqueLine("English tree", englishTree, "WIP batch:", [
    "PLANNED",
    "SPLIT",
    "IN_PROGRESS",
    "OUTSOURCED",
    "CANCELLED",
    "WAITING_QUALITY",
    "ACCEPTED",
    "REJECTED",
  ]);
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
    for (const term of [
      "current",
      "legacy",
      "compatibility",
      "planned",
      "deferred",
    ]) {
      assert(
        !maturityMarkerScope.toLowerCase().includes(term),
        `${treeName} must exclude ${term} maturity markers`,
      );
    }
    assert(
      !tree.includes("WorkflowReconcileJob"),
      `${treeName} must exclude draft jobs`,
    );
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
  requireUniqueLine("task contract", taskContract, "任务看板只接受", [
    "all",
    "ready",
    "blocked",
    "rejected",
    "done",
    "overdue",
    "dueSoon",
  ]);
  requireUniqueLine("task contract", taskContract, "`resume`", [
    "blocked → ready",
    "business_status_key",
    "workflow_business_states",
    "保持 `blocked`",
  ]);

  const evidence = extractH2Section(
    statusIndex,
    "实现、迁移与发布证据 / Implementation, Migration And Release Evidence",
  );
  requireUniqueLine("implementation evidence", evidence, "中央状态合同", [
    "registry",
    "transition",
    "只证明中央允许集合与转换图",
  ]);
  requireUniqueLine("implementation evidence", evidence, "跨层调用方与生成物", [
    "已收口",
    "repo",
    "service",
    "API",
    "UI",
    "seed",
    "fixture",
    "tests",
    "Ent generated",
  ]);
  requireUniqueLine(
    "implementation evidence",
    evidence,
    "| versioned migration |",
    ["20260714055504", "不能证明", "目标数据库"],
  );
  requireUniqueLine("implementation evidence", evidence, "| 目标环境", [
    "未发布",
  ]);
  requireUniqueLine("implementation evidence", evidence, "一次性转换完成后", [
    "usecase",
    "repo",
    "API",
    "UI",
    "查询筛选",
  ]);
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
  requireUniqueLine("workflow data boundary", dataBoundary, "中央 registry", [
    "transition",
    "跨层调用方",
    "Ent generated",
    "versioned migration",
    "本地 Product Core",
  ]);
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
  requireUniqueLine(
    "workflow data boundary",
    dataBoundary,
    "正式 Atlas migration",
    ["20260714055504", "不能证明", "目标数据库已迁移"],
  );
  requireUniqueLine("workflow data boundary", dataBoundary, "发布证据", [
    "未发布",
  ]);
});

test("chain and runtime trajectory documentation keeps chain, flow and evidence layers separate", () => {
  const flowBoundary = readFileSync(
    path.join(repoRoot, "docs/architecture/各类流程建模边界评审.md"),
    "utf8",
  );
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
  const taskEventService = readFileSync(
    path.join(repoRoot, "server/internal/service/jsonrpc_workflow_task.go"),
    "utf8",
  );
  const taskEventTrail = readFileSync(
    path.join(
      repoRoot,
      "web/src/erp/components/workflow/WorkflowTaskEventTrail.jsx",
    ),
    "utf8",
  );

  for (const required of [
    "单据流 / Document Flow",
    "异常流是业务流、单据流、状态流和工作流的共同组成部分",
    "驳回 / 拒绝",
    "阻塞 / 恢复",
    "取消",
    "冲正",
    "返工",
    "补偿",
    "Shipment 财务审批退回后",
    "每个甲方可以编排到哪一层",
    "链是持久化历史的查询结果，不可编排、编辑、补写或重新排序",
  ]) {
    assert(
      flowBoundary.includes(required),
      `flow boundary must preserve ${required}`,
    );
  }

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
    "单据流",
    "链不是可编排对象",
    "truncated",
    "cursor 合同尚未实现",
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
  assert.match(workflowMap, /业务轨迹[\s\S]*本任务处理记录/u);
  assert.match(
    workflowMap,
    /六个正式流程 key 的异常出口[\s\S]*sales_order_rejected_end[\s\S]*purchase_order_rejected_end[\s\S]*shipment_finance_rejected_end[\s\S]*rejected_end/u,
  );
  assert.match(
    workflowMap,
    /Shipment[\s\S]*财务 approval 只决定门禁[\s\S]*SHIPPED[\s\S]*库存 `OUT`/u,
  );
  assert.match(presentation, /finished_goods_delivery:\s*'出货财务放行'/u);
  assert.match(presentation, /业务轨迹暂时无法确认/u);
  assert.match(taskEventService, /ListTaskEvents\(ctx, taskID, limit\+1\)/u);
  assert.match(taskEventService, /"truncated": truncated/u);
  assert.match(taskEventTrail, /仅显示最近/u);
  assert.match(taskEventTrail, /更早记录未加载/u);
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
    "docs/observability/日志链路追踪审计第一版.md",
    "config/README.md",
    "docs/product/prototypes/mobile-role-tasks-v2/README.md",
    "docs/product/prototypes/workflow-task-action-flow-v1/README.md",
  ];
  const forbiddenPhrases = [
    "生成仓库负责的出货放行任务",
    "仓库出货放行任务",
    "库存调整正式审批和预留专项读模型仍待补",
    "当前没有独立库存调整审批 Source Document / ProcessRuntime",
    "流程位置暂时无法确认",
    "当前附件授权 WIP",
    "Workflow 附件授权存在其他任务未提交 WIP",
    "Workflow 附件授权当前另有未提交 WIP",
    "付款、库存调整和没有正式门禁的 PMC / 工程事项继续失败关闭",
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
  assert.match(capabilityLedger, /独立领域动作才写库存、生产、出货或财务事实/u);
  assert.equal(
    capabilityLedger.match(/^## 能力状态$/gmu)?.length,
    1,
    "capability ledger must keep one main status table",
  );
  assert.doesNotMatch(
    capabilityLedger,
    /^## (?:流程运行时状态|V1 主链审计汇总|高风险判定口径)$/gmu,
  );
  const capabilityTable = capabilityLedger.match(
    /^## 能力状态$[\s\S]*?^## 证据入口$/mu,
  )?.[0];
  assert(capabilityTable, "capability ledger must keep its main status table");
  const capabilityRows = capabilityTable
    .split("\n")
    .filter(
      (line) =>
        line.startsWith("| ") &&
        !line.startsWith("| 业务能力 ") &&
        !/^\|\s*:?-{3,}/u.test(line),
    );
  assert(
    capabilityRows.length >= 12 && capabilityRows.length <= 15,
    `capability ledger must stay aggregated to 12-15 rows, got ${capabilityRows.length}`,
  );
  for (const row of capabilityRows) {
    const status = row.split("|")[2]?.trim();
    assert(
      ["待办", "实现中", "可试用", "暂不做"].includes(status),
      `capability ledger must use a business status, got ${status}`,
    );
  }
  assert.doesNotMatch(capabilityLedger, /已闭环/u);
  assert.doesNotMatch(capabilityLedger, /L[0-8]/u);
  assert.match(capabilityLedger, /财务放行不等于已出货/u);

  const currentTruth = readFileSync(
    path.join(repoRoot, "docs/当前真源与交接顺序.md"),
    "utf8",
  );
  assert.doesNotMatch(
    currentTruth,
    /确认能力做到 schema、usecase、API、UI、测试还是交付哪一层/u,
  );
  assert.match(currentTruth, /待办、实现中、可试用或暂不做/u);

  const capabilityAuditSkill = readFileSync(
    path.join(
      repoRoot,
      ".agents/skills/plush-capability-evidence-audit/SKILL.md",
    ),
    "utf8",
  );
  assert.doesNotMatch(capabilityAuditSkill, /流程运行时状态/u);
  assert.match(capabilityAuditSkill, /聚合能力行/u);
});

test("role governance stays compact and audit documentation retains its evidence matrix", () => {
  const roleGovernance = readFileSync(
    path.join(repoRoot, "docs/product/多甲方角色能力与流程编排.md"),
    "utf8",
  );
  const configPermissionPolicy = readFileSync(
    path.join(repoRoot, "docs/product/配置与权限策略.md"),
    "utf8",
  );
  const auditMatrix = readFileSync(
    path.join(repoRoot, "docs/observability/日志链路追踪审计第一版.md"),
    "utf8",
  );

  assert(
    roleGovernance.split(/\r?\n/u).length <= 180,
    "role governance must stay at or below 180 lines",
  );
  assert(
    Buffer.byteLength(roleGovernance, "utf8") <= 20 * 1024,
    "role governance must stay at or below 20 KiB",
  );

  for (const required of [
    "## 阅读路径与职责",
    "## 角色、能力和责任池",
    "## Product Core 角色模板与客户岗位",
    "## 审批责任与流程选择",
    "## 页面、动作和数据范围",
    "## Workflow、事实与链",
    "实际动作 = 后端 RBAC ∩ enabled 模块 ∩ active revision entitlement - 当前角色 revoke",
    "状态字典与生命周期索引.md",
    "配置与权限策略.md",
    "客户差异策略.md",
    "产品能力进度台账.md",
    "六条已登记 ProcessRuntime",
    "链是持久化历史的不可编辑投影",
    "不能增加、删除或重排节点",
  ]) {
    assert(
      roleGovernance.includes(required),
      `role governance must preserve ${required}`,
    );
  }

  for (const retiredSection of [
    "## 目录设计与目的",
    "### 动作、责任与证据矩阵",
    "## 字段表面与读写边界",
    "## 业务流与协同流",
    "## Ent / SQL 设计原则",
    "## 测试与部署门禁",
  ]) {
    assert(
      !roleGovernance.includes(retiredSection),
      `role governance must route instead of restoring ${retiredSection}`,
    );
  }

  assert(
    Buffer.byteLength(configPermissionPolicy, "utf8") <= 10 * 1024,
    "config permission policy must stay at or below 10 KiB",
  );
  for (const required of [
    "## 当前已经生效的客户配置",
    "当前只支持 `visible`",
    "不支持 `label / editable / required`",
    "## 未来扩展必须先登记",
    "## 客户不能配置",
    "六条已登记 ProcessRuntime",
  ]) {
    assert(
      configPermissionPolicy.includes(required),
      `config permission policy must preserve ${required}`,
    );
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
    "下载授权后重算长度 / SHA-256",
    "返回 `truncated`",
    "cursor 尚未实现",
  ]) {
    assert(
      auditMatrix.includes(required),
      `audit matrix must preserve ${required}`,
    );
  }
});
