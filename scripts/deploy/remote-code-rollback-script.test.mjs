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
  assert.match(
    source,
    /artifact checksum does not match the release manifest/u,
  );
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
  assert.match(source, /plush[.]remote-rollback-receipt\/v5/u);
  assert.match(source, /credentialCleanupProven/u);
  assert.match(source, /trap on_signal HUP INT TERM/u);
  assert.match(source, /trap cleanup_transient_materialization EXIT/u);
  assert.match(source, /enter_stage artifact_fetch/u);
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

test("remote rollback acquires the exact formal release on R640 before package verification", () => {
  assert.match(source, /source "\$live_acquire_script"/u);
  assert.match(source, /acquire_target_release/u);
  assert.match(source, /target-release-fetch[.]json/u);
  assert.match(source, /acquisitionMode/u);
  assert.match(source, /catalogAndChecksumsVerified/u);
  const trapIndex = source.indexOf("trap on_error ERR");
  const tokenRead = source.indexOf("IFS= read -r target_fetch_token || true");
  const acquireIndex = source.indexOf("acquire_target_release", tokenRead);
  const artifactStage = source.indexOf("enter_stage artifact_fetch");
  const planCheck = source.indexOf("\nvalidate_bound_rollback_plan\n", artifactStage);
  const incomingOwnerGate = source.indexOf(
    'owned_private_directory "$incoming"',
    artifactStage,
  );
  const liveScriptCheck = source.indexOf(
    'cmp --silent "$incoming/remote-code-rollback.sh" "$live_rollback_script"',
    artifactStage,
  );
  assert.ok(
    trapIndex >= 0 &&
      trapIndex < artifactStage &&
      artifactStage < incomingOwnerGate &&
      incomingOwnerGate < liveScriptCheck &&
      liveScriptCheck < planCheck &&
      planCheck < tokenRead &&
      tokenRead < acquireIndex,
  );
  assert.doesNotMatch(source, /target-release-fetch[.]secret/u);
  assert.match(
    source,
    /live_rollback_script" == "\$current\/scripts\/deploy\/remote-code-rollback[.]sh/u,
  );
  assert.match(
    source,
    /live_acquire_script" == "\$current\/scripts\/deploy\/remote-release-acquire[.]sh/u,
  );
  assert.doesNotMatch(
    source,
    /\$releases_root"\/\*\/scripts\/deploy\/remote-(?:code-rollback|release-acquire)[.]sh/u,
  );
  const acquisitionSwitch = source.slice(
    source.indexOf('case "$cache_contract_mode" in'),
    source.indexOf("enter_stage package_verification"),
  );
  const legacyArm = acquisitionSwitch.slice(
    acquisitionSwitch.indexOf("legacy_v1_existing_only)"),
    acquisitionSwitch.indexOf("v2_direct)"),
  );
  assert.doesNotMatch(legacyArm, /target_fetch_token|live_acquire_script|source /u);
  assert.match(
    source,
    /"\$rollback_transport_mode" != legacy_target_cache[\s\S]+?fail "legacy rollback cache is unavailable"/u,
  );
});

test("remote rollback normalizes the runtime identity proxy contract", () => {
  assert.match(
    source,
    /WEB_PROXY_PREFIXES=\/rpc,\/templates,\/readyz\/runtime-identity/u,
  );
  assert.match(source, /proxy_count != 1/u);
});

test("remote rollback arms runtime env recovery before the atomic replacement", () => {
  const backupGate = source.indexOf(
    'owned_private_plain_file "$env_backup"',
  );
  const recoveryArmed = source.indexOf("env_changed=1", backupGate);
  const replaceEnv = source.indexOf(
    'mv -f "$env_next" "$runtime_env"',
    recoveryArmed,
  );
  assert.ok(
    backupGate >= 0 &&
      backupGate < recoveryArmed &&
      recoveryArmed < replaceEnv,
  );
});

test("remote rollback reports failed only after proving previous runtime and public recovery", () => {
  const recovery = source.match(/recover_previous\(\) \{[\s\S]+?\n\}/u)?.[0];
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
    source,
    /recovery_required" -eq 1 && "\$recovery_proven" -eq 1[\s\S]+?write_receipt failed rollback_failed_previous_release_restored/u,
  );
  assert.match(
    source,
    /recovery_required" -eq 1[\s\S]+?write_receipt not_proven rollback_previous_release_recovery_not_proven/u,
  );
  assert.match(source, /current_source_switch_started=1/u);
});

test("remote rollback reuses only checksum-bound retained content", () => {
  assert.match(source, /plush[.]target-release-cache\/v2/u);
  assert.match(source, /cache_root_v2=\$root\/release-cache-v2/u);
  assert.match(
    source,
    /legacy_cache_root=\$root\/release-cache/u,
  );
  assert.match(
    source,
    /legacy_v1_existing_only\)[\s\S]+?cache_root=\$legacy_cache_root/u,
  );
  assert.match(source, /v2_direct\)[\s\S]+?cache_root=\$cache_root_v2/u);
  assert.match(source, /target_manifest_sha256/u);
  assert.match(source, /cache_avoided_bytes/u);
  assert.match(source, /dockerLoadSkipped: \$cacheImageHit/u);
  assert.match(source, /if \[\[ "\$cache_image_hit" != true \]\]/u);
  assert.match(source, /formal rollback cache conflicts/u);
  assert.match(source, /formal rollback cache inventory is invalid/u);
  assert.match(source, /owned_private_directory\(\)/u);
  assert.match(source, /readlink -f -- "\$candidate"/u);
  assert.match(source, /8#022/u);
  assert.match(source, /ensure_owned_private_child "\$root" "\$cache_root"/u);
  assert.match(source, /owned_private_plain_file "\$formal_cache\/\$cache_file"/u);
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
  const cacheWrite = source.indexOf(
    'ensure_owned_private_child "$root" "$cache_root"',
    runtimeCheck,
  );
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
  assert.match(source, /fetch_payloads_published=0/u);
});

test("remote rollback preserves current before atomically installing the verified next tree", () => {
  const stage = source.indexOf("enter_stage current_source_switch");
  const armed = source.indexOf("current_source_switch_started=1", stage);
  const nextPath = source.indexOf(
    "next_current=$root/.current-next-rollback-$operation_id",
    armed,
  );
  const copyNext = source.indexOf(
    'cp -a --reflink=auto "$release_dir" "$next_current"',
    nextPath,
  );
  const oldPath = source.indexOf("old_current=$root/current.before-rollback-", copyNext);
  const preserveCurrent = source.indexOf('mv "$current" "$old_current"', oldPath);
  const installNext = source.indexOf('mv "$next_current" "$current"', preserveCurrent);
  assert.ok(
    stage >= 0 &&
      stage < armed &&
      armed < nextPath &&
      nextPath < copyNext &&
      copyNext < oldPath &&
      oldPath < preserveCurrent &&
      preserveCurrent < installNext,
  );
  assert.match(
    source.slice(nextPath, preserveCurrent),
    /! -e "\$next_current"[\s\S]+?! -e "\$old_current"/u,
  );
});

test("remote rollback removes the complete incoming control and payload inventory on success", () => {
  const cleanup = source.slice(source.lastIndexOf("enter_stage passed"));
  for (const name of [
    ".target-cache.json",
    "checksums.sha256",
    "current-release-manifest.json",
    "release-artifact.json",
    "release-manifest.json",
    "release-rehearsal.json",
    "remote-code-rollback.sh",
    "remote-release-acquire.sh",
    "rollback-manifest.json",
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

test("remote rollback restores only the trusted database role script mode after safe extraction", () => {
  const extractIndex = source.indexOf("tar --extract");
  const ownershipGateIndex = source.indexOf('"$owner_uid" == "$(id -u)"');
  const chmodIndex = source.indexOf('chmod 755 "$roles_script"');
  const retainIndex = source.indexOf(
    'mv "$release_materializing" "$release_dir"',
  );
  assert.ok(extractIndex >= 0 && extractIndex < ownershipGateIndex);
  assert.ok(ownershipGateIndex < chmodIndex && chmodIndex < retainIndex);
  assert.match(source, /--no-same-owner --no-same-permissions/u);
  assert.match(source, /tar --list --verbose --absolute-names/u);
  assert.match(
    source,
    /substr\(\$0, 1, 1\) != "-" && substr\(\$0, 1, 1\) != "d"/u,
  );
  assert.match(source, /source archive contains a non-regular member/u);
  assert.match(
    source,
    /-f "\$roles_script" && ! -L "\$roles_script"/u,
  );
  assert.match(source, /"\$owner_uid" == "\$\(id -u\)"/u);
  assert.doesNotMatch(source, /chmod -R|chmod 755 "\$release_materializing"/u);
  assert.match(source, /release_tree_digest "\$release_dir"/u);
  assert.match(source, /release_tree_digest "\$release_verifying"/u);
  assert.match(source, /existing target release tree differs from the verified source archive/u);
  assert.match(source, /-type f ! -links 1/u);
  assert.match(source, /owned_private_directory "\$runtime_root"/u);
  assert.match(source, /owned_private_plain_file "\$compose_base"/u);
  assert.match(source, /owned_private_plain_file "\$compose_override"/u);
  assert.match(source, /owned_private_plain_file "\$preflight_script"/u);
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
