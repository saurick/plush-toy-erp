import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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

const workflowSource = read(".github/workflows/ci.yml");
const workflow = parseWorkflow();
const strictJob = workflow.jobs?.strict;
const strictSteps = strictJob?.steps || [];
const stepRuns = strictSteps.map((step) => step.run || "").join("\n");

test("CI YAML has one protected job, read-only permissions, and exact action pins", () => {
  assert.deepEqual(Object.keys(workflow.on).sort(), [
    "pull_request",
    "push",
    "workflow_dispatch",
  ]);
  assert.deepEqual(workflow.on.push, { branches: ["main"] });
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.deepEqual(Object.keys(workflow.jobs), ["strict"]);
  assert.equal(strictJob["runs-on"], "ubuntu-24.04");
  assert.equal(strictJob["timeout-minutes"], 90);
  assert.equal(strictJob.if, undefined);
  assert.equal(strictJob.permissions, undefined);
  assert.equal(strictJob["continue-on-error"], undefined);
  for (const step of strictSteps) {
    assert.equal(step.if, undefined, `${step.name} must not conditionally skip`);
    assert.equal(step["continue-on-error"], undefined);
  }

  const expectedUses = [
    "actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0",
    "actions/setup-go@4a3601121dd01d1626a1e23e37211e3254c1c06c",
    "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
    "ariga/setup-atlas@2f3c785c89a15e1c0d07bcae3900fb5feb969eea",
  ];
  const actualUses = collectUses(workflow).sort();
  assert.deepEqual(actualUses, expectedUses);
  for (const use of actualUses) {
    assert.match(use, /^[a-z0-9_.-]+\/[a-z0-9_.-]+@[0-9a-f]{40}$/u);
  }

  assert.equal(strictSteps[0].with["fetch-depth"], 0);
  assert.equal(strictSteps[0].with["persist-credentials"], false);
  assert.doesNotMatch(workflowSource, /pull_request_target/u);
  assert.doesNotMatch(workflowSource, /^\s+paths(?:-ignore)?:/mu);
  assert.doesNotMatch(workflowSource, /continue-on-error/u);
  assert.doesNotMatch(workflowSource, /\|\|\s+true/u);
  assert.doesNotMatch(workflowSource, /\b(?:SKIP|STRICT_SKIP)_[A-Z0-9_]+/u);
});

test("CI versions and dependencies follow repository gate requirements", () => {
  const nodeVersion = read(".n-node-version").trim();
  const webPackage = JSON.parse(read("web/package.json"));
  const goToolchain = read("server/go.mod").match(/^toolchain go([^\s]+)$/mu)?.[1];

  assert.equal(nodeVersion, "24.14.0");
  assert.equal(webPackage.packageManager, "pnpm@10.13.1");
  assert.equal(goToolchain, "1.26.5");
  assert.match(workflowSource, /node-version-file: \.n-node-version/u);
  assert.match(workflowSource, /go-version-file: server\/go\.mod/u);
  assert.match(stepRuns, /pnpm@10\.13\.1/u);
  assert.match(stepRuns, /govulncheck@v1\.6\.0/u);
  assert.match(stepRuns, /gitleaks\/v8@v8\.30\.1/u);
  assert.match(stepRuns, /shfmt@v3\.13\.1/u);
  assert.match(workflowSource, /version: v0\.38\.0/u);
  assert.match(workflowSource, /image: postgres:18\.1/u);
  assert.match(stepRuns, /postgresql-client/u);
  assert.match(stepRuns, /\blsof\b/u);
  assert.match(stepRuns, /\bripgrep\b/u);
  assert.match(stepRuns, /\bshellcheck\b/u);
  assert.match(stepRuns, /\byamllint\b/u);
  assert.match(stepRuns, /playwright install --with-deps chromium/u);
  assert.match(stepRuns, /chromium\.executablePath\(\)/u);
  assert.match(stepRuns, /\[\[ ! -x "\$chrome_path" \]\]/u);
  assert.match(stepRuns, /sandbox_source="\$\(dirname "\$chrome_path"\)\/chrome_sandbox"/u);
  assert.match(stepRuns, /sandbox_path="\/usr\/local\/sbin\/chrome-devel-sandbox"/u);
  assert.match(stepRuns, /\[\[ ! -f "\$sandbox_source" \]\]/u);
  assert.match(
    stepRuns,
    /sudo install -o root -g root -m 4755 "\$sandbox_source" "\$sandbox_path"/u,
  );
  assert.match(stepRuns, /stat -c '%U:%G' "\$sandbox_path"/u);
  assert.match(stepRuns, /stat -c '%a' "\$sandbox_path"/u);
  assert.match(stepRuns, /"\$sandbox_owner" != "root:root"/u);
  assert.match(stepRuns, /"\$sandbox_mode" != "4755"/u);
  assert.match(stepRuns, /CHROME_DEVEL_SANDBOX=\$sandbox_path/u);
  assert.match(stepRuns, /ERP_PDF_CHROME_PATH=\$chrome_path/u);
  assert.match(stepRuns, /GITHUB_ENV/u);
  assert.match(stepRuns, /GITHUB_PATH/u);
  assert.doesNotMatch(workflowSource, /--no-sandbox|--disable-setuid-sandbox/u);
  assert.match(read("server/Makefile"), /^GO_BUILDER_IMAGE \?= golang:1\.26\.5$/mu);
  assert.match(read("server/Dockerfile"), /^ARG GO_BUILDER_IMAGE=golang:1\.26\.5$/mu);
});

test("CI reuses strict instead of copying local gate families", () => {
  assert.equal((stepRuns.match(/bash scripts\/qa\/strict\.sh/gu) || []).length, 1);
  assert.doesNotMatch(stepRuns, /scripts\/qa\/(?:fast|full)\.sh/u);
  assert.doesNotMatch(
    stepRuns,
    /scripts\/qa\/(?:db-guard|secrets|govulncheck|shellcheck|shfmt|yamllint)\.sh/u,
  );
  assert.doesNotMatch(stepRuns, /\bgo test\b/u);
  assert.doesNotMatch(
    stepRuns,
    /\bmake (?:build|critical_transactions_pg_test|purchase_(?:receipt|return)_[a-z_]+)\b/u,
  );
  assert.doesNotMatch(stepRuns, /\bpnpm (?:test|lint|css|build|style:l1)\b/u);

  const makeDataIndex = strictSteps.findIndex((step) => /\bmake data\b/u.test(step.run || ""));
  const strictIndex = strictSteps.findIndex((step) =>
    /bash scripts\/qa\/strict\.sh/u.test(step.run || ""),
  );
  const archiveIndex = strictSteps.findIndex((step) =>
    /source-archive-release-check\.mjs --light --ref HEAD/u.test(step.run || ""),
  );
  assert.ok(makeDataIndex >= 0 && makeDataIndex < strictIndex);
  assert.ok(strictIndex < archiveIndex);
});

test("CI comparison, schema generation, PostgreSQL, and archive evidence fail closed", () => {
  assert.match(workflowSource, /github\.event\.pull_request\.base\.sha/u);
  assert.match(workflowSource, /github\.event\.before/u);
  assert.match(stepRuns, /range="\$PUSH_BEFORE_SHA\.\.HEAD"/u);
  assert.match(stepRuns, /history_range="\$\(git merge-base "\$PR_BASE_SHA" HEAD\)\.\.HEAD"/u);
  assert.match(stepRuns, /empty_tree="\$\(git hash-object -t tree \/dev\/null\)"/u);
  assert.match(stepRuns, /range="\$empty_tree\.\.HEAD"/u);
  assert.match(stepRuns, /range="HEAD\^\.\.HEAD"/u);
  assert.match(stepRuns, /push before SHA is unavailable/u);
  assert.match(stepRuns, /git diff --check "\$range"/u);
  assert.match(stepRuns, /git log --check --format= "\$history_range"/u);
  assert.match(stepRuns, /QA_BASE_RANGE=\$range/u);

  assert.match(stepRuns, /\bmake data\b/u);
  assert.match(stepRuns, /git status --porcelain --untracked-files=all/u);
  assert.match(stepRuns, /make data changed the committed tree/u);
  const receiptURL = new URL(workflow.env.PURCHASE_RECEIPT_PG_DB_URL);
  const returnURL = new URL(workflow.env.PURCHASE_RETURN_PG_DB_URL);
  const postgres = strictJob.services.postgres;
  assert.equal(receiptURL.hostname, "127.0.0.1");
  assert.equal(returnURL.hostname, "127.0.0.1");
  assert.equal(receiptURL.port, "55432");
  assert.equal(returnURL.port, "55432");
  assert.equal(receiptURL.password, postgres.env.POSTGRES_PASSWORD);
  assert.equal(returnURL.password, postgres.env.POSTGRES_PASSWORD);
  assert.deepEqual(postgres.ports, ["55432:5432"]);
  assert.match(postgres.options, /--health-cmd "pg_isready -U postgres"/u);
  assert.match(stepRuns, /source-archive-release-check\.mjs --light --ref HEAD/u);
  assert.match(stepRuns, /strict gate changed the committed tree/u);
});
