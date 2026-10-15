import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getContrastRatio } from './colorAssertions.mjs'

// Sample the actual business page while its content changes, so a passing
// isolated navigation fixture cannot conceal a remounted or displaced strip.
export async function assertBusinessViewMotion(page, name, outputDir) {
  const group = page.locator('.erp-business-visual-switch .ant-segmented-group')
  await group.waitFor()
  await group.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {})))
  })
  const sample = async (reverse) =>
    group.evaluate(async (element, reverse) => {
      const items = [...element.querySelectorAll('.ant-segmented-item')]
      const selected = items.findIndex(
        (item) => item.querySelector('input').checked
      )
      const target = items.findIndex((_, index) => index !== selected)
      const read = () => {
        const style = getComputedStyle(element, '::before')
        const rect = element.getBoundingClientRect()
        return {
          x: new DOMMatrixReadOnly(style.transform).m41,
          width: parseFloat(style.width),
          opacity: style.opacity,
          top: rect.top,
          height: rect.height,
          connected: element.isConnected,
        }
      }
      const first = read()
      const targetX = items[target].offsetLeft
      const frames = []
      items[target].click()
      const start = performance.now()
      let reversed = false
      await new Promise((resolve) => {
        const frame = () => {
          const elapsed = performance.now() - start
          frames.push({ elapsed, ...read() })
          if (reverse && !reversed && elapsed >= 100) {
            items[selected].click()
            reversed = true
          }
          if (elapsed < 650) requestAnimationFrame(frame)
          else resolve()
        }
        requestAnimationFrame(frame)
      })
      const final = items.find((item) => item.querySelector('input').checked)
      return {
        first,
        targetX,
        frames,
        expected: { x: final.offsetLeft, width: final.offsetWidth },
      }
    }, reverse)
  const samples = []
  for (const reverse of [true, false]) {
    const result = await sample(reverse)
    samples.push({ reverse, ...result })
    await writeFile(path.join(outputDir, `${name}-motion.json`), JSON.stringify({ samples }, null, 2))
    const distance = Math.abs(result.targetX - result.first.x)
    assert.ok(distance > 5, `${name}: 两个视图选项应具有不同位置`)
    assert.ok(
      result.frames.some((frame) => {
        const progress = Math.abs(frame.x - result.first.x) / distance
        return progress > 0.08 && progress < 0.85
      }),
      `${name}: 页签高亮必须经过中间位置`
    )
    assert.ok(
      result.frames.every(
        (frame) => frame.connected && frame.opacity === '1' && frame.width > 0
      ),
      `${name}: 切换内容不能重新挂载或隐藏指示条`
    )
    assert.ok(
      result.frames.every(
        (frame) =>
          Math.abs(frame.top - result.first.top) < 1 &&
          Math.abs(frame.height - result.first.height) < 1
      ),
      `${name}: 切换内容不能改变页签条位置和高度`
    )
    const last = result.frames.at(-1)
    assert.ok(
      Math.abs(last.x - result.expected.x) < 1.5 &&
        Math.abs(last.width - result.expected.width) < 1.5,
      `${name}: 指示条最终应对准选中项`
    )
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const reduced = await group.evaluate(
    (element) => getComputedStyle(element, '::before').transitionDuration
  )
  assert.ok(
    reduced.split(',').every((value) => parseFloat(value) === 0),
    `${name}: 减少动态效果时不应继续滑动`
  )
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await writeFile(
    path.join(outputDir, `${name}-motion.json`),
    JSON.stringify({ samples, reduced }, null, 2)
  )
}

export async function captureBusinessView(page, panel, name, width, outputDir) {
  await panel.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .filter(
          (animation) =>
            animation.effect.getComputedTiming().iterations !== Infinity
        )
        .map((animation) => animation.finished)
    )
  })
  await panel.evaluate((element) => element.scrollIntoView({ block: 'start' }))
  const colors = await panel.evaluate((element) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const rgba = (value) => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = value
      context.fillRect(0, 0, 1, 1)
      const color = [...context.getImageData(0, 0, 1, 1).data]
      color[3] /= 255
      return color
    }
    const blend = (color, background) =>
      color
        .slice(0, 3)
        .map(
          (channel, index) =>
            channel * color[3] + background[index] * (1 - color[3])
        )
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    const values = []
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent.trim()
      const node = walker.currentNode.parentElement
      if (
        !text ||
        !node ||
        node.closest('[disabled], [aria-disabled="true"]') ||
        !node.checkVisibility()
      )
        continue
      let background = [255, 255, 255]
      const ancestors = []
      for (let parent = node; parent; parent = parent.parentElement)
        ancestors.unshift(parent)
      for (const parent of ancestors)
        background = blend(
          rgba(getComputedStyle(parent).backgroundColor),
          background
        )
      values.push({
        text,
        foreground: blend(rgba(getComputedStyle(node).color), background),
        background,
      })
    }
    return values
  })
  const contrast = colors.map((color) => ({
    ...color,
    ratio: getContrastRatio(color.foreground, color.background),
  }))
  await writeFile(
    path.join(outputDir, `${name}-${width}-contrast.json`),
    JSON.stringify(contrast, null, 2)
  )
  const unreadable = contrast.filter((color) => color.ratio < 4.5)
  assert.deepEqual(
    unreadable,
    [],
    `${name}-${width}: 视图文字对比度应达到 4.5:1`
  )
  const metrics = await panel.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return [
      ...element.querySelectorAll('.erp-business-visual-metrics button'),
    ].map((button) => {
      const rect = button.getBoundingClientRect()
      return {
        label: button.textContent,
        left: rect.left - bounds.left,
        right: bounds.right - rect.right,
      }
    })
  })
  assert.ok(
    metrics.every((metric) => metric.left >= 0 && metric.right >= 0),
    `${name}-${width}: 筛选数字不能被视图边界裁掉: ${JSON.stringify(metrics)}`
  )
  await page.screenshot({
    path: path.join(outputDir, `${name}-${width}.png`),
    fullPage: false,
  })
}
