import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { loadDevPorts } from "./dev-ports.mjs";
import { runProcessInspection } from "./dev-process-inspection.mjs";

const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const LOG_DIRECTORY = "output/dev-workbench/database-migration-runtime";
const ACTIVE_FILE = "output/dev-workbench/runtime-bundles/active.json";
const writeLine = (line) => process.stdout.write(`${line}\n`);

export function writeRuntimeProgress(message, write = writeLine) {
  write(
    `[local-runtime] ${new Date().toLocaleTimeString("zh-CN", { hour12: false })} ${message}`,
  );
}

const LEVEL_COLORS = { DEBUG: 90, INFO: 36, WARN: 33, ERROR: 31, FATAL: 31 };
const SERVICE_FIELDS = ["service.id", "service.name", "service.version"];

function plainText(value) {
  return stripVTControlCharacters(String(value))
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/gu, "")
    .replace(
      /\bpostgres(?:ql)?:\/\/[^:\s/@]+:[^@\s]+@/giu,
      "postgres://<redacted>@",
    )
    .replace(/\bpassword=[^\s&]+/giu, "password=<redacted>");
}

function logEntry(line) {
  try {
    const entry = JSON.parse(line);
    return entry && Object.hasOwn(LEVEL_COLORS, entry.level) ? entry : null;
  } catch {
    return null;
  }
}

export function formatRuntimeLogLine(line, { color = false } = {}) {
  const entry = logEntry(line);
  if (!entry) return plainText(line);
  const timestamp = Date.parse(entry.ts);
  const time = Number.isFinite(timestamp)
    ? new Date(timestamp).toLocaleTimeString("zh-CN", { hour12: false })
    : plainText(entry.ts || "");
  const level = color
    ? `\u001b[${LEVEL_COLORS[entry.level]}m${entry.level.padEnd(5)}\u001b[0m`
    : entry.level.padEnd(5);
  const caller = entry.caller ? ` [${plainText(entry.caller)}]` : "";
  const message = plainText(entry.msg || "").replaceAll("\n", "\n  ");
  const details = Object.entries(entry)
    .filter(
      ([key, value]) =>
        !["ts", "level", "caller", "msg", ...SERVICE_FIELDS].includes(key) &&
        value !== "" &&
        value !== null &&
        value !== undefined &&
        !(key === "trace_sampled" && value === false),
    )
    .map(([key, value]) => {
      const text = plainText(
        typeof value === "object" ? JSON.stringify(value) : value,
      );
      return `${plainText(key)}=${text.replaceAll("\n", "\n    ")}`;
    });
  return `${time ? `${time} ` : ""}${level}${caller} ${message}${details.length ? `\n  ${details.join("\n  ")}` : ""}`;
}

function createLogWriter(write, color) {
  let previousService = "";
  return (line) => {
    const entry = logEntry(line);
    if (entry) {
      const service = SERVICE_FIELDS.filter((key) => entry[key])
        .map((key) => `${key}=${plainText(entry[key])}`)
        .join(" ");
      if (service && service !== previousService) {
        write(`[local-runtime] ${service}`);
        previousService = service;
      }
    }
    write(formatRuntimeLogLine(line, { color }));
  };
}

// Read backwards in bounded chunks; opening logs must not load hours of SQL
// into memory. Byte offsets also keep multibyte messages intact.
function recentLogStart(descriptor, minimum, end, lines) {
  let cursor = end;
  let remaining = lines === 0 ? 1 : lines;
  const buffer = Buffer.alloc(64 * 1024);
  if (end > minimum) {
    fs.readSync(descriptor, buffer, 0, 1, end - 1);
    if (lines > 0 && buffer[0] === 10) remaining += 1;
  }
  while (cursor > minimum) {
    const start = Math.max(minimum, cursor - buffer.length);
    const count = fs.readSync(descriptor, buffer, 0, cursor - start, start);
    for (let index = count - 1; index >= 0; index -= 1) {
      if (buffer[index] === 10 && --remaining === 0) return start + index + 1;
    }
    cursor = start;
  }
  return minimum;
}

export function readRuntimeLogPlan(runtime, recentLines = 50) {
  const descriptor = fs.openSync(runtime.logFile, "r");
  try {
    const size = fs.fstatSync(descriptor).size;
    const start = runtime.logStartOffset ?? 0;
    if (!Number.isSafeInteger(start) || start < 0 || start > size)
      throw new Error("启动日志位置与当前文件不一致；请检查日志文件");
    let startupEnd = runtime.startupLogEndOffset;
    if (startupEnd === undefined) {
      // A process already running when the viewer is updated has no startup
      // checkpoint yet. Show its beginning as well as the recent output.
      const buffer = Buffer.alloc(Math.min(size - start, 64 * 1024));
      fs.readSync(descriptor, buffer, 0, buffer.length, start);
      startupEnd = start + Math.max(0, buffer.lastIndexOf(10) + 1);
    }
    if (
      !Number.isSafeInteger(startupEnd) ||
      startupEnd < start ||
      startupEnd > size
    )
      throw new Error("启动日志范围与当前文件不一致；请检查日志文件");
    // The process may have been writing a record when readiness completed.
    startupEnd = recentLogStart(descriptor, start, startupEnd, 0);
    const followStart = recentLogStart(
      descriptor,
      startupEnd,
      size,
      recentLines,
    );
    return {
      start,
      startupEnd,
      followStart,
      skippedBytes: followStart - startupEnd,
    };
  } finally {
    fs.closeSync(descriptor);
  }
}

async function replayStartupLogs(runtime, plan, write, signal) {
  if (plan.startupEnd <= plan.start) return;
  write(
    `[local-runtime] 本次启动日志${runtime.startupLogEndOffset === undefined ? "（已运行进程的开头记录）" : "（从进程启动到 health / ready / business 验证完成）"}：`,
  );
  const input = fs.createReadStream(runtime.logFile, {
    start: plan.start,
    end: plan.startupEnd - 1,
    signal,
  });
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) write(line);
  } finally {
    lines.close();
    input.destroy();
  }
}

export function readRuntimeConsole(root) {
  const active = JSON.parse(
    fs.readFileSync(path.join(root, ACTIVE_FILE), "utf8"),
  );
  const runtime = active.runtime;
  if (
    !UUID.test(active.id) ||
    active.health !== true ||
    active.ready !== true ||
    active.business !== true ||
    !Number.isSafeInteger(runtime?.pid) ||
    runtime.pid <= 1 ||
    !Number.isFinite(Date.parse(runtime.startedAt)) ||
    typeof runtime.logFile !== "string" ||
    path.posix.dirname(runtime.logFile) !== LOG_DIRECTORY ||
    !UUID.test(path.posix.basename(runtime.logFile, ".log")) ||
    !runtime.logFile.endsWith(".log")
  ) {
    throw new Error(
      "当前服务缺少已验证的日志运行信息；请执行 make dev_restart",
    );
  }
  const logFile = path.join(root, runtime.logFile);
  const stat = fs.lstatSync(logFile);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("当前服务日志不是普通文件；未读取其他文件或停止服务");
  }
  return {
    ...runtime,
    logFile,
    bundleId: active.id,
    migrationVersion: active.migrationVersion,
  };
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
  write(
    `[local-runtime] 后端${running ? "正在运行" : "已停止"}；端口=${loadDevPorts(root).http} PID=${runtime.pid} 启动时间=${new Date(runtime.startedAt).toLocaleString("zh-CN", { hour12: false })}`,
  );
  write(
    `[local-runtime] 运行版本=${runtime.version || `local-${runtime.bundleId}`} 制品=${runtime.bundleId} 启动来源=${runtime.startSource || "未记录"} migration=${runtime.migrationVersion}`,
  );
  write(`[local-runtime] 日志：${runtime.logFile}`);
  if (Number.isFinite(runtime.startupDurationMs))
    write(
      `[local-runtime] 本次启动验证耗时 ${(runtime.startupDurationMs / 1000).toFixed(1)} 秒`,
    );
}

export async function followRuntimeConsole(
  root,
  {
    signal,
    read = readRuntimeConsole,
    running = processExists,
    color = Boolean(process.stdout.isTTY) &&
      !Object.hasOwn(process.env, "NO_COLOR"),
    spawnTail = (file, start) =>
      spawn("tail", ["-c", `+${start + 1}`, "-F", file], {
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    write = writeLine,
    pause = () => delay(1000, undefined, { signal }),
  } = {},
) {
  let tail;
  let previous = "";
  let tailError;
  let lines;
  const logWrite = createLogWriter(write, color);
  const stopTail = () => {
    if (tail) tail.kill("SIGTERM");
    lines?.close();
    lines = null;
    tail = null;
  };
  write(`\u001b]0;${path.basename(root)} · 后端日志\u0007`);
  write(
    "[local-runtime] 持续显示当前后端日志；Ctrl+C 退出查看，后端继续运行。退出后可执行 make dev_restart 或 make dev_stop。",
  );
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
          const plan = readRuntimeLogPlan(runtime);
          await replayStartupLogs(runtime, plan, logWrite, signal);
          if (plan.skippedBytes)
            write(
              `[local-runtime] 已省略启动与最近日志之间的 ${plan.skippedBytes} 字节历史输出；完整日志保存在上方文件。`,
            );
          write("[local-runtime] 最近运行日志及后续实时输出：");
          tail = spawnTail(runtime.logFile, plan.followStart);
          lines = createInterface({ input: tail.stdout, crlfDelay: Infinity });
          lines.on("line", logWrite);
          tail.stderr.on("data", (chunk) => write(plainText(chunk).trimEnd()));
          tail.once("error", (error) => {
            tailError = error;
          });
          tail.once("exit", (code, exitSignal) => {
            if (!exitSignal && code !== 0)
              tailError = new Error(
                "日志查看进程退出；后端继续运行，请重新执行 make dev_logs",
              );
          });
        } else {
          write(
            "[local-runtime] 服务已停止，此终端等待下一次启动；不会自动启动或迁移数据库。",
          );
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

export async function findRuntimeDesktopViewers(
  root,
  inspect = runProcessInspection,
) {
  const script = path.join(root, "scripts/local-runtime-console.mjs");
  const suffix = ` ${script} --follow --desktop`;
  const { stdout } = await inspect("ps", ["-axo", "pid=,command="]);
  return stdout.split("\n").flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(.+)$/u);
    if (!match || !match[2].endsWith(suffix)) return [];
    const executable = match[2].slice(0, -suffix.length);
    const pid = Number(match[1]);
    return pid > 1 && path.basename(executable) === "node"
      ? [{ pid, command: match[2] }]
      : [];
  });
}

export async function hasRuntimeDesktopViewer(
  root,
  inspect = runProcessInspection,
) {
  return (await findRuntimeDesktopViewers(root, inspect)).length > 0;
}

export async function takeOverRuntimeDesktopViewers(
  root,
  {
    inspect = runProcessInspection,
    alive = processExists,
    kill = (pid) => process.kill(pid, "SIGTERM"),
    pause = delay,
  } = {},
) {
  const viewers = (await findRuntimeDesktopViewers(root, inspect)).filter(
    ({ pid }) => pid !== process.pid,
  );
  const selected = [];
  for (const viewer of viewers) {
    if (!alive(viewer.pid)) continue;
    const args = ["-p", String(viewer.pid), "-o", "lstart=,command="];
    const first = (await inspect("ps", args)).stdout.trim();
    const second = (await inspect("ps", args)).stdout.trim();
    if (!first.endsWith(` ${viewer.command}`) || second !== first) {
      throw new Error("原日志查看进程的归属或启动时间已变化，未结束该进程");
    }
    selected.push(viewer.pid);
  }
  // Only retire verified log viewers; the backend and its operation lock remain independent.
  for (const pid of selected) kill(pid);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (selected.every((pid) => !alive(pid)))
      return { stopped: selected.length };
    await pause(100);
  }
  throw new Error("原日志查看进程尚未退出，未强制结束；当前终端继续显示日志");
}

export async function showRuntimeConsole(
  root,
  {
    platform = process.platform,
    env = process.env,
    inspect = runProcessInspection,
    exists = fs.existsSync,
    executable = process.execPath,
    write = writeLine,
  } = {},
) {
  if (platform !== "darwin" || env.CI || env.SSH_CONNECTION || env.SSH_TTY) {
    write(
      "[local-runtime] 查看实时日志：在本项目 server 目录执行 make dev_logs",
    );
    return { opened: false };
  }
  const script = path.join(root, "scripts/local-runtime-console.mjs");
  const viewerExists = () => hasRuntimeDesktopViewer(root, inspect);
  if (await viewerExists()) {
    write("[local-runtime] 已有常驻日志终端，后续输出与重启会在同一终端显示");
    return { opened: false, reused: true };
  }
  const app = exists("/Applications/iTerm.app")
    ? "/Applications/iTerm.app"
    : "/System/Applications/Utilities/Terminal.app";
  const commandFile = path.join(
    root,
    LOG_DIRECTORY,
    `后端日志-${randomUUID()}.command`,
  );
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
  throw new Error(
    "日志终端未在 5 秒内启动；后端继续运行，请在终端执行 make dev_logs",
  );
}

export async function presentRuntimeConsole(
  root,
  {
    interactive = Boolean(process.stdout.isTTY),
    background = false,
    write = writeLine,
    follow = followRuntimeConsole,
    show = showRuntimeConsole,
    running = processExists,
    env = process.env,
    desktop = false,
    takeOver = takeOverRuntimeDesktopViewers,
    spawnConsole = spawn,
  } = {},
) {
  const runtime = readRuntimeConsole(root);
  reportRuntime(root, runtime, write, running(runtime.pid));
  if (background) return;
  if (!interactive) return show(root, { write });
  // Keep a visible manual restart discoverable after leaving the original
  // desktop viewer, so a later Codex startup reuses this terminal too.
  if (
    !desktop &&
    (env.ITERM_SESSION_ID || env.TERM_PROGRAM === "Apple_Terminal")
  ) {
    try {
      const retired = await takeOver(root);
      if (retired.stopped) {
        write(
          "[local-runtime] 当前终端已接管后端日志；原日志终端返回命令行，后端继续运行。",
        );
      }
    } catch (error) {
      write(
        `[local-runtime] 日志接管提示：${error.message}；当前终端继续显示日志，后端运行不受影响。`,
      );
    }
    const child = spawnConsole(
      process.execPath,
      [
        path.join(root, "scripts/local-runtime-console.mjs"),
        "--follow",
        "--desktop",
      ],
      { stdio: "inherit" },
    );
    return new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) =>
        code === 0 || signal === "SIGINT"
          ? resolve()
          : reject(new Error("日志查看进程退出；后端继续运行")),
      );
    });
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
    process.once(signal, stop);
  try {
    return await follow(root, { signal: controller.signal, write });
  } finally {
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
      process.off(signal, stop);
  }
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const root = path.resolve(import.meta.dirname, "..");
  const follow = process.argv.includes("--follow");
  presentRuntimeConsole(root, {
    interactive: follow || Boolean(process.stdout.isTTY),
    desktop: process.argv.includes("--desktop"),
  }).catch((error) => {
    process.stderr.write(
      `[local-runtime] 日志查看失败：${error.message}；未停止后端服务\n`,
    );
    process.exitCode = 1;
  });
}
