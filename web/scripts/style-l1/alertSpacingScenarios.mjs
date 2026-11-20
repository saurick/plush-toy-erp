import assert from 'node:assert/strict'
import { assertAlertSiblingSpacing } from './alertSpacingAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

export function createAlertSpacingScenarios() {
  return [
    { name: 'alert-spacing-desktop', viewport: { width: 1920, height: 1080 } },
    { name: 'alert-spacing-dark', viewport: { width: 1280, height: 800 }, themeMode: 'dark' },
    { name: 'alert-spacing-mobile', viewport: { width: 390, height: 844 } },
    { name: 'alert-spacing-mobile-dark', viewport: { width: 390, height: 844 }, themeMode: 'dark' },
  ].map((appearance) => ({
    ...appearance,
    deviceScaleFactor: 2,
    path: '/scripts/test/AlertSpacingFixture.html',
    auth: 'admin',
    verify: async (page) => {
      const existingGaps = await page.locator('#alert-spacing-owned-stack').evaluate((node) => {
        const items = [...node.querySelectorAll(':scope > .ant-space-item')]
        return items.slice(1).map((item, index) => item.getBoundingClientRect().top - items[index].getBoundingClientRect().bottom)
      })
      assert.equal(existingGaps.length, 2)
      assert(existingGaps.every((gap) => Math.abs(gap - 16) <= 1), `既有 Space 间距不叠加: ${JSON.stringify(existingGaps)}`)

      for (const trigger of ['业务弹窗', '加载容器弹窗']) {
        await page.getByRole('button', { name: trigger, exact: true }).click()
        const dialog = page.getByRole('dialog', { name: '提示间距验证', exact: true })
        await dialog.waitFor()
        await waitForFiniteAnimations(page)
        const body = dialog.locator(trigger === '业务弹窗' ? '.ant-modal-body' : '.ant-spin-container')
        const original = await assertAlertSiblingSpacing(body, `${appearance.name}-${trigger}`)
        assert.equal(original.length, 4, '四种提示类型均参与实测')
        await dialog.getByLabel('办理说明', { exact: true }).fill('已输入的办理说明')
        await dialog.locator('.ant-alert-error .ant-alert-close-icon').click()
        await dialog.locator('.ant-alert-error').waitFor({ state: 'hidden' })
        await waitForFiniteAnimations(page)
        assert.equal((await assertAlertSiblingSpacing(body, `${trigger}-关闭单条`)).length, 3)
        await dialog.getByRole('button', { name: '隐藏提示', exact: true }).click()
        await body.locator('.ant-alert').waitFor({ state: 'hidden' })
        const gapWithoutNotices = await body.evaluate((node) => {
          const source = node.querySelector(':scope > .ant-descriptions')
          const form = node.querySelector(':scope > form')
          return form.getBoundingClientRect().top - source.getBoundingClientRect().bottom
        })
        assert(Math.abs(gapWithoutNotices - 12) <= 1, `无提示时仍由容器提供一次间距: ${gapWithoutNotices}`)
        await dialog.getByRole('button', { name: '显示提示', exact: true }).click()
        await assertAlertSiblingSpacing(body, `${trigger}-恢复提示`)
        assert.equal(await dialog.getByLabel('办理说明', { exact: true }).inputValue(), '已输入的办理说明')
        const overflow = await dialog.evaluate((node) => node.scrollWidth - node.clientWidth)
        assert(overflow <= 1, `${trigger} 长提示和字段不产生横向溢出: ${overflow}`)
        await dialog.getByRole('button', { name: /^关\s*闭$/u }).click()
        await dialog.waitFor({ state: 'hidden' })
      }

      await page.getByRole('button', { name: '采购退货', exact: true }).click()
      const editor = page.locator('.erp-business-form-page:not([hidden])')
      await editor.waitFor()
      await assertAlertSiblingSpacing(editor.locator('.erp-business-form-page__body > .ant-spin-nested-loading > .ant-spin-container'), `${appearance.name}-采购退货`)
      const documentOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      assert.equal(documentOverflow, 0, '表单和既有纵向布局均保留视口边界')
    },
  }))
}
