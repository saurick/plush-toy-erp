import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const DEPLOYMENT_TARGET_REGISTRY_CONTRACT =
  "plush.deployment-target-registry/v1";
export const SUPPORTED_DEPLOYMENT_TARGET_KEYS = Object.freeze(["test-133"]);

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

const REQUIRED_ABSOLUTE_PREFIX = "/home/simon/plush-toy-erp-v5";
const FIXED_COMPOSE_DIRECTORY = "server/deploy/compose/prod";

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
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${field} is invalid`);
  }
  return value;
}

function assertFixedAbsolutePath(value, field) {
  const text = String(value || "");
  if (
    !path.posix.isAbsolute(text) ||
    path.posix.normalize(text) !== text ||
    (text !== REQUIRED_ABSOLUTE_PREFIX &&
      !text.startsWith(`${REQUIRED_ABSOLUTE_PREFIX}/`))
  ) {
    throw new Error(`${field} must remain inside the fixed test-133 root`);
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
      "ssh",
      "trialTarget",
    ],
    "deployment target",
  );
  const key = assertPattern(target.key, TARGET_KEY_PATTERN, "target key");
  if (!SUPPORTED_DEPLOYMENT_TARGET_KEYS.includes(key)) {
    throw new Error(`unsupported deployment target: ${key}`);
  }
  if (target.enabled !== true || target.purpose !== "customer-trial") {
    throw new Error("target must be the enabled customer-trial target");
  }
  assertPattern(target.customer, CUSTOMER_KEY_PATTERN, "target customer");
  if (target.customer !== "yoyoosun" || target.trialTarget !== "customer-trial-133") {
    throw new Error("target customer/trial identity is invalid");
  }

  assertExactKeys(
    target.ssh,
    ["expectedHostname", "host", "port", "user"],
    "target ssh",
  );
  assertPattern(target.ssh.host, HOST_PATTERN, "target ssh host");
  assertInteger(target.ssh.port, { minimum: 1, maximum: 65535 }, "target ssh port");
  assertPattern(target.ssh.user, USER_PATTERN, "target ssh user");
  assertPattern(
    target.ssh.expectedHostname,
    HOSTNAME_PATTERN,
    "target expected hostname",
  );

  assertExactKeys(
    target.filesystem,
    ["current", "operationRoot", "releases", "root", "runtimeEnv"],
    "target filesystem",
  );
  for (const [name, value] of Object.entries(target.filesystem)) {
    assertFixedAbsolutePath(value, `target filesystem.${name}`);
  }
  if (
    target.filesystem.root !== REQUIRED_ABSOLUTE_PREFIX ||
    target.filesystem.current !== `${REQUIRED_ABSOLUTE_PREFIX}/current` ||
    target.filesystem.releases !== `${REQUIRED_ABSOLUTE_PREFIX}/releases` ||
    target.filesystem.runtimeEnv !==
      `${REQUIRED_ABSOLUTE_PREFIX}/runtime/.env.customer-trial-133` ||
    target.filesystem.operationRoot !== `${REQUIRED_ABSOLUTE_PREFIX}/operations`
  ) {
    throw new Error("target filesystem paths differ from the fixed test-133 contract");
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
    target.compose.projectName !== "plush-toy-erp-v5" ||
    target.compose.directory !== FIXED_COMPOSE_DIRECTORY ||
    target.compose.baseFile !== "compose.yml" ||
    target.compose.overrideFile !== "compose.customer-trial-133.yml"
  ) {
    throw new Error("target Compose identity is invalid");
  }
  for (const field of ["projectName", "serverService", "webService", "postgresService"]) {
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

  assertExactKeys(target.database, ["migrationLock", "name"], "target database");
  assertPattern(target.database.name, DATABASE_PATTERN, "target database name");
  if (target.database.name !== "plush_erp_uat_20260716_v5") {
    throw new Error("target database identity is invalid");
  }
  assertFixedAbsolutePath(
    target.database.migrationLock,
    "target database migration lock",
  );
  if (
    target.database.migrationLock !==
    `${REQUIRED_ABSOLUTE_PREFIX}/run/atlas-migrate.lock`
  ) {
    throw new Error("target migration lock is invalid");
  }

  assertExactKeys(target.endpoints, ["server", "web"], "target endpoints");
  assertLoopbackHttpUrl(target.endpoints.server, 8315, "target server endpoint");
  assertLoopbackHttpUrl(target.endpoints.web, 5185, "target web endpoint");

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
    throw new Error("target registry must contain the exact supported target set");
  }
  const targets = registry.targets.map(validateDeploymentTarget);
  if (
    targets.some(
      (target, index) => target.key !== SUPPORTED_DEPLOYMENT_TARGET_KEYS[index],
    )
  ) {
    throw new Error("target registry order/identity is invalid");
  }
  return registry;
}

export function defaultDeploymentTargetRegistryPath() {
  return fileURLToPath(
    new URL("./deployment-targets.json", import.meta.url),
  );
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
  node scripts/deploy/deployment-targets.mjs --target test-133 [--json]

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
