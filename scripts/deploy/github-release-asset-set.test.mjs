import assert from "node:assert/strict";
import test from "node:test";

import {
  LEGACY_RELEASE_ASSET_NAMES,
  RELEASE_ASSET_NAMES,
  analyzeReleaseCatalog,
  parseReleaseChecksums,
} from "./github-release-asset-set.mjs";

const sha = "a".repeat(40);
const version = "2026.08.08-cicd";
const assets = RELEASE_ASSET_NAMES.map((name, index) => ({
  name,
  size: 100 + index,
  digest: `sha256:${String(index + 1).repeat(64)}`.slice(0, 71),
}));

function release(overrides = {}) {
  return {
    id: 9,
    tag_name: `artifact-${sha}`,
    target_commitish: sha,
    name: version,
    draft: true,
    assets: [],
    ...overrides,
  };
}

test("release checksum catalog covers every payload once", () => {
  const source = RELEASE_ASSET_NAMES.filter((name) => name !== "checksums.sha256")
    .map((name, index) => `${String(index + 1).repeat(64)}  ${name}`)
    .join("\n");
  const parsed = parseReleaseChecksums(`${source}\n`);
  assert.equal(parsed.size, 6);
  const legacySource = LEGACY_RELEASE_ASSET_NAMES.filter(
    (name) => name !== "checksums.sha256",
  )
    .map((name, index) => `${String(index + 1).repeat(64)}  ${name}`)
    .join("\n");
  assert.equal(parseReleaseChecksums(`${legacySource}\n`).size, 5);
  assert.throws(
    () => parseReleaseChecksums(source.replace(/web-image\.tar/u, "server-image.tar")),
    /malformed|cover/u,
  );
});

test("release plan supports a new publication but rejects partial draft supplementation", () => {
  assert.deepEqual(
    analyzeReleaseCatalog({ releases: [], sha, version, localAssets: assets }),
    { state: "missing", releaseId: null, missingAssets: [...RELEASE_ASSET_NAMES] },
  );
  assert.throws(
    () =>
      analyzeReleaseCatalog({
        releases: [release({ assets: assets.slice(0, 2) })],
        sha,
        version,
        localAssets: assets,
      }),
    /cannot be resumed/u,
  );
  const legacyAssets = assets.filter((asset) =>
    LEGACY_RELEASE_ASSET_NAMES.includes(asset.name),
  );
  assert.throws(
    () =>
      analyzeReleaseCatalog({
        releases: [release({ assets: legacyAssets })],
        sha,
        version,
        localAssets: legacyAssets,
      }),
    /legacy v1 drafts/u,
  );
});

test("published release requires the exact complete asset set", () => {
  const complete = analyzeReleaseCatalog({
    releases: [release({ draft: false, assets })],
    sha,
    version,
    localAssets: assets,
  });
  assert.equal(complete.state, "published");
  assert.deepEqual(complete.missingAssets, []);
  assert.throws(
    () =>
      analyzeReleaseCatalog({
        releases: [release({ draft: false, assets: assets.slice(0, -1) })],
        sha,
        version,
        localAssets: assets,
      }),
    /incomplete/u,
  );
});

test("release version and remote digest stay bound to one SHA", () => {
  assert.throws(
    () =>
      analyzeReleaseCatalog({
        releases: [release({ tag_name: `artifact-${"b".repeat(40)}` })],
        sha,
        version,
        localAssets: assets,
      }),
    /another SHA/u,
  );
  assert.throws(
    () =>
      analyzeReleaseCatalog({
        releases: [release({ assets: [{ ...assets[0], digest: `sha256:${"f".repeat(64)}` }] })],
        sha,
        version,
        localAssets: assets,
      }),
    /identity mismatch/u,
  );
});
