import { buildAffectedPlan } from "./affected.mjs";

export const QUALITY_GATE_CATALOG_SCHEMA = "plush.quality-gate-catalog/v1";

export const QUALITY_GATE_CATALOG = Object.freeze([
  Object.freeze({
    key: "full",
    label: "完整门禁",
    prevents: "局部检查遗漏、前后端合同漂移和生产构建问题",
    trigger: "代码基本稳定、准备提交或受影响计划要求全量验证时",
    riskLevel: "high",
    profiles: Object.freeze(["full", "strict"]),
    sources: Object.freeze([
      "scripts/qa/full.sh",
      "scripts/qa/run-gate-with-receipt.mjs",
      "docs/product/自动化测试策略.md",
    ]),
    evidence: "dev-workbench-receipt/v1",
    blocks: "当前本地完整验证与后续推送准备",
    relationship: "strict 在额外静态检查后复用同一 full 主路径",
    exitCondition: "没有自动退出条件；只能由正式测试策略评审调整",
    highConsequence: true,
  }),
  Object.freeze({
    key: "strict",
    label: "严格门禁",
    prevents: "发版前工具链、Shell、YAML 和完整质量证据缺失",
    trigger: "准备发版或需要严格发布候选证据时",
    riskLevel: "high",
    profiles: Object.freeze(["strict"]),
    sources: Object.freeze([
      "scripts/qa/strict.sh",
      ".gitlab-ci.yml",
      ".github/workflows/release.yml",
      "scripts/qa/run-gate-with-receipt.mjs",
    ]),
    evidence: "dev-workbench-receipt/v1",
    blocks: "当前版本进入版本发布",
    relationship: "在 full 主路径前增加严格静态检查，不另造测试清单",
    exitCondition: "只允许由发布合同变更替代，不能因耗时或近期无失败删除",
    highConsequence: true,
  }),
  Object.freeze({
    key: "migration-integrity",
    label: "数据库迁移完整性",
    prevents: "Schema、Ent 生成物、Atlas migration 与 atlas.sum 漂移",
    trigger: "Schema 或 migration 相关文件变化时",
    riskLevel: "critical",
    profiles: Object.freeze(["full", "strict"]),
    sources: Object.freeze([
      "scripts/qa/db-guard.sh",
      "scripts/qa/disposable-database-runner.mjs",
      "server/internal/data/model/migrate",
    ]),
    evidence: "full/strict server stage and disposable database readback",
    blocks: "数据库结构交付与发布",
    relationship: "与 full 的 Server 阶段组合，保留独立高风险证据",
    exitCondition: "只有 Schema 与 migration 真源同时迁移后才能替代",
    highConsequence: true,
  }),
  Object.freeze({
    key: "authorization-boundary",
    label: "权限与敏感信息",
    prevents: "未登录、disabled、越权访问、敏感信息进入仓库或制品",
    trigger: "认证、RBAC、角色、权限或凭据边界变化时",
    riskLevel: "critical",
    profiles: Object.freeze(["full", "strict"]),
    sources: Object.freeze([
      "scripts/qa/secrets.mjs",
      "scripts/qa/trial-account-rbac.test.mjs",
      "scripts/qa/yoyoosun-role-jsonrpc-access.mjs",
    ]),
    evidence: "secrets stage and RBAC contract receipts",
    blocks: "安全相关提交、发布与岗位验收",
    relationship: "敏感信息扫描与权限行为合同各自证明不同风险",
    exitCondition: "不能以低频失败或前端隐藏替代后端权限边界",
    highConsequence: true,
  }),
  Object.freeze({
    key: "workflow-fact-boundary",
    label: "Workflow 与业务事实",
    prevents: "任务完成被误当成 Fact 入账、非法状态和非幂等写入",
    trigger: "Workflow、Fact、状态机或业务写入路径变化时",
    riskLevel: "critical",
    profiles: Object.freeze(["full", "strict"]),
    sources: Object.freeze([
      "scripts/qa/workflow-fact-boundary.test.mjs",
      "scripts/qa/workflow-ui-action-boundary.test.mjs",
      "docs/architecture/业务链与运行轨迹边界.md",
    ]),
    evidence: "workflow/fact contract tests within the formal gate",
    blocks: "业务状态与事实层交付",
    relationship: "状态合同、事务失败和恢复路径必须组合判断",
    exitCondition: "只有正式业务真源迁移后才能替代",
    highConsequence: true,
  }),
  Object.freeze({
    key: "browser-experience",
    label: "页面与真实浏览器",
    prevents: "路由、交互、暗色、移动端和真实渲染回归",
    trigger: "用户可见页面、样式、路由、PDF 或 Chromium 变化时",
    riskLevel: "high",
    profiles: Object.freeze(["full", "strict"]),
    sources: Object.freeze([
      "web/scripts/styleL1.mjs",
      "scripts/qa/browser-gate-lock.mjs",
      "docs/product/自动化测试策略.md",
    ]),
    evidence: "browser stage and scenario evidence",
    blocks: "用户可见页面交付",
    relationship: "静态前端测试不能替代真实浏览器与几何检查",
    exitCondition: "只有等价真实浏览器证据稳定接入后才能替代",
    highConsequence: false,
  }),
  Object.freeze({
    key: "release-identity",
    label: "CI、镜像与发布身份",
    prevents: "错误 SHA、源码包、镜像、checksum、SBOM 或回滚点漂移",
    trigger: "Workflow、Docker、发布或部署脚本变化时",
    riskLevel: "critical",
    profiles: Object.freeze(["strict"]),
    sources: Object.freeze([
      ".gitlab-ci.yml",
      ".github/workflows/release.yml",
      "scripts/deploy/source-archive-release-check.mjs",
    ]),
    evidence: "Exact-SHA strict terminal and immutable release evidence",
    blocks: "版本发布与目标环境 promotion",
    relationship: "本地 strict 只证明代码质量，不能替代镜像和目标发布证据",
    exitCondition: "发布身份与回滚能力不能因近期无失败删除",
    highConsequence: true,
  }),
  Object.freeze({
    key: "test-data-isolation",
    label: "测试数据隔离",
    prevents: "测试误写共享、生产或归属不明数据库并留下残留",
    trigger: "数据库测试、fixture、seed、导入或验收数据变化时",
    riskLevel: "critical",
    profiles: Object.freeze(["full", "strict"]),
    sources: Object.freeze([
      "scripts/qa/disposable-database-runner.mjs",
      "scripts/qa/test-data-isolation-boundary.mjs",
      "docs/product/自动化测试策略.md",
    ]),
    evidence: "disposable database lifecycle and cleanup readback",
    blocks: "数据库测试结果与发布候选证明",
    relationship: "清理读回属于门禁正确性，不是可选优化",
    exitCondition: "只有等价的一次性环境和清理读回机制才能替代",
    highConsequence: true,
  }),
]);

const RISK_RULES = Object.freeze([
  Object.freeze({
    key: "database",
    label: "数据库与迁移",
    risk: "Schema 与 migration 不一致会让目标环境无法安全升级。",
    highRisk: true,
    gates: Object.freeze(["migration-integrity", "test-data-isolation"]),
    evidence: Object.freeze([
      "Ent 生成物",
      "Atlas migration",
      "atlas.sum",
      "db-guard",
      "migration sequence",
    ]),
    patterns: Object.freeze([
      /^server\/internal\/data\/model\/schema\//u,
      /^server\/internal\/data\/model\/migrate\//u,
      /^server\/atlas\.sum$/u,
      /migration|database|db-guard/iu,
    ]),
  }),
  Object.freeze({
    key: "security",
    label: "权限与安全",
    risk: "权限绕过或敏感信息泄漏会直接破坏岗位边界。",
    highRisk: true,
    gates: Object.freeze(["authorization-boundary", "strict"]),
    evidence: Object.freeze([
      "未登录与 disabled",
      "无权限与角色",
      "owner / assignee / status",
      "super_admin",
      "敏感信息扫描",
    ]),
    patterns: Object.freeze([
      /permission|rbac|auth|login|session|secret|credential/iu,
      /^server\/internal\/service\/.*jsonrpc/iu,
    ]),
  }),
  Object.freeze({
    key: "workflow-fact",
    label: "Workflow 与业务事实",
    risk: "流程状态和事实过账混淆会形成错误库存、出货或财务结果。",
    highRisk: true,
    gates: Object.freeze(["workflow-fact-boundary", "full"]),
    evidence: Object.freeze([
      "done 不等于 Fact posted",
      "blocked / rejected",
      "幂等与非法状态",
      "恢复路径",
      "事务失败",
    ]),
    patterns: Object.freeze([
      /workflow|process_runtime|inventory|shipment|finance|invoice|receipt/iu,
      /^server\/internal\/(?:biz|data|service)\//u,
    ]),
  }),
  Object.freeze({
    key: "frontend",
    label: "前端页面",
    risk: "静态检查通过仍可能遗漏真实交互、错误态和移动端布局问题。",
    highRisk: false,
    gates: Object.freeze(["browser-experience", "full"]),
    evidence: Object.freeze([
      "页面合同测试",
      "错误边界",
      "真实浏览器",
      "浅色与深色",
      "移动端、长文本和失败态",
    ]),
    patterns: Object.freeze([/^web\/src\//u, /^web\/scripts\//u]),
  }),
  Object.freeze({
    key: "pdf-chromium",
    label: "PDF 与 Chromium",
    risk: "打印与 PDF 必须由真实 Chromium 渲染证明，不能只看 DOM。",
    highRisk: false,
    gates: Object.freeze(["browser-experience", "full"]),
    evidence: Object.freeze([
      "Chromium / PDF 测试",
      "稳定依赖层",
      "真实渲染",
      "生产镜像边界",
    ]),
    patterns: Object.freeze([/pdf|print|chromium|playwright/iu]),
  }),
  Object.freeze({
    key: "release",
    label: "CI、镜像与发布",
    risk: "构建绿色不能自动证明制品身份、checksum、SBOM 或回滚能力。",
    highRisk: true,
    gates: Object.freeze(["release-identity", "strict"]),
    evidence: Object.freeze([
      "Workflow 合同",
      "source archive",
      "Exact-SHA",
      "image identity 与 checksum",
      "SBOM 与 rollback",
    ]),
    patterns: Object.freeze([
      /^\.gitlab-ci\.yml$/u,
      /^\.github\/workflows\//u,
      /^scripts\/deploy\//u,
      /Dockerfile|compose|release|deploy/iu,
    ]),
  }),
  Object.freeze({
    key: "test-data",
    label: "测试数据",
    risk: "fixture、seed 或导入数据若不隔离，可能污染长期数据库。",
    highRisk: true,
    gates: Object.freeze(["test-data-isolation", "full"]),
    evidence: Object.freeze([
      "固定 profile",
      "一次性数据库",
      "run identity 与 TTL",
      "成功和失败清理",
      "cleanup readback",
    ]),
    patterns: Object.freeze([
      /fixture|seed|testdata|demo-data|data-preparation|import/iu,
    ]),
  }),
]);

function unique(values) {
  return [...new Set(values)];
}

function percentile(values, ratio) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)
  ];
}

function receiptCurrent(receipt, repository, operations) {
  if (!receipt || receipt.status !== "passed") return false;
  if (receipt.gitCommit !== repository.commit) return false;
  if (!repository.dirty) return receipt.treeState === "clean";
  return operations.some(
    (operation) =>
      operation.repository.fingerprint === repository.fingerprint &&
      operation.profile === receipt.profile &&
      operation.status === "passed" &&
      operation.receipt?.finishedAt === receipt.finishedAt,
  );
}

export function buildQualityGateStatistics(
  operations,
  { profile, repository },
) {
  const candidates = operations
    .filter(
      (operation) =>
        operation.profile === profile &&
        operation.status === "passed" &&
        operation.repository.dirty === repository.dirty &&
        operation.receipt?.status === "passed",
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const environmentFingerprint =
    candidates[0]?.receipt?.environmentFingerprint || "";
  const comparable = candidates.filter(
    (operation) =>
      operation.receipt.environmentFingerprint === environmentFingerprint,
  );
  const durations = comparable.map((operation) => operation.receipt.durationMs);
  return Object.freeze({
    sampleCount: durations.length,
    medianDurationMs: percentile(durations, 0.5),
    slowerDurationMs: percentile(durations, 0.9),
    enoughSamples: durations.length >= 3,
    environmentFingerprint,
    treeState: repository.dirty ? "dirty" : "clean",
  });
}

export function deriveQualityGateRisks(changedFiles) {
  return RISK_RULES.map((rule) => {
    const matchedCount = changedFiles.filter((file) =>
      rule.patterns.some((pattern) => pattern.test(file)),
    ).length;
    return {
      key: rule.key,
      label: rule.label,
      risk: rule.risk,
      highRisk: rule.highRisk,
      gates: [...rule.gates],
      evidence: [...rule.evidence],
      matchedCount,
    };
  }).filter((rule) => rule.matchedCount > 0);
}

export function buildQualityGateGapAnalysis({
  changedFiles,
  repository,
  receipts = {},
  operations = [],
  range = "current",
  risk = "all",
  root,
}) {
  const affected = buildAffectedPlan(changedFiles, { root });
  let categories = deriveQualityGateRisks(changedFiles).map((category) => {
    const gateResults = category.gates.map((gateKey) => {
      const gate = QUALITY_GATE_CATALOG.find((item) => item.key === gateKey);
      if (!gate) {
        throw new Error(`quality gate catalog entry missing: ${gateKey}`);
      }
      const profile =
        gateKey === "strict" || gateKey === "release-identity"
          ? "strict"
          : "full";
      const receipt = receipts[profile] || null;
      return {
        gateKey,
        label: gate.label,
        status: receiptCurrent(receipt, repository, operations)
          ? "current"
          : receipt
            ? "stale"
            : "missing",
      };
    });
    const missing = gateResults.filter((item) => item.status !== "current");
    return {
      ...category,
      gateResults,
      status: missing.length === 0 ? "covered" : "missing",
      missing: missing.map((item) => item.gateKey),
    };
  });
  if (risk === "high") {
    categories = categories.filter((category) => category.highRisk);
  }
  return Object.freeze({
    schemaVersion: "plush.quality-gate-gap-analysis/v2",
    range,
    risk,
    changedCount: changedFiles.length,
    affectedScopes: affected.affectedScopes,
    maxAffectedScope: affected.maxAffectedScope,
    localGate: affected.localGate,
    matched: categories.length > 0,
    categories,
    boundaries: Object.freeze([
      "本地门禁结果不证明目标环境发布",
      "部署 smoke 与回滚证据需要固定目标读回",
      "自动化通过不替代客户 UAT 与签收",
    ]),
  });
}

export function buildQualityGateComplexityCandidates({
  changedFiles,
  operations,
  receipts,
  repository,
  localGate,
}) {
  const candidates = [];
  for (const profile of ["full", "strict"]) {
    const stats = buildQualityGateStatistics(operations, {
      profile,
      repository,
    });
    if (!stats.enoughSamples) {
      candidates.push({
        key: `${profile}-sample-shortage`,
        gateKeys: [profile],
        signal: "暂无足够样本",
        detail: `${profile === "strict" ? "严格" : "完整"}门禁的同环境、同工作区状态样本少于 3 次，暂不判断趋势。`,
        recommendation: "需要人工确认，不能自动删除",
        severity: "info",
      });
    }
  }
  if (localGate === "full" && changedFiles.length > 0 && changedFiles.length <= 3) {
    candidates.push({
      key: "narrow-change-full",
      gateKeys: ["full"],
      signal: "窄改动触发完整门禁",
      detail:
        "当前改动文件较少，但 affected 合同因全局入口或未知路径保守升级为 full。",
      recommendation: "建议评估映射是否过宽",
      severity: "warning",
    });
  }
  for (const profile of ["full", "strict"]) {
    const receipt = receipts[profile];
    const stages = receipt?.stageTimings || [];
    const preparationMs = stages
      .filter((stage) =>
        ["strict_profile", "environment_profile"].includes(stage.id),
      )
      .reduce((total, stage) => total + stage.durationMs, 0);
    if (receipt?.durationMs > 0 && preparationMs / receipt.durationMs >= 0.3) {
      candidates.push({
        key: `${profile}-preparation-cost`,
        gateKeys: [profile],
        signal: "准备阶段耗时偏高",
        detail: "最近一次可见记录中，配置与工具链准备占总耗时至少 30%。",
        recommendation: "建议评估共享依赖准备",
        severity: "warning",
      });
    }
  }
  const fingerprints = new Map();
  for (const operation of operations) {
    const key = `${operation.profile}:${operation.repository.fingerprint}`;
    if (!fingerprints.has(key)) fingerprints.set(key, new Set());
    fingerprints.get(key).add(operation.status);
  }
  if (
    [...fingerprints.values()].some(
      (statuses) => statuses.has("failed") && statuses.has("passed"),
    )
  ) {
    candidates.push({
      key: "recent-result-variance",
      gateKeys: ["full", "strict"],
      signal: "近期结果波动较大",
      detail: "相同仓库指纹曾同时出现失败和通过，需要核对是否为偶发环境问题。",
      recommendation: "需要人工确认，不能自动删除",
      severity: "warning",
    });
  }
  candidates.push({
    key: "strict-full-layering",
    gateKeys: ["full", "strict"],
    signal: "共享同一 full 主路径",
    detail: "strict 通过正式脚本复用 full，而不是复制第二份测试列表。",
    recommendation: "有独立高风险价值，建议保留",
    severity: "success",
  });
  return candidates;
}

export function buildQualityGateGovernance({
  changedFiles,
  operations,
  receipts,
  repository,
  filter = "relevant",
  q = "",
  root,
}) {
  const affected = buildAffectedPlan(changedFiles, { root });
  const risks = deriveQualityGateRisks(changedFiles);
  const relevantGateKeys = new Set([
    ...(affected.localGate === "full" ? ["full"] : []),
    ...risks.flatMap((risk) => risk.gates),
  ]);
  const complexity = buildQualityGateComplexityCandidates({
    changedFiles,
    operations,
    receipts,
    repository,
    localGate: affected.localGate,
  });
  const attentionKeys = new Set(complexity.flatMap((item) => item.gateKeys));
  const keyword = String(q || "")
    .trim()
    .toLowerCase();
  const rows = QUALITY_GATE_CATALOG.filter((gate) => {
    if (filter === "relevant" && !relevantGateKeys.has(gate.key)) return false;
    if (filter === "attention" && !attentionKeys.has(gate.key)) return false;
    if (!keyword) return true;
    return [gate.label, gate.prevents, gate.trigger, gate.key]
      .join(" ")
      .toLowerCase()
      .includes(keyword);
  }).map((gate) => {
    const profile = gate.profiles.includes("strict") ? "strict" : "full";
    const stats = buildQualityGateStatistics(operations, {
      profile,
      repository,
    });
    const receipt = receipts[profile] || null;
    return {
      ...gate,
      current: receiptCurrent(receipt, repository, operations),
      recentResult: receipt?.status || "missing",
      statistics: stats,
      advice:
        complexity.find((item) => item.gateKeys.includes(gate.key))
          ?.recommendation || "当前未发现客观复杂度信号",
    };
  });
  return Object.freeze({
    schemaVersion: "plush.quality-gate-governance/v1",
    catalogSchemaVersion: QUALITY_GATE_CATALOG_SCHEMA,
    filter,
    q: String(q || ""),
    changedCount: changedFiles.length,
    rows,
    complexity,
  });
}

export function qualityGateCatalogSourceKeys() {
  return unique(QUALITY_GATE_CATALOG.flatMap((gate) => gate.sources));
}
