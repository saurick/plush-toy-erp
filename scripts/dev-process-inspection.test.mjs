import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  findListenerPids,
  parseDarwinListenerPids,
  readProcessCwd,
  runProcessInspection,
} from "./dev-process-inspection.mjs";

const execFileAsync = promisify(execFile);
const stopScript = path.join(import.meta.dirname, "dev-listener-stop.sh");
const header = ",state,";
const row = (
  address,
  pid,
  { protocol = "tcp4", state = "Listen", name = "node" } = {},
) => `${name}.${pid},,\n${protocol} ${address}<->*.*,${state},`;

test("macOS socket table finds exact listening ports across IPv4/IPv6 and spaced process names", () => {
  const output = [
    header,
    row("*.8300", 42, { protocol: "tcp6" }),
    row("127.0.0.1:8300", 42),
    row("::1.8300", 73, { protocol: "tcp6", name: "Google Chrome" }),
    row("*.18300", 99),
    row("127.0.0.1:8300", 100, { state: "Established" }),
  ].join("\n");
  assert.deepEqual(parseDarwinListenerPids(output, 8300), [42, 73]);
  assert.deepEqual(parseDarwinListenerPids(output, 8301), []);
});

test("socket snapshots never inherit a PID across unrecognized records", () => {
  assert.throws(
    () => parseDarwinListenerPids(`${header}\ntcp6 *.8300<->*.*,Listen,`, 8300),
    /未停止任何服务/u,
  );
  assert.throws(
    () =>
      parseDarwinListenerPids(
        `${header}\n${row("*.18300", 42)}\nunknown\ntcp6 *.8300<->*.*,Listen,`,
        8300,
      ),
    /未停止任何服务/u,
  );
});

test("empty or unknown socket tables and unidentified listeners fail closed", () => {
  for (const output of [
    "",
    "unexpected output",
    `${header}\n${row("*.8300", 0)}`,
    `${header}\n${row("*.8300", "unknown")}`,
  ]) {
    assert.throws(
      () => parseDarwinListenerPids(output, 8300),
      /未停止任何服务/u,
    );
  }
});

test("Darwin listener discovery uses the socket table without a global lsof scan", async () => {
  const calls = [];
  assert.deepEqual(
    await findListenerPids(8300, {
      platform: "darwin",
      inspect: async (...args) => {
        calls.push(args);
        return { stdout: `${header}\n${row("*.8300", 42)}` };
      },
    }),
    [42],
  );
  assert.deepEqual(calls, [
    ["nettop", ["-L", "1", "-n", "-m", "tcp", "-J", "state"]],
  ]);
});

test("Linux discovery distinguishes no listener from failed or malformed inspection", async () => {
  assert.deepEqual(
    await findListenerPids(8300, {
      platform: "linux",
      inspect: async () => ({ stdout: "p42\nf3\np42\n" }),
    }),
    [42],
  );
  assert.deepEqual(
    await findListenerPids(8300, {
      platform: "linux",
      inspect: async () => {
        throw Object.assign(new Error("no match"), {
          code: 1,
          stdout: "",
          stderr: "",
        });
      },
    }),
    [],
  );
  for (const failure of [
    new Error("timeout"),
    Object.assign(new Error("failed"), {
      code: 1,
      stderr: "permission denied",
    }),
  ]) {
    await assert.rejects(
      findListenerPids(8300, {
        platform: "linux",
        inspect: async () => {
          throw failure;
        },
      }),
    );
  }
  await assert.rejects(
    findListenerPids(8300, {
      platform: "linux",
      inspect: async () => ({ stdout: "" }),
    }),
  );
  await assert.rejects(findListenerPids("8300;exit"), /无效/u);
});

test("a stuck inspection that ignores SIGTERM is bounded and terminated", async () => {
  const started = Date.now();
  let pid;
  await assert.rejects(
    runProcessInspection(
      process.execPath,
      [
        "-e",
        "console.log(process.pid); process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)",
      ],
      { timeoutMs: 300 },
    ),
    (error) => {
      pid = Number(error.stdout.trim());
      return /进程检查超时/u.test(error.message);
    },
  );
  assert.ok(Date.now() - started < 2000);
  assert.ok(pid > 1);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
});

test("missing inspection tools report a failure", async () => {
  await assert.rejects(
    runProcessInspection("/nonexistent/plush-inspection", []),
    { code: "ENOENT" },
  );
});

async function openListener(t, cwd) {
  const child = spawn(
    process.execPath,
    [
      "-e",
      "const server=require('node:net').createServer(); server.listen(0,'127.0.0.1',()=>console.log(server.address().port));",
    ],
    { cwd, stdio: ["ignore", "pipe", "pipe"] },
  );
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
  });
  const [chunk] = await once(child.stdout, "data");
  return { child, port: Number(String(chunk).trim()) };
}

function workspace(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-listener-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test("backend stop ends a real listener owned by its workspace", async (t) => {
  const root = workspace(t);
  const { child, port } = await openListener(t, root);
  assert.deepEqual(await findListenerPids(port), [child.pid]);
  assert.equal(await readProcessCwd(child.pid), realpathSync(root));
  await execFileAsync("bash", [stopScript, root, String(port)], {
    timeout: 8000,
  });
  assert.ok(child.exitCode !== null || child.signalCode !== null);
});

test("a foreign listener prevents stopping any member of a requested port group", async (t) => {
  const root = workspace(t);
  const foreignRoot = workspace(t);
  const owned = await openListener(t, root);
  const foreign = await openListener(t, foreignRoot);
  await assert.rejects(
    execFileAsync(
      "bash",
      [stopScript, root, String(owned.port), String(foreign.port)],
      { timeout: 8000 },
    ),
    /foreign process/u,
  );
  process.kill(owned.child.pid, 0);
  process.kill(foreign.child.pid, 0);
});

test("failed listener discovery is not treated as an unused port by the shell entry", async (t) => {
  const root = workspace(t);
  const { child, port } = await openListener(t, root);
  const bin = path.join(root, "bin");
  mkdirSync(bin);
  const tool = process.platform === "darwin" ? "nettop" : "lsof";
  writeFileSync(
    path.join(bin, tool),
    "#!/bin/sh\necho 'inspection unavailable' >&2\nexit 2\n",
    { mode: 0o755 },
  );
  await assert.rejects(
    execFileAsync("bash", [stopScript, root, String(port)], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      timeout: 8000,
    }),
    /无法完成/u,
  );
  process.kill(child.pid, 0);
});
