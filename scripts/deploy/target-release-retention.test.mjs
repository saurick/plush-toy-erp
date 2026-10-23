import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const retentionScript = new URL(
  "./target-release-retention.sh",
  import.meta.url,
);
const retentionFixtureRunner = String.raw`
set -euo pipefail
source "$1"
root="$2"
target_key=demo-133
releases=$root/releases
current=$root/current
operations_root=$root/operations
incoming_root=$root/incoming
cache_roots=("$root/release-cache" "$root/release-cache-v2")
public_container_prefix=plush-toy-erp-demo-web-public-
server_sha=$(printf a%.0s {1..40})
web_sha=$server_sha
public_sha=$server_sha
release_directory_count=0
identified_release_count=0
protected_release_count=0
retention_candidate_count=0
retention_candidate_bytes=0
retention_candidate_shas=none
manual_review_release_count=0
formal_cache_count=0
operation_directory_count=0
retained_operation_count=0
stopped_public_container_count=0
plain_directory() { [[ -d "$1" && ! -L "$1" ]]; }
plain_file() { [[ -f "$1" && ! -L "$1" ]]; }
read_git_sha() { docker inspect "$1" --format sha; }
readlink() { node -e 'console.log(require("node:fs").realpathSync(process.argv[1]))' "$3"; }
du() { [[ "\${RETENTION_DU_FAILURE:-0}" != 1 ]] || return 1; printf '1024\t%s\n' "$2"; }
preview_target_release_retention
jq -n --arg protection "$retention_protection_status" --arg rollback "$rollback_release_shas" \
  --arg candidates "$retention_candidate_shas" --argjson protected "$protected_release_count" \
  --argjson candidateCount "$retention_candidate_count" --argjson candidateBytes "$retention_candidate_bytes" \
  --argjson cacheCount "$cache_candidate_count" --argjson cacheBytes "$cache_candidate_bytes" \
  --argjson stopped "$stopped_public_container_candidate_count" --argjson review "$manual_review_release_count" \
  '{protection:$protection,rollback:$rollback,candidates:$candidates,protected:$protected,candidateCount:$candidateCount,candidateBytes:$candidateBytes,cacheCount:$cacheCount,cacheBytes:$cacheBytes,stopped:$stopped,review:$review}'
`.replaceAll("\\${", "${");

function retentionFixture(t) {
  const root = realpathSync(
    mkdtempSync(path.join(tmpdir(), "plush-retention-")),
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (relative, value) => {
    const file = path.join(root, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(
      file,
      typeof value === "string" ? value : JSON.stringify(value),
    );
  };
  for (const name of [
    "releases",
    "operations",
    "incoming",
    "bin",
    "release-cache-v2",
  ])
    mkdirSync(path.join(root, name));
  for (const letter of "abcdef0123") {
    write(`releases/${letter.repeat(40)}/.plush-release-identity.json`, {
      schemaVersion: "plush.target-release-identity/v1",
      gitSha: letter.repeat(40),
      sourceArchiveSha256: "1".repeat(64),
      releaseManifestSha256: "2".repeat(64),
    });
    write(`releases/${letter.repeat(40)}/source.txt`, `release ${letter}`);
  }
  symlinkSync(
    path.join(root, "releases", "a".repeat(40)),
    path.join(root, "current"),
  );
  const operation = (index, changes = {}) => {
    const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    const value = {
      schemaVersion: "plush.remote-promotion-receipt/v5",
      operationId: id,
      target: "demo-133",
      status: "passed",
      gitSha: "a".repeat(40),
      before: { runtimeSha: "b".repeat(40) },
      finishedAt: "2026-10-16T06:00:00Z",
      ...changes,
    };
    write(`operations/${id}/receipt.json`, value);
    return id;
  };
  operation(1);
  operation(2, {
    gitSha: "b".repeat(40),
    before: { runtimeSha: "c".repeat(40) },
    finishedAt: "2026-10-15T06:00:00Z",
  });
  operation(3, {
    gitSha: "c".repeat(40),
    before: { runtimeSha: "d".repeat(40) },
    finishedAt: "2026-10-14T06:00:00Z",
  });
  operation(4, {
    gitSha: "d".repeat(40),
    before: { runtimeSha: "e".repeat(40) },
    finishedAt: "2026-10-13T06:00:00Z",
  });
  for (const [i, letter] of [..."0123"].entries()) operation(10 + i, {
    gitSha: letter.repeat(40), before: {}, finishedAt: `2026-10-${String(12 - i).padStart(2, "0")}T06:00:00Z`,
  });
  for (const [index, letter] of [..."ab23"].entries()) {
    write(
      `release-cache-v2/${String(index + 1).padStart(64, "0")}/release-artifact.json`,
      {
        schemaVersion: "plush-release-artifact/v1",
        git: { commit: letter.repeat(40) },
      },
    );
    write(
      `release-cache-v2/${String(index + 1).padStart(64, "0")}/payload.tar`,
      `payload ${letter}`,
    );
  }
  write(
    "containers.json",
    [..."ab2f"].map((letter) => ({
      name: `plush-toy-erp-demo-web-public-${letter.repeat(8)}`,
      sha: letter.repeat(40),
      running: ["a", "f"].includes(letter),
    })),
  );
  write(
    "bin/docker",
    `#!${process.execPath}\nconst fs=require('node:fs');const a=process.argv.slice(2);const rows=JSON.parse(fs.readFileSync(process.env.RETENTION_FIXTURE_ROOT+'/containers.json'));if(a[0]==='ps')console.log(rows.map(x=>x.name).join('\\n'));else{const row=rows.find(x=>x.name===a[1]);if(!row)process.exit(1);console.log(a.at(-1)==='sha'?row.sha:String(row.running));}\n`,
  );
  chmodSync(path.join(root, "bin/docker"), 0o700);
  return {
    root,
    write,
    operation,
    run(env = {}) {
      const result = spawnSync(
        "bash",
        [
          "-c",
          retentionFixtureRunner,
          "retention-fixture",
          retentionScript.pathname,
          root,
        ],
        {
          cwd: root,
          env: {
            ...process.env,
            PATH: `${root}/bin:${process.env.PATH}`,
            RETENTION_FIXTURE_ROOT: root,
            ...env,
          },
          encoding: "utf8",
          timeout: 20_000,
        },
      );
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout);
    },
  };
}

function retentionTree(root) {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => [
      path.relative(root, path.join(entry.parentPath, entry.name)),
      readFileSync(path.join(entry.parentPath, entry.name), "utf8"),
    ])
    .sort(([left], [right]) => left.localeCompare(right));
}

test("retention keeps seven recent versions plus runtime and two recovery versions while retiring old caches", (t) => {
  const f = retentionFixture(t);
  f.write(
    "operations/00000000-0000-4000-8000-000000000001/production-preflight-report.json",
    { historicalSha: "e".repeat(40) },
  );
  const before = retentionTree(f.root);
  const r = f.run();
  assert.equal(r.protection, "complete");
  assert.equal(r.rollback, `${"b".repeat(40)},${"c".repeat(40)}`);
  assert.equal(r.protected, 8);
  assert.equal(r.candidates, `${"2".repeat(40)},${"3".repeat(40)}`);
  assert.equal(r.candidateCount, 2);
  assert.equal(r.cacheCount, 2);
  assert.equal(r.stopped, 1);
  assert.deepEqual(retentionTree(f.root), before);
});

test("unresolved and failed operations retain their exact source and candidate releases", (t) => {
  const f = retentionFixture(t);
  f.operation(5, {
    status: "failed",
    gitSha: "2".repeat(40),
    before: { runtimeSha: "3".repeat(40) },
  });
  assert.equal(f.run().candidateCount, 0);
  assert.equal(f.run().cacheCount, 0);
});

test("recovery selection stays on the latest two even when another operation already pins them", (t) => {
  const f = retentionFixture(t);
  f.operation(5, {
    status: "failed",
    gitSha: "b".repeat(40),
    before: { runtimeSha: "c".repeat(40) },
  });
  assert.equal(f.run().rollback, `${"b".repeat(40)},${"c".repeat(40)}`);
});

test("successful rollback receipts retain their source as a recovery version", (t) => {
  const f = retentionFixture(t);
  f.operation(5, {
    schemaVersion: "plush.remote-rollback-receipt/v5",
    gitSha: undefined,
    before: undefined,
    fromGitSha: "e".repeat(40),
    toGitSha: "a".repeat(40),
    finishedAt: "2026-10-18T06:00:00Z",
  });
  assert.equal(f.run().rollback, `${"e".repeat(40)},${"b".repeat(40)}`);
});

test("retention accepts the identity-bound current source copy used by promotion and rejects drift", (t) => {
  const f = retentionFixture(t);
  rmSync(path.join(f.root, "current"));
  cpSync(
    path.join(f.root, "releases", "a".repeat(40)),
    path.join(f.root, "current"),
    { recursive: true },
  );
  assert.equal(f.run().protection, "complete");
  f.write("current/.plush-release-identity.json", {
    schemaVersion: "plush.target-release-identity/v1",
    gitSha: "b".repeat(40),
    sourceArchiveSha256: "1".repeat(64),
    releaseManifestSha256: "2".repeat(64),
  });
  const r = f.run();
  assert.equal(r.protection, "manual_review");
  assert.equal(r.candidateCount + r.cacheCount, 0);
});

test("a successful terminal receipt resolves an earlier running state without pinning its incidental history", (t) => {
  const f = retentionFixture(t);
  f.write("operations/00000000-0000-4000-8000-000000000004/state.json", {
    schemaVersion: "plush.remote-promotion-state/v1",
    operationId: "00000000-0000-4000-8000-000000000004",
    target: "demo-133",
    status: "running",
    gitSha: "2".repeat(40),
  });
  assert.equal(f.run().candidateCount, 2);
});

test("retention orders recovery receipts by their recorded completion rather than directory names", (t) => {
  const f = retentionFixture(t);
  f.operation(9, {
    gitSha: "a".repeat(40),
    before: { runtimeSha: "e".repeat(40) },
    finishedAt: "2026-10-17T06:00:00Z",
  });
  assert.equal(f.run().rollback, `${"e".repeat(40)},${"b".repeat(40)}`);
});

test("ambiguous operation metadata, target drift and inaccessible sizes suppress all cleanup candidates", async (t) => {
  for (const kind of [
    "corrupt",
    "multiple",
    "target",
    "version",
    "previous_sha",
    "operation_id",
    "size",
  ])
    await t.test(kind, (t) => {
      const f = retentionFixture(t);
      if (kind === "corrupt")
        f.write(
          "operations/00000000-0000-4000-8000-000000000004/receipt.json",
          "{",
        );
      if (kind === "multiple") {
        const file =
          "operations/00000000-0000-4000-8000-000000000004/receipt.json";
        const original = readFileSync(path.join(f.root, file), "utf8");
        f.write(file, original + original);
      }
      if (kind === "target") f.operation(4, { target: "customer-test-133" });
      if (kind === "version")
        f.operation(4, { schemaVersion: "plush.remote-promotion-receipt/v99" });
      if (kind === "previous_sha")
        f.operation(4, { before: { runtimeSha: "unresolved" } });
      if (kind === "operation_id") {
        const receipt = JSON.parse(
          readFileSync(
            path.join(
              f.root,
              "operations/00000000-0000-4000-8000-000000000004/receipt.json",
            ),
            "utf8",
          ),
        );
        f.write("operations/unknown-operation/receipt.json", {
          ...receipt,
          operationId: "unknown-operation",
        });
      }
      const r = f.run(kind === "size" ? { RETENTION_DU_FAILURE: "1" } : {});
      assert.equal(r.protection, "manual_review");
      assert.equal(r.candidateCount + r.cacheCount + r.stopped, 0);
      assert.equal(r.candidateBytes + r.cacheBytes, 0);
    });
});

test("symlinked release and cache paths remain untouched and are never cleanup candidates", (t) => {
  const f = retentionFixture(t);
  symlinkSync(
    path.join(f.root, "releases", "e".repeat(40)),
    path.join(f.root, "releases", "9".repeat(40)),
  );
  let r = f.run();
  assert.equal(r.review, 1);
  assert(!r.candidates.includes("9".repeat(40)));
  symlinkSync(
    path.join(f.root, "releases"),
    path.join(f.root, "release-cache-v2", "f".repeat(64)),
  );
  r = f.run();
  assert.equal(r.protection, "manual_review");
  assert.equal(r.candidateCount + r.cacheCount, 0);
  assert.equal(
    readFileSync(
      path.join(f.root, "releases", "e".repeat(40), "source.txt"),
      "utf8",
    ),
    "release e",
  );
});
