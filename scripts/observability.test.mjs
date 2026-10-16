import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { composeArgs, observabilityHealth, provisionAlerts, provisionDashboard, provisionDatasources, registeredLogSources, renderAlloyConfig, renderDockgeCompose, supplementalLogSources, validateBindAddress, verifyTraceDatasources } from './observability.mjs'

const root = new URL('../', import.meta.url).pathname
const template = fs.readFileSync(new URL('../server/deploy/compose/prod/observability/alloy.alloy', import.meta.url), 'utf8')

test('Docker collection is derived from the registry and excludes unrelated container names', () => {
  const sources = registeredLogSources(root)
  const config = renderAlloyConfig(template, sources)
  const patterns = JSON.parse('[' + config.match(/name = "name"\s+values = \[([^\n]*)\]/u)[1] + ']').map((pattern) => new RegExp(pattern, 'u'))
  for (const source of sources) {
    for (const suffix of ['server', 'postgres', 'web-desktop', 'jaeger']) assert.ok(patterns.some((pattern) => pattern.test(source.project + '-' + suffix)))
    assert.ok(patterns.some((pattern) => pattern.test(source.publicPrefix + '1234abcd')))
    assert.ok(!patterns.some((pattern) => pattern.test(source.project + '-other-app')))
  }
  for (const name of ['plush-gitlab', 'development-postgres-133', 'grafana', 'plush-toy-erp-demo-web-public-invalid']) assert.ok(!patterns.some((pattern) => pattern.test(name)))
  assert.doesNotMatch(config, /@@/u)
  assert.match(renderAlloyConfig(template, []), /plush-observability-no-target/u)
})

test('Grafana binding requires loopback or an existing private local interface', () => {
  const interfaces = { eth0: [{ family: 'IPv4', address: '192.168.0.133' }, { family: 'IPv4', address: '203.0.113.5' }] }
  assert.equal(validateBindAddress('127.0.0.1', interfaces), '127.0.0.1')
  assert.equal(validateBindAddress('192.168.0.133', interfaces), '192.168.0.133')
  for (const address of ['0.0.0.0', '::', '203.0.113.5', '192.168.0.134']) assert.throws(() => validateBindAddress(address, interfaces))
})

test('supplemental collection matches exact host-bound dependencies and assigns each shared service once', () => {
  assert.deepEqual(supplementalLogSources(root, { hostname: 'another-host', includeTargets: true }), [])
  const local = supplementalLogSources(root, { hostname: 'r740xd' })
  assert.deepEqual(local.map((source) => source.name), ['development-postgres-133', 'development-jaeger-133', 'seaweedfs'])
  const extra = supplementalLogSources(root, { hostname: 'r740xd', includeTargets: true })
  const config = renderAlloyConfig(template, registeredLogSources(root), extra)
  const patterns = JSON.parse('[' + config.match(/name = "name"\s+values = \[([^\n]*)\]/u)[1] + ']').map((value) => new RegExp(value, 'u'))
  for (const source of extra) {
    assert(patterns.some((pattern) => pattern.test(source.name)))
    assert(!patterns.some((pattern) => pattern.test(source.name + '-other-app')))
    assert(config.includes(`replacement = "${source.service}"`))
  }
  assert.equal(extra.filter((source) => source.name === 'seaweedfs').length, 1)
  assert(config.includes('replacement = "shared-infra"'))
  assert.doesNotMatch(config, /@@/u)
})

test('status probes distinguish component failure and downtime from quiet log periods', async () => {
  const env = { LOKI_PORT: 3110, ALLOY_PORT: 12346, GRAFANA_BIND_ADDR: '127.0.0.1', GRAFANA_PORT: 3130 }
  const checks = await observabilityHealth(env, async (url) => ({ ok: !url.endsWith('/-/healthy') }))
  assert.deepEqual(checks, { loki: true, alloyReady: true, alloyHealthy: false, grafana: true })
  const down = await observabilityHealth(env, async () => { throw new Error('connection refused') })
  assert(Object.values(down).every((value) => value === false))
})

test('Alloy healthcheck detects component and downstream faults independently of log traffic', { timeout: 10_000 }, async (t) => {
  let failedPath = ''
  const server = http.createServer((request, response) => { response.writeHead(request.url === failedPath ? 503 : 200); response.end() })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const port = String(server.address().port)
  const run = () => new Promise((resolve, reject) => {
    const child = spawn('bash', [path.join(root, 'server/deploy/compose/prod/observability/alloy-healthcheck.sh')], {
      env: { ...process.env, ALLOY_HEALTH_PORT: port, LOKI_HEALTH_HOST: '127.0.0.1', LOKI_HEALTH_PORT: port, DOCKER_API_HEALTH_HOST: '127.0.0.1', DOCKER_API_HEALTH_PORT: port },
      stdio: 'ignore',
    })
    child.once('error', reject); child.once('close', (code) => resolve(code))
  })
  assert.equal(await run(), 0)
  for (const route of ['/-/healthy', '/ready', '/_ping']) { failedPath = route; assert.notEqual(await run(), 0) }
})

test('deployment collection requires the registered host identity', () => {
  const localIdentity = { platform: 'linux', hostname: 'r740xd', username: 'root', addresses: ['192.168.0.133'] }
  assert.equal(registeredLogSources(root, { requireLocal: true, localIdentity }).length, 2)
  for (const override of [{ hostname: 'another-host' }, { username: 'developer' }, { addresses: ['192.168.0.134'] }]) {
    assert.throws(() => registeredLogSources(root, { requireLocal: true, localIdentity: { ...localIdentity, ...override } }), /目标宿主机/u)
  }
})

test('Trace links use the corresponding environment and are omitted without a reachable Jaeger', () => {
  const result = provisionDatasources(['local-dev', 'demo-133'], { 'local-dev': { name: 'local-jaeger' } })
  const local = result.datasources.find((source) => source.uid === 'plush-logs-local-dev')
  assert.equal(local.jsonData.derivedFields[0].datasourceUid, 'plush-traces-local-dev')
  assert.equal(local.jsonData.derivedFields[0].url, '$${__value.raw}')
  assert.equal(result.datasources.find((source) => source.uid === 'plush-traces-local-dev').url, 'http://local-jaeger:16686')
  assert.deepEqual(result.datasources.find((source) => source.uid === 'plush-logs-demo-133').jsonData.derivedFields, [])
})

test('Trace readiness checks the plugin response and does not accept a reachable but broken datasource', async () => {
  const env = { GRAFANA_ADMIN_USER: 'admin', GRAFANA_ADMIN_PASSWORD: 'test-private-password', GRAFANA_BIND_ADDR: '127.0.0.1', GRAFANA_PORT: '3130' }
  const config = provisionDatasources(['local-dev', 'demo-133'], { 'local-dev': { name: 'local-jaeger' }, 'demo-133': { name: 'demo-jaeger' } })
  const calls = []
  await verifyTraceDatasources(env, config, async (url, options) => {
    calls.push(url)
    assert.ok(options.headers.Authorization.startsWith('Basic '))
    return { ok: true, json: async () => ({ status: 'OK' }) }
  })
  assert.equal(calls.length, 2)
  assert.ok(calls.every((url) => url.endsWith('/health')))
  for (const response of [{ ok: false, json: async () => ({ message: 'test-private-password' }) }, { ok: true, json: async () => ({ status: 'ERROR' }) }]) {
    await assert.rejects(verifyTraceDatasources(env, config, async () => response), (error) => {
      assert.match(error.message, /ERP traces local-dev/u)
      assert.doesNotMatch(error.message, /test-private-password/u)
      return true
    })
  }
  await assert.rejects(verifyTraceDatasources(env, config, async () => { throw new Error('test-private-password') }), /Trace 数据源不可用/u)
})

test('dashboard environment selection survives idle log windows and follows configured collection scope', () => {
  const template = JSON.parse(fs.readFileSync(new URL('../server/deploy/compose/prod/observability/dashboards/erp-logs.json', import.meta.url), 'utf8'))
  for (const environments of [['local-dev'], ['local-dev', 'demo-133', 'customer-test-133']]) {
    const dashboard = provisionDashboard(template, environments)
    const variable = dashboard.templating.list.find((item) => item.name === 'environment')
    assert.equal(variable.type, 'custom')
    assert.equal(variable.datasource, undefined)
    assert.deepEqual(variable.options.map((option) => option.value), environments)
    assert.equal(variable.current.value, 'local-dev')
    assert.deepEqual(dashboard.panels, template.panels)
    assert.deepEqual(dashboard.templating.list.filter((item) => item.name !== 'environment'), template.templating.list.filter((item) => item.name !== 'environment'))
  }
  assert.equal(template.templating.list.find((item) => item.name === 'environment').type, 'query')
  assert.throws(() => provisionDashboard(template, []), /已配置/u)
})

test('alerts classify system failures, handle idle periods and mute external delivery until configured', () => {
  const config = provisionAlerts(), rule = config.groups[0].rules[0]
  assert.match(rule.data[0].model.expr, /outcome="error"/u)
  assert.equal(rule.noDataState, 'OK')
  assert.equal(rule.execErrState, 'Error')
  assert.equal(rule.for, '2m')
  assert.equal(rule.data[2].model.conditions[0].evaluator.params[0], 2)
  const rules = config.groups[0].rules
  assert.equal(rules.length, 3)
  assert.match(rules[1].data[0].model.expr, /dependency_outcome="error"/u)
  assert.match(rules[2].data[0].model.expr, /outcome="".*dependency_outcome="".*msg!="request panic recovered"/u)
  assert(rules.every((item) => item.noDataState === 'OK' && item.execErrState === 'Error'))
  assert.deepEqual(config.policies[0].routes[0].mute_time_intervals, [config.muteTimes[0].name])
})

test('Dockge adoption retains the project, log mounts and existing volumes without writing the password to Compose', () => {
  const project = 'plush-erp-observability-local'
  const source = { name: project, services: { grafana: { environment: { GF_SECURITY_ADMIN_PASSWORD: 'test-only-password', GF_SECURITY_ADMIN_USER: 'admin' } }, alloy: { volumes: [{ source: '/test/logs', target: '/logs/backend' }] } }, volumes: { 'loki-data': { name: `${project}_loki-data` } }, networks: { default: { name: `${project}_default` } } }
  const result = renderDockgeCompose(source)
  assert.equal(result.name, project)
  assert.deepEqual(result.volumes['loki-data'], { external: true, name: `${project}_loki-data` })
  assert.deepEqual(result.services.alloy.volumes, source.services.alloy.volumes)
  assert.deepEqual(result.networks, source.networks)
  assert.doesNotMatch(JSON.stringify(result), /test-only-password/u)
  assert.equal(source.services.grafana.environment.GF_SECURITY_ADMIN_PASSWORD, 'test-only-password')
  assert.throws(() => renderDockgeCompose({ ...source, name: 'another-project' }), /身份/u)
  assert.throws(() => renderDockgeCompose({ ...source, volumes: { 'loki-data': { name: 'another-volume' } } }), /身份/u)
})

test('lifecycle uses the adopted Compose and credential source and retains the standalone entry otherwise', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'observability-compose-'))
  try {
    const runtime = path.join(temporary, 'output/dev-workbench/observability')
    fs.mkdirSync(runtime, { recursive: true })
    const env = path.join(runtime, '.env')
    fs.writeFileSync(env, 'OBS_STACK_DIR=/test/stacks/plush-erp-observability-local\n')
    assert.deepEqual(composeArgs(temporary).slice(-4), ['--env-file', '/test/stacks/plush-erp-observability-local/.env', '-f', '/test/stacks/plush-erp-observability-local/compose.yaml'])
    fs.writeFileSync(env, '')
    assert.ok(composeArgs(temporary).includes(path.join(temporary, 'server/deploy/compose/prod/compose.observability.yml')))
  } finally { fs.rmSync(temporary, { recursive: true, force: true }) }
})
