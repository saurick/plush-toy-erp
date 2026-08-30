import { createHash } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  DELIVERY_RELEASE_ASSETS,
  DELIVERY_PROVIDER_CONTRACT,
  DELIVERY_PROVIDER_RELEASE_STATUS_CONTRACT,
  LEGACY_DELIVERY_RELEASE_ASSETS,
  validateDeliveryReleaseVersion,
  validateReleaseDispatchRequest,
} from "./delivery-provider.mjs";
import { assertReleaseArtifactManifest } from "./release-artifact-bundle.mjs";
import {
  sha256File,
  validateReleaseArtifactBinding,
  validateReleaseManifest,
  validateReleaseRehearsalReceipt,
} from "./release-catalog.mjs";

export const GITLAB_DELIVERY_BASE_URL = "https://gitlab.saurick.me";
export const GITLAB_DELIVERY_PROJECT = "saurick/plush-toy-erp";
export const GITLAB_DELIVERY_PACKAGE = "plush-release";
export const GITLAB_LEGACY_RELEASE_ASSETS = LEGACY_DELIVERY_RELEASE_ASSETS;
export const GITLAB_RELEASE_ASSETS = DELIVERY_RELEASE_ASSETS;
export const GITLAB_PIPELINE_TIMINGS_CONTRACT =
  "plush.delivery-pipeline-timings/v1";

const PROJECT_ID = encodeURIComponent(GITLAB_DELIVERY_PROJECT);
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_RELEASE_DETAIL_BYTES = 512 * 1024;
const MAX_ASSET_BYTES = 32 * 1024 * 1024 * 1024;
const TERMINAL_STATUSES = new Set([
  "success",
  "failed",
  "canceled",
  "skipped",
]);

function exactAssetSet(assets, expected) {
  const sorted = [...expected].sort();
  return (
    assets.length === sorted.length &&
    assets.every((asset, index) => asset === sorted[index])
  );
}

function expectedAssetsForManifest(manifest) {
  return manifest.schemaVersion === "plush.release-manifest/v2"
    ? GITLAB_RELEASE_ASSETS
    : GITLAB_LEGACY_RELEASE_ASSETS;
}

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function requireToken(env) {
  const token = String(env.PLUSH_GITLAB_TOKEN || "");
  if (!token || token.length > 512 || /[\r\n]/u.test(token)) {
    throw new Error("GitLab delivery token is unavailable");
  }
  return token;
}

function apiUrl(endpoint) {
  if (!String(endpoint).startsWith("/")) {
    throw new Error("GitLab API endpoint is invalid");
  }
  return `${GITLAB_DELIVERY_BASE_URL}/api/v4${endpoint}`;
}

async function requestResponse(
  request,
  env,
  endpoint,
  { method = "GET", body, contentType, accept = "application/json" } = {},
) {
  const headers = {
    Accept: accept,
    "PRIVATE-TOKEN": requireToken(env),
  };
  if (contentType) headers["Content-Type"] = contentType;
  const response = await request(apiUrl(endpoint), {
    method,
    headers,
    body,
    redirect: "error",
  });
  if (!response || !response.ok) {
    throw new Error(
      `GitLab API request failed with status ${String(response?.status || 0)}`,
    );
  }
  return response;
}

async function requestJson(request, env, endpoint, options) {
  const response = await requestResponse(request, env, endpoint, options);
  const buffer = await readBoundedResponse(
    response,
    MAX_JSON_BYTES,
    "GitLab API JSON response",
  );
  return JSON.parse(buffer.toString("utf8"));
}

async function readBoundedResponse(response, maxBytes, label, exactBytes) {
  const contentLength = Number(response.headers?.get?.("content-length") || 0);
  if (
    (Number.isFinite(contentLength) && contentLength > maxBytes) ||
    !response.body
  ) {
    throw new Error(`${label} is too large or missing`);
  }
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of response.body) {
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) {
      throw new Error(`${label} is too large`);
    }
    chunks.push(buffer);
  }
  if (exactBytes !== undefined && totalBytes !== exactBytes) {
    throw new Error(`${label} size does not match package metadata`);
  }
  return Buffer.concat(chunks, totalBytes);
}

function exactSizeTransform(expectedBytes, label) {
  let totalBytes = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      totalBytes += chunk.length;
      if (totalBytes > expectedBytes) {
        callback(new Error(`${label} exceeds package metadata`));
        return;
      }
      callback(null, chunk);
    },
    flush(callback) {
      callback(
        totalBytes === expectedBytes
          ? null
          : new Error(`${label} size does not match package metadata`),
      );
    },
  });
}

function normalizeTimestamp(value, field, { optional = false } = {}) {
  if ((value === null || value === undefined || value === "") && optional) {
    return null;
  }
  const timestamp = String(value || "");
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error(`GitLab ${field} timestamp is invalid`);
  }
  return timestamp;
}

function normalizeLabel(value, field) {
  const label = String(value || "").trim();
  if (!label || label.length > 160 || /[\u0000-\u001f\u007f]/u.test(label)) {
    throw new Error(`GitLab ${field} label is invalid`);
  }
  return label;
}

function elapsedMs(startedAt, finishedAt) {
  if (!startedAt || !finishedAt) return null;
  return Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
}

function normalizeStatus(status) {
  const value = String(status || "");
  if (TERMINAL_STATUSES.has(value)) return "completed";
  if (["running", "preparing", "canceling"].includes(value)) {
    return "in_progress";
  }
  if (
    [
      "created",
      "manual",
      "pending",
      "scheduled",
      "waiting_for_callback",
      "waiting_for_resource",
    ].includes(value)
  ) {
    return value === "manual" ? "waiting" : "queued";
  }
  throw new Error("GitLab pipeline status is invalid");
}

function normalizeConclusion(status) {
  return status === "success"
    ? "success"
    : status === "failed"
      ? "failure"
      : status === "canceled"
        ? "cancelled"
        : status === "skipped"
          ? "skipped"
          : "";
}

function parsePipelineUrl(value, id) {
  const expected = `${GITLAB_DELIVERY_BASE_URL}/${GITLAB_DELIVERY_PROJECT}/-/pipelines/${String(id)}`;
  if (value !== expected) {
    throw new Error("GitLab pipeline URL is outside the fixed project");
  }
  return value;
}

function parseReleaseUrl(value, tag) {
  const expected = `${GITLAB_DELIVERY_BASE_URL}/${GITLAB_DELIVERY_PROJECT}/-/releases/${tag}`;
  if (value !== expected) {
    throw new Error("GitLab release URL is outside the fixed project");
  }
  return value;
}

function packageVersion(tag) {
  if (!/^artifact-[0-9a-f]{40}$/u.test(tag)) {
    throw new Error("GitLab package version is invalid");
  }
  return tag;
}

function normalizePackageFiles(files) {
  if (!Array.isArray(files) || files.length > 100) {
    throw new Error("GitLab package file response is invalid");
  }
  if (
    files.some(
      (file) =>
        !GITLAB_RELEASE_ASSETS.includes(String(file?.file_name || "")),
    )
  ) {
    throw new Error("GitLab package contains an unknown release asset");
  }
  const selected = files
    .map((file) => {
      const name = String(file.file_name);
      const size = Number(file.size);
      const sha256 = String(file.file_sha256 || "");
      if (
        !Number.isSafeInteger(size) ||
        size < 1 ||
        size > MAX_ASSET_BYTES ||
        !SHA256_PATTERN.test(sha256)
      ) {
        throw new Error("GitLab package file identity is invalid");
      }
      return { name, size, sha256 };
    });
  if (new Set(selected.map((file) => file.name)).size !== selected.length) {
    throw new Error("GitLab package contains duplicate release assets");
  }
  return selected.sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeRelease(release, files) {
  const tag = String(release?.tag_name || "");
  const match = /^artifact-([0-9a-f]{40})$/u.exec(tag);
  if (!match || release?.commit?.id !== match[1]) {
    throw new Error("GitLab release identity is invalid");
  }
  const publishedAt = normalizeTimestamp(
    release?.released_at || release?.created_at,
    "release publication",
  );
  const assets = files.map((file) => file.name);
  const sizeOf = (name) => files.find((file) => file.name === name)?.size || 0;
  const releaseUrl =
    release?._links?.self ||
    `${GITLAB_DELIVERY_BASE_URL}/${GITLAB_DELIVERY_PROJECT}/-/releases/${tag}`;
  return validateDeliveryReleaseVersion({
    schemaVersion: "plush.delivery-version/v1",
    status:
      release?.upcoming_release === true || Date.parse(publishedAt) > Date.now()
        ? "prerelease"
        : "published",
    tag,
    gitSha: match[1],
    version: String(release?.name || ""),
    publishedAt,
    url: parseReleaseUrl(releaseUrl, tag),
    assets,
    artifactSummary: {
      totalBytes: files.reduce((total, file) => total + file.size, 0),
      serverImageBytes: sizeOf("server-image.tar"),
      webImageBytes: sizeOf("web-image.tar"),
      sbomBytes: sizeOf("sbom.cdx.json"),
    },
    buildPerformance: null,
    imageDigests: null,
    completeAssets:
      exactAssetSet(assets, GITLAB_RELEASE_ASSETS) ||
      exactAssetSet(assets, GITLAB_LEGACY_RELEASE_ASSETS),
    promotionEligible: false,
  });
}

function normalizeJob(job) {
  if (!Number.isSafeInteger(job?.id) || job.id < 1) {
    throw new Error("GitLab job identity is invalid");
  }
  const startedAt = normalizeTimestamp(job.started_at, "job start", {
    optional: true,
  });
  const finishedAt = normalizeTimestamp(job.finished_at, "job finish", {
    optional: true,
  });
  return {
    id: job.id,
    name: normalizeLabel(job.name, "job"),
    status: normalizeStatus(job.status),
    conclusion: normalizeConclusion(job.status),
    startedAt,
    finishedAt,
    durationMs:
      Number.isFinite(job.duration) && job.duration >= 0
        ? Math.round(job.duration * 1000)
        : elapsedMs(startedAt, finishedAt),
    steps: [],
  };
}

function normalizePipeline(pipelineValue, jobs) {
  const id = pipelineValue?.id;
  const attempt = pipelineValue?.iid;
  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    !Number.isSafeInteger(attempt) ||
    attempt < 1 ||
    !SHA_PATTERN.test(String(pipelineValue?.sha || "")) ||
    !Array.isArray(jobs) ||
    jobs.length > 100
  ) {
    throw new Error("GitLab pipeline identity is invalid");
  }
  const createdAt = normalizeTimestamp(
    pipelineValue.created_at,
    "pipeline creation",
  );
  const startedAt = normalizeTimestamp(
    pipelineValue.started_at,
    "pipeline start",
    { optional: true },
  );
  const finishedAt = normalizeTimestamp(
    pipelineValue.finished_at ||
      (TERMINAL_STATUSES.has(pipelineValue.status)
        ? pipelineValue.updated_at
        : null),
    "pipeline finish",
    { optional: true },
  );
  const releasePipeline = jobs.some((job) =>
    ["publish_release", "strict"].includes(job.name),
  );
  return {
    id,
    attempt,
    workflow: releasePipeline ? "release" : "ci",
    event: normalizeLabel(pipelineValue.source, "pipeline source"),
    status: normalizeStatus(pipelineValue.status),
    conclusion: normalizeConclusion(pipelineValue.status),
    gitSha: pipelineValue.sha,
    createdAt,
    startedAt,
    finishedAt,
    queueMs:
      Number.isFinite(pipelineValue.queued_duration) &&
      pipelineValue.queued_duration >= 0
        ? Math.round(pipelineValue.queued_duration * 1000)
        : elapsedMs(createdAt, startedAt),
    durationMs:
      Number.isFinite(pipelineValue.duration) && pipelineValue.duration >= 0
        ? Math.round(pipelineValue.duration * 1000)
        : elapsedMs(startedAt, finishedAt),
    url: parsePipelineUrl(pipelineValue.web_url, id),
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
    throw new Error("GitLab release download must remain in the fixed output root");
  }
  let cursor = candidate;
  while (cursor !== outputRoot) {
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) {
      throw new Error("GitLab release download path contains a symbolic link");
    }
    cursor = path.dirname(cursor);
  }
  return candidate;
}

function readBoundedManifest(file) {
  const stat = lstatSync(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size < 1 ||
    stat.size > 512 * 1024
  ) {
    throw new Error("downloaded GitLab release manifest is invalid");
  }
  return readFileSync(file, "utf8");
}

export function createGitlabDeliveryProvider({
  projectRoot = process.cwd(),
  request = globalThis.fetch,
  env = process.env,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof request !== "function") {
    throw new Error("GitLab delivery HTTP client is unavailable");
  }
  const root = realpathSync(projectRoot);
  const releaseDetailCache = new Map();

  async function listPackages(limit = 100) {
    const packages = await requestJson(
      request,
      env,
      `/projects/${PROJECT_ID}/packages?package_type=generic&package_name=${encodeURIComponent(
        GITLAB_DELIVERY_PACKAGE,
      )}&order_by=created_at&sort=desc&per_page=${String(limit)}`,
    );
    if (!Array.isArray(packages) || packages.length > limit) {
      throw new Error("GitLab package list response is invalid");
    }
    return packages.filter(
      (item) =>
        item?.package_type === "generic" &&
        item?.name === GITLAB_DELIVERY_PACKAGE &&
        /^artifact-[0-9a-f]{40}$/u.test(String(item?.version || "")) &&
        Number.isSafeInteger(item?.id) &&
        item.id > 0,
    );
  }

  async function readPackageFiles(item) {
    return normalizePackageFiles(
      await requestJson(
        request,
        env,
        `/projects/${PROJECT_ID}/packages/${String(item.id)}/package_files?per_page=100`,
      ),
    );
  }

  async function packageForSha(gitSha) {
    const tag = packageVersion(`artifact-${gitSha}`);
    const item = (await listPackages()).find(
      (candidate) => candidate.version === tag,
    );
    if (!item) return null;
    return { item, tag, files: await readPackageFiles(item) };
  }

  async function readSmallPackageJson(packageValue, name) {
    const metadata = packageValue.files.find((file) => file.name === name);
    if (
      !metadata ||
      metadata.size > MAX_RELEASE_DETAIL_BYTES ||
      ![
        "release-artifact.json",
        "release-manifest.json",
        "release-rehearsal.json",
      ].includes(name)
    ) {
      throw new Error("GitLab release detail asset is invalid");
    }
    const endpoint = `/projects/${PROJECT_ID}/packages/generic/${encodeURIComponent(
      GITLAB_DELIVERY_PACKAGE,
    )}/${encodeURIComponent(packageValue.tag)}/${encodeURIComponent(name)}`;
    const response = await requestResponse(request, env, endpoint, {
      accept: "application/octet-stream",
    });
    const buffer = await readBoundedResponse(
      response,
      MAX_RELEASE_DETAIL_BYTES,
      "GitLab release detail response",
      metadata.size,
    );
    if (sha256Buffer(buffer) !== metadata.sha256) {
      throw new Error("GitLab release detail digest is invalid");
    }
    return {
      value: JSON.parse(buffer.toString("utf8")),
      sha256: sha256Buffer(buffer),
    };
  }

  async function enrichVersion(version, packageValue) {
    const cached = releaseDetailCache.get(version.gitSha);
    if (cached) return cached;
    const artifactAsset = await readSmallPackageJson(
      packageValue,
      "release-artifact.json",
    );
    const artifact = assertReleaseArtifactManifest(artifactAsset.value);
    const manifestAsset = await readSmallPackageJson(
      packageValue,
      "release-manifest.json",
    );
    const manifest = validateReleaseManifest(
      manifestAsset.value,
    );
    validateReleaseArtifactBinding(manifest, artifact, artifactAsset.sha256);
    if (
      artifact?.schemaVersion !== "plush-release-artifact/v1" ||
      artifact?.git?.commit !== version.gitSha ||
      manifest.gitSha !== version.gitSha ||
      manifest.version !== version.version
    ) {
      throw new Error("GitLab release detail identity is invalid");
    }
    let promotionEligible = false;
    if (manifest.schemaVersion === "plush.release-manifest/v2") {
      if (!exactAssetSet(version.assets, GITLAB_RELEASE_ASSETS)) {
        throw new Error("GitLab v2 release assets are incomplete");
      }
      const rehearsalAsset = await readSmallPackageJson(
        packageValue,
        "release-rehearsal.json",
      );
      validateReleaseRehearsalReceipt(rehearsalAsset.value, artifact, {
        sha: version.gitSha,
        version: version.version,
        customer: "yoyoosun",
      });
      if (rehearsalAsset.sha256 !== manifest.rehearsal?.receiptSha256) {
        throw new Error("GitLab release rehearsal digest is invalid");
      }
      promotionEligible = true;
    } else if (!exactAssetSet(version.assets, GITLAB_LEGACY_RELEASE_ASSETS)) {
      throw new Error("GitLab legacy release assets are incomplete");
    }
    const imageDigests = Object.fromEntries(
      manifest.images.map((image) => [image.kind, image.digest]),
    );
    if (
      !SHA256_DIGEST_PATTERN.test(String(imageDigests.server || "")) ||
      !SHA256_DIGEST_PATTERN.test(String(imageDigests.web || ""))
    ) {
      throw new Error("GitLab release image digests are invalid");
    }
    const detail = validateDeliveryReleaseVersion({
      ...version,
      buildPerformance: artifact?.performance?.build || null,
      imageDigests,
      promotionEligible,
    });
    releaseDetailCache.set(version.gitSha, detail);
    return detail;
  }

  async function listPipelines({ limit, sha } = {}) {
    const query = new URLSearchParams({
      ref: "main",
      order_by: "id",
      sort: "desc",
      per_page: String(limit),
    });
    if (sha) query.set("sha", sha);
    const pipelines = await requestJson(
      request,
      env,
      `/projects/${PROJECT_ID}/pipelines?${query.toString()}`,
    );
    if (!Array.isArray(pipelines) || pipelines.length > limit) {
      throw new Error("GitLab pipeline list response is invalid");
    }
    return pipelines;
  }

  async function readPipeline(raw) {
    if (!Number.isSafeInteger(raw?.id) || raw.id < 1) {
      throw new Error("GitLab pipeline list identity is invalid");
    }
    const [detail, rawJobs] = await Promise.all([
      requestJson(
        request,
        env,
        `/projects/${PROJECT_ID}/pipelines/${String(raw.id)}`,
      ),
      requestJson(
        request,
        env,
        `/projects/${PROJECT_ID}/pipelines/${String(raw.id)}/jobs?include_retried=true&per_page=100`,
      ),
    ]);
    if (!Array.isArray(rawJobs) || rawJobs.length > 100) {
      throw new Error("GitLab pipeline job response is invalid");
    }
    return normalizePipeline(detail, rawJobs.map(normalizeJob));
  }

  return {
    schemaVersion: DELIVERY_PROVIDER_CONTRACT,
    provider: "gitlab",
    repository: GITLAB_DELIVERY_PROJECT,
    workflow: ".gitlab-ci.yml",

    async listVersions({ limit = 20 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new Error("GitLab release list limit is invalid");
      }
      const [releases, packages] = await Promise.all([
        requestJson(
          request,
          env,
          `/projects/${PROJECT_ID}/releases?per_page=${String(limit)}`,
        ),
        listPackages(Math.min(100, limit * 3)),
      ]);
      if (!Array.isArray(releases) || releases.length > limit) {
        throw new Error("GitLab release list response is invalid");
      }
      const packageByVersion = new Map(
        packages.map((item) => [String(item.version), item]),
      );
      const versions = [];
      for (const release of releases) {
        const tag = String(release?.tag_name || "");
        if (!/^artifact-[0-9a-f]{40}$/u.test(tag)) continue;
        const packageItem = packageByVersion.get(tag);
        const files = packageItem ? await readPackageFiles(packageItem) : [];
        versions.push({
          packageValue: packageItem
            ? { item: packageItem, tag, files }
            : null,
          version: normalizeRelease(release, files),
        });
      }
      versions.sort(
        (left, right) =>
          Date.parse(right.version.publishedAt) -
          Date.parse(left.version.publishedAt),
      );
      for (let index = 0; index < versions.length; index += 1) {
        const item = versions[index];
        const requiresPromotionEvidence = exactAssetSet(
          item.version.assets,
          GITLAB_RELEASE_ASSETS,
        );
        if (
          !item.version.completeAssets ||
          !item.packageValue ||
          (!requiresPromotionEvidence && index !== 0)
        ) {
          continue;
        }
        try {
          item.version = await enrichVersion(item.version, item.packageValue);
        } catch {
          // Names and byte sizes remain readable; invalid detail evidence stays non-promotable.
        }
      }
      return versions.map((item) => item.version);
    },

    async listPipelineTimings({ limit = 8 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
        throw new Error("GitLab pipeline timing limit is invalid");
      }
      const runs = [];
      for (const raw of await listPipelines({ limit })) {
        runs.push(await readPipeline(raw));
      }
      return {
        schemaVersion: GITLAB_PIPELINE_TIMINGS_CONTRACT,
        generatedAt: normalizeTimestamp(now(), "timing generation"),
        runs,
      };
    },

    async getReleaseStatus(gitSha) {
      if (!SHA_PATTERN.test(String(gitSha || ""))) {
        throw new Error("release status SHA is invalid");
      }
      const release = (await this.listVersions({ limit: 50 })).find(
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
      const pipelines = await listPipelines({ limit: 20, sha: gitSha });
      for (const raw of pipelines) {
        const pipelineValue = await readPipeline(raw);
        const releaseJobs = pipelineValue.jobs.filter((job) =>
          ["publish_release", "strict"].includes(job.name),
        );
        if (releaseJobs.length === 0) continue;
        const failed = releaseJobs.some(
          (job) => job.status === "completed" && job.conclusion !== "success",
        );
        const active = releaseJobs.some((job) => job.status !== "completed");
        return {
          schemaVersion: DELIVERY_PROVIDER_RELEASE_STATUS_CONTRACT,
          status: failed ? "failed" : active ? "running" : "awaiting_release",
          gitSha,
          release: null,
          run: {
            id: pipelineValue.id,
            status: pipelineValue.status,
            conclusion: pipelineValue.conclusion,
            createdAt: pipelineValue.createdAt,
            gitSha,
            url: pipelineValue.url,
          },
        };
      }
      return {
        schemaVersion: DELIVERY_PROVIDER_RELEASE_STATUS_CONTRACT,
        status: "missing",
        gitSha,
        release: null,
        run: null,
      };
    },

    async dispatchRelease(input) {
      const dispatch = validateReleaseDispatchRequest(input);
      const branch = await requestJson(
        request,
        env,
        `/projects/${PROJECT_ID}/repository/branches/main`,
      );
      if (branch?.commit?.id !== dispatch.gitSha) {
        throw new Error("GitLab main does not match the requested exact SHA");
      }
      const body = new URLSearchParams({ ref: "main" });
      [
        ["RELEASE_SHA", dispatch.gitSha],
        ["RELEASE_VERSION", dispatch.version],
        ["RELEASE_CUSTOMER", dispatch.customer],
        ["RELEASE_VERSION_REFERENCE", dispatch.versionReference],
      ].forEach(([key, value], index) => {
        body.set(`variables[${String(index)}][key]`, key);
        body.set(`variables[${String(index)}][value]`, value);
      });
      const pipelineValue = await requestJson(
        request,
        env,
        `/projects/${PROJECT_ID}/pipeline`,
        {
          method: "POST",
          body,
          contentType: "application/x-www-form-urlencoded",
        },
      );
      if (
        pipelineValue?.sha !== dispatch.gitSha ||
        !Number.isSafeInteger(pipelineValue?.id) ||
        pipelineValue.id < 1
      ) {
        throw new Error("GitLab release pipeline identity is invalid");
      }
      parsePipelineUrl(pipelineValue.web_url, pipelineValue.id);
      return {
        schemaVersion: "plush.delivery-provider-dispatch/v1",
        provider: "gitlab",
        repository: GITLAB_DELIVERY_PROJECT,
        workflow: ".gitlab-ci.yml",
        gitSha: dispatch.gitSha,
        version: dispatch.version,
        status: "accepted",
        redaction: { containsToken: false, containsCredentials: false },
      };
    },

    async downloadRelease(gitSha, destination) {
      if (!SHA_PATTERN.test(String(gitSha || ""))) {
        throw new Error("release download SHA is invalid");
      }
      const target = assertDownloadDirectory(root, destination);
      if (existsSync(target)) {
        const files = readdirSync(target).sort();
        if (
          files.every((file) => {
            const stat = lstatSync(path.join(target, file));
            return (
              stat.isFile() &&
              !stat.isSymbolicLink() &&
              stat.size > 0 &&
              stat.size <= MAX_ASSET_BYTES
            );
          })
        ) {
          const manifest = validateReleaseManifest(
            JSON.parse(
              readBoundedManifest(path.join(target, "release-manifest.json")),
            ),
          );
          if (manifest.gitSha !== gitSha) {
            throw new Error("cached GitLab release identity is invalid");
          }
          const expected = [...expectedAssetsForManifest(manifest)].sort();
          if (!exactAssetSet(files, expected)) {
            throw new Error("cached GitLab release asset set is invalid");
          }
          const artifactText = readBoundedManifest(
            path.join(target, "release-artifact.json"),
          );
          const artifact = assertReleaseArtifactManifest(JSON.parse(artifactText));
          validateReleaseArtifactBinding(
            manifest,
            artifact,
            sha256Buffer(Buffer.from(artifactText)),
          );
          if (manifest.schemaVersion === "plush.release-manifest/v2") {
            const receiptBuffer = Buffer.from(
              readBoundedManifest(path.join(target, "release-rehearsal.json")),
            );
            validateReleaseRehearsalReceipt(
              JSON.parse(receiptBuffer.toString("utf8")),
              artifact,
              { sha: gitSha, version: manifest.version, customer: "yoyoosun" },
            );
            if (sha256Buffer(receiptBuffer) !== manifest.rehearsal?.receiptSha256) {
              throw new Error("cached GitLab rehearsal digest is invalid");
            }
          }
          return { directory: target, reused: true, assets: files };
        }
        throw new Error("GitLab release download directory is not empty");
      }
      const packageValue = await packageForSha(gitSha);
      const packageFiles = packageValue?.files.map((file) => file.name) || [];
      if (
        !packageValue ||
        (!exactAssetSet(packageFiles, GITLAB_RELEASE_ASSETS) &&
          !exactAssetSet(packageFiles, GITLAB_LEGACY_RELEASE_ASSETS))
      ) {
        throw new Error("GitLab release package is incomplete");
      }
      mkdirSync(target, { recursive: true, mode: 0o700 });
      try {
        for (const file of packageValue.files) {
          const endpoint = `/projects/${PROJECT_ID}/packages/generic/${encodeURIComponent(
            GITLAB_DELIVERY_PACKAGE,
          )}/${encodeURIComponent(packageValue.tag)}/${encodeURIComponent(file.name)}`;
          const response = await requestResponse(request, env, endpoint, {
            accept: "application/octet-stream",
          });
          if (!response.body) throw new Error("GitLab release asset body is missing");
          const output = path.join(target, file.name);
          await pipeline(
            response.body,
            exactSizeTransform(file.size, `GitLab release asset ${file.name}`),
            createWriteStream(output, { flags: "wx", mode: 0o600 }),
          );
          if (statSync(output).size !== file.size) {
            throw new Error("GitLab release asset size does not match package metadata");
          }
          if (sha256File(output) !== file.sha256) {
            throw new Error("GitLab release asset digest does not match package metadata");
          }
        }
        const manifest = validateReleaseManifest(
          JSON.parse(
            readBoundedManifest(path.join(target, "release-manifest.json")),
          ),
        );
        if (manifest.gitSha !== gitSha) {
          throw new Error("downloaded GitLab release SHA does not match");
        }
        const expected = [...expectedAssetsForManifest(manifest)].sort();
        if (!exactAssetSet(readdirSync(target).sort(), expected)) {
          throw new Error("downloaded GitLab release manifest and assets differ");
        }
        const artifactText = readBoundedManifest(
          path.join(target, "release-artifact.json"),
        );
        const artifact = assertReleaseArtifactManifest(JSON.parse(artifactText));
        validateReleaseArtifactBinding(
          manifest,
          artifact,
          sha256Buffer(Buffer.from(artifactText)),
        );
        if (manifest.schemaVersion === "plush.release-manifest/v2") {
          const receiptBuffer = Buffer.from(
            readBoundedManifest(path.join(target, "release-rehearsal.json")),
          );
          validateReleaseRehearsalReceipt(
            JSON.parse(receiptBuffer.toString("utf8")),
            artifact,
            { sha: gitSha, version: manifest.version, customer: "yoyoosun" },
          );
          if (sha256Buffer(receiptBuffer) !== manifest.rehearsal?.receiptSha256) {
            throw new Error("downloaded GitLab rehearsal digest is invalid");
          }
        }
        return { directory: target, reused: false, assets: expected };
      } catch (error) {
        rmSync(target, { recursive: true, force: true });
        throw error;
      }
    },
  };
}
