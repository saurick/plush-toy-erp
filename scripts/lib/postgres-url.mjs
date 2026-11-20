import { pathToFileURL } from "node:url";

export function parsePostgresURL(raw, allowedQueryKeys) {
  let url;
  try {
    if (!raw || raw !== raw.trim() || /[\u0000-\u001f\u007f]/u.test(raw)) throw new Error();
    url = new URL(raw);
  } catch {
    throw new Error("PostgreSQL URL is invalid");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hash) {
    throw new Error(
      "PostgreSQL URL must use postgres/postgresql without a fragment",
    );
  }
  // URL normalization must not change the database named by the caller.
  const sourcePath =
    raw.match(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*([^?#]*)/iu)?.[1] || "";
  if (/(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)/iu.test(sourcePath)) {
    throw new Error("PostgreSQL database path aliases are not allowed");
  }
  if (url.port === "0") throw new Error("PostgreSQL port is invalid");
  const seen = new Set();
  for (const [key] of url.searchParams) {
    if (seen.has(key) || !allowedQueryKeys.includes(key)) {
      throw new Error("PostgreSQL query cannot override connection identity");
    }
    seen.add(key);
  }
  return url;
}

export function decodePostgresValue(value) {
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.includes("\0")) throw new Error();
    return decoded;
  } catch {
    throw new Error("PostgreSQL URL encoding is invalid");
  }
}

export function writePostgresFields(values) {
  if (values.some((value) => String(value).includes("\0"))) {
    throw new Error("PostgreSQL field contains a null byte");
  }
  process.stdout.write(`${values.join("\0")}\0`);
}

export function backupSourceFields(raw) {
  const url = parsePostgresURL(raw.trim(), ["sslmode"]);
  const host = url.hostname.replace(/^\[|\]$/gu, "");
  const database = decodePostgresValue(url.pathname.replace(/^\/+/, ""));
  const user = decodePostgresValue(url.username);
  const password = decodePostgresValue(url.password);
  const sslmode = url.searchParams.get("sslmode") ?? "disable";
  if (
    ![
      "disable",
      "allow",
      "prefer",
      "require",
      "verify-ca",
      "verify-full",
    ].includes(sslmode)
  ) {
    throw new Error("PostgreSQL sslmode is invalid");
  }
  if (!host || !database || !user || !password) {
    throw new Error("PostgreSQL target or credentials are incomplete");
  }
  return [host, url.port || "5432", database, user, password, sslmode];
}

function main() {
  if (process.argv[2] === "backup-source" && process.argv.length === 3) {
    writePostgresFields(
      backupSourceFields(process.env.BACKUP_SOURCE_POSTGRES_DSN || ""),
    );
    return;
  }
  if (process.argv[2] === "create" && process.argv.length === 3) {
    const url = parsePostgresURL(process.env.DB_URL || "", [
      "sslmode",
      "application_name",
      "connect_timeout",
    ]);
    const database = decodePostgresValue(url.pathname.slice(1));
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/u.test(database)) {
      throw new Error("PostgreSQL database name is invalid");
    }
    url.pathname = "/postgres";
    process.stdout.write(`${database}\n${url.href}\n`);
    return;
  }
  throw new Error("invalid PostgreSQL URL invocation");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
