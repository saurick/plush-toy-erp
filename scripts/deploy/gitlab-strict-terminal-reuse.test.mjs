import assert from "node:assert/strict";
import test from "node:test";

import {
  assertReusableGitlabPipeline,
  validateGitlabEvidenceManifest,
} from "./gitlab-strict-terminal-reuse.mjs";
import { CI_STRICT_JOB_NAMES } from "../qa/ci-quality-shard.mjs";

const sha = "a".repeat(40);

function jobs() {
  return CI_STRICT_JOB_NAMES.map((name, index) => ({
    id: index + 1,
    name,
    status: "success",
    ref: "main",
    tag: false,
    commit: { id: sha },
    pipeline: { id: 9, sha },
  }));
}

test("protected main GitLab pipeline requires every successful DAG job", () => {
  const latest = assertReusableGitlabPipeline({
    project: { path_with_namespace: "saurick/plush-toy-erp", default_branch: "main" },
    branch: { name: "main", protected: true, commit: { id: sha } },
    pipeline: { id: 9, iid: 4, sha, ref: "main", source: "push", status: "success", tag: false },
    jobs: jobs(),
    sha,
  });
  assert.equal(latest.get("CI Gate").status, "success");
  const missing = jobs().filter((job) => job.name !== "quality_security");
  assert.throws(
    () =>
      assertReusableGitlabPipeline({
        project: { path_with_namespace: "saurick/plush-toy-erp", default_branch: "main" },
        branch: { name: "main", protected: true, commit: { id: sha } },
        pipeline: { id: 9, iid: 4, sha, ref: "main", source: "push", status: "success", tag: false },
        jobs: missing,
        sha,
      }),
    /quality_security/u,
  );
});

test("release accepts complete manual CI but rejects docs-only and partial successes", () => {
  const context = {
    project: { path_with_namespace: "saurick/plush-toy-erp", default_branch: "main" },
    branch: { name: "main", protected: true, commit: { id: sha } },
    pipeline: { id: 9, iid: 4, sha, ref: "main", source: "web", status: "success", tag: false },
    jobs: jobs(), sha,
  };
  assert.equal(assertReusableGitlabPipeline(context).get("CI Gate").status, "success");
  for (const names of [["plan", "quality_docs", "CI Gate"], ["CI Gate"], CI_STRICT_JOB_NAMES.filter((name) => name !== "quality_aggregate")]) {
    assert.throws(() => assertReusableGitlabPipeline({ ...context, jobs: jobs().filter((job) => names.includes(job.name)) }), /did not pass/u);
  }
  for (const source of ["api", "trigger", "merge_request_event", "schedule"]) {
    assert.throws(() => assertReusableGitlabPipeline({ ...context, pipeline: { ...context.pipeline, source } }), /not a protected main/u);
  }
  assert.throws(() => assertReusableGitlabPipeline({ ...context, jobs: [...jobs(), { ...jobs()[0], id: 100, status: "failed" }] }), /did not pass: plan/u);
});

test("evidence manifest binds aggregate and gate jobs plus both payload digests", () => {
  const manifest = {
    schemaVersion: "plush.gitlab-ci-evidence/v1",
    repository: "saurick/plush-toy-erp",
    gitSha: sha,
    ref: "refs/heads/main",
    protectedDefaultBranch: true,
    pipeline: { id: "9", iid: "4", source: "push" },
    aggregateJob: { id: "10", name: "quality_aggregate" },
    terminalFingerprint: "b".repeat(64),
    aggregateSha256: "c".repeat(64),
    files: [
      { name: "terminal.json", sha256: "d".repeat(64) },
      { name: "receipt.json", sha256: "e".repeat(64) },
    ],
    redaction: { containsSecrets: false, containsCredentials: false, containsRawLogs: false },
  };
  assert.equal(
    validateGitlabEvidenceManifest(manifest, {
      sha,
      pipeline: { id: 9, iid: 4, source: "push" },
      aggregateJob: { id: 10 },
      gateJob: { name: "CI Gate", status: "success" },
    }),
    manifest,
  );
  const webManifest = { ...manifest, pipeline: { ...manifest.pipeline, source: "web" } };
  const webContext = { sha, pipeline: { id: 9, iid: 4, source: "web" }, aggregateJob: { id: 10 }, gateJob: { name: "CI Gate", status: "success" } };
  assert.equal(validateGitlabEvidenceManifest(webManifest, webContext), webManifest);
  assert.throws(() => validateGitlabEvidenceManifest(manifest, webContext), /invalid/u);
  assert.throws(
    () =>
      validateGitlabEvidenceManifest(
        { ...manifest, protectedDefaultBranch: false },
        {
          sha,
          pipeline: { id: 9, iid: 4, source: "push" },
          aggregateJob: { id: 10 },
          gateJob: { name: "CI Gate", status: "success" },
        },
      ),
    /invalid/u,
  );
});
