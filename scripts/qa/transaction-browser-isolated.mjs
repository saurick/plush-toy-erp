#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import {
  readRepositoryIdentity,
  assertRepositoryIdentityEqual,
} from "./lib/repository-identity.mjs";
import {
  buildManagedDatabaseContainerSpec,
  readManagedLoopbackPort,
  MANAGED_DATABASE_LABELS,
} from "./run-gate-with-managed-database.mjs";
import { databaseNameForRun } from "./database-target.mjs";
import { allocateLocalAcceptancePorts } from "./local-acceptance-lifecycle.mjs";
import { verifyDatabaseRuntimeIdentity } from "./browser-write-target.mjs";
import { verifyGoTestJson } from "./verify-go-test-json.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../..");
const STORAGE_IMAGE = "chrislusf/seaweedfs:4.46";

export function verifyTransactionRequestLogs(
  browser,
  logText,
  secretValues = [],
) {
  for (const secret of secretValues)
    assert.ok(
      !logText.includes(secret),
      "runtime log exposed a private credential",
    );
  assert.doesNotMatch(
    logText,
    /Bearer\s+[a-z0-9._-]+|postgres(?:ql)?:\/\/[^\s"']+|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/u,
  );
  const records = logText.split("\n").flatMap((line) => {
    try {
      const record = JSON.parse(line);
      return record.msg === "request completed" ? [record] : [];
    } catch {
      return [];
    }
  });
  const calls = [
    ...browser.browserRPC,
    ...browser.fixtureRPC,
    ...browser.flows.flatMap(({ transportFault }) =>
      transportFault
        ? [{ ...transportFault, code: transportFault.backendCode }]
        : [],
    ),
  ];
  assert.ok(calls.length > 0, "request correlation needs real RPC evidence");
  const counts = { matched: 0, success: 0, rejected: 0 };
  for (const call of calls) {
    assert.match(call.requestID || "", /^[A-Za-z0-9._:-]{1,128}$/u);
    const matches = records.filter(
      (record) => record.request_id === call.requestID,
    );
    assert.equal(
      matches.length,
      1,
      `${call.method} must have one completion log`,
    );
    const [record] = matches;
    assert.equal(record["rpc.method"], call.method);
    assert.equal(record.code, 0, "completed RPC transport must not fail");
    assert.equal(record.rpc_result_code, call.code);
    assert.match(record["trace.id"], /^[a-f0-9]{32}$/u);
    assert.match(record["span.id"], /^[a-f0-9]{16}$/u);
    const outcome = call.code === 0 ? "success" : "rejected";
    assert.equal(record.outcome, outcome);
    counts.matched += 1;
    counts[outcome] += 1;
  }
  return {
    ...counts,
    credentialsAbsent: true,
    traceExport:
      "disabled; propagation and privacy verified by targeted Go tests",
  };
}

export async function stopOwnedService(child, graceMs = 5000) {
  const running = () =>
    child.pid && child.exitCode === null && child.signalCode === null;
  if (!running()) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  await Promise.race([exited, delay(graceMs, undefined, { ref: false })]);
  if (running()) {
    child.kill("SIGKILL");
    await Promise.race([exited, delay(5000, undefined, { ref: false })]);
  }
  assert.ok(!running(), "owned service did not stop");
}

async function snapshot(source, destination) {
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: "0" };
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: source, env, maxBuffer: 32 * 1024 * 1024 },
  );
  for (const file of new Set(stdout.split("\0").filter(Boolean))) {
    const from = path.join(source, file),
      to = path.join(destination, file);
    try {
      await fs.lstat(from);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.cp(from, to, { dereference: false });
  }
  // Independent Git metadata lets the existing identity reader verify the dirty tree.
  await fs.cp(path.join(source, ".git"), path.join(destination, ".git"), {
    recursive: true,
    filter: async (file) =>
      !file.endsWith(".lock") && !(await fs.lstat(file)).isSocket(),
  });
  await execFileAsync("git", ["config", "core.fsmonitor", "false"], {
    cwd: destination,
    env,
  });
  await fs.appendFile(
    path.join(destination, ".git/info/exclude"),
    "\n/node_modules\n/web/node_modules\n",
  );
  for (const dependency of ["node_modules", "web/node_modules"]) {
    await fs.symlink(
      path.join(source, dependency),
      path.join(destination, dependency),
      "dir",
    );
  }
}

export async function runIsolatedTransactionBrowser({
  outputDir,
  signal,
} = {}) {
  const out = path.resolve(
    outputDir ||
      path.join(root, "output/qa/transaction-browser", Date.now().toString()),
  );
  assert.ok(
    out.startsWith(path.join(root, "output/qa/")),
    "evidence must stay under output/qa",
  );
  await fs.mkdir(out, { recursive: true, mode: 0o700 });
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "plush-transaction-e2e-"),
  );
  const source = path.join(directory, "source");
  const report = {
    status: "running",
    steps: [],
    outputDir: out,
    simulatedOnly: true,
  };
  const runID = randomBytes(6).toString("hex"),
    operationId = randomUUID();
  const secrets = {
    database: randomBytes(24).toString("hex"),
    admin: randomBytes(10).toString("hex"),
    roles: randomBytes(10).toString("hex"),
    jwt: randomBytes(32).toString("hex"),
    access: randomBytes(12).toString("hex"),
    storage: randomBytes(24).toString("hex"),
  };
  const database = buildManagedDatabaseContainerSpec({
    operationId,
    password: secrets.database,
    repoRoot: root,
  });
  const storageName = `plush-transaction-s3-${runID}`;
  const ownedNames = [];
  const children = [];
  const logs = [];
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: "0", GOMAXPROCS: "4" };
  const redact = (text) =>
    Object.values(secrets)
      .reduce(
        (value, secret) => value.replaceAll(secret, "<redacted>"),
        String(text),
      )
      .replace(/Bearer\s+[a-z0-9._-]+/giu, "Bearer <redacted>");
  async function command(file, args, options = {}) {
    try {
      const { stdout } = await execFileAsync(file, args, {
        cwd: source,
        env,
        timeout: 180000,
        maxBuffer: 16 * 1024 * 1024,
        signal,
        ...options,
      });
      return stdout.trim();
    } catch (error) {
      if (error.stdout)
        await fs.writeFile(
          path.join(out, "command-failure.log"),
          redact(error.stdout.slice(-64000)),
          { mode: 0o600 },
        );
      throw new Error(
        `${file} failed: ${redact(error.stderr || error.message)}`,
        { cause: undefined },
      );
    }
  }
  async function stage(key, action) {
    process.stdout.write(`[transaction-e2e] ${key}\n`);
    const started = Date.now();
    await action();
    report.steps.push({ key, passed: true, durationMs: Date.now() - started });
  }
  function service(file, args, cwd, runtimeEnv, key) {
    const stream = createWriteStream(path.join(directory, `${key}.log`), {
      mode: 0o600,
    });
    logs.push(stream);
    const child = spawn(file, args, {
      cwd,
      env: runtimeEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.pipe(stream);
    child.stderr.pipe(stream, { end: false });
    child.on("error", (error) => {
      child.startError = error;
    });
    children.push(child);
    return child;
  }
  async function ready(url, child) {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      signal?.throwIfAborted();
      if (child.startError || child.exitCode !== null)
        throw new Error(`owned service exited before readiness: ${url}`);
      try {
        if ((await fetch(url, { signal: AbortSignal.timeout(1500) })).ok)
          return;
      } catch {
        /* Startup only; no business mutation retries. */
      }
      await delay(500, undefined, { signal });
    }
    throw new Error(`owned service readiness timed out: ${url}`);
  }
  const inspect = async (name) =>
    JSON.parse(await command("docker", ["inspect", name]))[0];
  try {
    await stage("source-snapshot", async () => {
      const requiredNode = (
        await fs.readFile(path.join(root, ".n-node-version"), "utf8")
      )
        .trim()
        .replace(/^v/u, "");
      assert.equal(
        process.versions.node,
        requiredNode,
        "use the repository's pinned Node version",
      );
      report.source = await readRepositoryIdentity(root);
      await snapshot(root, source);
      assertRepositoryIdentityEqual(
        report.source,
        await readRepositoryIdentity(source),
      );
      assertRepositoryIdentityEqual(
        report.source,
        await readRepositoryIdentity(root),
      );
    });
    const binary = path.join(directory, "backend");
    await stage("backend-build", async () => {
      await command(
        "go",
        [
          "build",
          "-mod=readonly",
          "-buildvcs=false",
          "-p",
          "4",
          "-o",
          binary,
          "./cmd/server",
        ],
        { cwd: path.join(source, "server"), timeout: 360000 },
      );
      report.binarySHA256 = createHash("sha256")
        .update(await fs.readFile(binary))
        .digest("hex");
    });
    let pgPort, storagePort;
    await stage("owned-postgres-storage", async () => {
      ownedNames.push(database.name);
      await command("docker", database.args, {
        env: { ...env, ...database.env },
      });
      ownedNames.push(storageName);
      await command(
        "docker",
        [
          "run",
          "--detach",
          "--rm",
          "--pull",
          "never",
          "--name",
          storageName,
          "--label",
          `${MANAGED_DATABASE_LABELS.operation}=${operationId}`,
          "--label",
          `${MANAGED_DATABASE_LABELS.managed}=true`,
          "--memory",
          "768m",
          "--cpus",
          "2",
          "--env",
          "AWS_ACCESS_KEY_ID",
          "--env",
          "AWS_SECRET_ACCESS_KEY",
          "--env",
          "S3_BUCKET=plush-transaction-e2e",
          "--publish",
          "127.0.0.1::8333",
          STORAGE_IMAGE,
          "mini",
          "-dir=/data",
          "-webdav=false",
          "-s3.iam=false",
        ],
        {
          env: {
            ...env,
            AWS_ACCESS_KEY_ID: secrets.access,
            AWS_SECRET_ACCESS_KEY: secrets.storage,
          },
        },
      );
      const pg = await inspect(database.name),
        storage = await inspect(storageName);
      pgPort = readManagedLoopbackPort(pg);
      const bindings = storage.NetworkSettings.Ports["8333/tcp"];
      assert.equal(bindings.length, 1);
      assert.equal(bindings[0].HostIp, "127.0.0.1");
      storagePort = Number(bindings[0].HostPort);
      report.containers = [pg, storage].map((info) => ({
        image: info.Config.Image,
        imageID: info.Image,
        id: info.Id,
      }));
    });
    const databaseName = databaseNameForRun("browser-actions", runID);
    const baseDSN = `postgres://postgres:${secrets.database}@127.0.0.1:${pgPort}/postgres?sslmode=disable`;
    const databaseURL = baseDSN.replace("/postgres?", `/${databaseName}?`);
    await stage("migrations", async () => {
      let healthy = false;
      for (let attempt = 0; attempt < 45; attempt += 1) {
        try {
          assert.equal(
            await command("psql", [baseDSN, "-X", "-Atqc", "SELECT 1"], {
              timeout: 2000,
            }),
            "1",
          );
          healthy = true;
          break;
        } catch {
          await delay(500, undefined, { signal });
        }
      }
      assert.equal(healthy, true);
      await command("psql", [
        baseDSN,
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `CREATE DATABASE "${databaseName}"`,
      ]);
      const cwd = path.join(source, "server");
      await command(
        "atlas",
        [
          "migrate",
          "apply",
          "--tx-mode",
          "all",
          "--dir",
          "file://internal/data/model/migrate",
          "--url",
          databaseURL,
        ],
        { cwd },
      );
      const status = JSON.parse(
        await command(
          "atlas",
          [
            "migrate",
            "status",
            "--dir",
            "file://internal/data/model/migrate",
            "--url",
            databaseURL,
            "--format",
            "{{ json . }}",
          ],
          { cwd },
        ),
      );
      assert.equal(status.Pending?.length || 0, 0);
      assert.match(status.Current, /^\d{14}$/u);
      report.migration = status.Current;
      await fs.writeFile(
        path.join(out, "migration.json"),
        JSON.stringify(status, null, 2),
      );
    });
    const { httpPort, webPort } = await allocateLocalAcceptancePorts(root);
    const backendURL = `http://127.0.0.1:${httpPort}`,
      baseURL = `http://127.0.0.1:${webPort}`;
    const runtimeEnv = {
      ...env,
      POSTGRES_DSN: databaseURL,
      APP_ADMIN_USERNAME: "e2e_admin",
      APP_ADMIN_PASSWORD: secrets.admin,
      APP_JWT_SECRET: secrets.jwt,
      ERP_ROLE_DEMO_PASSWORD: secrets.roles,
      APP_AUTH_SMS_MODE: "mock",
      ERP_DEBUG_ENV: "local",
      ERP_CUSTOMER_KEY: "yoyoosun",
      ERP_DEBUG_SEED_ENABLED: "false",
      ERP_DEBUG_CLEANUP_ENABLED: "false",
      ERP_DEBUG_BUSINESS_CLEAR_ENABLED: "false",
      ERP_ALLOW_LOCAL_TEST_CUSTOMER_CONFIG: "0",
      ERP_ALLOW_RELEASE_REHEARSAL_CUSTOMER_CONFIG: "0",
      GIT_SHA: report.source.commit,
      ERP_PDF_WARMUP: "0",
      TMPDIR: directory,
      DEV_HTTP_PORT: String(httpPort),
      ATTACHMENT_S3_ENDPOINT: `http://127.0.0.1:${storagePort}`,
      ATTACHMENT_S3_BUCKET: "plush-transaction-e2e",
      ATTACHMENT_S3_REGION: "us-east-1",
      ATTACHMENT_S3_ACCESS_KEY_ID: secrets.access,
      ATTACHMENT_S3_SECRET_ACCESS_KEY: secrets.storage,
    };
    const config = {
      server: { http: { addr: `127.0.0.1:${httpPort}`, timeout: "45s" } },
      log: { debug: false },
      trace: { jaeger: { endpoint: "", ratio: 0 } },
      data: {
        postgres: {
          dsn: databaseURL,
          maxOpenConns: 20,
          maxIdleConns: 5,
          connMaxLifetime: "1800s",
          connMaxIdleTime: "300s",
          startupTimeout: "60s",
        },
        auth: {
          jwtSecret: secrets.jwt,
          jwtExpireSeconds: 3600,
          sms: { mode: "mock" },
          admin: { username: "e2e_admin", password: secrets.admin },
        },
      },
    };
    const configPath = path.join(directory, "config.yaml");
    await fs.writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
    await stage("backend-runtime-identity", async () => {
      const backend = service(
        binary,
        ["-conf", configPath],
        path.join(source, "server"),
        runtimeEnv,
        "backend",
      );
      await ready(`${backendURL}/readyz`, backend);
      report.runtimeIdentity = await verifyDatabaseRuntimeIdentity({
        backendURL,
        databaseName,
      });
    });
    await stage("core-role-seed", async () => {
      for (const [name, args] of [
        ["seed-core-demo-data", ["--prefix", "SIM-E2E"]],
        ["seed-role-demo-admins", []],
      ]) {
        await command(
          "go",
          [
            "run",
            "-mod=readonly",
            `./cmd/${name}`,
            "--conf",
            configPath,
            ...args,
          ],
          { cwd: path.join(source, "server"), env: runtimeEnv },
        );
      }
    });
    await stage("frontend", async () => {
      const vite = service(
        process.execPath,
        [
          path.join(source, "web/node_modules/vite/bin/vite.js"),
          "--host",
          "127.0.0.1",
          "--open",
          "false",
        ],
        path.join(source, "web"),
        {
          ...runtimeEnv,
          API_ORIGIN: backendURL,
          ERP_VITE_PORT: String(webPort),
          ERP_VITE_HMR_CLIENT_PORT: String(webPort),
          ERP_DEV_CUSTOMER_KEY: "yoyoosun",
        },
        "vite",
      );
      await ready(`${baseURL}/customer-config.js`, vite);
    });
    await stage("browser-real-backend-postgres", async () => {
      const environmentPath = path.join(directory, "browser-environment.json");
      await fs.writeFile(
        environmentPath,
        JSON.stringify({
          runID,
          databaseName,
          databaseURL,
          baseURL,
          backendURL,
          adminUsername: "e2e_admin",
          adminPassword: secrets.admin,
          rolePassword: secrets.roles,
          outputDir: path.join(out, "browser"),
        }),
        { mode: 0o600 },
      );
      await command(
        process.execPath,
        [
          path.join(source, "scripts/qa/transaction-real-backend-browser.mjs"),
          "--environment",
          environmentPath,
        ],
        { timeout: 480000 },
      );
      const browser = JSON.parse(
        await fs.readFile(path.join(out, "browser/report.json"), "utf8"),
      );
      assert.equal(browser.status, "passed");
      report.flows = browser.flows.map(({ key, passed }) => ({ key, passed }));
      report.requestLogs = verifyTransactionRequestLogs(
        browser,
        await fs.readFile(path.join(directory, "backend.log"), "utf8"),
        Object.values(secrets),
      );
    });
    await stage("logging-trace-contracts", async () => {
      const stdout = await command(
        "go",
        [
          "test",
          "-json",
          "-count=1",
          "-p",
          "4",
          "./internal/server",
          "./internal/biz",
          "./internal/data",
          "-run",
          "^(TestRequestLogging|TestEarlyFailureLogging|TestCustomHTTP|TestRequestIDFilter|TestSafeServerTracing|TestRPCTrace|TestBusinessTrace|TestTraceAttributes|TestPostgresSQL|TestNormalizeRuntimeAuditEventCreate)",
        ],
        { cwd: path.join(source, "server"), timeout: 180000 },
      );
      report.observability = verifyGoTestJson(stdout, [
        "TestRequestLogging",
        "TestRequestIDFilter",
        "TestSafeServerTracing",
        "TestBusinessTrace",
        "TestPostgresSQL",
        "TestNormalizeRuntimeAuditEventCreate",
      ]);
      await fs.writeFile(
        path.join(out, "observability.jsonl"),
        redact(stdout) + "\n",
        { mode: 0o600 },
      );
      assert.equal(
        report.observability.ok,
        true,
        JSON.stringify(report.observability),
      );
    });
    await stage("critical-postgres", async () => {
      const criticalURL = baseDSN.replace(
        "/postgres?",
        `/${databaseNameForRun("ci", runID)}?`,
      );
      const stdout = await command(
        "bash",
        [
          path.join(source, "scripts/purchase-receipt-pg.sh"),
          "test-critical-disposable",
        ],
        {
          cwd: path.join(source, "server"),
          env: {
            ...env,
            GOFLAGS: "-p=4",
            PURCHASE_RECEIPT_PG_DB_URL: criticalURL,
          },
          timeout: 360000,
        },
      );
      const events = stdout
        .split("\n")
        .filter((line) => line.startsWith('{"'))
        .join("\n");
      report.postgres = verifyGoTestJson(events, [
        "TestInventoryPostgres",
        "TestQualityInspectionPostgres",
        "TestOperationalFactRepoFinance",
      ]);
      await fs.writeFile(
        path.join(out, "postgres.jsonl"),
        redact(events) + "\n",
        { mode: 0o600 },
      );
      assert.equal(report.postgres.ok, true, JSON.stringify(report.postgres));
      const remaining = await command("psql", [
        baseDSN,
        "-X",
        "-Atqc",
        "SELECT count(*) FROM pg_database WHERE datname LIKE 'plush_erp_ci_%'",
      ]);
      assert.equal(
        remaining,
        "0",
        "disposable PostgreSQL gate must remove its database",
      );
    });
    assertRepositoryIdentityEqual(
      report.source,
      await readRepositoryIdentity(source),
    );
    report.currentSource = await readRepositoryIdentity(root);
    report.currentSourceMatches =
      report.currentSource.fingerprint === report.source.fingerprint;
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.error = redact(error.stack);
    for (const key of ["backend", "vite"]) {
      const log = await fs
        .readFile(path.join(directory, `${key}.log`), "utf8")
        .catch(() => "");
      if (log)
        await fs.writeFile(
          path.join(out, `${key}-diagnostic.log`),
          redact(log.slice(-40000)),
          { mode: 0o600 },
        );
    }
  } finally {
    const cleanupErrors = [];
    for (const child of children.reverse()) {
      try {
        await stopOwnedService(child);
      } catch (error) {
        cleanupErrors.push(redact(error.message));
      }
    }
    for (const log of logs) log.end();
    for (const name of ownedNames.reverse()) {
      try {
        let info;
        try {
          info = JSON.parse(
            (await execFileAsync("docker", ["inspect", name])).stdout,
          )[0];
        } catch (error) {
          if (
            error.code === 1 &&
            /no such (object|container)/iu.test(error.stderr)
          )
            continue;
          throw error;
        }
        assert.equal(
          info.Config.Labels[MANAGED_DATABASE_LABELS.operation],
          operationId,
          "cleanup ownership mismatch",
        );
        const volumes = info.Mounts.filter(
          (mount) => mount.Type === "volume",
        ).map((mount) => mount.Name);
        await execFileAsync("docker", ["rm", "--force", "--volumes", name], {
          timeout: 30000,
        });
        await assert.rejects(
          execFileAsync("docker", ["inspect", name]),
          (error) =>
            error.code === 1 &&
            /no such (object|container)/iu.test(error.stderr),
        );
        for (const volume of volumes) {
          let gone = false;
          for (let attempt = 0; attempt < 30; attempt += 1) {
            try {
              await execFileAsync("docker", ["volume", "inspect", volume]);
            } catch (error) {
              if (error.code === 1 && /no such volume/iu.test(error.stderr)) {
                gone = true;
                break;
              }
              throw error;
            }
            await delay(100);
          }
          assert.ok(gone, "owned volume remains");
        }
      } catch (error) {
        cleanupErrors.push(redact(error.message));
      }
    }
    if (!cleanupErrors.length) {
      try {
        await fs.rm(directory, { recursive: true, force: true });
      } catch (error) {
        cleanupErrors.push(redact(error.message));
      }
    }
    report.cleanup = {
      passed: cleanupErrors.length === 0,
      errors: cleanupErrors,
    };
    if (cleanupErrors.length) report.status = "failed";
    report.finishedAt = new Date().toISOString();
    await fs.writeFile(
      path.join(out, "lifecycle.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    process.stdout.write(
      `[transaction-e2e] ${report.status}; cleanup=${report.cleanup.passed}; ${out}\n`,
    );
  }
  return report;
}

if (
  process.argv[1] &&
  pathToFileURL(await fs.realpath(process.argv[1])).href === import.meta.url
) {
  const args = process.argv.slice(2);
  if (!args.length || args[0] === "--help") {
    process.stdout.write(
      "Usage: node scripts/qa/transaction-browser-isolated.mjs --run [--out output/qa/transaction-browser/<run>]\nCreates and removes an isolated source copy, PostgreSQL, storage, backend and browser. Requires pinned Node, Go, Atlas, psql, installed web dependencies, Chromium, postgres:18.6 and chrislusf/seaweedfs:4.46.\n",
    );
  } else {
    assert.ok(
      args[0] === "--run" &&
        (args.length === 1 || (args.length === 3 && args[1] === "--out")),
      "unknown arguments",
    );
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        controller.abort(new Error("isolated transaction test hard timeout")),
      15 * 60 * 1000,
    );
    process.once("SIGINT", () => controller.abort());
    process.once("SIGTERM", () => controller.abort());
    try {
      const report = await runIsolatedTransactionBrowser({
        outputDir: args[2],
        signal: controller.signal,
      });
      if (report.status !== "passed") process.exitCode = 1;
    } finally {
      clearTimeout(timer);
    }
  }
}
