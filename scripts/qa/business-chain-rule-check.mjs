#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  BUSINESS_RULES,
  businessTestKey,
} from "./lib/business-rule-catalog.mjs";
import {
  readRepositoryIdentity,
  repositoryIdentitiesEqual,
} from "./lib/repository-identity.mjs";
import {
  businessRuleTestResults,
  verifyGoTestJson,
} from "./verify-go-test-json.mjs";
import { buildManualAcceptanceBusinessChainContract } from "./manual-acceptance-business-chain-contract.mjs";
import { DEV_FLOW_STATE_CATALOG } from "../../web/src/dev-workbench/config/devFlowStateCatalog.mjs";
import {
  describeDevBusinessChainResponsibility,
  describeDevBusinessChainStep,
} from "../../web/src/dev-workbench/config/devBusinessChainProjection.mjs";
import {
  aggregateChainAuditStatus,
  CHAIN_AUDIT_STATES,
  validateBusinessChainReport,
} from "../../web/src/dev-workbench/config/devBusinessChainAudit.mjs";

export function planChainRuleCheck(chainKey, catalog = DEV_FLOW_STATE_CATALOG) {
  const chain = catalog.businessChains.find((entry) => entry.key === chainKey);
  if (!chain || chain.steps.some((step) => !step.verificationRuleIds?.length)) {
    throw new Error("所选链路尚未完整关联具名规则测试");
  }
  const ids = new Set(chain.steps.flatMap((step) => step.verificationRuleIds));
  const rules = BUSINESS_RULES.filter((rule) => ids.has(rule.id));
  const tests = [
    ...new Map(
      rules
        .flatMap((rule) => rule.tests)
        .map((test) => [businessTestKey(test), test]),
    ).values(),
  ];
  const serverTests = tests.filter((test) => test.gate === "server");
  if (!serverTests.length)
    throw new Error("所选链路没有可执行的后端单元与合同测试");
  const packages = [...new Set(serverTests.map((test) => test.package))];
  return {
    chain,
    rules,
    tests,
    commands: packages.map((pkg) => ({
      command: "go",
      args: [
        "test",
        "-json",
        "-count=1",
        "-timeout=3m",
        `./${pkg.slice("server/".length)}`,
        "-run",
        `^(${serverTests
          .filter((test) => test.package === pkg)
          .map((test) => test.name)
          .join("|")})$`,
      ],
    })),
  };
}

export function buildChainRuleCheckReport({
  plan,
  runs,
  repositoryBefore,
  repositoryAfter,
  generatedAt,
  catalog = DEV_FLOW_STATE_CATALOG,
}) {
  const content = runs.map((run) => run.stdout || "").join("\n");
  let counts, results;
  try {
    counts = verifyGoTestJson(content);
    results = businessRuleTestResults(
      content
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line)),
      "server",
    );
  } catch {
    counts = { ok: false, run: 0, pass: 0, fail: 0, skip: 0 };
    results = [];
  }
  const executed = new Map(results.map((test) => [test.id, test]));
  const tests = plan.tests.map((test) => ({
    ...test,
    ...(executed.get(businessTestKey(test)) || {
      id: businessTestKey(test),
      status: "missing",
    }),
  }));
  const stable = repositoryIdentitiesEqual(repositoryBefore, repositoryAfter);
  const ok =
    stable &&
    runs.length === plan.commands.length &&
    runs.every((run) => run.status === 0) &&
    counts.ok &&
    tests
      .filter((test) => test.gate === "server")
      .every((test) => test.status === "passed");
  const raw = plan.chain;
  const steps = raw.steps.map((step, index) => {
    const selected = new Set(
      plan.rules
        .filter((rule) => step.verificationRuleIds.includes(rule.id))
        .flatMap((rule) => rule.tests.map(businessTestKey)),
    );
    const bound = tests.filter((test) => selected.has(test.id));
    const server = bound.filter((test) => test.gate === "server");
    const passed = server.filter((test) => test.status === "passed").length;
    const status = !stable
      ? "drift"
      : server.some((test) => test.status === "failed")
        ? "failed"
        : !ok
          ? "blocked"
          : "not_proven";
    const description = describeDevBusinessChainStep(catalog, step);
    return {
      key: step.key,
      number: index + 1,
      label: step.label,
      fromLabel: raw.nodes.find((node) => node.key === step.fromNodeKey).label,
      toLabel: raw.nodes.find((node) => node.key === step.toNodeKey).label,
      responsibleRole: describeDevBusinessChainResponsibility(
        step.responsibility,
      ),
      preconditions: [
        description.condition,
        ...description.preconditions,
      ].filter(Boolean),
      actions: [step.label],
      results: description.results,
      facts: [step.factBoundary],
      status,
      statusLabel: CHAIN_AUDIT_STATES[status].label,
      level: "后端单元与 SQLite 合同；非岗位端到端实跑",
      observed: `本步骤关联后端用例 ${passed}/${server.length} 通过；另有 ${bound.length - server.length} 个前端或 PostgreSQL 用例未由本入口执行。`,
      evidence: [
        { path: "test-results.json", label: "具名用例结果、计数与来源身份" },
        { path: "go-test.json", label: "原始 Go 执行日志" },
      ],
    };
  });
  const status = aggregateChainAuditStatus(steps);
  const report = {
    title: `${raw.label} · 定向规则验证`,
    generatedAt,
    verdict: ok
      ? "本次后端规则用例通过；完整业务链实测仍需独立验证。"
      : "本次规则验证失败或来源发生变化，请查看执行证据。",
    scope: {
      sourceCommit: repositoryBefore.commit,
      customer: "Product Core",
      data: "用例自建的合成与 SQLite 隔离数据",
      mode: "具名后端规则验证",
      terminal: "采购应付过账规则",
      notIncluded: [
        "共享开发库及真实客户数据",
        "真实 PostgreSQL 并发门禁",
        "岗位浏览器业务写入及客户验收",
      ],
      chainCount: 1,
      stepCount: steps.length,
      registeredScenarioCount: raw.acceptanceScenarios.length,
    },
    metrics: {
      stepStates: Object.fromEntries(
        Object.keys(CHAIN_AUDIT_STATES).map((status) => [
          status,
          steps.filter((step) => step.status === status).length,
        ]),
      ),
    },
    definitionSnapshot: buildManualAcceptanceBusinessChainContract({ catalog })
      .definitionSnapshot,
    chains: [
      {
        key: raw.key,
        label: raw.label,
        summary: raw.summary,
        status,
        statusLabel: CHAIN_AUDIT_STATES[status].label,
        stepCount: steps.length,
        steps,
        scenarios: raw.acceptanceScenarios.map((scenario) => ({
          key: scenario.key,
          label: scenario.label,
          result: "具名规则检查覆盖部分约束；未执行该场景的完整岗位链路。",
        })),
        evidence: [],
      },
    ],
    coverageLimits: [
      "用例通过不等于该交接或整条业务链已完成端到端验收；未执行层级保持未证明。",
      "来源身份及逐项计数保存在 test-results.json；同提交号不代表同一工作区。",
    ],
    findings: [],
    evidence: [
      { path: "test-results.json", label: "定向规则验证结果" },
      { path: "commands.json", label: "实际命令与退出状态" },
    ],
    createEdit: [],
    mobileActions: [],
    pages: [],
    lineage: [],
    printing: { templates: [] },
    pdfValidation: { templates: [] },
  };
  validateBusinessChainReport(report);
  return {
    ok,
    report,
    results: {
      generatedAt,
      repositoryBefore,
      repositoryAfter,
      sourceUnchanged: stable,
      counts,
      tests,
      rules: plan.rules,
      steps: raw.steps.map((step) => ({
        chainKey: raw.key,
        stepKey: step.key,
        ruleIds: step.verificationRuleIds,
        testIds: [
          ...new Set(
            plan.rules
              .filter((rule) => step.verificationRuleIds.includes(rule.id))
              .flatMap((rule) => rule.tests.map(businessTestKey)),
          ),
        ],
      })),
    },
  };
}

async function main(argv) {
  let chainKey = "purchase_to_inventory",
    run = false;
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--chain") chainKey = argv[++index];
    else if (argv[index] === "--run") run = true;
    else
      throw new Error(
        "用法：node scripts/qa/business-chain-rule-check.mjs [--chain purchase_to_inventory] [--run]",
      );
  }
  const root = path.resolve(import.meta.dirname, "../..");
  const plan = planChainRuleCheck(chainKey);
  if (!run) {
    console.log(
      JSON.stringify(
        {
          chain: plan.chain.key,
          commands: plan.commands,
          notRun: plan.tests.filter((test) => test.gate !== "server"),
        },
        null,
        2,
      ),
    );
    return;
  }
  const repositoryBefore = await readRepositoryIdentity(root);
  const runs = plan.commands.map(({ command, args }) => {
    const result = spawnSync(command, args, {
      cwd: path.join(root, "server"),
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      encoding: "utf8",
      timeout: 300000,
      maxBuffer: 32 * 1024 * 1024,
    });
    return {
      command,
      args,
      status: result.status,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
    };
  });
  const generatedAt = new Date().toISOString();
  const value = buildChainRuleCheckReport({
    plan,
    runs,
    repositoryBefore,
    repositoryAfter: await readRepositoryIdentity(root),
    generatedAt,
  });
  const batch = `${generatedAt.replace(/[^0-9]/gu, "")}-rules-${randomBytes(3).toString("hex")}`;
  const directory = path.join(root, "output/qa/business-chain-audit", batch);
  await mkdir(directory, { recursive: true });
  const files = {
    "go-test.json": runs.map((run) => run.stdout).join("\n"),
    "commands.json": JSON.stringify(
      runs.map(({ stdout: _stdout, ...run }) => run),
      null,
      2,
    ),
    "test-results.json": JSON.stringify(value.results, null, 2),
    "report.json": JSON.stringify(value.report, null, 2),
  };
  for (const [file, contents] of Object.entries(files))
    await writeFile(path.join(directory, file), contents);
  await writeFile(
    path.join(directory, "artifact-manifest.json"),
    JSON.stringify(
      {
        files: Object.entries(files).map(([file, contents]) => ({
          path: file,
          bytes: Buffer.byteLength(contents),
          sha256: createHash("sha256").update(contents).digest("hex"),
        })),
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      {
        ok: value.ok,
        batch,
        directory,
        counts: value.results.counts,
        sourceUnchanged: value.results.sourceUnchanged,
      },
      null,
      2,
    ),
  );
  if (!value.ok) process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
