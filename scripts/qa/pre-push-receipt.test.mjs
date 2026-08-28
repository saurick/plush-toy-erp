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
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import {
  PROFILE_REQUIRED_EXECUTABLES,
  PROFILE_REQUIRED_FILES,
} from "./gate-profiles.mjs";
import {
  PRE_PUSH_RECEIPT_TTL_MS,
  REMOTE_REF_QUERY_TIMEOUT_MS,
  REVIEW_PUSH_LOCAL_REF,
  REVIEW_PUSH_REMOTE_REF,
  environmentFingerprint,
  resolveReceiptState,
  runRemoteRefQueryWithRetry,
} from "./pre-push-receipt.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
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
    "scripts/qa/dev-workbench-receipt.mjs",
    "scripts/qa/affected.mjs",
    "scripts/qa/gate-profiles.mjs",
    "scripts/qa/pre-push-receipt.mjs",
    "scripts/qa/prepare-push.sh",
    "scripts/qa/run-gate-with-receipt.mjs",
    "scripts/qa/lib/git-range.mjs",
    "scripts/qa/lib/repository-identity.mjs",
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
    path.join(root, "scripts/qa/affected.mjs"),
    `#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function buildAffectedPlan(files) {
  const changedFiles = [...new Set(files)].sort();
  const focused = changedFiles.length > 0 && changedFiles.every((file) => file.endsWith(".md"));
  return {
    changedFiles,
    affectedScopes: focused ? ["T0", "T1"] : ["T0"],
    maxAffectedScope: focused ? "T1" : "T0",
    commands: focused
      ? [{ id: "docs", scope: "T1", cwd: ".", bin: "node", args: ["--version"], reasons: changedFiles }]
      : [{ id: "full", scope: "LOCAL_FULL", cwd: ".", bin: "bash", args: ["scripts/qa/full.sh"], reasons: changedFiles }],
    followUps: [],
    localGate: focused ? "focused" : "full",
    prePushGate: "bash scripts/qa/prepare-push.sh",
  };
}

export function selectPrePushProfile(plan, { forceFull = false } = {}) {
  const recommendedProfile = plan.localGate === "full" ? "full" : "affected";
  const profile = forceFull ? "full" : recommendedProfile;
  return {
    profile,
    recommendedProfile,
    requiresFullConfirmation: recommendedProfile === "full" && !forceFull,
    requiresManagedDatabase: profile === "full",
    reasons: recommendedProfile === "full" ? ["local_gate_full"] : forceFull ? ["explicit_full"] : [],
  };
}

function main() {
  const args = process.argv.slice(2);
  const range = args[args.indexOf("--base") + 1] || "default";
  const gitDir = execFileSync("git", ["rev-parse", "--git-dir"], { encoding: "utf8" }).trim();
  appendFileSync(path.join(gitDir, "affected-ranges.txt"), range + "\\n");
  if (process.env.FAIL_AFFECTED === "1") process.exit(9);
  if (process.env.MUTATE_AFFECTED_DIRTY === "1") writeFileSync("affected-dirty.txt", "dirty\\n");
  console.log("[qa:affected] status=complete");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
`,
    "utf8",
  );
  writeFileSync(
    path.join(root, "scripts/qa/full.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
git_dir="$(git rev-parse --git-dir)"
printf '%s\\n' "\${QA_BASE_RANGE:-default}" >> "$git_dir/full-ranges.txt"
printf '%s\\n' "\${QA_DB_GUARD_RANGE:-default}" >> "$git_dir/db-guard-ranges.txt"
if [[ "\${FAIL_FULL:-0}" == "1" ]]; then exit 9; fi
if [[ "\${MUTATE_FULL_DIRTY:-0}" == "1" ]]; then printf 'dirty\\n' >> tracked.txt; fi
if [[ "\${MUTATE_FULL_HEAD:-0}" == "1" ]]; then
  git -c user.name=Fixture -c user.email=fixture@example.invalid -c commit.gpgsign=false commit --allow-empty -qm moved-head
fi
if [[ "\${MUTATE_REMOTE:-0}" == "1" ]]; then git push --quiet origin HEAD:refs/heads/main; fi
for stage in environment_profile shared secrets web server resource_sensitive_node critical_postgres browser govulncheck; do
  printf '%s\\n' "[qa:stage] gate=full id=\$stage status=passed durationMs=1"
done
printf '%s\\n' '[qa:parallel] gate=full ids=shared,web,server status=passed durationMs=1'
printf '%s\\n' '[qa:test-gate] status=complete tests=1 pass=1 fail=0 skipped=0'
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
  const env = { ...STABLE_RECEIPT_TOOLS.env, ...overrides };
  for (const key of [
    "QA_BASE_RANGE",
    "QA_DB_GUARD_RANGE",
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
    "FAIL_AFFECTED",
    "MUTATE_AFFECTED_DIRTY",
    "MUTATE_FULL_DIRTY",
    "MUTATE_FULL_HEAD",
    "MUTATE_REMOTE",
    "FAIL_RANGE",
    "QA_BROWSER_SCENARIOS",
  ]) {
    if (!(key in overrides)) delete env[key];
  }
  if (!("DISPOSABLE_DATABASE_BASE_URL" in overrides)) {
    env.DISPOSABLE_DATABASE_BASE_URL =
      "postgres://postgres:fixture-password@127.0.0.1:55439/postgres?sslmode=disable";
  }
  return env;
}

function createStableReceiptEnvironment(baseEnvironment) {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-receipt-tools-"));
  const bin = path.join(root, "bin");
  mkdirSync(bin, { recursive: true });
  const gitExecutable = execFileSync(
    "/bin/sh",
    ["-c", "command -v git"],
    {
      encoding: "utf8",
      env: baseEnvironment,
    },
  ).trim();
  assert.equal(path.isAbsolute(gitExecutable), true);
  symlinkSync(gitExecutable, path.join(bin, "git"));
  for (const command of [
    "atlas",
    "gitleaks",
    "go",
    "govulncheck",
    "pnpm",
    "psql",
  ]) {
    const executable = path.join(bin, command);
    writeFileSync(
      executable,
      `#!/bin/sh\nprintf '%s\\n' '${command} stable-test-version'\n`,
      "utf8",
    );
    chmodSync(executable, 0o755);
  }
  return {
    env: {
      ...baseEnvironment,
      PATH: `${bin}${path.delimiter}${baseEnvironment.PATH}`,
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

const STABLE_RECEIPT_TOOLS = createStableReceiptEnvironment(process.env);
after(() => STABLE_RECEIPT_TOOLS.cleanup());

function createFixture({ changePath = "tracked.txt" } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-receipt-repo-"));
  const remote = mkdtempSync(path.join(os.tmpdir(), "plush-receipt-remote-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(remote, ["init", "--bare", "-q"]);
  git(root, ["remote", "add", "origin", remote]);
  materializeFullProfile(root);
  installRealReceiptFiles(root);
  installGateStubs(root);
  mkdirSync(path.dirname(path.join(root, changePath)), { recursive: true });
  writeFileSync(path.join(root, changePath), "base\n", "utf8");
  const remoteSha = commit(root, "base");
  git(root, [
    "-c",
    "core.hooksPath=/dev/null",
    "push",
    "--quiet",
    "origin",
    `${remoteSha}:refs/heads/main`,
  ]);
  writeFileSync(path.join(root, changePath), "head\n", "utf8");
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

function runPrepare(root, args = ["--full"], env = cleanEnvironment()) {
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
    remoteName = "origin",
    remoteLocation = fixture.remote,
  } = {},
) {
  return spawnSync(
    "bash",
    ["scripts/git-hooks/pre-push.sh", remoteName, remoteLocation],
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

function runRealGitReviewPush(fixture, { env = cleanEnvironment() } = {}) {
  git(fixture.root, [
    "config",
    "core.hooksPath",
    path.join(fixture.root, ".githooks"),
  ]);
  return spawnSync(
    "git",
    [
      "push",
      "--porcelain",
      "origin",
      `${REVIEW_PUSH_LOCAL_REF}:${REVIEW_PUSH_REMOTE_REF}`,
    ],
    {
      cwd: fixture.root,
      env,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    },
  );
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

test("remote ref query retries only bounded transient transport failures", () => {
  const attempts = [];
  const delays = [];
  const result = runRemoteRefQueryWithRetry(
    "/repo",
    ["ls-remote", "--refs", "origin", "refs/heads/main"],
    {
      runner(_root, args, options) {
        attempts.push({ args, options });
        if (attempts.length < 3) {
          throw Object.assign(new Error("transient"), {
            detail:
              attempts.length === 1
                ? "git ls-remote failed: Connection to host port 443 timed out"
                : "git ls-remote failed: spawnSync git ETIMEDOUT",
            reason: "remote_ref_query_failed",
          });
        }
        return `${"a".repeat(40)}\trefs/heads/main\n`;
      },
      wait: (delayMs) => delays.push(delayMs),
    },
  );
  assert.equal(result, `${"a".repeat(40)}\trefs/heads/main\n`);
  assert.equal(attempts.length, 3);
  assert.deepEqual(delays, [250, 750]);
  assert.deepEqual(attempts[0].options, {
    reason: "remote_ref_query_failed",
    timeout: REMOTE_REF_QUERY_TIMEOUT_MS,
  });

  let authorizationAttempts = 0;
  assert.throws(
    () =>
      runRemoteRefQueryWithRetry("/repo", ["ls-remote", "origin"], {
        runner() {
          authorizationAttempts += 1;
          throw Object.assign(new Error("denied"), {
            detail: "git ls-remote failed: Permission denied (publickey)",
            reason: "remote_ref_query_failed",
          });
        },
        wait: () => assert.fail("authorization failures must not retry"),
      }),
    /denied/u,
  );
  assert.equal(authorizationAttempts, 1);
});

test("prepare wrapper exposes help without running full or creating receipt state", () => {
  const fixture = createFixture();
  try {
    const result = runPrepare(fixture.root, ["--help"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /prepare-push\.sh/u);
    assert.equal(
      existsSync(gitStateFile(fixture.root, "full-ranges.txt")),
      false,
    );
    assert.equal(
      existsSync(path.join(fixture.root, ".git", "plush-qa")),
      false,
    );
  } finally {
    fixture.cleanup();
  }
});

test("focused changes run affected once and reuse the exact-range receipt", () => {
  const fixture = createFixture({ changePath: "docs/guide.md" });
  try {
    const env = cleanEnvironment({ DISPOSABLE_DATABASE_BASE_URL: "" });
    const first = runPrepare(fixture.root, [], env);
    assert.equal(first.status, 0, first.stderr || first.stdout);
    assert.match(first.stdout, /status=complete profile=affected/u);
    const state = resolveReceiptState(fixture.root);
    const receipt = JSON.parse(readFileSync(state.receiptPath, "utf8"));
    assert.equal(receipt.gate.profile, "affected");
    assert.equal(receipt.gate.recommendedProfile, "affected");
    assert.deepEqual(
      readLines(gitStateFile(fixture.root, "affected-ranges.txt")),
      [`${fixture.remoteSha}..${fixture.localSha}`],
    );
    assert.equal(
      existsSync(gitStateFile(fixture.root, "full-ranges.txt")),
      false,
    );

    const second = runPrepare(fixture.root, [], env);
    assert.equal(second.status, 0, second.stderr || second.stdout);
    assert.match(second.stdout, /status=reused profile=affected/u);
    assert.equal(
      readLines(gitStateFile(fixture.root, "affected-ranges.txt")).length,
      1,
    );

    const pushed = runHook(fixture, { env });
    assert.equal(pushed.status, 0, pushed.stderr || pushed.stdout);
    assert.match(pushed.stdout, /coverage=receipt\+live-range-secrets/u);
  } finally {
    fixture.cleanup();
  }
});

test("a high-risk plan never starts full without explicit confirmation", () => {
  const fixture = createFixture();
  try {
    const result = runPrepare(
      fixture.root,
      [],
      cleanEnvironment({ DISPOSABLE_DATABASE_BASE_URL: "" }),
    );
    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.match(result.stderr, /reason=full_confirmation_required/u);
    assert.match(result.stderr, /prepare-push\.sh --full/u);
    assert.equal(
      existsSync(gitStateFile(fixture.root, "full-ranges.txt")),
      false,
    );
  } finally {
    fixture.cleanup();
  }
});

test("review-only preparation scans the main delta without opening delivery gates", () => {
  const fixture = createFixture();
  try {
    const env = cleanEnvironment({ DISPOSABLE_DATABASE_BASE_URL: "" });
    const prepared = runPrepare(fixture.root, ["--review"], env);
    assert.equal(prepared.status, 0, prepared.stderr || prepared.stdout);
    assert.match(
      prepared.stdout,
      /status=complete profile=review recommended_delivery_profile=full review_only=true/u,
    );

    const state = resolveReceiptState(fixture.root);
    const receipt = JSON.parse(
      readFileSync(state.reviewReceiptPath, "utf8"),
    );
    const expectedRange = `${fixture.remoteSha}..${fixture.localSha}`;
    assert.equal(receipt.purpose, "review-only");
    assert.equal(receipt.gate.profile, "review");
    assert.equal(receipt.gate.recommendedProfile, "full");
    assert.equal(receipt.gate.deliveryEligible, false);
    assert.equal(receipt.push.review.baseSha, fixture.remoteSha);
    assert.equal(receipt.push.review.deliveryEligible, false);
    assert.equal(receipt.push.refs[0].remoteSha, ZERO_SHA);
    assert.equal(receipt.push.refs[0].range, expectedRange);
    assert.equal(receipt.push.aggregateRange, expectedRange);
    assert.equal(existsSync(state.receiptPath), false);
    assert.equal(existsSync(gitStateFile(fixture.root, "full-ranges.txt")), false);
    assert.equal(
      existsSync(gitStateFile(fixture.root, "affected-ranges.txt")),
      false,
    );
    assert.deepEqual(
      readLines(gitStateFile(fixture.root, "secret-ranges.txt")),
      [expectedRange],
    );

    const mainPush = runHook(fixture, { env });
    assert.equal(mainPush.status, 2, mainPush.stderr || mainPush.stdout);
    assert.match(mainPush.stderr, /reason=receipt_missing/u);
    assert.match(mainPush.stderr, /run=bash scripts\/qa\/prepare-push\.sh/u);

    const reviewPush = runHook(fixture, {
      env,
      input: `${REVIEW_PUSH_LOCAL_REF} ${fixture.localSha} ${REVIEW_PUSH_REMOTE_REF} ${ZERO_SHA}\n`,
    });
    assert.equal(reviewPush.status, 0, reviewPush.stderr || reviewPush.stdout);
    assert.match(reviewPush.stdout, /review_only=true/u);
    assert.deepEqual(
      readLines(gitStateFile(fixture.root, "secret-ranges.txt")),
      [expectedRange, expectedRange],
    );

    const actualPush = runRealGitReviewPush(fixture, { env });
    assert.equal(actualPush.status, 0, actualPush.stderr || actualPush.stdout);
    assert.equal(
      git(fixture.remote, ["rev-parse", REVIEW_PUSH_REMOTE_REF]),
      fixture.localSha,
    );
    assert.deepEqual(
      readLines(gitStateFile(fixture.root, "secret-ranges.txt")),
      [expectedRange, expectedRange, expectedRange],
    );
  } finally {
    fixture.cleanup();
  }
});

test("an existing review ref advances only by fast-forward delta", () => {
  const fixture = createFixture();
  try {
    git(fixture.root, [
      "-c",
      "core.hooksPath=/dev/null",
      "push",
      "--quiet",
      "origin",
      `${fixture.localSha}:${REVIEW_PUSH_REMOTE_REF}`,
    ]);
    const previousReviewSha = fixture.localSha;
    writeFileSync(path.join(fixture.root, "tracked.txt"), "next review\n", "utf8");
    fixture.localSha = commit(fixture.root, "next review snapshot");

    const prepared = runPrepare(
      fixture.root,
      ["--review"],
      cleanEnvironment({ DISPOSABLE_DATABASE_BASE_URL: "" }),
    );
    assert.equal(prepared.status, 0, prepared.stderr || prepared.stdout);
    const state = resolveReceiptState(fixture.root);
    const receipt = JSON.parse(
      readFileSync(state.reviewReceiptPath, "utf8"),
    );
    assert.equal(receipt.push.refs[0].remoteSha, previousReviewSha);
    assert.equal(
      receipt.push.aggregateRange,
      `${previousReviewSha}..${fixture.localSha}`,
    );
  } finally {
    fixture.cleanup();
  }
});

test("review mode rejects custom refs, delivery mixing, stale main, and divergence", () => {
  {
    const fixture = createFixture();
    try {
      for (const [args, reason] of [
        [["--review", "--full"], "mutually_exclusive_options"],
        [
          [
            "--review",
            "--ref",
            `${REVIEW_PUSH_LOCAL_REF}:${REVIEW_PUSH_REMOTE_REF}`,
          ],
          "review_ref_is_fixed",
        ],
        [
          [
            "--full",
            "--ref",
            `${REVIEW_PUSH_LOCAL_REF}:${REVIEW_PUSH_REMOTE_REF}`,
          ],
          "review_ref_requires_review_mode",
        ],
      ]) {
        const result = runPrepare(fixture.root, args);
        assert.equal(result.status, 2, result.stderr || result.stdout);
        assert.match(result.stderr, new RegExp(`reason=${reason}`, "u"));
      }
      const invalidHook = runHook(fixture, {
        input: `refs/heads/topic ${fixture.localSha} ${REVIEW_PUSH_REMOTE_REF} ${ZERO_SHA}\n`,
      });
      assert.equal(
        invalidHook.status,
        2,
        invalidHook.stderr || invalidHook.stdout,
      );
      assert.match(invalidHook.stderr, /reason=invalid_review_push_shape/u);
    } finally {
      fixture.cleanup();
    }
  }

  {
    const fixture = createFixture();
    try {
      git(fixture.root, ["checkout", "-qb", "remote-main-ahead"]);
      const remoteMainSha = commit(fixture.root, "remote main ahead", {
        allowEmpty: true,
      });
      git(fixture.root, [
        "-c",
        "core.hooksPath=/dev/null",
        "push",
        "--quiet",
        "origin",
        `${remoteMainSha}:refs/heads/main`,
      ]);
      git(fixture.root, ["checkout", "-q", "main"]);
      const prepared = runPrepare(fixture.root, ["--review"]);
      assert.equal(prepared.status, 2, prepared.stderr || prepared.stdout);
      assert.match(prepared.stderr, /reason=review_base_not_ancestor/u);
    } finally {
      fixture.cleanup();
    }
  }

  {
    const fixture = createFixture();
    try {
      git(fixture.root, [
        "checkout",
        "-qb",
        "divergent-review",
        fixture.remoteSha,
      ]);
      writeFileSync(
        path.join(fixture.root, "divergent.txt"),
        "divergent\n",
        "utf8",
      );
      const divergentSha = commit(fixture.root, "divergent review");
      git(fixture.root, [
        "-c",
        "core.hooksPath=/dev/null",
        "push",
        "--quiet",
        "origin",
        `${divergentSha}:${REVIEW_PUSH_REMOTE_REF}`,
      ]);
      git(fixture.root, ["checkout", "-q", "main"]);
      const prepared = runPrepare(fixture.root, ["--review"]);
      assert.equal(prepared.status, 2, prepared.stderr || prepared.stdout);
      assert.match(prepared.stderr, /reason=review_non_fast_forward/u);
    } finally {
      fixture.cleanup();
    }
  }
});

test("review preparation fails closed on log or strict secret findings", () => {
  for (const scenario of ["log", "secrets"]) {
    const fixture = createFixture();
    try {
      if (scenario === "log") {
        writeFileSync(
          path.join(fixture.root, "bad-review.txt"),
          "trailing whitespace  \n",
        );
        fixture.localSha = commit(fixture.root, "bad review whitespace");
      }
      const exactRange = `${fixture.remoteSha}..${fixture.localSha}`;
      const env = cleanEnvironment(
        scenario === "secrets" ? { FAIL_RANGE: exactRange } : {},
      );
      const prepared = runPrepare(fixture.root, ["--review"], env);
      assert.notEqual(prepared.status, 0, scenario);
      assert.match(
        prepared.stderr,
        new RegExp(
          `reason=${scenario === "log" ? "git_log_check_failed" : "push_range_secrets_failed"}`,
          "u",
        ),
      );
      assert.equal(
        existsSync(resolveReceiptState(fixture.root).reviewReceiptPath),
        false,
      );
    } finally {
      fixture.cleanup();
    }
  }
});

test("affected failures and repository drift never produce a push receipt", () => {
  for (const [name, overrides, reason] of [
    ["failure", { FAIL_AFFECTED: "1" }, "affected_gate_failed"],
    [
      "dirty drift",
      { MUTATE_AFFECTED_DIRTY: "1" },
      "worktree_changed_during_gate",
    ],
  ]) {
    const fixture = createFixture({ changePath: "docs/guide.md" });
    try {
      const result = runPrepare(
        fixture.root,
        [],
        cleanEnvironment({
          DISPOSABLE_DATABASE_BASE_URL: "",
          ...overrides,
        }),
      );
      assert.notEqual(result.status, 0, name);
      assert.match(result.stderr, new RegExp(`reason=${reason}`, "u"), name);
      assert.equal(
        existsSync(resolveReceiptState(fixture.root).receiptPath),
        false,
        name,
      );
    } finally {
      fixture.cleanup();
    }
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
    assert.equal(
      path.relative(state.commonDir, state.receiptPath).startsWith(".."),
      false,
    );
    assert.equal(
      readLines(gitStateFile(fixture.root, "full-ranges.txt")).length,
      1,
    );

    const pushed = runHook(fixture);
    assert.equal(pushed.status, 0, pushed.stderr || pushed.stdout);
    assert.match(pushed.stdout, /coverage=receipt\+live-range-secrets/u);
    assert.deepEqual(readLines(gitStateFile(fixture.root, "full-ranges.txt")), [
      `${fixture.remoteSha}..${fixture.localSha}`,
    ]);
    assert.deepEqual(
      readLines(gitStateFile(fixture.root, "db-guard-ranges.txt")),
      [`${fixture.remoteSha}..${fixture.localSha}`],
    );
    assert.deepEqual(
      readLines(gitStateFile(fixture.root, "secret-ranges.txt")),
      [`${fixture.remoteSha}..${fixture.localSha}`],
    );
    assert.equal(
      readdirSync(state.stateDir).some((file) => file.endsWith(".tmp")),
      false,
    );
  } finally {
    fixture.cleanup();
  }
});

test("a second prepare with the same fingerprint reuses the valid full receipt", () => {
  const fixture = createFixture();
  try {
    const first = runPrepare(fixture.root);
    assert.equal(first.status, 0, first.stderr || first.stdout);
    assert.match(first.stdout, /status=complete profile=full/u);

    const second = runPrepare(fixture.root);
    assert.equal(second.status, 0, second.stderr || second.stdout);
    assert.match(second.stdout, /status=reused profile=full/u);
    assert.deepEqual(readLines(gitStateFile(fixture.root, "full-ranges.txt")), [
      `${fixture.remoteSha}..${fixture.localSha}`,
    ]);

    const pushed = runHook(fixture);
    assert.equal(pushed.status, 0, pushed.stderr || pushed.stdout);
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

    const prepared = runPrepare(fixture.root, ["--full"], env);
    assert.equal(prepared.status, 0, prepared.stderr || prepared.stdout);
    const pushed = runRealGitPush(fixture, { env });
    assert.equal(pushed.status, 0, pushed.stderr || pushed.stdout);
    assert.deepEqual(readLines(gitStateFile(fixture.root, "full-ranges.txt")), [
      `${fixture.remoteSha}..${fixture.localSha}`,
    ]);
    assert.deepEqual(
      readLines(gitStateFile(fixture.root, "secret-ranges.txt")),
      [`${fixture.remoteSha}..${fixture.localSha}`],
    );
    assert.equal(
      git(fixture.remote, ["rev-parse", "refs/heads/main"]),
      fixture.localSha,
    );
  } finally {
    fixture.cleanup();
  }
});

test("a wrapped Git exec-path prefix is normalized through the base PATH", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-receipt-git-path-"));
  const wrapperBin = path.join(root, "wrapper-bin");
  const execPath = path.join(root, "git-exec-path");
  mkdirSync(wrapperBin, { recursive: true });
  mkdirSync(execPath, { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    path.join(wrapperBin, "git"),
    '#!/bin/sh\n[ "$1" = --exec-path ] || exit 9\nprintf \'%s\\n\' "$FAKE_GIT_EXEC_PATH"\n',
    "utf8",
  );
  writeFileSync(
    path.join(execPath, "git"),
    "#!/bin/sh\n[ \"$1\" = --exec-path ] || exit 9\nprintf '%s\\n' /broken/git-core\n",
    "utf8",
  );
  chmodSync(path.join(wrapperBin, "git"), 0o755);
  chmodSync(path.join(execPath, "git"), 0o755);

  const baseEnvironment = cleanEnvironment({
    FAKE_GIT_EXEC_PATH: execPath,
    PATH: `${wrapperBin}${path.delimiter}${STABLE_RECEIPT_TOOLS.env.PATH}`,
  });
  const baseline = environmentFingerprint(root, baseEnvironment);
  assert.equal(
    environmentFingerprint(root, {
      ...baseEnvironment,
      PATH: `${execPath}${path.delimiter}${baseEnvironment.PATH}`,
    }),
    baseline,
  );
});

test(
  "an unchanged govulncheck version survives one slow version probe",
  { timeout: 30_000 },
  (t) => {
    const root = mkdtempSync(path.join(os.tmpdir(), "plush-receipt-env-"));
    const bin = path.join(root, "bin");
    const executable = path.join(bin, "govulncheck");
    mkdirSync(bin, { recursive: true });
    t.after(() => rmSync(root, { recursive: true, force: true }));
    writeFileSync(
      executable,
      "#!/bin/sh\nsleep 6\nprintf '%s\\n' 'Go: stable-test-version'\n",
      "utf8",
    );
    chmodSync(executable, 0o755);
    const environment = cleanEnvironment({
      PATH: `${bin}${path.delimiter}${STABLE_RECEIPT_TOOLS.env.PATH}`,
    });
    const slow = environmentFingerprint(root, environment);
    writeFileSync(
      executable,
      "#!/bin/sh\nprintf '%s\\n' 'Go: stable-test-version'\n",
      "utf8",
    );
    const fast = environmentFingerprint(root, environment);
    assert.equal(slow, fast);
  },
);

test("hook without a receipt fails fast and never opens the full fallback", () => {
  const fixture = createFixture();
  try {
    const pushed = runHook(fixture);
    assert.equal(pushed.status, 2, pushed.stderr || pushed.stdout);
    assert.match(pushed.stderr, /reason=receipt_missing/u);
    assert.equal(
      existsSync(gitStateFile(fixture.root, "full-ranges.txt")),
      false,
    );
    assert.equal(
      existsSync(gitStateFile(fixture.root, "secret-ranges.txt")),
      false,
    );
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
    assert.equal(
      existsSync(gitStateFile(fixture.root, "full-ranges.txt")),
      false,
    );
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
    assert.equal(
      existsSync(gitStateFile(fixture.root, "full-ranges.txt")),
      false,
    );
    assert.deepEqual(readdirSync(outside), []);
  } finally {
    fixture.cleanup();
    rmSync(outside, { recursive: true, force: true });
  }
});

test("a first same-name mirror push keeps full-history coverage while database guard uses the distinct tracked upstream", () => {
  const fixture = createFixture();
  const mirror = mkdtempSync(path.join(os.tmpdir(), "plush-receipt-mirror-"));
  try {
    git(mirror, ["init", "--bare", "-q"]);
    git(fixture.root, ["remote", "add", "mirror", mirror]);
    git(fixture.root, ["config", "branch.main.remote", "origin"]);
    git(fixture.root, ["config", "branch.main.merge", "refs/heads/main"]);
    git(fixture.root, [
      "update-ref",
      "refs/remotes/origin/main",
      fixture.remoteSha,
    ]);

    const prepared = runPrepare(fixture.root, [
      "--full",
      "--remote",
      "mirror",
      "--ref",
      "refs/heads/main:refs/heads/main",
    ]);
    assert.equal(prepared.status, 0, prepared.stderr || prepared.stdout);
    const emptyTree = git(fixture.root, [
      "hash-object",
      "-t",
      "tree",
      "/dev/null",
    ]);
    const aggregateRange = `${emptyTree}..${fixture.localSha}`;
    const databaseRange = `${fixture.remoteSha}..${fixture.localSha}`;
    assert.deepEqual(readLines(gitStateFile(fixture.root, "full-ranges.txt")), [
      aggregateRange,
    ]);
    assert.deepEqual(
      readLines(gitStateFile(fixture.root, "db-guard-ranges.txt")),
      [databaseRange],
    );

    const state = resolveReceiptState(fixture.root);
    const receipt = JSON.parse(readFileSync(state.receiptPath, "utf8"));
    assert.deepEqual(receipt.gate.databaseGuard, {
      mode: "tracked-upstream",
      range: databaseRange,
      baseRef: "refs/remotes/origin/main",
      baseSha: fixture.remoteSha,
      sourceRemote: "origin",
      sourceRemoteUrlSha256: receipt.gate.databaseGuard.sourceRemoteUrlSha256,
    });
    assert.match(
      receipt.gate.databaseGuard.sourceRemoteUrlSha256,
      /^[0-9a-f]{64}$/u,
    );

    const pushed = runHook(fixture, {
      input: `refs/heads/main ${fixture.localSha} refs/heads/main ${ZERO_SHA}\n`,
      remoteName: "mirror",
      remoteLocation: mirror,
    });
    assert.equal(pushed.status, 0, pushed.stderr || pushed.stdout);
    assert.deepEqual(
      readLines(gitStateFile(fixture.root, "secret-ranges.txt")),
      [fixture.localSha],
    );
  } finally {
    fixture.cleanup();
    rmSync(mirror, { recursive: true, force: true });
  }
});

test("a first mirror push fails closed when its distinct tracked upstream is missing or divergent", () => {
  for (const scenario of ["missing", "divergent"]) {
    const fixture = createFixture();
    const mirror = mkdtempSync(path.join(os.tmpdir(), "plush-receipt-mirror-"));
    try {
      git(mirror, ["init", "--bare", "-q"]);
      git(fixture.root, ["remote", "add", "mirror", mirror]);
      git(fixture.root, ["config", "branch.main.remote", "origin"]);
      git(fixture.root, ["config", "branch.main.merge", "refs/heads/main"]);
      if (scenario === "missing") {
        git(fixture.root, ["update-ref", "-d", "refs/remotes/origin/main"]);
      } else {
        const tree = git(fixture.root, ["rev-parse", `${fixture.remoteSha}^{tree}`]);
        const divergentSha = git(fixture.root, [
          "-c",
          "user.name=Receipt Test",
          "-c",
          "user.email=receipt@example.invalid",
          "commit-tree",
          tree,
          "-m",
          "divergent upstream",
        ]);
        git(fixture.root, [
          "update-ref",
          "refs/remotes/origin/main",
          divergentSha,
        ]);
      }

      const prepared = runPrepare(fixture.root, [
        "--full",
        "--remote",
        "mirror",
        "--ref",
        "refs/heads/main:refs/heads/main",
      ]);
      assert.equal(prepared.status, 2, prepared.stderr || prepared.stdout);
      assert.match(
        prepared.stderr,
        new RegExp(
          `reason=database_guard_upstream_${scenario === "missing" ? "missing" : "not_ancestor"}`,
          "u",
        ),
      );
      assert.equal(
        existsSync(gitStateFile(fixture.root, "full-ranges.txt")),
        false,
      );
    } finally {
      fixture.cleanup();
      rmSync(mirror, { recursive: true, force: true });
    }
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
    const prepared = runPrepare(fixture.root, ["--full", ...refspecs]);
    assert.equal(prepared.status, 0, prepared.stderr || prepared.stdout);
    const emptyTree = git(fixture.root, [
      "hash-object",
      "-t",
      "tree",
      "/dev/null",
    ]);
    assert.deepEqual(readLines(gitStateFile(fixture.root, "full-ranges.txt")), [
      `${emptyTree}..${fixture.localSha}`,
    ]);
    assert.deepEqual(
      readLines(gitStateFile(fixture.root, "db-guard-ranges.txt")),
      [`${emptyTree}..${fixture.localSha}`],
    );

    const input = [
      `refs/heads/main ${fixture.localSha} refs/heads/main ${fixture.remoteSha}`,
      `refs/heads/main ${fixture.localSha} refs/heads/new ${ZERO_SHA}`,
      "",
    ].join("\n");
    const pushed = runHook(fixture, { input });
    assert.equal(pushed.status, 0, pushed.stderr || pushed.stdout);
    assert.deepEqual(
      readLines(gitStateFile(fixture.root, "secret-ranges.txt")),
      [`${fixture.remoteSha}..${fixture.localSha}`, fixture.localSha],
    );
  } finally {
    fixture.cleanup();
  }
});

test("failed or moving full never leaves a green receipt", () => {
  for (const [name, overrides, reason, identityChanged = false] of [
    ["full failure", { FAIL_FULL: "1" }, "full_gate_failed"],
    ["dirty after full", { MUTATE_FULL_DIRTY: "1" }, "full_gate_failed", true],
    [
      "HEAD changed after full",
      { MUTATE_FULL_HEAD: "1" },
      "full_gate_failed",
      true,
    ],
    [
      "remote changed after full",
      { MUTATE_REMOTE: "1" },
      "remote_changed_during_gate",
    ],
  ]) {
    const fixture = createFixture();
    try {
      const result = runPrepare(
        fixture.root,
        ["--full"],
        cleanEnvironment(overrides),
      );
      assert.notEqual(result.status, 0, name);
      assert.match(result.stderr, new RegExp(`reason=${reason}`, "u"), name);
      const state = resolveReceiptState(fixture.root);
      if (identityChanged) {
        const fullReceipt = JSON.parse(
          readFileSync(
            path.join(state.stateDir, `${state.worktreeKey}.full-receipt.json`),
            "utf8",
          ),
        );
        assert.equal(fullReceipt.status, "failed", name);
        assert.ok(
          fullReceipt.notProven.includes(
            "repository identity changed during gate",
          ),
          name,
        );
      }
      assert.equal(existsSync(state.receiptPath), false, name);
    } finally {
      fixture.cleanup();
    }
  }
});

test("receipt rejects tampering, profile downgrade, expiry, environment drift, and range drift", () => {
  for (const scenario of [
    "tamper",
    "profile",
    "expired",
    "environment",
    "range",
  ]) {
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
        writeFileSync(
          state.receiptPath,
          `${JSON.stringify(receipt, null, 2)}\n`,
          {
            mode: 0o600,
          },
        );
      } else if (scenario === "profile") {
        resignReceipt(state, (receipt) => {
          receipt.gate.profile = "affected";
          receipt.gate.recommendedProfile = "affected";
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
      assert.equal(
        pushed.status,
        2,
        `${scenario}: ${pushed.stderr || pushed.stdout}`,
      );
      assert.match(
        pushed.stderr,
        /reason=receipt_(?:signature_invalid|profile_mismatch|expired|environment_mismatch|push_range_mismatch)/u,
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
        writeFileSync(
          path.join(fixture.root, "untracked.txt"),
          "dirty\n",
          "utf8",
        );
      } else {
        mkdirSync(state.lockPath, { mode: 0o700 });
        writeFileSync(
          path.join(state.lockPath, "owner.json"),
          `${JSON.stringify({ pid: process.pid, purpose: "fixture", token: "live-owner" })}\n`,
          "utf8",
        );
      }
      const pushed = runHook(fixture, { input });
      assert.equal(
        pushed.status,
        2,
        `${scenario}: ${pushed.stderr || pushed.stdout}`,
      );
      assert.match(
        pushed.stderr,
        /reason=(?:receipt_(?:repository|profile)_mismatch|dirty_worktree|receipt_lock_held)/u,
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
        writeFileSync(
          path.join(fixture.root, "bad.txt"),
          "trailing whitespace  \n",
        );
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
      "QA_DB_GUARD_RANGE",
      "PRE_PUSH_RECEIPT_PATH",
    ].entries()) {
      if (index > 0) {
        const refreshed = runPrepare(fixture.root);
        assert.equal(refreshed.status, 0, refreshed.stderr || refreshed.stdout);
      }
      const result = runPrepare(
        fixture.root,
        ["--full"],
        cleanEnvironment({ [variable]: "forged" }),
      );
      assert.equal(result.status, 2, variable);
      assert.match(result.stderr, /reason=forbidden_environment/u, variable);
      assert.match(
        result.stderr,
        new RegExp(`variable=${variable}`, "u"),
        variable,
      );
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
