import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PROFILE_REQUIRED_EXECUTABLES,
  PROFILE_REQUIRED_FILES,
} from "./gate-profiles.mjs";
import {
  buildExactShaProvenance,
  buildExactShaPlan,
  finalizeExactShaGateFromReceipt,
  readExactShaTerminal,
  refreshExactShaTimeSensitiveCheck,
  runExactShaGate,
} from "./exact-sha-gate.mjs";

function writeReceipt(plan, status) {
  mkdirSync(path.dirname(plan.receiptPath), { recursive: true });
  writeFileSync(
    plan.receiptPath,
    `${JSON.stringify({
      schemaVersion: "dev-workbench-receipt/v1",
      gate: "strict",
      profile: "strict",
      gitCommit: plan.gitSha,
      status,
      metrics: {
        categoryCounts: Object.fromEntries(
          ["web", "server", "database", "browser", "security"].map((key) => [
            key,
            status === "passed"
              ? { executed: 1, passed: 1, failed: 0, skipped: 0 }
              : { executed: 1, passed: 0, failed: 1, skipped: 0 },
          ]),
        ),
      },
    })}\n`,
    "utf8",
  );
}

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function commit(root, message) {
  git(root, ["add", "-A"]);
  git(root, [
    "-c",
    "user.name=Exact SHA Test",
    "-c",
    "user.email=exact-sha@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-qm",
    message,
  ]);
  return git(root, ["rev-parse", "HEAD"]);
}

function createFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-exact-sha-"));
  git(root, ["init", "-q", "-b", "main"]);
  const executables = new Set(PROFILE_REQUIRED_EXECUTABLES.strict);
  const files = new Set([
    ...PROFILE_REQUIRED_FILES.strict,
    ".gitlab-ci.yml",
    ".github/workflows/release.yml",
    ".n-node-version",
    "server/go.mod",
    "server/go.sum",
    "web/package.json",
    "web/pnpm-lock.yaml",
    "server/Dockerfile",
    "web/Dockerfile",
    "scripts/qa/strict-receipt-identity.mjs",
    "scripts/qa/strict-receipt-identity.test.mjs",
    "scripts/qa/ci-quality-shard.mjs",
    "scripts/qa/ci-quality-shard.test.mjs",
    "scripts/qa/ci-quality-aggregate.mjs",
    "scripts/qa/ci-quality-aggregate.test.mjs",
    "scripts/deploy/gitlab-strict-terminal-reuse.mjs",
    "scripts/deploy/gitlab-strict-terminal-reuse.test.mjs",
    "scripts/deploy/gitlab-release-candidate.mjs",
    "scripts/deploy/gitlab-release-candidate.test.mjs",
    "server/internal/data/model/migrate/20260101000000_init.sql",
    "config/customers/yoyoosun/customerPackage.mjs",
    "config/customers/yoyoosun/roleFlowMatrix.mjs",
  ]);
  for (const file of files) {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    const content =
      file === "web/package.json"
        ? '{"scripts":{"test":"node --test"}}\n'
        : file.endsWith("/customerPackage.mjs")
          ? 'export default { packageKey: "yoyoosun-customer-package-test", status: "active", runtimeEnabled: true };\n'
          : `${file}\n`;
    writeFileSync(target, content, "utf8");
    if (executables.has(file)) chmodSync(target, 0o755);
  }
  writeFileSync(path.join(root, ".gitignore"), "output/\n", "utf8");
  const sha = commit(root, "candidate");
  git(root, ["remote", "add", "origin", root]);
  git(root, ["update-ref", "refs/remotes/origin/main", sha]);
  return {
    root,
    sha,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("exact-SHA plan binds a clean main-reachable commit and fixed terminal path", () => {
  const fixture = createFixture();
  try {
    const plan = buildExactShaPlan(fixture.root, { sha: fixture.sha });
    assert.match(plan.fingerprint, /^[0-9a-f]{64}$/u);
    assert.equal(plan.profile, "strict");
    assert.equal(
      path.relative(fixture.root, plan.terminalPath),
      path.join(
        "output",
        "qa",
        "exact-sha",
        fixture.sha,
        `${plan.fingerprint}.json`,
      ),
    );
  } finally {
    fixture.cleanup();
  }
});

test("exact-SHA passed terminal is reused without running strict again", () => {
  const fixture = createFixture();
  try {
    let runs = 0;
    const runtime = {
      runStrict(plan) {
        runs += 1;
        writeReceipt(plan, "passed");
        return { status: 0 };
      },
    };
    const first = runExactShaGate(fixture.root, { sha: fixture.sha }, runtime);
    const second = runExactShaGate(fixture.root, { sha: fixture.sha }, runtime);
    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(second.terminal.status, "passed");
    assert.equal(runs, 1);
  } finally {
    fixture.cleanup();
  }
});

test("exact-SHA aggregate signs an existing complete strict receipt", () => {
  const fixture = createFixture();
  try {
    const plan = buildExactShaPlan(fixture.root, { sha: fixture.sha });
    writeReceipt(plan, "passed");
    const result = finalizeExactShaGateFromReceipt(
      fixture.root,
      { sha: fixture.sha },
      {
        startedAt: "2026-08-29T00:00:00.000Z",
        now: () => new Date("2026-08-29T00:01:00.000Z"),
      },
    );
    assert.equal(result.terminal.status, "passed");
    assert.equal(result.terminal.receipt.sha256.length, 64);
    assert.equal(result.reused, false);
  } finally {
    fixture.cleanup();
  }
});

test("exact-SHA failed terminal is final for the same fingerprint", () => {
  const fixture = createFixture();
  try {
    let runs = 0;
    const runtime = {
      runStrict(plan) {
        runs += 1;
        writeReceipt(plan, "failed");
        return { status: 7 };
      },
    };
    const first = runExactShaGate(fixture.root, { sha: fixture.sha }, runtime);
    const second = runExactShaGate(fixture.root, { sha: fixture.sha }, runtime);
    assert.equal(first.terminal.status, "failed");
    assert.equal(first.terminal.exitCode, 7);
    assert.equal(second.reused, true);
    assert.equal(runs, 1);
  } finally {
    fixture.cleanup();
  }
});

test("exact-SHA refuses a green child without complete category evidence", () => {
  const fixture = createFixture();
  try {
    assert.throws(
      () =>
        runExactShaGate(
          fixture.root,
          { sha: fixture.sha },
          {
            runStrict(plan) {
              mkdirSync(path.dirname(plan.receiptPath), { recursive: true });
              writeFileSync(
                plan.receiptPath,
                `${JSON.stringify({
                  schemaVersion: "dev-workbench-receipt/v1",
                  gate: "strict",
                  profile: "strict",
                  gitCommit: plan.gitSha,
                  status: "passed",
                  metrics: { categoryCounts: {} },
                })}\n`,
                "utf8",
              );
              return { status: 0 };
            },
          },
        ),
      /category set/u,
    );
  } finally {
    fixture.cleanup();
  }
});

test("exact-SHA rejects dirty, detached candidate, and tampered terminals", () => {
  const fixture = createFixture();
  try {
    writeFileSync(path.join(fixture.root, "dirty.txt"), "dirty\n", "utf8");
    assert.throws(
      () => buildExactShaPlan(fixture.root, { sha: fixture.sha }),
      /clean worktree/u,
    );
    rmSync(path.join(fixture.root, "dirty.txt"));

    writeFileSync(path.join(fixture.root, "candidate.txt"), "next\n", "utf8");
    const unrelated = commit(fixture.root, "unrelated");
    git(fixture.root, ["update-ref", "refs/remotes/origin/main", fixture.sha]);
    assert.throws(
      () => buildExactShaPlan(fixture.root, { sha: unrelated }),
      /not reachable/u,
    );

    git(fixture.root, ["reset", "--hard", "-q", fixture.sha]);
    const result = runExactShaGate(
      fixture.root,
      { sha: fixture.sha },
      {
        runStrict: (plan) => {
          writeReceipt(plan, "passed");
          return { status: 0 };
        },
      },
    );
    const terminal = JSON.parse(readFileSync(result.plan.terminalPath, "utf8"));
    terminal.gitSha = "0".repeat(40);
    writeFileSync(
      result.plan.terminalPath,
      `${JSON.stringify(terminal)}\n`,
      "utf8",
    );
    assert.throws(
      () => readExactShaTerminal(result.plan),
      /contract mismatch/u,
    );
  } finally {
    fixture.cleanup();
  }
});

test("exact-SHA terminal binds receipt content and GitHub provenance", () => {
  const fixture = createFixture();
  try {
    const githubEnv = {
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "owner/repository",
      GITHUB_WORKFLOW_REF:
        "owner/repository/.github/workflows/release.yml@refs/heads/main",
      GITHUB_RUN_ID: "123",
      GITHUB_RUN_ATTEMPT: "2",
      GITHUB_JOB: "validate",
      GITHUB_EVENT_NAME: "push",
      GITHUB_REF: "refs/heads/main",
      GITHUB_REF_NAME: "main",
      GITHUB_HEAD_REPOSITORY: "owner/repository",
    };
    assert.deepEqual(buildExactShaProvenance(githubEnv), {
      source: "github-actions",
      repository: "owner/repository",
      workflowRef: githubEnv.GITHUB_WORKFLOW_REF,
      runId: "123",
      runAttempt: "2",
      job: "validate",
      eventName: "push",
      ref: "refs/heads/main",
      refName: "main",
      headRepository: "owner/repository",
      conclusion: "success",
    });
    const result = runExactShaGate(
      fixture.root,
      { sha: fixture.sha },
      {
        runStrict(plan) {
          writeReceipt(plan, "passed");
          return { status: 0 };
        },
      },
    );
    writeFileSync(result.plan.receiptPath, "{}\n", "utf8");
    assert.throws(
      () => readExactShaTerminal(result.plan),
      /receipt contract mismatch|receipt integrity mismatch/u,
    );
  } finally {
    fixture.cleanup();
  }
});

test("exact-SHA terminal records truthful GitLab pipeline provenance", () => {
  const gitlabEnv = {
    GITLAB_CI: "true",
    CI_PROJECT_PATH: "saurick/plush-toy-erp",
    CI_PIPELINE_ID: "9001",
    CI_PIPELINE_IID: "27",
    CI_JOB_NAME: "strict",
    CI_PIPELINE_SOURCE: "web",
    CI_COMMIT_REF_NAME: "main",
  };
  assert.deepEqual(buildExactShaProvenance(gitlabEnv), {
    source: "gitlab-ci",
    repository: "saurick/plush-toy-erp",
    workflowRef: "saurick/plush-toy-erp/.gitlab-ci.yml@refs/heads/main",
    runId: "9001",
    runAttempt: "27",
    job: "strict",
    eventName: "web",
    ref: "refs/heads/main",
    refName: "main",
    headRepository: "saurick/plush-toy-erp",
    conclusion: "success",
  });
});

test("time-sensitive refresh reruns only govulncheck and preserves deterministic identity", () => {
  const fixture = createFixture();
  try {
    const first = runExactShaGate(
      fixture.root,
      { sha: fixture.sha },
      {
        runStrict(plan) {
          writeReceipt(plan, "passed");
          return { status: 0 };
        },
      },
    );
    let runs = 0;
    const refreshed = refreshExactShaTimeSensitiveCheck(
      fixture.root,
      {
        sha: fixture.sha,
        key: "vulnerabilityDatabase",
      },
      {
        runCheck() {
          runs += 1;
          return { status: 0 };
        },
        now: () => new Date("2026-08-10T01:00:00.000Z"),
      },
    );
    assert.equal(runs, 1);
    assert.deepEqual(refreshed.terminal.identity, first.terminal.identity);
    assert.equal(
      refreshed.terminal.timeSensitiveChecks.vulnerabilityDatabase.validUntil,
      "2026-08-11T01:00:00.000Z",
    );
  } finally {
    fixture.cleanup();
  }
});
