import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  buildRuntimeBundle,
  activateRuntimeBundle,
  readRuntimeSource,
  runtimeServerVersion,
  readRuntimeBundle,
} from "./local-runtime-bundle.mjs";
import { readRuntimeBuildInputs } from "./local-runtime-build-inputs.mjs";

const exec = promisify(execFile);
async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "plush-build-inputs-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = {
    "server/go.mod": "module example.test/runtime\n\ngo 1.24\n",
    "server/cmd/server/main.go":
      'package main\nimport("fmt"; "example.test/runtime/internal/shared"; _ "embed")\nvar Version string\n//go:embed resource.md\nvar resource string\nfunc main(){fmt.Print(Version,shared.Value,resource)}\n',
    "server/cmd/server/resource.md": "embedded resource",
    "server/cmd/attachment-storage/main.go":
      'package main\nimport("fmt"; "example.test/runtime/internal/shared")\nvar Version string\nfunc main(){fmt.Print(Version,shared.Value)}\n',
    "server/internal/shared/value.go": 'package shared\nconst Value="shared"\n',
    "server/internal/data/model/migrate/20260927072615_fixture.sql": "fixture",
    "server/.env":
      "ATTACHMENT_S3_ENDPOINT=http://localhost:9000\nATTACHMENT_S3_BUCKET=fixture-bucket\nATTACHMENT_S3_ACCESS_KEY_ID=fixture\nATTACHMENT_S3_SECRET_ACCESS_KEY=fixture\n",
    "web/src/page.jsx": "original page",
    "web/package.json": "{}",
    "scripts/build/apply-customer-web-config.mjs": "fixture",
  };
  for (const [file, value] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), value, { mode: 0o600 });
  }
  fs.mkdirSync(path.join(root, "web/node_modules"), { recursive: true });
  await exec("git", ["init", "--quiet"], {
    cwd: root,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  });
  return root;
}
function activate(root, bundle) {
  activateRuntimeBundle(root, bundle.id, {
    artifactHash: bundle.artifactHash,
    migrationVersion: bundle.migrationVersion,
    health: true,
    ready: true,
    business: true,
  });
}
function executor(calls) {
  return async (command, args, options) => {
    if (command === "go") {
      if (args[0] === "build") calls.push(args.at(-1));
      return exec(command, args, options);
    }
    calls.push("web");
    const index = args.indexOf("--outDir");
    if (index !== -1) {
      fs.mkdirSync(args[index + 1], { recursive: true });
      fs.writeFileSync(path.join(args[index + 1], "index.html"), "fixed page");
    }
    return { stdout: "", stderr: "" };
  };
}

test("dependency fingerprints include shared code and embeds, while unrelated code and runtime secrets stay separate", async (t) => {
  const root = await fixture(t);
  const initial = await readRuntimeBuildInputs(
    root,
    await readRuntimeSource(root),
    exec,
    { scope: "full" },
  );
  fs.writeFileSync(
    path.join(root, "server/cmd/attachment-storage/main.go"),
    "package main\nfunc main(){}\n",
  );
  const attachment = await readRuntimeBuildInputs(
    root,
    await readRuntimeSource(root),
    exec,
    { scope: "full" },
  );
  assert.equal(attachment.backend, initial.backend);
  assert.notEqual(attachment.attachment, initial.attachment);
  fs.appendFileSync(
    path.join(root, "server/.env"),
    "APP_JWT_SECRET=changed-fixture\n",
  );
  const config = await readRuntimeBuildInputs(
    root,
    await readRuntimeSource(root),
  );
  assert.equal(config.backend, attachment.backend);
  fs.writeFileSync(
    path.join(root, "server/cmd/server/resource.md"),
    "updated embed",
  );
  const embed = await readRuntimeBuildInputs(
    root,
    await readRuntimeSource(root),
  );
  assert.notEqual(embed.backend, config.backend);
  fs.writeFileSync(
    path.join(root, "server/internal/shared/value.go"),
    'package shared\nconst Value="updated"\n',
  );
  assert.notEqual(
    (await readRuntimeBuildInputs(root, await readRuntimeSource(root))).backend,
    embed.backend,
  );
});

test("backend bundles reuse unchanged verified artifacts, rebuild changed source, and isolate full migration builds", async (t) => {
  const root = await fixture(t),
    calls = [],
    execute = executor(calls),
    options = { scope: "backend", workspaceVerification: "backend" };
  const first = await buildRuntimeBundle(
    root,
    randomUUID(),
    execute,
    () => {},
    options,
  );
  assert.equal(first.scope, "backend");
  assert.deepEqual(calls, ["./cmd/server"]);
  assert.equal(first.files.includes("runtime/web/index.html"), false);
  assert.equal(
    first.files.includes("source/server/cmd/server/resource.md"),
    true,
  );
  assert.match(
    (await exec(path.join(first.directory, "runtime/server"))).stdout,
    new RegExp(runtimeServerVersion(first)),
  );
  activate(root, first);
  calls.length = 0;
  fs.writeFileSync(path.join(root, "web/src/page.jsx"), "Vite update");
  const same = await buildRuntimeBundle(
    root,
    randomUUID(),
    execute,
    () => {},
    options,
  );
  assert.equal(same.id, first.id);
  assert.equal(same.reusedBuild, true);
  assert.deepEqual(calls, []);
  fs.appendFileSync(
    path.join(root, "server/.env"),
    "APP_JWT_SECRET=new-fixture\n",
  );
  const config = await buildRuntimeBundle(
    root,
    randomUUID(),
    execute,
    () => {},
    options,
  );
  assert.notEqual(config.id, first.id);
  assert.equal(runtimeServerVersion(config), runtimeServerVersion(first));
  assert.deepEqual(calls, []);
  activate(root, config);
  const forced = await buildRuntimeBundle(
    root,
    randomUUID(),
    execute,
    () => {},
    { ...options, forceBackendBuild: true },
  );
  assert.notEqual(runtimeServerVersion(forced), runtimeServerVersion(config));
  assert.deepEqual(calls, ["./cmd/server"]);
  activate(root, forced);
  calls.length = 0;
  fs.writeFileSync(
    path.join(root, "server/cmd/server/resource.md"),
    "latest embed",
  );
  const changed = await buildRuntimeBundle(
    root,
    randomUUID(),
    execute,
    () => {},
    options,
  );
  assert.deepEqual(calls, ["./cmd/server"]);
  assert.notEqual(runtimeServerVersion(changed), runtimeServerVersion(forced));
  activate(root, changed);
  calls.length = 0;
  const full = await buildRuntimeBundle(root, randomUUID(), execute);
  assert.equal(full.scope, "full");
  assert(full.files.includes("runtime/web/index.html"));
  assert(full.files.includes("runtime/attachment-storage"));
  assert.deepEqual(calls, ["./cmd/attachment-storage", "web", "web"]);
  activate(root, full);
  calls.length = 0;
  const anotherFull = await buildRuntimeBundle(root, randomUUID(), execute);
  assert.notEqual(anotherFull.id, full.id);
  assert.deepEqual(calls, []);
  fs.writeFileSync(
    path.join(full.directory, "runtime/server"),
    "tampered artifact",
  );
  assert.throws(() => readRuntimeBundle(root, full.id), /校验/u);
  calls.length = 0;
  const recovered = await buildRuntimeBundle(
    root,
    randomUUID(),
    execute,
    () => {},
    options,
  );
  assert.notEqual(recovered.id, full.id);
  assert.deepEqual(calls, ["./cmd/server"]);
});

test("platform and compilation flags invalidate reuse before replacing a process", async (t) => {
  const root = await fixture(t),
    source = await readRuntimeSource(root);
  const original = await readRuntimeBuildInputs(root, source);
  const changed = await readRuntimeBuildInputs(
    root,
    source,
    async (command, args, options) => {
      const result = await exec(command, args, options);
      if (args[0] === "env")
        result.stdout = JSON.stringify({
          ...JSON.parse(result.stdout),
          GOFLAGS: "-tags=changed",
        });
      return result;
    },
  );
  assert.notEqual(changed.backend, original.backend);
  await assert.rejects(
    readRuntimeBuildInputs(root, source, async () => ({
      stdout: JSON.stringify({ GOOS: "other", GOARCH: "other" }),
    })),
    /当前平台/u,
  );
});

test("migration snapshots allow subsequent Vite edits while backend and dependency changes still block", async (t) => {
  for (const [file, allowed, verification = "backend"] of [
    ["web/src/page.jsx", true],
    ["web/dev-server/devDataPreparationPlugin.mjs", true],
    ["server/internal/shared/value.go", false],
    ["server/internal/data/model/migrate/20261007000000_added.sql", false],
    ["server/.env", false],
    ["web/node_modules/.modules.yaml", false],
    ["web/src/page.jsx", false, "full"],
  ]) {
    await t.test(`${verification}: ${file}`, async (t) => {
      const root = await fixture(t);
      const before = await readRuntimeSource(root);
      let changed = false;
      const building = buildRuntimeBundle(
        root,
        randomUUID(),
        executor([]),
        (message) => {
          if (message !== "正在核对候选制品与当前工作区" || changed) return;
          changed = true;
          fs.mkdirSync(path.dirname(path.join(root, file)), {
            recursive: true,
          });
          fs.appendFileSync(path.join(root, file), "\n// concurrent edit\n");
        },
        { workspaceVerification: verification },
      );
      if (!allowed) {
        await assert.rejects(building, {
          code: "WORKSPACE_RUNTIME_SOURCE_CHANGED",
        });
        return;
      }
      const bundle = await building;
      assert.equal(bundle.scope, "full");
      assert(bundle.files.includes("runtime/attachment-storage"));
      assert(bundle.files.includes("runtime/web/index.html"));
      assert.equal(bundle.sourceFingerprint, before.fingerprint);
      assert.notEqual(
        (await readRuntimeSource(root)).fingerprint,
        before.fingerprint,
      );
      assert.equal(
        fs.readFileSync(
          path.join(bundle.directory, "source/web/src/page.jsx"),
          "utf8",
        ),
        "original page",
      );
      assert.equal(
        readRuntimeBundle(root, bundle.id).artifactHash,
        bundle.artifactHash,
      );
    });
  }
});

test("migration candidates bind frontend edits before the copy to the captured snapshot", async (t) => {
  const root = await fixture(t);
  const before = await readRuntimeSource(root);
  let changed = false;
  const execute = async (command, args, options) => {
    const result = await executor([])(command, args, options);
    if (command === "go" && args[0] === "env" && !changed) {
      changed = true;
      fs.writeFileSync(
        path.join(root, "web/src/page.jsx"),
        "changed before copy",
      );
    }
    return result;
  };
  const bundle = await buildRuntimeBundle(
    root,
    randomUUID(),
    execute,
    () => {},
    { workspaceVerification: "backend" },
  );
  assert.notEqual(bundle.sourceFingerprint, before.fingerprint);
  assert.equal(
    bundle.sourceFingerprint,
    (await readRuntimeSource(root)).fingerprint,
  );
  assert.equal(
    fs.readFileSync(
      path.join(bundle.directory, "source/web/src/page.jsx"),
      "utf8",
    ),
    "changed before copy",
  );
});

test("migration candidates reject inconsistent snapshot copies", async (t) => {
  const root = await fixture(t);
  const copy = fs.copyFileSync;
  t.mock.method(fs, "copyFileSync", (from, to, flags) => {
    if (from === path.join(root, "web/src/page.jsx"))
      fs.writeFileSync(from, "changed during copy");
    return copy(from, to, flags);
  });
  await assert.rejects(
    buildRuntimeBundle(root, randomUUID(), executor([]), () => {}, {
      workspaceVerification: "backend",
    }),
    { code: "WORKSPACE_RUNTIME_SOURCE_CHANGED" },
  );
});
