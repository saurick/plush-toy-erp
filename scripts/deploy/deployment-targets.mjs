import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const DEPLOYMENT_TARGET_REGISTRY_CONTRACT =
  "plush.deployment-target-registry/v1";
export const SUPPORTED_DEPLOYMENT_TARGET_KEYS = Object.freeze([
  "demo-133",
  "customer-test-133",
]);

const TARGET_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CUSTOMER_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const HOST_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?|(?:[0-9]{1,3}\.){3}[0-9]{1,3})$/u;
const USER_PATTERN = /^[a-z_][a-z0-9_-]{0,31}$/u;
const HOSTNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$/u;
const PROJECT_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/u;
const SERVICE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/u;
const SAFE_RELATIVE_PATH_PATTERN =
  /^(?!\/)(?!.*(?:^|\/)\.\.?($|\/))[A-Za-z0-9._/-]+$/u;
const DATABASE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/u;
const LOOPBACK_ADDRESS = "127.0.0.1";
const JAEGER_PORT_KEYS = Object.freeze([
  "agentCompact",
  "agentThriftBinary",
  "agentThriftCompact",
  "collectorGrpc",
  "collectorHttp",
  "config",
  "otlpGrpc",
  "otlpHttp",
  "ui",
  "zipkin",
]);

const FIXED_COMPOSE_DIRECTORY = "server/deploy/compose/prod";
const FIXED_TARGET_IDENTITIES = Object.freeze({
  "demo-133": Object.freeze({
    purpose: "project-demo-simulated",
    trialTarget: "customer-trial-133",
    root: "/home/simon/plush-toy-erp-demo-v1",
    runtimeEnv: "/home/simon/plush-toy-erp-demo-v1/runtime/.env.demo-133",
    projectName: "plush-toy-erp-demo-v1",
    overrideFile: "compose.demo-133.yml",
    databaseName: "plush_erp_demo_v1",
    postgresPort: 55436,
    postgresDataDirectory:
      "/home/simon/plush-toy-erp-demo-v1/data/postgres",
    serverPort: 8325,
    webPort: 5195,
    jaegerPorts: Object.freeze({
      agentCompact: 61001,
      agentThriftCompact: 61002,
      agentThriftBinary: 61003,
      config: 61004,
      ui: 61005,
      collectorHttp: 61006,
      collectorGrpc: 61007,
      zipkin: 61008,
      otlpGrpc: 61009,
      otlpHttp: 61010,
    }),
    publicEndpoint: "https://demo.yoyoosun.net",
    publicContainerPrefix: "plush-toy-erp-demo-web-public-",
    publicNetwork: "plush-toy-erp-demo-v1_default",
    publicHostPort: 5176,
  }),
  "customer-test-133": Object.freeze({
    purpose: "customer-clean-acceptance",
    trialTarget: "none",
    root: "/home/simon/plush-toy-erp-test-v1",
    runtimeEnv:
      "/home/simon/plush-toy-erp-test-v1/runtime/.env.customer-test-133",
    projectName: "plush-toy-erp-test-v1",
    overrideFile: "compose.customer-test-133.yml",
    databaseName: "plush_erp_customer_test_v1",
    postgresPort: 55437,
    postgresDataDirectory: "/home/simon/plush-toy-erp-test-v1/data/postgres",
    serverPort: 8335,
    webPort: 5205,
    jaegerPorts: Object.freeze({
      agentCompact: 62001,
      agentThriftCompact: 62002,
      agentThriftBinary: 62003,
      config: 62004,
      ui: 62005,
      collectorHttp: 62006,
      collectorGrpc: 62007,
      zipkin: 62008,
      otlpGrpc: 62009,
      otlpHttp: 62010,
    }),
    publicEndpoint: "https://test.yoyoosun.net",
    publicContainerPrefix: "plush-toy-erp-test-web-public-",
    publicNetwork: "plush-toy-erp-test-v1_default",
    publicHostPort: 5177,
  }),
});

function assertPlainObject(value, field) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${field} must be a plain object`);
  }
  return value;
}

function assertExactKeys(value, keys, field) {
  const actual = Object.keys(assertPlainObject(value, field)).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${field} keys do not match the fixed contract`);
  }
}

function assertPattern(value, pattern, field) {
  const text = String(value || "");
  if (!pattern.test(text)) throw new Error(`${field} is invalid`);
  return text;
}

function assertInteger(value, { minimum, maximum }, field) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${field} is invalid`);
  }
  return value;
}

function assertFixedAbsolutePath(value, prefix, field) {
  const text = String(value || "");
  if (
    !path.posix.isAbsolute(text) ||
    path.posix.normalize(text) !== text ||
    (text !== prefix && !text.startsWith(`${prefix}/`))
  ) {
    throw new Error(`${field} must remain inside the fixed target root`);
  }
  return text;
}

function assertLoopbackHttpUrl(value, expectedPort, field) {
  let parsed;
  try {
    parsed = new URL(String(value || ""));
  } catch {
    throw new Error(`${field} is invalid`);
  }
  if (
    parsed.protocol !== "http:" ||
    parsed.hostname !== "127.0.0.1" ||
    parsed.port !== String(expectedPort) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${field} must be the fixed loopback endpoint`);
  }
  return parsed.toString().replace(/\/$/u, "");
}

export function validateDeploymentTarget(target) {
  assertExactKeys(
    target,
    [
      "capacity",
      "compose",
      "customer",
      "database",
      "enabled",
      "endpoints",
      "filesystem",
      "key",
      "purpose",
      "publicEntry",
      "runtime",
      "ssh",
      "trialTarget",
    ],
    "deployment target",
  );
  const key = assertPattern(target.key, TARGET_KEY_PATTERN, "target key");
  if (!SUPPORTED_DEPLOYMENT_TARGET_KEYS.includes(key)) {
    throw new Error(`unsupported deployment target: ${key}`);
  }
  const identity = FIXED_TARGET_IDENTITIES[key];
  if (target.enabled !== true || target.purpose !== identity.purpose) {
    throw new Error("target purpose does not match the fixed environment role");
  }
  assertPattern(target.customer, CUSTOMER_KEY_PATTERN, "target customer");
  if (
    target.customer !== "yoyoosun" ||
    target.trialTarget !== identity.trialTarget
  ) {
    throw new Error("target customer/trial identity is invalid");
  }

  assertExactKeys(
    target.ssh,
    ["expectedHostname", "host", "port", "user"],
    "target ssh",
  );
  assertPattern(target.ssh.host, HOST_PATTERN, "target ssh host");
  assertInteger(
    target.ssh.port,
    { minimum: 1, maximum: 65535 },
    "target ssh port",
  );
  assertPattern(target.ssh.user, USER_PATTERN, "target ssh user");
  assertPattern(
    target.ssh.expectedHostname,
    HOSTNAME_PATTERN,
    "target expected hostname",
  );
  if (target.ssh.expectedHostname !== "r640") {
    throw new Error("target hostname identity is invalid");
  }

  assertExactKeys(
    target.filesystem,
    ["current", "operationRoot", "releases", "root", "runtimeEnv"],
    "target filesystem",
  );
  for (const [name, value] of Object.entries(target.filesystem)) {
    assertFixedAbsolutePath(value, identity.root, `target filesystem.${name}`);
  }
  if (
    target.filesystem.root !== identity.root ||
    target.filesystem.current !== `${identity.root}/current` ||
    target.filesystem.releases !== `${identity.root}/releases` ||
    target.filesystem.runtimeEnv !== identity.runtimeEnv ||
    target.filesystem.operationRoot !== `${identity.root}/operations`
  ) {
    throw new Error(
      "target filesystem paths differ from the fixed target contract",
    );
  }

  assertExactKeys(
    target.compose,
    [
      "baseFile",
      "directory",
      "overrideFile",
      "postgresService",
      "projectName",
      "serverService",
      "webService",
    ],
    "target compose",
  );
  if (
    target.compose.projectName !== identity.projectName ||
    target.compose.directory !== FIXED_COMPOSE_DIRECTORY ||
    target.compose.baseFile !== "compose.yml" ||
    target.compose.overrideFile !== identity.overrideFile
  ) {
    throw new Error("target Compose identity is invalid");
  }
  for (const field of [
    "projectName",
    "serverService",
    "webService",
    "postgresService",
  ]) {
    assertPattern(
      target.compose[field],
      field === "projectName" ? PROJECT_PATTERN : SERVICE_PATTERN,
      `target compose.${field}`,
    );
  }
  for (const field of ["directory", "baseFile", "overrideFile"]) {
    assertPattern(
      target.compose[field],
      SAFE_RELATIVE_PATH_PATTERN,
      `target compose.${field}`,
    );
  }

  assertExactKeys(
    target.database,
    ["migrationLock", "name"],
    "target database",
  );
  assertPattern(target.database.name, DATABASE_PATTERN, "target database name");
  if (target.database.name !== identity.databaseName) {
    throw new Error("target database identity is invalid");
  }
  assertFixedAbsolutePath(
    target.database.migrationLock,
    identity.root,
    "target database migration lock",
  );
  if (
    target.database.migrationLock !==
    `${identity.root}/run/atlas-migrate.lock`
  ) {
    throw new Error("target migration lock is invalid");
  }

  assertExactKeys(
    target.runtime,
    ["app", "jaeger", "postgres", "web"],
    "target runtime",
  );
  assertExactKeys(
    target.runtime.postgres,
    ["bindAddress", "dataDirectory", "hostPort"],
    "target runtime.postgres",
  );
  assertExactKeys(
    target.runtime.app,
    ["bindAddress", "hostPort"],
    "target runtime.app",
  );
  assertExactKeys(
    target.runtime.web,
    ["bindAddress", "hostPort"],
    "target runtime.web",
  );
  assertExactKeys(
    target.runtime.jaeger,
    ["bindAddress", "ports"],
    "target runtime.jaeger",
  );
  assertExactKeys(
    target.runtime.jaeger.ports,
    JAEGER_PORT_KEYS,
    "target runtime.jaeger.ports",
  );
  for (const section of ["postgres", "app", "web", "jaeger"]) {
    if (target.runtime[section].bindAddress !== LOOPBACK_ADDRESS) {
      throw new Error("target runtime bind address must remain loopback-only");
    }
  }
  for (const [field, value] of [
    ["postgres", target.runtime.postgres.hostPort],
    ["app", target.runtime.app.hostPort],
    ["web", target.runtime.web.hostPort],
    ...Object.entries(target.runtime.jaeger.ports),
  ]) {
    assertInteger(
      value,
      { minimum: 1024, maximum: 65535 },
      `target runtime port ${field}`,
    );
  }
  assertFixedAbsolutePath(
    target.runtime.postgres.dataDirectory,
    identity.root,
    "target runtime.postgres.dataDirectory",
  );
  if (
    target.runtime.postgres.hostPort !== identity.postgresPort ||
    target.runtime.postgres.dataDirectory !== identity.postgresDataDirectory ||
    target.runtime.app.hostPort !== identity.serverPort ||
    target.runtime.web.hostPort !== identity.webPort ||
    JAEGER_PORT_KEYS.some(
      (field) =>
        target.runtime.jaeger.ports[field] !== identity.jaegerPorts[field],
    )
  ) {
    throw new Error("target runtime identity is invalid");
  }
  const allTargetPorts = [
    target.runtime.postgres.hostPort,
    target.runtime.app.hostPort,
    target.runtime.web.hostPort,
    target.publicEntry.hostPort,
    ...Object.values(target.runtime.jaeger.ports),
  ];
  if (new Set(allTargetPorts).size !== allTargetPorts.length) {
    throw new Error("target runtime ports must be unique within the target");
  }

  assertExactKeys(target.endpoints, ["server", "web"], "target endpoints");
  assertLoopbackHttpUrl(
    target.endpoints.server,
    identity.serverPort,
    "target server endpoint",
  );
  assertLoopbackHttpUrl(
    target.endpoints.web,
    identity.webPort,
    "target web endpoint",
  );

  assertExactKeys(
    target.publicEntry,
    ["apiOrigin", "containerPrefix", "endpoint", "hostPort", "network"],
    "target public entry",
  );
  if (
    target.publicEntry.endpoint !== identity.publicEndpoint ||
    target.publicEntry.containerPrefix !== identity.publicContainerPrefix ||
    target.publicEntry.network !== identity.publicNetwork ||
    target.publicEntry.hostPort !== identity.publicHostPort ||
    target.publicEntry.apiOrigin !== "http://app-server:8300"
  ) {
    throw new Error("target public entry identity is invalid");
  }

  assertExactKeys(
    target.capacity,
    ["minimumAvailableBytes"],
    "target capacity",
  );
  assertInteger(
    target.capacity.minimumAvailableBytes,
    { minimum: 10 * 1024 ** 3, maximum: 1024 * 1024 ** 3 },
    "target minimum available bytes",
  );
  return target;
}

export function validateDeploymentTargetRegistry(registry) {
  assertExactKeys(registry, ["schemaVersion", "targets"], "target registry");
  if (registry.schemaVersion !== DEPLOYMENT_TARGET_REGISTRY_CONTRACT) {
    throw new Error("target registry schemaVersion is invalid");
  }
  if (
    !Array.isArray(registry.targets) ||
    registry.targets.length !== SUPPORTED_DEPLOYMENT_TARGET_KEYS.length
  ) {
    throw new Error(
      "target registry must contain the exact supported target set",
    );
  }
  const targets = registry.targets.map(validateDeploymentTarget);
  if (
    targets.some(
      (target, index) => target.key !== SUPPORTED_DEPLOYMENT_TARGET_KEYS[index],
    )
  ) {
    throw new Error("target registry order/identity is invalid");
  }
  for (const [field, values] of [
    ["filesystem root", targets.map((target) => target.filesystem.root)],
    ["Compose project", targets.map((target) => target.compose.projectName)],
    ["database", targets.map((target) => target.database.name)],
    [
      "PostgreSQL data directory",
      targets.map((target) => target.runtime.postgres.dataDirectory),
    ],
    ["public endpoint", targets.map((target) => target.publicEntry.endpoint)],
  ]) {
    if (new Set(values).size !== values.length) {
      throw new Error(`deployment target ${field} identities must be isolated`);
    }
  }
  const hostPorts = targets.flatMap((target) => [
    target.runtime.postgres.hostPort,
    target.runtime.app.hostPort,
    target.runtime.web.hostPort,
    target.publicEntry.hostPort,
    ...Object.values(target.runtime.jaeger.ports),
  ]);
  if (new Set(hostPorts).size !== hostPorts.length) {
    throw new Error("deployment target host ports must be isolated");
  }
  return registry;
}

export function defaultDeploymentTargetRegistryPath() {
  return fileURLToPath(new URL("./deployment-targets.json", import.meta.url));
}

export function loadDeploymentTargetRegistry(
  registryPath = defaultDeploymentTargetRegistryPath(),
) {
  const absolute = realpathSync(registryPath);
  return validateDeploymentTargetRegistry(
    JSON.parse(readFileSync(absolute, "utf8")),
  );
}

export function getDeploymentTarget(
  key,
  registry = loadDeploymentTargetRegistry(),
) {
  if (!SUPPORTED_DEPLOYMENT_TARGET_KEYS.includes(String(key || ""))) {
    throw new Error(`unsupported deployment target: ${String(key || "")}`);
  }
  const target = registry.targets.find((item) => item.key === key);
  if (!target) throw new Error(`deployment target is not registered: ${key}`);
  return validateDeploymentTarget(target);
}

function parseArgs(argv) {
  const options = { list: false, target: "", json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--list") {
      options.list = true;
      continue;
    }
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--target") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--target requires a value");
      }
      options.target = value;
      index += 1;
      continue;
    }
    throw new Error(`unsupported argument: ${token}`);
  }
  if (!options.help && options.list === Boolean(options.target)) {
    throw new Error("choose exactly one of --list or --target");
  }
  return options;
}

function publicTarget(target) {
  return {
    key: target.key,
    enabled: target.enabled,
    purpose: target.purpose,
    customer: target.customer,
    trialTarget: target.trialTarget,
    endpoints: target.endpoints,
    publicEntry: {
      endpoint: target.publicEntry.endpoint,
      hostPort: target.publicEntry.hostPort,
    },
    minimumAvailableBytes: target.capacity.minimumAvailableBytes,
  };
}

function isMainModule() {
  try {
    return (
      realpathSync(fileURLToPath(import.meta.url)) ===
      realpathSync(process.argv[1])
    );
  } catch {
    return false;
  }
}

if (isMainModule()) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(`Usage:
  node scripts/deploy/deployment-targets.mjs --list [--json]
  node scripts/deploy/deployment-targets.mjs --target <demo-133|customer-test-133> [--json]

The registry is committed and fixed. CLI/browser callers cannot provide SSH
hosts, filesystem paths, Compose projects, database names or shell commands.`);
      process.exit(0);
    }
    const registry = loadDeploymentTargetRegistry();
    const result = options.list
      ? registry.targets.map(publicTarget)
      : publicTarget(getDeploymentTarget(options.target, registry));
    console.log(
      options.json ? JSON.stringify(result, null, 2) : JSON.stringify(result),
    );
  } catch (error) {
    console.error(`[deployment-targets] ${error.message}`);
    process.exit(1);
  }
}
