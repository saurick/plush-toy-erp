import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  command,
  inspect,
  plainPath,
  requireValue,
  removeContainers,
  waitFor,
} from "./common.mjs";

const ROLE_SQL = fs.readFileSync(
  new URL("../postgres-backup-role.sql", import.meta.url),
  "utf8",
);
export const MIGRATION_SQL =
  "SELECT version FROM atlas_schema_revisions.atlas_schema_revisions WHERE type = 2 ORDER BY executed_at DESC LIMIT 1";
export const ROWS_SQL =
  "SELECT encode(sha256(convert_to(COALESCE(string_agg(encode(sha256(convert_to(row_to_json(b)::text,'UTF8')),'hex'),'' ORDER BY id),''),'UTF8')),'hex') FROM business_attachments b";
export const CONFIG_SQL =
  "SELECT COALESCE(json_agg(row_to_json(c) ORDER BY customer_key, revision)::text,'[]') FROM (SELECT customer_key,revision,product_version,config_hash FROM customer_config_revisions WHERE status='active') c";

export function assertBackupRole(identity) {
  const fields = identity.trim().split("|");
  requireValue(
    fields.length === 11 &&
      fields[0] === "erp_backup" &&
      /^18\.6(?:\s|$)/u.test(fields[1]) &&
      fields[2] === "180006" &&
      fields[3] === "on" &&
      fields.slice(4, 10).every((v) => v === "f") &&
      fields[10] === "0",
    "backup_role_not_readonly_or_wrong_postgres",
  );
}

export async function openSource(
  options,
  work,
  { run = command, signal } = {},
) {
  // Freeze the release alias once; current may be a legitimate release symlink.
  const composeFile = plainPath(fs.realpathSync(options.composeFile));
  plainPath(options.envFile, { privateOwner: true });
  requireValue(
    /^[a-z][a-z0-9_-]{1,62}$/u.test(options.project) &&
      /^[a-z][a-z0-9_]{1,62}$/u.test(options.database),
    "invalid_source_identity",
  );
  requireValue(
    options.confirm === `BACKUP_SET:${options.project}:${options.database}`,
    "exact_backup_confirmation_required",
  );
  const compose = [
    "docker",
    "compose",
    "--project-name",
    options.project,
    "--env-file",
    options.envFile,
    "-f",
    composeFile,
  ];
  const all = (
    await run(
      [
        "docker",
        "ps",
        "-aq",
        "--filter",
        `label=com.docker.compose.project=${options.project}`,
      ],
      { signal },
    )
  )
    .split("\n")
    .filter(Boolean);
  const containers = await Promise.all(all.map((id) => inspect(id, run)));
  const byService = (service) =>
    containers.filter(
      (c) => c.Config.Labels?.["com.docker.compose.service"] === service,
    );
  requireValue(
    byService("app-server").length === 1 && byService("postgres").length === 1,
    "single_source_app_and_postgres_required",
  );
  const app = byService("app-server")[0],
    pg = byService("postgres")[0];
  requireValue(
    app.State.Running && pg.State.Running,
    "source_services_must_be_running",
  );
  const env = Object.fromEntries(
    app.Config.Env.map((v) => [
      v.slice(0, v.indexOf("=")),
      v.slice(v.indexOf("=") + 1),
    ]),
  );
  const pgEnv = Object.fromEntries(
    pg.Config.Env.map((v) => [
      v.slice(0, v.indexOf("=")),
      v.slice(v.indexOf("=") + 1),
    ]),
  );
  requireValue(
    pgEnv.POSTGRES_DB === options.database &&
      /^[a-f0-9]{40}$/u.test(env.GIT_SHA ?? "") &&
      /^[a-z][a-z0-9_-]{1,62}$/u.test(env.ERP_CUSTOMER_KEY ?? ""),
    "source_database_or_release_identity_mismatch",
  );
  const dsn = new URL(env.POSTGRES_DSN);
  requireValue(
    dsn.hostname === "postgres" &&
      decodeURIComponent(dsn.pathname.slice(1)) === options.database &&
      pgEnv.POSTGRES_BACKUP_PASSWORD,
    "source_dsn_mismatch",
  );
  dsn.username = "erp_backup";
  dsn.password = pgEnv.POSTGRES_BACKUP_PASSWORD;
  const toolEnv = ["POSTGRES_DSN=" + dsn.href];
  for (const key of [
    "ATTACHMENT_S3_ENDPOINT",
    "ATTACHMENT_S3_BUCKET",
    "ATTACHMENT_S3_REGION",
    "ATTACHMENT_S3_ACCESS_KEY_ID",
    "ATTACHMENT_S3_SECRET_ACCESS_KEY",
  ]) {
    requireValue(
      env[key] && !/[\r\n]/u.test(env[key]),
      "missing_attachment_configuration",
    );
    toolEnv.push(`${key}=${env[key]}`);
  }
  const envFile = path.join(work, "tool.env");
  fs.writeFileSync(envFile, toolEnv.join("\n") + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  const toolName = `${path.basename(work).replace(/^\./u, "")}-tool`;
  const networks = Object.keys(app.NetworkSettings.Networks);
  requireValue(networks.length > 0, "source_network_missing");
  const psql = (sql) =>
    run(
      [
        ...compose,
        "exec",
        "-T",
        "postgres",
        "sh",
        "-eu",
        "-c",
        'export PGPASSWORD="$POSTGRES_BACKUP_PASSWORD"; exec psql -h 127.0.0.1 -U erp_backup -d "$POSTGRES_DB" -X -A -t -q -F "|" -v ON_ERROR_STOP=1 -f -',
      ],
      { input: "SET timezone TO 'UTC';\n" + sql + ";\n", signal },
    );
  await run([...compose, "config", "--quiet"], { signal });
  assertBackupRole(await psql(ROLE_SQL));
  const tool = (args) =>
    run(
      [
        "docker",
        "run",
        "--rm",
        "--name",
        toolName,
        "--user",
        `${process.getuid()}:${process.getgid()}`,
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--memory",
        "512m",
        "--pids-limit",
        "128",
        ...networks.flatMap((n) => ["--network", n]),
        "--env-file",
        envFile,
        "--mount",
        `type=bind,source=${path.join(work, "set")},target=/backup`,
        "--entrypoint",
        "/app/attachment-storage",
        app.Image,
        ...args,
        "-database",
        options.database,
      ],
      { signal, timeout: 900_000 },
    );
  let stopped = false;
  return {
    identity: {
      project: options.project,
      database: options.database,
      customer: env.ERP_CUSTOMER_KEY,
      releaseSha: env.GIT_SHA,
      appImageId: app.Image.replace(/^sha256:/u, ""),
      runtimeEnvSha256: createHash("sha256")
        .update(fs.readFileSync(options.envFile))
        .digest("hex"),
    },
    psql,
    tool,
    async stop() {
      // Record intent first: a stop that times out may still have stopped the process.
      stopped = true;
      await run(["docker", "stop", "--time", "60", app.Id], {
        signal,
        timeout: 90_000,
      });
      requireValue(
        !(await inspect(app.Id, run)).State.Running,
        "source_app_not_stopped",
      );
      requireValue(
        (await psql(
          "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()",
        )) === "0",
        "other_database_clients_present",
      );
    },
    async dump(file) {
      await run(
        [
          ...compose,
          "exec",
          "-T",
          "postgres",
          "sh",
          "-eu",
          "-c",
          'export PGPASSWORD="$POSTGRES_BACKUP_PASSWORD"; exec pg_dump -h 127.0.0.1 -U erp_backup -d "$POSTGRES_DB" --format=custom --no-owner --no-acl',
        ],
        { outputFile: file, signal, timeout: 900_000 },
      );
      await run(
        [...compose, "exec", "-T", "postgres", "pg_restore", "--list"],
        { inputFile: file, signal },
      );
    },
    async resume() {
      try {
        await removeContainers([toolName], run);
      } finally {
        if (stopped) {
          await run(["docker", "start", app.Id]);
          await waitFor(async () => {
            const c = await inspect(app.Id, run);
            return (
              c.State.Running &&
              (!c.State.Health || c.State.Health.Status === "healthy")
            );
          });
          stopped = false;
        }
      }
    },
  };
}
