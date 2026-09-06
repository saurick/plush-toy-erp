import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function preview(
  t,
  {
    mount = "/srv/raid5",
    backupSource = "/srv/raid5/gitlab/backups/repository",
  } = {},
) {
  const root = mkdtempSync(path.join(os.tmpdir(), "gitlab-storage-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  mkdirSync(bin);
  copyFileSync(
    new URL("../../server/deploy/gitlab/gitlab-backup.sh", import.meta.url),
    path.join(root, "gitlab-backup.sh"),
  );
  copyFileSync(
    new URL("../../server/deploy/gitlab/.env.example", import.meta.url),
    path.join(root, ".env"),
  );
  writeFileSync(
    path.join(bin, "findmnt"),
    "#!/bin/sh\nprintf '%s\\n' \"$FAKE_MOUNT\"\n",
    { mode: 0o755 },
  );
  writeFileSync(
    path.join(bin, "docker"),
    `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_CALLS"
case "$*" in
  *State.Health.Status*) printf 'healthy\\n' ;;
  *Mounts*) printf '%s\\n' "$FAKE_BACKUP_SOURCE" ;;
  inspect*) ;;
  *) exit 99 ;;
esac
`,
    { mode: 0o755 },
  );
  const callsFile = path.join(root, "calls");
  const result = spawnSync("bash", [path.join(root, "gitlab-backup.sh")], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FAKE_MOUNT: mount,
      FAKE_BACKUP_SOURCE: backupSource,
      FAKE_CALLS: callsFile,
    },
  });
  const calls = readFileSync(callsFile, "utf8");
  assert.doesNotMatch(
    calls,
    /^exec /mu,
    "preview and rejected preflights must never create a backup",
  );
  return result;
}

test("missing RAID mount blocks backup even when the root filesystem is available", (t) => {
  const result = preview(t, { mount: "/" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /RAID5 must be mounted/u);
});

test("an SSD-backed container backup path blocks execution", (t) => {
  const result = preview(t, { backupSource: "/srv/gitlab/data/backups" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /backup mount mismatch/u);
});

test("the expected RAID and container mount permit a read-only preview", (t) => {
  const result = preview(t);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /preview_only=true/u);
});
