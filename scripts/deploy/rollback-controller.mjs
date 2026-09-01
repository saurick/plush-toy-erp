import { realpathSync } from "node:fs";
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
import { validateReleaseManifest } from "./release-catalog.mjs";
import { runTargetPreflight } from "./target-preflight.mjs";
import { classifyGitAncestryRelation } from "./git-ancestry-relation.mjs";
import { getDeploymentTarget } from "./deployment-targets.mjs";
import {
  buildTargetReleaseCacheIdentity,
  probeTargetReleaseCache,
  targetReleaseCacheEvidenceFingerprint,
} from "./target-release-cache.mjs";
import { readBoundedPlainFile } from "../lib/file-digest.mjs";

const MAX_MANIFEST_BYTES = 512 * 1024;

function readReleaseManifest(file) {
  const input = path.resolve(file);
  const absolute = path.join(
    realpathSync(path.dirname(input)),
    path.basename(input),
  );
  let snapshot;
  try {
    snapshot = readBoundedPlainFile(absolute, {
      maximumBytes: MAX_MANIFEST_BYTES,
    });
  } catch (error) {
    throw new Error(
      "rollback release manifest is not a bounded plain file",
      { cause: error },
    );
  }
  return {
    absolute,
    sha256: snapshot.sha256,
    manifest: validateReleaseManifest(
      JSON.parse(snapshot.content.toString("utf8")),
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
    rollback_git_relation_not_behind:
      "目标 SHA 不是 133 当前 SHA 的祖先，禁止按发布时间猜测回滚方向",
    rollback_target_transport_unavailable:
      "目标旧版本没有精确命中的既有回滚缓存，禁止从控制机中转或补造制品",
  };
  return {
    code,
    level: "error",
    message: messages[code] || `回滚资格阻断：${code}`,
  };
}

export function readRollbackPlan(store, operationId) {
  const file = rollbackPlanFile(store, operationId);
  let snapshot;
  try {
    snapshot = readBoundedPlainFile(file, {
      maximumBytes: MAX_MANIFEST_BYTES,
    });
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  return validateRollbackManifest(
    JSON.parse(snapshot.content.toString("utf8")),
  );
}

export async function prepareRollback(
  {
    repoRoot,
    currentReleaseManifestPath,
    targetReleaseManifestPath,
    targetKey,
    idempotencyKey,
    operationStore,
    retryOfOperationId = null,
  },
  {
    runPreflight = runTargetPreflight,
    classifyRelation = classifyGitAncestryRelation,
    buildCacheIdentity = buildTargetReleaseCacheIdentity,
    probeCache = probeTargetReleaseCache,
    now = () => new Date().toISOString(),
  } = {},
) {
  const root = realpathSync(repoRoot || process.cwd());
  const store = operationStore || resolveDeliveryOperationStore(root);
  getDeploymentTarget(targetKey);
  const current = readReleaseManifest(currentReleaseManifestPath);
  const target = readReleaseManifest(targetReleaseManifestPath);
  const currentManifestSha256 = current.sha256;
  const targetManifestSha256 = target.sha256;
  const created = createOrReuseDeliveryOperation(store, {
    action: "rollback",
    target: targetKey,
    gitSha: target.manifest.gitSha,
    version: target.manifest.version,
    idempotencyKey,
    retryOfOperationId,
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
    let targetPreflight = await runPreflight(targetKey);
    let rollbackTargetCacheFingerprint = null;
    if (target.manifest.schemaVersion === "plush.release-manifest/v1") {
      try {
        const identity = buildCacheIdentity({
          bundleDir: path.dirname(target.absolute),
          releaseManifestPath: target.absolute,
        });
        const probe = await Promise.resolve(
          probeCache(identity, { targetKey }),
        );
        if (
          identity.cacheMode !== "legacy_v1_existing_only" ||
          probe.packageHit !== true ||
          probe.cacheSource !== "formal"
        ) {
          throw new Error("legacy rollback target cache is unavailable");
        }
        rollbackTargetCacheFingerprint =
          targetReleaseCacheEvidenceFingerprint({
            targetKey,
            identity,
            probe,
          });
      } catch {
        targetPreflight = {
          ...targetPreflight,
          blockers: [
            ...new Set([
              ...(targetPreflight.blockers || []),
              "rollback_target_transport_unavailable",
            ]),
          ].sort(),
        };
      }
    }
    const ancestry = classifyRelation({
      repoRoot: root,
      currentGitSha: current.manifest.gitSha,
      candidateGitSha: target.manifest.gitSha,
    });
    const plan = buildRollbackManifest({
      operationId: operation.id,
      currentReleaseManifest: current.manifest,
      currentReleaseManifestSha256: currentManifestSha256,
      targetReleaseManifest: target.manifest,
      targetReleaseManifestSha256: targetManifestSha256,
      targetPreflight,
      ancestry,
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
          rollbackTransportMode: plan.transport.mode,
          rollbackTargetCacheFingerprint,
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
          rollbackTransportMode: plan.transport.mode,
          rollbackTargetCacheFingerprint,
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
          rollbackTransportMode: plan.transport.mode,
          rollbackTargetCacheFingerprint,
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
    --target <demo-133|customer-test-133> --idempotency-key <stable-random-key> [--json]

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
