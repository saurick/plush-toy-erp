import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const makefileURL = new URL("../../server/Makefile", import.meta.url);
const migrationScriptURL = new URL("../local-migration.mjs", import.meta.url);

function targetBody(source, target, nextTarget) {
  const start = source.indexOf(`\n${target}:\n`);
  const end = source.indexOf(`\n${nextTarget}\n`, start + 1);
  assert.ok(start >= 0 && end > start, `${target} target is missing`);
  return source.slice(start, end);
}

test("migration make targets keep the guarded low-level plan and apply wrapper", async () => {
  const source = await readFile(makefileURL, "utf8");
  const workflow = targetBody(source, "migrate", "migrate_prepare:");
  const prepare = targetBody(source, "migrate_prepare", "migrate_execute:");
  const execute = targetBody(source, "migrate_execute", "migrate_status:");
  const status = targetBody(source, "migrate_status", "migrate_plan:");
  const plan = targetBody(source, "migrate_plan", "migrate_apply:");
  const apply = targetBody(source, "migrate_apply", ".PHONY: print_db_url");
  assert.match(workflow, /local-migration-workflow\.mjs/u);
  assert.match(workflow, /LOCAL_MIGRATION_WORKFLOW_MODE=run/u);
  assert.match(prepare, /LOCAL_MIGRATION_WORKFLOW_MODE=prepare/u);
  assert.match(execute, /LOCAL_MIGRATION_WORKFLOW_MODE=execute/u);
  assert.match(execute, /MIGRATE_OPERATION_ID_FROM_COMMAND_ENV/u);
  assert.match(execute, /MIGRATE_OPERATION_CONFIRM_FROM_COMMAND_ENV/u);
  assert.match(status, /local-migration\.mjs status/u);
  assert.match(plan, /LOCAL_MIGRATION_WORKFLOW_MODE=prepare/u);
  assert.match(apply, /LOCAL_MIGRATION_WORKFLOW_MODE=resume/u);
  assert.match(plan, /local-migration\.mjs plan/u);
  assert.match(apply, /local-migration\.mjs apply/u);
  assert.match(plan, /MIGRATE_TARGET_CONFIRM_FROM_COMMAND_ENV/u);
  assert.match(apply, /MIGRATE_CONFIRM_FROM_COMMAND_ENV/u);
  assert.match(apply, /MIGRATE_MAINTENANCE_CONFIRM_FROM_COMMAND_ENV/u);
  for (const body of [plan, apply]) {
    assert.match(body, /git rev-parse --git-path plush-local-migration\.lock/u);
    assert.match(body, /lockf -t 0/u);
  }
  assert.ok(
    source.indexOf("MIGRATE_CONFIRM_FROM_COMMAND_ENV :=") <
      source.indexOf("include $(ENV_FILE)"),
    "confirmation values must be captured before .env is loaded",
  );
  assert.ok(
    source.indexOf("MIGRATE_OPERATION_CONFIRM_FROM_COMMAND_ENV :=") <
      source.indexOf("include $(ENV_FILE)"),
    "workflow confirmation must be captured before .env is loaded",
  );
  assert.doesNotMatch(source, /echo\s+"using DB_URL=\$\$URL"/u);
  assert.match(
    targetBody(source, "print_db_url", ".PHONY: seed_role_demo_admins"),
    /-safe-target/u,
  );
});

test("bare legacy plan and apply targets route into the safe high-level workflow", async () => {
  const source = await readFile(makefileURL, "utf8");
  const plan = targetBody(source, "migrate_plan", "migrate_apply:");
  const apply = targetBody(source, "migrate_apply", ".PHONY: print_db_url");
  assert.match(
    plan,
    /if \[ -z "\$\(MIGRATE_TARGET_CONFIRM_FROM_COMMAND_ENV\)" \]/u,
  );
  assert.match(plan, /LOCAL_MIGRATION_WORKFLOW_MODE=prepare/u);
  assert.match(
    apply,
    /if \[ -z "\$\(MIGRATE_CONFIRM_FROM_COMMAND_ENV\)" \] \|\| \[ -z "\$\(MIGRATE_MAINTENANCE_CONFIRM_FROM_COMMAND_ENV\)" \]/u,
  );
  assert.match(apply, /LOCAL_MIGRATION_WORKFLOW_MODE=resume/u);
  for (const body of [plan, apply]) {
    assert.match(body, /LOCAL_MIGRATION_OPERATION_ID=""/u);
    assert.match(body, /LOCAL_MIGRATION_OPERATION_CONFIRM=""/u);
    assert.ok(
      body.indexOf("local-migration-workflow.mjs") <
        body.indexOf("local-migration.mjs"),
      "the bare compatibility branch must precede the tokenized low-level branch",
    );
  }
});

test("migration makefile separates interactive run from explicit non-interactive phases", async () => {
  const source = await readFile(makefileURL, "utf8");
  const workflow = targetBody(source, "migrate", "migrate_prepare:");
  const prepare = targetBody(source, "migrate_prepare", "migrate_execute:");
  const execute = targetBody(source, "migrate_execute", "migrate_status:");
  assert.doesNotMatch(workflow, /MIGRATE_OPERATION_.*FROM_COMMAND_ENV/u);
  assert.doesNotMatch(prepare, /MIGRATE_OPERATION_.*FROM_COMMAND_ENV/u);
  assert.match(workflow, /LOCAL_MIGRATION_OPERATION_ID=""/u);
  assert.match(prepare, /LOCAL_MIGRATION_OPERATION_ID=""/u);
  assert.match(execute, /LOCAL_MIGRATION_OPERATION_ID/u);
  assert.match(execute, /LOCAL_MIGRATION_OPERATION_CONFIRM/u);
  for (const body of [workflow, prepare, execute]) {
    assert.match(body, /local-migration-workflow\.mjs/u);
    assert.doesNotMatch(body, /local-migration\.mjs (?:plan|apply)/u);
    assert.doesNotMatch(body, /MIGRATE_MAINTENANCE_CONFIRM/u);
  }
});

test("shared-development migration targets preserve terminal receipts without tracing confirmations", async () => {
  const source = await readFile(makefileURL, "utf8");
  const bodies = [
    targetBody(source, "migrate", "migrate_prepare:"),
    targetBody(source, "migrate_prepare", "migrate_execute:"),
    targetBody(source, "migrate_execute", "migrate_status:"),
    targetBody(source, "migrate_status", "migrate_plan:"),
    targetBody(source, "migrate_plan", "migrate_apply:"),
    targetBody(source, "migrate_apply", ".PHONY: print_db_url"),
  ];
  for (const body of bodies) {
    assert.doesNotMatch(body, /(?:^|\s)(?:1?>|2>|&>)\s*\/dev\/null/u);
    assert.doesNotMatch(body, /(?:^|[;&]\s*)set\s+-x\b/u);
    assert.doesNotMatch(
      body,
      /(?:echo|printf)[^\n]*(?:MIGRATE_(?:TARGET_)?CONFIRM|MIGRATE_MAINTENANCE_CONFIRM|MIGRATE_OPERATION_CONFIRM)/u,
    );
  }
});

test("migration wrapper audits, rehearses, applies one transaction, and reads status back", async () => {
  const source = await readFile(migrationScriptURL, "utf8");
  const auditIndex = source.indexOf("runExistingUpgradeAudits");
  const lifecycleIndex = source.indexOf("runLifecycleAudit");
  const rehearsalIndex = source.indexOf("runRollbackRehearsal");
  const applyIndex = source.lastIndexOf('"migrate",');
  const postStatusIndex = source.indexOf("const postStatus");
  assert.ok(auditIndex >= 0);
  assert.ok(lifecycleIndex > auditIndex);
  assert.ok(rehearsalIndex > lifecycleIndex);
  assert.ok(applyIndex > rehearsalIndex);
  assert.ok(postStatusIndex > applyIndex);
  assert.match(source, /"--tx-mode",\s*"all"/u);
  assert.match(source, /ROLLBACK/u);
  assert.match(source, /other_client_sessions/u);
  assert.match(source, /pending migration 事务回滚预演失败/u);
  assert.match(source, /apply_failed_no_revision_advance/u);
  assert.match(source, /committed_unverified/u);
  assert.match(source, /"schema",\s*"diff"/u);
  assert.match(source, /applied_verified/u);
});
