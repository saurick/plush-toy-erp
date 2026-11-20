import { waitForFiniteAnimations } from './browserReadiness.mjs'

export async function assertMobileFilterSummary({ assert, trigger }) {
  const geometry = await trigger.evaluate((node) => {
    const controls = node.closest('.mobile-task-list-toolbar, .mobile-progress-controls, .mobile-workflow-tracking-controls')
    const box = controls.getBoundingClientRect()
    return { height: box.height, summary: node.querySelector('.mobile-filter-trigger__label').textContent, extraRows: controls.querySelectorAll('.mobile-applied-filters').length }
  })
  assert.equal(geometry.extraRows, 0, '已选条件合入筛选入口，不增加标签行')
  assert(geometry.summary && geometry.summary !== '筛选', '入口直接显示所选条件')
  assert(geometry.height <= 160, `查询区保持紧凑：${JSON.stringify(geometry)}`)
}

export async function assertMobileFilterConsistency({ assert, quick, applied }) {
  await applied.waitFor()
  await applied.page().evaluate(() => document.fonts.ready)
  const selected = quick.locator('button[aria-pressed="true"]').first()
  await applied.page().waitForFunction((node) => !node.disabled, await selected.elementHandle())
  await applied.page().mouse.move(0, 0)
  await waitForFiniteAnimations(applied.page())
  const quickBox = await quick.boundingBox()
  const appliedBox = await applied.boundingBox()
  assert(quickBox.y + quickBox.height <= appliedBox.y + 1, '已选条件应在快捷筛选下方')
  assert(Math.abs(quickBox.x - appliedBox.x) <= 1, '两组筛选左侧对齐')
  const readStyle = (node) => {
    const style = getComputedStyle(node)
    return Object.fromEntries(['fontSize', 'fontWeight', 'borderRadius', 'borderColor', 'backgroundColor', 'color', 'padding'].map((key) => [key, style[key]]))
  }
  const expected = await selected.evaluate(readStyle)
  for (const chip of await applied.locator('.erp-filter-chip').all()) {
    assert.deepEqual(await chip.evaluate(readStyle), expected, '已选条件复用快捷筛选的选中样式')
    assert.equal(await chip.locator('.erp-filter-chip__clear').count(), 1)
    const metrics = await chip.evaluate((node) => {
      const box = node.getBoundingClientRect()
      const close = node.querySelector('.erp-filter-chip__clear').getBoundingClientRect()
      return { height: box.height, overflow: node.scrollWidth - node.clientWidth, closeInside: close.left >= box.left && close.right <= box.right && close.bottom <= box.bottom }
    })
    assert(metrics.height >= 44 && metrics.overflow <= 1 && metrics.closeInside, JSON.stringify(metrics))
  }
  assert.equal(await applied.getByRole('button').count(), await applied.locator('.erp-filter-chip').count(), '条件行只保留单项取消')
}

export async function assertMobileFilterClearControl({ assert, trigger, active = true }) {
  const group = trigger.locator('..')
  const clear = group.locator('.mobile-filter-clear')
  assert.equal(await clear.count(), Number(active), '仅在有条件时显示右侧清空图标')
  assert.equal(await group.locator('button button').count(), 0)
  assert.equal(await group.getAttribute('role'), 'group')
  if (!active) return
  const geometry = await group.evaluate((node) => {
    const rect = (element) => element?.getBoundingClientRect().toJSON()
    return {
      group: rect(node),
      trigger: rect(node.querySelector('.mobile-filter-trigger')),
      clear: rect(node.querySelector('.mobile-filter-clear')),
      search: rect(node.previousElementSibling),
      input: rect(node.previousElementSibling?.querySelector('input')),
      viewportWidth: window.innerWidth,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
  assert(geometry.trigger.width >= 44 && geometry.trigger.height >= 44 && geometry.clear.width >= 44 && geometry.clear.height >= 44, JSON.stringify(geometry))
  assert(Math.abs(geometry.clear.left - geometry.trigger.right) <= 1 && Math.abs(geometry.clear.top - geometry.trigger.top) <= 1, '筛选与取消并排、独立且对齐')
  assert(geometry.group.left >= 0 && geometry.group.right <= geometry.viewportWidth && geometry.overflow <= 1, JSON.stringify(geometry))
  if (geometry.search) assert(geometry.search.right <= geometry.group.left && Math.abs(geometry.search.top - geometry.group.top) <= 1 && Math.abs(geometry.search.height - geometry.group.height) <= 1, `搜索与筛选不重叠且保持同高：${JSON.stringify(geometry)}`)
  if (geometry.input && geometry.input.width < 44) {
    assert(geometry.search.width >= 44, '紧凑搜索入口保留触摸区域')
    const search = group.locator('xpath=preceding-sibling::*[1]')
    await search.locator('.ant-input-affix-wrapper').click({ position: { x: 10, y: 23 } })
    await waitForFiniteAnimations(trigger.page())
    assert((await search.locator('input').boundingBox()).width >= 44, '展开后搜索输入区域可操作')
    await search.getByRole('button', { name: '取消搜索', exact: true }).click()
    await trigger.waitFor({ state: 'visible' })
  }
}
