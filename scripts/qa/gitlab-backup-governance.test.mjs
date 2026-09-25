import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../..");

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "gitlab-backup-governance-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  mkdirSync(bin);
  return { root, bin };
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

test("backup failure notification sends only a bounded event through a root-mode curl config", (t) => {
  const { root, bin } = fixture(t);
  const config = path.join(root, "alert.curl");
  const payload = path.join(root, "payload.json");
  const journal = path.join(root, "journal.json");
  writeFileSync(
    config,
    'url = "https://alerts.example.com/secret-receiver"\nrequest = "POST"\n',
    { mode: 0o600 },
  );
  writeFileSync(path.join(bin, "hostname"), "#!/bin/sh\nprintf 'r740xd\\n'\n", {
    mode: 0o755,
  });
  writeFileSync(
    path.join(bin, "date"),
    "#!/bin/sh\nprintf '2026-09-25T12:00:00Z\\n'\n",
    { mode: 0o755 },
  );
  writeFileSync(
    path.join(bin, "systemd-cat"),
    '#!/bin/sh\ncat >"$FAKE_JOURNAL"\n',
    { mode: 0o755 },
  );
  writeFileSync(path.join(bin, "curl"), '#!/bin/sh\ncat >"$FAKE_PAYLOAD"\n', {
    mode: 0o755,
  });
  writeFileSync(
    path.join(bin, "stat"),
    `#!/bin/sh
case "$1:$2" in
  "-c:%u") printf '%s\\n' "$FAKE_UID" ;;
  "-c:%a") printf '600\\n' ;;
  *) exit 99 ;;
esac
`,
    { mode: 0o755 },
  );

  const result = spawnSync(
    "bash",
    [
      path.join(ROOT, "server/deploy/gitlab/gitlab-backup-failure-notify.sh"),
      "--unit",
      "plush-gitlab-backup.service",
      "--config",
      config,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        FAKE_JOURNAL: journal,
        FAKE_PAYLOAD: payload,
        FAKE_UID: String(process.getuid()),
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /secret-receiver/u);
  const sent = JSON.parse(readFileSync(payload, "utf8"));
  assert.deepEqual(sent, {
    schemaVersion: "plush.gitlab-backup-alert/v1",
    event: "backup_failed",
    unit: "plush-gitlab-backup.service",
    host: "r740xd",
    occurredAt: "2026-09-25T12:00:00Z",
  });
  assert.equal(readFileSync(journal, "utf8"), `${JSON.stringify(sent)}\n`);

  const check = spawnSync(
    "bash",
    [
      path.join(ROOT, "server/deploy/gitlab/gitlab-backup-failure-notify.sh"),
      "--unit",
      "plush-gitlab-backup.service",
      "--config",
      config,
      "--check",
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        FAKE_UID: String(process.getuid()),
      },
    },
  );
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /status=passed mode=check/u);
});

test("backup health requires a fresh passed status and the matching offsite package", (t) => {
  const { root, bin } = fixture(t);
  const local = path.join(root, "local");
  const offsite = path.join(root, "offsite");
  const backup = path.join(offsite, "backup-20260925T110000Z");
  mkdirSync(local);
  mkdirSync(backup, { recursive: true });
  writeFileSync(path.join(backup, "encrypted.sha256"), "digest\n");
  writeFileSync(path.join(backup, "manifest.env.age"), "encrypted\n");
  writeFileSync(
    path.join(local, "latest-status.env"),
    [
      "schemaVersion=plush.gitlab-backup-status/v1",
      "status=passed",
      "backupId=gitlab-20260925T110000Z",
      "completedAt=2026-09-25T11:00:00Z",
      "offsiteCopied=true",
      "offsiteEncrypted=true",
      "",
    ].join("\n"),
  );
  const envFile = path.join(root, "gitlab.env");
  writeFileSync(
    envFile,
    [
      `GITLAB_RAID_BACKUP_DIR=${local}`,
      `GITLAB_OFFSITE_BACKUP_DIR=${offsite}`,
      "GITLAB_BACKUP_MAX_AGE_HOURS=36",
      "",
    ].join("\n"),
  );
  writeFileSync(
    path.join(bin, "date"),
    `#!/bin/sh
case "$*" in
  "-u -d 2026-09-25T11:00:00Z +%s") printf '1000\\n' ;;
  "-u +%s") printf '4600\\n' ;;
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

  const script = path.join(
    ROOT,
    "server/deploy/gitlab/gitlab-backup-health.sh",
  );
  const passed = spawnSync("bash", [script, "--env-file", envFile], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /backupAgeSeconds=3600/u);

  writeFileSync(
    path.join(local, "latest-status.env"),
    readFileSync(path.join(local, "latest-status.env"), "utf8").replace(
      "status=passed",
      "status=failed",
    ),
  );
  const failed = spawnSync("bash", [script, "--env-file", envFile], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
  assert.notEqual(failed.status, 0);
});

test("offsite verification is explicitly archive-level and never overwrites GitLab", () => {
  const backupSource = readFileSync(
    path.join(ROOT, "server/deploy/gitlab/gitlab-backup.sh"),
    "utf8",
  );
  const source = readFileSync(
    path.join(ROOT, "server/deploy/gitlab/gitlab-offsite-backup-verify.sh"),
    "utf8",
  );
  assert.match(backupSource, /offsite backup must use a different filesystem/u);
  assert.equal(backupSource.match(/age --recipient/gu)?.length, 4);
  assert.ok(backupSource.includes('mv -- "$offsite_temp" "$offsite_final"'));
  assert.match(backupSource, /write_status passed 0/u);
  assert.doesNotMatch(backupSource, /rm\s+-rf/u);
  assert.match(source, /age --decrypt/u);
  assert.match(source, /manifest[.]env[.]age/u);
  assert.match(source, /gitlab-\$\{latest##\*\/backup-\}/u);
  assert.match(source, /seen\["repository[.]tar[.]age"\] != 1/u);
  assert.match(source, /seen\["repository[.]tar"\] != 1/u);
  assert.match(source, /stat -c '%s' "\$temporary\/repository[.]tar"/u);
  assert.match(source, /sha256sum --check --strict/u);
  assert.match(source, /tar -tf/u);
  assert.match(source, /tar -tzf/u);
  assert.match(source, /disposable same-version instance remains required/u);
  assert.doesNotMatch(source, /docker\s+(?:stop|rm)|rm\s+-rf/u);
});

test("offsite verification decrypts one exact package and binds manifest identity", (t) => {
  const { root, bin } = fixture(t);
  const offsite = path.join(root, "offsite");
  const stamp = "20260925T110000Z";
  const backup = path.join(offsite, `backup-${stamp}`);
  const content = path.join(root, "content");
  mkdirSync(backup, { recursive: true });
  mkdirSync(content);
  writeFileSync(
    path.join(offsite, ".plush-gitlab-offsite-target"),
    "plush-gitlab-offsite-v1\n",
  );
  writeFileSync(path.join(content, "repository.txt"), "repository\n");
  const repository = path.join(root, "repository.tar");
  const config = path.join(root, "config.tar.gz");
  assert.equal(
    spawnSync("tar", ["-cf", repository, "-C", content, "."]).status,
    0,
  );
  assert.equal(
    spawnSync("tar", ["-czf", config, "-C", content, "."]).status,
    0,
  );
  const repositoryHash = sha256(repository);
  const configHash = sha256(config);
  const checksums = path.join(backup, "checksums.sha256.age");
  writeFileSync(
    checksums,
    `${repositoryHash}  repository.tar\n${configHash}  config.tar.gz\n`,
  );
  writeFileSync(
    path.join(backup, "manifest.env.age"),
    [
      "schemaVersion=plush.gitlab-offsite-backup/v1",
      "status=passed",
      `backupId=gitlab-${stamp}`,
      "completedAt=2026-09-25T11:00:00Z",
      `repositorySha256=${repositoryHash}`,
      `repositorySizeBytes=${statSync(repository).size}`,
      `configSha256=${configHash}`,
      `configSizeBytes=${statSync(config).size}`,
      "",
    ].join("\n"),
  );
  writeFileSync(
    path.join(backup, "repository.tar.age"),
    readFileSync(repository),
  );
  writeFileSync(path.join(backup, "config.tar.gz.age"), readFileSync(config));
  const encryptedNames = [
    "repository.tar.age",
    "config.tar.gz.age",
    "checksums.sha256.age",
    "manifest.env.age",
  ];
  writeFileSync(
    path.join(backup, "encrypted.sha256"),
    encryptedNames
      .map((name) => `${sha256(path.join(backup, name))}  ${name}`)
      .join("\n") + "\n",
  );
  const identity = path.join(root, "identity.txt");
  writeFileSync(identity, "AGE-SECRET-KEY-TEST\n", { mode: 0o600 });
  const report = path.join(root, "report.json");

  writeFileSync(
    path.join(bin, "age"),
    `#!/bin/sh
output=
source_file=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) output=$2; shift 2 ;;
    --identity) shift 2 ;;
    --decrypt) shift ;;
    *) source_file=$1; shift ;;
  esac
done
cp "$source_file" "$output"
`,
    { mode: 0o755 },
  );
  writeFileSync(
    path.join(bin, "date"),
    `#!/bin/sh
case "$*" in
  "-u -d 2026-09-25T11:00:00Z +%s") printf '1000\\n' ;;
  "-u +%s") printf '4600\\n' ;;
  "-u +%Y-%m-%dT%H:%M:%SZ") printf '2026-09-25T12:00:00Z\\n' ;;
  *) exit 99 ;;
esac
`,
    { mode: 0o755 },
  );
  writeFileSync(
    path.join(bin, "findmnt"),
    "#!/bin/sh\nprintf '%s\\n' \"$FAKE_OFFSITE\"\n",
    { mode: 0o755 },
  );
  writeFileSync(
    path.join(bin, "realpath"),
    "#!/bin/sh\nfor value do result=$value; done\nprintf '%s\\n' \"$result\"\n",
    { mode: 0o755 },
  );
  writeFileSync(
    path.join(bin, "find"),
    `#!/bin/sh
if [ "$1" = "$FAKE_OFFSITE" ]; then
  printf '1000 %s\\n' "$FAKE_BACKUP"
elif [ "$1" = "$FAKE_BACKUP" ]; then
  case "$*" in
    *"-type l"*) exit 0 ;;
    *) printf '%s\\n' checksums.sha256.age config.tar.gz.age encrypted.sha256 manifest.env.age repository.tar.age ;;
  esac
else
  exec /usr/bin/find "$@"
fi
`,
    { mode: 0o755 },
  );
  writeFileSync(
    path.join(bin, "stat"),
    `#!/bin/sh
case "$*" in
  *"-c %a $FAKE_IDENTITY"*) printf '600\\n' ;;
  *"-c %u $FAKE_IDENTITY"*) printf '%s\\n' "$FAKE_UID" ;;
  *"-c %s "*"repository.tar") printf '%s\\n' "$FAKE_REPOSITORY_SIZE" ;;
  *"-c %s "*"config.tar.gz") printf '%s\\n' "$FAKE_CONFIG_SIZE" ;;
  *) exit 99 ;;
esac
`,
    { mode: 0o755 },
  );

  const result = spawnSync(
    "bash",
    [
      path.join(ROOT, "server/deploy/gitlab/gitlab-offsite-backup-verify.sh"),
      "--backup-dir",
      offsite,
      "--age-identity-file",
      identity,
      "--report",
      report,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        FAKE_OFFSITE: offsite,
        FAKE_BACKUP: backup,
        FAKE_IDENTITY: identity,
        FAKE_UID: String(process.getuid()),
        FAKE_REPOSITORY_SIZE: String(statSync(repository).size),
        FAKE_CONFIG_SIZE: String(statSync(config).size),
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /boundary=encrypted-copy-and-archive-integrity/u);
  assert.deepEqual(JSON.parse(readFileSync(report, "utf8")), {
    schemaVersion: "plush.gitlab-offsite-verify/v1",
    status: "passed",
    generatedAt: "2026-09-25T12:00:00Z",
    backupId: `gitlab-${stamp}`,
    backupAgeSeconds: 3600,
    repositorySha256: repositoryHash,
    configSha256: configHash,
    boundary: "encrypted-copy-and-archive-integrity",
  });
});

test("systemd routes backup failures to the bounded notifier", () => {
  const service = readFileSync(
    path.join(ROOT, "server/deploy/gitlab/systemd/plush-gitlab-backup.service"),
    "utf8",
  );
  const timer = readFileSync(
    path.join(ROOT, "server/deploy/gitlab/systemd/plush-gitlab-backup.timer"),
    "utf8",
  );
  const dropIn = readFileSync(
    path.join(
      ROOT,
      "server/deploy/gitlab/systemd/plush-gitlab-backup.service.d/20-alert.conf",
    ),
    "utf8",
  );
  const unit = readFileSync(
    path.join(
      ROOT,
      "server/deploy/gitlab/systemd/plush-gitlab-backup-failure@.service",
    ),
    "utf8",
  );
  assert.match(dropIn, /OnFailure=plush-gitlab-backup-failure@%n[.]service/u);
  assert.match(unit, /gitlab-backup-failure-notify[.]sh --unit %i/u);
  assert.match(unit, /ProtectSystem=strict/u);
  assert.match(unit, /After=network-online[.]target/u);
  assert.match(unit, /RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6/u);
  assert.match(service, /BACKUP_GITLAB:r740xd:gitlab[.]saurick[.]me/u);
  assert.match(
    service,
    /ReadWritePaths=\/srv\/raid5\/gitlab\/backups \/mnt\/plush-gitlab-offsite\/gitlab/u,
  );
  assert.match(service, /gitlab-backup-health[.]sh --env-file/u);
  assert.match(timer, /OnCalendar=[*]-[*]-[*] 03:30:00/u);
  assert.match(timer, /Persistent=true/u);
});
