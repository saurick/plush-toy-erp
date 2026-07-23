import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { yoyoosunCustomerPackage } from "../../config/customers/yoyoosun/customerPackage.mjs";
import { yoyoosunFlowOrchestrationCoverage } from "../../config/customers/yoyoosun/flowOrchestrationCoverage.mjs";
import { yoyoosunRoleFlowMatrix } from "../../config/customers/yoyoosun/roleFlowMatrix.mjs";

const handbook = readFileSync(
  new URL(
    "../../docs/customers/yoyoosun/角色能力与流程矩阵.md",
    import.meta.url,
  ),
  "utf8",
);
const customerConfirmation = readFileSync(
  new URL(
    "../../docs/customers/yoyoosun/甲方角色职责与业务流转确认表.md",
    import.meta.url,
  ),
  "utf8",
);
const flowClosureMatrix = readFileSync(
  new URL("../../docs/customers/yoyoosun/流程编排闭环矩阵.md", import.meta.url),
  "utf8",
);
const customerDeliveryMatrix = readFileSync(
  new URL("../../docs/customers/yoyoosun/客户交付矩阵.md", import.meta.url),
  "utf8",
);
const rootReadme = readFileSync(
  new URL("../../README.md", import.meta.url),
  "utf8",
);
const customerReadme = readFileSync(
  new URL("../../docs/customers/yoyoosun/README.md", import.meta.url),
  "utf8",
);
const customersReadme = readFileSync(
  new URL("../../docs/customers/README.md", import.meta.url),
  "utf8",
);
const docsInventory = readFileSync(
  new URL("../../docs/文档清单.md", import.meta.url),
  "utf8",
);
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
const rbacSource = readFileSync(
  new URL("../../server/internal/biz/rbac.go", import.meta.url),
  "utf8",
);

const registeredPermissionKeys = new Set(
  [...rbacSource.matchAll(/^\s*Permission\w+\s+=\s+"([^"]+)"/gmu)].map(
    (match) => match[1],
  ),
);
const registeredMenuSurfaces = new Set(
  yoyoosunRoleFlowMatrix.roles.flatMap((role) => role.menuSurfaces),
);
const registeredFlowResponsibilities = new Set(
  yoyoosunRoleFlowMatrix.roles.flatMap((role) => role.flowResponsibilities),
);

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function roleSection(roleKey) {
  const startMarker = `<!-- role-profile:${roleKey}:start -->`;
  const endMarker = `<!-- role-profile:${roleKey}:end -->`;
  const start = handbook.indexOf(startMarker);
  const end = handbook.indexOf(endMarker);
  assert.notEqual(start, -1, `handbook must include ${startMarker}`);
  assert.notEqual(end, -1, `handbook must include ${endMarker}`);
  assert.ok(end > start, `${roleKey} markers must be ordered`);
  return handbook.slice(start + startMarker.length, end);
}

function backtickTokens(source) {
  return [...source.matchAll(/`([^`\n]+)`/gu)].map((match) => match[1]);
}

function assertIncludesToken(source, value, context) {
  assert.ok(
    source.includes(`\`${value}\``),
    `${context} must include exact token ${value}`,
  );
}

function tableRows(source) {
  return source.split("\n").filter((line) => line.startsWith("| "));
}

function sectionBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing section marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing section marker: ${endMarker}`);
  assert.ok(end > start, `${startMarker} must precede ${endMarker}`);
  return source.slice(start, end);
}

function expectedIDs(prefix, count) {
  return Array.from(
    { length: count },
    (_, index) => `${prefix}${String(index + 1).padStart(2, "0")}`,
  );
}

function tableIDs(source, prefix) {
  const idPattern = new RegExp(`^${prefix}\\d{2}$`, "u");
  return tableRows(source)
    .map((row) => row.split("|")[1]?.trim())
    .filter((value) => idPattern.test(value));
}

function rowWithID(source, id) {
  const matches = tableRows(source).filter((row) =>
    row.startsWith(`| ${id} |`),
  );
  assert.equal(matches.length, 1, `${id} must have exactly one table row`);
  return matches[0];
}

function assertTableField(source, label, context) {
  const matches = tableRows(source).filter(
    (row) => row.split("|")[1]?.trim() === label,
  );
  assert.equal(matches.length, 1, `${context} must contain ${label} once`);
}

function rowWithTokens(rows, values, context) {
  const matches = rows.filter((row) =>
    values.every((value) => row.includes(`\`${value}\``)),
  );
  assert.equal(
    matches.length,
    1,
    `${context} must have exactly one associated table row`,
  );
  return matches[0];
}

test("yoyoosun role handbook lists the exact tracked role profiles", () => {
  assert.equal(yoyoosunRoleFlowMatrix.roles.length, 9);
  assert.equal(
    yoyoosunRoleFlowMatrix.roles.reduce(
      (total, role) => total + role.capabilityKeys.length,
      0,
    ),
    281,
  );
  assert.equal(
    new Set(yoyoosunRoleFlowMatrix.roles.flatMap((role) => role.capabilityKeys))
      .size,
    119,
  );
  assert.equal(registeredPermissionKeys.size, 161);
  assert.deepEqual(
    [...handbook.matchAll(/<!-- role-profile:([^:]+):start -->/gu)].map(
      (match) => match[1],
    ),
    yoyoosunRoleFlowMatrix.roles.map((role) => role.roleKey),
  );
  assert.deepEqual(
    [...handbook.matchAll(/<!-- role-profile:([^:]+):end -->/gu)].map(
      (match) => match[1],
    ),
    yoyoosunRoleFlowMatrix.roles.map((role) => role.roleKey),
  );

  for (const role of yoyoosunRoleFlowMatrix.roles) {
    assert.equal(
      new Set(role.menuSurfaces).size,
      role.menuSurfaces.length,
      `${role.roleKey} menuSurfaces must not contain duplicates`,
    );
    assert.equal(
      new Set(role.capabilityKeys).size,
      role.capabilityKeys.length,
      `${role.roleKey} capabilityKeys must not contain duplicates`,
    );
    const section = roleSection(role.roleKey);
    const documentedPermissions = new Set(
      backtickTokens(section).filter((token) =>
        registeredPermissionKeys.has(token),
      ),
    );
    const documentedMenus = new Set(
      backtickTokens(section).filter((token) =>
        registeredMenuSurfaces.has(token),
      ),
    );
    const documentedResponsibilities = new Set(
      backtickTokens(section).filter((token) =>
        registeredFlowResponsibilities.has(token),
      ),
    );

    assert.deepEqual(
      sorted(documentedPermissions),
      sorted(role.capabilityKeys),
      `${role.roleKey} handbook permissions must exactly match roleFlowMatrix`,
    );
    assert.ok(
      section.includes(`（${role.capabilityKeys.length}）`),
      `${role.roleKey} must show its exact permission count`,
    );
    assert.deepEqual(
      sorted(documentedMenus),
      sorted(role.menuSurfaces),
      `${role.roleKey} handbook menus must exactly match roleFlowMatrix`,
    );
    assert.deepEqual(
      sorted(documentedResponsibilities),
      sorted(role.flowResponsibilities),
      `${role.roleKey} handbook responsibilities must exactly match roleFlowMatrix`,
    );
    assert.ok(
      section.includes(role.displayName),
      `${role.roleKey} displayName`,
    );
    assertIncludesToken(
      section,
      role.productCoreRole,
      `${role.roleKey} Product Core role`,
    );
    for (const ownerPool of role.ownerPools) {
      assertIncludesToken(section, ownerPool, `${role.roleKey} owner pool`);
    }
    for (const printTemplate of role.printTemplates ?? []) {
      assertIncludesToken(
        section,
        printTemplate,
        `${role.roleKey} print template`,
      );
    }
    assert.ok(
      section.includes(role.guardrail),
      `${role.roleKey} exact guardrail`,
    );
    assert.ok(
      section.includes("| 参与流程 |"),
      `${role.roleKey} Fxx reverse index`,
    );
    assert.doesNotMatch(
      section,
      /`[a-z_]+(?:\.[a-z_]+)*\.\*`/u,
      `${role.roleKey} must not use wildcard permissions`,
    );
  }
});

test("yoyoosun role handbook keeps the multi-role and control-plane boundaries explicit", () => {
  const assignment = yoyoosunRoleFlowMatrix.roleAssignmentProfiles[0];
  assert.equal(assignment.profileKey, "finance_purchase_contract_operator");
  assertIncludesToken(handbook, assignment.profileKey, "multi-role profile");
  for (const roleKey of assignment.roleKeys) {
    assertIncludesToken(handbook, roleKey, "multi-role profile roles");
  }

  const controlPermissions = [
    "system.user.read",
    "system.user.create",
    "system.user.update",
    "system.user.role.assign",
    "system.user.disable",
    "system.user.revoke",
    "system.role.read",
    "system.role.permission.manage",
    "system.permission.read",
    "system.audit.read",
    "customer_config.read",
    "customer_config.publish",
    "customer_config.activate",
    "customer_config.rollback",
    "erp.business_chain_debug.read",
    "debug.business_chain.read",
    "debug.business_chain.run",
    "debug.seed",
    "debug.cleanup",
    "debug.business.clear",
  ];
  const rows = tableRows(handbook);
  const adminRow = rowWithTokens(
    rows,
    ["admin", ...controlPermissions.slice(0, 14)],
    "admin",
  );
  const debugRow = rowWithTokens(
    rows,
    ["debug_operator", ...controlPermissions.slice(14)],
    "debug_operator",
  );
  const documentedAdminPermissions = new Set(
    backtickTokens(adminRow).filter((token) =>
      registeredPermissionKeys.has(token),
    ),
  );
  const documentedDebugPermissions = new Set(
    backtickTokens(debugRow).filter((token) =>
      registeredPermissionKeys.has(token),
    ),
  );
  assert.deepEqual(
    sorted(documentedAdminPermissions),
    sorted(controlPermissions.slice(0, 14)),
  );
  assert.deepEqual(
    sorted(documentedDebugPermissions),
    sorted(controlPermissions.slice(14)),
  );
  for (const permission of controlPermissions) {
    assert.ok(
      registeredPermissionKeys.has(permission),
      `${permission} must be registered`,
    );
  }
  for (const requiredBoundary of [
    "普通 admin 不天然拥有业务 Fact 权限",
    "账号标志，不是角色",
    "没有稳定的订单 owner、部门关系或授权客户集合真源",
  ]) {
    assert.ok(
      handbook.includes(requiredBoundary),
      `missing boundary: ${requiredBoundary}`,
    );
  }
});

test("yoyoosun role handbook lists every tracked workflow and preview-only object", () => {
  assert.equal(yoyoosunCustomerPackage.status, "draft");
  assert.equal(yoyoosunCustomerPackage.runtimeEnabled, false);
  assert.equal(yoyoosunCustomerPackage.sourcePolicy.previewOnly, true);

  const rows = tableRows(handbook);
  const workflowRows = rows.filter((row) =>
    row.includes("| `workflow_only` | `preview_only` |"),
  );
  assert.deepEqual(
    workflowRows.map((row) => backtickTokens(row)[0]),
    yoyoosunCustomerPackage.workflows.map((workflow) => workflow.key),
  );

  for (const workflow of yoyoosunCustomerPackage.workflows) {
    const expectedTokens = [
      workflow.key,
      ...workflow.sourceModules,
      workflow.factBoundary,
      workflow.status,
      ...workflow.nodes.flatMap((node) => [
        node.key,
        node.type,
        node.ownerPool,
        ...(node.command ? [node.command] : []),
      ]),
    ];
    const row = rowWithTokens(
      workflowRows,
      [...new Set(expectedTokens)],
      workflow.key,
    );
    let previousIndex = -1;
    for (const node of workflow.nodes) {
      const currentIndex = row.indexOf(`\`${node.key}\``);
      assert.ok(
        currentIndex > previousIndex,
        `${workflow.key} node order: ${node.key}`,
      );
      previousIndex = currentIndex;
    }
  }

  for (const flow of yoyoosunCustomerPackage.businessFlows) {
    const row = rowWithTokens(
      rows,
      [flow.key, ...flow.modules, flow.status],
      `${flow.key} business flow`,
    );
    assert.ok(row.includes(flow.guardrail), `${flow.key} exact guardrail`);
  }
  for (const stateMachine of yoyoosunCustomerPackage.stateMachines) {
    const row = rowWithTokens(
      rows,
      [stateMachine.key, ...stateMachine.states, stateMachine.status],
      `${stateMachine.key} state machine`,
    );
    for (const [fromState, toState] of stateMachine.transitions) {
      assert.ok(
        row.includes(`\`${fromState}\` → \`${toState}\``),
        `${stateMachine.key} transition ${fromState} -> ${toState}`,
      );
    }
  }
  for (const policy of yoyoosunCustomerPackage.processPolicies) {
    for (const rule of policy.rules) {
      rowWithTokens(
        rows,
        [policy.key, rule.key, rule.decision, policy.status],
        `${policy.key}.${rule.key} policy`,
      );
    }
  }
  for (const selection of yoyoosunCustomerPackage.runtimeProcessSelections) {
    rowWithTokens(
      rows,
      Object.values(selection),
      `${selection.processKey} runtime selection`,
    );
  }
});

test("yoyoosun role handbook mirrors orchestration coverage without promoting previews", () => {
  const rows = tableRows(handbook);
  for (const layer of yoyoosunFlowOrchestrationCoverage.layers) {
    rowWithTokens(
      rows,
      [layer.key, layer.status, ...layer.evidence],
      `${layer.key} coverage layer`,
    );
  }
  for (const process of yoyoosunFlowOrchestrationCoverage.runtimeProcesses) {
    rowWithTokens(
      rows,
      [process.key, process.status, ...process.nodeTypes],
      `${process.key} runtime process`,
    );
  }
  for (const entrypoint of yoyoosunFlowOrchestrationCoverage.uiEntrypoints) {
    assertIncludesToken(handbook, entrypoint, "orchestration UI entrypoint");
  }
  for (const gate of yoyoosunFlowOrchestrationCoverage.signoffGates) {
    assertIncludesToken(handbook, gate, "orchestration sign-off gate");
  }

  for (const requiredBoundary of [
    "Workflow task done ≠ Fact posted",
    "shipping_released",
    "WIP Accepted ≠ 成品入库",
    "runtimeEnabled=false",
    "目标未核验",
    "UAT 未签收",
  ]) {
    assert.ok(
      handbook.includes(requiredBoundary),
      `missing boundary: ${requiredBoundary}`,
    );
  }
});

test("yoyoosun role handbook preserves every client-source process checkpoint and gap", () => {
  assert.deepEqual(
    [...handbook.matchAll(/^\| (F\d{2}) \|/gmu)].map((match) => match[1]),
    Array.from(
      { length: 22 },
      (_, index) => `F${String(index + 1).padStart(2, "0")}`,
    ),
    "handbook must keep exactly one ordered F01-F22 flow catalog",
  );
  for (const row of handbook
    .split("\n")
    .filter((line) => /^\| F\d{2} \|/u.test(line))) {
    assert.equal(
      row
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim())
        .filter(Boolean).length,
      6,
      `flow row must keep six non-empty cells: ${row}`,
    );
  }
  const requiredClientTerms = [
    "业务",
    "板房",
    "主料仓",
    "成品仓",
    "生产经理",
    "外发部",
    "包装部",
    "供应商 QC",
    "客户验货员",
    "审核人 / 签字人",
    "供应商 / 供货方",
    "加工方 / 加工厂",
    "公司对接人 / 联系人",
    "本厂",
  ];
  const requiredProcessMarkers = [
    "客户建档、联系人、销售建单",
    "订单、工程、采购与包材并行线",
    "布料加工、裁片回仓与检验",
    "车缝本厂 / 外发",
    "手工本厂 / 外发",
    "成品、针检、抽检、客户验货、返工",
    "目标工序不晚于来源工序",
    "包装与显式完工入库",
    "委外合同、发料、回货、质检、应付",
    "实际出货、库存扣减",
    "必须为 `PASS` / `CONCESSION`（合格或让步接收）",
    "付款、银行流水、多单核销、总账 / 税控",
  ];
  const requiredBoundaries = [
    "精确行部分退厂 / 补换",
    "补换生成新待收待检链",
    "Shipment 版本化强制门禁",
    "包材没有独立采购、IQC、领用 / 耗用事实闭环",
    "永绅 finance 未获收付款页面 / 权限",
    "付款审批、银行直连、总账、税控仍未实现",
  ];
  for (const text of [
    ...requiredClientTerms,
    ...requiredProcessMarkers,
    ...requiredBoundaries,
  ]) {
    assert.ok(
      handbook.includes(text),
      `handbook must preserve client checkpoint: ${text}`,
    );
  }
  assert.ok(
    handbook.includes("**17**"),
    "handbook must record all 17 source files",
  );
  assert.ok(
    handbook.includes("20 个 sheet"),
    "handbook must record all 20 workbook sheets",
  );
  assert.ok(
    handbook.includes("fail closed（exit 1）"),
    "formal stale pin must stay non-green",
  );
  for (const staleClaim of [
    "首次拒绝处置仍是缺口",
    "当前只会阻止本单入库",
    "当前没有 PAYMENT 写入、银行收付、多单核销",
    "PAYMENT / 银行核销不存在",
  ]) {
    assert.ok(
      !handbook.includes(staleClaim),
      `handbook must not preserve stale capability claim: ${staleClaim}`,
    );
  }
});

test("yoyoosun role handbook Mermaid and privacy guards remain reviewable", async () => {
  const handbookMermaidBlocks = [
    ...handbook.matchAll(/```mermaid\s*\n([\s\S]*?)```/gu),
  ].map((match) => match[1].trim());
  const confirmationMermaidBlocks = [
    ...customerConfirmation.matchAll(/```mermaid\s*\n([\s\S]*?)```/gu),
  ].map((match) => match[1].trim());
  assert.ok(
    handbookMermaidBlocks.length >= 16,
    "handbook must keep at least 16 focused diagrams",
  );
  assert.ok(
    confirmationMermaidBlocks.length >= 1,
    "customer confirmation must keep its one-page business chain",
  );
  const mermaidBlocks = [
    ...handbookMermaidBlocks,
    ...confirmationMermaidBlocks,
  ];
  for (const [index, source] of mermaidBlocks.entries()) {
    assert.match(
      source,
      /^flowchart\s+(?:LR|RL|TD|TB|BT)\b/u,
      `diagram ${index + 1}`,
    );
    assert.doesNotMatch(
      source,
      /\t/u,
      `diagram ${index + 1} must not contain tabs`,
    );
    await assert.doesNotReject(
      mermaid.parse(source),
      `diagram ${index + 1} must parse with the installed Mermaid runtime`,
    );
  }

  for (const document of [handbook, customerConfirmation]) {
    assert.doesNotMatch(
      document,
      /(?<![A-Za-z0-9])1[3-9]\d{9}(?![A-Za-z0-9])/u,
    );
    assert.doesNotMatch(document, /(?<![A-Za-z0-9])\d{16,19}(?![A-Za-z0-9])/u);
    assert.doesNotMatch(document, /(?:password|token|验证码)\s*[:=]\s*\S+/iu);
    assert.doesNotMatch(
      document,
      /待最终复跑|待写入/u,
      "role documents must not leave final verification placeholders",
    );
  }
  assert.match(handbook, /本文不缓存整树测试计数/u);
  assert.doesNotMatch(
    handbook,
    /客户角色 \/ 权限 \/ 流程文档同步测试 \| 通过|Mermaid Chromium 真实解析 \| 通过|scripts 1280 \/ 1280/u,
    "handbook must not cache stale execution counts",
  );
});

test("yoyoosun role handbook remains reachable from every maintained navigation entry", () => {
  const handbookPath = "docs/customers/yoyoosun/角色能力与流程矩阵.md";
  const confirmationPath =
    "docs/customers/yoyoosun/甲方角色职责与业务流转确认表.md";
  assert.ok(rootReadme.includes(handbookPath), "root README handbook link");
  assert.ok(
    rootReadme.includes(confirmationPath),
    "root README customer confirmation link",
  );
  assert.ok(
    customerReadme.includes("角色能力与流程矩阵.md"),
    "customer README handbook link",
  );
  assert.ok(
    customerReadme.includes("甲方角色职责与业务流转确认表.md"),
    "customer README customer confirmation link",
  );
  assert.ok(
    docsInventory.includes(handbookPath),
    "docs inventory handbook entry",
  );
  assert.ok(
    docsInventory.includes(confirmationPath),
    "docs inventory customer confirmation entry",
  );

  const internalAnchors = [...handbook.matchAll(/\]\(#([a-z0-9-]+)\)/gu)].map(
    (match) => match[1],
  );
  assert.deepEqual(internalAnchors, [
    "role-guide",
    "flow-guide",
    "flow-catalog",
    "known-gaps",
    "verification",
  ]);
  for (const anchor of internalAnchors) {
    assert.equal(
      handbook.split(`<a id="${anchor}"></a>`).length - 1,
      1,
      `internal anchor must exist exactly once: ${anchor}`,
    );
  }
});

test("yoyoosun customer confirmation separates business decisions from system evidence", () => {
  for (const heading of [
    "九岗位职责总表",
    "审批、评审与放行节点确认表",
    "节点确认卡",
    "核心业务流程确认",
    "甲方业务与交付范围确认",
    "乙方状态附表",
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
  const processBusinessSection = sectionBetween(
    customerConfirmation,
    "### 6.1 甲方业务与交付范围确认",
    "### 6.2 乙方状态附表",
  );
  const processEvidenceSection = sectionBetween(
    customerConfirmation,
    "### 6.2 乙方状态附表",
    "## 7. 跨岗位交接清单",
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
  for (const [source, prefix, count] of [
    [roleSection, "R", 9],
    [nodeSection, "A", 7],
    [processBusinessSection, "P", 9],
    [processEvidenceSection, "P", 9],
    [handoffSection, "H", 22],
    [exceptionSection, "X", 12],
    [decisionSection, "C", 9],
  ]) {
    assert.deepEqual(tableIDs(source, prefix), expectedIDs(prefix, count));
  }

  for (const [id, type] of [
    ["A01", "业务审批"],
    ["A02", "业务评审 / 办理任务"],
    ["A03", "业务审批"],
    ["A04", "业务审批"],
    ["A05", "放行门禁 / 风险提醒（待 C05）"],
    ["A06", "业务审批"],
    ["A07", "业务审批"],
  ]) {
    assert.ok(rowWithID(nodeSection, id).includes(`| ${type} |`), id);
  }
  assert.match(
    rowWithID(nodeSection, "A05"),
    /提醒：只记录财务意见，不改变出货状态.*提醒：不得退回或阻塞/u,
  );

  const stateLegend = sectionBetween(
    customerConfirmation,
    "## 2. 状态图例",
    "## 3. 一页业务总链",
  );
  for (const axis of [
    "甲方结论",
    "产品基础能力",
    "永绅配置",
    "目标环境",
    "用户验收",
    "交付范围",
  ]) {
    assertTableField(stateLegend, axis, "state legend");
  }
  const roleCard = sectionBetween(
    customerConfirmation,
    "### 4.1 逐岗确认卡",
    "## 5. 审批、评审与放行节点确认表",
  );
  const nodeCard = sectionBetween(
    customerConfirmation,
    "### 5.1 节点确认卡",
    "## 6. 核心业务流程确认",
  );
  for (const card of [roleCard, nodeCard]) {
    assertTableField(card, "甲方结论", "confirmation card");
    assertTableField(card, "产品基础能力（乙方填写）", "confirmation card");
    assertTableField(card, "永绅配置（乙方填写）", "confirmation card");
    assertTableField(card, "目标环境（乙方填写）", "confirmation card");
    assertTableField(card, "用户验收（乙方填写）", "confirmation card");
    assertTableField(card, "交付范围", "confirmation card");
  }
  assert.match(
    processBusinessSection,
    /\| ID \| 流程 \| 甲方目标草案 \| 既有决策 \| 本次待确认 \| 甲方结论 \| 交付范围 \| 会后落账 ID \|/u,
  );
  assert.match(
    processEvidenceSection,
    /\| ID \| 产品基础能力 \| 永绅配置 \| 目标环境 \| 用户验收 \| 状态基线 \/ 证据说明 \|/u,
  );
  assert.doesNotMatch(
    customerConfirmation,
    /\| (?:甲方结论 \/ 交付决定|产品能力 \/ 永绅配置 \/ 目标环境（乙方填写）|用户验收 \/ 交付范围) \|/u,
    "six axes must not be merged into shared fields",
  );
  assert.match(rowWithID(processBusinessSection, "P04"), /D-006/u);
  assert.match(
    rowWithID(processEvidenceSection, "P04"),
    /\| 部分支持 \|.*D-006 高层主路线已支持.*细则待确认/u,
  );
  assert.match(
    rowWithID(handoffSection, "H09"),
    /退厂 \/ 补换.*未处置数量仍保留在原到货来源/u,
  );
  assert.doesNotMatch(rowWithID(handoffSection, "H09"), /取消方向/u);
  assert.match(rowWithID(handoffSection, "H21"), /退厂安排完成|补换日期/u);
  assert.match(rowWithID(handoffSection, "H22"), /独立 IQC/u);
  assert.match(decisionSection, /\| 会后落账 ID \|/u);

  const documentControl = sectionBetween(
    customerConfirmation,
    "## 1. 文档控制",
    "### 1.1 本次确认什么",
  );
  for (const field of [
    "乙方状态基线",
    "目标环境证据编号",
    "本次签认范围",
    "受控确认来源编号",
  ]) {
    assertTableField(documentControl, field, "document control");
  }
  const signoffSection = sectionBetween(
    customerConfirmation,
    "## 12. 分项签认",
    "## 13. 会后落账规则",
  );
  assert.match(
    signoffSection,
    /\| 签认范围 \| 已确认 ID \| 有条件确认 ID \| 待确认 ID \| 不采用 ID \| 本期不讨论 ID \| 不适用 ID \| 保留意见 \/ Q-ID \| 甲方确认岗位 \| 受控确认来源编号 \| 日期 \|/u,
  );
  for (const scope of [
    "R01–R09 岗位职责",
    "A01–A07 控制节点",
    "P01–P09 核心流程",
    "H01–H22 跨岗位交接",
    "X01–X12 异常与退回",
    "C01–C09 本期范围与后续决策",
  ]) {
    assert.ok(signoffSection.includes(`| ${scope} |`), scope);
  }
  assert.match(signoffSection, /未列入任何结果列的事项继续保持待确认/u);
  assert.match(handbook, /应收 DRAFT.*独立 POST → POSTED/u);
  assert.match(handbook, /应付 DRAFT.*独立 POST → POSTED/u);
  assert.match(
    flowClosureMatrix,
    /FinanceCreditNote.*正式页面和服务端都只允许从应收 \/ 应付发起.*来源类型守卫已闭环/u,
  );
  assert.match(
    customerDeliveryMatrix,
    /异常处置能力只部分进入永绅 entitlement.*客户退货 \/ RMA 与收付款尚未进入永绅 entitlement/u,
  );
  for (const forbiddenTechnicalToken of [
    "workflow.task.approve",
    "finance.payment.create",
    "ProcessRuntime",
    "runtime_enabled_partial",
    "source_type",
    "idempotency_key",
    "Product Core",
  ]) {
    assert.ok(
      !customerConfirmation.includes(forbiddenTechnicalToken),
      `customer-facing confirmation must not expose ${forbiddenTechnicalToken}`,
    );
  }
  assert.match(customerConfirmation, /六个维度/u);
  assert.match(customerConfirmation, /触发条件/u);
  assert.match(customerConfirmation, /必审 \/ 必办资料/u);
  assert.match(customerConfirmation, /允许撤回的人和时点/u);
  assert.match(customerConfirmation, /重提后从哪个节点开始/u);
  assert.match(customerConfirmation, /发起人能否自审 \/ 代理权限边界/u);
  assert.match(customerConfirmation, /不代表系统已发布/u);
  assert.match(customerConfirmation, /甲方用户验收（UAT）仍未完成/u);
  assert.match(customerConfirmation, /客户专属受控资料库/u);
});

test("yoyoosun customer documentation does not route readers to the retired delta register", () => {
  for (const document of [
    rootReadme,
    customersReadme,
    customerReadme,
    docsInventory,
  ]) {
    assert.ok(!document.includes("docs/customers/yoyoosun/差异登记.md"));
    assert.ok(!document.includes("`差异登记.md`"));
  }
});
