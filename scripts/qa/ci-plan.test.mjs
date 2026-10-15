import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { buildCIPlan, CI_FULL_CHANGE_PATTERNS, isDocumentationOnlyCIChange } from "./ci-plan.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");

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
  const paths = ["README.md", ".md", "dir/.md", "docs/中文 空格.md", "d", "md", "amd", ".MD", "docs/a.md/script", "server/docs/database/README.md", "unknown/file.json"];
  // Enumerate suffix boundaries rather than sampling only familiar extensions.
  let names = [""];
  for (let length = 1; length <= 5; length += 1) {
    names = names.flatMap((prefix) => [...".mdax"].map((suffix) => prefix + suffix));
    paths.push(...names.flatMap((name) => [name, `nested/${name}`]));
  }
  for (const file of paths.filter((value) => ![".", "..", "nested/.", "nested/.."].includes(value))) {
    // Node's glob hides dotfiles; Ruby/GitLab enables FNM_DOTMATCH. Prefix hidden
    // segments here without altering the extension or database-docs prefix.
    const visiblePath = file.replace(/(^|\/)\./gu, "$1x.");
    assert.equal(CI_FULL_CHANGE_PATTERNS.some((pattern) => path.matchesGlob(visiblePath, pattern)), !isDocumentationOnlyCIChange([file]), file);
  }
});

test("CI plan keeps a documentation pull request lightweight", () => {
  const plan = buildCIPlan({
    files: ["docs/product/自动化测试策略.md"],
    mode: "affected",
    root: ROOT,
  });
  assert.equal(plan.schemaVersion, "plush.ci-plan/v2");
  assert.equal(plan.effectiveMode, "affected");
  assert.deepEqual(plan.affectedScopes, ["T0", "T1"]);
  assert.equal(plan.maxAffectedScope, "T1");
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
