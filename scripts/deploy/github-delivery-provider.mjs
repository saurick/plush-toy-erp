import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  DELIVERY_PROVIDER_CONTRACT,
  DELIVERY_PROVIDER_RELEASE_STATUS_CONTRACT,
  validateDeliveryReleaseVersion,
  validateReleaseDispatchRequest,
} from "./delivery-provider.mjs";
import { validateReleaseManifest } from "./release-catalog.mjs";

export const GITHUB_API_VERSION = "2022-11-28";
export const GITHUB_DELIVERY_REPOSITORY = "saurick/plush-toy-erp";
export const GITHUB_RELEASE_WORKFLOW = "release.yml";
export const GITHUB_PIPELINE_TIMINGS_CONTRACT =
  "plush.delivery-pipeline-timings/v1";
export const GITHUB_RELEASE_ASSETS = Object.freeze([
  "checksums.sha256",
  "release-artifact.json",
  "release-manifest.json",
  "sbom.cdx.json",
  "server-image.tar",
  "web-image.tar",
]);

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const MAX_GITHUB_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_RELEASE_DETAIL_BYTES = 512 * 1024;
const TRACKED_WORKFLOWS = Object.freeze({
  ".github/workflows/ci.yml": "ci",
  ".github/workflows/release.yml": "release",
});
const RUN_STATUSES = new Set([
  "queued",
  "in_progress",
  "completed",
  "waiting",
  "requested",
  "pending",
]);

function runGh(runCommand, args, { cwd, timeout = 30_000 } = {}) {
  const result = runCommand("gh", args, {
    cwd,
    encoding: "utf8",
    timeout,
    maxBuffer: MAX_GITHUB_OUTPUT_BYTES,
    env: process.env,
  });
  if (result.error) {
    const timedOut =
      result.error.code === "ETIMEDOUT" ||
      result.error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" ||
      result.signal === "SIGTERM";
    throw new Error(
      timedOut
        ? "GitHub adapter command timed out"
        : "GitHub adapter could not start gh",
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `GitHub adapter command failed with exit ${String(result.status)}`,
    );
  }
  return String(result.stdout || "");
}

function parseGithubUrl(value, expectedSuffix) {
  const text = String(value || "");
  if (
    text !== `https://github.com/${GITHUB_DELIVERY_REPOSITORY}${expectedSuffix}`
  ) {
    throw new Error("GitHub response URL is outside the fixed repository");
  }
  return text;
}

function normalizeRelease(raw) {
  const tag = String(raw?.tag_name || "");
  const match = /^artifact-([0-9a-f]{40})$/u.exec(tag);
  if (!match || raw?.target_commitish !== match[1]) {
    throw new Error("GitHub release identity is invalid");
  }
  const rawAssets = Array.isArray(raw.assets) ? raw.assets : [];
  const assets = rawAssets
    .map((asset) => String(asset?.name || ""))
    .filter((name) => GITHUB_RELEASE_ASSETS.includes(name))
    .sort();
  const assetByName = new Map(
    rawAssets
      .filter((asset) =>
        GITHUB_RELEASE_ASSETS.includes(String(asset?.name || "")),
      )
      .map((asset) => [String(asset.name), asset]),
  );
  const sizeOf = (name) => {
    const size = assetByName.get(name)?.size;
    return Number.isSafeInteger(size) && size >= 0 ? size : 0;
  };
  return validateDeliveryReleaseVersion({
    schemaVersion: "plush.delivery-version/v1",
    status: raw.draft ? "draft" : raw.prerelease ? "prerelease" : "published",
    tag,
    gitSha: match[1],
    version: String(raw.name || ""),
    publishedAt: String(raw.published_at || ""),
    url: parseGithubUrl(raw.html_url, `/releases/tag/${tag}`),
    assets,
    artifactSummary: {
      totalBytes: [...assetByName.values()].reduce(
        (total, asset) =>
          total +
          (Number.isSafeInteger(asset?.size) && asset.size >= 0
            ? asset.size
            : 0),
        0,
      ),
      serverImageBytes: sizeOf("server-image.tar"),
      webImageBytes: sizeOf("web-image.tar"),
      sbomBytes: sizeOf("sbom.cdx.json"),
    },
    buildPerformance: null,
    imageDigests: null,
    completeAssets:
      assets.length === GITHUB_RELEASE_ASSETS.length &&
      assets.every(
        (asset, index) => asset === [...GITHUB_RELEASE_ASSETS].sort()[index],
      ),
  });
}

function normalizeRun(raw, gitSha) {
  const createdAt = String(raw?.createdAt || "");
  if (
    !Number.isSafeInteger(raw?.databaseId) ||
    raw.databaseId <= 0 ||
    raw?.headSha !== gitSha ||
    Number.isNaN(Date.parse(createdAt)) ||
    !["queued", "in_progress", "completed", "waiting", "requested"].includes(
      raw?.status,
    )
  ) {
    throw new Error("GitHub workflow run identity is invalid");
  }
  const url = String(raw.url || "");
  if (
    !new RegExp(
      `^https://github\\.com/saurick/plush-toy-erp/actions/runs/${raw.databaseId}$`,
      "u",
    ).test(url)
  ) {
    throw new Error("GitHub workflow run URL is invalid");
  }
  return {
    id: raw.databaseId,
    status: raw.status,
    conclusion: String(raw.conclusion || ""),
    createdAt,
    gitSha,
    url,
  };
}

function normalizeLabel(value, field) {
  const label = String(value || "").trim();
  if (!label || label.length > 160 || /[\u0000-\u001f\u007f]/u.test(label)) {
    throw new Error(`GitHub ${field} label is invalid`);
  }
  return label;
}

function normalizeTimestamp(value, field, { optional = false } = {}) {
  if ((value === null || value === undefined || value === "") && optional) {
    return null;
  }
  const timestamp = String(value || "");
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error(`GitHub ${field} timestamp is invalid`);
  }
  return timestamp;
}

function elapsedMs(startedAt, finishedAt) {
  if (!startedAt || !finishedAt) return null;
  return Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
}

function normalizePipelineStatus(value, field) {
  const status = String(value || "");
  if (!RUN_STATUSES.has(status)) {
    throw new Error(`GitHub ${field} status is invalid`);
  }
  return status;
}

function normalizePipelineStep(raw) {
  const startedAt = normalizeTimestamp(raw?.started_at, "step start", {
    optional: true,
  });
  const finishedAt = normalizeTimestamp(raw?.completed_at, "step finish", {
    optional: true,
  });
  if (!Number.isSafeInteger(raw?.number) || raw.number < 1) {
    throw new Error("GitHub step number is invalid");
  }
  return {
    number: raw.number,
    name: normalizeLabel(raw?.name, "step"),
    status: normalizePipelineStatus(raw?.status, "step"),
    conclusion: String(raw?.conclusion || ""),
    startedAt,
    finishedAt,
    durationMs: elapsedMs(startedAt, finishedAt),
  };
}

function normalizePipelineJob(raw) {
  if (!Number.isSafeInteger(raw?.id) || raw.id < 1) {
    throw new Error("GitHub job identity is invalid");
  }
  const startedAt = normalizeTimestamp(raw?.started_at, "job start", {
    optional: true,
  });
  const finishedAt = normalizeTimestamp(raw?.completed_at, "job finish", {
    optional: true,
  });
  const steps = Array.isArray(raw?.steps)
    ? raw.steps.map(normalizePipelineStep)
    : [];
  if (steps.length > 100) {
    throw new Error("GitHub job step response is too large");
  }
  return {
    id: raw.id,
    name: normalizeLabel(raw?.name, "job"),
    status: normalizePipelineStatus(raw?.status, "job"),
    conclusion: String(raw?.conclusion || ""),
    startedAt,
    finishedAt,
    durationMs: elapsedMs(startedAt, finishedAt),
    steps,
  };
}

function normalizePipelineRun(raw, jobs) {
  const workflow = TRACKED_WORKFLOWS[String(raw?.path || "")];
  if (
    !workflow ||
    !Number.isSafeInteger(raw?.id) ||
    raw.id < 1 ||
    !Number.isSafeInteger(raw?.run_attempt) ||
    raw.run_attempt < 1 ||
    !SHA_PATTERN.test(String(raw?.head_sha || ""))
  ) {
    throw new Error("GitHub pipeline run identity is invalid");
  }
  const createdAt = normalizeTimestamp(raw?.created_at, "run creation");
  const startedAt = normalizeTimestamp(raw?.run_started_at, "run start", {
    optional: true,
  });
  const finishedAt =
    raw?.status === "completed"
      ? normalizeTimestamp(raw?.updated_at, "run finish")
      : null;
  const url = parseGithubUrl(raw?.html_url, `/actions/runs/${raw.id}`);
  return {
    id: raw.id,
    attempt: raw.run_attempt,
    workflow,
    event: normalizeLabel(raw?.event, "event"),
    status: normalizePipelineStatus(raw?.status, "run"),
    conclusion: String(raw?.conclusion || ""),
    gitSha: raw.head_sha,
    createdAt,
    startedAt,
    finishedAt,
    queueMs: elapsedMs(createdAt, startedAt),
    durationMs: elapsedMs(startedAt, finishedAt),
    url,
    jobs,
  };
}

function assertDownloadDirectory(projectRoot, destination) {
  const outputRoot = path.join(realpathSync(projectRoot), "output");
  const candidate = path.resolve(destination);
  if (
    !candidate.startsWith(
      `${path.join(outputRoot, "dev-workbench", "releases")}${path.sep}`,
    )
  ) {
    throw new Error(
      "GitHub release download must remain in the fixed output root",
    );
  }
  let cursor = candidate;
  while (cursor !== outputRoot) {
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) {
      throw new Error("GitHub release download path contains a symbolic link");
    }
    cursor = path.dirname(cursor);
  }
  return candidate;
}

export function createGithubDeliveryProvider({
  projectRoot = process.cwd(),
  runCommand = spawnSync,
  now = () => new Date().toISOString(),
} = {}) {
  const root = realpathSync(projectRoot);
  const releaseDetailCache = new Map();

  function readReleaseDetail(rawRelease, version) {
    const cached = releaseDetailCache.get(version.gitSha);
    if (cached) return cached;
    const assets = Array.isArray(rawRelease?.assets) ? rawRelease.assets : [];
    const readAsset = (name) => {
      const asset = assets.find((item) => item?.name === name);
      if (
        !Number.isSafeInteger(asset?.id) ||
        asset.id <= 0 ||
        !Number.isSafeInteger(asset?.size) ||
        asset.size <= 0 ||
        asset.size > MAX_RELEASE_DETAIL_BYTES
      ) {
        throw new Error("GitHub release detail asset is invalid");
      }
      const output = runGh(
        runCommand,
        [
          "api",
          "--method",
          "GET",
          "-H",
          `X-GitHub-Api-Version: ${GITHUB_API_VERSION}`,
          "-H",
          "Accept: application/octet-stream",
          `repos/${GITHUB_DELIVERY_REPOSITORY}/releases/assets/${asset.id}`,
        ],
        { cwd: root },
      );
      if (Buffer.byteLength(output) > MAX_RELEASE_DETAIL_BYTES) {
        throw new Error("GitHub release detail response is too large");
      }
      return JSON.parse(output);
    };
    const artifact = readAsset("release-artifact.json");
    const manifest = validateReleaseManifest(
      readAsset("release-manifest.json"),
    );
    if (
      artifact?.schemaVersion !== "plush-release-artifact/v1" ||
      artifact?.git?.commit !== version.gitSha ||
      manifest.gitSha !== version.gitSha ||
      manifest.version !== version.version
    ) {
      throw new Error("GitHub release detail identity is invalid");
    }
    const imageDigests = Object.fromEntries(
      manifest.images.map((image) => [image.kind, image.digest]),
    );
    if (
      !SHA256_DIGEST_PATTERN.test(String(imageDigests.server || "")) ||
      !SHA256_DIGEST_PATTERN.test(String(imageDigests.web || ""))
    ) {
      throw new Error("GitHub release image digests are invalid");
    }
    const detail = validateDeliveryReleaseVersion({
      ...version,
      buildPerformance: artifact?.performance?.build || null,
      imageDigests,
    });
    releaseDetailCache.set(version.gitSha, detail);
    return detail;
  }

  return {
    schemaVersion: DELIVERY_PROVIDER_CONTRACT,
    provider: "github",
    repository: GITHUB_DELIVERY_REPOSITORY,
    workflow: GITHUB_RELEASE_WORKFLOW,

    listVersions({ limit = 20 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
        throw new Error("GitHub release list limit is invalid");
      }
      const output = runGh(
        runCommand,
        [
          "api",
          "--method",
          "GET",
          "-H",
          `X-GitHub-Api-Version: ${GITHUB_API_VERSION}`,
          `repos/${GITHUB_DELIVERY_REPOSITORY}/releases?per_page=${limit}`,
        ],
        { cwd: root },
      );
      const releases = JSON.parse(output);
      if (!Array.isArray(releases) || releases.length > limit) {
        throw new Error("GitHub release list response is invalid");
      }
      const normalized = releases
        .filter((release) =>
          /^artifact-[0-9a-f]{40}$/u.test(String(release?.tag_name || "")),
        )
        .map((release) => ({
          raw: release,
          version: normalizeRelease(release),
        }))
        .sort(
          (left, right) =>
            Date.parse(right.version.publishedAt) -
            Date.parse(left.version.publishedAt),
        );
      if (normalized[0]) {
        try {
          normalized[0].version = readReleaseDetail(
            normalized[0].raw,
            normalized[0].version,
          );
        } catch {
          // Asset names and byte sizes remain usable; detail metrics fail closed as null.
        }
      }
      return normalized.map((item) => item.version);
    },

    listPipelineTimings({ limit = 8 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
        throw new Error("GitHub pipeline timing limit is invalid");
      }
      const runOutput = runGh(
        runCommand,
        [
          "api",
          "--method",
          "GET",
          "-H",
          `X-GitHub-Api-Version: ${GITHUB_API_VERSION}`,
          `repos/${GITHUB_DELIVERY_REPOSITORY}/actions/runs?per_page=${Math.max(
            20,
            limit * 3,
          )}&exclude_pull_requests=true`,
        ],
        { cwd: root, timeout: 60_000 },
      );
      const response = JSON.parse(runOutput);
      if (
        !response ||
        !Array.isArray(response.workflow_runs) ||
        response.workflow_runs.length > Math.max(20, limit * 3)
      ) {
        throw new Error("GitHub pipeline run response is invalid");
      }
      const selectedRuns = response.workflow_runs
        .filter((run) =>
          Object.hasOwn(TRACKED_WORKFLOWS, String(run?.path || "")),
        )
        .sort(
          (left, right) =>
            Date.parse(String(right?.created_at || "")) -
            Date.parse(String(left?.created_at || "")),
        )
        .slice(0, limit);
      const runs = selectedRuns.map((run) => {
        const jobOutput = runGh(
          runCommand,
          [
            "api",
            "--method",
            "GET",
            "-H",
            `X-GitHub-Api-Version: ${GITHUB_API_VERSION}`,
            `repos/${GITHUB_DELIVERY_REPOSITORY}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
          ],
          { cwd: root, timeout: 60_000 },
        );
        const jobResponse = JSON.parse(jobOutput);
        if (
          !jobResponse ||
          !Array.isArray(jobResponse.jobs) ||
          jobResponse.jobs.length > 100
        ) {
          throw new Error("GitHub pipeline job response is invalid");
        }
        return normalizePipelineRun(
          run,
          jobResponse.jobs.map(normalizePipelineJob),
        );
      });
      return {
        schemaVersion: GITHUB_PIPELINE_TIMINGS_CONTRACT,
        generatedAt: normalizeTimestamp(now(), "timing generation"),
        runs,
      };
    },

    getReleaseStatus(gitSha) {
      if (!SHA_PATTERN.test(String(gitSha || ""))) {
        throw new Error("release status SHA is invalid");
      }
      const release = this.listVersions({ limit: 50 }).find(
        (item) => item.gitSha === gitSha,
      );
      if (release) {
        return {
          schemaVersion: DELIVERY_PROVIDER_RELEASE_STATUS_CONTRACT,
          status: release.completeAssets ? "published" : "failed",
          gitSha,
          release,
          run: null,
        };
      }
      const output = runGh(
        runCommand,
        [
          "run",
          "list",
          "--repo",
          GITHUB_DELIVERY_REPOSITORY,
          "--workflow",
          GITHUB_RELEASE_WORKFLOW,
          "--commit",
          gitSha,
          "--event",
          "workflow_dispatch",
          "--limit",
          "20",
          "--json",
          "databaseId,status,conclusion,url,createdAt,headSha",
        ],
        { cwd: root },
      );
      const runs = JSON.parse(output);
      if (!Array.isArray(runs) || runs.length > 20) {
        throw new Error("GitHub workflow run response is invalid");
      }
      const normalizedRuns = runs
        .map((item) => normalizeRun(item, gitSha))
        .sort(
          (left, right) =>
            Date.parse(right.createdAt) - Date.parse(left.createdAt),
        );
      const run = normalizedRuns[0] || null;
      return {
        schemaVersion: DELIVERY_PROVIDER_RELEASE_STATUS_CONTRACT,
        status: !run
          ? "missing"
          : run.status !== "completed"
            ? "running"
            : run.conclusion === "success"
              ? "awaiting_release"
              : "failed",
        gitSha,
        release: null,
        run,
      };
    },

    dispatchRelease(request) {
      validateReleaseDispatchRequest(request);
      runGh(
        runCommand,
        [
          "workflow",
          "run",
          GITHUB_RELEASE_WORKFLOW,
          "--repo",
          GITHUB_DELIVERY_REPOSITORY,
          "--ref",
          "main",
          "-f",
          `sha=${request.gitSha}`,
          "-f",
          `version=${request.version}`,
          "-f",
          "customer=yoyoosun",
        ],
        { cwd: root },
      );
      return {
        schemaVersion: "plush.delivery-provider-dispatch/v1",
        provider: "github",
        repository: GITHUB_DELIVERY_REPOSITORY,
        workflow: GITHUB_RELEASE_WORKFLOW,
        gitSha: request.gitSha,
        version: request.version,
        status: "accepted",
        redaction: {
          containsToken: false,
          containsCredentials: false,
        },
      };
    },

    downloadRelease(gitSha, destination) {
      if (!SHA_PATTERN.test(String(gitSha || ""))) {
        throw new Error("release download SHA is invalid");
      }
      const target = assertDownloadDirectory(root, destination);
      if (existsSync(target)) {
        const files = readdirSync(target).sort();
        if (
          files.length === GITHUB_RELEASE_ASSETS.length &&
          files.every(
            (file, index) => file === [...GITHUB_RELEASE_ASSETS].sort()[index],
          )
        ) {
          const releaseManifest = validateReleaseManifest(
            JSON.parse(
              readBoundedManifest(path.join(target, "release-manifest.json")),
            ),
          );
          if (releaseManifest.gitSha !== gitSha) {
            throw new Error("cached GitHub release identity is invalid");
          }
          return { directory: target, reused: true, assets: files };
        }
        throw new Error("GitHub release download directory is not empty");
      }
      mkdirSync(target, { recursive: true, mode: 0o700 });
      try {
        runGh(
          runCommand,
          [
            "release",
            "download",
            `artifact-${gitSha}`,
            "--repo",
            GITHUB_DELIVERY_REPOSITORY,
            "--dir",
            target,
          ],
          { cwd: root, timeout: 10 * 60_000 },
        );
        const files = readdirSync(target).sort();
        const expected = [...GITHUB_RELEASE_ASSETS].sort();
        if (
          files.length !== expected.length ||
          files.some((file, index) => file !== expected[index])
        ) {
          throw new Error("downloaded GitHub release assets are incomplete");
        }
        const releaseManifest = validateReleaseManifest(
          JSON.parse(
            readBoundedManifest(path.join(target, "release-manifest.json")),
          ),
        );
        if (releaseManifest.gitSha !== gitSha) {
          throw new Error("downloaded GitHub release SHA does not match");
        }
        return { directory: target, reused: false, assets: files };
      } catch (error) {
        rmSync(target, { recursive: true, force: true });
        throw error;
      }
    },
  };
}

function readBoundedManifest(file) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 512 * 1024) {
    throw new Error("downloaded release manifest is invalid");
  }
  return readFileSync(file, "utf8");
}

function isMainModule() {
  try {
    return (
      realpathSync(fileURLToPath(import.meta.url)) ===
      realpathSync(process.argv[1])
    );
  } catch {
    return false;
  }
}

if (isMainModule()) {
  try {
    const provider = createGithubDeliveryProvider();
    const versions = provider.listVersions({ limit: 20 });
    console.log(JSON.stringify(versions, null, 2));
  } catch (error) {
    console.error(`[github-delivery-provider] ${error.message}`);
    process.exit(1);
  }
}
