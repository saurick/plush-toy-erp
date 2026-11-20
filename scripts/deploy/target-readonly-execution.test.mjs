import assert from "node:assert/strict";
import test from "node:test";

import { resolveTargetReadOnlyExecution } from "./target-readonly-execution.mjs";

const LOCAL_IDENTITY = {
  platform: "linux",
  hostname: "r740xd",
  username: "root",
  addresses: ["127.0.0.1", "192.168.0.133"],
};

test("registered same-host preflights run only the fixed stdin script locally", () => {
  for (const key of ["demo-133", "customer-test-133"]) {
    const execution = resolveTargetReadOnlyExecution(key, {
      localIdentity: LOCAL_IDENTITY,
    });
    assert.equal(execution.target.key, key);
    assert.equal(execution.command, "bash");
    assert.deepEqual(execution.args, ["-s"]);
  }
});

test("a different platform, host, user or address retains strict fixed SSH", () => {
  for (const mismatch of [
    { platform: "darwin" },
    { hostname: "developer-mac" },
    { username: "developer" },
    { addresses: ["127.0.0.1", "192.168.0.134"] },
  ]) {
    const execution = resolveTargetReadOnlyExecution("demo-133", {
      localIdentity: { ...LOCAL_IDENTITY, ...mismatch },
    });
    assert.equal(execution.command, "ssh");
    assert(execution.args.includes("StrictHostKeyChecking=yes"));
    assert(execution.args.includes("BatchMode=yes"));
    assert.deepEqual(execution.args.slice(-5), [
      "-p",
      "22",
      "root@192.168.0.133",
      "bash",
      "-s",
    ]);
  }
});

test("local identity does not authorize an unregistered target", () => {
  assert.throws(() =>
    resolveTargetReadOnlyExecution("unknown", {
      localIdentity: LOCAL_IDENTITY,
    }),
  );
});
