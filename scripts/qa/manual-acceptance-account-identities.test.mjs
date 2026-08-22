import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOMER_UAT_ACCOUNT_SET,
  LOCAL_DEMO_ACCOUNT_SET,
  SCENARIO_DEMO_ACCOUNT_SET,
  assertManualAcceptanceRoleUsernames,
  manualAcceptanceAccountSetForTarget,
  resolveManualAcceptanceRoleCredential,
} from "./manual-acceptance-account-identities.mjs";

test("account identities bind demo and uat prefixes to exact targets", () => {
  assert.equal(LOCAL_DEMO_ACCOUNT_SET.businessAdminUsername, "demo_admin");
  assert.equal(SCENARIO_DEMO_ACCOUNT_SET.roleUsernames.boss, "demo_boss");
  assert.equal(CUSTOMER_UAT_ACCOUNT_SET.businessAdminUsername, "uat_admin");
  assert.equal(CUSTOMER_UAT_ACCOUNT_SET.roleUsernames.finance, "uat_finance");
  assert.equal(
    LOCAL_DEMO_ACCOUNT_SET.formalProfiles.find(
      (item) => item.roleKey === "finance",
    ).displayName,
    "演示财务",
  );
  assert.equal(
    CUSTOMER_UAT_ACCOUNT_SET.formalProfiles.find(
      (item) => item.roleKey === "finance",
    ).displayName,
    "UAT 财务",
  );
  assert.deepEqual(
    LOCAL_DEMO_ACCOUNT_SET.scenarios.map((item) => item.username),
    ["demo_disabled", "demo_sales_purchase", "demo_no_entry"],
  );
  assert.deepEqual(
    CUSTOMER_UAT_ACCOUNT_SET.scenarios.map((item) => item.username),
    ["uat_disabled", "uat_sales_purchase", "uat_no_entry"],
  );
  assert.deepEqual(
    CUSTOMER_UAT_ACCOUNT_SET.scenarios.map((item) => item.displayName),
    ["UAT 停用员工", "UAT 业务采购兼任", "UAT 未分配岗位员工"],
  );
});

test("account identity lookup rejects unknown or cross-target usernames", () => {
  assert.throws(
    () => manualAcceptanceAccountSetForTarget("production"),
    /account target must be one of/u,
  );
  assert.throws(
    () =>
      assertManualAcceptanceRoleUsernames(
        "customer-trial-133",
        LOCAL_DEMO_ACCOUNT_SET.roleUsernames,
      ),
    /uat_\* account contract/u,
  );
  assert.equal(
    assertManualAcceptanceRoleUsernames(
      "customer-trial-133",
      CUSTOMER_UAT_ACCOUNT_SET.roleUsernames,
    ).boss,
    "uat_boss",
  );
});

test("customer UAT credential never falls back to local demo variables", () => {
  const env = {
    MANUAL_ACCEPTANCE_PASSWORD: "local-demo-secret",
    TRIAL_ACCOUNT_PASSWORD: "legacy-local-secret",
    ERP_ROLE_DEMO_PASSWORD: "seed-local-secret",
  };
  assert.deepEqual(
    resolveManualAcceptanceRoleCredential({
      target: "customer-trial-133",
      env,
    }),
    { value: "", source: "MANUAL_ACCEPTANCE_UAT_PASSWORD" },
  );
  assert.deepEqual(
    resolveManualAcceptanceRoleCredential({
      target: "customer-trial-133",
      env: { ...env, MANUAL_ACCEPTANCE_UAT_PASSWORD: "target-uat-secret" },
    }),
    {
      value: "target-uat-secret",
      source: "MANUAL_ACCEPTANCE_UAT_PASSWORD",
    },
  );
  assert.equal(
    resolveManualAcceptanceRoleCredential({
      target: "local-dev",
      env,
    }).value,
    "local-demo-secret",
  );
});

test("customer UAT credential rejects local-only public values from env and explicit callers", () => {
  for (const password of ["adminadmin", "12345678"]) {
    assert.throws(
      () =>
        resolveManualAcceptanceRoleCredential({
          target: "customer-trial-133",
          password,
        }),
      /refuses local-only public password/u,
    );
    assert.throws(
      () =>
        resolveManualAcceptanceRoleCredential({
          target: "customer-trial-133",
          env: { MANUAL_ACCEPTANCE_UAT_PASSWORD: password },
        }),
      /refuses local-only public password/u,
    );
    assert.equal(
      resolveManualAcceptanceRoleCredential({
        target: "local-dev",
        password,
      }).value,
      password,
    );
  }
});
