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

test("deployment registry exposes only the fixed test-133 target", () => {
  const registry = loadDeploymentTargetRegistry();
  assert.equal(
    registry.schemaVersion,
    DEPLOYMENT_TARGET_REGISTRY_CONTRACT,
  );
  assert.deepEqual(
    registry.targets.map((target) => target.key),
    ["test-133"],
  );
  const target = getDeploymentTarget("test-133", registry);
  assert.equal(target.ssh.host, "192.168.0.133");
  assert.equal(target.filesystem.root, "/home/simon/plush-toy-erp-v5");
  assert.equal(target.compose.projectName, "plush-toy-erp-v5");
  assert.equal(target.database.name, "plush_erp_uat_20260716_v5");
  assert.equal(target.capacity.minimumAvailableBytes, 30 * 1024 ** 3);
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
    /fixed test-133 root/u,
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
      "test-133",
      "--json",
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.key, "test-133");
  assert.equal("ssh" in body, false);
  assert.equal("filesystem" in body, false);
  assert.doesNotMatch(result.stdout, /192\.168\.0\.133|\/home\/simon/u);
});
