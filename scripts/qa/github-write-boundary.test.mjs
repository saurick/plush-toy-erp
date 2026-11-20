import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { createGithubDeliveryProvider } from "../deploy/github-delivery-provider.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");

test("GitHub remains a read-only mirror without repository workflows or writer helpers", () => {
  const workflows = path.join(ROOT, ".github", "workflows");
  assert.deepEqual(
    existsSync(workflows) ? readdirSync(workflows).sort() : [],
    [],
  );
  for (const file of [
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

test("the historical GitHub reader rejects publication before invoking gh", async () => {
  let invoked = false;
  const provider = createGithubDeliveryProvider({
    projectRoot: ROOT,
    runCommand: async () => {
      invoked = true;
      return { stdout: "" };
    },
  });

  await assert.rejects(
    provider.dispatchRelease({
      gitSha: "a".repeat(40),
      version: "2026.09.25-1",
      versionReference: "2026-09-25T12:00:00+08:00",
      customer: "yoyoosun",
    }),
    /read-only provider boundary/u,
  );
  assert.equal(invoked, false);
});
