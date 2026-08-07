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
  readExactShaTerminal,
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
    ".n-node-version",
    "server/go.mod",
    "server/go.sum",
    "web/package.json",
    "web/pnpm-lock.yaml",
  ]);
  for (const file of files) {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(
      target,
      file === "web/package.json"
        ? '{"scripts":{"test":"node --test"}}\n'
        : `${file}\n`,
      "utf8",
    );
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
    const first = runExactShaGate(
      fixture.root,
      { sha: fixture.sha },
      runtime,
    );
    const second = runExactShaGate(
      fixture.root,
      { sha: fixture.sha },
      runtime,
    );
    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(second.terminal.status, "passed");
    assert.equal(runs, 1);
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
    const first = runExactShaGate(
      fixture.root,
      { sha: fixture.sha },
      runtime,
    );
    const second = runExactShaGate(
      fixture.root,
      { sha: fixture.sha },
      runtime,
    );
    assert.equal(first.terminal.status, "failed");
    assert.equal(first.terminal.exitCode, 7);
    assert.equal(second.reused, true);
    assert.equal(runs, 1);
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
    const terminal = JSON.parse(
      readFileSync(result.plan.terminalPath, "utf8"),
    );
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
      GITHUB_WORKFLOW_REF: "owner/repository/.github/workflows/release.yml@refs/heads/main",
      GITHUB_RUN_ID: "123",
      GITHUB_RUN_ATTEMPT: "2",
      GITHUB_JOB: "validate",
    };
    assert.deepEqual(buildExactShaProvenance(githubEnv), {
      source: "github-actions",
      repository: "owner/repository",
      workflowRef: githubEnv.GITHUB_WORKFLOW_REF,
      runId: "123",
      runAttempt: "2",
      job: "validate",
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
