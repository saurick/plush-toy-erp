import assert from "node:assert/strict";
import test from "node:test";

import { RELEASE_ASSET_NAMES } from "./github-release-asset-set.mjs";
import {
  planGitlabReleasePublication,
  selectGitlabReleasePackage,
  verifyGitlabReleasePublication,
} from "./gitlab-release-publication.mjs";

const sha = "a".repeat(40);

function localAssets() {
  return {
    status: "passed",
    state: "local",
    assets: RELEASE_ASSET_NAMES.map((name, index) => ({
      name,
      size: index + 100,
      digest: `sha256:${String(index + 1).padStart(64, "0")}`,
    })),
  };
}

function remoteAssets(names = RELEASE_ASSET_NAMES) {
  const local = new Map(localAssets().assets.map((asset) => [asset.name, asset]));
  return names.map((name) => ({
    file_name: name,
    size: local.get(name).size,
    file_sha256: local.get(name).digest.slice(7),
  }));
}

test("selects at most one exact immutable GitLab package identity", () => {
  assert.deepEqual(
    selectGitlabReleasePackage(
      [
        {
          id: 17,
          package_type: "generic",
          name: "plush-release",
          version: `artifact-${sha}`,
        },
        {
          id: 18,
          package_type: "generic",
          name: "another-package",
          version: `artifact-${sha}`,
        },
      ],
      `artifact-${sha}`,
    ),
    { id: 17 },
  );
  assert.equal(selectGitlabReleasePackage([], `artifact-${sha}`), null);
  assert.throws(
    () =>
      selectGitlabReleasePackage(
        [
          {
            id: 17,
            package_type: "generic",
            name: "plush-release",
            version: `artifact-${sha}`,
          },
          {
            id: 19,
            package_type: "generic",
            name: "plush-release",
            version: `artifact-${sha}`,
          },
        ],
        `artifact-${sha}`,
      ),
    /not unique/u,
  );
});

test("plans only missing assets from an exact verified remote subset", () => {
  const existing = RELEASE_ASSET_NAMES.slice(0, 3);
  const result = planGitlabReleasePublication({
    local: localAssets(),
    remote: remoteAssets(existing),
  });
  assert.equal(result.state, "partial");
  assert.equal(result.existingCount, 3);
  assert.deepEqual(result.missingAssets, RELEASE_ASSET_NAMES.slice(3));
});

test("blocks unknown, duplicate or mismatched existing package files", () => {
  const local = localAssets();
  assert.throws(
    () =>
      planGitlabReleasePublication({
        local,
        remote: [
          {
            file_name: "unexpected.txt",
            size: 1,
            file_sha256: "1".repeat(64),
          },
        ],
      }),
    /invalid file/u,
  );
  assert.throws(
    () =>
      planGitlabReleasePublication({
        local,
        remote: [
          ...remoteAssets([RELEASE_ASSET_NAMES[0]]),
          ...remoteAssets([RELEASE_ASSET_NAMES[0]]),
        ],
      }),
    /invalid file/u,
  );
  const mismatched = remoteAssets([RELEASE_ASSET_NAMES[0]]);
  mismatched[0].file_sha256 = "f".repeat(64);
  assert.throws(
    () => planGitlabReleasePublication({ local, remote: mismatched }),
    /mismatch/u,
  );
});

test("requires an exact seven-asset readback before publication is complete", () => {
  assert.equal(
    verifyGitlabReleasePublication({
      local: localAssets(),
      remote: remoteAssets(),
    }).state,
    "complete",
  );
  assert.throws(
    () =>
      verifyGitlabReleasePublication({
        local: localAssets(),
        remote: remoteAssets(RELEASE_ASSET_NAMES.slice(0, -1)),
      }),
    /incomplete/u,
  );
});
