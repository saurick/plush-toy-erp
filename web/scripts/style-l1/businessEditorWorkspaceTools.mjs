import { waitForFiniteAnimations } from './browserReadiness.mjs'

export async function chooseWorkspaceEditor(page, value) {
  const workspace = page.locator('[data-business-editor-workspace]').filter({ visible: true })
  const pane = workspace.locator(`[data-business-editor-pane="${value}"]:not([hidden])`)
  if (await pane.count()) return pane
  const entry = workspace.locator(`[data-engineering-editor="${value}"]:visible`)
  if (!(await entry.count())) {
    const back = workspace.locator('[data-business-editor-navigation]').getByRole('button', { name: /^返回/u })
    if (await back.count()) {
      await back.click()
      if (await pane.count()) return pane
    }
  }
  if (!(await entry.count()) && value !== 'engineering') await workspace.locator('[data-engineering-editor="engineering"]:visible').click()
  await entry.click()
  await pane.waitFor()
  await waitForFiniteAnimations(page)
  return pane
}

export async function describeVisibleEditor(editor) {
  return editor.evaluate((node) => ({
    title: node.querySelector('.erp-business-form-page__header :is(h1,h2)')?.textContent,
    sections: [...node.querySelectorAll('.erp-business-form-page__section-links button')].map((item) => item.textContent),
    fields: [...node.querySelectorAll('.ant-form-item')].map((item) => ({
      label: item.querySelector('.ant-form-item-label label')?.textContent?.trim(),
      values: [...item.querySelectorAll('input:not([type="search"]),textarea,.ant-select-selection-item')].map((control) => control.matches('.ant-select-selection-item') ? control.textContent : control.value),
    })).filter((item) => item.label),
    columns: [...node.querySelectorAll('thead th')].map((item) => item.textContent.trim()),
  }))
}
