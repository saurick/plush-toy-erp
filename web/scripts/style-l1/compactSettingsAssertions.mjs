import { waitForFiniteAnimations } from './browserReadiness.mjs'

export async function assertCompactSettingsModal(page, dialog, assert, { label, maxWidth = 800 }) {
  await waitForFiniteAnimations(page, '.ant-modal')
  const metrics = await dialog.evaluate((node) => {
    const modal = node.getBoundingClientRect()
    const wrap = node.closest('.ant-modal-wrap').getBoundingClientRect()
    const body = node.querySelector('.ant-modal-body')
    const footer = node.querySelector('.ant-modal-footer').getBoundingClientRect()
    return {
      width: modal.width,
height: modal.height,
      offsetX: modal.x + modal.width / 2 - wrap.x - wrap.width / 2,
      offsetY: modal.y + modal.height / 2 - wrap.y - wrap.height / 2,
      fits: modal.top >= wrap.top - 1 && modal.bottom <= wrap.bottom + 1 && modal.left >= wrap.left - 1 && modal.right <= wrap.right + 1,
      footerVisible: footer.top >= wrap.top && footer.bottom <= wrap.bottom,
      bodyWidth: body.clientWidth,
bodyScrollWidth: body.scrollWidth,
      fields: [...node.querySelectorAll('.ant-form-item')].length,
    }
  })
  assert(metrics.width <= maxWidth && metrics.fits && metrics.footerVisible, `${label}: 窗口及底部操作保持可达 ${JSON.stringify(metrics)}`)
  assert(Math.abs(metrics.offsetX) <= 1 && Math.abs(metrics.offsetY) <= 1, `${label}: 在所属工作区居中 ${JSON.stringify(metrics)}`)
  assert(metrics.bodyScrollWidth <= metrics.bodyWidth + 1, `${label}: 横向滚动仅留在表格内 ${JSON.stringify(metrics)}`)
  return metrics
}
