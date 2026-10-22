import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createOrReuseDeliveryOperation,
  readDeliveryOperation,
  resolveDeliveryOperationStore,
  transitionDeliveryOperation,
} from "./delivery-operation-store.mjs";
import {
  createGitlabDeploymentClient,
  createGitlabDeploymentRecorder,
  gitlabDeploymentEnvironment,
  readGitlabDeploymentRecord,
  runRecordedDeployment,
} from "./gitlab-deployment-records.mjs";
import { runDeploymentRecordsCLI } from "./gitlab-deployment-records-cli.mjs";

const SHA = "a".repeat(40);
function fixture(t, target = "demo-133", action = "promote") {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-gitlab-deploy-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = resolveDeliveryOperationStore(root);
  const { operation } = createOrReuseDeliveryOperation(store, {
    action,
    target,
    gitSha: SHA,
    version: "2026.10.22-1",
    idempotencyKey: "gitlab-deployment-records-test-0001",
    now: "2026-10-22T00:00:00.000Z",
  });
  transitionDeliveryOperation(store, operation.id, {
    status: "running",
    message: "prepare",
    now: "2026-10-22T00:00:01.000Z",
  });
  transitionDeliveryOperation(store, operation.id, {
    status: "ready",
    message: "ready",
    now: "2026-10-22T00:00:02.000Z",
  });
  return { root, store, id: operation.id };
}
function finish(f, status = "passed") {
  const current = readDeliveryOperation(f.store, f.id);
  if (current.status === "ready")
    transitionDeliveryOperation(f.store, f.id, {
      status: "running",
      message: "executing",
      now: "2026-10-22T00:00:03.000Z",
    });
  return transitionDeliveryOperation(f.store, f.id, {
    status,
    message: "terminal",
    now: "2026-10-22T00:00:04.000Z",
  });
}
function fakeClient() {
  const deployments = new Map();
  const archives = new Map();
  const calls = [];
  return {
    calls,
    deployments,
    archives,
    async ensureEnvironment(env) {
      calls.push("environment");
      return { id: { demo: 2, test: 3, erp: 4 }[env.name], ...env };
    },
    async createDeployment(operation, environment) {
      calls.push("create");
      const item = {
        id: deployments.size + 100,
        sha: operation.gitSha,
        ref: "main",
        status: "running",
        created_at: new Date().toISOString(),
        environment: {
          id: { demo: 2, test: 3, erp: 4 }[environment.name],
          name: environment.name,
        },
      };
      deployments.set(item.id, item);
      return item;
    },
    async readDeployment(id, operation, environment) {
      const item = deployments.get(id);
      assert.equal(item.sha, operation.gitSha);
      assert.equal(item.environment.name, environment.name);
      return item;
    },
    async finishDeployment(id, status, operation, environment) {
      const item = await this.readDeployment(id, operation, environment);
      item.status = status;
      calls.push("finish");
      return item;
    },
    async archive(operation, name, value) {
      const key = `${operation.id}/${name}`;
      if (archives.has(key)) assert.deepEqual(archives.get(key), value);
      else archives.set(key, structuredClone(value));
      calls.push(`archive:${name}`);
      const { createHash } = await import("node:crypto");
      return {
        packageId: 99,
        sha256: createHash("sha256")
          .update(`${JSON.stringify(value, null, 2)}\n`)
          .digest("hex"),
      };
    },
    async readArchive(operation, name) {
      return archives.get(`${operation.id}/${name}`) ?? null;
    },
  };
}

test("environment identity follows the registered demo/test/erp target and rejects retired targets", () => {
  assert.deepEqual(
    ["demo-133", "customer-test-133", "production-133"].map((x) => {
      const e = gitlabDeploymentEnvironment(x);
      return [e.name, e.tier, e.external_url];
    }),
    [
      ["demo", "staging", "https://demo.yoyoosun.net"],
      ["test", "testing", "https://test.yoyoosun.net"],
      ["erp", "production", "https://erp.yoyoosun.net"],
    ],
  );
  assert.throws(() => gitlabDeploymentEnvironment("test-133"));
});
test("historical import preserves original records/timestamps and is idempotent across restarts", async (t) => {
  const f = fixture(t);
  const operation = finish(f);
  const client = fakeClient();
  const before = readFileSync(path.join(f.store, "operations", `${f.id}.json`));
  const record = await createGitlabDeploymentRecorder({
    store: f.store,
    client,
  }).register(f.id, { historical: true });
  assert.equal(record.mode, "historical");
  assert.equal(record.sourceFinishedAt, operation.updatedAt);
  assert.equal(record.status, "recorded");
  assert.deepEqual(client.archives.get(`${f.id}/operation.json`), operation);
  await createGitlabDeploymentRecorder({ store: f.store, client }).register(
    f.id,
    { historical: true },
  );
  await createGitlabDeploymentRecorder({ store: f.store, client }).verify(f.id);
  assert.equal(client.calls.filter((x) => x === "create").length, 1);
  assert.deepEqual(
    readFileSync(path.join(f.store, "operations", `${f.id}.json`)),
    before,
  );
});
test("retired targets and data rebuilds remain archived without becoming current-environment deployments", async (t) => {
  for (const [target, action] of [
    ["test-133", "promote"],
    ["demo-133", "rebuild-database"],
    ["gitlab-release", "release"],
  ]) {
    const f = fixture(t, target, action);
    finish(f);
    const client = fakeClient();
    const record = await createGitlabDeploymentRecorder({
      store: f.store,
      client,
    }).register(f.id, { historical: true });
    assert.equal(record.deploymentId, null);
    assert.equal(record.status, "recorded");
    assert.equal(client.calls.includes("create"), false);
  }
});
test("ambiguous POST is never replayed; an exact verified ID can resume recording", async (t) => {
  const f = fixture(t);
  finish(f);
  const client = fakeClient();
  const original = client.createDeployment;
  client.createDeployment = async (...args) => {
    await original.apply(client, args);
    throw new Error("response lost");
  };
  const recorder = createGitlabDeploymentRecorder({ store: f.store, client });
  await assert.rejects(
    recorder.register(f.id, { historical: true }),
    /response lost/u,
  );
  await assert.rejects(recorder.register(f.id), /outcome is unknown/u);
  assert.equal(client.calls.filter((x) => x === "create").length, 1);
  const result = await recorder.reconcile(f.id, 100);
  assert.equal(result.status, "recorded");
});
test("registration failure prevents target execution; confirmation is checked before credentials", async (t) => {
  const f = fixture(t);
  const client = fakeClient();
  let executions = 0;
  let credentials = 0;
  await assert.rejects(
    runRecordedDeployment({
      ...f,
      operationId: f.id,
      confirmation: "wrong",
      execute: () => executions++,
      resolveCredential: () => credentials++,
    }),
    /confirmed ready/u,
  );
  assert.equal(credentials, 0);
  client.ensureEnvironment = async () => {
    throw new Error("offline");
  };
  await assert.rejects(
    runRecordedDeployment({
      store: f.store,
      operationId: f.id,
      confirmation: `PROMOTE:demo-133:${SHA}:${f.id}`,
      client,
      execute: () => executions++,
    }),
    /offline/u,
  );
  assert.equal(executions, 0);
  assert.equal(readDeliveryOperation(f.store, f.id).status, "ready");
});
test("a terminal archival outage preserves target success and retries only recording", async (t) => {
  const f = fixture(t);
  const client = fakeClient();
  const archive = client.archive;
  let executions = 0;
  client.archive = async (...args) => {
    if (args[1] === "operation.json") throw new Error("offline");
    return archive.apply(client, args);
  };
  const result = await runRecordedDeployment({
    store: f.store,
    operationId: f.id,
    confirmation: `PROMOTE:demo-133:${SHA}:${f.id}`,
    client,
    execute: () => {
      executions++;
      return { operation: finish(f) };
    },
  });
  assert.equal(result.operation.status, "passed");
  assert.equal(result.gitlabRecord.status, "pending");
  client.archive = archive;
  await createGitlabDeploymentRecorder({ store: f.store, client }).register(
    f.id,
  );
  assert.equal(executions, 1);
  assert.equal(client.calls.filter((x) => x === "create").length, 1);
});
test("unknown and preflight-blocked outcomes never become GitLab success", async (t) => {
  for (const [status, expected] of [
    ["not_proven", "failed"],
    ["blocked", "canceled"],
    ["failed", "failed"],
  ]) {
    const f = fixture(t);
    finish(f, status);
    const client = fakeClient();
    await createGitlabDeploymentRecorder({ store: f.store, client }).register(
      f.id,
      { historical: true },
    );
    assert.equal(client.deployments.get(100).status, expected);
    assert.equal(client.archives.get(`${f.id}/operation.json`).status, status);
  }
});
test("corrupt local linkage cannot expose another target's deployment", async (t) => {
  const f = fixture(t);
  finish(f);
  const client = fakeClient();
  await createGitlabDeploymentRecorder({ store: f.store, client }).register(
    f.id,
  );
  const file = path.join(f.store, "gitlab", `${f.id}.json`);
  const record = JSON.parse(readFileSync(file));
  record.target = "production-133";
  writeFileSync(file, JSON.stringify(record));
  assert.throws(
    () =>
      readGitlabDeploymentRecord(f.store, readDeliveryOperation(f.store, f.id)),
    /identity mismatch/u,
  );
});
test("lost local linkage is recovered from the immutable GitLab archive without creating a second deployment", async (t) => {
  const f = fixture(t);
  finish(f);
  const client = fakeClient();
  const recorder = createGitlabDeploymentRecorder({ store: f.store, client });
  await recorder.register(f.id, { historical: true });
  rmSync(path.join(f.store, "gitlab"), { recursive: true });
  const restored = await recorder.register(f.id);
  await recorder.verify(f.id);
  assert.equal(restored.mode, "historical");
  assert.equal(client.calls.filter((x) => x === "create").length, 1);
});
test("rejected POST and pre-POST archive outages can retry without replaying a target write", async (t) => {
  const f = fixture(t);
  finish(f);
  const client = fakeClient();
  const create = client.createDeployment;
  const archive = client.archive;
  const recorder = createGitlabDeploymentRecorder({ store: f.store, client });
  client.archive = async (...args) => {
    if (args[1] === "intent.json") throw new Error("offline");
    return archive.apply(client, args);
  };
  await assert.rejects(recorder.register(f.id), /offline/u);
  client.archive = archive;
  client.createDeployment = async () => {
    throw Object.assign(new Error("rejected"), { rejectedWrite: true });
  };
  await assert.rejects(recorder.register(f.id), /rejected/u);
  client.createDeployment = create;
  await recorder.register(f.id);
  assert.equal(client.calls.filter((x) => x === "create").length, 1);
});
test("remote intent prevents automatic POST after a lost local cache and ambiguous response", async (t) => {
  const f = fixture(t);
  finish(f);
  const client = fakeClient();
  const create = client.createDeployment;
  client.createDeployment = async (...args) => {
    await create.apply(client, args);
    throw new Error("lost");
  };
  const recorder = createGitlabDeploymentRecorder({ store: f.store, client });
  await assert.rejects(recorder.register(f.id), /lost/u);
  rmSync(path.join(f.store, "gitlab"), { recursive: true });
  await assert.rejects(recorder.register(f.id), /outcome is unknown/u);
  await recorder.reconcile(f.id, 100);
  assert.equal(client.calls.filter((x) => x === "create").length, 1);
});
test("CLI plan and missing execute authorization do not access credentials or alter records", async (t) => {
  const f = fixture(t);
  finish(f);
  const before = readdirSync(f.store);
  let credentials = 0;
  const deps = {
    root: f.root,
    resolveCredential: () => credentials++,
    write: () => {},
  };
  const plan = await runDeploymentRecordsCLI(["plan"], deps);
  assert.equal(plan.operations, 1);
  await assert.rejects(runDeploymentRecordsCLI(["sync"], deps), /--execute/u);
  assert.equal(credentials, 0);
  assert.deepEqual(readdirSync(f.store), before);
});
test("client confines requests, bounds responses and verifies existing environments", async () => {
  const seen = [];
  const client = createGitlabDeploymentClient({
    token: "private-test-token",
    request: async (url, options) => {
      seen.push({ url, options });
      return new Response(
        JSON.stringify([
          {
            id: 2,
            name: "demo",
            tier: "production",
            external_url: "https://demo.yoyoosun.net",
          },
        ]),
      );
    },
  });
  await assert.rejects(
    client.ensureEnvironment(gitlabDeploymentEnvironment("demo-133")),
    /does not match/u,
  );
  assert.equal(seen.length, 1);
  assert.equal(seen[0].options.redirect, "error");
  assert.equal(seen[0].url.includes("private-test-token"), false);
  assert.equal(seen[0].options.headers["PRIVATE-TOKEN"], "private-test-token");
  const oversized = createGitlabDeploymentClient({
    token: "test",
    request: async () => new Response("x".repeat(2 * 1024 * 1024 + 1)),
  });
  await assert.rejects(
    oversized.ensureEnvironment(gitlabDeploymentEnvironment("demo-133")),
    /exceeds limit/u,
  );
});
