import { ROLE_HELP_GUIDES } from '../../src/erp/config/roleHelpContent.mjs'
import { getRoleHelpScenarios } from '../../src/erp/config/helpScenarios.mjs'
import {
  getHelpScenarioPresentation,
  HELP_VISUAL_EXAMPLES,
} from '../../src/erp/config/helpScenarioPresentation.mjs'

async function verifyHelpViewMotion(page, assert, reduced) {
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
  const root = page.locator('.erp-help-view-switch .erp-sliding-segmented')
  if (reduced) {
    await root.getByText('怎么做', { exact: true }).click()
    await page.waitForTimeout(100)
  }
  const result = await root.evaluate(async (root) => {
    const group = root.querySelector('.ant-segmented-group')
    const target = group.querySelectorAll('.ant-segmented-item')[1]
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
      stable: root.querySelector('.ant-segmented-group') === group,
      widthDelta: after.width - before.width,
      heightDelta: after.height - before.height,
      selected: target.querySelector('input').checked,
    }
  })
  assert(result.stable && result.selected)
  assert(Math.abs(result.widthDelta) < 1 && Math.abs(result.heightDelta) < 1)
  assert(
    Math.abs(result.frames.at(-1).x - result.target) < 1.5,
    JSON.stringify(result)
  )
  if (reduced) {
    assert(
      result.frames.every((frame) =>
        frame.duration.split(',').every((value) => parseFloat(value) === 0)
      )
    )
  } else {
    assert(
      result.frames.some(
        (frame) => frame.x > result.start + 2 && frame.x < result.target - 2
      ),
      JSON.stringify(result)
    )
  }
  if (reduced) await page.emulateMedia({ reducedMotion: 'no-preference' })
}

export function createHelpCenterScenarios({
  assert,
  assertNoHorizontalOverflow,
  customerRoleAdminProfile,
  customerRoleRuntimeSession,
  customerRuntimeEffectiveSession,
  outputDir,
  path,
}) {
  const warehouseProfile = customerRoleAdminProfile(
    'warehouse',
    'style-help-warehouse'
  )
  const warehouseSession = customerRoleRuntimeSession(
    ['warehouse'],
    'style-help-warehouse'
  )
  const assertFlowFits = async (page) => {
    const boxes = await page
      .locator('.erp-help-flow__steps')
      .evaluate((element) => ({
        width: element.clientWidth,
        content: element.scrollWidth,
        childrenFit: [...element.querySelectorAll('button')].every(
          (button) => button.scrollWidth <= button.clientWidth + 1
        ),
      }))
    assert(
      boxes.content <= boxes.width + 1 && boxes.childrenFit,
      JSON.stringify(boxes)
    )
    await assertNoHorizontalOverflow(page, '岗位流程与页面不应横向溢出')
  }
  const assertSelectedStepIsVisible = async (page) => {
    const colors = await page
      .locator('.erp-help-flow__steps')
      .evaluate((element) => {
        const selected = getComputedStyle(
          element.querySelector('[aria-pressed="true"]')
        )
        const other = getComputedStyle(
          element.querySelector('[aria-pressed="false"]')
        )
        return {
          selected: selected.backgroundColor,
          other: other.backgroundColor,
          selectedBorder: selected.borderTopColor,
          otherBorder: other.borderTopColor,
        }
      })
    assert.notEqual(colors.selected, colors.other, '选中步骤应有明确的背景区分')
    assert.notEqual(
      colors.selectedBorder,
      colors.otherBorder,
      '选中步骤应有明确的边框区分'
    )
  }
  const waitForPickerClosed = async (page) => {
    await page
      .locator('.ant-select-dropdown:visible')
      .waitFor({ state: 'hidden' })
  }
  return [
    {
      name: 'help-center-all-scenes-desktop-dark',
      path: '/erp/help-center?role=warehouse&scene=finished-goods',
      auth: 'admin',
      themeMode: 'dark',
      adminProfile: { is_super_admin: true },
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 960 },
      verify: async (page) => {
        let checked = 0
        for (const guide of ROLE_HELP_GUIDES) {
          await page
            .locator('.erp-help-center-role-picker .ant-select-selector')
            .click()
          await page
            .locator('.ant-select-item-option')
            .filter({ hasText: guide.label })
            .click()
          await waitForPickerClosed(page)
          for (const scenario of getRoleHelpScenarios(guide)) {
            const title =
              HELP_VISUAL_EXAMPLES[scenario.key]?.title || scenario.title
            await page
              .getByRole('navigation', { name: '办事场景' })
              .getByRole('button', { name: title, exact: true })
              .click()
            const article = page.locator(
              `[data-help-scenario="${scenario.key}"]`
            )
            await article.waitFor()
            const model = getHelpScenarioPresentation(scenario, guide.key)
            assert.equal(
              await article.locator('.erp-help-flow__steps button').count(),
              model.steps.length
            )
            for (const step of model.steps) {
              const button = article.getByRole('button', {
                name: `查看步骤 ${step.number}：${step.title}`,
                exact: true,
              })
              await button.click()
              assert.equal(await button.getAttribute('aria-pressed'), 'true')
              await article.locator(`[data-help-view="${step.view}"]`).waitFor()
              assert(
                await button.evaluate(
                  (element) => document.activeElement === element
                ),
                '点击节点后焦点应保留'
              )
            }
            await article.getByText('遇到异常', { exact: true }).click()
            await article
              .getByText(scenario.exception.trigger, { exact: true })
              .waitFor()
            await article
              .getByRole('button', {
                name: `返回第 ${model.exception.backNumber} 步核对`,
                exact: true,
              })
              .click()
            assert.equal(
              await article
                .getByRole('button', {
                  name: `查看步骤 ${model.exception.backNumber}：${model.steps[model.exception.backNumber - 1].title}`,
                  exact: true,
                })
                .getAttribute('aria-pressed'),
              'true'
            )
            await article.getByText('完成后', { exact: true }).click()
            await article
              .getByText(scenario.completion, { exact: true })
              .waitFor()
            await assertFlowFits(page)
            checked += 1
          }
        }
        assert.equal(checked, 34)
        await page
          .locator('.erp-help-center-role-picker .ant-select-selector')
          .click()
        await page
          .locator('.ant-select-item-option')
          .filter({ hasText: '财务' })
          .click()
        await waitForPickerClosed(page)
        await page
          .getByRole('navigation', { name: '办事场景' })
          .getByRole('button', { name: '收付款与核销', exact: true })
          .click()
        await page.screenshot({
          path: path.join(outputDir, 'help-center-finance-desktop-dark.png'),
          fullPage: true,
        })
        await page
          .locator('.erp-help-center-role-picker .ant-select-selector')
          .click()
        await page.locator('.ant-select-dropdown:visible').waitFor()
        await page.waitForFunction(() => {
          const popup = document.querySelector(
            '.ant-select-dropdown:not(.ant-select-dropdown-hidden)'
          )
          return popup && getComputedStyle(popup).opacity === '1'
        })
        await page.screenshot({
          path: path.join(outputDir, 'help-center-role-select-dark.png'),
          fullPage: true,
        })
        await page.keyboard.press('Escape')
        await waitForPickerClosed(page)
      },
    },
    {
      name: 'help-center-warehouse-desktop-light',
      path: '/erp/help-center?role=warehouse&scene=finished-goods',
      auth: 'admin',
      adminProfile: warehouseProfile,
      effectiveSession: warehouseSession,
      viewport: { width: 1440, height: 960 },
      verify: async (page) => {
        const article = page.locator('[data-help-scenario="finished-goods"]')
        await article.waitFor()
        assert.equal(
          await page.locator('.erp-help-center-role-picker').count(),
          0
        )
        assert.equal(
          await article
            .getByRole('button', { name: '查看步骤 2：核对实收与批次' })
            .getAttribute('aria-pressed'),
          'true'
        )
        const confirm = article.getByRole('button', {
          name: '查看步骤 3：确认成品入库',
        })
        await confirm.focus()
        await page.keyboard.press('Enter')
        assert.equal(await confirm.getAttribute('aria-pressed'), 'true')
        await article
          .locator('.erp-help-flow__detail')
          .getByText('实收与来源核对清楚、入库条件满足后', { exact: false })
          .waitFor()
        await article.getByText('遇到异常', { exact: true }).click()
        await article
          .getByText('处理后回到同一报告重新核对', { exact: false })
          .waitFor()
        await assertFlowFits(page)
        await page.getByText('怎么做', { exact: true }).click()
        await assertSelectedStepIsVisible(page)
        await article
          .getByRole('button', { name: '图解 A：找到待入库报告' })
          .click()
        assert.equal(
          await article
            .getByRole('button', { name: '查看步骤 1：提交完工报告' })
            .getAttribute('aria-pressed'),
          'true'
        )
        await article
          .getByRole('button', { name: '说明 B：核对仓库、批次与实收' })
          .click()
        assert.equal(
          await article
            .getByRole('button', { name: '图解 B：核对仓库、批次与实收' })
            .getAttribute('aria-pressed'),
          'true'
        )
        await verifyHelpViewMotion(page, assert, false)
        await verifyHelpViewMotion(page, assert, true)
        await article.getByText('库存余额 · 示例', { exact: true }).waitFor()
        await article.getByText('340', { exact: true }).waitFor()
        await article.getByText('遇到异常', { exact: true }).click()
        await article
          .getByRole('button', { name: '返回第 2 步核对', exact: true })
          .click()
        assert(
          await article
            .getByRole('button', { name: '查看步骤 2：核对实收与批次' })
            .evaluate((element) => document.activeElement === element),
          '返回核对后焦点回到步骤'
        )

        await article.getByText('怎么做', { exact: true }).click()
        await article
          .getByRole('button', { name: '说明 B：核对仓库、批次与实收' })
          .click()
        await page.waitForTimeout(300)
        await page.screenshot({
          path: path.join(outputDir, 'help-center-warehouse-desktop.png'),
          fullPage: true,
        })
        await article.locator('.erp-help-instructions').screenshot({
          path: path.join(outputDir, 'help-center-operation-illustration.png'),
        })
        await page.setViewportSize({ width: 1100, height: 800 })
        await assertFlowFits(page)
        const branchBox = await article
          .locator('.erp-help-flow__issue button')
          .boundingBox()
        const stepsBox = await article
          .locator('.erp-help-flow__steps')
          .boundingBox()
        assert(
          branchBox.y >= stepsBox.y + stepsBox.height + 40,
          '异常分支不能压住换行后的步骤'
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'help-center-warehouse-narrow-desktop.png'
          ),
          fullPage: true,
        })
        await page.setViewportSize({ width: 1440, height: 960 })
        await page
          .getByRole('navigation', { name: '办事场景' })
          .getByRole('button', { name: '查库存', exact: true })
          .click()
        await page.waitForURL(
          (url) => url.searchParams.get('scene') === 'inventory-query'
        )
        await page.reload()
        await page.locator('[data-help-scenario="inventory-query"]').waitFor()
        await page.goBack()
        await article.waitFor()
        assert.equal(
          await article
            .getByRole('button', { name: '查看步骤 2：核对实收与批次' })
            .getAttribute('aria-pressed'),
          'true'
        )
        await article
          .getByRole('button', { name: '打开生产记录', exact: true })
          .click()
        await page.waitForURL(
          (url) => url.pathname === '/erp/production/progress'
        )
        await page.goBack()
        await article.waitFor()
      },
    },
    {
      name: 'help-center-no-entry-permission',
      path: '/erp/help-center?role=warehouse&scene=inbound',
      auth: 'admin',
      adminProfile: warehouseProfile,
      effectiveSession: { ...warehouseSession, pages: ['inventory'] },
      viewport: { width: 1280, height: 800 },
      verify: async (page) => {
        const article = page.locator('[data-help-scenario="inbound"]')
        await article
          .getByText('当前账号未开放此页面，可查看办理说明。', { exact: true })
          .waitFor()
        assert.equal(
          await article
            .getByRole('button', { name: '打开采购入库', exact: true })
            .count(),
          0
        )
        await page
          .getByRole('navigation', { name: '办事场景' })
          .getByRole('button', { name: '查库存', exact: true })
          .click()
        await page
          .locator('[data-help-scenario="inventory-query"]')
          .getByRole('button', { name: '打开库存台账', exact: true })
          .waitFor()
        await assertFlowFits(page)
      },
    },
    {
      name: 'help-center-unknown-role',
      path: '/erp/help-center?role=warehouse&role=boss&scene=finished-goods&scene=shipments',
      auth: 'admin',
      adminProfile: {
        is_super_admin: false,
        roles: [{ role_key: 'custom-role' }],
        permissions: [],
        menus: [],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        roles: ['custom-role'],
        pages: [],
        actions: [],
      },
      viewport: { width: 1280, height: 800 },
      verify: async (page) => {
        await page.locator('[data-role-help-key="generic"]').waitFor()
        await page.waitForURL(
          (url) => url.search === '?role=generic&scene=getting-started'
        )
        assert.equal(
          await page.locator('.erp-help-article__heading button').count(),
          0
        )
        assert.equal(
          await page.locator('.erp-help-center-role-picker').count(),
          0
        )
        await assertFlowFits(page)
      },
    },
    {
      name: 'help-center-role-switch-mobile-dark',
      path: '/erp/help-center?role=boss&scene=finished-goods',
      auth: 'admin',
      themeMode: 'dark',
      adminProfile: {
        is_super_admin: false,
        roles: [{ role_key: 'purchase' }, { role_key: 'finance' }],
      },
      effectiveSession: customerRoleRuntimeSession(
        ['purchase', 'finance'],
        'style-help-multiple'
      ),
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await page.waitForURL(
          (url) =>
            url.searchParams.get('role') === 'purchase' &&
            url.searchParams.get('scene') === 'suppliers'
        )
        await page
          .locator('.erp-help-center-role-picker .ant-select-selector')
          .click()
        await page
          .locator('.ant-select-item-option')
          .filter({ hasText: '财务' })
          .click()
        await waitForPickerClosed(page)
        await page.waitForURL(
          (url) =>
            url.searchParams.get('role') === 'finance' &&
            url.searchParams.get('scene') === 'finance-payments'
        )
        await page
          .locator('.erp-help-mobile-picker .ant-select-selector')
          .click()
        await page
          .locator('.ant-select-item-option')
          .filter({ hasText: '办理发票' })
          .click()
        await waitForPickerClosed(page)
        await page.locator('[data-help-scenario="invoices"]').waitFor()
        await page
          .getByRole('button', { name: '查看步骤 3：办理并确认结果' })
          .click()
        await page
          .locator('.erp-help-flow__detail')
          .getByText('系统记录不等于税控开票已经完成', { exact: false })
          .waitFor()
        await page.getByText('遇到异常', { exact: true }).click()
        await assertFlowFits(page)
        await page.getByText('怎么做', { exact: true }).click()
        await assertSelectedStepIsVisible(page)
        await page.locator('.erp-help-sidebar').scrollIntoViewIfNeeded()
        await page.screenshot({
          path: path.join(outputDir, 'help-center-finance-mobile-dark.png'),
          fullPage: true,
        })
        await page.locator('.erp-help-flow').scrollIntoViewIfNeeded()
        await page.screenshot({
          path: path.join(
            outputDir,
            'help-center-finance-mobile-flow-dark.png'
          ),
          fullPage: true,
        })
        await page.reload()
        await page.locator('[data-help-scenario="invoices"]').waitFor()
        await page.goBack()
        await page.locator('[data-help-scenario="finance-payments"]').waitFor()
        await assertFlowFits(page)
      },
    },
  ]
}
