import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = new URL("./remote-code-rollback.sh", import.meta.url);
const source = readFileSync(script, "utf8");

function runEpochMillis(dateOutput) {
  const functionSource = source.match(/epoch_millis\(\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(functionSource, "epoch_millis function is missing");
  const result = spawnSync(
    "bash",
    [
      "-c",
      `fail() { return 1; }
date() { printf '%s\\n' "$CLOCK_SAMPLE"; }
${functionSource}
epoch_millis`,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, CLOCK_SAMPLE: dateOutput },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("remote code rollback is fixed to the two registered targets and has no build or database mutation", () => {
  assert.match(source, /demo-133\)/u);
  assert.match(source, /customer-test-133\)/u);
  assert.match(source, /root=\/home\/simon\/plush-toy-erp-demo-v1/u);
  assert.match(source, /root=\/home\/simon\/plush-toy-erp-test-v1/u);
  assert.doesNotMatch(source, /admin[.]yoyoosun[.]net|target=admin/u);
  assert.match(source, /code_and_images_only/u);
  assert.match(source, /automaticDatabaseDownMigration == false/u);
  assert.match(source, /databaseRestoreAutomatic == false/u);
  assert.match(source, /--no-build --pull never/u);
  assert.match(source, /migration[.]sequenceSha256/u);
  assert.match(source, /customerConfig[.]sourceSha256/u);
  assert.match(source, /plush[.]release-manifest\/v2/u);
  assert.match(source, /releaseVersion == \$version/u);
  assert.match(source, /artifact checksum does not match the release manifest/u);
  assert.match(source, /artifact fields do not match the release manifest/u);
  assert.doesNotMatch(source, /docker (?:build|compose build)/u);
  assert.doesNotMatch(
    source,
    /\b(?:dropdb|createdb|pg_restore|atlas migrate apply)\b/u,
  );
  assert.doesNotMatch(source, /git (?:clone|pull|checkout)/u);
});

test("remote code rollback requires exact confirmation, lock and receipt", () => {
  assert.match(source, /ROLLBACK:\$target:\$from_sha:\$to_sha:\$operation_id/u);
  assert.match(source, /flock -n 9/u);
  assert.match(source, /plush[.]remote-rollback-receipt\/v3/u);
  assert.match(source, /enter_stage package_verification/u);
  assert.match(source, /durationMs: \$durationMs/u);
  assert.match(source, /timings: \$timings/u);
  assert.match(source, /enter_stage public_entry_switch/u);
  assert.match(source, /PUBLIC_WEB_CUTOVER:\$public_containers:\$to_sha/u);
  assert.match(source, /public entry rollback identity does not match/u);
  assert.match(source, /rollback has an unknown prior target outcome/u);
  assert.match(source, /not_proven rollback_outcome_unknown/u);
  assert.match(source, /recover_previous/u);
  assert.match(
    source,
    /serviceSwitchStarted: \(\$serviceSwitchStarted == 1\)/u,
  );
});

test("remote rollback normalizes the runtime identity proxy contract", () => {
  assert.match(
    source,
    /WEB_PROXY_PREFIXES=\/rpc,\/templates,\/readyz\/runtime-identity/u,
  );
  assert.match(source, /proxy_count != 1/u);
});

test("remote rollback reuses only checksum-bound retained content", () => {
  assert.match(source, /plush[.]target-release-cache\/v1/u);
  assert.match(source, /target_manifest_sha256/u);
  assert.match(source, /cache_avoided_bytes/u);
  assert.match(source, /dockerLoadSkipped: \$cacheImageHit/u);
  assert.match(source, /if \[\[ "\$cache_image_hit" != true \]\]/u);
  assert.match(source, /formal rollback cache conflicts/u);
  assert.match(
    source,
    /stillExecuted: \["migration_status", "health", "ready", "public_entry"\]/u,
  );
});

test("remote rollback rechecks frozen Git ancestry and runtime before cache writes", () => {
  assert.match(source, /plush[.]git-ancestry-relation\/v1/u);
  assert.match(source, /candidate_is_ancestor_of_current/u);
  const runtimeCheck = source.indexOf(
    'fail "current runtime SHA or Git ancestry changed after rollback qualification"',
  );
  const cacheWrite = source.indexOf('mkdir -p "$cache_root"', runtimeCheck);
  assert.ok(runtimeCheck >= 0 && runtimeCheck < cacheWrite);
});

test("remote rollback cleans only materialization created by the current operation", () => {
  assert.match(source, /cleanup_transient_materialization/u);
  assert.match(source, /cache_materializing_created=1/u);
  assert.match(source, /release_materializing_created=1/u);
  assert.match(source, /cache_root\/\.materializing-\$operation_id/u);
  assert.match(
    source,
    /releases_root\/\.materializing-rollback-\$operation_id/u,
  );
  assert.match(source, /! -L "\$candidate"/u);
  assert.match(source, /stat -c '%u'/u);
  assert.match(source, /rm -rf -- "\$candidate"/u);
});

test("remote code rollback normalizes full nanoseconds to portable milliseconds", () => {
  assert.doesNotMatch(source, /date \+%s%3N/u);
  assert.equal(runEpochMillis("1786145037 845647064"), "1786145037845");
  assert.equal(runEpochMillis("1786145037 %N"), "1786145037000");
});

test("remote code rollback accepts only OCI config or archive manifest image identities", () => {
  assert.match(source, /portable_archive_manifest_digest/u);
  assert.match(source, /manifest[.]json/u);
  assert.match(source, /index[.]json/u);
  assert.match(source, /[.]config[.]digest == \$configDigest/u);
  assert.match(
    source,
    /actual_server_content_id" == "\$server_archive_manifest_digest/u,
  );
  assert.match(
    source,
    /actual_web_content_id" == "\$web_archive_manifest_digest/u,
  );
});

test("remote code rollback script is valid Bash and exposes bounded help", () => {
  const syntax = spawnSync("bash", ["-n", script.pathname], {
    encoding: "utf8",
  });
  assert.equal(syntax.status, 0, syntax.stderr);
  const help = spawnSync("bash", [script.pathname, "--help"], {
    encoding: "utf8",
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /code and images only/u);
  assert.match(help.stdout, /never builds/u);
});
