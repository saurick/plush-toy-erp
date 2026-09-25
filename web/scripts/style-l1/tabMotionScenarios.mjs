import assert from 'node:assert/strict'
import {
  assertSegmentAffordance,
  assertTabsAffordance,
  assertFilterAffordance,
} from './controlAffordanceAssertions.mjs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

const fixturePath = '/__tab-motion-fixture'
const fixtureHTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script type="module">
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
</script></head><body><div id="root"></div>
<script type="module" src="/scripts/test/SlidingTabsFixture.jsx"></script></body></html>`

async function sampleMotion(
  page,
  id,
  { reverse = false, targetIndex = 1 } = {}
) {
  return page.locator(`#${id}`).evaluate(
    async (root, config) => {
      const group = root.querySelector(
        '.ant-segmented-group, .erp-sliding-tab-list, .ant-tabs-nav-list'
      )
      const items = [
        ...group.querySelectorAll(
          '.ant-segmented-item, [role="tab"], .erp-dev-governance-task-nav__item'
        ),
      ]
      const read = () => {
        const style = getComputedStyle(group, '::before')
        const matrix = new DOMMatrixReadOnly(
          style.transform === 'none' ? undefined : style.transform
        )
        return {
          x: matrix.m41,
          y: matrix.m42,
          width: parseFloat(style.width),
          opacity: style.opacity,
          bg: style.backgroundColor,
        }
      }
      const first = read()
      const isAntTabs = group.classList.contains('ant-tabs-nav-list')
      const targetItem = isAntTabs
        ? items[config.targetIndex].closest('.ant-tabs-tab')
        : items[config.targetIndex]
      const target = {
        x: targetItem.offsetLeft,
        y: isAntTabs ? first.y : targetItem.offsetTop,
        width: targetItem.offsetWidth,
      }
      const samples = []
      items[config.targetIndex].click()
      const start = performance.now()
      let reversed = false
      await new Promise((resolve) => {
        const frame = () => {
          const elapsed = performance.now() - start
          samples.push({ elapsed, ...read() })
          if (config.reverse && !reversed && elapsed >= 110) {
            items[0].click()
            reversed = true
          }
          if (elapsed < 650) requestAnimationFrame(frame)
          else resolve()
        }
        requestAnimationFrame(frame)
      })
      return { first, target, samples }
    },
    { reverse, targetIndex }
  )
}

function assertMotion(result, label, reverse = false) {
  const { first, target, samples } = result
  const distance = Math.hypot(target.x - first.x, target.y - first.y)
  assert(distance > 5, `${label}: invalid motion fixture`)
  const progress = (frame) =>
    Math.hypot(frame.x - first.x, frame.y - first.y) / distance
  assert(
    samples.some((frame) => progress(frame) > 0.08 && progress(frame) < 0.85),
    `${label}: highlight jumped without intermediate positions`
  )
  const end = reverse ? first : target
  const last = samples.at(-1)
  assert(
    Math.hypot(last.x - end.x, last.y - end.y) < 1.5,
    `${label}: indicator did not finish at selected item ${JSON.stringify(result)}`
  )
  assert(
    Math.abs(last.width - end.width) < 1.5,
    `${label}: indicator width differs from selected item`
  )
  assert(
    samples.every((frame) => frame.opacity === '1'),
    `${label}: highlight disappeared during motion`
  )
  assert(
    samples.every((frame) => frame.width > 1),
    `${label}: highlight collapsed during motion`
  )
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]
    const current = samples[index]
    // Ignore frames where the runner itself was descheduled for a long time.
    if (current.elapsed - previous.elapsed < 40) {
      assert(
        Math.hypot(current.x - previous.x, current.y - previous.y) / distance <
          0.45,
        `${label}: discontinuity between animation frames`
      )
    }
  }
}

async function assertAligned(page, id) {
  const geometry = await page.locator(`#${id}`).evaluate((root) => {
    const group = root.querySelector(
      '.ant-segmented-group, .erp-sliding-tab-list'
    )
    const selected = group.querySelector(
      '.erp-segmented-item-selected, [aria-selected="true"]'
    )
    const style = getComputedStyle(group, '::before')
    const matrix = new DOMMatrixReadOnly(style.transform)
    return {
      x: matrix.m41,
      y: matrix.m42,
      width: parseFloat(style.width),
      targetX: selected.offsetLeft,
      targetY: selected.offsetTop,
      targetWidth: selected.offsetWidth,
    }
  })
  assert(
    Math.abs(geometry.x - geometry.targetX) < 1.5 &&
      Math.abs(geometry.y - geometry.targetY) < 1.5 &&
      Math.abs(geometry.width - geometry.targetWidth) < 1.5,
    `${id}: layout alignment ${JSON.stringify(geometry)}`
  )
}

async function sampleActionBarRemount(page) {
  return page.locator('#action-remount').evaluate(async (root) => {
    const trigger = root.querySelector('#remount-action-bar')
    const samples = []
    trigger.click()
    const start = performance.now()
    await new Promise((resolve) => {
      const frame = () => {
        const more = root.querySelector(
          '.erp-business-selection-action-bar__compact-more'
        )
        const row = root.querySelector(
          '.erp-business-selection-action-bar__row'
        )
        if (more && row) {
          samples.push({
            elapsed: performance.now() - start,
            buttonHeight: more.getBoundingClientRect().height,
            rowHeight: row.getBoundingClientRect().height,
            actionClass:
              more.closest('.erp-business-module-selection-actions')
                ?.className || '',
          })
        }
        if (performance.now() - start < 360) requestAnimationFrame(frame)
        else resolve()
      }
      requestAnimationFrame(frame)
    })
    return samples
  })
}

function assertActionBarRemountStable(samples, label) {
  assert(samples.length >= 5, `${label}: missing remount frames`)
  const buttonHeights = samples.map((sample) => sample.buttonHeight)
  const rowHeights = samples.map((sample) => sample.rowHeight)
  assert(
    Math.max(...buttonHeights) - Math.min(...buttonHeights) <= 0.5 &&
      buttonHeights.every((height) => Math.abs(height - 30) <= 0.5),
    `${label}: more action button changed height ${JSON.stringify(samples)}`
  )
  assert(
    Math.max(...rowHeights) - Math.min(...rowHeights) <= 0.5,
    `${label}: action row changed height ${JSON.stringify(samples)}`
  )
  assert(
    samples.every((sample) => sample.actionClass.includes('actions--overflow')),
    `${label}: desktop remount flashed compact actions ${JSON.stringify(samples)}`
  )
}

export function createTabMotionScenarios({ outputDir }) {
  return ['light', 'dark']
    .map((mode) => ({
      name: `global-tab-sliding-${mode}`,
      path: fixturePath,
      viewport: { width: 1200, height: 1000 },
      beforeNavigate: async (page) => {
        await page.route(`**${fixturePath}`, (route) =>
          route.fulfill({ contentType: 'text/html', body: fixtureHTML })
        )
      },
      verify: async (page) => {
        const motionEvidence = []
        await page.locator('#unequal [data-sliding-ready="true"]').waitFor()
        if (mode === 'dark') {
        await page.locator('#toggle-theme').click()
        await page.waitForTimeout(460)
      }
        await assertSegmentAffordance(page.locator('#unequal .ant-segmented'))
      await assertTabsAffordance(page.locator('#ant-tabs .ant-tabs'))
        for (let index = 0; index < 3; index += 1) {
          assertActionBarRemountStable(
            await sampleActionBarRemount(page),
            `${mode}/action-remount-${index + 1}`
          )
        }
        await assertAligned(page, 'equal')
        for (const id of [
          'unequal',
          'vertical',
          'material',
          'scope',
          'theme',
          'dev-segment',
          'dev-reader',
          'dev-nav',
          'dev-journey',
          'governance',
          'collaboration',
          'workflow',
          'images',
        ]) {
          const forward = await sampleMotion(page, id)
          motionEvidence.push({ id, direction: 'forward', ...forward })
          assertMotion(forward, `${mode}/${id}`)
          const activeBackground = await page
            .locator(
              `#${id} .erp-segmented-item-selected, #${id} [aria-selected="true"], #${id} [aria-current="page"]`
            )
            .evaluate((item) => getComputedStyle(item).backgroundColor)
          assert.equal(
            activeBackground,
            'rgba(0, 0, 0, 0)',
            `${id}: competing selected background`
          )
          await page
            .locator(
              `#${id} .ant-segmented-item, #${id} [role="tab"], #${id} .erp-dev-governance-task-nav__item`
            )
            .first()
            .click()
          await page.waitForTimeout(460)
          const reverse = await sampleMotion(page, id, { reverse: true })
          motionEvidence.push({ id, direction: 'reverse', ...reverse })
          assertMotion(reverse, `${mode}/${id}/reverse`, true)
        }
        assertMotion(
          await sampleMotion(page, 'ant-tabs'),
          `${mode}/Sliding Tabs`
        )
        await page.locator('#ant-tabs [role="tab"]').first().click()
        await page.waitForTimeout(460)
        assertMotion(
          await sampleMotion(page, 'ant-tabs', { reverse: true }),
          `${mode}/Sliding Tabs/reverse`,
          true
        )

        assert.equal(
          await page.locator('#disabled input').last().isDisabled(),
          true
        )
        await page
          .locator('#disabled .ant-segmented-item')
          .last()
          .click({ force: true })
        assert.equal(await page.locator('#disabled input:checked').count(), 1)
        assert.equal(
          await page.locator('#disabled input:disabled:checked').count(),
          0
        )
        await page.locator('#controlled .ant-segmented-item').nth(1).click()
        assert.equal(
          await page
            .locator('#controlled .erp-segmented-item-selected')
            .innerText(),
          '逐项查看'
        )
        await page.locator('#unequal input').first().focus()
        await page.keyboard.press('ArrowRight')
        await page.waitForTimeout(460)
        await assertAligned(page, 'unequal')
        assert.equal(
          await page.locator('#change-count').innerText(),
          '6',
          'onChange must fire once per accepted interaction'
        )

        await page.locator('#toggle-visible').click()
        await page.locator('#toggle-visible').click()
        await assertAligned(page, 'conditional')
        await page.setViewportSize({ width: 390, height: 844 })
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve))
            )
        )
        await assertAligned(page, 'equal')
        await assertAligned(page, 'dev-nav')
        assertMotion(
          await sampleMotion(page, 'dev-nav', { targetIndex: 2 }),
          `${mode}/wrapped tabs`
        )
        await page.locator('#dev-journey [role="tab"]').first().focus()
        await page.keyboard.press('ArrowRight')
        await page.waitForTimeout(460)
        await assertAligned(page, 'dev-journey')
        assert.equal(
          await page
            .locator('#dev-journey [aria-selected="true"]')
            .evaluate((item) => getComputedStyle(item).backgroundColor),
          'rgba(0, 0, 0, 0)'
        )

        const customTabs = page.locator('#workflow [role="tab"]')
        await customTabs.first().focus()
        await page.keyboard.press('ArrowRight')
        assert.equal(
          await customTabs.nth(1).getAttribute('aria-selected'),
          'true'
        )
        await page.keyboard.press('End')
        assert.equal(
          await customTabs.nth(1).getAttribute('aria-selected'),
          'true',
          'disabled steps must be skipped'
        )
        await page.keyboard.press('Home')
        assert.equal(await customTabs.first().getAttribute('tabindex'), '0')
        assert.equal(await customTabs.nth(1).getAttribute('tabindex'), '-1')
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.locator('#material .ant-segmented-item').nth(1).click()
        await assertAligned(page, 'material')
        const duration = await page
          .locator('#material .ant-segmented-group')
          .evaluate(
            (group) => getComputedStyle(group, '::before').transitionDuration
          )
        assert(
          duration.split(',').every((part) => parseFloat(part) === 0),
          'reduced motion must disable sliding'
        )
        const tabsDuration = await page
          .locator('#ant-tabs .ant-tabs-nav-list')
          .evaluate(
            (list) => getComputedStyle(list, '::before').transitionDuration
          )
        assert(
          tabsDuration.split(',').every((part) => parseFloat(part) === 0),
          'reduced motion must disable shared Tabs sliding'
        )
        await writeFile(
          path.join(outputDir, `global-tab-sliding-${mode}-frames.json`),
          JSON.stringify(motionEvidence, null, 2)
        )
      },
    }))
    .concat([
      {
        name: 'dev-control-standards',
        path: '/__dev/prototypes?controls=1',
        viewport: { width: 1440, height: 1050 },
        verify: async (page) => {
          const dialog = page.getByRole('dialog', {
            name: '交互控件规范 · 当前共享组件',
          })
          await dialog.waitFor()
          const segment = dialog.getByLabel('进度视图样例', { exact: true })
          await assertSegmentAffordance(segment)
          await assertFilterAffordance(dialog.locator('.erp-filter-chip'))
          await dialog
            .getByRole('tab', { name: '关联任务', exact: true })
            .click()
          await dialog
            .getByText('当前：关联任务。订单身份仍在原位置。')
            .waitFor()
          const before = await segment.boundingBox()
          await segment.getByText('生产执行', { exact: true }).click()
          await dialog.getByText('当前查看：生产执行').waitFor()
          assert.deepEqual(await segment.boundingBox(), before)
          await dialog.getByRole('button', { name: '已逾期 55' }).click()
          assert.equal(
            await dialog
              .getByRole('button', { name: '已逾期 55' })
              .getAttribute('aria-pressed'),
            'true'
          )
          const save = dialog.getByRole('button', { name: /^保\s*存$/ })
          await save.focus()
          await page.keyboard.press('Shift+Tab')
          await page.keyboard.press('Tab')
          assert.equal(
            await save.evaluate(
              (button) => getComputedStyle(button).outlineStyle
            ),
            'solid'
          )
          await page.keyboard.press('Enter')
          await dialog
            .getByText('演示反馈：已保存。没有写入业务数据。')
            .waitFor()
          assert(
            await dialog
              .getByRole('button', { name: '无可操作记录' })
              .isDisabled()
          )
          assert(
            await dialog
              .getByRole('tab', { name: '无权限' })
              .getAttribute('aria-disabled')
          )
          await page.waitForTimeout(460)
          await page.screenshot({
            path: path.join(outputDir, 'control-standards-light.png'),
          })
          await dialog
            .getByLabel('控件样例主题', { exact: true })
            .getByText('深色', { exact: true })
            .click()
          await page.waitForTimeout(460)
          await assertSegmentAffordance(segment)
          await assertFilterAffordance(dialog.locator('.erp-filter-chip'))
          await page.screenshot({
            path: path.join(outputDir, 'control-standards-dark.png'),
          })
          assert(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth
            )
          )
          await page.keyboard.press('Escape')
          await dialog.waitFor({ state: 'hidden' })
          await page
            .getByRole('button', { name: '交互控件规范', exact: true })
            .click()
          await dialog.waitFor()
        },
      },
    ])
}
