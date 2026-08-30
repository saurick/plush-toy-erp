import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { getDeploymentTarget } from "./deployment-targets.mjs";
import {
  buildRemoteTargetInitializationPreflightScript,
  parseRemoteTargetInitializationPreflight,
  runTargetInitializationPreflight,
} from "./target-initialization-preflight.mjs";

function remoteReport(overrides = {}) {
  return {
    SCHEMA_VERSION: "plush.remote-target-initialization-preflight/v1",
    STATUS: "eligible",
    TARGET: "demo-133",
    HOSTNAME: "r640",
    USER: "simon",
    ROOT_STATE: "absent",
    TARGET_CONTAINER_COUNT: "0",
    TARGET_NETWORK_COUNT: "0",
    PUBLIC_CONTAINER_COUNT: "0",
    TCP_CONFLICT_COUNT: "0",
    UDP_CONFLICT_COUNT: "0",
    ROOT_AVAILABLE_BYTES: String(40 * 1024 ** 3),
    MINIMUM_AVAILABLE_BYTES: String(30 * 1024 ** 3),
    TOOLING_STATUS: "passed",
    ATLAS_STATUS: "passed",
    BASE_IMAGES_STATUS: "passed",
    BLOCKERS: "none",
    ...overrides,
  };
}

function serialize(values) {
  return `${Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")}\n`;
}

test("initialization preflight source binds only the registered target and parses as Bash", () => {
  const target = getDeploymentTarget("demo-133");
  const script = buildRemoteTargetInitializationPreflightScript(target);
  const syntax = spawnSync("bash", ["-n"], {
    input: script,
    encoding: "utf8",
  });

  assert.equal(syntax.status, 0, syntax.stderr);
  assert.match(script, /root=\/home\/simon\/plush-toy-erp-demo-v1/u);
  assert.match(script, /postgres:18\.1/u);
  assert.match(script, /jaegertracing\/all-in-one:1\.76\.0/u);
  assert.doesNotMatch(script, /admin\.yoyoosun\.net/u);
  assert.doesNotMatch(script, /__[A-Z0-9_]+__/u);
});

test("initialization preflight accepts one pristine eligible report", () => {
  const target = getDeploymentTarget("demo-133");
  const report = parseRemoteTargetInitializationPreflight(
    serialize(remoteReport()),
    target,
  );

  assert.equal(report.status, "eligible");
  assert.equal(report.rootState, "absent");
  assert.deepEqual(report.blockers, []);
  assert.equal(report.capacity.minimumAvailableBytes, 30 * 1024 ** 3);
});

test("initialization preflight rejects a contradictory eligible report", () => {
  const target = getDeploymentTarget("demo-133");
  assert.throws(
    () =>
      parseRemoteTargetInitializationPreflight(
        serialize(
          remoteReport({
            ROOT_STATE: "present",
            BLOCKERS: "initialization_root_not_absent",
          }),
        ),
        target,
      ),
    /contract is inconsistent/u,
  );
});

test("synchronous initialization preflight returns only the redacted public contract", () => {
  let invocation;
  const report = runTargetInitializationPreflight("demo-133", {
    now: "2026-08-31T00:00:00.000Z",
    runCommand(command, args, options) {
      invocation = { command, args, options };
      return { status: 0, stdout: serialize(remoteReport()), stderr: "" };
    },
  });

  assert.equal(invocation.command, "ssh");
  assert.equal(invocation.args.includes("StrictHostKeyChecking=yes"), true);
  assert.equal(report.status, "eligible");
  assert.equal(report.redaction.containsSecrets, false);
  assert.doesNotMatch(JSON.stringify(report), /192\.168\.0\.133/u);
  assert.match(invocation.options.input, /plush-toy-erp-demo-v1/u);
});
