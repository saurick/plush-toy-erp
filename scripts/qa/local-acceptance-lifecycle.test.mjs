import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  exceptionFlowConfirmation,
  parseExceptionFlowArgs,
  resolveExceptionFlowReportPath,
} from "./exception-flow-real-write-browser.mjs";
import {
  LOCAL_ACCEPTANCE_LIFECYCLE_SCHEMA,
  allocateLocalAcceptanceWebEndpoint,
  allocateLocalAcceptancePorts,
  assertLoggedServiceAlive,
  buildLocalAcceptanceLifecycleIdentity,
  localAcceptanceExceptionReportPath,
  runLocalAcceptanceLifecycle,
} from "./local-acceptance-lifecycle.mjs";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";

test("local acceptance lifecycle keeps the cloned-write report inside the exception-flow evidence root", () => {
  const identity = buildLocalAcceptanceLifecycleIdentity({
    commit: COMMIT,
    runID: "final-run",
  });
  const datasetOutputRoot = path.resolve(
    "output/qa/manual-acceptance/datasets/lifecycle/final-run",
  );
  const reportPath = localAcceptanceExceptionReportPath(datasetOutputRoot);
  const backendURL = "http://127.0.0.1:18323";
  const options = parseExceptionFlowArgs(
    [
      "--base-url",
      "http://127.0.0.1:15210",
      "--backend-url",
      backendURL,
      "--database-name",
      identity.browserActionsDatabase,
      "--report",
      reportPath,
    ],
    {
      MANUAL_ACCEPTANCE_DEMO_PASSWORD: "unit-test-only-password",
      EXCEPTION_FLOW_BROWSER_CONFIRM: exceptionFlowConfirmation({
        backendURL,
        databaseName: identity.browserActionsDatabase,
      }),
    },
  );

  assert.equal(resolveExceptionFlowReportPath(reportPath), reportPath);
  assert.equal(options.databaseName, identity.browserActionsDatabase);
  assert.equal(
    path.relative(datasetOutputRoot, reportPath),
    "2026.07.16-v5/local/browser-actions/report.json",
  );
});

test("local acceptance lifecycle reserves the web port from the canonical auxiliary range", async () => {
  const candidates = [8300, 15_210, 44_001, 44_001, 44_002];
  const roots = [];
  const result = await allocateLocalAcceptancePorts("/repo", {
    loadPorts(repoRoot) {
      roots.push(repoRoot);
      return { auxStart: 15_200 };
    },
    findAvailableAuxPort: async (ports) => ports.auxStart + 10,
    allocateUnrestrictedPort: async () => candidates.shift(),
  });

  assert.deepEqual(roots, ["/repo"]);
  assert.deepEqual(result, {
    httpPort: 44_001,
    grpcPort: 44_002,
    webPort: 15_210,
  });
  assert.deepEqual(candidates, []);
});

test("local acceptance lifecycle refreshes the web endpoint and requires its own live child", async () => {
  const endpoint = await allocateLocalAcceptanceWebEndpoint("/repo", {
    loadPorts: () => ({ auxStart: 15_200 }),
    findAvailableAuxPort: async () => 15_207,
  });
  assert.deepEqual(endpoint, {
    webPort: 15_207,
    webURL: "http://127.0.0.1:15207",
  });
  assert.equal(
    assertLoggedServiceAlive({ child: { exitCode: null } }, "acceptance web"),
    true,
  );
  assert.throws(
    () =>
      assertLoggedServiceAlive({ child: { exitCode: 1 } }, "acceptance web"),
    /acceptance web exited before readiness/u,
  );
  assert.throws(
    () =>
      assertLoggedServiceAlive(
        { child: { exitCode: null, signalCode: "SIGTERM" } },
        "acceptance web",
      ),
    /acceptance web exited before readiness/u,
  );
});

function fakeRuntime({ failAt = "", residual = "" } = {}) {
  const events = [];
  const existing = new Set();
  let backend = false;
  let web = false;
  const invoke = async (name, result = undefined) => {
    events.push(name);
    if (failAt === name) throw new Error(`${name} failed`);
    return result;
  };
  return {
    events,
    async preflight() {
      return invoke("preflight", {
        sourceClean: true,
        commitVerified: true,
        target: "registered-dev",
      });
    },
    async databaseExists(name) {
      events.push(`exists:${name}`);
      return existing.has(name);
    },
    async createDatabase(name) {
      await invoke(`create:${name}`);
      existing.add(name);
    },
    async migrateDatabase(name) {
      return invoke(`migrate:${name}`, {
        currentMigration: "20260726174057",
        pending: 0,
      });
    },
    async startBackend(name) {
      await invoke(`backend:start:${name}`);
      backend = true;
    },
    async verifyBackend(name) {
      return invoke(`backend:verify:${name}`, {
        runtimeIdentityProof: "matched-v1",
      });
    },
    async bootstrapFormalAccounts(name) {
      return invoke(`accounts:bootstrap:${name}`, {
        created: 10,
        verified: 0,
        accounts: 10,
        runtimeIdentityProof: "matched-v1",
      });
    },
    async activateCustomerConfig(name) {
      return invoke(`config:${name}`, {
        revision: "local-config-v1",
        protocolCount: 5,
      });
    },
    async seedCoreReferences(name) {
      return invoke(`seed:${name}`, { units: 1, warehouses: 4 });
    },
    async applyManualDataset(name) {
      return invoke(`dataset:${name}`, {
        ok: true,
        completedStages: 9,
        report: "output/dataset.json",
        dataVersion: "2026.07.16-v5",
        chainDataDigest: "a".repeat(64),
        chainVerificationDigest: "b".repeat(64),
        startedAt: "2026-07-28T00:01:00.000Z",
        completedAt: "2026-07-28T00:02:00.000Z",
        durationMs: 60_000,
        stageTimings: [
          {
            key: "core",
            status: "completed",
            startedAt: "2026-07-28T00:01:00.000Z",
            completedAt: "2026-07-28T00:01:01.000Z",
            durationMs: 1_000,
          },
        ],
      });
    },
    async startWeb() {
      await invoke("web:start");
      web = true;
    },
    async verifyWeb() {
      return invoke("web:verify");
    },
    async runManualBrowser() {
      return invoke("browser:manual", {
        passed: true,
        formalAccounts: 10,
        mobileAccounts: 9,
        pages: 51,
        report: "output/manual-browser.json",
      });
    },
    async stopBackend() {
      await invoke("backend:stop");
      backend = false;
    },
    async cloneDatabase(source, target) {
      await invoke(`clone:${source}:${target}`);
      assert.equal(backend, false, "backend must stop before database clone");
      assert.equal(existing.has(source), true);
      existing.add(target);
    },
    async runExceptionBrowser(name) {
      return invoke(`browser:exception:${name}`, {
        passed: true,
        flows: 3,
        report: "output/exception-browser.json",
      });
    },
    async stopWeb() {
      await invoke("web:stop");
      web = false;
    },
    async dropDatabase(name) {
      await invoke(`drop:${name}`);
      if (residual === name) throw new Error("drop failed");
      existing.delete(name);
    },
    state() {
      return { backend, web, existing: [...existing] };
    },
  };
}

test("local acceptance lifecycle runs read-only evidence before cloned real writes and cleans both databases", async () => {
  const runtime = fakeRuntime();
  const report = await runLocalAcceptanceLifecycle({
    commit: COMMIT,
    generatedAt: new Date("2026-07-28T00:00:00Z"),
    runID: "20260728-delivery",
    runtime,
  });
  assert.equal(report.schemaVersion, LOCAL_ACCEPTANCE_LIFECYCLE_SCHEMA);
  assert.equal(report.status, "passed");
  assert.deepEqual(report.cleanup.residualDatabases, []);
  const accountBootstrapIndex = runtime.events.findIndex((item) =>
    item.startsWith("accounts:bootstrap:"),
  );
  const configIndex = runtime.events.findIndex((item) =>
    item.startsWith("config:"),
  );
  assert(accountBootstrapIndex < configIndex);
  const manualIndex = runtime.events.indexOf("browser:manual");
  const stopIndex = runtime.events.indexOf("backend:stop");
  const cloneIndex = runtime.events.findIndex((item) =>
    item.startsWith("clone:"),
  );
  const exceptionIndex = runtime.events.findIndex((item) =>
    item.startsWith("browser:exception:"),
  );
  assert(manualIndex < stopIndex);
  assert(stopIndex < cloneIndex);
  assert(cloneIndex < exceptionIndex);
  assert.deepEqual(runtime.state(), {
    backend: false,
    web: false,
    existing: [],
  });
  assert.equal(report.boundary.customerUAT, false);
  assert.equal(report.evidence.dataset.durationMs, 60_000);
  assert.equal(report.evidence.dataset.stageTimings[0].key, "core");
  assert.doesNotMatch(JSON.stringify(report), /password|postgres:\/\//iu);
});

test("local acceptance lifecycle cleans the acceptance database after a workflow failure", async () => {
  const identity = buildLocalAcceptanceLifecycleIdentity({
    commit: COMMIT,
    runID: "20260728-failure",
  });
  const runtime = fakeRuntime({
    failAt: `dataset:${identity.acceptanceDatabase}`,
  });
  const report = await runLocalAcceptanceLifecycle({
    commit: COMMIT,
    runID: "20260728-failure",
    runtime,
  });
  assert.equal(report.status, "failed");
  assert.deepEqual(report.cleanup.residualDatabases, []);
  assert.equal(runtime.state().backend, false);
  assert.equal(runtime.state().web, false);
  assert.equal(
    runtime.events.includes(`drop:${identity.acceptanceDatabase}`),
    true,
  );
});

test("local acceptance lifecycle reports one exact residual database and fails closed", async () => {
  const identity = buildLocalAcceptanceLifecycleIdentity({
    commit: COMMIT,
    runID: "20260728-residual",
  });
  const runtime = fakeRuntime({
    residual: identity.browserActionsDatabase,
  });
  const report = await runLocalAcceptanceLifecycle({
    commit: COMMIT,
    runID: "20260728-residual",
    runtime,
  });
  assert.equal(report.status, "failed");
  assert.deepEqual(report.cleanup.residualDatabases, [
    identity.browserActionsDatabase,
  ]);
  assert.match(report.failure, /cleanup|residual/u);
});
