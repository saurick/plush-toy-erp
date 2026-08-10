#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const MANAGED_DATABASE_IMAGE = "postgres:18.1";
export const MANAGED_DATABASE_LABELS = Object.freeze({
  managed: "com.plush-toy-erp.qa.managed",
  operation: "com.plush-toy-erp.qa.operation",
  repository: "com.plush-toy-erp.qa.repository",
});
export const MANAGED_DATABASE_EVENTS = Object.freeze({
  ready: "[qa:managed-database] status=ready",
  cleanupComplete: "[qa:managed-database] status=cleanup-complete",
  cleanupFailed: "[qa:managed-database] status=cleanup-failed",
});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const EXACT_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const MANAGED_EXACT_SHA_MAIN_REF = "HEAD";
const MANAGED_DATABASE_TIMEOUT_MS = 60_000;
const MANAGED_DATABASE_POLL_MS = 250;

function repositoryScope(repoRoot) {
  return createHash("sha256").update(path.resolve(repoRoot)).digest("hex");
}

export function parseManagedDatabaseArgs(argv) {
  const options = {
    exactSha: "",
    gate: "",
    mainRef: "",
    operationId: "",
  };
  const seen = new Set();
  const allowlistedArguments = new Set([
    "--exact-sha",
    "--gate",
    "--main-ref",
    "--operation-id",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (!allowlistedArguments.has(argument) || seen.has(argument)) {
      throw new Error("managed quality gate argument is not allowlisted");
    }
    if (typeof value !== "string" || !value || value.startsWith("--")) {
      throw new Error("managed quality gate argument requires a value");
    }
    seen.add(argument);
    if (argument === "--exact-sha") options.exactSha = value;
    else if (argument === "--gate") options.gate = value;
    else if (argument === "--main-ref") options.mainRef = value;
    else options.operationId = value;
    index += 1;
  }
  if (!UUID_PATTERN.test(options.operationId)) {
    throw new Error("managed quality gate operation id is invalid");
  }
  const request = normalizeManagedQualityGateRequest(options);
  return Object.freeze({ ...request, operationId: options.operationId });
}

function normalizeManagedQualityGateRequest({
  exactSha = "",
  gate = "",
  mainRef = "",
} = {}) {
  const hasGate = gate !== "";
  const hasExactSha = exactSha !== "" || mainRef !== "";
  if (hasGate === hasExactSha) {
    throw new Error("managed quality gate request mode is invalid");
  }
  if (hasGate) {
    if (!["full", "strict"].includes(gate)) {
      throw new Error("managed quality gate must be full or strict");
    }
    return Object.freeze({ gate });
  }
  if (!EXACT_SHA_PATTERN.test(exactSha)) {
    throw new Error("managed exact SHA is invalid");
  }
  if (mainRef !== MANAGED_EXACT_SHA_MAIN_REF) {
    throw new Error("managed exact SHA main ref is invalid");
  }
  return Object.freeze({ exactSha, mainRef });
}

export function buildManagedQualityGateCommand({
  databaseURL,
  environment = process.env,
  exactSha = "",
  gate = "",
  mainRef = "",
  repoRoot = path.resolve(import.meta.dirname, "../.."),
} = {}) {
  if (typeof databaseURL !== "string" || databaseURL.length === 0) {
    throw new Error("managed quality gate database URL is invalid");
  }
  const request = normalizeManagedQualityGateRequest({
    exactSha,
    gate,
    mainRef,
  });
  const args = request.gate
    ? ["scripts/qa/run-gate-with-receipt.mjs", "--gate", request.gate]
    : [
        "scripts/qa/exact-sha-gate.mjs",
        "--sha",
        request.exactSha,
        "--main-ref",
        request.mainRef,
        "--run",
        "--json",
      ];
  return Object.freeze({
    args: Object.freeze(args),
    command: process.execPath,
    cwd: path.resolve(repoRoot),
    env: Object.freeze({
      ...environment,
      DISPOSABLE_DATABASE_BASE_URL: databaseURL,
    }),
    shell: false,
  });
}

export function buildManagedDatabaseContainerSpec({
  operationId,
  password,
  repoRoot,
}) {
  if (!UUID_PATTERN.test(String(operationId || ""))) {
    throw new Error("managed database operation id is invalid");
  }
  if (typeof password !== "string" || password.length < 32) {
    throw new Error("managed database password is invalid");
  }
  const labels = Object.freeze({
    [MANAGED_DATABASE_LABELS.managed]: "true",
    [MANAGED_DATABASE_LABELS.operation]: operationId,
    [MANAGED_DATABASE_LABELS.repository]: repositoryScope(repoRoot),
  });
  const name = `plush-qa-${operationId}`;
  return Object.freeze({
    image: MANAGED_DATABASE_IMAGE,
    labels,
    name,
    args: Object.freeze([
      "run",
      "--detach",
      "--rm",
      "--pull",
      "never",
      "--name",
      name,
      "--label",
      `${MANAGED_DATABASE_LABELS.managed}=true`,
      "--label",
      `${MANAGED_DATABASE_LABELS.operation}=${operationId}`,
      "--label",
      `${MANAGED_DATABASE_LABELS.repository}=${labels[MANAGED_DATABASE_LABELS.repository]}`,
      "--env",
      "POSTGRES_PASSWORD",
      "--env",
      "POSTGRES_USER=postgres",
      "--publish",
      "127.0.0.1::5432",
      "--health-cmd",
      "pg_isready -U postgres -d postgres",
      "--health-interval",
      "1s",
      "--health-timeout",
      "3s",
      "--health-retries",
      "30",
      MANAGED_DATABASE_IMAGE,
    ]),
    env: Object.freeze({ ...process.env, POSTGRES_PASSWORD: password }),
  });
}

export function readManagedLoopbackPort(container) {
  const bindings = container?.NetworkSettings?.Ports?.["5432/tcp"];
  if (!Array.isArray(bindings) || bindings.length !== 1) {
    throw new Error("managed database port binding is unavailable");
  }
  const binding = bindings[0];
  const port = Number(binding?.HostPort);
  if (
    binding?.HostIp !== "127.0.0.1" ||
    !Number.isSafeInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error("managed database must use one loopback port");
  }
  return port;
}

function command(commandName, args, options = {}) {
  return spawnSync(commandName, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env || process.env,
    maxBuffer: 2 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeout || 30_000,
  });
}

export function parseManagedDatabaseInspectResult(result, name) {
  if (!/^plush-qa-[0-9a-f-]{36}$/u.test(String(name || ""))) {
    throw new Error("managed database container name is invalid");
  }
  if (result.error) {
    throw new Error("managed database inspection failed");
  }
  if (result.status !== 0) {
    const detail = `${String(result.stderr || "")}\n${String(result.stdout || "")}`;
    const normalizedName = name.toLowerCase();
    const confirmedAbsenceMessages = new Set([
      `no such object: ${normalizedName}`,
      `no such container: ${normalizedName}`,
      `error: no such object: ${normalizedName}`,
      `error: no such container: ${normalizedName}`,
      `error response from daemon: no such object: ${normalizedName}`,
      `error response from daemon: no such container: ${normalizedName}`,
    ]);
    const confirmsAbsence = detail
      .split(/\r?\n/u)
      .some((line) => confirmedAbsenceMessages.has(line.trim().toLowerCase()));
    if (confirmsAbsence) {
      return null;
    }
    throw new Error("managed database inspection failed");
  }
  let value;
  try {
    value = JSON.parse(String(result.stdout || ""));
  } catch {
    throw new Error("managed database inspection is invalid");
  }
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error("managed database inspection is invalid");
  }
  return value[0];
}

function defaultRuntime({ repoRoot }) {
  return {
    probe() {
      const server = command("docker", [
        "version",
        "--format",
        "{{.Server.Version}}",
      ]);
      if (
        server.error ||
        server.status !== 0 ||
        !String(server.stdout).trim()
      ) {
        return Object.freeze({
          ready: false,
          message: "本机 Docker 服务尚未就绪，无法自动准备隔离数据库",
        });
      }
      const image = command("docker", [
        "image",
        "inspect",
        MANAGED_DATABASE_IMAGE,
      ]);
      if (image.error || image.status !== 0) {
        return Object.freeze({
          ready: false,
          message: `本机尚未准备固定数据库镜像 ${MANAGED_DATABASE_IMAGE}`,
        });
      }
      return Object.freeze({
        ready: true,
        message: `运行时将自动创建并清理本机 ${MANAGED_DATABASE_IMAGE} 隔离数据库`,
      });
    },
    start(spec) {
      const result = command("docker", spec.args, { env: spec.env });
      if (result.error || result.status !== 0) {
        throw new Error("managed database container did not start");
      }
      return String(result.stdout || "").trim();
    },
    inspect(name) {
      return parseManagedDatabaseInspectResult(
        command("docker", ["inspect", name]),
        name,
      );
    },
    remove(name) {
      const result = command("docker", ["rm", "--force", name]);
      if (result.error || result.status !== 0) {
        throw new Error("managed database container cleanup failed");
      }
    },
    runGate({ databaseURL, exactSha, gate, mainRef, onChild }) {
      const commandSpec = buildManagedQualityGateCommand({
        databaseURL,
        exactSha,
        gate,
        mainRef,
        repoRoot,
      });
      const child = spawn(commandSpec.command, commandSpec.args, {
        cwd: commandSpec.cwd,
        env: commandSpec.env,
        shell: commandSpec.shell,
        stdio: "inherit",
      });
      onChild(child);
      return new Promise((resolve) => {
        let settled = false;
        const finish = (result) => {
          if (settled) return;
          settled = true;
          resolve(result);
        };
        child.once("error", () => finish({ code: null, signal: "" }));
        child.once("close", (code, signal) =>
          finish({
            code: Number.isSafeInteger(code) ? code : null,
            signal: signal || "",
          }),
        );
      });
    },
    sleep(delayMs) {
      return new Promise((resolve) => setTimeout(resolve, delayMs));
    },
  };
}

function assertOwnedContainer(container, spec) {
  const labels = container?.Config?.Labels;
  if (
    !labels ||
    Object.entries(spec.labels).some(([key, value]) => labels[key] !== value)
  ) {
    throw new Error("managed database container ownership is invalid");
  }
}

async function waitForHealthyContainer(runtime, spec) {
  const deadline = Date.now() + MANAGED_DATABASE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const container = runtime.inspect(spec.name);
    if (!container) throw new Error("managed database container stopped early");
    assertOwnedContainer(container, spec);
    const health = container.State?.Health?.Status;
    if (health === "healthy") return container;
    if (health === "unhealthy") {
      throw new Error("managed database container is unhealthy");
    }
    await runtime.sleep(MANAGED_DATABASE_POLL_MS);
  }
  throw new Error("managed database readiness timed out");
}

async function removeOwnedContainer(runtime, spec) {
  const container = runtime.inspect(spec.name);
  if (!container) return true;
  assertOwnedContainer(container, spec);
  runtime.remove(spec.name);
  return runtime.inspect(spec.name) === null;
}

export function probeManagedDatabaseRuntime({ repoRoot, runtime } = {}) {
  const root = path.resolve(
    repoRoot || path.join(import.meta.dirname, "../.."),
  );
  try {
    const result = (runtime || defaultRuntime({ repoRoot: root })).probe();
    return result?.ready === true
      ? Object.freeze({
          ready: true,
          message: boundedReadinessMessage(
            result.message,
            "本机托管一次性数据库环境已就绪",
          ),
        })
      : Object.freeze({
          ready: false,
          message: boundedReadinessMessage(
            result?.message,
            "本机一次性数据库运行环境尚未就绪",
          ),
        });
  } catch {
    return Object.freeze({
      ready: false,
      message: "本机一次性数据库运行环境检查失败",
    });
  }
}

function boundedReadinessMessage(value, fallback) {
  const message = typeof value === "string" ? value : "";
  const hasControlCharacter = [...message].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 31 || codePoint === 127;
  });
  return message && message.length <= 200 && !hasControlCharacter
    ? message
    : fallback;
}

export async function runManagedQualityGate({
  exactSha,
  gate,
  mainRef,
  operationId,
  repoRoot = path.resolve(import.meta.dirname, "../.."),
  runtime,
  randomPassword = () => randomBytes(32).toString("base64url"),
  stdout = process.stdout,
  processRef = process,
} = {}) {
  const requestArgs = [];
  if (gate) requestArgs.push("--gate", gate);
  if (exactSha) requestArgs.push("--exact-sha", exactSha);
  if (mainRef) requestArgs.push("--main-ref", mainRef);
  requestArgs.push("--operation-id", operationId);
  const request = parseManagedDatabaseArgs(requestArgs);
  const executor = runtime || defaultRuntime({ repoRoot });
  let readiness;
  try {
    readiness = executor.probe();
  } catch {
    stdout.write(`${MANAGED_DATABASE_EVENTS.cleanupComplete}\n`);
    return Object.freeze({ code: 2, cleanup: "complete" });
  }
  if (!readiness?.ready) {
    stdout.write(`${MANAGED_DATABASE_EVENTS.cleanupComplete}\n`);
    return Object.freeze({ code: 2, cleanup: "complete" });
  }
  const password = randomPassword();
  const spec = buildManagedDatabaseContainerSpec({
    operationId,
    password,
    repoRoot,
  });
  let child = null;
  let startAttempted = false;
  let cleanupComplete = false;
  let forwardedSignal = "";
  const forward = (signal) => {
    forwardedSignal ||= signal;
    try {
      child?.kill?.(signal);
    } catch {
      // The gate exit and exact container readback remain authoritative.
    }
  };
  const onSigterm = () => forward("SIGTERM");
  const onSigint = () => forward("SIGINT");
  processRef.on("SIGTERM", onSigterm);
  processRef.on("SIGINT", onSigint);
  let result = { code: null, signal: "" };
  try {
    startAttempted = true;
    executor.start(spec);
    const container = await waitForHealthyContainer(executor, spec);
    const port = readManagedLoopbackPort(container);
    const databaseURL = `postgres://postgres:${encodeURIComponent(password)}@127.0.0.1:${port}/postgres?sslmode=disable`;
    stdout.write(`${MANAGED_DATABASE_EVENTS.ready}\n`);
    result = await executor.runGate({
      databaseURL,
      exactSha: request.exactSha,
      gate: request.gate,
      mainRef: request.mainRef,
      onChild(value) {
        child = value;
        if (forwardedSignal) forward(forwardedSignal);
      },
    });
  } catch {
    result = { code: null, signal: "" };
  } finally {
    processRef.removeListener("SIGTERM", onSigterm);
    processRef.removeListener("SIGINT", onSigint);
    try {
      cleanupComplete =
        !startAttempted || (await removeOwnedContainer(executor, spec));
    } catch {
      cleanupComplete = false;
    }
    stdout.write(
      `${cleanupComplete ? MANAGED_DATABASE_EVENTS.cleanupComplete : MANAGED_DATABASE_EVENTS.cleanupFailed}\n`,
    );
  }
  return Object.freeze({
    code:
      cleanupComplete && !forwardedSignal && result.code === 0
        ? 0
        : result.code || 2,
    cleanup: cleanupComplete ? "complete" : "failed",
  });
}

async function main() {
  let options;
  try {
    options = parseManagedDatabaseArgs(process.argv.slice(2));
  } catch {
    process.stderr.write("managed quality gate request is invalid\n");
    process.exitCode = 2;
    return;
  }
  const result = await runManagedQualityGate(options);
  process.exitCode = result.code;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await main();
}
