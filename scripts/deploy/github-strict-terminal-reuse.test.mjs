import assert from "node:assert/strict";
import test from "node:test";

import {
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
  workflow_run: { id: 9, head_sha: sha },
};
const workflowRun = {
  id: 9,
  head_sha: sha,
  event: "workflow_dispatch",
  path: ".github/workflows/release.yml",
  repository: { full_name: repository },
};
const jobs = {
  jobs: [
    {
      name: "Exact-SHA strict quality",
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
});

test("strict reuse checks the exact provenance attempt instead of latest jobs", () => {
  assert.equal(assertSuccessfulStrictAttempt(jobs), jobs.jobs[0]);
  assert.throws(
    () =>
      assertSuccessfulStrictAttempt({
        jobs: [{ ...jobs.jobs[0], conclusion: "failure" }],
      }),
    /did not pass/u,
  );
  assert.throws(
    () => assertSuccessfulStrictAttempt({ jobs: [...jobs.jobs, ...jobs.jobs] }),
    /did not pass/u,
  );
});

test("strict reuse binds terminal provenance to artifact workflow run", () => {
  const terminal = {
    provenance: {
      source: "github-actions",
      repository,
      workflowRef: `${repository}/.github/workflows/release.yml@refs/heads/main`,
      runId: "9",
      runAttempt: "1",
      job: "strict",
    },
  };
  assert.equal(
    assertReusableTerminalProvenance(terminal, { repository, runId: 9 }),
    terminal,
  );
  assert.throws(
    () => assertReusableTerminalProvenance(terminal, { repository, runId: 10 }),
    /does not match/u,
  );
});
