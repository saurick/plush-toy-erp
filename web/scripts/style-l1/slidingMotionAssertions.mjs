import { waitForFiniteAnimations } from './browserReadiness.mjs'

export async function verifyMobileNavigationMotion(
  page,
  assert,
  selector,
  targetIndex,
  reduced = false
) {
  await page.emulateMedia({
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  })
  await waitForFiniteAnimations(page)
  const control = page.locator(selector)
  await control
    .locator('.ant-segmented-item, [role="tab"]')
    .nth(targetIndex)
    .click({ trial: true })
  const result = await control.evaluate(async (root, index) => {
    const segmented = root.querySelector('.ant-segmented-group')
    const group = segmented || root.querySelector('.ant-tabs-nav-list') || root
    const antdTabs = group.matches('.ant-tabs-nav-list')
    const target = group.querySelectorAll(
      segmented
        ? '.ant-segmented-item'
        : antdTabs
          ? '.ant-tabs-tab'
          : '[role="tab"]'
    )[index]
    const surface = antdTabs ? group : root
    const before = surface.getBoundingClientRect()
    const read = () => {
      const style = getComputedStyle(group, '::before')
      const rect = surface.getBoundingClientRect()
      return {
        x: new DOMMatrixReadOnly(
          style.transform === 'none' ? undefined : style.transform
        ).m41,
        duration: style.transitionDuration,
        selected: segmented
          ? target.classList.contains('erp-segmented-item-selected')
          : antdTabs
            ? target.classList.contains('ant-tabs-tab-active')
            : target.getAttribute('aria-selected') === 'true',
        mounted: root.isConnected && group.isConnected,
        box: [rect.x, rect.y, rect.width, rect.height],
      }
    }
    const start = read().x
    const frames = []
    target.click()
    const began = performance.now()
    await new Promise((resolve) => {
      const tick = () => {
        frames.push(read())
        if (performance.now() - began < 650) requestAnimationFrame(tick)
        else resolve()
      }
      requestAnimationFrame(tick)
    })
    const after = surface.getBoundingClientRect()
    return {
      start,
      target: target.offsetLeft,
      frames,
      mounted: root.isConnected && group.isConnected,
      widthDelta: after.width - before.width,
      heightDelta: after.height - before.height,
      selected: segmented
        ? target.querySelector('input').checked
        : antdTabs
          ? target.classList.contains('ant-tabs-tab-active')
          : target.getAttribute('aria-selected') === 'true',
    }
  }, targetIndex)
  assert(result.mounted && result.selected, JSON.stringify(result))
  const selectedFrame = result.frames.findIndex((frame) => frame.selected)
  assert(selectedFrame >= 0, '切换必须实际选中目标页签')
  assert(
    result.frames.slice(selectedFrame).every((frame) => frame.selected),
    `选中目标后不能被旧状态拉回: ${JSON.stringify(result)}`
  )
  assert(
    result.frames.every((frame) => frame.mounted),
    `切换期间保留同一个页签条: ${JSON.stringify(result)}`
  )
  for (let dimension = 0; dimension < 4; dimension += 1) {
    assert(
      result.frames.every(
        (frame) =>
          Math.abs(frame.box[dimension] - result.frames[0].box[dimension]) < 1
      ),
      `页签条位置和尺寸不能随切换抖动: ${JSON.stringify(result)}`
    )
  }
  assert(
    Math.abs(result.widthDelta) < 1 && Math.abs(result.heightDelta) < 1,
    JSON.stringify(result)
  )
  assert(
    Math.abs(result.frames.at(-1).x - result.target) < 1.5,
    JSON.stringify(result)
  )
  if (reduced) {
    assert(
      result.frames.every((frame) =>
        frame.duration.split(',').every((value) => parseFloat(value) === 0)
      ),
      JSON.stringify(result)
    )
  } else {
    const direction = Math.sign(result.target - result.start)
    assert(
      result.frames.every(
        (frame, index, frames) =>
          index === 0 || direction * (frame.x - frames[index - 1].x) >= -1
      ),
      `单次切换的指示条不能反向回跳: ${JSON.stringify(result)}`
    )
    assert(
      result.frames.some(
        (frame) =>
          frame.x > Math.min(result.start, result.target) + 2 &&
          frame.x < Math.max(result.start, result.target) - 2
      ),
      JSON.stringify(result)
    )
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  return result
}
