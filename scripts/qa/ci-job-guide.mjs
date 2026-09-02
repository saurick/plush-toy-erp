export const CI_JOB_GUIDE_SCHEMA = "plush.ci-job-guide/v1";

const RAW_CI_JOB_GUIDES = [
  {
    name: "plan",
    label: "确定验证范围",
    summary: "计算本次提交的可信变更范围，并决定运行完整门禁还是受影响门禁。",
    checks: ["提交范围与验证模式", "diff / log 合法性", "敏感信息扫描"],
    outcome: "生成 plan、range 与 trust 证据，供后续 Job 复用。",
  },
  {
    name: "prepare",
    label: "准备 Runner 环境",
    summary: "准备依赖、缓存和浏览器运行包，并核对 Runner 容量与沙箱。",
    checks: ["Runner 容量与 Chromium 沙箱", "pnpm 锁定依赖", "Playwright 与 Go 依赖"],
    outcome: "只准备运行条件，不代表任何测试已经通过。",
  },
  {
    name: "quality_static",
    label: "静态配置检查",
    summary: "检查 Shell 与 YAML 等静态配置，尽早阻断格式和脚本问题。",
    checks: ["严格配置", "ShellCheck", "shfmt", "YAML lint"],
    outcome: "生成静态检查分片回执。",
  },
  {
    name: "quality_node_release_preflight_a",
    label: "发布前置合同 A",
    summary: "并行验证生产发布前置检查的第一组输入、失败关闭和证据边界。",
    checks: ["生产 preflight 合同", "发布身份与输入约束"],
    outcome: "生成 Node 发布前置 A 分片回执。",
  },
  {
    name: "quality_node_release_preflight_b",
    label: "发布前置合同 B",
    summary: "并行验证生产发布前置检查的第二组输入、失败关闭和证据边界。",
    checks: ["生产 preflight 合同", "运行身份与隔离约束"],
    outcome: "生成 Node 发布前置 B 分片回执。",
  },
  {
    name: "quality_node_release_a",
    label: "发布合同 A",
    summary: "运行发布类 Node 测试的第一组，重点覆盖推送和门禁回执链路。",
    checks: ["prepare-push / pre-push 回执", "第一组发布合同测试"],
    outcome: "生成 Node 发布 A 分片回执。",
  },
  {
    name: "quality_node_release_b",
    label: "发布合同 B",
    summary: "运行发布类 Node 测试的第二组，重点覆盖在线迁移和 smoke 脚本。",
    checks: ["在线迁移合同", "运行 smoke 合同", "第二组发布合同测试"],
    outcome: "生成 Node 发布 B 分片回执。",
  },
  {
    name: "quality_node_release_c",
    label: "发布合同 C",
    summary: "运行发布类 Node 测试的第三组，均衡长尾合同与脚本验证。",
    checks: ["第三组发布合同测试", "发布脚本失败关闭"],
    outcome: "生成 Node 发布 C 分片回执。",
  },
  {
    name: "quality_node_core",
    label: "Node 核心测试",
    summary: "运行日常 Node 核心测试，覆盖快速、数据库和浏览器相关合同。",
    checks: ["fast 测试组", "database 测试组", "browser 测试组"],
    outcome: "生成 Node 核心分片回执。",
  },
  {
    name: "quality_resource_contract_a",
    label: "资源合同检查 A",
    summary: "并行验证生产管理员初始化等资源敏感流程的第一组静态合同。",
    checks: ["初始化脚本合同", "资源敏感场景清单"],
    outcome: "生成资源合同 A 分片回执。",
  },
  {
    name: "quality_resource_contract_b",
    label: "资源合同检查 B",
    summary: "并行验证生产管理员初始化等资源敏感流程的第二组静态合同。",
    checks: ["初始化脚本合同", "资源敏感场景清单"],
    outcome: "生成资源合同 B 分片回执。",
  },
  {
    name: "quality_resource_runtime_a",
    label: "资源运行检查 A",
    summary: "并行运行第一组资源敏感场景，并核对进程、锁和临时资源清理。",
    checks: ["资源敏感运行场景", "进程与端口清理", "临时文件残留"],
    outcome: "生成资源运行 A 分片回执。",
  },
  {
    name: "quality_resource_runtime_b",
    label: "资源运行检查 B",
    summary: "并行运行第二组资源敏感场景，并核对进程、锁和临时资源清理。",
    checks: ["资源敏感运行场景", "进程与端口清理", "临时文件残留"],
    outcome: "生成资源运行 B 分片回执。",
  },
  {
    name: "quality_web_checks",
    label: "Web 代码检查",
    summary: "运行前端静态检查和自动化测试，不执行生产构建。",
    checks: ["ESLint", "Stylelint", "Web 自动化测试"],
    outcome: "生成 Web checks 分片回执。",
  },
  {
    name: "quality_web_build",
    label: "Web 生产构建",
    summary: "生成生产前端，并确认 DEV 工作台不会进入正式构建产物。",
    checks: ["生产构建", "DEV / production 边界"],
    outcome: "生成 Web build 回执与可复用构建产物。",
  },
  {
    name: "quality_server_schema",
    label: "Server Schema 检查",
    summary: "运行 schema 生成并确认 Ent、Atlas 和 migration 没有未提交漂移。",
    checks: ["make data", "Ent / Atlas 生成", "migration 零漂移"],
    outcome: "生成 Server schema 分片回执。",
  },
  {
    name: "quality_server_upgrade",
    label: "Server 存量升级",
    summary: "使用独立 PostgreSQL 验证已有数据库升级到当前版本的路径。",
    checks: ["环境配置", "存量数据库升级", "数据库清理"],
    outcome: "生成 Server upgrade 分片回执。",
  },
  {
    name: "quality_server_test_build",
    label: "Server 测试与构建",
    summary: "运行 Go 测试与构建，并覆盖需要 Chromium 的 PDF 集成路径。",
    checks: ["Go 测试", "PDF Chromium 集成", "Server 构建"],
    outcome: "生成 Server test/build 分片回执。",
  },
  {
    name: "quality_server_critical_postgres",
    label: "关键 PostgreSQL 合同",
    summary: "在独立数据库中串行验证必须依赖真实 PostgreSQL 的关键事务合同。",
    checks: ["关键 PostgreSQL 场景", "事务与并发边界", "数据库清理"],
    outcome: "生成 Server critical-postgres 分片回执。",
  },
  {
    name: "quality_browser_boundary_entry_print",
    label: "浏览器主路径检查",
    summary: "复用同一 SHA 的 Web 构建，验证入口、响应式边界和打印中心主路径。",
    checks: ["桌面与移动入口", "打印中心预览", "浏览器与端口清理"],
    outcome: "生成 Browser 场景分片回执。",
  },
  {
    name: "quality_node",
    label: "Node 汇总",
    summary: "核对四条 Node 分片，并完成 secrets 与 shared 收口；不会重跑分片测试。",
    checks: ["四条 Node 分片回执", "严格敏感信息扫描", "共享基础检查"],
    outcome: "形成唯一 Node 领域回执，供总聚合读取。",
  },
  {
    name: "quality_resource",
    label: "资源敏感汇总",
    summary: "核对资源合同与运行两条分片属于同一提交且完整通过。",
    checks: ["资源合同分片", "资源运行分片", "清理与零跳过读回"],
    outcome: "形成唯一资源敏感领域回执。",
  },
  {
    name: "quality_web",
    label: "Web 汇总",
    summary: "核对 Web 代码检查和生产构建两条分片，不重复执行前端测试。",
    checks: ["Web checks 回执", "Web build 回执", "构建摘要"],
    outcome: "形成唯一 Web 领域回执。",
  },
  {
    name: "quality_server",
    label: "Server 汇总",
    summary: "核对四条 Server / PostgreSQL 分片及其清理证据。",
    checks: ["schema", "upgrade", "test/build", "critical PostgreSQL"],
    outcome: "形成唯一 Server 领域回执。",
  },
  {
    name: "quality_browser",
    label: "浏览器汇总",
    summary: "核对浏览器场景、Web 构建身份以及端口和运行时清理结果。",
    checks: ["浏览器场景回执", "Web build digest", "端口与运行时清理"],
    outcome: "形成唯一 Browser 领域回执。",
  },
  {
    name: "quality_security",
    label: "Go 漏洞检查",
    summary: "扫描 Go 依赖中的可达漏洞，并按严格策略失败关闭。",
    checks: ["govulncheck", "可达漏洞判断", "依赖审计结果"],
    outcome: "生成 Security 领域回执。",
  },
  {
    name: "quality_aggregate",
    label: "质量证据总聚合",
    summary: "核对七个领域回执、提交身份、覆盖数量和清理证据，不重跑检查。",
    checks: ["七领域回执", "exact SHA 与计划身份", "零跳过与清理读回"],
    outcome: "生成 terminal、receipt 和 evidence manifest。",
  },
  {
    name: "CI Gate",
    label: "CI 最终门禁",
    summary: "核对最终证据并固定到当前 Pipeline；它决定整条 CI 的可信终态。",
    checks: ["最终证据完整性", "Pipeline / Job / SHA 身份", "证据包上传"],
    outcome: "形成可被发布链读取的 exact-SHA CI Gate 证据。",
  },
];

function hasControlCharacter(value) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 31 || codePoint === 127;
  });
}

function freezeGuide(guide) {
  if (
    !guide ||
    typeof guide !== "object" ||
    typeof guide.name !== "string" ||
    guide.name.length < 1 ||
    guide.name.length > 120 ||
    hasControlCharacter(guide.name) ||
    typeof guide.label !== "string" ||
    guide.label.length < 1 ||
    guide.label.length > 80 ||
    typeof guide.summary !== "string" ||
    guide.summary.length < 1 ||
    guide.summary.length > 240 ||
    !Array.isArray(guide.checks) ||
    guide.checks.length < 1 ||
    guide.checks.length > 8 ||
    guide.checks.some(
      (item) =>
        typeof item !== "string" ||
        item.length < 1 ||
        item.length > 120 ||
        hasControlCharacter(item),
    ) ||
    typeof guide.outcome !== "string" ||
    guide.outcome.length < 1 ||
    guide.outcome.length > 240
  ) {
    throw new Error("CI Job guide is invalid");
  }
  return Object.freeze({
    ...guide,
    checks: Object.freeze([...guide.checks]),
    registered: true,
  });
}

export const CI_JOB_GUIDES = Object.freeze(RAW_CI_JOB_GUIDES.map(freezeGuide));

const guideByName = new Map(CI_JOB_GUIDES.map((guide) => [guide.name, guide]));
if (guideByName.size !== CI_JOB_GUIDES.length) {
  throw new Error("CI Job guides are not unique");
}

function fallbackGuide(name) {
  return Object.freeze({
    name,
    label: name,
    summary: "当前流水线包含该 Job，但仓库尚未登记用途说明。",
    checks: Object.freeze(["当前检查清单尚未登记"]),
    outcome: "页面继续展示实际状态；执行细节以 GitLab Job 日志为准。",
    registered: false,
  });
}

export function projectCiJobGuides(jobNames) {
  if (!Array.isArray(jobNames) || jobNames.length > 100) {
    throw new Error("CI Job guide projection is invalid");
  }
  const names = jobNames.map((value) => String(value || ""));
  if (
    names.some(
      (name) =>
        name.length < 1 || name.length > 120 || hasControlCharacter(name),
    ) ||
    new Set(names).size !== names.length
  ) {
    throw new Error("CI Job guide projection is invalid");
  }
  return Object.freeze(
    names.map((name) => guideByName.get(name) || fallbackGuide(name)),
  );
}
