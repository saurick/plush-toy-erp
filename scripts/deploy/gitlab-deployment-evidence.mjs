import { createHash } from "node:crypto";
import {
  assertDeliveryReceiptBinding,
  DELIVERY_OPERATION_TERMINAL_STATUSES,
  validateDeliveryOperation,
} from "./delivery-operation-store.mjs";
import {
  createGitlabDeploymentClient,
  gitlabDeploymentEnvironment,
} from "./gitlab-deployment-records.mjs";
import { SUPPORTED_DEPLOYMENT_TARGET_KEYS } from "./deployment-targets.mjs";
import {
  GITLAB_DELIVERY_BASE_URL,
  GITLAB_DELIVERY_PROJECT,
} from "./gitlab-delivery-provider.mjs";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HASH = /^[0-9a-f]{64}$/u;
const TERMINAL = new Set(DELIVERY_OPERATION_TERMINAL_STATUSES);
const BASE = `${GITLAB_DELIVERY_BASE_URL}/${GITLAB_DELIVERY_PROJECT}`;
const digest = (value) =>
  createHash("sha256")
    .update(`${JSON.stringify(value, null, 2)}\n`)
    .digest("hex");

export function assertArchivedOperationMatches(local, archived) {
  if (digest(local) !== digest(archived))
    throw new Error("local and archived operation identities conflict");
}

function recordForEntry({ operation, link, packageId }) {
  const environmentUrl = link.environmentId
    ? `${BASE}/-/environments/${link.environmentId}`
    : null;
  return {
    status: "recorded",
    mode: link.mode,
    deploymentId: link.deploymentId,
    environmentUrl,
    deploymentUrl: environmentUrl,
    evidenceUrl: `${BASE}/-/packages/${packageId}`,
    recordedAt: link.registeredAt,
    sourceStartedAt: operation.createdAt,
    sourceFinishedAt: operation.updatedAt,
  };
}

// The immutable archive is a read source, never an imported executable store.
export function createGitlabDeploymentEvidenceReader({
  token,
  client = createGitlabDeploymentClient({ token }),
  now = () => Date.now(),
  catalogTtlMs = 15_000,
} = {}) {
  let catalog;
  const entries = new Map();
  const pending = new Map();
  async function readCatalog() {
    if (catalog?.pending) return catalog.pending;
    if (catalog && now() - catalog.readAt < catalogTtlMs) return catalog.value;
    const current = {};
    catalog = current;
    current.pending = client
      .listArchivePackages()
      .then((value) => {
        const seen = new Set();
        const ids = new Set();
        for (const item of value) {
          if (
            !Number.isSafeInteger(item.id) ||
            item.id < 1 ||
            typeof item.version !== "string" ||
            seen.has(item.version) ||
            ids.has(item.id)
          )
            throw new Error(
              "GitLab deployment archive catalog identity is ambiguous",
            );
          seen.add(item.version);
          ids.add(item.id);
        }
        if (catalog === current)
          Object.assign(current, { value, readAt: now(), pending: null });
        return value;
      })
      .catch(() => {
        if (catalog === current) catalog = null;
        throw new Error("GitLab deployment archive catalog unavailable");
      });
    return current.pending;
  }
  async function readEntry(item, target, id) {
    const key = `${target}-${id}`;
    const cached = entries.get(key);
    if (cached) {
      if (cached.packageId !== item.id)
        throw new Error("GitLab deployment archive package identity changed");
      entries.delete(key);
      entries.set(key, cached);
      return cached;
    }
    if (pending.has(key)) return pending.get(key);
    const load = (async () => {
      // link.json is published last and commits the immutable archive.
      const link = await client.readArchivedFile(target, id, "link.json");
      if (!link) return null;
      const operation = validateDeliveryOperation(
        await client.readArchivedFile(target, id, "operation.json"),
      );
      if (
        operation.id !== id ||
        operation.target !== target ||
        !TERMINAL.has(operation.status) ||
        !["promote", "rollback", "rebuild-database"].includes(
          operation.action,
        ) ||
        link.schemaVersion !== "plush.gitlab-deployment-record/v1" ||
        link.operationId !== id ||
        link.target !== target ||
        link.gitSha !== operation.gitSha ||
        !["live", "historical"].includes(link.mode) ||
        link.sourceStatus !== operation.status ||
        link.sourceStartedAt !== operation.createdAt ||
        link.sourceFinishedAt !== operation.updatedAt ||
        link.operationSha256 !== digest(operation) ||
        ![link.deploymentId, link.environmentId].every(
          (value) =>
            value === null || (Number.isSafeInteger(value) && value > 0),
        ) ||
        (link.registeredAt !== null &&
          !Number.isFinite(Date.parse(link.registeredAt))) ||
        (link.receiptSha256 !== null && !HASH.test(String(link.receiptSha256)))
      )
        throw new Error("GitLab deployment archive binding is invalid");
      const entry = { operation, link, packageId: item.id };
      entry.gitlabRecord = recordForEntry(entry);
      entries.set(key, entry);
      if (entries.size > 1000) entries.delete(entries.keys().next().value);
      return entry;
    })().finally(() => pending.delete(key));
    pending.set(key, load);
    return load;
  }
  return {
    invalidate() {
      catalog = null;
    },
    async list(target) {
      if (!SUPPORTED_DEPLOYMENT_TARGET_KEYS.includes(target))
        return { entries: [], unreadable: 0, status: "not_applicable" };
      const packages = (await readCatalog()).filter(
        (item) =>
          item.version.startsWith(`${target}-`) &&
          UUID.test(item.version.slice(target.length + 1)),
      );
      const result = new Array(packages.length);
      let next = 0;
      let unreadable = 0;
      await Promise.all(
        Array.from({ length: Math.min(4, packages.length) }, async () => {
          while (next < packages.length) {
            const index = next++;
            const item = packages[index];
            try {
              result[index] = await readEntry(
                item,
                target,
                item.version.slice(target.length + 1),
              );
            } catch {
              unreadable += 1;
            }
          }
        }),
      );
      return {
        entries: result.filter(Boolean),
        unreadable,
        status: unreadable ? "partial" : "ready",
      };
    },
    async read(id, target) {
      if (!UUID.test(id) || !SUPPORTED_DEPLOYMENT_TARGET_KEYS.includes(target))
        throw new Error("archived operation scope is invalid");
      const matches = (await readCatalog()).filter(
        (item) => item.version === `${target}-${id}`,
      );
      if (matches.length !== 1)
        throw new Error("archived operation was not found");
      const entry = await readEntry(matches[0], target, id);
      if (!entry) throw new Error("deployment archive is not committed");
      const { operation, link } = entry;
      let stored = null;
      if (link.receiptSha256) {
        const receipt = await client.readArchivedFile(
          target,
          id,
          "receipt.json",
        );
        if (!receipt || digest(receipt) !== link.receiptSha256)
          throw new Error("archived deployment receipt checksum mismatch");
        assertDeliveryReceiptBinding(operation, receipt);
        stored = { receipt, sha256: link.receiptSha256 };
      }
      const native =
        ["promote", "rollback"].includes(operation.action) &&
        !["abandoned", "invalidated"].includes(operation.status);
      if (native) {
        if (
          !Number.isSafeInteger(link.deploymentId) ||
          link.deploymentId < 1 ||
          !Number.isSafeInteger(link.environmentId) ||
          link.environmentId < 1
        )
          throw new Error("archived native deployment reference is invalid");
        const deployment = await client.readDeployment(
          link.deploymentId,
          operation,
          gitlabDeploymentEnvironment(target),
        );
        const expected =
          operation.status === "passed"
            ? "success"
            : operation.status === "blocked"
              ? "canceled"
              : "failed";
        if (
          deployment.environment.id !== link.environmentId ||
          deployment.status !== expected
        )
          throw new Error("archived native deployment readback mismatch");
      } else if (link.deploymentId !== null || link.environmentId !== null) {
        throw new Error(
          "archive without a native deployment has unexpected references",
        );
      }
      return {
        operation,
        stored,
        gitlabRecord: recordForEntry(entry),
      };
    },
  };
}
