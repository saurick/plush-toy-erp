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

test("remote promotion accepts only the registered demo and customer-test contracts", () => {
  assert.match(source, /demo-133\)/u);
  assert.match(source, /customer-test-133\)/u);
  assert.match(source, /root=\/home\/simon\/plush-toy-erp-demo-v1/u);
  assert.match(source, /root=\/home\/simon\/plush-toy-erp-test-v1/u);
  assert.doesNotMatch(source, /admin[.]yoyoosun[.]net|target=admin/u);
  assert.match(source, /minimum_available_bytes=32212254720/u);
  assert.match(source, /PROMOTE:\$target:\$release_sha:\$operation_id/u);
  assert.doesNotMatch(
    source,
    /(?:^|\s)--(?:host|path|project|database|command)(?:\s|=)|eval\s/mu,
  );
});

test("remote promotion builds nothing and never runs automatic down migration", () => {
  assert.doesNotMatch(
    source,
    /\b(?:docker\s+build|buildx|pnpm|npm\s+(?:install|run)|go\s+build|make\s+build|git\s+clone|git\s+checkout)\b/u,
  );
  assert.doesNotMatch(source, /atlas\s+migrate\s+down/u);
  assert.match(source, /automaticDownMigration: false/u);
  assert.match(source, /--no-build --pull never/u);
  assert.match(source, /plush[.]release-manifest\/v2/u);
  assert.match(source, /rehearsal[.]receiptSha256/u);
  assert.match(source, /release-rehearsal[.]json/u);
  assert.match(source, /releaseRehearsalSha256/u);
  assert.match(source, /release_rehearsal_sha256="[$][{]7:-[}]"/u);
  assert.match(source, /rehearsal[.]cleanup[.]residualContainers == 0/u);
  assert.match(source, /artifact[.]releaseVersion == \$release[.]version/u);
  assert.match(
    source,
    /release[.]artifact[.]sourceArchiveSha256 == \$artifact[.]sourceArchive[.]sha256/u,
  );
});

test("remote promotion normalizes the runtime identity proxy contract", () => {
  assert.match(
    source,
    /WEB_PROXY_PREFIXES=\/rpc,\/templates,\/readyz\/runtime-identity/u,
  );
  assert.match(source, /proxy_count != 1/u);
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
  assert.match(source, /plush[.]remote-promotion-receipt\/v5/u);
  assert.match(source, /credentialCleanupProven/u);
  assert.match(source, /trap on_signal HUP INT TERM/u);
  assert.match(source, /trap on_exit EXIT/u);
  assert.match(source, /enter_stage artifact_fetch/u);
  assert.match(source, /enter_stage package_verification/u);
  assert.match(source, /durationMs: \$durationMs/u);
  assert.match(source, /timings: \$timings/u);
  assert.match(source, /enter_stage public_entry_switch/u);
  assert.match(source, /PUBLIC_WEB_CUTOVER:\$public_containers:\$release_sha/u);
  assert.match(source, /public entry release identity does not match/u);
  assert.match(source, /applyStarted: \(\$migrationApplyStarted == 1\)/u);
});

test("remote promotion reports failed only after proving the previous runtime and public entry", () => {
  const recovery = source.match(
    /recover_before_migration\(\) \{[\s\S]+?\n\}/u,
  )?.[0];
  assert.ok(recovery);
  assert.match(recovery, /up -d --no-build --pull never postgres jaeger app-server web-desktop/u);
  assert.match(recovery, /\$server_endpoint\/healthz/u);
  assert.match(recovery, /\$server_endpoint\/readyz/u);
  assert.match(recovery, /\$web_endpoint\/healthz/u);
  assert.match(recovery, /recovered_server_sha/u);
  assert.match(recovery, /recovered_web_sha/u);
  assert.match(recovery, /recovered_public_sha/u);
  assert.match(recovery, /cutover-public-web[.]sh/u);
  assert.match(
    recovery,
    /up -d --no-build --pull never postgres jaeger app-server web-desktop \\\n+    >>"\$log_file" 2>&1 \|\| return 1/u,
  );
  assert.match(
    source,
    /recovery_proven" -ne 1[\s\S]+?write_receipt not_proven promotion_previous_release_recovery_not_proven/u,
  );
  assert.match(
    source,
    /recovery_required" -eq 1[\s\S]+?write_receipt failed promotion_failed_previous_release_restored/u,
  );
  assert.match(source, /runtime_stop_started=1\n"\$\{clean_env\[@\]\}"/u);
});

test("remote promotion acquires the exact formal release on R640 before package verification", () => {
  assert.match(source, /source "\$incoming\/remote-release-acquire[.]sh"/u);
  assert.match(source, /acquire_target_release/u);
  assert.match(source, /target-release-fetch[.]json/u);
  assert.match(source, /acquisitionMode/u);
  assert.match(source, /catalogAndChecksumsVerified/u);
  const trapIndex = source.indexOf("trap on_error ERR");
  const tokenRead = source.indexOf("IFS= read -r target_fetch_token || true");
  const acquireIndex = source.indexOf("acquire_target_release", tokenRead);
  assert.ok(trapIndex >= 0 && trapIndex < tokenRead && tokenRead < acquireIndex);
  assert.doesNotMatch(source, /target-release-fetch[.]secret/u);
});

test("remote promotion verifies content-addressed cache and skips only exact image load", () => {
  assert.match(source, /plush[.]target-release-cache\/v2/u);
  assert.match(source, /cache_root=\$root\/release-cache-v2/u);
  assert.match(source, /release_manifest_sha256/u);
  assert.match(source, /cache_avoided_bytes/u);
  assert.match(source, /dockerLoadSkipped: \$cacheImageHit/u);
  assert.match(source, /if \[\[ "\$cache_image_hit" != true \]\]/u);
  assert.match(source, /formal release cache identity conflicts/u);
  assert.match(source, /formal release cache inventory is invalid/u);
  assert.match(
    source,
    /stillExecuted: \["migration", "health", "ready", "public_entry"\]/u,
  );
});

test("remote promotion rechecks frozen Git ancestry and runtime before cache writes", () => {
  assert.match(source, /plush[.]git-ancestry-relation\/v1/u);
  assert.match(source, /candidate_descends_from_current/u);
  const runtimeCheck = source.indexOf(
    'fail "target runtime or Git ancestry changed after promotion qualification"',
  );
  const cacheWrite = source.indexOf('mkdir -p "$cache_root"', runtimeCheck);
  assert.ok(runtimeCheck >= 0 && runtimeCheck < cacheWrite);
});

test("remote promotion cleans only materialization created by the current operation", () => {
  assert.match(source, /cleanup_transient_materialization/u);
  assert.match(source, /cache_materializing_created=1/u);
  assert.match(source, /release_materializing_created=1/u);
  assert.match(source, /cache_root\/\.materializing-\$operation_id/u);
  assert.match(source, /releases_root\/\.materializing-\$operation_id/u);
  assert.match(source, /! -L "\$candidate"/u);
  assert.match(source, /stat -c '%u'/u);
  assert.match(source, /rm -rf -- "\$candidate"/u);
  assert.match(source, /fetch_payloads_published=0/u);
});

test("remote promotion removes the complete incoming control and payload inventory on success", () => {
  const cleanup = source.slice(source.lastIndexOf("enter_stage passed"));
  for (const name of [
    ".target-cache.json",
    "checksums.sha256",
    "promotion-manifest.json",
    "release-artifact.json",
    "release-manifest.json",
    "release-rehearsal.json",
    "remote-promotion.sh",
    "remote-release-acquire.sh",
    "sbom.cdx.json",
    "server-image.tar",
    "source.tar",
    "target-release-fetch.json",
    "transfer-checksums.sha256",
    "web-image.tar",
  ]) {
    assert.match(cleanup, new RegExp(`\\$incoming/${name.replaceAll(".", "[.]")}`, "u"), name);
  }
  assert.match(cleanup, /rmdir "\$incoming"/u);
});

test("remote promotion restores only the trusted database role script mode after safe extraction", () => {
  const extractIndex = source.indexOf("tar --extract");
  const ownershipGateIndex = source.indexOf('"$owner_uid" == "$(id -u)"');
  const chmodIndex = source.indexOf('chmod 755 "$database_roles_script"');
  const retainIndex = source.indexOf(
    'mv "$release_materializing" "$release_dir"',
  );
  assert.ok(extractIndex >= 0 && extractIndex < ownershipGateIndex);
  assert.ok(ownershipGateIndex < chmodIndex && chmodIndex < retainIndex);
  assert.match(source, /--no-same-owner --no-same-permissions/u);
  assert.match(
    source,
    /-f "\$database_roles_script" && ! -L "\$database_roles_script"/u,
  );
  assert.match(source, /"\$owner_uid" == "\$\(id -u\)"/u);
  assert.doesNotMatch(source, /chmod -R|chmod 755 "\$release_materializing"/u);
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
    [script, "promote", "demo-133", "short", "bad", "bad", "bad", "bad"],
    { encoding: "utf8" },
  );
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /invalid operation id/u);
});
