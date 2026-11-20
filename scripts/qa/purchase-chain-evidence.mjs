import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  assertPurchaseChainBrowserEvidence,
  PURCHASE_CHAIN_MAIN_STEPS,
} from "./purchase-chain-browser.mjs";
import {
  businessRuleTestResults,
  verifyGoTestJson,
} from "./verify-go-test-json.mjs";
import { planChainRuleCheck } from "./business-chain-rule-check.mjs";
import { businessTestKey } from "./lib/business-rule-catalog.mjs";
import { repositoryIdentitiesEqual } from "./lib/repository-identity.mjs";
import {
  aggregateChainAuditStatus,
  CHAIN_AUDIT_STATES,
  validateBusinessChainReport,
} from "../../web/src/dev-workbench/config/devBusinessChainAudit.mjs";
import { validateBusinessChainDefinitionSnapshot } from "./manual-acceptance-business-chain-contract.mjs";
import { PURCHASE_RELATED_SOURCE_CASES } from "./purchase-related-source-permissions-browser.mjs";

function relatedSourceChains(browser) {
  return [...new Set(PURCHASE_RELATED_SOURCE_CASES.map((entry) => entry.chain))].map((key) => {
    const chain = browser.definitionSnapshot.chains.find((entry) => entry.key === key);
    assert.ok(chain);
    const steps = chain.steps.map((step, index) => {
      const proofs = browser.relatedSourcePermissions.filter((proof) => proof.chainKey === key && proof.stepKey === step.key);
      const passed = proofs.length > 0;
      const status = passed ? "passed" : "not_run";
      const nodeLabel = (nodeKey) => chain.nodes.find((node) => node.key === nodeKey)?.label || nodeKey;
      return {
        key: step.key, number: index + 1, label: step.label,
        fromLabel: nodeLabel(step.fromNodeKey), toLabel: nodeLabel(step.toNodeKey),
        responsibleRole: describeDevBusinessChainResponsibility(step.responsibility),
        preconditions: [step.condition, ...step.preconditionStateRefs.map((ref) => `${ref.machineKey}：${ref.stateKey}`)].filter(Boolean),
        actions: passed ? proofs.map((proof) => proof.menu) : [step.label],
        results: step.resultStateRefs.map((ref) => `${ref.machineKey}：${ref.stateKey}`),
        facts: [step.factBoundary], status, statusLabel: CHAIN_AUDIT_STATES[status].label,
        level: passed ? "桌面岗位权限撤销、恢复、真实草稿生成与 PostgreSQL 读回" : "本批次未执行该后续动作",
        observed: passed ? proofs.map((proof) => `${proof.menu}：本岗及来源撤权关闭并清空；后端拒绝未写入；恢复后草稿 #${proof.createdID}，库存与应付未增加${proof.lateReadIgnored ? '；延迟来源读取已取消且未回填' : ''}`).join('；') : "未将来源导入通过扩大为后续处置、过账或冲正通过。",
        evidence: passed ? [
          { path: "source-permission-checklist.md", label: "四条关联路径的测试清单与逐项结果" },
          { path: "browser-report.json", label: "权限拒绝、成功请求与数据库读回" },
          ...proofs.flatMap((proof) => [{ path: proof.screenshot, label: `${proof.menu}：撤权提示` }, { path: proof.createdScreenshot, label: `${proof.menu}：恢复后生成` }]),
        ] : [],
      };
    });
    const status = aggregateChainAuditStatus(steps);
    return { key, label: chain.label, summary: "来源权限与草稿生成实测；后续处置及过账独立取证。", status, statusLabel: CHAIN_AUDIT_STATES[status].label, stepCount: steps.length, steps, scenarios: chain.scenarios.map((scenario) => ({ key: scenario.key, label: scenario.label || scenario.kind, result: "仅已列明的权限与来源生成动作有本轮证据。" })), evidence: [{ path: "source-permission-checklist.md", label: "测试入口、条件与结果" }] };
  });
}

export function purchaseSourcePermissionChecklist(browser) {
  const lines = ["# 采购关联路径权限测试清单", "", "证据来自一次性 PostgreSQL 和真实岗位浏览器；正常来源通过正式 API 准备，不代表客户验收或后续过账已完成。", "", "| 测试入口 | 来源条件 | 本岗撤权 | 来源撤权与恢复 | 后端拒绝且无写入 | 延迟读取 | 恢复后生成 |", "| --- | --- | --- | --- | --- | --- | --- |"];
  for (const entry of PURCHASE_RELATED_SOURCE_CASES) {
    const proof = browser.relatedSourcePermissions.find((item) => item.key === entry.key);
    lines.push(`| ${entry.menu} | ${entry.actionKey === 'rejectionDisposition' ? '首次来料不合格且未入库' : entry.actionKey === 'qualityReturn' ? '入库后追加检验不合格' : '采购入库已过账'} | 通过：窗口关闭、按钮隐藏 | 通过：提示缺权、关闭清空、恢复无残值 | 通过：请求拒绝、数据库不变 | ${entry.readMethod ? '通过：取消且不回填' : '该窗口直接使用已选来源，无独立延迟读取'} | 通过：草稿 #${proof.createdID}，不增加库存或应付 |`);
  }
  lines.push("", "两类质检入口还分别撤回采购退货读取权限，验证历史资料缺权提示、窗口关闭清空和恢复后无残值；来料来源读取撤回后，质检列表也须清空。", "", "逐请求标识、撤权前后及生成后读回见 browser-report.json；截图和原始报告的 SHA-256 由本批次 manifest 校验。", "", "本批次另保留采购订单到应付主链实测。退厂确认、补换收货、退货与调整过账、取消/冲正、手机和客户验收不由这四条导入结果代替。", "");
  return lines.join('\n');
}
import { describeDevBusinessChainResponsibility } from "../../web/src/dev-workbench/config/devBusinessChainProjection.mjs";

export function buildPurchaseChainExecutionReport({
  lifecycle,
  browser,
  postgresJSON,
}) {
  assert.equal(
    lifecycle.status,
    "passed",
    "failed lifecycle cannot publish passed evidence",
  );
  assert.equal(lifecycle.scope, "purchase-chain");
  assert.equal(
    lifecycle.cleanup?.passed,
    true,
    "owned resources must be cleaned",
  );
  assert.ok(lifecycle.requestLogs?.matched > 0);
  assert.equal(lifecycle.requestLogs.credentialsAbsent, true);
  assertPurchaseChainBrowserEvidence(browser);
  const database = lifecycle.postgresLifecycle;
  assert.equal(database?.workflow, "purchase-chain-postgres");
  assert.equal(database.status, "passed");
  assert.equal(database.cleanup?.attempted, true);
  assert.equal(database.cleanup.residualDatabase, "");
  assert.ok(repositoryIdentitiesEqual(lifecycle.source, database.repository));
  assert.ok(
    repositoryIdentitiesEqual(database.repository, database.repositoryAfter),
  );
  assert.equal(
    createHash("sha256").update(postgresJSON).digest("hex"),
    database.testReport.digest,
  );
  const counts = verifyGoTestJson(postgresJSON);
  assert.equal(counts.ok, true);
  assert.equal(counts.skip, 0);
  const tests = businessRuleTestResults(
    postgresJSON
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)),
    "postgres",
  );
  const byID = new Map(tests.map((test) => [test.id, test]));
  const required = planChainRuleCheck("purchase_to_inventory").tests.filter(
    (test) => test.gate === "postgres",
  );
  assert.ok(required.length > 0);
  for (const test of required)
    assert.equal(
      byID.get(businessTestKey(test))?.status,
      "passed",
      `missing PostgreSQL rule ${test.name}`,
    );
  const frozen = browser.definitionSnapshot.chains.find(
    (chain) => chain.key === "purchase_to_inventory",
  );
  assert.ok(frozen);
  const executed = new Map(browser.steps.map((step) => [step.key, step]));
  const nodeLabel = (key) =>
    frozen.nodes.find((node) => node.key === key)?.label || key;
  const steps = frozen.steps.map((step, index) => {
    const actual = executed.get(step.key);
    const status = actual ? "passed" : "not_run";
    const observed = actual
      ? [
          `采购单 #${browser.orderID} 的该交接已完成，${actual.requestIDs.length} 条浏览器请求已关联服务端日志`,
          actual.readback.stock &&
            `库存 ${actual.readback.stock.quantity}，流水 ${actual.readback.stock.transactions} 条`,
          actual.readback.payable &&
            `应付 #${actual.readback.payable.id}，${actual.readback.payable.amount} ${actual.readback.payable.currency}，${actual.readback.payable.status === "POSTED" ? "已过账" : "草稿"}`,
          "逐项读回见原始记录",
        ]
          .filter(Boolean)
          .join("；")
      : `本批次未执行“${step.label}”，不沿用其他步骤结果。`;
    return {
      key: step.key,
      number: index + 1,
      label: step.label,
      fromLabel: nodeLabel(step.fromNodeKey),
      toLabel: nodeLabel(step.toNodeKey),
      responsibleRole: describeDevBusinessChainResponsibility(
        step.responsibility,
      ),
      preconditions: [
        step.condition,
        ...step.preconditionStateRefs.map(
          (ref) => `${ref.machineKey}：${ref.stateKey}`,
        ),
      ].filter(Boolean),
      actions: [step.label],
      results: step.resultStateRefs.map(
        (ref) => `${ref.machineKey}：${ref.stateKey}`,
      ),
      facts: [step.factBoundary],
      status,
      statusLabel: CHAIN_AUDIT_STATES[status].label,
      level: actual
        ? "桌面岗位真实浏览器、隔离 PostgreSQL 与数据库读回"
        : "未包含在独立人工采购单主路径",
      observed,
      evidence: actual
        ? [
            {
              path: "browser-report.json",
              label: "岗位请求、来源关联与数据库读回",
            },
            { path: actual.screenshot, label: "原生 4K 操作截图" },
          ]
        : [],
    };
  });
  const status = aggregateChainAuditStatus(steps);
  const relatedChains = relatedSourceChains(browser);
  const allSteps = [...steps, ...relatedChains.flatMap((chain) => chain.steps)];
  const report = {
    title: "采购订单到应付过账 · PostgreSQL 与岗位实测",
    generatedAt: lifecycle.finishedAt,
    verdict: `独立人工采购单的桌面主链 ${PURCHASE_CHAIN_MAIN_STEPS.length}/${PURCHASE_CHAIN_MAIN_STEPS.length} 个交接、四条关联来源权限与草稿生成、采购关联 PostgreSQL 具名用例 ${required.length}/${required.length} 通过；其余分支未执行。`,
    scope: {
      sourceCommit: lifecycle.source.commit,
      customer: "Product Core · yoyoosun 配置的模拟岗位",
      data: "一次性本机 PostgreSQL、合成主数据和采购草稿",
      mode: "桌面采购、审批、仓库、质检、财务真实浏览器",
      terminal: "库存入账和采购应付 POSTED",
      notIncluded: [
        "工程用料自动生成采购分支",
        "审批拒绝分支",
        "手机与真实设备",
        "共享业务库、生产发布及客户验收",
      ],
      chainCount: 1 + relatedChains.length,
      stepCount: allSteps.length,
      registeredScenarioCount: frozen.scenarios.length + relatedChains.reduce((sum, chain) => sum + chain.scenarios.length, 0),
    },
    metrics: {
      stepStates: Object.fromEntries(
        Object.keys(CHAIN_AUDIT_STATES).map((key) => [
          key,
          allSteps.filter((step) => step.status === key).length,
        ]),
      ),
    },
    definitionSnapshot: browser.definitionSnapshot,
    chains: [
      {
        key: frozen.key,
        label: frozen.label,
        summary:
          "同一采购订单经批准、实点收货、逐行 IQC、仓库入账和财务应付过账。",
        status,
        statusLabel: CHAIN_AUDIT_STATES[status].label,
        stepCount: steps.length,
        steps,
        scenarios: frozen.scenarios.map((scenario) => ({
          key: scenario.key,
          label: {
            happy_path: "正常办理",
            interruption_recovery: "中断与恢复",
            unauthorized: "权限边界",
            wrong_state: "状态守卫",
            correction: "更正与审计",
            idempotency: "重复提交",
          }[scenario.kind],
          result: "本批次仅证明下列逐步执行记录；其他场景须独立取证。",
        })),
        evidence: [
          { path: "browser-report.json", label: "桌面主链岗位实测" },
          { path: "postgres.log", label: "PostgreSQL 原始具名测试事件" },
        ],
      },
      ...relatedChains,
    ],
    coverageLimits: [
      "主链绿色不代表所有条件分支已执行；未执行分支保留原状态。",
      browser.fixtureBoundary,
      "证据绑定隔离源码快照，当前工作区后续改动不会改写历史结论。",
    ],
    findings: [],
    evidence: [
      { path: "lifecycle.json", label: "源码、镜像、迁移、日志关联与资源清理" },
      {
        path: "postgres-lifecycle.json",
        label: "数据库迁移、执行身份与清理回执",
      },
      { path: "postgres-rules.json", label: "采购关联 PostgreSQL 具名结果" },
      { path: "browser-report.json", label: "同一来源单据的岗位执行与读回" },
      ...browser.sourcePermissions.map((proof) => ({ path: proof.screenshot, label: `${proof.role === "quality" ? "品质" : "财务"}来源撤权：窗口清理与缺权提示` })),
      { path: "source-permission-checklist.md", label: "四条关联路径测试清单与结果" },
    ],
    createEdit: [],
    mobileActions: [],
    pages: [],
    lineage: [],
    printing: { templates: [] },
    pdfValidation: { templates: [] },
  };
  validateBusinessChainReport(report);
  validateBusinessChainDefinitionSnapshot(
    report.definitionSnapshot,
    report.chains,
  );
  return {
    report,
    rules: {
      repository: lifecycle.source,
      counts,
      requiredTests: required.map((test) => ({
        ...test,
        ...byID.get(businessTestKey(test)),
      })),
    },
  };
}

export async function publishPurchaseChainExecutionEvidence({
  root = path.resolve(import.meta.dirname, "../.."),
  directory,
}) {
  const source = await fs.realpath(directory);
  assert.ok(
    source.startsWith(path.join(await fs.realpath(root), "output/qa/")),
  );
  const lifecycle = JSON.parse(
    await fs.readFile(path.join(source, "lifecycle.json"), "utf8"),
  );
  const browser = JSON.parse(
    await fs.readFile(
      path.join(source, "browser/purchase-chain/report.json"),
      "utf8",
    ),
  );
  const postgresJSON = await fs.readFile(
    path.join(source, "postgres.jsonl"),
    "utf8",
  );
  const { report, rules } = buildPurchaseChainExecutionReport({
    lifecycle,
    browser,
    postgresJSON,
  });
  const batch = `purchase-e2e-${lifecycle.postgresLifecycle.databaseRunIdentity.split(":")[1]}`;
  const target = path.join(root, "output/qa/business-chain-audit", batch);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.mkdir(target, { recursive: false });
  const files = new Map([
    ["report.json", Buffer.from(JSON.stringify(report, null, 2))],
    ["browser-report.json", Buffer.from(JSON.stringify(browser, null, 2))],
    ["lifecycle.json", Buffer.from(JSON.stringify(lifecycle, null, 2))],
    [
      "postgres-lifecycle.json",
      Buffer.from(JSON.stringify(lifecycle.postgresLifecycle, null, 2)),
    ],
    ["postgres-rules.json", Buffer.from(JSON.stringify(rules, null, 2))],
    ["postgres.log", Buffer.from(postgresJSON)],
  ]);
  for (const step of browser.steps) {
    assert.match(step.screenshot, /^step-[1-9]\.png$/u);
    files.set(
      step.screenshot,
      await fs.readFile(
        path.join(source, "browser/purchase-chain", step.screenshot),
      ),
    );
  }
  for (const proof of browser.sourcePermissions) {
    assert.match(proof.screenshot, /^source-permission-(quality|finance)\.png$/u);
    files.set(proof.screenshot, await fs.readFile(path.join(source, "browser/purchase-chain", proof.screenshot)));
  }
  files.set("source-permission-checklist.md", Buffer.from(purchaseSourcePermissionChecklist(browser)));
  for (const proof of browser.relatedSourcePermissions) {
    for (const file of [proof.screenshot, proof.createdScreenshot]) {
      assert.match(file, /^(source-permission|source-created)-(receipt-return|receipt-adjustment|quality-return|rejection-disposition)\.png$/u);
      files.set(file, await fs.readFile(path.join(source, "browser/purchase-chain", file)));
    }
  }
  const manifest = [];
  for (const [file, bytes] of files) {
    await fs.writeFile(path.join(target, file), bytes);
    manifest.push({
      path: file,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  await fs.writeFile(
    path.join(target, "artifact-manifest.json"),
    JSON.stringify({ files: manifest }, null, 2),
  );
  return { batch, directory: target, verdict: report.verdict };
}

if (
  process.argv[1] &&
  pathToFileURL(await fs.realpath(process.argv[1])).href === import.meta.url
) {
  assert.equal(process.argv.length, 4);
  assert.equal(process.argv[2], "--from");
  console.log(
    JSON.stringify(
      await publishPurchaseChainExecutionEvidence({
        directory: process.argv[3],
      }),
      null,
      2,
    ),
  );
}
