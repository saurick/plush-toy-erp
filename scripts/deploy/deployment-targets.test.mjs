import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

import {
  DEPLOYMENT_TARGET_REGISTRY_CONTRACT,
  getDeploymentTarget,
  loadDeploymentTargetRegistry,
  validateDeploymentTargetRegistry,
} from "./deployment-targets.mjs";

test("deployment registry exposes only the isolated demo and customer-test targets", () => {
  const registry = loadDeploymentTargetRegistry();
  assert.equal(registry.schemaVersion, DEPLOYMENT_TARGET_REGISTRY_CONTRACT);
  assert.deepEqual(
    registry.targets.map((target) => target.key),
    ["demo-133", "customer-test-133"],
  );
  const demo = getDeploymentTarget("demo-133", registry);
  assert.equal(demo.purpose, "project-demo-simulated");
  assert.equal(demo.ssh.host, "192.168.0.133");
  assert.equal(demo.filesystem.root, "/home/simon/plush-toy-erp-demo-v1");
  assert.equal(demo.compose.projectName, "plush-toy-erp-demo-v1");
  assert.equal(demo.database.name, "plush_erp_demo_v1");
  assert.deepEqual(demo.runtime, {
    postgres: {
      bindAddress: "127.0.0.1",
      hostPort: 55436,
      dataDirectory: "/home/simon/plush-toy-erp-demo-v1/data/postgres",
    },
    app: { bindAddress: "127.0.0.1", hostPort: 8325 },
    web: { bindAddress: "127.0.0.1", hostPort: 5195 },
    jaeger: {
      bindAddress: "127.0.0.1",
      ports: {
        agentCompact: 61001,
        agentThriftCompact: 61002,
        agentThriftBinary: 61003,
        config: 61004,
        ui: 61005,
        collectorHttp: 61006,
        collectorGrpc: 61007,
        zipkin: 61008,
        otlpGrpc: 61009,
        otlpHttp: 61010,
      },
    },
  });
  assert.deepEqual(demo.publicEntry, {
    endpoint: "https://demo.yoyoosun.net",
    containerPrefix: "plush-toy-erp-demo-web-public-",
    network: "plush-toy-erp-demo-v1_default",
    hostPort: 5176,
    apiOrigin: "http://app-server:8300",
  });
  assert.equal(demo.capacity.minimumAvailableBytes, 30 * 1024 ** 3);

  const customerTest = getDeploymentTarget("customer-test-133", registry);
  assert.equal(customerTest.purpose, "customer-clean-acceptance");
  assert.equal(customerTest.trialTarget, "none");
  assert.equal(customerTest.filesystem.root, "/home/simon/plush-toy-erp-test-v1");
  assert.equal(customerTest.compose.projectName, "plush-toy-erp-test-v1");
  assert.equal(customerTest.database.name, "plush_erp_customer_test_v1");
  assert.equal(customerTest.runtime.postgres.hostPort, 55437);
  assert.equal(
    customerTest.runtime.postgres.dataDirectory,
    "/home/simon/plush-toy-erp-test-v1/data/postgres",
  );
  assert.equal(customerTest.runtime.app.hostPort, 8335);
  assert.equal(customerTest.runtime.web.hostPort, 5205);
  assert.equal(customerTest.publicEntry.endpoint, "https://test.yoyoosun.net");
  assert.throws(() => getDeploymentTarget("admin"), /unsupported/u);
  assert.throws(() => getDeploymentTarget("test-133"), /unsupported/u);
});

test("deployment registry refuses extra targets paths and commands", () => {
  const registry = structuredClone(loadDeploymentTargetRegistry());
  registry.targets.push({
    ...structuredClone(registry.targets[0]),
    key: "prod-133",
  });
  assert.throws(
    () => validateDeploymentTargetRegistry(registry),
    /exact supported target set/u,
  );

  const pathDrift = structuredClone(loadDeploymentTargetRegistry());
  pathDrift.targets[0].filesystem.current = "/tmp/current";
  assert.throws(
    () => validateDeploymentTargetRegistry(pathDrift),
    /fixed target root/u,
  );

  const sharedDatabase = structuredClone(loadDeploymentTargetRegistry());
  sharedDatabase.targets[1].database.name = sharedDatabase.targets[0].database.name;
  assert.throws(
    () => validateDeploymentTargetRegistry(sharedDatabase),
    /database identity is invalid|database identities must be isolated/u,
  );

  const sharedPort = structuredClone(loadDeploymentTargetRegistry());
  sharedPort.targets[1].runtime.app.hostPort =
    sharedPort.targets[0].runtime.app.hostPort;
  assert.throws(
    () => validateDeploymentTargetRegistry(sharedPort),
    /runtime identity is invalid|host ports must be isolated/u,
  );

  const command = structuredClone(loadDeploymentTargetRegistry());
  command.targets[0].command = "docker compose down";
  assert.throws(
    () => validateDeploymentTargetRegistry(command),
    /keys do not match/u,
  );
  assert.throws(() => getDeploymentTarget("prod-133"), /unsupported/u);
});

test("deployment target CLI omits SSH and filesystem internals", () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(import.meta.dirname, "deployment-targets.mjs"),
      "--target",
      "customer-test-133",
      "--json",
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.key, "customer-test-133");
  assert.equal("ssh" in body, false);
  assert.equal("filesystem" in body, false);
  assert.equal("runtime" in body, false);
  assert.deepEqual(body.publicEntry, {
    endpoint: "https://test.yoyoosun.net",
    hostPort: 5177,
  });
  assert.doesNotMatch(result.stdout, /192\.168\.0\.133|\/home\/simon/u);
});
