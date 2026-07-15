import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CUSTOMER_CONFIG_APPLY_PURPOSE,
  CUSTOMER_CONFIG_DATA_VERSION,
  CUSTOMER_CONFIG_PRODUCT_VERSION,
  CUSTOMER_CONFIG_REVISION,
  CUSTOMER_CONFIG_RUN_ID,
  applyCustomerTrial133Config,
  buildCustomerTrial133Manifest,
  parseManualAcceptanceCustomerConfigArgs,
  runManualAcceptanceCustomerConfig,
} from "./manual-acceptance-customer-config.mjs";
import {
  CUSTOMER_TRIAL_133_ORIGIN,
  CUSTOMER_TRIAL_133_TARGET,
  resolveManualAcceptanceTarget,
} from "./manual-acceptance-target-policy.mjs";

const CONFIG_HASH = "a".repeat(64);
const CONFIRMATION =
  "APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:customer-trial-133:2026.07.15-v3:20260715-V3";
const ATTESTATION = Object.freeze({
  target: CUSTOMER_TRIAL_133_TARGET,
  origin: CUSTOMER_TRIAL_133_ORIGIN,
  customerKey: "yoyoosun",
  environment: "prod",
  release: "929ec0b3a563bec0796274d033a97277519bcb51",
  migration: "20260714165115",
  debug: {
    seedEnabled: false,
    seedAllowed: false,
    cleanupEnabled: false,
    cleanupAllowed: false,
    businessDataClearEnabled: false,
    businessDataClearAllowed: false,
  },
});

function previewManifest() {
  return {
    manifest_schema_version: "customer-config-manifest/v1",
    process_contract_version: "customer-process-contract/v1",
    manifest_status: "preview_only",
    runtime_enabled: false,
    publishable: false,
    customer_key: "yoyoosun",
    revision: "yoyoosun-customer-package-v7.runtime-manifest-v1",
    product_version: "local-customer-package",
    compiled_snapshot: {
      customer: { key: "yoyoosun", name: "永绅" },
      package: {
        key: "yoyoosun-customer-package-v7",
        status: "draft",
        runtimeEnabled: false,
        previewOnly: true,
        publishEnabled: false,
      },
      pages: ["dashboard", "sales-orders"],
      fieldPolicies: { salesOrders: {} },
    },
    module_states: [{ module_key: "workflow_tasks", state: "enabled" }],
    role_profiles: [{ role_key: "boss", display_name: "老板" }],
    access_entitlements: [
      {
        role_key: "boss",
        capability_key: "erp.dashboard.read",
        enabled: true,
      },
    ],
    work_pools: [{ pool_key: "boss", module_key: "workflow_tasks" }],
    work_pool_memberships: [
      { pool_key: "boss", role_key: "boss", enabled: true },
    ],
  };
}

function remotePolicy() {
  return resolveManualAcceptanceTarget({
    backendURL: CUSTOMER_TRIAL_133_ORIGIN,
    target: CUSTOMER_TRIAL_133_TARGET,
    dataVersion: CUSTOMER_CONFIG_DATA_VERSION,
    runId: CUSTOMER_CONFIG_RUN_ID,
  });
}

function safeEnv(patch = {}) {
  return {
    MANUAL_ACCEPTANCE_TARGET_CONFIRM: CONFIRMATION,
    MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON: JSON.stringify(ATTESTATION),
    MANUAL_ACCEPTANCE_ADMIN_USERNAME: "admin",
    MANUAL_ACCEPTANCE_ADMIN_PASSWORD: "admin-secret-distinct",
    MANUAL_ACCEPTANCE_PASSWORD: "demo-secret-distinct",
    ...patch,
  };
}

function rpcResult(data, code = 0, message = "ok") {
  return {
    ok: true,
    status: 200,
    redirected: false,
    async json() {
      return { result: { code, message, data } };
    },
  };
}

function revision(status) {
  return {
    customer_key: "yoyoosun",
    revision: CUSTOMER_CONFIG_REVISION,
    product_version: CUSTOMER_CONFIG_PRODUCT_VERSION,
    config_hash: CONFIG_HASH,
    config_hash_version: 1,
    status,
  };
}

function buildFetch({ activeRevision = "", alter } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, ...body });
    let data;
    if (body.method === "admin_login") {
      data = {
        access_token: "admin-token-not-reported",
        is_super_admin: true,
        disabled: false,
      };
    } else if (body.method === "validate_customer_config") {
      data = {
        validation: {
          customer_key: "yoyoosun",
          revision: CUSTOMER_CONFIG_REVISION,
          config_hash: CONFIG_HASH,
          config_hash_version: 1,
          compiled_snapshot_ok: true,
        },
      };
    } else if (body.method === "publish_customer_config") {
      data = { revision: revision("published") };
    } else if (body.method === "check_customer_config_transition") {
      const expected = body.params.expected_active_revision;
      const confirmed = !activeRevision || expected === activeRevision;
      data = {
        transition: {
          action: "activate",
          customer_key: "yoyoosun",
          target_revision: CUSTOMER_CONFIG_REVISION,
          target_config_hash: CONFIG_HASH,
          target_product_version: CUSTOMER_CONFIG_PRODUCT_VERSION,
          expected_active_revision: expected,
          observed_active_revision: activeRevision,
          allowed: confirmed,
          noop: false,
          blockers: confirmed
            ? []
            : [{ code: "active_revision_confirmation_required" }],
        },
      };
    } else if (body.method === "activate_customer_config") {
      data = { revision: revision("active") };
    } else if (body.method === "get_effective_session") {
      data = {
        session: {
          customer: { key: "yoyoosun", name: "永绅" },
          configRevision: CUSTOMER_CONFIG_REVISION,
          configHash: CONFIG_HASH,
          configHashVersion: 1,
          source: "active_customer_config_revision",
          pages: ["dashboard"],
          actions: ["erp.dashboard.read"],
          workPools: ["boss"],
          fieldPolicies: { salesOrders: {} },
        },
      };
    } else {
      throw new Error(`unexpected method ${body.method}`);
    }
    if (alter) data = alter(body.method, structuredClone(data), body) || data;
    return rpcResult(data);
  };
  return { calls, fetchImpl };
}

async function fixtureRoot(t) {
  const repoRoot = await mkdtemp(
    path.join(os.tmpdir(), "manual-acceptance-config-"),
  );
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  await mkdir(path.join(repoRoot, "input"), { recursive: true });
  await writeFile(
    path.join(repoRoot, "input", "preview.json"),
    `${JSON.stringify(previewManifest(), null, 2)}\n`,
    "utf8",
  );
  return repoRoot;
}

function fixtureArgs(extra = []) {
  return [
    "--preview-manifest",
    "input/preview.json",
    "--out",
    "output/result",
    ...extra,
  ];
}

test("builds a stable, explicit trial manifest without mutating preview input", () => {
  const preview = previewManifest();
  const original = structuredClone(preview);
  const manifest = buildCustomerTrial133Manifest(preview);
  assert.deepEqual(preview, original);
  assert.equal(manifest.revision, CUSTOMER_CONFIG_REVISION);
  assert.equal(manifest.product_version, CUSTOMER_CONFIG_PRODUCT_VERSION);
  assert.equal(manifest.manifest_status, "runtime_compile_ready");
  assert.equal(manifest.publishable, true);
  assert.equal(manifest.runtime_enabled, true);
  assert.equal(
    manifest.compiled_snapshot.applyPurpose,
    CUSTOMER_CONFIG_APPLY_PURPOSE,
  );
  assert.equal(
    manifest.compiled_snapshot.datasetVersion,
    CUSTOMER_CONFIG_DATA_VERSION,
  );
  assert.equal(manifest.compiled_snapshot.target, CUSTOMER_TRIAL_133_TARGET);
  assert.equal(manifest.compiled_snapshot.package.status, "draft");
  assert.equal(CUSTOMER_CONFIG_DATA_VERSION, "2026.07.15-v3");
  assert.equal(CUSTOMER_CONFIG_RUN_ID, "20260715-V3");
  assert.equal(
    CUSTOMER_CONFIG_PRODUCT_VERSION,
    "customer-trial-133-test-2026.07.15-v3",
  );
  assert.equal(
    CUSTOMER_CONFIG_REVISION,
    "yoyoosun-customer-trial-133-package-v3.runtime-manifest-v1",
  );
});

test("v1 customer-trial identity is rejected instead of retained as an alias", async () => {
  assert.throws(
    () =>
      buildCustomerTrial133Manifest(previewManifest(), {
        dataVersion: "2026.07.15-v1",
        runId: CUSTOMER_CONFIG_RUN_ID,
      }),
    /dataVersion must be 2026\.07\.15-v3/u,
  );
  assert.throws(
    () =>
      buildCustomerTrial133Manifest(previewManifest(), {
        dataVersion: CUSTOMER_CONFIG_DATA_VERSION,
        runId: "20260715-V1",
      }),
    /runId must be 20260715-V3/u,
  );

  const currentManifest = buildCustomerTrial133Manifest(previewManifest());
  const oldPolicy = resolveManualAcceptanceTarget({
    backendURL: CUSTOMER_TRIAL_133_ORIGIN,
    target: CUSTOMER_TRIAL_133_TARGET,
    dataVersion: "2026.07.15-v1",
    runId: "20260715-V1",
  });
  let calls = 0;
  await assert.rejects(
    applyCustomerTrial133Config({
      manifest: currentManifest,
      policy: oldPolicy,
      env: safeEnv(),
      fetchImpl: async () => {
        calls += 1;
        throw new Error("network must not run");
      },
    }),
    /policy\.dataVersion must be 2026\.07\.15-v3/u,
  );
  assert.equal(calls, 0);

  const oldManifest = structuredClone(currentManifest);
  oldManifest.revision =
    "yoyoosun-customer-trial-133-package-v1.runtime-manifest-v1";
  oldManifest.product_version =
    "customer-trial-133-test-2026.07.15-v1";
  oldManifest.compiled_snapshot.datasetVersion = "2026.07.15-v1";
  await assert.rejects(
    applyCustomerTrial133Config({
      manifest: oldManifest,
      policy: remotePolicy(),
      env: safeEnv(),
      fetchImpl: async () => {
        calls += 1;
        throw new Error("network must not run");
      },
    }),
    /current registered v3 identity/u,
  );
  assert.equal(calls, 0);
});

test("rejects non-preview, release-ready, pre-marked, and wrong-customer sources", () => {
  const cases = [
    { manifest_status: "runtime_compile_ready" },
    { publishable: true },
    {
      compiled_snapshot: {
        ...previewManifest().compiled_snapshot,
        package: { status: "release_ready" },
      },
    },
    { customer_key: "other" },
    {
      compiled_snapshot: {
        ...previewManifest().compiled_snapshot,
        applyPurpose: CUSTOMER_CONFIG_APPLY_PURPOSE,
      },
    },
  ];
  for (const patch of cases) {
    assert.throws(
      () => buildCustomerTrial133Manifest({ ...previewManifest(), ...patch }),
      /preview|yoyoosun|trial marker/u,
    );
  }
});

test("CLI defaults to the fixed report-only 133 dataset identity", () => {
  const options = parseManualAcceptanceCustomerConfigArgs([]);
  assert.equal(options.apply, false);
  assert.equal(options.target, CUSTOMER_TRIAL_133_TARGET);
  assert.equal(options.backendURL, CUSTOMER_TRIAL_133_ORIGIN);
  assert.equal(options.dataVersion, CUSTOMER_CONFIG_DATA_VERSION);
  assert.equal(options.runId, CUSTOMER_CONFIG_RUN_ID);
  assert.throws(
    () => parseManualAcceptanceCustomerConfigArgs(["--unknown", "value"]),
    /unknown option/u,
  );
});

test("report-only writes a marked manifest and non-release report without network calls", async (t) => {
  const repoRoot = await fixtureRoot(t);
  let calls = 0;
  const result = await runManualAcceptanceCustomerConfig({
    argv: fixtureArgs(),
    repoRoot,
    fetchImpl: async () => {
      calls += 1;
      throw new Error("network must not be called");
    },
    now: () => new Date("2026-07-15T04:00:00.000Z"),
  });
  assert.equal(calls, 0);
  assert.equal(result.report.status, "planned");
  assert.equal(result.report.mode, "report-only");
  assert.equal(result.report.boundary.releaseReady, false);
  assert.equal(result.report.boundary.releaseEvidenceUsed, false);
  assert.equal(result.report.boundary.directDatabaseWrites, false);
  const stored = JSON.parse(await readFile(result.manifestPath, "utf8"));
  assert.equal(stored.revision, CUSTOMER_CONFIG_REVISION);
  assert.equal(stored.compiled_snapshot.target, CUSTOMER_TRIAL_133_TARGET);
});

test("apply gates confirmation, attestation, formal credentials and password independence before network", async () => {
  const manifest = buildCustomerTrial133Manifest(previewManifest());
  for (const env of [
    safeEnv({ MANUAL_ACCEPTANCE_TARGET_CONFIRM: undefined }),
    safeEnv({ MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON: undefined }),
    safeEnv({ CUSTOMER_CONFIG_ADMIN_TOKEN: "formal-token" }),
    safeEnv({
      MANUAL_ACCEPTANCE_ADMIN_PASSWORD: "same",
      MANUAL_ACCEPTANCE_PASSWORD: "same",
    }),
  ]) {
    let calls = 0;
    await assert.rejects(
      applyCustomerTrial133Config({
        manifest,
        policy: remotePolicy(),
        env,
        fetchImpl: async () => {
          calls += 1;
          throw new Error("must not reach network");
        },
      }),
      /CONFIRM|confirm|requires|attestation|required|formal release credentials|different/u,
    );
    assert.equal(calls, 0);
  }
});

test("apply uses only admin login and the standard config sequence with strict identity readback", async (t) => {
  const repoRoot = await fixtureRoot(t);
  const mock = buildFetch();
  const result = await runManualAcceptanceCustomerConfig({
    argv: fixtureArgs(["--apply"]),
    env: safeEnv(),
    repoRoot,
    fetchImpl: mock.fetchImpl,
    now: () => new Date("2026-07-15T04:00:00.000Z"),
  });
  assert.deepEqual(
    mock.calls.map((call) => call.method),
    [
      "admin_login",
      "validate_customer_config",
      "publish_customer_config",
      "check_customer_config_transition",
      "activate_customer_config",
      "get_effective_session",
    ],
  );
  const login = mock.calls[0];
  assert.equal(login.params.username, "admin");
  assert.equal(login.params.password, "admin-secret-distinct");
  assert.doesNotMatch(login.init.body, /demo-secret-distinct/u);
  const validate = mock.calls[1];
  assert.equal(validate.params.revision, CUSTOMER_CONFIG_REVISION);
  assert.equal(validate.params.product_version, CUSTOMER_CONFIG_PRODUCT_VERSION);
  assert.equal(
    validate.params.compiled_snapshot.applyPurpose,
    CUSTOMER_CONFIG_APPLY_PURPOSE,
  );
  assert.equal(result.report.status, "completed");
  assert.equal(result.report.identity.configHash, CONFIG_HASH);
  assert.equal(result.report.identity.productVersion, CUSTOMER_CONFIG_PRODUCT_VERSION);
  assert.equal(result.report.effectiveSession.configRevision, CUSTOMER_CONFIG_REVISION);
  assert.equal(result.report.attestation.verified, true);
  assert.equal(
    result.report.adminCredential.independentFromDemoPassword,
    true,
  );
  assert.doesNotMatch(await readFile(result.reportPath, "utf8"), /admin-token-not-reported|admin-secret|demo-secret/u);
});

test("non-empty active revision is confirmed by a second CAS check and bound to activation", async () => {
  const manifest = buildCustomerTrial133Manifest(previewManifest());
  const mock = buildFetch({ activeRevision: "previous-active-revision" });
  const result = await applyCustomerTrial133Config({
    manifest,
    policy: remotePolicy(),
    env: safeEnv(),
    fetchImpl: mock.fetchImpl,
  });
  const checks = mock.calls.filter(
    (call) => call.method === "check_customer_config_transition",
  );
  assert.equal(checks.length, 2);
  assert.equal(checks[0].params.expected_active_revision, "");
  assert.equal(
    checks[1].params.expected_active_revision,
    "previous-active-revision",
  );
  const activate = mock.calls.find(
    (call) => call.method === "activate_customer_config",
  );
  assert.equal(
    activate.params.expected_active_revision,
    "previous-active-revision",
  );
  assert.equal(activate.params.expected_config_hash, CONFIG_HASH);
  assert.equal(
    activate.params.expected_product_version,
    CUSTOMER_CONFIG_PRODUCT_VERSION,
  );
  assert.equal(result.operations[2].attempts, 2);
});

test("fails closed on hash, productVersion, transition, activation, or effective-session drift", async () => {
  const manifest = buildCustomerTrial133Manifest(previewManifest());
  const cases = [
    [
      "validate_customer_config",
      (data) => {
        data.validation.revision = "wrong";
      },
    ],
    [
      "publish_customer_config",
      (data) => {
        data.revision.product_version = "wrong";
      },
    ],
    [
      "check_customer_config_transition",
      (data) => {
        data.transition.target_config_hash = "b".repeat(64);
      },
    ],
    [
      "activate_customer_config",
      (data) => {
        data.revision.status = "published";
      },
    ],
    [
      "get_effective_session",
      (data) => {
        data.session.configRevision = "wrong";
      },
    ],
  ];
  for (const [targetMethod, mutate] of cases) {
    const mock = buildFetch({
      alter(method, data) {
        if (method === targetMethod) mutate(data);
        return data;
      },
    });
    await assert.rejects(
      applyCustomerTrial133Config({
        manifest,
        policy: remotePolicy(),
        env: safeEnv(),
        fetchImpl: mock.fetchImpl,
      }),
      /identity|revision|productVersion|hash|status|activated trial manifest/u,
    );
  }
});

test("source remains independent of formal release executors and database clients", async () => {
  const source = await readFile(
    new URL("./manual-acceptance-customer-config.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /from\s+["'][^"']*customer-config-release-execute/u);
  assert.doesNotMatch(source, /node:child_process|\bpg\.Client\b|\bpsql\b/u);
  assert.match(source, /releaseReady:\s*false/u);
  assert.match(source, /directDatabaseWrites:\s*false/u);
});
