import { chooseSelectOption } from './selectControlActions.mjs'

export function chooseDisplay(editor, label) {
  return chooseSelectOption(editor.getByRole('combobox', { name: '流程颗粒度', exact: true }), { label })
}

export async function chooseExplorerAction(editor, name) {
  const more = editor.getByRole('button', { name: '更多视图操作', exact: true })
  await more.click()
  await more.page().getByRole('menuitem', { name, exact: true }).click()
}

export async function searchWholeLibrary(editor) {
  await editor.getByRole('button', { name: /^筛选业务节点/ }).click()
  const dialog = editor.page().getByRole('dialog', { name: '筛选业务节点' })
  await dialog.getByRole('button', { name: '全库', exact: true }).click()
  await dialog.getByRole('button', { name: '应用筛选', exact: true }).click()
}
