import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertArtifactArchiveDigest,
  assertProtectedDefaultBranch,
  assertSuccessfulStrictAttempt,
  assertReusableTerminalProvenance,
  reusableStrictArtifactCandidate,
} from "./github-strict-terminal-reuse.mjs";

const sha = "a".repeat(40);
const repository = "owner/repository";
const artifact = {
  id: 7,
  name: `strict-terminal-${sha}`,
  expired: false,
  digest: `sha256:${"1".repeat(64)}`,
  workflow_run: { id: 9, head_sha: sha },
};
const workflowRun = {
  id: 9,
  head_sha: sha,
  status: "completed",
  conclusion: "success",
  event: "push",
  path: ".github/workflows/ci.yml",
  head_branch: "main",
  repository: { full_name: repository },
  head_repository: { full_name: repository },
};
const jobs = {
  jobs: [
    {
      name: "Repository quality",
      status: "completed",
      conclusion: "success",
    },
    {
      name: "CI Gate",
      status: "completed",
      conclusion: "success",
    },
  ],
};

test("strict reuse accepts only an exact-SHA artifact from the fixed workflow", () => {
  assert.equal(
    reusableStrictArtifactCandidate({
      artifact,
      run: workflowRun,
      repository,
      sha,
    }),
    true,
  );
  assert.equal(
    reusableStrictArtifactCandidate({
      artifact,
      run: { ...workflowRun, path: ".github/workflows/other.yml" },
      repository,
      sha,
    }),
    false,
  );
  for (const [label, candidateArtifact, candidateRun] of [
    ["different SHA", artifact, { ...workflowRun, head_sha: "b".repeat(40) }],
    ["pull request", artifact, { ...workflowRun, event: "pull_request" }],
    [
      "fork",
      artifact,
      { ...workflowRun, head_repository: { full_name: "fork/repository" } },
    ],
    [
      "non-default branch",
      artifact,
      { ...workflowRun, head_branch: "feature" },
    ],
    ["failed run", artifact, { ...workflowRun, conclusion: "failure" }],
    ["cancelled run", artifact, { ...workflowRun, conclusion: "cancelled" }],
    ["missing digest", { ...artifact, digest: null }, workflowRun],
    ["expired artifact", { ...artifact, expired: true }, workflowRun],
  ]) {
    assert.equal(
      reusableStrictArtifactCandidate({
        artifact: candidateArtifact,
        run: candidateRun,
        repository,
        sha,
      }),
      false,
      label,
    );
  }
});

test("strict reuse checks the exact provenance attempt instead of latest jobs", () => {
  assert.equal(assertSuccessfulStrictAttempt(jobs), jobs.jobs[0]);
  assert.throws(
    () =>
      assertSuccessfulStrictAttempt({
        jobs: [{ ...jobs.jobs[0], conclusion: "failure" }, jobs.jobs[1]],
      }),
    /did not pass/u,
  );
  assert.throws(
    () => assertSuccessfulStrictAttempt({ jobs: [...jobs.jobs, jobs.jobs[0]] }),
    /did not pass/u,
  );
});

test("strict reuse binds terminal provenance to artifact workflow run", () => {
  const terminal = {
    provenance: {
      source: "github-actions",
      repository,
      workflowRef: `${repository}/.github/workflows/ci.yml@refs/heads/main`,
      runId: "9",
      runAttempt: "1",
      job: "quality",
      eventName: "push",
      ref: "refs/heads/main",
      refName: "main",
      headRepository: repository,
      conclusion: "success",
    },
  };
  assert.equal(
    assertReusableTerminalProvenance(terminal, {
      repository,
      runId: 9,
      runAttempt: 1,
    }),
    terminal,
  );
  assert.throws(
    () =>
      assertReusableTerminalProvenance(terminal, {
        repository,
        runId: 10,
        runAttempt: 1,
      }),
    /does not match/u,
  );
});

test("strict reuse requires protected default branch and server-provided artifact digest", () => {
  assert.equal(
    assertProtectedDefaultBranch(
      { default_branch: "main" },
      {
        name: "main",
        protected: true,
        protection: {
          required_status_checks: {
            enforcement_level: "non_admins",
            contexts: ["CI Gate"],
          },
        },
      },
      "main",
    ),
    true,
  );
  assert.throws(
    () =>
      assertProtectedDefaultBranch(
        { default_branch: "main" },
        {
          name: "main",
          protected: false,
          protection: {
            required_status_checks: {
              enforcement_level: "off",
              contexts: [],
            },
          },
        },
        "main",
      ),
    /not protected/u,
  );
  const root = mkdtempSync(path.join(os.tmpdir(), "strict-artifact-digest-"));
  try {
    const archive = path.join(root, "artifact.zip");
    const content = Buffer.from("trusted artifact");
    writeFileSync(archive, content);
    const digest = `sha256:${createHash("sha256").update(content).digest("hex")}`;
    assert.equal(assertArtifactArchiveDigest(archive, digest), digest);
    assert.throws(
      () => assertArtifactArchiveDigest(archive, `sha256:${"0".repeat(64)}`),
      /does not match/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
