#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify, parseEnv } from "node:util";
import { isDevPortAvailable, loadDevPorts } from "./dev-ports.mjs";
import {
  databaseQuery,
  readLocalDatabaseRoles,
  registeredDatabaseSystemIdentifier,
} from "./local-database-roles.mjs";
import {
  resolveDatabaseMigrationOperationStore,
  acquireDatabaseMigrationExecutionLock,
  releaseDatabaseMigrationExecutionLock,
} from "./qa/dev-database-migration-operation-store.mjs";

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
export const ORB_STATE = path.join(
  os.homedir(),
  ".local/share/plush-toy-erp/orbstack",
);
export const PROFILE_FILES = [
  "server/configs/dev/config.local.yaml",
  "server/configs/dev/database-roles.local.json",
  "server/.env",
];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function readPrivateFile(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0)
    throw new Error(`配置必须为 0600 普通文件：${file}`);
  return fs.readFileSync(file);
}

export async function compose(args) {
  const file = path.join(ORB_STATE, "compose.env");
  readPrivateFile(file);
  const environment = {
    ...process.env,
    ...parseEnv(fs.readFileSync(file, "utf8")),
    GIT_OPTIONAL_LOCKS: "0",
  };
  return exec(
    "docker",
    [
      "--context",
      "orbstack",
      "compose",
      "--project-name",
      "plush-erp-dev-orb",
      "--env-file",
      file,
      "-f",
      path.join(root, "server/deploy/compose/dev-orb/compose.yml"),
      ...args,
    ],
    { env: environment, timeout: 120_000, maxBuffer: 2 * 1024 * 1024 },
  );
}

export function prepareProfileSwitch(workspace, state, target) {
  if (!["orb", "shared"].includes(target))
    throw new Error("目标只允许 orb 或 shared");
  const profiles = JSON.parse(
    readPrivateFile(path.join(state, "profiles.json")),
  );
  const current = Object.fromEntries(
    PROFILE_FILES.map((file) => [
      file,
      readPrivateFile(path.join(workspace, file)),
    ]),
  );
  const source = ["orb", "shared"].find((name) =>
    PROFILE_FILES.every((file) => hash(current[file]) === profiles[name][file]),
  );
  if (!source)
    throw new Error(
      "当前配置有后续修改，拒绝覆盖；先核对并更新受保护的配置快照",
    );
  const files = PROFILE_FILES.map((file) => {
    const bytes = readPrivateFile(path.join(state, "profiles", target, file));
    if (hash(bytes) !== profiles[target][file])
      throw new Error("备用配置快照校验失败");
    return { file, bytes, previous: current[file] };
  });
  return { source, target, files };
}

export async function activateProfile(
  workspace,
  state,
  target,
  { portAvailable = isDevPortAvailable } = {},
) {
  const plan = prepareProfileSwitch(workspace, state, target);
  const ports = loadDevPorts(workspace);
  // Vite owns database maintenance bridges too; require the whole current
  // development entry to be stopped before changing its connection identity.
  for (const port of [
    ports.http,
    ports.web,
    ...Array.from({ length: 100 }, (_, index) => ports.auxStart + index),
  ]) {
    if (!(await portAvailable(port)))
      throw new Error(
        `开发端口 ${port} 仍在使用，未切换；请在其他任务结束后停止前后端再操作`,
      );
  }
  const destination = path.join(state, "profiles", target);
  const roles = JSON.parse(
    readPrivateFile(path.join(destination, PROFILE_FILES[1])),
  );
  readLocalDatabaseRoles(destination, roles.app);
  const identity = await databaseQuery(
    roles.audit,
    "SELECT system_identifier::text FROM pg_control_system()",
  );
  if (identity !== registeredDatabaseSystemIdentifier(destination, roles.app))
    throw new Error("目标集群身份不匹配，未切换");
  const written = [];
  try {
    for (const { file, bytes, previous } of plan.files) {
      const targetPath = path.join(workspace, file);
      if (!readPrivateFile(targetPath).equals(previous))
        throw new Error("切换期间配置发生变化，已停止");
      const temporary = `${targetPath}.orb-${process.pid}`;
      fs.writeFileSync(temporary, bytes, { mode: 0o600, flag: "wx" });
      fs.renameSync(temporary, targetPath);
      written.push({ targetPath, previous, bytes });
    }
  } catch (error) {
    for (const { targetPath, previous, bytes } of written.reverse()) {
      if (readPrivateFile(targetPath).equals(bytes))
        fs.writeFileSync(targetPath, previous, { mode: 0o600 });
    }
    throw error;
  }
  return plan;
}

async function main() {
  const command = process.argv[2] || "status";
  if (["help", "--help", "-h"].includes(command)) {
    console.log(
      "node scripts/local-orb.mjs status | up | switch orb | switch shared\nup 只启动独立中间件；switch 要求当前开发前后端已停止，不自动重启、复制或覆盖数据。",
    );
    return;
  }
  if (command === "status" || command === "up") {
    if (command === "up")
      await compose(["up", "-d", "--wait", "--wait-timeout", "90"]);
    const result = await compose(["ps", "--format", "json"]);
    for (const line of result.stdout.trim().split("\n").filter(Boolean)) {
      const service = JSON.parse(line);
      console.log(
        `${service.Service}: ${service.State}${service.Health ? ` (${service.Health})` : ""} | ${service.Ports}`,
      );
    }
    return;
  }
  if (command === "switch") {
    const store = resolveDatabaseMigrationOperationStore(root);
    const operation = randomUUID();
    acquireDatabaseMigrationExecutionLock(store, operation);
    try {
      const plan = await activateProfile(root, ORB_STATE, process.argv[3]);
      console.log(
        `[local-orb] ${plan.source} → ${plan.target}；配置已切换，数据未合并。请运行 pnpm --dir web start。`,
      );
    } finally {
      releaseDatabaseMigrationExecutionLock(store, operation);
    }
    return;
  }
  throw new Error("未知命令；使用 --help 查看入口");
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename)
  main().catch((error) => {
    console.error(`[local-orb] ${error.message}`);
    process.exitCode = 1;
  });
