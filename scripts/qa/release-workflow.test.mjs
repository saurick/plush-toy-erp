import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SOURCE = readFileSync(
  path.join(ROOT, ".github/workflows/release.yml"),
  "utf8",
);

function parseWorkflow() {
  const output = execFileSync(
    "go",
    [
      "run",
      "../scripts/qa/ci-workflow-yaml-check.go",
      "../.github/workflows/release.yml",
    ],
    { cwd: path.join(ROOT, "server"), encoding: "utf8" },
  );
  return JSON.parse(output);
}

function collectUses(value, uses = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectUses(item, uses);
    return uses;
  }
  if (!value || typeof value !== "object") return uses;
  for (const [key, nested] of Object.entries(value)) {
    if (key === "uses") uses.push(nested);
    collectUses(nested, uses);
  }
  return uses;
}

const workflow = parseWorkflow();
const job = workflow.jobs.release;
const steps = job.steps;
const runs = steps.map((step) => step.run || "").join("\n");

test("release workflow is manual, GitHub-hosted, exact-SHA and non-cancelling", () => {
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.deepEqual(
    Object.keys(workflow.on.workflow_dispatch.inputs).sort(),
    ["customer", "sha", "version"],
  );
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.customer, {
    description: "Product Core customer package",
    required: true,
    default: "yoyoosun",
    type: "choice",
    options: ["yoyoosun"],
  });
  assert.deepEqual(workflow.permissions, {
    actions: "read",
    contents: "write",
    packages: "write",
  });
  assert.equal(job["runs-on"], "ubuntu-24.04");
  assert.notEqual(job["runs-on"], "self-hosted");
  assert.equal(workflow.concurrency.group, "release-${{ inputs.sha }}");
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.doesNotMatch(SOURCE, /pull_request(?:_target)?|push:/u);
  assert.match(runs, /\^\[0-9a-f\]\{40\}\$/u);
  assert.match(runs, /git merge-base --is-ancestor "\$REQUESTED_SHA" origin\/main/u);
  assert.match(
    runs,
    /\[\[ "\$REQUESTED_CUSTOMER" != "yoyoosun" \]\]/u,
  );
});

test("release workflow reuses a persistent release before strict or build", () => {
  const reuseIndex = steps.findIndex((step) =>
    /reuse an existing immutable release/u.test(step.name),
  );
  const strictIndex = steps.findIndex((step) =>
    /exact-SHA strict terminal/u.test(step.name),
  );
  const buildIndex = steps.findIndex((step) =>
    /Build once, publish by digest/u.test(step.name),
  );
  assert.ok(reuseIndex >= 0 && reuseIndex < strictIndex);
  assert.ok(strictIndex < buildIndex);
  assert.match(runs, /gh release view "\$release_tag"/u);
  assert.match(runs, /release-catalog\.mjs verify/u);
  assert.match(runs, /RELEASE_REUSED=true/u);
  assert.match(runs, /strict-terminal-\$RELEASE_SHA/u);
  assert.match(runs, /exact-sha-gate\.mjs --sha "\$RELEASE_SHA".*--run/u);
  assert.match(runs, /release-artifact-bundle\.mjs/u);
  assert.match(runs, /github-release-publisher\.mjs/u);
  assert.match(runs, /gh release create "\$RELEASE_TAG"/u);
  assert.doesNotMatch(runs, /scripts\/qa\/(?:fast|full)\.sh/u);
});

test("release reuse requires every immutable recovery asset", () => {
  assert.match(
    runs,
    /gh release view "\$release_tag"[\s\S]*--json assets[\s\S]*--jq '\.assets\[\]\.name'/u,
  );
  for (const file of [
    "checksums.sha256",
    "release-artifact.json",
    "release-manifest.json",
    "sbom.cdx.json",
    "server-image.tar",
    "web-image.tar",
  ]) {
    assert.match(
      runs,
      new RegExp(
        `required_assets=[\\s\\S]*${file.replace(".", "\\.")}`,
        "u",
      ),
    );
  }
  assert.match(
    runs,
    /existing immutable release is incomplete: missing \$required_asset/u,
  );
});

test("release workflow pins actions and never sends a secret to the browser", () => {
  const uses = collectUses(workflow).sort();
  assert.deepEqual(uses, [
    "actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0",
    "actions/setup-go@4a3601121dd01d1626a1e23e37211e3254c1c06c",
    "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
    "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
    "ariga/setup-atlas@2f3c785c89a15e1c0d07bcae3900fb5feb969eea",
  ]);
  for (const use of uses) {
    assert.match(use, /^[a-z0-9_.-]+\/[a-z0-9_.-]+@[0-9a-f]{40}$/u);
  }
  assert.match(runs, /docker login ghcr\.io .* --password-stdin/u);
  assert.doesNotMatch(SOURCE, /self-hosted|pull_request_target/u);
  assert.doesNotMatch(runs, /echo "\$GH_TOKEN"/u);
});

test("release assets preserve provider-neutral recovery evidence", () => {
  for (const file of [
    "release-manifest.json",
    "release-artifact.json",
    "sbom.cdx.json",
    "checksums.sha256",
    "server-image.tar",
    "web-image.tar",
  ]) {
    assert.match(runs, new RegExp(file.replace(".", "\\."), "u"));
  }
  assert.match(runs, /target migration, role smoke and customer UAT remain separate evidence/u);
});
