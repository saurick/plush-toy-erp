import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  buildDatabaseRebuildManifest,
  validateDatabaseRebuildManifest,
  writeDatabaseRebuildManifest,
} from "./database-rebuild-manifest.mjs";
import {
  createOrReuseDeliveryOperation,
  readDeliveryOperation,
  resolveDeliveryOperationStore,
  transitionDeliveryOperation,
} from "./delivery-operation-store.mjs";
import {
  sha256File,
  validateReleaseManifest,
} from "./release-catalog.mjs";
import { runTargetPreflight } from "./target-preflight.mjs";

const MAX_MANIFEST_BYTES = 512 * 1024;

function readReleaseManifest(file) {
  const absolute = realpathSync(file);
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_MANIFEST_BYTES) {
    throw new Error("database rebuild release manifest is invalid");
  }
  return {
    absolute,
    manifest: validateReleaseManifest(
      JSON.parse(readFileSync(absolute, "utf8")),
    ),
  };
}

function planFile(store, operationId) {
  return path.join(store, "plans", `${operationId}.database-rebuild.json`);
}

function issueForBlocker(code) {
  const messages = {
    database_rebuild_runtime_release_mismatch:
      "133 当前运行版本不是本次重建绑定的精确不可变版本",
    database_rebuild_target_database_mismatch:
      "133 当前逻辑数据库不符合固定验收目标合同",
    database_rebuild_target_preflight_blocked:
      "133 当前预检未通过且未提供可安全执行的精确资格证据",
    target_disk_capacity_low: "133 根盘可用空间低于固定安全线",
    target_capacity_unknown: "无法证明 133 根盘容量",
    target_migration_lock_held: "133 migration lock 正在被其他操作持有",
  };
  return {
    code,
    level: "error",
    message: messages[code] || `数据库重建资格阻断：${code}`,
  };
}

export function readDatabaseRebuildPlan(store, operationId) {
  const file = planFile(store, operationId);
  if (!existsSync(file)) return null;
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_MANIFEST_BYTES) {
    throw new Error("database rebuild plan is invalid");
  }
  return validateDatabaseRebuildManifest(
    JSON.parse(readFileSync(file, "utf8")),
  );
}

export function prepareDatabaseRebuild(
  {
    repoRoot,
    releaseManifestPath,
    targetKey,
    idempotencyKey,
    operationStore,
  },
  {
    runPreflight = runTargetPreflight,
    now = () => new Date().toISOString(),
  } = {},
) {
  const root = realpathSync(repoRoot || process.cwd());
  const store = operationStore || resolveDeliveryOperationStore(root);
  if (targetKey !== "test-133") {
    throw new Error("only the fixed test-133 database rebuild target is supported");
  }
  const release = readReleaseManifest(releaseManifestPath);
  const releaseManifestSha256 = sha256File(release.absolute);
  const created = createOrReuseDeliveryOperation(store, {
    action: "rebuild-database",
    target: "test-133",
    gitSha: release.manifest.gitSha,
    version: release.manifest.version,
    idempotencyKey,
    metadata: {
      source: "version-center",
      releaseManifestSha256,
      logicalDatabase: "plush_erp_uat_20260716_v5",
      physicalGeneration: "fresh",
    },
    now: now(),
  });
  if (created.reused) {
    return {
      schemaVersion: "plush.database-rebuild-controller/v1",
      reused: true,
      operation: created.operation,
      plan: readDatabaseRebuildPlan(store, created.operation.id),
    };
  }

  let operation = transitionDeliveryOperation(store, created.operation.id, {
    status: "running",
    message: "read-only fixed-target database rebuild qualification started",
    now: now(),
  });
  try {
    const targetPreflight = runPreflight("test-133");
    const plan = buildDatabaseRebuildManifest({
      operationId: operation.id,
      releaseManifest: release.manifest,
      releaseManifestSha256,
      targetPreflight,
      createdAt: now(),
    });
    writeDatabaseRebuildManifest(planFile(store, operation.id), plan);
    if (plan.status === "blocked") {
      operation = transitionDeliveryOperation(store, operation.id, {
        status: "blocked",
        message: "database rebuild is blocked by fixed-target qualification",
        issues: plan.blockers.map(issueForBlocker),
        metadata: {
          ...operation.metadata,
          databaseRebuildFingerprint: plan.fingerprint,
        },
        now: now(),
      });
    } else {
      operation = transitionDeliveryOperation(store, operation.id, {
        status: "ready",
        message:
          "database rebuild is eligible; exact destructive-scope confirmation is required",
        metadata: {
          ...operation.metadata,
          databaseRebuildFingerprint: plan.fingerprint,
        },
        now: now(),
      });
    }
    return {
      schemaVersion: "plush.database-rebuild-controller/v1",
      reused: false,
      operation,
      plan,
    };
  } catch (error) {
    const latest = readDeliveryOperation(store, operation.id);
    if (latest.status === "running") {
      transitionDeliveryOperation(store, operation.id, {
        status: "failed",
        message:
          "database rebuild qualification failed without starting a target write",
        issues: [
          {
            code: "database_rebuild_qualification_failed",
            level: "error",
            message: "数据库重建资格检查失败；未写入目标",
          },
        ],
        now: now(),
      });
    }
    throw error;
  }
}

function parseArgs(argv) {
  const options = {
    releaseManifest: "",
    target: "",
    idempotencyKey: "",
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (
      ["--release-manifest", "--target", "--idempotency-key"].includes(token)
    ) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${token} requires a value`);
      }
      const key = token
        .slice(2)
        .replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
      options[key] = value;
      index += 1;
      continue;
    }
    throw new Error(`unsupported argument: ${token}`);
  }
  if (
    !options.help &&
    (!options.releaseManifest || !options.target || !options.idempotencyKey)
  ) {
    throw new Error(
      "--release-manifest, --target and --idempotency-key are required",
    );
  }
  return options;
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
  node scripts/deploy/database-rebuild-controller.mjs \\
    --release-manifest <release-manifest.json> \\
    --target test-133 \\
    --idempotency-key <stable-random-key> [--json]

This command only prepares a fixed-target, same-logical-database fresh physical
generation plan. It never stops services, moves data, migrates or bootstraps.`);
      process.exit(0);
    }
    const report = prepareDatabaseRebuild({
      repoRoot: process.cwd(),
      releaseManifestPath: options.releaseManifest,
      targetKey: options.target,
      idempotencyKey: options.idempotencyKey,
    });
    console.log(
      options.json
        ? JSON.stringify(report, null, 2)
        : `database rebuild ${report.operation.status}: ${report.operation.id}`,
    );
    process.exit(report.operation.status === "ready" ? 0 : 2);
  } catch (error) {
    console.error(`[database-rebuild-controller] ${error.message}`);
    process.exit(1);
  }
}
