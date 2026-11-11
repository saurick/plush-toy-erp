import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildCIPlan, CI_FULL_CHANGE_PATTERNS, isDocumentationOnlyCIChange } from "./ci-plan.mjs";
import { assertHistoryScanEvidence, resolveHistoryScan } from "./ci-history-scan.mjs";
import { collectGitChangedFiles } from "./lib/git-range.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");

function matchesGitLabChangePattern(file, pattern) {
  if (pattern === "server/docs/database/**/*") {
    return file.startsWith("server/docs/database/");
  }
  assert(pattern.startsWith("**/"));
  const basenamePattern = pattern.slice(3);
  const expression = basenamePattern.replaceAll("*", ".*");
  return new RegExp(`^${expression}$`, "u").test(path.posix.basename(file));
}

test("docs CI prepares locked Mermaid dependencies without database or browser tooling", () => {
  const plan = buildCIPlan({
    files: ["progress.md", "docs/customers/yoyoosun/客户交付矩阵.md", "web/README.md", "server/README.md"],
    mode: "docs", root: ROOT,
  });
  assert.equal(plan.effectiveMode, "docs");
  assert.equal(plan.flags.needsWeb, true);
  assert(Object.entries(plan.flags).every(([key, flag]) => key === "needsWeb" || flag === false));
  assert(plan.affected.commands.some((command) => command.id === "docs-inventory"));
});

test("docs CI rejects mixed, unknown, executable skill and generated-schema changes", () => {
  for (const file of ["new-tool", ".gitlab-ci.yml", "web/src/app.ts", "docs/example.json", ".agents/skills/example/script.py", "server/docs/database/README.md"]) {
    assert.throws(() => buildCIPlan({ files: ["README.md", file], mode: "docs", root: ROOT }), /docs CI cannot cover/u, file);
  }
});

test("GitLab full-path patterns match the conservative documentation classifier", () => {
  const paths = ["README.md", ".md", "dir/.md", "docs/中文 空格.md", "d", "md", "amd", ".MD", "docs/a.md/script", "server/docs/database/README.md", "server/docs/database/domains/tables.md", "unknown/file.json"];
  // Enumerate suffix boundaries rather than sampling only familiar extensions.
  let names = [""];
  for (let length = 1; length <= 5; length += 1) {
    names = names.flatMap((prefix) => [...".mdax"].map((suffix) => prefix + suffix));
    paths.push(...names.flatMap((name) => [name, `nested/${name}`]));
  }
  for (const file of paths.filter((value) => ![".", "..", "nested/.", "nested/.."].includes(value))) {
    assert.equal(CI_FULL_CHANGE_PATTERNS.some((pattern) => matchesGitLabChangePattern(file, pattern)), !isDocumentationOnlyCIChange([file]), file);
  }
});

function historyFixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-ci-plan-history-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false",
    "-c", "user.name=CI Plan Fixture", "-c", "user.email=fixture@example.invalid", ...args], {
    cwd: root, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const put = (file, contents) => writeFileSync(path.join(root, file), contents);
  const commit = (message) => {
    git("add", ".");
    git("commit", "-qm", message);
    return git("rev-parse", "HEAD");
  };
  git("init", "-qb", "main");
  put(".gitleaks.toml", "[extend]\nuseDefault = true\n");
  put(".gitleaksignore", "");
  return { root, put, git, commit };
}

test("push and manual full both cover the same history, including commits missed by an earlier job", (t) => {
  const f = historyFixture(t);
  const checkpoint = f.commit("audited checkpoint");
  f.put("sample.txt", "earlier change\n");
  const earlier = f.commit("earlier unscanned push");
  f.git("rm", "-q", "sample.txt");
  f.put(".gitleaksignore", "untrusted candidate exclusion\n");
  const gitSha = f.commit("follow-up push with changed ignore policy");
  const push = resolveHistoryScan(f.root, { gitSha, source: "push", checkpoint });
  const web = resolveHistoryScan(f.root, { gitSha, source: "web", checkpoint });
  assert.deepEqual(web, push);
  assert.equal(push.range, `${checkpoint}..${gitSha}`);
  assert(f.git("rev-list", push.range).split("\n").includes(earlier));
  assert.equal(push.policyCommit, checkpoint);
  assert.equal(push.ignoreBlob, f.git("rev-parse", `${checkpoint}:.gitleaksignore`));
  assert.notEqual(push.ignoreBlob, f.git("rev-parse", `${gitSha}:.gitleaksignore`));
  const evidence = { ...push, gitleaksVersion: "8.30.1", status: "passed" };
  assert.doesNotThrow(() => assertHistoryScanEvidence(evidence, push));
  assert.throws(() => assertHistoryScanEvidence({ ...evidence, range: `${earlier}..${gitSha}` }, push), /does not cover/u);
  assert.throws(() => assertHistoryScanEvidence({ ...evidence, ignoreBlob: f.git("rev-parse", `${gitSha}:.gitleaksignore`) }, push), /does not cover/u);
  const mr = resolveHistoryScan(f.root, { gitSha, source: "merge_request_event", mrBaseSha: earlier });
  assert.equal(mr.range, `${earlier}..${gitSha}`);
  assert.equal(mr.policyCommit, earlier);
  assert.throws(() => resolveHistoryScan(f.root, { gitSha: earlier, source: "push", checkpoint: gitSha }), /does not contain/u);
});

test("a type-only source change reaches QA selection instead of looking like a docs-only change", (t) => {
  const f = historyFixture(t);
  mkdirSync(path.join(f.root, "web/src"), { recursive: true });
  f.put("web/src/fixture.mjs", "export const value = 1;\n");
  f.put("target.txt", "a fixture\n");
  const base = f.commit("base");
  rmSync(path.join(f.root, "web/src/fixture.mjs"));
  symlinkSync("../../target.txt", path.join(f.root, "web/src/fixture.mjs"));
  f.commit("change source file type");
  assert.equal(f.git("diff", "--name-status", `${base}..HEAD`), "T\tweb/src/fixture.mjs");
  const files = collectGitChangedFiles({ root: f.root, range: `${base}..HEAD` });
  assert.deepEqual(files, ["web/src/fixture.mjs"]);
  assert.throws(() => buildCIPlan({ files, mode: "docs", root: f.root }), /docs CI cannot cover/u);
});

test("CI plan keeps documentation with workbench consumers on focused checks", () => {
  const plan = buildCIPlan({
    files: ["docs/product/自动化测试策略.md"],
    mode: "affected",
    root: ROOT,
  });
  assert.equal(plan.schemaVersion, "plush.ci-plan/v2");
  assert.equal(plan.effectiveMode, "affected");
  assert.deepEqual(plan.affectedScopes, ["T0", "T1", "T5"]);
  assert.equal(plan.maxAffectedScope, "T5");
  assert.equal(plan.localGate, "focused");
  assert.deepEqual(plan.flags, {
    full: false,
    makeData: false,
    needsAtlas: false,
    needsChromium: false,
    needsGo: false,
    needsPostgres: false,
    needsSystemTools: false,
    needsWeb: true,
    sourceArchive: false,
  });
});

test("CI plan installs only Web dependencies for focused Web changes", () => {
  const plan = buildCIPlan({
    files: ["web/src/erp/utils/dateRange.mjs"],
    mode: "affected",
    root: ROOT,
  });
  assert.equal(plan.flags.needsWeb, true);
  assert.equal(plan.flags.needsGo, false);
  assert.equal(plan.flags.needsChromium, false);
});

test("CI plan runs make data for schema changes and prepares Go and Atlas", () => {
  const plan = buildCIPlan({
    files: ["server/internal/data/model/schema/product_sku.go"],
    mode: "affected",
    root: ROOT,
  });
  assert.equal(plan.flags.makeData, true);
  assert.equal(plan.flags.needsGo, true);
  assert.equal(plan.flags.needsAtlas, true);
});

test("CI plan treats main full as the complete environment", () => {
  const plan = buildCIPlan({ files: ["README.md"], mode: "full", root: ROOT });
  assert.equal(plan.effectiveMode, "full");
  assert(Object.values(plan.flags).every(Boolean));
});

test("GitHub workflow boundary stays focused and does not require Go", () => {
  const plan = buildCIPlan({
    files: [".github/workflows/release.yml"],
    mode: "affected",
    root: ROOT,
  });
  assert.equal(plan.flags.needsGo, false);
  assert.equal(plan.flags.full, false);
});

test("CI plan keeps local full independent from the T8 release scope", () => {
  const plan = buildCIPlan({
    files: ["unknown/new-tool.txt"],
    mode: "affected",
    root: ROOT,
  });
  assert.equal(plan.effectiveMode, "full");
  assert.equal(plan.localGate, "full");
  assert.deepEqual(plan.affectedScopes, ["T0"]);
  assert.equal(plan.maxAffectedScope, "T0");
  assert.equal(plan.affected.commands.at(-1)?.scope, "LOCAL_FULL");
});
