import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = new URL("./remote-code-rollback.sh", import.meta.url);
const source = readFileSync(script, "utf8");

test("remote code rollback is fixed to test-133 and has no build or database mutation", () => {
  assert.match(source, /target=test-133/u);
  assert.match(source, /root=\/home\/simon\/plush-toy-erp-v5/u);
  assert.match(source, /code_and_images_only/u);
  assert.match(source, /automaticDatabaseDownMigration == false/u);
  assert.match(source, /databaseRestoreAutomatic == false/u);
  assert.match(source, /--no-build --pull never/u);
  assert.match(source, /migration[.]sequenceSha256/u);
  assert.match(source, /customerConfig[.]sourceSha256/u);
  assert.doesNotMatch(source, /docker (?:build|compose build)/u);
  assert.doesNotMatch(source, /\b(?:dropdb|createdb|pg_restore|atlas migrate apply)\b/u);
  assert.doesNotMatch(source, /git (?:clone|pull|checkout)/u);
});

test("remote code rollback requires exact confirmation, lock and receipt", () => {
  assert.match(
    source,
    /ROLLBACK:\$target:\$from_sha:\$to_sha:\$operation_id/u,
  );
  assert.match(source, /flock -n 9/u);
  assert.match(source, /plush[.]remote-rollback-receipt\/v2/u);
  assert.match(source, /enter_stage package_verification/u);
  assert.match(source, /durationMs: \$durationMs/u);
  assert.match(source, /timings: \$timings/u);
  assert.match(source, /rollback has an unknown prior target outcome/u);
  assert.match(source, /not_proven rollback_outcome_unknown/u);
  assert.match(source, /recover_previous/u);
  assert.match(
    source,
    /serviceSwitchStarted: \(\$serviceSwitchStarted == 1\)/u,
  );
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
