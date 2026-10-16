import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  activateProfile,
  prepareProfileSwitch,
  PROFILE_FILES,
} from "./local-orb.mjs";
import { classifyDevelopmentTarget } from "./local-migration.mjs";

test("registered Orb follows guarded development migration, explicit override cannot bypass it", () => {
  const dsn = "postgres://u:p@127.0.0.1:15432/plush_erp?sslmode=disable";
  assert.equal(
    classifyDevelopmentTarget(dsn, "application-config").scope,
    "shared-dev",
  );
  assert.equal(
    classifyDevelopmentTarget(dsn, "environment").scope,
    "untrusted",
  );
  assert.equal(
    classifyDevelopmentTarget(dsn.replace(":15432", ":25432"), "environment")
      .scope,
    "local",
  );
});

test("switch refuses active development and changed config without modifying any file", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "plush-orb-switch-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const state = path.join(root, "private");
  const hashes = { shared: {}, orb: {} };
  for (const file of PROFILE_FILES) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), "shared", { mode: 0o600 });
    for (const profile of ["shared", "orb"]) {
      const target = path.join(state, "profiles", profile, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, profile, { mode: 0o600 });
      hashes[profile][file] = createHash("sha256")
        .update(profile)
        .digest("hex");
    }
  }
  fs.writeFileSync(path.join(state, "profiles.json"), JSON.stringify(hashes), {
    mode: 0o600,
  });
  fs.mkdirSync(path.join(root, "config"));
  fs.copyFileSync(
    new URL("../config/dev-ports.env", import.meta.url),
    path.join(root, "config/dev-ports.env"),
  );
  assert.equal(prepareProfileSwitch(root, state, "orb").source, "shared");
  await assert.rejects(
    activateProfile(root, state, "orb", { portAvailable: async () => false }),
    /仍在使用/u,
  );
  for (const file of PROFILE_FILES)
    assert.equal(fs.readFileSync(path.join(root, file), "utf8"), "shared");
  fs.writeFileSync(path.join(root, PROFILE_FILES[0]), "later change");
  assert.throws(() => prepareProfileSwitch(root, state, "orb"), /后续修改/u);
  assert.throws(
    () => prepareProfileSwitch(root, state, "production"),
    /只允许/u,
  );
});
