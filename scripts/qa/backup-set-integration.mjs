#!/usr/bin/env node
// All data, containers, networks, image and credentials belong to this disposable drill.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  command,
  inspect,
  privateDirectory,
  removeContainers,
  STORE_IMAGE,
  waitFor,
} from "../deploy/backup-set/common.mjs";
import { createSet } from "../deploy/backup-set/create.mjs";
import { restoreSet } from "../deploy/backup-set/restore.mjs";
import {
  packSet,
  publishCipher,
  unpackSet,
} from "../deploy/backup-set/archive.mjs";
import { hashFile } from "../deploy/backup-set/common.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const id = `plush-backup-drill-${randomUUID().slice(0, 8)}`;
const work = privateDirectory(path.join(root, "output/qa", id));
const composeFile = path.join(work, "compose.json"),
  envFile = path.join(work, "runtime.env");
const compose = [
  "docker",
  "compose",
  "-p",
  id,
  "--env-file",
  envFile,
  "-f",
  composeFile,
];
const password = () => randomBytes(24).toString("hex");
const superPassword = password(),
  appPassword = password(),
  migratorPassword = password(),
  backupPassword = password();
const access = password(),
  secret = password();
const write = (name, text) =>
  fs.writeFileSync(path.join(work, name), text, { mode: 0o600 });
const sourceImage = `${id}:fixture`,
  sha = "a".repeat(40),
  database = "plush_set_drill";
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());
let keepTarget;
const sourceVolumes = new Set();
try {
  write("runtime.env", "# synthetic disposable fixture\n");
  write(
    "pg.env",
    `POSTGRES_PASSWORD=${superPassword}\nPOSTGRES_USER=postgres\nPOSTGRES_DB=${database}\nPOSTGRES_APP_PASSWORD=${appPassword}\nPOSTGRES_MIGRATOR_PASSWORD=${migratorPassword}\nPOSTGRES_BACKUP_PASSWORD=${backupPassword}\n`,
  );
  const architecture = await command([
    "docker",
    "info",
    "--format",
    "{{.Architecture}}",
  ]);
  const arch =
    architecture === "aarch64" || architecture === "arm64" ? "arm64" : "amd64";
  await command(
    [
      "env",
      "CGO_ENABLED=0",
      "GOOS=linux",
      `GOARCH=${arch}`,
      "go",
      "build",
      "-C",
      path.join(root, "server"),
      "-o",
      path.join(work, "attachment-storage"),
      "./cmd/attachment-storage",
    ],
    { timeout: 180_000 },
  );
  write(
    "Dockerfile",
    `FROM postgres:18.6\nCOPY attachment-storage /app/attachment-storage\nENV GIT_SHA=${sha}\nUSER 10001\n`,
  );
  await command(["docker", "build", "-t", sourceImage, work], {
    timeout: 180_000,
  });
  const roles = path.join(root, "server/deploy/compose/prod/database_roles.sh");
  write(
    "compose.json",
    JSON.stringify({
      networks: { default: {}, attachments: { internal: true } },
      services: {
        postgres: {
          image: "postgres:18.6",
          env_file: [path.join(work, "pg.env")],
          ports: ["127.0.0.1::5432"],
          volumes: [
            `${roles}:/docker-entrypoint-initdb.d/20-database-roles.sh:ro`,
          ],
        },
        "attachment-store": {
          image: STORE_IMAGE,
          networks: ["attachments"],
          environment: {
            AWS_ACCESS_KEY_ID: access,
            AWS_SECRET_ACCESS_KEY: secret,
            S3_BUCKET: "plush-backup-drill",
          },
          command: [
            "mini",
            "-dir=/data",
            "-admin.ui=false",
            "-webdav=false",
            "-s3.iam=false",
            "-s3.port.iceberg=0",
            "-s3.port.lance=0",
          ],
          volumes: [`${work}:/fixture:ro`, "/data"],
        },
        "app-server": {
          image: sourceImage,
          init: true,
          networks: ["default", "attachments"],
          command: ["sleep", "infinity"],
          environment: {
            ERP_CUSTOMER_KEY: "backup-fixture",
            POSTGRES_DSN: `postgres://erp_app:${appPassword}@postgres:5432/${database}?sslmode=disable`,
            ATTACHMENT_S3_ENDPOINT: "http://attachment-store:8333",
            ATTACHMENT_S3_REGION: "us-east-1",
            ATTACHMENT_S3_BUCKET: "plush-backup-drill",
            ATTACHMENT_S3_ACCESS_KEY_ID: access,
            ATTACHMENT_S3_SECRET_ACCESS_KEY: secret,
          },
        },
      },
    }),
  );
  await command([...compose, "up", "-d"], { timeout: 180_000 });
  console.error("[backup-set-drill] source containers created");
  const pg = await command([...compose, "ps", "-q", "postgres"]),
    s3 = await command([...compose, "ps", "-q", "attachment-store"]),
    app = await command([...compose, "ps", "-q", "app-server"]);
  for (const container of [pg, s3, app]) {
    for (const mount of (await inspect(container)).Mounts) {
      if (mount.Type === "volume") sourceVolumes.add(mount.Name);
    }
  }
  await waitFor(async () => {
    try {
      await command([
        "docker",
        "exec",
        pg,
        "sh",
        "-ceu",
        'test "$(cat /proc/1/comm)" = postgres && pg_isready -U postgres -q',
      ]);
      return true;
    } catch {
      return false;
    }
  });
  const port = (await command(["docker", "port", pg, "5432/tcp"]))
    .split(":")
    .at(-1);
  await command(
    [
      "atlas",
      "migrate",
      "apply",
      "--dir",
      `file://${path.join(root, "server/internal/data/model/migrate")}`,
      "--url",
      `postgres://postgres:${superPassword}@127.0.0.1:${port}/${database}?sslmode=disable`,
      "--tx-mode",
      "all",
    ],
    { timeout: 180_000 },
  );
  console.error("[backup-set-drill] current migrations applied");
  const sql = (text) =>
    command(
      [
        "docker",
        "exec",
        "-i",
        pg,
        "psql",
        "-U",
        "postgres",
        "-d",
        database,
        "-X",
        "-A",
        "-t",
        "-v",
        "ON_ERROR_STOP=1",
        "-f",
        "-",
      ],
      { input: text },
    );
  write(
    "s3.curl",
    `aws-sigv4 = "aws:amz:us-east-1:s3"\nuser = "${access}:${secret}"\nfail\nsilent\nshow-error\nconnect-timeout = 2\nmax-time = 5\n`,
  );
  await waitFor(async () => {
    try {
      await command([
        "docker",
        "exec",
        s3,
        "curl",
        "--config",
        "/fixture/s3.curl",
        "--head",
        "http://127.0.0.1:8333/plush-backup-drill",
      ]);
      return true;
    } catch {
      return false;
    }
  });
  for (let n = 1; n <= 2; n++) {
    const content = Buffer.concat([
      Buffer.from(`synthetic attachment ${n}\n`),
      Buffer.from([0, 255, 12, n]),
    ]);
    const hash = createHash("sha256").update(content).digest("hex"),
      key = `attachments/${String(n).repeat(32)}`;
    fs.writeFileSync(path.join(work, `object-${n}`), content, { mode: 0o600 });
    await command([
      "docker",
      "exec",
      s3,
      "curl",
      "--config",
      "/fixture/s3.curl",
      "--upload-file",
      `/fixture/object-${n}`,
      `http://127.0.0.1:8333/plush-backup-drill/${key}`,
    ]);
    await sql(
      `INSERT INTO business_attachments (owner_type,owner_id,attachment_type,file_name,mime_type,file_size,sha256,object_key,created_at) VALUES ('workflow_task',1,'evidence','synthetic-${n}.bin','application/octet-stream',${content.length},'${hash}','${key}',now());`,
    );
  }
  await sql(
    "UPDATE business_attachments SET withdrawn_at=now(),withdrawn_by=1,withdrawal_reason='synthetic withdrawal' WHERE id=2; INSERT INTO customer_config_revisions (customer_key,revision,product_version,config_hash,status,compiled_snapshot,created_at,updated_at) VALUES ('backup-fixture','backup-fixture-config.test','fixture','synthetic','active','{}',now(),now());",
  );
  await command([
    "docker",
    "exec",
    pg,
    "bash",
    "/docker-entrypoint-initdb.d/20-database-roles.sh",
    "reconcile",
  ]);
  await sql("ALTER DATABASE plush_set_drill SET timezone TO 'Asia/Shanghai';");
  fs.symlinkSync(".", path.join(work, "current"));
  await command(["age-keygen", "-o", path.join(work, "identity.txt")]);
  write(
    "recipient.txt",
    (await command(["age-keygen", "-y", path.join(work, "identity.txt")])) +
      "\n",
  );
  const options = {
    composeFile: path.join(work, "current/compose.json"),
    envFile,
    project: id,
    database,
    backupDir: path.join(work, "backups"),
    recipientFile: path.join(work, "recipient.txt"),
    allowLocalOnly: true,
    confirm: `BACKUP_SET:${id}:${database}`,
  };
  const backup = await createSet(options, { signal: controller.signal });
  console.error(
    "[backup-set-drill] paired encrypted backup created; source resumed",
  );
  assert.equal(backup.attachmentCount, 2);
  assert.equal((await inspect(app)).State.Running, true);
  const file = path.join(options.backupDir, `${backup.backupId}.tar.age`);
  const restoreOptions = {
    file,
    identityFile: path.join(work, "identity.txt"),
    workDir: path.join(work, "restore"),
    report: path.join(work, "restore-report.json"),
  };
  const result = await restoreSet(restoreOptions, {
    signal: controller.signal,
  });
  console.error(
    "[backup-set-drill] PostgreSQL and object restore verified and removed",
  );
  assert.equal(result.attachmentCount, 2);
  assert.equal(result.restoreTarget, "temporary-postgres-and-s3-removed");
  assert.equal(fs.readdirSync(restoreOptions.workDir).length, 0);
  // A valid encrypted envelope with wrong object keys must fail against the paired PG.
  await command([
    "age",
    "--decrypt",
    "--identity",
    path.join(work, "identity.txt"),
    "--output",
    path.join(work, "mismatch.tar"),
    file,
  ]);
  const mismatch = path.join(work, "mismatch-set");
  const altered = await unpackSet(path.join(work, "mismatch.tar"), mismatch);
  const objectsPath = path.join(mismatch, "objects/manifest.json");
  const objects = JSON.parse(fs.readFileSync(objectsPath));
  const oldName = path.basename(objects.files[0].key),
    newName = "3".repeat(32);
  objects.files[0].key = `attachments/${newName}`;
  fs.renameSync(
    path.join(mismatch, "objects", oldName),
    path.join(mismatch, "objects", newName),
  );
  fs.writeFileSync(objectsPath, JSON.stringify(objects));
  altered.files.find((f) => f.path === `objects/${oldName}`).path =
    `objects/${newName}`;
  Object.assign(
    altered.files.find((f) => f.path === "objects/manifest.json"),
    { size: fs.statSync(objectsPath).size, sha256: hashFile(objectsPath) },
  );
  fs.writeFileSync(
    path.join(mismatch, "manifest.json"),
    JSON.stringify(altered),
  );
  await packSet(mismatch, path.join(work, "wrong-pair.tar"));
  const invalidDir = privateDirectory(path.join(work, "invalid"));
  const invalidCipher = path.join(work, `${backup.backupId}.tar.age`);
  await command([
    "age",
    "--recipient",
    fs.readFileSync(options.recipientFile, "utf8").trim(),
    "--output",
    invalidCipher,
    path.join(work, "wrong-pair.tar"),
  ]);
  const invalidFile = publishCipher(invalidCipher, invalidDir);
  await assert.rejects(restoreSet({ ...restoreOptions, file: invalidFile }));
  assert.equal(
    JSON.parse(fs.readFileSync(restoreOptions.report)).status,
    "failed",
  );
  assert.equal(fs.readdirSync(restoreOptions.workDir).length, 0);
  const cancelled = new AbortController();
  await assert.rejects(
    createSet(options, {
      signal: cancelled.signal,
      run: async (args, commandOptions) => {
        if (args.some((value) => value.includes("exec pg_dump"))) {
          cancelled.abort();
          throw Error("interrupted");
        }
        return command(args, commandOptions);
      },
    }),
  );
  assert.equal((await inspect(app)).State.Running, true);
  // A real failed S3 read must resume the original app and preserve the last good set.
  await command([
    "docker",
    "exec",
    s3,
    "curl",
    "--config",
    "/fixture/s3.curl",
    "--request",
    "DELETE",
    "http://127.0.0.1:8333/plush-backup-drill/attachments/" + "1".repeat(32),
  ]);
  await assert.rejects(createSet(options, { signal: controller.signal }));
  assert.equal((await inspect(app)).State.Running, true);
  assert.equal(
    JSON.parse(
      fs.readFileSync(path.join(options.backupDir, "latest-set-status.json")),
    ).status,
    "failed",
  );
  assert.equal(
    fs.readdirSync(options.backupDir).filter((f) => f.endsWith(".tar.age"))
      .length,
    1,
  );
  // Actual recovery can retain only newly created isolated resources for handoff.
  keepTarget = await restoreSet(
    { ...restoreOptions, keep: true },
    { signal: controller.signal },
  );
  console.error("[backup-set-drill] retained isolated recovery verified");
  assert.equal(keepTarget.restoreTarget, "new-isolated-resources-retained");
  console.log(
    JSON.stringify({
      status: "passed",
      environment: "local-disposable-postgres-and-seaweedfs",
      attachmentCount: result.attachmentCount,
      attachmentBytes: result.attachmentBytes,
      publicTableCount: result.publicTableCount,
      migrationVersion: result.migrationVersion,
      withdrewAuditPreserved: true,
      applicationResumedAfterFailure: true,
      encryptedSetRoundTrip: true,
      retainedRecoveryChecked: true,
      mismatchedPairRejected: true,
      applicationResumedAfterInterruption: true,
    }),
  );
} finally {
  if (keepTarget?.retainedResources) {
    const r = keepTarget.retainedResources;
    await removeContainers([r.objectStore, r.postgres]);
    await command(["docker", "network", "rm", r.network]);
  }
  await command([...compose, "down", "--volumes", "--remove-orphans"]);
  const remainingVolumes = new Set(
    (await command(["docker", "volume", "ls", "--quiet"])).split("\n"),
  );
  assert.equal(
    [...sourceVolumes].some((v) => remainingVolumes.has(v)),
    false,
  );
  await command(["docker", "image", "rm", sourceImage]);
  assert.equal(
    await command([
      "docker",
      "ps",
      "-aq",
      "--filter",
      `label=com.docker.compose.project=${id}`,
    ]),
    "",
  );
  fs.rmSync(work, { recursive: true, force: true });
}
