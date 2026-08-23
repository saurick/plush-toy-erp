import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { yoyoosunRoleFlowMatrix } from "../../config/customers/yoyoosun/roleFlowMatrix.mjs";

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const handbook = read("../../docs/customers/yoyoosun/角色能力与流程矩阵.md");
const customerConfirmation = read(
  "../../docs/customers/yoyoosun/甲方角色职责与业务流转确认表.md",
);
const flowClosureMatrix = read(
  "../../docs/customers/yoyoosun/流程编排闭环矩阵.md",
);
const customerDeliveryMatrix = read(
  "../../docs/customers/yoyoosun/客户交付矩阵.md",
);
const trialRunbook = read("../../docs/customers/yoyoosun/试用环境执行手册.md");
const fullPageChecklist = read(
  "../../docs/customers/yoyoosun/试用人员全页面手工验收清单.md",
);
const trialAccountChecklist = read(
  "../../docs/customers/yoyoosun/试用账号角色菜单核对清单.md",
);
const customerReadme = read("../../docs/customers/yoyoosun/README.md");
const rbacSource = read("../../server/internal/biz/rbac.go");

const registeredPermissionKeys = new Set(
  [...rbacSource.matchAll(/^\s*Permission\w+\s+=\s+"([^"]+)"/gmu)].map(
    (match) => match[1],
  ),
);

function tableIDs(source, prefix) {
  const pattern = new RegExp(`^\\|\\s*(${prefix}\\d{2})\\s*\\|`, "gmu");
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

function tableHasLeadingCells(source, expectedCells) {
  return source.split("\n").some((line) => {
    if (!line.startsWith("|")) {
      return false;
    }
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    return expectedCells.every((cell, index) => cells[index] === cell);
  });
}

function expectedIDs(prefix, count) {
  return Array.from(
    { length: count },
    (_, index) => `${prefix}${String(index + 1).padStart(2, "0")}`,
  );
}

function sectionBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing section marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing section marker: ${endMarker}`);
  assert.ok(end > start, `${startMarker} must precede ${endMarker}`);
  return source.slice(start, end);
}

test("yoyoosun role config is complete and references registered permissions", () => {
  assert.equal(yoyoosunRoleFlowMatrix.roles.length, 9);
  assert.equal(
    new Set(yoyoosunRoleFlowMatrix.roles.map((role) => role.roleKey)).size,
    yoyoosunRoleFlowMatrix.roles.length,
  );

  for (const role of yoyoosunRoleFlowMatrix.roles) {
    assert.equal(new Set(role.menuSurfaces).size, role.menuSurfaces.length);
    assert.equal(new Set(role.capabilityKeys).size, role.capabilityKeys.length);
    assert.equal(
      new Set(role.flowResponsibilities).size,
      role.flowResponsibilities.length,
    );
    for (const permission of role.capabilityKeys) {
      assert.ok(
        registeredPermissionKeys.has(permission),
        `${role.roleKey} references unregistered ${permission}`,
      );
    }
  }
});

test("role handbook stays readable and routes exact details to structured truth", () => {
  assert.ok(handbook.length < 30_000, "handbook must remain a concise guide");
  for (const role of yoyoosunRoleFlowMatrix.roles) {
    assert.ok(
      tableHasLeadingCells(handbook, [`\`${role.roleKey}\``, role.displayName]),
      `missing role summary: ${role.roleKey}`,
    );
  }

  const permissionDump = new Set(
    [...handbook.matchAll(/`([^`\n]+)`/gu)]
      .map((match) => match[1])
      .filter((token) => registeredPermissionKeys.has(token)),
  );
  assert.ok(
    permissionDump.size <= 5,
    "handbook must not duplicate the generated permission matrix",
  );

  for (const required of [
    "config/customers/yoyoosun/roleFlowMatrix.mjs",
    "server/internal/biz/rbac.go",
    "/__dev/permission-relationships",
    "customer_config.get_effective_session",
    "Workflow task done ≠ Fact posted",
    "shipping_released",
    "WIP Accepted ≠ 成品入库",
    "runtimeEnabled=false",
    "目标环境已核验",
    "UAT 已签收",
    "普通 admin 不天然拥有业务 Fact 权限",
    "账号标志，不是角色",
    "没有稳定的订单 owner、部门关系或授权客户集合真源",
    "应收 DRAFT 需要独立 POST → POSTED",
    "应付 DRAFT 同样需要独立 POST → POSTED",
    "本文不缓存整树测试计数",
  ]) {
    assert.ok(
      handbook.includes(required),
      `missing handbook boundary: ${required}`,
    );
  }

  const assignment = yoyoosunRoleFlowMatrix.roleAssignmentProfiles[0];
  assert.equal(assignment.profileKey, "finance_purchase_contract_operator");
  assert.ok(handbook.includes(`\`${assignment.profileKey}\``));
  for (const roleKey of assignment.roleKeys) {
    assert.ok(handbook.includes(`\`${roleKey}\``));
  }
});

test("sales-order responsibility roles can read their source document", () => {
  const responsibleRoles = yoyoosunRoleFlowMatrix.roles.filter((role) =>
    role.flowResponsibilities.some((item) =>
      item.startsWith("sales_order_approval."),
    ),
  );
  assert.deepEqual(
    responsibleRoles.map((role) => role.roleKey),
    ["sales", "boss", "engineering", "pmc"],
  );
  for (const role of responsibleRoles) {
    for (const permission of [
      "sales_order.read",
      "customer.read",
      "contact.read",
      "sales_order_item.read",
    ]) {
      assert.ok(
        role.capabilityKeys.includes(permission),
        `${role.roleKey}: ${permission}`,
      );
    }
    assert.ok(role.menuSurfaces.includes("sales-orders"));
  }
});

test("role documents keep reviewable Mermaid and privacy boundaries", async () => {
  const requireFromWeb = createRequire(
    new URL("../../web/package.json", import.meta.url),
  );
  const { Window } = requireFromWeb("happy-dom");
  const handbookWindow = new Window();
  globalThis.window = handbookWindow;
  globalThis.document = handbookWindow.document;
  globalThis.Element = handbookWindow.Element;
  globalThis.SVGElement = handbookWindow.SVGElement;
  const { default: mermaid } = await import(
    pathToFileURL(requireFromWeb.resolve("mermaid")).href
  );

  const documents = [handbook, customerConfirmation];
  const diagrams = documents.flatMap((document) =>
    [...document.matchAll(/```mermaid\s*\n([\s\S]*?)```/gu)].map((match) =>
      match[1].trim(),
    ),
  );
  assert.ok(diagrams.length >= 2);
  for (const [index, source] of diagrams.entries()) {
    assert.match(source, /^flowchart\s+(?:LR|RL|TD|TB|BT)\b/u);
    assert.doesNotMatch(source, /\t/u);
    await assert.doesNotReject(
      mermaid.parse(source),
      `diagram ${index + 1} must parse`,
    );
  }

  for (const document of documents) {
    assert.doesNotMatch(
      document,
      /(?<![A-Za-z0-9])1[3-9]\d{9}(?![A-Za-z0-9])/u,
    );
    assert.doesNotMatch(document, /(?<![A-Za-z0-9])\d{16,19}(?![A-Za-z0-9])/u);
    assert.doesNotMatch(document, /(?:password|token|验证码)\s*[:=]\s*\S+/iu);
  }
});

test("role handbook remains reachable from the customer index", () => {
  assert.ok(customerReadme.includes("角色能力与流程矩阵.md"));
  assert.ok(customerReadme.includes("甲方角色职责与业务流转确认表.md"));
});

test("customer confirmation separates decisions from system evidence", () => {
  for (const heading of [
    "九岗位职责总表",
    "审批、评审与放行节点确认表",
    "核心业务流程确认",
    "跨岗位交接清单",
    "退回、阻塞、返工和异常",
    "待甲方决策清单",
    "分项签认",
    "会后落账规则",
  ]) {
    assert.ok(customerConfirmation.includes(heading), `missing ${heading}`);
  }
  for (const axis of [
    "甲方结论",
    "产品基础能力",
    "永绅配置",
    "目标环境",
    "用户验收",
    "交付范围",
  ]) {
    assert.ok(customerConfirmation.includes(axis), `missing axis ${axis}`);
  }

  const roleSection = sectionBetween(
    customerConfirmation,
    "## 4. 九岗位职责总表",
    "## 5. 审批、评审与放行节点确认表",
  );
  const nodeSection = sectionBetween(
    customerConfirmation,
    "## 5. 审批、评审与放行节点确认表",
    "## 6. 核心业务流程确认",
  );
  const handoffSection = sectionBetween(
    customerConfirmation,
    "## 7. 跨岗位交接清单",
    "## 8. 退回、阻塞、返工和异常",
  );
  const exceptionSection = sectionBetween(
    customerConfirmation,
    "## 8. 退回、阻塞、返工和异常",
    "## 9. 状态含义确认",
  );
  const decisionSection = sectionBetween(
    customerConfirmation,
    "## 10. 待甲方决策清单",
    "## 11. 当面对接方法",
  );
  assert.deepEqual(tableIDs(roleSection, "R"), expectedIDs("R", 9));
  assert.deepEqual(tableIDs(nodeSection, "A"), expectedIDs("A", 6));
  assert.deepEqual(tableIDs(handoffSection, "H"), [
    ...expectedIDs("H", 19),
    "H21",
    "H22",
  ]);
  assert.deepEqual(tableIDs(exceptionSection, "X"), [
    ...expectedIDs("X", 10),
    "X12",
  ]);
  assert.deepEqual(tableIDs(decisionSection, "C"), expectedIDs("C", 9));

  for (const forbiddenTechnicalToken of [
    "workflow.task.approve",
    "finance.payment.create",
    "ProcessRuntime",
    "runtime_enabled_partial",
    "source_type",
    "idempotency_key",
    "Product Core",
  ]) {
    assert.ok(!customerConfirmation.includes(forbiddenTechnicalToken));
  }
  assert.match(customerConfirmation, /不代表系统已发布/u);
  assert.match(customerConfirmation, /甲方用户验收（UAT）仍未完成/u);
});

test("production governance separates Core WIP from preview customer flows", () => {
  for (const document of [customerDeliveryMatrix, flowClosureMatrix]) {
    assert.match(document, /PLUSH_SEW_HAND_V1/u);
    assert.match(document, /preview(?:_|-)only/u);
    assert.match(document, /133.*V5.*技术/u);
    assert.match(document, /客户.*UAT.*未/u);
  }
});

test("full-page checklist keeps its 51-target customer boundary", () => {
  const targetHeadings = fullPageChecklist.match(
    /^### (?:进入|桌面|岗位|预览|打印)-\d{2} /gmu,
  );
  assert.equal(targetHeadings?.length, 51);
  assert.doesNotMatch(
    fullPageChecklist,
    /Workflow|Fact|JSON-RPC|RBAC|raw\s*id|\b(?:key|route|system_admin)\b|岗位代码|甲方|\/erp\//iu,
  );
  assert.match(fullPageChecklist, /完成 51 项并不自动代表正式交付/u);
  assert.match(fullPageChecklist, /模拟展示任务不冒充流程闭环/u);
  assert.match(fullPageChecklist, /\| 合计\s+\|\s+51\s+\|/u);
});

test("trial runbook keeps config, RBAC and release evidence boundaries", () => {
  for (const required of [
    "51 项：2 个登录与入口、30 个电脑业务页、9 个岗位任务页、5 个打印预览和 5 个打印工作台",
    "fresh 空库基线已记录",
    "customer-config-effective-session-probe.mjs",
    "40302 未登录",
    "模拟数据不等于真实 import",
    "不证明目标环境发布、真实客户导入、客户签收、备份恢复或 release evidence 已完成",
  ]) {
    assert.ok(
      trialRunbook.includes(required),
      `missing trial boundary: ${required}`,
    );
  }
});

test("trial account checklist fixes public 133 test credentials and current navigation", () => {
  assert.match(
    trialAccountChecklist,
    /`customer-trial-133` 明确登记的公开测试凭据/u,
  );
  assert.match(trialAccountChecklist, /`uat_\*`\s*\| `12345678`/u);
  assert.match(trialAccountChecklist, /`admin`\s*\| `adminadmin`/u);
  assert.match(
    trialAccountChecklist,
    /常用：`应收管理`、`应付管理`、`发票管理`；更多：`对账管理`、`收付款核销`和来源核对页/u,
  );
});

test("customer documentation does not route to the retired delta register", () => {
  for (const document of [
    customerReadme,
    handbook,
    customerConfirmation,
    flowClosureMatrix,
    customerDeliveryMatrix,
    trialRunbook,
  ]) {
    assert.ok(!document.includes("docs/customers/yoyoosun/差异登记.md"));
    assert.ok(!document.includes("`差异登记.md`"));
  }
});
