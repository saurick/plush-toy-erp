#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFileCallback);

export const databaseProgrammabilityCatalogSQL = `
SELECT object_kind, object_name
FROM (
  SELECT
    CASE routine.prokind
      WHEN 'p' THEN 'procedure'
      ELSE 'function'
    END AS object_kind,
    format(
      '%I.%I(%s)',
      namespace.nspname,
      routine.proname,
      pg_get_function_identity_arguments(routine.oid)
    ) AS object_name
  FROM pg_proc AS routine
  JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
  WHERE namespace.nspname <> 'information_schema'
    AND namespace.nspname !~ '^pg_'
    AND routine.prokind IN ('f', 'p')

  UNION ALL

  SELECT
    'trigger' AS object_kind,
    format('%I.%I.%I', namespace.nspname, relation.relname, trigger.tgname)
      AS object_name
  FROM pg_trigger AS trigger
  JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname <> 'information_schema'
    AND namespace.nspname !~ '^pg_'
    AND NOT trigger.tgisinternal
) AS forbidden_object
ORDER BY object_kind, object_name
`;

export const databaseProgrammabilityReceiptSQL = `
SELECT
  'database_programmability='
  || (
    SELECT count(*)::text
    FROM pg_proc AS routine
    JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname <> 'information_schema'
      AND namespace.nspname !~ '^pg_'
      AND routine.prokind = 'f'
  )
  || '|'
  || (
    SELECT count(*)::text
    FROM pg_proc AS routine
    JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname <> 'information_schema'
      AND namespace.nspname !~ '^pg_'
      AND routine.prokind = 'p'
  )
  || '|'
  || (
    SELECT count(*)::text
    FROM pg_trigger AS trigger
    JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname <> 'information_schema'
      AND namespace.nspname !~ '^pg_'
      AND NOT trigger.tgisinternal
  );
`;

export function parseDatabaseProgrammabilityCatalog(output) {
  const objects = String(output || "")
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf("\t");
      if (separator <= 0 || separator === line.length - 1) {
        throw new Error("数据库可编程对象目录输出无法识别");
      }
      return {
        kind: line.slice(0, separator),
        name: line.slice(separator + 1),
      };
    });
  return {
    ok: objects.length === 0,
    objects,
  };
}

function redactDiagnostic(value) {
  return String(value || "")
    .replace(
      /\bpostgres(?:ql)?:\/\/[^:\s/@]+:[^@\s]+@/giu,
      "postgres://<redacted>@",
    )
    .replace(/\bpassword=[^\s&]+/giu, "password=<redacted>");
}

function parseArgs(argv) {
  if (
    argv.length !== 2 ||
    argv[0] !== "--database-url-env" ||
    !/^[A-Z][A-Z0-9_]*$/u.test(argv[1])
  ) {
    throw new Error(
      "用法: node scripts/qa/database-programmability.mjs --database-url-env <ENV_NAME>",
    );
  }
  return { databaseURLEnv: argv[1] };
}

async function main() {
  const { databaseURLEnv } = parseArgs(process.argv.slice(2));
  const databaseURL = String(process.env[databaseURLEnv] || "").trim();
  if (!databaseURL) {
    throw new Error(`数据库连接环境变量 ${databaseURLEnv} 为空`);
  }
  let result;
  try {
    result = await execFileAsync(
      "psql",
      [
        "-X",
        "--no-psqlrc",
        "-At",
        "-F",
        "\t",
        "--dbname",
        databaseURL,
        "-c",
        databaseProgrammabilityCatalogSQL,
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
  } catch (error) {
    const details = redactDiagnostic(
      [error?.stdout, error?.stderr].filter(Boolean).join("\n"),
    ).trim();
    throw new Error(
      details
        ? `无法读取数据库可编程对象目录\n${details}`
        : "无法读取数据库可编程对象目录",
    );
  }
  const evaluated = parseDatabaseProgrammabilityCatalog(result.stdout);
  if (!evaluated.ok) {
    throw new Error(
      [
        "非系统 schema 禁止自定义 Function、Procedure 和非内部 Trigger:",
        ...evaluated.objects.map(
          (object) => `  - ${object.kind}: ${object.name}`,
        ),
      ].join("\n"),
    );
  }
  process.stdout.write(
    "[db-programmability] non-system-schema function=0 procedure=0 non-internal-trigger=0\n",
  );
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(`[db-programmability] ERROR: ${error.message}\n`);
    process.exit(1);
  });
}
