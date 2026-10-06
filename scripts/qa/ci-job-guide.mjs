import { CI_NODE_TEST_LANES } from "./ci-node-test-lane.mjs";
import { CI_RESOURCE_TEST_LANES } from "./ci-resource-test-lane.mjs";
import {
  CI_BROWSER_QUALITY_LANES,
  CI_SERVER_QUALITY_LANES,
  CI_WEB_QUALITY_LANES,
} from "./ci-quality-stage-lane.mjs";
import { CI_QUALITY_SHARDS } from "./ci-quality-shard.mjs";

export const CI_JOB_GUIDE_SCHEMA = "plush.ci-job-guide/v1";

const QUALITY_LANE_REGISTRIES = {
  web: CI_WEB_QUALITY_LANES,
  server: CI_SERVER_QUALITY_LANES,
  browser: CI_BROWSER_QUALITY_LANES,
};

function diagnosticsFor(guide) {
  const identityStep =
    "核对当前 Job 的 protected main、exact SHA、plan / range 与输入制品身份。";
  const resultStep =
    "保存本 lane 回执；成功或失败均读回本次资源清理，缺结果或零执行不能算通过。";
  const defaultTriage = [
    "从 Job 完整日志定位第一个失败子步骤、退出码和错误上下文；下游 skipped 不代表新的失败。",
    "核对本机与 CI 的 SHA、工具版本、文件范围和环境；本机复现用正式同名测试或 affected，不伪造 GitLab 身份。",
    "修复后补相关反例与选测关系，再核对新候选证据；保留原 attempt，重试通过不证明根因已修复。",
  ];
  const make = (
    entry,
    environment,
    steps,
    evidence,
    source,
    triage = defaultTriage,
  ) =>
    Object.freeze({
      entry,
      environment,
      steps: Object.freeze(steps),
      evidence: Object.freeze(evidence),
      sources: Object.freeze([".gitlab-ci.yml", source]),
      triage: Object.freeze(triage),
    });
  for (const [lane, definition] of Object.entries(CI_NODE_TEST_LANES)) {
    if (guide.name !== definition.job) continue;
    return make(
      `node scripts/qa/ci-node-test-lane.mjs --lane ${lane}`,
      "CI 专用入口；锁定 Node 与 pnpm 依赖。分组名 database / browser 在这里指 Node 合同测试，不等于真实数据库或浏览器验收。",
      [
        identityStep,
        `按正式目录选择 ${definition.profiles.join(" / ")} 分组${definition.testPartition ? `的 ${definition.testPartition} 分区` : ""}，运行测试并解析 TAP，要求实际执行、零失败与零 skip。`,
        "核对前后源码与环境身份，输出该 lane 的摘要和指纹。",
      ],
      [`output/ci/node-lanes/${lane}.json`],
      "scripts/qa/ci-node-test-lane.mjs",
    );
  }
  for (const [lane, definition] of Object.entries(CI_RESOURCE_TEST_LANES)) {
    if (guide.name !== definition.job) continue;
    return make(
      `node scripts/qa/ci-resource-test-lane.mjs --lane ${lane}`,
      "CI 专用入口；等待 Web / Server 汇总，使用精确分区的资源敏感合同与模拟运行场景。",
      [
        identityStep,
        `执行登记测试 ${definition.testFile}，核对 case 清单、实际执行数与 TAP。`,
        "比较运行前后受管临时资源清单，核对进程 / 端口 / 文件清理与零残留。",
      ],
      [`output/ci/resource-lanes/${lane}.json`],
      "scripts/qa/ci-resource-test-lane.mjs",
    );
  }
  for (const [shard, registry] of Object.entries(QUALITY_LANE_REGISTRIES)) {
    for (const [lane, definition] of Object.entries(registry)) {
      if (guide.name !== definition.job) continue;
      const requirements = [
        definition.pnpm ? "锁定 pnpm 依赖" : "无需恢复 pnpm 缓存",
        definition.postgres
          ? "本 Job 独立 PostgreSQL、随机端口与正式迁移"
          : "不持有 PostgreSQL",
        definition.chromium
          ? "校验运行包后解压本 Job 的 Chromium 与 sandbox"
          : "不解压 Chromium",
      ];
      return make(
        `node scripts/qa/ci-quality-stage-lane.mjs --shard ${shard} --lane ${lane}`,
        `CI 专用入口；${requirements.join("；")}。`,
        [
          identityStep,
          `正式子入口：${definition.command.join(" ")}`,
          `检查内容：${guide.checks.join("；")}。${definition.substeps?.length ? `子步骤：${definition.substeps.join(" → ")}。` : ""}`,
          resultStep,
        ],
        [
          `output/ci/${shard}-lanes/${lane}.json`,
          ...(definition.webBuild ? ["web/build/"] : []),
        ],
        "scripts/qa/ci-quality-stage-lane.mjs",
        [
          shard === "web"
            ? "lint 先查文件与行号、使用的配置及测试文件是否也在范围内；构建失败看首个编译错误和 DEV 残留。"
            : shard === "server"
              ? "区分生成漂移、迁移 blocker、事务断言和 PDF 初始化失败；先查相应子步骤，不把容器启动成功当成验证完成。"
              : "先查同 SHA 的 Web 制品、Chromium 初始化和端口就绪，再查页面断言；日志缺失先补证据。",
          ...defaultTriage.slice(1),
        ],
      );
    }
  }
  for (const [shard, definition] of Object.entries(CI_QUALITY_SHARDS)) {
    if (guide.name !== definition.job) continue;
    return make(
      `node scripts/qa/ci-quality-shard.mjs --shard ${shard}`,
      "CI 专用入口；依赖以对应 SHA 的真实 needs 为准。汇总读取上游回执，静态、安全及 Node shared 收口仍有自身检查。",
      [
        identityStep,
        `领域职责：${guide.summary}`,
        `核对 ${guide.checks.join("；")}，确认同 SHA、plan、执行数量与必要清理证据。`,
      ],
      [`output/ci/shards/${shard}.json`],
      "scripts/qa/ci-quality-shard.mjs",
      [
        "先判断失败来自自身命令还是上游回执校验；缺失、旧 SHA、摘要不完整和清理失败分别定位，不能手工补绿色 JSON。",
        ...defaultTriage.slice(1),
      ],
    );
  }
  const special = {
    plan: {
      entry: ".gitlab-ci.yml → plan.script → node scripts/qa/ci-plan.mjs",
      environment:
        "Node / gitleaks 版本与仓库身份正确，before/base SHA 可读；main 按实际路径选择 docs/full，MR 使用 affected。",
      steps: [
        "依据 source / before SHA / MR base 计算 diff 与历史范围。",
        "检查 diff/log，并用可信基线的 gitleaks 配置扫描历史。",
        "生成计划、范围与信任回执；后续 Job 必须匹配它们的 digest。",
      ],
      evidence: [
        "output/ci/plan.json",
        "output/ci/range.txt",
        "output/ci/trust.json",
      ],
      source: "scripts/qa/ci-plan.mjs",
    },
    prepare: {
      entry: ".gitlab-ci.yml → prepare.script",
      environment:
        "唯一 cache writer；Runner 容量、root-owned sandbox helper、精确 sudo policy、包源与受校验 Playwright Package。",
      steps: [
        "读取容量证据并执行 sandbox preflight，失败则停止准备。",
        "pnpm frozen-lockfile 安装；准备受校验的 Playwright ZIP；Go mod download。",
        "验证缓存目录存在，运行时解压目录尚未创建；输出 cache=prepared。",
      ],
      evidence: ["output/ci/runner-capacity-observation.json"],
      source: "scripts/qa/ci-playwright-runtime.mjs",
    },
    quality_docs: {
      entry: ".gitlab-ci.yml → quality_docs.script → affected.sh",
      environment: "同 SHA 的 docs 计划与 locked pnpm 文档解析依赖；无需 Docker、Atlas 或 Chromium。",
      steps: [
        "确认计划只包含普通 Markdown；数据库生成文档和任何非 Markdown 改动走 full。",
        "从只读缓存安装锁定的 Mermaid / DOM 依赖，再按真实范围检查文档登记、链接、命名和相关边界。",
        "核对工作区零漂移；通过只表示文档检查成功，不产生 strict 证据。",
      ],
      evidence: ["output/ci/plan.json", "output/ci/range.txt", "GitLab quality_docs Job 日志"],
      source: "scripts/qa/affected.mjs",
    },
    quality_aggregate: {
      entry: "node scripts/qa/ci-quality-aggregate.mjs",
      environment:
        "同 Pipeline / SHA 的七领域回执、source archive、构建 digest、清理与零 skip 证据齐全。",
      steps: [
        "逐领域校验身份、计划、回执完整性与执行数量。",
        "校验 schema 生成、构建及数据库 / 浏览器清理，不重跑上游测试。",
        "形成 terminal、receipt、evidence manifest，交给 CI Gate 固化。",
      ],
      evidence: [
        "output/ci/evidence/terminal.json",
        "output/ci/evidence/receipt.json",
        "output/ci/evidence/evidence-manifest.json",
      ],
      source: "scripts/qa/ci-quality-aggregate.mjs",
    },
    "CI Gate": {
      entry: ".gitlab-ci.yml → CI Gate.script",
      environment:
        "full 要求 protected main 与 aggregate 成功；docs 依赖 quality_docs，MR 依赖 quality_affected。Package 上传使用 Job token，凭据不进入页面。",
      steps: [
        "按 plan.effectiveMode 核对分支：docs 仅完成文档门禁；full 核对三个证据文件及当前分支保护身份。",
        "上传到 plush-ci-evidence 的 pipeline-<id>-job-<id>-<sha> 版本，失败仍阻断。",
        "清理临时凭据文件；发布链另行读回同 SHA 的不可变证据。",
      ],
      evidence: [
        "output/ci/evidence/",
        "GitLab Generic Package：plush-ci-evidence",
      ],
      source: "scripts/qa/ci-quality-aggregate.mjs",
    },
    pdf_runtime_monitor: {
      entry: ".gitlab-ci.yml → pdf_runtime_monitor.script",
      environment:
        "仅受保护默认分支的指定 schedule；不属于普通 main push 质量检查。",
      steps: [
        "核对固定打印镜像、实际 Chromium 与系统包。",
        "检查上游稳定版本、可修复漏洞及体积预算。",
        "报告升级候选；真实 PDF 验证与镜像更新另走正式流程。",
      ],
      evidence: ["GitLab pdf_runtime_monitor Job 日志与 artifacts"],
      source: "scripts/qa/README.md",
    },
  }[guide.name];
  return special
    ? make(
        special.entry,
        special.environment,
        special.steps,
        special.evidence,
        special.source,
      )
    : null;
}

const RAW_CI_JOB_GUIDES = [
  {
    name: "quality_docs",
    label: "文档检查",
    summary: "按变更范围检查文档登记、链接和相关边界。",
    checks: ["文档登记与链接", "命名与相关边界", "工作区零漂移"],
    outcome: "文档 CI 通过；未运行完整 strict，不授予发布资格。",
  },
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
    checks: [
      "Runner 容量与 Chromium 沙箱",
      "pnpm 锁定依赖",
      "Playwright 与 Go 依赖",
    ],
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
    summary: "等待三个数据库检查清理完成后运行 Go 测试与构建，覆盖 Chromium PDF 集成；此时浏览器可独立就绪。",
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
    name: "quality_browser 1/2",
    label: "浏览器主路径检查",
    summary: "复用同一 SHA 的 Web 构建；等待 Schema、升级与关键 PostgreSQL Job 清理，避免 Docker 网络拆除干扰本机请求，再验证入口、响应式边界和打印主路径。",
    checks: ["桌面与移动入口", "打印中心预览", "浏览器与端口清理"],
    outcome: "生成 Browser 场景分片回执。",
  },
  {
    name: "quality_node",
    label: "Node 汇总",
    summary:
      "核对全部 Node 分片，并完成 secrets 与 shared 收口；不会重跑分片测试。",
    checks: ["全部 Node 分片回执", "严格敏感信息扫描", "共享基础检查"],
    outcome: "形成唯一 Node 领域回执，供总聚合读取。",
  },
  {
    name: "quality_resource",
    label: "资源敏感汇总",
    summary: "核对全部资源合同与运行分片属于同一提交且完整通过。",
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
    name: "quality_browser 2/2",
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
  {
    name: "pdf_runtime_monitor",
    label: "打印引擎版本检查",
    summary: "在受控定时流水线中核对固定打印镜像与上游稳定版本。",
    checks: ["实际 Chromium 与系统包", "可修复高危漏洞", "镜像体积与上游版本"],
    outcome:
      "输出更新或漏洞报告，升级仍需固定版本并通过最终镜像的真实 PDF 验证。",
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
    diagnostics: diagnosticsFor(guide),
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
    diagnostics: null,
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
