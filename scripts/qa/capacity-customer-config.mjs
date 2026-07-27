#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { yoyoosunCustomerPackage } from "../../config/customers/yoyoosun/customerPackage.mjs";
import { buildRuntimePreviewManifest } from "./customer-config-runtime-manifest.mjs";
import { assertDisposableDatabaseTarget } from "./database-target.mjs";

export const CAPACITY_CONFIG_SCHEMA = "plush-capacity-customer-config/v1";
export const CAPACITY_CONFIG_DATABASE_URL_ENV =
  "CAPACITY_CONFIG_DATABASE_URL";
export const CAPACITY_CONFIG_ADMIN_USERNAME_ENV =
  "CAPACITY_CONFIG_ADMIN_USERNAME";
export const CAPACITY_CONFIG_ADMIN_PASSWORD_ENV =
  "CAPACITY_CONFIG_ADMIN_PASSWORD";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function redact(value) {
  return String(value || "")
    .replaceAll(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s/]+@/giu, "$1<redacted>@")
    .replaceAll(/(password|token|secret)=([^&\s]+)/giu, "$1=<redacted>");
}

export function normalizeCapacityBackendURL(value) {
  const url = new URL(String(value || ""));
  if (
    url.protocol !== "http:" ||
    !LOOPBACK_HOSTS.has(url.hostname) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "capacity customer config backend must be loopback HTTP without credentials",
    );
  }
  return url.origin;
}

export function capacityConfigConfirmation(databaseName, datasetHash) {
  if (
    !/^plush_erp_capacity_[a-z0-9_]+$/u.test(databaseName) ||
    !/^[0-9a-f]{64}$/u.test(String(datasetHash || ""))
  ) {
    throw new Error(
      "capacity customer config confirmation requires exact database and dataset hash",
    );
  }
  return `ACTIVATE_SIMULATED_CAPACITY_CONFIG:${databaseName}:${datasetHash}`;
}

export function buildCapacityCustomerConfigManifest({
  commit,
  datasetReceipt,
}) {
  if (
    !/^[0-9a-f]{40}$/u.test(String(commit || "")) ||
    datasetReceipt?.status !== "passed" ||
    !/^plush_erp_capacity_[a-z0-9_]+$/u.test(
      String(datasetReceipt.databaseName || ""),
    ) ||
    !/^[0-9a-f]{64}$/u.test(String(datasetReceipt.datasetHash || ""))
  ) {
    throw new Error(
      "capacity customer config manifest requires exact commit and passed dataset receipt",
    );
  }
  const manifest = structuredClone(
    buildRuntimePreviewManifest(yoyoosunCustomerPackage),
  );
  manifest.manifest_status = "runtime_compile_ready";
  manifest.runtime_enabled = true;
  manifest.publishable = true;
  manifest.revision = `simulated-capacity-${datasetReceipt.datasetHash.slice(0, 16)}`;
  manifest.product_version = `simulated-capacity-${commit.slice(0, 12)}`;
  manifest.compiled_snapshot = {
    ...manifest.compiled_snapshot,
    capacityFixture: {
      simulatedOnly: true,
      realCustomerData: false,
      datasetVersion: datasetReceipt.datasetVersion,
      datasetHash: datasetReceipt.datasetHash,
      databaseRunIdentity: datasetReceipt.databaseRunIdentity,
    },
  };
  return manifest;
}

function normalizeHash(value, label) {
  const hash = String(value || "")
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(hash)) {
    throw new Error(`${label} must be a SHA-256 digest`);
  }
  return hash;
}

async function rpc({ backendURL, domain, method, params, token = "" }) {
  const response = await fetch(new URL(`/rpc/${domain}`, `${backendURL}/`), {
    method: "POST",
    redirect: "error",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `capacity-config-${method}`,
      method,
      params,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  if (!response.ok || body?.result?.code !== 0) {
    throw new Error(
      `${domain}.${method} failed: ${body?.result?.code ?? response.status}:${body?.result?.message || "unknown"}`,
    );
  }
  return body.result.data || {};
}

export async function applyCapacityCustomerConfig({
  adminPassword,
  adminUsername,
  backendURL,
  confirmation,
  databaseName,
  databaseURL,
  datasetReceipt,
  commit,
}) {
  backendURL = normalizeCapacityBackendURL(backendURL);
  const target = assertDisposableDatabaseTarget({
    databaseName,
    databaseURL,
    profile: "capacity",
  });
  if (
    datasetReceipt?.databaseName !== databaseName ||
    confirmation !==
      capacityConfigConfirmation(databaseName, datasetReceipt?.datasetHash)
  ) {
    throw new Error(
      "capacity customer config confirmation or dataset database does not match",
    );
  }
  if (!adminUsername || !adminPassword) {
    throw new Error("capacity customer config super-admin credential is required");
  }
  const manifest = buildCapacityCustomerConfigManifest({
    commit,
    datasetReceipt,
  });
  const login = await rpc({
    backendURL,
    domain: "auth",
    method: "admin_login",
    params: { username: adminUsername, password: adminPassword },
  });
  const token = login.access_token || login.token;
  if (!token || login.is_super_admin !== true || login.disabled === true) {
    throw new Error(
      "capacity customer config writer must be an enabled super admin",
    );
  }

  const validation = (
    await rpc({
      backendURL,
      domain: "customer_config",
      method: "validate_customer_config",
      params: manifest,
      token,
    })
  ).validation;
  if (
    validation?.customer_key !== manifest.customer_key ||
    validation?.revision !== manifest.revision ||
    validation?.compiled_snapshot_ok !== true
  ) {
    throw new Error("capacity customer config validation identity mismatch");
  }
  const configHash = normalizeHash(
    validation.config_hash,
    "capacity customer config hash",
  );
  const hashVersion = Number(validation.config_hash_version);
  if (hashVersion !== 1) {
    throw new Error("capacity customer config hash version mismatch");
  }

  const published = (
    await rpc({
      backendURL,
      domain: "customer_config",
      method: "publish_customer_config",
      params: manifest,
      token,
    })
  ).revision;
  if (
    published?.revision !== manifest.revision ||
    published?.product_version !== manifest.product_version ||
    normalizeHash(published?.config_hash, "published config hash") !==
      configHash ||
    !["published", "active"].includes(published?.status)
  ) {
    throw new Error("capacity customer config publish identity mismatch");
  }

  const transitionParams = {
    action: "activate",
    customer_key: manifest.customer_key,
    target_revision: manifest.revision,
    expected_config_hash: configHash,
    expected_product_version: manifest.product_version,
    expected_active_revision: "",
  };
  const transition = (
    await rpc({
      backendURL,
      domain: "customer_config",
      method: "check_customer_config_transition",
      params: transitionParams,
      token,
    })
  ).transition;
  if (
    transition?.allowed !== true ||
    !Array.isArray(transition.blockers) ||
    transition.blockers.length !== 0 ||
    transition.target_revision !== manifest.revision ||
    transition.target_product_version !== manifest.product_version ||
    normalizeHash(transition.target_config_hash, "transition config hash") !==
      configHash ||
    transition.observed_active_revision !== ""
  ) {
    throw new Error("capacity customer config activation preflight blocked");
  }

  const activated = (
    await rpc({
      backendURL,
      domain: "customer_config",
      method: "activate_customer_config",
      params: {
        customer_key: manifest.customer_key,
        revision: manifest.revision,
        expected_config_hash: configHash,
        expected_product_version: manifest.product_version,
        expected_active_revision: "",
      },
      token,
    })
  ).revision;
  if (
    activated?.status !== "active" ||
    activated?.revision !== manifest.revision ||
    activated?.product_version !== manifest.product_version ||
    normalizeHash(activated?.config_hash, "activated config hash") !==
      configHash
  ) {
    throw new Error("capacity customer config activation identity mismatch");
  }

  const session = (
    await rpc({
      backendURL,
      domain: "customer_config",
      method: "get_effective_session",
      params: { customer_key: manifest.customer_key },
      token,
    })
  ).session;
  if (
    session?.source !== "active_customer_config_revision" ||
    session?.configRevision !== manifest.revision ||
    session?.configProductVersion !== manifest.product_version ||
    normalizeHash(session?.configHash, "effective config hash") !== configHash
  ) {
    throw new Error("capacity customer config effective session mismatch");
  }

  return Object.freeze({
    schemaVersion: CAPACITY_CONFIG_SCHEMA,
    status: "passed",
    generatedAt: new Date().toISOString(),
    simulatedOnly: true,
    databaseName,
    databaseRunIdentity: target.databaseRunIdentity,
    databaseTargetFingerprint: target.targetFingerprint,
    datasetVersion: datasetReceipt.datasetVersion,
    datasetHash: datasetReceipt.datasetHash,
    commit,
    customerKey: manifest.customer_key,
    revision: manifest.revision,
    productVersion: manifest.product_version,
    configHash,
    configHashVersion: hashVersion,
    effectiveSession: {
      source: session.source,
      revision: session.configRevision,
      pageCount: Array.isArray(session.pages) ? session.pages.length : 0,
      actionCount: Array.isArray(session.actions) ? session.actions.length : 0,
    },
    protocol: [
      "validate_customer_config",
      "publish_customer_config",
      "check_customer_config_transition",
      "activate_customer_config",
      "get_effective_session",
    ],
    containsSecrets: false,
    notProven: [
      "formal customer release configuration",
      "target environment release",
      "customer UAT",
    ],
  });
}

function writeReport(outPath, report) {
  const absolutePath = path.resolve(outPath);
  mkdirSync(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${absolutePath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporaryPath, absolutePath);
  chmodSync(absolutePath, 0o600);
  return absolutePath;
}

function parseArgs(argv) {
  const options = {
    backendURL: "http://127.0.0.1:8300",
    confirmation: "",
    databaseName: "",
    datasetReceipt: "",
    out: "output/dev-workbench/stability/capacity-customer-config.json",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    const key = {
      "--backend-url": "backendURL",
      "--confirm": "confirmation",
      "--database-name": "databaseName",
      "--dataset-receipt": "datasetReceipt",
      "--out": "out",
    }[arg];
    if (!key) throw new Error(`unknown argument: ${arg}`);
    if (!value || value.startsWith("--")) {
      throw new Error(`${arg} requires a value`);
    }
    options[key] = value;
    index += 1;
  }
  for (const key of ["confirmation", "databaseName", "datasetReceipt"]) {
    if (!options[key]) throw new Error(`${key} is required`);
  }
  return options;
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const databaseURL = String(
      process.env[CAPACITY_CONFIG_DATABASE_URL_ENV] || "",
    );
    if (!databaseURL) {
      throw new Error(`${CAPACITY_CONFIG_DATABASE_URL_ENV} is required`);
    }
    const datasetReceipt = JSON.parse(
      readFileSync(path.resolve(options.datasetReceipt), "utf8"),
    );
    const commit = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    const report = await applyCapacityCustomerConfig({
      adminPassword:
        process.env[CAPACITY_CONFIG_ADMIN_PASSWORD_ENV] || "",
      adminUsername:
        process.env[CAPACITY_CONFIG_ADMIN_USERNAME_ENV] || "",
      backendURL: options.backendURL,
      confirmation: options.confirmation,
      databaseName: options.databaseName,
      databaseURL,
      datasetReceipt,
      commit,
    });
    const outPath = writeReport(options.out, report);
    process.stdout.write(
      `[capacity-customer-config] status=passed database=${report.databaseName} revision=${report.revision} report=${path.relative(process.cwd(), outPath)}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `[capacity-customer-config] ${redact(error.stack || error.message)}\n`,
    );
    process.exitCode = 1;
  }
}
