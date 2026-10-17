import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getDeploymentTarget } from "./deployment-targets.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const compose = path.join(root, "server/deploy/compose/prod");
const validator = path.join(compose, "validate_target_compose_override.sh");
function check(target, file) {
  const result = spawnSync("sh", [validator, target.key, target.compose.projectName, file], { encoding: "utf8" });
  assert.equal(result.stdout, "", "the shared validator must not pollute a machine receipt");
  return result;
}

test("all registered Compose overrides satisfy the shared closed contract", () => {
  for (const key of ["demo-133", "customer-test-133", "production-133"]) {
    const target = getDeploymentTarget(key);
    assert.equal(check(target, path.join(compose, target.compose.overrideFile)).status, 0, key);
  }
});

test("shared override validation rejects extra behavior and unsafe network ranges", (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "target-compose-contract-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const target = getDeploymentTarget("production-133");
  const source = readFileSync(path.join(compose, target.compose.overrideFile), "utf8");
  const file = path.join(directory, "override.yml");
  const variants = [
    source + "services:\n  app-server:\n    privileged: true\n",
    source + "    internal: false\n",
    source.replace("10.254.244.0/28", "8.8.8.0/28"),
    source.replace("10.254.244.0/28", "10.999.244.0/28"),
    source.replace("10.254.244.0/28", "10.254.244.1/28"),
    source.replace("10.254.244.0/28", "10.254.244.0/24"),
    source.replace("10.254.244.16/28", "10.254.244.0/28"),
    source.replace("plush-toy-erp-production", "wrong-project"),
    "name: plush-toy-erp-production\n",
  ];
  for (const text of variants) {
    writeFileSync(file, text);
    assert.notEqual(check(target, file).status, 0, text);
  }
  const missing = path.join(directory, "missing.yml");
  assert.notEqual(check(target, missing).status, 0);
  const link = path.join(directory, "linked.yml");
  symlinkSync(path.join(compose, target.compose.overrideFile), link);
  assert.notEqual(check(target, link).status, 0);
});

test("deployment preflight, migration and administrator bootstrap share one override validator", () => {
  for (const file of ["scripts/deploy/production-preflight.sh", "server/deploy/compose/prod/migrate_online.sh", "scripts/deploy/bootstrap-production-admin.sh"]) {
    const source = readFileSync(path.join(root, file), "utf8");
    assert.match(source, /sh "\$(?:compose_dir|SCRIPT_DIR)\/validate_target_compose_override\.sh"/u, file);
    assert.doesNotMatch(source, /(?:compose_)?override_contract=\$?['"]?\(awk/u, file);
  }
});
