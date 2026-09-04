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

test("affected: help explains the server-CI trust boundary", () => {
  const output = execFileSync(
    process.execPath,
    [path.join(ROOT, "scripts/qa/affected.mjs"), "--help"],
    {
      cwd: ROOT,
      encoding: "utf8",
    },
  );

  assert.match(output, /origin\s+refs\/heads\/main -> refs\/heads\/main/u);
  assert.match(output, /R640 exact-SHA GitLab CI/u);
  assert.match(output, /回执只授权普通\s+非强制 push/u);
  assert.match(output, /terminal-success CI Gate/u);
  assert.doesNotMatch(output, /有 full local gate/u);
});

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

  assert.deepEqual(ids(plan), [
    "diff-check",
    "phase-labels:affected",
    "docs-inventory",
  ]);
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

test("affected: phase-label gate scans only this change set", () => {
  const plan = buildAffectedPlan(
    ["docs/product/自动化测试策略.md", "web/src/App.jsx"],
    { root: ROOT },
  );
  const phaseLabels = plan.commands.find(
    (item) => item.id === "phase-labels:affected",
  );

  assert.deepEqual(phaseLabels?.args, [
    "scripts/qa/phase-label-boundaries.mjs",
    "docs/product/自动化测试策略.md",
    "web/src/App.jsx",
  ]);
  assert.equal(
    phaseLabels?.args.includes("."),
    false,
    "affected 命名门禁不得退化为全仓扫描",
  );
});

test("affected: project skill changes run the repository skill health gate", () => {
  const plan = buildAffectedPlan(
    [".agents/skills/plush-test-governance/SKILL.md"],
    { root: ROOT },
  );

  assert.deepEqual(ids(plan), [
    "diff-check",
    "phase-labels:affected",
    "docs-inventory",
    "skill-health",
  ]);
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

test("affected: removed GitHub CI workflow runs the remaining workflow contract", () => {
  const plan = buildAffectedPlan([".github/workflows/ci.yml"], { root: ROOT });

  assert(
    plan.commands.some((item) =>
      item.args.includes("scripts/qa/release-workflow.test.mjs"),
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
    "phase-labels:affected",
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

test("affected: DEV 页面改动只选择聚焦合同与受影响桌面 smoke", () => {
  for (const [file, expectedScenario] of [
    [
      "web/src/dev-workbench/pages/DevDrillRecoveryPage.jsx",
      "dev-drill-recovery-desktop-light",
    ],
    [
      "web/scripts/style-l1/devFlowStateObservatoryScenarios.mjs",
      "dev-flow-state-observatory-desktop-light",
    ],
    [
      "web/src/dev-workbench/config/devQualityGates.mjs",
      "dev-quality-gates-desktop-light",
    ],
    [
      "web/src/dev-workbench/config/devRuntimeRecovery.mjs",
      "dev-page-database-migration-desktop-light",
    ],
    [
      "web/src/dev-workbench/pages/DevVersionCenterPage.jsx",
      "dev-version-center-tabs-pagination-desktop",
    ],
    [
      "web/src/dev-workbench/pages/DevProductCorePage.jsx",
      "dev-page-product-core-desktop-light",
    ],
  ]) {
    const plan = buildAffectedPlan([file], { root: ROOT });
    const governanceCommand = plan.commands.find((item) =>
      item.args.includes("scripts/qa/dev-page-governance.test.mjs"),
    );
    assert(
      governanceCommand,
      `${file} 必须直接执行 DEV 页面治理合同，不能只留下浏览器 follow-up`,
    );
    assert.equal(ids(plan).includes("web-test"), false, file);
    assert.equal(ids(plan).includes("full"), false, file);
    const browser = plan.followUps.find(
      (item) => item.id === "browser-regression",
    );
    assert(browser, file);
    assert.match(browser.text, /桌面/u, file);
    assert.match(browser.text, /不要求.*移动端/u, file);
    assert.match(browser.text, new RegExp(expectedScenario, "u"), file);
  }
});

test("affected: shared DEV navigation expands only to the canonical desktop scenario set", () => {
  const plan = buildAffectedPlan(
    ["web/src/dev-workbench/config/devRoutes.mjs"],
    { root: ROOT },
  );
  const browser = plan.followUps.find(
    (item) => item.id === "browser-regression",
  );

  assert(browser);
  assert.match(browser.text, /dev-page-overview-desktop-light/u);
  assert.match(browser.text, /dev-quality-gates-desktop-light/u);
  assert.match(browser.text, /dev-version-center-tabs-pagination-desktop/u);
  assert.doesNotMatch(browser.text, /mobile|dark/u);
});

test("affected: DEV server ordinary plugins stay focused while privileged bridges retain stronger follow-up", () => {
  const ordinary = buildAffectedPlan(
    ["web/dev-server/devCustomerConfigPlugin.mjs"],
    { root: ROOT },
  );
  assert(
    ordinary.commands.some((item) =>
      item.args.includes("web/dev-server/devCustomerConfigPlugin.test.mjs"),
    ),
  );
  assert(ids(ordinary).includes("node-check:web/dev-server/devCustomerConfigPlugin.mjs"));
  assert.equal(ids(ordinary).includes("full"), false);
  assert.equal(ordinary.followUps.length, 0);

  const privileged = buildAffectedPlan(
    ["web/dev-server/devDeliveryBridgePlugin.mjs"],
    { root: ROOT },
  );
  assert(
    privileged.commands.some((item) =>
      item.args.includes("web/dev-server/devDeliveryBridgePlugin.test.mjs"),
    ),
  );
  assert(
    privileged.commands.some((item) =>
      item.args.includes("web/dev-server/devServerSecurity.test.mjs"),
    ),
  );
  assert(
    privileged.followUps.some((item) => item.id === "dev-operation-boundary"),
  );
  assert.equal(ids(privileged).includes("full"), false);

  const quality = buildAffectedPlan(
    ["web/dev-server/devQualityGatePlugin.mjs"],
    { root: ROOT },
  );
  assert(
    quality.commands.some((item) =>
      item.args.includes(
        "scripts/qa/dev-quality-gate-provider-boundary.test.mjs",
      ),
    ),
  );
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
  const command = plan.commands.find(
    (item) =>
      item.id.startsWith("node-tests:") &&
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
  assert.deepEqual(ids(qaPlan), [
    "diff-check",
    "phase-labels:affected",
    "full",
  ]);
});

test("affected: QA shell scripts keep syntax proof and escalate without a sibling test", () => {
  const noSibling = buildAffectedPlan(["scripts/qa/go-vet.sh"], {
    root: ROOT,
  });
  assert.deepEqual(ids(noSibling), [
    "bash-n:scripts/qa/go-vet.sh",
    "diff-check",
    "phase-labels:affected",
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

test("affected: workflow YAML parser changes rerun the emergency release contract", () => {
  const plan = buildAffectedPlan(["scripts/qa/ci-workflow-yaml-check.go"], {
    root: ROOT,
  });

  assert(
    plan.commands.some((item) =>
      item.args.includes("scripts/qa/release-workflow.test.mjs"),
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

  assert.deepEqual(ids(plan), [
    "diff-check",
    "phase-labels:affected",
    "full",
  ]);
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

  assert.deepEqual(ids(plan), [
    "diff-check",
    "phase-labels:affected",
    "full",
  ]);
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

  assert.match(output, /非 origin\/main.*affected 回执/u);
  assert.match(output, /正式 origin\/main.*server-ci.*R640 exact-SHA CI/u);
  assert.match(output, /只授权普通非强制 push/u);
  assert.match(output, /受保护部署.*CI Gate 终态成功/u);
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
  const output = formatPlan(plan, { root: ROOT });
  assert.match(output, /须逐次显式使用 --full/u);
  assert.match(output, /正式 origin\/main.*server-ci/u);
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
