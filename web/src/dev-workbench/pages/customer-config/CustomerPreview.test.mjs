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

test('customer preview preserves every original field and defaults its original disclosures to open', async () => {
  const { AssetsPanel } = await import('./AssetsPanel.jsx')
  const { statusText } = await import('./presentation.jsx')
  const { buildCustomerConfigDevOverviewFromSearch } = await import('../../config/devCustomerConfig.mjs')
  const overview = buildCustomerConfigDevOverviewFromSearch('customer=yoyoosun')
  await render(async ({ container, update }) => {
    await update(h(AssetsPanel, overview))
    const menuItems = [...container.querySelectorAll('.erp-dev-customer-menu-group__items .erp-dev-customer-menu-item')]
    assert.equal(menuItems.length, overview.menuSummary.sections.reduce((total, section) => total + section.items.length, 0))
    assert(menuItems.every((item) => item.closest('details').open && Boolean(item.querySelector('code'))))
    const panels = [...container.querySelectorAll('details.erp-dev-customer-disclosure')]
    for (const label of ['字段显示候选', '编号规则候选', '打印模板字段']) {
      const panel = panels.find((node) => node.querySelector('summary').textContent.includes(label))
      assert(Boolean(panel?.open), `${label} is readable by default and can still be collapsed`)
      assert.equal(panel.hasAttribute('name'), false, 'opening one panel must not close another')
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
    for (const template of overview.printTemplateSummary.templates) {
      for (const value of [template.title, template.category, statusText(template.readiness), template.templateKeyLabel, template.fieldTruthCountLabel, template.fieldRequirementCountLabel, template.factBoundaryLabel, ...template.fieldTruth]) {
        assert(container.textContent.includes(value), `template content retained: ${value}`)
      }
      for (const item of template.fieldRequirementItems) {
        for (const value of [item.label, item.requirementKeyLabel, item.sourceLabel, item.boundary]) {
          assert(container.textContent.includes(value), `template requirement retained: ${value}`)
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
    assert.equal(container.querySelectorAll('.erp-dev-customer-field, .erp-dev-customer-numbering, .erp-dev-customer-tool, .erp-dev-customer-menu-item').length, 0)
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
    assert.equal(container.querySelector('.erp-dev-static-guidance').open, false)
    await update(h(PreflightPanel, {
      ...props,
      customerPackageSummary: { ...props.customerPackageSummary, boundaries: [{ ...boundary, ok: true }] },
    }))
    assert.equal(Boolean(container.querySelector('.erp-workbench-notice[role="alert"]')), false)
  })
})
