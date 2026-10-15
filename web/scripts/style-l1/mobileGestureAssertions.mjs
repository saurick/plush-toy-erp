import assert from 'node:assert/strict'

// Chromium 保留原生触摸注入；WebKit 的多指事件只验证处理逻辑，报告单独标记。
export async function createMobileTouchSession(page) {
  const browser = page.context().browser().browserType().name()
  if (browser === 'chromium') {
    const client = await page.context().newCDPSession(page)
    await client.send('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 2,
    })
    page.__styleL1TouchBackend = 'chromium-native-cdp'
    return client
  }
  assert.equal(browser, 'webkit', '手势驱动只支持明确登记的浏览器')
  page.__styleL1TouchBackend = 'webkit-dom-touch-events'
  let state
  return {
    async send(method, { type, touchPoints = [] }) {
      assert.equal(method, 'Input.dispatchTouchEvent')
      state ||= await page.evaluateHandle(() => ({ target: null, points: [] }))
      await page.evaluate(
        ({ state, type, points }) => {
          const names = {
            touchStart: 'touchstart',
            touchMove: 'touchmove',
            touchEnd: 'touchend',
            touchCancel: 'touchcancel',
          }
          if (!names[type]) throw new Error(`未知触摸事件: ${type}`)
          if (!state.points.length && points.length) {
            state.target = document.elementFromPoint(points[0].x, points[0].y)
          }
          if (!state.target) throw new Error('触摸起点必须命中页面元素')
          const touch = (point) => ({
            identifier: point.id,
            target: state.target,
            clientX: point.x,
            clientY: point.y,
            pageX: point.x + scrollX,
            pageY: point.y + scrollY,
          })
          const changed =
            type === 'touchEnd' || type === 'touchCancel'
              ? state.points.filter(
                  (old) => !points.some((next) => next.id === old.id)
                )
              : points
          const touches = points.map(touch)
          const event = new Event(names[type], {
            bubbles: true,
            cancelable: true,
          })
          Object.defineProperties(event, {
            touches: { value: touches },
            targetTouches: { value: touches },
            changedTouches: { value: changed.map(touch) },
          })
          state.target.dispatchEvent(event)
          state.points = points
        },
        { state, type, points: touchPoints }
      )
    },
    async detach() {
      await state?.dispose()
    },
  }
}

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
  const client = await createMobileTouchSession(page)
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
