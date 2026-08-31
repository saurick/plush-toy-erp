import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = new URL(
  "./remote-target-initialization.sh",
  import.meta.url,
);
const source = readFileSync(scriptPath, "utf8");

function shellArray(name) {
  const match = source.match(new RegExp(`${name}=\\(\\n([\\s\\S]*?)\\n\\)`, "u"));
  assert.ok(match, `${name} must be declared`);
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

test("target initializer is valid Bash and accepts only demo and customer test", () => {
  const syntax = spawnSync("bash", ["-n", scriptPath.pathname], {
    encoding: "utf8",
  });
  assert.equal(syntax.status, 0, syntax.stderr);
  assert.match(source, /case "\$target" in\s+demo-133\)/u);
  assert.match(source, /customer-test-133\)/u);
  assert.doesNotMatch(source, /admin\.yoyoosun\.net|admin-133/u);
  assert.match(source, /\*\) fail "unsupported target"/u);
});

test("target initializer preserves isolated target identities and first-cutover contract", () => {
  assert.match(source, /database=plush_erp_demo_v1/u);
  assert.match(source, /database=plush_erp_customer_test_v1/u);
  assert.match(source, /public_host_port=5176/u);
  assert.match(source, /public_host_port=5177/u);
  assert.match(
    source,
    /trial_enabled=1[\s\S]*trial_target=customer-trial-133/u,
  );
  assert.match(source, /trial_enabled=0[\s\S]*trial_target=/u);
  assert.match(source, /--current-container none/u);
  assert.match(source, /--pull never/u);
  assert.doesNotMatch(
    source,
    /docker (?:compose )?build|docker system prune|docker volume prune/u,
  );
  assert.match(
    source,
    /WEB_PROXY_PREFIXES=\/rpc,\/templates,\/readyz\/runtime-identity/u,
  );
});

test("target initializer keeps bootstrap secrets transient and rollback owner-bound", () => {
  assert.doesNotMatch(source, /printf 'APP_ADMIN_PASSWORD=/u);
  assert.match(source, /rm -f -- "\$secret_file"/u);
  assert.match(
    source,
    /plain_owned_file "\$owner_marker"[\s\S]*\.operationId == \$operationId[\s\S]*rm -rf -- "\$root"/u,
  );
  assert.ok(
    source.indexOf('rmdir "$incoming"') <
      source.indexOf('rm -f -- "$owner_marker"'),
    "the owner marker must remain available until every fallible success cleanup step is complete",
  );
  assert.match(source, /rollback_incomplete/u);
  assert.match(source, /automaticDownMigration: false/u);
  assert.match(
    source,
    /--volume "\$data_dir:\/target"[\s\S]*find \/target -mindepth 1 -depth -delete/u,
  );
  assert.match(source, /--pull never --name "\$cleanup_container"/u);
  assert.match(
    source,
    /handle_failure\(\)[\s\S]*?trap - ERR EXIT HUP INT TERM[\s\S]*?cleanup_transient_credentials[\s\S]*?cleanup_exact_target/u,
  );
  assert.match(
    source,
    /cleanup_authorized=0[\s\S]*?if \[\[ "\$cleanup_authorized" -ne 1 \]\]; then[\s\S]*?write_receipt_json not_proven initialization_prelock_failure false[\s\S]*?return 0/u,
  );
  assert.match(
    source,
    /on_signal\(\)[\s\S]*?handle_failure 130 initialization_interrupted[\s\S]*?exit 130/u,
  );
  assert.match(source, /trap on_signal HUP INT TERM/u);
  assert.match(source, /trap on_exit EXIT/u);
  assert.match(
    source,
    /on_exit\(\)[\s\S]*?"\$exit_code" -ne 0 && "\$failure_handled" -eq 0[\s\S]*?handle_failure/u,
  );
  assert.doesNotMatch(
    source,
    /trap (?:cleanup_transient_credentials|cleanup_exact_target) EXIT/u,
  );
  const trapIndex = source.indexOf("trap on_error ERR");
  const actionGateIndex = source.indexOf('[[ "$action" == initialize ]]');
  const identityGateIndex = source.indexOf('[[ "$(hostname)" == r640');
  assert.ok(trapIndex >= 0 && trapIndex < actionGateIndex);
  assert.ok(trapIndex < identityGateIndex);
  const lockIndex = source.indexOf('flock -n 9 || fail "target operation lock is held"');
  const cleanupAuthorizationIndex = source.indexOf("cleanup_authorized=1");
  const logInitializationIndex = source.indexOf(': >"$log_file"');
  assert.ok(lockIndex >= 0 && lockIndex < cleanupAuthorizationIndex);
  assert.ok(cleanupAuthorizationIndex < logInitializationIndex);
  const passed = source.slice(source.indexOf("stage=passed"));
  assert.match(passed, /write_receipt_json passed none true/u);
  assert.doesNotMatch(passed, /cleanup_exact_target|write_receipt_json (?:failed|not_proven)/u);
});

test("target initializer restores the container-readable database role script mode", () => {
  const extractIndex = source.indexOf("tar --extract");
  const chmodIndex = source.indexOf('chmod 755 "$database_roles_script"');
  const composeStartIndex = source.indexOf("stage=database_start");
  assert.ok(extractIndex >= 0 && extractIndex < chmodIndex);
  assert.ok(chmodIndex < composeStartIndex);
  assert.match(
    source,
    /plain_owned_file "\$database_roles_script" \|\| fail "database role initializer is invalid"/u,
  );
});

test("target initializer lets Docker establish the fresh PostgreSQL data-root owner", () => {
  const ownershipGate = source.indexOf(
    '[[ ! -e "$data_dir" && ! -L "$data_dir" ]] || fail "database data directory must be absent before initialization"',
  );
  const directoryMaterialization = source.indexOf(
    'mkdir -p "$runtime_dir" "$root/data" "$backups_root" "$run_root" "$tools_root"',
  );
  const composeStartIndex = source.indexOf("stage=database_start");
  assert.ok(ownershipGate >= 0 && ownershipGate < directoryMaterialization);
  assert.ok(directoryMaterialization < composeStartIndex);
  assert.doesNotMatch(source, /mkdir -p[^\n]*"\$data_dir"/u);
  assert.doesNotMatch(source, /chmod 700[^\n]*"\$data_dir"/u);
});

test("target initializer validates immutable release and restored backup before retention", () => {
  assert.match(
    source,
    /sha256sum --check --strict transfer-checksums\.sha256/u,
  );
  assert.match(source, /portable_archive_manifest_digest/u);
  assert.match(
    source,
    /docker image inspect --format '\{\{\.Os\}\}\/\{\{\.Architecture\}\}'/u,
  );
  assert.match(
    source,
    /pg_restore --exit-on-error --no-owner --no-privileges/u,
  );
  assert.match(source, /restored_table_count/u);
  assert.match(
    source,
    /"method":"version"[\s\S]*"\$web_endpoint\/rpc\/system"/u,
  );
  assert.doesNotMatch(source, /"method":"system\.version"/u);
  assert.match(source, /\.result\.data\.git_sha == \$sha/u);
  assert.match(source, /\.result\.data\.release_version == \$version/u);
});

test("target initializer acquires the exact release before package verification and cleans every control", () => {
  assert.match(
    source,
    /schemaVersion "plush[.]remote-target-initialization-receipt\/v3"/u,
  );
  assert.match(source, /acquisitionDurationMs/u);
  assert.match(source, /acquisition_started_epoch_ms/u);
  assert.match(source, /credentialCleanupProven/u);
  assert.match(source, /cleanup_transient_credentials/u);
  const helperSource = source.indexOf('source "$incoming/remote-release-acquire.sh"');
  const acquire = source.indexOf("acquire_target_release");
  const packageVerification = source.indexOf("stage=package_verification");
  assert.ok(helperSource >= 0 && helperSource < acquire);
  assert.ok(acquire < packageVerification);
  assert.deepEqual(shellArray("control_files"), [
    "promotion-manifest.json",
    "remote-promotion.sh",
    "remote-release-acquire.sh",
    "target-initialization.secret",
    "target-release-fetch.json",
    "transfer-checksums.sha256",
  ]);
  const tokenRead = source.indexOf("IFS= read -r target_fetch_token || true");
  assert.ok(helperSource < tokenRead && tokenRead < acquire);
  assert.doesNotMatch(source, /target-release-fetch[.]secret/u);
  const requiredFiles = shellArray("required_files");
  for (const payload of [
    "checksums.sha256",
    "sbom.cdx.json",
    "server-image.tar",
    "source.tar",
    "web-image.tar",
  ]) {
    assert.equal(requiredFiles.includes(payload), true, payload);
  }
  assert.match(
    source,
    /cmp --silent "\$incoming\/remote-release-acquire[.]sh" "\$release_dir\/scripts\/deploy\/remote-release-acquire[.]sh"/u,
  );
  const successCleanup = source.slice(source.indexOf("stage=passed"));
  for (const cleaned of [
    "checksums.sha256",
    "remote-release-acquire.sh",
    "target-release-fetch.json",
  ]) {
    assert.match(successCleanup, new RegExp(cleaned.replaceAll(".", "[.]"), "u"));
  }
  assert.ok(
    successCleanup.indexOf('rmdir "$incoming"') <
      successCleanup.indexOf('rm -f -- "$owner_marker"'),
  );
});
