import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const makefileURL = new URL("../../server/Makefile", import.meta.url);

function targetBody(source, target, nextTarget) {
  const start = source.indexOf(`\n${target}:\n`);
  const end = source.indexOf(`\n${nextTarget}\n`, start + 1);
  assert.ok(start >= 0 && end > start, `${target} target is missing`);
  return source.slice(start, end);
}

test("migration make targets redact DSNs and audit populated upgrades before apply", async () => {
  const source = await readFile(makefileURL, "utf8");
  assert.doesNotMatch(source, /echo\s+"using DB_URL=\$\$URL"/u);

  const apply = targetBody(source, "migrate_apply", ".PHONY: print_db_url");
  const status = targetBody(source, "migrate_status", ".PHONY: migrate_set");
  for (const body of [apply, status]) {
    assert.match(body, /go run \.\/cmd\/dburl[^\n]+-safe-target/u);
    assert.match(body, /using database target \$\$SAFE_TARGET/u);
    assert.doesNotMatch(body, /echo[^\n]*\$\$URL/u);
  }

  const auditIndex = apply.indexOf("populated-upgrade-preflight.sh");
  const atlasIndex = apply.indexOf("atlas migrate apply");
  assert.ok(auditIndex >= 0, "migrate_apply must run the populated-upgrade audit");
  assert.ok(atlasIndex > auditIndex, "the read-only audit must run before Atlas apply");
  assert.match(
    apply,
    /POPULATED_UPGRADE_DATABASE_URL="\$\$URL"[\s\S]*--audit populated-upgrade[\s\S]*--database-url-env POPULATED_UPGRADE_DATABASE_URL/u,
  );
});
