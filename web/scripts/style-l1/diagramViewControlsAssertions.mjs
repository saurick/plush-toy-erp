import { expect } from 'playwright/test'

export async function expectDiagramControlTooltip(controls, text) {
  const tooltip = controls.getByRole('tooltip').filter({ hasText: text })
  await expect(tooltip).toHaveText(text)
  await expect(tooltip).toBeInViewport({ ratio: 0.98 })
}

export async function verifyDiagramControlTooltips(page, controls, layoutTooltip) {
  const actions = [
    ...(layoutTooltip ? [['data-diagram-layout-action', 'toggle', layoutTooltip]] : []),
    ['data-diagram-zoom-action', 'fit-all', '适应全图'],
    ['data-diagram-zoom-action', 'fit', '适配宽度'],
    ['data-diagram-zoom-action', 'zoom-out', '缩小'],
    ['data-diagram-zoom-action', 'zoom-in', '放大'],
    ['data-diagram-zoom-action', 'reset', '重置 100%'],
    ['data-diagram-fullscreen-action', 'open', '进入全屏'],
  ]
  const buttons = controls.getByRole('button')
  await expect(buttons).toHaveCount(actions.length)
  await expect(controls.locator('[data-diagram-zoom-label]')).toHaveText(/^\d+(?:\.\d+)?%$/u)

  const enabled = []
  for (const [index, [attribute, value, label]] of actions.entries()) {
    const button = buttons.nth(index)
    await expect(button).toHaveAttribute(attribute, value)
    await expect(button).toHaveText('')
    await expect(button).not.toHaveAttribute('title', /.+/u)
    await button.locator('..').hover()
    await expectDiagramControlTooltip(controls, label)
    if (await button.isEnabled()) enabled.push({ button, label })
  }

  await page.mouse.move(1, 1)
  await expect(controls.getByRole('tooltip')).toHaveCount(0)
  await enabled[0].button.focus()
  for (const [index, { button, label }] of enabled.entries()) {
    if (index) await page.keyboard.press('Tab')
    await expect(button).toBeFocused()
    await expectDiagramControlTooltip(controls, label)
  }
  await enabled.at(-1).button.blur()
  await expect(controls.getByRole('tooltip')).toHaveCount(0)
}
