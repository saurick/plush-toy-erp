import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import {
  launchdPlist,
  prepareRuntimeProcess,
  runtimeLaunchdJob,
  runtimeProcessPaths,
  startRuntimeProcess,
  stopManagedRuntimeProcess,
} from "./local-runtime-process.mjs";

const exec = promisify(execFile);
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "plush-runtime-process-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("macOS jobs have workspace identity and require one explicit launch", (t) => {
  const root = fixture(t);
  const paths = runtimeProcessPaths(root);
  assert.deepEqual(runtimeProcessPaths(root), paths);
  assert.notEqual(runtimeProcessPaths(fixture(t)).identifier, paths.identifier);
  const job = runtimeLaunchdJob(
    paths,
    randomUUID(),
    "/private/request.json",
    "/private/runtime.log",
  );
  assert.equal(job.RunAtLoad, false);
  assert.equal(job.KeepAlive, false);
  assert.deepEqual(job.AssociatedBundleIdentifiers, [paths.identifier]);
  assert.equal(job.ProgramArguments[1], "/private/request.json");
  assert.equal(job.EnvironmentVariables, undefined);
  assert.equal(job.StartInterval, undefined);
  assert.equal(job.StartCalendarInterval, undefined);
  assert.equal(job.UserName, undefined);
  assert.throws(
    () => runtimeLaunchdJob(paths, "../foreign", "", ""),
    /操作编号/u,
  );
  assert.match(
    launchdPlist({ path: 'a & <b> "c"', enabled: false }),
    /a &amp; &lt;b&gt; &quot;c&quot;/u,
  );
});

test("a foreign launchd record cannot stop another service", async (t) => {
  const root = fixture(t);
  const paths = runtimeProcessPaths(root);
  fs.mkdirSync(paths.directory, { recursive: true });
  fs.writeFileSync(
    paths.record,
    JSON.stringify({ operationId: randomUUID(), service: "gui/501/foreign" }),
  );
  await assert.rejects(
    stopManagedRuntimeProcess(root, { platform: "darwin" }),
    /归属不明/u,
  );
  assert.equal(fs.existsSync(paths.record), true);
});

test("network preparation never replaces an active launcher's code", async (t) => {
  const root = fixture(t);
  const paths = runtimeProcessPaths(root);
  const installed = path.join(paths.app, "Contents/MacOS/launcher");
  fs.mkdirSync(path.dirname(installed), { recursive: true });
  fs.writeFileSync(installed, "active-launcher");
  fs.writeFileSync(
    path.join(paths.directory, "launcher.json"),
    JSON.stringify({ fingerprint: "old" }),
  );
  fs.writeFileSync(paths.record, JSON.stringify({ operationId: randomUUID() }));
  await assert.rejects(
    startRuntimeProcess(root, {
      prepared: { ...paths, fingerprint: "new" },
      operationId: randomUUID(),
      executable: "",
      cwd: root,
      env: {},
      logFile: path.join(root, "probe.log"),
      probe: { host: "127.0.0.1", port: 1 },
    }),
    /启动器内容已变化/u,
  );
  assert.equal(fs.readFileSync(installed, "utf8"), "active-launcher");
  assert.equal(fs.existsSync(paths.record), true);
});

test("non-macOS keeps the existing direct process lifecycle", async (t) => {
  const root = fixture(t);
  assert.equal(await prepareRuntimeProcess(root, { platform: "linux" }), null);
  const child = await startRuntimeProcess(root, {
    prepared: null,
    operationId: randomUUID(),
    executable: process.execPath,
    arguments: ["-e", "console.log('started');setInterval(()=>{},1000)"],
    cwd: root,
    env: {},
    logFile: path.join(root, "runtime.log"),
  });
  t.after(() => child.stop());
  const exited = new Promise((resolve) => child.once("exit", resolve));
  await child.stop();
  await exited;
  await child.stop();
  assert.equal(child.signalCode, "SIGTERM");
  await assert.rejects(
    startRuntimeProcess(root, {
      prepared: null,
      executable: path.join(root, "missing"),
      cwd: root,
      env: {},
      logFile: path.join(root, "missing.log"),
    }),
    { code: "ENOENT" },
  );
});

test(
  "native launcher preserves exit results, deletes credentials and forwards stop",
  { skip: process.platform !== "darwin" },
  async (t) => {
    const root = fixture(t);
    const binary = path.join(root, "launcher");
    await exec(
      "xcrun",
      [
        "swiftc",
        new URL("local-runtime-launcher.swift", import.meta.url).pathname,
        "-o",
        binary,
      ],
      { timeout: 60_000 },
    );
    for (const mode of ["exit", "stop", "probe-ok", "probe-refused"]) {
      const request = path.join(root, `${mode}.request.json`);
      const stateFile = path.join(root, `${mode}.state.json`);
      let probe;
      if (mode.startsWith("probe-")) {
        const listener = net.createServer((socket) => socket.end());
        await new Promise((resolve) =>
          listener.listen(0, "127.0.0.1", resolve),
        );
        t.after(() => listener.close());
        probe = { probeHost: "127.0.0.1", probePort: listener.address().port };
        if (mode === "probe-refused")
          await new Promise((resolve) => listener.close(resolve));
      }
      const args =
        mode === "exit"
          ? [
              "-e",
              "if(process.env.TEST_SECRET!=='value'||process.cwd()!==process.env.TEST_CWD)process.exit(9);process.exit(7)",
            ]
          : ["-e", "setInterval(()=>{},1000)"];
      fs.writeFileSync(
        request,
        JSON.stringify({
          executable: process.execPath,
          arguments: args,
          cwd: root,
          environment: {
            TEST_SECRET: "value",
            TEST_CWD: fs.realpathSync(root),
          },
          stateFile,
          ...probe,
        }),
        { mode: 0o600 },
      );
      const launcher = spawn(binary, [request], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      launcher.stdout.on("data", (data) => {
        output += data;
      });
      launcher.stderr.on("data", (data) => {
        output += data;
      });
      const exited = new Promise((resolve) =>
        launcher.once("exit", (code) => resolve(code)),
      );
      t.after(() => launcher.kill("SIGKILL"));
      const deadline = Date.now() + 5000;
      while (!fs.existsSync(stateFile) && Date.now() < deadline)
        await delay(10);
      assert.equal(fs.existsSync(stateFile), true);
      if (mode === "stop") launcher.kill("SIGTERM");
      const code = await Promise.race([
        exited,
        delay(5000).then(() => "timeout"),
      ]);
      assert.equal(
        code,
        { exit: 7, stop: 143, "probe-ok": 0, "probe-refused": 1 }[mode],
      );
      const state = JSON.parse(fs.readFileSync(stateFile));
      assert.equal(state.exitCode, code);
      assert.equal(state.launcherPid, launcher.pid);
      assert.equal(fs.existsSync(request), false);
      assert.equal(fs.statSync(stateFile).mode & 0o777, 0o600);
      assert.equal(output.includes("value"), false);
      assert.throws(() => process.kill(state.pid, 0), { code: "ESRCH" });
    }
  },
);
