import assert from "node:assert/strict";
import test from "node:test";
import { buildProbe, buildTunnel, parseArgs } from "./attachment-console.mjs";
import { getDeploymentTarget } from "./deployment-targets.mjs";

test("console accepts only registered targets and a valid local port", () => {
  assert.deepEqual(parseArgs(["--target", "demo-133"]), {
    target: "demo-133",
    port: 23646,
    help: false,
  });
  for (const args of [
    [],
    ["--target", "erp"],
    ["--target", "demo-133", "--port", "22"],
    ["--target", "demo-133", "--port", "65536"],
    ["--target", "demo-133", "--port", "23646;id"],
    ["--host", "other"],
  ]) {
    assert.throws(() => parseArgs(args));
  }
});

test("console probe uses fixed identity and never reads credentials or mutates remote services", () => {
  const probe = buildProbe(getDeploymentTarget("customer-test-133"));
  assert.match(probe, /hostname -s/u);
  assert.match(probe, /project=plush-toy-erp-test-v1/u);
  assert.match(probe, /plush-toy-erp-test-v1_attachment-private/u);
  assert.match(probe, /\[ "\$status" = 307 \]/u);
  assert.doesNotMatch(
    probe,
    /Config\.Env|\.env|docker (?:run|stop|restart|rm)|compose up|password/iu,
  );
});

test("console tunnel binds only loopback and cannot forward to arbitrary input", () => {
  const options = parseArgs(["--target", "demo-133", "--port", "23647"]);
  const args = buildTunnel(options, (command, sshArgs, params) => {
    assert.equal(command, "ssh");
    assert.ok(sshArgs.includes("StrictHostKeyChecking=yes"));
    assert.match(params.input, /project=plush-toy-erp-demo-v1/u);
    return { status: 0, stdout: "172.20.0.2\n" };
  });
  assert.ok(args.includes("127.0.0.1:23647:172.20.0.2:23646"));
  assert.ok(args.includes("ExitOnForwardFailure=yes"));
  for (const result of [
    { status: 1, stdout: "172.20.0.2" },
    { status: 0, stdout: "172.20.0.2\n172.20.0.3" },
    { status: 0, stdout: "bad;command" },
    { error: new Error("timeout") },
  ]) {
    assert.throws(() => buildTunnel(options, () => result));
  }
});
