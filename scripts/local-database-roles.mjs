import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
export const DEVELOPMENT_TARGETS = Object.freeze(
  JSON.parse(
    fs.readFileSync(
      new URL(
        "../server/internal/devdbguard/development-targets.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
);
export function registeredDevelopmentEndpoint(host, port) {
  return Object.values(DEVELOPMENT_TARGETS).some(
    (target) =>
      target.host === host && String(target.port) === String(port || "5432"),
  );
}
export const LOCAL_DATABASE_ROLE_PREFIX = "plush_dev";
const roleFile = (root) =>
  path.join(root, "server/configs/dev/database-roles.local.json");

export function assertRegisteredDatabase(dsn) {
  const url = new URL(dsn);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !registeredDevelopmentEndpoint(url.hostname, url.port) ||
    url.pathname !== "/plush_erp" ||
    [...url.searchParams.keys()].some(
      (key) =>
        !["sslmode", "application_name", "connect_timeout"].includes(key),
    )
  ) {
    throw new Error("数据库角色配置只适用于登记开发库");
  }
  return url;
}

export async function configuredDatabaseURL(root) {
  const { stdout } = await exec(
    "go",
    ["run", "./cmd/dburl", "-conf", "./configs/dev/config.yaml"],
    {
      cwd: path.join(root, "server"),
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      timeout: 120_000,
    },
  ).catch(() => {
    throw new Error("无法读取本地数据库配置");
  });
  const dsn = stdout.trim();
  assertRegisteredDatabase(dsn);
  if (new URL(dsn).hostname === DEVELOPMENT_TARGETS.orb.host) {
    const expected = registeredDatabaseSystemIdentifier(root, dsn);
    if (
      (await databaseQuery(
        dsn,
        "SELECT system_identifier::text FROM pg_control_system()",
      )) !== expected
    )
      throw new Error("Orb 开发数据库集群身份不匹配");
  }
  return dsn;
}

function readRoleConfig(root) {
  const file = roleFile(root);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0)
    throw new Error("本地数据库角色配置必须是仅当前用户可读的普通文件");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function registeredDatabaseSystemIdentifier(root, dsn) {
  const url = assertRegisteredDatabase(dsn);
  if (url.hostname === DEVELOPMENT_TARGETS.shared.host)
    return DEVELOPMENT_TARGETS.shared.systemIdentifier;
  const identity = readRoleConfig(root).systemIdentifier;
  if (
    typeof identity !== "string" ||
    !/^[1-9][0-9]{0,19}$/u.test(identity) ||
    identity === DEVELOPMENT_TARGETS.shared.systemIdentifier
  )
    throw new Error("Orb 数据库角色配置缺少独立集群身份");
  return identity;
}

export function localDatabaseRuntimeEnvironment(root) {
  if (!fs.existsSync(roleFile(root))) return {};
  const config = readRoleConfig(root);
  const url = assertRegisteredDatabase(config.app);
  readLocalDatabaseRoles(root, config.app);
  return url.hostname === DEVELOPMENT_TARGETS.orb.host
    ? { [DEVELOPMENT_TARGETS.orb.systemIdentifierEnv]: config.systemIdentifier }
    : {};
}

export async function databaseQuery(dsn, sql, { readonly = true } = {}) {
  const url = assertRegisteredDatabase(dsn);
  const env = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: url.pathname.slice(1),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get("sslmode") || "disable",
    PGCONNECT_TIMEOUT: "5",
    PGOPTIONS: `-c statement_timeout=30000 -c lock_timeout=5000${readonly ? " -c default_transaction_read_only=on" : ""}`,
    GIT_OPTIONAL_LOCKS: "0",
  };
  const result = await exec(
    "psql",
    ["-XAt", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { env, timeout: 40_000, maxBuffer: 2 * 1024 * 1024 },
  ).catch(() => {
    throw new Error("数据库角色或维护边界核对失败；未输出连接凭据");
  });
  return result.stdout.trim();
}

export function readLocalDatabaseRoles(root, configuredDSN) {
  const file = roleFile(root);
  if (!fs.existsSync(file))
    throw new Error(
      "共享开发库尚未完成应用、迁移和只读账号配置，请先运行 make dev_database_roles",
    );
  const config = readRoleConfig(root);
  const configured = assertRegisteredDatabase(configuredDSN);
  if (
    config.schemaVersion !== "plush.local-database-roles/v1" ||
    config.systemIdentifier !==
      registeredDatabaseSystemIdentifier(root, configuredDSN)
  )
    throw new Error("本地数据库角色配置身份无效");
  const result = {};
  for (const [key, suffix] of [
    ["app", "app"],
    ["migrator", "migrator"],
    ["audit", "backup"],
  ]) {
    const url = assertRegisteredDatabase(config[key]);
    if (
      url.host !== configured.host ||
      url.pathname !== configured.pathname ||
      decodeURIComponent(url.username) !==
        `${LOCAL_DATABASE_ROLE_PREFIX}_${suffix}`
    ) {
      throw new Error("数据库角色与登记目标不一致");
    }
    result[key] = url.href;
  }
  return result;
}

export async function verifyAuditRole(dsn) {
  const proof = await databaseQuery(
    dsn,
    `SELECT NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls
    AND NOT has_database_privilege(current_user,current_database(),'CREATE')
    AND NOT has_schema_privilege(current_user,'public','CREATE')
    AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','atlas_schema_revisions') AND c.relkind IN ('r','p','v','m')
      AND (c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) OR NOT has_table_privilege(current_user,c.oid,'SELECT') OR has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')))
    AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user))
    FROM pg_roles WHERE rolname=current_user;`,
  );
  if (proof !== "t")
    throw new Error(
      "只读审计账号权限不符合要求，不能使用表 owner 或超级用户替代",
    );
}

export async function provisionLocalDatabaseRoles(
  root,
  { reconcile = false } = {},
) {
  const admin = await configuredDatabaseURL(root);
  if (
    (await databaseQuery(
      admin,
      "SELECT system_identifier::text FROM pg_control_system()",
    )) !== registeredDatabaseSystemIdentifier(root, admin)
  )
    throw new Error("共享数据库集群身份不匹配");
  const file = roleFile(root);
  if (fs.existsSync(file) && !reconcile) {
    const roles = readLocalDatabaseRoles(root, admin);
    await verifyAuditRole(roles.audit);
    return roles;
  }
  if (
    !fs.existsSync(file) &&
    (await databaseQuery(
      admin,
      `SELECT count(*) FROM pg_roles WHERE rolname IN ('plush_dev_app','plush_dev_migrator','plush_dev_backup')`,
    )) !== "0"
  ) {
    throw new Error(
      "开发角色已存在但本地凭据缺失；保留现有账号，请恢复受保护的角色配置",
    );
  }
  const url = assertRegisteredDatabase(admin);
  const existing = fs.existsSync(file)
    ? readLocalDatabaseRoles(root, admin)
    : null;
  const passwords = Object.fromEntries(
    ["app", "migrator", "audit"].map((key) => [
      key,
      existing
        ? decodeURIComponent(new URL(existing[key]).password)
        : randomBytes(30).toString("hex"),
    ]),
  );
  const roles = Object.fromEntries(
    Object.entries(passwords).map(([key, password]) => {
      const role = new URL(url);
      role.username = `plush_dev_${key === "audit" ? "backup" : key}`;
      role.password = password;
      return [key, role.href];
    }),
  );
  // Write credentials before creating roles so interruption cannot lose access.
  if (!existing)
    fs.writeFileSync(
      file,
      `${JSON.stringify({ schemaVersion: "plush.local-database-roles/v1", systemIdentifier: registeredDatabaseSystemIdentifier(root, admin), ...roles }, null, 2)}\n`,
      { mode: 0o600, flag: "wx" },
    );
  const env = {
    ...process.env,
    GIT_OPTIONAL_LOCKS: "0",
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PATH: fs.existsSync("/opt/homebrew/opt/postgresql@18/bin/psql")
      ? `/opt/homebrew/opt/postgresql@18/bin:${process.env.PATH}`
      : process.env.PATH,
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get("sslmode") || "disable",
    POSTGRES_USER: decodeURIComponent(url.username),
    POSTGRES_DB: url.pathname.slice(1),
    POSTGRES_ROLE_PREFIX: LOCAL_DATABASE_ROLE_PREFIX,
    POSTGRES_APP_PASSWORD: passwords.app,
    POSTGRES_MIGRATOR_PASSWORD: passwords.migrator,
    POSTGRES_BACKUP_PASSWORD: passwords.audit,
  };
  await exec(
    "bash",
    [
      path.join(root, "server/deploy/compose/prod/database_roles.sh"),
      "reconcile",
    ],
    { env, timeout: 120_000 },
  ).catch((error) => {
    const directory = path.join(root, "output/dev-workbench/database-roles");
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      path.join(directory, "reconcile.log"),
      String(error.stdout || "") + String(error.stderr || ""),
      { mode: 0o600 },
    );
    throw new Error(
      "开发角色配置未完成，凭据及诊断已保留；检查数据库角色状态后恢复",
    );
  });
  await verifyAuditRole(roles.audit);
  return roles;
}

export async function setLocalDatabaseMaintenance(root, enabled) {
  const admin = await configuredDatabaseURL(root);
  readLocalDatabaseRoles(root, admin);
  if (
    (await databaseQuery(
      admin,
      "SELECT system_identifier::text FROM pg_control_system()",
    )) !== registeredDatabaseSystemIdentifier(root, admin)
  )
    throw new Error("维护目标身份不匹配");
  await databaseQuery(
    admin,
    `ALTER ROLE plush_dev_app ${enabled ? "NOLOGIN" : "LOGIN"};${enabled ? " SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND usename='plush_dev_app' AND pid<>pg_backend_pid();" : ""}`,
    { readonly: false },
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  provisionLocalDatabaseRoles(path.resolve(import.meta.dirname, ".."), {
    reconcile: process.argv.includes("--reconcile"),
  })
    .then(() =>
      console.log(
        "[local-database-roles] passed: application / migration / read-only roles verified",
      ),
    )
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
