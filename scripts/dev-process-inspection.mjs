import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

// A child blocked in a kernel call may keep its pipes open after SIGKILL.
// Bound our wait as well as the command, so inspection always fails closed.
export function runProcessInspection(command, args, { timeoutMs = 2000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout.destroy();
      child.stderr.destroy();
      child.unref();
      if (error) reject(Object.assign(error, { stdout, stderr }));
      else resolve({ stdout, stderr });
    };
    const abort = (message) => {
      try {
        if (process.platform === "win32") child.kill("SIGKILL");
        else if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch (error) {
        if (error.code !== "ESRCH") return finish(error);
      }
      finish(new Error(message));
    };
    const timer = setTimeout(
      () => abort(`进程检查超时（${command}）；未停止任何服务`),
      timeoutMs,
    );
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 4 * 1024 * 1024) abort("进程检查输出过大");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > 8192) abort("进程检查错误输出过大");
    });
    child.once("error", finish);
    child.once("close", (code) =>
      finish(
        code === 0
          ? null
          : Object.assign(new Error(`无法完成 ${command} 进程检查`), { code }),
      ),
    );
  });
}

export function parseDarwinListenerPids(output, port) {
  const lines = output.trim().split("\n");
  if (lines[0] !== ",state,") {
    throw new Error("无法识别系统端口表；未停止任何服务");
  }
  const pids = new Set();
  let pid;
  for (const line of lines.slice(1)) {
    // nettop emits a process summary followed by that process's sockets.
    const owner = line.match(/^.+\.(\d+),,$/u);
    if (owner) {
      pid = Number(owner[1]);
      continue;
    }
    const socket = line.match(/^tcp[46] (.+?)<->[^,]+,([^,]*),$/u);
    if (!socket) throw new Error("无法识别系统连接记录；未停止任何服务");
    if (
      socket[2] !== "Listen" ||
      Number(socket[1].match(/[.:](\d+)$/u)?.[1]) !== Number(port)
    )
      continue;
    if (!Number.isSafeInteger(pid) || pid <= 1) {
      throw new Error(`无法确认端口 ${port} 的进程；未停止任何服务`);
    }
    pids.add(pid);
  }
  return [...pids].sort((a, b) => a - b);
}

export async function findListenerPids(
  port,
  { platform = process.platform, inspect = runProcessInspection } = {},
) {
  port = Number(port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("无效的开发端口");
  }
  if (platform === "darwin") {
    // One native socket snapshot avoids lsof's global descriptor scan.
    const { stdout } = await inspect("nettop", [
      "-L",
      "1",
      "-n",
      "-m",
      "tcp",
      "-J",
      "state",
    ]);
    return parseDarwinListenerPids(stdout, port);
  }
  try {
    const { stdout } = await inspect("lsof", [
      "-nP",
      "-a",
      `-iTCP:${port}`,
      "-sTCP:LISTEN",
      "-Fp",
    ]);
    const pids = [
      ...new Set(
        stdout
          .split("\n")
          .filter((line) => /^p[1-9]\d*$/u.test(line))
          .map((line) => Number(line.slice(1))),
      ),
    ];
    if (
      !pids.length ||
      pids.some((pid) => !Number.isSafeInteger(pid) || pid <= 1)
    ) {
      throw new Error("无法识别端口进程；未停止任何服务");
    }
    return pids.sort((a, b) => a - b);
  } catch (error) {
    if (error.code === 1 && !error.stdout && !error.stderr) return [];
    throw error;
  }
}

export async function readProcessCwd(pid) {
  if (!Number.isSafeInteger(Number(pid)) || Number(pid) <= 1)
    throw new Error("无效的进程编号");
  const { stdout } = await runProcessInspection("lsof", [
    "-nP",
    "-a",
    "-p",
    String(pid),
    "-d",
    "cwd",
    "-Fn",
  ]);
  const cwd = stdout
    .split("\n")
    .find((line) => line.startsWith("n/"))
    ?.slice(1);
  if (!cwd) throw new Error(`无法确认进程 ${pid} 的工作目录；未停止任何服务`);
  return cwd;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    const [action, value] = process.argv.slice(2);
    if (action === "listeners") {
      const pids = await findListenerPids(value);
      if (pids.length) process.stdout.write(`${pids.join("\n")}\n`);
    } else if (action === "cwd") {
      process.stdout.write(`${await readProcessCwd(value)}\n`);
    } else {
      throw new Error(
        "usage: dev-process-inspection.mjs <listeners port|cwd pid>",
      );
    }
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exitCode = 1;
  }
}
