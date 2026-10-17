import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { validateSkillRoot } from '../../scripts/qa/skill-health.mjs'
import {
  createDevProjectSkillsPlugin,
  readProjectSkills,
} from './devProjectSkillsPlugin.mjs'

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plush-project-skills-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), content)
  }
  write(
    '.agents/skills/README.md',
    '| Skill | 适用范围 |\n| --- | --- |\n| `$plush-one` | 页面与布局 |\n| `$plush-two` | 测试判断 |\n'
  )
  write('docs/guide.md', '# Guide\n\n## Evidence\n')
  for (const name of ['plush-one', 'plush-two']) {
    write(
      `.agents/skills/${name}/SKILL.md`,
      `---\nname: ${name}\ndescription: 页面治理。Use for page changes.\n---\n# Skill\n`
    )
    write(
      `.agents/skills/${name}/agents/openai.yaml`,
      `interface:\n  display_name: "Example Skill"\n  short_description: "Inspect project task boundaries and evidence"\n  default_prompt: "Use $${name} to inspect this task."\n`
    )
  }
  return { root, write }
}

test('projects source metadata, task index and real references without treating code samples as routing', (t) => {
  const { root } = fixture(t)
  fs.appendFileSync(
    path.join(root, '.agents/skills/plush-one/SKILL.md'),
    '\n按需使用 $plush-two。\n[依据](../../../docs/guide.md#evidence)\n[External](https://example.com)\n```md\n$plush-one $plush-example\n[Example](missing.md)\n```\n'
  )
  const data = readProjectSkills(root)
  assert.equal(data.health.status, 'ok')
  assert.equal(data.skills.length, 2)
  assert(!Number.isNaN(Date.parse(data.checkedAt)))
  assert.equal(data.source, '.agents/skills')
  const skill = data.skills[0]
  assert.equal(skill.title, '页面治理')
  assert.equal(skill.scope, '页面与布局')
  assert.deepEqual(skill.relatedSkills, ['plush-two'])
  assert.deepEqual(skill.references, [
    { path: 'docs/guide.md', headingId: 'evidence' },
  ])
  assert(!JSON.stringify(data).includes(root))
})

test('keeps invalid and missing entries visible, using exactly the existing health diagnostics', (t) => {
  const { root, write } = fixture(t)
  write(
    '.agents/skills/plush-one/agents/openai.yaml',
    'interface:\n  display_name: [invalid]\n'
  )
  fs.appendFileSync(
    path.join(root, '.agents/skills/plush-one/SKILL.md'),
    '\n[失效依据](missing.md)\n'
  )
  const data = readProjectSkills(root)
  assert.equal(data.health.status, 'failed')
  assert.equal(data.skills.length, 2)
  assert(data.skills[0].issues.length > 0)
  assert.deepEqual(
    data.health.errors,
    validateSkillRoot(root).errors.map((error) =>
      error.replaceAll(`${root}/`, '')
    )
  )
  fs.rmSync(path.join(root, '.agents/skills/README.md'))
  const missing = readProjectSkills(root)
  assert.equal(missing.health.status, 'failed')
  assert.deepEqual(missing.skills, [])
})

function middleware(readSnapshot) {
  let handler
  createDevProjectSkillsPlugin({ readSnapshot }).configureServer({
    middlewares: {
      use: (value) => {
        handler = value
      },
    },
  })
  return async (overrides = {}) => {
    const headers = {}
    const result = { status: 200, next: false, body: null, headers }
    await handler(
      {
        url: '/__dev/api/project-skills',
        method: 'GET',
        socket: { remoteAddress: '127.0.0.1' },
        headers: { host: '127.0.0.1:15200' },
        ...overrides,
      },
      {
        setHeader: (name, value) => {
          headers[name] = value
        },
        writeHead: (status, values) => {
          result.status = status
          Object.assign(headers, values)
        },
        end: (body) => {
          result.body = JSON.parse(body)
        },
      },
      () => {
        result.next = true
      }
    )
    return result
  }
}

test('fixed endpoint accepts only trusted, parameter-free reads and never executes client input', async () => {
  let reads = 0
  const run = middleware(() => {
    reads += 1
    return { health: { status: 'ok' }, skills: [] }
  })
  const valid = await run()
  assert.equal(valid.status, 200)
  assert.equal(valid.headers['cache-control'], 'no-store')
  assert.equal(valid.headers['x-content-type-options'], 'nosniff')
  assert.equal((await run({ url: '/__dev/api/other' })).next, true)
  for (const url of [
    '?path=/etc/passwd',
    '?command=sh',
    '?root=..',
    '?target=production',
  ]) {
    assert.equal(
      (await run({ url: `/__dev/api/project-skills${url}` })).status,
      400
    )
  }
  assert.equal((await run({ method: 'POST' })).status, 405)
  assert.equal(
    (await run({ headers: { host: '127.0.0.1:15200', 'content-length': '1' } }))
      .status,
    400
  )
  assert.equal(
    (
      await run({
        headers: { host: '127.0.0.1:15200', origin: 'https://example.com' },
      })
    ).status,
    403
  )
  assert.equal(
    (
      await run({
        headers: { host: '127.0.0.1:15200', 'sec-fetch-site': 'cross-site' },
      })
    ).status,
    403
  )
  assert.equal(
    (await run({ socket: { remoteAddress: '203.0.113.1' } })).status,
    403
  )
  assert.equal(reads, 1)
})

test('read failures return a stable message without internal paths', async () => {
  const run = middleware(() => {
    throw new Error('/private/path with internal diagnostics')
  })
  const response = await run()
  assert.equal(response.status, 503)
  assert(!JSON.stringify(response).includes('/private/path'))
})
