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
export const GITHUB_RELEASE_ASSETS = Object.freeze([
  "checksums.sha256",
  "release-artifact.json",
  "release-manifest.json",
  "sbom.cdx.json",
  "server-image.tar",
  "web-image.tar",
]);

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const MAX_GITHUB_OUTPUT_BYTES = 8 * 1024 * 1024;

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
  if (text !== `https://github.com/${GITHUB_DELIVERY_REPOSITORY}${expectedSuffix}`) {
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
  const assets = (Array.isArray(raw.assets) ? raw.assets : [])
    .map((asset) => String(asset?.name || ""))
    .filter((name) => GITHUB_RELEASE_ASSETS.includes(name))
    .sort();
  return validateDeliveryReleaseVersion({
    schemaVersion: "plush.delivery-version/v1",
    status: raw.draft ? "draft" : raw.prerelease ? "prerelease" : "published",
    tag,
    gitSha: match[1],
    version: String(raw.name || ""),
    publishedAt: String(raw.published_at || ""),
    url: parseGithubUrl(raw.html_url, `/releases/tag/${tag}`),
    assets,
    completeAssets:
      assets.length === GITHUB_RELEASE_ASSETS.length &&
      assets.every((asset, index) => asset === [...GITHUB_RELEASE_ASSETS].sort()[index]),
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

function assertDownloadDirectory(projectRoot, destination) {
  const outputRoot = path.join(realpathSync(projectRoot), "output");
  const candidate = path.resolve(destination);
  if (
    !candidate.startsWith(
      `${path.join(outputRoot, "dev-workbench", "releases")}${path.sep}`,
    )
  ) {
    throw new Error("GitHub release download must remain in the fixed output root");
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
} = {}) {
  const root = realpathSync(projectRoot);
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
      return releases
        .filter((release) =>
          /^artifact-[0-9a-f]{40}$/u.test(String(release?.tag_name || "")),
        )
        .map(normalizeRelease)
        .sort(
          (left, right) =>
            Date.parse(right.publishedAt) - Date.parse(left.publishedAt),
        );
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
        status:
          !run
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
            (file, index) =>
              file === [...GITHUB_RELEASE_ASSETS].sort()[index],
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
