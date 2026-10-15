const RELEASE_VERSION_PATTERN =
  /^[0-9A-Za-z](?:[0-9A-Za-z._-]{0,62}[0-9A-Za-z])?$/u
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/u

function normalizeReleaseVersion(value, { allowLocal = true } = {}) {
  const normalized = String(value || '').trim()
  if (allowLocal && normalized === 'local') return normalized
  return RELEASE_VERSION_PATTERN.test(normalized) ? normalized : ''
}

function normalizeGitSHA(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return GIT_SHA_PATTERN.test(normalized) ? normalized : ''
}

function identity(source, releaseVersion, gitSHA) {
  const normalizedVersion = normalizeReleaseVersion(releaseVersion)
  const normalizedSHA = normalizeGitSHA(gitSHA)
  return Object.freeze({
    source,
    releaseVersion: normalizedVersion,
    gitSHA: normalizedSHA,
    gitSHAShort: normalizedSHA.slice(0, 8),
    local: normalizedVersion === 'local',
    formal:
      normalizedVersion !== '' &&
      normalizedVersion !== 'local' &&
      normalizedSHA !== '',
  })
}

export function readEmbeddedBuildIdentity(env = import.meta.env || {}) {
  const releaseVersion = String(env?.VITE_RELEASE_VERSION || '').trim()
  const gitSHA = String(env?.VITE_GIT_SHA || '').trim()
  if (!releaseVersion && !gitSHA && env?.DEV === true) {
    return identity('web', 'local', '')
  }
  return identity('web', releaseVersion, gitSHA)
}

export function parseServerBuildIdentity(result) {
  const resultData =
    result?.data &&
    typeof result.data === 'object' &&
    !Array.isArray(result.data)
      ? result.data
      : result?.version &&
          typeof result.version === 'object' &&
          !Array.isArray(result.version)
        ? result.version
        : result
  return identity(
    'server',
    resultData?.release_version || resultData?.version,
    resultData?.git_sha
  )
}

export function formatReleaseVersion(value) {
  if (value === 'local') return '本地开发'
  return value || '未标记'
}

export function formatBuildCode(buildIdentity) {
  return buildIdentity?.gitSHAShort || '未标记'
}

export function compareBuildIdentities({
  web,
  server,
  loading = false,
  unavailable = false,
} = {}) {
  const systemVersion = formatReleaseVersion(
    web?.releaseVersion || server?.releaseVersion
  )
  if (loading) {
    return Object.freeze({
      key: 'loading',
      tone: 'processing',
      label: '正在核对版本',
      description: '正在读取服务端构建信息。',
      systemVersion,
    })
  }
  if (unavailable || !server) {
    return Object.freeze({
      key: 'unavailable',
      tone: 'warning',
      label: '后端版本暂不可用',
      description: '当前仍可继续使用；反馈问题时请稍后重试版本核对。',
      systemVersion,
    })
  }
  if (web?.local || server.local) {
    return Object.freeze({
      key: 'local',
      tone: 'default',
      label: '本地开发版本',
      description: '本地开发未绑定正式发布版本，不作为发布或部署证据。',
      systemVersion: '本地开发',
    })
  }
  if (!web?.formal || !server.formal) {
    return Object.freeze({
      key: 'incomplete',
      tone: 'warning',
      label: '版本信息不完整',
      description:
        '当前构建未同时绑定发布版本和 Git 构建号，请勿据此判断已发布版本。',
      systemVersion,
    })
  }
  if (
    web.releaseVersion !== server.releaseVersion ||
    web.gitSHA !== server.gitSHA
  ) {
    return Object.freeze({
      key: 'mismatch',
      tone: 'error',
      label: '前后台版本不一致',
      description:
        '网页与服务端不是同一次构建，建议刷新；仍不一致时请联系维护人员。',
      systemVersion: '需核对',
    })
  }
  return Object.freeze({
    key: 'matched',
    tone: 'success',
    label: '前后台版本一致',
    description: '网页与服务端来自同一个发布版本和 Git 构建号。',
    systemVersion,
  })
}

export function buildIdentitySupportText({ web, server, status }) {
  return [
    `系统版本: ${status?.systemVersion || '未标记'}`,
    `网页版本: ${formatReleaseVersion(web?.releaseVersion)}`,
    `网页构建: ${web?.gitSHA || '未标记'}`,
    `服务版本: ${formatReleaseVersion(server?.releaseVersion)}`,
    `服务构建: ${server?.gitSHA || '未标记'}`,
    `核对状态: ${status?.label || '未核对'}`,
  ].join('\n')
}
