import assert from 'node:assert/strict'

// 真实触摸手势触发下拉刷新，避免用不存在的按钮或合成 DOM 事件代替用户路径。
export async function pullToRefresh(page, scroll) {
  const indicator = scroll.getByTestId('mobile-task-pull-refresh')
  await indicator.waitFor({ state: 'attached' })
  await scroll.evaluate((node) => {
    document.activeElement?.blur()
    node.scrollTop = 0
  })
  const node = await scroll.elementHandle()
  await page.waitForFunction(
    (root) =>
      root.querySelector('[data-testid="mobile-task-pull-refresh"]')?.dataset
        .state === 'idle' &&
      root.scrollTop === 0 &&
      root.closest('[data-refreshing]')?.getAttribute('data-refreshing') !==
        'true',
    node
  )
  const bounds = await scroll.boundingBox()
  const x = Math.round(bounds.x + bounds.width / 2)
  const y = Math.round(Math.min(bounds.y + 300, bounds.y + bounds.height - 180))
  assert(
    await scroll.evaluate(
      (node, point) =>
        node.contains(document.elementFromPoint(point.x, point.y)),
      { x, y }
    ),
    '下拉起点必须落在当前列表内'
  )
  const client = await page.context().newCDPSession(page)
  await client.send('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 2,
  })
  try {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, id: 1 }],
    })
    for (const delta of [20, 45, 80, 120, 150]) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y + delta, id: 1 }],
      })
    }
    await page.waitForFunction(
      (root) =>
        root.querySelector('[data-testid="mobile-task-pull-refresh"]')?.dataset
          .state === 'ready',
      node
    )
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
  } finally {
    await client.detach()
  }
}
