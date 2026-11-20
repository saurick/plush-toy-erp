import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
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
  DEPLOYMENT_RECORD_PACKAGE,
} from "./gitlab-deployment-records.mjs";
import { createGitlabDeploymentEvidenceReader } from "./gitlab-deployment-evidence.mjs";
import { createDevDeliveryService } from "../../web/dev-server/devDeliveryBridgePlugin.mjs";

const SHA = "a".repeat(40);
const MIGRATION = "20261103142757";
const digest = (value) =>
  createHash("sha256")
    .update(`${JSON.stringify(value, null, 2)}\n`)
    .digest("hex");
function fixture(t, target = "demo-133") {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-archive-read-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = resolveDeliveryOperationStore(root);
  const initial = createOrReuseDeliveryOperation(store, {
    action: "promote",
    target,
    gitSha: SHA,
    version: "2026.11.04-1",
    idempotencyKey: "read-archive-fixture-00001",
    now: "2026-11-04T00:00:00Z",
  }).operation;
  transitionDeliveryOperation(store, initial.id, {
    status: "running",
    message: "started",
    now: "2026-11-04T00:00:01Z",
  });
  const operation = transitionDeliveryOperation(store, initial.id, {
    status: "passed",
    message: "verified",
    now: "2026-11-04T00:00:02Z",
    metadata: {
      promotionFingerprint: "b".repeat(64),
      remoteStageTimings: [
        {
          id: "fresh_backup_and_restore_check",
          status: "passed",
          durationMs: 10,
        },
        { id: "migration_applied", status: "passed", durationMs: 10 },
        { id: "runtime_verified", status: "passed", durationMs: 10 },
      ],
    },
  });
  const receipt = {
    schemaVersion: "plush.remote-promotion-receipt/v6",
    operationId: operation.id,
    target,
    gitSha: SHA,
    version: operation.version,
    status: "passed",
    promotionFingerprint: "b".repeat(64),
    finishedAt: operation.updatedAt,
    migration: { required: MIGRATION, readback: MIGRATION, applyStarted: true },
    checks: {
      releaseIdentity: true,
      health: true,
      ready: true,
      basicSmoke: true,
      publicEntry: true,
    },
    rollbackPoint: {
      backupAlias: "verified-backup",
      backupSha256: "c".repeat(64),
      backupSizeBytes: 1024,
      restoreChecked: true,
    },
    timings: operation.metadata.remoteStageTimings,
  };
  const link = {
    schemaVersion: "plush.gitlab-deployment-record/v1",
    operationId: operation.id,
    target,
    gitSha: SHA,
    mode: "live",
    sourceStatus: operation.status,
    sourceStartedAt: operation.createdAt,
    sourceFinishedAt: operation.updatedAt,
    registeredAt: operation.updatedAt,
    deploymentId: 55,
    environmentId: 3,
    operationSha256: digest(operation),
    receiptSha256: digest(receipt),
  };
  const archives = new Map([
    ["operation.json", operation],
    ["link.json", link],
    ["receipt.json", receipt],
  ]);
  const requests = [];
  let unavailable = false;
  const client = createGitlabDeploymentClient({
    token: "fixture-read-only",
    request: async (input, options) => {
      assert.equal(options.method, "GET");
      assert.equal(options.headers["PRIVATE-TOKEN"], "fixture-read-only");
      assert.equal(options.redirect, "error");
      const url = new URL(input);
      requests.push(url.pathname);
      if (unavailable) throw new Error("private transport failure");
      let value;
      if (url.pathname.endsWith("/packages"))
        value = [
          {
            id: 901,
            name: DEPLOYMENT_RECORD_PACKAGE,
            package_type: "generic",
            version: `${target}-${operation.id}`,
          },
        ];
      else if (url.pathname.endsWith("/deployments/55"))
        value = {
          id: 55,
          sha: SHA,
          ref: "main",
          status: "success",
          environment: { id: 3, name: target === "demo-133" ? "demo" : "test" },
        };
      else value = archives.get(url.pathname.split("/").at(-1));
      return value
        ? new Response(JSON.stringify(value))
        : new Response("", { status: 404 });
    },
  });
  const reader = () => createGitlabDeploymentEvidenceReader({ client });
  return {
    root,
    store,
    operation,
    receipt,
    link,
    archives,
    client,
    reader,
    requests,
    setUnavailable: (value) => {
      unavailable = value;
    },
  };
}

test("another execution host reads exact immutable receipts without importing operations or granting mutations", async (t) => {
  const f = fixture(t);
  const reader = f.reader();
  const list = await reader.list("demo-133");
  assert.equal(list.status, "ready");
  assert.equal(list.entries[0].operation.id, f.operation.id);
  assert.equal((await reader.list("customer-test-133")).entries.length, 0);
  const remoteRoot = mkdtempSync(
    path.join(os.tmpdir(), "plush-archive-consumer-"),
  );
  t.after(() => rmSync(remoteRoot, { recursive: true, force: true }));
  let spawns = 0;
  const service = createDevDeliveryService({
    projectRoot: remoteRoot,
    provider: { provider: "gitlab" },
    deploymentEvidenceReader: reader,
    spawnProcess: () => {
      spawns += 1;
      throw new Error("must not execute");
    },
  });
  const history = await service.history({ target: "demo-133", keyword: SHA });
  assert.equal(history.matched, 1);
  assert.equal(history.operations[0].source, "gitlab_archive");
  assert.deepEqual(history.operations[0].retry, {
    allowed: false,
    reason: "archived_operation_read_only",
  });
  const details = await service.readOperation(f.operation.id, "demo-133");
  assert.equal(details.evidence.receiptSha256, digest(f.receipt));
  assert.equal(details.evidence.migration.required, MIGRATION);
  assert.equal(details.evidence.migration.readbackStatus, "passed");
  assert.equal(details.gitlabRecord.status, "recorded");
  assert.equal(details.gitlabRecord.deploymentId, 55);
  assert.equal(details.confirmationRequired, "");
  await assert.rejects(
    service.readOperation(f.operation.id, "customer-test-133"),
  );
  await assert.rejects(
    service.act({
      action: "retry-operation",
      payload: {
        operationId: f.operation.id,
        idempotencyKey: "archive-cannot-retry-0001",
      },
    }),
  );
  assert.equal(spawns, 0);
  assert.deepEqual(readdirSync(remoteRoot), []);
});

test("local and archived copies merge once, while conflicting copies remain explicitly incomplete", async (t) => {
  const f = fixture(t);
  const original = readFileSync(
    path.join(f.store, "operations", `${f.operation.id}.json`),
  );
  const service = createDevDeliveryService({
    projectRoot: f.root,
    provider: { provider: "gitlab" },
    deploymentEvidenceReader: f.reader(),
  });
  const history = await service.history({ target: "demo-133" });
  assert.equal(history.total, 1);
  assert.equal(history.operations[0].source, "local");
  f.archives.set("operation.json", { ...f.operation, version: "2026.11.04-2" });
  f.archives.set("link.json", {
    ...f.link,
    operationSha256: digest(f.archives.get("operation.json")),
  });
  const conflicting = createDevDeliveryService({
    projectRoot: f.root,
    provider: { provider: "gitlab" },
    deploymentEvidenceReader: f.reader(),
  });
  const incomplete = await conflicting.history({ target: "demo-133" });
  assert.equal(incomplete.integrity.archiveStatus, "partial");
  assert.equal(incomplete.integrity.unreadableOperations, 1);
  assert.equal(incomplete.operations[0].version, f.operation.version);
  assert.deepEqual(
    readFileSync(path.join(f.store, "operations", `${f.operation.id}.json`)),
    original,
  );
});

test("archive failure preserves local history, exposes a safe gap and recovers on the next read", async (t) => {
  const f = fixture(t);
  const diagnostics = [];
  const service = createDevDeliveryService({
    projectRoot: f.root,
    provider: { provider: "gitlab" },
    deploymentEvidenceReader: f.reader(),
    onDiagnostic: (event) => diagnostics.push(event),
  });
  f.setUnavailable(true);
  const failed = await service.history({ target: "demo-133" });
  assert.equal(failed.total, 1);
  assert.equal(failed.integrity.archiveStatus, "unavailable");
  assert.doesNotMatch(
    JSON.stringify({ failed, diagnostics }),
    /private transport|fixture-read-only/u,
  );
  f.setUnavailable(false);
  assert.equal(
    (await service.history({ target: "demo-133" })).integrity.archiveStatus,
    "ready",
  );
});

test("wrong identity, hashes, nonterminal results and mismatched receipts fail closed", async (t) => {
  for (const mutate of [
    (f) => {
      f.link.operationSha256 = "f".repeat(64);
    },
    (f) => {
      f.link.target = "customer-test-133";
    },
    (f) => {
      f.link.sourceStatus = "failed";
    },
    (f) => {
      f.link.sourceFinishedAt = "2026-11-04T00:00:03Z";
    },
    (f) => {
      f.archives.set("operation.json", { ...f.operation, status: "running" });
    },
  ]) {
    const f = fixture(t);
    mutate(f);
    const result = await f.reader().list("demo-133");
    assert.equal(result.status, "partial");
    assert.equal(result.entries.length, 0);
  }
  const f = fixture(t);
  f.receipt.migration.readback = "20260101000000";
  await assert.rejects(
    f.reader().read(f.operation.id, "demo-133"),
    /checksum/u,
  );
  f.link.receiptSha256 = digest(f.receipt);
  f.receipt.promotionFingerprint = "d".repeat(64);
  f.link.receiptSha256 = digest(f.receipt);
  await assert.rejects(
    f.reader().read(f.operation.id, "demo-133"),
    /does not match/u,
  );
});

test("incomplete publication is not a completed archive and completed headers share in-flight reads", async (t) => {
  const f = fixture(t);
  f.archives.delete("link.json");
  const reader = f.reader();
  assert.equal((await reader.list("demo-133")).entries.length, 0);
  f.archives.set("link.json", f.link);
  const lists = await Promise.all([
    reader.list("demo-133"),
    reader.list("demo-133"),
    reader.list("customer-test-133"),
  ]);
  assert.equal(lists[0].entries.length, 1);
  assert.equal(lists[1].entries.length, 1);
  assert.equal(f.requests.filter((url) => url.endsWith("/packages")).length, 1);
  assert.equal((await reader.list("test-133")).status, "not_applicable");
  await assert.rejects(reader.read("../../secret", "demo-133"), /scope/u);
  assert.equal(readDeliveryOperation(f.store, f.operation.id).status, "passed");
});

test("archive catalogs paginate without silently truncating and reject duplicate package identities", async () => {
  const pages = [];
  const client = createGitlabDeploymentClient({
    token: "fixture-read-only",
    request: async (input, options) => {
      assert.equal(options.method, "GET");
      const page = Number(new URL(input).searchParams.get("page"));
      pages.push(page);
      return new Response(
        JSON.stringify(
          page === 1
            ? Array.from({ length: 100 }, (_, index) => ({
                id: index + 1,
                name: DEPLOYMENT_RECORD_PACKAGE,
                package_type: "generic",
                version: `entry-${index}`,
              }))
            : [
                {
                  id: 101,
                  name: DEPLOYMENT_RECORD_PACKAGE,
                  package_type: "generic",
                  version: "entry-100",
                },
              ],
        ),
      );
    },
  });
  assert.equal((await client.listArchivePackages()).length, 101);
  assert.deepEqual(pages, [1, 2]);
  const duplicate = createGitlabDeploymentEvidenceReader({
    client: {
      listArchivePackages: async () => [
        { id: 1, version: "duplicate" },
        { id: 2, version: "duplicate" },
      ],
    },
  });
  await assert.rejects(duplicate.list("demo-133"), /catalog unavailable/u);
});
