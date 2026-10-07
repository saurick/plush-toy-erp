#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomBytes } from "node:crypto";
import { chownSync, cpSync, createWriteStream, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createDatabaseRunID, databaseNameForRun, assertDisposableDatabaseTarget } from "./database-target.mjs";
import { pressureDataScale } from "../../web/src/dev-workbench/config/devPressureData.mjs";
import { capacityDatasetConfirmation, runCapacityDataset, capacityDatasetTargets } from "./capacity-dataset.mjs";
import { applyCapacityCustomerConfig, capacityConfigConfirmation } from "./capacity-customer-config.mjs";
import { runIsolatedPressure, CONFIRM_PHRASE } from "./manual-acceptance-capacity-pressure.mjs";
import { prepareEngineeringPressureData, ENGINEERING_DATA_FILES } from "./pressure-engineering-data.mjs";
import { runEngineeringPressure, engineeringPressurePoolSize, writePressureReport } from "./engineering-pressure.mjs";
import { pressureRPC, verifyPressureRuntime, pressureLogicFingerprint } from "./pressure-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const execFileAsync = promisify(execFile);
const DEFAULT_S3_IMAGE = "chrislusf/seaweedfs:4.47@sha256:ce9e796f1fe6f06968f4c04bdaf8f678dad9c8acdfef3d244133d71bfa6bf882";
export function pressureLifecyclePlan(profile = "capacity", dataScale = "baseline") {
  const scale = pressureDataScale(dataScale);
  return { profile, dataScale, historyOrders: scale.historyOrders, readTargets: capacityDatasetTargets(dataScale), poolSize: engineeringPressurePoolSize(profile), simulatedOnly: true,
    databaseProfile: "capacity", environment: "owned loopback PostgreSQL + S3 + backend",
    steps: ["source snapshot and build", "owned PostgreSQL/S3", "Atlas migrate/readback", "backend identity",
      "role/core seed", "read dataset/config activation", "read pressure", "engineering preparation",
      "competition/unknown outcome", "mixed business pressure/recovery", "authoritative readback", "dispose owned resources"],
    mainDurationMs: profile === "capacity" ? 600000 : null,
    excludes: ["shared development database", "production deployment", "commit/push"] };
}
export function pressureNetworkConfig(subnet = "") {
  if (!subnet) return [];
  const match = /^(10\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+|192\.168\.\d+)\.(\d+)\/28$/u.exec(subnet);
  if (!match || subnet.split('/')[0].split('.').some((part) => Number(part) > 255) || Number(match[2]) % 16 !== 0)
    throw new Error("pressure network subnet must be an aligned private IPv4 /28");
  return ["networks:", "  default:", "    ipam:", "      config:", "        - subnet: " + subnet];
}
function includesPressureBuildSource(directory, file) {
  const relative = path.relative(directory, file);
  return !/(^|\/)(\.git|\.env[^/]*|node_modules|bin|output|tmp)(\/|$)/u.test(relative) &&
    !/config\.local\.ya?ml$/u.test(relative);
}
export function copyPressureBuildSource(directory, destination) {
  cpSync(directory, destination, { recursive: true,
    filter: (file) => includesPressureBuildSource(directory, file) });
}
export function pressureBuildSourceFingerprint(directory) {
  const hash = createHash("sha256");
  function visit(dir) {
    for (const item of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, item.name);
      if (!includesPressureBuildSource(directory, file)) continue;
      if (item.isDirectory()) visit(file);
      else if (/\.(go|proto|json|sql|hcl)$/u.test(item.name) || ["go.mod", "go.sum", "atlas.sum"].includes(item.name))
        hash.update(path.relative(directory, file)).update(readFileSync(file));
    }
  }
  visit(directory); return hash.digest("hex");
}
export const PRESSURE_LIFECYCLE_FILES = Object.freeze([
  "scripts/qa/pressure-isolated-lifecycle.mjs", "web/src/dev-workbench/config/devPressureData.mjs", "scripts/qa/manual-acceptance-capacity-pressure.mjs",
  "scripts/qa/capacity-dataset.mjs", "scripts/qa/capacity-customer-config.mjs",
]);
const LIFECYCLE_STEPS = Object.freeze([
  "build", "containers", "migration", "backend", "seed", "read-dataset-config",
  "read-pressure", "engineering-data", "engineering-pressure", "cleanup",
]);
export function updatePressureProgress(current, event, now = new Date().toISOString()) {
  const steps = current?.completedSteps || [];
  const phase = LIFECYCLE_STEPS.includes(event.step) ? event.step : current?.phase;
  if (!phase) return current;
  return { schemaVersion: "plush-pressure-progress/v1", phase, updatedAt: now,
    stage: ["ramp", "capacity", "recovery", "competition", "orders", "samples", "history"].includes(event.step) ? event.step : null,
    status: event.status === "failed" || event.passed === false ? "failed" : event.status === "completed" && event.step === "cleanup" ? "completed" : "running",
    completedSteps: event.status === "completed" && LIFECYCLE_STEPS.includes(event.step)
      ? [...new Set([...steps, event.step])] : steps,
    completed: Number.isSafeInteger(event.completed) && event.completed >= 0 ? event.completed : null,
    total: Number.isSafeInteger(event.total) && event.total >= 0 ? event.total : null,
    targetDurationMs: Number.isFinite(event.targetDurationMs) && event.targetDurationMs >= 0 ? event.targetDurationMs : null };
}
export async function runPressureLifecycle({ profile = "capacity", dataScale = "baseline", out, onProgress = () => {}, signal }) {
  const networkConfig = pressureNetworkConfig(process.env.PRESSURE_NETWORK_SUBNET || "");
  const plan = pressureLifecyclePlan(profile, dataScale), runID = createDatabaseRunID();
  const databaseName = databaseNameForRun("capacity", runID);
  const directory = mkdtempSync(path.join(process.platform === "linux" && process.getuid?.() === 0 ? "/tmp" : os.tmpdir(), "plush-pressure-"));
  const project = "plush-pressure-" + randomBytes(6).toString("hex"), secret = () => randomBytes(24).toString("hex");
  const secrets = { PRESSURE_PG_PASSWORD: secret(), PRESSURE_S3_ACCESS_KEY: secret(), PRESSURE_S3_SECRET: secret(),
    adminPassword: randomBytes(10).toString("hex"), rolePassword: randomBytes(10).toString("hex"), jwtSecret: secret() };
  const redact = (value) => Object.values(secrets).reduce((text, value) => text.replaceAll(value, "<redacted>"), String(value || ""))
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gu, "postgres://<redacted>");
  const report = { schemaVersion: "plush-pressure-lifecycle/v1", profile, dataScale, runID, databaseName, project,
    startedAt: new Date().toISOString(), passed: false, steps: [], cleanup: { passed: false }, evidenceDirectory: directory,
    lifecycleSourceFingerprint: pressureLogicFingerprint(PRESSURE_LIFECYCLE_FILES) };
  let backend, logStream, composeCreated = false, stage = "preflight";
  const controller = new AbortController(), activeSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  const totalTimer = setTimeout(() => controller.abort(), 45 * 60000);
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: "0", GOMAXPROCS: "4" };
  async function command(cmd, args, options = {}) {
    try {
      const result = await execFileAsync(cmd, args, { cwd: root, env, encoding: "utf8", timeout: 60000,
        maxBuffer: 64 * 1048576, signal: activeSignal, ...options });
      return result.stdout.trim();
    } catch (error) {
      writeFileSync(path.join(directory, "failure.log"), redact(error.stderr || error.message), { mode: 0o600 });
      throw new Error(stage + " command failed; private diagnostic saved");
    }
  }
  const composeArgs = ["compose", "--env-file", path.join(directory, "fixture.env"), "-p", project, "-f", path.join(directory, "compose.yml")];
  const compose = (args, options) => command("docker", [...composeArgs, ...args], options);
  async function step(name, run) {
    stage = name; activeSignal.throwIfAborted(); onProgress({ step: name, status: "started" });
    const started = performance.now(); const result = await run();
    report.steps.push({ key: name, durationMs: performance.now() - started, passed: result?.passed !== false });
    onProgress({ step: name, status: "completed", passed: result?.passed !== false }); return result;
  }
  try {
    const commit = await command("git", ["rev-parse", "HEAD"]);
    report.commit = commit; report.treeState = (await command("git", ["status", "--porcelain", "--untracked-files=no"])) ? "dirty" : "clean";
    const source = path.join(directory, "source", "server");
    await step("build", async () => {
      copyPressureBuildSource(path.join(root, "server"), source);
      report.buildSourceFingerprint = pressureBuildSourceFingerprint(source);
      const serverFiles = ENGINEERING_DATA_FILES.filter((file) => file.startsWith("server/"));
      report.businessSourceFingerprint = pressureLogicFingerprint(serverFiles, path.dirname(source));
      if (report.businessSourceFingerprint !== pressureLogicFingerprint(serverFiles)) throw new Error("business source changed while copying candidate");
      await command("go", ["build", "-mod=readonly", "-buildvcs=false", "-p", "4", "-o", path.join(directory, "backend"), "./cmd/server"],
        { cwd: source, timeout: 360000 });
      report.binarySHA256 = createHash("sha256").update(readFileSync(path.join(directory, "backend"))).digest("hex");
    });
    const s3Image = process.env.PRESSURE_S3_IMAGE || DEFAULT_S3_IMAGE;
    writeFileSync(path.join(directory, "fixture.env"), Object.entries(secrets).filter(([key]) => key.startsWith("PRESSURE_"))
      .map(([key, value]) => key + "=" + value).join("\n") + "\n", { mode: 0o600 });
    writeFileSync(path.join(directory, "compose.yml"), [
      "services:", "  postgres:", "    image: postgres:18.6", "    environment:",
      "      POSTGRES_USER: pressure", "      POSTGRES_PASSWORD: ${PRESSURE_PG_PASSWORD}", "      POSTGRES_DB: postgres",
      "    ports: ['127.0.0.1::5432']", "    volumes: [pg-data:/var/lib/postgresql]", "    restart: 'no'",
      "    mem_limit: 512m", "    cpus: 2", "  storage:", "    image: " + JSON.stringify(s3Image),
      "    command: [mini, '-dir=/data', '-webdav=false', '-s3.iam=false']",
      "    environment:", "      AWS_ACCESS_KEY_ID: ${PRESSURE_S3_ACCESS_KEY}",
      "      AWS_SECRET_ACCESS_KEY: ${PRESSURE_S3_SECRET}", "      S3_BUCKET: plush-pressure",
      "    ports: ['127.0.0.1::8333']", "    volumes: [s3-data:/data]", "    restart: 'no'",
      "    mem_limit: 768m", "    cpus: 2", ...networkConfig, "volumes:", "  pg-data: {}", "  s3-data: {}",
    ].join("\n") + "\n", { mode: 0o600 });
    await step("containers", async () => { composeCreated = true; await compose(["up", "-d", "--wait"], { timeout: 180000 }); });
    const containerIDs = (await compose(["ps", "-q"])).split(/\s+/u).filter(Boolean);
    report.environment = { hostFingerprint: createHash("sha256").update(JSON.stringify({ host: os.hostname(),
      platform: os.platform(), arch: os.arch(), cpus: os.cpus().map(({ model }) => model), memory: os.totalmem() })).digest("hex"),
      containers: [], backend: { gomaxprocs: 4, maxOpenConnections: 20, maxIdleConnections: 5, cpuAndMemoryLimit: "host-managed" } };
    for (const id of containerIDs) {
      const info = JSON.parse(await command("docker", ["inspect", "--format",
        '{"id":{{json .Id}},"imageID":{{json .Image}},"requestedImage":{{json .Config.Image}},"memoryLimitBytes":{{json .HostConfig.Memory}},"nanoCPUs":{{json .HostConfig.NanoCpus}},"project":{{json (index .Config.Labels "com.docker.compose.project")}},"service":{{json (index .Config.Labels "com.docker.compose.service")}}}', id]));
      if (info.project !== project) throw new Error("container identity does not match owned fixture");
      delete info.project; report.environment.containers.push(info);
    }
    const pgPort = (await compose(["port", "postgres", "5432"])).split(":").at(-1);
    const s3Port = (await compose(["port", "storage", "8333"])).split(":").at(-1);
    if (!/^\d+$/u.test(pgPort) || !/^\d+$/u.test(s3Port)) throw new Error("isolated fixture did not publish loopback ports");
    const baseDSN = "postgres://pressure:" + secrets.PRESSURE_PG_PASSWORD + "@127.0.0.1:" + pgPort + "/postgres?sslmode=disable";
    const databaseURL = baseDSN.replace("/postgres?", "/" + databaseName + "?");
    assertDisposableDatabaseTarget({ databaseName, databaseURL, profile: "capacity", runID });
    let ready = false;
    for (let i = 0; i < 45; i++) {
      try { await command("psql", [baseDSN, "-X", "-Atqc", "SELECT 1"], { timeout: 3000 }); ready = true; break; }
      catch { await delay(1000, undefined, { signal: activeSignal }); }
    }
    if (!ready) throw new Error("isolated PostgreSQL startup failed");
    const { PRESSURE_S3_ACCESS_KEY: s3AccessKey, PRESSURE_S3_SECRET: s3Secret } = secrets;
    const s3Env = { ATTACHMENT_S3_ENDPOINT: "http://127.0.0.1:" + s3Port, ATTACHMENT_S3_BUCKET: "plush-pressure",
      ATTACHMENT_S3_REGION: "us-east-1", ATTACHMENT_S3_ACCESS_KEY_ID: s3AccessKey,
      ATTACHMENT_S3_SECRET_ACCESS_KEY: s3Secret };
    const runtimeEnv = { ...env, ...s3Env, POSTGRES_DSN: databaseURL, APP_ADMIN_USERNAME: "pressure_admin",
      APP_ADMIN_PASSWORD: secrets.adminPassword, APP_JWT_SECRET: secrets.jwtSecret,
      ERP_ROLE_DEMO_PASSWORD: secrets.rolePassword, APP_AUTH_SMS_MODE: "mock", ERP_DEBUG_ENV: "local", ERP_CUSTOMER_KEY: "yoyoosun",
      ERP_DEBUG_SEED_ENABLED: "false", ERP_DEBUG_CLEANUP_ENABLED: "false", ERP_DEBUG_BUSINESS_CLEAR_ENABLED: "false",
      ERP_ALLOW_LOCAL_TEST_CUSTOMER_CONFIG: "0", ERP_ALLOW_RELEASE_REHEARSAL_CUSTOMER_CONFIG: "0", GIT_SHA: commit };
    await step("migration", async () => {
      await command("psql", [baseDSN, "-X", "-v", "ON_ERROR_STOP=1", "-c", 'CREATE DATABASE "' + databaseName + '"']);
      await command("atlas", ["migrate", "apply", "--tx-mode", "all", "--dir", "file://internal/data/model/migrate", "--url", databaseURL],
        { cwd: source, timeout: 180000 });
      const status = JSON.parse(await command("atlas", ["migrate", "status", "--dir", "file://internal/data/model/migrate", "--url", databaseURL, "--format", "{{ json . }}"], { cwd: source }));
      if (status.Pending?.length || !/^\d{14}$/u.test(status.Current || "")) throw new Error("isolated migrations incomplete");
      report.migration = status.Current;
    });
    const { allocateLocalAcceptancePorts } = await import("./local-acceptance-lifecycle.mjs");
    const { httpPort } = await allocateLocalAcceptancePorts(root);
    writeFileSync(path.join(directory, "config.yaml"), [
      "server:", "  http:", "    addr: 127.0.0.1:" + httpPort, "    timeout: 45s",
      "log:", "  debug: false", "trace:", "  jaeger:", '    endpoint: ""', "    ratio: 0",
      "data:", "  postgres:", '    dsn: "' + databaseURL + '"', "    maxOpenConns: 20", "    maxIdleConns: 5",
      "    connMaxLifetime: 1800s", "    connMaxIdleTime: 300s", "    startupTimeout: 60s", "  auth:",
      '    jwtSecret: "' + secrets.jwtSecret + '"', "    jwtExpireSeconds: 3600", "    sms:", "      mode: mock",
      "    admin:", "      username: pressure_admin", '      password: "' + secrets.adminPassword + '"',
    ].join("\n") + "\n", { mode: 0o600 });
    runtimeEnv.DEV_HTTP_PORT = String(httpPort); const baseURL = "http://127.0.0.1:" + httpPort;
    report.backendURL = baseURL;
    await step("backend", async () => {
      // This profile covers business API traffic. Printing has a separate
      // resource boundary and is explicitly absent from this evidence.
      runtimeEnv.ERP_PDF_WARMUP = "0";
      runtimeEnv.TMPDIR = directory;
      report.pdf = { warmup: "disabled-by-profile", printingVerified: false };
      // On a root Linux runner, isolate the candidate from root's editor watch
      // quota using an unprivileged per-run numeric UID; no OS account is added.
      const backendUID = process.platform === "linux" && process.getuid?.() === 0 ? 100000 + randomBytes(3).readUIntBE(0, 3) : undefined;
      if (backendUID !== undefined) {
        chownSync(directory, backendUID, backendUID);
        chownSync(path.join(directory, "config.yaml"), backendUID, backendUID);
      }
      report.backendUID = backendUID ?? process.getuid?.();
      logStream = createWriteStream(path.join(directory, "backend.log"), { mode: 0o600 });
      backend = spawn(path.join(directory, "backend"), ["-conf", path.join(directory, "config.yaml")],
        { cwd: source, env: runtimeEnv, uid: backendUID, gid: backendUID, stdio: ["ignore", "pipe", "pipe"] });
      let spawnError;
      backend.once("error", (error) => { spawnError = error; });
      backend.stdout.pipe(logStream); backend.stderr.pipe(logStream, { end: false });
      let healthy = false;
      for (let i = 0; i < 60; i++) {
        if (spawnError || backend.exitCode !== null) throw new Error("candidate backend exited; inspect private backend log");
        try { const response = await fetch(baseURL + "/readyz", { signal: AbortSignal.timeout(2000) }); if (response.ok) { healthy = true; break; } }
        catch { /* Bounded readiness wait for this candidate only. */ }
        await delay(500, undefined, { signal: activeSignal });
      }
      if (!healthy) throw new Error("candidate backend readiness timed out");
      report.runtimeIdentity = await verifyPressureRuntime({ baseURL, databaseName, commit, migration: report.migration, signal: activeSignal });
    });
    await step("seed", async () => {
      await command("go", ["run", "-mod=readonly", "./cmd/seed-role-demo-admins", "--include-debug"], { cwd: source, env: runtimeEnv, timeout: 120000 });
      await command("go", ["run", "-mod=readonly", "./cmd/seed-core-demo-data", "--prefix", "SIM-PRESSURE"], { cwd: source, env: runtimeEnv, timeout: 120000 });
    });
    let dataset;
    await step("read-dataset-config", async () => {
      const saved = {};
      for (const [key, value] of Object.entries(s3Env)) { saved[key] = process.env[key]; process.env[key] = value; }
      try { dataset = runCapacityDataset({ confirmation: capacityDatasetConfirmation(databaseName), databaseName, databaseURL, dataScale }); }
      finally { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
      writePressureReport(path.join(path.dirname(out), "read-dataset.json"), dataset);
      const config = await applyCapacityCustomerConfig({ adminUsername: "pressure_admin", adminPassword: secrets.adminPassword,
        backendURL: baseURL, databaseName, databaseURL, datasetReceipt: dataset, commit, migration: report.migration,
        confirmation: capacityConfigConfirmation(databaseName, dataset.datasetHash) });
      report.readDataset = { dataScale, target: dataset.targetCounts, actual: dataset.after };
      await command("psql", [databaseURL, "-X", "-v", "ON_ERROR_STOP=1", "-c", "ANALYZE"]);
      report.customerConfig = { revision: config.revision, status: config.status };
    });
    await step("read-pressure", async () => {
      const read = await runIsolatedPressure({ baseURL, databaseName, databaseURL, datasetReceipt: dataset, expectedCommit: commit,
        expectedMigration: report.migration, adminUsername: "pressure_admin", password: secrets.adminPassword,
        rolePassword: secrets.rolePassword, confirm: CONFIRM_PHRASE, taskSourceType: dataset.taskSourceType,
        taskSourceID: dataset.taskSourceID, profile: "capacity", signal: activeSignal });
      writePressureReport(path.join(path.dirname(out), "read-pressure.json"), read); report.readPressurePassed = read.passed;
      return read;
    });
    const tokens = {};
    for (const role of ["admin", "sales", "engineering", "boss", "finance", "purchase", "pmc"]) {
      const result = await pressureRPC({ baseURL, domain: "auth", method: "admin_login",
        params: { username: role === "admin" ? "pressure_admin" : "demo_" + role,
          password: role === "admin" ? secrets.adminPassword : secrets.rolePassword },
        validate: (data) => Boolean(data.access_token) && !data.disabled &&
          (role === "admin" ? data.is_super_admin === true : data.is_super_admin !== true && data.roles?.some((item) => item.role_key === role)) });
      if (!result.ok) throw new Error("pressure role login or role identity failed: " + role);
      tokens[role] = result.data.access_token;
    }
    if (report.businessSourceFingerprint !== pressureLogicFingerprint(ENGINEERING_DATA_FILES.filter((file) => file.startsWith("server/"))))
      throw new Error("business source changed after candidate build; restart required");
    const receipt = await step("engineering-data", () => prepareEngineeringPressureData({
      baseURL, databaseName, databaseURL, tokens, runID, poolSize: plan.poolSize, runtimeIdentity: report.runtimeIdentity, dataScale, signal: activeSignal, onProgress,
    }));
    writePressureReport(path.join(path.dirname(out), "engineering-dataset.json"), receipt);
    await command("psql", [databaseURL, "-X", "-v", "ON_ERROR_STOP=1", "-c", "ANALYZE"]);
    await step("engineering-pressure", async () => {
      const business = await runEngineeringPressure({ baseURL, databaseName, databaseURL, tokens, receipt,
        expectedCommit: commit, expectedMigration: report.migration, profile, signal: activeSignal, onProgress });
      writePressureReport(path.join(path.dirname(out), "engineering-pressure.json"), business);
      report.engineeringPressurePassed = business.passed;
      return business;
    });
    report.passed = report.readPressurePassed && report.engineeringPressurePassed;
  } catch (error) {
    report.failure = { step: stage, message: redact(error.message) }; report.passed = false;
    onProgress({ step: stage, status: "failed", message: report.failure.message });
  } finally {
    clearTimeout(totalTimer); controller.abort();
    const cleanupStarted = performance.now();
    onProgress({ step: "cleanup", status: "started" });
    if (backend?.pid && backend.exitCode === null) {
      backend.kill("SIGTERM");
      await Promise.race([new Promise((resolve) => backend.once("exit", resolve)), delay(5000)]);
      if (backend.exitCode === null) { backend.kill("SIGKILL"); await new Promise((resolve) => backend.once("exit", resolve)); }
    }
    logStream?.end();
    try {
      if (composeCreated) {
        await command("docker", [...composeArgs, "down", "--volumes", "--timeout", "5"], { signal: undefined, timeout: 30000 });
        const containers = await command("docker", ["ps", "-aq", "--filter", "label=com.docker.compose.project=" + project], { signal: undefined });
        const volumes = await command("docker", ["volume", "ls", "-q", "--filter", "label=com.docker.compose.project=" + project], { signal: undefined });
        const networks = await command("docker", ["network", "ls", "-q", "--filter", "label=com.docker.compose.project=" + project], { signal: undefined });
        if (containers || volumes || networks) throw new Error("owned fixture resources still exist");
      }
      report.cleanup = { passed: true, backendStopped: true, containersRemoved: true, ownedVolumesRemoved: true, ownedNetworksRemoved: true };
      if (report.passed) { rmSync(directory, { recursive: true, force: true }); delete report.evidenceDirectory; }
    } catch { report.cleanup = { passed: false, preservedDirectory: directory }; report.passed = false; }
    report.steps.push({ key: "cleanup", durationMs: performance.now() - cleanupStarted, passed: report.cleanup.passed });
    onProgress({ step: "cleanup", status: "completed", passed: report.cleanup.passed });
    report.completedAt = new Date().toISOString(); writePressureReport(out, report);
  }
  return report;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const argv = process.argv.slice(2), arg = (name) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : undefined; };
  const profile = arg("--profile") || "capacity", dataScale = arg("--data-scale") || "baseline";
  if (!argv.includes("--run") || argv.includes("--help")) process.stdout.write(JSON.stringify(pressureLifecyclePlan(profile, dataScale), null, 2) + "\n");
  else {
    const out = path.resolve(arg("--out") || "output/qa/pressure/" + createDatabaseRunID() + "/lifecycle.json");
    const controller = new AbortController(), stop = () => controller.abort();
    process.once("SIGINT", stop); process.once("SIGTERM", stop);
    let progress;
    const result = await runPressureLifecycle({ profile, dataScale, out, signal: controller.signal,
      onProgress: (value) => {
        progress = updatePressureProgress(progress, value);
        // Progress publication must never prevent owned resource cleanup.
        try { if (progress) writePressureReport(path.join(path.dirname(out), "progress.json"), progress); }
        catch { process.stderr.write("pressure progress publication unavailable\n"); }
        process.stdout.write("[pressure] " + JSON.stringify(value) + "\n");
      } });
    process.stdout.write("[pressure] passed=" + result.passed + " report=" + out + "\n");
    if (!result.passed) process.exitCode = 1;
  }
}
