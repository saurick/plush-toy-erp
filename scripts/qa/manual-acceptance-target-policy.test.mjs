import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOMER_TRIAL_133_ORIGIN,
  CUSTOMER_TRIAL_133_DATABASE,
  CUSTOMER_TRIAL_133_TARGET,
  LOCAL_DEV_TARGET,
  MANUAL_ACCEPTANCE_DATASET_KEY,
  assertManualAcceptanceDatabaseIdentity,
  assertManualAcceptanceMutationTarget,
  assertManualAcceptanceRuntimeIdentityPrecondition,
  assertManualAcceptanceRuntimePolicy,
  assertManualAcceptanceTargetAttestation,
  manualAcceptanceTargetConfirmation,
  resolveManualAcceptanceTarget,
} from "./manual-acceptance-target-policy.mjs";

const remotePolicyInput = Object.freeze({
  target: CUSTOMER_TRIAL_133_TARGET,
  backendURL: CUSTOMER_TRIAL_133_ORIGIN,
  datasetKey: MANUAL_ACCEPTANCE_DATASET_KEY,
  dataVersion: "2026.07.15-v1",
  runId: "20260715-V1",
});

const safeRemoteCapabilities = Object.freeze({
  databaseName: CUSTOMER_TRIAL_133_DATABASE,
  environment: "prod",
  seedEnabled: false,
  seedAllowed: false,
  cleanupEnabled: false,
  cleanupAllowed: false,
  businessDataClearEnabled: false,
  businessDataClearAllowed: false,
});

const safeSession = Object.freeze({
  customer: { key: "yoyoosun" },
  source: "active_customer_config_revision",
  configRevision: "yoyoosun-customer-package-v7.runtime-manifest-v1",
  modules: {
    customers: "enabled",
    workflow_tasks: "enabled",
  },
});

test("target policy keeps implicit loopback on the local-dev guard", () => {
  const policy = resolveManualAcceptanceTarget({
    backendURL: "http://localhost:8300/",
    runId: "LOCAL-UAT",
  });
  assert.deepEqual(policy, {
    target: LOCAL_DEV_TARGET,
    datasetKey: MANUAL_ACCEPTANCE_DATASET_KEY,
    backendURL: "http://localhost:8300",
    origin: "http://localhost:8300",
    dataVersion: "LOCAL-UAT",
    runId: "LOCAL-UAT",
    external: false,
  });
  assert.equal(
    assertManualAcceptanceMutationTarget(policy).target,
    LOCAL_DEV_TARGET,
  );
});

test("customer-trial-133 is registered only through the loopback SSH tunnel", () => {
  const policy = resolveManualAcceptanceTarget(remotePolicyInput);
  assert.equal(policy.target, CUSTOMER_TRIAL_133_TARGET);
  assert.equal(policy.external, true);
  assert.equal(policy.transport, "ssh-tunnel");

  assert.throws(
    () =>
      resolveManualAcceptanceTarget({
        ...remotePolicyInput,
        backendURL: "http://192.168.0.133:5175",
      }),
    /SSH tunnel origin/u,
  );
});

test("target policy rejects every unregistered or implicit external target", () => {
  for (const input of [
    {
      backendURL: CUSTOMER_TRIAL_133_ORIGIN,
      dataVersion: "2026.07.15-v1",
      runId: "20260715-V1",
    },
    {
      ...remotePolicyInput,
      target: "customer-trial-other",
    },
    {
      ...remotePolicyInput,
      backendURL: "http://192.168.0.133:8300",
    },
    {
      ...remotePolicyInput,
      backendURL: "https://example.invalid",
    },
  ]) {
    assert.throws(
      () => resolveManualAcceptanceTarget(input),
      /reserved for|refuse external backend|registered SSH tunnel origin|requires backend URL/u,
    );
  }
});

test("customer-trial-133 requires explicit safe dataVersion and runId", () => {
  for (const patch of [
    { dataVersion: undefined },
    { runId: undefined },
    { dataVersion: "bad version" },
    { runId: "YYS UAT 20260715" },
  ]) {
    assert.throws(
      () => resolveManualAcceptanceTarget({ ...remotePolicyInput, ...patch }),
      /dataVersion|runId/u,
    );
  }
  assert.throws(
    () =>
      resolveManualAcceptanceTarget({
        ...remotePolicyInput,
        datasetKey: "other-dataset",
      }),
    /datasetKey must be yoyoosun-manual-acceptance/u,
  );
});

test("customer-trial-133 mutation confirmation binds target, version, and run", () => {
  const expected =
    "APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:customer-trial-133:2026.07.15-v1:20260715-V1";
  assert.equal(manualAcceptanceTargetConfirmation(remotePolicyInput), expected);
  for (const confirmation of [
    undefined,
    "yes",
    expected.replace("2026.07.15-v1", "2026.07.15-v2"),
    expected.replace("20260715-V1", "20260715-V2"),
  ]) {
    assert.throws(
      () =>
        assertManualAcceptanceMutationTarget(remotePolicyInput, {
          confirmation,
        }),
      /MANUAL_ACCEPTANCE_TARGET_CONFIRM/u,
    );
  }
  assert.equal(
    assertManualAcceptanceMutationTarget(remotePolicyInput, {
      confirmation: expected,
    }).external,
    true,
  );
});

test("local dedicated apply confirmation and runtime database identity are exact", () => {
  const localPolicy = {
    target: LOCAL_DEV_TARGET,
    backendURL: "http://127.0.0.1:18376",
    datasetKey: MANUAL_ACCEPTANCE_DATASET_KEY,
    dataVersion: "2026.07.15-v3",
    runId: "20260715-V3",
    databaseName: "plush_erp_acceptance_20260715_v3_dev",
  };
  const confirmation =
    "APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:local-dev:2026.07.15-v3:20260715-V3:plush_erp_acceptance_20260715_v3_dev";
  assert.equal(manualAcceptanceTargetConfirmation(localPolicy), confirmation);
  assert.throws(
    () => assertManualAcceptanceMutationTarget(localPolicy),
    /local-dev apply requires MANUAL_ACCEPTANCE_TARGET_CONFIRM/u,
  );
  assert.equal(
    assertManualAcceptanceMutationTarget(localPolicy, { confirmation })
      .databaseName,
    "plush_erp_acceptance_20260715_v3_dev",
  );
  assert.equal(
    assertManualAcceptanceDatabaseIdentity({
      policy: localPolicy,
      capabilities: {
        databaseName: "plush_erp_acceptance_20260715_v3_dev",
      },
    }).databaseName,
    "plush_erp_acceptance_20260715_v3_dev",
  );
  assert.throws(
    () =>
      assertManualAcceptanceDatabaseIdentity({
        policy: localPolicy,
        capabilities: { databaseName: "plush_erp_simon_dev" },
      }),
    /runtime databaseName=plush_erp_simon_dev/u,
  );
  assert.throws(
    () => resolveManualAcceptanceTarget({ ...localPolicy, databaseName: "plush_erp_simon_dev" }),
    /plush_erp_acceptance_/u,
  );
});

test("customer-trial-133 out-of-band attestation pins origin, customer, release, migration, and debug flags", () => {
  const attestation = {
    target: CUSTOMER_TRIAL_133_TARGET,
    origin: CUSTOMER_TRIAL_133_ORIGIN,
    customerKey: "yoyoosun",
    environment: "prod",
    release: "20c96d38a7b9e6d4f3c2b1a09876543210fedcba",
    migration: "20260714165115",
    debug: { ...safeRemoteCapabilities, environment: undefined },
  };
  delete attestation.debug.environment;
  delete attestation.debug.databaseName;
  const checked = assertManualAcceptanceTargetAttestation({
    policy: remotePolicyInput,
    attestation: JSON.stringify(attestation),
  });
  assert.equal(
    checked.release,
    "20c96d38a7b9e6d4f3c2b1a09876543210fedcba",
  );
  assert.equal(checked.migration, "20260714165115");

  for (const patch of [
    { origin: "http://192.168.0.133:5175" },
    { customerKey: "other" },
    { release: "" },
    { release: "20c96d38" },
    { release: "G0c96d38a7b9e6d4f3c2b1a09876543210fedcba" },
    { migration: "" },
    { migration: "atlas-head" },
    { migration: "20260711063237" },
    { debug: { ...attestation.debug, cleanupAllowed: true } },
    { unexpected: true },
    { debug: { ...attestation.debug, unexpected: false } },
  ]) {
    assert.throws(
      () =>
        assertManualAcceptanceTargetAttestation({
          policy: remotePolicyInput,
          attestation: { ...attestation, ...patch },
        }),
      /attestation|unsafe fields/u,
    );
  }
});

test("runtime identity precondition requires the dedicated proof marker before authentication", async () => {
  const attestation = {
    target: CUSTOMER_TRIAL_133_TARGET,
    origin: CUSTOMER_TRIAL_133_ORIGIN,
    customerKey: "yoyoosun",
    environment: "prod",
    release: "20c96d38a7b9e6d4f3c2b1a09876543210fedcba",
    migration: "20260714165115",
    debug: Object.fromEntries(
      [
        "seedEnabled",
        "seedAllowed",
        "cleanupEnabled",
        "cleanupAllowed",
        "businessDataClearEnabled",
        "businessDataClearAllowed",
      ].map((key) => [key, false]),
    ),
  };
  let request;
  const proof = await assertManualAcceptanceRuntimeIdentityPrecondition({
    policy: remotePolicyInput,
    attestation,
    fetchImpl: async (url, init) => {
      request = { url, init };
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
    },
  });
  assert.equal(proof.databaseName, CUSTOMER_TRIAL_133_DATABASE);
  assert.equal(proof.release, attestation.release);
  assert.equal(request.url, `${CUSTOMER_TRIAL_133_ORIGIN}/readyz/runtime-identity`);
  assert.equal(request.init.method, "GET");
  assert.equal(request.init.body, undefined);
  assert.equal(
    request.init.headers["X-ERP-Runtime-Identity-Scope"],
    "release-v1",
  );
  assert.match(
    request.init.headers["X-ERP-Expected-Runtime-Identity-SHA256"],
    /^[0-9a-f]{64}$/u,
  );

  await assert.rejects(
    () =>
      assertManualAcceptanceRuntimeIdentityPrecondition({
        policy: remotePolicyInput,
        attestation,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          redirected: false,
          headers: { get: () => null },
          async text() {
            return "ready";
          },
        }),
      }),
    /identity precondition failed before authentication/u,
  );
});

test("customer-trial-133 runtime accepts only prod with all debug mutations disabled", () => {
  const runtime = assertManualAcceptanceRuntimePolicy({
    policy: remotePolicyInput,
    capabilities: safeRemoteCapabilities,
    session: safeSession,
    requiredModules: ["customers", "workflow_tasks"],
  });
  assert.equal(runtime.target, CUSTOMER_TRIAL_133_TARGET);
  assert.equal(runtime.environment, "prod");
  assert.equal(runtime.debugMutationsDisabled, true);
  assert.deepEqual(runtime.requiredModules, ["customers", "workflow_tasks"]);

  for (const environment of ["local", "dev", "production", "test", ""]) {
    assert.throws(
      () =>
        assertManualAcceptanceRuntimePolicy({
          policy: remotePolicyInput,
          capabilities: { ...safeRemoteCapabilities, environment },
          session: safeSession,
        }),
      /requires runtime environment=prod/u,
    );
  }
});

test("customer-trial-133 fails closed when any debug mutation flag is true or absent", () => {
  for (const key of [
    "seedEnabled",
    "seedAllowed",
    "cleanupEnabled",
    "cleanupAllowed",
    "businessDataClearEnabled",
    "businessDataClearAllowed",
  ]) {
    for (const unsafeValue of [true, undefined]) {
      const capabilities = { ...safeRemoteCapabilities, [key]: unsafeValue };
      assert.throws(
        () =>
          assertManualAcceptanceRuntimePolicy({
            policy: remotePolicyInput,
            capabilities,
            session: safeSession,
          }),
        new RegExp(key, "u"),
      );
    }
  }
});

test("both local and customer-trial-133 require yoyoosun active revision and modules", () => {
  const policies = [
    {
      policy: { backendURL: "http://127.0.0.1:8300", runId: "LOCAL-UAT" },
      capabilities: { environment: "local" },
    },
    { policy: remotePolicyInput, capabilities: safeRemoteCapabilities },
  ];
  for (const entry of policies) {
    assert.throws(
      () =>
        assertManualAcceptanceRuntimePolicy({
          ...entry,
          session: { ...safeSession, configRevision: "" },
          requiredModules: ["customers"],
        }),
      /active customer configuration/u,
    );
    assert.throws(
      () =>
        assertManualAcceptanceRuntimePolicy({
          ...entry,
          session: {
            ...safeSession,
            modules: { ...safeSession.modules, customers: "disabled" },
          },
          requiredModules: ["customers"],
        }),
      /required modules are not enabled: customers/u,
    );
  }
});

test("loopback accepts the SQL default only while every debug mutation stays disabled", () => {
  const policy = {
    backendURL: "http://127.0.0.1:8300",
    dataVersion: "2026.07.15-v1",
    runId: "20260715-V1",
  };
  const runtime = assertManualAcceptanceRuntimePolicy({
    policy,
    capabilities: { ...safeRemoteCapabilities, environment: "sql" },
    session: safeSession,
    requiredModules: ["customers"],
  });
  assert.equal(runtime.target, LOCAL_DEV_TARGET);
  assert.equal(runtime.environment, "sql");

  for (const key of [
    "seedEnabled",
    "seedAllowed",
    "cleanupEnabled",
    "cleanupAllowed",
    "businessDataClearEnabled",
    "businessDataClearAllowed",
  ]) {
    assert.throws(
      () =>
        assertManualAcceptanceRuntimePolicy({
          policy,
          capabilities: {
            ...safeRemoteCapabilities,
            environment: "sql",
            [key]: true,
          },
          session: safeSession,
        }),
      /environment=sql requires every debug mutation disabled/u,
    );
  }
});
