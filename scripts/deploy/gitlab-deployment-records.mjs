import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  getDeploymentTarget,
  SUPPORTED_DEPLOYMENT_TARGET_KEYS,
} from "./deployment-targets.mjs";
import {
  GITLAB_DELIVERY_BASE_URL,
  GITLAB_DELIVERY_PROJECT,
} from "./gitlab-delivery-provider.mjs";
import {
  DELIVERY_OPERATION_TERMINAL_STATUSES,
  readDeliveryOperation,
  readDeliveryOperationReceipt,
  validateDeliveryOperation,
} from "./delivery-operation-store.mjs";

export const DEPLOYMENT_RECORD_PACKAGE = "plush-deployment-evidence";
const BASE = `${GITLAB_DELIVERY_BASE_URL}/${GITLAB_DELIVERY_PROJECT}`;
const API = `${GITLAB_DELIVERY_BASE_URL}/api/v4/projects/${encodeURIComponent(GITLAB_DELIVERY_PROJECT)}`;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TERMINAL = new Set(DELIVERY_OPERATION_TERMINAL_STATUSES);
const MAX_BYTES = 2 * 1024 * 1024;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

export function gitlabDeploymentEnvironment(targetKey) {
  const target = getDeploymentTarget(targetKey);
  const name = new URL(target.publicEntry.endpoint).hostname.split(".")[0];
  if (!/^[a-z][a-z0-9-]{0,30}$/u.test(name))
    throw new Error("GitLab environment name is invalid");
  return {
    name,
    external_url: target.publicEntry.endpoint,
    tier:
      target.purpose === "customer-production"
        ? "production"
        : target.purpose === "customer-clean-acceptance"
          ? "testing"
          : "staging",
    description: `${target.key}。执行检查与原始时间见工作台项目回执及 ${DEPLOYMENT_RECORD_PACKAGE}；历史补录的 GitLab 时间为登记时间，不是重新部署。`,
  };
}

function nativeEnvironment(operation) {
  if (
    ["abandoned", "invalidated"].includes(operation.status) ||
    !["promote", "rollback"].includes(operation.action) ||
    !SUPPORTED_DEPLOYMENT_TARGET_KEYS.includes(operation.target)
  )
    return null;
  return gitlabDeploymentEnvironment(operation.target);
}

function statePath(store, id) {
  if (!UUID.test(id)) throw new Error("deployment operation ID is invalid");
  return path.join(store, "gitlab", `${id}.json`);
}

function readState(file) {
  if (!existsSync(file)) return null;
  if (lstatSync(path.dirname(file)).isSymbolicLink())
    throw new Error("deployment record directory is invalid");
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!fstatSync(fd).isFile() || fstatSync(fd).size > MAX_BYTES)
      throw new Error("deployment record is too large or invalid");
    const bytes = readFileSync(fd);
    if (bytes.length > MAX_BYTES)
      throw new Error("deployment record is too large");
    return JSON.parse(bytes.toString("utf8"));
  } finally {
    closeSync(fd);
  }
}

function writeState(file, value, { create = false } = {}) {
  const dir = path.dirname(file);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (!lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink())
    throw new Error("deployment record directory is invalid");
  const temp = `${file}.${randomUUID()}.tmp`;
  const fd = openSync(temp, "wx", 0o600);
  try {
    writeFileSync(fd, jsonBytes(value));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    if (create) {
      linkSync(temp, file);
      unlinkSync(temp);
    } else {
      renameSync(temp, file);
    }
    const directory = openSync(dir, "r");
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}

function assertBinding(record, operation) {
  if (
    !record ||
    record.schemaVersion !== "plush.gitlab-deployment-record/v1" ||
    record.operationId !== operation.id ||
    record.target !== operation.target ||
    record.gitSha !== operation.gitSha ||
    record.action !== operation.action
  ) {
    throw new Error("GitLab deployment record identity mismatch");
  }
  if (
    !["pending", "recorded"].includes(record.status) ||
    !["live", "historical"].includes(record.mode)
  )
    throw new Error("GitLab deployment record state is invalid");
  for (const key of ["deploymentId", "environmentId", "packageId"]) {
    if (
      record[key] != null &&
      (!Number.isSafeInteger(record[key]) || record[key] < 1)
    )
      throw new Error("GitLab deployment reference is invalid");
  }
  if (record.deploymentId && !record.environmentId)
    throw new Error("GitLab deployment environment is missing");
  for (const key of [
    "requestedAt",
    "createRequestedAt",
    "registeredAt",
    "recordedAt",
  ]) {
    if (record[key] != null && !Number.isFinite(Date.parse(record[key])))
      throw new Error("GitLab deployment timestamp is invalid");
  }
  return record;
}

export function readGitlabDeploymentRecord(store, operation) {
  const record = readState(statePath(store, operation.id));
  if (!record) return null;
  assertBinding(record, operation);
  return {
    status: record.status,
    mode: record.mode,
    deploymentId: record.deploymentId ?? null,
    environmentUrl: record.environmentId
      ? `${BASE}/-/environments/${record.environmentId}`
      : null,
    deploymentUrl: record.deploymentId
      ? `${BASE}/-/environments/${record.environmentId}`
      : null,
    evidenceUrl: record.packageId
      ? `${BASE}/-/packages/${record.packageId}`
      : null,
    recordedAt: record.recordedAt ?? null,
    sourceStartedAt: operation.createdAt,
    sourceFinishedAt: TERMINAL.has(operation.status)
      ? operation.updatedAt
      : null,
  };
}

export function createGitlabDeploymentClient({ token, request = fetch } = {}) {
  if (
    typeof token !== "string" ||
    !token ||
    token.length > 512 ||
    /[\r\n\0]/u.test(token)
  )
    throw new Error("GitLab deployment credential unavailable");
  async function call(
    endpoint,
    { method = "GET", value, bytes, allowMissing = false } = {},
  ) {
    let response;
    try {
      response = await request(`${API}${endpoint}`, {
        method,
        headers: {
          "PRIVATE-TOKEN": token,
          "Content-Type": bytes
            ? "application/octet-stream"
            : "application/json",
        },
        body:
          bytes || (value === undefined ? undefined : JSON.stringify(value)),
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
    } catch {
      throw new Error(
        "GitLab deployment request unavailable; write outcome may be unknown",
      );
    }
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) {
      const error = new Error(
        `GitLab deployment request rejected (HTTP ${response.status})`,
      );
      if ([400, 401, 403, 404, 422].includes(response.status))
        error.rejectedWrite = true;
      throw error;
    }
    let total = 0;
    const chunks = [];
    for await (const part of response.body || []) {
      total += part.length;
      if (total > MAX_BYTES)
        throw new Error("GitLab deployment response exceeds limit");
      chunks.push(Buffer.from(part));
    }
    return Buffer.concat(chunks);
  }
  const json = async (endpoint, options) => {
    const bytes = await call(endpoint, options);
    return bytes === null ? null : JSON.parse(bytes.toString("utf8"));
  };
  function assertDeployment(item, operation, environment) {
    if (
      !Number.isSafeInteger(item?.id) ||
      item.id < 1 ||
      item.sha !== operation.gitSha ||
      item.ref !== "main" ||
      item.environment?.name !== environment.name ||
      !Number.isSafeInteger(item.environment?.id) ||
      item.environment.id < 1
    )
      throw new Error("GitLab deployment response identity mismatch");
    return item;
  }
  return {
    async readArchive(operation, name) {
      validateDeliveryOperation(operation);
      if (
        ![
          "operation.json",
          "receipt.json",
          "link.json",
          "intent.json",
        ].includes(name)
      )
        throw new Error("deployment evidence filename is invalid");
      return json(
        `/packages/generic/${DEPLOYMENT_RECORD_PACKAGE}/${operation.target}-${operation.id}/${name}`,
        { allowMissing: true },
      );
    },
    async ensureEnvironment(environment) {
      const list = await json(
        `/environments?name=${encodeURIComponent(environment.name)}`,
      );
      if (!Array.isArray(list) || list.length > 1)
        throw new Error("GitLab environment identity is ambiguous");
      const current =
        list[0] ??
        (await json("/environments", { method: "POST", value: environment }));
      if (
        !Number.isSafeInteger(current?.id) ||
        current.id < 1 ||
        current.name !== environment.name ||
        current.external_url !== environment.external_url ||
        current.tier !== environment.tier
      )
        throw new Error("GitLab environment does not match target registry");
      return current;
    },
    async createDeployment(operation, environment) {
      return assertDeployment(
        await json("/deployments", {
          method: "POST",
          value: {
            environment: environment.name,
            sha: operation.gitSha,
            ref: "main",
            tag: false,
            status: "running",
          },
        }),
        operation,
        environment,
      );
    },
    async readDeployment(id, operation, environment) {
      if (!Number.isSafeInteger(id) || id < 1)
        throw new Error("GitLab deployment ID is invalid");
      const deployment = assertDeployment(await json(`/deployments/${id}`), operation, environment);
      if (deployment.id !== id) throw new Error("GitLab deployment ID readback mismatch");
      return deployment;
    },
    async finishDeployment(id, status, operation, environment) {
      if (!["success", "failed", "canceled"].includes(status))
        throw new Error("GitLab deployment status is invalid");
      const before = await this.readDeployment(id, operation, environment);
      if (before.status !== status) {
        if (before.status !== "running")
          throw new Error(
            "GitLab deployment terminal result conflicts with receipt",
          );
        await json(`/deployments/${id}`, { method: "PUT", value: { status } });
      }
      const after = await this.readDeployment(id, operation, environment);
      if (after.status !== status)
        throw new Error("GitLab deployment result readback failed");
      return after;
    },
    async archive(operation, name, value) {
      if (
        ![
          "operation.json",
          "receipt.json",
          "link.json",
          "intent.json",
        ].includes(name)
      )
        throw new Error("deployment evidence filename is invalid");
      validateDeliveryOperation(operation);
      const version = `${operation.target}-${operation.id}`;
      const endpoint = `/packages/generic/${DEPLOYMENT_RECORD_PACKAGE}/${version}/${name}`;
      const bytes = jsonBytes(value);
      if (bytes.length > MAX_BYTES)
        throw new Error("deployment evidence exceeds limit");
      let remote = await call(endpoint, { allowMissing: true });
      if (!remote) {
        try {
          await call(endpoint, { method: "PUT", bytes });
        } catch {
          // Read back before any retry: Generic Package uploads may succeed even
          // when the response is lost. Never append a duplicate file blindly.
        }
        remote = await call(endpoint, { allowMissing: true });
      }
      if (!remote || digest(remote) !== digest(bytes))
        throw new Error("GitLab deployment evidence readback mismatch");
      const packages = await json(
        `/packages?package_type=generic&package_name=${DEPLOYMENT_RECORD_PACKAGE}&package_version=${encodeURIComponent(version)}&per_page=100`,
      );
      const matches = Array.isArray(packages)
        ? packages.filter(
            (x) =>
              x.name === DEPLOYMENT_RECORD_PACKAGE &&
              x.version === version &&
              x.package_type === "generic",
          )
        : [];
      if (
        matches.length !== 1 ||
        !Number.isSafeInteger(matches[0].id) ||
        matches[0].id < 1
      )
        throw new Error("GitLab deployment package identity is ambiguous");
      return { packageId: matches[0].id, sha256: digest(bytes) };
    },
  };
}

export function createGitlabDeploymentRecorder({
  store,
  client,
  now = () => new Date().toISOString(),
}) {
  async function register(id, { historical = false } = {}) {
    const operation = readDeliveryOperation(store, id);
    const environment = nativeEnvironment(operation);
    const file = statePath(store, id);
    let record = readState(file);
    if (record) assertBinding(record, operation);
    else {
      record = {
        schemaVersion: "plush.gitlab-deployment-record/v1",
        operationId: id,
        target: operation.target,
        gitSha: operation.gitSha,
        action: operation.action,
        mode: historical ? "historical" : "live",
        status: "pending",
        requestedAt: now(),
      };
      const remoteLink = await client.readArchive(operation, "link.json");
      const remoteIntent = await client.readArchive(operation, "intent.json");
      if (remoteLink) {
        if (
          remoteLink.operationId !== id ||
          remoteLink.target !== operation.target ||
          remoteLink.gitSha !== operation.gitSha ||
          remoteLink.sourceStatus !== operation.status ||
          remoteLink.sourceStartedAt !== operation.createdAt ||
          remoteLink.sourceFinishedAt !== operation.updatedAt ||
          remoteLink.operationSha256 !== digest(jsonBytes(operation))
        )
          throw new Error("archived deployment linkage mismatch");
        Object.assign(record, {
          mode: remoteLink.mode,
          deploymentId: remoteLink.deploymentId,
          environmentId: remoteLink.environmentId,
          registeredAt: remoteLink.registeredAt,
        });
      } else if (remoteIntent) {
        assertBinding(remoteIntent, operation);
        Object.assign(record, remoteIntent);
      }
      assertBinding(record, operation);
      writeState(file, record, { create: true });
    }
    if (record.status === "recorded")
      return readGitlabDeploymentRecord(store, operation);
    if (TERMINAL.has(operation.status)) {
      const archived = await client.archive(
        operation,
        "operation.json",
        operation,
      );
      record.packageId = archived.packageId;
      record.operationSha256 = archived.sha256;
      const receipt = readDeliveryOperationReceipt(store, operation);
      if (receipt) {
        const saved = await client.archive(
          operation,
          "receipt.json",
          receipt.receipt,
        );
        record.receiptSha256 = saved.sha256;
      }
      writeState(file, record);
    }
    if (environment && !record.deploymentId) {
      if (record.createRequestedAt)
        throw new Error(
          "GitLab deployment creation outcome is unknown; reconcile the existing ID before retrying",
        );
      const remoteEnvironment = await client.ensureEnvironment(environment);
      record.environmentId = remoteEnvironment.id;
      record.createRequestedAt = now();
      // Exclusive durable claim prevents concurrent processes from POSTing the
      // same operation twice. An uncertain POST is reconciled, never replayed.
      writeState(
        `${file}.create`,
        { operationId: id, requestedAt: record.createRequestedAt },
        { create: true },
      );
      writeState(file, record);
      // Remote intent also prevents a lost local cache from creating another
      // native deployment. Uncertain outcomes require an exact ID readback.
      try {
        const existingIntent = await client.readArchive(
          operation,
          "intent.json",
        );
        if (!existingIntent)
          await client.archive(operation, "intent.json", record);
      } catch (error) {
        delete record.createRequestedAt;
        writeState(file, record);
        unlinkSync(`${file}.create`);
        throw error;
      }
      let created;
      try {
        created = await client.createDeployment(operation, environment);
      } catch (error) {
        if (error.rejectedWrite) {
          delete record.createRequestedAt;
          writeState(file, record);
          unlinkSync(`${file}.create`);
        }
        throw error;
      }
      record.deploymentId = created.id;
      record.registeredAt = created.created_at;
      writeState(file, record);
    }
    if (TERMINAL.has(operation.status)) {
      if (record.deploymentId) {
        const status =
          operation.status === "passed"
            ? "success"
            : operation.status === "blocked"
              ? "canceled"
              : "failed";
        await client.finishDeployment(
          record.deploymentId,
          status,
          operation,
          environment,
        );
      }
      const link = {
        schemaVersion: record.schemaVersion,
        operationId: id,
        target: operation.target,
        gitSha: operation.gitSha,
        mode: record.mode,
        sourceStatus: operation.status,
        sourceStartedAt: operation.createdAt,
        sourceFinishedAt: operation.updatedAt,
        registeredAt: record.registeredAt ?? null,
        deploymentId: record.deploymentId ?? null,
        environmentId: record.environmentId ?? null,
        operationSha256: record.operationSha256,
        receiptSha256: record.receiptSha256 ?? null,
      };
      await client.archive(operation, "link.json", link);
      record.status = "recorded";
      record.recordedAt = now();
      writeState(file, record);
    }
    return readGitlabDeploymentRecord(store, operation);
  }
  return {
    register,
    async verify(id) {
      const operation = readDeliveryOperation(store, id);
      const record = assertBinding(readState(statePath(store, id)), operation);
      if (record.status !== "recorded")
        throw new Error("deployment recording is pending");
      const archived = await client.readArchive(operation, "operation.json");
      if (digest(jsonBytes(archived)) !== digest(jsonBytes(operation)))
        throw new Error("archived operation differs from original");
      const link = await client.readArchive(operation, "link.json");
      if (
        !link ||
        link.operationId !== id ||
        link.target !== operation.target ||
        link.gitSha !== operation.gitSha ||
        link.deploymentId !== (record.deploymentId ?? null) ||
        link.environmentId !== (record.environmentId ?? null) ||
        link.sourceStatus !== operation.status ||
        link.sourceStartedAt !== operation.createdAt ||
        link.sourceFinishedAt !== operation.updatedAt ||
        link.operationSha256 !== digest(jsonBytes(operation))
      )
        throw new Error("archived deployment linkage mismatch");
      const receipt = readDeliveryOperationReceipt(store, operation);
      if (
        receipt &&
        digest(
          jsonBytes(await client.readArchive(operation, "receipt.json")),
        ) !== digest(jsonBytes(receipt.receipt))
      )
        throw new Error("archived receipt differs from original");
      if (record.deploymentId) {
        const remote = await client.readDeployment(
          record.deploymentId,
          operation,
          nativeEnvironment(operation),
        );
        const expected =
          operation.status === "passed"
            ? "success"
            : operation.status === "blocked"
              ? "canceled"
              : "failed";
        if (remote.status !== expected || remote.environment.id !== record.environmentId)
          throw new Error("GitLab deployment state differs from original");
      }
      return readGitlabDeploymentRecord(store, operation);
    },
    async reconcile(id, deploymentId) {
      const operation = readDeliveryOperation(store, id);
      const environment = nativeEnvironment(operation);
      const file = statePath(store, id);
      const record = assertBinding(readState(file), operation);
      if (!environment || !record.createRequestedAt || record.deploymentId)
        throw new Error("deployment does not need ID reconciliation");
      const remote = await client.readDeployment(
        deploymentId,
        operation,
        environment,
      );
      if (
        !Number.isFinite(Date.parse(remote.created_at)) ||
        Date.parse(remote.created_at) <
          Date.parse(record.createRequestedAt) - 1000 ||
        remote.environment.id !== record.environmentId
      )
        throw new Error("GitLab deployment predates this registration intent");
      for (const name of readdirSync(path.dirname(file)).filter(
        (name) => name.endsWith(".json") && name !== `${id}.json`,
      )) {
        if (
          readState(path.join(path.dirname(file), name))?.deploymentId ===
          deploymentId
        )
          throw new Error(
            "GitLab deployment already belongs to another operation",
          );
      }
      record.deploymentId = remote.id;
      record.registeredAt = remote.created_at;
      writeState(file, record);
      return register(id);
    },
  };
}

export async function runRecordedDeployment({
  store,
  operationId,
  confirmation,
  execute,
  resolveCredential,
  client,
}) {
  const operation = readDeliveryOperation(store, operationId);
  const expected =
    operation.action === "promote"
      ? `PROMOTE:${operation.target}:${operation.gitSha}:${operation.id}`
      : `ROLLBACK:${operation.target}:${operation.metadata.currentGitSha}:${operation.gitSha}:${operation.id}`;
  if (!nativeEnvironment(operation) || !["ready", "launching"].includes(operation.status))
    throw new Error("operation is not in the eligible ready state");
  if (confirmation !== expected)
    throw new Error(
      "deployment registration requires the confirmed ready operation",
    );
  if (!client) {
    const { resolveGitlabReleaseCredential, verifyGitlabReleaseCredential } =
      await import("./gitlab-release-cli.mjs");
    const { token } = await (
      resolveCredential || resolveGitlabReleaseCredential
    )();
    await verifyGitlabReleaseCredential(token);
    client = createGitlabDeploymentClient({ token });
  }
  const recorder = createGitlabDeploymentRecorder({ store, client });
  await recorder.register(operationId);
  let result;
  let executionError;
  try {
    result = await execute();
  } catch (error) {
    executionError = error;
  }
  try {
    const latest = readDeliveryOperation(store, operationId);
    if (TERMINAL.has(latest.status)) await recorder.register(operationId);
    else
      throw new Error(
        "target outcome is not terminal; GitLab record remains pending",
      );
  } catch (error) {
    // A recording outage never changes a proven target result or replays a
    // deployment. The durable pending record can be resumed independently.
    if (result)
      result.gitlabRecord = { status: "pending", message: error.message };
    else if (executionError)
      executionError.message += "; GitLab recording pending";
    else executionError = error;
  }
  if (executionError) throw executionError;
  return result;
}

export async function syncGitlabDeploymentRecord({
  store,
  operationId,
  client,
}) {
  const operation = readDeliveryOperation(store, operationId);
  if (!TERMINAL.has(operation.status))
    throw new Error("only terminal operations can be archived");
  if (!client) {
    const { resolveGitlabReleaseCredential, verifyGitlabReleaseCredential } =
      await import("./gitlab-release-cli.mjs");
    const { token } = await resolveGitlabReleaseCredential();
    await verifyGitlabReleaseCredential(token);
    client = createGitlabDeploymentClient({ token });
  }
  return createGitlabDeploymentRecorder({ store, client }).register(
    operationId,
    { historical: true },
  );
}
