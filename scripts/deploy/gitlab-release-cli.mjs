#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { resolveDevGitlabCredential } from "../../web/scripts/startWebDev.mjs";
import {
  GitlabReleaseCLIError,
  resolveGitlabReleaseCredential,
  verifyGitlabReleaseCredential,
} from "./gitlab-release-credentials.mjs";
export {
  GitlabReleaseCLIError,
  GITLAB_RELEASE_KEYCHAIN,
  resolveGitlabReleaseCredential,
  verifyGitlabReleaseCredential,
} from "./gitlab-release-credentials.mjs";
import { createDevDeliveryService } from "../../web/dev-server/devDeliveryBridgePlugin.mjs";
import { projectDevQualityGateServerEvidence } from "../../web/dev-server/devQualityGatePlugin.mjs";
import {
  readRepositoryIdentity,
  repositoryIdentitiesEqual,
} from "../qa/lib/repository-identity.mjs";
import {
  createGitlabDeliveryProvider,
  GITLAB_DELIVERY_BASE_URL,
  GITLAB_DELIVERY_PROJECT,
} from "./gitlab-delivery-provider.mjs";
import { buildReleaseVersionCatalog } from "./release-version-catalog.mjs";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, "../..");
const SHA = /^[0-9a-f]{40}$/u;
function reject(code, message) {
  throw new GitlabReleaseCLIError(code, message);
}

export function parseGitlabReleaseCLI(argv) {
  const args = [...argv];
  const command = args[0] && !args[0].startsWith("--") ? args.shift() : "plan";
  if (
    !["plan", "check-credentials", "publish", "status", "help"].includes(
      command,
    )
  ) {
    reject("arguments_invalid", "不支持的发布命令");
  }
  const options = { command, execute: false };
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (key === "--execute" && !options.execute) {
      options.execute = true;
      continue;
    }
    if (
      !["--sha", "--version"].includes(key) ||
      options[key.slice(2)] !== undefined
    ) {
      reject("arguments_invalid", "发布参数未知或重复");
    }
    const value = args[++index];
    if (!value || value.startsWith("--"))
      reject("arguments_invalid", "发布参数缺少值");
    options[key.slice(2)] = value;
  }
  if (options.sha && !SHA.test(options.sha))
    reject("arguments_invalid", "须提供完整提交 SHA");
  if (
    options.version &&
    !/^20[0-9]{2}\.[0-9]{2}\.[0-9]{2}-[1-9][0-9]{0,3}$/u.test(options.version)
  ) {
    reject("arguments_invalid", "正式版本格式无效");
  }
  if (options.execute && command !== "publish")
    reject("arguments_invalid", "只有 publish 可执行写入");
  if (options.version && !["plan", "publish"].includes(command))
    reject("arguments_invalid", "此命令不接受版本参数");
  if (options.sha && ["check-credentials", "help"].includes(command))
    reject("arguments_invalid", "此命令不接受提交参数");
  return options;
}

export async function runGitlabReleaseCLI(
  options,
  {
    projectRoot = ROOT,
    env = process.env,
    readRepository = readRepositoryIdentity,
    readWriteCredential = resolveGitlabReleaseCredential,
    readCredential = resolveDevGitlabCredential,
    verifyCredential = verifyGitlabReleaseCredential,
    createProvider = createGitlabDeliveryProvider,
    createService = createDevDeliveryService,
    projectCI = projectDevQualityGateServerEvidence,
    now = () => new Date().toISOString(),
  } = {},
) {
  if (options.command === "help")
    return {
      commands: [
        "plan",
        "check-credentials",
        "publish --execute",
        "status --sha SHA",
      ],
    };
  if (env.PLUSH_DELIVERY_PROVIDER && env.PLUSH_DELIVERY_PROVIDER !== "gitlab") {
    reject("provider_invalid", "此入口只支持本项目 GitLab 发布");
  }
  if (options.command === "check-credentials") {
    const credential = await readWriteCredential({ env });
    return {
      ...(await verifyCredential(credential.token)),
      credentialSource: credential.source,
    };
  }
  const repository = await readRepository(projectRoot);
  const sha = options.sha || repository.commit;
  if (
    options.command === "plan" ||
    (options.command === "publish" && !options.execute)
  ) {
    return {
      mode: "plan",
      provider: "gitlab",
      project: GITLAB_DELIVERY_PROJECT,
      sha,
      repositoryCommit: repository.commit,
      repositoryDirty: repository.dirty,
      requestedVersion: options.version || null,
      versionSource: "Asia/Shanghai release catalog",
      dispatchesPipeline: false,
      readsCredentials: false,
      connectsTargets: false,
    };
  }
  if (
    options.command === "publish" &&
    (repository.dirty || repository.commit !== sha)
  ) {
    reject("source_not_clean", "发布要求当前工作区干净，并与指定 SHA 一致");
  }
  const read = await readCredential({ env });
  if (!read.token) reject("read_credential_missing", "未配置 GitLab 只读凭据");
  const readProvider = createProvider({
    projectRoot,
    env: { ...env, PLUSH_GITLAB_TOKEN: read.token },
  });
  if (options.command === "status") {
    const state = await readProvider.getReleaseStatus(sha);
    return {
      status: state.status,
      sha,
      version: state.release?.version || null,
      completeAssets: state.release?.completeAssets === true,
      promotionEligible: state.release?.promotionEligible === true,
      pipeline: state.run
        ? { id: state.run.id, status: state.run.status, url: state.run.url }
        : null,
    };
  }
  const credential = await readWriteCredential({ env });
  const capability = await verifyCredential(credential.token);
  const ci = projectCI(
    await readProvider.listPipelineTimings({ limit: 8, sha }),
    repository,
  );
  if (ci.status !== "passed" || !ci.current || !ci.coversWorkingTree) {
    reject("ci_not_complete", "当前提交尚无完整通过的 GitLab CI 证据");
  }
  const state = await readProvider.getReleaseStatus(sha);
  if (["running", "awaiting_release"].includes(state.status)) {
    return {
      status: "already_running",
      sha,
      pipeline: state.run,
      dispatchesPipeline: false,
    };
  }
  if (state.status === "failed") {
    reject("release_failed", "已有失败发布，请先核对现场并使用正式重试流程");
  }
  const version =
    state.status === "published"
      ? state.release?.version
      : buildReleaseVersionCatalog({
          versions: await readProvider.listVersions({ limit: 100 }),
          reference: now(),
        }).nextVersion;
  if (options.version && options.version !== version) {
    reject("version_mismatch", "指定版本与当前正式目录不一致");
  }
  if (
    !repositoryIdentitiesEqual(repository, await readRepository(projectRoot))
  ) {
    reject("source_changed", "发布准备期间源码发生变化，请重新核对");
  }
  const service = createService({
    projectRoot,
    readProvider,
    env: {
      ...env,
      PLUSH_GITLAB_TOKEN: credential.token,
      PLUSH_GITLAB_READ_TOKEN: read.token,
    },
  });
  const idempotencyKey = `cli-release-${createHash("sha256").update(`${sha}:${version}`).digest("hex").slice(0, 32)}`;
  let result;
  try {
    result = await service.act({
      action: "dispatch-release",
      payload: {
        gitSha: sha,
        version,
        idempotencyKey,
      },
    });
  } catch {
    const error = new GitlabReleaseCLIError(
      "dispatch_not_proven",
      "发布请求未完成，请核对 operation 与 GitLab 状态；不会自动重试",
    );
    Object.assign(error, { sha, version, idempotencyKey });
    throw error;
  }
  const operation = result.operation;
  return {
    status: operation.status,
    sha,
    version,
    operation: {
      id: operation.id,
      status: operation.status,
      action: operation.action,
    },
    ciPipeline: ci.pipeline?.id || null,
    credentialSource: credential.source,
    credentialExpiresAt: capability.expiresAt,
    targetWrites: false,
    containsCredentials: false,
  };
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  process.env.GIT_OPTIONAL_LOCKS = "0";
  try {
    const options = parseGitlabReleaseCLI(process.argv.slice(2));
    const lock = await execFileAsync(
      "git",
      ["rev-parse", "--git-path", "index.lock"],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: process.env,
      },
    );
    if (
      options.command === "publish" &&
      options.execute &&
      existsSync(path.resolve(ROOT, lock.stdout.trim()))
    ) {
      reject("git_locked", "Git 正在操作索引，发布入口暂不执行");
    }
    process.stdout.write(
      `${JSON.stringify(await runGitlabReleaseCLI(options), null, 2)}\n`,
    );
  } catch (error) {
    const safe = error instanceof GitlabReleaseCLIError;
    process.stderr.write(
      `${JSON.stringify({ status: "not_proven", code: safe ? error.code : "release_cli_failed", message: safe ? error.message : "发布入口未完成，请核对凭据、源码和 GitLab 状态；不会自动重试", requestId: safe ? error.requestId : undefined, sha: safe ? error.sha : undefined, version: safe ? error.version : undefined, idempotencyKey: safe ? error.idempotencyKey : undefined, containsCredentials: false })}\n`,
    );
    process.exitCode = 1;
  }
}
