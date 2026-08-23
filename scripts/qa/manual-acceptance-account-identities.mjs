export const LOCAL_DEMO_ACCOUNT_TARGET = "local-dev";
export const SCENARIO_DEMO_ACCOUNT_TARGET = "scenario-demo";
export const CUSTOMER_UAT_ACCOUNT_TARGET = "customer-trial-133";

export const MANUAL_ACCEPTANCE_BUSINESS_ROLE_KEYS = Object.freeze([
  "boss",
  "sales",
  "purchase",
  "production",
  "warehouse",
  "quality",
  "finance",
  "pmc",
  "engineering",
]);

export const MANUAL_ACCEPTANCE_FORMAL_ROLE_KEYS = Object.freeze([
  ...MANUAL_ACCEPTANCE_BUSINESS_ROLE_KEYS,
  "admin",
]);

const TARGET_CONTRACTS = Object.freeze({
  [LOCAL_DEMO_ACCOUNT_TARGET]: Object.freeze({
    accountKind: "local-demo",
    usernamePrefix: "demo",
    passwordEnvironmentVariable: "MANUAL_ACCEPTANCE_PASSWORD",
  }),
  [SCENARIO_DEMO_ACCOUNT_TARGET]: Object.freeze({
    accountKind: "local-demo",
    usernamePrefix: "demo",
    passwordEnvironmentVariable: "MANUAL_ACCEPTANCE_PASSWORD",
  }),
  [CUSTOMER_UAT_ACCOUNT_TARGET]: Object.freeze({
    accountKind: "customer-uat",
    usernamePrefix: "uat",
    passwordEnvironmentVariable: "MANUAL_ACCEPTANCE_UAT_PASSWORD",
    fixedTestPassword: "12345678",
  }),
});
const MANUAL_ACCEPTANCE_ROLE_DISPLAY_NAMES = Object.freeze({
  boss: "老板",
  sales: "业务",
  purchase: "采购",
  production: "生产",
  warehouse: "仓库",
  quality: "质检",
  finance: "财务",
  pmc: "生管",
  engineering: "工程",
  admin: "系统管理员",
});

function displayNamePrefix(prefix) {
  return prefix === "uat" ? "UAT " : "演示";
}

function requiredTarget(value) {
  const target = String(value || "").trim();
  if (!Object.hasOwn(TARGET_CONTRACTS, target)) {
    throw new Error(
      `manual acceptance account target must be one of ${Object.keys(
        TARGET_CONTRACTS,
      ).join(", ")}`,
    );
  }
  return target;
}

function formalProfiles(prefix) {
  return MANUAL_ACCEPTANCE_FORMAL_ROLE_KEYS.map((roleKey) =>
    Object.freeze({
      username: `${prefix}_${roleKey}`,
      displayName: `${displayNamePrefix(prefix)}${MANUAL_ACCEPTANCE_ROLE_DISPLAY_NAMES[roleKey]}`,
      roleKey,
    }),
  );
}

function scenarioProfiles(prefix) {
  const prefixLabel = displayNamePrefix(prefix);
  return [
    Object.freeze({
      key: "disabled-account",
      username: `${prefix}_disabled`,
      displayName: `${prefixLabel}停用员工`,
      title: "已停用账号",
      instruction: "核对停用后的账号不能进入系统，已有业务资料仍然保留。",
      disabledReason: "验收时暂时停用",
      roleKeys: Object.freeze(["sales"]),
      positions: Object.freeze(["业务"]),
      disabled: true,
    }),
    Object.freeze({
      key: "multi-position-account",
      username: `${prefix}_sales_purchase`,
      displayName: `${prefixLabel}业务采购兼任`,
      title: "业务与采购兼任账号",
      instruction: "核对兼任人员登录后可以看到业务和采购两类入口。",
      roleKeys: Object.freeze(["sales", "purchase"]),
      positions: Object.freeze(["业务", "采购"]),
      disabled: false,
    }),
    Object.freeze({
      key: "no-business-entry-account",
      username: `${prefix}_no_entry`,
      displayName: `${prefixLabel}未分配岗位员工`,
      title: "未分配岗位账号",
      instruction: "核对尚未分配岗位的人员登录后不显示业务入口。",
      roleKeys: Object.freeze([]),
      positions: Object.freeze([]),
      disabled: false,
    }),
  ];
}

function buildAccountSet(target) {
  const normalizedTarget = requiredTarget(target);
  const contract = TARGET_CONTRACTS[normalizedTarget];
  const profiles = formalProfiles(contract.usernamePrefix);
  const roleUsernames = Object.freeze(
    Object.fromEntries(
      profiles.map(({ username, roleKey }) => [roleKey, username]),
    ),
  );
  return Object.freeze({
    target: normalizedTarget,
    accountKind: contract.accountKind,
    usernamePrefix: contract.usernamePrefix,
    passwordEnvironmentVariable: contract.passwordEnvironmentVariable,
    fixedTestPassword: contract.fixedTestPassword,
    formalProfiles: Object.freeze(profiles),
    formalUsernames: Object.freeze(profiles.map(({ username }) => username)),
    browserProfiles: Object.freeze(
      profiles.map(({ username, displayName, roleKey }) =>
        Object.freeze({
          username,
          displayName,
          roleKey: roleKey === "admin" ? "system_admin" : roleKey,
        }),
      ),
    ),
    businessRoleUsernames: Object.freeze(
      Object.fromEntries(
        MANUAL_ACCEPTANCE_BUSINESS_ROLE_KEYS.map((roleKey) => [
          roleKey,
          roleUsernames[roleKey],
        ]),
      ),
    ),
    roleUsernames,
    businessAdminUsername: roleUsernames.admin,
    scenarios: Object.freeze(scenarioProfiles(contract.usernamePrefix)),
  });
}

export const LOCAL_DEMO_ACCOUNT_SET = buildAccountSet(
  LOCAL_DEMO_ACCOUNT_TARGET,
);
export const SCENARIO_DEMO_ACCOUNT_SET = buildAccountSet(
  SCENARIO_DEMO_ACCOUNT_TARGET,
);
export const CUSTOMER_UAT_ACCOUNT_SET = buildAccountSet(
  CUSTOMER_UAT_ACCOUNT_TARGET,
);

export function manualAcceptanceAccountSetForTarget(target) {
  switch (requiredTarget(target)) {
    case LOCAL_DEMO_ACCOUNT_TARGET:
      return LOCAL_DEMO_ACCOUNT_SET;
    case SCENARIO_DEMO_ACCOUNT_TARGET:
      return SCENARIO_DEMO_ACCOUNT_SET;
    case CUSTOMER_UAT_ACCOUNT_TARGET:
      return CUSTOMER_UAT_ACCOUNT_SET;
    default:
      throw new Error("unreachable manual acceptance account target");
  }
}

export function assertManualAcceptanceRoleUsernames(target, roleUsernames) {
  const expected = manualAcceptanceAccountSetForTarget(target).roleUsernames;
  const actual =
    roleUsernames && typeof roleUsernames === "object" ? roleUsernames : {};
  const expectedKeys = Object.keys(expected);
  if (
    Object.keys(actual).length !== expectedKeys.length ||
    expectedKeys.some((roleKey) => actual[roleKey] !== expected[roleKey])
  ) {
    throw new Error(
      `${target} role usernames must use the ${manualAcceptanceAccountSetForTarget(target).usernamePrefix}_* account contract`,
    );
  }
  return expected;
}

export function resolveManualAcceptanceRoleCredential({
  target,
  password,
  env = process.env,
} = {}) {
  const accountSet = manualAcceptanceAccountSetForTarget(target);
  const result = (value, source) => Object.freeze({ value, source });
  const explicit = String(password || "").trim();
  if (accountSet.accountKind === "customer-uat") {
    const override =
      explicit || String(env?.MANUAL_ACCEPTANCE_UAT_PASSWORD || "").trim();
    if (override && override !== accountSet.fixedTestPassword) {
      throw new Error(
        `${accountSet.target} must use its fixed UAT test credential`,
      );
    }
    return result(accountSet.fixedTestPassword, "credential.contract.json");
  }
  if (explicit) return result(explicit, "explicit");
  for (const source of [
    "MANUAL_ACCEPTANCE_PASSWORD",
    "TRIAL_ACCOUNT_PASSWORD",
    "ERP_ROLE_DEMO_PASSWORD",
  ]) {
    const value = String(env?.[source] || "").trim();
    if (value) return result(value, source);
  }
  return result("", accountSet.passwordEnvironmentVariable);
}
