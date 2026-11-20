import { assertVisibleControlPlaceholdersFit } from './inputControlAssertions.mjs'
import { closeBusinessFormPage } from './businessFormPageAssertions.mjs'

export function createInputHintScenarios({ assert, assertNoHorizontalOverflow, customerRuntimeEffectiveSession }) {
  const cases = [
    { key: 'purchase', path: '/erp/purchase/accessories', trigger: '新建采购订单', rule: '金额＝采购数量 × 单价；留空自动计算，手填金额须与计算结果一致。' },
    { key: 'outsourcing', path: '/erp/purchase/processing-contracts', trigger: '新建加工合同', rule: '提交前须补齐双方单位、联系人、电话和地址；乙方电话也可使用所选联系人的手机。' },
    { key: 'products', path: '/erp/master/products', trigger: '新建产品' },
  ]
  return [...cases, { ...cases[0], key: 'purchase-narrow', viewport: { width: 390, height: 844 } }].map(({ key, path, trigger, rule, viewport }) => ({
    name: `input-hints-${key}`,
    path,
    auth: 'admin',
    effectiveSession: customerRuntimeEffectiveSession,
    viewport: viewport || { width: 1440, height: 900 },
    verify: async (page) => {
      await page.getByRole('button', { name: trigger }).click()
      const editor = page.locator('.erp-business-form-page:not([hidden])')
      await editor.getByRole('heading', { name: trigger, exact: true }).waitFor()
      await assertVisibleControlPlaceholdersFit(page, `input-hints-${key}-opened`)
      const revealSection = async (title) => {
        const section = editor.locator(`[data-form-section="${title}"]`)
        if (!await section.isVisible()) await editor.getByRole('tab', { name: title }).click()
        return section
      }
      if (rule) {
        await revealSection(key === 'outsourcing' ? '合同双方信息' : '采购明细')
        const note = editor.getByText(rule, { exact: true })
        await note.scrollIntoViewIfNeeded()
        assert.equal(await note.count(), 1, '同一区域只显示一份必要规则')
        assert.equal(await note.isVisible(), true)
      }
      if (key.startsWith('purchase')) {
        if (await editor.getByPlaceholder('自动计算', { exact: true }).count() === 0) {
          await editor.getByRole('button', { name: '添加采购明细', exact: true }).click()
        }
        const amount = editor.getByPlaceholder('自动计算', { exact: true }).first()
        await amount.fill('12')
        assert.equal(await editor.getByText(rule, { exact: true }).isVisible(), true, '输入后计算规则继续可见')
        await amount.fill('')
        await assertVisibleControlPlaceholdersFit(page, `input-hints-${key}-cleared`)
      }
      if (key === 'products') {
        await revealSection('外贸信息')
        const help = editor.getByRole('button', { name: '查看英文品名说明', exact: true })
        await help.click()
        const popup = page.getByRole('tooltip').filter({ hasText: '用于外贸单据；未知时可留空。' })
        await popup.waitFor({ state: 'visible' })
        assert.equal(await help.locator('.anticon-info-circle').count(), 1)
        await help.press('Escape')
        await popup.waitFor({ state: 'hidden' })
        assert.equal(await help.evaluate((node) => node === document.activeElement), true, '关闭说明后恢复入口焦点')
      }
      await assertNoHorizontalOverflow(page, `input-hints-${key}`)
      await closeBusinessFormPage(page, editor)
    },
  }))
}
