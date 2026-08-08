import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../..");

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function parseWorkflow() {
  const output = execFileSync(
    "go",
    [
      "run",
      "../scripts/qa/ci-workflow-yaml-check.go",
      "../.github/workflows/ci.yml",
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

const source = read(".github/workflows/ci.yml");
const workflow = parseWorkflow();
const plan = workflow.jobs.plan;
const quality = workflow.jobs.quality;
const gate = workflow.jobs.ci_gate;
const planRuns = plan.steps.map((step) => step.run || "").join("\n");
const qualityRuns = quality.steps.map((step) => step.run || "").join("\n");

test("CI exposes one stable aggregate check over trusted plan and quality jobs", () => {
  assert.deepEqual(Object.keys(workflow.on).sort(), [
    "pull_request",
    "push",
    "workflow_dispatch",
  ]);
  assert.deepEqual(workflow.on.push, { branches: ["main"] });
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.deepEqual(Object.keys(workflow.jobs).sort(), [
    "ci_gate",
    "plan",
    "quality",
  ]);
  assert.equal(plan.name, "Trusted range and affected plan");
  assert.equal(quality.name, "Repository quality");
  assert.equal(gate.name, "CI Gate");
  assert.equal(gate.if, "always()");
  assert.deepEqual(gate.needs, ["plan", "quality"]);
  assert.match(gate.steps[0].run, /PLAN_RESULT.*QUALITY_RESULT/su);
  assert.match(gate.steps[0].run, /!= "success"/u);
  assert.doesNotMatch(source, /pull_request_target/u);
  assert.doesNotMatch(source, /^\s+paths(?:-ignore)?:/mu);
  assert.doesNotMatch(source, /continue-on-error|\|\|\s+true/u);
});

test("CI scans the trusted history before executing candidate repository scripts", () => {
  const scanIndex = plan.steps.findIndex((step) =>
    /before repository scripts/u.test(step.name),
  );
  const nodeIndex = plan.steps.findIndex((step) =>
    /after the trusted scan/u.test(step.name),
  );
  const candidateIndex = plan.steps.findIndex((step) =>
    /ci-plan\.mjs/u.test(step.run || ""),
  );
  assert.ok(
    scanIndex > 0 && scanIndex < nodeIndex && nodeIndex < candidateIndex,
  );
  assert.match(planRuns, /trusted_config_sha="\$PR_BASE_SHA"/u);
  assert.match(planRuns, /git show "\$trusted_config_sha:\.gitleaks\.toml"/u);
  assert.match(planRuns, /gitleaks_8\.30\.1_linux_x64\.tar\.gz/u);
  assert.match(
    planRuns,
    /551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb/u,
  );
  assert.match(planRuns, /sha256sum --check --strict/u);
  assert.match(planRuns, /gitleaks" git[\s\S]*--log-opts "\$history_range"/u);
  assert.match(planRuns, /git diff --check "\$range"/u);
  assert.match(planRuns, /git log --check --format= "\$history_range"/u);
});

test("CI affected/full plan controls expensive setup without silent quality skips", () => {
  assert.match(
    planRuns,
    /EVENT_NAME" == "pull_request"[\s\S]*gate_mode=affected/u,
  );
  assert.match(planRuns, /EVENT_NAME" == "push"[\s\S]*gate_mode=full/u);
  assert.match(planRuns, /REQUESTED_MODE/u);
  assert.match(planRuns, /ci-plan\.mjs/u);
  assert.match(
    quality.steps.find((step) => step.name === "Set up Go when selected").if,
    /needs_go/u,
  );
  assert.match(
    quality.steps.find(
      (step) => step.name === "Install locked Web dependencies when selected",
    ).if,
    /needs_web/u,
  );
  assert.match(
    quality.steps.find(
      (step) => step.name === "Install and verify Chromium only for full",
    ).if,
    /needs_chromium/u,
  );
  assert.match(
    quality.steps.find(
      (step) => step.name === "Start PostgreSQL only when selected",
    ).if,
    /needs_postgres/u,
  );
  assert.match(
    quality.steps.find(
      (step) => step.name === "Remove selected PostgreSQL runtime",
    ).if,
    /always\(\).*needs_postgres/u,
  );
  assert.match(qualityRuns, /affected\.sh --base "\$QA_BASE_RANGE" --run/u);
  assert.match(qualityRuns, /run-gate-with-receipt\.mjs --gate full/u);
  assert.doesNotMatch(qualityRuns, /--gate strict/u);
});

test("CI pins actions, toolchains, database and Chromium sandbox", () => {
  const uses = collectUses(workflow).sort();
  assert.deepEqual(uses, [
    "actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830",
    "actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830",
    "actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830",
    "actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830",
    "actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830",
    "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
    "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
    "actions/setup-go@b7ad1dad31e06c5925ef5d2fc7ad053ef454303e",
    "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
    "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
    "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
    "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
    "ariga/setup-atlas@2f3c785c89a15e1c0d07bcae3900fb5feb969eea",
  ]);
  for (const use of uses)
    assert.match(use, /^[a-z0-9_.-]+\/[a-z0-9_.-]+@[0-9a-f]{40}$/u);
  assert.match(source, /node-version-file: \.n-node-version/u);
  assert.match(source, /go-version-file: server\/go\.mod/u);
  assert.match(qualityRuns, /pnpm@10\.13\.1/u);
  assert.match(qualityRuns, /govulncheck@v1\.6\.0/u);
  assert.match(qualityRuns, /shfmt@v3\.13\.1/u);
  assert.match(source, /version: v0\.38\.0/u);
  assert.match(qualityRuns, /docker run --detach --rm[\s\S]*postgres:18\.1/u);
  assert.match(qualityRuns, /playwright install --with-deps chromium/u);
  assert.match(qualityRuns, /sudo install -o root -g root -m 4755/u);
  assert.match(source, /path: \$\{\{ runner\.temp \}\}\/pnpm-store/u);
  assert.match(source, /path: \$\{\{ runner\.temp \}\}\/ms-playwright/u);
  assert.match(source, /path: ~\/go\/bin/u);
  assert.equal(Object.hasOwn(quality, "env"), false);
  const cacheBinding = quality.steps.find(
    (step) => step.name === "绑定 runner 本地依赖缓存路径",
  );
  assert.match(cacheBinding.run, /PNPM_STORE_PATH=\$RUNNER_TEMP\/pnpm-store/u);
  assert.match(
    cacheBinding.run,
    /PLAYWRIGHT_BROWSERS_PATH=\$RUNNER_TEMP\/ms-playwright/u,
  );
  assert.match(qualityRuns, /pnpm config set store-dir "\$PNPM_STORE_PATH"/u);
  assert.match(qualityRuns, /if \[\[ ! -x "\$go_bin\/govulncheck" \]\]/u);
  assert.match(qualityRuns, /if \[\[ ! -f "\$archive" \]\]/u);
  assert.doesNotMatch(source, /--no-sandbox|--disable-setuid-sandbox/u);
});

test("CI proves schema generation and source archive only when selected", () => {
  const makeData = quality.steps.find((step) =>
    /Ent and Atlas generation/u.test(step.name),
  );
  const archive = quality.steps.find((step) =>
    /committed source archive/u.test(step.name),
  );
  assert.match(makeData.if, /make_data/u);
  assert.match(makeData.run, /make data/u);
  assert.match(
    makeData.run,
    /git -C \.\. status --porcelain --untracked-files=all/u,
  );
  assert.match(archive.if, /source_archive/u);
  assert.match(
    archive.run,
    /source-archive-release-check\.mjs --light --ref HEAD/u,
  );
  const disposableURL = new URL(workflow.env.DISPOSABLE_DATABASE_BASE_URL);
  assert.equal(disposableURL.hostname, "127.0.0.1");
  assert.equal(disposableURL.port, "55432");
  assert.equal(disposableURL.password, "ci-local-password");
  assert.match(qualityRuns, /--publish 55432:5432/u);
  assert.equal(Object.hasOwn(quality, "services"), false);
});
