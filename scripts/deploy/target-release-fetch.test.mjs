import assert from "node:assert/strict";
import test from "node:test";

import { DELIVERY_RELEASE_ASSETS } from "./delivery-provider.mjs";
import {
  buildTargetReleaseFetch,
  requireTargetReleaseFetchCredential,
  validateTargetReleaseFetch,
} from "./target-release-fetch.mjs";

const sha = "a".repeat(40);
const digest = "b".repeat(64);

function fixture() {
  return buildTargetReleaseFetch({
    gitSha: sha,
    version: "2026.09.01-1",
    formalFiles: DELIVERY_RELEASE_ASSETS.map((name, index) => ({
      name,
      size: index + 1,
      sha256: digest,
    })),
    sourceFile: { name: "source.tar", size: 100, sha256: digest },
  });
}

test("target release fetch binds fixed GitLab package transport without credentials", () => {
  const value = fixture();
  assert.deepEqual(validateTargetReleaseFetch(value), value);
  assert.equal(value.host, "gitlab.saurick.me");
  assert.equal(value.resolvedAddress, "192.168.0.133");
  assert.equal(value.formal.files.length, 7);
  assert.equal(JSON.stringify(value).includes("token"), false);
});

test("target release fetch rejects asset, route and source-package drift", () => {
  const value = fixture();
  assert.throws(
    () =>
      validateTargetReleaseFetch({
        ...value,
        resolvedAddress: "127.0.0.1",
      }),
    /contract/u,
  );
  assert.throws(
    () =>
      validateTargetReleaseFetch({
        ...value,
        formal: { ...value.formal, files: value.formal.files.slice(1) },
      }),
    /contract|asset/u,
  );
  assert.throws(
    () =>
      validateTargetReleaseFetch({
        ...value,
        source: {
          ...value.source,
          file: { ...value.source.file, name: "other.tar" },
        },
      }),
    /source|file/u,
  );
});

test("target release fetch accepts only an explicit dedicated credential shape", () => {
  assert.equal(
    requireTargetReleaseFetchCredential("read-only-target-token-123456"),
    "read-only-target-token-123456",
  );
  assert.throws(
    () => requireTargetReleaseFetchCredential(""),
    /dedicated target release fetch credential/u,
  );
  assert.throws(
    () => requireTargetReleaseFetchCredential("token with spaces"),
    /dedicated target release fetch credential/u,
  );
});
