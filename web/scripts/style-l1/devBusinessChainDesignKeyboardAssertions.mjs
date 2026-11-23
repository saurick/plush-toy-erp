import { expect } from 'playwright/test'
import { chooseGranularity, chooseExplorerAction } from './devFlowExplorerControls.mjs'

export async function assertChainDesignKeyboard(page, editor, assert) {
  const canvas = editor.getByRole('region', {
    name: '流程探索画布',
    exact: true,
  })
  const card = editor.locator('.erp-chain-design__card')
  const pan = editor.getByRole('button', {
    name: '平移画布，使用方向键移动视图',
    exact: true,
  })
  const node = (name) =>
    editor.getByRole('button', { name: `查看节点：${name}`, exact: true })
  const working = () =>
    page.evaluate(() => {
      const { nodes, edges } = JSON.parse(
        sessionStorage.getItem('plush-workbench:business-chain-design:working')
      ).draft
      return { nodes, edges }
    })
  // Reload starts a fresh history for the same automatically recorded canvas.
  await page.reload()
  await expect(canvas).toBeVisible()
  await editor.getByRole('button', { name: '展开节点库', exact: true }).click()
  const baseline = await working()
  await editor
    .getByRole('button', { name: '适应画布全图', exact: true })
    .click()
  const orderId = await node('完成订单工程资料').evaluate(
    (button) => button.closest('[data-design-node]').dataset.designNode
  )

  await node('完成订单工程资料').click()
  await page.keyboard.press('Delete')
  await expect(node('完成订单工程资料')).toHaveCount(0)
  assert.deepEqual(
    await working(),
    {
      ...baseline,
      nodes: baseline.nodes.filter((item) => item.id !== orderId),
      edges: baseline.edges.filter(
        (edge) => edge.from !== orderId && edge.to !== orderId
      ),
    },
    '删除节点只移除该节点及相邻线'
  )
  const removed = await working()
  await expect(
    editor.getByRole('button', { name: '加入：完成订单工程资料', exact: true })
  ).toBeVisible()
  await expect(pan).toBeFocused()
  await page.keyboard.press('Meta+z')
  await expect(node('完成订单工程资料')).toHaveCount(1)
  assert.deepEqual(await working(), baseline, '⌘Z 一步恢复节点、连线和位置')
  await page.keyboard.press('Meta+Shift+z')
  assert.deepEqual(await working(), removed, '⌘Shift+Z 重做节点及相邻线的移除')
  await chooseExplorerAction(editor, '撤销')
  await chooseExplorerAction(editor, '重做')
  assert.deepEqual(await working(), removed, '菜单里的重做复用同一份历史')
  await pan.focus()
  await page.keyboard.press('Control+z')
  assert.deepEqual(await working(), baseline)

  const summary = editor.getByRole('button', {
    name: '查看连线：完成订单工程资料 → 汇总用料并自动送审',
    exact: true,
  })
  await summary.press('Enter')
  await page.keyboard.press('Backspace')
  await expect(summary).toHaveCount(0)
  const disconnected = await working()
  const actionId = baseline.edges.find((edge) => edge.from === orderId).to
  const finalEdge = baseline.edges.find(
    (edge) =>
      edge.from === actionId &&
      edge.to ===
        'action:effective_bom:calls_domain_command:material_request:prepare'
  )
  assert.deepEqual(
    disconnected.nodes,
    baseline.nodes,
    '步骤视图移除关系保留中间节点'
  )
  assert.deepEqual(
    disconnected.edges,
    baseline.edges.filter((edge) => edge !== finalEdge),
    '步骤视图仅断开接入下游的连线'
  )
  await page.keyboard.press('Control+z')
  await expect(summary).toHaveCount(1)
  assert.deepEqual(await working(), baseline, 'Ctrl+Z 恢复步骤视图关系')
  await page.keyboard.press('Control+Shift+z')
  assert.deepEqual(
    await working(),
    disconnected,
    'Ctrl+Shift+Z 重做步骤视图关系移除'
  )
  await page.keyboard.press('Control+z')

  await chooseGranularity(editor, '节点明细')
  await editor
    .getByRole('button', { name: '适应画布全图', exact: true })
    .click()
  await expect(canvas).toHaveAttribute('data-view-mode', 'all')
  const direct = editor.getByRole('button', {
    name: '查看连线：完成订单工程资料 → 有效 BOM 版本',
    exact: true,
  })
  await direct.press('Enter')
  await page.keyboard.press('Delete')
  await expect(direct).toHaveCount(0)
  assert.deepEqual((await working()).nodes, baseline.nodes)
  assert.deepEqual(
    (await working()).edges,
    baseline.edges.filter(
      (edge) => !(edge.from === orderId && edge.to === actionId)
    ),
    '普通连线只移除当前一条'
  )
  await page.keyboard.press('Control+z')
  await expect(direct).toHaveCount(1)
  assert.deepEqual(await working(), baseline)
  await page.keyboard.press('Backspace')
  assert.deepEqual(await working(), baseline, '无选中内容时退格不移除节点')

  await editor
    .getByRole('button', { name: '从有效 BOM 版本拖出连线', exact: true })
    .click()
  await node('生产订单').press('Enter')
  await expect(editor.locator('[data-connection-status]')).toHaveAttribute(
    'data-connection-status',
    'blocked'
  )
  await page.keyboard.press('Delete')
  assert.deepEqual(
    await working(),
    baseline,
    '尚未加入视图的候选接点不删除其他关系'
  )
  await editor.getByRole('button', { name: '取消连线', exact: true }).click()
  await chooseGranularity(editor, '业务步骤')
  await editor
    .getByRole('button', { name: '适应画布全图', exact: true })
    .click()

  // Keep both histories and a selected node while checking editing and composition guards.
  await summary.press('Enter')
  await page.keyboard.press('Backspace')
  const firstEdit = await working()
  assert.notDeepEqual(firstEdit, baseline)
  await node('完成订单工程资料').press('Enter')
  await page.keyboard.press('Delete')
  const secondEdit = await working()
  assert.notDeepEqual(secondEdit, firstEdit)
  await page.keyboard.press('Control+z')
  assert.deepEqual(await working(), firstEdit)
  await node('完成订单工程资料').press('Enter')
  await card.dispatchEvent('keydown', { key: 'Delete', isComposing: true })
  await card.dispatchEvent('keydown', {
    key: 'z',
    metaKey: true,
    isComposing: true,
  })
  await card.dispatchEvent('keydown', {
    key: 'Z',
    metaKey: true,
    shiftKey: true,
    isComposing: true,
  })
  assert.deepEqual(
    await working(),
    firstEdit,
    '输入法组合输入不触发移除、撤销或重做'
  )
  const search = editor.getByRole('textbox', {
    name: '搜索链路或业务节点',
    exact: true,
  })
  await search.fill('')
  await search.pressSequentially('ab')
  await search.press('Backspace')
  await expect(search).toHaveValue('a')
  await search.press('ControlOrMeta+z')
  await expect(search).toHaveValue('ab')
  await search.press('ControlOrMeta+Shift+z')
  await expect(search).toHaveValue('a')
  await search.press('ControlOrMeta+z')
  await expect(search).toHaveValue('ab')
  await search.evaluate((element) => element.setSelectionRange(0, 0))
  await search.press('Delete')
  await expect(search).toHaveValue('b')
  await search.press('Meta+z')
  await search.press('Control+z')
  await search.press('Meta+Shift+z')
  await search.press('Control+Shift+z')
  assert.deepEqual(
    await working(),
    firstEdit,
    '输入框中的删除、撤销和重做保留视图'
  )
  await search.fill('')
  await pan.focus()
  await page.keyboard.press('Control+z')
  assert.deepEqual(await working(), baseline, '输入后仍能在画布撤销之前的连线编辑')
  await page.keyboard.press('Control+z')
  assert.deepEqual(await working(), baseline, '撤销到头不会进入其他视图')
  await page.keyboard.press('Control+Shift+z')
  assert.deepEqual(await working(), firstEdit, '输入结束后重做历史仍保留')
  await page.keyboard.press('Meta+Shift+z')
  assert.deepEqual(await working(), secondEdit, '连续重做保持编辑顺序')
  await page.keyboard.press('Control+z')
  await node('汇总用料并自动送审').press('Enter')
  await page.keyboard.press('Delete')
  const revised = await working()
  assert.notDeepEqual(revised, firstEdit)
  await page.keyboard.press('Control+Shift+z')
  assert.deepEqual(await working(), revised, '新编辑使旧的重做分支失效')
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+z')
  assert.deepEqual(await working(), baseline)
  await page.reload()
  await pan.focus()
  await page.keyboard.press('Meta+Shift+z')
  assert.deepEqual(await working(), baseline, '重新打开自动记录后不沿用上次的重做历史')
  await editor
    .getByRole('button', { name: '适应画布全图', exact: true })
    .click()
}
