import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { sha256File } from "../../lib/file-digest.mjs";

export const hashFile = sha256File;
export const now = () => new Date().toISOString();
export const POSTGRES_IMAGE = "postgres:18.6";
export const STORE_IMAGE =
  "chrislusf/seaweedfs:4.47@sha256:ce9e796f1fe6f06968f4c04bdaf8f678dad9c8acdfef3d244133d71bfa6bf882";
export const SET_NAME = /^plush-set-\d{8}T\d{6}Z-[a-f0-9-]{36}\.tar\.age$/u;
export function requireValue(ok, code) {
  if (!ok) throw new Error(code);
}

export function plainPath(
  value,
  { directory = false, privateOwner = false } = {},
) {
  requireValue(
    typeof value === "string" &&
      path.isAbsolute(value) &&
      path.normalize(value) === value,
    "absolute_normal_path_required",
  );
  requireValue(!/[\r\n,:]/u.test(value), "unsafe_path");
  requireValue(fs.realpathSync(value) === value, "symlink_path_rejected");
  const stat = fs.lstatSync(value);
  requireValue(
    directory ? stat.isDirectory() : stat.isFile(),
    "plain_path_required",
  );
  if (privateOwner)
    requireValue(
      stat.uid === process.getuid() && (stat.mode & 0o077) === 0,
      "private_owner_required",
    );
  return value;
}

export function privateDirectory(value) {
  requireValue(
    path.isAbsolute(value) && path.normalize(value) === value,
    "absolute_normal_path_required",
  );
  for (let cursor = value; ; cursor = path.dirname(cursor)) {
    if (fs.existsSync(cursor))
      requireValue(
        !fs.lstatSync(cursor).isSymbolicLink(),
        "symlink_path_rejected",
      );
    if (cursor === path.dirname(cursor)) break;
  }
  fs.mkdirSync(value, { recursive: true, mode: 0o700 });
  requireValue(
    fs.statSync(value).uid === process.getuid(),
    "private_owner_required",
  );
  fs.chmodSync(value, 0o700);
  return plainPath(value, { directory: true, privateOwner: true });
}

export function atomicJSON(file, value) {
  privateDirectory(path.dirname(file));
  if (fs.existsSync(file)) plainPath(file);
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

// Arguments, output and stderr can contain credentials; diagnostics expose only a stage.
export async function command(
  args,
  { input, inputFile, outputFile, signal, timeout = 120_000 } = {},
) {
  const inputFD = inputFile ? fs.openSync(inputFile, "r") : null;
  const outputFD = outputFile ? fs.openSync(outputFile, "wx", 0o600) : null;
  let child;
  try {
    child = spawn(args[0], args.slice(1), {
      stdio: [inputFD ?? "pipe", outputFD ?? "pipe", "pipe"],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", COPYFILE_DISABLE: "1" },
    });
    let stdout = Buffer.alloc(0);
    let overflow = false;
    let forcedStop;
    const stop = () => {
      child.kill("SIGTERM");
      forcedStop ??= setTimeout(() => child.kill("SIGKILL"), 5000);
    };
    signal?.addEventListener("abort", stop, { once: true });
    if (signal?.aborted) stop();
    child.stdout?.on("data", (part) => {
      stdout = Buffer.concat([stdout, part]);
      if (stdout.length > 16 * 1024 * 1024) {
        overflow = true;
        stop();
      }
    });
    child.stderr.resume();
    const timer = setTimeout(stop, timeout);
    const killTimer = setTimeout(() => child.kill("SIGKILL"), timeout + 5000);
    const result = await new Promise((resolve) => {
      child.once("error", () => resolve(-1));
      child.once("close", (code) => resolve(code));
      child.stdin?.on("error", () => {});
      child.stdin?.end(input);
    });
    clearTimeout(timer);
    clearTimeout(killTimer);
    clearTimeout(forcedStop);
    signal?.removeEventListener("abort", stop);
    requireValue(
      result === 0 && !overflow && !signal?.aborted,
      signal?.aborted
        ? "interrupted"
        : `command_failed:${args[0]}:${args[1] ?? ""}`,
    );
    return stdout.toString("utf8").trim();
  } finally {
    if (inputFD !== null) fs.closeSync(inputFD);
    if (outputFD !== null) fs.closeSync(outputFD);
  }
}

export const inspect = async (id, run = command) =>
  JSON.parse(await run(["docker", "inspect", id]))[0];
export async function waitFor(check, { signal, attempts = 60 } = {}) {
  for (let n = 0; n < attempts; n++) {
    requireValue(!signal?.aborted, "interrupted");
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("readiness_timeout");
}

// Remove only containers created by this operation, including their anonymous volumes.
export async function removeContainers(names, run = command) {
  for (const name of names) {
    const ids = await run([
      "docker",
      "ps",
      "-aq",
      "--filter",
      `name=^/${name}$`,
    ]);
    if (!ids) continue;
    const before = await inspect(name, run);
    const volumes = before.Mounts.filter((m) => m.Type === "volume").map(
      (m) => m.Name,
    );
    await run(["docker", "rm", "--force", "--volumes", name]);
    requireValue(
      !(await run(["docker", "ps", "-aq", "--filter", `name=^/${name}$`])),
      "container_cleanup_failed",
    );
    const remaining = (await run(["docker", "volume", "ls", "--quiet"])).split(
      "\n",
    );
    requireValue(
      volumes.every((v) => !remaining.includes(v)),
      "volume_cleanup_failed",
    );
  }
}
