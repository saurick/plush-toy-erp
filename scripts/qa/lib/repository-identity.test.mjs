import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertRepositoryIdentityEqual,
  buildRepositoryFingerprint,
  normalizeRepositoryIdentity,
  readRepositoryIdentity,
  repositoryIdentitiesEqual,
} from "./repository-identity.mjs";

async function createRepository(t) {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "plush-repository-identity-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "qa@example.invalid"], {
    cwd: root,
  });
  execFileSync("git", ["config", "user.name", "QA"], { cwd: root });
  await writeFile(path.join(root, ".gitignore"), "output/\n", "utf8");
  await writeFile(path.join(root, "tracked.txt"), "tracked-v1\n", "utf8");
  execFileSync("git", ["add", ".gitignore", "tracked.txt"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
  return root;
}

test("repository identity validation is exact and does not echo values", () => {
  const identity = {
    commit: "a".repeat(40),
    dirty: true,
    fingerprint: "b".repeat(64),
  };
  assert.deepEqual(normalizeRepositoryIdentity(identity), identity);
  assert.equal(repositoryIdentitiesEqual(identity, { ...identity }), true);
  assert.equal(
    repositoryIdentitiesEqual(identity, {
      ...identity,
      fingerprint: "c".repeat(64),
    }),
    false,
  );
  assert.deepEqual(assertRepositoryIdentityEqual(identity, identity), identity);

  for (const invalid of [
    null,
    { ...identity, commit: "A".repeat(40) },
    { ...identity, dirty: 1 },
    { ...identity, fingerprint: "short" },
    { ...identity, localPath: "/Users/alice/private" },
  ]) {
    assert.throws(
      () => normalizeRepositoryIdentity(invalid),
      (error) => {
        assert.equal(error.message, "repository identity is invalid");
        assert.doesNotMatch(error.message, /Users|alice|private/u);
        return true;
      },
    );
  }
  assert.throws(
    () =>
      assertRepositoryIdentityEqual(identity, {
        ...identity,
        fingerprint: "c".repeat(64),
      }),
    /^Error: repository identity changed during evidence collection$/u,
  );
});

test("pure fingerprint includes tracked diff and stable untracked content ordering", () => {
  const commit = "a".repeat(40);
  const base = {
    commit,
    porcelainBytes: Buffer.from(" M tracked.txt\0?? alpha.txt\0", "utf8"),
    trackedDiffBytes: Buffer.from("diff-v1", "utf8"),
    untrackedEntries: [
      { path: "zeta.txt", type: "file", content: "zeta" },
      { path: "alpha.txt", type: "file", content: "alpha" },
    ],
  };
  const first = buildRepositoryFingerprint(base);
  const reordered = buildRepositoryFingerprint({
    ...base,
    untrackedEntries: [...base.untrackedEntries].reverse(),
  });
  assert.equal(first, reordered);
  assert.notEqual(
    first,
    buildRepositoryFingerprint({
      ...base,
      trackedDiffBytes: Buffer.from("diff-v2", "utf8"),
    }),
  );
  assert.notEqual(
    first,
    buildRepositoryFingerprint({
      ...base,
      untrackedEntries: [
        { path: "zeta.txt", type: "file", content: "zeta" },
        { path: "alpha.txt", type: "file", content: "changed" },
      ],
    }),
  );
});

test("same porcelain paths with changed tracked or untracked bytes change identity", async (t) => {
  const root = await createRepository(t);
  await writeFile(path.join(root, "tracked.txt"), "tracked-v2\n", "utf8");
  await writeFile(path.join(root, "untracked.txt"), "untracked-v1\n", "utf8");
  const first = await readRepositoryIdentity(root);

  await writeFile(path.join(root, "tracked.txt"), "tracked-v3\n", "utf8");
  const trackedChanged = await readRepositoryIdentity(root);
  assert.equal(first.commit, trackedChanged.commit);
  assert.equal(first.dirty, true);
  assert.equal(trackedChanged.dirty, true);
  assert.notEqual(first.fingerprint, trackedChanged.fingerprint);

  await writeFile(path.join(root, "untracked.txt"), "untracked-v2\n", "utf8");
  const untrackedChanged = await readRepositoryIdentity(root);
  assert.equal(trackedChanged.commit, untrackedChanged.commit);
  assert.equal(trackedChanged.dirty, untrackedChanged.dirty);
  assert.notEqual(trackedChanged.fingerprint, untrackedChanged.fingerprint);
  assert.deepEqual(Object.keys(untrackedChanged).sort(), [
    "commit",
    "dirty",
    "fingerprint",
  ]);
});

test("identity rejects untracked symlinks and oversized files without leaking paths", async (t) => {
  const symlinkRoot = await createRepository(t);
  await writeFile(path.join(symlinkRoot, "target.txt"), "target\n", "utf8");
  await symlink("target.txt", path.join(symlinkRoot, "link.txt"));
  await assert.rejects(readRepositoryIdentity(symlinkRoot), (error) => {
    assert.match(error.message, /symbolic links/u);
    assert.doesNotMatch(error.message, /link\.txt|target\.txt|Users/u);
    return true;
  });

  const oversizedRoot = await createRepository(t);
  await mkdir(path.join(oversizedRoot, "nested"));
  await writeFile(
    path.join(oversizedRoot, "nested", "large.bin"),
    "12345",
    "utf8",
  );
  await assert.rejects(
    readRepositoryIdentity(oversizedRoot, { maxUntrackedFileBytes: 4 }),
    (error) => {
      assert.match(error.message, /oversized untracked file/u);
      assert.doesNotMatch(error.message, /large\.bin|nested|Users/u);
      return true;
    },
  );
});
