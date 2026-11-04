import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { readGitlabTokenFromFile } from "../../web/scripts/startWebDev.mjs";
import {
  GITLAB_DELIVERY_BASE_URL,
  GITLAB_DELIVERY_PROJECT,
} from "./gitlab-delivery-provider.mjs";

const execFileAsync = promisify(execFile);
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
