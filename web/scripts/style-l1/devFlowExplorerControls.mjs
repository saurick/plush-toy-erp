export const viewTrigger = (scope) => scope.getByRole('button', { name: /^画布视图：/u })

export async function chooseViewOption(scope, label) {
  const trigger = viewTrigger(scope)
  await trigger.click()
  const panel = trigger.page().getByRole('dialog', { name: '画布视图', exact: true })
  const radio = panel.getByRole('radio', { name: label, exact: true })
  await radio.locator('xpath=ancestor::label[1]').click()
  await panel.getByRole('button', { name: '关闭视图面板' }).click()
  await panel.waitFor({ state: 'hidden' })
}

export async function chooseChainScope(page, label) {
  await page.getByRole('button', { name: /^流程范围：/u }).click()
  const panel = page.getByRole('dialog', { name: '选择流程范围', exact: true })
  await panel.getByRole('button', { name: label, exact: true }).click()
  await panel.waitFor({ state: 'hidden' })
}

export async function openExplorerActions(editor) {
  const more = editor.getByRole('button', { name: '更多视图操作', exact: true })
  await more.click()
  return more.page().getByRole('menu')
}

export async function chooseExplorerAction(editor, name) {
  const menu = await openExplorerActions(editor)
  await menu.getByRole('menuitem', { name, exact: true }).click()
}

export async function searchWholeLibrary(editor) {
  await editor.getByRole('button', { name: /^筛选业务节点/ }).click()
  const dialog = editor.page().getByRole('dialog', { name: '筛选业务节点' })
  await dialog.getByRole('button', { name: '全库', exact: true }).click()
  await dialog.getByRole('button', { name: '应用筛选', exact: true }).click()
}
