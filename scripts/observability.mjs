#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'
import { loadDeploymentTargetRegistry } from './deploy/deployment-targets.mjs'
import { resolveTargetReadOnlyExecution } from './deploy/target-readonly-execution.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const COMPOSE = 'server/deploy/compose/prod/compose.observability.yml'
const CONFIG = 'server/deploy/compose/prod/observability'
const RUNTIME = 'output/dev-workbench/observability'
const PROJECT = 'plush-erp-observability-local'

function docker(args, options = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 120_000, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, ...options })
  if (result.error || result.status !== 0) throw new Error(`Docker 操作失败：${args.slice(0, 2).join(' ')}；请检查上方诊断`)
  return result.stdout
}

export function registeredLogSources(root, { requireLocal = false, localIdentity } = {}) {
  const registry = loadDeploymentTargetRegistry(path.join(root, 'scripts/deploy/deployment-targets.json'))
  const targets = registry.targets.filter((target) => target.enabled)
  if (requireLocal) {
    for (const target of targets) {
      if (resolveTargetReadOnlyExecution(target.key, { localIdentity }).transport !== 'local execution') {
        throw new Error(`--include-targets 只能在 registry 登记的目标宿主机采集：${target.key}`)
      }
    }
  }
  return targets.map((target) => ({
    environment: target.key,
    project: target.compose.projectName,
    publicPrefix: target.publicEntry.containerPrefix,
    jaegerContainer: `${target.compose.projectName}-jaeger`,
  }))
}

export function supplementalLogSources(root, { includeTargets = false, hostname = os.hostname() } = {}) {
  const config = JSON.parse(fs.readFileSync(path.join(root, CONFIG, 'sources.json'), 'utf8'))
  if (config.host !== hostname) return []
  const environments = new Set(['local-dev', 'shared-infra', ...(includeTargets ? registeredLogSources(root).map((source) => source.environment) : [])])
  return config.containers.filter((source) => environments.has(source.environment)).map((source) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(source.name) || !/^[a-z][a-z0-9-]{0,63}$/u.test(source.service)) throw new Error('补充日志来源必须使用明确容器名和服务标识')
    return source
  })
}

export function renderAlloyConfig(template, sources, supplemental = []) {
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const patterns = sources.map(({ project, publicPrefix }) => `(${escape(project)}-(server|web-desktop|postgres|jaeger)|${escape(publicPrefix)}[0-9a-f]{8})`)
  const rules = sources.map((source, index) => `  rule {\n    source_labels = ["__meta_docker_container_name"]\n    regex = ${JSON.stringify('/' + patterns[index])}\n    target_label = "environment"\n    replacement = ${JSON.stringify(source.environment)}\n  }`).join('\n')
  const extraRules = (label) => supplemental.map((source) => `  rule {\n    source_labels = ["__meta_docker_container_name"]\n    regex = ${JSON.stringify('/' + escape(source.name))}\n    target_label = ${JSON.stringify(label)}\n    replacement = ${JSON.stringify(source[label])}\n  }`).join('\n')
  patterns.push(...supplemental.map((source) => escape(source.name)))
  return template.replace('@@CONTAINER_FILTERS@@', (patterns.length ? patterns : ['^plush-observability-no-target$']).map((pattern) => JSON.stringify(`^/?${pattern}$`)).join(', ')).replace('@@TARGET_RULES@@', rules + '\n' + extraRules('environment')).replace('@@SUPPLEMENTAL_SERVICES@@', extraRules('service'))
}

export function validateBindAddress(address, interfaces = os.networkInterfaces()) {
  if (address === '127.0.0.1') return address
  const local = Object.values(interfaces).flat().some((entry) => entry?.family === 'IPv4' && entry.address === address)
  const privateAddress = /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/u.test(address)
  if (!local || !privateAddress) throw new Error('Grafana 只允许绑定 loopback 或本机明确的私网 IPv4 地址')
  return address
}

function inspectContainer(name) {
  const result = spawnSync('docker', ['inspect', name], { encoding: 'utf8', timeout: 5000 })
  if (result.status !== 0) return null
  const container = JSON.parse(result.stdout)[0]
  if (container.State.Status !== 'running') return null
  return { name: container.Name.slice(1), networks: Object.keys(container.NetworkSettings.Networks), ports: container.NetworkSettings.Ports }
}

function localJaeger() {
  const result = spawnSync('docker', ['ps', '--filter', 'publish=16686', '--format', '{{.Names}}'], { encoding: 'utf8', timeout: 5000 })
  if (result.status !== 0) return null
  return result.stdout.trim().split('\n').filter(Boolean).map(inspectContainer).find((container) => container?.ports['16686/tcp']?.some((port) => port.HostPort === '16686')) || null
}

export function provisionDatasources(environments, jaegers) {
  const datasources = []
  for (const environment of environments) {
    const jaeger = jaegers[environment]
    datasources.push({
      name: `ERP logs ${environment}`, uid: `plush-logs-${environment}`, type: 'loki', access: 'proxy', url: 'http://loki:3100', editable: false,
      isDefault: environment === 'local-dev',
      jsonData: {
        maxLines: 1000,
        // Provisioning 先展开环境变量；双 $ 保留 Grafana 的运行时字段表达式。
        derivedFields: jaeger ? [{ name: 'Trace', matcherRegex: '"trace_link_id"\\s*:\\s*"([0-9a-f]{32})"', datasourceUid: `plush-traces-${environment}`, url: '$${__value.raw}' }] : [],
      },
    })
    if (jaeger) datasources.push({ name: `ERP traces ${environment}`, uid: `plush-traces-${environment}`, type: 'jaeger', access: 'proxy', url: `http://${jaeger.name}:16686`, editable: false })
  }
  return { apiVersion: 1, prune: true, datasources }
}

export function provisionDashboard(template, environments) {
  const dashboard = structuredClone(template)
  const variable = dashboard.templating?.list.find((item) => item.name === 'environment')
  if (!variable || environments.length === 0) throw new Error('日志看板缺少已配置的环境')
  // 环境来自采集配置；空闲时间窗口不能清空环境和对应的数据源。
  delete variable.datasource
  Object.assign(variable, {
    type: 'custom', query: environments.join(','), refresh: 0,
    current: { text: environments[0], value: environments[0] },
    options: environments.map((environment, index) => ({ text: environment, value: environment, selected: index === 0 })),
  })
  return dashboard
}

export function provisionAlerts() {
  const signals = [
    { uid: 'plush-system-errors', title: 'ERP 系统错误持续出现', filter: 'outcome="error"', summary: '系统错误事件' },
    { uid: 'plush-dependency-errors', title: 'ERP 依赖调用持续失败', filter: 'dependency_outcome="error"', summary: '依赖调用失败' },
    { uid: 'plush-unclassified-errors', title: 'ERP 未归类错误持续出现', filter: 'level=~"(?i)error|fatal" | outcome="" | dependency_outcome="" | msg!="request panic recovered"', summary: '未归类 ERROR 日志' },
  ]
  const rules = signals.map(({ uid, title, filter, summary }) => ({
    uid, title, condition: 'C', for: '2m', noDataState: 'OK', execErrState: 'Error',
    labels: { severity: 'warning' }, annotations: {
      summary: `{{ $labels.environment }} / {{ $labels.service }} 最近五分钟持续出现${summary}`,
      description: '按时间和 request_id 查询日志。数值为该类事件或日志条数；业务拒绝不触发，依赖诊断不代表独立的失败请求。',
    },
    data: [
      { refId: 'A', relativeTimeRange: { from: 300, to: 0 }, datasourceUid: 'plush-logs-local-dev', model: { refId: 'A', datasource: { type: 'loki', uid: 'plush-logs-local-dev' }, expr: `sum by (environment, service) (count_over_time({environment=~".+"} | json | __error__="" | ${filter} [5m]))`, queryType: 'instant', instant: true, intervalMs: 1000, maxDataPoints: 1000 } },
      { refId: 'B', relativeTimeRange: { from: 0, to: 0 }, datasourceUid: '__expr__', model: { refId: 'B', type: 'reduce', expression: 'A', reducer: 'last', datasource: { type: '__expr__', uid: '__expr__' }, conditions: [] } },
      { refId: 'C', relativeTimeRange: { from: 0, to: 0 }, datasourceUid: '__expr__', model: { refId: 'C', type: 'threshold', expression: 'B', datasource: { type: '__expr__', uid: '__expr__' }, conditions: [{ evaluator: { type: 'gt', params: [2] }, operator: { type: 'and' }, reducer: { type: 'last', params: [] }, type: 'query' }] } },
    ],
  }))
  return {
    apiVersion: 1,
    groups: [{ orgId: 1, name: 'ERP logs', folder: 'ERP observability', interval: '1m', rules }],
    // 初始规则保留评估状态；通知渠道由操作者配置后再解除此静默窗口。
    contactPoints: [{ orgId: 1, name: 'plush-notifications-disabled', receivers: [{ uid: 'plush-notifications-disabled', type: 'email', settings: { addresses: 'notifications-disabled@localhost' }, disableResolveMessage: false }] }],
    muteTimes: [{ orgId: 1, name: 'plush-no-external-notifications', time_intervals: [{ times: [{ start_time: '00:00', end_time: '24:00' }] }] }],
    policies: [{ orgId: 1, receiver: 'plush-notifications-disabled', group_by: ['grafana_folder', 'alertname', 'environment', 'service'], group_wait: '30s', group_interval: '5m', repeat_interval: '4h', routes: [{ receiver: 'plush-notifications-disabled', object_matchers: [['alertname', '=~', '.*']], mute_time_intervals: ['plush-no-external-notifications'] }] }],
  }
}

function writeConfig(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o755 })
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { mode: 0o644 })
}

export function renderDockgeCompose(config) {
  const result = structuredClone(config)
  if (result.name !== PROJECT) throw new Error('Dockge 日志堆栈的 project 身份不一致')
  result.services.grafana.environment.GF_SECURITY_ADMIN_PASSWORD = '${GRAFANA_ADMIN_PASSWORD:?GRAFANA_ADMIN_PASSWORD is required}'
  result.services.grafana.environment.GF_SECURITY_ADMIN_USER = '${GRAFANA_ADMIN_USER:-admin}'
  for (const [key, volume] of Object.entries(result.volumes || {})) {
    if (volume.name !== `${PROJECT}_${key}`) throw new Error('日志数据 volume 身份不一致')
    result.volumes[key] = { external: true, name: volume.name }
  }
  return result
}

function sourceComposeArgs(root) {
  const runtime = path.join(root, RUNTIME)
  return ['compose', '--project-name', PROJECT, '--env-file', path.join(runtime, '.env'), '-f', path.join(root, COMPOSE), '-f', path.join(runtime, 'networks.json')]
}

function validateDockgeDirectory(directory, envFile) {
  if (!path.isAbsolute(directory) || path.basename(directory) !== PROJECT) throw new Error(`Dockge 目录须为绝对路径且以 ${PROJECT} 命名`)
  const target = path.join(directory, '.env')
  if (fs.existsSync(target) && (!fs.existsSync(envFile) || fs.realpathSync(target) !== fs.realpathSync(envFile))) throw new Error('Dockge 目录已有独立凭据；保留现场，拒绝覆盖')
  const composeFile = path.join(directory, 'compose.yaml')
  if (fs.existsSync(composeFile) && JSON.parse(fs.readFileSync(composeFile, 'utf8')).name !== PROJECT) throw new Error('Dockge 目录已有其他堆栈；拒绝覆盖')
}

function prepareDockgeStack(root, directory, envFile) {
  const config = renderDockgeCompose(JSON.parse(docker([...sourceComposeArgs(root), 'config', '--format', 'json'])))
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  writeConfig(path.join(directory, 'compose.yaml'), config)
  const target = path.join(directory, '.env')
  if (!fs.existsSync(target)) {
    fs.copyFileSync(envFile, target, fs.constants.COPYFILE_EXCL)
    fs.chmodSync(target, 0o600)
    fs.unlinkSync(envFile)
    fs.symlinkSync(target, envFile)
  }
}

export function prepareObservability(root, { includeTargets = false, bindAddress, dockgeDir } = {}) {
  const runtime = path.join(root, RUNTIME)
  fs.mkdirSync(runtime, { recursive: true, mode: 0o700 })
  const envFile = path.join(runtime, '.env')
  const previous = fs.existsSync(envFile) ? readRuntimeEnv(envFile) : {}
  const stackDirectory = dockgeDir || previous.OBS_STACK_DIR
  if (stackDirectory) validateDockgeDirectory(stackDirectory, envFile)
  const address = validateBindAddress(bindAddress || previous.GRAFANA_BIND_ADDR || '127.0.0.1')
  const sources = includeTargets ? registeredLogSources(root, { requireLocal: true }) : []
  const supplemental = supplementalLogSources(root, { includeTargets })
  const environments = [...new Set(['local-dev', ...sources.map((source) => source.environment), ...supplemental.map((source) => source.environment)])]
  const jaegers = { 'local-dev': localJaeger() }
  for (const source of sources) jaegers[source.environment] = inspectContainer(source.jaegerContainer)
  const networks = {}
  const grafanaNetworks = { default: {} }
  for (const [environment, container] of Object.entries(jaegers)) {
    if (!container?.networks.length) continue
    const key = 'trace-' + environment
    networks[key] = { external: true, name: container.networks[0] }
    grafanaNetworks[key] = {}
  }
  for (const directory of ['output/dev-workbench/database-migration-runtime', 'output/dev-workbench/web-logs']) fs.mkdirSync(path.join(root, directory), { recursive: true, mode: 0o700 })
  const template = fs.readFileSync(path.join(root, CONFIG, 'alloy.alloy'), 'utf8')
  writeConfig(path.join(runtime, 'alloy.alloy'), renderAlloyConfig(template, sources, supplemental))
  writeConfig(path.join(runtime, 'alloy-healthcheck.sh'), fs.readFileSync(path.join(root, CONFIG, 'alloy-healthcheck.sh'), 'utf8'))
  writeConfig(path.join(runtime, 'networks.json'), { services: { grafana: { networks: grafanaNetworks } }, networks })
  // Grafana 的 datasource/dashboard loader 按 YAML 扩展名发现文件；JSON 内容是有效 YAML。
  writeConfig(path.join(runtime, 'provisioning/datasources/erp.yaml'), provisionDatasources(environments, jaegers))
  const dashboard = JSON.parse(fs.readFileSync(path.join(root, CONFIG, 'dashboards/erp-logs.json'), 'utf8'))
  writeConfig(path.join(runtime, 'dashboards/erp-logs.json'), provisionDashboard(dashboard, environments))
  writeConfig(path.join(runtime, 'provisioning/alerting/erp.yaml'), provisionAlerts())
  fs.mkdirSync(path.join(runtime, 'provisioning/plugins'), { recursive: true, mode: 0o755 })
  writeConfig(path.join(runtime, 'provisioning/dashboards/erp.yaml'), { apiVersion: 1, providers: [{ name: 'ERP observability', orgId: 1, folder: 'ERP observability', type: 'file', disableDeletion: false, allowUiUpdates: false, options: { path: '/var/lib/grafana/dashboards' } }] })
  const env = {
    OBS_RUNTIME_DIR: runtime, OBS_HOST: os.hostname(), ALLOY_UID: String(os.userInfo().uid),
    LOCAL_BACKEND_LOG_DIR: path.join(root, 'output/dev-workbench/database-migration-runtime'),
    LOCAL_WEB_LOG_DIR: path.join(root, 'output/dev-workbench/web-logs'),
    GRAFANA_ADMIN_USER: previous.GRAFANA_ADMIN_USER || 'admin',
    GRAFANA_ADMIN_PASSWORD: previous.GRAFANA_ADMIN_PASSWORD || randomBytes(24).toString('base64url'),
    GRAFANA_BIND_ADDR: address, GRAFANA_PORT: previous.GRAFANA_PORT || '3130',
    LOKI_PORT: previous.LOKI_PORT || '3110', ALLOY_PORT: previous.ALLOY_PORT || '12346',
    LOKI_RETENTION: previous.LOKI_RETENTION || '168h',
    OBS_NETWORK_SUBNET: previous.OBS_NETWORK_SUBNET || '10.254.240.0/28',
    OBS_DOCKER_SUBNET: previous.OBS_DOCKER_SUBNET || '10.254.240.16/28',
    GRAFANA_ROOT_URL: previous.GRAFANA_ROOT_URL || 'http://localhost:3000/',
    GRAFANA_COOKIE_SECURE: previous.GRAFANA_COOKIE_SECURE || 'false',
    GRAFANA_ALLOWED_ORIGINS: previous.GRAFANA_ALLOWED_ORIGINS || '',
    ...(stackDirectory ? { OBS_STACK_DIR: stackDirectory } : {}),
  }
  fs.writeFileSync(envFile, Object.entries(env).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 })
  fs.chmodSync(envFile, 0o600)
  writeConfig(path.join(runtime, 'scope.json'), { environments, includeTargets, supplemental, jaegerEnvironments: Object.entries(jaegers).filter(([, value]) => value).map(([key]) => key) })
  if (stackDirectory) prepareDockgeStack(root, stackDirectory, envFile)
  return { runtime, env, environments }
}

function readRuntimeEnv(file) {
  return parseEnv(fs.readFileSync(file, 'utf8'))
}

export async function verifyTraceDatasources(env, config, fetcher = fetch) {
  const authorization = 'Basic ' + Buffer.from(`${env.GRAFANA_ADMIN_USER}:${env.GRAFANA_ADMIN_PASSWORD}`).toString('base64')
  for (const source of config.datasources.filter((source) => source.type === 'jaeger')) {
    const url = `http://${env.GRAFANA_BIND_ADDR}:${env.GRAFANA_PORT}/api/datasources/uid/${encodeURIComponent(source.uid)}/health`
    let healthy = false
    try {
      const response = await fetcher(url, { headers: { Authorization: authorization }, signal: AbortSignal.timeout(5000) })
      healthy = response.ok && (await response.json()).status === 'OK'
    } catch { /* Only the controlled datasource identity belongs in diagnostics. */ }
    if (!healthy) throw new Error(`Trace 数据源不可用：${source.name}；核对 Jaeger v3 接口与 Grafana 原生插件配置`)
  }
}

export function composeArgs(root) {
  const runtime = path.join(root, RUNTIME)
  const env = readRuntimeEnv(path.join(runtime, '.env'))
  return env.OBS_STACK_DIR
    ? ['compose', '--project-name', PROJECT, '--env-file', path.join(env.OBS_STACK_DIR, '.env'), '-f', path.join(env.OBS_STACK_DIR, 'compose.yaml')]
    : sourceComposeArgs(root)
}

export async function observabilityHealth(env, fetcher = fetch) {
  const endpoints = {
    loki: `http://127.0.0.1:${env.LOKI_PORT}/ready`,
    alloyReady: `http://127.0.0.1:${env.ALLOY_PORT}/-/ready`,
    alloyHealthy: `http://127.0.0.1:${env.ALLOY_PORT}/-/healthy`,
    grafana: `http://${env.GRAFANA_BIND_ADDR}:${env.GRAFANA_PORT}/api/health`,
  }
  return Object.fromEntries(await Promise.all(Object.entries(endpoints).map(async ([name, url]) => {
    try { return [name, (await fetcher(url, { signal: AbortSignal.timeout(2000) })).ok] } catch { return [name, false] }
  })))
}

async function waitForReadiness(env) {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    const checks = await observabilityHealth(env)
    if (Object.values(checks).every(Boolean)) { console.log('Loki / Alloy / Grafana 就绪与组件健康检查通过'); return }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error('日志工作台就绪检查超时；保留容器与数据供诊断，请运行 --status')
}

async function main(argv) {
  const allowed = new Set(['--prepare', '--start', '--stop', '--status', '--include-targets', '--bind-address', '--dockge-dir', '--help'])
  let address, dockgeDir
  const actions = []
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (!allowed.has(argument)) throw new Error('不支持的日志工作台参数')
    if (argument === '--bind-address' || argument === '--dockge-dir') {
      const value = argv[++index]
      if (!value || value.startsWith('--')) throw new Error(`${argument} 缺少参数值`)
      if (argument === '--bind-address') address = value
      else dockgeDir = value
    }
    else if (['--prepare', '--start', '--stop', '--status'].includes(argument)) actions.push(argument)
  }
  if (argv.includes('--help') || actions.length === 0) {
    console.log('Usage: node scripts/observability.mjs --prepare|--start|--stop|--status [--include-targets] [--bind-address <local-private-ip>] [--dockge-dir <absolute-stack-directory>]\n默认采集当前工作区本地日志与主机登记的本地/共享依赖；--include-targets 追加 registry 中的 ERP 容器与已登记 Web FRPC 日志。停止保留日志、位置和 Grafana 数据。')
    return
  }
  if (actions.length !== 1) throw new Error('每次仅执行一个日志工作台动作')
  const action = actions[0]
  if (action === '--prepare' || action === '--start') {
    const previousScope = path.join(ROOT, RUNTIME, 'scope.json')
    const includeTargets = argv.includes('--include-targets') || (fs.existsSync(previousScope) && JSON.parse(fs.readFileSync(previousScope, 'utf8')).includeTargets)
    const prepared = prepareObservability(ROOT, { includeTargets, bindAddress: address, dockgeDir })
    console.log(`日志环境：${prepared.environments.join(', ')}；Grafana：http://${prepared.env.GRAFANA_BIND_ADDR}:${prepared.env.GRAFANA_PORT}`)
    console.log('管理员凭据保存在当前工作区 output/dev-workbench/observability/.env（0600）；命令输出不显示密码。')
    if (action === '--prepare') return
    const base = composeArgs(ROOT)
    docker([...base, 'config', '--quiet'], { stdio: 'inherit' })
    const images = docker([...base, 'config', '--images']).trim().split('\n')
    const available = spawnSync('docker', ['image', 'inspect', ...images], { stdio: 'ignore', timeout: 15_000 })
    if (available.status !== 0) throw new Error('固定观测镜像尚未预置；请按集中日志运维文档拉取镜像后再启动')
    docker([...base, 'run', '--rm', '--no-deps', 'loki', '-config.file=/etc/loki/config.yml', '-config.expand-env=true', '-verify-config=true'], { stdio: 'inherit' })
    docker([...base, 'run', '--rm', '--no-deps', 'alloy', 'validate', '/etc/alloy/config.alloy'], { stdio: 'inherit' })
    docker([...base, 'up', '-d', '--force-recreate', '--pull', 'never'], { stdio: 'inherit' })
    await waitForReadiness(prepared.env)
    await verifyTraceDatasources(prepared.env, JSON.parse(fs.readFileSync(path.join(prepared.runtime, 'provisioning/datasources/erp.yaml'), 'utf8')))
    console.log('已配置的 Trace 数据源检查通过')
  } else {
    if (!fs.existsSync(path.join(ROOT, RUNTIME, '.env'))) throw new Error('当前工作区尚未准备日志工作台')
    docker([...composeArgs(ROOT), action === '--stop' ? 'down' : 'ps'], { stdio: 'inherit' })
    if (action === '--status') {
      const checks = await observabilityHealth(readRuntimeEnv(path.join(ROOT, RUNTIME, '.env')))
      console.log(JSON.stringify({ health: checks }))
      if (!Object.values(checks).every(Boolean)) throw new Error('日志链路健康检查未通过；请检查采集组件和下游服务')
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1 })
}
