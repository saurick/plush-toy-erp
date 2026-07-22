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
const rootReadme = readFileSync(
  new URL("../../README.md", import.meta.url),
  "utf8",
);
const customerReadme = readFileSync(
  new URL("../../docs/customers/yoyoosun/README.md", import.meta.url),
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
    280,
  );
  assert.equal(
    new Set(yoyoosunRoleFlowMatrix.roles.flatMap((role) => role.capabilityKeys))
      .size,
    119,
  );
  assert.equal(registeredPermissionKeys.size, 149);
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
  const requiredGaps = [
    "首次来料 IQC 不合格后的退厂 / 换货 / 补料",
    "不是直连 shipment 的强制领域门禁",
    "包材没有独立采购、IQC、领用 / 耗用事实闭环",
    "PAYMENT、银行收付、多单核销、总账、税控未实现",
  ];
  for (const text of [
    ...requiredClientTerms,
    ...requiredProcessMarkers,
    ...requiredGaps,
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
});

test("yoyoosun role handbook Mermaid and privacy guards remain reviewable", async () => {
  const mermaidBlocks = [
    ...handbook.matchAll(/```mermaid\s*\n([\s\S]*?)```/gu),
  ].map((match) => match[1].trim());
  assert.ok(
    mermaidBlocks.length >= 16,
    "handbook must keep at least 16 focused diagrams",
  );
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

  assert.doesNotMatch(handbook, /(?<![A-Za-z0-9])1[3-9]\d{9}(?![A-Za-z0-9])/u);
  assert.doesNotMatch(handbook, /(?<![A-Za-z0-9])\d{16,19}(?![A-Za-z0-9])/u);
  assert.doesNotMatch(handbook, /(?:password|token|验证码)\s*[:=]\s*\S+/iu);
  assert.doesNotMatch(
    handbook,
    /待最终复跑|待写入/u,
    "handbook must not leave final verification placeholders",
  );
  assert.ok(
    handbook.includes("Mermaid Chromium 真实解析 | 通过 | 16 / 16"),
    "handbook must preserve the final browser-rendered Mermaid count",
  );
  assert.ok(
    handbook.includes("| `strict.sh` | 通过 | `status=complete`"),
    "handbook must preserve the completed final strict gate",
  );
  assert.doesNotMatch(
    handbook,
    /客户角色 \/ 权限 \/ 流程文档同步测试 \| 通过 \| 6 \/ 6|Mermaid Chromium 真实解析 \| 通过 \| 10 \/ 10|定向 121 \/ 121/u,
    "handbook must not regress to stale verification counts",
  );
});

test("yoyoosun role handbook remains reachable from every maintained navigation entry", () => {
  const handbookPath = "docs/customers/yoyoosun/角色能力与流程矩阵.md";
  assert.ok(rootReadme.includes(handbookPath), "root README handbook link");
  assert.ok(
    customerReadme.includes("角色能力与流程矩阵.md"),
    "customer README handbook link",
  );
  assert.ok(
    docsInventory.includes(handbookPath),
    "docs inventory handbook entry",
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
