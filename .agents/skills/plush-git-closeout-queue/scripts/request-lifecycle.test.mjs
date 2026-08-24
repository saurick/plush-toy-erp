import assert from "node:assert/strict";
import test from "node:test";

import {
  applyRequestEvent,
  claimResumeToken,
  dispatchWaitResume,
  planWriterGrants,
  registerWait,
  revalidateResumeIdentity,
} from "./request-lifecycle.mjs";

const requestId = "source:batch:closeout:1";
const grantIdentity = {
  grant_turn_id: "turn:source:1",
  lease_id: "lease:source:1",
};
const event = (type, overrides = {}) => ({
  request_id: requestId,
  type,
  revision: "r1",
  ...(["GRANTED", "RELEASED"].includes(type) ? grantIdentity : {}),
  ...overrides,
});
const createLeaseId = (request) => `lease:${request.request_id}`;

const activeWriter = (overrides = {}) => ({
  request_id: "active:sales",
  paths: ["web/src/erp/pages/V1SalesOrdersPage.jsx"],
  grant_turn_id: "turn:active:1",
  lease_id: "lease:active:1",
  current_turn_id: "turn:active:1",
  current_lease_id: "lease:active:1",
  task_state: "active",
  turn_status: "inProgress",
  ...overrides,
});

const expectedIdentity = {
  head: "head-1",
  index: "empty",
  index_lock: "absent",
  path_hashes: {
    "web/src/erp/pages/V1SalesOrdersPage.jsx": "sha-sales",
  },
  resource_state: {
    "vite:127.0.0.1:6175": "free",
  },
};
const liveIdentity = (overrides = {}) => ({
  ...structuredClone(expectedIdentity),
  blocker_identity: "writer:active:sales",
  blocker_cleared: true,
  ...overrides,
});
const safeCheckpoint = (overrides = {}) => ({
  objective: "finish the exact sales page hunk",
  adoptable_by_queue: false,
  scope_bounded: true,
  requires_user_decision: false,
  authority_expansion: false,
  destructive_actions: false,
  git_actions: false,
  push_actions: false,
  deploy_actions: false,
  database_mutation: false,
  ...overrides,
});
const waitInput = (overrides = {}) => ({
  wait_event_id: "task:wait:1",
  blocker_identity: "writer:active:sales",
  target_task_id: "task:waiting:sales",
  continuation_checkpoint: safeCheckpoint(),
  expected_identity: expectedIdentity,
  ...overrides,
});

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
  assert.deepEqual(visible, ["REQUESTED", "QUEUED_ACK", "GRANTED", "RELEASED"]);
  assert.equal(state.requests[requestId].status, "RELEASED");
  assert.deepEqual(
    {
      grant_turn_id: state.requests[requestId].grant_turn_id,
      lease_id: state.requests[requestId].lease_id,
    },
    grantIdentity,
  );
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
  const state = applyRequestEvent(undefined, event("REQUESTED")).state;
  const denied = applyRequestEvent(state, event("DENIED"));
  const duplicate = applyRequestEvent(denied.state, event("DENIED"));
  assert.equal(denied.result.visible, true);
  assert.equal(duplicate.result.visible, false);
  assert.throws(
    () => applyRequestEvent(denied.state, event("GRANTED")),
    /invalid request transition/u,
  );
});

test("grant and release require one matching turn-bound lease", () => {
  const requested = applyRequestEvent(undefined, event("REQUESTED"));
  assert.throws(
    () =>
      applyRequestEvent(requested.state, {
        request_id: requestId,
        type: "GRANTED",
      }),
    /grant_turn_id/u,
  );
  const granted = applyRequestEvent(requested.state, event("GRANTED"));
  assert.throws(
    () =>
      applyRequestEvent(
        granted.state,
        event("RELEASED", { lease_id: "lease:stale:1" }),
      ),
    /does not match grant/u,
  );
});

test("writer planner avoids head-of-line blocking and binds each grant lease", () => {
  const planned = planWriterGrants({
    activeWriters: [activeWriter()],
    queuedRequests: [
      {
        request_id: "queued:sales",
        turn_id: "turn:queued:sales",
        paths: ["web/src/erp/pages/V1SalesOrdersPage.jsx"],
      },
      {
        request_id: "queued:permission",
        turn_id: "turn:queued:permission",
        paths: ["web/src/erp/pages/PermissionCenterPage.jsx"],
      },
    ],
    createLeaseId,
  });

  assert.deepEqual(planned.granted, [
    {
      request_id: "queued:permission",
      grant_turn_id: "turn:queued:permission",
      lease_id: "lease:queued:permission",
    },
  ]);
  assert.deepEqual(planned.waiting, [
    {
      request_id: "queued:sales",
      blockers: [
        {
          request_id: "active:sales",
          blocker_type: "active_writer",
          paths: ["web/src/erp/pages/V1SalesOrdersPage.jsx"],
        },
      ],
    },
  ]);
  assert.deepEqual(planned.expired, []);
});

test("writer planner covers directory hierarchy, globs, and declared aliases", () => {
  const planned = planWriterGrants({
    activeWriters: [
      activeWriter({
        paths: ["web/src/erp/pages"],
      }),
    ],
    queuedRequests: [
      {
        request_id: "queued:aliased-glob",
        turn_id: "turn:aliased-glob",
        paths: ["@erp/pages/**/*.jsx"],
      },
      {
        request_id: "queued:disjoint",
        turn_id: "turn:disjoint",
        paths: ["web/src/dev-workbench/**/*.jsx"],
      },
    ],
    pathAliases: { "@erp": "web/src/erp" },
    createLeaseId,
  });

  assert.equal(planned.waiting[0].request_id, "queued:aliased-glob");
  assert.deepEqual(planned.waiting[0].blockers[0].paths, [
    "web/src/erp/pages/**/*.jsx",
  ]);
  assert.equal(planned.granted[0].request_id, "queued:disjoint");
});

test("writer planner conservatively blocks globs inside a path segment", () => {
  const planned = planWriterGrants({
    activeWriters: [activeWriter()],
    queuedRequests: [
      {
        request_id: "queued:segment-glob",
        turn_id: "turn:segment-glob",
        paths: ["web/src/erp/pages/V1*.jsx"],
      },
    ],
    createLeaseId,
  });

  assert.equal(planned.granted.length, 0);
  assert.equal(planned.waiting[0].request_id, "queued:segment-glob");
  assert.deepEqual(planned.waiting[0].blockers[0].paths, [
    "web/src/erp/pages/V1*.jsx",
  ]);
});

test("writer planner protects resources, read hotspots, and uncommitted full-owned paths", () => {
  const planned = planWriterGrants({
    activeWriters: [
      activeWriter({
        request_id: "active:purchase-reader",
        paths: ["web/src/erp/pages/V1PurchaseOrdersPage.jsx"],
      }),
    ],
    activeResources: [
      {
        resource_id: "resource:browser",
        resource_keys: ["vite:127.0.0.1:6175"],
        read_hotspots: ["web/src/erp/pages"],
      },
    ],
    uncommittedBatches: [
      {
        batch_id: "batch:prototype-ready",
        full_owned_paths: ["docs/product/prototypes/README.md"],
      },
    ],
    queuedRequests: [
      {
        request_id: "queued:hotspot",
        turn_id: "turn:hotspot",
        paths: ["web/src/erp/pages/V1SalesOrdersPage.jsx"],
      },
      {
        request_id: "queued:port",
        turn_id: "turn:port",
        resource_keys: ["vite:127.0.0.1:6175"],
      },
      {
        request_id: "queued:owned",
        turn_id: "turn:owned",
        paths: ["docs/product/prototypes/README.md"],
      },
      {
        request_id: "queued:reader",
        turn_id: "turn:reader",
        read_hotspots: ["web/src/erp/pages/V1PurchaseOrdersPage.jsx"],
      },
      {
        request_id: "queued:free",
        turn_id: "turn:free",
        paths: ["server/internal/biz/free.go"],
      },
    ],
    createLeaseId,
  });

  assert.deepEqual(
    planned.waiting.map(({ request_id: id }) => id),
    ["queued:hotspot", "queued:port", "queued:owned", "queued:reader"],
  );
  assert.deepEqual(planned.waiting[0].blockers[0].read_hotspots, [
    "web/src/erp/pages",
  ]);
  assert.deepEqual(planned.waiting[1].blockers[0].resource_keys, [
    "vite:127.0.0.1:6175",
  ]);
  assert.deepEqual(planned.waiting[2].blockers[0].full_owned_paths, [
    "docs/product/prototypes/README.md",
  ]);
  assert.deepEqual(planned.waiting[3].blockers[0].request_read_hotspots, [
    "web/src/erp/pages/V1PurchaseOrdersPage.jsx",
  ]);
  assert.equal(planned.granted[0].request_id, "queued:free");
});

test("stale turn and replaced lease stop occupying paths automatically", () => {
  const planned = planWriterGrants({
    activeWriters: [
      activeWriter({
        current_turn_id: "turn:active:2",
      }),
      activeWriter({
        request_id: "active:purchase",
        paths: ["web/src/erp/pages/V1PurchaseOrdersPage.jsx"],
        current_lease_id: "lease:active:2",
      }),
    ],
    queuedRequests: [
      {
        request_id: "queued:sales",
        turn_id: "turn:queued:sales",
        paths: ["web/src/erp/pages/V1SalesOrdersPage.jsx"],
      },
      {
        request_id: "queued:purchase",
        turn_id: "turn:queued:purchase",
        paths: ["web/src/erp/pages/V1PurchaseOrdersPage.jsx"],
      },
    ],
    createLeaseId,
  });

  assert.deepEqual(
    planned.granted.map(({ request_id: id }) => id),
    ["queued:sales", "queued:purchase"],
  );
  assert.deepEqual(planned.expired, [
    {
      request_id: "active:sales",
      lease_id: "lease:active:1",
      reason: "grant_turn_changed",
    },
    {
      request_id: "active:purchase",
      lease_id: "lease:active:1",
      reason: "lease_replaced",
    },
  ]);
});

test("incomplete or unknown active lease evidence fails closed", () => {
  for (const overrides of [
    { current_turn_id: undefined },
    { task_state: undefined },
  ]) {
    const planned = planWriterGrants({
      activeWriters: [activeWriter(overrides)],
      queuedRequests: [
        {
          request_id: "queued:conflict",
          turn_id: "turn:queued:conflict",
          paths: ["web/src/erp/pages/V1SalesOrdersPage.jsx"],
        },
      ],
      createLeaseId,
    });

    assert.equal(planned.granted.length, 0);
    assert.equal(planned.waiting[0].request_id, "queued:conflict");
    assert.deepEqual(planned.expired, []);
  }
});

test("wait registration persists one stable resume token and reuses duplicates", () => {
  const registered = registerWait(undefined, waitInput());
  const duplicate = registerWait(registered.state, waitInput());

  assert.equal(registered.result.action, "WAIT_REGISTERED");
  assert.equal(duplicate.result.action, "WAIT_REUSED");
  assert.equal(duplicate.result.changed, false);
  assert.equal(
    Object.keys(duplicate.state.resumeTokens).length,
    1,
    "one wait must persist exactly one resume token",
  );
});

test("resume revalidation covers HEAD, index, lock, hashes, resources, and blocker", () => {
  assert.equal(
    revalidateResumeIdentity(
      expectedIdentity,
      liveIdentity(),
      "writer:active:sales",
    ).ok,
    true,
  );
  const drifted = revalidateResumeIdentity(
    expectedIdentity,
    liveIdentity({
      head: "head-2",
      index: "dirty",
      index_lock: "present",
      path_hashes: {
        "web/src/erp/pages/V1SalesOrdersPage.jsx": "sha-drifted",
      },
      resource_state: { "vite:127.0.0.1:6175": "busy" },
      blocker_identity: "writer:replacement:sales",
    }),
    "writer:active:sales",
  );
  assert.deepEqual(drifted.mismatches, [
    "head",
    "index",
    "index_lock",
    "path_hashes.web/src/erp/pages/V1SalesOrdersPage.jsx",
    "resource_state.vite:127.0.0.1:6175",
    "blocker_identity",
  ]);
});

test("missing host follow-up returns WAIT_HOST_WAKEUP without consuming the token", async () => {
  const registered = registerWait(undefined, waitInput());
  const result = await dispatchWaitResume({
    state: registered.state,
    resume_token: registered.result.resume_token,
    live_identity: liveIdentity(),
  });

  assert.equal(result.result.action, "WAIT_HOST_WAKEUP");
  assert.equal(result.result.reason, "host_followup_unavailable");
  assert.equal(
    result.state.resumeTokens[registered.result.resume_token].status,
    "WAITING",
  );
});

test("host follow-up must return a confirmed queued top-level turn", async () => {
  const registered = registerWait(undefined, waitInput());
  let calls = 0;
  const unconfirmed = await dispatchWaitResume({
    state: registered.state,
    resume_token: registered.result.resume_token,
    live_identity: liveIdentity(),
    host_followup: async () => {
      calls += 1;
      return { accepted: true };
    },
  });
  assert.equal(unconfirmed.result.action, "WAIT_HOST_WAKEUP");
  assert.equal(unconfirmed.result.reason, "host_followup_unconfirmed");

  const failed = await dispatchWaitResume({
    state: unconfirmed.state,
    resume_token: registered.result.resume_token,
    live_identity: liveIdentity(),
    host_followup: async () => {
      calls += 1;
      throw new Error("host unavailable");
    },
  });
  assert.equal(failed.result.action, "WAIT_HOST_WAKEUP");
  assert.equal(failed.result.reason, "host_followup_failed");
  assert.equal(calls, 2);
});

test("confirmed follow-up is dispatched once and claimed once by its queued turn", async () => {
  const registered = registerWait(undefined, waitInput());
  let calls = 0;
  const woken = await dispatchWaitResume({
    state: registered.state,
    resume_token: registered.result.resume_token,
    live_identity: liveIdentity(),
    host_followup: async ({ target_task_id: targetTaskId, message }) => {
      calls += 1;
      assert.equal(targetTaskId, "task:waiting:sales");
      assert.equal(message.event, "RESUME_FROM_WAIT");
      return {
        accepted: true,
        queued: true,
        top_level_task: true,
        target_task_id: targetTaskId,
        turn_id: "turn:resumed:1",
        receipt_id: "wake:receipt:1",
      };
    },
  });
  const duplicateDispatch = await dispatchWaitResume({
    state: woken.state,
    resume_token: registered.result.resume_token,
    live_identity: liveIdentity(),
    host_followup: async () => {
      calls += 1;
      throw new Error("must not be called twice");
    },
  });
  assert.equal(woken.result.action, "WAKE_CONFIRMED");
  assert.equal(duplicateDispatch.result.action, "WAKE_ALREADY_CONFIRMED");
  assert.equal(calls, 1);

  const claimed = claimResumeToken({
    state: woken.state,
    resume_token: registered.result.resume_token,
    target_task_id: "task:waiting:sales",
    turn_id: "turn:resumed:1",
    live_identity: liveIdentity(),
  });
  const duplicateClaim = claimResumeToken({
    state: claimed.state,
    resume_token: registered.result.resume_token,
    target_task_id: "task:waiting:sales",
    turn_id: "turn:resumed:1",
    live_identity: liveIdentity(),
  });
  assert.equal(claimed.result.action, "RESUME_FROM_WAIT");
  assert.equal(duplicateClaim.result.action, "RESUME_TOKEN_CONSUMED");
});

test("blocker recurrence prevents resume and makes the same token wait again", async () => {
  const registered = registerWait(undefined, waitInput());
  const woken = await dispatchWaitResume({
    state: registered.state,
    resume_token: registered.result.resume_token,
    live_identity: liveIdentity(),
    host_followup: async () => ({
      accepted: true,
      queued: true,
      top_level_task: true,
      target_task_id: "task:waiting:sales",
      turn_id: "turn:resumed:1",
      receipt_id: "wake:receipt:1",
    }),
  });
  const recurrent = claimResumeToken({
    state: woken.state,
    resume_token: registered.result.resume_token,
    target_task_id: "task:waiting:sales",
    turn_id: "turn:resumed:1",
    live_identity: liveIdentity({ blocker_cleared: false }),
  });
  assert.equal(recurrent.result.action, "WAIT_BLOCKER_REAPPEARED");
  assert.equal(
    recurrent.state.resumeTokens[registered.result.resume_token].status,
    "WAITING",
  );
});

test("queue adoption requires both explicit permission and the complete safe-task contract", async () => {
  const unsafe = registerWait(undefined, waitInput());
  const unsafeResult = await dispatchWaitResume({
    state: unsafe.state,
    resume_token: unsafe.result.resume_token,
    live_identity: liveIdentity(),
    allow_queue_adoption: true,
  });
  assert.equal(unsafeResult.result.action, "WAIT_HOST_WAKEUP");

  const adoptable = registerWait(
    undefined,
    waitInput({
      wait_event_id: "task:wait:adoptable",
      continuation_checkpoint: safeCheckpoint({ adoptable_by_queue: true }),
    }),
  );
  const notAllowed = await dispatchWaitResume({
    state: adoptable.state,
    resume_token: adoptable.result.resume_token,
    live_identity: liveIdentity(),
  });
  const adopted = await dispatchWaitResume({
    state: adoptable.state,
    resume_token: adoptable.result.resume_token,
    live_identity: liveIdentity(),
    allow_queue_adoption: true,
  });
  assert.equal(notAllowed.result.action, "WAIT_HOST_WAKEUP");
  assert.equal(adopted.result.action, "ADOPT_CHECKPOINT");
  assert.equal(adopted.result.event, "RESUME_ADOPTED");
});

test("WAIT to RELEASE to recalculate to wake-confirm to resume to RELEASE closes once", async () => {
  const activeRequestId = "active:writer:integration";
  const queuedRequestId = "queued:writer:integration";
  const activeGrant = {
    grant_turn_id: "turn:active:integration",
    lease_id: "lease:active:integration",
  };
  let lifecycle;
  lifecycle = applyRequestEvent(lifecycle, {
    request_id: activeRequestId,
    type: "REQUESTED",
  }).state;
  lifecycle = applyRequestEvent(lifecycle, {
    request_id: activeRequestId,
    type: "GRANTED",
    ...activeGrant,
  }).state;
  lifecycle = applyRequestEvent(lifecycle, {
    request_id: queuedRequestId,
    type: "REQUESTED",
  }).state;
  lifecycle = applyRequestEvent(lifecycle, {
    request_id: queuedRequestId,
    type: "QUEUED",
  }).state;

  const queuedRequest = {
    request_id: queuedRequestId,
    turn_id: "turn:resumed:integration",
    paths: ["web/src/erp/pages/V1SalesOrdersPage.jsx"],
  };
  const blocked = planWriterGrants({
    activeWriters: [
      activeWriter({
        request_id: activeRequestId,
        grant_turn_id: activeGrant.grant_turn_id,
        lease_id: activeGrant.lease_id,
        current_turn_id: activeGrant.grant_turn_id,
        current_lease_id: activeGrant.lease_id,
      }),
    ],
    queuedRequests: [queuedRequest],
    createLeaseId,
  });
  assert.equal(blocked.waiting.length, 1);

  const registered = registerWait(
    lifecycle,
    waitInput({
      wait_event_id: "integration:wait:1",
      target_task_id: "task:integration:waiting",
    }),
  );
  lifecycle = applyRequestEvent(registered.state, {
    request_id: activeRequestId,
    type: "RELEASED",
    ...activeGrant,
  }).state;
  const recalculated = planWriterGrants({
    queuedRequests: [queuedRequest],
    createLeaseId,
  });
  assert.equal(recalculated.waiting.length, 0);
  assert.equal(recalculated.granted.length, 1);

  const woken = await dispatchWaitResume({
    state: lifecycle,
    resume_token: registered.result.resume_token,
    live_identity: liveIdentity(),
    host_followup: async () => ({
      accepted: true,
      queued: true,
      top_level_task: true,
      target_task_id: "task:integration:waiting",
      turn_id: "turn:resumed:integration",
      receipt_id: "wake:integration:1",
    }),
  });
  const resumed = claimResumeToken({
    state: woken.state,
    resume_token: registered.result.resume_token,
    target_task_id: "task:integration:waiting",
    turn_id: "turn:resumed:integration",
    live_identity: liveIdentity(),
  });
  const plannedGrant = recalculated.granted[0];
  lifecycle = applyRequestEvent(resumed.state, {
    request_id: queuedRequestId,
    type: "GRANTED",
    grant_turn_id: plannedGrant.grant_turn_id,
    lease_id: plannedGrant.lease_id,
  }).state;
  lifecycle = applyRequestEvent(lifecycle, {
    request_id: queuedRequestId,
    type: "RELEASED",
    grant_turn_id: plannedGrant.grant_turn_id,
    lease_id: plannedGrant.lease_id,
  }).state;

  assert.equal(lifecycle.requests[activeRequestId].status, "RELEASED");
  assert.equal(lifecycle.requests[queuedRequestId].status, "RELEASED");
  assert.equal(
    lifecycle.resumeTokens[registered.result.resume_token].status,
    "CONSUMED",
  );
});
