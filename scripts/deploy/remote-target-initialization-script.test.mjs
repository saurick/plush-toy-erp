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
  assert.match(source, /system\.version/u);
  assert.match(source, /\.result\.data\.git_sha == \$sha/u);
  assert.match(source, /\.result\.data\.release_version == \$version/u);
});
