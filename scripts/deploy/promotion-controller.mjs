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
import { assertReleaseArtifactManifest } from "./release-artifact-bundle.mjs";
import {
  validateReleaseArtifactBinding,
  validateReleaseManifest,
  validateReleaseRehearsalReceipt,
} from "./release-catalog.mjs";
import { runTargetPreflight } from "./target-preflight.mjs";
import {
  buildTargetInitializationManifest,
  isTargetInitializationManifest,
  validateTargetInitializationManifest,
  writeTargetInitializationManifest,
} from "./target-initialization-manifest.mjs";
import { runTargetInitializationPreflight } from "./target-initialization-preflight.mjs";
import { classifyGitAncestryRelation } from "./git-ancestry-relation.mjs";

const MAX_MANIFEST_BYTES = 512 * 1024;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;

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
    promotion_git_relation_not_ahead:
      "发布 SHA 不是 133 当前 SHA 的后继，禁止按发布时间猜测部署方向",
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
  const value = readPlainJson(file).value;
  return isTargetInitializationManifest(value)
    ? validateTargetInitializationManifest(value)
    : validatePromotionManifest(value);
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
    runInitializationPreflight = runTargetInitializationPreflight,
    classifyRelation = classifyGitAncestryRelation,
    qualifyEligiblePlan = null,
    now = () => new Date().toISOString(),
  } = {},
) {
  const root = realpathSync(repoRoot || process.cwd());
  const store = operationStore || resolveDeliveryOperationStore(root);
  const releaseInput = readPlainJson(releaseManifestPath);
  const releaseManifest = validateReleaseManifest(releaseInput.value);
  const releaseManifestSha256 = sha256File(releaseInput.absolute);
  const releaseDirectory = path.dirname(releaseInput.absolute);
  const artifactInput = readPlainJson(
    path.join(releaseDirectory, "release-artifact.json"),
  );
  const artifact = assertReleaseArtifactManifest(artifactInput.value);
  const rehearsalInput = readPlainJson(
    path.join(releaseDirectory, "release-rehearsal.json"),
  );
  validateReleaseRehearsalReceipt(rehearsalInput.value, artifact, {
    sha: releaseManifest.gitSha,
    version: releaseManifest.version,
    customer: "yoyoosun",
  });
  const rehearsalReceiptSha256 = sha256File(rehearsalInput.absolute);
  validateReleaseArtifactBinding(
    releaseManifest,
    artifact,
    sha256File(artifactInput.absolute),
  );
  if (
    releaseManifest.schemaVersion !== "plush.release-manifest/v2" ||
    rehearsalReceiptSha256 !== releaseManifest.rehearsal?.receiptSha256
  ) {
    throw new Error("promotion requires the exact v2 seven-asset evidence");
  }
  const created = createOrReuseDeliveryOperation(store, {
    action: "promote",
    target: targetKey,
    gitSha: releaseManifest.gitSha,
    version: releaseManifest.version,
    idempotencyKey,
    retryOfOperationId,
    metadata: {
      releaseManifestSha256,
      rehearsalReceiptSha256,
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
    const runtimeServerSha = targetPreflight.remote?.runtime?.serverSha;
    const runtimeWebSha = targetPreflight.remote?.runtime?.webSha;
    const existingRuntimeIdentity =
      SHA_PATTERN.test(String(runtimeServerSha || "")) &&
      runtimeServerSha === runtimeWebSha;
    let plan;
    let promotionMode;
    if (targetPreflight.status === "passed" || existingRuntimeIdentity) {
      const ancestry = classifyRelation({
        repoRoot: root,
        currentGitSha: targetPreflight.remote?.runtime?.serverSha,
        candidateGitSha: releaseManifest.gitSha,
      });
      plan = buildPromotionManifest({
        operationId: operation.id,
        releaseManifest,
        releaseManifestSha256,
        targetPreflight,
        ancestry,
        createdAt: now(),
      });
      writePromotionManifest(promotionPlanFile(store, operation.id), plan);
      promotionMode = "upgrade";
    } else {
      const initializationPreflight =
        await runInitializationPreflight(targetKey);
      plan = buildTargetInitializationManifest({
        operationId: operation.id,
        releaseManifest,
        releaseManifestSha256,
        initializationPreflight,
        createdAt: now(),
      });
      writeTargetInitializationManifest(
        promotionPlanFile(store, operation.id),
        plan,
      );
      promotionMode = "initialize";
    }
    if (plan.status === "blocked") {
      operation = transitionDeliveryOperation(store, operation.id, {
        status: "blocked",
        message:
          promotionMode === "initialize"
            ? "target initialization is blocked by the pristine-target preflight"
            : "promotion is blocked by fixed-target preflight",
        issues: plan.blockers.map(issueForBlocker),
        metadata: {
          ...operation.metadata,
          promotionFingerprint: plan.fingerprint,
          promotionMode,
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
          promotionMode,
          noTargetWriteRequired: true,
        },
        now: now(),
      });
    } else {
      if (
        qualifyEligiblePlan !== null &&
        typeof qualifyEligiblePlan !== "function"
      ) {
        throw new Error("promotion readiness qualifier is invalid");
      }
      const qualification = qualifyEligiblePlan
        ? await qualifyEligiblePlan({
            operation,
            plan,
            promotionMode,
            releaseManifest,
          })
        : { status: "ready" };
      if (qualification?.status === "ready") {
        operation = transitionDeliveryOperation(store, operation.id, {
          status: "ready",
          message:
            qualification?.message ||
            "promotion plan is eligible; explicit confirmation is required",
          metadata: {
            ...operation.metadata,
            ...(qualification?.metadata || {}),
            promotionFingerprint: plan.fingerprint,
            promotionMode,
          },
          now: now(),
        });
      } else if (
        qualification.status === "blocked" &&
        Array.isArray(qualification.issues) &&
        qualification.issues.length > 0
      ) {
        operation = transitionDeliveryOperation(store, operation.id, {
          status: "blocked",
          message:
            qualification.message ||
            "promotion is blocked by final readiness qualification",
          issues: qualification.issues,
          metadata: {
            ...operation.metadata,
            ...(qualification.metadata || {}),
            promotionFingerprint: plan.fingerprint,
            promotionMode,
          },
          now: now(),
        });
      } else {
        throw new Error("promotion readiness qualification is invalid");
      }
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

export function parsePromotionControllerArgs(argv) {
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
    const options = parsePromotionControllerArgs(process.argv.slice(2));
    if (options.help) {
      console.log(`Usage:
  node scripts/deploy/promotion-controller.mjs \\
    --release-manifest <release-manifest.json> \\
    --target <demo-133|customer-test-133> \\
    --idempotency-key <stable-random-key> \
    [--retry-of-operation-id <terminal-operation-id>] [--json]

This command prepares a fixed-target plan only. It never builds, transfers,
migrates or deploys. A terminal operation is retried only through an explicit
--retry-of-operation-id lineage.`);
      process.exit(0);
    }
    const report = await preparePromotion({
      repoRoot: process.cwd(),
      releaseManifestPath: options.releaseManifest,
      targetKey: options.target,
      idempotencyKey: options.idempotencyKey,
      retryOfOperationId: options.retryOfOperationId,
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
