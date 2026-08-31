import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = new URL(
  "./remote-target-initialization.sh",
  import.meta.url,
);
const source = readFileSync(scriptPath, "utf8");

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
