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

test("migration make targets use the guarded status, plan, and apply wrapper", async () => {
  const source = await readFile(makefileURL, "utf8");
  const status = targetBody(source, "migrate_status", "migrate_plan:");
  const plan = targetBody(source, "migrate_plan", "migrate_apply:");
  const apply = targetBody(source, "migrate_apply", ".PHONY: print_db_url");
  assert.match(status, /local-migration\.mjs status/u);
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
  assert.doesNotMatch(source, /echo\s+"using DB_URL=\$\$URL"/u);
  assert.match(
    targetBody(source, "print_db_url", ".PHONY: seed_role_demo_admins"),
    /-safe-target/u,
  );
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
