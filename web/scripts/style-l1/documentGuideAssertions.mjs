import assert from 'node:assert/strict'

export async function assertDocumentGuide(guide, { rangeCount } = {}) {
  await guide
    .locator('.erp-document-guide__marker')
    .nth(2)
    .waitFor({ state: 'visible' })
  const metrics = await guide.evaluate((node) => {
    const figure = node.querySelector('figure').getBoundingClientRect()
    const markers = [
      ...node.querySelectorAll('.erp-document-guide__marker'),
    ].map((marker) => {
      const box = marker.getBoundingClientRect()
      return {
        number: marker.querySelector('.erp-document-guide__number').textContent,
        side: marker.parentElement.dataset.side,
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
        fits:
          box.left >= figure.left - 1 &&
          box.right <= figure.right + 1 &&
          box.top >= figure.top - 1 &&
          box.bottom <= figure.bottom + 1,
      }
    })
    return {
      markers,
      ranges: node.querySelectorAll('[data-guide-range]').length,
      leaders: node.querySelectorAll('[data-guide-leader]').length,
      selectedAreas: node.querySelectorAll(
        '.erp-document-guide__highlight--active'
      ).length,
      parts: [...node.querySelectorAll('.erp-document-guide__part')].map(
        (part) => ({
          title: part.querySelector('.erp-document-guide__part-title')
            .textContent,
          description: part.querySelector(
            '.erp-document-guide__part-description'
          ).textContent,
          overflow: part.scrollWidth > part.clientWidth + 1,
        })
      ),
    }
  })
  assert.deepEqual(
    metrics.markers.map((marker) => marker.number),
    ['1', '2', '3']
  )
  if (rangeCount !== undefined) assert.equal(metrics.ranges, rangeCount)
  else assert(metrics.ranges >= 3)
  assert.equal(metrics.leaders, 3)
  assert(metrics.selectedAreas >= 1)
  assert.equal(
    await guide
      .locator('.erp-document-guide__part[aria-pressed="true"]')
      .count(),
    1
  )
  assert(
    metrics.parts.every(
      (part) => part.title && part.description && !part.overflow
    ),
    JSON.stringify(metrics)
  )
  assert(
    metrics.markers.every(
      (marker) => marker.fits && marker.width >= 44 && marker.height >= 44
    ),
    JSON.stringify(metrics)
  )
  for (const side of ['left', 'right']) {
    const sameSide = metrics.markers
      .filter((marker) => marker.side === side)
      .sort((a, b) => a.top - b.top)
    assert(
      sameSide.every(
        (marker, index) =>
          !index || marker.top >= sameSide[index - 1].bottom - 1
      ),
      `编号点击区域不得重叠: ${JSON.stringify(metrics)}`
    )
  }
  await guide.locator('.erp-document-guide__marker').nth(1).press('Enter')
  assert.equal(
    await guide
      .locator('.erp-document-guide__part')
      .nth(1)
      .getAttribute('aria-pressed'),
    'true'
  )
  await guide.locator('.erp-document-guide__part').nth(2).click()
  assert.equal(
    await guide
      .locator('.erp-document-guide__marker')
      .nth(2)
      .getAttribute('aria-pressed'),
    'true'
  )
}
