import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

registerJSXTestLoader()

async function render(prepare) {
  const dom = installTestDOM()
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await prepare({
      container,
      update: (element) => act(() => root.render(element)),
    })
  } finally {
    await act(() => root.unmount())
    dom.restore()
  }
}

test('customer preview shows the complete primary lists and opens the requested print evidence', async () => {
  const { AssetsPanel } = await import('./AssetsPanel.jsx')
  const { statusText } = await import('./presentation.jsx')
  const { buildCustomerConfigDevOverviewFromSearch } = await import('../../config/devCustomerConfig.mjs')
  const overview = buildCustomerConfigDevOverviewFromSearch('customer=yoyoosun')
  await render(async ({ container, update }) => {
    await update(h(AssetsPanel, overview))
    const menu = container.querySelector('table[aria-label="菜单分组与页面"]')
    assert.equal(menu.querySelectorAll('tbody tr').length, overview.menuSummary.sections.length)
    assert.equal(menu.querySelectorAll('li').length, overview.menuSummary.itemCount)
    assert.equal(menu.querySelectorAll('code').length, 0)
    await act(() => container.querySelector('input[type="checkbox"]').click())
    assert.deepEqual(
      [...menu.querySelectorAll('code')].map((item) => item.textContent),
      overview.menuSummary.sections.flatMap((section) => section.items)
    )
    for (const label of ['字段显示候选', '编号规则候选', '打印模板清单']) {
      const table = container.querySelector(`table[aria-label="${label}"]`)
      assert(table && !table.closest('details'), `${label} is readable immediately`)
    }
    for (const candidate of overview.fieldNumberingSummary.fieldCandidates) {
      for (const value of [candidate.label, candidate.moduleLabel, candidate.decisionLabel, candidate.fieldKeyLabel, candidate.sourceLabel, candidate.note]) {
        assert(container.textContent.includes(value), `field content retained: ${value}`)
      }
    }
    for (const rule of overview.fieldNumberingSummary.numberingRules) {
      for (const value of [rule.label, rule.domain, rule.decisionLabel, rule.unresolvedQuestion]) {
        assert(container.textContent.includes(value), `numbering content retained: ${value}`)
      }
    }
    const prints = container.querySelector('table[aria-label="打印模板清单"]')
    assert.equal(prints.querySelectorAll('tbody tr').length, overview.printTemplateSummary.templates.length)
    assert.equal(prints.querySelectorAll('section').length, 0)
    for (const template of overview.printTemplateSummary.templates) {
      const option = prints.querySelector(`button[aria-label="${template.title}字段依据"]`)
      assert(Boolean(option))
      const row = option.closest('tr')
      for (const value of [template.title, template.category, statusText(template.readiness), template.fieldTruthCountLabel, template.fieldRequirementCountLabel, template.factBoundaryLabel]) {
        assert(row.textContent.includes(value), `template summary retained: ${value}`)
      }
      await act(() => option.click())
      const detail = prints.querySelector(`section[aria-label="${template.title}字段依据"]`)
      assert(Boolean(detail))
      assert.equal(option.getAttribute('aria-expanded'), 'true')
      assert.equal(prints.querySelectorAll('section').length, 1)
      assert(detail.parentElement.textContent.includes(template.templateKeyLabel))
      for (const value of template.fieldTruth) {
        assert(detail.textContent.includes(value), `template content retained: ${value}`)
      }
      for (const item of template.fieldRequirementItems) {
        for (const value of [item.label, item.requirementKeyLabel, item.sourceLabel, item.boundary]) {
          assert(detail.textContent.includes(value), `template requirement retained: ${value}`)
        }
      }
    }
    assert.match(container.textContent, /不进入产品核心表单/u)
    await update(h(AssetsPanel, {
      ...overview,
      menuSummary: { ...overview.menuSummary, sections: [] },
      fieldNumberingSummary: { ...overview.fieldNumberingSummary, fieldCandidates: [], numberingRules: [] },
      printTemplateSummary: { templates: [] },
    }))
    assert.equal(container.querySelectorAll('table, .erp-dev-customer-menu-item').length, 0)
  })
})

test('guidance defaults stay closed and migration can opt into an initially open disclosure', async () => {
  const { default: DevStaticGuidance } = await import('../../components/DevStaticGuidance.jsx')
  await render(async ({ container, update }) => {
    await update(h(DevStaticGuidance, { title: '原有说明' }, h('p', null, '原有内容')))
    assert.equal(container.querySelector('details').open, false)
    await update(h(DevStaticGuidance, { title: '原有说明', defaultOpen: true }, h('p', null, '原有内容')))
    assert.equal(container.querySelector('details').open, true)
    assert.match(container.textContent, /原有内容/u)
  })
})

test('configuration boundary failures are visible with actual and required values and clear on recovery', async () => {
  const { PreflightPanel } = await import('./PreflightPanel.jsx')
  const { buildCustomerConfigDevOverviewFromSearch } = await import('../../config/devCustomerConfig.mjs')
  const overview = buildCustomerConfigDevOverviewFromSearch('customer=yoyoosun')
  const boundary = {
    key: 'fixture-boundary',
    label: '候选配置对象范围',
    ok: false,
    valueLabel: '包含未登记对象',
    expectedLabel: '仅允许已登记配置对象',
  }
  const props = {
    consoleSummary: overview.packageConsoleSummary,
    customerPackageSummary: { ...overview.customerPackageSummary, boundaries: [boundary] },
    menuSummary: overview.menuSummary,
    fieldNumberingSummary: overview.fieldNumberingSummary,
    activeSection: 'package',
    onSectionChange() {},
  }
  await render(async ({ container, update }) => {
    await update(h(PreflightPanel, props))
    const alert = container.querySelector('.erp-workbench-notice[role="alert"]')
    assert(alert && !alert.closest('details'))
    for (const text of ['候选配置对象范围', '包含未登记对象', '仅允许已登记配置对象']) {
      assert(alert.textContent.includes(text), `${text} is visible without opening guidance`)
    }
    await update(h(PreflightPanel, { ...props, activeSection: 'evidence' }))
    assert.match(container.querySelector('[role="alert"]').textContent, /包含未登记对象.*仅允许已登记配置对象/u)
    await update(h(PreflightPanel, {
      ...props,
      activeSection: 'evidence',
      customerPackageSummary: { ...props.customerPackageSummary, boundaries: [{ ...boundary, ok: true }] },
    }))
    assert.equal(Boolean(container.querySelector('.erp-workbench-notice[role="alert"]')), false)
  })
})

test('runtime settings and the comparison both show real overrides and clear them on source changes', async () => {
  const { RuntimeSettings } = await import('./RuntimeSettings.jsx')
  const { DiffPanel } = await import('./DiffPanel.jsx')
  const { buildCustomerConfigDevOverviewFromSearch } = await import('../../config/devCustomerConfig.mjs')
  const overview = buildCustomerConfigDevOverviewFromSearch('customer=yoyoosun')
  const base = overview.customerPackageSummary
  const [module, ...otherModules] = base.moduleStates
  const changed = {
    ...base,
    moduleStateOverrideCount: 1,
    moduleStates: [
      { ...module, state: 'read_only', stateLabel: '只读', overridden: true, sourceLabel: '客户包覆盖', reason: '样本原因' },
      ...otherModules,
    ],
  }

  await render(async ({ container, update }) => {
    await update(h(RuntimeSettings, { summary: changed }))
    const moduleRows = () => [...container.querySelectorAll('table[aria-label="模块候选取值"] tbody tr')]
      .filter((row) => !row.closest('details'))
    assert.equal(moduleRows().length, base.moduleStates.length)
    assert.match(moduleRows()[0].textContent, /只读客户包覆盖样本原因/u)
    await update(h(RuntimeSettings, { summary: base }))
    assert.equal(moduleRows().length, base.moduleStates.length)
    assert.doesNotMatch(container.textContent, /样本原因/u)

    const diff = (summary) => h(DiffPanel, { consoleSummary: overview.packageConsoleSummary, customerPackageSummary: summary })
    await update(diff(changed))
    const values = () => container.querySelector('table[aria-label="模块与列表字段候选取值"] tbody')
    assert.match(values().firstElementChild.textContent, /启用只读客户包覆盖样本原因/u)
    assert.equal(values().querySelectorAll('tr').length, base.moduleStates.length + base.fieldVisibilityReview.length)
    await update(diff(base))
    assert.doesNotMatch(values().textContent, /样本原因/u)
    assert.equal(values().querySelectorAll('tr').length, base.moduleStates.length + base.fieldVisibilityReview.length)
  })
})
