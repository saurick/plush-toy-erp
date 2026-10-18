#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import {
  readGitlabTokenFromFile,
  resolveDevGitlabCredential,
} from "../../web/scripts/startWebDev.mjs";
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
export const GITLAB_RELEASE_KEYCHAIN = Object.freeze({
  service: "plush-toy-erp.gitlab-release-api",
  account: os.userInfo().username,
});

export class GitlabReleaseCLIError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GitlabReleaseCLIError";
    this.code = code;
  }
}
function reject(code, message) {
  throw new GitlabReleaseCLIError(code, message);
}
function normalizedToken(value) {
  const token = String(value || "").trim();
  if (token.length > 512 || /[\r\n\0]/u.test(token)) {
    reject("credential_invalid", "GitLab 发布凭据格式无效");
  }
  return token;
}
async function readReleaseKeychain() {
  const { stdout } = await execFileAsync(
    "security",
    [
      "find-generic-password",
      "-w",
      "-s",
      GITLAB_RELEASE_KEYCHAIN.service,
      "-a",
      GITLAB_RELEASE_KEYCHAIN.account,
    ],
    { encoding: "utf8", timeout: 5000, maxBuffer: 1024 },
  );
  return stdout;
}
export async function resolveGitlabReleaseCredential({
  env = process.env,
  platform = process.platform,
  readKeychain = readReleaseKeychain,
  readFile = readGitlabTokenFromFile,
} = {}) {
  const inherited = normalizedToken(env.PLUSH_GITLAB_TOKEN);
  if (inherited) return { source: "environment", token: inherited };
  if (env.PLUSH_GITLAB_TOKEN_FILE || platform === "linux") {
    try {
      const token = normalizedToken(
        await readFile({
          filePath:
            env.PLUSH_GITLAB_TOKEN_FILE ||
            path.join(
              os.homedir(),
              ".config",
              "plush-toy-erp",
              "gitlab-release-token",
            ),
        }),
      );
      return { source: token ? "file" : "missing", token };
    } catch {
      reject("credential_read_failed", "GitLab 发布凭据文件无法安全读取");
    }
  }
  if (platform !== "darwin") return { source: "missing", token: "" };
  try {
    const token = normalizedToken(await readKeychain());
    return { source: token ? "keychain" : "missing", token };
  } catch (error) {
    if (error instanceof GitlabReleaseCLIError) throw error;
    if (error?.code === 44) return { source: "missing", token: "" };
    reject("credential_read_failed", "GitLab 发布钥匙串无法读取");
  }
}

export async function verifyGitlabReleaseCredential(
  token,
  { request = fetch, now = () => new Date() } = {},
) {
  if (!normalizedToken(token)) {
    reject("credential_missing", "未配置独立的 GitLab 发布凭据");
  }
  const requestIds = new Set();
  const get = async (suffix) => {
    let response;
    try {
      response = await request(`${GITLAB_DELIVERY_BASE_URL}/api/v4${suffix}`, {
        headers: { "PRIVATE-TOKEN": token },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      reject("credential_check_unavailable", "GitLab 发布权限核对暂不可达");
    }
    const candidate = response.headers?.get("x-request-id");
    const requestId =
      typeof candidate === "string" &&
      candidate !== token &&
      /^[A-Za-z0-9_.:-]{8,128}$/u.test(candidate)
        ? candidate
        : undefined;
    if (requestId) requestIds.add(requestId);
    if (!response.ok) {
      const error = new GitlabReleaseCLIError(
        "credential_check_rejected",
        `GitLab 发布权限核对未通过（HTTP ${response.status}）`,
      );
      error.requestId = requestId;
      throw error;
    }
    try {
      return await response.json();
    } catch {
      reject("credential_response_invalid", "GitLab 发布权限响应格式无效");
    }
  };
  const projectPath = `/projects/${encodeURIComponent(GITLAB_DELIVERY_PROJECT)}`;
  const [self, project, branch, protection] = await Promise.all([
    get("/personal_access_tokens/self"),
    get(projectPath),
    get(`${projectPath}/repository/branches/main`),
    get(`${projectPath}/protected_branches/main`),
  ]);
  const tokens = await get(`${projectPath}/access_tokens?per_page=100`);
  const scoped =
    Array.isArray(tokens) && tokens.find((item) => item.id === self.id);
  const expiry = self.expires_at && Date.parse(`${self.expires_at}T00:00:00Z`);
  const variableRole = { developer: 30, maintainer: 40, owner: 50 }[
    project.ci_pipeline_variables_minimum_override_role
  ];
  const allowedOnMain = [
    ...(protection.push_access_levels || []),
    ...(protection.merge_access_levels || []),
  ].some((level) =>
    level.user_id != null
      ? level.user_id === self.user_id
      : level.group_id == null &&
        level.access_level > 0 &&
        scoped?.access_level >= level.access_level,
  );
  if (
    project.path_with_namespace !== GITLAB_DELIVERY_PROJECT ||
    project.default_branch !== "main" ||
    branch.name !== "main" ||
    branch.protected !== true ||
    !Number.isSafeInteger(self.id) ||
    self.id < 1 ||
    self.active !== true ||
    self.revoked !== false ||
    !Array.isArray(self.scopes) ||
    !self.scopes.includes("api") ||
    !scoped ||
    scoped.active !== true ||
    scoped.revoked !== false ||
    scoped.access_level !== 40 ||
    !variableRole ||
    scoped.access_level < variableRole ||
    !allowedOnMain ||
    !expiry ||
    !Number.isFinite(expiry) ||
    expiry <= now().getTime()
  ) {
    reject(
      "credential_scope_invalid",
      "发布凭据须为本项目有效、带到期日的 Maintainer API 凭据",
    );
  }
  return {
    status: "passed",
    project: GITLAB_DELIVERY_PROJECT,
    projectScoped: true,
    scope: "api",
    accessLevel: scoped.access_level,
    expiresAt: self.expires_at,
    protectedMain: true,
    containsCredentials: false,
    requestIds: [...requestIds],
  };
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
