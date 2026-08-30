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
import { classifyGitAncestryRelation } from "./git-ancestry-relation.mjs";
import { getDeploymentTarget } from "./deployment-targets.mjs";

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
      "目标当前运行版本不是本次重建绑定的精确不可变版本",
    database_rebuild_target_database_mismatch:
      "目标当前逻辑数据库不符合登记合同",
    database_rebuild_target_preflight_blocked:
      "目标当前预检未通过且未提供可安全执行的精确资格证据",
    database_rebuild_git_relation_not_current:
      "数据库重建只能绑定目标当前正在运行的 exact SHA",
    target_disk_capacity_low: "目标根盘可用空间低于固定安全线",
    target_capacity_unknown: "无法证明目标根盘容量",
    target_migration_lock_held: "目标 migration lock 正在被其他操作持有",
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
    retryOfOperationId = null,
  },
  {
    runPreflight = runTargetPreflight,
    classifyRelation = classifyGitAncestryRelation,
    now = () => new Date().toISOString(),
  } = {},
) {
  const root = realpathSync(repoRoot || process.cwd());
  const store = operationStore || resolveDeliveryOperationStore(root);
  const target = getDeploymentTarget(targetKey);
  const release = readReleaseManifest(releaseManifestPath);
  const releaseManifestSha256 = sha256File(release.absolute);
  const created = createOrReuseDeliveryOperation(store, {
    action: "rebuild-database",
    target: target.key,
    gitSha: release.manifest.gitSha,
    version: release.manifest.version,
    idempotencyKey,
    retryOfOperationId,
    metadata: {
      source: "version-center",
      releaseManifestSha256,
      logicalDatabase: target.database.name,
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
    const targetPreflight = runPreflight(target.key);
    const ancestry = classifyRelation({
      repoRoot: root,
      currentGitSha: targetPreflight.remote?.runtime?.serverSha,
      candidateGitSha: release.manifest.gitSha,
    });
    const plan = buildDatabaseRebuildManifest({
      operationId: operation.id,
      releaseManifest: release.manifest,
      releaseManifestSha256,
      targetPreflight,
      ancestry,
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

export function parseDatabaseRebuildControllerArgs(argv) {
  const options = {
    releaseManifest: "",
    target: "",
    idempotencyKey: "",
    retryOfOperationId: null,
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
      [
        "--release-manifest",
        "--target",
        "--idempotency-key",
        "--retry-of-operation-id",
      ].includes(token)
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
    const options = parseDatabaseRebuildControllerArgs(process.argv.slice(2));
    if (options.help) {
      console.log(`Usage:
  node scripts/deploy/database-rebuild-controller.mjs \\
    --release-manifest <release-manifest.json> \\
    --target <demo-133|customer-test-133> \\
    --idempotency-key <stable-random-key> \\
    [--retry-of-operation-id <terminal-operation-id>] [--json]

This command only prepares a fixed-target, same-logical-database fresh physical
generation plan. It never stops services, moves data, migrates or bootstraps.
A terminal operation is retried only through an explicit
--retry-of-operation-id lineage.`);
      process.exit(0);
    }
    const report = prepareDatabaseRebuild({
      repoRoot: process.cwd(),
      releaseManifestPath: options.releaseManifest,
      targetKey: options.target,
      idempotencyKey: options.idempotencyKey,
      retryOfOperationId: options.retryOfOperationId,
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
