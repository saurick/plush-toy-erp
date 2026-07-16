import assert from "node:assert/strict";
import test from "node:test";

import {
  FORMAL_DEMO_ACCOUNTS,
  FORMAL_DEMO_ACCOUNT_PROFILES,
  MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM_PHRASE,
  MANUAL_ACCEPTANCE_ACCOUNT_SCENARIOS,
  MANUAL_ACCEPTANCE_ROLE_CAPABILITY_BASELINE,
  applyManualAcceptanceAccountScenarios,
  buildManualAcceptanceAccountScenarioPlan,
  manualAcceptanceFormalAccountBootstrapConfirmation,
  normalizeAccountScenarioBackendURL,
  requireAdminAccountRecord,
  runManualAcceptanceAccountScenarioCli,
} from "./manual-acceptance-account-scenarios.mjs";
import {
  CUSTOMER_TRIAL_133_CONFIG_APPLY_PURPOSE,
  CUSTOMER_TRIAL_133_CONFIG_DATA_VERSION,
  CUSTOMER_TRIAL_133_CONFIG_PRODUCT_VERSION,
  CUSTOMER_TRIAL_133_CONFIG_REVISION,
  CUSTOMER_TRIAL_133_ORIGIN,
  CUSTOMER_TRIAL_133_TARGET,
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_APPLY_PURPOSE,
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_PRODUCT_VERSION,
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION,
  manualAcceptanceTargetConfirmation,
} from "./manual-acceptance-target-policy.mjs";

const LOCAL_BACKEND_URL = "http://127.0.0.1:8310";
const LOCAL_DATABASE_NAME = "plush_erp_acceptance_20260716_v5_dev";

function localPlan(overrides = {}) {
  return buildManualAcceptanceAccountScenarioPlan({
    backendURL: LOCAL_BACKEND_URL,
    databaseName: LOCAL_DATABASE_NAME,
    ...overrides,
  });
}

function customerTrial133Attestation() {
  return {
    target: CUSTOMER_TRIAL_133_TARGET,
    origin: CUSTOMER_TRIAL_133_ORIGIN,
    customerKey: "yoyoosun",
    environment: "prod",
    release: "56ecf873796ffafc53f12a3cd5f8b7adb0214581",
    migration: "20260714165115",
    debug: {
      seedEnabled: false,
      seedAllowed: false,
      cleanupEnabled: false,
      cleanupAllowed: false,
      businessDataClearEnabled: false,
      businessDataClearAllowed: false,
    },
  };
}

function role(roleKey) {
  return {
    id: roleKey.length,
    role_key: roleKey,
    name: roleKey,
    description: "",
    builtin: true,
    disabled: false,
    sort_order: 1,
  };
}

function admin({
  id,
  username,
  roleKeys = [],
  disabled = false,
  phone = "",
  isSuperAdmin = false,
  accountStatus,
}) {
  return {
    id,
    username,
    phone,
    is_super_admin: isSuperAdmin,
    disabled,
    ...(accountStatus ? { account_status: accountStatus } : {}),
    roles: roleKeys.map(role),
    permissions: [],
    menus: [],
  };
}

function formalAccounts() {
  return FORMAL_DEMO_ACCOUNTS.map((username, index) =>
    admin({
      id: index + 1,
      username,
      roleKeys: [username.replace(/^demo_/u, "")],
    }),
  );
}

function acceptanceRoles(overrides = {}) {
  return MANUAL_ACCEPTANCE_ROLE_CAPABILITY_BASELINE.map((item, index) => ({
    id: index + 1,
    role_key: item.roleKey,
    role_type: "business_default",
    version: 1,
    disabled: false,
    permissions_editable: true,
    permissions_editable_by_current_admin: true,
    permissions: [
      ...(Object.hasOwn(overrides, item.roleKey)
        ? overrides[item.roleKey]
        : item.capabilityKeys),
    ].sort(),
  }));
}

function ok(data, url, extras = {}) {
  return {
    ok: true,
    status: 200,
    url,
    redirected: false,
    json: async () => ({ result: { code: 0, message: "ok", data } }),
    ...extras,
  };
}

function createBackend({
  environment = "local",
  revision,
  configProductVersion,
  configApplyPurpose,
  configDatasetVersion,
  configTarget,
  initialAccounts = formalAccounts(),
  redirectLogin = false,
  malformedCreate = false,
  transformResetResponse = (account) => account,
  initialAuditTotal = 4,
  initialRolePermissions = {},
  roleOptionsTransform = (roles) => roles,
  permissionOptionsTransform = (permissions) => permissions,
} = {}) {
  const remote = environment === "remote";
  const activeRevision =
    revision === undefined
      ? remote
        ? CUSTOMER_TRIAL_133_CONFIG_REVISION
        : LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION
      : revision;
  const activeProductVersion =
    configProductVersion === undefined
      ? remote
        ? CUSTOMER_TRIAL_133_CONFIG_PRODUCT_VERSION
        : LOCAL_MANUAL_ACCEPTANCE_CONFIG_PRODUCT_VERSION
      : configProductVersion;
  const activeApplyPurpose =
    configApplyPurpose === undefined
      ? remote
        ? CUSTOMER_TRIAL_133_CONFIG_APPLY_PURPOSE
        : LOCAL_MANUAL_ACCEPTANCE_CONFIG_APPLY_PURPOSE
      : configApplyPurpose;
  const activeDatasetVersion =
    configDatasetVersion === undefined && remote
      ? CUSTOMER_TRIAL_133_CONFIG_DATA_VERSION
      : configDatasetVersion;
  const activeTarget =
    configTarget === undefined && remote
      ? CUSTOMER_TRIAL_133_TARGET
      : configTarget;
  const state = initialAccounts.map((item) => structuredClone(item));
  const roleState = acceptanceRoles(initialRolePermissions);
  const calls = [];
  const passwords = new Map();
  let nextID = Math.max(...state.map((item) => Number(item.id)), 0) + 1;
  let auditTotal = initialAuditTotal;
  const permissionOptions = () =>
    [
      ...new Set([
        ...MANUAL_ACCEPTANCE_ROLE_CAPABILITY_BASELINE.flatMap(
          (item) => item.capabilityKeys,
        ),
        ...roleState.flatMap((item) => item.permissions),
      ]),
    ]
      .sort()
      .map((permissionKey, index) => ({
        id: index + 1,
        permission_key: permissionKey,
        class: "business",
        assignable: true,
        non_production_only: false,
      }));

  const fetchImpl = async (url, options) => {
    if (!options.body) {
      calls.push({
        domain: "runtime-identity",
        method: "probe",
        params: {},
        options,
      });
      return {
        ok: true,
        status: 200,
        redirected: false,
        headers: {
          get: (name) =>
            name === "X-ERP-Runtime-Identity-Proof" ? "matched-v1" : null,
        },
        async text() {
          return "runtime identity matched";
        },
      };
    }
    const body = JSON.parse(options.body);
    const domain = new URL(url).pathname.split("/").at(-1);
    const entry = { domain, method: body.method, params: body.params, options };
    calls.push(entry);
    assert.equal(options.redirect, "error");

    if (domain === "auth" && body.method === "admin_login") {
      const loginAccount =
        body.params.username === "admin"
          ? admin({
              id: 10_000,
              username: "admin",
              roleKeys: ["admin"],
              isSuperAdmin: true,
            })
          : state.find((item) => item.username === body.params.username);
      return ok(
        {
          ...structuredClone(loginAccount),
          access_token: `local-${body.params.username}-token`,
        },
        url,
        redirectLogin ? { redirected: true } : {},
      );
    }
    if (domain === "debug" && body.method === "capabilities") {
      return ok(
        {
          environment,
          ...(["sql", "prod", "remote"].includes(environment)
            ? {
                seedEnabled: false,
                seedAllowed: false,
                cleanupEnabled: false,
                cleanupAllowed: false,
                businessDataClearEnabled: false,
                businessDataClearAllowed: false,
              }
            : {}),
        },
        url,
      );
    }
    if (
      domain === "customer_config" &&
      body.method === "get_effective_session"
    ) {
      return ok(
        {
          session: {
            customer: { key: "yoyoosun" },
            source: "active_customer_config_revision",
            configRevision: activeRevision,
            configProductVersion: activeProductVersion,
            configApplyPurpose: activeApplyPurpose,
            configDatasetVersion: activeDatasetVersion,
            configTarget: activeTarget,
          },
        },
        url,
      );
    }
    if (domain === "admin" && body.method === "list") {
      return ok({ admins: structuredClone(state) }, url);
    }
    if (domain === "admin" && body.method === "rbac_options") {
      return ok(
        {
          roles: roleOptionsTransform(structuredClone(roleState)),
          permissions: permissionOptionsTransform(permissionOptions()),
        },
        url,
      );
    }
    if (domain === "admin" && body.method === "set_role_permissions") {
      const selected = roleState.find(
        (item) => item.role_key === body.params.role_key,
      );
      assert(selected);
      assert.equal(body.params.expected_version, selected.version);
      selected.permissions = [...body.params.permission_keys].sort();
      selected.version += 1;
      auditTotal += 1;
      return ok({ role: structuredClone(selected) }, url);
    }
    if (domain === "admin" && body.method === "audit_logs") {
      return ok({ events: [], total: auditTotal, limit: 1, offset: 0 }, url);
    }
    if (domain === "admin" && body.method === "create") {
      const created = admin({
        id: nextID++,
        username: body.params.username,
        roleKeys: body.params.role_keys,
      });
      state.push(created);
      auditTotal += 1;
      if (malformedCreate) {
        const malformed = structuredClone(created);
        delete malformed.id;
        return ok({ admin: malformed }, url);
      }
      return ok({ admin: structuredClone(created) }, url);
    }
    if (domain === "admin" && body.method === "set_roles") {
      const account = state.find((item) => item.id === body.params.id);
      account.roles = body.params.role_keys.map(role);
      auditTotal += 1;
      return ok({ admin: structuredClone(account) }, url);
    }
    if (domain === "admin" && body.method === "set_disabled") {
      const account = state.find((item) => item.id === body.params.id);
      account.disabled = body.params.disabled;
      auditTotal += 1;
      return ok({ admin: structuredClone(account) }, url);
    }
    if (domain === "admin" && body.method === "reset_password") {
      const account = state.find((item) => item.id === body.params.id);
      passwords.set(account.id, body.params.password);
      auditTotal += 1;
      const responseAccount = transformResetResponse(structuredClone(account));
      return ok({ admin: responseAccount }, url);
    }
    throw new Error(`unexpected call ${domain}.${body.method}`);
  };

  return { fetchImpl, calls, passwords, state, roleState };
}

function mutationCalls(backend) {
  return backend.calls.filter(
    (call) =>
      call.domain === "admin" &&
      new Set(["create", "set_roles", "set_disabled", "reset_password"]).has(
        call.method,
      ),
  );
}

function passwordResetCalls(backend) {
  return backend.calls.filter(
    (call) => call.domain === "admin" && call.method === "reset_password",
  );
}

function rolePermissionCalls(backend) {
  return backend.calls.filter(
    (call) =>
      call.domain === "admin" && call.method === "set_role_permissions",
  );
}

async function withConfirmation(fn) {
  const previous = process.env.MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM;
  const previousAdminPassword = process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD;
  const previousTargetConfirm = process.env.MANUAL_ACCEPTANCE_TARGET_CONFIRM;
  const previousFormalConfirm =
    process.env.MANUAL_ACCEPTANCE_FORMAL_ACCOUNT_CONFIRM;
  const plan = localPlan();
  process.env.MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM =
    MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM_PHRASE;
  process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD = "guard-pass";
  process.env.MANUAL_ACCEPTANCE_TARGET_CONFIRM =
    manualAcceptanceTargetConfirmation(plan);
  process.env.MANUAL_ACCEPTANCE_FORMAL_ACCOUNT_CONFIRM =
    manualAcceptanceFormalAccountBootstrapConfirmation(plan);
  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM;
    } else {
      process.env.MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM = previous;
    }
    if (previousAdminPassword === undefined) {
      delete process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD;
    } else {
      process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD = previousAdminPassword;
    }
    if (previousTargetConfirm === undefined) {
      delete process.env.MANUAL_ACCEPTANCE_TARGET_CONFIRM;
    } else {
      process.env.MANUAL_ACCEPTANCE_TARGET_CONFIRM = previousTargetConfirm;
    }
    if (previousFormalConfirm === undefined) {
      delete process.env.MANUAL_ACCEPTANCE_FORMAL_ACCOUNT_CONFIRM;
    } else {
      process.env.MANUAL_ACCEPTANCE_FORMAL_ACCOUNT_CONFIRM =
        previousFormalConfirm;
    }
  }
}

test("report-only plan keeps ten formal accounts and describes three clear scenarios", async () => {
  const plan = buildManualAcceptanceAccountScenarioPlan();
  assert.equal(plan.mode, "report-only");
  assert.equal(plan.simulatedOnly, true);
  assert.equal(plan.realCustomerImport, false);
  assert.equal(plan.directSQL, false);
  assert.equal(plan.target, "local-dev");
  assert.equal(plan.dataVersion, "2026.07.16-v5");
  assert.equal(plan.runId, "20260716-V5");
  assert.deepEqual(plan.protectedAccounts, FORMAL_DEMO_ACCOUNTS);
  assert.equal(plan.protectedAccounts.length, 10);
  assert.equal(plan.scenarios.length, 3);
  assert.equal(plan.roleCapabilityBaseline.length, 9);
  assert.deepEqual(
    plan.roleCapabilityBaseline.map((item) => item.roleKey).sort(),
    MANUAL_ACCEPTANCE_ROLE_CAPABILITY_BASELINE.map((item) => item.roleKey).sort(),
  );
  assert.equal(
    plan.roleCapabilityBaseline.some((item) => item.roleKey === "admin"),
    false,
  );
  assert.equal(plan.scenarios[0].disabledReason, "验收时暂时停用");
  assert.deepEqual(
    plan.scenarios.map((item) => item.username),
    ["demo_uat_disabled", "demo_uat_sales_purchase", "demo_uat_no_entry"],
  );
  assert.deepEqual(plan.scenarios[0].roleKeys, ["sales"]);
  assert.equal(plan.scenarios[0].disabled, true);
  assert.deepEqual(plan.scenarios[1].roleKeys, ["sales", "purchase"]);
  assert.deepEqual(plan.scenarios[2].roleKeys, []);

  const visibleCopy = plan.scenarios
    .flatMap((item) => [item.title, item.instruction, ...item.positions])
    .join(" ");
  assert.doesNotMatch(
    visibleCopy,
    /\b(?:workflow|fact|json-rpc|rbac|usecase|schema|api|debug|mock)\b|开发|技术/iu,
  );

  let fetchCount = 0;
  const result = await runManualAcceptanceAccountScenarioCli([], {
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error("report-only must not fetch");
    },
  });
  assert.equal(fetchCount, 0);
  assert.equal(result.report.mode, "report-only");
});

test("loopback URL normalization rejects credentials and every external host", () => {
  assert.equal(
    normalizeAccountScenarioBackendURL("http://localhost:8300/"),
    "http://localhost:8300",
  );
  assert.equal(
    normalizeAccountScenarioBackendURL("http://[::1]:8300"),
    "http://[::1]:8300",
  );
  assert.throws(
    () => normalizeAccountScenarioBackendURL("https://erp.example.com"),
    /outside this computer/u,
  );
  assert.throws(
    () => normalizeAccountScenarioBackendURL("http://user:pass@127.0.0.1"),
    /must not contain credentials/u,
  );
});

test("exported apply rejects an external URL before any fetch", async () => {
  let fetchCount = 0;
  await assert.rejects(
    applyManualAcceptanceAccountScenarios(
      { backendURL: "https://erp.example.com" },
      {
        password: "demo-pass",
        fetchImpl: async () => {
          fetchCount += 1;
          throw new Error("must not fetch");
        },
      },
    ),
    /outside this computer/u,
  );
  assert.equal(fetchCount, 0);
});

test("apply requires the exact confirmation before login", async () => {
  const previous = process.env.MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM;
  process.env.MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM = "APPLY";
  let fetchCount = 0;
  const plan = localPlan();
  try {
    await assert.rejects(
      applyManualAcceptanceAccountScenarios(
        plan,
        {
          password: "demo-pass",
          targetConfirmation: manualAcceptanceTargetConfirmation(plan),
          fetchImpl: async () => {
            fetchCount += 1;
            throw new Error("must not fetch");
          },
        },
      ),
      /MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM=APPLY_SIMULATED_ACCOUNT_SCENARIOS/u,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM;
    } else {
      process.env.MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM = previous;
    }
  }
  assert.equal(fetchCount, 0);
});

test("apply requires a separate local super-admin credential before login", async () => {
  const previousConfirm = process.env.MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM;
  const previousAdminPassword = process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD;
  process.env.MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM =
    MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM_PHRASE;
  delete process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD;
  let fetchCount = 0;
  const plan = localPlan();
  try {
    await assert.rejects(
      applyManualAcceptanceAccountScenarios(
        plan,
        {
          password: "demo-pass",
          targetConfirmation: manualAcceptanceTargetConfirmation(plan),
          fetchImpl: async () => {
            fetchCount += 1;
            throw new Error("must not fetch without the guard credential");
          },
        },
      ),
      /MANUAL_ACCEPTANCE_ADMIN_PASSWORD is required/u,
    );
  } finally {
    if (previousConfirm === undefined)
      delete process.env.MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM;
    else process.env.MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM = previousConfirm;
    if (previousAdminPassword === undefined)
      delete process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD;
    else process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD = previousAdminPassword;
  }
  assert.equal(fetchCount, 0);
});

test("redirected login is rejected and every request opts out of redirects", async () => {
  const backend = createBackend({ redirectLogin: true });
  await withConfirmation(() =>
    assert.rejects(
      applyManualAcceptanceAccountScenarios(
        localPlan(),
        { password: "demo-pass", fetchImpl: backend.fetchImpl },
      ),
      /refused redirected response/u,
    ),
  );
  assert.equal(mutationCalls(backend).length, 0);
  assert.equal(backend.calls.length, 2);
  assert.equal(backend.calls[0].method, "probe");
  assert.equal(backend.calls[1].params.username, "admin");
  assert.equal(backend.calls[1].options.redirect, "error");
});

test("non-local runtime and empty active revision perform zero account writes", async () => {
  const nonLocal = createBackend({ environment: "prod" });
  await withConfirmation(() =>
    assert.rejects(
      applyManualAcceptanceAccountScenarios(
        localPlan(),
        { password: "demo-pass", fetchImpl: nonLocal.fetchImpl },
      ),
      /environment=prod/u,
    ),
  );
  assert.equal(mutationCalls(nonLocal).length, 0);

  const emptyRevision = createBackend({ revision: "   " });
  await withConfirmation(() =>
    assert.rejects(
      applyManualAcceptanceAccountScenarios(
        localPlan(),
        { password: "demo-pass", fetchImpl: emptyRevision.fetchImpl },
      ),
      /active customer configuration is not the current runtime source/u,
    ),
  );
  assert.equal(mutationCalls(emptyRevision).length, 0);
});

test("local SQL runtime is accepted only through the shared debug-disabled policy", async () => {
  const backend = createBackend({ environment: "sql" });
  const report = await withConfirmation(() =>
    applyManualAcceptanceAccountScenarios(
      localPlan(),
      { password: "demo-pass", fetchImpl: backend.fetchImpl },
    ),
  );
  assert.equal(report.runtime.target, "local-dev");
  assert.equal(report.runtime.environment, "sql");
  assert.equal(report.runtime.dataVersion, "2026.07.16-v5");
});

test("registered 133 target reconciles the same three scenario accounts without changing role permissions", async () => {
  const backend = createBackend({
    environment: "remote",
    revision: CUSTOMER_TRIAL_133_CONFIG_REVISION,
  });
  const plan = buildManualAcceptanceAccountScenarioPlan({
    backendURL: CUSTOMER_TRIAL_133_ORIGIN,
    target: CUSTOMER_TRIAL_133_TARGET,
    dataVersion: "2026.07.16-v5",
    runId: "20260716-V5",
    auditMinimum: 30,
  });
  const report = await applyManualAcceptanceAccountScenarios(plan, {
    password: "demo-pass",
    adminPassword: "guard-pass",
    confirmPhrase: MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM_PHRASE,
    targetConfirmation: manualAcceptanceTargetConfirmation(plan),
    targetAttestation: customerTrial133Attestation(),
    formalAccountConfirmation:
      manualAcceptanceFormalAccountBootstrapConfirmation(plan),
    fetchImpl: backend.fetchImpl,
  });

  assert.equal(report.target, CUSTOMER_TRIAL_133_TARGET);
  assert.equal(report.dataVersion, "2026.07.16-v5");
  assert.equal(report.runId, "20260716-V5");
  assert.equal(report.roleCapabilityBaseline.mode, "verify-only");
  assert.equal(rolePermissionCalls(backend).length, 0);
  assert.equal(report.summary.created, 3);
  assert.equal(report.scenarios.length, 3);
  assert.equal(report.formalAccountBootstrap.created, 0);
  assert.equal(report.formalAccountBootstrap.verified, 10);
  assert.equal(
    report.targetAttestation.release,
    customerTrial133Attestation().release,
  );
});

test("fresh registered 133 target creates the exact ten formal accounts before scenario accounts", async () => {
  const backend = createBackend({
    environment: "remote",
    revision: CUSTOMER_TRIAL_133_CONFIG_REVISION,
    initialAccounts: [],
  });
  const plan = buildManualAcceptanceAccountScenarioPlan({
    backendURL: CUSTOMER_TRIAL_133_ORIGIN,
    target: CUSTOMER_TRIAL_133_TARGET,
    dataVersion: "2026.07.16-v5",
    runId: "20260716-V5",
  });
  const options = {
    password: "demo-pass",
    adminPassword: "guard-pass",
    confirmPhrase: MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM_PHRASE,
    targetConfirmation: manualAcceptanceTargetConfirmation(plan),
    targetAttestation: customerTrial133Attestation(),
    formalAccountConfirmation:
      manualAcceptanceFormalAccountBootstrapConfirmation(plan),
    fetchImpl: backend.fetchImpl,
  };

  const first = await applyManualAcceptanceAccountScenarios(plan, options);
  assert.equal(first.formalAccountBootstrap.created, 10);
  assert.equal(first.formalAccountBootstrap.verified, 0);
  assert.deepEqual(
    first.formalAccountBootstrap.accounts.map((item) => ({
      username: item.username,
      roleKey: item.roleKeys[0],
    })),
    FORMAL_DEMO_ACCOUNT_PROFILES.map((item) => ({
      username: item.username,
      roleKey: item.roleKey,
    })),
  );
  assert.equal(first.protectedAccounts.length, 10);
  assert.equal(first.summary.created, 3);
  assert.doesNotMatch(JSON.stringify(first), /demo-pass/u);

  const second = await applyManualAcceptanceAccountScenarios(plan, options);
  assert.equal(second.formalAccountBootstrap.created, 0);
  assert.equal(second.formalAccountBootstrap.verified, 10);
  assert.equal(
    backend.calls.filter(
      (call) =>
        call.domain === "admin" &&
        call.method === "create" &&
        FORMAL_DEMO_ACCOUNTS.includes(call.params.username),
    ).length,
    10,
  );
});

test("fresh dedicated local database creates the exact formal accounts before scenarios and reuses them", async () => {
  const backend = createBackend({ initialAccounts: [] });
  const plan = localPlan();
  const options = {
    password: "demo-pass",
    adminPassword: "guard-pass",
    confirmPhrase: MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM_PHRASE,
    targetConfirmation: manualAcceptanceTargetConfirmation(plan),
    formalAccountConfirmation:
      manualAcceptanceFormalAccountBootstrapConfirmation(plan),
    fetchImpl: backend.fetchImpl,
  };

  const first = await applyManualAcceptanceAccountScenarios(plan, options);
  assert.equal(first.formalAccountBootstrap.created, 10);
  assert.equal(first.formalAccountBootstrap.verified, 0);
  assert.deepEqual(
    first.formalAccountBootstrap.accounts.map((item) => ({
      username: item.username,
      roleKey: item.roleKeys[0],
    })),
    FORMAL_DEMO_ACCOUNT_PROFILES.map((item) => ({
      username: item.username,
      roleKey: item.roleKey,
    })),
  );
  assert.equal(first.summary.created, 3);

  const second = await applyManualAcceptanceAccountScenarios(plan, options);
  assert.equal(second.formalAccountBootstrap.created, 0);
  assert.equal(second.formalAccountBootstrap.verified, 10);
  assert.equal(
    backend.calls.filter(
      (call) =>
        call.domain === "admin" &&
        call.method === "create" &&
        FORMAL_DEMO_ACCOUNTS.includes(call.params.username),
    ).length,
    10,
  );
});

test("fresh dedicated local database rejects the wrong formal confirmation with zero account writes", async () => {
  const backend = createBackend({ initialAccounts: [] });
  const plan = localPlan();
  await assert.rejects(
    applyManualAcceptanceAccountScenarios(plan, {
      password: "demo-pass",
      adminPassword: "guard-pass",
      confirmPhrase: MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM_PHRASE,
      targetConfirmation: manualAcceptanceTargetConfirmation(plan),
      formalAccountConfirmation: "BOOTSTRAP_FORMAL_ACCOUNTS",
      fetchImpl: backend.fetchImpl,
    }),
    /MANUAL_ACCEPTANCE_FORMAL_ACCOUNT_CONFIRM=/u,
  );
  assert.equal(mutationCalls(backend).length, 0);
  assert.equal(rolePermissionCalls(backend).length, 0);
});

test("fresh registered 133 target requires the exact formal-account confirmation before writes", async () => {
  const backend = createBackend({
    environment: "remote",
    revision: CUSTOMER_TRIAL_133_CONFIG_REVISION,
    initialAccounts: [],
  });
  const plan = buildManualAcceptanceAccountScenarioPlan({
    backendURL: CUSTOMER_TRIAL_133_ORIGIN,
    target: CUSTOMER_TRIAL_133_TARGET,
    dataVersion: "2026.07.16-v5",
    runId: "20260716-V5",
  });

  await assert.rejects(
    applyManualAcceptanceAccountScenarios(plan, {
      password: "demo-pass",
      adminPassword: "guard-pass",
      confirmPhrase: MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM_PHRASE,
      targetConfirmation: manualAcceptanceTargetConfirmation(plan),
      targetAttestation: customerTrial133Attestation(),
      formalAccountConfirmation: "BOOTSTRAP_FORMAL_ACCOUNTS",
      fetchImpl: backend.fetchImpl,
    }),
    /MANUAL_ACCEPTANCE_FORMAL_ACCOUNT_CONFIRM=/u,
  );
  assert.equal(mutationCalls(backend).length, 0);
});

test("registered 133 target rejects the old active configuration before account writes", async () => {
  const backend = createBackend({
    environment: "remote",
    revision: "yoyoosun-customer-trial-133-package-v3.runtime-manifest-v1",
    configProductVersion: "customer-trial-133-test-2026.07.15-v3",
    configDatasetVersion: "2026.07.15-v3",
  });
  const plan = buildManualAcceptanceAccountScenarioPlan({
    backendURL: CUSTOMER_TRIAL_133_ORIGIN,
    target: CUSTOMER_TRIAL_133_TARGET,
    dataVersion: "2026.07.16-v5",
    runId: "20260716-V5",
  });

  await assert.rejects(
    applyManualAcceptanceAccountScenarios(plan, {
      password: "demo-pass",
      adminPassword: "guard-pass",
      confirmPhrase: MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM_PHRASE,
      targetConfirmation: manualAcceptanceTargetConfirmation(plan),
      targetAttestation: customerTrial133Attestation(),
      fetchImpl: backend.fetchImpl,
    }),
    /active customer-trial configuration identity/u,
  );
  assert.equal(mutationCalls(backend).length, 0);
});

test("scenario password policy rejects values outside 8 to 20 characters before login", async () => {
  for (const password of ["1234567", "123456789012345678901"]) {
    let fetchCount = 0;
    const plan = localPlan();
    await assert.rejects(
      applyManualAcceptanceAccountScenarios(
        plan,
        {
          password,
          adminPassword: "guard-pass",
          confirmPhrase: MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM_PHRASE,
          targetConfirmation: manualAcceptanceTargetConfirmation(plan),
          fetchImpl: async () => {
            fetchCount += 1;
            throw new Error("must not fetch");
          },
        },
      ),
      /8-20 characters/u,
    );
    assert.equal(fetchCount, 0);
  }
});

test("local acceptance adds missing customer capabilities without replacing role selections", async () => {
  const retained = {
    warehouse: "erp.dashboard.read",
    pmc: "erp.dashboard.read",
    finance: "finance.report.read",
  };
  const backend = createBackend({
    initialRolePermissions: Object.fromEntries(
      Object.entries(retained).map(([roleKey, permissionKey]) => [
        roleKey,
        [permissionKey],
      ]),
    ),
  });
  const first = await withConfirmation(() =>
    applyManualAcceptanceAccountScenarios(
      localPlan(),
      { password: "demo-pass", fetchImpl: backend.fetchImpl },
    ),
  );
  assert.equal(first.roleCapabilityBaseline.source, "yoyoosun-role-flow-matrix");
  assert.equal(first.roleCapabilityBaseline.updated, 3);
  assert.equal(first.roleCapabilityBaseline.unchanged, 6);
  assert.deepEqual(
    rolePermissionCalls(backend)
      .map((call) => call.params.role_key)
      .sort(),
    ["finance", "pmc", "warehouse"],
  );
  for (const call of rolePermissionCalls(backend)) {
    assert.ok(call.params.permission_keys.includes(retained[call.params.role_key]));
    const baseline = MANUAL_ACCEPTANCE_ROLE_CAPABILITY_BASELINE.find(
      (item) => item.roleKey === call.params.role_key,
    );
    assert.ok(
      baseline.capabilityKeys.every((key) =>
        call.params.permission_keys.includes(key),
      ),
    );
  }

  const roleWrites = rolePermissionCalls(backend).length;
  const second = await withConfirmation(() =>
    applyManualAcceptanceAccountScenarios(
      localPlan(),
      { password: "demo-pass", fetchImpl: backend.fetchImpl },
    ),
  );
  assert.equal(second.roleCapabilityBaseline.updated, 0);
  assert.equal(second.roleCapabilityBaseline.unchanged, 9);
  assert.equal(rolePermissionCalls(backend).length, roleWrites);
});

test("role and permission metadata are fully preflighted before the first acceptance write", async () => {
  const cases = [
    {
      name: "missing role",
      options: {
        roleOptionsTransform: (roles) =>
          roles.filter((item) => item.role_key !== "finance"),
      },
    },
    {
      name: "disabled role",
      options: {
        roleOptionsTransform: (roles) =>
          roles.map((item) =>
            item.role_key === "warehouse" ? { ...item, disabled: true } : item,
          ),
      },
    },
    {
      name: "wrong role type",
      options: {
        roleOptionsTransform: (roles) =>
          roles.map((item) =>
            item.role_key === "pmc"
              ? { ...item, role_type: "custom" }
              : item,
          ),
      },
    },
    {
      name: "not editable",
      options: {
        roleOptionsTransform: (roles) =>
          roles.map((item) =>
            item.role_key === "quality"
              ? {
                  ...item,
                  permissions_editable: false,
                  permissions_editable_by_current_admin: false,
                }
              : item,
          ),
      },
    },
    {
      name: "nonassignable permission",
      options: {
        permissionOptionsTransform: (permissions) =>
          permissions.map((item) =>
            item.permission_key === "production.fact.read"
              ? { ...item, assignable: false }
              : item,
          ),
      },
    },
    {
      name: "missing permission metadata",
      options: {
        permissionOptionsTransform: (permissions) =>
          permissions.filter(
            (item) => item.permission_key !== "purchase.return.read",
          ),
      },
    },
  ];

  for (const item of cases) {
    const backend = createBackend({
      initialRolePermissions: { warehouse: ["erp.dashboard.read"] },
      ...item.options,
    });
    await withConfirmation(() =>
      assert.rejects(
        applyManualAcceptanceAccountScenarios(
          localPlan(),
          { password: "demo-pass", fetchImpl: backend.fetchImpl },
        ),
        undefined,
        item.name,
      ),
    );
    assert.equal(rolePermissionCalls(backend).length, 0, item.name);
    assert.equal(mutationCalls(backend).length, 0, item.name);
  }
});

test("first apply creates three accounts and every repeated apply resets all passwords", async () => {
  const backend = createBackend();
  const plan = localPlan();

  const first = await withConfirmation(() =>
    applyManualAcceptanceAccountScenarios(plan, {
      password: "demo-pass",
      fetchImpl: backend.fetchImpl,
    }),
  );
  assert.deepEqual(first.summary, {
    created: 3,
    positionsUpdated: 0,
    statusUpdated: 1,
    passwordReset: 3,
    unchanged: 0,
  });
  assert.equal(first.ready, true);
  assert.equal(first.protectedAccounts.length, 10);
  assert.equal(first.scenarios.length, 3);
  assert.ok(first.scenarios.every((scenario) => scenario.passwordReset));
  assert.equal(
    backend.state.find((item) => item.username === "demo_uat_disabled")
      .disabled,
    true,
  );

  const writesAfterFirst = mutationCalls(backend).length;
  assert.equal(writesAfterFirst, 7);
  assert.equal(passwordResetCalls(backend).length, 3);
  const second = await withConfirmation(() =>
    applyManualAcceptanceAccountScenarios(plan, {
      password: "demo-pass",
      fetchImpl: backend.fetchImpl,
    }),
  );
  assert.deepEqual(second.summary, {
    created: 0,
    positionsUpdated: 0,
    statusUpdated: 0,
    passwordReset: 3,
    unchanged: 3,
  });
  assert.equal(mutationCalls(backend).length, writesAfterFirst + 3);
  assert.equal(passwordResetCalls(backend).length, 6);
  assert.deepEqual(
    passwordResetCalls(backend).map((call) => call.params.password),
    Array(6).fill("demo-pass"),
  );
  assert.deepEqual([...backend.passwords.values()], Array(3).fill("demo-pass"));
  assert.doesNotMatch(JSON.stringify(second), /demo-pass/u);
});

test("audit minimum is filled with the disabled scenario account and replay skips filler", async () => {
  const backend = createBackend({ initialAuditTotal: 4 });
  const plan = localPlan({ auditMinimum: 30 });

  const first = await withConfirmation(() =>
    applyManualAcceptanceAccountScenarios(plan, {
      password: "demo-pass",
      fetchImpl: backend.fetchImpl,
    }),
  );
  assert.deepEqual(first.audit, {
    minimum: 30,
    before: 4,
    after: 31,
    added: 27,
    fillMutations: 20,
  });
  const disabled = backend.state.find(
    (item) => item.username === "demo_uat_disabled",
  );
  assert.equal(disabled.disabled, true);
  assert.deepEqual(disabled.roles.map((item) => item.role_key), ["sales"]);
  assert(
    backend.calls
      .filter(
        (call) =>
          call.domain === "admin" &&
          call.method === "set_roles" &&
          call.params.id === disabled.id,
      )
      .every(
        (call) =>
          call.params.role_keys.length === 0 ||
          call.params.role_keys.join(",") === "sales",
      ),
  );

  const second = await withConfirmation(() =>
    applyManualAcceptanceAccountScenarios(plan, {
      password: "demo-pass",
      fetchImpl: backend.fetchImpl,
    }),
  );
  assert.equal(second.audit.before, 31);
  assert.equal(second.audit.after, 34);
  assert.equal(second.audit.fillMutations, 0);
});

test("audit minimum parsing is bounded and report-only keeps zero by default", () => {
  assert.equal(buildManualAcceptanceAccountScenarioPlan().auditMinimum, 0);
  assert.throws(
    () => buildManualAcceptanceAccountScenarioPlan({ auditMinimum: 201 }),
    /between 0 and 200/u,
  );
});

test("CLI help points only to the dedicated current local acceptance database", async () => {
  const help = await runManualAcceptanceAccountScenarioCli(["--help"]);
  assert.equal(help.exitCode, 0);
  assert.match(help.text, /http:\/\/127\.0\.0\.1:8310/u);
  assert.match(help.text, /--database-name plush_erp_acceptance_20260716_v5_dev/u);
  assert.match(help.text, /--data-version 2026\.07\.16-v5/u);
  assert.match(help.text, /--run-id 20260716-V5/u);
  assert.doesNotMatch(help.text, /127\.0\.0\.1:8300/u);
});

test("apply output reports password readiness without printing the password", async () => {
  const backend = createBackend();
  const result = await withConfirmation(() =>
    runManualAcceptanceAccountScenarioCli([
      "--apply",
      "--json",
      "--backend-url",
      LOCAL_BACKEND_URL,
      "--database-name",
      LOCAL_DATABASE_NAME,
    ], {
      password: "demo-pass",
      fetchImpl: backend.fetchImpl,
    }),
  );
  assert.match(result.text, /"passwordReset": 3/u);
  assert.doesNotMatch(result.text, /demo-pass/u);
});

test("safely owned same-name accounts converge only the necessary fields", async () => {
  const existing = [
    ...formalAccounts(),
    admin({
      id: 20,
      username: "demo_uat_disabled",
      roleKeys: ["sales"],
      disabled: false,
    }),
    admin({
      id: 21,
      username: "demo_uat_sales_purchase",
      roleKeys: ["sales"],
    }),
    admin({
      id: 22,
      username: "demo_uat_no_entry",
      roleKeys: ["purchase"],
    }),
  ];
  const backend = createBackend({ initialAccounts: existing });
  const report = await withConfirmation(() =>
    applyManualAcceptanceAccountScenarios(
      localPlan(),
      { password: "demo-pass", fetchImpl: backend.fetchImpl },
    ),
  );
  assert.deepEqual(report.summary, {
    created: 0,
    positionsUpdated: 2,
    statusUpdated: 1,
    passwordReset: 3,
    unchanged: 0,
  });
  assert.deepEqual(
    mutationCalls(backend).map((call) => call.method),
    [
      "set_disabled",
      "reset_password",
      "set_roles",
      "reset_password",
      "set_roles",
      "reset_password",
    ],
  );
  const disableCall = mutationCalls(backend).find(
    (call) => call.method === "set_disabled",
  );
  assert.equal(disableCall.params.reason, "验收时暂时停用");
});

test("unsafe same-name ownership fails before the first account write", async () => {
  const existing = [
    ...formalAccounts(),
    admin({
      id: 20,
      username: "demo_uat_no_entry",
      roleKeys: ["admin"],
    }),
  ];
  const backend = createBackend({ initialAccounts: existing });
  await withConfirmation(() =>
    assert.rejects(
      applyManualAcceptanceAccountScenarios(
        localPlan(),
        { password: "demo-pass", fetchImpl: backend.fetchImpl },
      ),
      /unrelated position/u,
    ),
  );
  assert.equal(mutationCalls(backend).length, 0);
});

test("malformed list and mutation responses cannot be reported as success", async () => {
  const malformedList = formalAccounts();
  delete malformedList[0].disabled;
  const listBackend = createBackend({ initialAccounts: malformedList });
  await withConfirmation(() =>
    assert.rejects(
      applyManualAcceptanceAccountScenarios(
        localPlan(),
        { password: "demo-pass", fetchImpl: listBackend.fetchImpl },
      ),
      /missing valid account status/u,
    ),
  );
  assert.equal(mutationCalls(listBackend).length, 0);

  const createBackendWithMalformedResponse = createBackend({
    malformedCreate: true,
  });
  await withConfirmation(() =>
    assert.rejects(
      applyManualAcceptanceAccountScenarios(
        localPlan(),
        {
          password: "demo-pass",
          fetchImpl: createBackendWithMalformedResponse.fetchImpl,
        },
      ),
      /missing admin id/u,
    ),
  );
  assert.equal(mutationCalls(createBackendWithMalformedResponse).length, 1);
});

test("password reset response must contain the exact account identity and state", async () => {
  const missingFields = [
    ["id", /missing admin id/u],
    ["username", /username is required/u],
    ["roles", /response missing roles/u],
    ["disabled", /missing valid account status/u],
  ];
  for (const [field, expectedError] of missingFields) {
    const backend = createBackend({
      transformResetResponse: (account) => {
        delete account[field];
        return account;
      },
    });
    await withConfirmation(() =>
      assert.rejects(
        applyManualAcceptanceAccountScenarios(
          localPlan(),
          { password: "demo-pass", fetchImpl: backend.fetchImpl },
        ),
        expectedError,
      ),
    );
    assert.equal(passwordResetCalls(backend).length, 1);
  }

  const wrongID = createBackend({
    transformResetResponse: (account) => ({
      ...account,
      id: account.id + 100,
    }),
  });
  await withConfirmation(() =>
    assert.rejects(
      applyManualAcceptanceAccountScenarios(
        localPlan(),
        { password: "demo-pass", fetchImpl: wrongID.fetchImpl },
      ),
      /password reset returned another account/u,
    ),
  );
  assert.equal(passwordResetCalls(wrongID).length, 1);
});

test("admin record validation accepts login disabled or list account_status projections", () => {
  const valid = admin({ id: 1, username: "demo_uat_no_entry" });
  assert.equal(requireAdminAccountRecord(valid).username, "demo_uat_no_entry");

  for (const field of ["id", "username", "roles"]) {
    const malformed = structuredClone(valid);
    delete malformed[field];
    assert.throws(() => requireAdminAccountRecord(malformed));
  }

  const listProjection = admin({
    id: 2,
    username: "demo_uat_disabled",
    accountStatus: "suspended",
  });
  delete listProjection.disabled;
  const normalizedList = requireAdminAccountRecord(listProjection);
  assert.equal(normalizedList.accountStatus, "suspended");
  assert.equal(normalizedList.disabled, true);

  const missingStatus = structuredClone(valid);
  delete missingStatus.disabled;
  assert.throws(
    () => requireAdminAccountRecord(missingStatus),
    /valid account status/u,
  );
  assert.throws(
    () =>
      requireAdminAccountRecord(
        admin({
          id: 3,
          username: "demo_uat_conflict",
          disabled: false,
          accountStatus: "suspended",
        }),
      ),
    /conflicting account status/u,
  );
  assert.throws(
    () =>
      requireAdminAccountRecord({
        ...listProjection,
        account_status: "unknown",
      }),
    /valid account status/u,
  );
});

test("scenario definitions remain the sole managed account set", () => {
  assert.equal(MANUAL_ACCEPTANCE_ACCOUNT_SCENARIOS.length, 3);
  assert.ok(
    MANUAL_ACCEPTANCE_ACCOUNT_SCENARIOS.every((item) =>
      item.username.includes("demo_uat"),
    ),
  );
  assert.equal(
    new Set(MANUAL_ACCEPTANCE_ACCOUNT_SCENARIOS.map((item) => item.username))
      .size,
    3,
  );
});
