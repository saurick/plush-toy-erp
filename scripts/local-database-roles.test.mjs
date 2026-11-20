import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertRegisteredDatabase,
  readLocalDatabaseRoles,
  localDatabaseRuntimeEnvironment,
} from "./local-database-roles.mjs";

test("dedicated roles cannot be redirected to another database or share an owner credential", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "plush-local-roles-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, "server/configs/dev");
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "database-roles.local.json");
  const admin =
    "postgres://admin:fixture@192.168.0.133:5432/plush_erp?sslmode=disable";
  const config = {
    schemaVersion: "plush.local-database-roles/v1",
    systemIdentifier: "7682605996671565865",
    app: admin.replace("admin:", "plush_dev_app:"),
    migrator: admin.replace("admin:", "plush_dev_migrator:"),
    audit: admin.replace("admin:", "plush_dev_backup:"),
  };
  fs.writeFileSync(file, JSON.stringify(config), { mode: 0o600 });
  assert.equal(
    new URL(readLocalDatabaseRoles(root, admin).audit).username,
    "plush_dev_backup",
  );
  for (const bad of [
    admin.replace("/plush_erp", "/test"),
    `${admin}&host=other`,
    admin.replace(":5432", ":5435"),
  ]) {
    assert.throws(() => assertRegisteredDatabase(bad));
  }
  fs.writeFileSync(file, JSON.stringify({ ...config, audit: admin }));
  assert.throws(() => readLocalDatabaseRoles(root, admin), /角色与登记/u);
  fs.writeFileSync(file, JSON.stringify(config));
  fs.chmodSync(file, 0o644);
  assert.throws(() => readLocalDatabaseRoles(root, admin), /仅当前用户/u);
});

test("Orb roles keep an independent identity and cannot redirect runtime credentials", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "plush-orb-roles-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, "server/configs/dev");
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "database-roles.local.json");
  const base =
    "postgres://admin:fixture@127.0.0.1:15432/plush_erp?sslmode=disable";
  const config = {
    schemaVersion: "plush.local-database-roles/v1",
    systemIdentifier: "7999999999999999999",
    app: base.replace("admin:", "plush_dev_app:"),
    migrator: base.replace("admin:", "plush_dev_migrator:"),
    audit: base.replace("admin:", "plush_dev_backup:"),
  };
  fs.writeFileSync(file, JSON.stringify(config), { mode: 0o600 });
  assert.equal(readLocalDatabaseRoles(root, base).app, config.app);
  assert.deepEqual(localDatabaseRuntimeEnvironment(root), {
    ERP_ORB_POSTGRES_SYSTEM_IDENTIFIER: config.systemIdentifier,
  });
  for (const invalid of ["", "0", "bad", "7682605996671565865"]) {
    fs.writeFileSync(
      file,
      JSON.stringify({ ...config, systemIdentifier: invalid }),
    );
    assert.throws(() => readLocalDatabaseRoles(root, base), /集群身份/u);
  }
  fs.writeFileSync(
    file,
    JSON.stringify({
      ...config,
      audit: config.audit.replace("127.0.0.1:15432", "192.168.0.133:5432"),
    }),
  );
  assert.throws(() => localDatabaseRuntimeEnvironment(root), /登记目标/u);
});
