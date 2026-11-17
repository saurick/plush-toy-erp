import { expect } from 'playwright/test'

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
  const redo = editor.getByRole('button', { name: '重做', exact: true })
  const node = (name) =>
    editor.getByRole('button', { name: `查看节点：${name}`, exact: true })
  const working = () =>
    page.evaluate(() => {
      const { nodes, edges, ideas } = JSON.parse(
        sessionStorage.getItem('plush-workbench:business-chain-design:working')
      ).draft
      return { nodes, edges, ideas }
    })
  const saved = () =>
    page.evaluate(() =>
      localStorage.getItem('plush-workbench:business-chain-design')
    )
  const copyDraft = async () => {
    await editor.getByRole('button', { name: '更多视图操作', exact: true }).click()
    await page.getByRole('menuitem', { name: '另存一份', exact: true }).click()
  }
  const nameDraft = async (action, title, name) => {
    if (action === '另存一份') await copyDraft()
    else await editor.getByRole('button', { name: action, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: title, exact: true })
    await dialog
      .getByRole('textbox', { name: '视图名称', exact: true })
      .fill(name)
    await dialog.getByRole('button', { name: '保存', exact: true }).click()
    await expect(dialog).not.toBeVisible()
  }
  await nameDraft('保存视图', '保存本地视图', '快捷键原稿')
  await nameDraft('另存一份', '另存一份本地视图', '快捷键副本')
  // Enter the saved draft through the switcher so its undo history starts here.
  for (const name of ['快捷键原稿', '快捷键副本']) {
    await editor
      .locator('.erp-chain-design__draft-select .ant-select-selector')
      .click()
    await page
      .locator('.ant-select-dropdown:visible .ant-select-item-option')
      .getByText(name, { exact: true })
      .click()
  }
  await editor.getByRole('button', { name: '调整布局', exact: true }).click()
  const baseline = await working()
  const savedBefore = await saved()
  assert.equal(JSON.parse(savedBefore).length, 2)
  await expect(redo).toBeDisabled()
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
  await expect(redo).toBeEnabled()
  await page.keyboard.press('Meta+Shift+z')
  assert.deepEqual(await working(), removed, '⌘Shift+Z 重做节点及相邻线的移除')
  await expect(redo).toBeDisabled()
  await editor.getByRole('button', { name: '撤销', exact: true }).click()
  await redo.click()
  assert.deepEqual(await working(), removed, '重做按钮复用同一份历史')
  await expect(pan).toBeFocused()
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

  await editor
    .locator('.erp-chain-design__canvas-bar')
    .getByText('全部已载入节点', { exact: true })
    .click()
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
  await editor
    .locator('.erp-chain-design__canvas-bar')
    .getByText('业务步骤', { exact: true })
    .click()
  await editor
    .getByRole('button', { name: '适应画布全图', exact: true })
    .click()

  // Keep both histories and a selected node while checking editing and composition guards.
  await node('完成订单工程资料').press('ArrowDown')
  const moved = await working()
  assert.notDeepEqual(moved, baseline)
  await node('完成订单工程资料').press('ArrowDown')
  const movedAgain = await working()
  await page.keyboard.press('Control+z')
  assert.deepEqual(await working(), moved)
  await expect(redo).toBeEnabled()
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
    moved,
    '输入法组合输入不触发移除、撤销或重做'
  )
  const checkTextEditing = async (input) => {
    await input.fill('')
    await input.pressSequentially('ab')
    await input.press('Backspace')
    await expect(input).toHaveValue('a')
    await input.press('ControlOrMeta+z')
    await expect(input).toHaveValue('ab')
    await input.press('ControlOrMeta+Shift+z')
    await expect(input).toHaveValue('a')
    await input.press('ControlOrMeta+z')
    await expect(input).toHaveValue('ab')
    await input.evaluate((element) => element.setSelectionRange(0, 0))
    await input.press('Delete')
    await expect(input).toHaveValue('b')
    await input.press('Meta+z')
    await input.press('Control+z')
    await input.press('Meta+Shift+z')
    await input.press('Control+Shift+z')
    assert.deepEqual(
      await working(),
      moved,
      '输入框中的删除、撤销和重做保留视图'
    )
  }
  const search = editor.getByRole('textbox', {
    name: '搜索业务节点',
    exact: true,
  })
  await checkTextEditing(search)
  await search.fill('')
  await copyDraft()
  const naming = page.getByRole('dialog', {
    name: '另存一份本地视图',
    exact: true,
  })
  await checkTextEditing(
    naming.getByRole('textbox', { name: '视图名称', exact: true })
  )
  await naming.getByRole('button', { name: '取消', exact: true }).click()
  await editor
    .getByRole('button', { name: '更多视图操作', exact: true })
    .click()
  await page.getByRole('menuitem', { name: '视图备注', exact: true }).click()
  await checkTextEditing(
    editor.getByRole('textbox', { name: '视图备注内容', exact: true })
  )
  await editor
    .getByRole('button', { name: '关闭画布说明', exact: true })
    .click()
  await pan.focus()
  await page.keyboard.press('Control+z')
  assert.deepEqual(await working(), baseline, '输入后仍能在画布撤销之前的移动')
  assert.equal(await saved(), savedBefore, '快捷键不覆盖任何已保存视图')
  await expect(
    editor.getByRole('button', { name: '撤销', exact: true })
  ).toBeDisabled()
  await page.keyboard.press('Control+z')
  assert.deepEqual(await working(), baseline, '撤销到头不会进入其他视图')
  await page.keyboard.press('Control+Shift+z')
  assert.deepEqual(await working(), moved, '输入结束后重做历史仍保留')
  await page.keyboard.press('Meta+Shift+z')
  assert.deepEqual(await working(), movedAgain, '连续重做保持编辑顺序')
  await expect(redo).toBeDisabled()
  await page.keyboard.press('Control+z')
  await node('完成订单工程资料').press('ArrowRight')
  const revised = await working()
  await expect(redo).toBeDisabled()
  await page.keyboard.press('Control+Shift+z')
  assert.deepEqual(await working(), revised, '新编辑使旧的重做分支失效')
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+z')
  assert.deepEqual(await working(), baseline)
  await editor
    .locator('.erp-chain-design__draft-select .ant-select-selector')
    .click()
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .getByText('快捷键原稿', { exact: true })
    .click()
  const switchDialog = page.getByRole('dialog', { name: '当前视图有未保存修改', exact: true })
  await expect(switchDialog).toBeVisible()
  await switchDialog.getByRole('button', { name: '放弃修改并切换', exact: true }).click()
  await expect(redo).toBeDisabled()
  await pan.focus()
  await page.keyboard.press('Meta+Shift+z')
  assert.deepEqual(
    await working(),
    baseline,
    '切换视图后不能重做上一个视图的修改'
  )
  assert.equal(await saved(), savedBefore, '重做不覆盖任何已保存视图')
  await editor
    .getByRole('button', { name: '适应画布全图', exact: true })
    .click()
}
