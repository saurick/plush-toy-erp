import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import {
  atomicJSON,
  command,
  hashFile,
  inspect,
  now,
  plainPath,
  POSTGRES_IMAGE,
  privateDirectory,
  removeContainers,
  requireValue,
  STORE_IMAGE,
  waitFor,
} from "./common.mjs";
import { latestSet, unpackSet, verifyCipher } from "./archive.mjs";
import { CONFIG_SQL, MIGRATION_SQL, ROWS_SQL } from "./source.mjs";
import { verifyRestoredBusiness } from "./business-smoke.mjs";

export async function restoreSet(options, { run = command, signal } = {}) {
  if (options.businessSmoke)
    requireValue(
      Boolean(
        options.businessCredentials?.username &&
        options.businessCredentials?.password,
      ),
      "restore_business_credentials_missing",
    );
  plainPath(options.identityFile, { privateOwner: true });
  privateDirectory(options.workDir);
  privateDirectory(path.dirname(options.report));
  const startedAt = now();
  atomicJSON(options.report, {
    schemaVersion: "plush.backup-set-restore/v1",
    status: "running",
    startedAt,
  });
  const ageHours = Number(options.maxAgeHours ?? 36);
  const id = `plush-set-restore-${randomUUID()}`;
  const work = path.join(options.workDir, id);
  const pg = `${id}-pg`,
    s3 = `${id}-s3`,
    tool = `${id}-tool`;
  const app = `${id}-app`;
  const names = [app, tool, s3, pg];
  let network = false,
    passed = false,
    cleanupDone = false;
  fs.mkdirSync(work, { mode: 0o700 });
  const cleanup = async () => {
    await removeContainers(names, run);
    if (network) {
      if (
        await run(["docker", "network", "ls", "-q", "--filter", `name=^${id}$`])
      )
        await run(["docker", "network", "rm", id]);
      requireValue(
        !(await run([
          "docker",
          "network",
          "ls",
          "-q",
          "--filter",
          `name=^${id}$`,
        ])),
        "network_cleanup_failed",
      );
      network = false;
    }
    fs.rmSync(work, { recursive: true, force: true });
    cleanupDone = true;
  };
  try {
    requireValue(
      Number.isInteger(ageHours) && ageHours >= 1 && ageHours <= 168,
      "invalid_max_age_hours",
    );
    const file = options.file
      ? plainPath(options.file)
      : latestSet(options.offsiteDir, ageHours);
    const encryptedSha256 = verifyCipher(file);
    await run(
      [
        "age",
        "--decrypt",
        "--identity",
        options.identityFile,
        "--output",
        path.join(work, "set.tar"),
        file,
      ],
      { signal, timeout: 900_000 },
    );
    const directory = path.join(work, "set");
    const manifest = await unpackSet(
      path.join(work, "set.tar"),
      directory,
      run,
    );
    // Keep the source database name inside a new, disconnected cluster so
    // published runtime identity guards remain valid during business checks.
    const database = manifest.database;
    const backupAgeSeconds = Math.floor(
      (Date.now() - Date.parse(manifest.snapshotAt)) / 1000,
    );
    if (!options.file)
      requireValue(
        backupAgeSeconds >= 0 && backupAgeSeconds <= ageHours * 3600,
        "backup_set_snapshot_stale",
      );
    requireValue(
      `${manifest.backupId}.tar.age` === path.basename(file),
      "backup_id_mismatch",
    );
    const appImage = `sha256:${manifest.appImageId}`;
    for (const image of [POSTGRES_IMAGE, STORE_IMAGE, appImage])
      await run(["docker", "image", "inspect", image], { signal });
    const image = JSON.parse(
      await run(["docker", "image", "inspect", appImage], { signal }),
    )[0];
    requireValue(
      image.Config.Env.includes(`GIT_SHA=${manifest.releaseSha}`),
      "restore_image_release_mismatch",
    );
    const password = randomBytes(24).toString("hex"),
      access = randomBytes(16).toString("hex"),
      secret = randomBytes(32).toString("hex");
    const write = (name, content) =>
      fs.writeFileSync(path.join(work, name), content + "\n", {
        flag: "wx",
        mode: 0o600,
      });
    write("pg.env", `POSTGRES_PASSWORD=${password}\nPOSTGRES_DB=${database}`);
    write(
      "s3.env",
      `AWS_ACCESS_KEY_ID=${access}\nAWS_SECRET_ACCESS_KEY=${secret}\nS3_BUCKET=plush-set-restore`,
    );
    write(
      "tool.env",
      `POSTGRES_DSN=postgres://postgres:${password}@${pg}:5432/${database}?sslmode=disable\nATTACHMENT_S3_ENDPOINT=http://${s3}:8333\nATTACHMENT_S3_BUCKET=plush-set-restore\nATTACHMENT_S3_REGION=us-east-1\nATTACHMENT_S3_ACCESS_KEY_ID=${access}\nATTACHMENT_S3_SECRET_ACCESS_KEY=${secret}`,
    );
    network = true;
    await run(
      [
        "docker",
        "network",
        "create",
        "--internal",
        "--label",
        `plush.backup-set=${id}`,
        id,
      ],
      { signal },
    );
    const limits = [
      "--cpus",
      "1",
      "--pids-limit",
      "256",
      "--network",
      id,
      "--label",
      `plush.backup-set=${id}`,
    ];
    await run(
      [
        "docker",
        "run",
        "-d",
        "--name",
        pg,
        ...limits,
        "--network-alias",
        "postgres",
        "--memory",
        "1g",
        "--env-file",
        path.join(work, "pg.env"),
        "--mount",
        `type=bind,source=${directory},target=/backup,readonly`,
        POSTGRES_IMAGE,
      ],
      { signal },
    );
    await run(
      [
        "docker",
        "run",
        "-d",
        "--name",
        s3,
        ...limits,
        "--memory",
        "768m",
        "--env-file",
        path.join(work, "s3.env"),
        "--mount",
        "type=volume,target=/data",
        STORE_IMAGE,
        "mini",
        "-dir=/data",
        "-admin.ui=false",
        "-webdav=false",
        "-s3.iam=false",
        "-s3.port.iceberg=0",
        "-s3.port.lance=0",
      ],
      { signal },
    );
    const ready = async (args) => {
      try {
        await run(args, { signal, timeout: 5000 });
        return true;
      } catch {
        return false;
      }
    };
    await waitFor(
      () =>
        ready([
          "docker",
          "exec",
          pg,
          "sh",
          "-ceu",
          'test "$(cat /proc/1/comm)" = postgres && exec pg_isready -U postgres -d "$POSTGRES_DB" -q',
        ]),
      { signal },
    );
    await waitFor(
      () =>
        ready([
          "docker",
          "exec",
          s3,
          "curl",
          "-fsS",
          "--max-time",
          "2",
          "http://127.0.0.1:9333/cluster/healthz",
        ]),
      { signal },
    );
    const toolRun = (args) =>
      run(
        [
          "docker",
          "run",
          "--rm",
          "--name",
          tool,
          "--user",
          `${process.getuid()}:${process.getgid()}`,
          "--read-only",
          "--cap-drop",
          "ALL",
          "--security-opt",
          "no-new-privileges",
          ...limits,
          "--memory",
          "512m",
          "--env-file",
          path.join(work, "tool.env"),
          "--mount",
          `type=bind,source=${directory},target=/backup,readonly`,
          "--entrypoint",
          "/app/attachment-storage",
          appImage,
          "-database",
          database,
          ...args,
        ],
        { signal, timeout: 900_000 },
      );
    await run(
      [
        "docker",
        "exec",
        pg,
        "pg_restore",
        "-U",
        "postgres",
        "-d",
        database,
        "--no-owner",
        "--no-acl",
        "--exit-on-error",
        "/backup/database.dump",
      ],
      { signal, timeout: 900_000 },
    );
    // Authenticated bucket readiness is separate from SeaweedFS cluster readiness.
    await waitFor(
      () =>
        ready([
          "docker",
          "run",
          "--rm",
          "--name",
          tool,
          "--network",
          id,
          "--env-file",
          path.join(work, "tool.env"),
          "--entrypoint",
          "/app/attachment-storage",
          appImage,
          "-database",
          database,
          "-mode",
          "check",
        ]),
      { signal },
    );
    const scalar = (sql) =>
      run(
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
          "-q",
          "-v",
          "ON_ERROR_STOP=1",
          "-f",
          "-",
        ],
        { input: "SET timezone TO 'UTC';\n" + sql + ";\n", signal },
      );
    requireValue(
      (await scalar(MIGRATION_SQL)) === manifest.migrationVersion,
      "restored_migration_mismatch",
    );
    requireValue(
      (await scalar(ROWS_SQL)) === manifest.attachmentRowsSha256 &&
        JSON.stringify(JSON.parse(await scalar(CONFIG_SQL))) ===
          JSON.stringify(manifest.activeCustomerConfig),
      "restored_database_metadata_mismatch",
    );
    const count = Number(
      await scalar(
        "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
      ),
    );
    requireValue(count > 0, "restored_database_empty");
    const restored = JSON.parse(
      await toolRun([
        "-mode",
        "restore",
        "-dir",
        "/backup/objects",
        "-execute",
        "-confirm",
        `ATTACHMENT_RESTORE:${database}`,
      ]),
    );
    const verified = JSON.parse(await toolRun(["-mode", "verify"]));
    requireValue(
      restored.count === manifest.attachmentCount &&
        verified.count === manifest.attachmentCount &&
        verified.bytes === manifest.attachmentBytes,
      "restored_object_totals_mismatch",
    );
    requireValue(
      (await scalar(ROWS_SQL)) === manifest.attachmentRowsSha256,
      "restore_changed_attachment_audit",
    );
    // Immutable manifest and dump bind the audit, IDs, keys and withdrawn attachments.
    requireValue(
      hashFile(path.join(directory, "database.dump")) ===
        manifest.files.find((f) => f.path === "database.dump").sha256,
      "dump_changed_during_restore",
    );
    const businessSmoke = options.businessSmoke
      ? await verifyRestoredBusiness({
          manifest,
          work,
          appImage,
          app,
          pg,
          s3,
          network: id,
          access,
          secret,
          credentials: options.businessCredentials,
          scalar,
          run,
          signal,
        })
      : "not-run";
    if (!options.keep) await cleanup();
    const result = {
      schemaVersion: "plush.backup-set-restore/v1",
      status: "passed",
      backupId: manifest.backupId,
      releaseSha: manifest.releaseSha,
      project: manifest.project,
      sourceKind: options.file ? "explicit-backup-set" : "offsite-backup-set",
      encryptedSha256,
      backupAgeSeconds,
      maxBackupAgeSeconds: ageHours * 3600,
      migrationVersion: manifest.migrationVersion,
      attachmentCount: manifest.attachmentCount,
      attachmentBytes: manifest.attachmentBytes,
      attachmentRowsSha256: manifest.attachmentRowsSha256,
      publicTableCount: count,
      startedAt,
      checkedAt: now(),
      durationSeconds: Math.ceil((Date.now() - Date.parse(startedAt)) / 1000),
      restoreTarget: options.keep
        ? "new-isolated-resources-retained"
        : "temporary-postgres-and-s3-removed",
      businessSmoke,
    };
    if (options.keep)
      result.retainedResources = {
        network: id,
        postgres: pg,
        objectStore: s3,
        privateDirectory: work,
      };
    atomicJSON(options.report, result);
    passed = true;
    return result;
  } finally {
    if (!passed && !cleanupDone) {
      try {
        await cleanup();
      } finally {
        atomicJSON(options.report, {
          schemaVersion: "plush.backup-set-restore/v1",
          status: "failed",
          startedAt,
          checkedAt: now(),
          cleanupCompleted: cleanupDone,
        });
      }
    }
  }
}
