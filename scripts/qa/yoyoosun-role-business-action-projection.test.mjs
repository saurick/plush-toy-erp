import assert from "node:assert/strict";
import test from "node:test";

import { yoyoosunRoleFlowMatrix } from "../../config/customers/yoyoosun/roleFlowMatrix.mjs";
import { hasActionPermission } from "../../web/src/erp/utils/masterDataOrderView.mjs";

const ROLE_EXPECTATIONS = Object.freeze({
  sales: Object.freeze({
    allowed: "sales_order.update",
    denied: "finance.payment.create",
  }),
  boss: Object.freeze({
    allowed: "finance.payment.approve",
    denied: "finance.payment.create",
  }),
  engineering: Object.freeze({
    allowed: "bom.update",
    denied: "purchase.order.update",
  }),
  pmc: Object.freeze({
    allowed: "pmc.plan.update",
    denied: "production.fact.post",
  }),
  purchase: Object.freeze({
    allowed: "purchase.order.update",
    denied: "warehouse.inbound.confirm",
  }),
  warehouse: Object.freeze({
    allowed: "shipment.ship",
    denied: "quality.inspection.update",
  }),
  quality: Object.freeze({
    allowed: "quality.inspection.update",
    denied: "shipment.ship",
  }),
  finance: Object.freeze({
    allowed: "finance.payment.create",
    denied: "purchase.order.update",
  }),
  production: Object.freeze({
    allowed: "production.fact.post",
    denied: "quality.inspection.update",
  }),
});

function profileFromActions(actions, overrides = {}) {
  return {
    permissions: [...actions],
    effective_session: { actions: [...actions] },
    ...overrides,
  };
}

function roleByKey(roleKey) {
  return yoyoosunRoleFlowMatrix.roles.find(
    (role) => role.roleKey === roleKey,
  );
}

test("永绅九岗位：每个角色至少一个本域动作可用，跨域写动作保持不可用", () => {
  assert.deepEqual(
    yoyoosunRoleFlowMatrix.roles.map((role) => role.roleKey).sort(),
    Object.keys(ROLE_EXPECTATIONS).sort(),
    "角色投影测试必须覆盖当前全部九个业务岗位",
  );

  for (const [roleKey, expectation] of Object.entries(ROLE_EXPECTATIONS)) {
    const role = roleByKey(roleKey);
    assert.ok(role, `${roleKey} 必须存在于客户角色矩阵`);
    const profile = profileFromActions(role.capabilityKeys);

    assert.equal(
      hasActionPermission(profile, expectation.allowed),
      true,
      `${roleKey} 应保留本域动作 ${expectation.allowed}`,
    );
    assert.equal(
      hasActionPermission(profile, expectation.denied),
      false,
      `${roleKey} 不应获得跨域动作 ${expectation.denied}`,
    );
  }
});

test("控制面管理员默认不获得业务动作，超级管理员仍受有效会话动作收窄", () => {
  const adminProfile = profileFromActions([
    "admin.read",
    "admin.create",
    "role.read",
  ]);
  assert.equal(
    hasActionPermission(adminProfile, "finance.payment.create"),
    false,
  );
  assert.equal(hasActionPermission(adminProfile, "shipment.ship"), false);

  const narrowedSuperAdmin = profileFromActions(
    ["finance.payment.read"],
    {
      is_super_admin: true,
      permissions: [],
    },
  );
  assert.equal(
    hasActionPermission(narrowedSuperAdmin, "finance.payment.read"),
    true,
  );
  assert.equal(
    hasActionPermission(narrowedSuperAdmin, "finance.payment.create"),
    false,
  );
});

test("财务兼采购合同经办只合并已分配角色，不扩张仓库或质检写权限", () => {
  const assignment =
    yoyoosunRoleFlowMatrix.roleAssignmentProfiles.find(
      (item) => item.profileKey === "finance_purchase_contract_operator",
    );
  assert.ok(assignment, "客户矩阵必须保留财务兼采购合同经办配置");

  const actions = new Set(
    assignment.roleKeys.flatMap(
      (roleKey) => roleByKey(roleKey)?.capabilityKeys || [],
    ),
  );
  const profile = profileFromActions(actions);

  assert.equal(
    hasActionPermission(profile, "finance.payment.create"),
    true,
  );
  assert.equal(hasActionPermission(profile, "purchase.order.update"), true);
  assert.equal(hasActionPermission(profile, "shipment.ship"), false);
  assert.equal(
    hasActionPermission(profile, "quality.inspection.update"),
    false,
  );
});

test("只读投影移除写动作，RBAC 与有效会话任一侧缺失都必须 fail closed", () => {
  const financeActions = roleByKey("finance").capabilityKeys;
  const readOnlyActions = financeActions.filter((action) =>
    action.endsWith(".read"),
  );
  const readOnlyProfile = {
    permissions: [...financeActions],
    effective_session: { actions: readOnlyActions },
  };

  assert.equal(
    hasActionPermission(readOnlyProfile, "finance.payment.read"),
    true,
  );
  assert.equal(
    hasActionPermission(readOnlyProfile, "finance.payment.create"),
    false,
  );
  assert.equal(
    hasActionPermission(
      {
        permissions: ["finance.payment.create"],
        effective_session: { actions: [] },
      },
      "finance.payment.create",
    ),
    false,
  );
  assert.equal(
    hasActionPermission(
      {
        permissions: [],
        effective_session: { actions: ["finance.payment.create"] },
      },
      "finance.payment.create",
    ),
    false,
  );
});
