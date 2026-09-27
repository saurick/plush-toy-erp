import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function assertProductionRecordTabMotion(
  page,
  target,
  { reverse = false, reduced = false } = {}
) {
  const strip = page.locator('.erp-production-record-tabs .ant-tabs-nav-list')
  await strip.waitFor()
  const result = await strip.evaluate(
    async (element, config) => {
      const items = [...element.querySelectorAll('.ant-tabs-tab')]
      const initial = items.find((item) =>
        item.querySelector('[aria-selected="true"]')
      )
      const target = items.find(
        (item) => item.textContent.trim() === config.target
      )
      const read = () => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element, '::before')
        return {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          x: new DOMMatrixReadOnly(
            style.transform === 'none' ? undefined : style.transform
          ).m41,
          indicatorWidth: parseFloat(style.width),
          opacity: style.opacity,
          connected: element.isConnected,
        }
      }
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .filter(
            (animation) => animation.effect?.getTiming().iterations !== Infinity
          )
          .map((animation) => animation.finished.catch(() => {}))
      )
      const first = read()
      const targetX = target.offsetLeft
      target.querySelector('[role="tab"]').click()
      const start = document.timeline.currentTime
      const frames = []
      let reversed = false
      await new Promise((resolve) => {
        const frame = (timestamp) => {
          const elapsed = timestamp - start
          frames.push({ elapsed, ...read() })
          if (config.reverse && !reversed && elapsed >= 100) {
            initial.querySelector('[role="tab"]').click()
            reversed = true
          }
          if (elapsed < 650) requestAnimationFrame(frame)
          else resolve()
        }
        requestAnimationFrame(frame)
      })
      const active = element.querySelector('.ant-tabs-tab-active')
      return {
        first,
        targetX,
        frames,
        active: active?.textContent.trim(),
        expected: { x: active?.offsetLeft, width: active?.offsetWidth },
        duration: getComputedStyle(element, '::before').transitionDuration,
      }
    },
    { target, reverse }
  )
  assert.ok(
    result.frames.every((frame) => frame.connected && frame.opacity === '1'),
    '切换内容时保留同一个页签节点和滑块'
  )
  for (const dimension of ['left', 'top', 'width', 'height']) {
    assert.ok(
      result.frames.every(
        (frame) => Math.abs(frame[dimension] - result.first[dimension]) < 1
      ),
      `页签 ${dimension} 不随内容变化`
    )
  }
  const final = result.frames.at(-1)
  assert.ok(Math.abs(final.x - result.expected.x) < 1.5, '最终滑块对准当前页签')
  assert.ok(
    Math.abs(final.indicatorWidth - result.expected.width) < 1.5,
    '最终滑块宽度匹配页签'
  )
  if (reduced) {
    assert.ok(
      result.duration.split(',').every((value) => parseFloat(value) === 0),
      '减少动态效果时过渡为零'
    )
  } else {
    const distance = Math.abs(result.targetX - result.first.x)
    assert.ok(
      distance > 5,
      `必须实际切换到其他页签: ${JSON.stringify({ first: result.first, targetX: result.targetX, active: result.active })}`
    )
    assert.ok(
      result.frames.some((frame) => {
        const progress = Math.abs(frame.x - result.first.x) / distance
        return progress > 0.08 && progress < 0.85
      }),
      '滑块经过真实中间位置'
    )
  }
  return result
}

export function createProductionTabStabilityScenarios({
  common,
  outputDir,
  assertNoHorizontalOverflow,
  clickERPThemeOption,
}) {
  return [
    {
      ...common,
      name: 'production-record-single-view',
      path: '/erp/production/progress',
      effectiveSession: {
        ...common.effectiveSession,
        pages: ['production-progress'],
        actions: ['production.fact.read'],
      },
      verify: async (page) => {
        await page
          .getByRole('heading', { name: '生产记录', exact: true })
          .waitFor()
        await page
          .locator('.erp-v1-operational-fact-page .ant-table-wrapper')
          .waitFor()
        assert.equal(
          await page.getByLabel('生产记录工作区', { exact: true }).count(),
          0,
          '只有一种可用视图时不显示无用途的切换条'
        )
        assert.equal(
          await page
            .getByRole('tab', { name: '生产工序', exact: true })
            .count(),
          0
        )
        assert.equal(
          await page
            .getByRole('tab', { name: '异常处理', exact: true })
            .count(),
          0
        )
        assert.equal(
          await page.getByRole('tab', { name: '待审批', exact: true }).count(),
          0
        )
      },
    },
    {
      ...common,
      name: 'production-record-tab-stability',
      path: '/erp/production/progress',
      productionOrderReleased: true,
      verify: async (page) => {
        const navigation = page.getByLabel('生产记录工作区', { exact: true })
        await page
          .getByRole('heading', { name: '生产记录', exact: true })
          .waitFor()
        assert.deepEqual(await navigation.getByRole('tab').allTextContents(), [
          '记录明细',
          '生产工序',
          '异常处理',
          '待审批',
        ])
        assert.equal(
          await page.getByRole('radiogroup', { name: '页面展示方式' }).count(),
          0,
          '生产记录不叠加第二组视图切换'
        )
        const samples = []
        for (const target of ['生产工序', '异常处理', '待审批', '记录明细']) {
          samples.push({
            target,
            ...(await assertProductionRecordTabMotion(page, target)),
          })
          assert.equal(
            await navigation
              .getByRole('tab', { name: target, exact: true })
              .getAttribute('aria-selected'),
            'true'
          )
        }
        samples.push({
          target: '待审批',
          reverse: true,
          ...(await assertProductionRecordTabMotion(page, '待审批', {
            reverse: true,
          })),
        })
        assert.equal(
          await navigation
            .getByRole('tab', { name: '记录明细' })
            .getAttribute('aria-selected'),
          'true'
        )
        await navigation.getByRole('tab', { name: '生产工序' }).click()
        await page
          .getByRole('region', { name: '生产工序', exact: true })
          .waitFor()
        await page.goBack()
        await page
          .locator('.erp-v1-operational-fact-page .ant-table-wrapper')
          .waitFor()
        assert.equal(
          await navigation
            .getByRole('tab', { name: '记录明细' })
            .getAttribute('aria-selected'),
          'true'
        )
        await page.emulateMedia({ reducedMotion: 'reduce' })
        samples.push({
          target: '异常处理',
          reduced: true,
          ...(await assertProductionRecordTabMotion(page, '异常处理', {
            reduced: true,
          })),
        })
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        for (const width of [768, 390]) {
          await page.setViewportSize({ width, height: 900 })
          await assertNoHorizontalOverflow(
            page,
            `production-record-tabs-${width}`
          )
          await navigation.getByRole('tab', { name: '待审批' }).click()
          await navigation.getByRole('tab', { name: '记录明细' }).click()
          await page
            .locator('.erp-v1-operational-fact-page .ant-table-wrapper')
            .waitFor()
          await assertNoHorizontalOverflow(
            page,
            `production-record-tabs-restored-${width}`
          )
        }
        await page.setViewportSize({ width: 1440, height: 900 })
        await clickERPThemeOption(page, '暗色')
        samples.push({
          target: '待审批',
          theme: 'dark',
          ...(await assertProductionRecordTabMotion(page, '待审批')),
        })
        await writeFile(
          path.join(outputDir, 'production-record-tabs-motion.json'),
          JSON.stringify(samples, null, 2)
        )
        await page.screenshot({
          path: path.join(outputDir, 'production-record-tabs-dark.png'),
        })
      },
    },
  ]
}
