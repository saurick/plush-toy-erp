import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../..");

test("the repository keeps GitHub as a code mirror without delivery adapters", () => {
  const workflows = path.join(ROOT, ".github", "workflows");
  assert.deepEqual(
    existsSync(workflows) ? readdirSync(workflows).sort() : [],
    [],
  );
  for (const file of [
    "scripts/deploy/github-delivery-provider.mjs",
    "scripts/deploy/github-release-asset-set.mjs",
    "scripts/deploy/github-release-publisher.mjs",
    "scripts/deploy/github-strict-terminal-reuse.mjs",
  ]) {
    assert.equal(existsSync(path.join(ROOT, file)), false, file);
  }
  const ghcrPublisher = readFileSync(
    path.join(ROOT, "scripts/deploy/ghcr-image-publisher.mjs"),
    "utf8",
  );
  assert.match(ghcrPublisher, /docker", \["push"/u);
  assert.doesNotMatch(ghcrPublisher, /gh", \["(?:release|run|workflow)"/u);
});
