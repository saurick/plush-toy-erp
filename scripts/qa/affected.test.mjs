import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildAffectedPlan,
  collectChangedFiles,
  formatPlan,
} from "./affected.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function ids(plan) {
  return plan.commands.map((item) => item.id);
}

async function withTempGitRepo(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), "plush-affected-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    await writeFile(path.join(root, "tracked.txt"), "initial\n", "utf8");
    execFileSync("git", ["add", "tracked.txt"], { cwd: root });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Affected Test",
        "-c",
        "user.email=affected@example.invalid",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-qm",
        "initial",
      ],
      { cwd: root },
    );
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("affected: docs-only changes stay at T1", () => {
  const plan = buildAffectedPlan(["docs/product/自动化测试策略.md"], {
    root: ROOT,
  });

  assert.deepEqual(ids(plan), ["diff-check", "docs-inventory"]);
  assert.equal(plan.highestLevel, "T1");
  assert.equal(plan.requiresFull, false);
});

test("affected: a web helper with a sibling test uses the focused test", () => {
  const plan = buildAffectedPlan(["web/src/erp/utils/dateRange.mjs"], {
    root: ROOT,
  });

  assert(ids(plan).includes("web-lint"));
  assert(
    ids(plan).some((id) => id.includes("web/src/erp/utils/dateRange.test.mjs")),
  );
  assert.equal(ids(plan).includes("web-test"), false);
  assert.equal(plan.highestLevel, "T5");
});

test("affected: a page without a sibling test expands to web tests and browser follow-up", () => {
  const plan = buildAffectedPlan(["web/src/erp/pages/V1SalesOrdersPage.jsx"], {
    root: ROOT,
  });

  assert(ids(plan).includes("web-lint"));
  assert(ids(plan).includes("web-test"));
  assert(plan.followUps.some((item) => item.id === "browser-regression"));
});

test("affected: schema changes select migration guard and data tests without auto-generating files", () => {
  const plan = buildAffectedPlan(
    ["server/internal/data/model/schema/product_sku.go"],
    {
      root: ROOT,
    },
  );

  assert(ids(plan).includes("db-guard"));
  assert(ids(plan).includes("server-data"));
  assert(plan.followUps.some((item) => item.id === "schema-generation"));
  assert.equal(ids(plan).includes("full"), false);
});

test("affected: business fact repo changes include the local PostgreSQL transaction gate", () => {
  const plan = buildAffectedPlan(["server/internal/data/inventory_repo.go"], {
    root: ROOT,
  });

  assert(ids(plan).includes("server-domain"));
  assert(ids(plan).includes("critical-pg-create"));
  assert(ids(plan).includes("critical-pg-migrate"));
  assert(ids(plan).includes("critical-pg-test"));
  assert.equal(plan.highestLevel, "T7");
});

test("affected: customer config changes select the T6 boundary suite", () => {
  const plan = buildAffectedPlan(
    ["config/customers/yoyoosun/customerPackage.mjs"],
    {
      root: ROOT,
    },
  );

  assert(plan.levels.includes("T6"));
  const configCommand = plan.commands.find((item) =>
    item.args.includes("scripts/qa/customer-config-runtime-manifest.test.mjs"),
  );
  assert.equal(configCommand?.level, "T6");
});

test("affected: visible login pages still require browser regression", () => {
  const plan = buildAffectedPlan(["web/src/pages/AdminLogin/index.jsx"], {
    root: ROOT,
  });

  assert(plan.followUps.some((item) => item.id === "browser-regression"));
});

test("affected: production and outsourcing facts keep the PostgreSQL gate", () => {
  const plan = buildAffectedPlan(
    [
      "server/internal/biz/production_fact.go",
      "server/internal/data/outsourcing_fact_repo.go",
    ],
    { root: ROOT },
  );

  assert(ids(plan).includes("critical-pg-test"));
});

test("affected: explicit paths cannot escape the repository", () => {
  assert.throws(
    () => buildAffectedPlan(["../../outside.test.mjs"], { root: ROOT }),
    /path must stay inside the repository/u,
  );
  assert.throws(
    () => buildAffectedPlan(["/tmp/outside.test.mjs"], { root: ROOT }),
    /path must stay inside the repository/u,
  );
});

test("affected: deleted tests do not execute stale paths", () => {
  const webPlan = buildAffectedPlan(["web/src/erp/utils/deleted.test.mjs"], {
    root: ROOT,
  });
  const qaPlan = buildAffectedPlan(["scripts/qa/deleted.test.mjs"], {
    root: ROOT,
  });

  assert(ids(webPlan).includes("web-test"));
  assert.equal(
    ids(webPlan).some((id) => id.includes("deleted.test.mjs")),
    false,
  );
  assert.deepEqual(ids(qaPlan), ["diff-check", "full"]);
});

test("affected: default collection includes unstaged, staged, and untracked files", async () => {
  await withTempGitRepo(async (root) => {
    await writeFile(path.join(root, "tracked.txt"), "changed\n", "utf8");
    await writeFile(path.join(root, "staged.txt"), "staged\n", "utf8");
    await writeFile(path.join(root, "untracked.txt"), "untracked\n", "utf8");
    execFileSync("git", ["add", "staged.txt"], { cwd: root });

    assert.deepEqual(collectChangedFiles({ root }), [
      "staged.txt",
      "tracked.txt",
      "untracked.txt",
    ]);
    assert.deepEqual(collectChangedFiles({ root, staged: true }), [
      "staged.txt",
    ]);
  });
});

test("affected: deployment changes conservatively select full plus release follow-up", () => {
  const plan = buildAffectedPlan(["server/deploy/compose/prod/compose.yaml"], {
    root: ROOT,
  });

  assert.deepEqual(ids(plan), ["diff-check", "full"]);
  assert.equal(plan.requiresFull, true);
  assert.equal(plan.highestLevel, "T8");
  assert(plan.followUps.some((item) => item.id === "release-validation"));
});

test("affected: unknown paths fail safe to full instead of silently skipping", () => {
  const plan = buildAffectedPlan(["unknown/new-tool.txt"], { root: ROOT });

  assert.deepEqual(ids(plan), ["diff-check", "full"]);
  assert.equal(plan.requiresFull, true);
});

test("affected: full subsumes focused commands but keeps browser follow-up visible", () => {
  const plan = buildAffectedPlan(
    ["web/src/erp/pages/V1SalesOrdersPage.jsx", "scripts/lib/pnpm.sh"],
    { root: ROOT },
  );

  assert.deepEqual(ids(plan), ["diff-check", "full"]);
  assert(plan.followUps.some((item) => item.id === "browser-regression"));
});

test("affected: formatted plan states that pre-push full remains mandatory", () => {
  const output = formatPlan(
    buildAffectedPlan(["docs/product/自动化测试策略.md"], { root: ROOT }),
    {
      root: ROOT,
    },
  );

  assert.match(output, /pre-push.*scripts\/qa\/full\.sh/u);
  assert.match(output, /affected 通过不代表发布或目标环境验收完成/u);
});
