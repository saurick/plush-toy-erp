import assert from 'node:assert/strict'

export async function assertSingleTableScrollbar(wrapper, scroller) {
  assert.equal(
    await wrapper.locator('.app-table-scroll-range').count(),
    1,
    '宽表只显示一条横向拖动条'
  )
  const native = await scroller.evaluate((node) => {
    const style = getComputedStyle(node)
    const scrollbar = getComputedStyle(node, '::-webkit-scrollbar')
    return {
      color: style.scrollbarColor,
      width: style.scrollbarWidth,
      horizontalSize:
        node.offsetHeight -
        node.clientHeight -
        parseFloat(style.borderTopWidth) -
        parseFloat(style.borderBottomWidth),
      verticalSize: scrollbar.width,
      horizontalStyleSize: scrollbar.height,
      overflowY: style.overflowY,
      verticalOverflow: node.scrollHeight > node.clientHeight + 1,
    }
  })
  // Chromium ignores WebKit scrollbar sizing when standard scrollbar colors
  // or widths take precedence, including colors inherited from Ant's table.
  assert.equal(
    native.color,
    'auto',
    `原生滚动条颜色不能覆盖隐藏规则: ${JSON.stringify(native)}`
  )
  assert.equal(native.width, 'auto', '不能通过隐藏双轴滚动条而移除纵向拖动入口')
  assert.equal(native.horizontalStyleSize, '0px', '浮层原生横向滚动条也应隐藏')
  assert(native.horizontalSize <= 1, '原生横向滚动条不应继续占据表格高度')
  if (native.verticalOverflow && /auto|scroll/.test(native.overflowY)) {
    assert.notEqual(native.verticalSize, '0px', '同时纵向溢出时保留纵向滚动条')
  }
}

export async function exerciseTableScrollPagination(
  page,
  { wrapper, trigger, ready, endpoint, method, offset, shorterPage = false }
) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
  )
  await assertTableScrollDockVisible(page, wrapper)
  let release
  const responseGate = new Promise((resolve) => {
    release = resolve
  })
  const routeHandler = async (route) => {
    const request = route.request().postDataJSON()
    if (
      request?.method === method &&
      Number(request.params?.offset) === offset
    ) {
      await responseGate
    }
    return route.fallback()
  }
  await page.route(endpoint, routeHandler)
  const probe = await wrapper.evaluateHandle((node) => {
    const host = node.querySelector('.app-table-scroll-bottom')
    const dock = node.querySelector('.app-table-scroll-dock')
    const container = node.querySelector('.ant-spin-container')
    const scroller = node.querySelector('.ant-table-content, .ant-table-body')
    const ancestors = []
    for (let parent = node; parent; parent = parent.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(parent).overflowY))
        ancestors.push(parent)
    }
    const frames = []
    let frame = 0
    let awaitingResponse = false
    const sample = () => {
      const current = node.querySelector('.app-table-scroll-dock')
      const box = current?.getBoundingClientRect()
      const pagination = node
        .querySelector('.ant-pagination')
        ?.getBoundingClientRect()
      frames.push({
        awaitingResponse,
        sameHost: node.querySelector('.app-table-scroll-bottom') === host,
        sameDock: current === dock,
        spacer: host.offsetHeight,
        contentHeight: container.scrollHeight,
        minHeight: container.style.minHeight,
        scrollLeft: scroller.scrollLeft,
        sliderValue: Number(current?.querySelector('input').value),
        scrollTops: ancestors.map((parent) => parent.scrollTop),
        visible: Boolean(
          current && getComputedStyle(current).visibility === 'visible'
        ),
        y: box?.y,
        bottom: box?.bottom,
        paginationY: pagination?.y,
      })
      frame = requestAnimationFrame(sample)
    }
    sample()
    return {
      setAwaitingResponse(value) {
        awaitingResponse = value
      },
      finish() {
        cancelAnimationFrame(frame)
        return frames
      },
    }
  })
  try {
    await trigger.click()
    await wrapper.locator('.ant-spin-spinning').waitFor()
    await probe.evaluate((value) => value.setAwaitingResponse(true))
    await page.waitForTimeout(120)
    await probe.evaluate((value) => value.setAwaitingResponse(false))
    release()
    await ready.waitFor()
    await wrapper.locator('.ant-spin-spinning').waitFor({ state: 'hidden' })
    await assertTableScrollDockVisible(page, wrapper)
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
    )
    const frames = await probe.evaluate((value) => value.finish())
    const initial = frames[0]
    const final = frames.at(-1)
    const loading = frames.filter((frame) => frame.awaitingResponse)
    assert(loading.length >= 2, '覆盖真实加载期间的多个绘制帧')
    assert(
      frames.every((frame) => frame.sameHost && frame.sameDock),
      '翻页时不能拆除并重建滚动控件'
    )
    assert(
      frames.every((frame) => frame.spacer === initial.spacer),
      '翻页时滚动条占位高度保持不变'
    )
    assert(
      loading.every(
        (frame) => Math.abs(frame.contentHeight - initial.contentHeight) <= 1
      ),
      '加载时保留表格高度，避免先缩短再撑开'
    )
    assert(
      loading.every((frame) =>
        frame.scrollTops.every(
          (top, index) => Math.abs(top - initial.scrollTops[index]) <= 1
        )
      ),
      '清空加载数据不能把外层滚动位置拉回顶部'
    )
    assert(
      loading.every((frame) => !frame.visible),
      '加载期间隐藏拖动条，完成定位后再显示'
    )
    const visible = frames.filter((frame) => frame.visible)
    assert(
      visible.every(
        (frame) =>
          frame.y >= 0 && frame.bottom <= page.viewportSize().height + 1
      ),
      '翻页过渡帧的横向条不能跳出视口'
    )
    assert(
      visible.every(
        (frame) =>
          frame.paginationY === undefined ||
          frame.bottom <= frame.paginationY + 1
      ),
      '翻页过渡帧不能遮挡分页'
    )
    if (!shorterPage) {
      assert(
        visible.every((frame) => Math.abs(frame.y - initial.y) <= 1),
        `同高度分页的横向条位置应稳定: ${JSON.stringify(visible)}`
      )
    } else {
      assert(
        final.contentHeight < initial.contentHeight,
        '少行末页必须恢复实际高度，不能残留加载占位'
      )
      const positions = visible.reduce((values, frame) => {
        if (!values.length || Math.abs(values.at(-1) - frame.y) > 1)
          values.push(frame.y)
        return values
      }, [])
      assert(
        positions.length <= 2,
        `末页只能从原位置更新到最终位置，不能来回跳动: ${positions}`
      )
    }
    assert.equal(final.minHeight, initial.minHeight, '响应完成后解除临时高度')
    assert(
      Math.abs(final.scrollLeft - final.sliderValue) <= 1,
      '翻页后滑块必须和横向滚动位置同步'
    )
    return {
      frames: frames.length,
      loadingFrames: loading.length,
      firstY: initial.y,
      finalY: frames.at(-1).y,
    }
  } finally {
    release()
    await probe.evaluate((value) => value.finish())
    await probe.dispose()
    await page.unroute(endpoint, routeHandler)
  }
}

export async function tableScrollButtons(page, wrapper) {
  await page.waitForFunction(
    (node) => Boolean(node.dataset.tableScrollId),
    await wrapper.elementHandle()
  )
  const id = await wrapper.getAttribute('data-table-scroll-id')
  return page.locator(
    `.app-table-scroll-buttons[data-table-scroll-for="${id}"]`
  )
}

export async function assertTableScrollDockVisible(page, wrapper) {
  const dock = wrapper.locator('.app-table-scroll-dock').first()
  await dock.waitFor()
  const box = await dock.boundingBox()
  assert(
    box.y >= 0 && box.y + box.height <= page.viewportSize().height + 1,
    '长表的拖动条应留在表格可视区域内'
  )
  const pagination = wrapper.locator('.ant-pagination')
  if (await pagination.count()) {
    const paginationBox = await pagination.boundingBox()
    assert(box.y + box.height <= paginationBox.y + 1, '拖动条不能遮挡分页')
  }
}

export async function exerciseTableScrollSettling(page, wrapper, scroller) {
  const handle = await scroller.evaluateHandle((node) => {
    for (let parent = node; parent; parent = parent.parentElement) {
      if (
        parent.scrollHeight > parent.clientHeight + 100 &&
        /auto|scroll/.test(getComputedStyle(parent).overflowY)
      )
        return parent
    }
    return null
  })
  const vertical = handle.asElement()
  if (!vertical) {
    await handle.dispose()
    return
  }
  const dock = wrapper.locator('.app-table-scroll-dock').first()
  await scroller.hover()
  await dock.waitFor({ state: 'visible' })
  const initial = await vertical.evaluate((node) => ({
    top: node.scrollTop,
    max: node.scrollHeight - node.clientHeight,
    height: node.scrollHeight,
  }))
  const direction = initial.top < initial.max / 2 ? 1 : -1
  const distance = Math.min(
    32,
    (direction > 0 ? initial.max - initial.top : initial.top) / 6
  )
  for (let index = 0; index < 4; index += 1) {
    const before = await vertical.evaluate((node) => node.scrollTop)
    await page.mouse.wheel(0, direction * distance)
    await page.waitForFunction(
      ({ node, before }) => node.scrollTop !== before,
      { node: vertical, before }
    )
    await dock.waitFor({ state: 'hidden' })
    await page.waitForTimeout(60)
    assert.equal(
      await dock.isVisible(),
      false,
      '连续纵向滚动期间不能反复闪现横向条'
    )
  }
  await dock.waitFor({ state: 'visible' })
  assert.equal(
    await vertical.evaluate((node) => node.scrollHeight),
    initial.height,
    '隐藏拖动条不能改变内容高度'
  )
  await assertTableScrollDockVisible(page, wrapper)
  const settled = await dock.boundingBox()
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
  )
  const stable = await dock.boundingBox()
  assert(Math.abs(settled.y - stable.y) < 1, '停稳后拖动条的位置应保持稳定')
  await vertical.evaluate((node, top) => {
    node.scrollTop = top
  }, initial.top)
  await dock.waitFor({ state: 'hidden' })
  await page.waitForFunction(
    (node) => getComputedStyle(node).visibility === 'visible',
    await dock.elementHandle()
  )
  await handle.dispose()
}

export async function exerciseTableScrollControls(page, wrapper, scroller) {
  const actions = await tableScrollButtons(page, wrapper)
  await actions.waitFor()
  await assertSingleTableScrollbar(wrapper, scroller)
  assert.equal(
    await actions.getByRole('button').count(),
    2,
    '每张宽表只有一组两个方向按钮'
  )
  assert.equal(
    await wrapper.locator('.app-table-scroll-arrows').count(),
    0,
    '不叠加边缘悬浮按钮'
  )
  const left = actions.getByRole('button', { name: '向左查看列', exact: true })
  const right = actions.getByRole('button', { name: '向右查看列', exact: true })
  assert.equal(await left.isEnabled(), false, '首列处禁用向左箭头')
  const before = await scroller.evaluate((node) => {
    const row = node.querySelector(
      'tbody > tr.ant-table-row, tbody > tr:not(.ant-table-measure-row)'
    )
    const fixedWidth = Array.from(row?.cells || []).reduce(
      (sum, cell) =>
        sum +
        (getComputedStyle(cell).position === 'sticky'
          ? cell.getBoundingClientRect().width
          : 0),
      0
    )
    return {
      left: node.scrollLeft,
      max: node.scrollWidth - node.clientWidth,
      step: Math.max(80, (node.clientWidth - fixedWidth) * 0.8),
    }
  })
  await page.mouse.move(1, 1)
  assert.equal(
    await right.evaluate((node) => getComputedStyle(node).opacity),
    '1',
    '顶部入口不依赖 hover 才能发现'
  )
  await right.click()
  await page.waitForFunction(
    ({ node, target }) => Math.abs(node.scrollLeft - target) < 2,
    {
      node: await scroller.elementHandle(),
      target: Math.min(before.max, before.left + before.step),
    }
  )
  assert.equal(await left.isEnabled(), true)
  await left.press('Enter')
  await page.waitForFunction(
    (node) => node.scrollLeft <= 1,
    await scroller.elementHandle()
  )

  await exerciseTableScrollSettling(page, wrapper, scroller)
  await assertTableScrollDockVisible(page, wrapper)
  const range = wrapper
    .getByRole('slider', { name: '横向滚动位置', exact: true })
    .first()
  await range.evaluate((node) => node.blur())
  await page.mouse.move(1, 1)
  const resting = await range.evaluate((node) => ({
    thickness: parseFloat(
      getComputedStyle(node).getPropertyValue('--table-scroll-thickness')
    ),
    box: node.getBoundingClientRect().toJSON(),
  }))
  await range.hover()
  const hovered = await range.evaluate((node) => ({
    thickness: parseFloat(
      getComputedStyle(node).getPropertyValue('--table-scroll-thickness')
    ),
    box: node.getBoundingClientRect().toJSON(),
  }))
  assert(hovered.thickness > resting.thickness, '悬停时轨道和滑块应加粗')
  assert.equal(hovered.box.height, resting.box.height, '加粗不能扩大外层高度')
  assert.equal(hovered.box.y, resting.box.y, '加粗不能使横向条上下移动')
  await range.press('End')
  await page.waitForFunction(
    (node) => node.scrollWidth - node.clientWidth - node.scrollLeft <= 1,
    await scroller.elementHandle()
  )
  await page.waitForFunction(
    (node) => node.disabled,
    await right.elementHandle()
  )
  await range.press('Home')
  await page.waitForFunction(
    (node) => node.scrollLeft <= 1,
    await scroller.elementHandle()
  )

  const geometry = await range.evaluate((node) => ({
    box: node.getBoundingClientRect().toJSON(),
    thumb: parseFloat(
      getComputedStyle(node).getPropertyValue('--table-scroll-thumb')
    ),
  }))
  const { box, thumb } = geometry
  await page.mouse.move(box.x + thumb / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - thumb / 2, box.y + box.height / 2, {
    steps: 8,
  })
  assert.equal(await range.isVisible(), true, '横向拖动期间始终保留滚动条')
  await page.mouse.up()
  await page.waitForFunction(
    (node) => node.scrollLeft >= (node.scrollWidth - node.clientWidth) * 0.95,
    await scroller.elementHandle()
  )
  await range.press('Home')
  await page.waitForFunction(
    ({ node, input }) => node.scrollLeft <= 1 && Number(input.value) <= 1,
    { node: await scroller.elementHandle(), input: await range.elementHandle() }
  )
  await range.evaluate((node) => node.blur())
}
