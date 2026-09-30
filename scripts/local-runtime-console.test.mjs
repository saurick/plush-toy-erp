import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter, once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readRuntimeConsole, showRuntimeConsole, presentRuntimeConsole } from "./local-runtime-console.mjs";

function fixture(t, name = "project") {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "plush-console-"));
  const root = path.join(temporary, name);
  fs.mkdirSync(path.join(root, "server"), { recursive: true });
  fs.mkdirSync(path.join(root, "config"));
  fs.writeFileSync(path.join(root, "config/dev-ports.env"), "DEV_PROJECT_ID=console-test\nDEV_WEB_PORT=5175\nDEV_HTTP_PORT=8300\nDEV_STYLE_PORT=6175\nDEV_AUX_PORT_START=15200\n");
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  return root;
}

function activate(root, { id = randomUUID(), pid = process.pid, text = "console fixture\n" } = {}) {
  const logFile = `output/dev-workbench/database-migration-runtime/${id}.log`;
  fs.mkdirSync(path.dirname(path.join(root, logFile)), { recursive: true });
  fs.writeFileSync(path.join(root, logFile), text, { mode: 0o600 });
  const active = { id, health: true, ready: true, business: true, migrationVersion: "20260927072615", runtime: { pid, logFile, startedAt: new Date().toISOString() } };
  const file = path.join(root, "output/dev-workbench/runtime-bundles/active.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(active));
  fs.renameSync(`${file}.tmp`, file);
  return active;
}

test("log viewing requires a verified runtime and rejects outside or symbolic-link logs", (t) => {
  const root = fixture(t);
  const active = activate(root);
  const activeFile = path.join(root, "output/dev-workbench/runtime-bundles/active.json");
  assert.equal(readRuntimeConsole(root).pid, process.pid);
  for (const changed of [
    { ...active, ready: false },
    { ...active, runtime: { ...active.runtime, logFile: "../../private.log" } },
    { ...active, runtime: { ...active.runtime, pid: 1 } },
  ]) {
    fs.writeFileSync(activeFile, JSON.stringify(changed));
    assert.throws(() => readRuntimeConsole(root), /日志运行信息/u);
  }
  fs.writeFileSync(activeFile, JSON.stringify(active));
  const logFile = path.join(root, active.runtime.logFile);
  fs.unlinkSync(logFile);
  fs.symlinkSync(activeFile, logFile);
  assert.throws(() => readRuntimeConsole(root), /普通文件/u);
});

test("desktop opens once, safely quotes paths and returns to a shell after log viewing", async (t) => {
  const root = fixture(t, "项目 ' $(false) `false`");
  const calls = [];
  const result = await showRuntimeConsole(root, {
    platform: "darwin", env: {}, executable: "/bin/echo", write: () => {},
    exists: () => true,
    inspect: async (command, args) => {
      calls.push([command, args]);
      return { stdout: calls.length > 2 ? `321 node ${path.join(root, "scripts/local-runtime-console.mjs")} --follow --desktop\n` : "" };
    },
  });
  assert.equal(result.opened, true);
  assert.equal(calls[1][0], "/usr/bin/open");
  assert.deepEqual(calls[1][1].slice(0, 2), ["-a", "/Applications/iTerm.app"]);
  const commandFile = calls[1][1][2];
  assert.equal(fs.statSync(commandFile).mode & 0o777, 0o700);
  const stdout = execFileSync("/bin/sh", [commandFile], { env: { SHELL: "/usr/bin/true" }, encoding: "utf8" });
  assert.equal(stdout.trim(), `${path.join(root, "scripts/local-runtime-console.mjs")} --follow --desktop`);
  calls.length = 0;
  const reused = await showRuntimeConsole(root, {
    platform: "darwin", env: {}, write: () => {},
    inspect: async (command, args) => {
      calls.push([command, args]);
      return { stdout: ` 321 /usr/local/bin/node ${path.join(root, "scripts/local-runtime-console.mjs")} --follow --desktop\n` };
    },
  });
  assert.equal(reused.reused, true);
  assert.equal(calls.length, 1);
});

test("CI and SSH never open a desktop terminal; explicit background never follows logs", async (t) => {
  const root = fixture(t);
  activate(root);
  for (const env of [{ CI: "true" }, { SSH_CONNECTION: "fixture" }]) {
    await showRuntimeConsole(root, { platform: "darwin", env, write: () => {}, inspect: () => assert.fail("headless launch") });
  }
  await presentRuntimeConsole(root, {
    interactive: true, background: true, write: () => {},
    follow: () => assert.fail("background must return"),
    show: () => assert.fail("background must not open a terminal"),
  });
});

test("a manual restart in a desktop terminal remains discoverable for later Codex startups", async (t) => {
  const root = fixture(t);
  activate(root);
  let spawned;
  await presentRuntimeConsole(root, {
    interactive: true, env: { ITERM_SESSION_ID: "local-terminal" }, write: () => {},
    follow: () => assert.fail("the desktop child owns the log view"),
    spawnConsole: (command, args, options) => {
      spawned = { command, args, options };
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("close", 0, null));
      return child;
    },
  });
  assert.equal(spawned.command, process.execPath);
  assert.deepEqual(spawned.args, [path.join(root, "scripts/local-runtime-console.mjs"), "--follow", "--desktop"]);
  assert.deepEqual(spawned.options, { stdio: "inherit" });
  let follows = 0;
  await presentRuntimeConsole(root, {
    interactive: true, desktop: true, env: { ITERM_SESSION_ID: "local-terminal" }, write: () => {},
    spawnConsole: () => assert.fail("desktop viewers must not recursively spawn"),
    follow: async () => { follows++; },
  });
  assert.equal(follows, 1);
});

test("a real log follower reads appended logs, switches after restart and leaves the service alive on Ctrl+C", { timeout: 15_000 }, async (t) => {
  const root = fixture(t);
  const first = activate(root, { text: "first-service-log\n" });
  const module = new URL("./local-runtime-console.mjs", import.meta.url).href;
  const script = `import { presentRuntimeConsole } from ${JSON.stringify(module)}; await presentRuntimeConsole(${JSON.stringify(root)}, { interactive: true, env: {} });`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", script], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => { if (child.exitCode === null && !child.signalCode) child.kill("SIGKILL"); });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const waitFor = async (text) => {
    const deadline = Date.now() + 5000;
    while (!output.includes(text)) {
      if (Date.now() >= deadline) assert.fail(`Missing ${text}: ${output}`);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  };
  await waitFor("first-service-log");
  fs.appendFileSync(path.join(root, first.runtime.logFile), "first-appended-log\n");
  await waitFor("first-appended-log");
  activate(root, { text: "second-service-log\n" });
  await waitFor("second-service-log");
  const afterRestart = output.length;
  fs.appendFileSync(path.join(root, first.runtime.logFile), "old-log-must-not-follow\n");
  const closed = once(child, "exit");
  child.kill("SIGINT");
  const [code, signal] = await closed;
  assert.equal(code, 0);
  assert.equal(signal, null);
  assert(!output.slice(afterRestart).includes("old-log-must-not-follow"));
  assert(output.includes("未停止后端服务"));
  assert.doesNotThrow(() => process.kill(process.pid, 0));
});
