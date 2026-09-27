import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import standardUnits from '../../../../server/internal/unitpolicy/units.json' with { type: 'json' }
import { getBusinessUsabilityEntry } from '../../erp/config/businessUsabilityCatalog.mjs'
import { getRoleHelpScenarios } from '../../erp/config/helpScenarios.mjs'
import { ROLE_HELP_GUIDES } from '../../erp/config/roleHelpContent.mjs'
import {
  DEV_UI_DESIGN_ROUTE,
  UI_DESIGN_ASSET,
  UI_DESIGN_DIRECTORY,
  prepareUIDesignSandboxSource,
} from './devUIDesign.mjs'

const root = path.resolve(import.meta.dirname, '../../../..')
const read = (file) => readFileSync(path.join(root, file), 'utf8')
const helpDefinition = (name) => {
  const match = read(UI_DESIGN_ASSET.path).match(
    new RegExp(`const ${name} = ([\\s\\S]*?);\\n`)
  )
  assert.ok(match, `岗位帮助缺少 ${name} 定义`)
  return JSON.parse(match[1])
}

test('quantity design snapshot follows the canonical unit labels and precision', () => {
  const saved = helpDefinition('quantityUnits')
  assert.deepEqual(
    saved,
    standardUnits.map(({ code, name, precision }) => ({ code, name, precision }))
  )
})

test('help design snapshot follows the current formal role and scenario content', () => {
  const { roles } = helpDefinition('catalog')
  assert.deepEqual(
    roles.map((role) => role.key).sort(),
    ROLE_HELP_GUIDES.map((role) => role.key).sort()
  )
  const fields = [
    'key',
    'title',
    'description',
    'path',
    'actionLabel',
    'steps',
    'completion',
    'handoff',
    'exception',
  ]
  const content = (scenario) =>
    Object.fromEntries(fields.map((field) => [field, scenario[field]]))
  for (const guide of ROLE_HELP_GUIDES) {
    const saved = roles.find((role) => role.key === guide.key)
    assert.equal(saved.label, guide.label)
    assert.deepEqual(
      saved.scenes.map(content),
      getRoleHelpScenarios(guide, { isSuperAdmin: true }).map(content),
      `${guide.label}的正式帮助已变化，请同步交互稿并核对概览、异常与完成条件`
    )
  }
})

test('payment example follows its formal page help', () => {
  const { roles } = helpDefinition('catalog')
  const saved = roles
    .find((role) => role.key === 'finance')
    .scenes.find((scene) => scene.key === 'finance-payments')
  const current = getBusinessUsabilityEntry('finance-payments')
  assert.deepEqual(
    saved.steps.map((step) => step.description),
    current.flowSteps
  )
  assert.equal(saved.completion, current.completion)
  assert.equal(saved.handoff, current.handoff)
  assert.equal(
    saved.exception.trigger,
    current.items.find((item) => item.type === 'disabled').explanation
  )
  assert.equal(saved.exception.action, current.handoff)
})

test('every help scenario has an overview and valid exception return steps', () => {
  const { roles } = helpDefinition('catalog')
  const layouts = helpDefinition('overviewLayouts')
  const sceneKeys = [
    ...new Set(roles.flatMap((role) => role.scenes.map((s) => s.key))),
  ]
  assert.deepEqual(Object.keys(layouts).sort(), sceneKeys.sort())
  for (const role of roles) {
    for (const scene of role.scenes) {
      const layout = layouts[scene.key]
      const context = `${role.label} / ${scene.title}`
      assert.ok(['chain', 'steps', 'path'].includes(layout.kind), context)
      const steps = layout.steps || scene.steps
      assert.ok(steps.length > 0, context)
      for (const step of steps) {
        assert.ok(
          step.title && step.owner && (step.detail || step.description),
          context
        )
        assert.ok(Array.isArray(step.roles), context)
      }
      if (layout.kind === 'chain') {
        const ids = steps.map((_, index) => `s${index + 1}`)
        assert.ok(ids.includes(layout.exception?.from), `${context}异常起点`)
        assert.ok(ids.includes(layout.exception?.back), `${context}恢复去向`)
        assert.ok(
          layout.exception.title &&
            layout.exception.owner &&
            layout.exception.label,
          context
        )
      }
      if (layout.resultStep !== undefined) {
        assert.ok(
          Number.isInteger(layout.resultStep) &&
            layout.resultStep >= 0 &&
            layout.resultStep < steps.length,
          context
        )
      }
      if (layout.pointMap) {
        assert.equal(layout.pointMap.length, steps.length, context)
      }
      for (const index of layout.supplementSourceSteps || []) {
        assert.ok(scene.steps[index], `${context}补充说明`)
      }
    }
  }
})

test('UI design has exactly one self-contained HTML and the current written contract', () => {
  assert.equal(DEV_UI_DESIGN_ROUTE, '/__dev/ui-design')
  assert.deepEqual(
    readdirSync(path.join(root, UI_DESIGN_DIRECTORY)).sort(),
    ['README.md', 'index.html', '交互设计说明.md', '设计依据.md'].sort()
  )
  const html = read(UI_DESIGN_ASSET.path)
  assert.match(html, /<!doctype html>/i)
  assert.doesNotMatch(
    html,
    /<(?:script|img|link)[^>]+(?:src|href)=["']https?:/i
  )
  for (const file of [
    UI_DESIGN_ASSET.specificationPath,
    UI_DESIGN_ASSET.rationalePath,
  ]) {
    assert.ok(read(file).length > 300)
  }
})

test('preview isolates storage, disallows network and permits local exported downloads', () => {
  const html = prepareUIDesignSandboxSource(
    '<html><head><title>Design</title></head><body></body></html>'
  )
  assert.match(html, /connect-src 'none'/)
  const page = read('web/src/dev-workbench/pages/DevUIDesignPage.jsx')
  assert.match(page, /sandbox="allow-scripts allow-downloads"/)
  assert.doesNotMatch(page, /allow-same-origin/)
  assert.match(page, /event\.source === frameRef\.current\?\.contentWindow/)
})

test('empty or headless design inputs keep sandbox initialization deterministic', () => {
  assert.equal(prepareUIDesignSandboxSource(''), '')
  assert.match(prepareUIDesignSandboxSource('<body>Design</body>'), /^<meta /)
  const html = prepareUIDesignSandboxSource(
    '<HEAD lang="zh"><title>Design</title></HEAD>'
  )
  assert.ok(html.indexOf('createMemoryStorage') < html.indexOf('<title>'))
})

test('business, help, login and workbench use the same isolated design asset', () => {
  const source = '<html><head></head><body></body></html>'
  for (const entry of ['workspace', 'login', 'help', 'workbench']) {
    const prepared = prepareUIDesignSandboxSource(source, { page: entry })
    assert.ok(prepared.includes(`window.__ERP_UI_DESIGN_ENTRY__ = "${entry}"`))
    assert.match(prepared, /connect-src 'none'/)
  }
  const prepared = prepareUIDesignSandboxSource(source, {
    page: '</script><script>unexpected()</script>',
  })
  assert.ok(prepared.includes('window.__ERP_UI_DESIGN_ENTRY__ = "workspace"'))
  assert.doesNotMatch(prepared, /unexpected/)
})

test('design does not reach the formal ERP routes or production import graph', () => {
  const routes = read('web/src/dev-workbench/DevWorkbenchRoutes.jsx')
  assert.match(routes, /path="ui-design"/)
  assert.match(routes, /DevUIDesignPage/)
  assert.doesNotMatch(routes, /path="prototypes"/)
  assert.match(read('web/src/dev-workbench/config/devHub.mjs'), /UI 交互设计/)
})
