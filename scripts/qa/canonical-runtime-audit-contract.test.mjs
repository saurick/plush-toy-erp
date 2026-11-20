import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  EXPERIMENTAL_RUNTIME_RULES,
  matchingExperimentalRuleIDs,
  scanExperimentalCanonicalRuntime,
} from "./experimental/canonical-runtime-audit.mjs";
import { discoverNodeTests } from "./run-node-tests.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const auditScript = path.join(
  repoRoot,
  "scripts/qa/experimental/canonical-runtime-audit.mjs",
);

test("broad canonical matcher is explicitly experimental", () => {
  assert(
    matchingExperimentalRuleIDs(
      "const LegacyKeys = []",
      EXPERIMENTAL_RUNTIME_RULES,
    ).includes("legacy-keyword"),
  );
  assert.deepEqual(
    matchingExperimentalRuleIDs(
      "const fallback = normalizeHeader(rawHeader)",
      EXPERIMENTAL_RUNTIME_RULES,
    ),
    [],
  );
});

test("experimental audit reports broad hits without blocking", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "plush-canonical-audit-"));
  try {
    await mkdir(path.join(root, "server/internal/biz"), { recursive: true });
    await mkdir(path.join(root, "docs/architecture"), { recursive: true });
    await writeFile(
      path.join(root, "server/internal/biz/example.go"),
      "package biz\nconst LegacyStatus = \"old\"\n",
    );
    await writeFile(
      path.join(root, "docs/architecture/状态字典与生命周期索引.md"),
      "# 状态字典\n",
    );

    const hits = scanExperimentalCanonicalRuntime(root);
    assert(hits.some((hit) => hit.rule === "legacy-keyword"));

    const result = spawnSync(process.execPath, [auditScript, "--root", root], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /non_blocking=true/u);
    assert.match(result.stdout, /not product defects/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fast Node discovery excludes the experimental audit implementation", async () => {
  const tests = await discoverNodeTests(path.join(repoRoot, "scripts"));
  const relative = tests.map((file) => path.relative(repoRoot, file));
  assert(!relative.includes("scripts/qa/canonical-runtime-boundary.test.mjs"));
  assert(!relative.includes("scripts/qa/experimental/canonical-runtime-audit.mjs"));
  assert(relative.includes("scripts/qa/canonical-runtime-audit-contract.test.mjs"));
});

test("fixed gates and hooks do not invoke the broad audit as a blocker", async () => {
  const files = await Promise.all(
    [
      "scripts/qa/fast.sh",
      "scripts/qa/gate-profiles.mjs",
      "scripts/git-hooks/pre-commit.sh",
      "scripts/git-hooks/pre-push.sh",
    ].map((file) => readFile(path.join(repoRoot, file), "utf8")),
  );
  for (const source of files) {
    assert.doesNotMatch(source, /canonical-runtime-boundary/u);
    assert.doesNotMatch(
      source,
      /node\s+[^\n]*experimental\/canonical-runtime-audit\.mjs/u,
    );
  }
});
