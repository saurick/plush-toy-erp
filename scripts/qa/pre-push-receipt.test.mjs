import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  PROFILE_REQUIRED_EXECUTABLES,
  PROFILE_REQUIRED_FILES,
} from "./gate-profiles.mjs";
import {
  PRE_PUSH_RECEIPT_TTL_MS,
  environmentFingerprint,
  resolveReceiptState,
} from "./pre-push-receipt.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ZERO_SHA = "0".repeat(40);

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
}

function commit(root, message, { allowEmpty = false } = {}) {
  git(root, ["add", "-A"]);
  const args = [
    "-c",
    "user.name=Receipt Test",
    "-c",
    "user.email=receipt@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-qm",
    message,
  ];
  if (allowEmpty) args.push("--allow-empty");
  git(root, args);
  return git(root, ["rev-parse", "HEAD"]);
}

function materializeFullProfile(root) {
  const executables = new Set(PROFILE_REQUIRED_EXECUTABLES.full);
  for (const file of PROFILE_REQUIRED_FILES.full) {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(
      target,
      file === "web/package.json"
        ? '{"scripts":{"test":"node --test"}}\n'
        : executables.has(file)
          ? "#!/usr/bin/env bash\nset -euo pipefail\nexit 0\n"
          : "fixture\n",
      "utf8",
    );
    if (executables.has(file)) chmodSync(target, 0o755);
  }
}

function installRealReceiptFiles(root) {
  for (const file of [
    ".githooks/pre-push",
    "scripts/qa/gate-profiles.mjs",
    "scripts/qa/pre-push-receipt.mjs",
    "scripts/qa/prepare-push.sh",
    "scripts/git-hooks/pre-push.sh",
  ]) {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(ROOT, file), target);
  }
  chmodSync(path.join(root, ".githooks/pre-push"), 0o755);
  chmodSync(path.join(root, "scripts/qa/prepare-push.sh"), 0o755);
  chmodSync(path.join(root, "scripts/git-hooks/pre-push.sh"), 0o755);
}

function installGateStubs(root) {
  writeFileSync(
    path.join(root, "scripts/qa/full.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
git_dir="$(git rev-parse --git-dir)"
printf '%s\\n' "\${QA_BASE_RANGE:-default}" >> "$git_dir/full-ranges.txt"
if [[ "\${FAIL_FULL:-0}" == "1" ]]; then exit 9; fi
if [[ "\${MUTATE_FULL_DIRTY:-0}" == "1" ]]; then printf 'dirty\\n' >> tracked.txt; fi
if [[ "\${MUTATE_FULL_HEAD:-0}" == "1" ]]; then
  git -c user.name=Fixture -c user.email=fixture@example.invalid -c commit.gpgsign=false commit --allow-empty -qm moved-head
fi
if [[ "\${MUTATE_REMOTE:-0}" == "1" ]]; then git push --quiet origin HEAD:refs/heads/main; fi
`,
    "utf8",
  );
  writeFileSync(
    path.join(root, "scripts/qa/secrets.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
git_dir="$(git rev-parse --git-dir)"
printf '%s\\n' "\${QA_BASE_RANGE:-default}" >> "$git_dir/secret-ranges.txt"
if [[ "\${FAIL_RANGE:-}" == "\${QA_BASE_RANGE:-default}" ]]; then exit 8; fi
`,
    "utf8",
  );
  chmodSync(path.join(root, "scripts/qa/full.sh"), 0o755);
  chmodSync(path.join(root, "scripts/qa/secrets.sh"), 0o755);
}

function cleanEnvironment(overrides = {}) {
  const env = { ...process.env, ...overrides };
  for (const key of [
    "QA_BASE_RANGE",
    "QA_GATE_COVERAGE_RECEIPT",
    "QA_GATE_ORCHESTRATOR",
    "SKIP_PRE_PUSH",
    "SKIP_DB_GUARD",
    "SKIP_ERROR_CODE_SYNC",
    "SKIP_ERROR_CODE_GUARD",
    "ERROR_CODE_GUARD_STAGED_ONLY",
    "SKIP_SECRETS_SCAN",
    "SECRETS_STAGED_ONLY",
    "SKIP_GOVULNCHECK",
    "STRICT_SKIP_SHELLCHECK",
    "STRICT_SKIP_SHFMT",
    "STRICT_SKIP_GOVULNCHECK",
    "STYLE_L1_BASE_URL",
    "FAIL_FULL",
    "MUTATE_FULL_DIRTY",
    "MUTATE_FULL_HEAD",
    "MUTATE_REMOTE",
    "FAIL_RANGE",
    "QA_BROWSER_SCENARIOS",
  ]) {
    if (!(key in overrides)) delete env[key];
  }
  return env;
}

function createFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-receipt-repo-"));
  const remote = mkdtempSync(path.join(os.tmpdir(), "plush-receipt-remote-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(remote, ["init", "--bare", "-q"]);
  git(root, ["remote", "add", "origin", remote]);
  materializeFullProfile(root);
  installRealReceiptFiles(root);
  installGateStubs(root);
  writeFileSync(path.join(root, "tracked.txt"), "base\n", "utf8");
  const remoteSha = commit(root, "base");
  git(root, [
    "-c",
    "core.hooksPath=/dev/null",
    "push",
    "--quiet",
    "origin",
    `${remoteSha}:refs/heads/main`,
  ]);
  writeFileSync(path.join(root, "tracked.txt"), "head\n", "utf8");
  const localSha = commit(root, "head");
  return {
    root,
    remote,
    remoteSha,
    localSha,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
      rmSync(remote, { recursive: true, force: true });
    },
  };
}

function runPrepare(root, args = [], env = cleanEnvironment()) {
  return spawnSync("bash", ["scripts/qa/prepare-push.sh", ...args], {
    cwd: root,
    env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

function runHook(
  fixture,
  {
    input = `refs/heads/main ${fixture.localSha} refs/heads/main ${fixture.remoteSha}\n`,
    env = cleanEnvironment(),
  } = {},
) {
  return spawnSync(
    "bash",
    ["scripts/git-hooks/pre-push.sh", "origin", fixture.remote],
    {
      cwd: fixture.root,
      input,
      env,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    },
  );
}

function runRealGitPush(fixture, { env = cleanEnvironment() } = {}) {
  git(fixture.root, [
    "config",
    "core.hooksPath",
    path.join(fixture.root, ".githooks"),
  ]);
  return spawnSync("git", ["push", "--porcelain", "origin", "main"], {
    cwd: fixture.root,
    env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

function gitStateFile(root, name) {
  return path.join(root, ".git", name);
}

function readLines(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function resignReceipt(state, mutate) {
  const receipt = JSON.parse(readFileSync(state.receiptPath, "utf8"));
  mutate(receipt);
  const { signature: _signature, ...payload } = receipt;
  const key = readFileSync(state.keyPath);
  receipt.signature = {
    contract: "hmac-sha256/v1",
    keyId: receipt.signature.keyId,
    value: createHmac("sha256", key)
      .update(JSON.stringify(stableValue(payload)))
      .digest("hex"),
  };
  writeFileSync(state.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    mode: 0o600,
  });
}

test("prepare wrapper exposes help without running full or creating receipt state", () => {
  const fixture = createFixture();
  try {
    const result = runPrepare(fixture.root, ["--help"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /prepare-push\.sh/u);
    assert.equal(existsSync(gitStateFile(fixture.root, "full-ranges.txt")), false);
    assert.equal(existsSync(path.join(fixture.root, ".git", "plush-qa")), false);
  } finally {
    fixture.cleanup();
  }
});

test("prepare runs full once before push and hook only runs live range gates", () => {
  const fixture = createFixture();
  try {
    const prepared = runPrepare(fixture.root);
    assert.equal(prepared.status, 0, prepared.stderr || prepared.stdout);
    const state = resolveReceiptState(fixture.root);
    assert.equal(existsSync(state.receiptPath), true);
    assert.equal(existsSync(state.keyPath), true);
    assert.equal(statSync(state.receiptPath).mode & 0o777, 0o600);
    assert.equal(statSync(state.keyPath).mode & 0o777, 0o600);
    assert.equal(path.relative(state.commonDir, state.receiptPath).startsWith(".."), false);
    assert.equal(readLines(gitStateFile(fixture.root, "full-ranges.txt")).length, 1);

    const pushed = runHook(fixture);
    assert.equal(pushed.status, 0, pushed.stderr || pushed.stdout);
    assert.match(pushed.stdout, /coverage=receipt\+live-range-secrets/u);
    assert.deepEqual(readLines(gitStateFile(fixture.root, "full-ranges.txt")), [
      `${fixture.remoteSha}..${fixture.localSha}`,
    ]);
    assert.deepEqual(readLines(gitStateFile(fixture.root, "secret-ranges.txt")), [
      `${fixture.remoteSha}..${fixture.localSha}`,
    ]);
    assert.equal(
      readdirSync(state.stateDir).some((file) => file.endsWith(".tmp")),
      false,
    );
  } finally {
    fixture.cleanup();
  }
});

test("a real Git push PATH prefix preserves the prepared environment", () => {
  const fixture = createFixture();
  try {
    const env = cleanEnvironment();
    const gitExecPath = git(fixture.root, ["--exec-path"]);
    const baseline = environmentFingerprint(fixture.root, env);
    assert.equal(
      environmentFingerprint(fixture.root, {
        ...env,
        PATH: `${gitExecPath}${path.delimiter}${env.PATH}`,
      }),
      baseline,
    );
    assert.notEqual(
      environmentFingerprint(fixture.root, {
        ...env,
        PATH: `${fixture.root}${path.delimiter}${env.PATH}`,
      }),
      baseline,
    );

    const prepared = runPrepare(fixture.root, [], env);
    assert.equal(prepared.status, 0, prepared.stderr || prepared.stdout);
    const pushed = runRealGitPush(fixture, { env });
    assert.equal(pushed.status, 0, pushed.stderr || pushed.stdout);
    assert.deepEqual(readLines(gitStateFile(fixture.root, "full-ranges.txt")), [
      `${fixture.remoteSha}..${fixture.localSha}`,
    ]);
    assert.deepEqual(readLines(gitStateFile(fixture.root, "secret-ranges.txt")), [
      `${fixture.remoteSha}..${fixture.localSha}`,
    ]);
    assert.equal(
      git(fixture.remote, ["rev-parse", "refs/heads/main"]),
      fixture.localSha,
    );
  } finally {
    fixture.cleanup();
  }
});

test("hook without a receipt fails fast and never opens the full fallback", () => {
  const fixture = createFixture();
  try {
    const pushed = runHook(fixture);
    assert.equal(pushed.status, 2, pushed.stderr || pushed.stdout);
    assert.match(pushed.stderr, /reason=receipt_missing/u);
    assert.equal(existsSync(gitStateFile(fixture.root, "full-ranges.txt")), false);
    assert.equal(existsSync(gitStateFile(fixture.root, "secret-ranges.txt")), false);
  } finally {
    fixture.cleanup();
  }
});

test("detached HEAD requires an explicit ref plan before full can run", () => {
  const fixture = createFixture();
  try {
    git(fixture.root, ["checkout", "--detach", "-q", fixture.localSha]);
    const prepared = runPrepare(fixture.root);
    assert.equal(prepared.status, 2, prepared.stderr || prepared.stdout);
    assert.match(prepared.stderr, /reason=detached_head_requires_refspec/u);
    assert.equal(existsSync(gitStateFile(fixture.root, "full-ranges.txt")), false);
  } finally {
    fixture.cleanup();
  }
});

test("receipt state cannot escape the Git common directory through a symlink", () => {
  const fixture = createFixture();
  const outside = mkdtempSync(path.join(os.tmpdir(), "plush-receipt-outside-"));
  try {
    symlinkSync(outside, path.join(fixture.root, ".git", "plush-qa"), "dir");
    const prepared = runPrepare(fixture.root);
    assert.equal(prepared.status, 2, prepared.stderr || prepared.stdout);
    assert.match(prepared.stderr, /reason=unsafe_receipt_state_path/u);
    assert.equal(existsSync(gitStateFile(fixture.root, "full-ranges.txt")), false);
    assert.deepEqual(readdirSync(outside), []);
  } finally {
    fixture.cleanup();
    rmSync(outside, { recursive: true, force: true });
  }
});

test("new and existing refs bind one exact aggregate receipt and scan every live range", () => {
  const fixture = createFixture();
  try {
    const refspecs = [
      "--ref",
      "refs/heads/main:refs/heads/main",
      "--ref",
      "refs/heads/main:refs/heads/new",
    ];
    const prepared = runPrepare(fixture.root, refspecs);
    assert.equal(prepared.status, 0, prepared.stderr || prepared.stdout);
    const emptyTree = git(fixture.root, ["hash-object", "-t", "tree", "/dev/null"]);
    assert.deepEqual(readLines(gitStateFile(fixture.root, "full-ranges.txt")), [
      `${emptyTree}..${fixture.localSha}`,
    ]);

    const input = [
      `refs/heads/main ${fixture.localSha} refs/heads/main ${fixture.remoteSha}`,
      `refs/heads/main ${fixture.localSha} refs/heads/new ${ZERO_SHA}`,
      "",
    ].join("\n");
    const pushed = runHook(fixture, { input });
    assert.equal(pushed.status, 0, pushed.stderr || pushed.stdout);
    assert.deepEqual(readLines(gitStateFile(fixture.root, "secret-ranges.txt")), [
      `${fixture.remoteSha}..${fixture.localSha}`,
      fixture.localSha,
    ]);
  } finally {
    fixture.cleanup();
  }
});

test("failed or moving full never leaves a green receipt", () => {
  for (const [name, overrides, reason] of [
    ["full failure", { FAIL_FULL: "1" }, "full_gate_failed"],
    [
      "dirty after full",
      { MUTATE_FULL_DIRTY: "1" },
      "worktree_changed_during_full",
    ],
    [
      "HEAD changed after full",
      { MUTATE_FULL_HEAD: "1" },
      "head_changed_during_full",
    ],
    [
      "remote changed after full",
      { MUTATE_REMOTE: "1" },
      "remote_changed_during_full",
    ],
  ]) {
    const fixture = createFixture();
    try {
      const result = runPrepare(
        fixture.root,
        [],
        cleanEnvironment(overrides),
      );
      assert.notEqual(result.status, 0, name);
      assert.match(result.stderr, new RegExp(`reason=${reason}`, "u"), name);
      const state = resolveReceiptState(fixture.root);
      assert.equal(existsSync(state.receiptPath), false, name);
    } finally {
      fixture.cleanup();
    }
  }
});

test("receipt rejects tampering, expiry, environment drift, and actual range drift", () => {
  for (const scenario of ["tamper", "expired", "environment", "range"]) {
    const fixture = createFixture();
    try {
      const prepared = runPrepare(fixture.root);
      assert.equal(prepared.status, 0, prepared.stderr || prepared.stdout);
      const state = resolveReceiptState(fixture.root);
      let input;
      let env = cleanEnvironment();
      if (scenario === "tamper") {
        const receipt = JSON.parse(readFileSync(state.receiptPath, "utf8"));
        receipt.push.aggregateRange = fixture.localSha;
        writeFileSync(state.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
          mode: 0o600,
        });
      } else if (scenario === "expired") {
        resignReceipt(state, (receipt) => {
          receipt.issuedAtMs = Date.now() - PRE_PUSH_RECEIPT_TTL_MS - 1_000;
          receipt.expiresAtMs = receipt.issuedAtMs + PRE_PUSH_RECEIPT_TTL_MS;
        });
      } else if (scenario === "environment") {
        env = cleanEnvironment({ QA_BROWSER_SCENARIOS: "changed-after-full" });
      } else {
        input = `refs/heads/main ${fixture.localSha} refs/heads/main ${ZERO_SHA}\n`;
      }
      const pushed = runHook(fixture, { input, env });
      assert.equal(pushed.status, 2, `${scenario}: ${pushed.stderr || pushed.stdout}`);
      assert.match(
        pushed.stderr,
        /reason=receipt_(?:signature_invalid|expired|environment_mismatch|push_range_mismatch)/u,
        scenario,
      );
      assert.equal(
        existsSync(gitStateFile(fixture.root, "secret-ranges.txt")),
        false,
        scenario,
      );
    } finally {
      fixture.cleanup();
    }
  }
});

test("HEAD changes, dirty worktrees, and a held lock invalidate reuse", () => {
  for (const scenario of ["head", "dirty", "lock"]) {
    const fixture = createFixture();
    try {
      const prepared = runPrepare(fixture.root);
      assert.equal(prepared.status, 0, prepared.stderr || prepared.stdout);
      const state = resolveReceiptState(fixture.root);
      let input;
      if (scenario === "head") {
        const newHead = commit(fixture.root, "new HEAD", { allowEmpty: true });
        input = `refs/heads/main ${newHead} refs/heads/main ${fixture.remoteSha}\n`;
      } else if (scenario === "dirty") {
        writeFileSync(path.join(fixture.root, "untracked.txt"), "dirty\n", "utf8");
      } else {
        mkdirSync(state.lockPath, { mode: 0o700 });
        writeFileSync(
          path.join(state.lockPath, "owner.json"),
          `${JSON.stringify({ pid: process.pid, purpose: "fixture", token: "live-owner" })}\n`,
          "utf8",
        );
      }
      const pushed = runHook(fixture, { input });
      assert.equal(pushed.status, 2, `${scenario}: ${pushed.stderr || pushed.stdout}`);
      assert.match(
        pushed.stderr,
        /reason=(?:receipt_repository_mismatch|dirty_worktree|receipt_lock_held)/u,
        scenario,
      );
    } finally {
      fixture.cleanup();
    }
  }
});

test("a lock owned by a confirmed dead PID is recovered before full", () => {
  const fixture = createFixture();
  try {
    const state = resolveReceiptState(fixture.root);
    mkdirSync(state.lockPath, { mode: 0o700 });
    writeFileSync(
      path.join(state.lockPath, "owner.json"),
      '{"pid":2147483647,"purpose":"interrupted-full","token":"stale-owner"}\n',
      "utf8",
    );
    const prepared = runPrepare(fixture.root);
    assert.equal(prepared.status, 0, prepared.stderr || prepared.stdout);
    assert.equal(existsSync(state.lockPath), false);
    assert.deepEqual(readLines(gitStateFile(fixture.root, "full-ranges.txt")), [
      `${fixture.remoteSha}..${fixture.localSha}`,
    ]);
  } finally {
    fixture.cleanup();
  }
});

test("live log and strict secret failures still block a valid receipt", () => {
  for (const scenario of ["log", "secrets"]) {
    const fixture = createFixture();
    try {
      if (scenario === "log") {
        writeFileSync(path.join(fixture.root, "bad.txt"), "trailing whitespace  \n");
        fixture.localSha = commit(fixture.root, "bad whitespace");
      }
      const prepared = runPrepare(fixture.root);
      assert.equal(prepared.status, 0, prepared.stderr || prepared.stdout);
      const exactRange = `${fixture.remoteSha}..${fixture.localSha}`;
      const env =
        scenario === "secrets"
          ? cleanEnvironment({ FAIL_RANGE: exactRange })
          : cleanEnvironment();
      const pushed = runHook(fixture, { env });
      assert.notEqual(pushed.status, 0, scenario);
      assert.doesNotMatch(pushed.stdout, /status=complete/u);
      if (scenario === "secrets") {
        assert.match(pushed.stderr, /reason=push_range_secrets_failed/u);
      } else {
        assert.match(pushed.stderr, /reason=git_log_check_failed/u);
      }
    } finally {
      fixture.cleanup();
    }
  }
});

test("delete-only and empty stdin are cheap no-ops while mixed updates fail closed", () => {
  const fixture = createFixture();
  try {
    const empty = runHook(fixture, { input: "" });
    assert.equal(empty.status, 0, empty.stderr || empty.stdout);
    assert.match(empty.stdout, /coverage=no-op-stdin/u);

    const deletion = runHook(fixture, {
      input: `(delete) ${ZERO_SHA} refs/heads/old ${fixture.remoteSha}\n`,
    });
    assert.equal(deletion.status, 0, deletion.stderr || deletion.stdout);
    assert.match(deletion.stdout, /coverage=delete-only/u);

    const mixed = runHook(fixture, {
      input: [
        `refs/heads/main ${fixture.localSha} refs/heads/main ${fixture.remoteSha}`,
        `(delete) ${ZERO_SHA} refs/heads/old ${fixture.remoteSha}`,
        "",
      ].join("\n"),
    });
    assert.equal(mixed.status, 2, mixed.stderr || mixed.stdout);
    assert.match(mixed.stderr, /reason=mixed_delete_update_unsupported/u);
  } finally {
    fixture.cleanup();
  }
});

test("caller skip and synthetic receipt environments are rejected, not treated as cache", () => {
  const fixture = createFixture();
  try {
    const prepared = runPrepare(fixture.root);
    assert.equal(prepared.status, 0, prepared.stderr || prepared.stdout);
    const state = resolveReceiptState(fixture.root);
    assert.equal(existsSync(state.receiptPath), true);

    for (const [index, variable] of [
      "SKIP_PRE_PUSH",
      "SKIP_FUTURE_GATE",
      "QA_GATE_COVERAGE_RECEIPT",
      "QA_GATE_ORCHESTRATOR",
      "QA_BASE_RANGE",
      "PRE_PUSH_RECEIPT_PATH",
    ].entries()) {
      if (index > 0) {
        const refreshed = runPrepare(fixture.root);
        assert.equal(refreshed.status, 0, refreshed.stderr || refreshed.stdout);
      }
      const result = runPrepare(
        fixture.root,
        [],
        cleanEnvironment({ [variable]: "forged" }),
      );
      assert.equal(result.status, 2, variable);
      assert.match(result.stderr, /reason=forbidden_environment/u, variable);
      assert.match(result.stderr, new RegExp(`variable=${variable}`, "u"), variable);
      assert.equal(existsSync(state.receiptPath), false, variable);
    }
    const source = readFileSync(
      path.join(ROOT, "scripts/qa/pre-push-receipt.mjs"),
      "utf8",
    );
    assert.doesNotMatch(source, /--receipt(?:-path)?\b/u);
    assert.doesNotMatch(source, /process\.env\.PRE_PUSH_RECEIPT_/u);
  } finally {
    fixture.cleanup();
  }
});
