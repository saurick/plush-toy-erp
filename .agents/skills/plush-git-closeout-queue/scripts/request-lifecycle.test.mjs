import assert from "node:assert/strict";
import test from "node:test";

import { applyRequestEvent } from "./request-lifecycle.mjs";

const requestId = "source:batch:closeout:1";
const event = (type) => ({ request_id: requestId, type, revision: "r1" });

test("one request has one visible lifecycle and duplicate events are silent", () => {
  let state;
  const visible = [];
  for (const type of [
    "REQUESTED",
    "REQUESTED",
    "QUEUED",
    "QUEUED",
    "GRANTED",
    "GRANTED",
    "RELEASED",
    "RELEASED",
  ]) {
    const applied = applyRequestEvent(state, event(type));
    state = applied.state;
    if (applied.result.visible) visible.push(applied.result.action);
  }
  assert.deepEqual(visible, [
    "REQUESTED",
    "QUEUED_ACK",
    "GRANTED",
    "RELEASED",
  ]);
  assert.equal(state.requests[requestId].status, "RELEASED");
});

test("duplicate request reuses a granted state without another ACK", () => {
  let state = applyRequestEvent(undefined, event("REQUESTED")).state;
  state = applyRequestEvent(state, event("GRANTED")).state;
  const duplicate = applyRequestEvent(state, event("REQUESTED"));
  assert.equal(duplicate.result.status, "GRANTED");
  assert.equal(duplicate.result.changed, false);
  assert.equal(duplicate.result.visible, false);
});

test("wait timeout is silent and cannot change or recreate a request", () => {
  const requested = applyRequestEvent(undefined, event("REQUESTED"));
  const timeout = applyRequestEvent(requested.state, event("WAIT_TIMEOUT"));
  assert.equal(timeout.result.action, "WAIT_ENDED");
  assert.equal(timeout.result.visible, false);
  assert.equal(timeout.result.status, "REQUESTED");
  assert.deepEqual(timeout.state, requested.state);
});

test("denial is emitted once and is terminal", () => {
  let state = applyRequestEvent(undefined, event("REQUESTED")).state;
  const denied = applyRequestEvent(state, event("DENIED"));
  const duplicate = applyRequestEvent(denied.state, event("DENIED"));
  assert.equal(denied.result.visible, true);
  assert.equal(duplicate.result.visible, false);
  assert.throws(
    () => applyRequestEvent(denied.state, event("GRANTED")),
    /invalid request transition/u,
  );
});

test("grant requires an existing request and release requires a grant", () => {
  assert.throws(
    () => applyRequestEvent(undefined, event("GRANTED")),
    /must start with REQUESTED/u,
  );
  const requested = applyRequestEvent(undefined, event("REQUESTED"));
  assert.throws(
    () => applyRequestEvent(requested.state, event("RELEASED")),
    /invalid request transition/u,
  );
});
