import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./agents-size.sh", import.meta.url));
const ENV = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  ),
  GIT_OPTIONAL_LOCKS: "0",
};

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-agents-size-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", ["-C", root, ...args], { env: ENV, stdio: "pipe" });
  git("init", "-q");
  const script = path.join(root, "scripts/qa/agents-size.sh");
  mkdirSync(path.dirname(script), { recursive: true });
  copyFileSync(SCRIPT, script);
  const write = (relative, contents) => {
    const file = path.join(root, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, contents);
    return file;
  };
  const run = (env = {}) =>
    spawnSync("bash", [script], {
      cwd: os.tmpdir(),
      env: { ...ENV, ...env },
      encoding: "utf8",
      timeout: 15000,
    });
  return { root, git, write, run };
}

test("agents size checks tracked and new rules while excluding ignored copies", (t) => {
  const { git, write, run } = fixture(t);
  write(".gitignore", "output/\nnode_modules/\nvendor/\nignored-copies/\n");
  write("AGENTS.md", "# Project rules\n");
  git("add", "AGENTS.md");
  write("active module/AGENTS.md", "# New scoped rules\n");
  for (const directory of [
    "output/before",
    "node_modules/example",
    "vendor/example",
    "ignored-copies",
  ]) {
    write(`${directory}/AGENTS.md`, "x".repeat(32 * 1024));
  }

  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim().split("\n").length, 2);
  assert.match(result.stdout, /通过: AGENTS\.md/u);
  assert.match(result.stdout, /通过: active module\/AGENTS\.md/u);
  assert.doesNotMatch(
    result.stdout,
    /output|node_modules|vendor|ignored-copies/u,
  );
});

test("agents size uses worktree byte thresholds without changing index or an existing lock", (t) => {
  const { root, git, write, run } = fixture(t);
  write("AGENTS.md", "# Staged rules\n");
  git("add", "AGENTS.md");
  const index = path.join(root, ".git/index");
  const before = {
    bytes: readFileSync(index),
    mtime: statSync(index, { bigint: true }).mtimeNs,
  };
  const lock = write(".git/index.lock", "another operation\n");

  for (const [size, status, verdict] of [
    [24 * 1024 - 1, 0, "通过"],
    [24 * 1024, 0, "预警"],
    [32 * 1024 - 1, 0, "预警"],
    [32 * 1024, 1, "阻断"],
  ]) {
    const contents = "中".repeat(Math.floor(size / 3)) + "x".repeat(size % 3);
    write("AGENTS.md", contents);
    const result = run();
    assert.equal(result.status, status, result.stderr);
    assert(
      result.stdout.includes(`${verdict}: AGENTS.md 为 ${size} bytes`),
      result.stdout,
    );
    assert.equal(readFileSync(path.join(root, "AGENTS.md"), "utf8"), contents);
    assert.deepEqual(
      {
        bytes: readFileSync(index),
        mtime: statSync(index, { bigint: true }).mtimeNs,
      },
      before,
    );
    assert.equal(readFileSync(lock, "utf8"), "another operation\n");
  }
});

test("agents size skips deleted tracked rules", (t) => {
  const { root, git, write, run } = fixture(t);
  write("AGENTS.md", "# Active rules\n");
  write("retired/AGENTS.md", "x".repeat(32 * 1024));
  git("add", "AGENTS.md", "retired/AGENTS.md");
  rmSync(path.join(root, "retired/AGENTS.md"));
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /通过: AGENTS\.md/u);
  assert.doesNotMatch(result.stdout, /retired/u);
});

test("agents size propagates Git enumeration failure", (t) => {
  const { root, write, run } = fixture(t);
  const fakeGit = write("bin/git", "#!/usr/bin/env bash\nexit 42\n");
  chmodSync(fakeGit, 0o755);
  const result = run({
    PATH: `${path.join(root, "bin")}${path.delimiter}${ENV.PATH}`,
  });
  assert.equal(result.status, 42, result.stderr);
  assert.equal(result.stdout, "");
});
