import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const scriptPath = path.join(
  repoRoot,
  "scripts/qa/populated-upgrade-preflight.sh",
);
const sqlPath = path.join(
  repoRoot,
  "scripts/qa/populated-upgrade-20260714055504.sql",
);
const cutoverSqlPath = path.join(
  repoRoot,
  "scripts/qa/customer-config-cutover-20260714055825.sql",
);

function writeExecutable(filePath, source) {
  fs.writeFileSync(filePath, source, "utf8");
  fs.chmodSync(filePath, 0o755);
}

function createFixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "populated-upgrade-preflight-"),
  );
  const binDir = path.join(root, "bin");
  const invocationLog = path.join(root, "invocations.log");
  fs.mkdirSync(binDir, { recursive: true });

  writeExecutable(
    path.join(binDir, "docker"),
    [
      "#!/bin/sh",
      'printf \'docker:%s\\n\' "$*" >> "$INVOCATION_LOG"',
      "payload=$(cat)",
      'case "$payload" in',
      "  *plush_customer_config_cutover*) audit=customer-config-cutover ;;",
      "  *plush_populated_upgrade*) audit=populated-upgrade ;;",
      "  *) audit=unknown ;;",
      "esac",
      'printf \'audit:%s\\n\' "$audit" >> "$INVOCATION_LOG"',
      'exit "$PREFLIGHT_EXIT_CODE"',
      "",
    ].join("\n"),
  );
  writeExecutable(
    path.join(binDir, "psql"),
    [
      "#!/bin/sh",
      "safe_args=",
      "redact_next=0",
      "dbname_set=0",
      'for arg in "$@"; do',
      '  if [ "$redact_next" -eq 1 ]; then',
      '    safe_args="$safe_args <redacted>"',
      "    redact_next=0",
      "    dbname_set=1",
      '  elif [ "$arg" = "--dbname" ]; then',
      '    safe_args="$safe_args --dbname"',
      "    redact_next=1",
      "  else",
      '    safe_args="$safe_args $arg"',
      "  fi",
      "done",
      'printf \'psql:%s\\n\' "${safe_args# }" >> "$INVOCATION_LOG"',
      'if [ "$dbname_set" -eq 1 ]; then printf \'dbname:set\\n\' >> "$INVOCATION_LOG"; fi',
      "payload=$(cat)",
      'case "$payload" in',
      "  *plush_customer_config_cutover*) audit=customer-config-cutover ;;",
      "  *plush_populated_upgrade*) audit=populated-upgrade ;;",
      "  *) audit=unknown ;;",
      "esac",
      'printf \'audit:%s\\n\' "$audit" >> "$INVOCATION_LOG"',
      'exit "$PREFLIGHT_EXIT_CODE"',
      "",
    ].join("\n"),
  );

  return {
    root,
    binDir,
    invocationLog,
    env: {
      ...process.env,
      PATH: binDir + path.delimiter + (process.env.PATH || ""),
      INVOCATION_LOG: invocationLog,
      PREFLIGHT_EXIT_CODE: "0",
      PSQL_BIN: path.join(binDir, "psql"),
    },
  };
}

function runScript(args = [], env = {}) {
  return spawnSync("sh", [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
    },
  });
}

test("populated upgrade SQL is read-only and covers every 055504 data boundary", () => {
  const source = fs.readFileSync(sqlPath, "utf8");
  for (const required of [
    "bom_headers",
    "finance_facts",
    "process_instances",
    "workflow_business_states",
    "process_node_instances",
    "workflow_tasks",
    "legacy CANCELLED rows without a durable cancellation audit",
    "legacy timestamps that the target migration drops",
    "invalid process anchors incompatible with target foreign keys or process ownership",
    "node.process_instance_id <> task.process_instance_id",
    "version is added safely by 20260711063237",
    "shipment_status_normalization_pending",
    "shipment_release_pending",
    "workflow_tasks.version is missing after migration 20260711063237",
    "workflow_tasks has %s non-positive versions",
    "'ready', 'blocked', 'done', 'rejected'",
    "production_wip_batches",
    "outsourcing_order_item_id",
    "production_wip_outsourcing_allocations",
    "legacy outsourcing links that would be dropped by 20260717043625",
    "active OUTSOURCED batches without durable allocations after 20260717043625",
    "BEGIN TRANSACTION READ ONLY",
    "atlas_schema_revisions.atlas_schema_revisions",
  ]) {
    assert(source.includes(required), "missing audit boundary: " + required);
  }
  assert.doesNotMatch(
    source,
    /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|COPY)\b/iu,
  );
  assert.doesNotMatch(source, /public\.atlas_schema_revisions/u);
});

test("customer config cutover SQL is revision-aware, read-only, and covers both 055825 blockers", () => {
  const source = fs.readFileSync(cutoverSqlPath, "utf8");
  for (const required of [
    "BEGIN TRANSACTION READ ONLY",
    "20260714055825",
    "20260629120814",
    "process_instances",
    "workflow_tasks",
    "config_revision IS NOT NULL",
    "process_instances has %s rows that must be explicitly governed before customer config hash cutover",
    "workflow_tasks has %s config revision anchors that must be explicitly governed before customer config hash cutover",
    "workflow_config_revision_migration_pending",
    "atlas_schema_revisions.atlas_schema_revisions",
  ]) {
    assert(source.includes(required), "missing cutover boundary: " + required);
  }
  assert.doesNotMatch(
    source,
    /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|COPY)\b/iu,
  );
  assert.doesNotMatch(source, /public\.atlas_schema_revisions/u);
});

test("populated upgrade preflight help declares read-only scope", () => {
  const result = runScript(["--help"]);
  assert.equal(result.status, 0, result.stdout + "\n" + result.stderr);
  assert.match(result.stdout, /只读检查/u);
  assert.match(result.stdout, /populated-upgrade/u);
  assert.match(result.stdout, /customer-config-cutover/u);
  assert.match(result.stdout, /WIP 20260717035245 -> 20260717043625/u);
  assert.match(result.stdout, /固定值/u);
  assert.match(result.stdout, /不修改业务数据/u);
  assert.match(result.stdout, /不输出数据库连接串/u);
});

test("populated upgrade preflight supports the production Postgres container", () => {
  const fixture = createFixture();
  try {
    const result = runScript(
      [
        "--docker-container",
        "postgres-test",
        "--database",
        "plush_erp",
        "--username",
        "plush",
      ],
      fixture.env,
    );
    assert.equal(result.status, 0, result.stdout + "\n" + result.stderr);
    assert.match(
      result.stdout,
      /status=complete mode=read-only audit=populated-upgrade/u,
    );
    const invocation = fs.readFileSync(fixture.invocationLog, "utf8");
    assert.match(invocation, /docker:exec -i postgres-test psql/u);
    assert.match(invocation, /--username plush --dbname plush_erp/u);
    assert.match(invocation, /audit:populated-upgrade/u);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("populated upgrade preflight passes the named DSN as an explicit redacted psql dbname", () => {
  const fixture = createFixture();
  const databaseURL =
    "postgres://plush:private-test-secret@127.0.0.1:5432/plush_erp?sslmode=disable";
  try {
    const result = runScript(
      [
        "--audit",
        "customer-config-cutover",
        "--database-url-env",
        "POPULATED_UPGRADE_DATABASE_URL",
        "--psql-bin",
        fixture.env.PSQL_BIN,
      ],
      {
        ...fixture.env,
        POPULATED_UPGRADE_DATABASE_URL: databaseURL,
      },
    );
    assert.equal(result.status, 0, result.stdout + "\n" + result.stderr);
    assert.doesNotMatch(
      result.stdout + "\n" + result.stderr,
      /private-test-secret/u,
    );
    const invocation = fs.readFileSync(fixture.invocationLog, "utf8");
    assert.match(
      invocation,
      /psql:-X --no-psqlrc --set ON_ERROR_STOP=1 --dbname <redacted>/u,
    );
    assert.match(invocation, /dbname:set/u);
    assert.match(invocation, /audit:customer-config-cutover/u);
    assert.doesNotMatch(invocation, /private-test-secret/u);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("migration preflight rejects unknown audits before invoking docker or psql", () => {
  const fixture = createFixture();
  try {
    const result = runScript(
      [
        "--audit",
        "arbitrary.sql",
        "--database-url-env",
        "POPULATED_UPGRADE_DATABASE_URL",
      ],
      {
        ...fixture.env,
        POPULATED_UPGRADE_DATABASE_URL: "postgres://test.invalid/example",
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /--audit 仅支持 populated-upgrade 或 customer-config-cutover/u,
    );
    assert.equal(fs.existsSync(fixture.invocationLog), false);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("populated upgrade preflight fails closed before psql when the DSN is absent", () => {
  const fixture = createFixture();
  try {
    const result = runScript(
      [
        "--database-url-env",
        "POPULATED_UPGRADE_DATABASE_URL",
        "--psql-bin",
        fixture.env.PSQL_BIN,
      ],
      fixture.env,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /未提供数据库连接串/u);
    assert.equal(fs.existsSync(fixture.invocationLog), false);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("populated upgrade preflight propagates an audit failure", () => {
  const fixture = createFixture();
  try {
    const result = runScript(
      [
        "--docker-container",
        "postgres-test",
        "--database",
        "plush_erp",
        "--username",
        "plush",
      ],
      {
        ...fixture.env,
        PREFLIGHT_EXIT_CODE: "43",
      },
    );
    assert.equal(result.status, 43, result.stdout + "\n" + result.stderr);
    assert.doesNotMatch(result.stdout, /status=complete/u);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
