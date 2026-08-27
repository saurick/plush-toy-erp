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
  return JSON.parse(
    execFileSync(
      "go",
      [
        "run",
        "../scripts/qa/ci-workflow-yaml-check.go",
        "../.github/workflows/release.yml",
      ],
      { cwd: path.join(ROOT, "server"), encoding: "utf8" },
    ),
  );
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
const validate = workflow.jobs.validate;
const strict = workflow.jobs.strict;
const publish = workflow.jobs.publish;
const validateRuns = validate.steps.map((step) => step.run || "").join("\n");
const strictRuns = strict.steps.map((step) => step.run || "").join("\n");
const publishRuns = publish.steps.map((step) => step.run || "").join("\n");

test("release is manual, globally serialized and split by permission boundary", () => {
  assert.equal(workflow.name, "Emergency Immutable Release (GitHub)");
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs).sort(), [
    "customer",
    "sha",
    "version",
  ]);
  assert.deepEqual(workflow.permissions, { actions: "read", contents: "read" });
  assert.equal(workflow.concurrency.group, "release-catalog");
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.deepEqual(Object.keys(workflow.jobs).sort(), [
    "publish",
    "strict",
    "validate",
  ]);
  assert.equal(validate.name, "Release trust and strict terminal");
  assert.equal(strict.name, "Exact-SHA strict quality");
  assert.equal(publish.name, "Publish immutable artifact set");
  assert.deepEqual(publish.permissions, {
    actions: "read",
    contents: "write",
    packages: "write",
  });
  assert.equal(publish.environment, "release");
  assert.doesNotMatch(SOURCE, /pull_request(?:_target)?|^\s+push:/mu);
  assert.doesNotMatch(SOURCE, /self-hosted/u);
});

test("release identity is current workflow SHA and exact current main, not an ancestor", () => {
  assert.match(validateRuns, /\^\[0-9a-f\]\{40\}\$/u);
  assert.match(validateRuns, /head_sha.*REQUESTED_SHA/u);
  assert.match(validateRuns, /WORKFLOW_SHA.*REQUESTED_SHA/u);
  assert.match(validateRuns, /main_sha.*REQUESTED_SHA/u);
  assert.doesNotMatch(validateRuns, /merge-base --is-ancestor/u);
  assert.match(validateRuns, /github-release-asset-set\.mjs identity/u);
  assert.match(validateRuns, /verify-published/u);
  assert.match(
    validateRuns,
    /pnpm --dir web audit --prod --audit-level high --registry=https:\/\/registry\.npmjs\.org/u,
  );
  assert.match(validateRuns, /release_reused=true/u);
  assert.match(validateRuns, /only the fixed yoyoosun customer package/u);
});

test("release recovers only provenance-bound strict evidence before starting the heavy job", () => {
  const recoverIndex = validate.steps.findIndex((step) =>
    /provenance-bound strict/u.test(step.name),
  );
  assert.ok(recoverIndex >= 0);
  assert.match(validateRuns, /github-strict-terminal-reuse\.mjs/u);
  assert.match(strict.if, /strict_reused != 'true'/u);
  assert.match(strictRuns, /exact-sha-gate\.mjs --sha .* --run/u);
  assert.match(strictRuns, /\bmake data\b/u);
  assert.match(
    strictRuns,
    /git -C \.\. status --porcelain --untracked-files=all/u,
  );
  assert.match(SOURCE, /strict-terminal-current-\$\{\{ inputs\.sha \}\}/u);
  assert.match(SOURCE, /strict-terminal-\$\{\{ inputs\.sha \}\}/u);
  assert.match(validateRuns, /strict_artifact_digest/u);
  assert.match(validateRuns, /refresh_checks/u);
  const refresh = validate.steps.find((step) =>
    /expired vulnerability database check/u.test(step.name),
  );
  assert.match(refresh.if, /strict_reused == 'true'/u);
  assert.match(refresh.if, /vulnerabilityDatabase/u);
  assert.match(refresh.run, /--refresh-check vulnerabilityDatabase/u);
});

test("publish uses a verified resumable draft and exact six-asset set", () => {
  assert.match(publish.if, /needs\.validate\.result == 'success'/u);
  assert.match(publish.if, /needs\.strict\.result == 'success'/u);
  assert.match(publish.if, /strict_reused == 'true'/u);
  assert.match(publishRuns, /release-artifact-bundle\.mjs/u);
  assert.equal(
    (publishRuns.match(/release-artifact-bundle\.mjs/gu) || []).length,
    1,
  );
  assert.equal(
    publish.steps.filter(
      (step) =>
        step.name === "Build each runtime once and publish images by digest",
    ).length,
    1,
  );
  assert.match(publishRuns, /github-release-publisher\.mjs/u);
  assert.match(publishRuns, /github-release-asset-set\.mjs finalize/u);
  assert.match(publishRuns, /gh release create "\$release_tag"[\s\S]*--draft/u);
  assert.match(publishRuns, /wait_for_plan\(\)/u);
  assert.match(publishRuns, /for attempt in 1 2 3 4 5 6/u);
  assert.match(publishRuns, /wait_for_plan draft any/u);
  assert.match(publishRuns, /wait_for_plan draft empty/u);
  assert.match(publishRuns, /wait_for_plan published empty/u);
  assert.match(publishRuns, /gh release upload "\$release_tag"/u);
  assert.doesNotMatch(publishRuns, /--clobber/u);
  assert.match(publishRuns, /cmp --silent/u);
  assert.match(publishRuns, /download_release_assets/u);
  assert.match(
    publishRuns,
    /for asset in checksums\.sha256 release-artifact\.json release-manifest\.json sbom\.cdx\.json server-image\.tar web-image\.tar/u,
  );
  assert.match(publishRuns, /gh release edit "\$release_tag".*--draft=false/u);
  assert.match(publishRuns, /github-release-asset-set\.mjs verify-published/u);
  assert.match(publishRuns, /--dir "\$verify_dir"/u);
  for (const asset of [
    "checksums.sha256",
    "release-artifact.json",
    "release-manifest.json",
    "sbom.cdx.json",
    "server-image.tar",
    "web-image.tar",
  ]) {
    assert.match(publishRuns, new RegExp(asset.replace(".", "\\."), "u"));
  }
});

test("release pins every action and never passes a token to browser or arguments", () => {
  const uses = collectUses(workflow);
  assert.equal(
    uses.filter((value) => value.startsWith("actions/checkout@")).length,
    3,
  );
  assert.equal(
    uses.filter((value) => value.startsWith("actions/setup-node@")).length,
    3,
  );
  assert.equal(
    uses.filter((value) => value.startsWith("actions/setup-go@")).length,
    2,
  );
  assert.equal(
    uses.filter((value) => value.startsWith("ariga/setup-atlas@")).length,
    1,
  );
  assert.equal(
    uses.filter((value) => value.startsWith("actions/upload-artifact@")).length,
    2,
  );
  assert.equal(
    uses.filter((value) => value.startsWith("actions/download-artifact@"))
      .length,
    2,
  );
  assert.equal(
    uses.filter((value) => value.startsWith("actions/cache@")).length,
    5,
  );
  assert.equal(
    uses.filter((value) => value.startsWith("docker/setup-buildx-action@"))
      .length,
    1,
  );
  for (const use of uses)
    assert.match(use, /^[a-z0-9_.-]+\/[a-z0-9_.-]+@[0-9a-f]{40}$/u);
  assert.match(publishRuns, /docker login ghcr\.io .* --password-stdin/u);
  assert.match(SOURCE, /RELEASE_BUILDKIT_CACHE_MODE: gha/u);
  assert.match(SOURCE, /path: \$\{\{ runner\.temp \}\}\/pnpm-store/u);
  assert.match(SOURCE, /path: \$\{\{ runner\.temp \}\}\/ms-playwright/u);
  assert.equal(Object.hasOwn(strict.env, "PNPM_STORE_PATH"), false);
  assert.equal(Object.hasOwn(strict.env, "PLAYWRIGHT_BROWSERS_PATH"), false);
  const cacheBinding = strict.steps.find(
    (step) => step.name === "绑定 runner 本地依赖缓存路径",
  );
  assert.match(cacheBinding.run, /PNPM_STORE_PATH=\$RUNNER_TEMP\/pnpm-store/u);
  assert.match(
    cacheBinding.run,
    /PLAYWRIGHT_BROWSERS_PATH=\$RUNNER_TEMP\/ms-playwright/u,
  );
  assert.match(strictRuns, /pnpm config set store-dir "\$PNPM_STORE_PATH"/u);
  assert.match(strictRuns, /if \[\[ ! -x "\$go_bin\/govulncheck" \]\]/u);
  assert.match(publishRuns, /if \[\[ ! -f "\$archive" \]\]/u);
  assert.match(publishRuns, /if ! command -v zstd/u);
  assert.match(
    publishRuns,
    /sudo apt-get install --yes --no-install-recommends zstd/u,
  );
  assert.match(publishRuns, /zstd --version/u);
  assert.doesNotMatch(SOURCE, /echo "\$GH_TOKEN"|--token "?\$GH_TOKEN/u);
  assert.doesNotMatch(strictRuns, /GH_TOKEN|github\.token/u);
});

test("strict keeps pinned PostgreSQL, Atlas, tools and Chromium sandbox", () => {
  assert.equal(strict["runs-on"], "ubuntu-24.04");
  assert.match(SOURCE, /image: postgres:18\.1/u);
  assert.match(SOURCE, /version: v1\.2\.0/u);
  assert.match(strictRuns, /pnpm@10\.13\.1/u);
  assert.match(strictRuns, /gitleaks_8\.30\.1_linux_x64\.tar\.gz/u);
  assert.match(
    strictRuns,
    /551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb/u,
  );
  assert.match(strictRuns, /govulncheck@v1\.6\.0/u);
  assert.match(strictRuns, /shfmt@v3\.13\.1/u);
  assert.match(strictRuns, /playwright install --with-deps chromium/u);
  assert.match(strictRuns, /sudo install -o root -g root -m 4755/u);
  assert.doesNotMatch(SOURCE, /--no-sandbox|--disable-setuid-sandbox/u);
});
