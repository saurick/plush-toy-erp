import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter, once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { stripVTControlCharacters } from "node:util";
import {
  readRuntimeConsole,
  showRuntimeConsole,
  presentRuntimeConsole,
  takeOverRuntimeDesktopViewers,
  formatRuntimeLogLine,
  readRuntimeLogPlan,
  followRuntimeConsole,
} from "./local-runtime-console.mjs";

test("default viewer hides DEBUG, explicit debug shows it, and startup header is not duplicated", async (t) => {
  const root = fixture(t);
  const raw =
    "DEBUG msg=config-debug-fixture\n" +
    JSON.stringify({ level: "DEBUG", msg: "private-debug-fixture" }) +
    "\n" +
    JSON.stringify({ level: "INFO", msg: "startup-visible" }) +
    "\n";
  activate(root, { text: raw });
  for (const showDebug of [false, true]) {
    const output = [];
    const controller = new AbortController();
    await presentRuntimeConsole(root, {
      interactive: true,
      env: {},
      showDebug,
      write: (line) => output.push(line),
      follow: (target, options) =>
        followRuntimeConsole(target, {
          ...options,
          signal: controller.signal,
          color: false,
          pause: async () => controller.abort(),
        }),
    });
    const text = output.join("\n");
    assert.equal(text.includes("private-debug-fixture"), showDebug);
    assert.equal(text.includes("config-debug-fixture"), showDebug);
    assert(text.includes("startup-visible"));
    assert.equal(
      output.filter((line) => line.includes("后端正在运行；")).length,
      1,
    );
    assert.equal(
      fs.readFileSync(readRuntimeConsole(root).logFile, "utf8"),
      raw,
    );
  }
});

test("connection target fields stand out without changing plain output", () => {
  const record = JSON.stringify({
    level: "INFO",
    msg: "postgres connecting",
    address: "db.example:5432",
    database: "erp",
    tls_policy: "required",
  });
  const colored = formatRuntimeLogLine(record, { color: true });
  assert(colored.includes("address=\u001b[1;36mdb.example:5432\u001b[0m"));
  assert.equal(stripVTControlCharacters(colored), formatRuntimeLogLine(record));
});

function fixture(t, name = "project") {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "plush-console-"));
  const root = path.join(temporary, name);
  fs.mkdirSync(path.join(root, "server"), { recursive: true });
  fs.mkdirSync(path.join(root, "config"));
  fs.writeFileSync(
    path.join(root, "config/dev-ports.env"),
    "DEV_PROJECT_ID=console-test\nDEV_WEB_PORT=5175\nDEV_HTTP_PORT=8300\nDEV_STYLE_PORT=6175\nDEV_AUX_PORT_START=15200\n",
  );
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  return root;
}

function activate(
  root,
  {
    id = randomUUID(),
    pid = process.pid,
    text = "console fixture\n",
    startupLogEndOffset = Buffer.byteLength(text),
  } = {},
) {
  const logFile = `output/dev-workbench/database-migration-runtime/${id}.log`;
  fs.mkdirSync(path.dirname(path.join(root, logFile)), { recursive: true });
  fs.writeFileSync(path.join(root, logFile), text, { mode: 0o600 });
  const active = {
    id,
    health: true,
    ready: true,
    business: true,
    migrationVersion: "20260927072615",
    runtime: {
      pid,
      logFile,
      startedAt: new Date().toISOString(),
      startupLogEndOffset,
    },
  };
  const file = path.join(
    root,
    "output/dev-workbench/runtime-bundles/active.json",
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(active));
  fs.renameSync(`${file}.tmp`, file);
  return active;
}

test("Kratos JSON becomes readable logs without losing diagnostics or trace fields", () => {
  const entry = {
    ts: "2026-10-01T10:00:00+08:00",
    level: "ERROR",
    caller: "data/data.go:209",
    msg: "连接失败\n请检查配置",
    query: 'SELECT "id" FROM "orders" WHERE "id" > $1',
    request_id: "req-42",
    "trace.id": "trace-42",
    "task.id": 42,
    trace_sampled: false,
    "span.id": "",
    recoverable: false,
    detail: { code: "db_unavailable" },
  };
  const formatted = formatRuntimeLogLine(JSON.stringify(entry));
  assert(
    formatted.startsWith(
      `${new Date(entry.ts).toLocaleTimeString("zh-CN", { hour12: false })} ERROR`,
    ),
  );
  for (const text of [
    "data/data.go:209",
    "连接失败\n  请检查配置",
    entry.query,
    "request_id=req-42",
    "trace.id=trace-42",
    "task.id=42",
    "recoverable=false",
    'detail={"code":"db_unavailable"}',
  ])
    assert(formatted.includes(text), text);
  assert(!formatted.includes('\\"'));
  assert(!formatted.includes("trace_sampled=false"));
  assert(!formatted.includes("span.id="));
  assert(!formatted.includes("\u001b"));
  assert(
    formatRuntimeLogLine(JSON.stringify(entry), { color: true }).includes(
      "\u001b[31mERROR",
    ),
  );
  const colored = formatRuntimeLogLine(JSON.stringify(entry), { color: true });
  assert(colored.includes("\u001b[1;31m连接失败\n  请检查配置\u001b[0m"));
  assert.equal(stripVTControlCharacters(colored), formatted);
  const warning = formatRuntimeLogLine(
    JSON.stringify({ level: "WARN", msg: "服务尚未就绪" }),
    { color: true },
  );
  assert(warning.includes("\u001b[1;33m服务尚未就绪\u001b[0m"));
  for (const line of [
    "panic: startup failed",
    "DEBUG msg=config loaded",
    '{"partial":',
    "null",
    '{"level":"custom","msg":"retained"}',
  ])
    assert.equal(formatRuntimeLogLine(line), line);
  const hostile = formatRuntimeLogLine(
    JSON.stringify({
      level: "ERROR",
      msg: "postgres://app:private-password@localhost/db\u001b]52;c;clipboard\u0007",
    }),
  );
  assert(!hostile.includes("private-password"));
  assert(!hostile.includes("\u001b"));
  assert(!hostile.includes("clipboard"));
});

test("opening a long-running service replays its full startup and recent output without repeating hours of SQL", (t) => {
  const root = fixture(t);
  const startup = Array.from(
    { length: 120 },
    (_, index) => `启动步骤-${index}\n`,
  ).join("");
  const history = Array.from(
    { length: 150 },
    (_, index) => `历史SQL-${index}-${"字段".repeat(1200)}\n`,
  ).join("");
  const recent = Array.from(
    { length: 60 },
    (_, index) => `最近日志-${index}-${"值".repeat(1200)}\n`,
  ).join("");
  const active = activate(root, {
    text: startup + history + recent,
    startupLogEndOffset: Buffer.byteLength(startup),
  });
  const runtime = readRuntimeConsole(root);
  const plan = readRuntimeLogPlan(runtime);
  assert.equal(plan.start, 0);
  assert.equal(plan.startupEnd, Buffer.byteLength(startup));
  const content = fs.readFileSync(path.join(root, active.runtime.logFile));
  const replay = content.subarray(plan.start, plan.startupEnd).toString("utf8");
  const tail = content.subarray(plan.followStart).toString("utf8");
  assert.equal(replay, startup);
  assert.equal(tail.split("\n").filter(Boolean).length, 50);
  assert(tail.startsWith("最近日志-10-"));
  assert(!tail.includes("历史SQL"));
  assert(plan.skippedBytes > Buffer.byteLength(history));
});

test("startup checkpoints do not split records or include an earlier failed process during recovery", (t) => {
  const root = fixture(t);
  const previous = "原候选失败\n";
  const startup = "恢复版本启动\n";
  const text = `${previous}${startup}尚未写完的记录`;
  const active = activate(root, {
    text,
    startupLogEndOffset: Buffer.byteLength(previous + startup) + 3,
  });
  const runtime = {
    ...readRuntimeConsole(root),
    logStartOffset: Buffer.byteLength(previous),
  };
  const plan = readRuntimeLogPlan(runtime);
  const content = fs.readFileSync(path.join(root, active.runtime.logFile));
  assert.equal(
    content.subarray(plan.start, plan.startupEnd).toString("utf8"),
    startup,
  );
  assert.equal(
    content.subarray(plan.followStart).toString("utf8"),
    "尚未写完的记录",
  );
  assert.equal(plan.skippedBytes, 0);
});

test("log viewing requires a verified runtime and rejects outside or symbolic-link logs", (t) => {
  const root = fixture(t);
  const active = activate(root);
  const activeFile = path.join(
    root,
    "output/dev-workbench/runtime-bundles/active.json",
  );
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
    platform: "darwin",
    env: {},
    executable: "/bin/echo",
    write: () => {},
    exists: () => true,
    inspect: async (command, args) => {
      calls.push([command, args]);
      return {
        stdout:
          calls.length > 2
            ? `321 node ${path.join(root, "scripts/local-runtime-console.mjs")} --follow --desktop\n`
            : "",
      };
    },
  });
  assert.equal(result.opened, true);
  assert.equal(calls[1][0], "/usr/bin/open");
  assert.deepEqual(calls[1][1].slice(0, 2), ["-a", "/Applications/iTerm.app"]);
  const commandFile = calls[1][1][2];
  assert.equal(fs.statSync(commandFile).mode & 0o777, 0o700);
  const stdout = execFileSync("/bin/sh", [commandFile], {
    env: { SHELL: "/usr/bin/true" },
    encoding: "utf8",
  });
  assert.equal(
    stdout.trim(),
    `${path.join(root, "scripts/local-runtime-console.mjs")} --follow --desktop`,
  );
  calls.length = 0;
  const reused = await showRuntimeConsole(root, {
    platform: "darwin",
    env: {},
    write: () => {},
    inspect: async (command, args) => {
      calls.push([command, args]);
      return {
        stdout: ` 321 /usr/local/bin/node ${path.join(root, "scripts/local-runtime-console.mjs")} --follow --desktop\n`,
      };
    },
  });
  assert.equal(reused.reused, true);
  assert.equal(calls.length, 1);
});

test("CI and SSH never open a desktop terminal; explicit background never follows logs", async (t) => {
  const root = fixture(t);
  activate(root);
  for (const env of [{ CI: "true" }, { SSH_CONNECTION: "fixture" }]) {
    await showRuntimeConsole(root, {
      platform: "darwin",
      env,
      write: () => {},
      inspect: () => assert.fail("headless launch"),
    });
  }
  await presentRuntimeConsole(root, {
    interactive: true,
    background: true,
    write: () => {},
    follow: () => assert.fail("background must return"),
    show: () => assert.fail("background must not open a terminal"),
  });
});

test("a manual restart in a desktop terminal remains discoverable for later Codex startups", async (t) => {
  const root = fixture(t);
  activate(root);
  let spawned;
  await presentRuntimeConsole(root, {
    interactive: true,
    env: { ITERM_SESSION_ID: "local-terminal" },
    write: () => {},
    takeOver: async () => ({ stopped: 0 }),
    follow: () => assert.fail("the desktop child owns the log view"),
    spawnConsole: (command, args, options) => {
      spawned = { command, args, options };
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("close", 0, null));
      return child;
    },
  });
  assert.equal(spawned.command, process.execPath);
  assert.deepEqual(spawned.args, [
    path.join(root, "scripts/local-runtime-console.mjs"),
    "--follow",
    "--desktop",
  ]);
  assert.deepEqual(spawned.options, { stdio: "inherit" });
  let follows = 0;
  await presentRuntimeConsole(root, {
    interactive: true,
    desktop: true,
    env: { ITERM_SESSION_ID: "local-terminal" },
    write: () => {},
    spawnConsole: () =>
      assert.fail("desktop viewers must not recursively spawn"),
    follow: async () => {
      follows++;
    },
  });
  assert.equal(follows, 1);
});

test("manual restarts take over logs in the requested terminal even when a resident viewer exists", async (t) => {
  const root = fixture(t);
  activate(root);
  const lines = [];
  const calls = [];
  await presentRuntimeConsole(root, {
    interactive: true,
    env: { ITERM_SESSION_ID: "local-terminal" },
    write: (line) => lines.push(line),
    takeOver: async (receivedRoot) => {
      assert.equal(receivedRoot, root);
      calls.push("take-over");
      return { stopped: 1 };
    },
    follow: () => assert.fail("the current terminal child owns the log view"),
    spawnConsole: (command, args, options) => {
      calls.push("follow-here");
      assert.equal(command, process.execPath);
      assert.deepEqual(args, [
        path.join(root, "scripts/local-runtime-console.mjs"),
        "--follow",
        "--desktop",
      ]);
      assert.deepEqual(options, { stdio: "inherit" });
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("close", 0, null));
      return child;
    },
  });
  assert.deepEqual(calls, ["take-over", "follow-here"]);
  assert(lines.some((line) => line.includes("当前终端已接管")));
});

test("failed log takeover still follows in the current terminal without touching the backend", async (t) => {
  const root = fixture(t);
  activate(root);
  const lines = [];
  let spawned = false;
  await presentRuntimeConsole(root, {
    interactive: true,
    env: { TERM_PROGRAM: "Apple_Terminal" },
    write: (line) => lines.push(line),
    takeOver: async () => {
      throw new Error("identity changed");
    },
    spawnConsole: () => {
      spawned = true;
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("close", 0, null));
      return child;
    },
  });
  assert.equal(spawned, true);
  assert(lines.some((line) => line.includes("当前终端继续显示日志")));
  assert.doesNotThrow(() => process.kill(process.pid, 0));
});

test("log takeover verifies exact project command and start time before SIGTERM", async (t) => {
  const root = fixture(t);
  const command = `node ${path.join(root, "scripts/local-runtime-console.mjs")} --follow --desktop`;
  const killed = [];
  await takeOverRuntimeDesktopViewers(root, {
    inspect: async (_, args) => ({
      stdout: args.includes("-axo")
        ? `321 ${command}\n322 node /foreign/scripts/local-runtime-console.mjs --follow --desktop\n323 echo ${path.join(root, "scripts/local-runtime-console.mjs")} --follow --desktop\n`
        : `Thu Oct 1 17:00:00 2026 ${command}\n`,
    }),
    alive: (pid) => !killed.includes(pid),
    kill: (pid) => killed.push(pid),
    pause: () => assert.fail("the stopped viewer is already gone"),
  });
  assert.deepEqual(killed, [321]);
  let identities = 0;
  await assert.rejects(
    takeOverRuntimeDesktopViewers(root, {
      inspect: async (_, args) => ({
        stdout: args.includes("-axo")
          ? `321 ${command}\n`
          : `Thu Oct 1 17:00:0${identities++} 2026 ${command}\n`,
      }),
      alive: () => true,
      kill: () => assert.fail("a reused PID must be preserved"),
    }),
    /启动时间已变化/u,
  );
});

test(
  "a real desktop log viewer exits on takeover while the backend remains alive",
  { timeout: 15_000 },
  async (t) => {
    const root = fixture(t);
    activate(root, { text: "takeover-service-log\n" });
    const entry = path.join(root, "scripts/local-runtime-console.mjs");
    fs.mkdirSync(path.dirname(entry), { recursive: true });
    const module = new URL("./local-runtime-console.mjs", import.meta.url).href;
    fs.writeFileSync(
      entry,
      `import {presentRuntimeConsole} from ${JSON.stringify(module)}; await presentRuntimeConsole(${JSON.stringify(root)}, {interactive:true,desktop:true,env:{}});\n`,
    );
    const child = spawn(process.execPath, [entry, "--follow", "--desktop"], {
      cwd: path.join(root, "server"),
      stdio: ["ignore", "pipe", "pipe"],
    });
    t.after(() => {
      if (child.exitCode === null && !child.signalCode) child.kill("SIGTERM");
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    const deadline = Date.now() + 5000;
    while (!output.includes("takeover-service-log")) {
      if (Date.now() > deadline)
        assert.fail("the original viewer did not start");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const closed = once(child, "exit");
    const result = await takeOverRuntimeDesktopViewers(root);
    assert.equal(result.stopped, 1);
    assert.deepEqual(await closed, [0, null]);
    assert(output.includes("未停止后端服务"));
    assert.doesNotThrow(() => process.kill(process.pid, 0));
  },
);

test(
  "a real log follower reads appended logs, switches after restart and leaves the service alive on Ctrl+C",
  { timeout: 15_000 },
  async (t) => {
    const root = fixture(t);
    const startup = `first-service-log\n${Array.from({ length: 80 }, (_, index) => `boot-progress-${index}\n`).join("")}`;
    const first = activate(root, { text: startup });
    const module = new URL("./local-runtime-console.mjs", import.meta.url).href;
    const script = `import { presentRuntimeConsole } from ${JSON.stringify(module)}; await presentRuntimeConsole(${JSON.stringify(root)}, { interactive: true, env: {} });`;
    const child = spawn(
      process.execPath,
      ["--input-type=module", "-e", script],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    t.after(() => {
      if (child.exitCode === null && !child.signalCode) child.kill("SIGKILL");
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    const waitFor = async (text) => {
      const deadline = Date.now() + 5000;
      while (!output.includes(text)) {
        if (Date.now() >= deadline) assert.fail(`Missing ${text}: ${output}`);
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    };
    await waitFor("first-service-log");
    await waitFor("boot-progress-79");
    assert.equal(output.split("first-service-log").length - 1, 1);
    fs.appendFileSync(
      path.join(root, first.runtime.logFile),
      "first-appended-log\n",
    );
    await waitFor("first-appended-log");
    activate(root, {
      text: `second-service-log\n${JSON.stringify({ level: "INFO", msg: "HTTP 已监听", "service.name": "plush-test", "service.version": "local-test" })}\n`,
    });
    await waitFor("second-service-log");
    await waitFor("INFO  HTTP 已监听");
    assert(output.includes("service.name=plush-test"));
    assert(!output.includes('"level":"INFO"'));
    const afterRestart = output.length;
    fs.appendFileSync(
      path.join(root, first.runtime.logFile),
      "old-log-must-not-follow\n",
    );
    const closed = once(child, "exit");
    child.kill("SIGINT");
    const [code, signal] = await closed;
    assert.equal(code, 0);
    assert.equal(signal, null);
    assert(!output.slice(afterRestart).includes("old-log-must-not-follow"));
    assert(output.includes("未停止后端服务"));
    assert.doesNotThrow(() => process.kill(process.pid, 0));
  },
);
