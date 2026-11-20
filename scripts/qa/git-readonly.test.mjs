import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { readRepositoryIdentity } from "./lib/repository-identity.mjs";
import { runGit } from "./lib/git-range.mjs";

const makefile = fileURLToPath(
  new URL("../../server/Makefile", import.meta.url),
);
const fixtureEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
);

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-git-readonly-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, env: fixtureEnv, stdio: "pipe" });
  git("init", "-q");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "commit.gpgsign", "false");
  writeFileSync(path.join(root, "product.txt"), "product\n");
  git("add", "product.txt");
  git("-c", "core.hooksPath=/dev/null", "commit", "-qm", "fixture");
  mkdirSync(path.join(root, "api"));
  const index = path.join(root, ".git/index");
  const state = () => ({
    bytes: readFileSync(index),
    mtime: statSync(index, { bigint: true }).mtimeNs,
  });
  const before = state();
  // Change cached file metadata without changing its content: ordinary status refreshes the index.
  utimesSync(
    path.join(root, "product.txt"),
    new Date("2024-01-01"),
    new Date("2024-01-01"),
  );
  return { root, git, state, before };
}

test("repository identity reads changed file metadata without rewriting the index", async (t) => {
  const { root, state, before, git } = fixture(t);
  const identity = await readRepositoryIdentity(root);
  assert.equal(identity.dirty, false);
  assert.deepEqual(state(), before);
  git("status", "--porcelain");
  assert.notDeepEqual(
    state(),
    before,
    "fixture must detect an ordinary status index refresh",
  );
});

test("repository identity preserves an existing index lock and still reports changes", async (t) => {
  const { root, state, before } = fixture(t);
  const lock = path.join(root, ".git/index.lock");
  writeFileSync(lock, "another operation");
  writeFileSync(path.join(root, "product.txt"), "changed product\n");
  const identity = await readRepositoryIdentity(root);
  assert.equal(identity.dirty, true);
  assert.equal(readFileSync(lock, "utf8"), "another operation");
  assert.deepEqual(state(), before);
});

test("QA Git range reader does not refresh index metadata when reading diff or status", (t) => {
  const { root, state, before } = fixture(t);
  assert.equal(runGit(root, ["diff", "HEAD", "--"]), "");
  assert.equal(runGit(root, ["diff", "--name-only", "--"]), "");
  assert.equal(runGit(root, ["diff", "--name-status", "--"]), "");
  assert.equal(runGit(root, ["status", "--porcelain"]), "");
  assert.deepEqual(state(), before);
  writeFileSync(path.join(root, "product.txt"), "real change\n");
  assert.equal(runGit(root, ["diff", "--name-only", "--"]), "product.txt\n");
  assert.equal(
    runGit(root, ["diff", "--name-status", "--"]),
    "M\tproduct.txt\n",
  );
  assert.throws(
    () => runGit(root, ["diff", "--name-only", "missing-ref", "--"]),
    /failed/u,
  );
  assert.deepEqual(state(), before);
});

test("Make version reads leave the index unchanged and child tools inherit no optional locks", (t) => {
  const { root, state, before } = fixture(t);
  const result = execFileSync(
    "make",
    ["--no-print-directory", "-f", makefile, "-f", "-", "git_readonly_probe"],
    {
      cwd: root,
      env: { ...fixtureEnv, GIT_OPTIONAL_LOCKS: "1" },
      input:
        '.PHONY: git_readonly_probe\ngit_readonly_probe:\n\t@printf "%s %s\\n" "$(GIT_SHA)" "$$GIT_OPTIONAL_LOCKS"\n',
      encoding: "utf8",
      timeout: 15000,
    },
  );
  assert.match(result.trim(), /^[a-f0-9]{40} 0$/u);
  assert.deepEqual(state(), before);
});
