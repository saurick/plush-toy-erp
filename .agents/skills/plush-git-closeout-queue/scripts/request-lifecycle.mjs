#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const TERMINAL = new Set(["DENIED", "RELEASED"]);
const TRANSITIONS = {
  REQUESTED: new Set(["QUEUED", "GRANTED", "DENIED"]),
  QUEUED: new Set(["GRANTED", "DENIED"]),
  GRANTED: new Set(["RELEASED"]),
  DENIED: new Set(),
  RELEASED: new Set(),
};

function copyState(state) {
  const next = structuredClone(
    state ?? { schemaVersion: 1, requests: {}, resumeTokens: {} },
  );
  next.resumeTokens ??= {};
  return next;
}

function assertQueueState(state) {
  if (
    state.schemaVersion !== 1 ||
    typeof state.requests !== "object" ||
    state.requests == null ||
    Array.isArray(state.requests) ||
    typeof state.resumeTokens !== "object" ||
    state.resumeTokens == null ||
    Array.isArray(state.resumeTokens)
  ) {
    throw new Error("unsupported queue request state");
  }
}

function assertStableToken(value, fieldName) {
  if (
    typeof value !== "string" ||
    value.length < 3 ||
    value.length > 240 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(value)
  ) {
    throw new Error(`${fieldName} must be a stable, non-empty token`);
  }
}

function assertRequestId(requestId) {
  assertStableToken(requestId, "request_id");
}

function normalizeStringList(value, fieldName) {
  if (value == null || value === "none") return [];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !item.trim())
  ) {
    throw new Error(
      `${fieldName} must be an array of non-empty strings or none`,
    );
  }
  return [...new Set(value.map((item) => item.trim()))];
}

function normalizeAliasEntries(pathAliases) {
  if (pathAliases == null) return [];
  if (
    typeof pathAliases !== "object" ||
    Array.isArray(pathAliases) ||
    Object.entries(pathAliases).some(
      ([alias, target]) => !alias || typeof target !== "string" || !target,
    )
  ) {
    throw new Error(
      "path_aliases must map non-empty aliases to repository paths",
    );
  }
  return Object.entries(pathAliases)
    .map(([alias, target]) => [
      alias.replaceAll("\\", "/").replace(/\/+$/u, ""),
      target.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/+$/u, ""),
    ])
    .sort(([left], [right]) => right.length - left.length);
}

function normalizePathPattern(value, pathAliases) {
  let normalized = value.trim().replaceAll("\\", "/");
  for (const [alias, target] of normalizeAliasEntries(pathAliases)) {
    if (normalized === alias || normalized.startsWith(`${alias}/`)) {
      normalized = `${target}${normalized.slice(alias.length)}`;
      break;
    }
  }
  normalized = path.posix.normalize(normalized).replace(/^\.\//u, "");
  normalized = normalized.replace(/\/+$/u, "");
  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("/") ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new Error(`path must remain inside the repository: ${value}`);
  }
  return normalized;
}

function normalizePaths(value, fieldName, pathAliases) {
  return [
    ...new Set(
      normalizeStringList(value, fieldName).map((item) =>
        normalizePathPattern(item, pathAliases),
      ),
    ),
  ];
}

function containsGlob(value) {
  return /[*?[{]/u.test(value);
}

function conservativeGlobScope(value) {
  const globIndex = value.search(/[*?[{]/u);
  if (globIndex === -1) return value;
  const parentIndex = value.lastIndexOf("/", globIndex);
  return parentIndex === -1 ? "." : value.slice(0, parentIndex) || ".";
}

function pathsAreHierarchical(left, right) {
  if (left === "." || right === ".") return true;
  return (
    left === right ||
    left.startsWith(`${right}/`) ||
    right.startsWith(`${left}/`)
  );
}

function pathPatternsOverlap(left, right) {
  if (!containsGlob(left) && !containsGlob(right)) {
    return pathsAreHierarchical(left, right);
  }
  return pathsAreHierarchical(
    conservativeGlobScope(left),
    conservativeGlobScope(right),
  );
}

function overlapsFromLeft(left, right) {
  return left.filter((leftPath) =>
    right.some((rightPath) => pathPatternsOverlap(leftPath, rightPath)),
  );
}

function writerClosure(writer, pathAliases) {
  return [
    ...new Set([
      ...normalizePaths(writer?.paths, "paths", pathAliases),
      ...normalizePaths(writer?.derived_paths, "derived_paths", pathAliases),
    ]),
  ];
}

function writerResources(writer) {
  return normalizeStringList(writer?.resource_keys, "resource_keys");
}

function writerReadHotspots(writer, pathAliases) {
  return normalizePaths(writer?.read_hotspots, "read_hotspots", pathAliases);
}

function writerSurface(writer, pathAliases) {
  const writePaths = writerClosure(writer, pathAliases);
  const readHotspots = writerReadHotspots(writer, pathAliases);
  const resources = writerResources(writer);
  if (
    writePaths.length === 0 &&
    readHotspots.length === 0 &&
    resources.length === 0
  ) {
    throw new Error(
      `request ${String(writer?.request_id)} has no paths, read_hotspots, or resources`,
    );
  }
  return { writePaths, readHotspots, resources };
}

function classifyWriterLease(writer) {
  const terminalTaskStates = new Set([
    "idle",
    "notLoaded",
    "completed",
    "error",
    "cancelled",
  ]);
  const terminalTurnStatuses = new Set(["completed", "error", "cancelled"]);
  if (
    terminalTaskStates.has(writer?.task_state) ||
    terminalTurnStatuses.has(writer?.turn_status)
  ) {
    return { active: false, reason: "turn_ended" };
  }
  const required = [
    "grant_turn_id",
    "lease_id",
    "current_turn_id",
    "current_lease_id",
  ];
  if (
    required.some(
      (field) => typeof writer?.[field] !== "string" || !writer[field],
    )
  ) {
    return { active: true, reason: "missing_lease_identity" };
  }
  if (writer.task_state !== "active" || writer.turn_status !== "inProgress") {
    return { active: true, reason: "unverified_turn_state" };
  }
  if (writer.current_turn_id !== writer.grant_turn_id) {
    return { active: false, reason: "grant_turn_changed" };
  }
  if (writer.current_lease_id !== writer.lease_id) {
    return { active: false, reason: "lease_replaced" };
  }
  return { active: true };
}

function buildPathConflict(request, blocker) {
  const writeWrite = overlapsFromLeft(request.writePaths, blocker.writePaths);
  const writeRead = overlapsFromLeft(request.writePaths, blocker.readHotspots);
  const readWrite = overlapsFromLeft(request.readHotspots, blocker.writePaths);
  const resourceKeys = request.resources.filter((key) =>
    blocker.resources.includes(key),
  );
  if (
    writeWrite.length === 0 &&
    writeRead.length === 0 &&
    readWrite.length === 0 &&
    resourceKeys.length === 0
  ) {
    return null;
  }
  const conflict = {
    request_id: blocker.request_id,
    blocker_type: blocker.blocker_type,
  };
  const paths = [...new Set([...writeWrite, ...readWrite])];
  if (paths.length > 0) conflict.paths = paths;
  if (writeRead.length > 0) {
    conflict.read_hotspots = overlapsFromLeft(
      blocker.readHotspots,
      request.writePaths,
    );
  }
  if (readWrite.length > 0) conflict.request_read_hotspots = readWrite;
  if (blocker.blocker_type === "uncommitted_batch" && writeWrite.length > 0) {
    conflict.full_owned_paths = overlapsFromLeft(
      blocker.writePaths,
      request.writePaths,
    );
  }
  if (resourceKeys.length > 0) conflict.resource_keys = resourceKeys;
  return conflict;
}

function occupantFromRequest(request, blockerType, pathAliases) {
  return {
    request_id: request.request_id,
    blocker_type: blockerType,
    ...writerSurface(request, pathAliases),
  };
}

export function planWriterGrants({
  queuedRequests = [],
  activeWriters = [],
  activeResources = [],
  uncommittedBatches = [],
  pathAliases = {},
  createLeaseId = (request) => `lease:${request.request_id}:${randomUUID()}`,
} = {}) {
  const occupied = [];
  const seen = new Set();
  const expired = [];

  for (const writer of activeWriters) {
    assertRequestId(writer?.request_id);
    if (seen.has(writer.request_id)) {
      throw new Error(`duplicate writer request_id: ${writer.request_id}`);
    }
    seen.add(writer.request_id);
    const lease = classifyWriterLease(writer);
    if (!lease.active) {
      expired.push({
        request_id: writer.request_id,
        lease_id: writer.lease_id ?? null,
        reason: lease.reason,
      });
      continue;
    }
    occupied.push(occupantFromRequest(writer, "active_writer", pathAliases));
  }

  for (const resource of activeResources) {
    const requestId = resource?.request_id ?? resource?.resource_id;
    assertRequestId(requestId);
    if (seen.has(requestId)) {
      throw new Error(`duplicate occupied request_id: ${requestId}`);
    }
    seen.add(requestId);
    occupied.push(
      occupantFromRequest(
        { ...resource, request_id: requestId },
        "active_resource",
        pathAliases,
      ),
    );
  }

  for (const batch of uncommittedBatches) {
    const requestId = batch?.request_id ?? batch?.batch_id;
    assertRequestId(requestId);
    if (seen.has(requestId)) {
      throw new Error(`duplicate occupied request_id: ${requestId}`);
    }
    seen.add(requestId);
    occupied.push(
      occupantFromRequest(
        {
          request_id: requestId,
          paths: batch.full_owned_paths,
          derived_paths: "none",
        },
        "uncommitted_batch",
        pathAliases,
      ),
    );
  }

  const granted = [];
  const waiting = [];
  for (const request of queuedRequests) {
    assertRequestId(request?.request_id);
    if (seen.has(request.request_id)) {
      throw new Error(`duplicate writer request_id: ${request.request_id}`);
    }
    seen.add(request.request_id);
    const surface = occupantFromRequest(request, "planned_writer", pathAliases);
    const blockers = occupied
      .map((blocker) => buildPathConflict(surface, blocker))
      .filter(Boolean);

    if (blockers.length > 0) {
      waiting.push({ request_id: request.request_id, blockers });
      continue;
    }

    assertStableToken(request.turn_id, "turn_id");
    const leaseId = createLeaseId(request);
    assertStableToken(leaseId, "lease_id");
    granted.push({
      request_id: request.request_id,
      grant_turn_id: request.turn_id,
      lease_id: leaseId,
    });
    occupied.push(surface);
  }

  return { granted, waiting, expired };
}

function assertRecord(value, fieldName) {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
}

function assertContinuationCheckpoint(checkpoint) {
  assertRecord(checkpoint, "continuation_checkpoint");
}

function assertResumeIdentity(identity, fieldName) {
  assertRecord(identity, fieldName);
  for (const field of ["head", "index", "index_lock"]) {
    if (typeof identity[field] !== "string" || !identity[field]) {
      throw new Error(`${fieldName}.${field} is required`);
    }
  }
  assertRecord(identity.path_hashes, `${fieldName}.path_hashes`);
  assertRecord(identity.resource_state, `${fieldName}.resource_state`);
}

function createResumeToken(waitEventId, blockerIdentity) {
  const digest = createHash("sha256")
    .update(`${waitEventId}\0${blockerIdentity}`)
    .digest("hex")
    .slice(0, 32);
  return `resume:${digest}`;
}

function recordMismatches(expected, live, fieldName) {
  return Object.entries(expected)
    .filter(([key, value]) => live[key] !== value)
    .map(([key]) => `${fieldName}.${key}`);
}

export function revalidateResumeIdentity(expected, live, blockerIdentity) {
  assertResumeIdentity(expected, "expected_identity");
  assertResumeIdentity(live, "live_identity");
  const mismatches = [];
  for (const field of ["head", "index", "index_lock"]) {
    if (expected[field] !== live[field]) mismatches.push(field);
  }
  mismatches.push(
    ...recordMismatches(expected.path_hashes, live.path_hashes, "path_hashes"),
    ...recordMismatches(
      expected.resource_state,
      live.resource_state,
      "resource_state",
    ),
  );
  if (live.blocker_identity !== blockerIdentity) {
    mismatches.push("blocker_identity");
  }
  return {
    ok: mismatches.length === 0 && live.blocker_cleared === true,
    blocker_cleared: live.blocker_cleared === true,
    mismatches,
  };
}

export function registerWait(state, wait) {
  const next = copyState(state);
  assertQueueState(next);
  const {
    wait_event_id: waitEventId,
    blocker_identity: blockerIdentity,
    target_task_id: targetTaskId,
    continuation_checkpoint: continuationCheckpoint,
    expected_identity: expectedIdentity,
  } = wait ?? {};
  assertStableToken(waitEventId, "wait_event_id");
  assertStableToken(blockerIdentity, "blocker_identity");
  assertStableToken(targetTaskId, "target_task_id");
  assertContinuationCheckpoint(continuationCheckpoint);
  assertResumeIdentity(expectedIdentity, "expected_identity");
  const resumeToken = createResumeToken(waitEventId, blockerIdentity);
  const entry = {
    status: "WAITING",
    wait_event_id: waitEventId,
    blocker_identity: blockerIdentity,
    target_task_id: targetTaskId,
    continuation_checkpoint: structuredClone(continuationCheckpoint),
    expected_identity: structuredClone(expectedIdentity),
  };
  const existing = next.resumeTokens[resumeToken];
  if (existing) {
    const stableExisting = {
      ...existing,
      status: "WAITING",
      wake_receipt: undefined,
      consumed_turn_id: undefined,
    };
    if (JSON.stringify(stableExisting) !== JSON.stringify(entry)) {
      throw new Error(
        `resume token ${resumeToken} already belongs to another wait`,
      );
    }
    return {
      state: next,
      result: {
        action: "WAIT_REUSED",
        changed: false,
        resume_token: resumeToken,
      },
    };
  }
  next.resumeTokens[resumeToken] = entry;
  return {
    state: next,
    result: {
      action: "WAIT_REGISTERED",
      changed: true,
      resume_token: resumeToken,
    },
  };
}

function queueMayAdopt(checkpoint) {
  return (
    checkpoint.adoptable_by_queue === true &&
    checkpoint.scope_bounded === true &&
    checkpoint.requires_user_decision === false &&
    checkpoint.authority_expansion === false &&
    checkpoint.destructive_actions === false &&
    checkpoint.git_actions === false &&
    checkpoint.push_actions === false &&
    checkpoint.deploy_actions === false &&
    checkpoint.database_mutation === false
  );
}

function confirmedWakeReceipt(receipt, targetTaskId) {
  return (
    receipt?.accepted === true &&
    receipt?.queued === true &&
    receipt?.top_level_task === true &&
    receipt?.target_task_id === targetTaskId &&
    typeof receipt.turn_id === "string" &&
    receipt.turn_id.length > 0 &&
    typeof receipt.receipt_id === "string" &&
    receipt.receipt_id.length > 0
  );
}

export async function dispatchWaitResume({
  state,
  resume_token: resumeToken,
  live_identity: liveIdentity,
  host_followup: hostFollowup,
  allow_queue_adoption: allowQueueAdoption = false,
} = {}) {
  const next = copyState(state);
  assertQueueState(next);
  assertStableToken(resumeToken, "resume_token");
  const entry = next.resumeTokens[resumeToken];
  if (!entry) throw new Error(`unknown resume token: ${resumeToken}`);
  if (entry.status === "CONSUMED") {
    return {
      state: next,
      result: {
        action: "RESUME_TOKEN_CONSUMED",
        changed: false,
        resume_token: resumeToken,
      },
    };
  }
  if (entry.status === "WAKE_CONFIRMED") {
    return {
      state: next,
      result: {
        action: "WAKE_ALREADY_CONFIRMED",
        changed: false,
        resume_token: resumeToken,
        wake_receipt: structuredClone(entry.wake_receipt),
      },
    };
  }

  const revalidated = revalidateResumeIdentity(
    entry.expected_identity,
    liveIdentity,
    entry.blocker_identity,
  );
  if (!revalidated.blocker_cleared) {
    return {
      state: next,
      result: {
        action: "WAIT_BLOCKER_REAPPEARED",
        changed: false,
        resume_token: resumeToken,
      },
    };
  }
  if (!revalidated.ok) {
    return {
      state: next,
      result: {
        action: "WAIT_REVALIDATION",
        changed: false,
        resume_token: resumeToken,
        mismatches: revalidated.mismatches,
      },
    };
  }
  if (entry.continuation_checkpoint.requires_user_decision === true) {
    return {
      state: next,
      result: {
        action: "USER_DECISION_REQUIRED",
        changed: false,
        resume_token: resumeToken,
      },
    };
  }

  if (typeof hostFollowup === "function") {
    let receipt;
    try {
      receipt = await hostFollowup({
        target_task_id: entry.target_task_id,
        message: {
          event: "RESUME_FROM_WAIT",
          resume_token: resumeToken,
          wait_event_id: entry.wait_event_id,
          blocker_identity: entry.blocker_identity,
        },
      });
    } catch (error) {
      return {
        state: next,
        result: {
          action: "WAIT_HOST_WAKEUP",
          changed: false,
          resume_token: resumeToken,
          reason: "host_followup_failed",
          detail: error instanceof Error ? error.message : String(error),
        },
      };
    }
    if (!confirmedWakeReceipt(receipt, entry.target_task_id)) {
      return {
        state: next,
        result: {
          action: "WAIT_HOST_WAKEUP",
          changed: false,
          resume_token: resumeToken,
          reason: "host_followup_unconfirmed",
        },
      };
    }
    entry.status = "WAKE_CONFIRMED";
    entry.wake_receipt = structuredClone(receipt);
    return {
      state: next,
      result: {
        action: "WAKE_CONFIRMED",
        event: "RESUME_FROM_WAIT",
        changed: true,
        resume_token: resumeToken,
        wake_receipt: structuredClone(receipt),
      },
    };
  }

  if (
    allowQueueAdoption === true &&
    queueMayAdopt(entry.continuation_checkpoint)
  ) {
    entry.status = "CONSUMED";
    entry.consumed_turn_id = "queue-adopted";
    return {
      state: next,
      result: {
        action: "ADOPT_CHECKPOINT",
        event: "RESUME_ADOPTED",
        changed: true,
        resume_token: resumeToken,
      },
    };
  }

  return {
    state: next,
    result: {
      action: "WAIT_HOST_WAKEUP",
      changed: false,
      resume_token: resumeToken,
      reason: "host_followup_unavailable",
    },
  };
}

export function claimResumeToken({
  state,
  resume_token: resumeToken,
  target_task_id: targetTaskId,
  turn_id: turnId,
  live_identity: liveIdentity,
} = {}) {
  const next = copyState(state);
  assertQueueState(next);
  assertStableToken(resumeToken, "resume_token");
  assertStableToken(targetTaskId, "target_task_id");
  assertStableToken(turnId, "turn_id");
  const entry = next.resumeTokens[resumeToken];
  if (!entry) throw new Error(`unknown resume token: ${resumeToken}`);
  if (entry.status === "CONSUMED") {
    return {
      state: next,
      result: {
        action: "RESUME_TOKEN_CONSUMED",
        changed: false,
        resume_token: resumeToken,
      },
    };
  }
  if (entry.status !== "WAKE_CONFIRMED") {
    return {
      state: next,
      result: {
        action: "WAIT_HOST_WAKEUP",
        changed: false,
        resume_token: resumeToken,
      },
    };
  }
  if (
    entry.target_task_id !== targetTaskId ||
    entry.wake_receipt.turn_id !== turnId
  ) {
    throw new Error("resume claim does not match the confirmed target turn");
  }
  const revalidated = revalidateResumeIdentity(
    entry.expected_identity,
    liveIdentity,
    entry.blocker_identity,
  );
  if (!revalidated.blocker_cleared) {
    entry.status = "WAITING";
    delete entry.wake_receipt;
    return {
      state: next,
      result: {
        action: "WAIT_BLOCKER_REAPPEARED",
        changed: true,
        resume_token: resumeToken,
      },
    };
  }
  if (!revalidated.ok) {
    return {
      state: next,
      result: {
        action: "WAIT_REVALIDATION",
        changed: false,
        resume_token: resumeToken,
        mismatches: revalidated.mismatches,
      },
    };
  }
  entry.status = "CONSUMED";
  entry.consumed_turn_id = turnId;
  return {
    state: next,
    result: {
      action: "RESUME_FROM_WAIT",
      changed: true,
      resume_token: resumeToken,
    },
  };
}

function assertLeaseIdentity(event, type) {
  if (type !== "GRANTED" && type !== "RELEASED") return;
  assertStableToken(event?.grant_turn_id, "grant_turn_id");
  assertStableToken(event?.lease_id, "lease_id");
}

function leaseIdentityMatches(existing, event) {
  return (
    existing.grant_turn_id === event.grant_turn_id &&
    existing.lease_id === event.lease_id
  );
}

export function applyRequestEvent(state, event) {
  const next = copyState(state);
  assertQueueState(next);

  const { request_id: requestId, type } = event ?? {};
  assertRequestId(requestId);

  if (type === "WAIT_TIMEOUT") {
    return {
      state: next,
      result: {
        request_id: requestId,
        status: next.requests[requestId]?.status ?? "UNKNOWN",
        changed: false,
        visible: false,
        action: "WAIT_ENDED",
      },
    };
  }

  if (!Object.hasOwn(TRANSITIONS, type)) {
    throw new Error(`unsupported request event: ${String(type)}`);
  }
  assertLeaseIdentity(event, type);

  const existing = next.requests[requestId];
  if (!existing) {
    if (type !== "REQUESTED") {
      throw new Error(`request ${requestId} must start with REQUESTED`);
    }
    next.requests[requestId] = {
      status: "REQUESTED",
      revision: event.revision ?? null,
    };
    return {
      state: next,
      result: {
        request_id: requestId,
        status: "REQUESTED",
        changed: true,
        visible: true,
        action: "REQUESTED",
      },
    };
  }

  if (existing.status === type || type === "REQUESTED") {
    if (
      (type === "GRANTED" || type === "RELEASED") &&
      !leaseIdentityMatches(existing, event)
    ) {
      throw new Error(`stale lease identity for ${requestId}`);
    }
    return {
      state: next,
      result: {
        request_id: requestId,
        status: existing.status,
        changed: false,
        visible: false,
        action: "REUSED",
      },
    };
  }

  if (
    TERMINAL.has(existing.status) ||
    !TRANSITIONS[existing.status]?.has(type)
  ) {
    throw new Error(
      `invalid request transition ${existing.status} -> ${type} for ${requestId}`,
    );
  }
  if (type === "RELEASED" && !leaseIdentityMatches(existing, event)) {
    throw new Error(
      `release lease identity does not match grant for ${requestId}`,
    );
  }

  existing.status = type;
  existing.revision = event.revision ?? existing.revision;
  if (type === "GRANTED") {
    existing.grant_turn_id = event.grant_turn_id;
    existing.lease_id = event.lease_id;
  }
  return {
    state: next,
    result: {
      request_id: requestId,
      status: type,
      changed: true,
      visible: true,
      action: type === "QUEUED" ? "QUEUED_ACK" : type,
      ...(type === "GRANTED" || type === "RELEASED"
        ? {
            grant_turn_id: existing.grant_turn_id,
            lease_id: existing.lease_id,
          }
        : {}),
    },
  };
}

function parseArgs(argv) {
  const options = { state: "", event: "" };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value || !["--state", "--event"].includes(flag)) {
      throw new Error(
        "usage: request-lifecycle.mjs --state <json> --event <json>",
      );
    }
    options[flag.slice(2)] = value;
  }
  if (!options.state || !options.event) {
    throw new Error(
      "usage: request-lifecycle.mjs --state <json> --event <json>",
    );
  }
  return options;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const state = JSON.parse(readFileSync(options.state, "utf8"));
    const event = JSON.parse(readFileSync(options.event, "utf8"));
    process.stdout.write(
      `${JSON.stringify(applyRequestEvent(state, event))}\n`,
    );
  } catch (error) {
    process.stderr.write(`[request-lifecycle] ${error.message}\n`);
    process.exitCode = 1;
  }
}
