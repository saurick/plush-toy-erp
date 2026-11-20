#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { privateDirectory } from "./common.mjs";
import { createSet } from "./create.mjs";
import { restoreSet } from "./restore.mjs";

const HELP = `用法（只在执行主机操作，不使用 SSH）：
  node scripts/deploy/backup-set/cli.mjs create --project <compose-project>
    --database <database> --compose-file <absolute-compose> --env-file <private-env>
    --backup-dir <private-local> --offsite-dir <mounted-offsite>
    --recipient-file <age-recipient> --confirm BACKUP_SET:<project>:<database>
    [--retention-count 7]
  node scripts/deploy/backup-set/cli.mjs restore-check --offsite-dir <mounted-offsite>
    --identity-file <private-age-identity> --work-dir <private-local> --report <private-json>
    [--max-age-hours 36] [--business-smoke]
  node scripts/deploy/backup-set/cli.mjs restore --file <exact-set.tar.age>
    --identity-file <private-age-identity> --work-dir <private-local> --report <private-json>
    --keep

create 会短暂停止并恢复原 app-server；确认串同时确认独占停写窗口。
restore 只创建无宿主端口的隔离 PG/S3；--keep 保留新资源等待人工接管。
隔离开发可显式 --allow-local-only，仅本地加密，不产生异地备份证据。
restore-check 也可 --file 选择明确备份集，此时不产生异地来源证明。
恢复需要本机已有配套应用镜像、postgres:18.6 和固定 SeaweedFS 镜像。
不修改已有数据库或 bucket，不迁移，不切业务入口。
--business-smoke 在清理前启动同一备份绑定的应用镜像，验证登录、配置、业务与附件读取。
账号通过 RESTORE_SMOKE_USERNAME / RESTORE_SMOKE_PASSWORD 提供，不重设恢复库中的账号。
`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: Object.fromEntries(
      [
        "project",
        "database",
        "compose-file",
        "env-file",
        "backup-dir",
        "offsite-dir",
        "recipient-file",
        "confirm",
        "retention-count",
        "identity-file",
        "work-dir",
        "report",
        "file",
        "max-age-hours",
      ]
        .map((name) => [name, { type: "string" }])
        .concat([
          ["help", { type: "boolean" }],
          ["keep", { type: "boolean" }],
          ["business-smoke", { type: "boolean" }],
          ["allow-local-only", { type: "boolean" }],
          ["locked", { type: "boolean" }],
        ]),
    ),
  });
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  const action = positionals[0];
  if (
    !["create", "restore-check", "restore"].includes(action) ||
    positionals.length !== 1
  )
    throw new Error("invalid_action_use_help");
  if (
    (action === "restore" && (!values.file || !values.keep)) ||
    (action === "restore-check" && values.keep)
  )
    throw new Error("restore_action_scope_mismatch");
  const options = Object.fromEntries(
    Object.entries(values).map(([key, v]) => [
      key.replace(/-([a-z])/gu, (_, c) => c.toUpperCase()),
      v,
    ]),
  );
  const state = privateDirectory(
    action === "create" ? options.backupDir : path.dirname(options.report),
  );
  if (!values.locked) {
    const lock = path.join(state, "backup-set.lock");
    const args =
      process.platform === "darwin"
        ? ["/usr/bin/lockf", "-s", "-t", "0", "-k", lock]
        : ["flock", "--nonblock", "--no-fork", lock];
    const child = spawn(
      args[0],
      [
        ...args.slice(1),
        process.execPath,
        fileURLToPath(import.meta.url),
        ...process.argv.slice(2),
        "--locked",
      ],
      { stdio: "inherit", detached: true },
    );
    const forward = (signal) => {
      try {
        process.kill(-child.pid, signal);
      } catch {}
    };
    process.on("SIGINT", () => forward("SIGINT"));
    process.on("SIGTERM", () => forward("SIGTERM"));
    process.exitCode = await new Promise((resolve) => {
      child.once("error", () => resolve(1));
      child.once("close", (code) => resolve(code ?? 1));
    });
    return;
  }
  if (values["business-smoke"]) {
    if (action !== "restore-check")
      throw new Error("business_smoke_requires_restore_check");
    options.businessCredentials = {
      username: process.env.RESTORE_SMOKE_USERNAME,
      password: process.env.RESTORE_SMOKE_PASSWORD,
    };
    delete process.env.RESTORE_SMOKE_USERNAME;
    delete process.env.RESTORE_SMOKE_PASSWORD;
  }
  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());
  process.once("SIGTERM", () => controller.abort());
  const result =
    action === "create"
      ? await createSet(options, { signal: controller.signal })
      : await restoreSet(options, { signal: controller.signal });
  // Retained recovery resources and private paths belong only in the private report.
  const { retainedResources: _private, ...summary } = result;
  process.stdout.write(JSON.stringify(summary) + "\n");
}
main().catch((error) => {
  console.error(
    `[backup-set] ${/^[a-z_]+(?::[a-z-]+)*$/u.test(error.message) ? error.message : "operation_failed"}`,
  );
  process.exitCode = 1;
});
