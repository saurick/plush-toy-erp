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
  assert.match(source, /plush[.]remote-rollback-receipt\/v1/u);
  assert.match(source, /rollback has an unknown prior target outcome/u);
  assert.match(source, /not_proven rollback_outcome_unknown/u);
  assert.match(source, /recover_previous/u);
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
