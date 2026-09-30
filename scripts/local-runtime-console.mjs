import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { loadDevPorts } from "./dev-ports.mjs";
import { runProcessInspection } from "./dev-process-inspection.mjs";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const LOG_DIRECTORY = "output/dev-workbench/database-migration-runtime";
const ACTIVE_FILE = "output/dev-workbench/runtime-bundles/active.json";
const writeLine = (line) => process.stdout.write(`${line}\n`);

export function readRuntimeConsole(root) {
  const active = JSON.parse(fs.readFileSync(path.join(root, ACTIVE_FILE), "utf8"));
  const runtime = active.runtime;
  if (
    !UUID.test(active.id) ||
    active.health !== true || active.ready !== true || active.business !== true ||
    !Number.isSafeInteger(runtime?.pid) || runtime.pid <= 1 ||
    !Number.isFinite(Date.parse(runtime.startedAt)) ||
    typeof runtime.logFile !== "string" ||
    path.posix.dirname(runtime.logFile) !== LOG_DIRECTORY ||
    !UUID.test(path.posix.basename(runtime.logFile, ".log")) ||
    !runtime.logFile.endsWith(".log")
  ) {
    throw new Error("当前服务缺少已验证的日志运行信息；请执行 make dev_restart");
  }
  const logFile = path.join(root, runtime.logFile);
  const stat = fs.lstatSync(logFile);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("当前服务日志不是普通文件；未读取其他文件或停止服务");
  }
  return { ...runtime, logFile, bundleId: active.id, migrationVersion: active.migrationVersion };
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

function reportRuntime(root, runtime, write, running) {
  write(`[local-runtime] 后端${running ? "正在运行" : "已停止"}；端口=${loadDevPorts(root).http} PID=${runtime.pid} 启动时间=${runtime.startedAt}`);
  write(`[local-runtime] 运行版本=${runtime.bundleId} migration=${runtime.migrationVersion}`);
  write(`[local-runtime] 日志：${runtime.logFile}`);
}

export async function followRuntimeConsole(root, {
  signal,
  read = readRuntimeConsole,
  running = processExists,
  spawnTail = (file) => spawn("tail", ["-n", "50", "-F", file], {
    detached: true,
    stdio: ["ignore", "inherit", "inherit"],
  }),
  write = writeLine,
  pause = () => delay(1000, undefined, { signal }),
} = {}) {
  let tail;
  let previous = "";
  let tailError;
  const stopTail = () => {
    if (tail) tail.kill("SIGTERM");
    tail = null;
  };
  write(`\u001b]0;${path.basename(root)} · 后端日志\u0007`);
  write("[local-runtime] 持续显示当前后端日志；Ctrl+C 退出查看，后端继续运行。退出后可执行 make dev_restart 或 make dev_stop。");
  try {
    while (!signal?.aborted) {
      if (tailError) throw tailError;
      const runtime = read(root);
      const alive = running(runtime.pid);
      const key = `${runtime.bundleId}:${runtime.pid}:${runtime.logFile}:${alive}`;
      if (key !== previous) {
        stopTail();
        reportRuntime(root, runtime, write, alive);
        if (alive) {
          tail = spawnTail(runtime.logFile);
          tail.once("error", (error) => { tailError = error; });
          tail.once("exit", (code, exitSignal) => {
            if (!exitSignal && code !== 0) tailError = new Error("日志查看进程退出；后端继续运行，请重新执行 make dev_logs");
          });
        } else {
          write("[local-runtime] 服务已停止，此终端等待下一次启动；不会自动启动或迁移数据库。");
        }
        previous = key;
      }
      await pause();
    }
  } catch (error) {
    if (!signal?.aborted) throw error;
  } finally {
    stopTail();
    write("[local-runtime] 已退出日志查看；未停止后端服务。");
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

export async function showRuntimeConsole(root, {
  platform = process.platform,
  env = process.env,
  inspect = runProcessInspection,
  exists = fs.existsSync,
  executable = process.execPath,
  write = writeLine,
} = {}) {
  if (platform !== "darwin" || env.CI || env.SSH_CONNECTION || env.SSH_TTY) {
    write("[local-runtime] 查看实时日志：在本项目 server 目录执行 make dev_logs");
    return { opened: false };
  }
  const script = path.join(root, "scripts/local-runtime-console.mjs");
  const viewerExists = async () => {
    const { stdout } = await inspect("ps", ["-axo", "pid=,command="]);
    return stdout.split("\n").some((line) => line.trim().endsWith(`${script} --follow --desktop`));
  };
  if (await viewerExists()) {
    write("[local-runtime] 已有常驻日志终端，后续输出与重启会在同一终端显示");
    return { opened: false, reused: true };
  }
  const app = exists("/Applications/iTerm.app") ? "/Applications/iTerm.app" : "/System/Applications/Utilities/Terminal.app";
  const commandFile = path.join(root, LOG_DIRECTORY, `后端日志-${randomUUID()}.command`);
  const errorFile = `${commandFile}.log`;
  const command = [
    "#!/bin/sh",
    "trap ':' INT",
    `cd ${shellQuote(path.join(root, "server"))} || exit 1`,
    `${shellQuote(executable)} ${shellQuote(script)} --follow --desktop 2>>${shellQuote(errorFile)}`,
    'exec "${SHELL:-/bin/zsh}" -l',
    "",
  ].join("\n");
  fs.mkdirSync(path.dirname(commandFile), { recursive: true, mode: 0o700 });
  fs.closeSync(fs.openSync(errorFile, "a", 0o600));
  fs.writeFileSync(commandFile, command, { mode: 0o700 });
  fs.chmodSync(commandFile, 0o700);
  await inspect("/usr/bin/open", ["-a", app, commandFile], { timeoutMs: 5000 });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await viewerExists()) {
      write("[local-runtime] 常驻日志终端已启动；可在该终端查看输出并重启服务");
      return { opened: true };
    }
    await delay(100);
  }
  throw new Error("日志终端未在 5 秒内启动；后端继续运行，请在终端执行 make dev_logs");
}

export async function presentRuntimeConsole(root, {
  interactive = Boolean(process.stdout.isTTY),
  background = false,
  write = writeLine,
  follow = followRuntimeConsole,
  show = showRuntimeConsole,
  running = processExists,
  env = process.env,
  desktop = false,
  spawnConsole = spawn,
} = {}) {
  const runtime = readRuntimeConsole(root);
  reportRuntime(root, runtime, write, running(runtime.pid));
  if (background) return;
  if (!interactive) return show(root, { write });
  // Keep a visible manual restart discoverable after leaving the original
  // desktop viewer, so a later Codex startup reuses this terminal too.
  if (!desktop && (env.ITERM_SESSION_ID || env.TERM_PROGRAM === "Apple_Terminal")) {
    const child = spawnConsole(process.execPath, [path.join(root, "scripts/local-runtime-console.mjs"), "--follow", "--desktop"], { stdio: "inherit" });
    return new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => code === 0 || signal === "SIGINT" ? resolve() : reject(new Error("日志查看进程退出；后端继续运行")));
    });
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(signal, stop);
  try {
    return await follow(root, { signal: controller.signal, write });
  } finally {
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.off(signal, stop);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const root = path.resolve(import.meta.dirname, "..");
  const follow = process.argv.includes("--follow");
  presentRuntimeConsole(root, { interactive: follow || Boolean(process.stdout.isTTY), desktop: process.argv.includes("--desktop") }).catch((error) => {
    process.stderr.write(`[local-runtime] 日志查看失败：${error.message}；未停止后端服务\n`);
    process.exitCode = 1;
  });
}
