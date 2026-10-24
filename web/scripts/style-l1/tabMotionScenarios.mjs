import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  assertContentTabAffordance,
  assertSegmentAffordance,
  assertTabsAffordance,
  assertFilterAffordance,
} from './controlAffordanceAssertions.mjs'

import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

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

async function assertTaskTabPointerAndFocus(root) {
  const tabs = root.getByRole('tab')
  await root.scrollIntoViewIfNeeded()
  const initialBox = await root.boundingBox()
  for (const tab of await tabs.all()) {
    await tab.hover()
    await tab.click()
    await tab.and(root.locator('[aria-selected="true"]')).waitFor()
    const metric = await tab.evaluate((item) => {
      const style = getComputedStyle(item)
      return {
        label: item.textContent,
        selected: item.getAttribute('aria-selected'),
        hovered: item.matches(':hover'),
        outline: style.outlineStyle,
        borderWidth: style.borderWidth,
      }
    })
    assert.equal(metric.selected, 'true', JSON.stringify(metric))
    assert(metric.hovered, JSON.stringify(metric))
    assert.equal(metric.outline, 'none', `悬停不能绘制焦点框: ${JSON.stringify(metric)}`)
    const box = await root.boundingBox()
    for (const dimension of ['x', 'y', 'width', 'height']) {
      assert(Math.abs(box[dimension] - initialBox[dimension]) < 1, `页签条切换后保持原位: ${JSON.stringify({ initialBox, box })}`)
    }
  }

  await tabs.first().press('Home')
  await tabs.first().and(root.locator('[aria-selected="true"]:focus-visible')).waitFor()
  const focus = await tabs.first().evaluate((item) => {
    const style = getComputedStyle(item)
    return {
      selected: item.getAttribute('aria-selected'),
      visible: item.matches(':focus-visible'),
      outline: style.outlineStyle,
      width: parseFloat(style.outlineWidth),
      offset: parseFloat(style.outlineOffset),
    }
  })
  assert.equal(focus.selected, 'true', JSON.stringify(focus))
  assert(focus.visible && focus.outline === 'solid' && focus.width >= 2, `键盘焦点必须可见: ${JSON.stringify(focus)}`)
  assert(focus.offset <= -focus.width, `焦点框保持在滚动页签内: ${JSON.stringify(focus)}`)
}

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
          '.ant-segmented-item, [role="tab"]'
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
      const start = document.timeline.currentTime
      let reversed = false
      await new Promise((resolve) => {
        const frame = (timestamp) => {
          const elapsed = timestamp - start
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
    // Bound each step by the 220ms easing slope and one compositor frame of sampling skew.
    // Long runner stalls do not measure an animation discontinuity.
    if (current.elapsed - previous.elapsed < 40) {
      assert(
        Math.hypot(current.x - previous.x, current.y - previous.y) / distance <
          Math.min(
            0.85,
            0.15 + (4 * (current.elapsed - previous.elapsed)) / 220
          ),
        `${label}: discontinuity between animation frames ${JSON.stringify({ distance, previous, current })}`
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
      buttonHeights.every((height) => Math.abs(height - 32) <= 0.5),
    `${label}: more action button changed height ${JSON.stringify(samples)}`
  )
  assert(
    Math.max(...rowHeights) - Math.min(...rowHeights) <= 0.5,
    `${label}: action row changed height ${JSON.stringify(samples)}`
  )
  assert(
    samples.every((sample) => sample.actionClass.includes('actions--responsive')),
    `${label}: desktop remount flashed compact actions ${JSON.stringify(samples)}`
  )
}

async function verifyStandardModal(page, controls, outputDir) {
  await controls.getByRole('radio', { name: '浮层与确认', exact: true }).locator('..').click()
  const trigger = controls.getByRole('button', { name: '打开标准弹窗', exact: true })
  await trigger.press('Enter')
  const dialog = page.getByRole('dialog', { name: '共享标准弹窗', exact: true })
  await dialog.waitFor()
  await waitForFiniteAnimations(page)
  const box = await dialog.boundingBox()
  assert(Math.abs(box.width - 560) <= 1, '标准弹窗保留调用方尺寸')
  assert(Math.abs(box.x - (page.viewportSize().width - box.width) / 2) <= 1, '标准弹窗水平居中')
  assert.equal(await dialog.locator('.surface-panel').count(), 0, '标准弹窗不套用告警面板外观')
  await page.screenshot({ path: path.join(outputDir, 'shared-standard-modal-4k.png') })
  await dialog.getByRole('button', { name: '关闭', exact: true }).focus()
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  await waitForFiniteAnimations(page)
  assert(await trigger.evaluate((el) => el === document.activeElement), '标准弹窗关闭后恢复触发焦点')
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
        for (const id of ['unequal', 'equal', 'secondary', 'vertical', 'material', 'scope', 'theme', 'dev-segment', 'dev-reader', 'disabled', 'controlled', 'conditional']) {
          await assertSegmentAffordance(page.locator(`#${id} .ant-segmented`))
        }
        await assertTabsAffordance(page.locator('#ant-tabs .ant-tabs'))
        for (const id of ['option-tabs', 'login', 'progress-detail', 'collaboration', 'images', 'card-tabs']) {
          await assertContentTabAffordance(page.locator(`#${id} .erp-sliding-segmented, #${id} .erp-sliding-tab-list, #${id} .erp-sliding-tabs`))
        }
        const optionTabs = page.getByRole('tablist', { name: '受控内容导航' })
        await optionTabs.getByRole('tab').first().click()
        assert.equal(await page.locator('#option-tab-changes').textContent(), '0', '重复点击当前页签不触发变更')
        assert(await optionTabs.getByRole('tab').last().isDisabled())
        await optionTabs.getByRole('tab').first().press('End')
        await optionTabs.getByRole('tab', { name: '整张汇总表对照', selected: true }).waitFor()
        assert.equal(await page.locator('#option-tab-changes').textContent(), '1', '方向键跳过禁用页签')
        await optionTabs.getByRole('tab', { name: '整张汇总表对照' }).press('Home')
        await optionTabs.getByRole('tab', { name: '逐项查看', selected: true }).waitFor()
        for (const id of ['dev-nav', 'dev-journey']) {
          await assertTaskTabPointerAndFocus(page.locator(`#${id} .erp-dev-task-nav`))
        }
        for (let index = 0; index < 3; index += 1) {
          assertActionBarRemountStable(
            await sampleActionBarRemount(page),
            `${mode}/action-remount-${index + 1}`
          )
        }
        await assertAligned(page, 'equal')
        for (const id of [
          'unequal',
          'secondary',
          'option-tabs',
          'login',
          'progress-detail',
          'vertical',
          'material',
          'scope',
          'theme',
          'dev-segment',
          'dev-reader',
          'dev-nav',
          'dev-journey',
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
              `#${id} .ant-segmented-item, #${id} [role="tab"]`
            )
            .first()
            .click()
          await page.waitForTimeout(460)
          const reverse = await sampleMotion(page, id, { reverse: true })
          motionEvidence.push({ id, direction: 'reverse', ...reverse })
          await writeFile(
            path.join(outputDir, `global-tab-sliding-${mode}-frames.json`),
            JSON.stringify(motionEvidence, null, 2)
          )
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
        const overflow = await page
          .locator('#overflow-tabs')
          .evaluate((root) => {
            const strip = root.querySelector('.ant-tabs-nav-list')
            const viewport = root.querySelector('.ant-tabs-nav-wrap')
            const items = [...strip.querySelectorAll('.ant-tabs-tab')]
            return {
              stripWidth: strip.getBoundingClientRect().width,
              viewportWidth: viewport.getBoundingClientRect().width,
              lastRight: items.at(-1).getBoundingClientRect().right - strip.getBoundingClientRect().left,
              pageOverflow: document.documentElement.scrollWidth - innerWidth,
            }
          })
        assert(
          overflow.stripWidth > overflow.viewportWidth,
          '长标签在页签内部滚动'
        )
        assert(
          overflow.stripWidth >= overflow.lastRight,
          '底轨完整包住全部选项'
        )
        assert(overflow.pageOverflow <= 1, '长页签不能撑宽页面')
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
        await verifyMobileNavigationMotion(page, assert, '#option-tabs .erp-sliding-tab-list', 1, true)
        await writeFile(
          path.join(outputDir, `global-tab-sliding-${mode}-frames.json`),
          JSON.stringify(motionEvidence, null, 2)
        )
      },
    }))
    .concat([
      {
        name: 'app-standard-modal-keyboard-contract',
        path: '/__dev/ui-design?page=controls',
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 2,
        verify: async (page) => {
          const controls = page.getByRole('region', { name: '控件设计', exact: true })
          await controls.getByRole('navigation', { name: '控件设计目录' })
            .getByRole('button', { name: /弹窗与反馈/ }).click()
          await controls.getByRole('heading', { name: '弹窗与反馈', exact: true }).waitFor()
          await verifyStandardModal(page, controls, outputDir)
        },
      },
      {
        name: 'dev-task-tabs-pointer-focus',
        path: '/__dev/customer-config?customer=yoyoosun&view=preflight&section=evidence',
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 2,
        verify: async (page) => {
          const sections = page.getByRole('tablist', { name: '配置预检任务' })
          await sections.waitFor()
          await assertTaskTabPointerAndFocus(sections)
          await assertContentTabAffordance(sections)
          await verifyMobileNavigationMotion(page, assert, '[aria-label="配置预检任务"]', 3)
          await verifyMobileNavigationMotion(page, assert, '[aria-label="配置预检任务"]', 0, true)
          await sections.getByRole('tab').nth(3).click()
          await page.waitForURL((url) => url.searchParams.get('section') === 'evidence')
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '页签不能撑宽页面')
          await page.reload()
          await sections.getByRole('tab', { selected: true }).waitFor()
          await assertContentTabAffordance(sections)
          await sections.getByRole('tab', { selected: true }).hover()
          await page.screenshot({ path: path.join(outputDir, 'dev-task-tabs-hover-4k.png') })
          const box = await sections.boundingBox()
          await page.screenshot({
            path: path.join(outputDir, 'dev-task-tabs-hover-detail.png'),
            clip: { x: box.x - 16, y: box.y - 16, width: box.width + 32, height: box.height + 32 },
          })
        },
      },
      {
        name: 'dev-control-standards',
        path: '/__dev/ui-design?page=controls',
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 2,
        verify: async (page) => {
          const controls = page.getByRole('region', { name: '控件设计', exact: true })
          const directory = controls.getByRole('navigation', { name: '控件设计目录' })
          const preview = page.locator('.erp-dev-ui-design-page-select:visible')
          const openPreview = async () => {
            await preview.click()
            const listId = await preview.getByRole('combobox').getAttribute('aria-controls')
            assert(listId, '预览入口须关联自己的选项列表')
            return page.locator('.ant-select-dropdown').filter({ has: page.locator(`[id="${listId}"]`) })
          }
          const choosePreview = async (label, key) => {
            const dropdown = await openPreview()
            await dropdown.getByText(label, { exact: true }).click()
            await dropdown.waitFor({ state: 'hidden' })
            await page.waitForURL((url) => (url.searchParams.get('page') || 'workspace') === key)
            if (key === 'controls') await controls.waitFor({ state: 'visible' })
            else await page.locator('iframe[title="ERP 最新可交互设计"]:visible').waitFor()
          }
          const search = controls.getByRole('textbox', { name: '搜索控件设计' })
          const choose = async (name) => {
            await directory.getByRole('button', { name: new RegExp(name) }).click()
            await controls.getByRole('heading', { name, exact: true }).waitFor()
          }
          const chooseTheme = async (name) => {
            await controls.getByLabel('控件样例主题', { exact: true })
              .getByText(name, { exact: true }).click()
            await controls.locator(`.erp-control-library-stage[data-erp-theme="${name === '深色' ? 'dark' : 'light'}"]`).waitFor()
            await waitForFiniteAnimations(page)
          }
          const assertFits = async () => assert(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            '控件页面不应出现页面级横向溢出'
          )
          await controls.waitFor()
          const initialPreview = await openPreview()
          assert.deepEqual(
            await initialPreview.locator('.ant-select-item-option').allTextContents(),
            ['业务界面', '生产管理', '任务处理', '手机版任务', '效能工作台', '登录页', '岗位帮助', '控件设计']
          )
          await initialPreview.getByText('控件设计', { exact: true }).click()
          await initialPreview.waitFor({ state: 'hidden' })
          assert.equal(await page.getByRole('dialog').count(), 0)
          assert.equal(await page.getByRole('button', { name: '下载 HTML' }).count(), 0)
          await assertFits()

          await search.fill('不存在的控件')
          await search.press('Enter')
          await directory.getByText('没有匹配的控件').waitFor()
          await directory.getByRole('button', { name: '清除搜索' }).click()
          await directory.getByRole('button', { name: /弹窗与反馈/ }).waitFor()
          assert.equal(await search.inputValue(), '')
          await search.fill('搜索')
          await search.press('Enter')
          await directory.getByRole('button', { name: /弹窗与反馈/ }).waitFor({ state: 'hidden' })
          await directory.getByRole('button', { name: /页签与视图/ }).waitFor()
          await directory.getByRole('button', { name: /筛选与搜索/ }).waitFor()
          assert.deepEqual(await directory.getByRole('button').locator('strong').allTextContents(), ['组件选用', '来源选择', '基础输入', '页签与视图', '筛选与搜索'])
          await choose('筛选与搜索')
          assert.equal(await search.inputValue(), '')
          assert.equal(new URL(page.url()).searchParams.get('control'), 'filters')
          await page.reload()
          await controls.getByRole('heading', { name: '筛选与搜索', exact: true }).waitFor()
          assert.equal(await directory.getByRole('button', { name: /筛选与搜索/ }).getAttribute('aria-current'), 'page')
          await choose('页签与视图')
          await choose('筛选与搜索')
          await page.goBack()
          await controls.getByRole('heading', { name: '页签与视图', exact: true }).waitFor()
          await page.goForward()
          await controls.getByRole('heading', { name: '筛选与搜索', exact: true }).waitFor()

          const sampleSearch = controls.getByRole('searchbox', { name: '演示搜索' })
          const sampleRows = controls.getByRole('region', { name: '交互样例' }).locator('tbody tr')
          await assertFilterAffordance(controls.locator('.erp-filter-chip'))
          assert.equal(await sampleRows.count(), 3)
          const overdue = controls.getByRole('button', { name: '已逾期 1', exact: true })
          await overdue.click()
          assert.equal(await overdue.getAttribute('aria-pressed'), 'true')
          assert.equal(await sampleRows.count(), 1)
          await sampleRows.getByText('SO-DEMO-01', { exact: true }).waitFor()
          await sampleSearch.fill('查不到的订单')
          assert.equal(await sampleRows.count(), 1, '示例输入期间保留已提交结果')
          await sampleSearch.press('Enter')
          await controls.getByText('没有符合条件的记录', { exact: true }).waitFor()
          await controls.getByRole('button', { name: '清除条件', exact: true }).click()
          await page.waitForFunction(() => document.querySelector('input[aria-label="演示搜索"]')?.value === '')
          assert.equal(await sampleSearch.inputValue(), '')
          assert.equal(await sampleRows.count(), 3)
          await sampleSearch.fill('布偶熊')
          await sampleSearch.press('Enter')
          await controls.getByRole('button', { name: '筛选', exact: true }).click()
          const range = page.getByLabel('演示记录范围', { exact: true })
          await range.getByText('全部记录', { exact: true }).click()
          assert.equal(await sampleRows.count(), 2)
          await page.getByRole('button', { name: '重置筛选', exact: true }).click()
          assert.equal(await sampleSearch.inputValue(), '布偶熊')
          assert.equal(await sampleRows.count(), 1)
          await controls.getByRole('heading', { name: '筛选与搜索', exact: true }).click()
          await sampleSearch.fill('')
          await sampleSearch.press('Enter')
          await chooseTheme('深色')
          await assertFilterAffordance(controls.locator('.erp-filter-chip'))
          await assertFits()
          await page.screenshot({ path: path.join(outputDir, 'control-filters-dark.png') })
          const device = controls.getByLabel('筛选样例设备', { exact: true })
          await device.getByText('手机', { exact: true }).click()
          const mobileFilters = controls.locator('.erp-control-filter-preview--mobile')
          await mobileFilters.waitFor()
          await assertFilterAffordance(mobileFilters.locator('.erp-filter-chip'), 44)
          const mobileQuick = mobileFilters.getByRole('group', { name: '演示风险筛选', exact: true })
          const mobileSearchBox = await mobileFilters.locator('.erp-control-example-search').boundingBox()
          const mobileQuickBox = await mobileQuick.boundingBox()
          assert(Math.abs(mobileQuickBox.y - mobileSearchBox.y - mobileSearchBox.height) <= 1, '手机示例先搜索后快捷项，整行不叠加留白')
          await mobileQuick.getByRole('button', { name: '已逾期 1', exact: true }).click({ position: { x: 10, y: 2 } })
          assert.equal(await overdue.getAttribute('aria-pressed'), 'true', '可见边框上方的透明触区仍可选择')
          assert.equal(await sampleRows.count(), 1)
          await mobileQuick.getByRole('button').first().click()
          assert.equal(await sampleRows.count(), 3)
          await page.mouse.move(0, 0)
          await page.screenshot({ path: path.join(outputDir, 'control-filters-mobile-dark.png') })
          await chooseTheme('浅色')
          await assertFilterAffordance(mobileFilters.locator('.erp-filter-chip'), 44)
          await page.screenshot({ path: path.join(outputDir, 'control-filters-mobile-light.png') })
          await device.getByText('电脑', { exact: true }).click()
          await page.screenshot({ path: path.join(outputDir, 'control-filters-light.png') })

          await choose('页签与视图')
          const segment = controls.getByLabel('进度视图样例', { exact: true })
          await assertContentTabAffordance(segment)
          await assertTabsAffordance(controls.getByLabel('订单详情样例', { exact: true }))
          const tabsSelector = '.erp-control-library-stage .ant-tabs-nav-list'
          const segmentSelector = '.erp-control-library [aria-label="进度视图样例"]'
          await verifyMobileNavigationMotion(page, assert, tabsSelector, 1)
          await controls.getByText('当前：关联任务。订单身份仍在原位置。', { exact: false }).waitFor()
          assert.equal(await controls.getByRole('tab', { name: '无权限' }).getAttribute('aria-disabled'), 'true')
          await verifyMobileNavigationMotion(page, assert, segmentSelector, 1)
          await controls.getByText('当前查看：生产执行').waitFor()
          await assertContentTabAffordance(controls.getByLabel('二级导航样例', { exact: true }))
          await verifyMobileNavigationMotion(page, assert, segmentSelector, 0, true)
          await verifyMobileNavigationMotion(page, assert, tabsSelector, 0, true)
          await chooseTheme('深色')
          await assertContentTabAffordance(segment)
          await assertTabsAffordance(controls.getByLabel('订单详情样例', { exact: true }))
          await chooseTheme('浅色')
          await controls.getByRole('link', { name: '查看图解说明' }).click()
          await page.waitForURL((url) => url.searchParams.get('view') === 'specification')
          assert.equal(new URL(page.url()).searchParams.get('view'), 'specification')
          await page.getByRole('tab', { name: '可交互设计', exact: true }).click()
          await controls.getByRole('heading', { name: '页签与视图', exact: true }).waitFor()

          await choose('按钮与动作')
          const save = controls.getByRole('button', { name: /^保\s*存$/ })
          // WebKit 的完整控件遍历使用 Option+Tab，与现有筛选键盘场景一致。
          const tabModifier = process.platform === 'darwin' && page.context().browser().browserType().name() === 'webkit' ? 'Alt+' : ''
          await save.focus()
          await page.keyboard.press(`${tabModifier}Shift+Tab`)
          await page.keyboard.press(`${tabModifier}Tab`)
          const saveFocus = await save.evaluate((button) => ({
            focused: document.activeElement === button,
            visible: button.matches(':focus-visible'),
            outline: getComputedStyle(button).outlineStyle,
            width: parseFloat(getComputedStyle(button).outlineWidth),
          }))
          assert(saveFocus.focused && saveFocus.visible, `键盘须实际聚焦保存按钮：${JSON.stringify(saveFocus)}`)
          assert.equal(saveFocus.outline, 'solid')
          assert(saveFocus.width >= 2, '保存按钮的键盘焦点框清晰可见')
          await page.keyboard.press('Enter')
          await controls.getByText('演示反馈：已保存。没有写入业务数据。').waitFor()
          assert(await controls.getByRole('button', { name: '无可操作记录' }).isDisabled())
          await page.getByRole('button', { name: /重置演示/ }).click()
          await controls.getByText('选择一个动作，查看就地反馈。').waitFor()

          await choose('页面状态')
          const chooseState = async (label) => {
            await controls.locator('.erp-page-state-examples .ant-select-selector').click()
            await page.locator('.ant-select-dropdown:visible').getByText(label, { exact: true }).click()
          }
          await chooseState('尚无记录')
          await controls.getByText('当前范围暂无记录', { exact: true }).waitFor()
          await chooseState('筛选无结果')
          await controls.getByText('没有符合条件的记录', { exact: true }).waitFor()
          await controls.getByRole('button', { name: '清除条件', exact: true }).click()
          await controls.getByRole('button', { name: '选择核对样品资料', exact: true }).waitFor()
          await chooseState('首次读取失败')
          await controls.getByRole('alert').filter({ hasText: '本次读取失败，条件已保留' }).waitFor()
          await controls.getByRole('button', { name: '重试读取' }).click()
          await controls.getByRole('button', { name: '选择核对样品资料', exact: true }).waitFor()

          await choosePreview('业务界面', 'workspace')
          const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
          await frame.getByRole('button', { name: '销售管理', exact: true }).click()
          await frame.getByRole('group', { name: '销售订单视图', exact: true }).waitFor()
          await choosePreview('控件设计', 'controls')
          await page.getByRole('button', { name: /重置演示/ }).click()
          await choosePreview('业务界面', 'workspace')
          await frame.getByRole('group', { name: '销售订单视图', exact: true }).waitFor()
          await choosePreview('控件设计', 'controls')
          await choose('弹窗与反馈')
          await controls.getByRole('button', { name: '打开编辑弹窗', exact: true }).waitFor()
          await verifyStandardModal(page, controls, outputDir)
          await controls.getByRole('radio', { name: '编辑与提交', exact: true }).locator('..').click()
          await assertFits()
          await page.screenshot({ path: path.join(outputDir, 'control-standards-light.png') })
          await page.setViewportSize({ width: 1024, height: 768 })
          await assertFits()
          const content = controls.locator('.erp-control-library-content')
          await content.evaluate((node) => { node.scrollTop = node.scrollHeight })
          await choose('页签与视图')
          assert.equal(await content.evaluate((node) => node.scrollTop), 0)
          await assertFits()
        },
      },
    ])
}
