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
  selectPrePushProfile,
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
  const docsCommand = plan.commands.find(
    (item) => item.id === "docs-inventory",
  );
  assert.deepEqual(docsCommand?.args, [
    "scripts/qa/run-test-gate.mjs",
    "--kind",
    "node",
    "--label",
    "docs-affected",
    "--",
    "node",
    "--test",
    "scripts/qa/docs-inventory.test.mjs",
    "scripts/qa/yoyoosun-role-flow-handbook.test.mjs",
  ]);
  assert.equal(plan.maxAffectedScope, "T1");
  assert.equal(plan.localGate, "focused");
});

test("affected: project skill changes run the repository skill health gate", () => {
  const plan = buildAffectedPlan(
    [".agents/skills/plush-test-governance/SKILL.md"],
    { root: ROOT },
  );

  assert.deepEqual(ids(plan), ["diff-check", "docs-inventory", "skill-health"]);
  assert.equal(plan.followUps.length, 0);
  assert.equal(plan.maxAffectedScope, "T1");
});

test("affected: customer raw-source README selects the fail-closed privacy boundary", () => {
  const plan = buildAffectedPlan(
    ["docs/customers/yoyoosun/raw-source-files/README.md"],
    { root: ROOT },
  );

  assert(ids(plan).includes("docs-inventory"));
  assert(
    plan.commands.some((item) =>
      item.args.includes(
        "scripts/qa/customer-source-repository-boundary.test.mjs",
      ),
    ),
  );
  assert.equal(plan.maxAffectedScope, "T6");
});

test("affected: non-public customer config binary selects the privacy boundary", () => {
  const plan = buildAffectedPlan(
    ["config/customers/yoyoosun/private-form.png"],
    { root: ROOT },
  );

  assert(
    plan.commands.some((item) =>
      item.args.includes(
        "scripts/qa/customer-source-repository-boundary.test.mjs",
      ),
    ),
  );
  assert(
    plan.commands.some((item) =>
      item.args.includes("scripts/qa/customer-package-lint.test.mjs"),
    ),
  );
  assert.equal(plan.maxAffectedScope, "T6");
});

test("affected: CI workflow changes run the repository CI contract", () => {
  const plan = buildAffectedPlan([".github/workflows/ci.yml"], { root: ROOT });

  assert(
    plan.commands.some((item) =>
      item.args.includes("scripts/qa/ci-workflow.test.mjs"),
    ),
  );
  assert(plan.followUps.some((item) => item.id === "remote-ci-enforcement"));
  assert.equal(plan.localGate, "focused");
});

test("affected: canonical GitLab pipeline changes run the GitLab contract", () => {
  const plan = buildAffectedPlan([".gitlab-ci.yml"], { root: ROOT });
  assert.equal(
    plan.commands.some((item) =>
      item.args.includes("scripts/qa/gitlab-ci.test.mjs"),
    ),
    true,
  );
  assert.equal(
    plan.followUps.some((item) => item.id === "remote-ci-enforcement"),
    true,
  );
});

test("affected: release workflow changes run the immutable release contract", () => {
  const plan = buildAffectedPlan([".github/workflows/release.yml"], {
    root: ROOT,
  });

  assert(
    plan.commands.some((item) =>
      item.args.includes("scripts/qa/release-workflow.test.mjs"),
    ),
  );
  assert.equal(
    plan.commands.some((item) =>
      item.args.includes("scripts/qa/ci-workflow.test.mjs"),
    ),
    false,
  );
  assert(plan.followUps.some((item) => item.id === "remote-ci-enforcement"));
  assert.equal(plan.localGate, "focused");
});

test("affected: broad canonical audit is non-blocking and explicit", () => {
  const runtimePlan = buildAffectedPlan(["server/internal/biz/workflow.go"], {
    root: ROOT,
  });
  assert(!ids(runtimePlan).includes("canonical-runtime-boundary"));

  const auditPlan = buildAffectedPlan(
    ["scripts/qa/experimental/canonical-runtime-audit.mjs"],
    { root: ROOT },
  );
  assert.deepEqual(ids(auditPlan), [
    "diff-check",
    "node-check:scripts/qa/experimental/canonical-runtime-audit.mjs",
  ]);
  assert(
    auditPlan.followUps.some(
      (item) => item.id === "experimental-canonical-audit",
    ),
  );
  assert.equal(auditPlan.localGate, "focused");
});

test("affected: a web helper with a sibling test uses the focused test", () => {
  const plan = buildAffectedPlan(["web/src/erp/utils/dateRange.mjs"], {
    root: ROOT,
  });

  assert(ids(plan).includes("web-lint"));
  assert(
    ids(plan).some((id) => id.includes("web/src/erp/utils/dateRange.test.mjs")),
  );
  const focusedCommand = plan.commands.find((item) =>
    item.id.includes("web/src/erp/utils/dateRange.test.mjs"),
  );
  assert.deepEqual(focusedCommand?.args.slice(0, 8), [
    "scripts/qa/run-test-gate.mjs",
    "--kind",
    "node",
    "--label",
    "affected-direct",
    "--",
    "node",
    "--test",
  ]);
  assert.equal(ids(plan).includes("web-test"), false);
  assert.equal(plan.maxAffectedScope, "T5");
});

test("affected: a page without a sibling test expands to web tests and browser follow-up", () => {
  const plan = buildAffectedPlan(
    ["web/src/erp/pages/V1InventoryLedgerPage.jsx"],
    {
      root: ROOT,
    },
  );

  assert(ids(plan).includes("web-lint"));
  assert(ids(plan).includes("web-test"));
  assert(plan.followUps.some((item) => item.id === "browser-regression"));
});

test("affected: DEV 菜单与页面改动强制选择页面治理合同", () => {
  for (const file of [
    "web/src/dev-workbench/config/devRoutes.mjs",
    "web/src/dev-workbench/pages/DevDrillRecoveryPage.jsx",
    "web/src/dev-workbench/styles/dev-drill-recovery.css",
    "web/scripts/style-l1/devDrillRecoveryScenarios.mjs",
  ]) {
    const plan = buildAffectedPlan([file], { root: ROOT });
    const governanceCommand = plan.commands.find((item) =>
      item.args.includes("scripts/qa/dev-page-governance.test.mjs"),
    );
    assert(
      governanceCommand,
      `${file} 必须直接执行 DEV 页面治理合同，不能只留下浏览器 follow-up`,
    );
    assert(plan.followUps.some((item) => item.id === "browser-regression"));
  }
});

test("affected: combined direct-test command keeps a bounded stable id", () => {
  const plan = buildAffectedPlan(
    [
      "web/scripts/style-l1/devFlowStateObservatoryScenarios.mjs",
      "web/scripts/style-l1/devVersionCenterScenarios.mjs",
      "web/scripts/style-l1/mobileTaskRecoveryScenarios.test.mjs",
    ],
    { root: ROOT },
  );
  const command = plan.commands.find((item) =>
    item.args.includes(
      "web/scripts/style-l1/mobileTaskRecoveryScenarios.test.mjs",
    ),
  );

  assert(command);
  assert(command.id.length <= 100);
  assert.match(command.id, /^node-tests:sha256:[a-f0-9]{24}$/u);
  assert(
    command.args.includes(
      "web/scripts/style-l1/devFlowStateObservatoryScenarios.test.mjs",
    ),
  );
  assert(
    command.args.includes(
      "web/scripts/style-l1/devVersionCenterScenarios.test.mjs",
    ),
  );
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
  assert(
    plan.commands.some((item) =>
      item.args.includes("scripts/qa/schema-docs.test.mjs"),
    ),
  );
  assert(plan.followUps.some((item) => item.id === "schema-generation"));
  assert.equal(ids(plan).includes("full"), false);
});

test("affected: generated Ent changes select DB proof and regeneration follow-up", () => {
  const plan = buildAffectedPlan(["server/internal/data/model/ent/client.go"], {
    root: ROOT,
  });

  assert(ids(plan).includes("db-guard"));
  assert(ids(plan).includes("server-data"));
  assert(
    plan.commands.some((item) =>
      item.args.includes("scripts/qa/schema-docs.test.mjs"),
    ),
  );
  assert(plan.followUps.some((item) => item.id === "schema-generation"));
});

test("affected: schema catalog and generated data dictionary run drift checks", () => {
  for (const file of [
    "server/docs/database/table-catalog.json",
    "server/docs/database/库存与质检.md",
  ]) {
    const plan = buildAffectedPlan([file], { root: ROOT });
    assert(ids(plan).includes("docs-inventory"), file);
    assert(
      plan.commands.some((item) =>
        item.args.includes("scripts/qa/schema-docs.test.mjs"),
      ),
      file,
    );
    assert.equal(plan.localGate, "focused", file);
    assert.equal(plan.maxAffectedScope, "T1", file);
  }
});

test("affected: schema-doc generator changes run server and projection tests", () => {
  const plan = buildAffectedPlan(["server/cmd/schema-doc/main.go"], {
    root: ROOT,
  });

  assert(ids(plan).includes("server-all"));
  assert(
    plan.commands.some((item) =>
      item.args.includes("scripts/qa/schema-docs.test.mjs"),
    ),
  );
  assert.equal(plan.localGate, "focused");
});

test("affected: business fact repo changes include the local PostgreSQL transaction gate", () => {
  const plan = buildAffectedPlan(["server/internal/data/inventory_repo.go"], {
    root: ROOT,
  });

  assert(ids(plan).includes("server-domain"));
  assert(ids(plan).includes("critical-pg-create"));
  assert(ids(plan).includes("critical-pg-migrate"));
  assert(ids(plan).includes("critical-pg-test"));
  assert.equal(plan.maxAffectedScope, "T7");
});

test("affected: transactional workflow and customer repositories select critical PostgreSQL", () => {
  for (const file of [
    "server/internal/data/workflow_repo.go",
    "server/internal/data/customer_config_repo.go",
    "server/internal/data/source_document_repo.go",
  ]) {
    const plan = buildAffectedPlan([file], { root: ROOT });
    assert(ids(plan).includes("critical-pg-create"), file);
    assert(ids(plan).includes("critical-pg-migrate"), file);
    assert(ids(plan).includes("critical-pg-test"), file);
  }
});

test("affected: role task quantity contract always selects PostgreSQL and browser proof", () => {
  for (const file of [
    "server/internal/service/jsonrpc_workflow_task.go",
    "web/src/erp/api/workflowApi.mjs",
    "web/scripts/style-l1/mobileTaskAssertions.mjs",
  ]) {
    const plan = buildAffectedPlan([file], { root: ROOT });
    assert(ids(plan).includes("critical-pg-create"), file);
    assert(ids(plan).includes("critical-pg-migrate"), file);
    assert(ids(plan).includes("critical-pg-test"), file);
    assert(
      plan.followUps.some((item) => item.id === "browser-regression"),
      file,
    );
    assert.equal(plan.maxAffectedScope, "T7", file);
  }
});

test("affected: customer config changes select the T6 boundary suite", () => {
  const plan = buildAffectedPlan(
    ["config/customers/yoyoosun/customerPackage.mjs"],
    {
      root: ROOT,
    },
  );

  assert(plan.affectedScopes.includes("T6"));
  const configCommand = plan.commands.find((item) =>
    item.args.includes("scripts/qa/customer-config-runtime-manifest.test.mjs"),
  );
  assert.equal(configCommand?.scope, "T6");
  assert(
    plan.commands.some((item) =>
      item.args.includes("config/customers/index.test.mjs"),
    ),
  );
  assert(
    plan.commands.some((item) =>
      item.args.includes("scripts/build/apply-customer-web-config.test.mjs"),
    ),
  );
  assert(
    plan.commands.some((item) =>
      item.args.includes(
        "scripts/qa/customer-package-preview-boundary.test.mjs",
      ),
    ),
  );
});

test("affected: private deployment template changes include isolation boundaries", () => {
  const plan = buildAffectedPlan(
    ["config/private-deployment-template/reference-customer.env.example"],
    { root: ROOT },
  );

  assert(
    plan.commands.some((item) =>
      item.args.includes("scripts/qa/private-deployment-boundaries.test.mjs"),
    ),
  );
  assert(
    plan.commands.some((item) =>
      item.args.includes(
        "scripts/qa/private-deployment-package-closure.test.mjs",
      ),
    ),
  );
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

test("affected: QA shell scripts keep syntax proof and escalate without a sibling test", () => {
  const noSibling = buildAffectedPlan(["scripts/qa/go-vet.sh"], {
    root: ROOT,
  });
  assert.deepEqual(ids(noSibling), [
    "bash-n:scripts/qa/go-vet.sh",
    "diff-check",
    "full",
  ]);
  assert.equal(noSibling.localGate, "full");

  const withSibling = buildAffectedPlan(["scripts/qa/db-guard.sh"], {
    root: ROOT,
  });
  assert(ids(withSibling).includes("bash-n:scripts/qa/db-guard.sh"));
  assert(
    withSibling.commands.some((item) =>
      item.args.includes("scripts/qa/db-guard.test.mjs"),
    ),
  );
  assert.equal(ids(withSibling).includes("full"), false);
});

test("affected: migration preflight SQL files run only their static fail-closed contract", () => {
  for (const file of [
    "scripts/qa/populated-upgrade-20260714055504.sql",
    "scripts/qa/customer-config-cutover-20260714055825.sql",
  ]) {
    const plan = buildAffectedPlan([file], { root: ROOT });
    assert.equal(plan.localGate, "focused", file);
    assert.deepEqual(ids(plan), [
      "diff-check",
      "node-tests:scripts/qa/populated-upgrade-preflight.test.mjs",
    ]);
  }
});

test("affected: populated upgrade fixture runs the static PostgreSQL gate contract", () => {
  for (const fixture of [
    "scripts/qa/fixtures/populated-upgrade-20260710150001.sql",
    "scripts/qa/fixtures/net-weight-kg-to-g-20260714165115.sql",
  ]) {
    const plan = buildAffectedPlan([fixture], { root: ROOT });
    assert.equal(plan.localGate, "focused", fixture);
    assert(
      plan.commands.some((item) =>
        item.args.includes("scripts/qa/critical-postgres-gate.test.mjs"),
      ),
      fixture,
    );
    assert.equal(ids(plan).includes("full"), false, fixture);
    assert.equal(
      ids(plan).some((id) => id.startsWith("critical-pg-")),
      false,
      fixture,
    );
  }
});

test("affected: CI YAML parser changes rerun the structural workflow contract", () => {
  const plan = buildAffectedPlan(["scripts/qa/ci-workflow-yaml-check.go"], {
    root: ROOT,
  });

  assert(
    plan.commands.some((item) =>
      item.args.includes("scripts/qa/ci-workflow.test.mjs"),
    ),
  );
  assert.equal(ids(plan).includes("full"), false);
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
  assert.equal(plan.localGate, "full");
  assert.equal(plan.maxAffectedScope, "T8");
  assert(plan.affectedScopes.includes("T8"));
  assert.equal(plan.commands.find((item) => item.id === "full")?.scope, "LOCAL_FULL");
  assert(plan.followUps.some((item) => item.id === "release-validation"));
});

test("affected: unknown paths fail safe to full instead of silently skipping", () => {
  const plan = buildAffectedPlan(["unknown/new-tool.txt"], { root: ROOT });

  assert.deepEqual(ids(plan), ["diff-check", "full"]);
  assert.equal(plan.localGate, "full");
  assert.deepEqual(plan.affectedScopes, ["T0"]);
  assert.equal(plan.maxAffectedScope, "T0");
  assert.equal(plan.commands.find((item) => item.id === "full")?.scope, "LOCAL_FULL");
});

test("affected: full subsumes focused commands but keeps browser follow-up visible", () => {
  const plan = buildAffectedPlan(
    ["web/src/erp/pages/V1SalesOrdersPage.jsx", "scripts/lib/pnpm.sh"],
    { root: ROOT },
  );

  assert.deepEqual(ids(plan), ["diff-check", "full"]);
  assert(plan.followUps.some((item) => item.id === "browser-regression"));
});

test("affected: focused plan selects an affected pre-push receipt", () => {
  const plan = buildAffectedPlan(["docs/product/自动化测试策略.md"], {
    root: ROOT,
  });
  assert.deepEqual(selectPrePushProfile(plan), {
    profile: "affected",
    recommendedProfile: "affected",
    requiresFullConfirmation: false,
    requiresManagedDatabase: false,
    reasons: [],
  });

  const output = formatPlan(
    plan,
    {
      root: ROOT,
    },
  );

  assert.match(output, /prepare-push\.sh.*affected 回执/u);
  assert.match(output, /发布候选仍显式使用 --full/u);
  assert.match(output, /不代表 strict、目标环境 migration/u);
  assert.match(output, /scopes=T0,T1 max_scope=T1 local_gate=focused/u);
});

test("affected: unresolved follow-ups require explicit full pre-push", () => {
  const plan = buildAffectedPlan(["web/src/erp/pages/V1SalesOrdersPage.jsx"], {
    root: ROOT,
  });
  const selection = selectPrePushProfile(plan);

  assert.equal(selection.profile, "full");
  assert.equal(selection.recommendedProfile, "full");
  assert.equal(selection.requiresFullConfirmation, true);
  assert.equal(selection.requiresManagedDatabase, true);
  assert(selection.reasons.includes("required_follow_up:browser-regression"));
  assert.match(formatPlan(plan, { root: ROOT }), /须逐次显式使用 --full/u);
});

test("affected: explicit full can only escalate a focused plan", () => {
  const plan = buildAffectedPlan(["docs/product/自动化测试策略.md"], {
    root: ROOT,
  });
  const selection = selectPrePushProfile(plan, { forceFull: true });

  assert.equal(selection.profile, "full");
  assert.equal(selection.recommendedProfile, "affected");
  assert.equal(selection.requiresFullConfirmation, false);
  assert.equal(selection.requiresManagedDatabase, true);
  assert(selection.reasons.includes("explicit_full"));
});
