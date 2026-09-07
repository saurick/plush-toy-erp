import assert from 'node:assert/strict'

export async function assertPrintTemplateGuide(page) {
  await page
    .locator('.erp-template-guide__marker')
    .nth(2)
    .waitFor({ state: 'visible' })
  const metrics = await page.evaluate(() => {
    const guide = document.querySelector('.erp-template-guide')
    const paper = guide.querySelector('.erp-template-guide__paper')
    const figureRect = guide.querySelector('figure').getBoundingClientRect()
    const parts = [...guide.querySelectorAll('.erp-template-guide__parts li')]
    const markers = [...guide.querySelectorAll('.erp-template-guide__marker')]
    return {
      inert: paper.inert,
      partCount: parts.length,
      markerCount: markers.length,
      parts: parts.map((part) => ({
        title: part.querySelector('h4').textContent,
        description: part.querySelector('p').textContent,
        overflow: part.scrollWidth > part.clientWidth + 1,
      })),
      markers: markers.map((marker) => {
        const rect = marker.getBoundingClientRect()
        const target = paper.querySelector(marker.dataset.guideTarget)
        const targetRect = target?.getBoundingClientRect()
        return {
          number: marker.textContent,
          targetFound: Boolean(targetRect?.width && targetRect?.height),
          distance: targetRect
            ? Math.abs(
                rect.y + rect.height / 2 - targetRect.y - targetRect.height / 2
              )
            : null,
          fits: rect.right <= figureRect.right + 1,
        }
      }),
    }
  })
  assert.equal(metrics.inert, true, '模板说明中的纸面必须禁止编辑和上传')
  assert.equal(metrics.partCount, 3, '每种模板应直接显示三条分区说明')
  assert.equal(metrics.markerCount, 3, '每条说明都应有对应的纸面编号')
  assert(
    metrics.parts.every(
      (part) => part.title && part.description && !part.overflow
    ),
    JSON.stringify(metrics)
  )
  assert(
    metrics.markers.every(
      (marker, index) =>
        marker.number === String(index + 1) &&
        marker.targetFound &&
        marker.distance < 2 &&
        marker.fits
    ),
    JSON.stringify(metrics)
  )
}
