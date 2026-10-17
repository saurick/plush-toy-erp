import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { command } from "./process.mjs";
import { privateFile, requireValue } from "./config.mjs";
import {
  atomicBytes,
  atomicJSON,
  digest,
  now,
  privateDirectory,
} from "./storage.mjs";
import { backupTime, readIndex, verifiedFile } from "./sync.mjs";
import { databaseFile } from "./transport.mjs";

export async function verifyRestore(
  c,
  root,
  state,
  { signal, run = command } = {},
) {
  privateFile(c.restore.identityFile);
  const records = readIndex(root, c.source.id);
  const names = Object.keys(records)
    .filter((name) => databaseFile.test(name))
    .sort((a, b) => backupTime(b) - backupTime(a));
  requireValue(names.length, "replica_has_no_database_backup");
  const name = names[0],
    age = Date.now() - backupTime(name);
  requireValue(
    age >= 0 && age <= c.maxSourceAgeHours * 3600_000,
    "replica_backup_stale",
  );
  const encrypted = await verifiedFile(root, records[name], signal),
    image = c.restore.postgresImage;
  const imageId = (
    await run(["docker", "image", "inspect", image, "--format", "{{.Id}}"], {
      signal,
    })
  )
    .toString()
    .trim();
  const temporary = fs.mkdtempSync(
    path.join(privateDirectory(path.join(state, "restore-tmp")), "verify-"),
  );
  const container = "plush-replica-restore-" + randomBytes(8).toString("hex");
  const began = Date.now();
  const deadline = began + c.restore.timeoutSeconds * 1000;
  const duringRestore = (args, options = {}) => {
    const remaining = deadline - Date.now();
    requireValue(remaining > 0, "restore_timeout");
    return run(args, {
      ...options,
      timeout: Math.min(options.timeout ?? Infinity, remaining),
    });
  };
  let volumes = [];
  let result;
  try {
    const decrypted = path.join(temporary, "database.dump");
    await duringRestore(
      [
        "age",
        "--decrypt",
        "--identity",
        c.restore.identityFile,
        "--output",
        decrypted,
        encrypted,
      ],
      { signal },
    );
    fs.chmodSync(decrypted, 0o600);
    requireValue(fs.statSync(decrypted).size > 0, "empty_decrypted_backup");
    const environment = path.join(temporary, "postgres.env");
    atomicBytes(
      environment,
      `POSTGRES_PASSWORD=${randomBytes(24).toString("base64url")}\nPOSTGRES_DB=plush_replica_restore\n`,
    );
    await duringRestore(
      [
        "docker",
        "run",
        "--detach",
        "--rm",
        "--pull",
        "never",
        "--name",
        container,
        "--network",
        "none",
        "--memory",
        "1g",
        "--cpus",
        "1",
        "--pids-limit",
        "256",
        "--label",
        `plush.backup-replica-source=${c.source.id}`,
        "--env-file",
        environment,
        "--volume",
        `${decrypted}:/backup/database.dump:ro`,
        image,
      ],
      { signal },
    );
    volumes = JSON.parse(
      (
        await duringRestore(
          ["docker", "inspect", "--format", "{{json .Mounts}}", container],
          { signal },
        )
      ).toString(),
    )
      .filter((x) => x.Type === "volume")
      .map((x) => x.Name);
    requireValue(
      volumes.every((name) => /^[a-f0-9]{64}$/u.test(name)),
      "unexpected_restore_volume",
    );
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        await duringRestore(
          [
            "docker",
            "exec",
            container,
            "sh",
            "-ceu",
            'test "$(cat /proc/1/comm)" = postgres && exec pg_isready -U postgres -d plush_replica_restore',
          ],
          { signal, timeout: 5000 },
        );
        ready = true;
        break;
      } catch (error) {
        if (signal?.aborted) throw error;
      }
      await pause(500, undefined, { signal });
    }
    requireValue(ready, "restore_postgres_not_ready");
    await duringRestore(
      [
        "docker",
        "exec",
        container,
        "pg_restore",
        "--username",
        "postgres",
        "--dbname",
        "plush_replica_restore",
        "--no-owner",
        "--no-acl",
        "--exit-on-error",
        "/backup/database.dump",
      ],
      { signal },
    );
    const query =
      "SELECT json_build_object('publicTableCount',(SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'),'migrationCount',(SELECT count(*) FROM atlas_schema_revisions.atlas_schema_revisions WHERE type=2),'migrationVersion',(SELECT max(version) FROM atlas_schema_revisions.atlas_schema_revisions WHERE type=2))::text";
    const readback = JSON.parse(
      (
        await duringRestore(
          [
            "docker",
            "exec",
            container,
            "psql",
            "-XAtq",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "postgres",
            "-d",
            "plush_replica_restore",
            "-c",
            query,
          ],
          { signal },
        )
      ).toString(),
    );
    requireValue(
      readback.publicTableCount > 0 &&
        readback.migrationCount > 0 &&
        /^[0-9]{14}$/u.test(readback.migrationVersion),
      "restored_database_empty_or_unknown",
    );
    result = {
      schemaVersion: "plush.backup-replica-restore/v1",
      status: "passed",
      checkedAt: now(),
      sourceId: c.source.id,
      destinationId: c.destination.id,
      volumeUUID: c.destination.volumeUUID,
      backupFile: name,
      encryptedSha256: await digest(encrypted, signal),
      decryptedSha256: await digest(decrypted, signal),
      decryptedSizeBytes: fs.statSync(decrypted).size,
      postgresImage: image,
      postgresImageId: imageId,
      ...readback,
      restoreDurationSeconds: (Date.now() - began) / 1000,
      scope:
        "PostgreSQL; attachment objects require their paired restore procedure",
      productionDatabaseWrites: false,
    };
  } finally {
    try {
      const remaining = await run([
        "docker",
        "ps",
        "-aq",
        "--filter",
        `name=^/${container}$`,
      ]);
      if (remaining.toString().trim())
        await run(["docker", "rm", "--force", "--volumes", container]);
      requireValue(
        !(
          await run(["docker", "ps", "-aq", "--filter", `name=^/${container}$`])
        )
          .toString()
          .trim(),
        "restore_container_cleanup_failed",
      );
      const remainingVolumes = (
        await run(["docker", "volume", "ls", "--quiet"])
      )
        .toString()
        .trim()
        .split("\n");
      requireValue(
        volumes.every((name) => !remainingVolumes.includes(name)),
        "restore_volume_cleanup_failed",
      );
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }
  result.cleanup =
    "temporary-container-anonymous-volumes-and-plaintext-removed";
  atomicJSON(path.join(state, "latest-restore.json"), result);
  return result;
}
