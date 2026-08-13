#!/usr/bin/env node

import crypto from "node:crypto";
import dgram from "node:dgram";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { assertReleaseArtifactManifest } from "./release-artifact-bundle.mjs";
import { verifyReleaseArtifact } from "./release-artifact-verify.mjs";
import {
  buildDevWorkbenchReceipt,
  writeDevWorkbenchReceipt,
} from "../qa/dev-workbench-receipt.mjs";
import { buildLocalTestApplyRuntimeManifest } from "../qa/customer-config-runtime-manifest.mjs";
import { yoyoosunCustomerPackage } from "../../config/customers/yoyoosun/customerPackage.mjs";

const RECEIPT_SCHEMA = "plush-local-release-rehearsal/v1";
const COMMIT_PATTERN = /^[a-f0-9]{40}$/u;
const MIGRATION_PATTERN = /^[0-9]{14}$/u;
const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9_]{7,44}$/u;
const COMPOSE_FILE = "server/deploy/compose/prod/compose.yml";
const HTTP_TIMEOUT_MS = 10_000;
const READY_TIMEOUT_MS = 180_000;
const ADMIN_BOOTSTRAP_TIMEOUT_MS = 120_000;
const ADMIN_BOOTSTRAP_OPERATION_LABEL =
  "erp.plush.local-release-admin-bootstrap.operation";
const CONTAINER_ID_PATTERN = /^[a-f0-9]{64}$/u;
const ROLE_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/u;
const REHEARSAL_ADMIN_USERNAME = "release_admin";

class RehearsalError extends Error {
  constructor(stage, message) {
    super(message);
    this.name = "RehearsalError";
    this.stage = stage;
  }
}

export function runRehearsalCommand({
  command,
  args = [],
  cwd,
  env = process.env,
  input,
  label,
}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    throw new RehearsalError(
      label,
      `${label} could not start: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new RehearsalError(label, `${label} failed`);
  }
  return String(result.stdout || "");
}

function randomSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function buildRehearsalAdminPassword() {
  const password = `Rel_${randomSecret(8)}_9aA`;
  const characters = [...password].length;
  if (
    characters < 8 ||
    characters > 20 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    throw new RehearsalError(
      "preflight",
      "release rehearsal admin password is outside the server contract",
    );
  }
  return password;
}

function safeRunId(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
  if (!RUN_ID_PATTERN.test(text)) {
    throw new RehearsalError(
      "preflight",
      "release rehearsal run id is invalid",
    );
  }
  return text;
}

function allocateTcpPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => {
        if (error || !port) reject(error || new Error("missing TCP port"));
        else resolve(port);
      });
    });
  });
}

function allocateUdpPort() {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    socket.unref();
    socket.once("error", reject);
    socket.bind(0, "127.0.0.1", () => {
      const port = socket.address().port;
      socket.close(() => resolve(port));
    });
  });
}

export async function allocateRehearsalPorts() {
  const ports = {};
  for (const key of [
    "postgres",
    "appHttp",
    "web",
    "jaeger5778",
    "jaegerUi",
    "jaeger14268",
    "jaeger14250",
    "jaeger9411",
    "jaegerOtlpGrpc",
    "jaegerOtlpHttp",
  ]) {
    ports[key] = await allocateTcpPort();
  }
  for (const key of ["jaeger5775", "jaeger6831", "jaeger6832"]) {
    ports[key] = await allocateUdpPort();
  }
  if (new Set(Object.values(ports)).size !== Object.keys(ports).length) {
    throw new RehearsalError(
      "preflight",
      "release rehearsal ports are not unique",
    );
  }
  return ports;
}

function assertEnvValue(value, key) {
  const text = String(value);
  if (
    (!text && key !== "ERP_CUSTOMER_TRIAL_TARGET") ||
    /[\r\n\0]/u.test(text)
  ) {
    throw new RehearsalError(
      "preflight",
      `${key} environment value is invalid`,
    );
  }
  return text;
}

export function buildRehearsalEnvironment({
  manifest,
  runId,
  workspace,
  ports,
  postgresPassword,
  postgresAppPassword,
  postgresMigratorPassword,
  postgresBackupPassword,
  jwtSecret,
}) {
  assertReleaseArtifactManifest(manifest);
  const project = `plush-release-${safeRunId(runId).replaceAll("_", "-")}`;
  const database = `plush_erp_release_${safeRunId(runId)}`;
  const serverImage = manifest.images.find((item) => item.kind === "server");
  const webImage = manifest.images.find((item) => item.kind === "web");
  const encodedPassword = encodeURIComponent(postgresPassword);
  const databasePasswords = {
    POSTGRES_PASSWORD: postgresPassword,
    POSTGRES_APP_PASSWORD: postgresAppPassword,
    POSTGRES_MIGRATOR_PASSWORD: postgresMigratorPassword,
    POSTGRES_BACKUP_PASSWORD: postgresBackupPassword,
  };
  if (new Set(Object.values(databasePasswords)).size !== 4) {
    throw new RehearsalError(
      "preflight",
      "release rehearsal database role passwords must be distinct",
    );
  }
  const values = {
    PROJECT_SLUG: project,
    ERP_CUSTOMER_KEY: manifest.customer,
    APP_IMAGE: serverImage.ref,
    WEB_IMAGE: webImage.ref,
    POSTGRES_IMAGE: "postgres:18.1",
    JAEGER_IMAGE: "jaegertracing/all-in-one:1.76.0",
    TZ: "Asia/Shanghai",
    ...databasePasswords,
    POSTGRES_DB: database,
    POSTGRES_USER: "postgres",
    POSTGRES_DSN: `postgres://postgres:${encodedPassword}@postgres:5432/${database}?sslmode=disable`,
    POSTGRES_DATA_DIR: path.join(workspace, "postgres"),
    POSTGRES_BIND_ADDR: "127.0.0.1",
    POSTGRES_PORT: ports.postgres,
    APP_HTTP_BIND_ADDR: "127.0.0.1",
    APP_HTTP_PORT: ports.appHttp,
    WEB_DESKTOP_BIND_ADDR: "127.0.0.1",
    WEB_DESKTOP_PORT: ports.web,
    JAEGER_BIND_ADDR: "127.0.0.1",
    JAEGER_5775_PORT: ports.jaeger5775,
    JAEGER_6831_PORT: ports.jaeger6831,
    JAEGER_6832_PORT: ports.jaeger6832,
    JAEGER_5778_PORT: ports.jaeger5778,
    JAEGER_UI_PORT: ports.jaegerUi,
    JAEGER_14268_PORT: ports.jaeger14268,
    JAEGER_14250_PORT: ports.jaeger14250,
    JAEGER_9411_PORT: ports.jaeger9411,
    JAEGER_OTLP_GRPC_PORT: ports.jaegerOtlpGrpc,
    JAEGER_OTLP_HTTP_PORT: ports.jaegerOtlpHttp,
    TRACE_ENDPOINT: "jaeger:4318",
    TRACE_RATIO: "0",
    WEB_API_ORIGIN: "http://app-server:8300",
    WEB_PROXY_PREFIXES: "/rpc,/templates",
    WEB_PROXY_TIMEOUT_MS: "30000",
    ERP_PDF_CHROME_PATH: "/usr/bin/chromium",
    ERP_PDF_RENDER_CONCURRENCY: "2",
    ERP_PDF_WARMUP: "async",
    APP_JWT_SECRET: jwtSecret,
    APP_AUTH_SMS_MODE: "disabled",
    APP_ADMIN_USERNAME: REHEARSAL_ADMIN_USERNAME,
    BOOTSTRAP_ADMIN_ONCE: "false",
    ERP_DEBUG_ENV: "prod",
    ERP_DEBUG_SEED_ENABLED: "false",
    ERP_DEBUG_CLEANUP_ENABLED: "false",
    ERP_DEBUG_BUSINESS_CLEAR_ENABLED: "false",
    ERP_DEBUG_CLEANUP_SCOPE: "debug_run",
    ERP_ALLOW_CUSTOMER_TRIAL_CONFIG: "0",
    ERP_CUSTOMER_TRIAL_TARGET: "",
    ERP_ALLOW_RELEASE_REHEARSAL_CUSTOMER_CONFIG: "1",
    ERP_RELEASE_REHEARSAL_ID: safeRunId(runId),
    POSTGRES_MEM_LIMIT: "384m",
    POSTGRES_MEM_RESERVATION: "128m",
    JAEGER_MEM_LIMIT: "128m",
    JAEGER_MEM_RESERVATION: "48m",
    APP_MEM_LIMIT: "2g",
    APP_MEM_RESERVATION: "512m",
    WEB_MEM_LIMIT: "128m",
    WEB_MEM_RESERVATION: "48m",
  };
  for (const [key, value] of Object.entries(values)) {
    assertEnvValue(value, key);
  }
  return { project, database, values };
}

export function formatRehearsalEnv(values) {
  return `${Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")}\n`;
}

export function runtimeIdentityDigest(database, commit, migration) {
  if (
    !database ||
    !COMMIT_PATTERN.test(commit) ||
    !MIGRATION_PATTERN.test(migration)
  ) {
    throw new RehearsalError(
      "runtime identity",
      "runtime identity input is invalid",
    );
  }
  return crypto
    .createHash("sha256")
    .update(["release-v1", database, commit, migration].join("\n"))
    .digest("hex");
}

function composeArgs(context, args) {
  return [
    "compose",
    "--project-name",
    context.project,
    "--env-file",
    context.envFile,
    "-f",
    context.composeFile,
    ...args,
  ];
}

function composeCommand(context, args, label, env = process.env) {
  return context.runCommand({
    command: "docker",
    args: composeArgs(context, args),
    cwd: context.composeDir,
    env,
    label,
  });
}

export function reconcileRehearsalDatabaseRoles(context) {
  composeCommand(
    context,
    [
      "exec",
      "-T",
      "postgres",
      "/usr/local/bin/plush-database-roles",
      "reconcile",
    ],
    "reconcile isolated release database roles",
  );
  composeCommand(
    context,
    [
      "exec",
      "-T",
      "postgres",
      "/usr/local/bin/plush-database-roles",
      "verify",
    ],
    "verify isolated release database roles",
  );
  return {
    status: "passed",
    reconcile: "passed",
    verify: "passed",
  };
}

async function waitFor(check, label, timeoutMs = READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new RehearsalError(
    label,
    `${label} timed out${lastError ? `: ${lastError.message}` : ""}`,
  );
}

async function fetchChecked(url, options = {}, expectedStatus = 200) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (response.status !== expectedStatus) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response;
}

async function waitHTTP(url, expectedBody, label) {
  return waitFor(async () => {
    const response = await fetchChecked(url);
    const body = await response.text();
    return expectedBody === undefined || body.trim() === expectedBody
      ? { status: response.status, body: body.trim() }
      : false;
  }, label);
}

function readAtlasStatus(context, label) {
  const raw = context.runCommand({
    command: "atlas",
    args: [
      "migrate",
      "status",
      "--dir",
      `file://${context.migrationDir}`,
      "--url",
      context.databaseUrl,
      "--format",
      "{{ json . }}",
    ],
    cwd: context.serverRoot,
    label,
  });
  try {
    return JSON.parse(raw);
  } catch {
    throw new RehearsalError(label, `${label} returned invalid JSON`);
  }
}

function atlasCurrent(status) {
  return String(status?.Current || "").trim();
}

function psql(context, databaseUrl, sql, label) {
  return context
    .runCommand({
      command: "psql",
      args: [
        "-X",
        "--no-psqlrc",
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
        "--dbname",
        databaseUrl,
        "-c",
        sql,
      ],
      cwd: context.serverRoot,
      label,
    })
    .trim();
}

function bindReleaseRehearsalDatabaseIdentity(context, environment) {
  const systemIdentifier = psql(
    context,
    context.databaseUrl,
    "SELECT system_identifier::text FROM pg_control_system()",
    "read release rehearsal PostgreSQL system identifier",
  );
  if (!/^[0-9]{1,20}$/u.test(systemIdentifier)) {
    throw new RehearsalError(
      "release rehearsal database identity",
      "release rehearsal PostgreSQL system identifier is invalid",
    );
  }
  environment.values.ERP_RELEASE_REHEARSAL_PG_SYSTEM_IDENTIFIER =
    systemIdentifier;
  context.postgresSystemIdentifier = systemIdentifier;
  writeFileSync(context.envFile, formatRehearsalEnv(environment.values), {
    mode: 0o600,
  });
}

async function runMigration(context, receipt) {
  const before = readAtlasStatus(context, "migration status before apply");
  context.runCommand({
    command: "atlas",
    args: ["migrate", "validate", "--dir", `file://${context.migrationDir}`],
    cwd: context.serverRoot,
    label: "migration directory validation",
  });
  context.runCommand({
    command: "atlas",
    args: [
      "migrate",
      "apply",
      "--dry-run",
      "--tx-mode",
      "all",
      "--dir",
      `file://${context.migrationDir}`,
      "--url",
      context.databaseUrl,
    ],
    cwd: context.serverRoot,
    label: "migration dry-run",
  });
  context.runCommand({
    command: "atlas",
    args: [
      "migrate",
      "apply",
      "--tx-mode",
      "all",
      "--dir",
      `file://${context.migrationDir}`,
      "--url",
      context.databaseUrl,
    ],
    cwd: context.serverRoot,
    label: "migration apply",
  });
  const after = readAtlasStatus(context, "migration status after apply");
  const readback = psql(
    context,
    context.databaseUrl,
    "SELECT current_database() || E'\\t' || (SELECT version FROM atlas_schema_revisions.atlas_schema_revisions WHERE type = 2 ORDER BY executed_at DESC LIMIT 1)",
    "migration identity readback",
  );
  const [database, migration] = readback.split("\t");
  if (
    database !== context.database ||
    migration !== context.manifest.migration.latest ||
    atlasCurrent(after) !== context.manifest.migration.latest
  ) {
    throw new RehearsalError(
      "migration identity readback",
      "migration identity did not match the release artifact",
    );
  }
  receipt.migration = {
    before: atlasCurrent(before) || null,
    after: atlasCurrent(after),
    latest: migration,
    sequenceSha256: context.manifest.migration.sequenceSha256,
    directoryValidation: "passed",
    dryRun: "passed",
    apply: "passed",
    readback: "passed",
    populatedUpgradeAudit: {
      status: "not-applicable",
      reason: "fresh isolated release database has no populated predecessor",
    },
  };
}

async function login(appUrl, username, password) {
  const response = await fetchChecked(`${appUrl}/rpc/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "release-rehearsal-login",
      method: "admin_login",
      params: { username, password },
    }),
  });
  const parsed = await response.json();
  const token = String(parsed?.result?.data?.access_token || "");
  if (
    parsed?.jsonrpc !== "2.0" ||
    parsed?.result?.code !== 0 ||
    parsed?.result?.data?.username !== username ||
    parsed?.result?.data?.is_super_admin !== true ||
    !token
  ) {
    throw new RehearsalError(
      "authenticated smoke",
      "release admin login failed",
    );
  }
  return token;
}

async function customerConfigRpc(appUrl, token, method, params) {
  const response = await fetchChecked(`${appUrl}/rpc/customer_config`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `release-rehearsal-${method}`,
      method,
      params,
    }),
  });
  const parsed = await response.json();
  if (parsed?.result?.code !== 0) {
    const code = Number(parsed?.result?.code);
    const message = String(parsed?.result?.message || "unavailable")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 160);
    throw new RehearsalError(
      "customer config readback",
      `customer config ${method} failed; code=${
        Number.isSafeInteger(code) ? code : "unknown"
      }; message=${message || "unavailable"}`,
    );
  }
  return parsed.result.data || {};
}

function normalizeConfigHash(value, label) {
  const hash = String(value || "")
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(hash)) {
    throw new RehearsalError("customer config readback", `${label} is invalid`);
  }
  return hash;
}

async function readEffectiveCustomerConfig(
  appUrl,
  token,
  releaseManifest,
  expectedRevision = "",
  runtime = {},
) {
  const rpcCall = runtime.rpc || customerConfigRpc;
  const session = (
    await rpcCall(appUrl, token, "get_effective_session", {
      customer_key: releaseManifest.customer,
    })
  ).session;
  if (
    !session ||
    !Array.isArray(session.pages) ||
    (expectedRevision && session.configRevision !== expectedRevision)
  ) {
    throw new RehearsalError(
      "customer config readback",
      "effective customer config readback failed",
    );
  }
  return {
    status: "passed",
    customer: releaseManifest.customer,
    revision: String(session.configRevision || ""),
    productVersion: String(session.configProductVersion || ""),
    configHash: normalizeConfigHash(
      session.configHash,
      "effective customer config hash",
    ),
    source: String(session.source || ""),
    pageCount: session.pages.length,
    sourcePackageKey: releaseManifest.customerConfig.packageKey,
    sourceSha256: releaseManifest.customerConfig.sourceSha256,
    boundary:
      "Local effective session is runtime readback; target active revision remains separately required.",
  };
}

export async function activateRehearsalCustomerConfig(
  appUrl,
  token,
  releaseManifest,
  runtime = {},
) {
  const rpcCall = runtime.rpc || customerConfigRpc;
  if (releaseManifest.customer !== "yoyoosun") {
    throw new RehearsalError(
      "customer config activation",
      "local rehearsal customer package is not registered",
    );
  }
  const manifest = buildLocalTestApplyRuntimeManifest(yoyoosunCustomerPackage);
  if (
    manifest.customer_key !== releaseManifest.customer ||
    manifest.compiled_snapshot?.applyPurpose !== "local_test_apply"
  ) {
    throw new RehearsalError(
      "customer config activation",
      "local test customer manifest identity is invalid",
    );
  }
  const validation = (
    await rpcCall(appUrl, token, "validate_customer_config", manifest)
  ).validation;
  if (
    validation?.customer_key !== manifest.customer_key ||
    validation?.revision !== manifest.revision ||
    validation?.compiled_snapshot_ok !== true
  ) {
    throw new RehearsalError(
      "customer config activation",
      "customer config validation identity mismatch",
    );
  }
  const configHash = normalizeConfigHash(
    validation.config_hash,
    "validated customer config hash",
  );
  if (Number(validation.config_hash_version) !== 1) {
    throw new RehearsalError(
      "customer config activation",
      "customer config hash version mismatch",
    );
  }
  const published = (
    await rpcCall(appUrl, token, "publish_customer_config", manifest)
  ).revision;
  if (
    published?.revision !== manifest.revision ||
    published?.product_version !== manifest.product_version ||
    normalizeConfigHash(
      published?.config_hash,
      "published customer config hash",
    ) !== configHash ||
    !["published", "active"].includes(published?.status)
  ) {
    throw new RehearsalError(
      "customer config activation",
      "customer config publish identity mismatch",
    );
  }
  const transition = (
    await rpcCall(appUrl, token, "check_customer_config_transition", {
      action: "activate",
      customer_key: manifest.customer_key,
      target_revision: manifest.revision,
      expected_config_hash: configHash,
      expected_product_version: manifest.product_version,
      expected_active_revision: "",
    })
  ).transition;
  if (
    transition?.allowed !== true ||
    !Array.isArray(transition.blockers) ||
    transition.blockers.length !== 0 ||
    transition.target_revision !== manifest.revision ||
    transition.observed_active_revision !== ""
  ) {
    throw new RehearsalError(
      "customer config activation",
      "customer config activation preflight was blocked",
    );
  }
  const activated = (
    await rpcCall(appUrl, token, "activate_customer_config", {
      customer_key: manifest.customer_key,
      revision: manifest.revision,
      expected_config_hash: configHash,
      expected_product_version: manifest.product_version,
      expected_active_revision: "",
    })
  ).revision;
  if (
    activated?.status !== "active" ||
    activated?.revision !== manifest.revision ||
    activated?.product_version !== manifest.product_version ||
    normalizeConfigHash(
      activated?.config_hash,
      "activated customer config hash",
    ) !== configHash
  ) {
    throw new RehearsalError(
      "customer config activation",
      "customer config activation identity mismatch",
    );
  }
  const readback = await readEffectiveCustomerConfig(
    appUrl,
    token,
    releaseManifest,
    manifest.revision,
    { rpc: rpcCall },
  );
  if (
    readback.productVersion !== manifest.product_version ||
    readback.configHash !== configHash ||
    readback.source !== "active_customer_config_revision"
  ) {
    throw new RehearsalError(
      "customer config activation",
      "activated customer config effective session mismatch",
    );
  }
  return {
    ...readback,
    applyPurpose: "local_test_apply",
    protocol: [
      "validate_customer_config",
      "publish_customer_config",
      "check_customer_config_transition",
      "activate_customer_config",
      "get_effective_session",
    ],
    writesBusinessFacts: false,
  };
}

function rehearsalApprovalRoleKeys(releaseManifest) {
  if (releaseManifest.customer !== "yoyoosun") {
    throw new RehearsalError(
      "approval eligibility bootstrap",
      "local rehearsal customer package is not registered",
    );
  }
  const manifest = buildLocalTestApplyRuntimeManifest(yoyoosunCustomerPackage);
  const roleKeys = [
    ...new Set(
      manifest.work_pool_memberships
        .filter(
          (item) =>
            item.enabled === true &&
            String(item.pool_key || "").startsWith("approval."),
        )
        .map((item) => String(item.role_key || "").trim()),
    ),
  ].sort();
  if (
    roleKeys.length === 0 ||
    roleKeys.some((roleKey) => !ROLE_KEY_PATTERN.test(roleKey))
  ) {
    throw new RehearsalError(
      "approval eligibility bootstrap",
      "local rehearsal approval role identity is invalid",
    );
  }
  return roleKeys;
}

function runRehearsalPostgresSQL(context, sql, label) {
  return context
    .runCommand({
      command: "docker",
      args: [
        "exec",
        "-i",
        context.postgresContainer,
        "psql",
        "-X",
        "-A",
        "-t",
        "-q",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        context.database,
        "-f",
        "-",
      ],
      cwd: context.repoRoot,
      input: sql,
      label,
    })
    .trim();
}

function parseApprovalEligibilityReadback(
  output,
  context,
  expectedCounts,
  stage,
) {
  const [database, systemIdentifier, ...counts] = output.split("\t");
  const parsedCounts = counts.map(Number);
  if (
    database !== context.database ||
    systemIdentifier !== context.postgresSystemIdentifier ||
    parsedCounts.length !== expectedCounts.length ||
    parsedCounts.some(
      (item, index) =>
        !Number.isSafeInteger(item) || item !== expectedCounts[index],
    )
  ) {
    throw new RehearsalError(
      "approval eligibility bootstrap",
      `${stage} did not match the isolated database, cluster or approval roles`,
    );
  }
  return parsedCounts;
}

export function bootstrapRehearsalApprovalEligibility(context) {
  if (
    !/^[0-9]{1,20}$/u.test(context.postgresSystemIdentifier || "") ||
    !/^plush_erp_release_[a-z0-9_]+$/u.test(context.database || "")
  ) {
    throw new RehearsalError(
      "approval eligibility bootstrap",
      "isolated release database identity is not bound",
    );
  }
  const roleKeys = rehearsalApprovalRoleKeys(context.manifest);
  const roleList = roleKeys.map((roleKey) => `'${roleKey}'`).join(", ");
  const preflight = runRehearsalPostgresSQL(
    context,
    `SELECT current_database() || E'\\t' ||
  (SELECT system_identifier::text FROM pg_control_system()) || E'\\t' ||
  (SELECT count(*) FROM admin_users
    WHERE username = '${REHEARSAL_ADMIN_USERNAME}'
      AND is_super_admin IS TRUE
      AND disabled IS FALSE) || E'\\t' ||
  (SELECT count(*) FROM roles
    WHERE role_key IN (${roleList})
      AND disabled IS FALSE) || E'\\t' ||
  (SELECT count(DISTINCT roles.id)
    FROM roles
    JOIN role_permissions ON role_permissions.role_id = roles.id
    JOIN permissions ON permissions.id = role_permissions.permission_id
    WHERE roles.role_key IN (${roleList})
      AND roles.disabled IS FALSE
      AND permissions.permission_key = 'workflow.task.approve');\n`,
    "preflight isolated approval eligibility",
  );
  parseApprovalEligibilityReadback(
    preflight,
    context,
    [1, roleKeys.length, roleKeys.length],
    "approval eligibility preflight",
  );
  const readback = runRehearsalPostgresSQL(
    context,
    `BEGIN;
INSERT INTO admin_user_roles (admin_user_id, role_id, created_at)
SELECT admin_users.id, roles.id, CURRENT_TIMESTAMP
FROM admin_users
CROSS JOIN roles
WHERE admin_users.username = '${REHEARSAL_ADMIN_USERNAME}'
  AND admin_users.is_super_admin IS TRUE
  AND admin_users.disabled IS FALSE
  AND roles.role_key IN (${roleList})
  AND roles.disabled IS FALSE
ON CONFLICT (admin_user_id, role_id) DO NOTHING;
COMMIT;
SELECT current_database() || E'\\t' ||
  (SELECT system_identifier::text FROM pg_control_system()) || E'\\t' ||
  (SELECT count(DISTINCT roles.id)
    FROM admin_user_roles
    JOIN admin_users ON admin_users.id = admin_user_roles.admin_user_id
    JOIN roles ON roles.id = admin_user_roles.role_id
    WHERE admin_users.username = '${REHEARSAL_ADMIN_USERNAME}'
      AND admin_users.is_super_admin IS TRUE
      AND admin_users.disabled IS FALSE
      AND roles.role_key IN (${roleList})
      AND roles.disabled IS FALSE);\n`,
    "bind isolated approval eligibility",
  );
  const [bindingCount] = parseApprovalEligibilityReadback(
    readback,
    context,
    [roleKeys.length],
    "approval eligibility readback",
  );
  return {
    status: "passed",
    mode: "isolated-super-admin-role-binding",
    roleKeys,
    roleCount: roleKeys.length,
    capableRoleCount: roleKeys.length,
    bindingCount,
    writesBusinessFacts: false,
    retainedAfterCleanup: false,
  };
}

async function pdfSmoke(appUrl, token) {
  const response = await fetchChecked(`${appUrl}/templates/render-pdf`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/pdf",
    },
    body: JSON.stringify({
      title: "Local Release Rehearsal",
      file_name: "local-release-rehearsal.pdf",
      template_key: "material-purchase-contract",
      html: "<!doctype html><html><body><p>local-release-rehearsal</p></body></html>",
    }),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (
    !String(response.headers.get("content-type") || "")
      .toLowerCase()
      .startsWith("application/pdf") ||
    bytes.subarray(0, 4).toString("ascii") !== "%PDF"
  ) {
    throw new RehearsalError("PDF smoke", "PDF smoke response was invalid");
  }
  return {
    status: "passed",
    sizeBytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    responseBodyStored: false,
  };
}

async function runtimeSmoke(context, receipt, phase) {
  const appUrl = `http://127.0.0.1:${context.ports.appHttp}`;
  const webUrl = `http://127.0.0.1:${context.ports.web}`;
  await waitHTTP(`${appUrl}/healthz`, "ok", `${phase} server health`);
  await waitHTTP(`${appUrl}/readyz`, "ready", `${phase} server ready`);
  await waitHTTP(`${webUrl}/healthz`, undefined, `${phase} web health`);
  const identity = runtimeIdentityDigest(
    context.database,
    context.manifest.git.commit,
    context.manifest.migration.latest,
  );
  await waitFor(async () => {
    const response = await fetchChecked(`${appUrl}/readyz/runtime-identity`, {
      headers: {
        "X-ERP-Runtime-Identity-Scope": "release-v1",
        "X-ERP-Expected-Runtime-Identity-SHA256": identity,
      },
    });
    return (
      response.headers.get("X-ERP-Runtime-Identity-Proof") === "matched-v1"
    );
  }, `${phase} runtime identity`);
  const token = await login(appUrl, "release_admin", context.adminPassword);
  const rootResponse = await fetchChecked(`${webUrl}/`);
  const rootHtml = await rootResponse.text();
  if (
    !rootHtml.includes("<!doctype html") ||
    /\/__dev|dev-workbench/iu.test(rootHtml)
  ) {
    throw new RehearsalError(
      `${phase} production web`,
      "production Web root is invalid or exposes DEV markers",
    );
  }
  receipt.runtime[phase] = {
    serverHealth: "passed",
    serverReady: "passed",
    webHealth: "passed",
    webRoot: "passed",
    runtimeIdentity: "passed",
    authenticatedAdmin: "passed",
    embeddedGitSha: context.manifest.git.commit,
  };
  return { appUrl, webUrl, token };
}

function dockerExec(context, args, label) {
  return context.runCommand({
    command: "docker",
    args: ["exec", context.postgresContainer, ...args],
    cwd: context.repoRoot,
    label,
  });
}

function inspectAdminBootstrapContainer(context, containerId) {
  const format = [
    "{{.Id}}",
    "{{.Name}}",
    '{{index .Config.Labels "com.docker.compose.project"}}',
    '{{index .Config.Labels "com.docker.compose.service"}}',
    "{{.Config.Image}}",
    "{{.Image}}",
    `{{index .Config.Labels "${ADMIN_BOOTSTRAP_OPERATION_LABEL}"}}`,
    "{{.State.Running}}",
    "{{.State.ExitCode}}",
  ].join("\t");
  const values = context
    .runCommand({
      command: "docker",
      args: ["inspect", "--format", format, containerId],
      cwd: context.repoRoot,
      label: "read one-shot admin bootstrap identity",
    })
    .trim()
    .split("\t");
  if (values.length !== 9) {
    throw new RehearsalError(
      "admin bootstrap identity",
      "one-shot admin bootstrap identity readback was invalid",
    );
  }
  return {
    id: values[0],
    name: values[1].replace(/^\/+/u, ""),
    project: values[2],
    service: values[3],
    imageRef: values[4],
    imageId: values[5],
    operation: values[6],
    running: values[7] === "true",
    exitCode: values[8],
  };
}

function assertAdminBootstrapContainerIdentity(
  context,
  containerId,
  containerName,
  operationId,
) {
  const serverImage = context.manifest.images.find(
    (item) => item.kind === "server",
  );
  const actual = inspectAdminBootstrapContainer(context, containerId);
  if (
    !CONTAINER_ID_PATTERN.test(containerId) ||
    actual.id !== containerId ||
    actual.name !== containerName ||
    actual.project !== context.project ||
    actual.service !== "app-server" ||
    actual.imageRef !== serverImage.ref ||
    actual.imageId !== serverImage.contentId ||
    actual.operation !== operationId
  ) {
    throw new RehearsalError(
      "admin bootstrap identity",
      "one-shot admin bootstrap container identity did not match",
    );
  }
  return actual;
}

function listAdminBootstrapContainers(context, operationId) {
  const containers = context
    .runCommand({
      command: "docker",
      args: [
        "ps",
        "-aq",
        "--no-trunc",
        "--filter",
        `label=${ADMIN_BOOTSTRAP_OPERATION_LABEL}=${operationId}`,
        "--format",
        "{{.ID}}",
      ],
      cwd: context.repoRoot,
      label: "discover admin bootstrap containers",
    })
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean);
  if (
    containers.length > 1 ||
    containers.some((item) => !CONTAINER_ID_PATTERN.test(item))
  ) {
    throw new RehearsalError(
      "admin bootstrap cleanup",
      "one-shot admin bootstrap discovery was ambiguous",
    );
  }
  return containers;
}

function removeAdminBootstrapContainer(
  context,
  containerId,
  containerName,
  operationId,
) {
  const containers = listAdminBootstrapContainers(context, operationId);
  if (containers.length === 0) return;
  if (containers[0] !== containerId) {
    throw new RehearsalError(
      "admin bootstrap cleanup",
      "one-shot admin bootstrap container id drifted",
    );
  }
  assertAdminBootstrapContainerIdentity(
    context,
    containerId,
    containerName,
    operationId,
  );
  try {
    context.runCommand({
      command: "docker",
      args: ["rm", "--force", containerId],
      cwd: context.repoRoot,
      label: "remove one-shot admin bootstrap",
    });
  } catch {
    // The verified --rm container may disappear between discovery and removal.
  }
  if (listAdminBootstrapContainers(context, operationId).length !== 0) {
    throw new RehearsalError(
      "admin bootstrap cleanup",
      "one-shot admin bootstrap container was not removed",
    );
  }
}

function readAdminBootstrapState(context) {
  const sql = [
    "(SELECT count(*) FROM runtime_markers WHERE marker_key = 'admin_bootstrap.completed' AND marker_value::jsonb->>'username' = :'admin_username')",
    "(SELECT count(*) FROM admin_users WHERE username = :'admin_username' AND is_super_admin IS TRUE AND disabled IS FALSE AND password_hash <> '')",
    "(SELECT count(*) FROM runtime_audit_events WHERE event_type = 'admin_bootstrap.completed' AND event_key = 'admin_bootstrap.completed' AND source = 'server_bootstrap' AND payload::jsonb->>'username' = :'admin_username')",
    "(SELECT count(*) FROM permissions WHERE builtin IS TRUE)",
    "(SELECT count(*) FROM roles WHERE builtin IS TRUE)",
    "(SELECT count(*) FROM role_permissions)",
  ];
  const output = context
    .runCommand({
      command: "docker",
      args: [
        "exec",
        "-i",
        context.postgresContainer,
        "psql",
        "-X",
        "-A",
        "-t",
        "-q",
        "-v",
        "ON_ERROR_STOP=1",
        "-v",
        "admin_username=release_admin",
        "-U",
        "postgres",
        "-d",
        context.database,
        "-f",
        "-",
      ],
      cwd: context.repoRoot,
      input: `SELECT ${sql.join(" || E'\\t' || ")};\n`,
      label: "read one-shot admin bootstrap state",
    })
    .trim();
  const values = output.split("\t").map(Number);
  if (
    values.length !== 6 ||
    values.some((item) => !Number.isSafeInteger(item) || item < 0)
  ) {
    throw new RehearsalError(
      "admin bootstrap readback",
      "one-shot admin bootstrap readback was invalid",
    );
  }
  return values;
}

export async function bootstrapRehearsalAdmin(context) {
  const operationId = crypto.randomBytes(16).toString("hex");
  const containerName = `${context.project}-admin-bootstrap-${operationId}`;
  let containerId = "";
  let result;
  let failure;
  try {
    containerId = composeCommand(
      context,
      [
        "run",
        "-d",
        "-T",
        "--no-deps",
        "--rm",
        "--pull",
        "never",
        "--name",
        containerName,
        "--label",
        `${ADMIN_BOOTSTRAP_OPERATION_LABEL}=${operationId}`,
        "-e",
        "APP_ADMIN_PASSWORD",
        "-e",
        "BOOTSTRAP_ADMIN_ONCE=true",
        "app-server",
      ],
      "start one-shot admin bootstrap",
      { ...process.env, APP_ADMIN_PASSWORD: context.adminPassword },
    ).trim();
    const deadline = Date.now() + ADMIN_BOOTSTRAP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const runtime = assertAdminBootstrapContainerIdentity(
        context,
        containerId,
        containerName,
        operationId,
      );
      if (!runtime.running) {
        throw new RehearsalError(
          "admin bootstrap runtime",
          `one-shot admin bootstrap exited before readback; exitCode=${runtime.exitCode || "unknown"}`,
        );
      }
      const [
        markerCount,
        eligibleAdminCount,
        completedAuditCount,
        builtinPermissionCount,
        builtinRoleCount,
        rolePermissionCount,
      ] = readAdminBootstrapState(context);
      if (markerCount === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        continue;
      }
      if (
        markerCount !== 1 ||
        eligibleAdminCount !== 1 ||
        completedAuditCount !== 1 ||
        builtinPermissionCount <= 0 ||
        builtinRoleCount <= 0 ||
        rolePermissionCount <= 0
      ) {
        throw new RehearsalError(
          "admin bootstrap readback",
          "one-shot admin bootstrap marker, admin, audit or RBAC counts did not match",
        );
      }
      result = {
        status: "passed",
        mode: "one-shot-no-ports",
        marker: "admin_bootstrap.completed",
        eligibleAdminCount,
        completedAuditCount,
        builtinPermissionCount,
        builtinRoleCount,
        rolePermissionCount,
        passwordPersisted: false,
        steadyBootstrapFlag: false,
        containerRemoved: true,
      };
      break;
    }
    if (!result) {
      throw new RehearsalError(
        "admin bootstrap runtime",
        "one-shot admin bootstrap timed out",
      );
    }
  } catch (error) {
    failure = error;
  }
  try {
    removeAdminBootstrapContainer(
      context,
      containerId,
      containerName,
      operationId,
    );
  } catch (error) {
    throw new RehearsalError(
      "admin bootstrap cleanup",
      `${failure ? `${failure.message}; ` : ""}${error.message}`,
    );
  }
  if (failure) throw failure;
  return result;
}

function backupRestoreDrill(context) {
  const restoreDatabase = `plush_erp_restore_${context.runId}`;
  const dumpFile = `/tmp/${context.runId}.dump`;
  const passwordEnv = `PGPASSWORD=${context.postgresPassword}`;
  dockerExec(
    context,
    [
      "env",
      passwordEnv,
      "pg_dump",
      "-U",
      "postgres",
      "-d",
      context.database,
      "-Fc",
      "-f",
      dumpFile,
    ],
    "release database backup",
  );
  const hashLine = dockerExec(
    context,
    ["sha256sum", dumpFile],
    "release database backup checksum",
  ).trim();
  const sizeText = dockerExec(
    context,
    ["stat", "-c", "%s", dumpFile],
    "release database backup size",
  ).trim();
  const backupSha256 = hashLine.split(/\s+/u)[0];
  const backupSizeBytes = Number(sizeText);
  if (!/^[a-f0-9]{64}$/u.test(backupSha256) || backupSizeBytes <= 0) {
    throw new RehearsalError(
      "release database backup",
      "backup checksum or size is invalid",
    );
  }
  dockerExec(
    context,
    [
      "env",
      passwordEnv,
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      `CREATE DATABASE ${restoreDatabase}`,
    ],
    "create isolated restore database",
  );
  try {
    dockerExec(
      context,
      [
        "env",
        passwordEnv,
        "pg_restore",
        "-U",
        "postgres",
        "-d",
        restoreDatabase,
        "--exit-on-error",
        dumpFile,
      ],
      "restore release database backup",
    );
    const readback = dockerExec(
      context,
      [
        "env",
        passwordEnv,
        "psql",
        "-X",
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        restoreDatabase,
        "-c",
        "SELECT current_database() || E'\\t' || (SELECT version FROM atlas_schema_revisions.atlas_schema_revisions WHERE type = 2 ORDER BY executed_at DESC LIMIT 1) || E'\\t' || (SELECT count(*)::text FROM admin_users WHERE is_super_admin)",
      ],
      "restore database readback",
    ).trim();
    const [database, migration, superAdminCount] = readback.split("\t");
    if (
      database !== restoreDatabase ||
      migration !== context.manifest.migration.latest ||
      Number(superAdminCount) < 1
    ) {
      throw new RehearsalError(
        "restore database readback",
        "restored database identity or critical counts did not match",
      );
    }
    return {
      status: "passed",
      backupPurpose: "local-release-rehearsal",
      backupSha256,
      backupSizeBytes,
      restoreDatabase,
      migration,
      superAdminCount: Number(superAdminCount),
      dumpRetained: false,
    };
  } finally {
    dockerExec(
      context,
      [
        "env",
        passwordEnv,
        "psql",
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-c",
        `DROP DATABASE IF EXISTS ${restoreDatabase} WITH (FORCE)`,
      ],
      "drop isolated restore database",
    );
    dockerExec(context, ["rm", "-f", dumpFile], "remove isolated backup file");
  }
}

function safeReceiptPath(repoRoot, requested, commit, runId) {
  const outputRoot = path.join(repoRoot, "output");
  const defaultPath = path.join(
    outputRoot,
    "dev-workbench",
    "release-rehearsal",
    `${commit}-${runId}.json`,
  );
  const candidate = requested ? path.resolve(repoRoot, requested) : defaultPath;
  if (!candidate.startsWith(`${outputRoot}${path.sep}`)) {
    throw new RehearsalError(
      "preflight",
      "rehearsal receipt must remain inside output/",
    );
  }
  return candidate;
}

export function selectRehearsalWorkbenchArtifact({
  repoRoot,
  manifestPath,
  receiptPath,
}) {
  const toSafeRelativePath = (target) => {
    const relative = path.relative(repoRoot, target);
    if (
      !relative ||
      path.isAbsolute(relative) ||
      relative.split(path.sep).includes("..")
    ) {
      return "";
    }
    return relative.split(path.sep).join("/");
  };
  const manifestArtifact = toSafeRelativePath(manifestPath);
  if (manifestArtifact) {
    return {
      artifactPath: manifestArtifact,
      materializeReceiptFirst: false,
    };
  }
  const receiptArtifact = toSafeRelativePath(receiptPath);
  if (!receiptArtifact) {
    throw new RehearsalError(
      "workbench receipt",
      "release rehearsal has no repository-relative evidence artifact",
    );
  }
  return {
    artifactPath: receiptArtifact,
    materializeReceiptFirst: true,
  };
}

function sanitizeFailure(error) {
  return {
    stage: String(error?.stage || "unknown").slice(0, 120),
    message: String(error?.message || "local release rehearsal failed")
      .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s]+/giu, "<redacted-url>")
      .replace(/\/(?:Users|private|tmp)\/[^\s]+/gu, "<redacted-path>")
      .slice(0, 500),
  };
}

function writeReceipt(receiptPath, receipt) {
  mkdirSync(path.dirname(receiptPath), { recursive: true, mode: 0o700 });
  const temporary = `${receiptPath}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, {
    mode: 0o600,
  });
  const payload = readFileSync(temporary, "utf8");
  if (
    /postgres(?:ql)?:\/\/[^"\s]+@/iu.test(payload) ||
    /APP_(?:JWT_SECRET|ADMIN_PASSWORD)|POSTGRES_PASSWORD/iu.test(payload)
  ) {
    rmSync(temporary, { force: true });
    throw new RehearsalError(
      "receipt redaction",
      "rehearsal receipt contains a forbidden secret field",
    );
  }
  writeFileSync(receiptPath, payload, { mode: 0o600 });
  rmSync(temporary, { force: true });
}

function currentGitState(repoRoot, runCommand) {
  const head = runCommand({
    command: "git",
    args: ["rev-parse", "HEAD"],
    cwd: repoRoot,
    label: "read current Git HEAD",
  }).trim();
  const status = runCommand({
    command: "git",
    args: ["status", "--porcelain=v1", "--untracked-files=all"],
    cwd: repoRoot,
    label: "read current Git status",
  }).trim();
  return { head, clean: status === "" };
}

export async function runLocalReleaseRehearsal(options = {}, runtime = {}) {
  const repoRoot = realpathSync(runtime.repoRoot || process.cwd());
  const runCommand = runtime.runCommand || runRehearsalCommand;
  const manifestPath = realpathSync(options.manifest);
  const manifest = assertReleaseArtifactManifest(
    JSON.parse(readFileSync(manifestPath, "utf8")),
  );
  const git = currentGitState(repoRoot, runCommand);
  if (
    git.head !== manifest.git.commit ||
    git.clean !== true ||
    manifest.git.worktreeClean !== true
  ) {
    throw new RehearsalError(
      "preflight",
      "local release rehearsal requires a clean HEAD matching the artifact",
    );
  }
  const runId = safeRunId(
    options.runId ||
      `${new Date().toISOString().replace(/\D/gu, "").slice(0, 14)}_${crypto
        .randomBytes(4)
        .toString("hex")}`,
  );
  const receiptPath = safeReceiptPath(
    repoRoot,
    options.receipt,
    manifest.git.commit,
    runId,
  );
  const workspace = mkdtempSync(
    path.join(os.tmpdir(), `plush-release-rehearsal-${runId}-`),
  );
  chmodSync(workspace, 0o700);
  const composeFile = path.join(repoRoot, COMPOSE_FILE);
  if (
    !existsSync(composeFile) ||
    !statSync(composeFile).isFile() ||
    lstatIsSymlink(composeFile)
  ) {
    rmSync(workspace, { recursive: true, force: true });
    throw new RehearsalError(
      "preflight",
      "unique production Compose source is missing or unsafe",
    );
  }
  const ports = await allocateRehearsalPorts();
  const postgresPassword = randomSecret(30);
  const postgresAppPassword = randomSecret(30);
  const postgresMigratorPassword = randomSecret(30);
  const postgresBackupPassword = randomSecret(30);
  const jwtSecret = randomSecret(48);
  const adminPassword = buildRehearsalAdminPassword();
  const envFile = path.join(workspace, "release.env");
  const environment = buildRehearsalEnvironment({
    manifest,
    runId,
    workspace,
    ports,
    postgresPassword,
    postgresAppPassword,
    postgresMigratorPassword,
    postgresBackupPassword,
    jwtSecret,
  });
  writeFileSync(envFile, formatRehearsalEnv(environment.values), {
    mode: 0o600,
  });
  const encodedPassword = encodeURIComponent(postgresPassword);
  const context = {
    repoRoot,
    serverRoot: path.join(repoRoot, "server"),
    migrationDir: path.join(repoRoot, "server/internal/data/model/migrate"),
    composeFile,
    composeDir: path.dirname(composeFile),
    envFile,
    project: environment.project,
    database: environment.database,
    databaseUrl: `postgres://postgres:${encodedPassword}@127.0.0.1:${ports.postgres}/${environment.database}?sslmode=disable`,
    postgresContainer: `${environment.project}-postgres`,
    postgresPassword,
    adminPassword,
    runId,
    ports,
    manifest,
    runCommand,
  };
  const receipt = {
    schemaVersion: RECEIPT_SCHEMA,
    passed: false,
    generatedAt: new Date().toISOString(),
    finishedAt: null,
    runId,
    customer: manifest.customer,
    git: {
      commit: manifest.git.commit,
      head: git.head,
      worktreeClean: git.clean,
    },
    artifact: {
      manifestSchema: manifest.schemaVersion,
      server: manifest.images.find((item) => item.kind === "server").contentId,
      web: manifest.images.find((item) => item.kind === "web").contentId,
      migrationSequenceSha256: manifest.migration.sequenceSha256,
      sbomSha256: manifest.sbom.sha256,
    },
    environment: {
      kind: "local-isolated-release-compose",
      project: environment.project,
      database: environment.database,
      databaseIdentityBound: false,
      composeSource: COMPOSE_FILE,
      ports: {
        web: ports.web,
        server: ports.appHttp,
        postgres: ports.postgres,
      },
    },
    artifactVerification: null,
    migration: null,
    databaseRoles: null,
    adminBootstrap: null,
    approvalEligibilityBootstrap: null,
    runtime: {},
    customerConfig: null,
    pdf: null,
    backupRestore: null,
    recoveryRestart: null,
    cleanup: {
      attempted: false,
      passed: false,
      residualContainers: null,
      temporaryDatabaseRetained: null,
    },
    failure: null,
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsFullDsn: false,
      containsAbsoluteWorkspacePaths: false,
      containsRawCustomerRows: false,
    },
    notProven: [
      "remote exact-SHA CI terminal status",
      "target 133 deployment or active config",
      "customer UAT or sign-off",
    ],
  };
  let failure;
  try {
    receipt.artifactVerification = verifyReleaseArtifact(
      manifestPath,
      { load: true },
      { repoRoot, runCommand },
    );
    const configuredImages = composeCommand(
      context,
      ["config", "--images"],
      "render release Compose images",
    )
      .split(/\r?\n/u)
      .filter(Boolean);
    const expectedImages = [
      manifest.images.find((item) => item.kind === "server").ref,
      manifest.images.find((item) => item.kind === "web").ref,
      "postgres:18.1",
      "jaegertracing/all-in-one:1.76.0",
    ];
    if (
      expectedImages.some((item) => !configuredImages.includes(item)) ||
      configuredImages.some((item) => /:(?:dev|latest)$/u.test(item))
    ) {
      throw new RehearsalError(
        "Compose image preflight",
        "release Compose image refs are not fixed to the artifact",
      );
    }
    composeCommand(
      context,
      ["up", "-d", "postgres"],
      "start isolated release PostgreSQL",
    );
    await waitFor(() => {
      const health = runCommand({
        command: "docker",
        args: [
          "inspect",
          "--format",
          "{{.State.Health.Status}}",
          context.postgresContainer,
        ],
        cwd: repoRoot,
        label: "read release PostgreSQL health",
      }).trim();
      return health === "healthy";
    }, "release PostgreSQL health");
    bindReleaseRehearsalDatabaseIdentity(context, environment);
    receipt.environment.databaseIdentityBound = true;
    await runMigration(context, receipt);
    receipt.databaseRoles = reconcileRehearsalDatabaseRoles(context);
    receipt.adminBootstrap = await bootstrapRehearsalAdmin(context);
    receipt.approvalEligibilityBootstrap =
      bootstrapRehearsalApprovalEligibility(context);
    composeCommand(
      context,
      ["up", "-d", "app-server", "web-desktop"],
      "start release application services",
    );
    const initial = await runtimeSmoke(context, receipt, "initial");
    receipt.customerConfig = await activateRehearsalCustomerConfig(
      initial.appUrl,
      initial.token,
      manifest,
    );
    receipt.pdf = await pdfSmoke(initial.appUrl, initial.token);
    receipt.backupRestore = backupRestoreDrill(context);

    composeCommand(
      context,
      ["up", "-d", "--force-recreate", "app-server", "web-desktop"],
      "restart release services without bootstrap secret",
    );
    const steadyState = await runtimeSmoke(
      context,
      receipt,
      "steadyStateRestart",
    );
    const recoveredConfig = await readEffectiveCustomerConfig(
      steadyState.appUrl,
      steadyState.token,
      manifest,
      receipt.customerConfig.revision,
    );
    receipt.recoveryRestart = {
      status: "passed",
      bootstrapSecretRemoved: true,
      sameServerContentId: true,
      sameWebContentId: true,
      healthReadyAndLoginRecovered: true,
      customerConfigRecovered:
        recoveredConfig.configHash === receipt.customerConfig.configHash,
    };
    receipt.passed = true;
  } catch (error) {
    failure = error;
    receipt.failure = sanitizeFailure(error);
  } finally {
    receipt.cleanup.attempted = true;
    try {
      composeCommand(
        context,
        ["down", "--volumes", "--remove-orphans", "--timeout", "30"],
        "destroy isolated release Compose",
      );
      const residual = runCommand({
        command: "docker",
        args: [
          "ps",
          "-a",
          "--filter",
          `label=com.docker.compose.project=${context.project}`,
          "--format",
          "{{.ID}}",
        ],
        cwd: repoRoot,
        label: "read residual release containers",
      })
        .split(/\r?\n/u)
        .filter(Boolean);
      receipt.cleanup.residualContainers = residual.length;
      receipt.cleanup.passed = residual.length === 0;
      receipt.cleanup.temporaryDatabaseRetained = residual.length > 0;
      if (residual.length > 0 && !failure) {
        failure = new RehearsalError(
          "cleanup",
          "release rehearsal left residual containers",
        );
        receipt.failure = sanitizeFailure(failure);
        receipt.passed = false;
      }
    } catch (error) {
      receipt.cleanup.residualContainers = null;
      receipt.cleanup.passed = false;
      receipt.cleanup.temporaryDatabaseRetained = true;
      if (!failure) {
        failure = error;
        receipt.failure = sanitizeFailure(error);
        receipt.passed = false;
      }
    }
    if (receipt.cleanup.passed) {
      rmSync(workspace, { recursive: true, force: true });
    }
    receipt.finishedAt = new Date().toISOString();
    try {
      const workbenchArtifact = selectRehearsalWorkbenchArtifact({
        repoRoot,
        manifestPath,
        receiptPath,
      });
      if (workbenchArtifact.materializeReceiptFirst) {
        writeReceipt(receiptPath, receipt);
      }
      const workbenchReceipt = buildDevWorkbenchReceipt({
        artifactPaths: [workbenchArtifact.artifactPath],
        databaseRunIdentity: environment.database,
        durationMs: Math.max(
          0,
          Date.parse(receipt.finishedAt) - Date.parse(receipt.generatedAt),
        ),
        finishedAt: receipt.finishedAt,
        gate: "release-rehearsal",
        gitContext: {
          comparisonRange: "",
          gitCommit: manifest.git.commit,
          treeState: "clean",
        },
        invariants: [
          "exact artifact image content IDs and embedded Git SHA matched",
          "fresh isolated release database was migrated and read back",
          "admin bootstrap used one-shot no-port execution and left no password in steady Compose",
          "isolated approval roles were bound only to the ephemeral release admin",
          "health ready login customer config PDF backup restore and restart passed",
          "bootstrap secret was removed before steady-state restart",
          "isolated Compose and database were destroyed",
        ],
        metrics: {
          adminBootstrapAuditCount:
            receipt.adminBootstrap?.completedAuditCount || 0,
          approvalEligibilityRoleCount:
            receipt.approvalEligibilityBootstrap?.roleCount || 0,
          backupSizeBytes: receipt.backupRestore?.backupSizeBytes || 0,
          cleanupResidualContainers: receipt.cleanup.residualContainers ?? -1,
          migrationLatest: receipt.migration?.latest || "",
          serverContentId: receipt.artifact.server,
          webContentId: receipt.artifact.web,
        },
        notProven: [
          "target environment release",
          "customer UAT",
          "customer sign-off",
        ],
        profile: "immutable-compose",
        repoRoot,
        startedAt: receipt.generatedAt,
        status: receipt.passed && receipt.cleanup.passed ? "passed" : "failed",
        summary:
          receipt.passed && receipt.cleanup.passed
            ? { executed: 1, passed: 1, failed: 0, skipped: 0 }
            : { executed: 1, passed: 0, failed: 1, skipped: 0 },
      });
      writeDevWorkbenchReceipt(
        path.join(
          repoRoot,
          "output/dev-workbench/receipts/release-rehearsal-latest.json",
        ),
        workbenchReceipt,
      );
    } catch (error) {
      if (!failure) {
        failure = new RehearsalError(
          "workbench receipt",
          "local release workbench receipt could not be written",
        );
        receipt.failure = sanitizeFailure(failure);
        receipt.passed = false;
      }
    }
    writeReceipt(receiptPath, receipt);
  }
  if (failure || !receipt.passed) {
    throw new RehearsalError(
      failure?.stage || "rehearsal",
      `local release rehearsal failed; receipt=${path.relative(repoRoot, receiptPath)}`,
    );
  }
  return {
    ...receipt,
    receiptPath: path.relative(repoRoot, receiptPath),
  };
}

function lstatIsSymlink(filePath) {
  return existsSync(filePath) && lstatSync(filePath).isSymbolicLink();
}

export function parseLocalRehearsalArgs(argv) {
  const options = { execute: false, json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--execute") {
      options.execute = true;
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
    if (["--manifest", "--receipt", "--run-id"].includes(token)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new RehearsalError("arguments", `missing value for ${token}`);
      }
      options[token === "--run-id" ? "runId" : token.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new RehearsalError("arguments", `unsupported argument: ${token}`);
  }
  return options;
}

const USAGE = `Local immutable release rehearsal

Usage:
  node scripts/deploy/local-release-rehearsal.mjs --execute --manifest output/releases/<sha>/release-artifact.json [--run-id <id>] [--receipt output/...json] [--json]

The command requires a clean HEAD matching the artifact. It verifies and loads the
exact linux/amd64 image archives, starts the unique production Compose source with
an isolated plush_erp_release_<run-id> database, validates/dry-runs/applies Atlas
migrations, creates the first admin through a no-port one-shot admin bootstrap,
proves health/ready/runtime identity/login/effective config/PDF, performs a
backup+restore drill, restarts with the password-free steady environment, then
destroys the Compose/database. The receipt is redacted. This does not contact or
prove 133/UAT.`;

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
    const options = parseLocalRehearsalArgs(process.argv.slice(2));
    if (options.help) {
      console.log(USAGE);
      process.exit(0);
    }
    if (!options.execute || !options.manifest) {
      throw new RehearsalError(
        "arguments",
        "--execute and --manifest are required",
      );
    }
    const receipt = await runLocalReleaseRehearsal(options);
    if (options.json) {
      console.log(JSON.stringify(receipt, null, 2));
    } else {
      console.log(
        `local release rehearsal passed commit=${receipt.git.commit} database=${receipt.environment.database} receipt=${receipt.receiptPath}`,
      );
    }
  } catch (error) {
    console.error(`[local-release-rehearsal] ${error.message}`);
    process.exit(1);
  }
}
