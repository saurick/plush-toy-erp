import assert from "node:assert/strict";
import test from "node:test";

import {
  FORMAL_DEMO_ACCOUNTS,
  MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM_PHRASE,
  MANUAL_ACCEPTANCE_ACCOUNT_SCENARIOS,
  applyManualAcceptanceAccountScenarios,
  buildManualAcceptanceAccountScenarioPlan,
  normalizeAccountScenarioBackendURL,
  requireAdminAccountRecord,
  runManualAcceptanceAccountScenarioCli,
} from "./manual-acceptance-account-scenarios.mjs";

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
}) {
  return {
    id,
    username,
    phone,
    is_super_admin: isSuperAdmin,
    disabled,
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
  revision = "rev-local-1",
  initialAccounts = formalAccounts(),
  redirectLogin = false,
  malformedCreate = false,
  transformResetResponse = (account) => account,
} = {}) {
  const state = initialAccounts.map((item) => structuredClone(item));
  const calls = [];
  const passwords = new Map();
  let nextID = Math.max(...state.map((item) => Number(item.id)), 0) + 1;

  const fetchImpl = async (url, options) => {
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
      return ok({ environment }, url);
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
            configRevision: revision,
          },
        },
        url,
      );
    }
    if (domain === "admin" && body.method === "list") {
      return ok({ admins: structuredClone(state) }, url);
    }
    if (domain === "admin" && body.method === "create") {
      const created = admin({
        id: nextID++,
        username: body.params.username,
        roleKeys: body.params.role_keys,
      });
      state.push(created);
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
      return ok({ admin: structuredClone(account) }, url);
    }
    if (domain === "admin" && body.method === "set_disabled") {
      const account = state.find((item) => item.id === body.params.id);
      account.disabled = body.params.disabled;
      return ok({ admin: structuredClone(account) }, url);
    }
    if (domain === "admin" && body.method === "reset_password") {
      const account = state.find((item) => item.id === body.params.id);
      passwords.set(account.id, body.params.password);
      const responseAccount = transformResetResponse(structuredClone(account));
      return ok({ admin: responseAccount }, url);
    }
    throw new Error(`unexpected call ${domain}.${body.method}`);
  };

  return { fetchImpl, calls, passwords, state };
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

async function withConfirmation(fn) {
  const previous = process.env.MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM;
  const previousAdminPassword = process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD;
  process.env.MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM =
    MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM_PHRASE;
  process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD = "guard-pass";
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
  }
}

test("report-only plan keeps ten formal accounts and describes three clear scenarios", async () => {
  const plan = buildManualAcceptanceAccountScenarioPlan();
  assert.equal(plan.mode, "report-only");
  assert.equal(plan.simulatedOnly, true);
  assert.equal(plan.realCustomerImport, false);
  assert.equal(plan.directSQL, false);
  assert.deepEqual(plan.protectedAccounts, FORMAL_DEMO_ACCOUNTS);
  assert.equal(plan.protectedAccounts.length, 10);
  assert.equal(plan.scenarios.length, 3);
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
  try {
    await assert.rejects(
      applyManualAcceptanceAccountScenarios(
        buildManualAcceptanceAccountScenarioPlan(),
        {
          password: "demo-pass",
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
  try {
    await assert.rejects(
      applyManualAcceptanceAccountScenarios(
        buildManualAcceptanceAccountScenarioPlan(),
        {
          password: "demo-pass",
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
        buildManualAcceptanceAccountScenarioPlan(),
        { password: "demo-pass", fetchImpl: backend.fetchImpl },
      ),
      /refused redirected response/u,
    ),
  );
  assert.equal(mutationCalls(backend).length, 0);
  assert.equal(backend.calls.length, 1);
  assert.equal(backend.calls[0].params.username, "admin");
  assert.equal(backend.calls[0].options.redirect, "error");
});

test("non-local runtime and empty active revision perform zero account writes", async () => {
  const nonLocal = createBackend({ environment: "prod" });
  await withConfirmation(() =>
    assert.rejects(
      applyManualAcceptanceAccountScenarios(
        buildManualAcceptanceAccountScenarioPlan(),
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
        buildManualAcceptanceAccountScenarioPlan(),
        { password: "demo-pass", fetchImpl: emptyRevision.fetchImpl },
      ),
      /active yoyoosun configuration revision is unavailable/u,
    ),
  );
  assert.equal(mutationCalls(emptyRevision).length, 0);
});

test("first apply creates three accounts and every repeated apply resets all passwords", async () => {
  const backend = createBackend();
  const plan = buildManualAcceptanceAccountScenarioPlan();

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

test("apply output reports password readiness without printing the password", async () => {
  const backend = createBackend();
  const result = await withConfirmation(() =>
    runManualAcceptanceAccountScenarioCli(["--apply", "--json"], {
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
      buildManualAcceptanceAccountScenarioPlan(),
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
        buildManualAcceptanceAccountScenarioPlan(),
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
        buildManualAcceptanceAccountScenarioPlan(),
        { password: "demo-pass", fetchImpl: listBackend.fetchImpl },
      ),
      /missing disabled status/u,
    ),
  );
  assert.equal(mutationCalls(listBackend).length, 0);

  const createBackendWithMalformedResponse = createBackend({
    malformedCreate: true,
  });
  await withConfirmation(() =>
    assert.rejects(
      applyManualAcceptanceAccountScenarios(
        buildManualAcceptanceAccountScenarioPlan(),
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
    ["disabled", /missing disabled status/u],
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
          buildManualAcceptanceAccountScenarioPlan(),
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
        buildManualAcceptanceAccountScenarioPlan(),
        { password: "demo-pass", fetchImpl: wrongID.fetchImpl },
      ),
      /password reset returned another account/u,
    ),
  );
  assert.equal(passwordResetCalls(wrongID).length, 1);
});

test("admin record validation requires id, username, roles and disabled", () => {
  const valid = admin({ id: 1, username: "demo_uat_no_entry" });
  assert.equal(requireAdminAccountRecord(valid).username, "demo_uat_no_entry");

  for (const field of ["id", "username", "roles", "disabled"]) {
    const malformed = structuredClone(valid);
    delete malformed[field];
    assert.throws(() => requireAdminAccountRecord(malformed));
  }
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
