import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  assertPurchaseChainBrowserEvidence,
  PURCHASE_CHAIN_MAIN_STEPS,
} from "./purchase-chain-browser.mjs";
import {
  buildPurchaseChainExecutionReport,
  publishPurchaseChainExecutionEvidence,
} from "./purchase-chain-evidence.mjs";
import { createDevBusinessChainAuditService } from "../../web/dev-server/devBusinessChainAuditPlugin.mjs";
import { planChainRuleCheck } from "./business-chain-rule-check.mjs";
import { buildManualAcceptanceBusinessChainContract } from "./manual-acceptance-business-chain-contract.mjs";
import { PURCHASE_RELATED_SOURCE_CASES } from "./purchase-related-source-permissions-browser.mjs";
import { PurchaseSourceActions } from "../../web/src/common/consts/purchaseSourceActions.mjs";
import { RpcErrorCode } from "../../web/src/common/consts/errorCodes.generated.js";

function input() {
  const source = {
    commit: "a".repeat(40),
    dirty: true,
    fingerprint: "b".repeat(64),
  };
  const actions = [
    ["purchase", "execute_material_supply_purchase_order_submit"],
    ["purchase", "execute_material_supply_purchase_order_submit"],
    ["boss", "complete_task_action"],
    ["warehouse", "create_purchase_receipt_from_purchase_order"],
    ["warehouse", "create_purchase_receipt_from_purchase_order"],
    ["quality", "pass_quality_inspection"],
    ["warehouse", "post_purchase_receipt"],
    ["finance", "create_payable_from_purchase_receipt"],
    ["finance", "post_finance_fact"],
  ];
  const events = planChainRuleCheck("purchase_to_inventory")
    .tests.filter((t) => t.gate === "postgres")
    .flatMap((t) =>
      ["run", "pass"].map((Action) => ({
        Action,
        Package: t.package,
        Test: t.name,
      })),
    );
  const postgresJSON = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  const relatedSourcePermissions = PURCHASE_RELATED_SOURCE_CASES.map((entry, i) => ({
    key: entry.key, actionKey: entry.actionKey, chainKey: entry.chain, stepKey: entry.step, role: entry.role, permission: 'purchase.receipt.read', menu: entry.menu,
    modalClosed: true, actionHidden: true, reasonVisible: true, deniedWithoutWrite: true, restored: true, staleValuesCleared: true, ownPermissionRevoked: true, preparationPermissionRevoked: Boolean(entry.readMethod), backendDenialCleared: true, lateReadIgnored: Boolean(entry.readMethod), createdWithoutPosting: true,
    sourceID: i + 1, createdID: i + 10, readback: { id: i + 10, status: 'DRAFT' }, requestIDs: [`related-${i}`], deniedRequestIDs: [`denied-${i}`], screenshot: `source-permission-${entry.key}.png`, createdScreenshot: `source-created-${entry.key}.png`,
  }));
  return {
    lifecycle: {
      status: "passed",
      scope: "purchase-chain",
      source,
      finishedAt: "2026-10-25T12:00:00Z",
      cleanup: { passed: true },
      requestLogs: { matched: 20, credentialsAbsent: true },
      postgresLifecycle: {
        status: "passed",
        workflow: "purchase-chain-postgres",
        repository: source,
        repositoryAfter: source,
        cleanup: { attempted: true, residualDatabase: "" },
        testReport: {
          digest: createHash("sha256").update(postgresJSON).digest("hex"),
        },
      },
    },
    postgresJSON,
    browser: {
      status: "passed",
      pageErrors: [],
      unexpectedRPC: [],
      definitionSnapshot:
        buildManualAcceptanceBusinessChainContract().definitionSnapshot,
      fixtureBoundary: "模拟草稿由 API 准备",
      orderID: 11,
      receiptID: 22,
      payableID: 33,
      sourcePermissions: [["quality", "purchase.receipt.read"], ["finance", "purchase.return.read"]].map(([role, permission]) => ({
        role, permission, modalClosed: true, actionHidden: true, reasonVisible: true, deniedWithoutWrite: true, restored: true, staleValuesCleared: true, screenshot: `source-permission-${role}.png`,
      })),
      relatedSourcePermissions,
      flows: [{ transportFault: { injected: true, backendCode: 0 } }],
      browserRPC: [...actions.map(([role, method], i) => ({
        role,
        method,
        requestID: `request-${i}`,
        code: 0,
      })), ...relatedSourcePermissions.flatMap((proof) => [
        { role: proof.role, method: PurchaseSourceActions[proof.actionKey].method, requestID: proof.requestIDs[0], code: 0 },
        { role: proof.role, method: PurchaseSourceActions[proof.actionKey].method, requestID: proof.deniedRequestIDs[0], code: RpcErrorCode.PERMISSION_DENIED },
      ])],
      steps: PURCHASE_CHAIN_MAIN_STEPS.map((key, i) => ({
        key,
        role: actions[i][0],
        passed: true,
        requestIDs: [`request-${i}`],
        readback: { id: i + 1 },
        screenshot: `step-${i + 1}.png`,
      })),
      readback: {
        receiptOrderID: 11,
        payableReceiptID: 22,
        payableAmount: 35,
        payableStatus: "POSTED",
        inventoryQuantity: 10,
        inventoryTransactions: 1,
        payableCount: 1,
      },
      checks: Object.fromEntries(
        [
          "approvalNoFacts",
          "qualityNoInventory",
          "draftNotPosted",
          "inboundReplayExact",
          "payableReplayExact",
          "postReplayExact",
          "permissionDeniedUnchanged",
          "qualityGate",
          "pricingSnapshotVerified",
          "responseRecovered",
          "sourcePricesProtected",
          "sourcePermissionsRevokedAndRestored",
        ].map((key) => [key, true]),
      ),
    },
  };
}

test("采购主链及四条关联导入证据逐步发布，后续未执行动作保持未执行", () => {
  const { report, rules } = buildPurchaseChainExecutionReport(input());
  assert.equal(report.metrics.stepStates.passed, 12);
  assert.equal(report.chains[0].steps.filter((step) => step.status === 'not_run').length, 2);
  assert.equal(report.chains.length, 3);
  assert(report.chains.slice(1).every((chain) => chain.steps.some((step) => step.status === 'not_run')));
  assert.equal(report.chains[0].status, "not_run");
  assert.ok(rules.requiredTests.length > 0);
  assert.ok(
    report.chains[0].steps
      .filter((s) => s.status === "passed")
      .every((s) => s.evidence.some((e) => e.path.endsWith(".png"))),
  );
});

test("发布的全部采购链证据可经正式工作台下载且字节摘要保持一致", async (t) => {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "purchase-evidence-")),
  );
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const directory = path.join(root, "output/qa/run");
  await fs.mkdir(path.join(directory, "browser/purchase-chain"), {
    recursive: true,
  });
  const value = input();
  value.lifecycle.postgresLifecycle.databaseRunIdentity = "ci:abc123abc123";
  await fs.writeFile(
    path.join(directory, "lifecycle.json"),
    JSON.stringify(value.lifecycle),
  );
  await fs.writeFile(
    path.join(directory, "browser/purchase-chain/report.json"),
    JSON.stringify(value.browser),
  );
  await fs.writeFile(
    path.join(directory, "postgres.jsonl"),
    value.postgresJSON,
  );
  for (const step of [...value.browser.steps, ...value.browser.sourcePermissions])
    await fs.writeFile(
      path.join(directory, "browser/purchase-chain", step.screenshot),
      "synthetic image bytes",
    );
  for (const proof of value.browser.relatedSourcePermissions) {
    for (const file of [proof.screenshot, proof.createdScreenshot]) await fs.writeFile(path.join(directory, 'browser/purchase-chain', file), 'synthetic related image bytes');
  }
  const { batch } = await publishPurchaseChainExecutionEvidence({
    root,
    directory,
  });
  const service = createDevBusinessChainAuditService({
    projectRoot: root,
    readIdentity: async () => value.lifecycle.source,
  });
  const { report, files } = await service.report(batch);
  const links = [
    ...report.evidence,
    ...report.chains.flatMap((chain) => [
      ...chain.evidence,
      ...chain.steps.flatMap((step) => step.evidence),
    ]),
  ];
  assert.ok(links.some((link) => link.path === "postgres.log"));
  assert.ok(links.some((link) => link.path === "source-permission-quality.png"));
  assert.ok(links.some((link) => link.path === 'source-permission-checklist.md'));
  for (const proof of value.browser.relatedSourcePermissions) assert(links.some((link) => link.path === proof.createdScreenshot));
  assert.ok(links.some((link) => link.path === "source-permission-finance.png"));
  assert.equal(report.chains[0].steps[0].responsibleRole, "采购");
  for (const link of links) {
    assert.ok(
      files.some((file) => file.path === link.path),
      `unregistered artifact ${link.path}`,
    );
    const artifact = await service.artifact(batch, link.path);
    assert.ok(artifact.bytes.length > 0);
  }
  assert.equal(
    (await service.artifact(batch, "postgres.log")).bytes.toString(),
    value.postgresJSON,
  );
  await assert.rejects(
    publishPurchaseChainExecutionEvidence({ root, directory }),
    /EEXIST/u,
  );
});

test("失败、残留、来源变化或缺少日志关联不能发布通过证据", () => {
  for (const change of [
    (x) => {
      x.lifecycle.status = "failed";
    },
    (x) => {
      x.lifecycle.cleanup.passed = false;
    },
    (x) => {
      x.lifecycle.postgresLifecycle.cleanup.residualDatabase = "residual";
    },
    (x) => {
      x.lifecycle.postgresLifecycle.repositoryAfter = {
        ...x.lifecycle.source,
        fingerprint: "c".repeat(64),
      };
    },
    (x) => {
      x.lifecycle.requestLogs.matched = 0;
    },
    (x) => {
      x.lifecycle.requestLogs.credentialsAbsent = false;
    },
    (x) => {
      x.browser.definitionSnapshot.digest = "f".repeat(64);
    },
    (x) => { x.browser.sourcePermissions = []; },
    (x) => { x.browser.sourcePermissions[0].staleValuesCleared = false; },
    (x) => { x.browser.relatedSourcePermissions = []; },
    (x) => { x.browser.relatedSourcePermissions[0].backendDenialCleared = false; },
    (x) => { x.browser.relatedSourcePermissions[2].lateReadIgnored = false; },
    (x) => { x.browser.relatedSourcePermissions[2].preparationPermissionRevoked = false; },
    (x) => { x.browser.relatedSourcePermissions[0].requestIDs = ['unrelated']; },
  ]) {
    const value = input();
    change(value);
    assert.throws(() => buildPurchaseChainExecutionReport(value));
  }
});

test("原始数据库日志摘要、具名父测试、精确包名及零跳过均必须满足", () => {
  for (const change of [
    (events) => [],
    (events) => events.filter((_, i) => i > 1),
    (events) => events.map((e) => ({ ...e, Package: "other/package" })),
    (events) => events.map((e, i) => (i === 1 ? { ...e, Action: "skip" } : e)),
    (events) => events.map((e, i) => (i === 1 ? { ...e, Action: "fail" } : e)),
    (events) => events.map((e) => ({ ...e, Test: `${e.Test}/child` })),
  ]) {
    const value = input();
    value.postgresJSON =
      change(value.postgresJSON.trim().split("\n").map(JSON.parse))
        .map(JSON.stringify)
        .join("\n") + "\n";
    value.lifecycle.postgresLifecycle.testReport.digest = createHash("sha256")
      .update(value.postgresJSON)
      .digest("hex");
    assert.throws(() => buildPurchaseChainExecutionReport(value));
  }
  const tampered = input();
  tampered.postgresJSON += "\n";
  assert.throws(() => buildPurchaseChainExecutionReport(tampered));
});

test("步骤缺失、请求身份错位和最终事实错误不得被绿色标签覆盖", () => {
  for (const change of [
    (b) => b.steps.pop(),
    (b) => {
      b.steps[0].requestIDs = [];
    },
    (b) => {
      b.steps[2].requestIDs = ["request-0"];
    },
    (b) => {
      b.steps[6].role = "admin";
    },
    (b) => {
      b.readback.receiptOrderID = 99;
    },
    (b) => {
      b.readback.payableReceiptID = 99;
    },
    (b) => {
      b.readback.payableAmount = 70;
    },
    (b) => {
      b.readback.inventoryTransactions = 2;
    },
    (b) => {
      b.checks.qualityNoInventory = false;
    },
    (b) => {
      b.pageErrors.push({ message: "failed write" });
    },
    (b) => {
      b.assetErrors = [{ failure: "failed script" }];
    },
  ]) {
    const value = input().browser;
    change(value);
    assert.throws(() => assertPurchaseChainBrowserEvidence(value));
  }
});

test("符号链接入口确实执行命令校验，不会因 realpath 不同静默退出成功", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "purchase-chain-cli-"),
  );
  try {
    for (const file of [
      "purchase-chain-browser.mjs",
      "purchase-chain-evidence.mjs",
    ]) {
      const link = path.join(directory, file);
      await fs.symlink(path.resolve("scripts/qa", file), link);
      const result = spawnSync(process.execPath, [link], {
        encoding: "utf8",
        timeout: 15000,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /AssertionError/u);
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
