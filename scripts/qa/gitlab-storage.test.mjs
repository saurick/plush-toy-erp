import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
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
    hostname = "r740xd",
    mount = "/srv/raid5",
    exportSuffix = "export",
    marker = "plush.backup-source/v1:gitlab-r740xd",
    backupSource = "/srv/raid5/gitlab/backups/repository",
  } = {},
) {
  const root = mkdtempSync(path.join(os.tmpdir(), "gitlab-storage-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  mkdirSync(bin);
  const local = path.join(root, "backups");
  writeFileSync(
    path.join(root, "gitlab-backup.sh"),
    readFileSync(
      new URL("../../server/deploy/gitlab/gitlab-backup.sh", import.meta.url),
      "utf8",
    ).replaceAll("/srv/raid5/gitlab/backups", local),
  );
  const offsite = path.join(local, exportSuffix);
  const recipient = path.join(root, "recipient.txt");
  mkdirSync(offsite, { recursive: true });
  writeFileSync(path.join(offsite, ".plush-backup-source"), marker + "\n");
  writeFileSync(recipient, `age1${"q".repeat(58)}\n`, { mode: 0o600 });
  const envSource = readFileSync(
    new URL("../../server/deploy/gitlab/.env.example", import.meta.url),
    "utf8",
  )
    .replaceAll("/srv/raid5/gitlab/backups", local)
    .replace(
      /^GITLAB_BACKUP_EXPORT_DIR=.*$/mu,
      `GITLAB_BACKUP_EXPORT_DIR=${offsite}`,
    )
    .replace(
      /^GITLAB_BACKUP_AGE_RECIPIENT_FILE=.*$/mu,
      `GITLAB_BACKUP_AGE_RECIPIENT_FILE=${recipient}`,
    );
  writeFileSync(path.join(root, ".env"), envSource);
  writeFileSync(
    path.join(bin, "hostname"),
    "#!/bin/sh\nprintf '%s\\n' \"$FAKE_HOSTNAME\"\n",
    { mode: 0o755 },
  );
  writeFileSync(
    path.join(bin, "findmnt"),
    `#!/bin/sh
printf '%s\\n' "$FAKE_MOUNT"

`,
    { mode: 0o755 },
  );
  writeFileSync(
    path.join(bin, "stat"),
    `#!/bin/sh
case "$*" in
  *"-c %a $FAKE_RECIPIENT"*) printf '600\\n' ;;
  *"-c %u $FAKE_RECIPIENT"*) printf '%s\\n' "$FAKE_UID" ;;
  *) exit 99 ;;
esac
`,
    { mode: 0o755 },
  );
  writeFileSync(
    path.join(bin, "realpath"),
    "#!/bin/sh\nfor value do result=$value; done\nprintf '%s\\n' \"$result\"\n",
    { mode: 0o755 },
  );
  writeFileSync(path.join(bin, "flock"), "#!/bin/sh\nexit 0\n", {
    mode: 0o755,
  });
  writeFileSync(path.join(bin, "age"), "#!/bin/sh\nexit 99\n", {
    mode: 0o755,
  });
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
  writeFileSync(callsFile, "");
  const result = spawnSync("bash", [path.join(root, "gitlab-backup.sh")], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FAKE_HOSTNAME: hostname,
      FAKE_MOUNT: mount,
      FAKE_RECIPIENT: recipient,
      FAKE_UID: String(process.getuid()),
      FAKE_BACKUP_SOURCE: backupSource.replace(
        "/srv/raid5/gitlab/backups",
        local,
      ),
      FAKE_CALLS: callsFile,
    },
  });
  const calls = readFileSync(callsFile, "utf8");
  assert.doesNotMatch(
    calls,
    /^exec /mu,
    "preview and rejected preflights must never create a backup",
  );
  return { ...result, calls };
}

test("a different control host blocks backup before any container access", (t) => {
  const result = preview(t, { hostname: "unrelated-host" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /control host identity mismatch/u);
  assert.equal(result.calls, "");
});

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

test("encrypted export cannot silently use another directory", (t) => {
  const result = preview(t, { exportSuffix: "unregistered" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /registered local spool/u);
});

test("an export directory with the wrong source marker fails closed", (t) => {
  const result = preview(t, { marker: "foreign-source" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /export marker is invalid/u);
});
