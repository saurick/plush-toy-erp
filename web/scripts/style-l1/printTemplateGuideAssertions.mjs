import assert from 'node:assert/strict'
import { assertDocumentGuide } from './documentGuideAssertions.mjs'

export async function assertPrintTemplateGuide(page) {
  const guide = page.locator('.erp-template-guide')
  await assertDocumentGuide(guide)
  const metrics = await guide.evaluate((node) => {
    const paper = node.querySelector('.erp-template-guide__paper')
    return {
      inert: paper.inert,
      partCount: node.querySelectorAll('.erp-document-guide__parts li').length,
      regions: [...node.querySelectorAll('.erp-document-guide__marker')].map(
        (marker) => {
          const targets = [
            ...paper.querySelectorAll(marker.dataset.guideTarget),
          ]
            .map((target) => target.getBoundingClientRect())
            .filter((rect) => rect.width && rect.height)
          const lines = [
            ...marker.parentElement.querySelectorAll('[data-guide-range]'),
          ].map((line) => line.getBoundingClientRect())
          return {
            targetCount: targets.length,
            targetsCovered: targets.every((target) =>
              lines.some(
                (line) =>
                  line.top <= target.top + 1 && line.bottom >= target.bottom - 1
              )
            ),
            noUnrelatedRows:
              !marker.hasAttribute('data-guide-separate-targets') ||
              lines.every(
                (line) =>
                  targets.reduce(
                    (sum, target) =>
                      sum +
                      Math.max(
                        0,
                        Math.min(target.bottom, line.bottom) -
                          Math.max(target.top, line.top)
                      ),
                    0
                  ) >=
                  line.height - 1
              ),
            topDistance: Math.abs(
              Math.min(...lines.map((line) => line.top)) -
                Math.min(...targets.map((rect) => rect.top))
            ),
            bottomDistance: Math.abs(
              Math.max(...lines.map((line) => line.bottom)) -
                Math.max(...targets.map((rect) => rect.bottom))
            ),
          }
        }
      ),
    }
  })
  assert.equal(metrics.inert, true, '模板说明中的纸面必须禁止编辑和上传')
  assert.equal(metrics.partCount, 3, '每种模板应直接显示三条分区说明')
  assert(
    metrics.regions.every(
      (region) =>
        region.targetCount &&
        region.targetsCovered &&
        region.noUnrelatedRows &&
        region.topDistance < 2 &&
        region.bottomDistance < 2
    ),
    `范围线须覆盖全部匹配内容: ${JSON.stringify(metrics)}`
  )
}
