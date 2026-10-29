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
import { allocateLocalAcceptancePorts, allocateLocalAcceptanceWebEndpoint } from "./local-acceptance-lifecycle.mjs";
import { findListenerPids, runProcessInspection } from '../dev-process-inspection.mjs';
import { verifyDatabaseRuntimeIdentity } from "./browser-write-target.mjs";
import { verifyGoTestJson } from "./verify-go-test-json.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../..");
const STORAGE_IMAGE = "chrislusf/seaweedfs:4.46";

export function transactionBrowserBudget({ sourceOrdersOnly = false, receivingOnly = false, desktopVariantsOnly = false, purchaseChainOnly = false, productionRecoveryOnly = false } = {}) {
  assert.equal(typeof sourceOrdersOnly, 'boolean');
  assert.equal(typeof receivingOnly, 'boolean');
  assert.equal(typeof purchaseChainOnly, "boolean");
  assert.equal(typeof productionRecoveryOnly, "boolean");
  assert.equal(typeof desktopVariantsOnly, 'boolean');
  assert.ok([sourceOrdersOnly, receivingOnly, desktopVariantsOnly, purchaseChainOnly, productionRecoveryOnly].filter(Boolean).length <= 1, 'select only one browser scope');
  const narrow = sourceOrdersOnly || receivingOnly || desktopVariantsOnly || purchaseChainOnly || productionRecoveryOnly;
  return { browserTimeoutMS: (narrow ? 8 : 12) * 60 * 1000, runTimeoutMS: (narrow ? 15 : 25) * 60 * 1000 };
}

export async function ownedServiceIsListening(child, port, inspect = runProcessInspection) {
  assert.ok(Number.isSafeInteger(child.pid) && child.pid > 1);
  assert.ok(Number.isSafeInteger(port) && port > 0 && port <= 65535);
  const pids = await findListenerPids(port, { inspect });
  assert.ok(pids.every((pid) => pid === child.pid), 'listener must belong to the exact owned service process');
  return pids.length > 0;
}

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
    ...[
      ...[...browser.flows, ...(browser.partialReceiving || [])].flatMap(({ transportFault, saveFault, submitFault, transportFaults = [] }) =>
        [transportFault, saveFault, submitFault, ...transportFaults].filter(Boolean),
      ),
      ...(browser.engineering ?? []).map(({ financeFault }) => financeFault).filter(Boolean),
    ].map((fault) => ({ ...fault, code: fault.backendCode })),
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
  sourceOrdersOnly = false,
  receivingOnly = false,
  desktopVariantsOnly = false,
  purchaseChainOnly = false,
  productionRecoveryOnly = false,
  desktopCase = "all",
} = {}) {
  assert.equal(typeof sourceOrdersOnly, "boolean");
  assert.equal(typeof receivingOnly, "boolean");
  assert.equal(typeof purchaseChainOnly, "boolean");
  assert.equal(typeof productionRecoveryOnly, "boolean");
  assert.equal(typeof desktopVariantsOnly, "boolean");
  assert.ok([sourceOrdersOnly, receivingOnly, desktopVariantsOnly, purchaseChainOnly, productionRecoveryOnly].filter(Boolean).length <= 1, "select only one browser scope");
  assert.ok(["all", "advance", "outsourcing", "shell"].includes(desktopCase), "unknown desktop case");
  assert.ok(desktopVariantsOnly || desktopCase === "all", "desktop case requires desktop variants scope");
  const budget = transactionBrowserBudget({ sourceOrdersOnly, receivingOnly, desktopVariantsOnly, purchaseChainOnly, productionRecoveryOnly });
  const out = path.resolve(
    outputDir ||
      path.join(root, "output/qa/transaction-browser", Date.now().toString()),
  );
  assert.ok(
    out.startsWith(path.join(root, "output/qa/")),
    "evidence must stay under output/qa",
  );
  await fs.mkdir(out, { recursive: true, mode: 0o700 });
  const directory = await fs.realpath(await fs.mkdtemp(
    path.join(os.tmpdir(), "plush-transaction-e2e-"),
  ));
  const source = path.join(directory, "source");
  const report = {
    status: "running",
    steps: [],
    outputDir: out,
    simulatedOnly: true,
    desktopCase: desktopVariantsOnly ? desktopCase : undefined,
    scope: productionRecoveryOnly ? "production-recovery" : purchaseChainOnly ? "purchase-chain" : desktopVariantsOnly ? "desktop-variants" : receivingOnly ? "receiving" : sourceOrdersOnly ? "source-orders" : "transactions-and-source-orders-and-receiving",
    budget,
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
      if (error.stdout || error.stderr) {
        report.commandFailures ??= [];
        const evidence = `command-failure-${report.commandFailures.length + 1}.log`;
        report.commandFailures.push({ program: path.basename(file), evidence });
        const diagnostic = redact(`${error.stdout || ""}\n${error.stderr || ""}`);
        await fs.writeFile(path.join(out, evidence), diagnostic, { mode: 0o600 });
        await fs.writeFile(path.join(out, "command-failure.log"), diagnostic, { mode: 0o600 });
      }
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
  async function ready(url, child, port) {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      signal?.throwIfAborted();
      if (child.startError || child.exitCode !== null)
        throw new Error(`owned service exited before readiness: ${url}`);
      if (!(await ownedServiceIsListening(child, port))) {
        await delay(500, undefined, { signal });
        continue;
      }
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
      if (!sourceOrdersOnly && !receivingOnly && !desktopVariantsOnly && !purchaseChainOnly && !productionRecoveryOnly) {
        await Promise.all(["pdfinfo", "pdffonts", "pdftotext"].map((tool) =>
          command(tool, ["-v"], { cwd: root, timeout: 10000 }),
        ));
      }
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
    await stage("schema-documentation", async () => {
      const summary = await command(
        "go",
        ["run", "./cmd/schema-doc", "--check"],
        { cwd: path.join(source, "server") },
      );
      await fs.writeFile(
        path.join(out, "schema-documentation.log"),
        summary + "\n",
        { mode: 0o600 },
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
    const { httpPort } = await allocateLocalAcceptancePorts(root);
    const backendURL = `http://127.0.0.1:${httpPort}`;
    let webPort, baseURL;
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
      await ready(`${backendURL}/readyz`, backend, httpPort);
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
      const endpoint = await allocateLocalAcceptanceWebEndpoint(root);
      webPort = endpoint.webPort;
      baseURL = endpoint.webURL;
      const vite = service(
        process.execPath,
        [
          path.join(source, "web/node_modules/vite/bin/vite.js"),
          "--host",
          "127.0.0.1",
        ],
        path.join(source, "web"),
        {
          ...runtimeEnv,
          BROWSER: "none",
          API_ORIGIN: backendURL,
          ERP_VITE_PORT: String(webPort),
          ERP_VITE_HMR_CLIENT_PORT: String(webPort),
          ERP_DEV_CUSTOMER_KEY: "yoyoosun",
        },
        "vite",
      );
      await ready(`${baseURL}/customer-config.js`, vite, webPort);
      report.frontendOwnership = { pid: vite.pid, port: webPort, verified: true };
    });
    let sourceOrderBrowserFailure;
    try {
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
          desktopCase,
        }),
        { mode: 0o600 },
      );
      await command(
        process.execPath,
        [
          path.join(source, productionRecoveryOnly ? "scripts/qa/transaction-production-recovery-browser.mjs" : purchaseChainOnly ? "scripts/qa/purchase-chain-browser.mjs" : desktopVariantsOnly ? "scripts/qa/transaction-desktop-variants-browser.mjs" : receivingOnly ? "scripts/qa/transaction-arrival-return-quality-browser.mjs" : sourceOrdersOnly ? "scripts/qa/transaction-source-orders-browser.mjs" : "scripts/qa/transaction-real-backend-browser.mjs"),
          "--environment",
          environmentPath,
        ],
        { timeout: budget.browserTimeoutMS },
      );
      const browser = JSON.parse(
        await fs.readFile(path.join(out, productionRecoveryOnly ? "browser/production-recovery/report.json" : purchaseChainOnly ? "browser/purchase-chain/report.json" : desktopVariantsOnly ? "browser/desktop-variants/report.json" : receivingOnly ? "browser/receiving/report.json" : sourceOrdersOnly ? "browser/source-orders/report.json" : "browser/report.json"), "utf8"),
      );
      assert.equal(browser.status, "passed");
      report.flows = browser.flows.map(({ key, passed }) => ({ key, passed }));
      if (browser.partialReceiving) report.partialReceiving = browser.partialReceiving.map(({ key, passed }) => ({ key, passed }));
      report.requestLogs = verifyTransactionRequestLogs(
        browser,
        await fs.readFile(path.join(directory, "backend.log"), "utf8"),
        Object.values(secrets),
      );
    });
    } catch (error) {
      if (!sourceOrdersOnly && !receivingOnly && !desktopVariantsOnly && !purchaseChainOnly) throw error;
      sourceOrderBrowserFailure = error;
      report.browserError = redact(error.stack);
      report.steps.push({ key: "browser-real-backend-postgres", passed: false });
    }
    if (!sourceOrdersOnly && !receivingOnly && !desktopVariantsOnly && !purchaseChainOnly && !productionRecoveryOnly) await stage("source-order-procurement-browser", async () => {
      await command(process.execPath, [path.join(source, "scripts/qa/transaction-source-orders-browser.mjs"), "--environment", path.join(directory, "browser-environment.json")], { timeout: 300000 });
      const orders = JSON.parse(await fs.readFile(path.join(out, "browser/source-orders/report.json"), "utf8"));
      assert.equal(orders.status, "passed");
      report.sourceOrders = orders.flows.map(({ key, passed }) => ({ key, passed }));
      report.sourceOrderRequestLogs = verifyTransactionRequestLogs(orders, await fs.readFile(path.join(directory, "backend.log"), "utf8"), Object.values(secrets));
    });
    if (!sourceOrdersOnly && !receivingOnly && !desktopVariantsOnly && !purchaseChainOnly && !productionRecoveryOnly) await stage("arrival-return-quality-browser", async () => {
      await command(process.execPath, [path.join(source, "scripts/qa/transaction-arrival-return-quality-browser.mjs"), "--environment", path.join(directory, "browser-environment.json")], { timeout: 480000 });
      const receiving = JSON.parse(await fs.readFile(path.join(out, "browser/receiving/report.json"), "utf8"));
      assert.equal(receiving.status, "passed");
      report.receiving = receiving.flows.map(({ key, passed }) => ({ key, passed }));
      report.partialReceiving = receiving.partialReceiving.map(({ key, passed }) => ({ key, passed }));
      report.receivingRequestLogs = verifyTransactionRequestLogs(receiving, await fs.readFile(path.join(directory, "backend.log"), "utf8"), Object.values(secrets));
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
    await stage(purchaseChainOnly ? "purchase-chain-postgres" : "critical-postgres", async () => {
      const criticalURL = baseDSN.replace(
        "/postgres?",
        `/${databaseNameForRun("ci", runID)}?`,
      );
      let stdout;
      if (purchaseChainOnly) {
        try {
          await command(process.execPath, [
            path.join(source, "scripts/qa/disposable-database-runner.mjs"),
            "--profile", "ci", "--workflow", "purchase-chain-postgres", "--run-id", runID,
            "--out", path.join(out, "postgres-lifecycle.json"),
          ], { env: { ...env, GOFLAGS: "-p=4", DISPOSABLE_DATABASE_BASE_URL: baseDSN }, timeout: 360000 });
        } finally {
          const evidencePath = path.join(source, "output/dev-workbench/database", `ci-${runID}.json`);
          const evidence = await fs.readFile(evidencePath, "utf8").catch(error => {
            if (error.code === "ENOENT") return null;
            throw error;
          });
          if (evidence) {
            const receipt = JSON.parse(evidence);
            assert.equal(receipt.workflow, "purchase-chain-postgres");
            assertRepositoryIdentityEqual(report.source, receipt.repository);
            assertRepositoryIdentityEqual(report.source, receipt.repositoryAfter);
            const eventPath = path.join(source, receipt.testReport.path);
            stdout = await fs.readFile(eventPath, "utf8");
            assert.equal(createHash("sha256").update(stdout).digest("hex"), receipt.testReport.digest);
            const canonical = path.join(root, "output/dev-workbench/database");
            await fs.mkdir(canonical, { recursive: true });
            await fs.copyFile(eventPath, path.join(canonical, path.basename(eventPath)));
            await fs.copyFile(evidencePath, path.join(canonical, path.basename(evidencePath)));
            report.postgresLifecycle = receipt;
          }
        }
      } else stdout = await command(
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
          timeout: 600000,
        },
      );
      const events = stdout
        .split("\n")
        .filter((line) => line.startsWith('{"'))
        .join("\n");
      report.postgres = verifyGoTestJson(events, purchaseChainOnly ? [] : [
        "TestInventoryPostgres",
        "TestQualityInspectionPostgres",
        "TestOperationalFactRepoFinance",
        ...(productionRecoveryOnly ? ["TestProductionMaterialIssuePostgresConcurrentCrossChainIssue", "TestProductionOrderPostgresShortCloseConcurrentSupplement"] : []),
        ...(desktopVariantsOnly ? [
          "TestProductionOrderPostgresOutsourcedStageReturnRollbackAndReplay",
          "TestProductionOrderPostgresShellDispositionRollbackReplayAndReversal",
        ] : []),
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
    if (sourceOrderBrowserFailure) throw sourceOrderBrowserFailure;
    if (!sourceOrdersOnly && !receivingOnly && !desktopVariantsOnly && !purchaseChainOnly && !productionRecoveryOnly) await stage("shared-list-filter-print", async () => {
      await command(
        process.execPath,
        [
          path.join(
            source,
            "scripts/qa/transaction-shared-surfaces-browser.mjs",
          ),
          "--environment",
          path.join(directory, "browser-environment.json"),
        ],
        { timeout: 180000 },
      );
      const shared = JSON.parse(
        await fs.readFile(
          path.join(out, "browser/shared-surfaces/report.json"),
          "utf8",
        ),
      );
      assert.equal(shared.status, "passed");
      report.sharedSurfaces = {
        filters: shared.filters,
        prints: shared.prints,
        factsUnchanged: shared.factsUnchanged,
        factTablesChecked: shared.factTablesChecked,
        freshTemplatesClearedBusinessSources:
          shared.freshTemplatesClearedBusinessSources,
        materialOnlyInstructionBlocked: shared.materialOnlyInstructionBlocked,
        printFixtureCreatedThroughAPI: shared.printFixtureCreatedThroughAPI,
        fixtureDidNotPostFacts: shared.fixtureDidNotPostFacts,
        ownedPrintWindowsClosed: shared.ownedPrintWindowsClosed,
      };
      report.sharedRequestLogs = verifyTransactionRequestLogs(
        shared,
        await fs.readFile(path.join(directory, "backend.log"), "utf8"),
        Object.values(secrets),
      );
      const pdfLogs = (
        await fs.readFile(path.join(directory, "backend.log"), "utf8")
      )
        .split("\n")
        .flatMap((line) => {
          try {
            return [JSON.parse(line)];
          } catch {
            return [];
          }
        });
      for (const pdf of shared.prints) {
        const matching = pdfLogs.filter(
          (record) =>
            record.msg === "template pdf render success" &&
            record.request_id === pdf.requestID,
        );
        assert.equal(
          matching.length,
          1,
          "every download needs one real PDF completion log",
        );
        assert.equal(matching[0].template_key, pdf.templateKey);
        assert.equal(matching[0].pdf_bytes, pdf.bytes);
        assert.match(matching[0]["trace.id"], /^[a-f0-9]{32}$/u);
        assert.match(matching[0]["span.id"], /^[a-f0-9]{16}$/u);
      }
      report.pdfRequestLogs = {
        matched: shared.prints.length,
        byteCountsMatched: true,
        traceIDsPresent: true,
      };
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
    if (purchaseChainOnly && report.status === "passed") {
      try {
        const { publishPurchaseChainExecutionEvidence } = await import("./purchase-chain-evidence.mjs");
        report.workbench = await publishPurchaseChainExecutionEvidence({ root, directory: out });
      } catch (error) {
        report.status = "failed";
        report.evidenceError = redact(error.stack);
      }
      await fs.writeFile(path.join(out, "lifecycle.json"), JSON.stringify(report, null, 2) + "\n");
    }
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
      "Usage: node scripts/qa/transaction-browser-isolated.mjs --run [--source-orders | --receiving | --desktop-variants | --purchase-chain | --production-recovery] [--desktop-case all|advance|outsourcing|shell] [--out output/qa/transaction-browser/<run>]\nCreates and removes an isolated source copy, PostgreSQL, storage, backend and browser. --source-orders selects sales, purchase and outsourcing browser flows with the same real PostgreSQL and logging gates; it does not attest the other browser or print flows. --receiving selects arrival counts, purchase returns and outsourcing return quality with the same PostgreSQL and logging gates; it excludes other browser and print flows. --desktop-variants selects desktop supplier advance payments and production exception variants, including mobile outsourcing task entry, with the same PostgreSQL and logging gates. --production-recovery checks shared material allowance and short-close supplemental planning with warehouse and PMC browser actions. --purchase-chain follows one purchase order through desktop role approval, arrival, IQC, inbound and payable posting, and publishes the existing PostgreSQL evidence. Requires pinned Node, Go, Atlas, psql, installed web dependencies, Chromium, postgres:18.6 and chrislusf/seaweedfs:4.46. The default print scope also requires pdfinfo, pdffonts and pdftotext.\n",
    );
  } else {
    const caseIndex = args.indexOf("--desktop-case");
    assert.ok(args.filter(arg => arg === "--desktop-case").length <= 1, "repeat desktop case");
    const desktopCase = caseIndex < 0 ? "all" : args[caseIndex + 1];
    assert.ok(["all", "advance", "outsourcing", "shell"].includes(desktopCase), "unknown desktop case");
    assert.ok(caseIndex < 0 || args.includes("--desktop-variants"), "desktop case requires desktop variants scope");
    const scopeArgs = args.filter((arg, index) => index !== caseIndex && index !== caseIndex + 1 || caseIndex < 0);
    const selected = scopeArgs.filter(arg => !["--source-orders", "--receiving", "--desktop-variants", "--purchase-chain", "--production-recovery"].includes(arg));
    assert.ok(
      args.filter(arg => ["--source-orders", "--receiving", "--desktop-variants", "--purchase-chain", "--production-recovery"].includes(arg)).length <= 1 && selected[0] === "--run" &&
        (selected.length === 1 || (selected.length === 3 && selected[1] === "--out")),
      "unknown arguments",
    );
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        controller.abort(new Error("isolated transaction test hard timeout")),
      transactionBrowserBudget({ sourceOrdersOnly: args.includes('--source-orders'), receivingOnly: args.includes('--receiving'), desktopVariantsOnly: args.includes('--desktop-variants'), purchaseChainOnly: args.includes('--purchase-chain'), productionRecoveryOnly: args.includes('--production-recovery') }).runTimeoutMS,
    );
    process.once("SIGINT", () => controller.abort());
    process.once("SIGTERM", () => controller.abort());
    try {
      const report = await runIsolatedTransactionBrowser({
        outputDir: selected[2],
        sourceOrdersOnly: args.includes("--source-orders"),
        receivingOnly: args.includes("--receiving"),
        desktopVariantsOnly: args.includes("--desktop-variants"),
        purchaseChainOnly: args.includes("--purchase-chain"),
        productionRecoveryOnly: args.includes("--production-recovery"),
        desktopCase,
        signal: controller.signal,
      });
      if (report.status !== "passed") process.exitCode = 1;
    } finally {
      clearTimeout(timer);
    }
  }
}
