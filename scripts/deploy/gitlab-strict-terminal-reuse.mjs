#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
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
import { CI_EVIDENCE_MANIFEST_SCHEMA } from "../qa/ci-quality-aggregate.mjs";
import { CI_QUALITY_SHARDS } from "../qa/ci-quality-shard.mjs";

export const GITLAB_CI_EVIDENCE_PACKAGE = "plush-ci-evidence";
const REPOSITORY = "saurick/plush-toy-erp";
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const EXPECTED_JOB_NAMES = Object.freeze([
  "plan",
  "prepare",
  ...Object.values(CI_QUALITY_SHARDS).map((value) => value.job),
  "quality_aggregate",
  "CI Gate",
]);
const EVIDENCE_FILES = Object.freeze([
  "evidence-manifest.json",
  "receipt.json",
  "terminal.json",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function headers(token, extra = {}) {
  return { "PRIVATE-TOKEN": token, ...extra };
}

async function requestResponse(request, url, token, options = {}) {
  const response = await request(url, {
    ...options,
    headers: headers(token, options.headers || {}),
  });
  if (!response?.ok) {
    throw new Error(`GitLab evidence request failed with status ${String(response?.status || "unknown")}`);
  }
  return response;
}

async function requestJson(request, url, token) {
  const response = await requestResponse(request, url, token, {
    headers: { accept: "application/json" },
  });
  return response.json();
}

function latestSuccessfulJobs(jobs) {
  if (!Array.isArray(jobs) || jobs.length > 200) {
    throw new Error("GitLab evidence job list is invalid");
  }
  const latest = new Map();
  for (const job of jobs) {
    if (!Number.isSafeInteger(job?.id) || job.id < 1 || typeof job?.name !== "string") {
      throw new Error("GitLab evidence job identity is invalid");
    }
    const current = latest.get(job.name);
    if (!current || job.id > current.id) latest.set(job.name, job);
  }
  for (const name of EXPECTED_JOB_NAMES) {
    const job = latest.get(name);
    if (
      !job ||
      job.status !== "success" ||
      job.ref !== "main" ||
      job.tag === true ||
      job.commit?.id !== job.pipeline?.sha
    ) {
      throw new Error(`GitLab evidence job did not pass: ${name}`);
    }
  }
  return latest;
}

export function assertReusableGitlabPipeline({
  project,
  branch,
  pipeline,
  jobs,
  sha,
  repository = REPOSITORY,
}) {
  if (
    project?.path_with_namespace !== repository ||
    project?.default_branch !== "main" ||
    branch?.name !== "main" ||
    branch?.protected !== true ||
    branch?.commit?.id !== sha ||
    !Number.isSafeInteger(pipeline?.id) ||
    pipeline.id < 1 ||
    !Number.isSafeInteger(pipeline?.iid) ||
    pipeline.iid < 1 ||
    pipeline?.sha !== sha ||
    pipeline?.ref !== "main" ||
    pipeline?.source !== "push" ||
    pipeline?.status !== "success" ||
    pipeline?.tag === true
  ) {
    throw new Error("GitLab evidence pipeline is not a protected main push");
  }
  const latest = latestSuccessfulJobs(jobs);
  for (const job of latest.values()) {
    if (job.pipeline?.id !== pipeline.id || job.pipeline?.sha !== sha) {
      throw new Error("GitLab evidence job belongs to another pipeline");
    }
  }
  return latest;
}

export function validateGitlabEvidenceManifest(
  manifest,
  { sha, pipeline, aggregateJob, gateJob, repository = REPOSITORY },
) {
  const files = new Map((manifest?.files || []).map((file) => [file.name, file]));
  if (
    manifest?.schemaVersion !== CI_EVIDENCE_MANIFEST_SCHEMA ||
    manifest?.repository !== repository ||
    manifest?.gitSha !== sha ||
    manifest?.ref !== "refs/heads/main" ||
    manifest?.protectedDefaultBranch !== true ||
    manifest?.pipeline?.id !== String(pipeline.id) ||
    manifest?.pipeline?.iid !== String(pipeline.iid) ||
    manifest?.pipeline?.source !== "push" ||
    manifest?.aggregateJob?.id !== String(aggregateJob.id) ||
    manifest?.aggregateJob?.name !== "quality_aggregate" ||
    !SHA256_PATTERN.test(String(manifest?.terminalFingerprint || "")) ||
    !SHA256_PATTERN.test(String(manifest?.aggregateSha256 || "")) ||
    files.size !== 2 ||
    !["terminal.json", "receipt.json"].every(
      (name) => SHA256_PATTERN.test(String(files.get(name)?.sha256 || "")),
    ) ||
    manifest?.redaction?.containsSecrets !== false ||
    manifest?.redaction?.containsCredentials !== false ||
    manifest?.redaction?.containsRawLogs !== false ||
    gateJob?.name !== "CI Gate" ||
    gateJob?.status !== "success"
  ) {
    throw new Error("GitLab evidence manifest is invalid");
  }
  return manifest;
}

function packageFiles(value) {
  if (!Array.isArray(value) || value.length > 20) {
    throw new Error("GitLab evidence package file list is invalid");
  }
  const files = new Map();
  for (const file of value) {
    const name = String(file?.file_name || "");
    if (
      !EVIDENCE_FILES.includes(name) ||
      files.has(name) ||
      !Number.isSafeInteger(file?.id) ||
      file.id < 1 ||
      !Number.isSafeInteger(file?.size) ||
      file.size < 1 ||
      file.size > 8 * 1024 * 1024 ||
      !SHA256_PATTERN.test(String(file?.file_sha256 || ""))
    ) {
      throw new Error("GitLab evidence package file metadata is invalid");
    }
    files.set(name, file);
  }
  if (files.size !== EVIDENCE_FILES.length) {
    throw new Error("GitLab evidence package is incomplete");
  }
  return files;
}

function atomicBuffer(file, buffer) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, buffer, { mode: 0o600, flag: "wx" });
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}

async function downloadEvidenceFile({ request, baseUrl, projectId, version, name, token, metadata }) {
  const url = `${baseUrl}/projects/${projectId}/packages/generic/${GITLAB_CI_EVIDENCE_PACKAGE}/${encodeURIComponent(version)}/${encodeURIComponent(name)}`;
  const response = await requestResponse(request, url, token, {
    headers: { accept: "application/octet-stream" },
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length !== metadata.size || sha256(buffer) !== metadata.file_sha256) {
    throw new Error(`GitLab evidence package digest mismatch: ${name}`);
  }
  return buffer;
}

export async function recoverGitlabStrictTerminal(
  { sha, out },
  {
    root = process.cwd(),
    env = process.env,
    request = globalThis.fetch,
    now = Date.now(),
  } = {},
) {
  if (!SHA_PATTERN.test(String(sha || "")) || !out) {
    throw new Error("GitLab evidence reuse requires exact SHA and output directory");
  }
  const token = String(env.GITLAB_RELEASE_TOKEN || "");
  const baseUrl = String(env.CI_API_V4_URL || "");
  const projectId = String(env.CI_PROJECT_ID || "");
  if (!token || !/^https:\/\/gitlab\.saurick\.me\/api\/v4$/u.test(baseUrl) || !/^\d+$/u.test(projectId)) {
    throw new Error("GitLab evidence reuse environment is incomplete");
  }
  const [project, branch, pipelines] = await Promise.all([
    requestJson(request, `${baseUrl}/projects/${projectId}`, token),
    requestJson(request, `${baseUrl}/projects/${projectId}/repository/branches/main`, token),
    requestJson(
      request,
      `${baseUrl}/projects/${projectId}/pipelines?sha=${sha}&ref=main&status=success&source=push&order_by=id&sort=desc&per_page=20`,
      token,
    ),
  ]);
  if (!Array.isArray(pipelines) || pipelines.length > 20) {
    throw new Error("GitLab evidence pipeline list is invalid");
  }
  const failures = [];
  for (const candidate of pipelines) {
    try {
      const [pipeline, jobs] = await Promise.all([
        requestJson(request, `${baseUrl}/projects/${projectId}/pipelines/${candidate.id}`, token),
        requestJson(
          request,
          `${baseUrl}/projects/${projectId}/pipelines/${candidate.id}/jobs?include_retried=true&per_page=200`,
          token,
        ),
      ]);
      const latest = assertReusableGitlabPipeline({ project, branch, pipeline, jobs, sha });
      const gateJob = latest.get("CI Gate");
      const aggregateJob = latest.get("quality_aggregate");
      const version = `pipeline-${pipeline.id}-job-${gateJob.id}-${sha}`;
      const packages = await requestJson(
        request,
        `${baseUrl}/projects/${projectId}/packages?package_type=generic&package_name=${GITLAB_CI_EVIDENCE_PACKAGE}&package_version=${encodeURIComponent(version)}&per_page=20`,
        token,
      );
      const matching = (packages || []).filter(
        (item) =>
          item?.package_type === "generic" &&
          item?.name === GITLAB_CI_EVIDENCE_PACKAGE &&
          item?.version === version,
      );
      if (matching.length !== 1 || !Number.isSafeInteger(matching[0]?.id)) {
        throw new Error("GitLab evidence package identity is not unique");
      }
      const metadata = packageFiles(
        await requestJson(
          request,
          `${baseUrl}/projects/${projectId}/packages/${matching[0].id}/package_files?per_page=20`,
          token,
        ),
      );
      const downloaded = new Map();
      for (const name of EVIDENCE_FILES) {
        downloaded.set(
          name,
          await downloadEvidenceFile({
            request,
            baseUrl,
            projectId,
            version,
            name,
            token,
            metadata: metadata.get(name),
          }),
        );
      }
      const manifest = validateGitlabEvidenceManifest(
        JSON.parse(downloaded.get("evidence-manifest.json").toString("utf8")),
        { sha, pipeline, aggregateJob, gateJob },
      );
      const manifestFiles = new Map(manifest.files.map((file) => [file.name, file.sha256]));
      for (const name of ["terminal.json", "receipt.json"]) {
        if (sha256(downloaded.get(name)) !== manifestFiles.get(name)) {
          throw new Error(`GitLab evidence manifest digest mismatch: ${name}`);
        }
      }
      const terminalJson = JSON.parse(downloaded.get("terminal.json").toString("utf8"));
      if (
        terminalJson?.provenance?.source !== "gitlab-ci" ||
        terminalJson?.provenance?.repository !== REPOSITORY ||
        terminalJson?.provenance?.runId !== String(pipeline.id) ||
        terminalJson?.provenance?.runAttempt !== String(pipeline.iid) ||
        terminalJson?.provenance?.job !== "quality_aggregate" ||
        terminalJson?.provenance?.eventName !== "push" ||
        terminalJson?.provenance?.ref !== "refs/heads/main" ||
        terminalJson?.provenance?.refName !== "main" ||
        terminalJson?.provenance?.headRepository !== REPOSITORY ||
        terminalJson?.provenance?.conclusion !== "success"
      ) {
        throw new Error("GitLab evidence terminal provenance is invalid");
      }
      const plan = buildExactShaPlan(path.resolve(root), {
        sha,
        mainRef: "origin/main",
        env: { ...env, CI_PROJECT_PATH: REPOSITORY },
      });
      if (
        terminalJson.fingerprint !== plan.fingerprint ||
        terminalJson.receipt?.path !== plan.receiptRelativePath
      ) {
        throw new Error("GitLab evidence terminal fingerprint does not match current policy");
      }
      atomicBuffer(plan.receiptPath, downloaded.get("receipt.json"));
      atomicBuffer(plan.terminalPath, downloaded.get("terminal.json"));
      const terminal = readExactShaTerminal(plan);
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
        now,
      });
      if (!evaluation.reusable || evaluation.refreshChecks.length > 0) {
        throw new Error(`GitLab evidence terminal is not immediately reusable: ${evaluation.reason}`);
      }
      const resolvedOut = path.resolve(root, out);
      mkdirSync(resolvedOut, { recursive: true, mode: 0o700 });
      atomicBuffer(path.join(resolvedOut, "evidence-manifest.json"), downloaded.get("evidence-manifest.json"));
      return {
        status: "reused",
        pipelineId: String(pipeline.id),
        pipelineIid: String(pipeline.iid),
        gateJobId: String(gateJob.id),
        aggregateJobId: String(aggregateJob.id),
        packageVersion: version,
        terminalPath: path.relative(root, plan.terminalPath),
        receiptPath: path.relative(root, plan.receiptPath),
      };
    } catch (error) {
      failures.push(String(error?.message || error).slice(0, 180));
    }
  }
  throw new Error(
    failures.length > 0
      ? `no reusable protected-main GitLab evidence package: ${failures[0]}`
      : "no successful protected-main push pipeline exists for exact SHA",
  );
}

function parseArgs(argv) {
  const options = { sha: "", out: "", json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (["--sha", "--out"].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      options[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

const isDirectRun =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await recoverGitlabStrictTerminal(options);
    process.stdout.write(
      options.json
        ? `${JSON.stringify(result, null, 2)}\n`
        : `[gitlab-strict-reuse] status=reused pipeline=${result.pipelineId} terminal=${result.terminalPath}\n`,
    );
  } catch (error) {
    process.stderr.write(`[gitlab-strict-reuse] status=blocked reason=${error.message}\n`);
    process.exitCode = 2;
  }
}
