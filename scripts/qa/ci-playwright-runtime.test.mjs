import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  assertPinnedPlaywrightMetadata,
  assertRuntimeAssetObservation,
  canBootstrapRuntimePackage,
  CI_PLAYWRIGHT_RUNTIME,
  CI_PLAYWRIGHT_RUNTIME_ASSETS,
  CI_PLAYWRIGHT_RUNTIME_SCHEMA,
  expectedRuntimePaths,
  runtimePackageUrl,
} from "./ci-playwright-runtime.mjs";

const source = readFileSync(
  new URL("./ci-playwright-runtime.mjs", import.meta.url),
  "utf8",
);

const protectedPrepareEnv = Object.freeze({
  GITLAB_CI: "true",
  CI_PROJECT_PATH: "saurick/plush-toy-erp",
  CI_PIPELINE_SOURCE: "push",
  CI_COMMIT_BRANCH: "main",
  CI_DEFAULT_BRANCH: "main",
  CI_COMMIT_REF_PROTECTED: "true",
  CI_JOB_NAME: "prepare",
  CI_COMMIT_SHA: "a".repeat(40),
  CI_PROJECT_ID: "2",
  CI_JOB_ID: "31",
  CI_API_V4_URL: "https://gitlab.saurick.me/api/v4",
  CI_JOB_TOKEN: "held-in-memory-only",
});

test("Playwright runtime pins one exact Linux archive set", () => {
  assert.equal(CI_PLAYWRIGHT_RUNTIME_SCHEMA, "plush.ci-playwright-runtime/v1");
  assert.deepEqual(
    {
      playwrightVersion: CI_PLAYWRIGHT_RUNTIME.playwrightVersion,
      chromiumVersion: CI_PLAYWRIGHT_RUNTIME.chromiumVersion,
      chromiumRevision: CI_PLAYWRIGHT_RUNTIME.chromiumRevision,
      ffmpegRevision: CI_PLAYWRIGHT_RUNTIME.ffmpegRevision,
      platform: CI_PLAYWRIGHT_RUNTIME.platform,
      packageName: CI_PLAYWRIGHT_RUNTIME.packageName,
      packageVersion: CI_PLAYWRIGHT_RUNTIME.packageVersion,
      packageFile: CI_PLAYWRIGHT_RUNTIME.packageFile,
    },
    {
      playwrightVersion: "1.58.2",
      chromiumVersion: "145.0.7632.6",
      chromiumRevision: "1208",
      ffmpegRevision: "1011",
      platform: "ubuntu24.04-x64",
      packageName: "plush-ci-playwright-runtime",
      packageVersion: "playwright-1.58.2-linux-x64-r1208-v1",
      packageFile: "runtime.tar",
    },
  );
  assert.match(CI_PLAYWRIGHT_RUNTIME.archiveSetSha256, /^[0-9a-f]{64}$/u);
  assert.deepEqual(
    CI_PLAYWRIGHT_RUNTIME_ASSETS.map(({ name, size, sha256, url }) => ({
      name,
      size,
      sha256,
      url,
    })),
    [
      {
        name: "chrome-linux64.zip",
        size: 175_440_843,
        sha256:
          "b5e3195041af345a668d110f5daf5581961fa3608626ea588c97dd0fe81c4e38",
        url: "https://storage.googleapis.com/chrome-for-testing-public/145.0.7632.6/linux64/chrome-linux64.zip",
      },
      {
        name: "chrome-headless-shell-linux64.zip",
        size: 116_288_461,
        sha256:
          "2536e97d8f410df0394b3e7c4252e88ce9f239f04f3af4e247a26caf45baf49e",
        url: "https://cdn.playwright.dev/builds/cft/145.0.7632.6/linux64/chrome-headless-shell-linux64.zip",
      },
      {
        name: "ffmpeg-linux.zip",
        size: 2_376_500,
        sha256:
          "ebc74fc5b94830176a3c2914ae96bd8bc7f6a91f4f33890230f84a172ee61ccc",
        url: "https://cdn.playwright.dev/dbazure/download/playwright/builds/ffmpeg/1011/ffmpeg-linux.zip",
      },
    ],
  );
  for (const asset of CI_PLAYWRIGHT_RUNTIME_ASSETS) {
    assert.equal(
      assertRuntimeAssetObservation(asset, {
        size: asset.size,
        sha256: asset.sha256,
      }),
      true,
    );
    assert.throws(
      () =>
        assertRuntimeAssetObservation(asset, {
          size: asset.size - 1,
          sha256: asset.sha256,
        }),
      /checksum mismatch/u,
    );
  }
});

test("installed Playwright metadata must match the pinned runtime", () => {
  const browsers = [
    {
      name: "chromium",
      revision: "1208",
      browserVersion: "145.0.7632.6",
      installByDefault: true,
    },
    {
      name: "chromium-headless-shell",
      revision: "1208",
      browserVersion: "145.0.7632.6",
      installByDefault: true,
    },
    { name: "ffmpeg", revision: "1011", installByDefault: true },
  ];
  assert.equal(
    assertPinnedPlaywrightMetadata({ version: "1.58.2", browsers }),
    true,
  );
  assert.throws(
    () => assertPinnedPlaywrightMetadata({ version: "1.58.1", browsers }),
    /pinned runtime/u,
  );
  assert.throws(
    () =>
      assertPinnedPlaywrightMetadata({
        version: "1.58.2",
        browsers: browsers.map((browser) =>
          browser.name === "chromium-headless-shell"
            ? { ...browser, revision: "1207" }
            : browser,
        ),
      }),
    /pinned runtime/u,
  );
});

test("only the protected main push prepare job may seed an absent package", () => {
  assert.equal(canBootstrapRuntimePackage(protectedPrepareEnv), true);
  for (const [key, value] of [
    ["CI_PIPELINE_SOURCE", "web"],
    ["CI_COMMIT_BRANCH", "feature"],
    ["CI_COMMIT_REF_PROTECTED", "false"],
    ["CI_JOB_NAME", "quality_browser"],
    ["RELEASE_SHA", "a".repeat(40)],
  ]) {
    assert.equal(
      canBootstrapRuntimePackage({ ...protectedPrepareEnv, [key]: value }),
      false,
      key,
    );
  }
  assert.equal(
    runtimePackageUrl(protectedPrepareEnv),
    "https://gitlab.saurick.me/api/v4/projects/2/packages/generic/plush-ci-playwright-runtime/playwright-1.58.2-linux-x64-r1208-v1/runtime.tar",
  );
  assert.throws(
    () =>
      runtimePackageUrl({
        ...protectedPrepareEnv,
        CI_API_V4_URL: "https://example.invalid/api/v4",
      }),
    /endpoint is untrusted/u,
  );
});

test("runtime paths separate verified archives from each job extraction", () => {
  const root = path.resolve("/private/tmp/plush-ci-runtime-contract");
  const env = {
    ...protectedPrepareEnv,
    PLAYWRIGHT_RUNTIME_ARCHIVE_DIR: path.join(
      root,
      "output/cache/gitlab/playwright-runtime",
    ),
    PLAYWRIGHT_BROWSERS_PATH: path.join(
      root,
      "output/runtime/gitlab/playwright-31",
    ),
  };
  assert.deepEqual(expectedRuntimePaths(root, env), {
    archiveDirectory: env.PLAYWRIGHT_RUNTIME_ARCHIVE_DIR,
    browserDirectory: env.PLAYWRIGHT_BROWSERS_PATH,
  });
  assert.throws(
    () => expectedRuntimePaths(root, { ...env, CI_JOB_ID: "../31" }),
    /job identity is invalid/u,
  );
  assert.throws(
    () =>
      expectedRuntimePaths(root, {
        ...env,
        PLAYWRIGHT_BROWSERS_PATH: path.join(root, "output/runtime/shared"),
      }),
    /paths do not match/u,
  );
});

test("package absence is the only upstream bootstrap path", () => {
  assert.match(source, /if \(response[.]status === 404\)/u);
  assert.match(source, /if \(!canBootstrapRuntimePackage\(env\)\)/u);
  assert.match(
    source,
    /candidate = await bootstrapPackage\(env, staging, root\)/u,
  );
  assert.match(source, /Promise[.]allSettled/u);
  assert.match(source, /method: "PUT"/u);
  assert.match(source, /"JOB-TOKEN": env[.]CI_JOB_TOKEN/u);
  assert.match(
    source,
    /const readbackBundle = path[.]join\(staging, "readback[.]tar"\)/u,
  );
  assert.match(source, /await verifyRuntimeArchiveSet\(readback\)/u);
  assert.match(source, /--format=ustar/u);
  assert.match(source, /--sort=name/u);
  assert.doesNotMatch(source, /playwright["', ]+,?[ ]*"install"/u);
  assert.doesNotMatch(source, /curl|wget/u);
});
