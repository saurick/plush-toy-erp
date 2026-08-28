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

const HISTORICAL_NUMBERED_DEPLOYMENT_FINGERPRINT = [
  "a971d7d96da1c27c05244542ee220e85615f57d3:scripts/qa/pha",
  "se11-private-deployment-closure.test.mjs:generic-api-key:14",
].join("");

const HISTORICAL_GITLEAKS_FINGERPRINTS = Object.freeze([
  "053cc35b6f7b207519a5de673970a842a6a9c82d:web/.npmrc:generic-api-key:2",
  "053cc35b6f7b207519a5de673970a842a6a9c82d:web/.yarnrc.yml:generic-api-key:6",
  "0f39aabc470ab2cb6d49a90f66748381aa699825:server/internal/data/inventory_repo_txn_test.go:generic-api-key:212",
  "0f39aabc470ab2cb6d49a90f66748381aa699825:server/internal/data/inventory_repo_txn_test.go:generic-api-key:265",
  "178ed06c881a3518c97204430a1bb413820239b2:server/internal/service/jsonrpc_inventory_test.go:generic-api-key:52",
  "23f466677f91a65a0f629dccabd34b8c7b8adbef:docs/product/business-records-data-map-draft.md:generic-api-key:35",
  "2ce5411a819606775431936ac5c67ed0420f2693:server/cmd/server/main_test.go:generic-api-key:185",
  "2ce5411a819606775431936ac5c67ed0420f2693:server/cmd/server/main_test.go:generic-api-key:201",
  "3a94952c7dc40d2a708d3b40b3a572ba73b1eda7:server/cmd/server/main_test.go:generic-api-key:122",
  "3a94952c7dc40d2a708d3b40b3a572ba73b1eda7:server/cmd/server/main_test.go:generic-api-key:137",
  "3a94952c7dc40d2a708d3b40b3a572ba73b1eda7:server/cmd/server/main_test.go:generic-api-key:157",
  "457e67e4079856c43cc4570bdfd9f238a57ec81a:server/cmd/server/main_test.go:generic-api-key:201",
  "457e67e4079856c43cc4570bdfd9f238a57ec81a:server/cmd/server/main_test.go:generic-api-key:217",
  "711441829c84379dc7e1d0aa65a8eaedc27350ac:server/internal/data/operational_fact_repo_test.go:generic-api-key:1340",
  "711441829c84379dc7e1d0aa65a8eaedc27350ac:server/internal/data/operational_fact_repo_test.go:generic-api-key:656",
  "9173b13649e0b8fecbc006ca11bcc0da96c3069f:server/internal/data/inventory_postgres_test.go:generic-api-key:279",
  "a971d7d96da1c27c05244542ee220e85615f57d3:config/private-deployment-template/templateConfig.mjs:generic-api-key:7",
  HISTORICAL_NUMBERED_DEPLOYMENT_FINGERPRINT,
  "a971d7d96da1c27c05244542ee220e85615f57d3:scripts/qa/private-deployment-boundaries.mjs:generic-api-key:39",
  "ed7c69956c874ec7ae1fd961fb2b6f9ec2b6697f:server/cmd/server/main_test.go:generic-api-key:107",
  "fb73523a2d5856e6b74af9d66fe45a9aa54faa3d:server/internal/data/inventory_postgres_test.go:generic-api-key:192",
  "fb73523a2d5856e6b74af9d66fe45a9aa54faa3d:server/internal/data/inventory_postgres_test.go:generic-api-key:209",
  "fb73523a2d5856e6b74af9d66fe45a9aa54faa3d:server/internal/data/inventory_postgres_test.go:generic-api-key:447",
  "fb73523a2d5856e6b74af9d66fe45a9aa54faa3d:server/internal/data/inventory_postgres_test.go:generic-api-key:472",
  "fb73523a2d5856e6b74af9d66fe45a9aa54faa3d:server/internal/data/inventory_postgres_test.go:generic-api-key:491",
  "fb73523a2d5856e6b74af9d66fe45a9aa54faa3d:server/internal/data/inventory_postgres_test.go:generic-api-key:526",
  "fb73523a2d5856e6b74af9d66fe45a9aa54faa3d:server/internal/data/inventory_postgres_test.go:generic-api-key:76",
  "fb73523a2d5856e6b74af9d66fe45a9aa54faa3d:server/internal/data/inventory_postgres_test.go:generic-api-key:92",
  "fb73523a2d5856e6b74af9d66fe45a9aa54faa3d:server/internal/data/inventory_repo_test.go:generic-api-key:636",
  "fb73523a2d5856e6b74af9d66fe45a9aa54faa3d:server/internal/data/inventory_repo_test.go:generic-api-key:689",
]);

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
  history_output="$(git log -p "$log_opts")" || exit 2
  if grep -Fq 'GATE_HISTORY_SECRET_MARKER' <<<"$history_output"; then exit 1; fi
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

test("gitleaks historical baseline contains only exact immutable fingerprints", async () => {
  const baseline = await readFile(
    path.join(REPO_ROOT, ".gitleaksignore"),
    "utf8",
  );
  const fingerprints = baseline
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  assert.equal(fingerprints.length, 30);
  assert.equal(new Set(fingerprints).size, fingerprints.length);
  assert.deepEqual(fingerprints, HISTORICAL_GITLEAKS_FINGERPRINTS);
  for (const fingerprint of fingerprints) {
    assert.match(
      fingerprint,
      /^[0-9a-f]{40}:[^:\r\n]+:generic-api-key:[1-9][0-9]*$/u,
    );
  }
});

test("exact historical baseline does not suppress a new history secret", async () => {
  await withRepository(async (root) => {
    const base = git(root, ["rev-parse", "HEAD"]);
    await writeFile(
      path.join(root, "temporary-secret.txt"),
      "GATE_HISTORY_SECRET_MARKER\n",
      "utf8",
    );
    commit(root, "add secret");
    await rm(path.join(root, "temporary-secret.txt"));
    commit(root, "remove secret");

    const baseline = await readFile(
      path.join(REPO_ROOT, ".gitleaksignore"),
      "utf8",
    );
    assert.equal(baseline.includes("GATE_HISTORY_SECRET_MARKER"), false);

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
    await writeFile(
      path.join(root, ".npmrc"),
      "//registry.example/:_authToken=plain-text-token\n",
      "utf8",
    );
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
