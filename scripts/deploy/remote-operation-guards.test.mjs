import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const sources = Object.fromEntries(
  ["promotion", "code-rollback", "database-rebuild"].map((operation) => [
    operation,
    readFileSync(new URL(`./remote-${operation}.sh`, import.meta.url), "utf8"),
  ]),
);

function operationFixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "plush-operation-guard-"));
  t.after(() => rmSync(directory, { recursive: true }));
  return Object.fromEntries(["state_file", "receipt", "log_file"].map((key) => [key, path.join(directory, key)]));
}

for (const [operation, source] of Object.entries(sources)) {
  test(`${operation} resumes only by returning the existing receipt`, (t) => {
    const env = operationFixture(t);
    const start = source.indexOf('if [[ -e "$receipt" || -L "$receipt" ]]; then');
    const end = source.indexOf("\nwrite_state() {", start);
    assert.ok(start >= 0 && end > start);
    const run = () => spawnSync("bash", ["-c", `set -eu
fail() { printf '%s\\n' "$*" >&2; exit 41; }
${source.slice(start, end)}
printf '%s\\n' continue
`], { encoding: "utf8", env: { ...process.env, ...env } });

    assert.equal(run().stdout.trim(), "continue");
    for (const previous of ['{"status":"running"}', '{"status":"passed"}', '{"status":']) {
      writeFileSync(env.state_file, previous);
      const blocked = run();
      assert.equal(blocked.status, 41);
      assert.equal(blocked.stdout, "");
      assert.match(blocked.stderr, /unknown prior target outcome/u);
      assert.equal(readFileSync(env.state_file, "utf8"), previous);
    }
    const receipt = '{"status":"passed"}';
    writeFileSync(env.receipt, receipt);
    const replay = run();
    assert.equal(replay.status, 0, replay.stderr);
    assert.equal(replay.stdout, receipt);
  });
}

for (const operation of ["promotion", "database-rebuild"]) {
  const source = sources[operation];
  const shellFunction = (name) => {
    const start = source.indexOf(`\n${name}() {\n`);
    const end = source.indexOf("\n}", start);
    assert.ok(start >= 0 && end > start, name);
    return source.slice(start, end + 2);
  };
  test(`${operation} stops when the operation restore database cleanup is unconfirmed`, (t) => {
    const env = operationFixture(t);
    for (const [drop, readback, calls] of [[0, 0, 2], [23, 0, 1], [0, 24, 2]]) {
      writeFileSync(env.log_file, "");
      const result = spawnSync("bash", ["-c", `set -Eeuo pipefail
restore_database_created=1
restore_database_cleanup_attempted=0
restore_database=plush_restore_synthetic
postgres_cid=synthetic-postgres
stage=fresh_backup_and_restore_check
migration_apply_started=0
env_changed=0
runtime_stop_started=0
credential_cleanup_proven=true
data_switch_started=0
predecessor_runtime_stopped=0
cleanup_transient_materialization() { :; }
cleanup_bootstrap_secret() { :; }
write_receipt() { printf '%s %s pending=%s\\n' "$1" "$2" "$restore_database_created" >"$receipt"; }
docker() {
  [[ "$2" == "$postgres_cid" && "$7" == "$restore_database" ]] || return 42
  printf '%s\\n' "exact database call" >>"$log_file"
  case "$5" in
    *dropdb*) return "$AUDIT_DROP_RC" ;;
    *pg_database*) return "$AUDIT_READBACK_RC" ;;
    *) return 42 ;;
  esac
}
${shellFunction("restore_database_cleanup")}
${shellFunction("on_error")}
${shellFunction("on_exit")}
trap on_error ERR
trap on_exit EXIT
restore_database_cleanup
printf 'continue pending=%s\\n' "$restore_database_created"
`], {
        encoding: "utf8",
        env: { ...process.env, ...env, AUDIT_DROP_RC: String(drop), AUDIT_READBACK_RC: String(readback) },
      });
      assert.equal(readFileSync(env.log_file, "utf8").match(/exact database call/gu)?.length, calls);
      if (drop || readback) {
        assert.notEqual(result.status, 0);
        assert.doesNotMatch(result.stdout, /continue/u);
        assert.match(readFileSync(env.receipt, "utf8"), /^not_proven .*restore_database_cleanup_not_proven pending=1/u);
      } else {
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout.trim(), "continue pending=0");
      }
    }
  });
}
