import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const bash = execFileSync("bash", ["-c", "command -v bash"], {
  encoding: "utf8",
}).trim();
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

async function fixture(t) {
  const project = await mkdtemp(path.join(os.tmpdir(), "plush-doctor-node-"));
  t.after(() => rm(project, { recursive: true, force: true }));
  const bin = path.join(project, "bin");
  await mkdir(bin);
  const put = async (name, content = "", mode = 0o600) => {
    const target = path.join(project, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, { mode });
  };
  for (const name of [
    "scripts/setup-git-hooks.sh",
    "scripts/project-scan.sh",
    "scripts/qa/fast.sh",
    "scripts/qa/full.sh",
    "scripts/qa/strict.sh",
    "scripts/qa/db-guard.sh",
    "scripts/qa/secrets.sh",
    "scripts/qa/shellcheck.sh",
    "scripts/qa/go-vet.sh",
    "scripts/qa/golangci-lint.sh",
    "scripts/qa/yamllint.sh",
    "scripts/qa/shfmt.sh",
    "scripts/qa/govulncheck.sh",
    "scripts/git-hooks/pre-commit.sh",
    "scripts/git-hooks/pre-push.sh",
    "scripts/git-hooks/commit-msg.sh",
    ".githooks/pre-commit",
    ".githooks/pre-push",
    ".githooks/commit-msg",
  ])
    await put(name);
  for (const name of [
    "scripts/doctor.sh",
    "scripts/bootstrap.sh",
    "scripts/lib/bash.sh",
    "scripts/lib/pnpm.sh",
  ]) {
    await put(name);
    await copyFile(path.join(root, name), path.join(project, name));
  }
  await put(".n-node-version", "24.22.1\n");
  await put(
    "web/package.json",
    JSON.stringify({
      engines: { node: "24.22.x" },
      packageManager: "pnpm@10.34.5",
    }),
  );
  await put("server/go.mod", "module fixture\ngo 1.26.0\ntoolchain go1.26.9\n");
  await symlink(bash, path.join(bin, "bash"));
  await put(
    "bin/git",
    "#!/bin/sh\ncase \"$1\" in rev-parse) printf '%s\\n' \"$FIXTURE_ROOT\";; config) echo .githooks;; *) echo 'git fixture';; esac\n",
    0o700,
  );
  await put(
    "bin/node",
    `#!/bin/sh\nif [ "$1" = -p ] && [ "$2" = process.versions.node ]; then\n  printf '%s\\n' "$FIXTURE_NODE_VERSION"\nelse\n  exec ${quote(process.execPath)} "$@"\nfi\n`,
    0o700,
  );
  await put("bin/n", "#!/bin/sh\necho 10.2.0\n", 0o700);
  await put("bin/pnpm", "#!/bin/sh\necho 10.34.5\n", 0o700);
  await put("bin/go", "#!/bin/sh\necho 'go version go1.26.9 fixture'\n", 0o700);
  await put("bin/lsof", "#!/bin/sh\nexit 0\n", 0o700);
  const run = (extraEnv = {}, script = "scripts/doctor.sh") => {
    const result = spawnSync(bash, [path.join(project, script)], {
      cwd: project,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_OPTIONAL_LOCKS: "0",
        PATH: `${bin}:/usr/bin:/bin`,
        PNPM_BIN: path.join(bin, "pnpm"),
        FIXTURE_ROOT: project,
        FIXTURE_NODE_VERSION: "24.22.1",
        ...extraEnv,
      },
    });
    return { ...result, output: `${result.stdout}\n${result.stderr}` };
  };
  return { project, put, run };
}

test("doctor accepts n and the sole exact Node pin", async (t) => {
  const { run } = await fixture(t);
  const result = run();
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /Node: 24.22.1（n \/ .n-node-version）/u);
});

test("doctor rejects a different runtime with an actionable n command", async (t) => {
  const { run } = await fixture(t);
  const result = run({ FIXTURE_NODE_VERSION: "24.22.0" });
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /Node 当前 24.22.0.*n auto/u);
});

test("doctor and bootstrap reject a missing n before installing dependencies", async (t) => {
  const { project, run } = await fixture(t);
  await rm(path.join(project, "bin/n"));
  for (const script of ["scripts/doctor.sh", "scripts/bootstrap.sh"]) {
    const result = run({}, script);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /缺失\] n|请先安装 n/u);
    assert.doesNotMatch(result.output, /安装 web 依赖|启用 Git hooks/u);
  }
});

for (const name of [".node-version", ".nvmrc"]) {
  test(`doctor rejects a duplicate ${name} even when its version matches`, async (t) => {
    const { put, run } = await fixture(t);
    await put(name, "24.22.1\n");
    const result = run();
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /存在重复的 Node 版本配置/u);
  });
}

test("doctor requires the n pin instead of falling back to another manager", async (t) => {
  const { project, put, run } = await fixture(t);
  await rm(path.join(project, ".n-node-version"));
  await put(".nvmrc", "24.22.1\n");
  const result = run();
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /缺失\] Node 版本锁文件 .n-node-version/u);
});

test("doctor rejects a non-exact pin and a conflicting package engine", async (t) => {
  const { put, run } = await fixture(t);
  await put(".n-node-version", "24.22.x\n");
  let result = run();
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /必须固定完整的 Node 版本/u);
  await put(".n-node-version", "24.22.1\n");
  await put(
    "web/package.json",
    JSON.stringify({
      engines: { node: "24.23.x" },
      packageManager: "pnpm@10.34.5",
    }),
  );
  result = run();
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /engines.node=24.23.x，期望 24.22.x/u);
});
