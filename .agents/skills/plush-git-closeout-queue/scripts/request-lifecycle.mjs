#!/usr/bin/env node
import { readFileSync } from "node:fs";

const TERMINAL = new Set(["DENIED", "RELEASED"]);
const TRANSITIONS = {
  REQUESTED: new Set(["QUEUED", "GRANTED", "DENIED"]),
  QUEUED: new Set(["GRANTED", "DENIED"]),
  GRANTED: new Set(["RELEASED"]),
  DENIED: new Set(),
  RELEASED: new Set(),
};

function copyState(state) {
  return structuredClone(state ?? { schemaVersion: 1, requests: {} });
}

function assertRequestId(requestId) {
  if (
    typeof requestId !== "string" ||
    requestId.length < 3 ||
    requestId.length > 200 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(requestId)
  ) {
    throw new Error("request_id must be a stable, non-empty token");
  }
}

export function applyRequestEvent(state, event) {
  const next = copyState(state);
  if (next.schemaVersion !== 1 || typeof next.requests !== "object") {
    throw new Error("unsupported queue request state");
  }

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

  if (TERMINAL.has(existing.status) || !TRANSITIONS[existing.status]?.has(type)) {
    throw new Error(
      `invalid request transition ${existing.status} -> ${type} for ${requestId}`,
    );
  }

  existing.status = type;
  existing.revision = event.revision ?? existing.revision;
  return {
    state: next,
    result: {
      request_id: requestId,
      status: type,
      changed: true,
      visible: true,
      action: type === "QUEUED" ? "QUEUED_ACK" : type,
    },
  };
}

function parseArgs(argv) {
  const options = { state: "", event: "" };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value || !["--state", "--event"].includes(flag)) {
      throw new Error("usage: request-lifecycle.mjs --state <json> --event <json>");
    }
    options[flag.slice(2)] = value;
  }
  if (!options.state || !options.event) {
    throw new Error("usage: request-lifecycle.mjs --state <json> --event <json>");
  }
  return options;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const state = JSON.parse(readFileSync(options.state, "utf8"));
    const event = JSON.parse(readFileSync(options.event, "utf8"));
    process.stdout.write(`${JSON.stringify(applyRequestEvent(state, event))}\n`);
  } catch (error) {
    process.stderr.write(`[request-lifecycle] ${error.message}\n`);
    process.exitCode = 1;
  }
}
