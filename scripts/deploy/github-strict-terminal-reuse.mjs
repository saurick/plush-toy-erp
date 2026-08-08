#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  buildExactShaPlan,
  readExactShaTerminal,
} from "../qa/exact-sha-gate.mjs";
import { evaluateStrictReceiptReuse } from "../qa/strict-receipt-identity.mjs";

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const TERMINAL_ENTRY_PATTERN = /^[0-9a-f]{64}\.json$/u;
const RECEIPT_ENTRY_PATTERN = /^[0-9a-f]{64}\.receipt\.json$/u;
const WORKFLOW_PATH = ".github/workflows/ci.yml";
const STRICT_JOB_NAME = "Repository quality";
const AGGREGATE_JOB_NAME = "CI Gate";
const ARTIFACT_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;

function run(command, args, { cwd, binary = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: binary ? null : "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) {
    const detail = String(
      result.stderr || result.stdout || result.error?.message || "",
    )
      .trim()
      .split("\n")[0];
    throw new Error(
      `${command} ${args[0] || ""} failed${detail ? `: ${detail}` : ""}`,
    );
  }
  return result.stdout;
}

function ghJson(endpoint, cwd) {
  return JSON.parse(String(run("gh", ["api", endpoint], { cwd })));
}

function normalizedRepository(value) {
  return String(value || "").toLowerCase();
}

export function reusableStrictArtifactCandidate({
  artifact,
  run: workflowRun,
  repository,
  sha,
  defaultBranch = "main",
}) {
  const artifactRun = artifact?.workflow_run;
  return Boolean(
    artifact &&
      artifact.expired === false &&
      artifact.name === `strict-terminal-${sha}` &&
      Number.isSafeInteger(Number(artifact.id)) &&
      Number.isSafeInteger(Number(artifactRun?.id)) &&
      ARTIFACT_DIGEST_PATTERN.test(String(artifact.digest || "")) &&
      artifactRun.head_sha === sha &&
      Number(artifactRun.id) === Number(workflowRun?.id) &&
      workflowRun?.head_sha === sha &&
      workflowRun?.status === "completed" &&
      workflowRun?.conclusion === "success" &&
      workflowRun?.event === "push" &&
      workflowRun?.path === WORKFLOW_PATH &&
      workflowRun?.head_branch === defaultBranch &&
      normalizedRepository(workflowRun?.repository?.full_name) ===
        normalizedRepository(repository) &&
      normalizedRepository(workflowRun?.head_repository?.full_name) ===
        normalizedRepository(repository),
  );
}

export function assertSuccessfulStrictAttempt(jobs) {
  const values = jobs?.jobs || jobs;
  if (!Array.isArray(values) || values.length > 100) {
    throw new Error("strict artifact attempt jobs are invalid");
  }
  const strictJobs = values.filter((job) => job?.name === STRICT_JOB_NAME);
  const aggregateJobs = values.filter(
    (job) => job?.name === AGGREGATE_JOB_NAME,
  );
  if (
    strictJobs.length !== 1 ||
    aggregateJobs.length !== 1 ||
    strictJobs[0]?.status !== "completed" ||
    strictJobs[0]?.conclusion !== "success" ||
    aggregateJobs[0]?.status !== "completed" ||
    aggregateJobs[0]?.conclusion !== "success"
  ) {
    throw new Error("strict artifact attempt did not pass quality and CI Gate");
  }
  return strictJobs[0];
}

export function assertProtectedDefaultBranch(
  repositoryMetadata,
  branchMetadata,
  defaultBranch = "main",
) {
  const requiredStatusChecks =
    branchMetadata?.protection?.required_status_checks;
  const contexts = new Set(requiredStatusChecks?.contexts || []);
  if (
    repositoryMetadata?.default_branch !== defaultBranch ||
    branchMetadata?.name !== defaultBranch ||
    branchMetadata?.protected !== true ||
    !["non_admins", "everyone"].includes(
      requiredStatusChecks?.enforcement_level,
    ) ||
    !contexts.has(AGGREGATE_JOB_NAME)
  ) {
    throw new Error(
      "strict artifact default branch is not protected by CI Gate",
    );
  }
  return true;
}

export function assertArtifactArchiveDigest(archive, expectedDigest) {
  if (!ARTIFACT_DIGEST_PATTERN.test(String(expectedDigest || ""))) {
    throw new Error("strict artifact has no trusted GitHub digest");
  }
  const actual = `sha256:${createHash("sha256")
    .update(readFileSync(archive))
    .digest("hex")}`;
  if (actual !== expectedDigest) {
    throw new Error("strict artifact GitHub digest does not match download");
  }
  return actual;
}

export function assertReusableTerminalProvenance(
  terminal,
  { repository, runId, runAttempt, defaultBranch = "main" },
) {
  const provenance = terminal?.provenance;
  if (
    provenance?.source !== "github-actions" ||
    normalizedRepository(provenance.repository) !==
      normalizedRepository(repository) ||
    provenance.runId !== String(runId) ||
    provenance.runAttempt !== String(runAttempt) ||
    provenance.job !== "quality" ||
    provenance.eventName !== "push" ||
    provenance.ref !== `refs/heads/${defaultBranch}` ||
    provenance.refName !== defaultBranch ||
    normalizedRepository(provenance.headRepository) !==
      normalizedRepository(repository) ||
    provenance.conclusion !== "success" ||
    !String(provenance.workflowRef || "").includes(`/${WORKFLOW_PATH}@`)
  ) {
    throw new Error(
      "strict terminal GitHub provenance does not match its artifact run",
    );
  }
  return terminal;
}

function archiveEntries(archive, cwd) {
  return String(run("unzip", ["-Z1", archive], { cwd }))
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter(Boolean);
}

function extractStrictPair(archive, out, cwd) {
  const entries = archiveEntries(archive, cwd);
  const terminals = entries.filter((entry) =>
    TERMINAL_ENTRY_PATTERN.test(entry),
  );
  const receipts = entries.filter((entry) => RECEIPT_ENTRY_PATTERN.test(entry));
  if (
    entries.length !== 2 ||
    terminals.length !== 1 ||
    receipts.length !== 1 ||
    receipts[0] !== terminals[0].replace(/\.json$/u, ".receipt.json")
  ) {
    throw new Error(
      "strict artifact ZIP must contain exactly one terminal/receipt pair",
    );
  }
  mkdirSync(out, { recursive: true, mode: 0o700 });
  for (const entry of entries) {
    const content = run("unzip", ["-p", archive, entry], { cwd, binary: true });
    writeFileSync(path.join(out, entry), content, { mode: 0o600 });
  }
}

export function parseStrictReuseArgs(argv) {
  const options = { repository: "", sha: "", out: "", json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    const mapping = {
      "--repository": "repository",
      "--sha": "sha",
      "--out": "out",
    };
    if (mapping[arg]) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--"))
        throw new Error(`${arg} requires a value`);
      options[mapping[arg]] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  if (!REPOSITORY_PATTERN.test(options.repository))
    throw new Error("repository must be owner/name");
  if (!SHA_PATTERN.test(options.sha))
    throw new Error("sha must be 40 lowercase hexadecimal characters");
  if (!options.out) throw new Error("--out is required");
  return options;
}

export function recoverGitHubStrictTerminal(
  options,
  { root = process.cwd() } = {},
) {
  const repositoryMetadata = ghJson(`repos/${options.repository}`, root);
  const defaultBranch = String(repositoryMetadata.default_branch || "");
  const branchMetadata = ghJson(
    `repos/${options.repository}/branches/${encodeURIComponent(defaultBranch)}`,
    root,
  );
  assertProtectedDefaultBranch(
    repositoryMetadata,
    branchMetadata,
    defaultBranch,
  );
  const response = ghJson(
    `repos/${options.repository}/actions/artifacts?name=strict-terminal-${options.sha}&per_page=100`,
    root,
  );
  const candidates = [...(response.artifacts || [])].sort((left, right) =>
    String(right.created_at || "").localeCompare(String(left.created_at || "")),
  );
  const out = path.resolve(root, options.out);
  for (const artifact of candidates) {
    const runId = Number(artifact?.workflow_run?.id);
    if (!Number.isSafeInteger(runId)) continue;
    const workflowRun = ghJson(
      `repos/${options.repository}/actions/runs/${runId}`,
      root,
    );
    if (
      !reusableStrictArtifactCandidate({
        artifact,
        run: workflowRun,
        repository: options.repository,
        sha: options.sha,
        defaultBranch,
      })
    ) {
      continue;
    }
    const archive = path.join(
      process.env.RUNNER_TEMP || out,
      `strict-${artifact.id}.zip`,
    );
    try {
      writeFileSync(
        archive,
        run(
          "gh",
          [
            "api",
            `repos/${options.repository}/actions/artifacts/${artifact.id}/zip`,
          ],
          { cwd: root, binary: true },
        ),
        { mode: 0o600 },
      );
      assertArtifactArchiveDigest(archive, artifact.digest);
      rmSync(out, { recursive: true, force: true });
      extractStrictPair(archive, out, root);
      const plan = buildExactShaPlan(root, {
        sha: options.sha,
        mainRef: "origin/main",
      });
      const terminal = readExactShaTerminal(plan);
      assertReusableTerminalProvenance(terminal, {
        repository: options.repository,
        runId,
        runAttempt: workflowRun.run_attempt,
        defaultBranch,
      });
      const runAttempt = Number(terminal.provenance.runAttempt);
      if (!Number.isSafeInteger(runAttempt) || runAttempt < 1) {
        throw new Error("strict terminal run attempt is invalid");
      }
      const jobs = ghJson(
        `repos/${options.repository}/actions/runs/${runId}/attempts/${runAttempt}/jobs?per_page=100`,
        root,
      );
      assertSuccessfulStrictAttempt(jobs);
      const evaluation = evaluateStrictReceiptReuse({
        terminal,
        expectedIdentity: plan.identity,
        trust: {
          repository: true,
          protectedDefaultBranch: true,
          workflow: true,
          artifactDigest: true,
          run: true,
          job: true,
        },
      });
      if (!evaluation.reusable) {
        throw new Error(
          `strict terminal is not reusable: ${evaluation.reason}`,
        );
      }
      return {
        reused: true,
        artifactId: Number(artifact.id),
        artifactDigest: artifact.digest,
        runId,
        runAttempt,
        terminal,
        reuseReason: evaluation.reason,
        refreshChecks: [...evaluation.refreshChecks],
      };
    } catch (error) {
      rmSync(out, { recursive: true, force: true });
      process.stderr.write(
        `[strict-reuse] rejected artifact=${artifact.id} reason=${error.message}\n`,
      );
    } finally {
      if (existsSync(archive)) rmSync(archive, { force: true });
    }
  }
  return {
    reused: false,
    artifactId: null,
    artifactDigest: null,
    runId: null,
    runAttempt: null,
    terminal: null,
    reuseReason: "no_trusted_exact_identity_artifact",
    refreshChecks: [],
  };
}

function main() {
  const options = parseStrictReuseArgs(process.argv.slice(2));
  const result = recoverGitHubStrictTerminal(options);
  const output = {
    status: "passed",
    reused: result.reused,
    artifactId: result.artifactId,
    artifactDigest: result.artifactDigest,
    runId: result.runId,
    runAttempt: result.runAttempt,
    reuseReason: result.reuseReason,
    refreshChecks: result.refreshChecks,
  };
  console.log(
    options.json
      ? JSON.stringify(output, null, 2)
      : `[strict-reuse] reused=${result.reused}`,
  );
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(`[strict-reuse] status=blocked reason=${error.message}`);
    process.exitCode = 2;
  }
}
