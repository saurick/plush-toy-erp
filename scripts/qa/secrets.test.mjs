import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { scanSecrets } from "./secrets.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function commit(root, message) {
  git(root, ["add", "-A"]);
  git(root, [
    "-c",
    "user.name=Secret Gate Test",
    "-c",
    "user.email=secret-gate@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-qm",
    message,
  ]);
}

async function withRepository(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), "plush-secrets-"));
  try {
    git(root, ["init", "-q"]);
    await writeFile(path.join(root, "base.txt"), "base\n", "utf8");
    commit(root, "base");
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function fakeGitleaks(root) {
  const binDir = path.join(root, "fake-bin");
  await mkdir(binDir, { recursive: true });
  const command = path.join(binDir, "gitleaks");
  await writeFile(
    command,
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "version" ]]; then exit 0; fi
if [[ "\${1:-}" == "git" ]]; then
  shift
  log_opts=""
  while [[ $# -gt 0 ]]; do
    if [[ "$1" == "--log-opts" ]]; then log_opts="$2"; shift 2; continue; fi
    shift
  done
  if git log -p "$log_opts" | grep -q 'GATE_HISTORY_SECRET_MARKER'; then exit 1; fi
  exit 0
fi
exit 0
`,
    "utf8",
  );
  await chmod(command, 0o755);
  return command;
}

test("secret scan fails closed for an invalid range", async () => {
  await withRepository(async (root) => {
    assert.throws(
      () =>
        scanSecrets({
          root,
          mode: "range",
          range: "refs/heads/definitely-missing...HEAD",
        }),
      /git rev-list failed/u,
    );
  });
});

test("gitleaks allowlist is limited to the Atlas checksum path", async () => {
  const config = await readFile(path.join(REPO_ROOT, ".gitleaks.toml"), "utf8");
  assert.match(config, /\[extend\]\s+useDefault = true/u);
  assert.match(config, /\[\[allowlists\]\]/u);
  assert.match(
    config,
    /\(\^\|\/\)server\/internal\/data\/model\/migrate\/atlas\\\.sum\$/u,
  );
  assert.equal((config.match(/atlas\\\.sum/gu) || []).length, 1);
});

test("range mode catches a secret added and deleted within the pushed history", async () => {
  await withRepository(async (root) => {
    const base = git(root, ["rev-parse", "HEAD"]);
    await writeFile(path.join(root, "temporary-secret.txt"), "GATE_HISTORY_SECRET_MARKER\n", "utf8");
    commit(root, "add secret");
    await rm(path.join(root, "temporary-secret.txt"));
    commit(root, "remove secret");

    const result = scanSecrets({
      root,
      mode: "range",
      range: `${base}..HEAD`,
      strict: true,
      gitleaksCommand: await fakeGitleaks(root),
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "history-leak");
  });
});

test("staged mode reads index content and reports only a redacted path and line", async () => {
  await withRepository(async (root) => {
    await writeFile(path.join(root, ".npmrc"), "//registry.example/:_authToken=plain-text-token\n", "utf8");
    git(root, ["add", ".npmrc"]);

    const result = scanSecrets({
      root,
      mode: "staged",
      strict: false,
      gitleaksCommand: path.join(root, "missing-gitleaks"),
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "npm-token");
    assert.deepEqual(result.files, [".npmrc:1"]);
    assert.equal(JSON.stringify(result).includes("plain-text-token"), false);
  });
});
