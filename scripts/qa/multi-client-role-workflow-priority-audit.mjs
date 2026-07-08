#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildReleaseEvidenceCloseoutPlan } from "../deploy/release-evidence-closeout-plan.mjs";
import { buildReleaseEvidenceStatus } from "../deploy/release-evidence-status.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const DEFAULT_RELEASE_EVIDENCE_DIR = "deployments/yoyoosun/evidence/releases/2026-06-29";
const DEFAULT_RUNTIME_ENV_FILE = "server/deploy/compose/prod/.env";
const RELEASE_CLOSEOUT_CONFIRM = "RUN_YOYOOSUN_RELEASE_CLOSEOUT";

function shellToken(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(text)) return text;
  return `'${text.replaceAll("'", "'\\''")}'`;
}

function shellEnvAssignment(key, value) {
  return `${key}=${shellToken(value)}`;
}

function envPlaceholder(key) {
  const placeholders = {
    SERVER_IMAGE: "<server-image-ref>",
    SERVER_IMAGE_DIGEST: "sha256:<64-hex>",
    WEB_IMAGE: "<web-image-ref>",
    WEB_IMAGE_DIGEST: "sha256:<64-hex>",
    RELEASE_VERSION: "<release-version>",
    RELEASE_ENVIRONMENT: "<target-environment>",
    OPERATOR_ROLE: "<operator-role>",
    GIT_COMMIT: "<git-commit>",
    MIGRATION_BEFORE: "<migration-before>",
    MIGRATION_AFTER: "<migration-after>",
    BACKUP_ID: "<backup-id>",
    SOURCE_POSTGRES_DSN: "<redacted-source-postgres-dsn>",
    SMOKE_ENDPOINT: "https://<target-endpoint>",
    SMOKE_BACKEND_URL: "https://<target-backend-url>",
    CUSTOMER_CONFIG_ADMIN_TOKEN: "<redacted-admin-token>",
    ROLLBACK_TARGET_RELEASE: "<rollback-target-release>",
    ROLLBACK_TRIGGER_SCENARIO: "<rollback-trigger-scenario>",
    REVIEWER_NAME: "<reviewer-name>",
  };
  return placeholders[key] ?? `<${key.toLowerCase().replaceAll("_", "-")}>`;
}

function buildCloseoutRunnerBaseCommand({
  releaseEvidenceDir,
  runtimeEnvFile,
  onlyActionId = "",
  execute = false,
  reportPath = "",
} = {}) {
  const args = [
    "node",
    "scripts/deploy/release-evidence-closeout-runner.mjs",
    "--evidence-dir",
    releaseEvidenceDir,
    "--runtime-env-file",
    runtimeEnvFile,
  ];
  if (onlyActionId) {
    args.push("--only", onlyActionId);
  }
  if (reportPath && !execute) {
    args.push("--report", reportPath);
  }
  if (execute) {
    args.push("--execute");
  } else {
    args.push("--json");
  }
  return args.map(shellToken).join(" ");
}

function buildCloseoutRunnerReportPath({
  releaseEvidenceDir,
  actionId,
}) {
  const releaseName =
    releaseEvidenceDir.split("/").filter(Boolean).at(-1) || "release";
  return path.join(
    "output/release-evidence-closeout",
    releaseName,
    `${actionId}-runner-report.json`,
  );
}

function buildCloseoutRunnerAllActionsReportPath({
  releaseEvidenceDir,
}) {
  const releaseName =
    releaseEvidenceDir.split("/").filter(Boolean).at(-1) || "release";
  return path.join(
    "output/release-evidence-closeout",
    releaseName,
    "all-actions-runner-report.json",
  );
}

function buildInputTemplateCommand({
  actionId,
  releaseEvidenceDir,
}) {
  if (actionId !== "immutable-version") return "";
  return [
    "node",
    "scripts/deploy/immutable-version-evidence.mjs",
    "--evidence-dir",
    releaseEvidenceDir,
    "--print-input-template",
  ].map(shellToken).join(" ");
}

function buildPriorityAuditCommand({
  releaseEvidenceDir,
  runtimeEnvFile,
  gateFlag = "",
} = {}) {
  const args = [
    "node",
    "scripts/qa/multi-client-role-workflow-priority-audit.mjs",
    "--release-evidence-dir",
    releaseEvidenceDir,
    "--runtime-env-file",
    runtimeEnvFile,
    "--json",
  ];
  if (gateFlag) {
    args.push(gateFlag);
  }
  return args.map(shellToken).join(" ");
}

function buildEnvExportTemplate(missingPrerequisites) {
  const seen = new Set();
  const exports = [];
  for (const check of missingPrerequisites) {
    if (check.kind !== "env" || seen.has(check.id)) continue;
    seen.add(check.id);
    exports.push(shellEnvAssignment(check.id, envPlaceholder(check.id)));
  }
  return exports;
}

function closeoutActionState(action) {
  if (action.canRun) return "runnable";
  if (action.manualOnly) return "manual";
  return "blocked";
}

function sanitizeMissingPrerequisites(action) {
  const seen = new Set();
  const missing = [];
  for (const check of action.missingPrerequisites) {
    const key = `${check.kind}:${check.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    missing.push({
      id: check.id,
      kind: check.kind,
      message: check.message,
    });
  }
  return missing;
}

function buildCloseoutQueueAction({
  action,
  releaseEvidenceDir,
  runtimeEnvFile,
}) {
  const missingPrerequisites = sanitizeMissingPrerequisites(action);
  const requiredEnvExports = buildEnvExportTemplate(missingPrerequisites);
  const envPrefix =
    requiredEnvExports.length > 0
      ? `${requiredEnvExports.join(" ")} `
      : "";
  const reportCommand =
    buildCloseoutRunnerBaseCommand({
      releaseEvidenceDir,
      runtimeEnvFile,
      onlyActionId: action.id,
    });
  const reportPath = buildCloseoutRunnerReportPath({
    releaseEvidenceDir,
    actionId: action.id,
  });
  const reportFileCommand =
    buildCloseoutRunnerBaseCommand({
      releaseEvidenceDir,
      runtimeEnvFile,
      onlyActionId: action.id,
      reportPath,
    });
  const executeCommand =
    action.manualOnly
      ? ""
      : `${envPrefix}RELEASE_CLOSEOUT_CONFIRM=${RELEASE_CLOSEOUT_CONFIRM} ${buildCloseoutRunnerBaseCommand({
        releaseEvidenceDir,
        runtimeEnvFile,
        onlyActionId: action.id,
        execute: true,
      })}`;
  return {
    order: action.order,
    id: action.id,
    title: action.title ?? action.label,
    state: closeoutActionState(action),
    canRun: action.canRun,
    manualOnly: action.manualOnly,
    commands: action.commands,
    manualChecks: action.manualChecks,
    gateSummary: action.gateSummary,
    resolvedInputs: action.resolvedInputs,
    missingPrerequisites,
    operatorChecklist: action.operatorChecklist ?? [],
    missingPrerequisiteIds: missingPrerequisites.map((check) => check.id),
    missingPrerequisiteMessages: missingPrerequisites.map(
      (check) => check.message,
    ),
    requiredEnvExports,
    inputTemplateCommand: action.inputTemplateCommand || buildInputTemplateCommand({
      actionId: action.id,
      releaseEvidenceDir,
    }),
    closeoutRunnerReportPath: reportPath,
    closeoutRunnerReportCommand: reportCommand,
    closeoutRunnerReportFileCommand: reportFileCommand,
    closeoutRunnerExecuteCommand: executeCommand,
  };
}

const USAGE = `Multi-client role workflow priority audit

Usage:
  node scripts/qa/multi-client-role-workflow-priority-audit.mjs [--json] [--input-checklist-json] [--input-checklist-markdown] [--input-checklist-csv] [--release-evidence-dir <path>] [--runtime-env-file <path>] [--fail-on-release-not-ready] [--fail-on-completion-not-ready]

Checks the executable evidence behind docs/product/多甲方角色能力流程编排优先级.md.
This is a read-only audit. It does not call the backend, run migrations, import
customer data, publish customer config, deploy, smoke test, restore backups, or
post domain facts.

Input checklist modes are input collection views only. They do not execute
closeout actions, do not write release evidence, and their collectionPlan omits
executeCommand. Use the full --json audit or closeout runner plan for execute
confirmation boundaries. Markdown output includes Collection Groups for
release batch input collection owners and Collection Input Details for
per-action fields. CSV output is for spreadsheets and external collection
tables only; it omits commands and real secret values.
`;

export const PRIORITY_AUDIT_SCOPE = {
  readOnly: true,
  executableEvidenceOnly: true,
  readyMeaning:
    "priority document items have current repo evidence for ready checks, while guarded and evidence-required items remain explicitly incomplete",
  notProvenByThisAudit: [
    "domain facts were posted by workflow task completion",
    "target environment release was executed",
    "target migration was applied",
    "target smoke was run",
    "backup restore rehearsal was performed",
    "rollback or forward-fix rehearsal was performed",
    "customer config revision was activated or rolled back on the target environment",
    "super admin break-glass was exercised on the target environment",
    "real customer data import was approved or executed",
  ],
};

const REFERENCE_COVERAGE_REQUIREMENTS = [
  {
    id: "runtime-schema-migration",
    title: "客户配置运行时 schema / migration",
    referenceRequirement:
      "Ent schema + Atlas migration for CustomerConfigRevision / RoleProfile / AccessEntitlement / WorkPool",
    checkIds: ["customer-config-runtime-schema"],
    releaseActionIds: [],
    notProven: [
      "target environment migration was applied",
      "customer config revision was activated on the target backend",
    ],
  },
  {
    id: "usecase-repo-api-rbac",
    title: "客户配置 usecase / repo / API / RBAC",
    referenceRequirement:
      "repo/usecase/API: config validate, publish, active revision, rollback, effective session, RBAC and audit",
    checkIds: ["customer-config-usecase-repo-api-rbac"],
    releaseActionIds: [],
    notProven: [
      "target backend publish / activate / rollback was executed",
      "target backend runtime audit rows were produced for a real release",
    ],
  },
  {
    id: "frontend-effective-session-projection",
    title: "正式前端 effective session 投影",
    referenceRequirement:
      "frontend formal integration: pages, actions, fields and task visibility from get_effective_session",
    checkIds: [
      "customer-config-frontend-projection",
      "task-visibility-with-work-pools",
      "engineering-minimum-entry",
    ],
    releaseActionIds: ["customer-config-effective-session"],
    notProven: [
      "target environment smoke read back the active customer config revision",
      "real customer users accepted the projected role entries on the target environment",
    ],
  },
  {
    id: "second-customer-responsibility-difference",
    title: "第二客户责任池差异本地证据",
    referenceRequirement:
      "demo 与 yoyoosun 可把同一责任池映射给不同角色，不改流程定义或核心代码",
    checkIds: ["second-customer-responsibility-pool-difference"],
    releaseActionIds: [],
    notProven: [
      "第二个真实客户已经签收",
      "目标环境已跑过第二客户黄金闭环",
      "真实客户业务数据已导入",
    ],
  },
  {
    id: "module-disabled-readonly-gate",
    title: "模块 disabled/read_only 一致阻断",
    referenceRequirement:
      "模块 disabled/read_only 必须一致阻止 API、能力、新流程、定时任务、导入、打印和 UI projection；当前仅有只读解释和未完成边界提示",
    checkIds: [
      "module-disabled-readonly-process-start-gate",
      "module-disabled-readonly-effective-session-projection-gate",
      "module-disabled-readonly-import-execute-gate",
      "module-disabled-readonly-import-prep-no-execute-gate",
      "module-disabled-readonly-customer-config-execute-gate",
      "module-disabled-readonly-sales-order-api-gate",
      "module-disabled-readonly-purchase-order-api-gate",
      "module-disabled-readonly-outsourcing-order-api-gate",
      "module-disabled-readonly-material-bom-api-gate",
      "module-disabled-readonly-masterdata-core-api-gate",
      "module-disabled-readonly-process-masterdata-api-gate",
      "module-disabled-readonly-purchase-api-gate",
      "module-disabled-readonly-quality-api-gate",
      "module-disabled-readonly-shipment-api-gate",
      "module-disabled-readonly-stock-reservation-api-gate",
      "module-disabled-readonly-production-api-gate",
      "module-disabled-readonly-outsourcing-api-gate",
      "module-disabled-readonly-finance-api-gate",
      "module-disabled-readonly-attachment-api-gate",
      "module-disabled-readonly-workflow-api-gate",
      "module-disabled-readonly-print-api-gate",
      "module-disabled-readonly-no-active-business-scheduler-gate",
      "module-disabled-readonly-jsonrpc-write-inventory-gate",
      "module-disabled-readonly-consistency-remains-guarded",
    ],
    releaseActionIds: [],
    notProven: [
      "目标环境已经验证模块关闭前置检查和历史只读查询",
    ],
  },
  {
    id: "release-preflight-target-evidence",
    title: "发布 preflight / smoke / 恢复 / 回滚证据",
    referenceRequirement:
      "RBAC, tests, deployment preflight, immutable release evidence, target smoke, backup restore, rollback or forward-fix rehearsal",
    checkIds: [
      "release-preflight-fast-gate",
      "release-evidence-target-remains-evidence-required",
    ],
    releaseActionIds: [
      "immutable-version",
      "production-preflight",
      "backup-restore-rehearsal",
      "target-smoke",
      "rollback-forward-fix",
      "release-signoff",
      "customer-config-effective-session",
    ],
    notProven: [
      "target environment release was executed",
      "target smoke, backup restore rehearsal, rollback rehearsal and sign-off were completed",
    ],
  },
  {
    id: "super-admin-break-glass-governance",
    title: "super admin / break-glass 业务处理边界",
    referenceRequirement:
      "admin must not automatically own business abilities; break-glass must be a separate audited mechanism",
    checkIds: ["super-admin-break-glass-controlled-runtime"],
    releaseActionIds: [],
    notProven: [
      "long-lived break-glass approval sessions exist",
      "target environment break-glass was exercised",
    ],
  },
  {
    id: "workflow-task-runtime-anchors",
    title: "WorkflowTask 运行时解释锚点",
    referenceRequirement:
      "WorkflowTask should carry owner_pool_key, required_capability_key and config_revision as nullable explain/runtime anchors before full ProcessInstance runtime",
    checkIds: ["workflow-task-runtime-anchors"],
    releaseActionIds: [],
    notProven: [
      "process runtime automatically creates WorkflowTask from human_task / approval nodes",
      "task candidates are filtered directly by owner_pool_key",
      "workflow task completion posts domain facts",
    ],
  },
  {
    id: "process-runtime-minimum",
    title: "ProcessInstance / ProcessNodeInstance 最小运行时",
    referenceRequirement:
      "ProcessInstance / ProcessNodeInstance should persist process version, variant, config revision, definition hash, node type, owner pool, required capability and status before task linking",
    checkIds: ["process-runtime-minimum"],
    releaseActionIds: [],
    notProven: [
      "process runtime automatically creates linked WorkflowTask records",
      "process runtime advances nodes or joins branches",
      "workflow task completion posts domain facts",
      "target environment migration was applied",
    ],
  },
  {
    id: "workflow-task-process-link",
    title: "WorkflowTask 流程节点关联字段",
    referenceRequirement:
      "WorkflowTask should carry nullable process_instance_id and process_node_instance_id before process runtime creates linked human tasks",
    checkIds: ["workflow-task-process-link"],
    releaseActionIds: [],
    notProven: [
      "process runtime automatically creates linked WorkflowTask records",
      "node status advances when linked workflow task is completed",
      "target environment migration was applied",
    ],
  },
  {
    id: "process-runtime-linked-human-task",
    title: "ProcessRuntime 显式创建 linked 人工任务",
    referenceRequirement:
      "Process runtime should be able to create a linked WorkflowTask from an existing human_task or approval ProcessNodeInstance",
    checkIds: ["process-runtime-linked-human-task"],
    releaseActionIds: [],
    notProven: [
      "process runner automatically starts human_task / approval nodes",
      "node status advances when linked workflow task is completed",
      "domain_command nodes execute domain usecases",
      "target environment migration was applied",
    ],
  },
  {
    id: "process-runtime-start-first-node",
    title: "ProcessRuntime 显式启动首个 waiting 节点",
    referenceRequirement:
      "Process runtime should explicitly start an active ProcessInstance by activating the first waiting node and then delegate handling by node type",
    checkIds: ["process-runtime-start-first-node"],
    releaseActionIds: [],
    notProven: [
      "background scheduler automatically starts process instances",
      "process runner scans definitions or skips non-adjacent nodes",
      "target environment exercised returnTo branches",
      "target environment exercised process start",
    ],
  },
  {
    id: "process-runtime-linked-task-completion",
    title: "ProcessRuntime 显式完成 linked 人工任务节点",
    referenceRequirement:
      "Process runtime should explicitly complete the linked ProcessNodeInstance after its WorkflowTask has reached done status",
    checkIds: ["process-runtime-linked-task-completion"],
    releaseActionIds: [],
    notProven: [
      "process runner scans definitions or creates linked tasks beyond the just-activated adjacent human_task / approval node",
      "target environment exercised returnTo branches",
      "domain_command nodes execute domain usecases",
      "target environment migration was applied",
    ],
  },
  {
    id: "workflow-complete-action-process-runtime-completion",
    title: "complete_task_action 受控触发 linked 节点完成",
    referenceRequirement:
      "The controlled complete_task_action API should call ProcessRuntime completion for linked WorkflowTask records after the task reaches done",
    checkIds: ["workflow-complete-action-process-runtime-completion"],
    releaseActionIds: [],
    notProven: [
      "removed raw workflow status API is available to trigger ProcessRuntime completion",
      "process runner scans definitions or creates linked tasks beyond the just-activated adjacent human_task / approval node",
      "target environment exercised returnTo branches",
      "domain_command nodes execute domain usecases",
      "target environment migration was applied",
    ],
  },
  {
    id: "process-runtime-sequential-next-node",
    title: "ProcessRuntime 顺序激活下一 waiting 节点并创建人工任务",
    referenceRequirement:
      "After the current linked human_task / approval node is completed, process runtime should activate the adjacent waiting node and create a linked WorkflowTask only when that just-activated node is human_task or approval",
    checkIds: ["process-runtime-sequential-next-node"],
    releaseActionIds: [],
    notProven: [
      "process runner scans definitions or creates linked tasks beyond the just-activated adjacent human_task / approval node",
      "target environment exercised returnTo branches",
      "domain_command nodes execute domain usecases",
      "target environment migration was applied",
    ],
  },
  {
    id: "process-runtime-named-policy-branch",
    title: "ProcessRuntime 命名 policy 分支",
    referenceRequirement:
      "Process runtime should support named policy branch decisions without arbitrary expressions before fan-out / join / returnTo",
    checkIds: ["process-runtime-named-policy-branch"],
    releaseActionIds: [],
    notProven: [
      "target environment exercised returnTo branches",
      "non-selected branch nodes are automatically skipped or settled",
      "customer package process definitions were executed on the target environment",
      "domain facts are posted after a branch reaches end",
    ],
  },
  {
    id: "process-runtime-fan-out-join",
    title: "ProcessRuntime fan-out / join 路由",
    referenceRequirement:
      "Process runtime should support controlled fan-out plus join-all / join-any routing from named node policies before returnTo",
    checkIds: ["process-runtime-fan-out-join"],
    releaseActionIds: [],
    notProven: [
      "target environment exercised returnTo branches",
      "fan-out / join routes are loaded from customer package process definitions on the target environment",
      "non-selected branch nodes are automatically skipped or settled",
      "domain facts are posted after a join target reaches end",
    ],
  },
  {
    id: "process-runtime-return-to-attempt",
    title: "ProcessRuntime returnTo 受控返工 attempt",
    referenceRequirement:
      "Process runtime should support explicit returnTo by creating a bounded next attempt for the target node instead of arbitrary loops",
    checkIds: ["process-runtime-return-to-attempt"],
    releaseActionIds: [],
    notProven: [
      "target environment exercised returnTo branches",
      "customer package process definitions loaded returnTo policies on the target environment",
      "domain facts are posted after a returned path reaches end",
    ],
  },
  {
    id: "process-runtime-blocked-due-at",
    title: "ProcessRuntime blocked / due_at 显式阻塞",
    referenceRequirement:
      "Process runtime should explicitly block active process nodes and support due_at escalation without introducing a background scheduler or writing domain facts",
    checkIds: ["process-runtime-blocked-due-at"],
    releaseActionIds: [],
    notProven: [
      "background scheduler automatically scans overdue process nodes",
      "target environment exercised blocked / due_at escalation",
      "domain facts are posted when a node is blocked",
    ],
  },
  {
    id: "process-runtime-domain-command-handler",
    title: "ProcessRuntime domain_command 显式 handler 执行",
    referenceRequirement:
      "Process runtime should explicitly execute a registered handler for an active domain_command node and advance only after the handler succeeds",
    checkIds: [
      "process-runtime-domain-command-handler-guard",
      "sales-order-submit-domain-command-handler",
      "sales-order-acceptance-minimum-process-chain",
      "customer-config-sales-order-process-definition-manifest",
      "sales-order-acceptance-explicit-start-jsonrpc",
      "sales-order-acceptance-submit-domain-command-jsonrpc",
    ],
    releaseActionIds: [],
    notProven: [
      "workflow task completion automatically invokes domain command handlers",
      "shipment / finance domain command usecases are bound",
      "target environment exercised returnTo branches",
      "target environment exercised domain command entry",
    ],
  },
  {
    id: "p4-material-supply-definition-evidence",
    title: "P4-2 material_supply runtime loader 定义",
    referenceRequirement:
      "P4 second golden loop should compile purchase order to purchase receipt, incoming quality inspection and warehouse inbound into a controlled loader definition without enabling workflow task auto-posting",
    checkIds: ["material-supply-runtime-loader-definition"],
    releaseActionIds: [],
    notProven: [
      "workflow task completion starts or executes material_supply domain command nodes automatically",
      "workflow task completion posts purchase receipt, quality inspection or inventory facts",
      "target environment exercised the material supply golden loop",
    ],
  },
  {
    id: "p4-material-supply-domain-command-contract-preflight",
    title: "P4-2 material_supply 领域命令合同预检",
    referenceRequirement:
      "P4 second golden loop must map purchase receipt, quality decision and inbound posting commands to existing domain usecases, JSON-RPC methods, permissions and tests before runtime loader can be enabled",
    checkIds: ["material-supply-domain-command-contract-preflight"],
    releaseActionIds: [],
    notProven: [
      "workflow task completion posts purchase receipt, quality inspection or inventory facts",
      "target environment exercised the material supply golden loop",
    ],
  },
  {
    id: "p4-material-supply-receipt-runtime-api",
    title: "P4-2 material_supply 采购入库单窄版显式运行时 API",
    referenceRequirement:
      "P4 second golden loop may start from an existing purchase_receipt process instance and explicitly execute quality decision and inbound posting commands before the full purchase-order-to-receipt loader is designed",
    checkIds: ["material-supply-receipt-runtime-api"],
    releaseActionIds: [],
    notProven: [
      "workflow task completion posts purchase receipt, quality inspection or inventory facts",
      "target environment exercised the material supply golden loop",
    ],
  },
  {
    id: "p4-material-supply-purchase-order-explicit-runtime-api",
    title: "P4-2 material_supply 采购订单显式运行时 API",
    referenceRequirement:
      "P4 second golden loop can now explicitly start from a purchase_order process instance, execute purchase_receipt.create, record the generated purchase_receipt as a linked business ref, then continue quality decision and inbound posting",
    checkIds: ["material-supply-purchase-order-explicit-runtime-api"],
    releaseActionIds: [],
    notProven: [
      "target environment constructed material_supply from active customer config",
      "workflow task completion posts purchase receipt, quality inspection or inventory facts",
      "target environment exercised the material supply golden loop",
    ],
  },
  {
    id: "p4-finished-goods-shipment-finance-contract-preflight",
    title: "P4-3 成品质检 / 财务放行 / 仓库出货 / 应收线索合同预检",
    referenceRequirement:
      "P4 third golden loop must map finished goods quality, finance release, warehouse shipment and receivable lead steps to existing Workflow-only and OperationalFact / Finance boundaries before runtime domain command handlers are enabled",
    checkIds: ["finished-goods-shipment-finance-contract-preflight"],
    releaseActionIds: [],
    notProven: [
      "workflow task completion posts shipment, inventory OUT, receivable or invoice facts",
      "target environment exercised the finished goods shipment golden loop",
    ],
  },
  {
    id: "p4-finished-goods-delivery-definition-evidence",
    title: "P4-3 finished_goods_delivery start-only runtime loader",
    referenceRequirement:
      "P4 third golden loop should be represented in the tracked customer config runtime manifest as a start-only runtime loader with explicit handlers for quality, finance release, shipment and receivable lead while target evidence remains required",
    checkIds: ["finished-goods-delivery-definition-evidence"],
    releaseActionIds: [],
    notProven: [
      "target environment exercised the finished goods shipment golden loop",
    ],
  },
  {
    id: "p4-finished-goods-remaining-domain-handlers",
    title: "P4-3 finished_goods_delivery 财务放行 handler",
    referenceRequirement:
      "P4 third golden loop has a reviewed ProcessRuntime handler for shipment.finance_release that validates the shipment release gate without shipping inventory",
    checkIds: ["finished-goods-finance-release-handler-registered"],
    releaseActionIds: [],
    notProven: [
      "target environment exercised the finished goods shipment golden loop",
    ],
  },
  {
    id: "process-runtime-wait-event-wakeup",
    title: "ProcessRuntime wait_event 显式唤醒",
    referenceRequirement:
      "Process runtime should explicitly wake an active wait_event node by a declared event key and advance only after the event matches",
    checkIds: ["process-runtime-wait-event-wakeup"],
    releaseActionIds: [],
    notProven: [
      "event subscription automatically wakes wait_event nodes",
      "target environment exercised returnTo branches",
      "target environment exercised wait_event wakeup",
    ],
  },
  {
    id: "process-runtime-end-node-completion",
    title: "ProcessRuntime end 节点与流程实例完成",
    referenceRequirement:
      "Process runtime should complete an adjacent end node and mark the ProcessInstance completed after the prior node finishes",
    checkIds: ["process-runtime-end-node-completion"],
    releaseActionIds: [],
    notProven: [
      "target environment exercised returnTo branches",
      "process runner scans definitions or skips non-adjacent nodes",
      "domain facts are posted when a process reaches end",
      "target environment exercised process completion",
    ],
  },
  {
    id: "workflow-task-configured-candidates",
    title: "WorkflowTask 配置候选角色解释",
    referenceRequirement:
      "explain_action_access / explain_task_assignment should expose read-only configured candidate owner role keys from owner_pool + action capability + customer scope",
    checkIds: ["workflow-task-configured-candidates-explain"],
    releaseActionIds: [],
    notProven: [
      "task candidates are filtered directly by owner_pool_key",
      "user-level task candidates are exposed",
      "workflow task completion posts domain facts",
    ],
  },
  {
    id: "domain-command-entry-preflight",
    title: "领域命令进入条件只读解释",
    referenceRequirement:
      "workflow task explain should expose a guarded domain command entry contract before any task action can post domain facts",
    checkIds: ["domain-command-entry-explain-guard"],
    releaseActionIds: [],
    notProven: [
      "workflow task completion posts domain facts",
      "a domain command usecase binding exists for task completion",
      "a concrete domain fact usecase binding exists",
      "target environment exercised domain command entry",
    ],
  },
];

const IMPLEMENTATION_PHASES = [
  {
    id: "p0-source-rbac-workflow-boundaries",
    label: "P0 源码包自洽 + Workflow/RBAC 边界修复",
    referenceSections: ["23/P0", "19/P0"],
    objective:
      "收口普通 UI 任务入口、任务动作合同、actor role 服务端推导、任务可见范围和 engineering 最小入口，不让前端伪造协同事实。",
    checkIds: [
      "priority-doc-current-entry",
      "workflow-action-contracts",
      "task-visibility-with-work-pools",
      "engineering-minimum-entry",
    ],
    requirementIds: [
      "frontend-effective-session-projection",
      "workflow-task-configured-candidates",
    ],
    forbiddenScope: [
      "不把 Workflow task done 当 Fact posted",
      "不恢复普通 UI create_task / upsert_business_state 主路径",
    ],
    executionContract: {
      allowedPaths: [
        "server/internal/biz/workflow*.go",
        "server/internal/service/jsonrpc_workflow*.go",
        "web/src/erp/api/workflowApi.mjs",
        "web/src/erp/hooks/useWorkflowTaskActionAccess.js",
        "web/src/erp/mobile/**",
        "scripts/qa/workflow-*.mjs",
        "docs/product/多甲方角色能力流程编排优先级.md",
        "progress.md",
      ],
      forbiddenPaths: [
        "deployments/**/evidence/**",
        "server/internal/data/model/migrate/** unless an explicit schema phase is opened",
        "customer raw files outside approved config/import dry-run boundaries",
      ],
      notDoing: [
        "不新增业务事实表或让 WorkflowUsecase 写库存 / 出货 / 财务事实",
        "不把前端本地 helper 当成后端授权真源",
      ],
      validationCommands: [
        "node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs",
        "node scripts/qa/workflow-fact-boundary.test.mjs",
        "node scripts/qa/workflow-ui-action-boundary.test.mjs",
        "cd server && go test ./internal/biz ./internal/service",
      ],
    },
  },
  {
    id: "p1-customer-config-runtime",
    label: "P1 客户配置包、目录和 effective session",
    referenceSections: ["23/P1", "17.11"],
    objective:
      "客户包 validate/compile/preview 后进入受控 revision，正式前端只消费后端 effective session 的页面、动作、字段和责任池投影。",
    checkIds: [
      "customer-config-runtime-schema",
      "customer-config-usecase-repo-api-rbac",
      "demo-customer-package-compile",
      "customer-config-frontend-projection",
      "customer-config-module-status-explain",
    ],
    requirementIds: [
      "runtime-schema-migration",
      "usecase-repo-api-rbac",
      "frontend-effective-session-projection",
    ],
    forbiddenScope: [
      "不上传 raw 客户包并直接发布",
      "不把 yoyoosun 配置写成 Product Core",
    ],
    executionContract: {
      allowedPaths: [
        "config/customers/**",
        "config/industry-templates/**",
        "scripts/qa/customer-config-*.mjs",
        "scripts/deploy/customer-config-*.mjs",
        "server/internal/biz/customer_config*.go",
        "server/internal/data/customer_config*.go",
        "server/internal/service/jsonrpc_customer_config*.go",
        "web/src/erp/utils/adminProfileSync.mjs",
        "web/src/erp/components/ERPLayout.jsx",
        "docs/product/多甲方角色能力流程编排优先级.md",
        "progress.md",
      ],
      forbiddenPaths: [
        "deployments/**/evidence/** unless a release-evidence stage is explicitly opened",
        "raw customer files as runtime publish input",
        "Product Core usecases with yoyoosun-only business rules",
      ],
      notDoing: [
        "不上传任意客户包并直接激活",
        "不绕过后端 validate / publish / activate / rollback 控制面",
        "不把字段策略扩展成未登记页面或未消费字段的运行时真源",
      ],
      validationCommands: [
        "node --test scripts/qa/customer-config-runtime-manifest.test.mjs",
        "node --test scripts/deploy/customer-config-release-readiness.test.mjs",
        "node --test scripts/qa/formal-frontend-customer-config-boundary.test.mjs",
        "cd server && go test ./internal/biz ./internal/data ./internal/service",
      ],
    },
  },
  {
    id: "p2-entitlement-work-pools",
    label: "P2 授权、责任池和解释合同",
    referenceSections: ["23/P2", "17.12", "17.13"],
    objective:
      "RoleProfile / AccessEntitlement / WorkPool 生效，任务可见范围和动作解释使用同一 active revision、capability 和 customer scope。",
    checkIds: [
      "task-visibility-with-work-pools",
      "workflow-task-runtime-anchors",
      "workflow-task-configured-candidates-explain",
      "domain-command-entry-explain-guard",
      "super-admin-break-glass-controlled-runtime",
      "domain-command-entry-remains-guarded",
    ],
    requirementIds: [
      "super-admin-break-glass-governance",
      "workflow-task-runtime-anchors",
      "workflow-task-configured-candidates",
      "domain-command-entry-preflight",
    ],
    forbiddenScope: [
      "不跨角色拼接能力和 scope",
      "不把 super admin 诊断或 break-glass 写成普通岗位能力",
    ],
    executionContract: {
      allowedPaths: [
        "server/internal/biz/rbac*.go",
        "server/internal/biz/workflow*.go",
        "server/internal/biz/customer_config*.go",
        "server/internal/data/customer_config*.go",
        "server/internal/service/jsonrpc_workflow*.go",
        "web/src/erp/utils/workflowTaskActionAccess.mjs",
        "web/src/erp/hooks/useWorkflowTaskActionAccess.js",
        "scripts/qa/multi-client-role-workflow-priority-audit.mjs",
        "progress.md",
      ],
      forbiddenPaths: [
        "deployments/**/evidence/**",
        "business fact usecases unless only read-only explanation is added",
        "front-end-only permission bypasses",
      ],
      notDoing: [
        "不把 super admin 做成长期业务角色",
        "不暴露 entitlement ID、全局候选人或跨 scope 拼接结果",
      ],
      validationCommands: [
        "cd server && go test ./internal/biz ./internal/data ./internal/service",
        "node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs",
        "node scripts/qa/workflow-fact-boundary.test.mjs",
      ],
    },
  },
  {
    id: "p3-narrow-process-runtime",
    label: "P3 窄版 ProcessRuntime",
    referenceSections: ["23/P3", "17.5", "17.6", "17.7"],
    objective:
      "ProcessInstance / ProcessNodeInstance / WorkflowTask 追踪锚点、显式启动、显式 linked task、路由、阻塞、wait_event 和 domain_command guard 闭环。",
    checkIds: [
      "process-runtime-minimum",
      "workflow-task-process-link",
      "process-runtime-linked-human-task",
      "process-runtime-start-first-node",
      "process-runtime-linked-task-completion",
      "workflow-complete-action-process-runtime-completion",
      "process-runtime-sequential-next-node",
      "process-runtime-named-policy-branch",
      "process-runtime-fan-out-join",
      "process-runtime-return-to-attempt",
      "process-runtime-blocked-due-at",
      "process-runtime-end-node-completion",
      "process-runtime-wait-event-wakeup",
      "process-runtime-domain-command-handler-guard",
    ],
    requirementIds: [
      "process-runtime-minimum",
      "workflow-task-process-link",
      "process-runtime-linked-human-task",
      "process-runtime-start-first-node",
      "process-runtime-linked-task-completion",
      "workflow-complete-action-process-runtime-completion",
      "process-runtime-sequential-next-node",
      "process-runtime-named-policy-branch",
      "process-runtime-fan-out-join",
      "process-runtime-return-to-attempt",
      "process-runtime-blocked-due-at",
      "process-runtime-wait-event-wakeup",
      "process-runtime-end-node-completion",
      "process-runtime-domain-command-handler",
    ],
    forbiddenScope: [
      "不引入后台 scheduler 或自由表达式",
      "不恢复 raw workflow status API 自动触发 ProcessRuntime",
    ],
    executionContract: {
      allowedPaths: [
        "server/internal/biz/process_runtime*.go",
        "server/internal/biz/workflow*.go",
        "server/internal/data/process_runtime_repo*.go",
        "server/internal/data/model/schema/process_*.go",
        "server/internal/data/model/migrate/** only for scoped Ent/Atlas migration",
        "server/internal/service/jsonrpc_customer_config*.go",
        "docs/当前真源与交接顺序.md",
        "progress.md",
      ],
      forbiddenPaths: [
        "deployments/**/evidence/**",
        "frontend task completion paths as automatic domain-command triggers",
        "free-form customer JS / SQL / expression evaluators",
      ],
      notDoing: [
        "不做后台 scheduler、自动 overdue 扫描或事件订阅器",
        "不为 domain_command / wait_event / end 节点创建普通 WorkflowTask",
      ],
      validationCommands: [
        "cd server && go test ./internal/biz ./internal/data ./internal/service",
        "node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs",
        "node scripts/qa/workflow-fact-boundary.test.mjs",
      ],
    },
  },
  {
    id: "p4-three-golden-loops",
    label: "P4 三条黄金闭环",
    referenceSections: ["23/P4", "15.2", "15.4", "15.6"],
    objective:
      "销售订单提交、采购入库、成品出货三条优先闭环走后端显式 ProcessRuntime / domain command，不保留前端串任务主路径。",
    checkIds: [
      "sales-order-submit-domain-command-handler",
      "sales-order-acceptance-minimum-process-chain",
      "customer-config-sales-order-process-definition-manifest",
      "sales-order-acceptance-explicit-start-jsonrpc",
      "sales-order-acceptance-submit-domain-command-jsonrpc",
      "sales-order-acceptance-formal-ui-submit-entry",
      "material-supply-runtime-loader-definition",
      "material-supply-domain-command-contract-preflight",
      "material-supply-receipt-runtime-api",
      "material-supply-purchase-order-explicit-runtime-api",
      "finished-goods-shipment-finance-contract-preflight",
      "finished-goods-delivery-definition-evidence",
      "finished-goods-finance-release-handler-registered",
    ],
    requirementIds: [
      "process-runtime-domain-command-handler",
      "p4-material-supply-definition-evidence",
      "p4-material-supply-domain-command-contract-preflight",
      "p4-material-supply-receipt-runtime-api",
      "p4-material-supply-purchase-order-explicit-runtime-api",
      "p4-finished-goods-shipment-finance-contract-preflight",
      "p4-finished-goods-delivery-definition-evidence",
      "p4-finished-goods-remaining-domain-handlers",
    ],
    forbiddenScope: [
      "不让 Workflow task done 自动过账",
      "不把本地黄金链路写成目标环境 evidence",
    ],
    executionContract: {
      allowedPaths: [
        "server/internal/biz/*process_command*.go",
        "server/internal/biz/process_runtime*.go",
        "server/internal/biz/sales_order*.go",
        "server/internal/biz/inventory*.go",
        "server/internal/biz/quality_inspection*.go",
        "server/internal/biz/operational_fact*.go",
        "server/internal/service/jsonrpc_customer_config*.go",
        "web/src/erp/pages/** only for explicit UI entry wiring",
        "docs/当前真源与交接顺序.md",
        "progress.md",
      ],
      forbiddenPaths: [
        "deployments/**/evidence/**",
        "WorkflowUsecase direct writes to inventory / shipment / finance facts",
        "mobile or desktop local task chaining that creates downstream facts",
      ],
      notDoing: [
        "不把本地黄金链路当目标环境 smoke 或客户验收",
        "不新增发票、总账、税控或完整财务系统能力",
      ],
      validationCommands: [
        "cd server && go test ./internal/biz ./internal/data ./internal/service",
        "node scripts/qa/workflow-fact-boundary.test.mjs",
        "node scripts/qa/workflow-ui-action-boundary.test.mjs",
        "node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs",
      ],
    },
  },
  {
    id: "p5-release-import-second-customer",
    label: "P5 测试部署、导入和第二客户验证",
    referenceSections: ["23/P5", "20"],
    objective:
      "客户配置导入 / publish / rollback、主数据导入、部署 preflight、target smoke、backup restore、rollback rehearsal 和第二客户差异验证进入证据门禁。",
      checkIds: [
        "second-customer-responsibility-pool-difference",
        "module-disabled-readonly-process-start-gate",
        "module-disabled-readonly-effective-session-projection-gate",
        "module-disabled-readonly-import-execute-gate",
        "module-disabled-readonly-import-prep-no-execute-gate",
        "module-disabled-readonly-customer-config-execute-gate",
        "module-disabled-readonly-sales-order-api-gate",
        "module-disabled-readonly-purchase-order-api-gate",
      "module-disabled-readonly-outsourcing-order-api-gate",
      "module-disabled-readonly-material-bom-api-gate",
      "module-disabled-readonly-masterdata-core-api-gate",
      "module-disabled-readonly-process-masterdata-api-gate",
        "module-disabled-readonly-purchase-api-gate",
        "module-disabled-readonly-quality-api-gate",
        "module-disabled-readonly-shipment-api-gate",
        "module-disabled-readonly-stock-reservation-api-gate",
        "module-disabled-readonly-production-api-gate",
        "module-disabled-readonly-outsourcing-api-gate",
        "module-disabled-readonly-finance-api-gate",
        "module-disabled-readonly-attachment-api-gate",
        "module-disabled-readonly-workflow-api-gate",
        "module-disabled-readonly-print-api-gate",
        "module-disabled-readonly-no-active-business-scheduler-gate",
        "module-disabled-readonly-consistency-remains-guarded",
        "release-preflight-fast-gate",
        "release-evidence-target-remains-evidence-required",
    ],
    requirementIds: [
      "second-customer-responsibility-difference",
      "module-disabled-readonly-gate",
      "frontend-effective-session-projection",
      "release-preflight-target-evidence",
    ],
    releaseActionIds: [
      "immutable-version",
      "production-preflight",
      "backup-restore-rehearsal",
      "target-smoke",
      "rollback-forward-fix",
      "release-signoff",
      "customer-config-effective-session",
    ],
    forbiddenScope: [
      "当前没有正式生产环境时不伪造 release evidence",
      "真实客户业务数据写入必须另有 dev/test/试用环境和可回滚 evidence",
    ],
    executionContract: {
      allowedPaths: [
        "scripts/qa/multi-client-role-workflow-priority-audit.mjs",
        "scripts/deploy/*evidence*.mjs",
        "scripts/deploy/*preflight*.sh",
        "scripts/deploy/*readiness*.mjs",
        "scripts/import/** dry-run / guarded execute tooling",
        "deployments/yoyoosun/checklists/**",
        "deployments/yoyoosun/runbooks/**",
        "output/release-evidence-closeout/** for report-only runner output",
        "docs/product/多甲方角色能力流程编排优先级.md",
        "progress.md",
      ],
      forbiddenPaths: [
        "deployments/**/evidence/releases/** unless real release batch inputs are present and the stage explicitly crosses release evidence",
        "server/deploy/compose/prod/.env secret values",
        "customer raw data committed as evidence",
        "production or target DB writes without explicit dev/test/target boundary and rollback evidence",
      ],
      notDoing: [
        "不在低配目标机执行 docker / pnpm / go build",
        "不把 report-only、input template、CSV 或 Markdown checklist 写成 release evidence 已完成",
        "不执行真实客户业务数据导入，除非另开带回滚和 evidence 的 dev/test/试用环境阶段",
      ],
      validationCommands: [
        "node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs",
        "node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready",
        "node --test scripts/deploy/release-evidence-status.test.mjs",
        "node --test scripts/deploy/customer-config-release-readiness.test.mjs",
        "node --test scripts/qa/docs-inventory.test.mjs",
      ],
    },
  },
];

function buildReleaseEvidenceProgress({
  releaseEvidenceDir = DEFAULT_RELEASE_EVIDENCE_DIR,
  runtimeEnvFile = DEFAULT_RUNTIME_ENV_FILE,
} = {}) {
  const status = buildReleaseEvidenceStatus({
    customer: "yoyoosun",
    evidenceDir: releaseEvidenceDir,
    repoRoot,
  });
  const closeoutPlan = buildReleaseEvidenceCloseoutPlan({
    customer: "yoyoosun",
    evidenceDir: releaseEvidenceDir,
    envFile: runtimeEnvFile,
    repoRoot,
  });
  const closeoutActionQueue = closeoutPlan.actions.map((action) =>
    buildCloseoutQueueAction({
      action,
      releaseEvidenceDir,
      runtimeEnvFile,
    }),
  );
  const firstBlockedAction =
    closeoutActionQueue.find(
      (action) => action.state === "blocked",
    ) ?? null;
  const allActionsReportPath = buildCloseoutRunnerAllActionsReportPath({
    releaseEvidenceDir,
  });
  return {
    evidenceDir: releaseEvidenceDir,
    runtimeEnvFile,
    status: status.status,
    ready: status.ready,
    gateReady: status.gateReady,
    closeoutSummary: status.closeoutSummary,
    nextActionCount: status.closeoutNextActions.length,
    nextActions: status.closeoutNextActions.map((action) => ({
      id: action.id,
      title: action.title ?? action.label,
      label: action.label ?? action.title,
      status: action.status,
      commands: action.commands,
      manualChecks: action.manualChecks,
    })),
    closeoutPlanCommand:
      `node scripts/deploy/release-evidence-closeout-plan.mjs --evidence-dir ${releaseEvidenceDir} --runtime-env-file ${runtimeEnvFile} --json`,
    closeoutRunnerCommand:
      buildCloseoutRunnerBaseCommand({
        releaseEvidenceDir,
        runtimeEnvFile,
      }),
    closeoutRunnerReportPath: allActionsReportPath,
    closeoutRunnerReportCommand:
      buildCloseoutRunnerBaseCommand({
        releaseEvidenceDir,
        runtimeEnvFile,
      }),
    closeoutRunnerReportFileCommand:
      buildCloseoutRunnerBaseCommand({
        releaseEvidenceDir,
        runtimeEnvFile,
        reportPath: allActionsReportPath,
      }),
    closeoutRunnerReportWritesReleaseEvidence: false,
    closeoutInputChecklist: buildAllMissingInputChecklist(closeoutActionQueue),
    priorityAuditCommands: {
      json: buildPriorityAuditCommand({
        releaseEvidenceDir,
        runtimeEnvFile,
      }),
      releaseGate: buildPriorityAuditCommand({
        releaseEvidenceDir,
        runtimeEnvFile,
        gateFlag: "--fail-on-release-not-ready",
      }),
      completionGate: buildPriorityAuditCommand({
        releaseEvidenceDir,
        runtimeEnvFile,
        gateFlag: "--fail-on-completion-not-ready",
      }),
    },
    closeoutGateSummary: status.closeoutGateSummary,
    closeoutActionQueue,
    closeoutPlanSummary: {
      ...closeoutPlan.summary,
      runnableActionIds: closeoutPlan.actions
        .filter((action) => action.canRun)
        .map((action) => action.id),
      blockedActionIds: closeoutPlan.actions
        .filter((action) => !action.canRun && !action.manualOnly)
        .map((action) => action.id),
      manualActionIds: closeoutPlan.actions
        .filter((action) => action.manualOnly)
        .map((action) => action.id),
      firstBlockedAction,
    },
    scope: status.scope,
  };
}

function unique(values) {
  return [...new Set(values)];
}

function localCoverageState(checks) {
  if (checks.some((check) => !check || !check.pass)) return "failed";
  if (checks.some((check) => check.status === "evidence-required")) {
    return "evidence-required";
  }
  if (checks.some((check) => check.status === "guarded")) return "guarded";
  return "ready";
}

function targetCoverageState({ releaseActions, releaseEvidenceProgress }) {
  if (releaseActions.length === 0) return "not-applicable";
  if (
    releaseActions.some((action) => action.state !== "runnable") &&
    !releaseEvidenceProgress.ready
  ) {
    return "evidence-required";
  }
  return releaseEvidenceProgress.ready ? "ready" : "runnable";
}

function coverageState({ localState, targetState }) {
  if (localState === "failed") return "failed";
  if (targetState === "evidence-required") return "evidence-required";
  if (localState === "evidence-required") return "evidence-required";
  if (localState === "guarded") return "guarded";
  return "ready";
}

function buildReferenceCoverage({ checks, releaseEvidenceProgress }) {
  return REFERENCE_COVERAGE_REQUIREMENTS.map((requirement) => {
    const coveredChecks = requirement.checkIds.map((id) =>
      checks.find((check) => check.id === id),
    );
    const releaseActions = requirement.releaseActionIds.map((id) =>
      releaseEvidenceProgress.closeoutActionQueue.find((action) => action.id === id),
    ).filter(Boolean);
    const localState = localCoverageState(coveredChecks);
    const targetState = targetCoverageState({
      releaseActions,
      releaseEvidenceProgress,
    });
    return {
      id: requirement.id,
      title: requirement.title,
      referenceRequirement: requirement.referenceRequirement,
      state: coverageState({ localState, targetState }),
      localState,
      targetState,
      checkIds: requirement.checkIds,
      checkStatuses: unique(coveredChecks.filter(Boolean).map((check) => check.status)),
      missingCheckIds: requirement.checkIds.filter(
        (id) => !coveredChecks.some((check) => check && check.id === id),
      ),
      evidence: unique(coveredChecks.flatMap((check) => check?.evidence ?? [])),
      releaseActionIds: requirement.releaseActionIds,
      releaseActions: releaseActions.map((action) => ({
        id: action.id,
        state: action.state,
        missingPrerequisiteIds: action.missingPrerequisiteIds,
      })),
      notProven: requirement.notProven,
    };
  });
}

function collectReleasePrerequisiteIds(closeoutActionQueue) {
  return unique(
    closeoutActionQueue
      .filter((action) => action.state !== "runnable")
      .flatMap((action) => action.missingPrerequisiteIds),
  );
}

function collectRemainingPrerequisites(closeoutActionQueue) {
  const prerequisites = new Map();
  for (const action of closeoutActionQueue) {
    if (action.state === "runnable") continue;
    for (const prerequisite of action.missingPrerequisites) {
      const key = `${prerequisite.kind}:${prerequisite.id}`;
      if (!prerequisites.has(key)) {
        prerequisites.set(key, {
          id: prerequisite.id,
          kind: prerequisite.kind,
          message: prerequisite.message,
          actionIds: [],
        });
      }
      const entry = prerequisites.get(key);
      if (!entry.actionIds.includes(action.id)) {
        entry.actionIds.push(action.id);
      }
    }
  }
  return [...prerequisites.values()];
}

function groupPrerequisitesByKind(prerequisites) {
  const groups = {};
  for (const prerequisite of prerequisites) {
    if (!groups[prerequisite.kind]) {
      groups[prerequisite.kind] = [];
    }
    groups[prerequisite.kind].push(prerequisite.id);
  }
  return groups;
}

function isSecretInputId(inputId) {
  return [
    "CUSTOMER_CONFIG_ADMIN_TOKEN",
    "SOURCE_POSTGRES_DSN",
    "prod-env-file",
  ].includes(inputId);
}

function buildMissingInputRows({
  missingPrerequisites = [],
  operatorChecklist = [],
  defaultActionIds = [],
} = {}) {
  const operatorChecklistByInput = new Map(
    (operatorChecklist ?? []).map((item) => [item.id, item]),
  );
  return (missingPrerequisites ?? []).map((item) => {
    const operatorItem = operatorChecklistByInput.get(item.id) ?? {};
    return {
      id: item.id,
      kind: item.kind,
      message: item.message,
      actionIds: Array.isArray(item.actionIds)
        ? item.actionIds
        : defaultActionIds,
      secret: operatorItem.secret === true || isSecretInputId(item.id),
      status: operatorItem.status ?? "missing",
      source: operatorItem.source ?? operatorItem.sourceHint ?? "",
      sourceHint: operatorItem.sourceHint ?? "",
      evidenceTarget: operatorItem.evidenceTarget ?? "",
      validation: operatorItem.validation ?? "",
    };
  });
}

function buildInputCollectionPlan(closeoutActionQueue) {
  return closeoutActionQueue
    .filter((action) => action.state !== "runnable")
    .map((action) => ({
      order: action.order,
      actionId: action.id,
      actionState: action.state,
      title: action.title,
      label: action.label,
      missingInputIds: action.missingPrerequisiteIds,
      missingInputs: buildMissingInputRows({
        missingPrerequisites: action.missingPrerequisites,
        operatorChecklist: action.operatorChecklist,
        defaultActionIds: [action.id],
      }),
      missingInputIdsByKind: groupPrerequisitesByKind(action.missingPrerequisites),
      missingInputEnvTemplate: action.requiredEnvExports,
      secretInputIds: action.missingPrerequisites
        .filter((item) => isSecretInputId(item.id))
        .map((item) => item.id),
      operatorChecklist: action.operatorChecklist,
      runnerReportPath: action.closeoutRunnerReportPath,
      runnerReportCommand: action.closeoutRunnerReportCommand,
      runnerReportFileCommand: action.closeoutRunnerReportFileCommand,
      reportOnly: true,
      writesReleaseEvidence: false,
    }));
}

function collectionGroupForAction(actionId) {
  const groups = {
    "immutable-version": {
      id: "release-build-version-owner",
      title: "Release build / version owner",
    },
    "production-preflight": {
      id: "production-preflight-operator",
      title: "Production preflight operator",
    },
    "backup-restore-rehearsal": {
      id: "database-backup-restore-operator",
      title: "Database backup / restore operator",
    },
    "target-smoke": {
      id: "target-smoke-operator",
      title: "Target smoke operator",
    },
    "customer-config-effective-session": {
      id: "customer-config-readback-operator",
      title: "Customer config readback operator",
    },
    "rollback-forward-fix": {
      id: "rollback-forward-fix-owner",
      title: "Rollback / forward-fix owner",
    },
    "release-signoff": {
      id: "release-signoff-reviewer",
      title: "Release sign-off reviewer",
    },
  };
  return groups[actionId] ?? {
    id: "release-closeout-operator",
    title: "Release closeout operator",
  };
}

function mergeMissingInput(target, input, actionId) {
  const actionIds = unique([...(target.actionIds ?? []), actionId]);
  return {
    ...target,
    ...input,
    actionIds,
    secret: target.secret === true || input.secret === true,
    source: target.source || input.source,
    sourceHint: target.sourceHint || input.sourceHint,
    evidenceTarget: target.evidenceTarget || input.evidenceTarget,
    validation: target.validation || input.validation,
  };
}

function buildInputCollectionGroups(collectionPlan) {
  const groups = new Map();
  for (const action of collectionPlan) {
    const groupInfo = collectionGroupForAction(action.actionId);
    if (!groups.has(groupInfo.id)) {
      groups.set(groupInfo.id, {
        id: groupInfo.id,
        title: groupInfo.title,
        actionIds: [],
        missingInputIds: [],
        secretInputIds: [],
        missingInputsById: new Map(),
        runnerReportPaths: [],
        reportOnly: true,
        writesReleaseEvidence: false,
      });
    }
    const group = groups.get(groupInfo.id);
    if (!group.actionIds.includes(action.actionId)) {
      group.actionIds.push(action.actionId);
    }
    for (const inputId of action.missingInputIds ?? []) {
      if (!group.missingInputIds.includes(inputId)) {
        group.missingInputIds.push(inputId);
      }
    }
    for (const inputId of action.secretInputIds ?? []) {
      if (!group.secretInputIds.includes(inputId)) {
        group.secretInputIds.push(inputId);
      }
    }
    if (
      action.runnerReportPath &&
      !group.runnerReportPaths.includes(action.runnerReportPath)
    ) {
      group.runnerReportPaths.push(action.runnerReportPath);
    }
    for (const input of action.missingInputs ?? []) {
      const existing = group.missingInputsById.get(input.id) ?? {
        ...input,
        actionIds: [],
      };
      group.missingInputsById.set(
        input.id,
        mergeMissingInput(existing, input, action.actionId),
      );
    }
  }

  return [...groups.values()].map((group) => {
    const { missingInputsById, ...output } = group;
    return {
      ...output,
      missingInputs: [...missingInputsById.values()],
    };
  });
}

function buildAllMissingInputChecklist(closeoutActionQueue) {
  const remainingPrerequisites = collectRemainingPrerequisites(closeoutActionQueue);
  const operatorChecklistByInput = new Map();
  const envTemplateByInput = new Map();
  for (const action of closeoutActionQueue) {
    for (const item of action.operatorChecklist ?? []) {
      if (!operatorChecklistByInput.has(item.id)) {
        operatorChecklistByInput.set(item.id, {
          id: item.id,
          kind: item.kind,
          status: item.status,
          source: item.source,
          sourceHint: item.sourceHint,
          evidenceTarget: item.evidenceTarget,
          validation: item.validation,
          secret: item.secret === true || isSecretInputId(item.id),
          actionIds: [],
        });
      }
      const checklistItem = operatorChecklistByInput.get(item.id);
      if (!checklistItem.actionIds.includes(action.id)) {
        checklistItem.actionIds.push(action.id);
      }
    }
    for (const envExport of action.requiredEnvExports ?? []) {
      const inputId = envExport.split("=")[0];
      if (inputId && !envTemplateByInput.has(inputId)) {
        envTemplateByInput.set(inputId, envExport);
      }
    }
  }
  const collectionPlan = buildInputCollectionPlan(closeoutActionQueue);

  return {
    missingInputs: buildMissingInputRows({
      missingPrerequisites: remainingPrerequisites,
      operatorChecklist: [...operatorChecklistByInput.values()],
    }),
    missingInputIds: remainingPrerequisites.map((item) => item.id),
    missingInputIdsByKind: groupPrerequisitesByKind(remainingPrerequisites),
    missingInputEnvTemplate: remainingPrerequisites
      .map((item) => envTemplateByInput.get(item.id))
      .filter(Boolean),
    actionIdsByInput: Object.fromEntries(
      remainingPrerequisites.map((item) => [item.id, item.actionIds]),
    ),
    operatorChecklist: remainingPrerequisites
      .map((item) => operatorChecklistByInput.get(item.id))
      .filter(Boolean),
    secretInputIds: remainingPrerequisites
      .filter((item) => isSecretInputId(item.id))
      .map((item) => item.id),
    collectionPlan,
    collectionGroups: buildInputCollectionGroups(collectionPlan),
    reportOnly: true,
    writesReleaseEvidence: false,
  };
}

function buildFirstBlockedInputChecklist(action) {
  if (!action) return null;
  const missingPrerequisiteIdsByKind = groupPrerequisitesByKind(
    action.missingPrerequisites,
  );
  return {
    actionId: action.id,
    actionState: action.state,
    resolvedInputIds: Object.keys(action.resolvedInputs ?? {}),
    missingInputIds: action.missingPrerequisiteIds,
    missingInputIdsByKind: missingPrerequisiteIdsByKind,
    missingInputEnvTemplate: action.requiredEnvExports,
    operatorChecklist: action.operatorChecklist,
    nextInputTemplateCommand: action.inputTemplateCommand,
    nextRunnerReportPath: action.closeoutRunnerReportPath,
    nextRunnerReportCommand: action.closeoutRunnerReportCommand,
    nextRunnerReportFileCommand: action.closeoutRunnerReportFileCommand,
    nextRunnerExecuteCommand: action.closeoutRunnerExecuteCommand,
  };
}

function firstUnverifiedGateGroup(closeoutGateSummary) {
  return (
    closeoutGateSummary.find(
      (item) => item.errorCount > 0 || item.warningCount > 0,
    ) ?? null
  );
}

function buildCompletionAudit({ referenceCoverage, releaseEvidenceProgress }) {
  const targetEvidenceRequiredRequirementIds = referenceCoverage
    .filter((item) => item.targetState === "evidence-required")
    .map((item) => item.id);
  const localEvidenceRequiredRequirementIds = referenceCoverage
    .filter((item) => item.localState === "evidence-required")
    .map((item) => item.id);
  const localReadyRequirementIds = referenceCoverage
    .filter((item) => item.localState === "ready")
    .map((item) => item.id);
  const localGuardedRequirementIds = referenceCoverage
    .filter((item) => item.localState === "guarded")
    .map((item) => item.id);
  const firstBlockedAction =
    releaseEvidenceProgress.closeoutPlanSummary.firstBlockedAction;
  const remainingReleaseActions = releaseEvidenceProgress.closeoutActionQueue
    .filter((action) => action.state !== "runnable")
    .map((action) => ({
      id: action.id,
      state: action.state,
      missingPrerequisiteIds: action.missingPrerequisiteIds,
    }));
  const state = !releaseEvidenceProgress.ready
    ? "target-evidence-required"
    : localGuardedRequirementIds.length > 0
      ? "guarded"
      : "ready";
  const blockingCategory = !releaseEvidenceProgress.ready
    ? "external-release-evidence-required"
    : localGuardedRequirementIds.length > 0
      ? "local-guarded-requirement"
      : "none";
  const firstGateGroup = firstUnverifiedGateGroup(
    releaseEvidenceProgress.closeoutGateSummary,
  );
  const remainingPrerequisites = collectRemainingPrerequisites(
    releaseEvidenceProgress.closeoutActionQueue,
  );
  return {
    state,
    blockingCategory,
    blockingReason: !releaseEvidenceProgress.ready
      ? "real target release evidence is still missing or unverified; keep using the priority rows as an execution queue, not as completion proof"
      : localGuardedRequirementIds.length > 0
        ? "local guarded requirements remain; keep using the priority rows as an execution queue, not as completion proof"
        : "",
    canUsePriorityAsExecutionQueue: true,
    canCompleteLocally: releaseEvidenceProgress.ready && localGuardedRequirementIds.length === 0,
    localReadyRequirementIds,
    localGuardedRequirementIds,
    localEvidenceRequiredRequirementIds,
    targetEvidenceRequiredRequirementIds,
    remainingReleaseActionIds: remainingReleaseActions.map((action) => action.id),
    remainingReleaseActions,
    firstBlockedReleaseAction: firstBlockedAction
      ? {
        id: firstBlockedAction.id,
        state: firstBlockedAction.state,
        missingPrerequisiteIds: firstBlockedAction.missingPrerequisiteIds,
        missingPrerequisites: firstBlockedAction.missingPrerequisites,
        resolvedInputs: firstBlockedAction.resolvedInputs,
        requiredEnvExports: firstBlockedAction.requiredEnvExports,
        operatorChecklist: firstBlockedAction.operatorChecklist,
        gateSummary: firstBlockedAction.gateSummary,
        inputTemplateCommand: firstBlockedAction.inputTemplateCommand,
        closeoutRunnerReportPath: firstBlockedAction.closeoutRunnerReportPath,
        closeoutRunnerReportCommand: firstBlockedAction.closeoutRunnerReportCommand,
        closeoutRunnerReportFileCommand: firstBlockedAction.closeoutRunnerReportFileCommand,
        closeoutRunnerExecuteCommand: firstBlockedAction.closeoutRunnerExecuteCommand,
      }
      : null,
    firstBlockedInputChecklist: buildFirstBlockedInputChecklist(
      firstBlockedAction,
    ),
    externalPrerequisiteIds: collectReleasePrerequisiteIds(
      releaseEvidenceProgress.closeoutActionQueue,
    ),
    remainingPrerequisites,
    remainingPrerequisitesByKind: groupPrerequisitesByKind(
      remainingPrerequisites,
    ),
    gateErrorTotals: {
      errors: releaseEvidenceProgress.closeoutGateSummary.reduce(
        (total, item) => total + item.errorCount,
        0,
      ),
      warnings: releaseEvidenceProgress.closeoutGateSummary.reduce(
        (total, item) => total + item.warningCount,
        0,
      ),
    },
    firstUnverifiedGateGroup: firstGateGroup
      ? {
        id: firstGateGroup.id,
        status: firstGateGroup.status,
        errorCount: firstGateGroup.errorCount,
        warningCount: firstGateGroup.warningCount,
        firstError: firstGateGroup.sampleErrors[0] ?? "",
        firstWarning: firstGateGroup.sampleWarnings[0] ?? "",
      }
      : null,
    guidance: releaseEvidenceProgress.ready
      ? [
        "priority audit and target release evidence are ready; use --fail-on-release-not-ready for release gate mode",
      ]
      : [
        "use referenceCoverage as the implementation priority map",
        "do not mark the reference implementation complete until releaseReady=true",
        "fill real target evidence through closeoutActionQueue before release sign-off",
      ],
  };
}

function aggregateLocalState({ checks, coverageItems }) {
  if (
    checks.some((check) => !check || !check.pass) ||
    coverageItems.some((item) => !item || item.localState === "failed")
  ) {
    return "failed";
  }
  if (
    checks.some((check) => check.status === "evidence-required") ||
    coverageItems.some((item) => item.localState === "evidence-required")
  ) {
    return "evidence-required";
  }
  return "ready";
}

function aggregateTargetState({ phase, coverageItems, releaseEvidenceProgress }) {
  if (phase.releaseActionIds?.length > 0) {
    return releaseEvidenceProgress.ready ? "ready" : "evidence-required";
  }
  const targetStates = coverageItems
    .map((item) => item?.targetState)
    .filter(Boolean);
  if (targetStates.includes("failed")) return "failed";
  return "not-applicable";
}

function aggregatePhaseState({ localState, targetState }) {
  if (localState === "failed") return "failed";
  if (targetState === "evidence-required") return "target-evidence-required";
  if (localState === "evidence-required") return "local-evidence-required";
  return "ready";
}

function buildPhaseNextAction({
  phase,
  state,
  releaseEvidenceProgress,
}) {
  if (state === "target-evidence-required") {
    const firstAction =
      releaseEvidenceProgress.closeoutPlanSummary.firstBlockedAction ||
      releaseEvidenceProgress.closeoutActionQueue.find(
        (action) => phase.releaseActionIds?.includes(action.id) && action.state !== "runnable",
      ) ||
      null;
    if (firstAction) {
      return {
        kind: "release-closeout",
        actionId: firstAction.id,
        actionState: firstAction.state,
        reportOnlyCommand: firstAction.closeoutRunnerReportCommand,
        reportFileCommand: firstAction.closeoutRunnerReportFileCommand,
        reportOnlyWritesReleaseEvidence: false,
        executeRequiresConfirm: RELEASE_CLOSEOUT_CONFIRM,
        executeCommand: firstAction.closeoutRunnerExecuteCommand,
        inputTemplateCommand: firstAction.inputTemplateCommand,
        missingPrerequisiteIds: firstAction.missingPrerequisiteIds,
        inputChecklist: buildFirstBlockedInputChecklist(firstAction),
        gateSummary: firstAction.gateSummary,
        note:
          "requires real target release inputs/evidence; report-only commands do not write release evidence",
      };
    }
    return {
      kind: "release-closeout",
      actionId: "",
      note:
        "release evidence remains required, but no blocked closeout action was identified",
    };
  }
  if (state === "failed") {
    return {
      kind: "local-fix",
      note: "fix failing local checks before moving to the next phase",
    };
  }
  if (state === "local-evidence-required") {
    return {
      kind: "local-evidence",
      note:
        "local evidence-required checks remain; complete those before target evidence work",
    };
  }
  return {
    kind: "none",
    note: "phase has current local executable evidence for its scoped checks",
  };
}

function buildImplementationOrder({
  checks,
  referenceCoverage,
  releaseEvidenceProgress,
}) {
  return IMPLEMENTATION_PHASES.map((phase) => {
    const phaseChecks = phase.checkIds.map((id) =>
      checks.find((check) => check.id === id),
    );
    const phaseCoverage = phase.requirementIds.map((id) =>
      referenceCoverage.find((item) => item.id === id),
    );
    const localState = aggregateLocalState({
      checks: phaseChecks,
      coverageItems: phaseCoverage,
    });
    const targetState = aggregateTargetState({
      phase,
      coverageItems: phaseCoverage,
      releaseEvidenceProgress,
    });
    const state = aggregatePhaseState({ localState, targetState });
    const guardedCheckIds = phaseChecks
      .filter((check) => check?.status === "guarded")
      .map((check) => check.id);
    return {
      id: phase.id,
      label: phase.label,
      referenceSections: phase.referenceSections,
      objective: phase.objective,
      state,
      localState,
      targetState,
      checkIds: phase.checkIds,
      missingCheckIds: phase.checkIds.filter(
        (id) => !phaseChecks.some((check) => check?.id === id),
      ),
      failedCheckIds: phaseChecks
        .filter((check) => check && !check.pass)
        .map((check) => check.id),
      guardedCheckIds,
      requirementIds: phase.requirementIds,
      releaseActionIds: phase.releaseActionIds ?? [],
      forbiddenScope: phase.forbiddenScope,
      executionContract: phase.executionContract,
      nextAction: buildPhaseNextAction({
        phase,
        state,
        releaseEvidenceProgress,
      }),
    };
  });
}

function readRelative(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function fileExists(relativePath) {
  return existsSync(path.join(repoRoot, relativePath));
}

function anyMigrationContains(tokens) {
  const migrateDir = path.join(repoRoot, "server/internal/data/model/migrate");
  if (!existsSync(migrateDir)) return false;
  return readdirSync(migrateDir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .some((fileName) => {
      const source = readFileSync(path.join(migrateDir, fileName), "utf8");
      return tokens.every((token) => source.includes(token));
    });
}

function sourceContains(relativePath, tokens) {
  if (!fileExists(relativePath)) return false;
  const source = readRelative(relativePath);
  return tokens.every((token) => source.includes(token));
}

function sourceContainsAny(relativePath, tokens) {
  if (!fileExists(relativePath)) return false;
  const source = readRelative(relativePath);
  return tokens.some((token) => source.includes(token));
}

function sourceExcludes(relativePath, tokens) {
  if (!fileExists(relativePath)) return false;
  const source = readRelative(relativePath);
  return tokens.every((token) => !source.includes(token));
}

function listRelativeFilesUnder(relativeDir) {
  const root = path.join(repoRoot, relativeDir);
  if (!existsSync(root)) return [];
  const out = [];
  const walk = (absoluteDir, relativePrefix) => {
    for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
      const relativePath = path.join(relativePrefix, entry.name);
      const absolutePath = path.join(absoluteDir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath, relativePath);
      } else if (entry.isFile()) {
        out.push(relativePath);
      }
    }
  };
  walk(root, relativeDir);
  return out.sort();
}

function activeBusinessSchedulerFindings() {
  const allowedFiles = new Set([
    "server/cmd/server/main.go",
    "server/internal/server/template_pdf.go",
  ]);
  const allowedPrefixes = [
    "server/api/jsonrpc/v1/",
    "server/internal/data/model/ent/",
    "server/pkg/taskgroup/",
  ];
  const schedulerTokens = [
    "time.NewTicker(",
    "time.Tick(",
    "time.AfterFunc(",
    "cron.New",
    "cron.",
    "scheduler",
    "Scheduler",
    "定时任务",
    "后台任务",
  ];
  return listRelativeFilesUnder("server")
    .filter((relativePath) => relativePath.endsWith(".go"))
    .filter((relativePath) => !relativePath.endsWith("_test.go"))
    .filter((relativePath) => !allowedFiles.has(relativePath))
    .filter(
      (relativePath) =>
        !allowedPrefixes.some((prefix) => relativePath.startsWith(prefix)),
    )
    .flatMap((relativePath) => {
      const source = readRelative(relativePath);
      return schedulerTokens
        .filter((token) => source.includes(token))
        .map((token) => `${relativePath}:${token}`);
    });
}

function jsonrpcWriteMethodInventoryFindings() {
  const serviceFiles = listRelativeFilesUnder("server/internal/service")
    .filter((relativePath) => /^server\/internal\/service\/jsonrpc_.*\.go$/.test(relativePath))
    .filter((relativePath) => !relativePath.endsWith("_test.go"));
  const aggregateDispatchers = new Set([
    "server/internal/service/jsonrpc_bom.go",
    "server/internal/service/jsonrpc_masterdata.go",
    "server/internal/service/jsonrpc_operational_fact.go",
    "server/internal/service/jsonrpc_outsourcing_order.go",
    "server/internal/service/jsonrpc_purchase.go",
    "server/internal/service/jsonrpc_purchase_order.go",
    "server/internal/service/jsonrpc_sales_order.go",
  ]);
  const nonOrdinaryBusinessFiles = new Set([
    "server/internal/service/jsonrpc_debug.go",
    "server/internal/service/jsonrpc_dispatch_admin.go",
  ]);
  const parentGatedFiles = new Set([
    "server/internal/service/jsonrpc_workflow_business_state.go",
    "server/internal/service/jsonrpc_workflow_task.go",
  ]);
  const writeMethodPattern =
    /^(create|update|delete|remove|add|save|submit|approve|confirm|close|cancel|post|settle|ship|upload|publish|activate|rollback|execute|start|block|reject|complete|urge|upsert|disable|set_|copy|archive)_/i;
  const extractCaseMethods = (source) =>
    [...source.matchAll(/case\s+([^:]+):/g)].flatMap((match) =>
      [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]),
    );
  const workflowParentGateReady = sourceContains("server/internal/service/jsonrpc_workflow.go", [
    "workflowMethodRequiresEnabledModule",
    "workflowModuleKeyTasks",
    "requireCustomerConfigModulesEnabled",
  ]);

  return serviceFiles.flatMap((relativePath) => {
    const source = readRelative(relativePath);
    const writeMethods = extractCaseMethods(source).filter((method) =>
      writeMethodPattern.test(method),
    );
    if (writeMethods.length === 0) return [];
    if (aggregateDispatchers.has(relativePath)) return [];
    if (nonOrdinaryBusinessFiles.has(relativePath)) return [];
    if (parentGatedFiles.has(relativePath) && workflowParentGateReady) return [];
    const hasLocalModuleGate =
      source.includes("requireCustomerConfigModulesEnabled") ||
      source.includes("EnsureModuleKeysEnabled") ||
      source.includes("requireBusinessAttachmentOwnerModuleEnabled") ||
      source.includes("requireContactOwnerModuleEnabled") ||
      source.includes("requireExistingContactOwnerModuleEnabled") ||
      source.includes("workflowMethodRequiresEnabledModule") ||
      source.includes("targetModuleKeysForCandidate") ||
      source.includes("processDomainCommandReferencedModuleKeys");
    if (hasLocalModuleGate) return [];
    return [`${relativePath}:${writeMethods.join(",")}`];
  });
}

function collectChecks() {
  const priorityDoc = "docs/product/多甲方角色能力流程编排优先级.md";
  const currentTruthDoc = "docs/当前真源与交接顺序.md";
  const businessSchedulerFindings = activeBusinessSchedulerFindings();
  const jsonrpcWriteInventoryFindings = jsonrpcWriteMethodInventoryFindings();
  return [
    {
      id: "priority-doc-current-entry",
      status: "ready",
      category: "docs",
      description: "GPT 参考材料已收敛为当前仓库优先级入口，并声明 reference 只作输入",
      pass:
        sourceContains(priorityDoc, [
          "docs/reference/第四次20260627/",
          "所有参考材料都只作为输入",
          "AGENTS.md",
        ]) &&
        sourceContains("docs/product/README.md", [
          "判断 GPT 参考材料吸收后的执行优先级",
          "多甲方角色能力流程编排优先级.md",
        ]),
      evidence: [priorityDoc, "docs/product/README.md"],
    },
    {
      id: "priority-audit-input-checklist-docs",
      status: "ready",
      category: "docs",
      description: "P5 输入清单 JSON / Markdown 入口在产品优先级文档、脚本 README 和 CLI help 中保持只读收集口径",
      pass:
        sourceContains(priorityDoc, [
          "--input-checklist-json",
          "--input-checklist-markdown",
          "--input-checklist-csv",
          "Collection Groups",
          "Collection Input Details",
          "不写 release evidence",
        ]) &&
        sourceContains("scripts/README.md", [
          "--input-checklist-json",
          "--input-checklist-markdown",
          "--input-checklist-csv",
          "Collection Groups",
          "Collection Input Details",
          "不写 release evidence",
        ]) &&
        sourceContains("scripts/qa/multi-client-role-workflow-priority-audit.mjs", [
          "--input-checklist-json",
          "--input-checklist-markdown",
          "--input-checklist-csv",
          "Input checklist modes are input collection views only",
          "Collection Groups",
          "do not write release evidence",
        ]),
      evidence: [
        priorityDoc,
        "scripts/README.md",
        "scripts/qa/multi-client-role-workflow-priority-audit.mjs",
      ],
    },
    {
      id: "workflow-action-contracts",
      status: "ready",
      category: "workflow",
      description: "任务完成 / 阻塞 / 退回动作走后端 action 合同和 explain 只读合同",
      pass:
        sourceContains("server/internal/service/jsonrpc_workflow_task.go", [
          "complete_task_action",
          "block_task_action",
          "reject_task_action",
          "explain_action_access",
          "explain_task_assignment",
          "action_required_permissions",
        ]) &&
        sourceContains("web/src/erp/api/workflowApi.mjs", [
          "complete_task_action",
          "block_task_action",
          "reject_task_action",
          "explain_action_access",
          "explain_task_assignment",
        ]) &&
        fileExists("scripts/qa/workflow-ui-action-boundary.test.mjs"),
      evidence: [
        "server/internal/service/jsonrpc_workflow_task.go",
        "web/src/erp/api/workflowApi.mjs",
        "scripts/qa/workflow-ui-action-boundary.test.mjs",
      ],
    },
    {
      id: "task-visibility-with-work-pools",
      status: "ready",
      category: "workflow",
      description: "任务列表、动作和 explain 可见范围接入 active customer config 责任池角色投影，并按同一 entitlement 的 action capability + customer scope 过滤",
      pass:
        sourceContains("server/internal/service/jsonrpc_workflow_task.go", [
          "workflowVisibleOwnerRoleKeys",
          "requiredCapabilities",
          "biz.WorkflowStatusActionPermission",
          "work_pool_role_matched",
          "work_pool_entitlement_scope_matched",
          "action_work_pool_scope_matches",
          "candidate_owner_role_keys",
          "action_candidate_owner_role_keys",
          "visible_owner_role_keys",
        ]) &&
        sourceContains("server/internal/biz/customer_config.go", [
          "ListWorkPoolMemberships",
          "ListAccessEntitlements",
          "WorkPoolMembershipInput",
          "workflowEntitlementRoleKeysWithCapabilities",
          "workflowEntitlementScopeMatchesCustomer",
          "ScopeValue",
        ]) &&
        sourceContains("server/internal/biz/customer_config_test.go", [
          "TestCustomerConfigUsecaseWorkflowVisibleOwnerRoleKeysRequiresTaskEntitlement",
          "TestCustomerConfigUsecaseWorkflowVisibleOwnerRoleKeysRequiresMatchingEntitlementScope",
          "warehouse must not be visible for complete without same-role entitlement",
          "warehouse must not be visible when workflow.task.read only matches another customer scope",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_workflow_test.go", [
          "TestJsonrpcDispatcher_WorkflowListTasksRequiresCustomerWorkPoolReadEntitlement",
          "TestJsonrpcDispatcher_WorkflowActionRequiresCustomerWorkPoolActionEntitlement",
          "TestJsonrpcDispatcher_WorkflowExplainActionAccessExplainsWorkPoolEntitlement",
          "TestJsonrpcDispatcher_WorkflowExplainTaskAssignmentReportsActionScopeMatches",
          "candidate_owner_role_keys",
          "action_candidate_owner_role_keys",
          "same-role same-scope workflow.task.read entitlement",
          "other_customer",
        ]) &&
        sourceContains("web/src/erp/utils/workflowTaskActionAccess.mjs", [
          "candidateOwnerRoleKeys",
          "workPoolEntitlementMatched",
          "workPoolEntitlementScopeMatched",
          "domainCommandEntry",
          "willWriteFact",
        ]) &&
        sourceContains("web/src/erp/utils/workflowTaskActionAccess.test.mjs", [
          "candidateOwnerRoleKeys",
          "workPoolEntitlementMatched",
          "workPoolEntitlementScopeMatched",
          "domainCommandEntry",
          "guarded_no_domain_command_contract",
        ]) &&
        sourceContains("server/internal/data/customer_config_repo.go", [
          "FROM work_pool_memberships",
          "FROM access_entitlements",
        ]),
      evidence: [
        "server/internal/service/jsonrpc_workflow_task.go",
        "server/internal/biz/customer_config.go",
        "server/internal/biz/customer_config_test.go",
        "server/internal/service/jsonrpc_workflow_test.go",
        "server/internal/data/customer_config_repo.go",
      ],
    },
    {
      id: "customer-config-module-status-explain",
      status: "ready",
      category: "customer-config",
      description: "customer_config.explain_module_status 提供只读模块状态解释，不提供普通运行时 install / uninstall / upload",
      pass:
        sourceContains("server/internal/biz/customer_config.go", [
          "ExplainModuleStatus",
          "CustomerModuleStatusExplanation",
          "process_workflow_business_partial",
          "OpenBusinessDocCount",
          "module_disable_full_enforcement_not_connected",
          "product_module_not_included",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config.go", [
          "explain_module_status",
          "module_status",
          "open_business_document_count",
          "customerModuleStatusExplanationToMap",
        ]) &&
        sourceContains("server/internal/biz/customer_config_test.go", [
          "TestCustomerConfigUsecaseExplainModuleStatus",
          "TestCustomerConfigUsecaseExplainModuleStatusCountsRuntimeGuards",
          "TestCustomerConfigUsecaseExplainModuleStatusReportsMissingDependencies",
          "process_workflow_business_partial",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config_test.go", [
          "TestCustomerConfigJSONRPCExplainModuleStatus",
          "TestCustomerConfigJSONRPCExplainModuleStatusRequiresReadPermission",
        ]) &&
        !sourceContains("server/internal/service/jsonrpc_customer_config.go", [
          "install_module",
          "uninstall_module",
          "upload_plugin",
        ]),
      evidence: [
        "server/internal/biz/customer_config.go",
        "server/internal/biz/shipment_process_command.go",
        "server/internal/biz/shipment_process_command_test.go",
        "server/internal/service/jsonrpc_customer_config.go",
        "server/internal/biz/customer_config_test.go",
        "server/internal/service/jsonrpc_customer_config_test.go",
      ],
    },
    {
      id: "module-disabled-readonly-process-start-gate",
      status: "ready",
      category: "customer-config",
      description: "customer_config 新流程创建 / 启动入口会拒绝 referenced module 非 enabled 的 active revision",
      pass:
        sourceContains("server/internal/biz/customer_config.go", [
          "ensureCustomerConfigProcessModulesEnabledForStart",
          "processDefinitionReferencedModuleKeys",
          "defaultProcessReferencedModuleKeys",
          "moduleStates[moduleKey] != \"enabled\"",
        ]) &&
        sourceContains("server/internal/biz/customer_config_test.go", [
          "TestCustomerConfigUsecaseRejectsProcessStartWhenReferencedModuleNotEnabled",
          "referenced source module read only",
          "workflow module disabled",
          "referenced module missing",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config.go", [
          "start_sales_order_acceptance_process",
          "start_material_supply_process",
          "start_finished_goods_delivery_process",
          "BuildProcessInstanceCreateFromActiveCustomerConfig",
        ]),
      evidence: [
        "server/internal/biz/customer_config.go",
        "server/internal/biz/customer_config_test.go",
        "server/internal/service/jsonrpc_customer_config.go",
      ],
      notProven: [
        "effective session UI projection、sales order / purchase order / outsourcing order / material BOM / MasterData core / processes / purchase / quality / shipment / stock reservation / production / outsourcing fact / finance 以外的后端业务 API、打印已全部按 disabled/read_only 强制阻断",
      ],
    },
    {
      id: "module-disabled-readonly-effective-session-projection-gate",
      status: "ready",
      category: "customer-config",
      description: "customer_config effective session 会按 enabled module 收窄页面、动作、字段策略和责任池投影",
      pass:
        sourceContains("server/internal/biz/customer_config.go", [
          "enabledCustomerConfigModuleSet",
          "customerConfigActionAllowedByModules",
          "effectivePageKeysForEnabledModules",
          "effectiveFieldPoliciesFromSnapshotForEnabledModules",
          "customerConfigWorkPoolEnabledModuleSet",
        ]) &&
        sourceContains("server/internal/biz/customer_config_test.go", [
          "TestCustomerConfigUsecaseEffectiveSessionFiltersProjectionByEnabledModules",
          "module-owned sales page must be filtered",
          "module-owned sales actions must be filtered",
          "sales order field policy must be filtered",
        ]) &&
        sourceContains("docs/product/多甲方角色能力流程编排优先级.md", [
          "effective session 页面、动作、字段策略和责任池投影已按 enabled 模块收窄",
        ]) &&
        sourceContains("web/src/erp/utils/adminProfileSync.test.mjs", [
          "模块 disabled 后端投影隐藏业务页时正式账号需要跳转",
          "modules: { shipments: 'disabled' }",
          "currentPageKey: 'shipments'",
        ]),
      evidence: [
        "server/internal/biz/customer_config.go",
        "server/internal/biz/customer_config_test.go",
        "web/src/erp/utils/adminProfileSync.test.mjs",
        "docs/product/多甲方角色能力流程编排优先级.md",
      ],
      notProven: [
        "sales order / purchase order / outsourcing order / material BOM / MasterData core / processes / purchase / quality / shipment / stock reservation / production / outsourcing fact / finance 以外的后端业务 API、打印已全部按 disabled/read_only 强制阻断",
      ],
    },
    {
      id: "module-disabled-readonly-import-execute-gate",
      status: "ready",
      category: "import",
      description:
        "客户业务数据导入执行 loader 在生成 JSON-RPC 操作计划前要求 approval.moduleStates 声明目标模块为 enabled，拒绝 read_only / disabled 模块导入",
      pass:
        sourceContains("scripts/import/customerImportExecute.mjs", [
          "approval.moduleStates must declare enabled module states for import targets",
          "assertCandidateModuleStateAllowed",
          "targetModuleKeysForCandidate",
          "import execution requires enabled module",
        ]) &&
        sourceContains("scripts/import/customerImportExecute.test.mjs", [
          "buildExecutionPlan 要求 approval 声明目标模块状态",
          "buildExecutionPlan 按 moduleStates 阻止 read_only 模块导入",
          "module sales_orders is read_only; import execution requires enabled module",
        ]) &&
        sourceContains("scripts/import/fixtures/customers/yoyoosun/import-approval.sample.json", [
          "\"moduleStates\"",
          "\"sales_orders\": \"enabled\"",
        ]) &&
        sourceContains(priorityDoc, [
          "真实导入 execution loader 现在要求 approval.moduleStates",
          "customerImportExecute loader",
        ]),
      evidence: [
        "scripts/import/customerImportExecute.mjs",
        "scripts/import/customerImportExecute.test.mjs",
        "scripts/import/fixtures/customers/yoyoosun/import-approval.sample.json",
        priorityDoc,
      ],
      notProven: [
        "sales order / purchase order / outsourcing order / material BOM / MasterData core / processes / purchase / quality / shipment / stock reservation / production / outsourcing fact / finance 以外的后端业务 API、打印已全部按 disabled/read_only 强制阻断",
        "目标环境已经验证模块关闭前置检查和历史只读查询",
      ],
    },
    {
      id: "module-disabled-readonly-import-prep-no-execute-gate",
      status: "ready",
      category: "import",
      description:
        "customerImportExecute 以外的当前导入准备入口只做 source manifest check、source extract、freeze check 和 dry-run evidence，不提供真实执行入口、不连接数据库、不写正式表",
      pass:
        sourceContains("scripts/import/customerSourceManifestCheck.mjs", [
          "validates the tracked customer source inventory only",
          "never connects to a database",
          "canExecuteRealImport: false",
        ]) &&
        sourceContains("scripts/import/customerSourceExtract.mjs", [
          "import-prep evidence only",
          "never connects to a database",
          "canExecuteRealImport: false",
          "executesImport: false",
        ]) &&
        sourceContains("scripts/import/customerSourceSnapshotFreezeCheck.mjs", [
          "freezes evidence only",
          "never connects to a database",
          "canExecuteRealImport: false",
          "No real import",
        ]) &&
        sourceContains("scripts/import/customerImportDryRun.mjs", [
          "performs dry-run analysis only",
          "never connects to a database",
          "canExecuteRealImport: false",
        ]) &&
        sourceExcludes("scripts/import/customerSourceManifestCheck.mjs", [
          "--execute",
          "fetch(",
          "axios",
          "http.request",
          "https.request",
          "JsonRpc",
          "adminRpc",
        ]) &&
        sourceExcludes("scripts/import/customerSourceExtract.mjs", [
          "--execute",
          "fetch(",
          "axios",
          "http.request",
          "https.request",
          "JsonRpc",
          "adminRpc",
        ]) &&
        sourceExcludes("scripts/import/customerSourceSnapshotFreezeCheck.mjs", [
          "--execute",
          "fetch(",
          "axios",
          "http.request",
          "https.request",
          "JsonRpc",
          "adminRpc",
        ]) &&
        sourceExcludes("scripts/import/customerImportDryRun.mjs", [
          "--execute",
          "fetch(",
          "axios",
          "http.request",
          "https.request",
          "JsonRpc",
          "adminRpc",
        ]) &&
        sourceContains("scripts/import/customerSourceManifestCheck.test.mjs", [
          "canExecuteRealImport",
          "false",
        ]) &&
        sourceContains("scripts/import/customerSourceExtract.test.mjs", [
          "canExecuteRealImport",
          "noRealImport",
          "executesImport",
          "false",
        ]) &&
        sourceContains("scripts/import/customerSourceSnapshotFreezeCheck.test.mjs", [
          "freeze-must-not-connect.invalid",
          "canExecuteRealImport",
          "No real import",
        ]) &&
        sourceContains("scripts/import/customerImportDryRun.test.mjs", [
          "dry-run-must-not-connect.invalid",
          "canExecuteRealImport",
          "No real import",
        ]) &&
        sourceContains(priorityDoc, [
          "customerSourceManifestCheck",
          "customerSourceExtract",
          "customerSourceSnapshotFreezeCheck",
          "customerImportDryRun",
          "no-real-import",
        ]),
      evidence: [
        "scripts/import/customerSourceManifestCheck.mjs",
        "scripts/import/customerSourceExtract.mjs",
        "scripts/import/customerSourceSnapshotFreezeCheck.mjs",
        "scripts/import/customerImportDryRun.mjs",
        "scripts/import/customerSourceManifestCheck.test.mjs",
        "scripts/import/customerSourceExtract.test.mjs",
        "scripts/import/customerSourceSnapshotFreezeCheck.test.mjs",
        "scripts/import/customerImportDryRun.test.mjs",
        priorityDoc,
      ],
      notProven: [
        "打印已全部按 disabled/read_only 强制阻断",
        "目标环境已经验证模块关闭前置检查和历史只读查询",
        "真实客户数据导入已获批准或已执行",
      ],
    },
    {
      id: "module-disabled-readonly-customer-config-execute-gate",
      status: "ready",
      category: "customer-config",
      description:
        "customer_config 显式流程 execute API 在执行 domain command 前按 active module states 拒绝 read_only / disabled / 缺失模块，避免显式流程命令绕过模块状态",
      pass:
        sourceContains("server/internal/biz/customer_config.go", [
          "EnsureProcessDomainCommandModulesEnabled",
          "processDomainCommandReferencedModuleKeys",
          "ProcessDomainCommandSalesOrderSubmit",
          "ProcessDomainCommandShipmentShip",
          "moduleStates[moduleKey] != \"enabled\"",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config.go", [
          "requireCustomerConfigDomainCommandModulesEnabled",
          "EnsureProcessDomainCommandModulesEnabled",
          "execute_sales_order_acceptance_submit",
          "execute_finished_goods_delivery_shipment_ship",
          "execute_material_supply_post_inbound",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config_test.go", [
          "TestCustomerConfigJSONRPCExecuteSalesOrderAcceptanceSubmitRequiresEnabledModules",
          "TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryShipmentShipRequiresEnabledModules",
          "sales order usecase should not be called when module is read_only",
          "shipment usecase should not be called when module is disabled",
        ]) &&
        sourceContains(priorityDoc, [
          "customer_config 显式流程 execute API",
          "EnsureProcessDomainCommandModulesEnabled",
        ]) &&
        sourceContains(currentTruthDoc, [
          "customer_config 显式流程 execute API",
          "read_only / disabled / 缺失",
        ]),
      evidence: [
        "server/internal/biz/customer_config.go",
        "server/internal/service/jsonrpc_customer_config.go",
        "server/internal/service/jsonrpc_customer_config_test.go",
        priorityDoc,
        currentTruthDoc,
      ],
      notProven: [
        "customer_config、sales order 销售订单写 API、purchase order 采购订单写 API、outsourcing order 委外订单写 API、material BOM 工程资料写 API、MasterData 基础档案写 API、processes 加工环节主数据写 API、purchase 采购入库写 API、quality 质检写 API、shipment 出货写 API、stock reservation 库存预留写 API、production 生产事实写 API、outsourcing fact 委外事实写 API 和 finance 财务写 API 以外的普通后端业务 API 已全部按 disabled/read_only 强制阻断",
        "打印已全部按 disabled/read_only 强制阻断",
        "目标环境已经验证模块关闭前置检查和历史只读查询",
      ],
    },
    {
      id: "module-disabled-readonly-sales-order-api-gate",
      status: "ready",
      category: "sales",
      description:
        "sales order 销售订单普通 JSON-RPC 写 API 已按 active module states 拒绝 sales_orders 非 enabled，历史 get/list 读取仍保留",
      pass:
        sourceContains("server/internal/biz/customer_config.go", [
          "EnsureModuleKeysEnabled",
          "ensureCustomerConfigModuleKeysEnabled",
          "moduleStates[moduleKey] != \"enabled\"",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config.go", [
          "requireCustomerConfigModulesEnabled",
          "EnsureModuleKeysEnabled",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_sales_order_document.go", [
          "requireCustomerConfigModulesEnabled",
          "\"sales_orders\"",
          "CreateSalesOrder",
          "UpdateSalesOrder",
          "SaveSalesOrderWithItems",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_sales_order_lifecycle.go", [
          "requireCustomerConfigModulesEnabled",
          "\"sales_orders\"",
          "SubmitSalesOrder",
          "CancelSalesOrder",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_sales_order_item.go", [
          "requireCustomerConfigModulesEnabled",
          "\"sales_orders\"",
          "AddSalesOrderItem",
          "RemoveSalesOrderItem",
          "list_sales_order_items",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_masterdata_order_test.go", [
          "TestJsonrpcDispatcher_SalesOrderAPIRequiresEnabledModule",
          "sales_orders",
          "read_only",
          "disabled",
          "list_sales_orders",
          "list_sales_order_items",
        ]) &&
        sourceContains(priorityDoc, [
          "sales order 销售订单写 API",
          "历史读取继续保留",
        ]) &&
        sourceContains(currentTruthDoc, [
          "sales order 销售订单写 API",
          "历史 get/list 查询",
        ]),
      evidence: [
        "server/internal/biz/customer_config.go",
        "server/internal/service/jsonrpc_customer_config.go",
        "server/internal/service/jsonrpc_sales_order_document.go",
        "server/internal/service/jsonrpc_sales_order_lifecycle.go",
        "server/internal/service/jsonrpc_sales_order_item.go",
        "server/internal/service/jsonrpc_masterdata_order_test.go",
        priorityDoc,
        currentTruthDoc,
      ],
      notProven: [
        "sales order / purchase order / outsourcing order / material BOM / MasterData core / processes / purchase / quality / shipment / stock reservation / production / outsourcing fact / finance 以外的普通后端业务 API 已全部按 disabled/read_only 强制阻断",
        "打印已全部按 disabled/read_only 强制阻断",
        "目标环境已经验证模块关闭前置检查和历史只读查询",
      ],
    },
    {
      id: "module-disabled-readonly-purchase-order-api-gate",
      status: "ready",
      category: "purchase",
      description:
        "purchase order 采购订单普通 JSON-RPC 写 API 已按 active module states 拒绝 purchase_orders 非 enabled，历史 get/list 读取仍保留",
      pass:
        sourceContains("server/internal/biz/customer_config.go", [
          "EnsureModuleKeysEnabled",
          "ensureCustomerConfigModuleKeysEnabled",
          "moduleStates[moduleKey] != \"enabled\"",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config.go", [
          "requireCustomerConfigModulesEnabled",
          "EnsureModuleKeysEnabled",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_purchase_order_document.go", [
          "requireCustomerConfigModulesEnabled",
          "\"purchase_orders\"",
          "CreatePurchaseOrder",
          "UpdatePurchaseOrder",
          "SavePurchaseOrderWithItems",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_purchase_order_lifecycle.go", [
          "requireCustomerConfigModulesEnabled",
          "\"purchase_orders\"",
          "SubmitPurchaseOrder",
          "ApprovePurchaseOrder",
          "CancelPurchaseOrder",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_purchase_order_item.go", [
          "requireCustomerConfigModulesEnabled",
          "\"purchase_orders\"",
          "AddPurchaseOrderItem",
          "RemovePurchaseOrderItem",
          "list_purchase_order_items",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_purchase_order_test.go", [
          "TestJsonrpcDispatcher_PurchaseOrderAPIRequiresEnabledModule",
          "purchase_orders",
          "read_only",
          "disabled",
          "list_purchase_orders",
          "list_purchase_order_items",
        ]) &&
        sourceContains(priorityDoc, [
          "purchase order 采购订单写 API",
          "历史读取继续保留",
        ]) &&
        sourceContains(currentTruthDoc, [
          "purchase order 采购订单写 API",
          "历史 get/list 查询",
        ]),
      evidence: [
        "server/internal/biz/customer_config.go",
        "server/internal/service/jsonrpc_customer_config.go",
        "server/internal/service/jsonrpc_purchase_order_document.go",
        "server/internal/service/jsonrpc_purchase_order_lifecycle.go",
        "server/internal/service/jsonrpc_purchase_order_item.go",
        "server/internal/service/jsonrpc_purchase_order_test.go",
        priorityDoc,
        currentTruthDoc,
      ],
      notProven: [
        "sales order / purchase order / outsourcing order / material BOM / MasterData core / processes / purchase / quality / shipment / stock reservation / production / outsourcing fact / finance 以外的普通后端业务 API 已全部按 disabled/read_only 强制阻断",
        "打印已全部按 disabled/read_only 强制阻断",
        "目标环境已经验证模块关闭前置检查和历史只读查询",
      ],
    },
    {
      id: "module-disabled-readonly-outsourcing-order-api-gate",
      status: "ready",
      category: "outsourcing",
      description:
        "outsourcing order 委外订单普通 JSON-RPC 写 API 已按 active module states 拒绝 outsourcing_orders 非 enabled，历史 get/list 读取仍保留",
      pass:
        sourceContains("server/internal/biz/customer_config.go", [
          "EnsureModuleKeysEnabled",
          "ensureCustomerConfigModuleKeysEnabled",
          "moduleStates[moduleKey] != \"enabled\"",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config.go", [
          "requireCustomerConfigModulesEnabled",
          "EnsureModuleKeysEnabled",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_outsourcing_order_document.go", [
          "requireCustomerConfigModulesEnabled",
          "\"outsourcing_orders\"",
          "SaveOutsourcingOrderWithItems",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_outsourcing_order_lifecycle.go", [
          "requireCustomerConfigModulesEnabled",
          "\"outsourcing_orders\"",
          "SubmitOutsourcingOrder",
          "ConfirmOutsourcingOrder",
          "CancelOutsourcingOrder",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_outsourcing_order_item.go", [
          "list_outsourcing_order_items",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_outsourcing_order_test.go", [
          "TestJsonrpcDispatcher_OutsourcingOrderAPIRequiresEnabledModule",
          "outsourcing_orders",
          "read_only",
          "disabled",
          "list_outsourcing_orders",
          "list_outsourcing_order_items",
        ]) &&
        sourceContains(priorityDoc, [
          "outsourcing order 委外订单写 API",
          "历史读取继续保留",
        ]) &&
        sourceContains(currentTruthDoc, [
          "outsourcing order 委外订单写 API",
          "历史 get/list 查询",
        ]),
      evidence: [
        "server/internal/biz/customer_config.go",
        "server/internal/service/jsonrpc_customer_config.go",
        "server/internal/service/jsonrpc_outsourcing_order_document.go",
        "server/internal/service/jsonrpc_outsourcing_order_lifecycle.go",
        "server/internal/service/jsonrpc_outsourcing_order_item.go",
        "server/internal/service/jsonrpc_outsourcing_order_test.go",
        priorityDoc,
        currentTruthDoc,
      ],
      notProven: [
        "sales order / purchase order / outsourcing order / material BOM / MasterData core / processes / purchase / quality / shipment / stock reservation / production / outsourcing fact / finance 以外的普通后端业务 API 已全部按 disabled/read_only 强制阻断",
        "打印已全部按 disabled/read_only 强制阻断",
        "目标环境已经验证模块关闭前置检查和历史只读查询",
      ],
    },
    {
      id: "module-disabled-readonly-material-bom-api-gate",
      status: "ready",
      category: "bom",
      description:
        "material BOM 工程资料普通 JSON-RPC 写 API 已按 active module states 拒绝 material_bom 非 enabled，历史 get/list 读取仍保留",
      pass:
        sourceContains("server/internal/biz/customer_config.go", [
          "EnsureModuleKeysEnabled",
          "ensureCustomerConfigModuleKeysEnabled",
          "moduleStates[moduleKey] != \"enabled\"",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config.go", [
          "requireCustomerConfigModulesEnabled",
          "EnsureModuleKeysEnabled",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_bom_version.go", [
          "requireCustomerConfigModulesEnabled",
          "bomModuleKeyMaterialBOM",
          "CreateBOMHeader",
          "UpdateBOMDraftHeader",
          "CopyBOMVersion",
          "ActivateBOMVersion",
          "ArchiveBOMVersion",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_bom_item.go", [
          "requireCustomerConfigModulesEnabled",
          "bomModuleKeyMaterialBOM",
          "CreateBOMItem",
          "UpdateBOMDraftItem",
          "DeleteBOMDraftItem",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_bom_test.go", [
          "TestJsonrpcDispatcher_BOMAPIRequiresEnabledModule",
          "material_bom",
          "read_only",
          "disabled",
          "list_bom_versions",
          "get_bom_version",
        ]) &&
        sourceContains(priorityDoc, [
          "material BOM 工程资料写 API",
          "历史读取继续保留",
        ]) &&
        sourceContains(currentTruthDoc, [
          "material BOM 工程资料写 API",
          "历史 get/list 查询",
        ]),
      evidence: [
        "server/internal/biz/customer_config.go",
        "server/internal/service/jsonrpc_customer_config.go",
        "server/internal/service/jsonrpc_bom_version.go",
        "server/internal/service/jsonrpc_bom_item.go",
        "server/internal/service/jsonrpc_bom_test.go",
        priorityDoc,
        currentTruthDoc,
      ],
      notProven: [
        "sales order / purchase order / outsourcing order / material BOM / MasterData core / processes / purchase / quality / shipment / stock reservation / production / outsourcing fact / finance 以外的普通后端业务 API 已全部按 disabled/read_only 强制阻断",
        "打印已全部按 disabled/read_only 强制阻断",
        "目标环境已经验证模块关闭前置检查和历史只读查询",
      ],
    },
    {
      id: "module-disabled-readonly-masterdata-core-api-gate",
      status: "ready",
      category: "masterdata",
      description:
        "MasterData 客户、供应商、联系人、材料、产品和 SKU 写 API 已按 active module states 拒绝对应模块非 enabled，历史 get/list 读取仍保留",
      pass:
        sourceContains("server/internal/biz/customer_config.go", [
          "EnsureModuleKeysEnabled",
          "ensureCustomerConfigModuleKeysEnabled",
          "moduleStates[moduleKey] != \"enabled\"",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config.go", [
          "requireCustomerConfigModulesEnabled",
          "EnsureModuleKeysEnabled",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_masterdata_modules.go", [
          "masterDataModuleKeyCustomers",
          "masterDataModuleKeySuppliers",
          "masterDataModuleKeyMaterials",
          "masterDataModuleKeyProducts",
          "masterDataContactOwnerModuleKey",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_masterdata_customer.go", [
          "requireCustomerConfigModulesEnabled",
          "masterDataModuleKeyCustomers",
          "SaveCustomerWithContacts",
          "CreateCustomer",
          "UpdateCustomer",
          "SetCustomerActive",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_masterdata_supplier.go", [
          "requireCustomerConfigModulesEnabled",
          "masterDataModuleKeySuppliers",
          "SaveSupplierWithContacts",
          "CreateSupplier",
          "UpdateSupplier",
          "SetSupplierActive",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_masterdata_material.go", [
          "requireCustomerConfigModulesEnabled",
          "masterDataModuleKeyMaterials",
          "CreateMaterial",
          "UpdateMaterial",
          "SetMaterialActive",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_masterdata_product.go", [
          "requireCustomerConfigModulesEnabled",
          "masterDataModuleKeyProducts",
          "CreateProduct",
          "UpdateProduct",
          "SetProductActive",
          "CreateProductSKU",
          "UpdateProductSKU",
          "SetProductSKUActive",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_masterdata_contact.go", [
          "requireContactOwnerModuleEnabled",
          "requireExistingContactOwnerModuleEnabled",
          "CreateContact",
          "UpdateContact",
          "SetPrimaryContact",
          "DisableContact",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_masterdata_order_test.go", [
          "TestJsonrpcDispatcher_MasterDataCoreAPIRequiresEnabledModules",
          "customers",
          "suppliers",
          "materials",
          "products",
          "read_only",
          "disabled",
          "list_customers",
          "list_contacts_by_owner",
        ]) &&
        sourceContains(priorityDoc, [
          "MasterData 基础档案写 API",
          "owner_type",
          "customers=enabled",
          "products=enabled",
          "历史读取继续保留",
        ]) &&
        sourceContains(currentTruthDoc, [
          "MasterData 基础档案写 API",
          "owner_type",
          "customers=enabled",
          "products=enabled",
          "历史 get/list 查询",
        ]),
      evidence: [
        "server/internal/biz/customer_config.go",
        "server/internal/service/jsonrpc_customer_config.go",
        "server/internal/service/jsonrpc_masterdata_modules.go",
        "server/internal/service/jsonrpc_masterdata_customer.go",
        "server/internal/service/jsonrpc_masterdata_supplier.go",
        "server/internal/service/jsonrpc_masterdata_contact.go",
        "server/internal/service/jsonrpc_masterdata_material.go",
        "server/internal/service/jsonrpc_masterdata_product.go",
        "server/internal/service/jsonrpc_masterdata_order_test.go",
        priorityDoc,
        currentTruthDoc,
      ],
      notProven: [
        "sales order / purchase order / outsourcing order / material BOM / MasterData 基础档案 / processes / purchase / quality / shipment / stock reservation / production / outsourcing fact / finance 以外的普通后端业务 API 已全部按 disabled/read_only 强制阻断",
        "打印已全部按 disabled/read_only 强制阻断",
        "目标环境已经验证模块关闭前置检查和历史只读查询",
      ],
    },
    {
      id: "module-disabled-readonly-process-masterdata-api-gate",
      status: "ready",
      category: "masterdata",
      description:
        "processes 加工环节主数据普通 JSON-RPC 写 API 已按 active module states 拒绝 processes 非 enabled，历史 get/list 读取仍保留",
      pass:
        sourceContains("server/internal/biz/customer_config.go", [
          "EnsureModuleKeysEnabled",
          "ensureCustomerConfigModuleKeysEnabled",
          "moduleStates[moduleKey] != \"enabled\"",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config.go", [
          "requireCustomerConfigModulesEnabled",
          "EnsureModuleKeysEnabled",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_masterdata_process.go", [
          "requireCustomerConfigModulesEnabled",
          "masterDataModuleKeyProcesses",
          "CreateProcess",
          "UpdateProcess",
          "SetProcessActive",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_masterdata_order_test.go", [
          "TestJsonrpcDispatcher_ProcessAPIRequiresEnabledModule",
          "processes",
          "read_only",
          "disabled",
          "list_processes",
          "get_process",
        ]) &&
        sourceContains(priorityDoc, [
          "processes 加工环节主数据写 API",
          "历史读取继续保留",
        ]) &&
        sourceContains(currentTruthDoc, [
          "processes 加工环节主数据写 API",
          "历史 get/list 查询",
        ]),
      evidence: [
        "server/internal/biz/customer_config.go",
        "server/internal/service/jsonrpc_customer_config.go",
        "server/internal/service/jsonrpc_masterdata_process.go",
        "server/internal/service/jsonrpc_masterdata_order_test.go",
        priorityDoc,
        currentTruthDoc,
      ],
      notProven: [
        "sales order / purchase order / outsourcing order / material BOM / MasterData core / processes / purchase / quality / shipment / stock reservation / production / outsourcing fact / finance 以外的普通后端业务 API 已全部按 disabled/read_only 强制阻断",
        "打印已全部按 disabled/read_only 强制阻断",
        "目标环境已经验证模块关闭前置检查和历史只读查询",
      ],
    },
    {
      id: "module-disabled-readonly-purchase-api-gate",
      status: "ready",
      category: "purchase",
      description:
        "purchase 采购入库普通 JSON-RPC 写 API 已按 active module states 拒绝 purchase_receipts / purchase_orders / inventory 非 enabled，历史 get/list 读取仍保留",
      pass:
        sourceContains("server/internal/biz/customer_config.go", [
          "EnsureModuleKeysEnabled",
          "ensureCustomerConfigModuleKeysEnabled",
          "moduleStates[moduleKey] != \"enabled\"",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config.go", [
          "requireCustomerConfigModulesEnabled",
          "EnsureModuleKeysEnabled",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_purchase_receipt.go", [
          "requireCustomerConfigModulesEnabled",
          "\"purchase_receipts\"",
          "\"purchase_orders\"",
          "\"inventory\"",
          "PostPurchaseReceipt",
          "CancelPostedPurchaseReceipt",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_purchase_test.go", [
          "TestJsonrpcDispatcher_PurchaseReceiptAPIRequiresEnabledModules",
          "purchase_receipts",
          "inventory",
          "read_only",
          "get_purchase_receipt",
        ]) &&
        sourceContains(priorityDoc, [
          "purchase 采购入库写 API",
          "历史读取继续保留",
        ]) &&
        sourceContains(currentTruthDoc, [
          "purchase 采购入库写 API",
          "历史 get/list 查询",
        ]),
      evidence: [
        "server/internal/biz/customer_config.go",
        "server/internal/service/jsonrpc_customer_config.go",
        "server/internal/service/jsonrpc_purchase_receipt.go",
        "server/internal/service/jsonrpc_purchase_test.go",
        priorityDoc,
        currentTruthDoc,
      ],
      notProven: [
        "sales order / purchase order / outsourcing order / material BOM / MasterData core / processes / purchase / quality / shipment / stock reservation / production / outsourcing fact / finance 以外的普通后端业务 API 已全部按 disabled/read_only 强制阻断",
        "打印已全部按 disabled/read_only 强制阻断",
        "目标环境已经验证模块关闭前置检查和历史只读查询",
      ],
    },
    {
      id: "module-disabled-readonly-quality-api-gate",
      status: "ready",
      category: "quality",
      description:
        "quality 质检普通 JSON-RPC 写 API 已按 active module states 拒绝 quality_inspections 非 enabled，历史 get/list 读取仍保留",
      pass:
        sourceContains("server/internal/biz/customer_config.go", [
          "EnsureModuleKeysEnabled",
          "ensureCustomerConfigModuleKeysEnabled",
          "moduleStates[moduleKey] != \"enabled\"",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config.go", [
          "requireCustomerConfigModulesEnabled",
          "EnsureModuleKeysEnabled",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_quality.go", [
          "requireCustomerConfigModulesEnabled",
          "\"quality_inspections\"",
          "CreateQualityInspectionDraft",
          "CreateFinishedGoodsQualityInspectionDraft",
          "SubmitQualityInspection",
          "PassQualityInspection",
          "RejectQualityInspection",
          "CancelQualityInspection",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_quality_test.go", [
          "TestJsonrpcDispatcher_QualityInspectionAPIRequiresEnabledModules",
          "quality_inspections",
          "read_only",
          "get_quality_inspection",
        ]) &&
        sourceContains(priorityDoc, [
          "quality 质检写 API",
          "历史读取继续保留",
        ]) &&
        sourceContains(currentTruthDoc, [
          "quality 质检写 API",
          "历史 get/list 查询",
        ]),
      evidence: [
        "server/internal/biz/customer_config.go",
        "server/internal/service/jsonrpc_customer_config.go",
        "server/internal/service/jsonrpc_quality.go",
        "server/internal/service/jsonrpc_quality_test.go",
        priorityDoc,
        currentTruthDoc,
      ],
      notProven: [
        "sales order / purchase order / outsourcing order / material BOM / MasterData core / processes / purchase / quality / shipment / stock reservation / production / outsourcing fact / finance 以外的普通后端业务 API 已全部按 disabled/read_only 强制阻断",
        "打印已全部按 disabled/read_only 强制阻断",
        "目标环境已经验证模块关闭前置检查和历史只读查询",
      ],
    },
    {
      id: "module-disabled-readonly-shipment-api-gate",
      status: "ready",
      category: "shipment",
      description:
        "shipment 出货普通 JSON-RPC 写 API 已按 active module states 拒绝 shipments 或 inventory 非 enabled，历史 list 读取仍保留",
      pass:
        sourceContains("server/internal/biz/customer_config.go", [
          "EnsureModuleKeysEnabled",
          "ensureCustomerConfigModuleKeysEnabled",
          "moduleStates[moduleKey] != \"enabled\"",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config.go", [
          "requireCustomerConfigModulesEnabled",
          "EnsureModuleKeysEnabled",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_operational_fact_shipment.go", [
          "requireCustomerConfigModulesEnabled",
          "\"shipments\"",
          "\"inventory\"",
          "CreateShipmentDraft",
          "CreateShipmentDraftWithItems",
          "AddShipmentItem",
          "ShipShipment",
          "CancelShippedShipment",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_operational_fact_test.go", [
          "TestJsonrpcDispatcher_ShipmentAPIRequiresEnabledModules",
          "shipments",
          "inventory",
          "read_only",
          "list_shipments",
        ]) &&
        sourceContains(priorityDoc, [
          "shipment 出货写 API",
          "历史读取继续保留",
        ]) &&
        sourceContains(currentTruthDoc, [
          "shipment 出货写 API",
          "历史 list 查询",
        ]),
      evidence: [
        "server/internal/biz/customer_config.go",
        "server/internal/service/jsonrpc_customer_config.go",
        "server/internal/service/jsonrpc_operational_fact_shipment.go",
        "server/internal/service/jsonrpc_operational_fact_test.go",
        priorityDoc,
        currentTruthDoc,
      ],
      notProven: [
        "sales order / purchase order / outsourcing order / material BOM / MasterData core / processes / purchase / quality / shipment / stock reservation / production / outsourcing fact / finance 以外的普通后端业务 API 已全部按 disabled/read_only 强制阻断",
        "打印已全部按 disabled/read_only 强制阻断",
        "目标环境已经验证模块关闭前置检查和历史只读查询",
      ],
    },
    {
      id: "module-disabled-readonly-finance-api-gate",
      status: "ready",
      category: "finance",
      description:
        "finance 财务普通 JSON-RPC 写 API 已按 active module states 拒绝 finance 非 enabled，历史 list 读取仍保留",
      pass:
        sourceContains("server/internal/biz/customer_config.go", [
          "EnsureModuleKeysEnabled",
          "ensureCustomerConfigModuleKeysEnabled",
          "moduleStates[moduleKey] != \"enabled\"",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config.go", [
          "requireCustomerConfigModulesEnabled",
          "EnsureModuleKeysEnabled",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_operational_fact_finance.go", [
          "requireCustomerConfigModulesEnabled",
          "\"finance\"",
          "CreateFinanceFactDraft",
          "PostFinanceFact",
          "SettleFinanceFact",
          "CancelPostedFinanceFact",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_operational_fact_test.go", [
          "TestJsonrpcDispatcher_FinanceFactAPIRequiresEnabledModule",
          "finance",
          "read_only",
          "disabled",
          "list_finance_facts",
        ]) &&
        sourceContains(priorityDoc, [
          "finance 财务写 API",
          "历史读取继续保留",
        ]) &&
        sourceContains(currentTruthDoc, [
          "finance 财务写 API",
          "历史 list 查询",
        ]),
      evidence: [
        "server/internal/biz/customer_config.go",
        "server/internal/service/jsonrpc_customer_config.go",
        "server/internal/service/jsonrpc_operational_fact_finance.go",
        "server/internal/service/jsonrpc_operational_fact_test.go",
        priorityDoc,
        currentTruthDoc,
      ],
      notProven: [
        "sales order / purchase order / outsourcing order / material BOM / MasterData core / processes / purchase / quality / shipment / stock reservation / production / outsourcing fact / finance 以外的普通后端业务 API 已全部按 disabled/read_only 强制阻断",
        "打印已全部按 disabled/read_only 强制阻断",
        "目标环境已经验证模块关闭前置检查和历史只读查询",
      ],
    },
    {
      id: "module-disabled-readonly-attachment-api-gate",
      status: "ready",
      category: "attachment",
      description:
        "attachment 证据写 JSON-RPC API 已按 owner_type 所属 active module states 拒绝非 enabled 模块，历史 list/download 读取仍保留",
      pass:
        sourceContains("server/internal/biz/customer_config.go", [
          "EnsureModuleKeysEnabled",
          "ensureCustomerConfigModuleKeysEnabled",
          "moduleStates[moduleKey] != \"enabled\"",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config.go", [
          "requireCustomerConfigModulesEnabled",
          "EnsureModuleKeysEnabled",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_attachment.go", [
          "requireBusinessAttachmentOwnerModuleEnabled",
          "businessAttachmentOwnerModuleKeys",
          "upload_attachment",
          "delete_attachment",
          "sales_orders",
          "purchase_orders",
          "outsourcing_orders",
          "purchase_receipts",
          "quality_inspections",
          "shipments",
          "finance",
          "production",
          "products",
          "material_bom",
          "workflow_tasks",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_attachment_test.go", [
          "TestJsonrpcDispatcher_AttachmentWriteAPIRequiresOwnerModuleEnabled",
          "TestBusinessAttachmentOwnerModuleKeys",
          "read_only",
          "disabled",
          "upload_attachment",
          "delete_attachment",
          "list_attachments",
          "download_attachment",
        ]) &&
        sourceContains(priorityDoc, [
          "attachment 证据写 API",
          "历史读取继续保留",
        ]) &&
        sourceContains(currentTruthDoc, [
          "attachment 证据写 API",
          "历史 list/download 查询",
        ]),
      evidence: [
        "server/internal/biz/customer_config.go",
        "server/internal/service/jsonrpc_customer_config.go",
        "server/internal/service/jsonrpc_attachment.go",
        "server/internal/service/jsonrpc_attachment_test.go",
        priorityDoc,
        currentTruthDoc,
      ],
      notProven: [
        "sales order / purchase order / outsourcing order / material BOM / MasterData core / processes / purchase / quality / shipment / stock reservation / production / outsourcing fact / finance / attachment 以外的普通后端业务 API 已全部按 disabled/read_only 强制阻断",
        "打印已全部按 disabled/read_only 强制阻断",
        "目标环境已经验证模块关闭前置检查和历史只读查询",
      ],
    },
    {
      id: "module-disabled-readonly-workflow-api-gate",
      status: "ready",
      category: "workflow",
      description:
        "workflow 写 JSON-RPC API 已按 active module states 拒绝 workflow_tasks 非 enabled，历史 list/explain/metadata 读取仍保留",
      pass:
        sourceContains("server/internal/biz/customer_config.go", [
          "EnsureModuleKeysEnabled",
          "ensureCustomerConfigModuleKeysEnabled",
          "moduleStates[moduleKey] != \"enabled\"",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config.go", [
          "requireCustomerConfigModulesEnabled",
          "EnsureModuleKeysEnabled",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_workflow.go", [
          "workflowMethodRequiresEnabledModule",
          "workflowModuleKeyTasks",
          "create_task",
          "complete_task_action",
          "block_task_action",
          "reject_task_action",
          "urge_task",
          "upsert_business_state",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_workflow_test.go", [
          "TestJsonrpcDispatcher_WorkflowWriteAPIRequiresEnabledModule",
          "workflow_tasks",
          "read_only",
          "disabled",
          "create_task",
          "complete_task_action",
          "upsert_business_state",
          "urge_task",
          "list_tasks",
        ]) &&
        sourceContains(priorityDoc, [
          "workflow 写 API",
          "历史 list/explain/metadata 查询",
        ]) &&
        sourceContains(currentTruthDoc, [
          "workflow 写 API",
          "历史 list/explain/metadata 查询",
        ]),
      evidence: [
        "server/internal/biz/customer_config.go",
        "server/internal/service/jsonrpc_customer_config.go",
        "server/internal/service/jsonrpc_workflow.go",
        "server/internal/service/jsonrpc_workflow_test.go",
        priorityDoc,
        currentTruthDoc,
      ],
      notProven: [
        "sales order / purchase order / outsourcing order / material BOM / MasterData core / processes / purchase / quality / shipment / stock reservation / production / outsourcing fact / finance / attachment / workflow 以外的普通后端业务 API 已全部按 disabled/read_only 强制阻断",
        "打印已全部按 disabled/read_only 强制阻断",
        "目标环境已经验证模块关闭前置检查和历史只读查询",
      ],
    },
    {
      id: "module-disabled-readonly-print-api-gate",
      status: "ready",
      category: "print",
      description:
        "模板 PDF 打印入口已按 template_key 所属 active module states 拒绝非 enabled 模块，当前覆盖合同和工程资料正式 PDF 模板",
      pass:
        sourceContains("server/internal/server/http.go", [
          "customerConfigUC *biz.CustomerConfigUsecase",
          "registerTemplatePDFHandler",
          "customerConfigUC",
        ]) &&
        sourceContains("server/internal/server/template_pdf.go", [
          "templatePDFModuleGuard",
          "enforceTemplatePDFModulesEnabled",
          "templatePDFReferencedModuleKeys",
          "material-purchase-contract",
          "purchase_orders",
          "processing-contract",
          "outsourcing_orders",
          "engineering-work-instruction",
          "material_bom",
          "EnsureModuleKeysEnabled",
          "当前客户配置未启用该打印模板所属模块",
        ]) &&
        sourceContains("server/internal/server/template_pdf_test.go", [
          "TestTemplatePDFReferencedModuleKeys",
          "TestEnforceTemplatePDFModulesEnabled",
          "material-purchase-contract",
          "purchase_orders",
          "processing-contract",
          "outsourcing_orders",
          "ErrBadParam",
        ]) &&
        sourceContains("server/cmd/server/wire_gen.go", [
          "customerConfigUsecase",
          "server.NewHTTPServer",
        ]) &&
        sourceContains(priorityDoc, [
          "打印 PDF 入口",
          "material-purchase-contract",
          "processing-contract",
        ]) &&
        sourceContains(currentTruthDoc, [
          "打印 PDF 入口",
          "material-purchase-contract",
          "processing-contract",
        ]),
      evidence: [
        "server/internal/server/http.go",
        "server/internal/server/template_pdf.go",
        "server/internal/server/template_pdf_test.go",
        "server/cmd/server/wire_gen.go",
        priorityDoc,
        currentTruthDoc,
      ],
      notProven: [
        "其它普通后端业务 API 已全部按 disabled/read_only 强制阻断",
        "目标环境已经验证模块关闭前置检查和历史只读查询",
      ],
    },
    {
      id: "module-disabled-readonly-no-active-business-scheduler-gate",
      status: "ready",
      category: "scheduler",
      description:
        "当前服务端 runtime 未发现 active business scheduler / timer 写入口；现有后台任务只限 server bootstrap、PDF warmup/Chrome 等待和 taskgroup 生命周期工具，不执行业务模块写入",
      pass:
        businessSchedulerFindings.length === 0 &&
        sourceContains("server/cmd/server/main.go", [
          "StartTemplatePDFWarmupAsync",
          "taskgroup.Init",
        ]) &&
        sourceContains("server/internal/server/template_pdf.go", [
          "StartTemplatePDFWarmupAsync",
          "warmupTemplatePDFResources",
          "waitTemplatePDFChromeWSURL",
          "time.NewTicker",
        ]) &&
        sourceContains("server/pkg/taskgroup/default.go", [
          "Init",
          "Go",
          "Stop",
        ]) &&
        sourceContains(priorityDoc, [
          "active business scheduler",
          "PDF warmup",
          "taskgroup",
        ]) &&
        sourceContains(currentTruthDoc, [
          "active business scheduler",
          "PDF warmup",
          "taskgroup",
        ]),
      evidence: [
        "server/cmd/server/main.go",
        "server/internal/server/template_pdf.go",
        "server/pkg/taskgroup/default.go",
        "scripts/qa/multi-client-role-workflow-priority-audit.mjs",
        priorityDoc,
        currentTruthDoc,
      ],
      scanFindings: businessSchedulerFindings,
      notProven: [
        "其它普通后端业务 API 已全部按 disabled/read_only 强制阻断",
        "目标环境已经验证模块关闭前置检查和历史只读查询",
      ],
    },
    {
      id: "module-disabled-readonly-jsonrpc-write-inventory-gate",
      status: "ready",
      category: "customer-config",
      description:
        "普通 JSON-RPC 写入口静态 inventory 已收口：聚合 dispatcher 委托到已有门禁子 handler，debug/admin 控制面不计入普通业务 API，workflow 子 handler 由父 handler 统一门禁",
      pass:
        jsonrpcWriteInventoryFindings.length === 0 &&
        sourceContains("scripts/qa/multi-client-role-workflow-priority-audit.mjs", [
          "jsonrpcWriteMethodInventoryFindings",
          "aggregateDispatchers",
          "nonOrdinaryBusinessFiles",
          "parentGatedFiles",
          "workflowParentGateReady",
        ]) &&
        sourceContains(priorityDoc, [
          "普通 JSON-RPC 写入口 inventory",
          "debug/admin/system 控制面不计入普通业务 API",
        ]) &&
        sourceContains(currentTruthDoc, [
          "普通 JSON-RPC 写入口 inventory",
          "debug/admin/system 控制面不计入普通业务 API",
        ]),
      evidence: [
        "scripts/qa/multi-client-role-workflow-priority-audit.mjs",
        priorityDoc,
        currentTruthDoc,
      ],
      scanFindings: jsonrpcWriteInventoryFindings,
      notProven: [
        "目标环境已经验证模块关闭前置检查和历史只读查询",
      ],
    },
    {
      id: "module-disabled-readonly-stock-reservation-api-gate",
      status: "ready",
      category: "inventory",
      description:
        "stock reservation 库存预留普通 JSON-RPC 写 API 已按 active module states 拒绝 inventory 非 enabled，历史 list 读取仍保留",
      pass:
        sourceContains("server/internal/biz/customer_config.go", [
          "EnsureModuleKeysEnabled",
          "ensureCustomerConfigModuleKeysEnabled",
          "moduleStates[moduleKey] != \"enabled\"",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config.go", [
          "requireCustomerConfigModulesEnabled",
          "EnsureModuleKeysEnabled",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_operational_fact_reservation.go", [
          "requireCustomerConfigModulesEnabled",
          "\"inventory\"",
          "CreateStockReservation",
          "ReleaseStockReservation",
          "ConsumeStockReservation",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_operational_fact_test.go", [
          "TestJsonrpcDispatcher_StockReservationAPIRequiresEnabledInventoryModule",
          "inventory",
          "read_only",
          "disabled",
          "list_stock_reservations",
        ]) &&
        sourceContains(priorityDoc, [
          "stock reservation 库存预留写 API",
          "历史读取继续保留",
        ]) &&
        sourceContains(currentTruthDoc, [
          "stock reservation 库存预留写 API",
          "历史 list 查询",
        ]),
      evidence: [
        "server/internal/biz/customer_config.go",
        "server/internal/service/jsonrpc_customer_config.go",
        "server/internal/service/jsonrpc_operational_fact_reservation.go",
        "server/internal/service/jsonrpc_operational_fact_test.go",
        priorityDoc,
        currentTruthDoc,
      ],
      notProven: [
        "sales order / purchase order / outsourcing order / material BOM / MasterData core / processes / purchase / quality / shipment / stock reservation / production / outsourcing fact / finance 以外的普通后端业务 API 已全部按 disabled/read_only 强制阻断",
        "打印已全部按 disabled/read_only 强制阻断",
        "目标环境已经验证模块关闭前置检查和历史只读查询",
      ],
    },
    {
      id: "module-disabled-readonly-production-api-gate",
      status: "ready",
      category: "production",
      description:
        "production 生产事实普通 JSON-RPC 写 API 已按 active module states 拒绝 production 非 enabled，历史 list 读取仍保留",
      pass:
        sourceContains("server/internal/biz/customer_config.go", [
          "EnsureModuleKeysEnabled",
          "ensureCustomerConfigModuleKeysEnabled",
          "moduleStates[moduleKey] != \"enabled\"",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config.go", [
          "requireCustomerConfigModulesEnabled",
          "EnsureModuleKeysEnabled",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_operational_fact_production.go", [
          "requireCustomerConfigModulesEnabled",
          "\"production\"",
          "CreateProductionFactDraft",
          "PostProductionFact",
          "CancelPostedProductionFact",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_operational_fact_test.go", [
          "TestJsonrpcDispatcher_ProductionFactAPIRequiresEnabledModule",
          "production",
          "read_only",
          "disabled",
          "list_production_facts",
        ]) &&
        sourceContains(priorityDoc, [
          "production 生产事实写 API",
          "历史读取继续保留",
        ]) &&
        sourceContains(currentTruthDoc, [
          "production 生产事实写 API",
          "历史 list 查询",
        ]),
      evidence: [
        "server/internal/biz/customer_config.go",
        "server/internal/service/jsonrpc_customer_config.go",
        "server/internal/service/jsonrpc_operational_fact_production.go",
        "server/internal/service/jsonrpc_operational_fact_test.go",
        priorityDoc,
        currentTruthDoc,
      ],
      notProven: [
        "sales order / purchase order / outsourcing order / material BOM / MasterData core / processes / purchase / quality / shipment / stock reservation / production / outsourcing fact / finance 以外的普通后端业务 API 已全部按 disabled/read_only 强制阻断",
        "打印已全部按 disabled/read_only 强制阻断",
        "目标环境已经验证模块关闭前置检查和历史只读查询",
      ],
    },
    {
      id: "module-disabled-readonly-outsourcing-api-gate",
      status: "ready",
      category: "outsourcing",
      description:
        "outsourcing fact 委外事实普通 JSON-RPC 写 API 已按 active module states 拒绝 outsourcing_orders 非 enabled，历史 list 读取仍保留",
      pass:
        sourceContains("server/internal/biz/customer_config.go", [
          "EnsureModuleKeysEnabled",
          "ensureCustomerConfigModuleKeysEnabled",
          "moduleStates[moduleKey] != \"enabled\"",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config.go", [
          "requireCustomerConfigModulesEnabled",
          "EnsureModuleKeysEnabled",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_operational_fact_outsourcing.go", [
          "requireCustomerConfigModulesEnabled",
          "\"outsourcing_orders\"",
          "CreateOutsourcingFactDraft",
          "PostOutsourcingFact",
          "CancelPostedOutsourcingFact",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_operational_fact_test.go", [
          "TestJsonrpcDispatcher_OutsourcingFactAPIRequiresEnabledModule",
          "outsourcing_orders",
          "read_only",
          "disabled",
          "list_outsourcing_facts",
        ]) &&
        sourceContains(priorityDoc, [
          "outsourcing fact 委外事实写 API",
          "历史读取继续保留",
        ]) &&
        sourceContains(currentTruthDoc, [
          "outsourcing fact 委外事实写 API",
          "历史 list 查询",
        ]),
      evidence: [
        "server/internal/biz/customer_config.go",
        "server/internal/service/jsonrpc_customer_config.go",
        "server/internal/service/jsonrpc_operational_fact_outsourcing.go",
        "server/internal/service/jsonrpc_operational_fact_test.go",
        priorityDoc,
        currentTruthDoc,
      ],
      notProven: [
        "sales order / purchase order / outsourcing order / material BOM / MasterData core / processes / purchase / quality / shipment / stock reservation / production / outsourcing fact / finance 以外的普通后端业务 API 已全部按 disabled/read_only 强制阻断",
        "打印已全部按 disabled/read_only 强制阻断",
        "目标环境已经验证模块关闭前置检查和历史只读查询",
      ],
    },
    {
      id: "module-disabled-readonly-consistency-remains-guarded",
      status: "ready",
      category: "customer-config",
      description:
        "P5 模块 disabled/read_only 本地一致阻断已收口：新流程创建、effective session 投影、真实导入执行 loader、customer_config 显式 execute API、核心普通业务写 API、attachment、workflow、打印 PDF、定时任务和普通 JSON-RPC 写入口 inventory 已有本地证据；目标环境仍需 release evidence 验证",
      pass:
        sourceContains("server/internal/biz/customer_config.go", [
          "ExplainModuleStatus",
          "CountInFlightProcessInstances",
          "CountOpenWorkflowTasksByPools",
          "CountOpenBusinessDocumentsByModules",
          "open_business_documents_present",
          "module_disable_full_enforcement_not_connected",
          "DisableBlockedReasons",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config.go", [
          "explain_module_status",
          "module_status",
          "runtime_count_source",
          "open_business_document_count",
        ]) &&
        sourceContains(priorityDoc, [
          "完整 P5 要求仍是模块 disabled/read_only 后一致阻止普通后端业务 API",
          "核心业务表未结单据数",
          "普通 JSON-RPC 写入口 inventory",
          "不提供普通运行时安装、卸载或上传模块",
        ]) &&
        sourceContains("docs/当前真源与交接顺序.md", [
          "runtime_count_source=process_workflow_business_partial",
          "open_business_documents_present",
          "普通 JSON-RPC 写入口 inventory",
          "模块状态变化仍只能通过受审计的客户配置 publish / activate / rollback 路径",
        ]),
      evidence: [
        "server/internal/biz/customer_config.go",
        "server/internal/service/jsonrpc_customer_config.go",
        priorityDoc,
        "docs/当前真源与交接顺序.md",
      ],
      notProven: [
        "目标环境已经验证模块关闭前置检查和历史只读查询",
      ],
    },
    {
      id: "workflow-task-runtime-anchors",
      status: "ready",
      category: "workflow",
      description: "WorkflowTask 已接入 owner_pool_key / required_capability_key / config_revision 可空解释锚点",
      pass:
        sourceContains("server/internal/data/model/schema/workflow_task.go", [
          "owner_pool_key",
          "required_capability_key",
          "config_revision",
        ]) &&
        anyMigrationContains([
          "ALTER TABLE \"workflow_tasks\" ADD COLUMN \"owner_pool_key\"",
          "required_capability_key",
          "config_revision",
        ]) &&
        sourceContains("server/internal/biz/workflow.go", [
          "workflowTaskDefaultRequiredCapability",
          "normalizeWorkflowDerivedTaskRuntimeAnchors",
          "ConfigRevision",
        ]) &&
        sourceContains("server/internal/data/workflow_repo.go", [
          "SetNillableOwnerPoolKey",
          "SetNillableRequiredCapabilityKey",
          "SetNillableConfigRevision",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_workflow_shared.go", [
          "owner_pool_key",
          "required_capability_key",
          "config_revision",
        ]) &&
        sourceContains("server/internal/biz/workflow_test.go", [
          "TestWorkflowUsecase_CreateTaskPreservesRuntimeAnchors",
          "TestWorkflowUsecase_DerivedTaskInheritsConfigRevisionAndRuntimeAnchors",
        ]) &&
        sourceContains("server/internal/data/workflow_repo_test.go", [
          "expected owner pool persisted",
          "expected config revision persisted",
        ]) &&
        sourceContains(priorityDoc, [
          "WorkflowTask 运行时解释锚点已接入",
          "不代表流程实例 runtime",
        ]),
      evidence: [
        "server/internal/data/model/schema/workflow_task.go",
        "server/internal/data/model/migrate/*.sql",
        "server/internal/biz/workflow.go",
        "server/internal/data/workflow_repo.go",
        "server/internal/service/jsonrpc_workflow_shared.go",
        "server/internal/biz/workflow_test.go",
        "server/internal/data/workflow_repo_test.go",
        priorityDoc,
      ],
    },
    {
      id: "process-runtime-minimum",
      status: "ready",
      category: "workflow",
      description: "ProcessInstance / ProcessNodeInstance 已具备最小持久化闭环，真实领域 usecase 绑定仍需后续阶段",
      pass:
        sourceContains("server/internal/data/model/schema/process_instance.go", [
          "ProcessInstance",
          "process_key",
          "process_version",
          "config_revision",
          "definition_hash",
          "idempotency_key",
        ]) &&
        sourceContains("server/internal/data/model/schema/process_node_instance.go", [
          "ProcessNodeInstance",
          "process_instance_id",
          "node_key",
          "node_type",
          "owner_pool_key",
          "required_capability_key",
          "version",
        ]) &&
        anyMigrationContains([
          "CREATE TABLE \"process_instances\"",
          "CREATE TABLE \"process_node_instances\"",
        ]) &&
        sourceContains("server/internal/biz/process_runtime.go", [
          "ProcessRuntimeUsecase",
          "ProcessNodeTypeHumanTask",
          "ProcessNodeTypeDomainCommand",
          "ProcessStatusActive",
          "ProcessNodeStatusWaiting",
        ]) &&
        sourceContains("server/internal/data/process_runtime_repo.go", [
          "CreateProcessInstance",
          "SetProcessVersion",
          "SetConfigRevision",
          "SetProcessInstanceID",
        ]) &&
        sourceContains("server/internal/biz/process_runtime_test.go", [
          "TestProcessRuntimeUsecaseCreateNormalizesDefaults",
          "TestProcessRuntimeUsecaseRejectsInvalidNodeType",
        ]) &&
        sourceContains("server/internal/data/process_runtime_repo_test.go", [
          "TestProcessRuntimeRepoCreateAndRead",
          "TestProcessRuntimeRepoReturnsExistingProcessForSameIdempotency",
        ]) &&
        sourceContains(priorityDoc, [
          "ProcessInstance / ProcessNodeInstance 最小运行时",
          "真实领域 usecase 绑定",
        ]),
      evidence: [
        "server/internal/data/model/schema/process_instance.go",
        "server/internal/data/model/schema/process_node_instance.go",
        "server/internal/data/model/migrate/*.sql",
        "server/internal/biz/process_runtime.go",
        "server/internal/data/process_runtime_repo.go",
        "server/internal/biz/process_runtime_test.go",
        "server/internal/data/process_runtime_repo_test.go",
        priorityDoc,
      ],
    },
    {
      id: "workflow-task-process-link",
      status: "ready",
      category: "workflow",
      description: "WorkflowTask 已具备可空 process_instance_id / process_node_instance_id 关联字段",
      pass:
        sourceContains("server/internal/data/model/schema/workflow_task.go", [
          "process_instance_id",
          "process_node_instance_id",
          "process_instance_id\", \"task_status_key",
        ]) &&
        anyMigrationContains([
          "ALTER TABLE \"workflow_tasks\" ADD COLUMN \"process_instance_id\"",
          "process_node_instance_id",
          "workflowtask_process_instance_id_task_status_key",
        ]) &&
        sourceContains("server/internal/biz/workflow_types.go", [
          "ProcessInstanceID",
          "ProcessNodeInstanceID",
        ]) &&
        sourceContains("server/internal/biz/workflow.go", [
          "normalizeWorkflowOptionalPositiveIntPtr",
          "ProcessNodeInstanceID != nil && in.ProcessInstanceID == nil",
        ]) &&
        sourceContains("server/internal/data/workflow_repo.go", [
          "SetNillableProcessInstanceID",
          "SetNillableProcessNodeInstanceID",
          "ProcessNodeInstanceID: row.ProcessNodeInstanceID",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_workflow_task.go", [
          "process_instance_id",
          "process_node_instance_id",
          "ProcessNodeInstanceID",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_workflow_shared.go", [
          "process_instance_id",
          "process_node_instance_id",
        ]) &&
        sourceContains("server/internal/biz/workflow_test.go", [
          "TestWorkflowUsecase_CreateTaskRejectsNodeLinkWithoutProcessLink",
          "expected process node instance id preserved",
        ]) &&
        sourceContains("server/internal/data/workflow_repo_test.go", [
          "expected process instance id persisted",
          "expected process node instance id persisted",
        ]) &&
        sourceContains(priorityDoc, [
          "WorkflowTask 流程节点关联字段",
          "尚未由流程运行时自动生成或推进",
        ]),
      evidence: [
        "server/internal/data/model/schema/workflow_task.go",
        "server/internal/data/model/migrate/*.sql",
        "server/internal/biz/workflow_types.go",
        "server/internal/biz/workflow.go",
        "server/internal/data/workflow_repo.go",
        "server/internal/service/jsonrpc_workflow_task.go",
        "server/internal/service/jsonrpc_workflow_shared.go",
        "server/internal/biz/workflow_test.go",
        "server/internal/data/workflow_repo_test.go",
        priorityDoc,
      ],
    },
    {
      id: "process-runtime-linked-human-task",
      status: "ready",
      category: "workflow",
      description: "ProcessRuntime 可显式从 human_task / approval 节点创建 linked WorkflowTask",
      pass:
        sourceContains("server/internal/biz/process_runtime.go", [
          "CreateLinkedWorkflowTask",
          "ProcessLinkedWorkflowTaskCreate",
          "ProcessNodeTypeHumanTask",
          "ProcessNodeTypeApproval",
          "ErrProcessNodeInstanceNotActive",
          "ErrProcessNodeInstanceConflict",
          "ProcessNodeStatusActive",
          "ExpectedVersion",
          "CreateWorkflowTask",
          "ProcessRuntimeOwnerRoleResolver",
          "resolveLinkedWorkflowTaskOwnerRole",
          "ErrProcessTaskOwnerRoleNotFound",
          "ErrProcessTaskOwnerRoleAmbiguous",
          "ErrWorkflowTaskExists",
          "GetWorkflowTaskByTaskCode",
          "workflowTaskMatchesProcessNode",
        ]) &&
        sourceContains("server/internal/biz/process_runtime_test.go", [
          "TestProcessRuntimeUsecaseCreateLinkedWorkflowTaskFromHumanNode",
          "TestProcessRuntimeUsecaseCreateLinkedWorkflowTaskResolvesOwnerRoleFromCandidate",
          "TestProcessRuntimeUsecaseCreateLinkedWorkflowTaskRejectsMissingOwnerResolver",
          "TestProcessRuntimeUsecaseCreateLinkedWorkflowTaskRejectsAmbiguousOwnerCandidates",
          "TestProcessRuntimeUsecaseCreateLinkedWorkflowTaskRejectsConfigRevisionMismatch",
          "TestProcessRuntimeUsecaseCreateLinkedWorkflowTaskRejectsInactiveNode",
          "TestProcessRuntimeUsecaseCreateLinkedWorkflowTaskRejectsStaleNodeVersion",
          "TestProcessRuntimeUsecaseCreateLinkedWorkflowTaskReturnsExistingOnRetry",
          "TestProcessRuntimeUsecaseCreateLinkedWorkflowTaskRejectsTaskCodeCollision",
          "TestProcessRuntimeUsecaseCreateLinkedWorkflowTaskRejectsDomainCommandNode",
          "expected owner role resolved from customer config candidate",
          "ambiguous candidates must not create workflow task",
          "config revision mismatch must not create workflow task",
          "expected process node link",
          "stale node version must not create workflow task",
          "expected existing linked workflow task on retry",
          "expected task_code collision",
        ]) &&
        sourceContains("server/cmd/server/wire_gen.go", [
          "biz.NewProcessRuntimeUsecase(processRuntimeRepo, workflowRepo, customerConfigUsecase)",
        ]) &&
        sourceContains("server/internal/data/workflow_repo.go", [
          "GetWorkflowTaskByTaskCode",
          "workflowtask.TaskCode",
        ]) &&
        sourceContains("server/internal/data/process_runtime_repo.go", [
          "GetProcessNodeInstance",
          "ErrProcessNodeInstanceNotFound",
        ]) &&
        sourceContains("server/internal/data/process_runtime_repo_test.go", [
          "get node failed",
          "expected node not found",
        ]) &&
        sourceContains(priorityDoc, [
          "ProcessRuntime 显式创建 linked 人工任务",
          "状态为 `active`、且 `expected_version` 匹配当前节点 `version` 的 `human_task / approval`",
          "未显式传入 `owner_role_key` 时，会按 active customer config 的责任池、required capability 和 customer scope 解析唯一候选 owner role",
          "相同 `task_code` 的同一节点重试会返回已有 linked WorkflowTask",
          "不自动扫描流程定义",
        ]),
      evidence: [
        "server/cmd/server/wire_gen.go",
        "server/internal/biz/process_runtime.go",
        "server/internal/biz/process_runtime_test.go",
        "server/internal/biz/workflow_types.go",
        "server/internal/data/workflow_repo.go",
        "server/internal/data/process_runtime_repo.go",
        "server/internal/data/process_runtime_repo_test.go",
        priorityDoc,
      ],
    },
    {
      id: "process-runtime-start-first-node",
      status: "ready",
      category: "workflow",
      description: "ProcessRuntime 可显式启动 active ProcessInstance 的首个 waiting 节点，并按节点类型复用现有处理边界",
      pass:
        sourceContains("server/internal/biz/process_runtime.go", [
          "StartProcessInstance",
          "ProcessInstanceStart",
          "ProcessStatusActive",
          "ProcessNodeStatusWaiting",
          "ActivateProcessNodeInstance",
          "handleActivatedSequentialNode",
          "ErrProcessInstanceSettled",
          "ErrProcessNodeInstanceConflict",
        ]) &&
        sourceContains("server/internal/biz/process_runtime_test.go", [
          "TestProcessRuntimeUsecaseStartProcessInstanceActivatesFirstWaitingApprovalNode",
          "TestProcessRuntimeUsecaseStartProcessInstanceDoesNotCreateTaskForDomainCommand",
          "TestProcessRuntimeUsecaseStartProcessInstanceRejectsSettledProcess",
          "TestProcessRuntimeUsecaseStartProcessInstanceRejectsBlockedFirstNode",
          "expected first waiting node activation",
          "domain command start must not create workflow task",
        ]) &&
        sourceContains(priorityDoc, [
          "ProcessRuntime 显式启动首个 waiting 节点",
          "不提供后台 scheduler",
        ]),
      evidence: [
        "server/internal/biz/process_runtime.go",
        "server/internal/biz/process_runtime_test.go",
        priorityDoc,
      ],
    },
    {
      id: "process-runtime-linked-task-completion",
      status: "ready",
      category: "workflow",
      description: "ProcessRuntime 可显式把已 done 的 linked WorkflowTask 推进为 ProcessNodeInstance completed",
      pass:
        sourceContains("server/internal/biz/process_runtime.go", [
          "CompleteLinkedWorkflowTask",
          "ProcessLinkedWorkflowTaskCompletion",
          "GetWorkflowTask",
          "CompleteProcessNodeInstance",
          "ErrProcessNodeInstanceSettled",
        ]) &&
        sourceContains("server/internal/biz/process_runtime_test.go", [
          "TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskCompletesNode",
          "TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskRejectsUnfinishedTask",
          "TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskRejectsSettledNode",
          "expected optimistic version passed to repo",
        ]) &&
        sourceContains("server/internal/data/process_runtime_repo.go", [
          "CompleteProcessNodeInstance",
          "ProcessNodeStatusCompleted",
          "ErrProcessNodeInstanceConflict",
        ]) &&
        sourceContains("server/internal/data/process_runtime_repo_test.go", [
          "complete node failed",
          "expected version increment",
          "expected stale version conflict",
        ]) &&
        sourceContains(priorityDoc, [
          "ProcessRuntime 显式完成 linked 人工任务节点",
          "下一 linked WorkflowTask 创建边界见顺序、命名分支和 fan-out / join 闭环",
        ]),
      evidence: [
        "server/internal/biz/process_runtime.go",
        "server/internal/biz/process_runtime_test.go",
        "server/internal/data/process_runtime_repo.go",
        "server/internal/data/process_runtime_repo_test.go",
        priorityDoc,
      ],
    },
    {
      id: "workflow-complete-action-process-runtime-completion",
      status: "ready",
      category: "workflow",
      description: "complete_task_action 成功后受控触发 linked ProcessNodeInstance completed",
      pass:
        sourceContains("server/internal/service/jsonrpc_dispatch.go", [
          "processRuntimeUC",
          "newJSONRPCDispatcher: processRuntimeUC is nil",
        ]) &&
        sourceContains("server/internal/service/jsonrpc.go", [
          "processRuntimeUC *biz.ProcessRuntimeUsecase",
          "processRuntimeUC",
        ]) &&
        sourceContains("server/cmd/server/wire_gen.go", [
          "NewProcessRuntimeRepo",
          "NewProcessRuntimeUsecase",
          "processRuntimeUsecase",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_workflow_task.go", [
          "completeLinkedProcessNodeAfterTaskDone",
          "contract.StatusKey == \"done\"",
          "CompleteLinkedWorkflowTask",
          "ProcessLinkedWorkflowTaskCompletion",
        ]) &&
	        sourceContains("server/internal/service/jsonrpc_workflow_test.go", [
	          "TestJsonrpcDispatcher_WorkflowCompleteTaskActionCompletesLinkedProcessNode",
	          "TestJsonrpcDispatcher_WorkflowUpdateTaskStatusRemoved",
	          "expected update_task_status removed as unknown method",
	        ]) &&
	        sourceContains(priorityDoc, [
	          "`complete_task_action` 受控触发 linked 节点完成",
	          "`update_task_status` 已退出运行时",
	        ]),
      evidence: [
        "server/internal/service/jsonrpc_dispatch.go",
        "server/internal/service/jsonrpc.go",
        "server/cmd/server/wire_gen.go",
        "server/internal/service/jsonrpc_workflow_task.go",
        "server/internal/service/jsonrpc_workflow_test.go",
        priorityDoc,
      ],
    },
    {
      id: "process-runtime-sequential-next-node",
      status: "ready",
      category: "workflow",
      description: "ProcessRuntime 完成当前 linked 节点后激活紧邻 waiting 节点，并只为刚激活的人工 / 审批节点创建 linked WorkflowTask",
      pass:
        sourceContains("server/internal/biz/process_runtime.go", [
          "ProcessNodeInstanceActivate",
          "activateNextSequentialNode",
          "handleActivatedSequentialNode",
          "CreateLinkedWorkflowTask",
          "ListProcessNodeInstances",
          "ProcessNodeStatusWaiting",
          "ActivateProcessNodeInstance",
        ]) &&
        sourceContains("server/internal/biz/process_runtime_test.go", [
          "TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskActivatesNextWaitingNode",
          "TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskDoesNotCreateTaskForNonHumanNextNode",
          "TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskDoesNotSkipNonWaitingNextNode",
          "expected next linked workflow task creation",
          "domain command activation must not create a workflow task",
        ]) &&
        sourceContains("server/internal/data/process_runtime_repo.go", [
          "ActivateProcessNodeInstance",
          "ProcessNodeStatusWaiting",
          "ProcessNodeStatusActive",
          "ErrProcessNodeInstanceConflict",
        ]) &&
        sourceContains("server/internal/data/process_runtime_repo_test.go", [
          "activate next node failed",
          "expected active node with started_at",
          "expected stale activation conflict",
        ]) &&
        sourceContains(priorityDoc, [
          "ProcessRuntime 顺序激活下一 waiting 节点并创建人工任务",
          "只为刚激活的紧邻 human_task / approval 节点创建 linked WorkflowTask",
        ]),
      evidence: [
        "server/internal/biz/process_runtime.go",
        "server/internal/biz/process_runtime_test.go",
        "server/internal/data/process_runtime_repo.go",
        "server/internal/data/process_runtime_repo_test.go",
        priorityDoc,
      ],
    },
    {
      id: "process-runtime-named-policy-branch",
      status: "ready",
      category: "workflow",
      description: "ProcessRuntime 可通过已注册命名 policy 选择下一 waiting 节点，不解析自由表达式",
      pass:
        sourceContains("server/internal/biz/process_runtime.go", [
          "ProcessBranchPolicyHandler",
          "RegisterBranchPolicyHandler",
          "ErrProcessBranchPolicyHandlerNotFound",
          "processBranchPolicyKeyFromNode",
          "activateNextNodesAfterCompletion",
          "activateNamedWaitingNode",
          "branch_policy_key",
          "ResolveProcessBranch",
        ]) &&
        sourceContains("server/internal/biz/process_runtime_test.go", [
          "TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskUsesNamedBranchPolicy",
          "TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskRejectsUnregisteredBranchPolicy",
          "expected named policy and outcome passed",
          "branch policy must not automatically skip non-selected node",
          "unregistered branch policy must not create target task",
        ]) &&
        sourceContains(priorityDoc, [
          "ProcessRuntime 命名 policy 分支",
          "不解析自由表达式",
          "不自动跳过或 settle 非选中分支",
        ]),
      evidence: [
        "server/internal/biz/process_runtime.go",
        "server/internal/biz/process_runtime_test.go",
        priorityDoc,
      ],
    },
    {
      id: "process-runtime-fan-out-join",
      status: "ready",
      category: "workflow",
      description: "ProcessRuntime 支持受控 fan-out、join-all 和 join-any，不引入自由表达式或新事实写入",
      pass:
        sourceContains("server/internal/biz/process_runtime.go", [
          "processFanOutNodeKeysFromNode",
          "processJoinRouteFromNode",
          "activateFanOutNodes",
          "activateJoinNodeIfReady",
          "collectJoinRouteNodes",
          "fan_out_node_keys",
          "join_node_key",
          "join_source_node_keys",
          "join_policy",
        ]) &&
        sourceContains("server/internal/biz/process_runtime_test.go", [
          "TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskFanOutActivatesNamedBranches",
          "TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskJoinAllWaitsForSources",
          "TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskJoinAllActivatesTarget",
          "TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskJoinAnyIsIdempotentAfterTargetActive",
          "expected linked tasks for both human fan-out targets",
          "join-all target must wait for all sources",
          "join-any target already active must not create duplicate task",
        ]) &&
        sourceContains(priorityDoc, [
          "ProcessRuntime fan-out / join 路由",
          "`fan_out_node_keys`",
          "`join_node_key / join_policy / join_source_node_keys`",
          "不做 returnTo",
        ]),
      evidence: [
        "server/internal/biz/process_runtime.go",
        "server/internal/biz/process_runtime_test.go",
        priorityDoc,
      ],
    },
    {
      id: "process-runtime-return-to-attempt",
      status: "ready",
      category: "workflow",
      description: "ProcessRuntime 支持显式 returnTo 创建有上限的下一 attempt，不复用旧 completed 节点",
      pass:
        sourceContains("server/internal/biz/process_runtime.go", [
          "ErrProcessReturnAttemptLimit",
          "ProcessNodeInstanceAttemptCreate",
          "processReturnRouteFromNode",
          "activateReturnToNodeAttempt",
          "return_to_node_key",
          "return_outcomes",
          "return_max_attempts",
          "CreateProcessNodeInstanceAttempt",
        ]) &&
        sourceContains("server/internal/data/process_runtime_repo.go", [
          "CreateProcessNodeInstanceAttempt",
          "SetAttempt(normalized.Attempt)",
          "SetStatus(normalized.Status)",
        ]) &&
        sourceContains("server/internal/biz/process_runtime_test.go", [
          "TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskReturnToCreatesNextAttempt",
          "TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskReturnToRejectsAttemptLimit",
          "expected returnTo to create a new node attempt",
          "expected return attempt limit",
        ]) &&
        sourceContains("server/internal/data/process_runtime_repo_test.go", [
          "TestProcessRuntimeRepoCreateProcessNodeInstanceAttempt",
          "expected duplicate attempt conflict",
        ]) &&
        sourceContains(priorityDoc, [
          "ProcessRuntime returnTo 受控返工 attempt",
          "`return_to_node_key / return_outcomes / return_max_attempts`",
          "不提供任意循环",
        ]),
      evidence: [
        "server/internal/biz/process_runtime.go",
        "server/internal/biz/process_runtime_test.go",
        "server/internal/data/process_runtime_repo.go",
        "server/internal/data/process_runtime_repo_test.go",
        priorityDoc,
      ],
    },
    {
      id: "process-runtime-blocked-due-at",
      status: "ready",
      category: "workflow",
      description: "ProcessRuntime 支持显式 blocked 和 due_at 到期阻塞，不提供后台 scheduler 或自动扫描",
      pass:
        sourceContains("server/internal/biz/process_runtime.go", [
          "ErrProcessNodeDueAtNotReached",
          "ProcessNodeInstanceBlock",
          "ProcessNodeDueAtEscalation",
          "BlockProcessNodeInstance",
          "EscalateDueProcessNode",
          "ProcessNodeStatusBlocked",
          "ProcessStatusBlocked",
          "BlockProcessInstance",
        ]) &&
        sourceContains("server/internal/data/process_runtime_repo.go", [
          "BlockProcessNodeInstance",
          "SetStatus(biz.ProcessNodeStatusBlocked)",
          "BlockProcessInstance",
          "SetStatus(biz.ProcessStatusBlocked)",
        ]) &&
        sourceContains("server/internal/biz/process_runtime_test.go", [
          "TestProcessRuntimeUsecaseBlockProcessNodeInstanceBlocksNodeAndProcess",
          "TestProcessRuntimeUsecaseEscalateDueProcessNodeBlocksOverdueNode",
          "TestProcessRuntimeUsecaseEscalateDueProcessNodeRejectsBeforeDueAt",
          "TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskRejectsBlockedNode",
          "blocked path must not complete, advance, or create workflow tasks",
        ]) &&
        sourceContains("server/internal/data/process_runtime_repo_test.go", [
          "TestProcessRuntimeRepoBlockProcessNodeInstanceAndProcess",
          "expected blocked node without completed_at",
          "expected blocked process without completed_at",
        ]) &&
        sourceContains(priorityDoc, [
          "ProcessRuntime blocked / due_at 显式阻塞",
          "`BlockProcessNodeInstance`",
          "`EscalateDueProcessNode`",
          "不提供后台 scheduler",
        ]),
      evidence: [
        "server/internal/biz/process_runtime.go",
        "server/internal/biz/process_runtime_test.go",
        "server/internal/data/process_runtime_repo.go",
        "server/internal/data/process_runtime_repo_test.go",
        priorityDoc,
      ],
    },
    {
      id: "process-runtime-end-node-completion",
      status: "ready",
      category: "workflow",
      description: "ProcessRuntime 激活紧邻 end 节点后完成 end 节点，并把 ProcessInstance 标记为 completed",
      pass:
        sourceContains("server/internal/biz/process_runtime.go", [
          "ProcessNodeTypeEnd",
          "completeEndNodeAndProcess",
          "CompleteProcessInstance",
          "ProcessInstanceComplete",
          "ProcessStatusCompleted",
          "handleActivatedSequentialNode",
        ]) &&
        sourceContains("server/internal/biz/process_runtime_test.go", [
          "TestProcessRuntimeUsecaseCompleteLinkedWorkflowTaskCompletesEndNodeAndProcess",
          "expected end node activation",
          "expected process instance completed",
          "end node must not create a workflow task",
        ]) &&
        sourceContains("server/internal/data/process_runtime_repo.go", [
          "CompleteProcessInstance",
          "ProcessStatusActive",
          "ProcessStatusCompleted",
          "ErrProcessInstanceSettled",
        ]) &&
        sourceContains("server/internal/data/process_runtime_repo_test.go", [
          "complete process failed",
          "expected completed process with completed_at",
          "expected settled process error",
        ]) &&
        sourceContains(priorityDoc, [
          "ProcessRuntime end 节点与流程实例完成",
          "显式 end 节点才会完成 ProcessInstance",
        ]),
      evidence: [
        "server/internal/biz/process_runtime.go",
        "server/internal/biz/process_runtime_test.go",
        "server/internal/data/process_runtime_repo.go",
        "server/internal/data/process_runtime_repo_test.go",
        priorityDoc,
      ],
    },
    {
      id: "process-runtime-wait-event-wakeup",
      status: "ready",
      category: "workflow",
      description: "ProcessRuntime 只通过显式 event_key 唤醒 active wait_event，匹配后完成节点并复用顺序推进",
      pass:
        sourceContains("server/internal/biz/process_runtime.go", [
          "WakeProcessWaitEventNode",
          "ProcessWaitEventWakeup",
          "ProcessNodeTypeWaitEvent",
          "processWaitEventKeyFromNode",
          "CompleteProcessNodeInstance",
          "advanceAfterNodeCompletion",
        ]) &&
        sourceContains("server/internal/biz/process_runtime_test.go", [
          "TestProcessRuntimeUsecaseWakeProcessWaitEventNodeCompletesAndAdvances",
          "TestProcessRuntimeUsecaseWakeProcessWaitEventNodeRejectsEventMismatch",
          "expected wait_event wakeup",
          "mismatched event must not complete wait_event node",
          "wait_event wakeup must not create a workflow task",
        ]) &&
        sourceContains(priorityDoc, [
          "ProcessRuntime wait_event 显式唤醒",
          "不提供事件订阅器",
        ]),
      evidence: [
        "server/internal/biz/process_runtime.go",
        "server/internal/biz/process_runtime_test.go",
        priorityDoc,
      ],
    },
    {
      id: "process-runtime-domain-command-handler-guard",
      status: "ready",
      category: "workflow",
      description: "ProcessRuntime 只通过显式注册 handler 执行 active domain_command，成功后才完成节点并复用顺序推进",
      pass:
        sourceContains("server/internal/biz/process_runtime.go", [
          "ExecuteDomainCommandNode",
          "ProcessDomainCommandExecution",
          "ProcessDomainCommandHandler",
          "ErrProcessDomainCommandHandlerNotFound",
          "RegisterDomainCommandHandler",
          "processDomainCommandKeyFromNode",
          "CompleteProcessNodeInstance",
          "activateNextSequentialNode",
          "handleActivatedSequentialNode",
        ]) &&
        sourceContains("server/internal/biz/process_runtime_test.go", [
          "TestProcessRuntimeUsecaseExecuteDomainCommandNodeCompletesAndAdvances",
          "TestProcessRuntimeUsecaseExecuteDomainCommandNodeRejectsMissingHandler",
          "TestProcessRuntimeUsecaseExecuteDomainCommandNodeRejectsCommandMismatch",
          "expected domain command execution",
          "missing handler must not complete domain command node",
          "mismatched command must not call handler",
        ]) &&
        sourceContains(priorityDoc, [
          "ProcessRuntime domain_command 显式 handler 执行",
          "不绑定任何库存 / 出货 / 质检 / 财务 usecase",
        ]),
      evidence: [
        "server/internal/biz/process_runtime.go",
        "server/internal/biz/process_runtime_test.go",
        priorityDoc,
      ],
    },
    {
      id: "sales-order-submit-domain-command-handler",
      status: "ready",
      category: "workflow",
      description: "ProcessRuntime 已显式绑定 sales_order.submit 到 SalesOrderUsecase.SubmitSalesOrder，但不自动触发任务完成或写 Fact",
      pass:
        sourceContains("server/internal/biz/sales_order_process_command.go", [
          "ProcessDomainCommandSalesOrderSubmit",
          "SalesOrderProcessCommandOutcomeSubmitted",
          "RegisterSalesOrderProcessDomainCommandHandlers",
          "SubmitSalesOrder",
          "BusinessRefType",
          "sales_order_id",
        ]) &&
        sourceContains("server/internal/biz/sales_order_test.go", [
          "TestSalesOrderProcessDomainCommandSubmitBindsUsecase",
          "TestSalesOrderProcessDomainCommandSubmitRejectsMismatchedBusinessRef",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_dispatch.go", [
          "RegisterSalesOrderProcessDomainCommandHandlers",
        ]) &&
        sourceContains(priorityDoc, [
          "`sales_order.submit`",
          "提交销售订单 Source Document",
        ]),
      evidence: [
        "server/internal/biz/sales_order_process_command.go",
        "server/internal/biz/sales_order_test.go",
        "server/internal/service/jsonrpc_dispatch.go",
        priorityDoc,
      ],
    },
    {
      id: "sales-order-acceptance-minimum-process-chain",
      status: "ready",
      category: "workflow",
      description: "P4 第一条销售订单接单链路已用 ProcessRuntime 最小验证 submit -> boss approval -> PMC review，且前端串任务 builder 已退场",
      pass:
        sourceContains("server/internal/biz/sales_order_test.go", [
          "TestSalesOrderAcceptanceProcessSubmitCreatesBossApprovalAndPmcReview",
          "ProcessDomainCommandSalesOrderSubmit",
          "order_approval",
          "order_review",
          "BossRoleKey",
          "PMCRoleKey",
        ]) &&
        sourceExcludes("web/src/erp/utils/orderApprovalFlow.mjs", [
          "buildBossApprovalTaskFromProjectOrder",
          "buildEngineeringTaskFromApprovedOrder",
          "buildRevisionTaskFromRejectedOrder",
          "owner_role_key:",
        ]) &&
        sourceContains("web/src/erp/utils/orderApprovalFlow.test.mjs", [
          "正式运行时代码不再保留前端串任务 builder",
          "移动端老板审批不再本地创建下游任务",
        ]) &&
        sourceContains(priorityDoc, [
          "销售订单提交 -> 老板审批 -> PMC 评审",
          "后端最小流程链",
          "前端 `orderApprovalFlow` 串任务 builder 已删除",
        ]),
      evidence: [
        "server/internal/biz/sales_order_test.go",
        "web/src/erp/utils/orderApprovalFlow.mjs",
        "web/src/erp/utils/orderApprovalFlow.test.mjs",
        priorityDoc,
      ],
    },
    {
      id: "customer-config-sales-order-process-definition-manifest",
      status: "ready",
      category: "customer-config",
      description: "客户配置 runtime manifest 已编译 sales_order_acceptance 受控流程定义并标记 controlled runtime loader ready，但不写 Fact",
      pass:
        sourceContains("scripts/qa/customer-config-runtime-manifest.mjs", [
          "SALES_ORDER_ACCEPTANCE_PROCESS_KEY",
          "salesOrderAcceptanceProcessDefinitionFromPackage",
          "runtime_loader_enabled: true",
          "manifest_status: \"runtime_loader_ready\"",
          "fact_boundary: \"no_fact_posting\"",
          "order_approval",
          "order_review",
          "SalesOrderUsecase.SubmitSalesOrder",
          "validateProcessDefinitions",
        ]) &&
        sourceContains("server/internal/biz/customer_config.go", [
          "BuildProcessInstanceCreateFromActiveCustomerConfig",
          "ProcessKeySalesOrderAcceptance",
          "runtime_loader_enabled",
          "fact_boundary",
          "ProcessDomainCommandSalesOrderSubmit",
        ]) &&
        sourceContains("scripts/qa/customer-config-runtime-manifest.test.mjs", [
          "compiles sales order acceptance process definition as controlled loader ready",
          "rejects unsafe process definition changes",
          "order_review mapped role pmc must have workflow\\.task\\.complete",
        ]) &&
        sourceContains("server/internal/biz/customer_config_test.go", [
          "BuildsProcessInstanceCreateFromActiveProcessDefinition",
          "RejectsUnsafeActiveProcessDefinitionLoader",
          "CreateProcessInstance from active customer config",
        ]) &&
        sourceContains(priorityDoc, [
          "客户配置 runtime manifest 已编译 `sales_order_acceptance`",
          "runtime_loader_ready",
          "受控构造 `ProcessInstanceCreate`",
        ]),
      evidence: [
        "scripts/qa/customer-config-runtime-manifest.mjs",
        "scripts/qa/customer-config-runtime-manifest.test.mjs",
        "server/internal/biz/customer_config.go",
        "server/internal/biz/customer_config_test.go",
        priorityDoc,
      ],
    },
    {
      id: "sales-order-acceptance-explicit-start-jsonrpc",
      status: "ready",
      category: "customer-config",
      description: "customer_config.start_sales_order_acceptance_process 可从 active config 显式创建并启动 sales_order_acceptance ProcessInstance，但不执行 domain command 或写 Fact",
      pass:
        sourceContains("server/internal/service/jsonrpc_customer_config.go", [
          "start_sales_order_acceptance_process",
          "PermissionSalesOrderSubmit",
          "BuildProcessInstanceCreateFromActiveCustomerConfig",
          "CreateProcessInstance",
          "StartProcessInstance",
          "executes_domain_command",
          "writes_inventory_or_quality_fact",
          "writes_shipment_or_finance_fact",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config_test.go", [
          "TestCustomerConfigJSONRPCStartSalesOrderAcceptanceProcess",
          "TestCustomerConfigJSONRPCStartSalesOrderAcceptanceProcessRequiresSubmitPermission",
          "started_node",
          "runtime_boundary",
          "executes_domain_command",
        ]) &&
        sourceContains(priorityDoc, [
          "start_sales_order_acceptance_process",
          "显式创建并启动",
          "不执行 `sales_order.submit`",
          "不写库存 / 出货 / 质检 / 财务 Fact",
        ]),
      evidence: [
        "server/internal/service/jsonrpc_customer_config.go",
        "server/internal/service/jsonrpc_customer_config_test.go",
        priorityDoc,
      ],
    },
    {
      id: "sales-order-acceptance-submit-domain-command-jsonrpc",
      status: "ready",
      category: "customer-config",
      description: "customer_config.execute_sales_order_acceptance_submit 可显式执行已启动 submit_sales_order domain command，推进到老板审批 linked task，仍不写 Fact",
      pass:
        sourceContains("server/internal/service/jsonrpc_customer_config.go", [
          "execute_sales_order_acceptance_submit",
          "ExecuteDomainCommandNode",
          "ProcessDomainCommandSalesOrderSubmit",
          "writes_sales_order_source_document",
          "creates_next_linked_task",
          "writes_inventory_or_quality_fact",
          "writes_shipment_or_finance_fact",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config_test.go", [
          "TestCustomerConfigJSONRPCExecuteSalesOrderAcceptanceSubmit",
          "execute_sales_order_acceptance_submit",
          "SalesOrderStatusSubmitted",
          "order_approval",
          "writes_sales_order_source_document",
        ]) &&
        sourceContains(priorityDoc, [
          "execute_sales_order_acceptance_submit",
          "执行 `sales_order.submit` domain command",
          "推进到老板审批 linked task",
          "不写库存 / 出货 / 质检 / 财务 Fact",
        ]),
      evidence: [
        "server/internal/service/jsonrpc_customer_config.go",
        "server/internal/service/jsonrpc_customer_config_test.go",
        priorityDoc,
      ],
    },
    {
      id: "sales-order-acceptance-formal-ui-submit-entry",
      status: "ready",
      category: "frontend",
      description: "正式销售订单页提交动作已接入 sales_order_acceptance 显式 start + submit command API，不再直连旧 submit_sales_order",
      pass:
        sourceContains("web/src/erp/api/customerConfigApi.mjs", [
          "submitSalesOrderAcceptanceProcess",
          "start_sales_order_acceptance_process",
          "execute_sales_order_acceptance_submit",
          "process_instance_id",
          "process_node_instance_id",
          "expected_version",
        ]) &&
        sourceContains("web/src/erp/components/sales-orders/salesOrderPageConfig.mjs", [
          "submitSalesOrderAcceptanceProcess",
          "returnsRecord: false",
          "销售订单已提交，已进入老板审批",
        ]) &&
        sourceExcludes("web/src/erp/components/sales-orders/salesOrderPageConfig.mjs", [
          "submitSalesOrder,",
        ]) &&
        sourceContains("web/src/erp/pages/V1SalesOrdersPage.jsx", [
          "activeCustomerKey",
          "customer_key: activeCustomerKey",
          "business_ref_no: order.order_no",
          "action.returnsRecord === false",
          "setSelectedOrder(nextSelectedOrder)",
        ]) &&
        sourceContains("web/src/erp/api/customerConfigApi.test.mjs", [
          "sales order acceptance submit uses explicit start and domain command APIs",
          "sales order submit action enters acceptance workflow",
          "process submit payload does not replace selected sales order",
          "submitSalesOrderAcceptanceProcess",
        ]) &&
        sourceContains("web/scripts/style-l1/businessFormalScenarios.mjs", [
          "sales-order-acceptance-submit-action-desktop",
          "start_sales_order_acceptance_process",
          "execute_sales_order_acceptance_submit",
          "submit_sales_order",
          "销售订单已提交，已进入老板审批",
        ]) &&
        sourceContains(priorityDoc, [
          "正式销售订单页提交按钮已接入",
          "不再直连旧 `submit_sales_order`",
          "不写库存 / 出货 / 质检 / 财务 Fact",
        ]),
      evidence: [
        "web/src/erp/api/customerConfigApi.mjs",
        "web/src/erp/api/customerConfigApi.test.mjs",
        "web/src/erp/components/sales-orders/salesOrderPageConfig.mjs",
        "web/src/erp/pages/V1SalesOrdersPage.jsx",
        priorityDoc,
      ],
    },
    {
      id: "material-supply-runtime-loader-definition",
      status: "ready",
      category: "customer-config",
      description: "P4-2 material_supply 已作为 runtime_loader_ready 流程定义进入 runtime manifest，锁住采购订单、采购收货、来料质检、仓库入库责任池和显式领域命令边界，但不启用任务自动写 Fact",
      pass:
        sourceContains("scripts/qa/customer-config-runtime-manifest.mjs", [
          "MATERIAL_SUPPLY_PROCESS_KEY",
          "materialSupplyProcessDefinitionFromPackage",
          "variant_key: \"purchase_receipt_iqc_inbound\"",
          "manifest_status: \"runtime_loader_ready\"",
          "runtime_loader_enabled: true",
          "business_ref_type: \"purchase_order\"",
          "domain_boundary: \"explicit_fact_command_api\"",
          "purchase_receipt_source",
          "incoming_qc",
          "warehouse_inbound",
          "purchase_receipt.create",
          "quality_inspection.decide",
          "inventory.post_inbound",
          "writes_fact: false",
        ]) &&
        sourceContains("scripts/qa/customer-config-runtime-manifest.test.mjs", [
          "compiles material supply as loader-ready process definition",
          "purchase_receipt_iqc_inbound",
          "material_supply runtime loader must stay enabled",
          "purchase_receipt_source manifest contract must not claim fact posting",
        ]) &&
        sourceContains(priorityDoc, [
          "P4-2 `material_supply`",
          "runtime_loader_ready",
          "purchase_receipt_source -> incoming_qc -> warehouse_inbound -> end",
          "不让 Workflow 任务完成自动调用采购、质检或库存 usecase",
          "目标环境",
        ]) &&
        sourceContains(currentTruthDoc, [
          "P4-2 `material_supply`",
          "runtime_loader_ready",
          "purchase_receipt_source -> incoming_qc -> warehouse_inbound -> end",
          "不让 Workflow 任务完成自动调用采购、质检或库存 usecase",
          "目标环境",
        ]),
      evidence: [
        "scripts/qa/customer-config-runtime-manifest.mjs",
        "scripts/qa/customer-config-runtime-manifest.test.mjs",
        priorityDoc,
        currentTruthDoc,
      ],
    },
    {
      id: "material-supply-domain-command-contract-preflight",
      status: "ready",
      category: "domain-boundary",
      description: "P4-2 material_supply 已注册 purchase_receipt.create、quality_inspection.decide 与 inventory.post_inbound handler；runtime loader 已受控启用，但不由任务完成自动写 Fact",
      pass:
        sourceContains("scripts/qa/customer-config-runtime-manifest.mjs", [
          "MATERIAL_SUPPLY_FACT_COMMAND_CONTRACTS",
          "process_runtime_handler_registered",
          "InventoryUsecase.CreatePurchaseReceiptFromPurchaseOrder",
          "purchase.create_purchase_receipt_from_purchase_order",
          "InventoryUsecase.PassQualityInspection / InventoryUsecase.RejectQualityInspection",
          "quality.pass_quality_inspection / quality.reject_quality_inspection",
          "InventoryUsecase.PostPurchaseReceipt",
          "purchase.post_purchase_receipt",
          "warehouse.inbound.confirm",
          "runtime_loader_blockers: Object.freeze([])",
          "TestPurchaseReceiptProcessDomainCommandCreateBindsUsecase",
          "TestQualityInspectionProcessDomainCommandDecidePassBindsUsecase",
          "TestInventoryProcessDomainCommandPostInboundBindsUsecase",
          "TestJsonrpcDispatcher_CreatePurchaseReceiptFromPurchaseOrderCreatesDraftOnly",
          "TestInventoryRepo_QualityInspectionLifecycleAndLotStatus",
          "TestInventoryRepo_PurchaseReceiptLifecycle",
        ]) &&
        sourceContains("server/internal/biz/purchase_receipt_process_command.go", [
          "ProcessDomainCommandPurchaseReceiptCreate",
          "InventoryUsecase",
          "CreatePurchaseReceiptFromPurchaseOrder",
          "PurchaseReceiptProcessCommandOutcomeCreated",
          "purchase_order_id",
          "warehouse_id",
        ]) &&
        sourceContains("server/internal/biz/quality_inspection_process_command.go", [
          "ProcessDomainCommandQualityInspectionDecide",
          "InventoryUsecase",
          "GetQualityInspection",
          "PassQualityInspection",
          "RejectQualityInspection",
          "QualityInspectionProcessCommandOutcomeConcession",
          "purchase_receipt_id",
          "inventory_lot_id",
        ]) &&
        sourceContains("server/internal/biz/inventory_process_command.go", [
          "ProcessDomainCommandInventoryPostInbound",
          "InventoryUsecase",
          "PostPurchaseReceipt",
          "InventoryProcessCommandOutcomeInboundPosted",
          "purchase_receipt_id",
          "receipt_no",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_dispatch.go", [
          "RegisterPurchaseReceiptProcessDomainCommandHandlers",
          "RegisterQualityInspectionProcessDomainCommandHandlers",
          "RegisterInventoryProcessDomainCommandHandlers",
        ]) &&
        sourceContains("scripts/qa/customer-config-runtime-manifest.test.mjs", [
          "process_runtime_handler_registered",
          "InventoryUsecase.PostPurchaseReceipt",
          "assert.deepEqual(inboundContract.runtime_loader_blockers, [])",
          "runtime_binding_status must stay",
          "required_test_anchors must reference existing tests",
        ]) &&
        sourceContains(priorityDoc, [
          "P4-2 `purchase_receipt.create`、`quality_inspection.decide` 和 `inventory.post_inbound` 领域命令 handler",
          "P4-2 `quality_inspection.decide` 领域命令 handler",
          "P4-2 `inventory.post_inbound` 领域命令 handler",
          "InventoryUsecase.CreatePurchaseReceiptFromPurchaseOrder",
          "InventoryUsecase.PassQualityInspection / RejectQualityInspection",
          "InventoryUsecase.PostPurchaseReceipt",
          "process_runtime_handler_registered",
          "quality_inspection.decide",
        ]) &&
        sourceContains(currentTruthDoc, [
          "P4-2 `purchase_receipt.create`、`quality_inspection.decide` 和 `inventory.post_inbound` 领域命令 handler",
          "P4-2 `quality_inspection.decide` 领域命令 handler",
          "P4-2 `inventory.post_inbound` 领域命令 handler",
          "purchase.create_purchase_receipt_from_purchase_order",
          "quality.pass_quality_inspection / quality.reject_quality_inspection",
          "purchase.post_purchase_receipt",
          "process_runtime_handler_registered",
          "runtime_loader_enabled=true",
        ]),
      evidence: [
        "scripts/qa/customer-config-runtime-manifest.mjs",
        "scripts/qa/customer-config-runtime-manifest.test.mjs",
        priorityDoc,
        currentTruthDoc,
      ],
    },
    {
      id: "material-supply-receipt-runtime-api",
      status: "ready",
      category: "process-runtime",
      description: "P4-2 material_supply 已提供已有采购入库单 -> 来料质检 -> 仓库入库的显式 start / execute API；完整采购订单到入库单 manifest loader 已受控启用但仍等待显式 execute",
      pass:
        sourceContains("server/internal/biz/customer_config.go", [
          "ProcessKeyMaterialSupply",
          "customerConfigProcessBusinessRefAllowed",
          "businessRefType == \"purchase_receipt\"",
          "customerConfigDomainCommandNodeAllowed",
          "incoming_qc",
          "warehouse_inbound",
          "ProcessDomainCommandQualityInspectionDecide",
          "ProcessDomainCommandInventoryPostInbound",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config.go", [
          "start_material_supply_process",
          "execute_material_supply_quality_decide",
          "execute_material_supply_post_inbound",
          "PermissionPurchaseReceiptCreate",
          "PermissionQualityInspectionUpdate",
          "PermissionWarehouseInboundConfirm",
          "ProcessKeyMaterialSupply",
          "writes_purchase_receipt_source_doc",
          "writes_quality_decision",
          "writes_inventory_fact",
          "workflow_task_done_posts_fact",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config_test.go", [
          "customerConfigPublishParamsWithMaterialSupplyRuntimeProcess",
          "TestCustomerConfigJSONRPCStartMaterialSupplyProcess",
          "TestCustomerConfigJSONRPCExecuteMaterialSupplyQualityAndInbound",
          "TestCustomerConfigJSONRPCStartMaterialSupplyProcessRequiresPurchasePermission",
          "purchase_receipt_iqc_inbound",
          "ProcessDomainCommandQualityInspectionDecide",
          "ProcessDomainCommandInventoryPostInbound",
        ]) &&
        sourceContains("server/internal/biz/customer_config_test.go", [
          "validMaterialSupplyRuntimeProcessDefinition",
          "TestCustomerConfigUsecaseBuildsMaterialSupplyProcessInstanceCreateFromActiveProcessDefinition",
          "TestCustomerConfigUsecaseRejectsUnsafeMaterialSupplyProcessDefinitionLoader",
          "purchase receipt create not accepted inside purchase receipt process",
        ]) &&
        sourceContains(priorityDoc, [
          "已有采购入库单 -> 来料质检 -> 仓库入库",
          "start_material_supply_process",
          "execute_material_supply_quality_decide",
          "execute_material_supply_post_inbound",
          "tracked runtime manifest 也已编译为",
        ]) &&
        sourceContains(currentTruthDoc, [
          "已有采购入库单 -> 来料质检 -> 仓库入库",
          "start_material_supply_process",
          "execute_material_supply_quality_decide",
          "execute_material_supply_post_inbound",
          "tracked runtime manifest 也已编译为",
        ]),
      evidence: [
        "server/internal/biz/customer_config.go",
        "server/internal/service/jsonrpc_customer_config.go",
        "server/internal/biz/customer_config_test.go",
        "server/internal/service/jsonrpc_customer_config_test.go",
        priorityDoc,
        currentTruthDoc,
      ],
    },
    {
      id: "material-supply-purchase-order-explicit-runtime-api",
      status: "ready",
      category: "process-runtime",
      description: "P4-2 material_supply 已提供采购订单 -> 采购收货草稿 -> 来料质检 -> 仓库入库的显式 JSON-RPC 链路；生成的采购入库单通过 linked_business_refs 接入后续节点，manifest loader 已受控启用但任务自动过账仍未启用",
      pass:
        sourceContains("server/internal/biz/process_runtime.go", [
          "ProcessInstanceLinkedBusinessRefs",
          "ApplyProcessLinkedBusinessRefToSnapshot",
          "linked_business_refs",
          "RecordProcessInstanceLinkedBusinessRef",
          "ProcessBusinessRef",
        ]) &&
        sourceContains("server/internal/biz/customer_config.go", [
          "businessRefType == \"purchase_order\"",
          "purchase_receipt_source",
          "ProcessDomainCommandPurchaseReceiptCreate",
          "ProcessDomainCommandQualityInspectionDecide",
          "ProcessDomainCommandInventoryPostInbound",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config.go", [
          "start_material_supply_purchase_order_process",
          "execute_material_supply_purchase_receipt_create",
          "purchase_order_to_purchase_receipt_quality_inbound",
          "linked_business_ref_source",
          "writes_purchase_receipt_source_doc",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config_test.go", [
          "TestCustomerConfigJSONRPCExecuteMaterialSupplyPurchaseOrderToQualityAndInbound",
          "start_material_supply_purchase_order_process",
          "execute_material_supply_purchase_receipt_create",
          "linked_business_refs",
          "purchase_order_to_purchase_receipt_quality_inbound",
        ]) &&
        sourceContains("server/internal/biz/purchase_receipt_process_command_test.go", [
          "expected process runtime to record generated purchase receipt ref",
          "RefType != \"purchase_receipt\"",
          "SourceCommandKey != ProcessDomainCommandPurchaseReceiptCreate",
        ]) &&
        sourceContains(priorityDoc, [
          "start_material_supply_purchase_order_process",
          "execute_material_supply_purchase_receipt_create",
          "linked_business_refs",
          "采购订单 -> 采购收货草稿 -> 来料质检 -> 仓库入库",
          "tracked runtime manifest 也已编译为",
        ]) &&
        sourceContains(currentTruthDoc, [
          "start_material_supply_purchase_order_process",
          "execute_material_supply_purchase_receipt_create",
          "linked_business_refs",
          "采购订单 -> 采购收货草稿 -> 来料质检 -> 仓库入库",
          "tracked runtime manifest 也已编译为",
        ]),
      evidence: [
        "server/internal/biz/process_runtime.go",
        "server/internal/biz/customer_config.go",
        "server/internal/service/jsonrpc_customer_config.go",
        "server/internal/service/jsonrpc_customer_config_test.go",
        "server/internal/biz/purchase_receipt_process_command_test.go",
        priorityDoc,
        currentTruthDoc,
      ],
    },
    {
      id: "finished-goods-shipment-finance-contract-preflight",
      status: "ready",
      category: "domain-boundary",
      description: "P4-3 成品质检、财务放行、仓库出货和应收线索已定位到现有 shipment / finance JSON-RPC 锚点与 shipment_release Workflow-only 边界；当前仓库出货已启用显式 shipment.ship handler，其余节点仍只证明合同预检，且 Workflow task done 不自动过账",
      pass:
        sourceContains("server/README.md", [
          "create_shipment_with_items",
          "ship_shipment",
          "ship_shipment` 才把出货单推进到 `SHIPPED` 并写库存 `OUT`",
          "shipment_release done` 不会自动调用这些接口",
          "P4-3 当前已完成合同预检、manifest 定义证据和 start-only loader",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_operational_fact_shipment.go", [
          "create_shipment_with_items",
          "ship_shipment",
          "PermissionShipmentShip",
          "CancelShippedShipment",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_operational_fact_finance.go", [
          "create_finance_fact",
          "post_finance_fact",
          "settle_finance_fact",
          "cancel_finance_fact",
          "PermissionFinanceReceivableConfirm",
          "financeFactCreateFromParams",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_operational_fact_test.go", [
          "TestJsonrpcDispatcher_ShipmentAPIRequiresDedicatedShipmentPermissions",
          "ship_shipment",
          "PermissionShipmentShip",
          "TestFinanceFactCreateFromParamsParsesFeeAndCurrency",
          "RECEIVABLE",
          "ACCOUNTS_RECEIVABLE",
        ]) &&
        sourceContains("server/internal/biz/workflow_shipment_release_test.go", [
          "TestWorkflowUsecase_ShipmentReleaseDoneUpsertsShippingReleasedOnly",
          "inventory_out_deferred",
          "receivable_deferred",
          "invoice_deferred",
          "shipment release done must not derive downstream task",
          "shipment_result",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_workflow_test.go", [
          "TestJsonrpcDispatcher_WorkflowUpdateTaskStatusRemoved",
          "expected update_task_status removed as unknown method",
          "expected complete_task_action to write done status",
          "complete_task_action",
        ]) &&
        sourceContains(priorityDoc, [
          "成品质检 -> 财务放行 -> 仓库出货 -> 应收线索",
          "`shipment_release`",
          "自动调用出货、库存扣减、应收或开票事实",
          "runtime_loader_start_ready",
          "OperationalFactUsecase.ShipShipment",
        ]) &&
        sourceContains(currentTruthDoc, [
          "出货单 `SHIPPED` 才是真实出货事实",
          "出货放行不是发货",
          "runtime_loader_start_ready",
          "OperationalFactUsecase.ShipShipment",
        ]),
      evidence: [
        "server/README.md",
        "server/internal/service/jsonrpc_operational_fact_shipment.go",
        "server/internal/service/jsonrpc_operational_fact_finance.go",
        "server/internal/service/jsonrpc_operational_fact_test.go",
        "server/internal/biz/workflow_shipment_release_test.go",
        "server/internal/service/jsonrpc_workflow_test.go",
        priorityDoc,
        currentTruthDoc,
      ],
    },
    {
      id: "finished-goods-delivery-definition-evidence",
      status: "ready",
      category: "customer-config",
      description: "P4-3 finished_goods_delivery 已进入客户配置 runtime manifest 的 start-only loader，并可通过 start_finished_goods_delivery_process 显式启动；成品质检、财务放行、仓库出货和应收线索节点均已注册显式 ProcessRuntime handler；目标环境 evidence blocker 仍保留，Workflow task done 仍不自动写 Fact",
      pass:
        sourceContains("scripts/qa/customer-config-runtime-manifest.mjs", [
          "FINISHED_GOODS_DELIVERY_PROCESS_KEY",
          "finished_goods_delivery",
          "quality_finance_ship_receivable",
          "runtime_loader_start_ready",
          "runtime_loader_enabled: true",
          "finished_goods_quality.decide",
          "shipment.finance_release",
          "shipment.ship",
          "finance.receivable_lead",
          "InventoryUsecase.PassQualityInspection / RejectQualityInspection",
          "process_runtime_handler_registered",
          "finishedGoodsHandlerRegisteredNodeKeys",
          "process_runtime_handler: OperationalFactUsecase.GetShipment",
          "process_runtime_handler: OperationalFactUsecase.ShipShipment",
          "process_runtime_handler: OperationalFactUsecase.CreateFinanceFactDraft",
          "customer_config.execute_finished_goods_delivery_quality_decide",
          "customer_config.execute_finished_goods_delivery_finance_release",
          "customer_config.execute_finished_goods_delivery_shipment_ship",
          "customer_config.execute_finished_goods_delivery_receivable_lead",
        ]) &&
        sourceContains("scripts/qa/customer-config-runtime-manifest.test.mjs", [
          "compiles finished goods delivery as start-only loader",
          "runtime_loader_start_ready",
          "runtime_loader_enabled, true",
          "process_runtime_handler_registered",
          "shipment_finance_release",
          "InventoryUsecase.PassQualityInspection/RejectQualityInspection",
        ]) &&
        sourceContains("server/internal/biz/customer_config.go", [
          "ExplainProcessDefinition",
          "customer_config.explain_process_definition",
          "ProcessKeyFinishedGoodsDelivery",
          "ProcessDomainCommandShipmentShip",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config.go", [
          "explain_process_definition",
          "start_finished_goods_delivery_process",
          "execute_finished_goods_delivery_quality_decide",
          "execute_finished_goods_delivery_finance_release",
          "execute_finished_goods_delivery_shipment_ship",
          "execute_finished_goods_delivery_receivable_lead",
          "ProcessDomainCommandFinishedGoodsQualityDecide",
          "ProcessDomainCommandShipmentFinanceRelease",
          "ProcessDomainCommandShipmentShip",
          "ProcessDomainCommandFinanceReceivableLead",
          "customerProcessDefinitionExplanationToMap",
          "can_start_runtime",
          "can_execute_runtime_commands",
        ]) &&
        sourceContains("server/internal/biz/customer_config_test.go", [
          "TestCustomerConfigUsecaseExplainProcessDefinitionFinishedGoodsDeliveryStartReady",
          "TestCustomerConfigUsecaseBuildFinishedGoodsDeliveryStartOnlyProcess",
          "runtime_loader_start_ready",
          "ProcessDomainCommandShipmentShip",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config_test.go", [
          "TestCustomerConfigJSONRPCExplainProcessDefinitionFinishedGoodsDelivery",
          "TestCustomerConfigJSONRPCStartFinishedGoodsDeliveryProcess",
          "TestCustomerConfigJSONRPCStartFinishedGoodsDeliveryRequiresShipmentPermission",
          "TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryQualityDecideGuardedByMissingHandler",
          "TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryQualityDecideRunsRegisteredHandler",
          "TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryQualityDecideRequiresQualityPermission",
          "TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryFinanceReleaseRunsRegisteredHandler",
          "TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryFinanceReleaseRequiresFinancePermission",
          "TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryShipmentShipRunsRegisteredHandler",
          "TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryShipmentShipRequiresShipmentPermission",
          "TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryReceivableLeadCreatesDraft",
          "TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryReceivableLeadRequiresFinancePermission",
          "TestCustomerConfigJSONRPCExplainProcessDefinitionRequiresReadPermission",
          "start_finished_goods_delivery_process",
          "execute_finished_goods_delivery_quality_decide",
          "execute_finished_goods_delivery_finance_release",
          "execute_finished_goods_delivery_shipment_ship",
          "execute_finished_goods_delivery_receivable_lead",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_quality.go", [
          "create_finished_goods_quality_inspection_draft",
          "list_finished_goods_quality_inspections",
          "CreateFinishedGoodsQualityInspectionDraft",
          "ListFinishedGoodsQualityInspections",
          "QualityInspectionSourceShipment",
          "QualityInspectionTypeFinishedGoods",
          "QualityInspectionSubjectProduct",
        ]) &&
        sourceContains("server/internal/biz/quality_inspection.go", [
          "CreateFinishedGoodsQualityInspectionDraft",
          "ListFinishedGoodsQualityInspections",
          "normalizeFinishedGoodsQualityInspectionCreate",
          "normalizeFinishedGoodsQualityInspectionFilter",
          "QualityInspectionSourceShipment",
          "QualityInspectionTypeFinishedGoods",
          "QualityInspectionSubjectProduct",
        ]) &&
        sourceContains("server/internal/data/quality_inspection_repo.go", [
          "CreateFinishedGoodsQualityInspectionDraft",
          "validateFinishedGoodsQualityInspectionReferences",
          "ShipmentStatusDraft",
          "validateFinishedGoodsQualityInspectionLot",
          "shipmentitem.ShipmentID",
        ]) &&
        sourceContains("server/internal/data/inventory_repo_quality_inspection_test.go", [
          "TestInventoryRepo_FinishedGoodsQualityInspectionReferenceValidation",
          "ordinary quality list must reject shipment source",
          "finished goods quality must reject material lot",
          "finished goods quality must require matching shipment item",
          "finished goods quality must reject non-draft shipment",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_quality_test.go", [
          "TestJsonrpcDispatcher_FinishedGoodsQualityInspectionAPIBindsShipmentFact",
          "create_finished_goods_quality_inspection_draft",
          "list_finished_goods_quality_inspections",
          "ordinary quality list must keep incoming boundary",
        ]) &&
        sourceContains("server/internal/biz/finished_goods_delivery_process_test.go", [
          "TestFinishedGoodsDeliveryProcessRunsLocalGoldenChain",
          "ProcessDomainCommandFinishedGoodsQualityDecide",
          "ProcessDomainCommandShipmentFinanceRelease",
          "ProcessDomainCommandShipmentShip",
          "ProcessDomainCommandFinanceReceivableLead",
          "FinanceProcessCommandOutcomeReceivableLeadCreated",
          "ProcessStatusCompleted",
          "receivable lead must not post/settle/cancel finance fact",
        ]) &&
        sourceContains("server/internal/biz/shipment_process_command.go", [
          "RegisterShipmentProcessDomainCommandHandlers",
          "ProcessDomainCommandShipmentFinanceRelease",
          "ProcessDomainCommandShipmentShip",
          "OperationalFactUsecase",
          "GetShipment",
          "ShipShipment",
          "ShipmentProcessCommandOutcomeFinanceReleased",
          "ShipmentProcessCommandOutcomeShipped",
        ]) &&
        sourceContains("server/internal/biz/shipment_process_command_test.go", [
          "TestShipmentProcessDomainCommandShipBindsUsecase",
          "TestShipmentProcessDomainCommandFinanceReleaseBindsUsecase",
          "TestShipmentProcessDomainCommandFinanceReleaseRequiresDraftShipment",
          "TestShipmentProcessDomainCommandShipRejectsMismatchedBusinessRef",
          "TestShipmentProcessDomainCommandShipRequiresShipment",
        ]) &&
        sourceContains("config/customers/yoyoosun/customerPackage.mjs", [
          "finished_goods_delivery",
          "finished_goods_quality_decide",
          "release_shipment_finance",
          "ship_shipment",
          "create_receivable_lead",
          "workflow_only",
        ]) &&
        sourceContains("config/customers/demo/customerPackage.mjs", [
          "demo_finished_goods_delivery",
          "finished_goods_quality_decide",
          "release_shipment_finance",
          "ship_shipment",
          "create_receivable_lead",
          "workflow_only",
        ]) &&
        sourceContains("config/catalog/customerPackageCatalog.mjs", [
          "finished_goods_quality_decide",
          "release_shipment_finance",
          "ship_shipment",
          "create_receivable_lead",
          "runtimeEnabled: false",
        ]) &&
        sourceContains(priorityDoc, [
          "finished_goods_delivery / quality_finance_ship_receivable",
          "manifest_status=runtime_loader_start_ready",
          "runtime_loader_enabled=true",
          "customer_config.explain_process_definition",
          "customer_config.start_finished_goods_delivery_process",
          "customer_config.execute_finished_goods_delivery_quality_decide",
          "customer_config.execute_finished_goods_delivery_finance_release",
          "customer_config.execute_finished_goods_delivery_shipment_ship",
          "customer_config.execute_finished_goods_delivery_receivable_lead",
          "finished_goods_quality.decide",
          "InventoryUsecase.PassQualityInspection",
          "OperationalFactUsecase.GetShipment",
          "OperationalFactUsecase.ShipShipment",
          "OperationalFactUsecase.CreateFinanceFactDraft",
          "create_finished_goods_quality_inspection_draft",
          "list_finished_goods_quality_inspections",
          "产品批次置为 `HOLD`",
        ]) &&
        sourceContains(currentTruthDoc, [
          "finished_goods_delivery / quality_finance_ship_receivable",
          "manifest_status=runtime_loader_start_ready",
          "runtime_loader_enabled=true",
          "customer_config.explain_process_definition",
          "customer_config.start_finished_goods_delivery_process",
          "customer_config.execute_finished_goods_delivery_quality_decide",
          "customer_config.execute_finished_goods_delivery_finance_release",
          "customer_config.execute_finished_goods_delivery_shipment_ship",
          "customer_config.execute_finished_goods_delivery_receivable_lead",
          "finished_goods_quality.decide",
          "InventoryUsecase.PassQualityInspection",
          "OperationalFactUsecase.GetShipment",
          "OperationalFactUsecase.ShipShipment",
          "OperationalFactUsecase.CreateFinanceFactDraft",
          "create_finished_goods_quality_inspection_draft",
          "list_finished_goods_quality_inspections",
          "产品批次置为 `HOLD`",
        ]),
      evidence: [
        "scripts/qa/customer-config-runtime-manifest.mjs",
        "scripts/qa/customer-config-runtime-manifest.test.mjs",
        "config/customers/yoyoosun/customerPackage.mjs",
        "config/customers/demo/customerPackage.mjs",
        "config/catalog/customerPackageCatalog.mjs",
        "server/internal/biz/customer_config.go",
        "server/internal/service/jsonrpc_customer_config.go",
        "server/internal/biz/customer_config_test.go",
        "server/internal/service/jsonrpc_customer_config_test.go",
        "server/internal/service/jsonrpc_quality.go",
        "server/internal/biz/quality_inspection.go",
        "server/internal/data/quality_inspection_repo.go",
        "server/internal/data/inventory_repo_quality_inspection_test.go",
        "server/internal/service/jsonrpc_quality_test.go",
        "server/internal/biz/finished_goods_delivery_process_test.go",
        priorityDoc,
        currentTruthDoc,
      ],
    },
    {
      id: "finished-goods-finance-release-handler-registered",
      status: "ready",
      category: "domain-boundary",
      description: "P4-3 finished_goods_delivery 财务放行 handler 已注册，显式校验 draft shipment 放行门禁并且不触发出货、库存或 finance fact",
      pass:
        sourceContains("scripts/qa/customer-config-runtime-manifest.mjs", [
          "finishedGoodsHandlerRegisteredNodeKeys",
          "finished_goods_quality",
          "shipment_finance_release",
          "shipment_execution",
          "receivable_lead",
          "process_runtime_handler: OperationalFactUsecase.GetShipment",
          "OperationalFactUsecase.CreateFinanceFactDraft",
        ]) &&
        sourceContains("scripts/qa/customer-config-runtime-manifest.test.mjs", [
          "finished_goods_quality",
          "shipment_finance_release",
          "process_runtime_handler_registered",
          "OperationalFactUsecase.CreateFinanceFactDraft",
        ]) &&
        sourceContains("server/internal/biz/shipment_process_command.go", [
          "ProcessDomainCommandShipmentFinanceRelease",
          "shipmentFinanceReleaseProcessCommandHandler",
          "ShipmentProcessCommandOutcomeFinanceReleased",
          "GetShipment",
          "ShipmentStatusDraft",
        ]) &&
        sourceContains("server/internal/biz/shipment_process_command_test.go", [
          "TestShipmentProcessDomainCommandFinanceReleaseBindsUsecase",
          "TestShipmentProcessDomainCommandFinanceReleaseRequiresDraftShipment",
          "finance release must not ship inventory",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config_test.go", [
          "TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryFinanceReleaseRunsRegisteredHandler",
          "finance release must not ship or create finance fact",
          "shipment_finance_release_domain_command",
        ]) &&
        sourceContains(priorityDoc, [
          "shipment_finance_release",
          "process_runtime_handler_registered=true",
          "finance.receivable_lead",
          "CreateFinanceFactDraft",
        ]) &&
        sourceContains(currentTruthDoc, [
          "shipment_finance_release",
          "process_runtime_handler_registered=true",
          "finance.receivable_lead",
          "CreateFinanceFactDraft",
        ]) &&
        sourceContains("server/README.md", [
          "execute_finished_goods_delivery_finance_release",
          "OperationalFactUsecase.GetShipment",
          "不写出货、库存流水、应收、开票或财务 Fact",
        ]),
      evidence: [
        "scripts/qa/customer-config-runtime-manifest.mjs",
        "scripts/qa/customer-config-runtime-manifest.test.mjs",
        "server/internal/biz/shipment_process_command.go",
        "server/internal/biz/shipment_process_command_test.go",
        "server/internal/service/jsonrpc_customer_config_test.go",
        priorityDoc,
        currentTruthDoc,
        "server/README.md",
      ],
    },
    {
      id: "workflow-task-configured-candidates-explain",
      status: "ready",
      category: "workflow",
      description: "只读 explain 可按 owner_pool、action capability 和 customer scope 反查配置候选责任角色",
      pass:
        sourceContains("server/internal/biz/customer_config.go", [
          "WorkflowCandidateOwnerRoleKeys",
          "ListWorkPoolMembershipsByPools",
          "workflowEntitlementRoleKeysWithCapabilities",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_workflow_task.go", [
          "configured_candidate_owner_role_keys",
          "action_configured_candidate_owner_role_keys",
          "configured_candidate_source",
        ]) &&
        sourceContains("server/internal/biz/customer_config_test.go", [
          "TestCustomerConfigUsecaseWorkflowCandidateOwnerRoleKeysRequiresCapabilityAndScope",
          "TestCustomerConfigUsecaseWorkflowCandidateOwnerRoleKeysNoActiveConfig",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_workflow_test.go", [
          "configured_candidate_owner_role_keys",
          "action_configured_candidate_owner_role_keys",
          "configuredCompleteCandidates",
        ]) &&
        sourceContains(priorityDoc, [
          "配置候选角色解释",
          "不暴露 user-level 候选人",
        ]),
      evidence: [
        "server/internal/biz/customer_config.go",
        "server/internal/service/jsonrpc_workflow_task.go",
        "server/internal/biz/customer_config_test.go",
        "server/internal/service/jsonrpc_workflow_test.go",
        priorityDoc,
      ],
    },
    {
      id: "engineering-minimum-entry",
      status: "ready",
      category: "role-entry",
      description: "engineering 角色具备岗位入口、移动端权限映射、seed/RBAC 和客户配置投影",
      pass:
        sourceContains("web/src/erp/config/appRegistry.mjs", [
          "roleKey: 'engineering'",
          "工程岗位任务端",
          "engineering",
        ]) &&
        sourceContains("web/src/erp/config/entryConfig.test.mjs", [
          "resolveMobileTasksPath('engineering')",
          "/m/engineering/tasks",
        ]) &&
        sourceContains("web/src/erp/utils/mobileRolePermissions.mjs", [
          "mobile.engineering.access",
          "engineering",
        ]) &&
        sourceContains("server/internal/data/admin_role_demo_seed.go", [
          "demo_engineering",
          "engineering",
        ]) &&
        sourceContains("config/customers/yoyoosun/customerPackage.mjs", [
          "engineering",
          "ownerPool: \"engineering\"",
        ]) &&
        sourceContains("scripts/qa/customer-config-runtime-manifest.test.mjs", [
          "mobile.engineering.access",
          "engineeringMembership.role_key",
        ]),
      evidence: [
        "web/src/erp/config/appRegistry.mjs",
        "web/src/erp/config/entryConfig.test.mjs",
        "web/src/erp/utils/mobileRolePermissions.mjs",
        "server/internal/data/admin_role_demo_seed.go",
        "config/customers/yoyoosun/customerPackage.mjs",
        "scripts/qa/customer-config-runtime-manifest.test.mjs",
      ],
    },
    {
      id: "customer-config-runtime-schema",
      status: "ready",
      category: "customer-config",
      description: "客户配置运行时主路径已有 Ent schema 和 Atlas migration",
      pass:
        fileExists("server/internal/data/model/schema/customer_config_revision.go") &&
        fileExists("server/internal/data/model/schema/deployment_module_state.go") &&
        fileExists("server/internal/data/model/schema/role_profile.go") &&
        fileExists("server/internal/data/model/schema/access_entitlement.go") &&
        fileExists("server/internal/data/model/schema/work_pool.go") &&
        fileExists("server/internal/data/model/schema/work_pool_membership.go") &&
        anyMigrationContains([
          "customer_config_revisions",
          "deployment_module_states",
          "role_profiles",
          "access_entitlements",
          "work_pools",
          "work_pool_memberships",
        ]),
      evidence: [
        "server/internal/data/model/schema/customer_config_revision.go",
        "server/internal/data/model/schema/deployment_module_state.go",
        "server/internal/data/model/schema/role_profile.go",
        "server/internal/data/model/schema/access_entitlement.go",
        "server/internal/data/model/schema/work_pool.go",
        "server/internal/data/model/schema/work_pool_membership.go",
        "server/internal/data/model/migrate/*.sql",
      ],
    },
    {
      id: "customer-config-usecase-repo-api-rbac",
      status: "ready",
      category: "customer-config",
      description: "客户配置已进入 usecase / repo / JSON-RPC / RBAC / 审计测试闭环",
      pass:
        sourceContains("server/internal/biz/customer_config.go", [
          "ValidateCustomerConfig",
          "PublishCustomerConfig",
          "ActivateCustomerConfig",
          "RollbackCustomerConfig",
          "GetEffectiveSession",
          "ErrCustomerConfigActiveRevision",
        ]) &&
        sourceContains("server/internal/data/customer_config_repo.go", [
          "PublishCustomerConfig",
          "ActivateCustomerConfig",
          "RollbackCustomerConfig",
          "runtime_audit_events",
          "customer_config.publish",
          "customer_config.rollback",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config.go", [
          "validate_customer_config",
          "publish_customer_config",
          "activate_customer_config",
          "rollback_customer_config",
          "get_effective_session",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_customer_config_test.go", [
          "want permission denied",
          "publish_customer_config",
          "activate_customer_config",
          "rollback_customer_config",
          "get_effective_session",
        ]) &&
        sourceContains("server/internal/biz/customer_config_test.go", [
          "ErrCustomerConfigActiveRevision",
          "builtin_rbac_fallback",
          "TestCustomerConfigUsecasePublishActivateAndEffectiveSession",
        ]) &&
        sourceContains("server/internal/data/customer_config_repo_test.go", [
          "runtime_audit_events",
          "customer_config.publish",
          "customer_config.rollback",
        ]),
      evidence: [
        "server/internal/biz/customer_config.go",
        "server/internal/data/customer_config_repo.go",
        "server/internal/service/jsonrpc_customer_config.go",
        "server/internal/service/jsonrpc_customer_config_test.go",
        "server/internal/biz/customer_config_test.go",
        "server/internal/data/customer_config_repo_test.go",
      ],
    },
    {
      id: "demo-customer-package-compile",
      status: "ready",
      category: "customer-config",
      description: "中性 demo 客户配置包已接入 lint / runtime manifest 编译，证明客户包不是 yoyoosun 单客户硬编码",
      pass:
        fileExists("config/customers/demo/customerPackage.mjs") &&
        fileExists("config/customers/demo/README.md") &&
        sourceContains("scripts/qa/customer-package-lint.mjs", [
          "demoCustomerPackage",
          "demo:",
          "validateModuleStates",
          "packageKey must be namespaced by customerKey",
        ]) &&
        sourceContains("scripts/qa/customer-config-runtime-manifest.mjs", [
          "demoCustomerPackage",
          "moduleStateOverridesFromPackage",
          "scope_value: customerKey",
          "compiled_snapshot.customer.key must match customer_key",
          "work pool role ${membership.role_key} must have workflow.task.read",
        ]) &&
        sourceContains("scripts/qa/customer-package-lint.test.mjs", [
          "demo package proves customer package validation is not yoyoosun-only",
          "moduleStates stay catalog-bound and explain non-enabled modules",
        ]) &&
        sourceContains("scripts/qa/customer-config-runtime-manifest.test.mjs", [
          "compiles controlled module state overrides",
          "compiles neutral demo package without yoyoosun scope",
          "enforces entitlement and work pool integrity",
        ]) &&
        sourceContains("web/src/erp/config/devCustomerConfig.mjs", [
          "moduleStateCatalogCount",
          "模块状态只允许登记模块和启用 / 只读 / 关闭；非启用必须写原因。",
          "buildPrintTemplateFieldSummary",
          "销售订单受理未接打印模板",
        ]) &&
        sourceContains("web/src/erp/config/devCustomerConfig.test.mjs", [
          "moduleStates 进入控制台预检但不改变默认客户包",
          "moduleStateCounts.disabled",
          "打印模板字段只读进入客户配置控制台",
        ]),
      evidence: [
        "config/customers/demo/customerPackage.mjs",
        "config/customers/demo/README.md",
        "scripts/qa/customer-package-lint.mjs",
        "scripts/qa/customer-config-runtime-manifest.mjs",
        "scripts/qa/customer-package-lint.test.mjs",
        "scripts/qa/customer-config-runtime-manifest.test.mjs",
        "web/src/erp/config/devCustomerConfig.mjs",
        "web/src/erp/config/devCustomerConfig.test.mjs",
      ],
    },
    {
      id: "customer-config-frontend-projection",
      status: "ready",
      category: "frontend",
      description: "正式前端消费 get_effective_session，把页面 / 动作 / 字段策略投影到 admin profile",
      pass:
        sourceContains("web/src/erp/api/customerConfigApi.mjs", [
          "get_effective_session",
        ]) &&
        sourceContains("web/src/erp/utils/adminProfileSync.mjs", [
          "effectiveSession",
          "fieldPolicies",
          "pages",
        ]) &&
        sourceContainsAny("web/src/erp/components/ERPLayout.jsx", [
          "effectiveSession",
          "visiblePage",
          "allowedPage",
        ]) &&
        fileExists("scripts/qa/formal-frontend-customer-config-boundary.test.mjs") &&
        sourceContains("scripts/qa/formal-frontend-customer-config-boundary.test.mjs", [
          "get_effective_session",
          "filterColumnsByEffectiveFieldPolicy",
          "config/customers/",
        ]) &&
        sourceContains("web/src/erp/utils/adminProfileSync.test.mjs", [
          "active revision 空页面清单不回退 RBAC-only",
          "当前页面被 effective session 隐藏时需要跳转",
          "本地开发可按 RBAC 查看客户配置隐藏页用于诊断",
          "模块 disabled 后端投影隐藏业务页时正式账号需要跳转",
        ]) &&
        sourceContains("web/scripts/style-l1/scenarios.mjs", [
          "erp-effective-session-super-admin-product-core",
          "erp-effective-session-direct-url-local-dev-diagnostic",
          "erp-effective-session-sync-failure-local-dev-diagnostic",
          "erp-effective-session-empty-pages-local-dev-diagnostic",
          "erp-no-visible-menu-blocks-outlet",
          "erp-effective-session-action-projection-business-pages",
          "SHIP-STYLE-L1",
          "当前账号暂无可见后台入口",
          "当前客户有效配置的页面清单",
          "actions 为空时不应允许",
        ]),
      evidence: [
        "web/src/erp/api/customerConfigApi.mjs",
        "web/src/erp/utils/adminProfileSync.mjs",
        "web/src/erp/components/ERPLayout.jsx",
        "scripts/qa/formal-frontend-customer-config-boundary.test.mjs",
        "web/scripts/style-l1/scenarios.mjs",
      ],
    },
    {
      id: "domain-command-entry-remains-guarded",
      status: "guarded",
      category: "workflow-fact",
      description: "领域命令闭环尚未开放任务自动过账，Workflow / Fact 边界由 QA 守卫锁住",
      pass:
        sourceContains(priorityDoc, [
          "尚未开放任务自动过账",
          "Workflow task done 不等于 Fact posted",
        ]) &&
        fileExists("scripts/qa/workflow-fact-boundary.test.mjs") &&
        sourceContains("scripts/qa/workflow-fact-boundary.test.mjs", [
          "OperationalFactUsecase",
          "inventory_txns",
          "finance_facts",
        ]),
      evidence: [priorityDoc, "scripts/qa/workflow-fact-boundary.test.mjs"],
    },
    {
      id: "domain-command-entry-explain-guard",
      status: "ready",
      category: "workflow-fact",
      description: "Workflow explain 已暴露领域命令进入条件，但默认仍保持不会写 Fact",
      pass:
        sourceContains("server/internal/service/jsonrpc_workflow_task.go", [
          "domain_command_entry",
          "action_domain_command_entries",
          "guarded_no_domain_command_contract",
          "will_write_fact",
          "workflow_payload_command_key_ignored",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_workflow_test.go", [
          "TestJsonrpcDispatcher_WorkflowExplainActionAccessIgnoresPayloadDomainCommandKey",
          "domain_command_entry",
          "action_domain_command_entries",
        ]) &&
        sourceContains("scripts/qa/workflow-fact-boundary.test.mjs", [
          "workflow explain exposes guarded domain command entry",
          "domain_command_contract_not_configured",
        ]) &&
        sourceContains(priorityDoc, [
          "领域命令进入条件只读解释",
          "仍不开放任务自动过账",
        ]),
      evidence: [
        "server/internal/service/jsonrpc_workflow_task.go",
        "server/internal/service/jsonrpc_workflow_test.go",
        "scripts/qa/workflow-fact-boundary.test.mjs",
        priorityDoc,
      ],
    },
    {
      id: "super-admin-break-glass-controlled-runtime",
      status: "ready",
      category: "workflow-rbac",
      description: "super admin 默认不处理业务任务；显式 break-glass 需要原因、有效期和 runtime audit，raw update_task_status 已退出",
      pass:
        !sourceContains("server/internal/biz/workflow_metadata.go", [
          "admin.IsSuperAdmin && isShipmentReleaseTask",
        ]) &&
        !sourceContains("server/internal/service/jsonrpc_workflow_task.go", [
          "super_admin_shipment_release",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_workflow_task.go", [
          "break_glass_reason",
          "break_glass_expires_at",
          "workflowBreakGlassMaxDuration",
          "RecordWorkflowBreakGlassAudit",
          "workflowAdminCanUseBreakGlass",
        ]) &&
        sourceContains("server/internal/biz/admin_manage.go", [
          "workflowBreakGlassEventType",
          "workflow_task.break_glass",
          "RecordWorkflowBreakGlassAudit",
          "break_glass",
        ]) &&
        sourceContains("server/internal/service/jsonrpc_workflow_test.go", [
          "TestJsonrpcDispatcher_WorkflowUpdateTaskStatusRemoved",
          "expected update_task_status removed as unknown method",
          "super admin can urge but cannot handle business task without owner role",
          "TestJsonrpcDispatcher_WorkflowCompleteTaskActionAllowsAuditedSuperAdminBreakGlass",
          "TestJsonrpcDispatcher_WorkflowBreakGlassRejectsMissingOrInvalidScope",
        ]) &&
        sourceContains(priorityDoc, [
          "break-glass",
          "super admin",
          "单次受控",
        ]) &&
        sourceContains("docs/当前真源与交接顺序.md", [
          "break-glass",
          "super admin",
          "单次受控",
        ]) &&
        sourceContains("server/README.md", [
          "break-glass",
          "super admin",
          "单次受控",
        ]),
      evidence: [
        "server/internal/biz/workflow_metadata.go",
        "server/internal/service/jsonrpc_workflow_task.go",
        "server/internal/service/jsonrpc_workflow_test.go",
        priorityDoc,
        "docs/当前真源与交接顺序.md",
        "server/README.md",
      ],
    },
    {
      id: "second-customer-responsibility-pool-difference",
      status: "ready",
      category: "customer-config",
      description: "demo 与 yoyoosun 证明同一 runtime 责任池可映射给不同角色，且不改流程定义",
      pass:
        sourceContains("config/customers/demo/customerPackage.mjs", [
          "workPoolRoleOverrides",
          "order_review",
          "sales",
        ]) &&
        sourceContains("scripts/qa/customer-config-runtime-manifest.mjs", [
          "workPoolRoleOverrides",
          "roleKeyForPool",
          "RUNTIME_PROCESS_POOL_KEYS",
        ]) &&
        sourceContains("scripts/qa/customer-config-runtime-manifest.test.mjs", [
          "same responsibility pool can map to different customer roles",
          "demoOrderReview",
          "yoyoosunOrderReview",
          "owner_pool_key",
        ]) &&
        sourceContains(priorityDoc, [
          "同一 runtime 责任池",
          "demo",
          "yoyoosun",
        ]),
      evidence: [
        "config/customers/demo/customerPackage.mjs",
        "scripts/qa/customer-config-runtime-manifest.mjs",
        "scripts/qa/customer-config-runtime-manifest.test.mjs",
        priorityDoc,
      ],
    },
    {
      id: "release-evidence-target-remains-evidence-required",
      status: "evidence-required",
      category: "release",
      description: "发布证据脚本只证明本地门禁和证据绑定，不替代真实目标环境发布 / smoke / 恢复 / 回滚",
      pass:
        fileExists("scripts/deploy/release-evidence-status.mjs") &&
        fileExists("scripts/deploy/release-evidence-gate.mjs") &&
        sourceContains("scripts/deploy/release-evidence-status.mjs", [
          "closeoutChecklist",
          "closeoutSummary",
          "backup-restore-rehearsal",
          "target-smoke",
          "customer-config-effective-session",
          "notProvenByThisHelper",
        ]) &&
        sourceContains(priorityDoc, [
          "closeout evidence checklist",
          "不调用后端、不执行 migration、不发布客户配置、不导入真实数据、不跑目标环境 smoke",
          "真实导入、目标环境备份恢复、部署回滚仍需按现有 import / release / production preflight 专项执行",
        ]) &&
        sourceContains("docs/当前真源与交接顺序.md", [
          "priority audit",
          "真实目标环境发布",
        ]),
      evidence: [
        "scripts/deploy/release-evidence-status.mjs",
        "scripts/deploy/release-evidence-gate.mjs",
        priorityDoc,
        "docs/当前真源与交接顺序.md",
      ],
    },
    {
      id: "release-preflight-fast-gate",
      status: "ready",
      category: "release",
      description: "生产 preflight 脱敏报告、固定镜像和低配部署边界已接入 fast / strict 测试",
      pass:
        sourceContains("scripts/qa/fast.sh", [
          "production-preflight",
          "scripts/deploy/production-preflight.test.mjs",
        ]) &&
        sourceContains("scripts/qa/strict.sh", [
          "production-preflight",
          "scripts/deploy/production-preflight.test.mjs",
        ]) &&
        sourceContains("scripts/deploy/production-preflight.test.mjs", [
          "writes sanitized report",
          "rejects floating app image tags",
          "rejects build sections in production compose",
        ]),
      evidence: [
        "scripts/qa/fast.sh",
        "scripts/qa/strict.sh",
        "scripts/deploy/production-preflight.test.mjs",
      ],
    },
  ];
}

export function runPriorityAudit({
  releaseEvidenceDir = DEFAULT_RELEASE_EVIDENCE_DIR,
  runtimeEnvFile = DEFAULT_RUNTIME_ENV_FILE,
} = {}) {
  const releaseEvidenceProgress = buildReleaseEvidenceProgress({
    releaseEvidenceDir,
    runtimeEnvFile,
  });
  const checks = collectChecks().map((check) => ({
    ...check,
    pass: Boolean(check.pass),
  }));
  const referenceCoverage = buildReferenceCoverage({
    checks,
    releaseEvidenceProgress,
  });
  const completionAudit = buildCompletionAudit({
    referenceCoverage,
    releaseEvidenceProgress,
  });
  const implementationOrder = buildImplementationOrder({
    checks,
    referenceCoverage,
    releaseEvidenceProgress,
  });
  const counts = checks.reduce(
    (acc, check) => {
      acc.total += 1;
      acc[check.pass ? "passed" : "failed"] += 1;
      acc.statuses[check.status] = (acc.statuses[check.status] || 0) + 1;
      return acc;
    },
    { total: 0, passed: 0, failed: 0, statuses: {} },
  );
  return {
    ok: counts.failed === 0,
    readOnly: true,
    releaseReady: releaseEvidenceProgress.ready,
    scope: PRIORITY_AUDIT_SCOPE,
    source: "docs/product/多甲方角色能力流程编排优先级.md",
    referenceCoverage,
    implementationOrder,
    completionAudit,
    releaseEvidenceProgress,
    counts,
    checks,
  };
}

function formatAudit(audit) {
  const lines = [
    `multi-client role workflow priority audit: ${audit.ok ? "ok" : "failed"}`,
    `source: ${audit.source}`,
    `checks: ${audit.counts.passed}/${audit.counts.total} passed`,
    `ready means: ${audit.scope.readyMeaning}`,
    `release evidence: ${audit.releaseEvidenceProgress.status}, ready=${audit.releaseEvidenceProgress.ready}, blockers=${audit.releaseEvidenceProgress.closeoutSummary.blockers}`,
    `completion audit: ${audit.completionAudit.state}, canCompleteLocally=${audit.completionAudit.canCompleteLocally}`,
    `blocking category: ${audit.completionAudit.blockingCategory}`,
    "not proven by this audit:",
  ];
  if (audit.completionAudit.blockingReason) {
    lines.push(`blocking reason: ${audit.completionAudit.blockingReason}`);
  }
  for (const item of audit.scope.notProvenByThisAudit) {
    lines.push(`  - ${item}`);
  }
  for (const check of audit.checks) {
    lines.push(
      `- ${check.pass ? "PASS" : "FAIL"} [${check.status}] ${check.id}: ${check.description}`,
    );
  }
  lines.push("reference coverage:");
  for (const item of audit.referenceCoverage) {
    const actionSuffix = item.releaseActionIds.length > 0
      ? `; release actions=${item.releaseActions.map((action) => `${action.id}:${action.state}`).join(", ")}`
      : "";
    lines.push(
      `  - ${item.id}: ${item.state} (local=${item.localState}, target=${item.targetState}, checks=${item.checkIds.join(", ")}${actionSuffix})`,
    );
  }
  lines.push("implementation order:");
  for (const phase of audit.implementationOrder) {
    const guardedSuffix = phase.guardedCheckIds.length > 0
      ? `; guarded=${phase.guardedCheckIds.join(", ")}`
      : "";
    const nextActionSuffix = phase.nextAction?.actionId
      ? `; next=${phase.nextAction.actionId}:${phase.nextAction.actionState}`
      : "";
    lines.push(
      `  - ${phase.id}: ${phase.state} (local=${phase.localState}, target=${phase.targetState}${guardedSuffix}${nextActionSuffix})`,
    );
  }
  lines.push("remaining priority work:");
  lines.push(`  local ready: ${audit.completionAudit.localReadyRequirementIds.join(", ") || "none"}`);
  lines.push(`  local guarded: ${audit.completionAudit.localGuardedRequirementIds.join(", ") || "none"}`);
  lines.push(`  local evidence required: ${audit.completionAudit.localEvidenceRequiredRequirementIds.join(", ") || "none"}`);
  lines.push(`  target evidence required: ${audit.completionAudit.targetEvidenceRequiredRequirementIds.join(", ") || "none"}`);
  lines.push(`  remaining release actions: ${audit.completionAudit.remainingReleaseActionIds.join(", ") || "none"}`);
  if (audit.completionAudit.firstBlockedReleaseAction) {
    const action = audit.completionAudit.firstBlockedReleaseAction;
    lines.push(
      `  first blocked release action: ${action.id} (${action.missingPrerequisiteIds.join(", ")})`,
    );
    const resolvedInputKeys = Object.keys(action.resolvedInputs ?? {});
    if (resolvedInputKeys.length > 0) {
      lines.push(`  first blocked resolved inputs: ${resolvedInputKeys.join(", ")}`);
    }
    if (action.requiredEnvExports.length > 0) {
      lines.push(`  first blocked env: ${action.requiredEnvExports.join(" ")}`);
    }
    if (action.gateSummary) {
      lines.push(
        `  first blocked gate: errors=${action.gateSummary.errorCount}, warnings=${action.gateSummary.warningCount}`,
      );
    }
    if (action.inputTemplateCommand) {
      lines.push(`  first blocked input template: ${action.inputTemplateCommand}`);
    }
    lines.push(`  first blocked runner report path: ${action.closeoutRunnerReportPath}`);
    lines.push(`  first blocked runner report: ${action.closeoutRunnerReportCommand}`);
    lines.push(`  first blocked runner report file: ${action.closeoutRunnerReportFileCommand}`);
    lines.push(`  first blocked runner execute: ${action.closeoutRunnerExecuteCommand}`);
  }
  if (audit.completionAudit.firstBlockedInputChecklist) {
    const checklist = audit.completionAudit.firstBlockedInputChecklist;
    lines.push(`  next input checklist action: ${checklist.actionId} (${checklist.actionState})`);
    lines.push(`  next resolved inputs: ${checklist.resolvedInputIds.join(", ") || "none"}`);
    lines.push(`  next missing inputs: ${checklist.missingInputIds.join(", ") || "none"}`);
    for (const kind of Object.keys(checklist.missingInputIdsByKind).sort()) {
      lines.push(
        `  next missing ${kind}: ${checklist.missingInputIdsByKind[kind].join(", ") || "none"}`,
      );
    }
    if (checklist.missingInputEnvTemplate.length > 0) {
      lines.push(`  next env template: ${checklist.missingInputEnvTemplate.join(" ")}`);
    }
    if (checklist.operatorChecklist.length > 0) {
      lines.push("  next operator checklist:");
      for (const item of checklist.operatorChecklist) {
        lines.push(
          `    - ${item.id}: ${item.status}; source=${item.sourceHint}; target=${item.evidenceTarget}; validation=${item.validation}`,
        );
      }
    }
    if (checklist.nextInputTemplateCommand) {
      lines.push(`  next input template: ${checklist.nextInputTemplateCommand}`);
    }
    lines.push(`  next runner report path: ${checklist.nextRunnerReportPath}`);
    lines.push(`  next runner report: ${checklist.nextRunnerReportCommand}`);
    lines.push(`  next runner report file: ${checklist.nextRunnerReportFileCommand}`);
    lines.push(`  next runner execute: ${checklist.nextRunnerExecuteCommand}`);
  }
  lines.push(`  external prerequisites: ${audit.completionAudit.externalPrerequisiteIds.join(", ") || "none"}`);
  for (const kind of Object.keys(audit.completionAudit.remainingPrerequisitesByKind).sort()) {
    lines.push(
      `  ${kind} prerequisites: ${audit.completionAudit.remainingPrerequisitesByKind[kind].join(", ") || "none"}`,
    );
  }
  lines.push(
    `  gate errors: ${audit.completionAudit.gateErrorTotals.errors}, warnings=${audit.completionAudit.gateErrorTotals.warnings}`,
  );
  if (audit.completionAudit.firstUnverifiedGateGroup) {
    const group = audit.completionAudit.firstUnverifiedGateGroup;
    lines.push(
      `  first unverified gate group: ${group.id} (errors=${group.errorCount}, warnings=${group.warningCount})`,
    );
    if (group.firstError) {
      lines.push(`  first gate error: ${group.firstError}`);
    }
    if (group.firstWarning) {
      lines.push(`  first gate warning: ${group.firstWarning}`);
    }
  }
  if (audit.releaseEvidenceProgress.closeoutGateSummary.length > 0) {
    lines.push("release evidence gate summary:");
    for (const item of audit.releaseEvidenceProgress.closeoutGateSummary) {
      lines.push(`  - ${item.id}: errors=${item.errorCount}, warnings=${item.warningCount}`);
      for (const error of item.sampleErrors.slice(0, 1)) {
        lines.push(`    error: ${error}`);
      }
      for (const warning of item.sampleWarnings.slice(0, 1)) {
        lines.push(`    warning: ${warning}`);
      }
    }
  }
  if (audit.releaseEvidenceProgress.nextActions.length > 0) {
    lines.push("release evidence next actions:");
    for (const action of audit.releaseEvidenceProgress.nextActions) {
      lines.push(`  - ${action.id}: ${action.title}`);
    }
    lines.push("release evidence closeout plan:");
    lines.push(`  ${audit.releaseEvidenceProgress.closeoutPlanCommand}`);
    lines.push("release evidence closeout runner:");
    lines.push(`  ${audit.releaseEvidenceProgress.closeoutRunnerCommand}`);
    lines.push(
      `  all actions runner report path: ${audit.releaseEvidenceProgress.closeoutRunnerReportPath}`,
    );
    lines.push(
      `  all actions runner report: ${audit.releaseEvidenceProgress.closeoutRunnerReportCommand}`,
    );
    lines.push(
      `  all actions runner report file: ${audit.releaseEvidenceProgress.closeoutRunnerReportFileCommand}`,
    );
    lines.push(
      `  all actions runner report writes release evidence: ${audit.releaseEvidenceProgress.closeoutRunnerReportWritesReleaseEvidence}`,
    );
    const checklist = audit.releaseEvidenceProgress.closeoutInputChecklist;
    if (checklist) {
      lines.push("release closeout input checklist:");
      lines.push(`  missing inputs: ${checklist.missingInputIds.join(", ") || "none"}`);
      for (const kind of Object.keys(checklist.missingInputIdsByKind).sort()) {
        lines.push(
          `  missing ${kind} inputs: ${checklist.missingInputIdsByKind[kind].join(", ") || "none"}`,
        );
      }
      if (checklist.missingInputEnvTemplate.length > 0) {
        lines.push(`  input env template: ${checklist.missingInputEnvTemplate.join(" ")}`);
      }
      lines.push(`  secret inputs: ${checklist.secretInputIds.join(", ") || "none"}`);
      if (checklist.collectionPlan.length > 0) {
        lines.push("  collection plan by action:");
        for (const item of checklist.collectionPlan) {
          lines.push(
            `    ${item.order}. ${item.actionId}: ${item.actionState}; inputs=${item.missingInputIds.join(", ") || "none"}; secret=${item.secretInputIds.join(", ") || "none"}`,
          );
        }
      }
      if (checklist.collectionGroups.length > 0) {
        lines.push("  collection groups:");
        for (const item of checklist.collectionGroups) {
          lines.push(
            `    - ${item.id}: actions=${item.actionIds.join(", ") || "none"}; inputs=${item.missingInputIds.join(", ") || "none"}; secret=${item.secretInputIds.join(", ") || "none"}`,
          );
        }
      }
      lines.push(`  report-only: ${checklist.reportOnly}`);
      lines.push(`  writes release evidence: ${checklist.writesReleaseEvidence}`);
    }
    lines.push("priority audit gate commands:");
    lines.push(`  json: ${audit.releaseEvidenceProgress.priorityAuditCommands.json}`);
    lines.push(`  release gate: ${audit.releaseEvidenceProgress.priorityAuditCommands.releaseGate}`);
    lines.push(`  completion gate: ${audit.releaseEvidenceProgress.priorityAuditCommands.completionGate}`);
    lines.push(
      `  summary: runnable=${audit.releaseEvidenceProgress.closeoutPlanSummary.runnable}, blocked=${audit.releaseEvidenceProgress.closeoutPlanSummary.blocked}, manualOnly=${audit.releaseEvidenceProgress.closeoutPlanSummary.manualOnly}`,
    );
    lines.push("  action queue:");
    for (const action of audit.releaseEvidenceProgress.closeoutActionQueue) {
      const missing = action.missingPrerequisiteIds.length > 0
        ? ` (${action.missingPrerequisiteIds.join(", ")})`
        : "";
      lines.push(`    ${action.order}. ${action.id}: ${action.state}${missing}`);
    }
    if (audit.releaseEvidenceProgress.closeoutPlanSummary.firstBlockedAction) {
      const action =
        audit.releaseEvidenceProgress.closeoutPlanSummary.firstBlockedAction;
      lines.push(
        `  first blocked: ${action.id} (${action.missingPrerequisiteIds.join(", ")})`,
      );
      if (action.commands.length > 0) {
        lines.push(`  first command: ${action.commands[0]}`);
      }
      if (action.requiredEnvExports.length > 0) {
        lines.push(`  first env: ${action.requiredEnvExports.join(" ")}`);
      }
      if (action.operatorChecklist.length > 0) {
        const firstMissingChecklist = action.operatorChecklist.find(
          (item) => item.status === "missing",
        );
        if (firstMissingChecklist) {
          lines.push(
            `  first operator input: ${firstMissingChecklist.id} -> ${firstMissingChecklist.sourceHint}`,
          );
        }
      }
      if (action.inputTemplateCommand) {
        lines.push(`  first input template: ${action.inputTemplateCommand}`);
      }
      lines.push(`  first runner report path: ${action.closeoutRunnerReportPath}`);
      lines.push(`  first runner report: ${action.closeoutRunnerReportCommand}`);
      lines.push(`  first runner report file: ${action.closeoutRunnerReportFileCommand}`);
      lines.push(`  first runner execute: ${action.closeoutRunnerExecuteCommand}`);
    }
  }
  return lines.join("\n");
}

function parseArgs(argv) {
  const args = {
    json: false,
    inputChecklistJson: false,
    inputChecklistMarkdown: false,
    inputChecklistCsv: false,
    releaseEvidenceDir: DEFAULT_RELEASE_EVIDENCE_DIR,
    runtimeEnvFile: DEFAULT_RUNTIME_ENV_FILE,
    failOnReleaseNotReady: false,
    failOnCompletionNotReady: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      args.json = true;
      continue;
    }
    if (arg === "--input-checklist-json") {
      args.inputChecklistJson = true;
      continue;
    }
    if (arg === "--input-checklist-markdown") {
      args.inputChecklistMarkdown = true;
      continue;
    }
    if (arg === "--input-checklist-csv") {
      args.inputChecklistCsv = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      args.help = true;
      continue;
    }
    if (arg === "--fail-on-release-not-ready") {
      args.failOnReleaseNotReady = true;
      continue;
    }
    if (arg === "--fail-on-completion-not-ready") {
      args.failOnCompletionNotReady = true;
      continue;
    }
    if (arg === "--release-evidence-dir") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--release-evidence-dir requires a value");
      }
      args.releaseEvidenceDir = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--release-evidence-dir=")) {
      const value = arg.slice("--release-evidence-dir=".length);
      if (!value) {
        throw new Error("--release-evidence-dir requires a value");
      }
      args.releaseEvidenceDir = value;
      continue;
    }
    if (arg === "--runtime-env-file" || arg === "--env-file") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      args.runtimeEnvFile = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--runtime-env-file=")) {
      const value = arg.slice("--runtime-env-file=".length);
      if (!value) {
        throw new Error("--runtime-env-file requires a value");
      }
      args.runtimeEnvFile = value;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }
  return args;
}

function buildInputChecklistOutput(audit) {
  return {
    ok: audit.ok,
    readOnly: audit.readOnly,
    releaseReady: audit.releaseReady,
    completionState: audit.completionAudit.state,
    blockingCategory: audit.completionAudit.blockingCategory,
    evidenceDir: audit.releaseEvidenceProgress.evidenceDir,
    runtimeEnvFile: audit.releaseEvidenceProgress.runtimeEnvFile,
    implementationBreakdown: buildInputChecklistImplementationBreakdown(audit),
    closeoutInputChecklist:
      audit.releaseEvidenceProgress.closeoutInputChecklist,
    notProvenByThisAudit: audit.scope.notProvenByThisAudit,
  };
}

function sanitizeInputChecklistNextAction(nextAction = {}) {
  if (!nextAction || typeof nextAction !== "object") return null;
  return {
    kind: nextAction.kind || "",
    actionId: nextAction.actionId || "",
    actionState: nextAction.actionState || "",
    reportOnlyCommand: nextAction.reportOnlyCommand || "",
    reportFileCommand: nextAction.reportFileCommand || "",
    reportOnlyWritesReleaseEvidence:
      nextAction.reportOnlyWritesReleaseEvidence === true,
    inputTemplateCommand: nextAction.inputTemplateCommand || "",
    missingPrerequisiteIds: Array.isArray(nextAction.missingPrerequisiteIds)
      ? nextAction.missingPrerequisiteIds
      : [],
    note: nextAction.note || "",
  };
}

function buildInputChecklistImplementationBreakdown(audit) {
  return audit.implementationOrder.map((phase) => ({
    id: phase.id,
    label: phase.label,
    objective: phase.objective,
    state: phase.state,
    localState: phase.localState,
    targetState: phase.targetState,
    referenceSections: phase.referenceSections,
    requirementIds: phase.requirementIds,
    releaseActionIds: phase.releaseActionIds,
    forbiddenScope: phase.forbiddenScope,
    executionContract: phase.executionContract,
    nextAction: sanitizeInputChecklistNextAction(phase.nextAction),
  }));
}

function buildPhaseByReleaseAction(implementationBreakdown) {
  const phaseByAction = new Map();
  for (const phase of implementationBreakdown) {
    for (const actionId of phase.releaseActionIds ?? []) {
      phaseByAction.set(actionId, phase);
    }
  }
  return phaseByAction;
}

function getPhaseForInputActionIds({ phaseByAction, actionIds }) {
  const ids = Array.isArray(actionIds) ? actionIds : [actionIds];
  for (const actionId of ids) {
    const phase = phaseByAction.get(actionId);
    if (phase) return phase;
  }
  return null;
}

function markdownCell(value) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map(markdownCell).join("<br>") : "none";
  }
  const text =
    value === null || value === undefined || value === ""
      ? "none"
      : String(value);
  return text.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function csvCell(value) {
  const text = Array.isArray(value)
    ? value.join("; ")
    : value === null || value === undefined
      ? ""
      : String(value);
  return `"${text.replaceAll('"', '""').replaceAll("\r\n", "\n").replaceAll("\r", "\n")}"`;
}

function formatInputChecklistCsv(audit) {
  const output = buildInputChecklistOutput(audit);
  const checklist = output.closeoutInputChecklist;
  const phaseByAction = buildPhaseByReleaseAction(output.implementationBreakdown);
  const rows = [[
    "evidence_dir",
    "runtime_env_file",
    "release_ready",
    "completion_state",
    "blocking_category",
    "phase_id",
    "phase_state",
    "phase_local_state",
    "phase_target_state",
    "phase_next_action",
    "group_id",
    "group_title",
    "action_id",
    "input_id",
    "kind",
    "secret",
    "status",
    "source",
    "evidence_target",
    "validation",
    "report_only",
    "writes_release_evidence",
  ]];
  for (const group of checklist.collectionGroups) {
    for (const input of group.missingInputs ?? []) {
      const phase = getPhaseForInputActionIds({
        phaseByAction,
        actionIds: input.actionIds,
      });
      rows.push([
        output.evidenceDir,
        output.runtimeEnvFile,
        output.releaseReady === true ? "true" : "false",
        output.completionState,
        output.blockingCategory,
        phase?.id || "",
        phase?.state || "",
        phase?.localState || "",
        phase?.targetState || "",
        phase?.nextAction?.actionId || phase?.nextAction?.kind || "",
        group.id,
        group.title,
        input.actionIds,
        input.id,
        input.kind,
        input.secret === true ? "true" : "false",
        input.status,
        input.sourceHint || input.source,
        input.evidenceTarget,
        input.validation,
        group.reportOnly === true ? "true" : "false",
        group.writesReleaseEvidence === true ? "true" : "false",
      ]);
    }
  }
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function formatInputChecklistMarkdown(audit) {
  const output = buildInputChecklistOutput(audit);
  const checklist = output.closeoutInputChecklist;
  const lines = [
    "# P5 Release Closeout Input Checklist",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| readOnly | ${markdownCell(output.readOnly)} |`,
    `| releaseReady | ${markdownCell(output.releaseReady)} |`,
    `| completionState | ${markdownCell(output.completionState)} |`,
    `| blockingCategory | ${markdownCell(output.blockingCategory)} |`,
    `| evidenceDir | ${markdownCell(output.evidenceDir)} |`,
    `| runtimeEnvFile | ${markdownCell(output.runtimeEnvFile)} |`,
    `| reportOnly | ${markdownCell(checklist.reportOnly)} |`,
    `| writesReleaseEvidence | ${markdownCell(checklist.writesReleaseEvidence)} |`,
    "",
    "## Implementation Breakdown",
    "",
    "| Phase | State | Local State | Target State | Next Action | Objective | Allowed Paths | Forbidden Paths | Not Doing | Validation Commands |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const phase of output.implementationBreakdown) {
    const contract = phase.executionContract || {};
    lines.push(
      `| ${markdownCell(phase.id)} | ${markdownCell(phase.state)} | ${markdownCell(phase.localState)} | ${markdownCell(phase.targetState)} | ${markdownCell(phase.nextAction?.actionId || phase.nextAction?.kind || "none")} | ${markdownCell(phase.objective)} | ${markdownCell(contract.allowedPaths)} | ${markdownCell(contract.forbiddenPaths)} | ${markdownCell(contract.notDoing)} | ${markdownCell(contract.validationCommands)} |`,
    );
  }

  lines.push(
    "",
    "## Missing Inputs",
    "",
    "| Input | Kind | Secret | Actions | Source | Evidence Target | Validation |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  );

  const checklistByInput = new Map(
    checklist.operatorChecklist.map((item) => [item.id, item]),
  );
  for (const item of checklist.missingInputs) {
    const operatorItem = checklistByInput.get(item.id) || {};
    lines.push(
      `| ${markdownCell(item.id)} | ${markdownCell(item.kind)} | ${markdownCell(item.secret)} | ${markdownCell(item.actionIds)} | ${markdownCell(item.sourceHint || item.source || operatorItem.sourceHint || operatorItem.source)} | ${markdownCell(item.evidenceTarget || operatorItem.evidenceTarget)} | ${markdownCell(item.validation || operatorItem.validation)} |`,
    );
  }

  lines.push(
    "",
    "## Collection Plan",
    "",
    "| Order | Action | State | Missing Inputs | Secret Inputs | Report Path | Report File Command | Report-only Command |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const item of checklist.collectionPlan) {
    lines.push(
      `| ${markdownCell(item.order)} | ${markdownCell(item.actionId)} | ${markdownCell(item.actionState)} | ${markdownCell(item.missingInputIds)} | ${markdownCell(item.secretInputIds)} | ${markdownCell(item.runnerReportPath)} | ${markdownCell(item.runnerReportFileCommand)} | ${markdownCell(item.runnerReportCommand)} |`,
    );
  }

  lines.push(
    "",
    "## Collection Groups",
    "",
    "| Group | Actions | Missing Inputs | Secret Inputs | Report Paths |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const item of checklist.collectionGroups) {
    lines.push(
      `| ${markdownCell(item.id)} | ${markdownCell(item.actionIds)} | ${markdownCell(item.missingInputIds)} | ${markdownCell(item.secretInputIds)} | ${markdownCell(item.runnerReportPaths)} |`,
    );
  }

  lines.push(
    "",
    "## Collection Input Details",
    "",
    "| Action | Input | Kind | Secret | Source | Evidence Target | Validation |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const action of checklist.collectionPlan) {
    for (const input of action.missingInputs ?? []) {
      lines.push(
        `| ${markdownCell(action.actionId)} | ${markdownCell(input.id)} | ${markdownCell(input.kind)} | ${markdownCell(input.secret)} | ${markdownCell(input.sourceHint || input.source)} | ${markdownCell(input.evidenceTarget)} | ${markdownCell(input.validation)} |`,
      );
    }
  }

  lines.push("", "## Not Proven By This Audit", "");
  for (const item of output.notProvenByThisAudit) {
    lines.push(`- ${item}`);
  }
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] === import.meta.filename) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(`${USAGE.trim()}\n`);
      process.exitCode = 0;
    } else {
      const audit = runPriorityAudit({
        releaseEvidenceDir: args.releaseEvidenceDir,
        runtimeEnvFile: args.runtimeEnvFile,
      });
      if (args.inputChecklistJson) {
        process.stdout.write(
          `${JSON.stringify(buildInputChecklistOutput(audit), null, 2)}\n`,
        );
      } else if (args.inputChecklistMarkdown) {
        process.stdout.write(formatInputChecklistMarkdown(audit));
      } else if (args.inputChecklistCsv) {
        process.stdout.write(formatInputChecklistCsv(audit));
      } else {
        process.stdout.write(
          `${args.json ? JSON.stringify(audit, null, 2) : formatAudit(audit)}\n`,
        );
      }
      const releaseReadyOk = !args.failOnReleaseNotReady || audit.releaseReady;
      const completionReadyOk =
        !args.failOnCompletionNotReady ||
        audit.completionAudit.canCompleteLocally;
      process.exitCode =
        audit.ok && releaseReadyOk && completionReadyOk ? 0 : 1;
    }
  } catch (error) {
    console.error(error.message);
    console.error(USAGE.trim());
    process.exitCode = 1;
  }
}
