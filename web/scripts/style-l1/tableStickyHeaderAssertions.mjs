import assert from 'node:assert/strict'
import { expect } from 'playwright/test'

export async function assertTableStickyHeaderAlignment(editor) {
  const regions = editor.locator('.app-table-sticky-region:visible')
  for (let index = 0; index < await regions.count(); index += 1) {
    const region = regions.nth(index)
    await expect.poll(() => region.evaluate((node) => {
      const source = node.querySelector(':scope > [data-table-scroll-id] table > thead')
      const mirror = node.querySelector('.app-table-sticky-header thead')
      if (!source?.getBoundingClientRect().height || getComputedStyle(source.closest('table')).display !== 'table') return true
      return Boolean(mirror)
    })).toBe(true)
    const metrics = await region.evaluate((node) => {
      const host = node.querySelector('[data-table-sticky-header]')
      if (host.hidden) return { hidden: true }
      const source = node.querySelector(':scope > [data-table-scroll-id] table > thead')
      const mirror = host.querySelector('thead')
      const original = [...source.rows[0].cells]
      const copied = [...mirror.rows[0].cells]
      return {
        hidden: false,
        ariaHidden: host.getAttribute('aria-hidden'),
        inert: host.querySelector('table').hasAttribute('inert'),
        sourceHeight: source.getBoundingClientRect().height,
        height: mirror.getBoundingClientRect().height,
        hostHeight: host.getBoundingClientRect().height,
        aligned: original.length === copied.length && original.every((cell, cellIndex) => {
          const box = cell.getBoundingClientRect()
          const copy = copied[cellIndex].getBoundingClientRect()
          return cell.textContent === copied[cellIndex].textContent && Math.abs(box.left - copy.left) <= 1 && Math.abs(box.width - copy.width) <= 1
        }),
        ids: host.querySelectorAll('[id]').length,
        inputCount: host.querySelectorAll('input, textarea, select').length,
      }
    })
    if (metrics.hidden) continue
    assert.equal(metrics.ariaHidden, 'true', '镜像列名不重复进入无障碍树')
    assert.equal(metrics.inert, true)
    assert.equal(metrics.ids, 0, '镜像不复制表单或帮助入口 ID')
    assert.equal(metrics.inputCount, 0, '字段只保留原始表内一份')
    assert.equal(metrics.aligned, true, `吸顶列名与原表对齐：${JSON.stringify(metrics)}`)
    assert.ok(Math.abs(metrics.height - metrics.sourceHeight) <= 1, `保留原始表头行高：${JSON.stringify(metrics)}`)
    assert.ok(metrics.hostHeight >= metrics.height, `吸顶列名具有完整可视高度：${JSON.stringify(metrics)}`)
  }
}
