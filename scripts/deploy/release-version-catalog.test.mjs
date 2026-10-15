import assert from "node:assert/strict";
import test from "node:test";

import {
  assertOfficialReleaseVersion,
  assertReleaseVersionReference,
  buildReleaseVersionCatalog,
} from "./release-version-catalog.mjs";

test("derives the next Shanghai calendar sequence from the release catalog", () => {
  assert.deepEqual(
    buildReleaseVersionCatalog({
      versions: [
        { version: "2026.08.29-9" },
        { version: "2026.08.30-1" },
        { name: "2026.08.30-3" },
        { version: "legacy-v1" },
      ],
      reference: "2026-08-29T16:05:00.000Z",
    }),
    {
      schemaVersion: "plush.release-version-catalog/v1",
      timeZone: "Asia/Shanghai",
      date: "2026.08.30",
      nextVersion: "2026.08.30-4",
      officialVersionCount: 3,
      dateVersionCount: 2,
    },
  );
});

test("binds the version reference to the pipeline dispatch window", () => {
  assert.equal(
    assertReleaseVersionReference(
      "2026-08-30T02:00:00+08:00",
      "2026-08-29T18:04:00Z",
    ),
    true,
  );
  assert.throws(
    () =>
      assertReleaseVersionReference(
        "2026-08-29T02:00:00+08:00",
        "2026-08-30T02:00:00+08:00",
      ),
    /dispatch window/u,
  );
});

test("requires the exact catalog-derived next version", () => {
  const input = {
    versions: [{ version: "2026.08.30-1" }],
    reference: "2026-08-30T02:00:00+08:00",
  };
  assert.equal(
    assertOfficialReleaseVersion({ ...input, requested: "2026.08.30-2" })
      .nextVersion,
    "2026.08.30-2",
  );
  assert.throws(
    () =>
      assertOfficialReleaseVersion({
        ...input,
        requested: "2026.08.30-9",
      }),
    /catalog-derived/u,
  );
});

test("fails closed for duplicate or invalid official catalog versions", () => {
  assert.throws(
    () =>
      buildReleaseVersionCatalog({
        versions: ["2026.08.30-1", { name: "2026.08.30-1" }],
        reference: "2026-08-30T00:00:00Z",
      }),
    /duplicate/u,
  );
  assert.throws(
    () =>
      buildReleaseVersionCatalog({
        versions: ["2026.02.30-1"],
        reference: "2026-08-30T00:00:00Z",
      }),
    /invalid/u,
  );
  assert.throws(
    () =>
      buildReleaseVersionCatalog({
        versions: [],
        reference: "2026-08-30",
      }),
    /timestamp/u,
  );
});
