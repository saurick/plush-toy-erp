import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
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
  buildPromotionManifest,
  sha256File,
  validatePromotionManifest,
  writePromotionManifest,
} from "./promotion-manifest.mjs";
import { validateReleaseManifest } from "./release-catalog.mjs";
import { runTargetPreflight } from "./target-preflight.mjs";

const MAX_MANIFEST_BYTES = 512 * 1024;

function readPlainJson(file, maximumBytes = MAX_MANIFEST_BYTES) {
  const absolute = realpathSync(file);
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximumBytes) {
    throw new Error("manifest input is not a bounded plain file");
  }
  return {
    absolute,
    value: JSON.parse(readFileSync(absolute, "utf8")),
  };
}

function promotionPlanFile(store, operationId) {
  return path.join(store, "plans", `${operationId}.json`);
}

function issueForBlocker(code) {
  const messages = {
    target_disk_capacity_low: "133 根盘可用空间低于固定安全线，先扩容并读回",
    target_capacity_unknown: "无法证明 133 根盘容量",
    target_migration_lock_held: "133 migration lock 正在被其他操作持有",
    target_runtime_sha_mismatch: "133 Server/Web 当前 SHA 不一致",
  };
  return {
    code,
    level: "error",
    message: messages[code] || `目标预检阻断：${code}`,
  };
}

export function readPromotionPlan(store, operationId) {
  const file = promotionPlanFile(store, operationId);
  if (!existsSync(file)) return null;
  return validatePromotionManifest(readPlainJson(file).value);
}

export async function preparePromotion(
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
    now = () => new Date().toISOString(),
  } = {},
) {
  const root = realpathSync(repoRoot || process.cwd());
  const store = operationStore || resolveDeliveryOperationStore(root);
  const releaseInput = readPlainJson(releaseManifestPath);
  const releaseManifest = validateReleaseManifest(releaseInput.value);
  const releaseManifestSha256 = sha256File(releaseInput.absolute);
  const created = createOrReuseDeliveryOperation(store, {
    action: "promote",
    target: targetKey,
    gitSha: releaseManifest.gitSha,
    version: releaseManifest.version,
    idempotencyKey,
    retryOfOperationId,
    metadata: {
      releaseManifestSha256,
      source: "version-center",
    },
    now: now(),
  });
  if (created.reused) {
    return {
      schemaVersion: "plush.promotion-controller/v1",
      reused: true,
      operation: created.operation,
      plan: readPromotionPlan(store, created.operation.id),
    };
  }

  let operation = transitionDeliveryOperation(store, created.operation.id, {
    status: "running",
    message: "read-only fixed-target preflight started",
    now: now(),
  });
  try {
    const targetPreflight = await runPreflight(targetKey);
    const plan = buildPromotionManifest({
      operationId: operation.id,
      releaseManifest,
      releaseManifestSha256,
      targetPreflight,
      createdAt: now(),
    });
    writePromotionManifest(promotionPlanFile(store, operation.id), plan);
    if (plan.status === "blocked") {
      operation = transitionDeliveryOperation(store, operation.id, {
        status: "blocked",
        message: "promotion is blocked by fixed-target preflight",
        issues: plan.blockers.map(issueForBlocker),
        metadata: {
          ...operation.metadata,
          promotionFingerprint: plan.fingerprint,
        },
        now: now(),
      });
    } else if (plan.status === "already_current") {
      operation = transitionDeliveryOperation(store, operation.id, {
        status: "passed",
        message: "requested exact SHA is already current and healthy",
        metadata: {
          ...operation.metadata,
          promotionFingerprint: plan.fingerprint,
          noTargetWriteRequired: true,
        },
        now: now(),
      });
    } else {
      operation = transitionDeliveryOperation(store, operation.id, {
        status: "ready",
        message:
          "promotion plan is eligible; explicit confirmation is required",
        metadata: {
          ...operation.metadata,
          promotionFingerprint: plan.fingerprint,
        },
        now: now(),
      });
    }
    return {
      schemaVersion: "plush.promotion-controller/v1",
      reused: false,
      operation,
      plan,
    };
  } catch (error) {
    const current = readDeliveryOperation(store, operation.id);
    if (current.status === "running") {
      transitionDeliveryOperation(store, operation.id, {
        status: "failed",
        message: "promotion preparation failed without starting a target write",
        issues: [
          {
            code: "promotion_preparation_failed",
            level: "error",
            message: "发布准备失败；未启动目标写操作",
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
      options[
        token === "--release-manifest"
          ? "releaseManifest"
          : token
              .slice(2)
              .replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase())
      ] = value;
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
  node scripts/deploy/promotion-controller.mjs \\
    --release-manifest <release-manifest.json> \\
    --target test-133 \\
    --idempotency-key <stable-random-key> [--json]

This command prepares a fixed-target plan only. It never builds, transfers,
migrates, deploys or retries a terminal operation.`);
      process.exit(0);
    }
    const report = await preparePromotion({
      repoRoot: process.cwd(),
      releaseManifestPath: options.releaseManifest,
      targetKey: options.target,
      idempotencyKey: options.idempotencyKey,
    });
    console.log(
      options.json
        ? JSON.stringify(report, null, 2)
        : `promotion operation ${report.operation.status}: ${report.operation.id}`,
    );
    process.exit(report.operation.status === "blocked" ? 2 : 0);
  } catch (error) {
    console.error(`[promotion-controller] ${error.message}`);
    process.exit(1);
  }
}
