import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const script = path.join(import.meta.dirname, "remote-database-rebuild.sh");
const source = readFileSync(script, "utf8");

test("remote database rebuild accepts only the two isolated registered targets", () => {
  assert.match(source, /demo-133\)/u);
  assert.match(source, /customer-test-133\)/u);
  assert.match(source, /root=\/home\/simon\/plush-toy-erp-demo-v1/u);
  assert.match(source, /root=\/home\/simon\/plush-toy-erp-test-v1/u);
  assert.match(source, /project=plush-toy-erp-demo-v1/u);
  assert.match(source, /project=plush-toy-erp-test-v1/u);
  assert.match(source, /database=plush_erp_demo_v1/u);
  assert.match(source, /database=plush_erp_customer_test_v1/u);
  assert.doesNotMatch(source, /admin-133\)|target=admin/u);
  assert.match(source, /data_dir=\$root\/data\/postgres/u);
  assert.match(source, /minimum_available_bytes=32212254720/u);
  assert.match(
    source,
    /REBUILD_DATABASE:\$target:\$release_sha:\$operation_id/u,
  );
  assert.doesNotMatch(
    source,
    /(?:--host|--path|--project|--database|--data-dir|--command|eval\s)/u,
  );
  assert.match(source, /plush[.]release-manifest\/v2/u);
  assert.match(source, /--deployment-target "\$target"/u);
});

test("remote database rebuild preserves predecessor and backup without deletion", () => {
  assert.match(source, /pg_dump -Fc --no-owner --no-privileges/u);
  assert.match(source, /pg_restore --exit-on-error/u);
  assert.match(source, /mv "\$data_dir" "\$rollback_dir"/u);
  assert.match(source, /predecessorPreserved/u);
  assert.match(source, /automaticDeletion: false/u);
  assert.doesNotMatch(source, /rm\s+-rf|docker\s+(?:volume|system)\s+prune/u);
  assert.doesNotMatch(source, /atlas\s+migrate\s+down|down[_-]?migration/u);
});

test("remote database rebuild serializes the switch and freezes unknown outcomes", () => {
  assert.match(source, /flock -n 9/u);
  assert.match(source, /migration_apply_started=1/u);
  assert.match(source, /write_receipt not_proven/u);
  assert.match(source, /unknown prior target outcome; read back before retry/u);
  assert.match(source, /failed_fresh_dir/u);
  assert.match(source, /recover_predecessor_before_migration/u);
});

test("remote database rebuild binds the frozen current Git relation before lifecycle writes", () => {
  assert.match(source, /plush[.]git-ancestry-relation\/v1/u);
  assert.match(source, /ancestry[.]relation == "current"/u);
  assert.match(source, /ancestry[.]actionClass == "current"/u);
  assert.match(
    source,
    /--arg target "\$target"[\s\S]*[.]target[.]key == \$target/u,
  );
  const runtimeCheck = source.indexOf(
    'fail "target runtime or Git ancestry changed after database rebuild qualification"',
  );
  const backupStage = source.indexOf(
    "stage=fresh_backup_and_restore_check",
    runtimeCheck,
  );
  assert.ok(runtimeCheck >= 0 && runtimeCheck < backupStage);
});

test("remote database rebuild emits an inherited subshell failure receipt once", () => {
  assert.match(
    source,
    /on_error\(\) \{[\s\S]*?trap - ERR[\s\S]*?if \[\[ -f "\$receipt" && ! -L "\$receipt" \]\]; then[\s\S]*?exit "\$exit_code"[\s\S]*?fi[\s\S]*?restore_database_cleanup/u,
  );
  const onError = source.slice(
    source.indexOf("on_error() {"),
    source.indexOf("trap on_error ERR"),
  );
  assert.equal(onError.match(/cat "\$receipt"/gu)?.length, 1);
});

test("remote database rebuild restores a stopped predecessor before the switch", () => {
  assert.match(source, /predecessor_runtime_stopped=0/u);
  assert.match(source, /restore_predecessor_runtime_before_switch\(\)/u);
  assert.match(
    source,
    /predecessor_runtime_stopped=1\n"\$\{clean_env\[@\]\}" "\$\{compose\[@\]\}" stop/u,
  );
  assert.match(
    source,
    /elif restore_predecessor_runtime_before_switch; then\n\s+write_receipt failed database_rebuild_failed_and_predecessor_runtime_restored/u,
  );
  assert.match(
    source,
    /write_receipt not_proven database_rebuild_predecessor_runtime_restore_unknown/u,
  );
  assert.match(source, /restored-predecessor-runtime-preflight-report\.txt/u);
});

test("remote database rebuild records the switch before fresh directory creation", () => {
  const move = source.indexOf('mv "$data_dir" "$rollback_dir"');
  const switched = source.indexOf("data_switch_started=1", move);
  const create = source.indexOf('mkdir -m 700 "$data_dir"', switched);
  assert.ok(move >= 0 && move < switched && switched < create);
  assert.match(
    source,
    /if \[\[ -e "\$data_dir" \]\]; then\n\s+\[\[ -d "\$data_dir" && ! -L "\$data_dir" \]\] \|\| return 1\n\s+fi/u,
  );
  assert.match(
    source,
    /if \[\[ -e "\$data_dir" \]\]; then\n\s+mv "\$data_dir" "\$failed_fresh_dir" \|\| return 1\n\s+fi\n\s+mv "\$rollback_dir" "\$data_dir"/u,
  );
  assert.match(source, /recovered-predecessor-preflight-report\.txt/u);
});

test("remote database rebuild prepares the fresh mount for the image data owner", () => {
  assert.match(
    source,
    /postgres_image_id="\$\(docker inspect --format '\{\{\.Image\}\}' "\$postgres_cid"\)"/u,
  );
  assert.match(
    source,
    /postgres_data_uid="\$\(docker exec "\$postgres_cid" id -u postgres\)"/u,
  );
  assert.match(
    source,
    /postgres_data_gid="\$\(docker exec "\$postgres_cid" id -g postgres\)"/u,
  );
  const create = source.indexOf('mkdir -m 700 "$data_dir"');
  const prepare = source.indexOf(
    'docker run --rm --pull never --network none --user 0:0',
    create,
  );
  const start = source.indexOf("stage=fresh_postgres_start", prepare);
  assert.ok(create >= 0 && create < prepare && prepare < start);
  assert.match(
    source,
    /--volume "\$data_dir:\/var\/lib\/postgresql"[\s\S]*'chown "\$1:\$2" \/var\/lib\/postgresql && chmod 700 \/var\/lib\/postgresql'[\s\S]*sh "\$postgres_data_uid" "\$postgres_data_gid"/u,
  );
  assert.doesNotMatch(source, /chown\s+(?:999|postgres):(?:999|postgres)/u);
});

test("remote database rebuild reconciles least-privilege roles before migration planning", () => {
  const physicalIdentity = source.indexOf(
    'fail "fresh PostgreSQL physical identity was not established"',
  );
  const roleStage = source.indexOf(
    "stage=database_role_reconciliation",
    physicalIdentity,
  );
  const reconcile = source.indexOf(
    "/usr/local/bin/plush-database-roles reconcile",
    roleStage,
  );
  const verify = source.indexOf(
    "/usr/local/bin/plush-database-roles verify",
    reconcile,
  );
  const migrationPlan = source.indexOf("stage=migration_plan", verify);
  assert.ok(
    physicalIdentity >= 0 &&
      physicalIdentity < roleStage &&
      roleStage < reconcile &&
      reconcile < verify &&
      verify < migrationPlan,
  );
  assert.match(
    source,
    /"\$\{clean_env\[@\]\}" "\$\{compose\[@\]\}" exec -T postgres \\\n\s+\/usr\/local\/bin\/plush-database-roles reconcile/u,
  );
  assert.match(
    source,
    /"\$\{clean_env\[@\]\}" "\$\{compose\[@\]\}" exec -T postgres \\\n\s+\/usr\/local\/bin\/plush-database-roles verify/u,
  );
});

test("remote database rebuild uses one-use bootstrap secret and exact readbacks", () => {
  assert.match(source, /bootstrap-admin\.secret/u);
  assert.match(source, /stat -c '%a' "\$secret_file"/u);
  assert.match(source, /rm -f -- "\$secret_file"/u);
  assert.match(source, /trap cleanup_bootstrap_secret EXIT/u);
  assert.ok(
    source.indexOf('rm -f -- "$secret_file"') <
      source.indexOf("stage=fresh_backup_and_restore_check"),
  );
  assert.match(source, /bootstrap-production-admin\.sh/u);
  assert.match(source, /bootstrap_completed=1/u);
  assert.match(source, /completed: \(\$bootstrapCompleted == 1\)/u);
  assert.match(source, /pg_control_system/u);
  assert.match(source, /system_identifier_after.*!=.*system_identifier_before/u);
  assert.match(source, /SELECT count\(\*\) FROM workflow_tasks/u);
  assert.doesNotMatch(source, /printf[^\n]*admin_secret|echo[^\n]*admin_secret/u);
});

test("remote database rebuild help and shell syntax are no-write", () => {
  const syntax = spawnSync("bash", ["-n", script], { encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr);
  const help = spawnSync("bash", [script, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /never deletes either generation/iu);
  const invalid = spawnSync(
    "bash",
    [
      script,
      "rebuild-database",
      "invalid",
      "short",
      "bad",
      "bad",
      "bad",
      "bad",
    ],
    { encoding: "utf8" },
  );
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /unsupported target/u);
});
