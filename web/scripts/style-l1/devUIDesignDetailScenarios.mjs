import { writeFile } from 'node:fs/promises'
import { verifyMobileNavigationMotion as verifySlidingMotion } from './slidingMotionAssertions.mjs'
import { getContrastRatio } from './colorAssertions.mjs'

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
        await page.getByRole('tab', { name: '设计说明', exact: true }).click()
        const directory = page.getByRole('navigation', { name: '设计阅读目录' })
        const panel = page.locator('.erp-design-document-content')
        const search = page.getByRole('textbox', { name: '搜索设计图解或规范' })
        const select = async (title) => {
          const button = directory.getByRole('button', {
            name: title,
            exact: true,
          })
          await button.click()
          await directory
            .locator('[aria-current="page"]')
            .getByText(title, { exact: true })
            .waitFor()
          assert.equal(await button.getAttribute('aria-current'), 'page')
          assert.equal(await panel.evaluate((node) => node.scrollTop), 0)
        }
        const diagram = page.locator('.erp-markdown-mermaid__canvas svg')
        await page
          .getByRole('heading', { name: '页面骨架：先分工，再分配空间' })
          .waitFor()
        assert.equal(
          await page.locator('.erp-design-prose').count(),
          0,
          '图解不同时堆叠完整规范'
        )
        assert.equal(await directory.getByRole('button').count(), 11)
        const layout = page.locator('.erp-design-layout')
        const geometry = await layout.evaluate((node) => ({
          sidebar: node
            .querySelector('.erp-design-layout-sidebar')
            .getBoundingClientRect().width,
          header: node
            .querySelector('.erp-design-layout-topbar')
            .getBoundingClientRect().height,
          padding: getComputedStyle(
            node.querySelector('.erp-design-layout-content')
          ).paddingLeft,
          gap: node
            .querySelector('.erp-design-layout-gap')
            .getBoundingClientRect().height,
        }))
        assert.deepEqual(geometry, {
          sidebar: 206,
          header: 48,
          padding: '12px',
          gap: 9,
        })
        await page.getByRole('button', { name: '图解 B：顶栏' }).click()
        assert.equal(await layout.getAttribute('data-highlight'), 'header')
        await page.getByRole('switch', { name: '收起示意侧栏' }).click()
        assert.equal(
          await layout
            .locator('.erp-design-layout-sidebar')
            .evaluate((node) => node.getBoundingClientRect().width),
          64
        )
        await page.getByRole('switch', { name: '收起示意侧栏' }).click()
        await verifySlidingMotion(
          page,
          assert,
          '.erp-design-guide-controls .erp-sliding-segmented',
          0
        )
        assert.equal(await layout.getAttribute('data-highlight'), 'navigation')
        await verifySlidingMotion(
          page,
          assert,
          '.erp-design-guide-controls .erp-sliding-segmented',
          3,
          true
        )
        assert.equal(await layout.getAttribute('data-highlight'), 'data')

        await search.fill('不存在的图解')
        await page.getByText('没有匹配的主题或章节', { exact: true }).waitFor()
        assert.equal(
          await directory
            .getByRole('button', { name: '页面骨架', exact: true })
            .count(),
          0
        )
        await page.reload()
        await search.waitFor()
        assert.equal(await search.inputValue(), '不存在的图解')
        await page
          .getByRole('button', { name: '清除搜索', exact: true })
          .click()
        await search.fill('返回')
        await directory
          .getByRole('button', { name: '查找、下钻与返回', exact: true })
          .waitFor()
        await select('查找、下钻与返回')
        assert.equal(await search.inputValue(), '')
        await diagram.waitFor()
        const query = page.getByRole('textbox', { name: '示例查询条件' })
        await query.fill('核对刚才的筛选条件')
        await page
          .getByRole('button', { name: '查看样例详情', exact: true })
          .click()
        await page
          .getByRole('button', { name: '返回原列表', exact: true })
          .click()
        assert.equal(await query.inputValue(), '核对刚才的筛选条件')

        await select('整页、弹窗与抽屉')
        const containerChoices = page.locator('.erp-feedback-container-choices')
        const modalChoice = containerChoices.getByRole('button', { name: /弹窗 · 局部选择/ })
        await modalChoice.click()
        assert.equal(await modalChoice.getAttribute('aria-pressed'), 'true')
        const drawerChoice = containerChoices.getByRole('button', { name: /抽屉 · 任务/ })
        await drawerChoice.click()
        assert.equal(await drawerChoice.getAttribute('aria-pressed'), 'true')
        await page.getByText('侧边展开上下文；复杂编辑仍返回正式入口。', { exact: true }).waitFor()
        const beforePanelScroll = await directory.evaluate(
          (node) => node.scrollTop
        )
        await panel.evaluate((node) => {
          node.scrollTop = node.scrollHeight
        })
        assert((await panel.evaluate((node) => node.scrollTop)) > 0)
        assert.equal(
          await directory.evaluate((node) => node.scrollTop),
          beforePanelScroll
        )
        await page.getByRole('button', { name: '下一个设计主题' }).click()
        await page
          .getByRole('heading', { name: '弹窗结构与尺寸', exact: true })
          .waitFor()
        assert.equal(await panel.evaluate((node) => node.scrollTop), 0)
        await page.goBack()
        await page
          .getByRole('heading', { name: '整页、弹窗与抽屉', exact: true })
          .waitFor()
        await page.goForward()
        await page.reload()
        await page
          .getByRole('heading', { name: '弹窗结构与尺寸', exact: true })
          .waitFor()
        assert.equal(
          await directory
            .getByRole('button', { name: '弹窗结构与尺寸', exact: true })
            .getAttribute('aria-current'),
          'page'
        )
        await select('状态与异常恢复')
        await diagram.waitFor()
        const draft = page.getByRole('textbox', {
          name: '待保存的说明',
          exact: true,
        })
        await draft.fill('失败后这段输入应继续保留')
        await page
          .getByRole('button', { name: '模拟保存失败', exact: true })
          .click()
        await page
          .getByRole('button', { name: '重试示例', exact: true })
          .click()
        await page.getByText('已保存样例', { exact: true }).waitFor()
        assert.equal(await draft.inputValue(), '失败后这段输入应继续保留')

        await select('数据与可视化')
        await diagram.waitFor()
        assert.equal(
          await page.locator('.erp-design-visual-options figure').count(),
          3
        )
        await page
          .getByRole('button', {
            name: '全屏查看数据与可视化原理图',
            exact: true,
          })
          .click()
        await page
          .getByRole('dialog', {
            name: '数据与可视化原理图全屏查看',
            exact: true,
          })
          .waitFor()
        await page.keyboard.press('Escape')
        await page
          .getByRole('dialog', {
            name: '数据与可视化原理图全屏查看',
            exact: true,
          })
          .waitFor({ state: 'hidden' })
        await select('窄屏与动效')
        await diagram.waitFor()
        const fields = await page
          .locator('.erp-design-responsive-demo .erp-design-wire-fields')
          .innerText()
        await page.getByText('窄屏排列', { exact: true }).click()
        assert(
          await page
            .locator('.erp-design-responsive-demo.is-narrow')
            .isVisible()
        )
        assert.equal(
          await page
            .locator('.erp-design-responsive-demo .erp-design-wire-fields')
            .innerText(),
          fields
        )
        await page
          .getByRole('button', { name: '收起目录', exact: true })
          .click()
        assert(!(await directory.isVisible()))
        await page
          .getByRole('button', { name: '展开目录', exact: true })
          .click()
        assert(await directory.isVisible())
        await select('文字与对齐')
        await page.locator('.erp-design-type-figure').waitFor()

        await page
          .locator('.erp-design-reader-toolbar')
          .getByText('规范原文', { exact: true })
          .click()
        await select('高保真视觉合同')
        const prose = page.locator('.erp-design-prose')
        assert.equal(await prose.locator('h2').count(), 1, '规范按章节阅读')
        assert.equal(await page.locator('.erp-design-guide-section').count(), 0)
        const typography = await prose.evaluate((node) => ({
          title: Number.parseFloat(
            getComputedStyle(node.querySelector('h2')).fontSize
          ),
          paragraphLineHeight: Number.parseFloat(
            getComputedStyle(node.querySelector('p')).lineHeight
          ),
          firstColumn: node.querySelector('td').getBoundingClientRect().width,
          cellPadding: Number.parseFloat(
            getComputedStyle(node.querySelector('td')).paddingLeft
          ),
        }))
        assert(typography.title >= 20 && typography.paragraphLineHeight >= 22)
        assert(
          typography.firstColumn >= 150 && typography.cellPadding >= 10,
          '表格名称列不能退化为窄竖排'
        )
        await select('图解阅读')
        await prose
          .getByRole('link', { name: '设计依据：空间与密度', exact: true })
          .click()
        await page.waitForURL(
          (url) =>
            url.searchParams.get('view') === 'rationale' &&
            url.hash === '#spacing-and-density'
        )
        const heading = prose.getByRole('heading', {
          name: /空间与密度：为什么这样留白/,
        })
        await heading.waitFor()
        assert(
          await heading.evaluate((node) => {
            const rect = node.getBoundingClientRect()
            return rect.top >= 0 && rect.top < innerHeight / 2
          }),
          '跨文档锚点必须显示完整标题'
        )
        await search.fill('留白')
        assert(await heading.isVisible(), '从锚点开始搜索不能丢失当前章节')
        await page.reload()
        await heading.waitFor()
        assert.equal(await search.inputValue(), '留白')
        await page
          .locator('.erp-design-reader-toolbar')
          .getByText('图解', { exact: true })
          .click()
        await select('间距与密度')
        const slider = page.getByRole('slider', { name: '对比页面边距' })
        await slider.focus()
        await slider.press('Home')
        assert.equal(await slider.getAttribute('aria-valuenow'), '4')
        assert.equal(
          await page
            .locator('.erp-design-spacing-page')
            .nth(1)
            .evaluate((node) => getComputedStyle(node).paddingLeft),
          '4px'
        )
        await page.getByRole('button', { name: '对齐当前基准' }).click()
        assert.equal(await slider.getAttribute('aria-valuenow'), '12')
        await select('平面与层次')
        await page.getByText('去掉分层作对照', { exact: true }).click()
        assert(
          await page.getByRole('radio', { name: '去掉分层作对照' }).isChecked()
        )
        const matchingSurfaces = () =>
          page.locator('.erp-design-surface-figure').evaluate((node) => {
            const read = (selector) =>
              getComputedStyle(node.querySelector(selector)).backgroundColor
            return (
              read('.erp-design-surface-page') ===
              read('.erp-design-surface-content')
            )
          })
        assert(await matchingSurfaces())
        await page.getByText('当前分层', { exact: true }).click()
        assert(!(await matchingSurfaces()))
        await assertNoHorizontalOverflow(page, '图解阅读器')
        await page.setViewportSize({ width: 1024, height: 768 })
        await select('整页、弹窗与抽屉')
        await containerChoices.waitFor()
        await assertNoHorizontalOverflow(page, '窄桌面图解阅读器')
        assert(
          await panel.evaluate(
            (node) => node.scrollWidth <= node.clientWidth + 1
          ),
          '窄桌面内容不能产生整栏横向滚动'
        )
        await page.setViewportSize({ width: 1440, height: 900 })
        await page
          .getByRole('link', { name: '打开可交互设计', exact: true })
          .click()
        await page
          .locator('iframe[title="ERP 最新可交互设计"]')
          .waitFor({ state: 'visible' })
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
        await page
          .getByRole('heading', { name: '页面骨架：先分工，再分配空间' })
          .waitFor()
        await page.getByRole('tab', { name: '设计依据', exact: true }).click()
        await page
          .getByRole('heading', { name: '为什么是 12 px，而不是越宽松越好？' })
          .waitFor()
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
        for (const inset of Object.values(fullscreenBounds)) {
          assert.ok(
            Math.abs(inset - 12) <= 1,
            `全屏预览四边应留出完整操作边界: ${JSON.stringify(fullscreenBounds)}`
          )
        }
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
                for (let node = element; node; node = node.parentElement) {
                  parents.unshift(node)
                }
                for (const node of parents) {
                  const [r, g, b, alpha = 1] = rgb(
                    getComputedStyle(node).backgroundColor
                  )
                  const previousBackground = background
                  background = [r, g, b].map(
                    (channel, index) =>
                      channel * alpha + previousBackground[index] * (1 - alpha)
                  )
                }
                return {
                  text: element.textContent,
                  foreground: rgb(getComputedStyle(element).color).slice(0, 3),
                  background,
                }
              })
            )
          for (const badge of badges) {
            assert.ok(
              getContrastRatio(badge.foreground, badge.background) >= 4.5,
              `${colorScheme}: 状态文字对比度不足 ${JSON.stringify(badge)}`
            )
          }
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
                    if (performance.now() - start < 350) {
                      requestAnimationFrame(tick)
                    } else {
                      resolve()
                    }
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
