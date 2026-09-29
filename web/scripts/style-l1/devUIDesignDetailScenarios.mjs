import { getContrastRatio } from './colorAssertions.mjs'
import { writeFile } from 'node:fs/promises'

export function createDevUIDesignDetailScenarios({
  assert,
  assertNoHorizontalOverflow,
  outputDir,
  path,
}) {
  return [
    {
      name: 'dev-ui-design-login',
      path: '/__dev/ui-design?page=login',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        await frame.getByRole('heading', { name: '毛绒玩具管理系统' }).waitFor()
        await frame.getByRole('button', { name: '登录', exact: true }).click()
        await frame.getByText('请输入账号', { exact: true }).waitFor()
        await frame.getByRole('button', { name: '演示账号与验证码' }).click()
        await frame.getByRole('button', { name: '填入演示信息' }).click()
        await frame.getByRole('tab', { name: '短信登录' }).click()
        await frame.getByRole('radio', { name: '手机版' }).click()
        await frame.getByRole('button', { name: '获取验证码' }).click()
        await frame
          .getByText('演示验证码 123456 · 未发送短信', { exact: true })
          .waitFor()
        await frame
          .getByRole('textbox', { name: '验证码', exact: true })
          .fill('123456')
        await frame.getByRole('button', { name: '登录', exact: true }).click()
        await frame.locator('.role-mobile-screen').waitFor()
        await page.getByRole('button', { name: /重置演示/ }).click()
        await frame.getByRole('heading', { name: '毛绒玩具管理系统' }).waitFor()
        await frame.getByRole('button', { name: '演示账号与验证码' }).click()
        await frame.getByRole('button', { name: '填入演示信息' }).click()
        await frame.getByRole('button', { name: '登录', exact: true }).click()
        await frame.locator('.workbench-queue-tabs button').first().waitFor()
        await frame.getByRole('button', { name: 'admin', exact: true }).click()
        await frame
          .getByRole('button', { name: '退出登录', exact: true })
          .click()
        await frame.getByRole('heading', { name: '毛绒玩具管理系统' }).waitFor()
        assert.equal(
          await frame
            .getByRole('textbox', { name: '密码', exact: true })
            .inputValue(),
          ''
        )
        await page.getByText('业务界面', { exact: true }).click()
        await frame.locator('.workbench-queue-tabs button').first().waitFor()
        await assertNoHorizontalOverflow(page)
      },
    },
    {
      name: 'dev-ui-design-details',
      path: '/__dev/ui-design',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await page
          .getByRole('heading', { name: 'UI 交互设计', exact: true })
          .waitFor()
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        const storageResult = await frame.locator('body').evaluate(() => {
          const key = 'ui-design-browser-verification'
          window.localStorage.setItem(key, 'compact')
          window.localStorage.setItem(key, 'standard')
          window.localStorage.setItem('__proto__', 'safe')
          const result = {
            value: window.localStorage.getItem(key),
            prototypeKey: window.localStorage.getItem('__proto__'),
            separateSession: window.sessionStorage.getItem(key),
          }
          window.localStorage.removeItem(key)
          window.localStorage.removeItem('__proto__')
          return { ...result, removed: window.localStorage.getItem(key) }
        })
        assert.deepEqual(storageResult, {
          value: 'standard',
          prototypeKey: 'safe',
          separateSession: null,
          removed: null,
        })
        await frame
          .getByRole('button', { name: '销售管理', exact: true })
          .click()
        await frame
          .getByRole('group', { name: '销售订单视图', exact: true })
          .waitFor()
        await page.getByRole('tab', { name: '设计说明', exact: true }).click()
        await page.getByRole('heading', { name: /ERP 交互设计说明/ }).waitFor()
        await page.getByRole('tab', { name: '设计依据', exact: true }).click()
        await page.getByRole('heading', { name: /ERP 设计依据/ }).waitFor()
        await page.getByRole('tab', { name: '可交互设计', exact: true }).click()
        await frame
          .getByRole('group', { name: '销售订单视图', exact: true })
          .waitFor()
        await page.getByRole('button', { name: /全屏预览/ }).click()
        await page
          .getByRole('dialog', { name: 'UI 交互设计全屏预览' })
          .waitFor()
        const fullscreenBounds = await page
          .getByRole('dialog', { name: 'UI 交互设计全屏预览' })
          .evaluate((element) => {
            const rect = element.getBoundingClientRect()
            return {
              left: rect.left,
              right: innerWidth - rect.right,
              top: rect.top,
              bottom: innerHeight - rect.bottom,
            }
          })
        for (const inset of Object.values(fullscreenBounds))
          assert.ok(
            Math.abs(inset - 12) <= 1,
            `全屏预览四边应留出完整操作边界: ${JSON.stringify(fullscreenBounds)}`
          )
        assert.equal(
          await page
            .locator('nav[aria-label="开发页面导航"]')
            .evaluate((element) => element.inert),
          true
        )
        const catalogTrigger = frame.getByRole('button', {
          name: '全部模块',
          exact: true,
        })
        await catalogTrigger.click()
        const catalog = frame.getByRole('dialog', {
          name: '全部桌面页面',
          exact: true,
        })
        await catalog.waitFor()
        assert.equal(
          await frame.locator('.app').evaluate((element) => element.inert),
          true
        )
        const first = catalog.getByRole('button', { name: '关闭', exact: true })
        const last = catalog.getByRole('button', { name: '完成', exact: true })
        await last.focus()
        await last.press('Tab')
        assert.equal(
          await first.evaluate((element) => element === document.activeElement),
          true
        )
        await first.press('Shift+Tab')
        assert.equal(
          await last.evaluate((element) => element === document.activeElement),
          true
        )
        await last.press('Escape')
        await catalog.waitFor({ state: 'hidden' })
        assert.equal(
          await catalogTrigger.evaluate(
            (element) => element === document.activeElement
          ),
          true
        )
        assert.equal(
          await frame.locator('.app').evaluate((element) => element.inert),
          false
        )
        assert.equal(
          await page
            .getByRole('dialog', { name: 'UI 交互设计全屏预览' })
            .isVisible(),
          true
        )
        await frame.getByRole('button', { name: 'admin', exact: true }).click()
        const account = frame.getByRole('menu', { name: '账号菜单' })
        await account
          .getByRole('button', { name: '切换工作入口' })
          .press('Escape')
        await account.waitFor({ state: 'hidden' })
        assert.equal(
          await page
            .getByRole('dialog', { name: 'UI 交互设计全屏预览' })
            .isVisible(),
          true
        )
        await frame
          .getByRole('button', { name: '销售管理', exact: true })
          .press('Escape')
        await page
          .getByRole('dialog', { name: 'UI 交互设计全屏预览' })
          .waitFor({ state: 'hidden' })
        assert.equal(
          await page
            .getByRole('button', { name: /全屏预览/ })
            .evaluate((element) => element === document.activeElement),
          true
        )
        const download = page.waitForEvent('download')
        await page.getByRole('button', { name: /下载 HTML/ }).click()
        assert.equal(
          (await download).suggestedFilename(),
          'erp-ui-interaction-design.html'
        )
        await page.getByRole('button', { name: /重置演示/ }).click()
        const queueHeading = frame.locator('.workbench-queue-head')
        await queueHeading.waitFor()
        const queueLayout = await queueHeading.evaluate((header) => {
          const firstButton = header.querySelector(
            '.workbench-queue-tabs button'
          )
          return {
            copyPresent:
              header.textContent.includes('先处理需要我判断或推进的事项'),
            firstButtonOffset: firstButton
              ? firstButton.getBoundingClientRect().left -
                header.getBoundingClientRect().left
              : null,
          }
        })
        assert.equal(queueLayout.copyPresent, false)
        assert.ok(
          queueLayout.firstButtonOffset >= 0 &&
            queueLayout.firstButtonOffset <= 16,
          `工作台任务筛选应靠左显示: ${JSON.stringify(queueLayout)}`
        )
        for (const colorScheme of ['light', 'dark']) {
          await page.emulateMedia({ colorScheme })
          await frame.locator(`body[data-mode="${colorScheme}"]`).waitFor()
          await frame.locator('body').evaluate(async (element) => {
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
          const badges = await frame
            .locator('.badge:is(.info, .warning, .danger, .success)')
            .evaluateAll((elements) =>
              elements.map((element) => {
                const rgb = (value) => value.match(/[\d.]+/g).map(Number)
                let background = [255, 255, 255]
                const parents = []
                for (let node = element; node; node = node.parentElement)
                  parents.unshift(node)
                for (const node of parents) {
                  const [r, g, b, alpha = 1] = rgb(
                    getComputedStyle(node).backgroundColor
                  )
                  background = [r, g, b].map(
                    (channel, index) =>
                      channel * alpha + background[index] * (1 - alpha)
                  )
                }
                return {
                  text: element.textContent,
                  foreground: rgb(getComputedStyle(element).color).slice(0, 3),
                  background,
                }
              })
            )
          for (const badge of badges)
            assert.ok(
              getContrastRatio(badge.foreground, badge.background) >= 4.5,
              `${colorScheme}: 状态文字对比度不足 ${JSON.stringify(badge)}`
            )
          await page.getByRole('button', { name: /全屏预览/ }).click()
          for (const width of [1440, 820, 390]) {
            await page.setViewportSize({ width, height: 900 })
            if (width === 390) {
              const sidebar = frame.locator('#sidebar')
              await sidebar.waitFor({ state: 'hidden' })
              assert.equal(
                await sidebar.evaluate(
                  (element) => getComputedStyle(element).boxShadow
                ),
                'none'
              )
              const motion = await sidebar.evaluate(async (element) => {
                const read = () => ({
                  x: element.getBoundingClientRect().x,
                  visibility: getComputedStyle(element).visibility,
                })
                const first = read()
                document.querySelector('[data-action="open-nav"]').click()
                const frames = []
                const start = performance.now()
                await new Promise((resolve) => {
                  const tick = () => {
                    frames.push({
                      elapsed: performance.now() - start,
                      ...read(),
                    })
                    if (performance.now() - start < 350)
                      requestAnimationFrame(tick)
                    else resolve()
                  }
                  requestAnimationFrame(tick)
                })
                return { first, frames }
              })
              assert.ok(motion.first.x < -200)
              assert.ok(
                motion.frames.some(
                  (value) => value.x > motion.first.x + 5 && value.x < -5
                ),
                '导航打开应经过实际中间位置'
              )
              assert.ok(Math.abs(motion.frames.at(-1).x) < 1)
              assert.equal(
                await frame
                  .locator('.shell')
                  .evaluate((element) => element.inert),
                true
              )
              const controls = sidebar.getByRole('button')
              await controls.last().focus()
              await controls.last().press('Tab')
              assert.equal(
                await controls
                  .first()
                  .evaluate((element) => element === document.activeElement),
                true
              )
              await controls.first().press('Shift+Tab')
              assert.equal(
                await controls
                  .last()
                  .evaluate((element) => element === document.activeElement),
                true
              )
              await page.screenshot({
                path: path.join(
                  outputDir,
                  `ui-design-${colorScheme}-navigation-open.png`
                ),
              })
              await controls.last().press('Escape')
              await sidebar.waitFor({ state: 'hidden' })
              const trigger = frame.getByRole('button', { name: '打开导航' })
              assert.equal(
                await trigger.evaluate(
                  (element) => element === document.activeElement
                ),
                true
              )
              assert.equal(
                await frame
                  .locator('.shell')
                  .evaluate((element) => element.inert),
                false
              )
              await page
                .getByRole('dialog', { name: 'UI 交互设计全屏预览' })
                .waitFor()
              await page.emulateMedia({ reducedMotion: 'reduce' })
              await trigger.click()
              const reduced = await sidebar.evaluate((element) => {
                const style = getComputedStyle(element)
                return {
                  duration: style.transitionDuration,
                  delay: style.transitionDelay,
                }
              })
              assert.ok(
                reduced.duration
                  .split(',')
                  .every((value) => parseFloat(value) <= 0.001)
              )
              assert.ok(
                reduced.delay
                  .split(',')
                  .every((value) => parseFloat(value) === 0)
              )
              await controls.first().press('Escape')
              await sidebar.waitFor({ state: 'hidden' })
              await page.emulateMedia({ reducedMotion: 'no-preference' })
              await writeFile(
                path.join(
                  outputDir,
                  `ui-design-${colorScheme}-navigation-motion.json`
                ),
                JSON.stringify({ motion, reduced }, null, 2)
              )
            }
            await assertNoHorizontalOverflow(
              page,
              `ui-design-fullscreen-${colorScheme}-${width}`
            )
            await page.screenshot({
              path: path.join(
                outputDir,
                `ui-design-${colorScheme}-${width}.png`
              ),
              fullPage: false,
            })
          }
          await page.getByRole('button', { name: /退出全屏/ }).click()
          await page.setViewportSize({ width: 1440, height: 900 })
        }
        await page.emulateMedia({ colorScheme: 'light' })

        await frame.locator('[data-action="open-mobile-tasks"]').click()
        await frame.locator('.rm-task-card').first().click()
        const detailTitle = await frame.locator('.rm-flow-title').textContent()
        await page.getByRole('button', { name: /全屏预览/ }).click()
        await page.setViewportSize({ width: 390, height: 900 })
        await frame.locator('[data-action="mobile-attachments"]').click()
        const attachments = frame.locator('#floating [role="dialog"]').last()
        await attachments.waitFor()
        await attachments.getByRole('button').first().press('Escape')
        await attachments.waitFor({ state: 'hidden', timeout: 10_000 })
        assert.equal(
          await frame.locator('.rm-flow-title').textContent(),
          detailTitle,
          '关闭附件不能同时退出底层任务详情'
        )
        await page.getByRole('button', { name: /退出全屏/ }).click()
        await page.setViewportSize({ width: 1440, height: 900 })

        await assertNoHorizontalOverflow(page, 'ui-design-details')
      },
    },
  ]
}
