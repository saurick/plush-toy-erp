import assert from "node:assert/strict";
import test from "node:test";

import { parseDockerPushDigest } from "./github-release-publisher.mjs";

test("GitHub publisher extracts one immutable digest from docker push", () => {
  assert.equal(
    parseDockerPushDigest(
      `layer: pushed
sha-a: digest: sha256:${"a".repeat(64)} size: 1234
`,
    ),
    `sha256:${"a".repeat(64)}`,
  );
  assert.equal(
    parseDockerPushDigest(
      `digest: sha256:${"b".repeat(64)}
digest: sha256:${"b".repeat(64)}
`,
    ),
    `sha256:${"b".repeat(64)}`,
  );
});

test("GitHub publisher rejects missing or conflicting push digests", () => {
  assert.throws(() => parseDockerPushDigest("pushed"), /one immutable digest/u);
  assert.throws(
    () =>
      parseDockerPushDigest(
        `digest: sha256:${"a".repeat(64)}
digest: sha256:${"b".repeat(64)}
`,
      ),
    /one immutable digest/u,
  );
});
