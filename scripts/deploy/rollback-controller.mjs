import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  createOrReuseDeliveryOperation,
  readDeliveryOperation,
  resolveDeliveryOperationStore,
  transitionDeliveryOperation,
} from "./delivery-operation-store.mjs";
import {
  buildRollbackManifest,
  validateRollbackManifest,
  writeRollbackManifest,
} from "./rollback-manifest.mjs";
import { sha256File, validateReleaseManifest } from "./release-catalog.mjs";
import { runTargetPreflight } from "./target-preflight.mjs";

const MAX_MANIFEST_BYTES = 512 * 1024;

function readReleaseManifest(file) {
  const absolute = realpathSync(file);
  const stat = lstatSync(absolute);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > MAX_MANIFEST_BYTES
  ) {
    throw new Error("rollback release manifest is not a bounded plain file");
  }
  return {
    absolute,
    manifest: validateReleaseManifest(
      JSON.parse(readFileSync(absolute, "utf8")),
    ),
  };
}

function rollbackPlanFile(store, operationId) {
  return path.join(store, "plans", `${operationId}.rollback.json`);
}

function issueForBlocker(code) {
  const messages = {
    target_disk_capacity_low: "133 根盘可用空间低于固定安全线",
    rollback_current_release_mismatch: "133 当前 SHA 与来源版本不一致",
    rollback_migration_incompatible:
      "目标版本 migration 序列不同，只能 forward-fix 或显式恢复备份",
    rollback_customer_config_incompatible:
      "目标版本客户配置源指纹不同，禁止普通代码回滚",
  };
  return {
    code,
    level: "error",
    message: messages[code] || `回滚资格阻断：${code}`,
  };
}

export function readRollbackPlan(store, operationId) {
  const file = rollbackPlanFile(store, operationId);
  if (!existsSync(file)) return null;
  const stat = lstatSync(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > MAX_MANIFEST_BYTES
  ) {
    throw new Error("rollback plan is invalid");
  }
  return validateRollbackManifest(JSON.parse(readFileSync(file, "utf8")));
}

export async function prepareRollback(
  {
    repoRoot,
    currentReleaseManifestPath,
    targetReleaseManifestPath,
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
    throw new Error("only the fixed test-133 rollback target is supported");
  }
  const current = readReleaseManifest(currentReleaseManifestPath);
  const target = readReleaseManifest(targetReleaseManifestPath);
  const currentManifestSha256 = sha256File(current.absolute);
  const targetManifestSha256 = sha256File(target.absolute);
  const created = createOrReuseDeliveryOperation(store, {
    action: "rollback",
    target: "test-133",
    gitSha: target.manifest.gitSha,
    version: target.manifest.version,
    idempotencyKey,
    metadata: {
      source: "version-center",
      currentGitSha: current.manifest.gitSha,
      currentVersion: current.manifest.version,
      currentManifestSha256,
      targetManifestSha256,
    },
    now: now(),
  });
  if (created.reused) {
    return {
      schemaVersion: "plush.rollback-controller/v1",
      reused: true,
      operation: created.operation,
      plan: readRollbackPlan(store, created.operation.id),
    };
  }

  let operation = transitionDeliveryOperation(store, created.operation.id, {
    status: "running",
    message: "read-only rollback qualification started",
    now: now(),
  });
  try {
    const targetPreflight = await runPreflight("test-133");
    const plan = buildRollbackManifest({
      operationId: operation.id,
      currentReleaseManifest: current.manifest,
      currentReleaseManifestSha256: currentManifestSha256,
      targetReleaseManifest: target.manifest,
      targetReleaseManifestSha256: targetManifestSha256,
      targetPreflight,
      createdAt: now(),
    });
    writeRollbackManifest(rollbackPlanFile(store, operation.id), plan);
    if (plan.status === "blocked") {
      operation = transitionDeliveryOperation(store, operation.id, {
        status: "blocked",
        message: "code-only rollback is blocked by fixed qualification",
        issues: plan.blockers.map(issueForBlocker),
        metadata: {
          ...operation.metadata,
          rollbackFingerprint: plan.fingerprint,
        },
        now: now(),
      });
    } else if (plan.status === "already_current") {
      operation = transitionDeliveryOperation(store, operation.id, {
        status: "passed",
        message: "requested rollback SHA is already current",
        metadata: {
          ...operation.metadata,
          rollbackFingerprint: plan.fingerprint,
          noTargetWriteRequired: true,
        },
        now: now(),
      });
    } else {
      operation = transitionDeliveryOperation(store, operation.id, {
        status: "ready",
        message:
          "code-only rollback is eligible; explicit confirmation is required",
        metadata: {
          ...operation.metadata,
          rollbackFingerprint: plan.fingerprint,
        },
        now: now(),
      });
    }
    return {
      schemaVersion: "plush.rollback-controller/v1",
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
          "rollback qualification failed without starting a target write",
        issues: [
          {
            code: "rollback_qualification_failed",
            level: "error",
            message: "回滚资格检查失败；未写入目标",
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
    currentManifest: "",
    targetManifest: "",
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
      [
        "--current-manifest",
        "--target-manifest",
        "--target",
        "--idempotency-key",
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
    (!options.currentManifest ||
      !options.targetManifest ||
      !options.target ||
      !options.idempotencyKey)
  ) {
    throw new Error(
      "--current-manifest, --target-manifest, --target and --idempotency-key are required",
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
  node scripts/deploy/rollback-controller.mjs \\
    --current-manifest <release-manifest.json> \\
    --target-manifest <release-manifest.json> \\
    --target test-133 --idempotency-key <stable-random-key> [--json]

This command only prepares a code-and-images rollback plan. It never performs
database down migration, backup restore, target writes or automatic retry.`);
      process.exit(0);
    }
    const report = await prepareRollback({
      repoRoot: process.cwd(),
      currentReleaseManifestPath: options.currentManifest,
      targetReleaseManifestPath: options.targetManifest,
      targetKey: options.target,
      idempotencyKey: options.idempotencyKey,
    });
    console.log(
      options.json
        ? JSON.stringify(report, null, 2)
        : `rollback operation ${report.operation.status}: ${report.operation.id}`,
    );
    process.exit(report.operation.status === "blocked" ? 2 : 0);
  } catch (error) {
    console.error(`[rollback-controller] ${error.message}`);
    process.exit(1);
  }
}
