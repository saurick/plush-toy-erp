import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const script = path.join(import.meta.dirname, "remote-promotion.sh");
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

test("remote promotion accepts only the fixed target contract", () => {
  assert.match(source, /target=test-133/u);
  assert.match(source, /root=\/home\/simon\/plush-toy-erp-v5/u);
  assert.match(source, /project=plush-toy-erp-v5/u);
  assert.match(source, /database=plush_erp_uat_20260716_v5/u);
  assert.match(source, /minimum_available_bytes=32212254720/u);
  assert.match(
    source,
    /PROMOTE:\$target:\$release_sha:\$operation_id/u,
  );
  assert.doesNotMatch(
    source,
    /(?:--host|--path|--project|--database|--command|eval\s)/u,
  );
});

test("remote promotion builds nothing and never runs automatic down migration", () => {
  assert.doesNotMatch(
    source,
    /\b(?:docker\s+build|buildx|pnpm|npm\s+(?:install|run)|go\s+build|make\s+build|git\s+clone|git\s+checkout)\b/u,
  );
  assert.doesNotMatch(source, /atlas\s+migrate\s+down|down[_-]?migration/u);
  assert.match(source, /automaticDownMigration: false/u);
  assert.match(source, /--no-build --pull never/u);
});

test("remote promotion fixes backup migration identity and unknown-outcome behavior", () => {
  assert.match(source, /pg_dump -Fc --no-owner --no-privileges/u);
  assert.match(source, /pg_restore --exit-on-error/u);
  assert.match(source, /migrate_script" --status-only/u);
  assert.match(source, /migrate_script" --apply/u);
  assert.match(source, /migration_apply_started=1/u);
  assert.match(source, /write_receipt not_proven/u);
  assert.match(source, /unknown prior target outcome; read back before retry/u);
  assert.match(source, /flock -n 9/u);
  assert.match(source, /plush[.]remote-promotion-receipt\/v2/u);
  assert.match(source, /enter_stage package_verification/u);
  assert.match(source, /durationMs: \$durationMs/u);
  assert.match(source, /timings: \$timings/u);
  assert.match(
    source,
    /applyStarted: \(\$migrationApplyStarted == 1\)/u,
  );
});

test("remote promotion normalizes full nanoseconds to portable milliseconds", () => {
  assert.doesNotMatch(source, /date \+%s%3N/u);
  assert.equal(runEpochMillis("1786145037 839556629"), "1786145037839");
  assert.equal(runEpochMillis("1786145037 %N"), "1786145037000");
});

test("remote promotion accepts only OCI config or archive manifest image identities", () => {
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

test("remote promotion help is no-write and invalid input fails before target paths change", () => {
  const help = spawnSync("bash", [script, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /never builds source/u);
  const invalid = spawnSync(
    "bash",
    [script, "promote", "invalid", "short", "bad", "bad", "bad", "bad"],
    { encoding: "utf8" },
  );
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /invalid operation id/u);
});
