import { execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

const exec = promisify(execFile);
const lsregister =
  "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const hash = (value) => createHash("sha256").update(value).digest("hex");

function privateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid()
  )
    throw new Error("后台运行目录归属不明，未启动服务");
  fs.chmodSync(directory, 0o700);
  return directory;
}

export function runtimeProcessPaths(root) {
  const directory = path.join(root, "output/dev-workbench/runtime-process");
  const identifier = `local.plush-toy-erp.runtime.${hash(fs.realpathSync(root)).slice(0, 16)}`;
  return {
    directory,
    identifier,
    app: path.join(directory, "Plush ERP Backend.app"),
    record: path.join(directory, "active.json"),
  };
}

const xmlText = (value) =>
  String(value).replace(
    /[<>&"']/gu,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
export function launchdPlist(value) {
  const item = (entry) => {
    if (typeof entry === "boolean") return entry ? "<true/>" : "<false/>";
    if (typeof entry === "number") return `<integer>${entry}</integer>`;
    if (Array.isArray(entry))
      return `<array>${entry.map(item).join("")}</array>`;
    if (typeof entry === "object")
      return `<dict>${Object.entries(entry)
        .map(([key, v]) => `<key>${xmlText(key)}</key>${item(v)}`)
        .join("")}</dict>`;
    return `<string>${xmlText(entry)}</string>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0">${item(value)}</plist>\n`;
}

export function runtimeLaunchdJob(paths, operationId, requestFile, logFile) {
  if (!uuid.test(operationId)) throw new Error("无效的后端启动操作编号");
  return {
    Label: `${paths.identifier}.${operationId}`,
    ProgramArguments: [
      path.join(paths.app, "Contents/MacOS/launcher"),
      requestFile,
    ],
    AssociatedBundleIdentifiers: [paths.identifier],
    RunAtLoad: false,
    KeepAlive: false,
    ProcessType: "Interactive",
    StandardOutPath: logFile,
    StandardErrorPath: logFile,
    Umask: 0o077,
  };
}

export async function prepareRuntimeProcess(
  root,
  { platform = process.platform } = {},
) {
  if (platform !== "darwin") return null;
  const paths = runtimeProcessPaths(root);
  privateDirectory(paths.directory);
  const source = path.join(root, "scripts/local-runtime-launcher.swift");
  const fingerprint = hash(fs.readFileSync(source));
  const prepared = path.join(paths.directory, `build-${fingerprint}`);
  const binary = path.join(prepared, "launcher");
  const receipt = path.join(prepared, "sha256");
  if (
    !fs.existsSync(binary) ||
    !fs.existsSync(receipt) ||
    fs.readFileSync(receipt, "utf8") !== hash(fs.readFileSync(binary))
  ) {
    privateDirectory(prepared);
    await exec("xcrun", ["swiftc", source, "-o", binary], { timeout: 60_000 });
    fs.writeFileSync(receipt, hash(fs.readFileSync(binary)), { mode: 0o600 });
  }
  return { ...paths, binary, fingerprint };
}

async function installLauncher(prepared) {
  const installed = path.join(prepared.app, "Contents/MacOS/launcher");
  const identityFile = path.join(prepared.directory, "launcher.json");
  const identity = fs.existsSync(identityFile)
    ? JSON.parse(fs.readFileSync(identityFile, "utf8"))
    : null;
  if (fs.existsSync(prepared.app) && !identity)
    throw new Error("后台启动器目录缺少归属记录，未覆盖现有文件");
  if (
    identity?.fingerprint === prepared.fingerprint &&
    fs.existsSync(installed) &&
    identity.binaryHash === hash(fs.readFileSync(installed))
  ) {
    await exec("codesign", ["--verify", "--strict", prepared.app], {
      timeout: 10_000,
    });
    await exec(lsregister, ["-f", prepared.app], { timeout: 10_000 });
    return;
  }
  if (fs.existsSync(prepared.record))
    throw new Error(
      "后台启动器内容已变化；请先执行 make dev_stop 再启动。当前后端未停止",
    );
  const temporary = `${prepared.app}.${randomUUID()}`;
  fs.mkdirSync(path.join(temporary, "Contents/MacOS"), {
    recursive: true,
    mode: 0o700,
  });
  try {
    fs.copyFileSync(
      prepared.binary,
      path.join(temporary, "Contents/MacOS/launcher"),
    );
    fs.writeFileSync(
      path.join(temporary, "Contents/Info.plist"),
      launchdPlist({
        CFBundleExecutable: "launcher",
        CFBundleIdentifier: prepared.identifier,
        CFBundleName: "Plush ERP 开发后端",
        CFBundleDisplayName: "Plush ERP 开发后端",
        CFBundleVersion: "1",
        CFBundlePackageType: "APPL",
        LSUIElement: true,
        NSLocalNetworkUsageDescription:
          "连接已配置的 ERP 开发数据库、附件和观测服务。",
      }),
    );
    await exec("codesign", ["--force", "--sign", "-", temporary], {
      timeout: 10_000,
    });
    // Do not replace code that still owns a running backend's network identity.
    fs.rmSync(prepared.app, { recursive: true, force: true });
    fs.renameSync(temporary, prepared.app);
    fs.writeFileSync(
      identityFile,
      JSON.stringify({
        fingerprint: prepared.fingerprint,
        binaryHash: hash(fs.readFileSync(installed)),
      }),
      { mode: 0o600 },
    );
    await exec(lsregister, ["-f", prepared.app], { timeout: 10_000 });
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

export async function stopManagedRuntimeProcess(
  root,
  { platform = process.platform } = {},
) {
  if (platform !== "darwin") return;
  const paths = runtimeProcessPaths(root);
  if (!fs.existsSync(paths.record)) return;
  const record = JSON.parse(fs.readFileSync(paths.record, "utf8"));
  if (
    !uuid.test(record.operationId) ||
    record.service !==
      `gui/${process.getuid()}/${paths.identifier}.${record.operationId}`
  )
    throw new Error("后台服务登记归属不明，未移除服务");
  try {
    await exec("launchctl", ["bootout", record.service], { timeout: 15_000 });
  } catch (error) {
    // Only the documented missing-service result is safe after a user logout.
    if (!/Could not find service|No such process/u.test(error.stderr || ""))
      throw error;
  }
  fs.unlinkSync(paths.record);
}

export async function startRuntimeProcess(
  root,
  {
    prepared,
    operationId,
    executable,
    cwd,
    env,
    logFile,
    arguments: args = [],
    probe,
  },
) {
  if (!prepared) {
    const descriptor = fs.openSync(logFile, "a", 0o600);
    let child;
    try {
      child = spawn(executable, args, {
        cwd,
        env,
        detached: true,
        stdio: ["ignore", descriptor, descriptor],
      });
    } finally {
      fs.closeSync(descriptor);
    }
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    child.unref();
    child.stop = async () => {
      if (!child.pid || child.exitCode !== null || child.signalCode) return;
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    };
    return child;
  }
  if (!probe && fs.existsSync(prepared.record))
    throw new Error("旧后台服务登记尚未清理，未启动候选进程");
  if (!uuid.test(operationId)) throw new Error("无效的后端启动操作编号");
  const directory = privateDirectory(
    path.join(prepared.directory, operationId),
  );
  const requestFile = path.join(directory, "request.json");
  const stateFile = path.join(directory, "state.json");
  if (fs.existsSync(stateFile))
    fs.renameSync(
      stateFile,
      path.join(directory, `state-${randomUUID()}.json`),
    );
  const plistFile = path.join(directory, "service.plist");
  const job = runtimeLaunchdJob(prepared, operationId, requestFile, logFile);
  const service = `gui/${process.getuid()}/${job.Label}`;
  await installLauncher(prepared);
  fs.writeFileSync(
    requestFile,
    JSON.stringify({
      executable,
      arguments: args,
      cwd,
      environment: env,
      stateFile,
      ...(probe ? { probeHost: probe.host, probePort: probe.port } : {}),
    }),
    { mode: 0o600, flag: "wx" },
  );
  fs.writeFileSync(plistFile, launchdPlist(job), { mode: 0o600 });
  let loaded = false;
  try {
    await exec(
      "launchctl",
      ["bootstrap", `gui/${process.getuid()}`, plistFile],
      { timeout: 10_000 },
    );
    loaded = true;
    const { stdout } = await exec("launchctl", ["kickstart", "-p", service], {
      timeout: 10_000,
    });
    const launcherPid = Number(stdout.trim());
    if (!Number.isSafeInteger(launcherPid) || launcherPid <= 1)
      throw new Error("无法确认后台启动器身份");
    const deadline = Date.now() + 10_000;
    while (!fs.existsSync(stateFile) && Date.now() < deadline) await delay(50);
    if (!fs.existsSync(stateFile))
      throw new Error("后台启动器未返回候选进程身份");
    const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    if (
      state.launcherPid !== launcherPid ||
      !Number.isSafeInteger(state.pid) ||
      state.pid <= 1
    )
      throw new Error("后台候选进程身份不匹配");
    const record = {
      operationId,
      service,
      launcherPid,
      pid: state.pid,
      appIdentifier: prepared.identifier,
    };
    if (!probe)
      fs.writeFileSync(prepared.record, JSON.stringify(record), {
        mode: 0o600,
        flag: "wx",
      });
    const child = new EventEmitter();
    child.pid = state.pid;
    child.signalCode = null;
    child.manager = { kind: "launchd", ...record };
    Object.defineProperty(child, "exitCode", {
      get() {
        const latest = JSON.parse(fs.readFileSync(stateFile, "utf8"));
        if (Number.isInteger(latest.exitCode)) return latest.exitCode;
        try {
          process.kill(launcherPid, 0);
          return null;
        } catch (error) {
          if (error.code === "ESRCH") return 1;
          throw error;
        }
      },
    });
    child.stop = async () => {
      if (!probe) return stopManagedRuntimeProcess(root);
      await exec("launchctl", ["bootout", service], { timeout: 15_000 });
    };
    return child;
  } catch (error) {
    if (loaded)
      await exec("launchctl", ["bootout", service], { timeout: 15_000 }).catch(
        () => {},
      );
    throw error;
  } finally {
    fs.rmSync(requestFile, { force: true });
  }
}

export async function checkRuntimeProcessNetwork(root, prepared, databaseURL) {
  if (!prepared) return;
  const target = new URL(databaseURL);
  const host = target.hostname.replace(/^\[|\]$/gu, "");
  const port = Number(target.port || 5432);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("无法确认独立后台进程的数据库连接目标");
  const child = await startRuntimeProcess(root, {
    prepared,
    operationId: randomUUID(),
    executable: "",
    cwd: root,
    env: {},
    logFile: path.join(prepared.directory, "network-check.log"),
    probe: { host, port },
  });
  try {
    const deadline = Date.now() + 65_000;
    while (child.exitCode === null && Date.now() < deadline) await delay(100);
    if (child.exitCode !== 0)
      throw new Error(
        "ERP 独立后台进程无法连接开发数据库；请核对本地网络权限与目标连通性。原后端未停止",
      );
  } finally {
    await child.stop();
  }
}
