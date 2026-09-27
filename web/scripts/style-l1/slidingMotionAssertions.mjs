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
    const group = segmented || root
    const target = group.querySelectorAll(
      segmented ? '.ant-segmented-item' : '[role="tab"]'
    )[index]
    const before = root.getBoundingClientRect()
    const read = () => {
      const style = getComputedStyle(group, '::before')
      return {
        x: new DOMMatrixReadOnly(
          style.transform === 'none' ? undefined : style.transform
        ).m41,
        duration: style.transitionDuration,
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
    const after = root.getBoundingClientRect()
    return {
      start,
      target: target.offsetLeft,
      frames,
      mounted: root.isConnected && group.isConnected,
      widthDelta: after.width - before.width,
      heightDelta: after.height - before.height,
      selected: segmented
        ? target.querySelector('input').checked
        : target.getAttribute('aria-selected') === 'true',
    }
  }, targetIndex)
  assert(result.mounted && result.selected, JSON.stringify(result))
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
}
