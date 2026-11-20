import assert from "node:assert/strict";
import test from "node:test";

import { DELIVERY_RELEASE_ASSETS } from "./delivery-provider.mjs";
import { parseReleaseChecksums } from "./release-asset-set.mjs";

const payloads = DELIVERY_RELEASE_ASSETS.filter(
  (name) => name !== "checksums.sha256",
);
const lines = payloads.map((name, index) => `${String(index).repeat(64)}  ${name}`);

test("release checksums cover every current payload including the rehearsal", () => {
  assert.deepEqual([...parseReleaseChecksums(lines.join("\n")).keys()], payloads);
  assert.throws(
    () => parseReleaseChecksums(lines.filter((line) => !line.endsWith("release-rehearsal.json")).join("\n")),
    /every payload exactly once/u,
  );
  assert.throws(
    () => parseReleaseChecksums([...lines, lines[0]].join("\n")),
    /malformed/u,
  );
});
