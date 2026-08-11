import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const scriptPath = path.join(
  root,
  "server/deploy/compose/prod/database_roles.sh",
);
const composePath = path.join(
  root,
  "server/deploy/compose/prod/compose.yml",
);
const source = readFileSync(scriptPath, "utf8");
const compose = readFileSync(composePath, "utf8");

test("database role reconciliation is repeatable and keeps credentials out of argv", () => {
  assert.doesNotThrow(() => execFileSync("bash", ["-n", scriptPath]));
  assert.match(source, /^umask 077$/mu);
  assert.match(source, /database_roles\.sh \[reconcile\|verify\]/u);
  assert.match(source, /\\getenv app_password POSTGRES_APP_PASSWORD/u);
  assert.match(
    source,
    /\\getenv migrator_password POSTGRES_MIGRATOR_PASSWORD/u,
  );
  assert.match(source, /\\getenv backup_password POSTGRES_BACKUP_PASSWORD/u);
  assert.doesNotMatch(source, /psql[^\n]*POSTGRES_(?:APP|MIGRATOR|BACKUP)_PASSWORD/u);
  assert.match(source, /CREATE ROLE erp_migrator LOGIN/u);
  assert.match(source, /CREATE ROLE erp_app LOGIN/u);
  assert.match(source, /CREATE ROLE erp_backup LOGIN/u);
  assert.match(source, /NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS/u);
  assert.match(source, /角色密码必须彼此不同/u);
});

test("application, migration and backup roles have distinct ownership and grants", () => {
  assert.match(source, /ALTER SCHEMA public OWNER TO erp_migrator/u);
  assert.match(source, /ALTER .* OWNER TO erp_migrator/u);
  assert.match(source, /REVOKE ALL ON SCHEMA public FROM PUBLIC/u);
  assert.match(source, /GRANT SELECT, INSERT, UPDATE, DELETE .* TO erp_app/u);
  assert.match(source, /GRANT SELECT ON ALL TABLES .* TO erp_backup/u);
  assert.match(source, /default_transaction_read_only = on/u);
  assert.match(source, /statement_timeout TO %L/u);
  assert.match(source, /lock_timeout TO %L/u);
  assert.match(source, /idle_in_transaction_session_timeout TO %L/u);
  assert.match(source, /search_path TO public/u);
  assert.match(source, /database service roles must not inherit or SET ROLE/u);
});

test("append-only grants and direct SQL permission probes stay enforced", () => {
  for (const table of [
    "inventory_txns",
    "source_order_lifecycle_events",
    "inventory_lot_status_events",
    "workflow_task_events",
    "production_order_events",
    "production_wip_events",
    "runtime_audit_events",
  ]) {
    assert.match(source, new RegExp(`'${table}'`, "u"));
  }
  assert.match(source, /REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER/u);
  assert.match(source, /expect_permission_denied/u);
  assert.match(source, /SQLSTATE 42501/u);
  assert.match(source, /CREATE TABLE/u);
  assert.match(source, /ALTER TABLE/u);
  assert.match(source, /DROP TABLE/u);
  assert.match(source, /Atlas revision UPDATE/u);
  assert.match(source, /append-only UPDATE/u);
  assert.match(source, /append-only DELETE/u);
  assert.match(source, /username erp_migrator/u);
  assert.match(source, /CREATE TABLE public\.\$\{permission_probe\}/u);
  assert.match(source, /ROLLBACK/u);
});

test("production Compose initializes and retains the role reconciler", () => {
  assert.match(
    compose,
    /database_roles\.sh:\/docker-entrypoint-initdb\.d\/20-database-roles\.sh:ro/u,
  );
  assert.match(
    compose,
    /database_roles\.sh:\/usr\/local\/bin\/plush-database-roles:ro/u,
  );
  assert.match(compose, /postgres:\/\/erp_app:/u);
  assert.match(compose, /POSTGRES_APP_PASSWORD/u);
  assert.match(compose, /POSTGRES_MIGRATOR_PASSWORD/u);
  assert.match(compose, /POSTGRES_BACKUP_PASSWORD/u);
});
