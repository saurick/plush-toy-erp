import { writeFile } from 'node:fs/promises'
import { chooseUIDesignMode, chooseUIDesignState, openUIDesignMobileTasks, visibleUIDesignFrame } from './devUIDesignNavigation.mjs'
import { verifyMobileNavigationMotion as verifySlidingMotion } from './slidingMotionAssertions.mjs'
import { getContrastRatio } from './colorAssertions.mjs'
import { createDevWorkCenterDesignScenarios } from './devWorkCenterDesignScenarios.mjs'
import { createDevSharedComponentScenarios } from './devSharedComponentScenarios.mjs'
import { createDevUIDesignPreviewScenarios } from './devUIDesignPreviewScenarios.mjs'
import { createDevUIDesignPressureScenarios } from './devUIDesignPressureScenarios.mjs'
import { createDevUIPageStateScenarios } from './devUIPageStateScenarios.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { createSearchCompositionScenarios } from './searchCompositionScenarios.mjs'

export function createDevUIDesignDetailScenarios({
  assert,
  assertNoHorizontalOverflow,
  outputDir,
  path,
  customerRuntimeEffectiveSession,
}) {
  return [
    ...createSearchCompositionScenarios({ assert, assertNoHorizontalOverflow, outputDir, path }),
    ...createDevWorkCenterDesignScenarios({ assert, assertNoHorizontalOverflow }),
    ...createDevSharedComponentScenarios({ assert, assertNoHorizontalOverflow, customerRuntimeEffectiveSession, outputDir }),
    ...createDevUIDesignPreviewScenarios({ assert, assertNoHorizontalOverflow, outputDir, path }),
    ...createDevUIDesignPressureScenarios({ assert, assertNoHorizontalOverflow, outputDir, path }),
    ...createDevUIPageStateScenarios({ assert, assertNoHorizontalOverflow, outputDir, path }),
    {
      name: 'dev-ui-design-directory',
      path: '/__dev/ui-design?view=rationale&topic=spacing&read=guide',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      themeMode: 'light',
      verify: async (page) => {
        const directory = page.getByRole('navigation', { name: '设计阅读目录' })
        const searchArea = page.getByRole('search', { name: '查找图解主题' })
        const search = searchArea.getByRole('textbox', { name: '搜索设计图解' })
        const hideDirectory = page.getByRole('button', { name: '收起目录', exact: true })
        const showDirectory = page.getByRole('button', { name: '展开目录', exact: true })
        const assertHierarchy = async () => {
          await directory.getByRole('button').first().waitFor()
          await waitForFiniteAnimations(page, { selector: '.erp-design-document-shell' })
          const groups = await directory.locator('.erp-design-topic-group').evaluateAll((nodes) => nodes.map((group) => {
            const heading = group.querySelector('h3')
            const separator = getComputedStyle(heading, '::after')
            return {
              heading: heading.textContent,
              separatorWidth: parseFloat(separator.width),
              separatorBorder: parseFloat(separator.borderTopWidth),
              items: [...group.querySelectorAll('button')].map((button) => {
                const label = button.querySelector('span')
                const labelBox = label.getBoundingClientRect()
                const style = getComputedStyle(button)
                return {
                  title: label.textContent,
                  indent: labelBox.left - heading.getBoundingClientRect().left,
                  border: parseFloat(style.borderWidth),
                  shadow: style.boxShadow,
                  overflow: button.scrollWidth > button.clientWidth + 1,
                  height: button.getBoundingClientRect().height,
                }
              }),
            }
          }))
          assert(groups.length > 0, '目录应有可见分类')
          for (const group of groups) {
            assert(group.separatorWidth >= 12 && group.separatorBorder >= 1, `${group.heading}应有分类分隔线`)
            for (const item of group.items) {
              assert(item.indent >= 12, `${item.title}应相对分类标题缩进`)
              assert.equal(item.border, 0, `${item.title}不应单独卡片化`)
              assert.equal(item.shadow, 'none', `${item.title}不叠加选中底线或阴影`)
              assert(!item.overflow, `${item.title}的文字不能溢出`)
              assert(item.height >= 40, `${item.title}应保留可点击高度`)
            }
          }
          assert.equal(await directory.locator('[aria-current="page"]').count(), 1)
          await assertNoHorizontalOverflow(page)
        }
        await assertHierarchy()
        await page.screenshot({ path: path.join(outputDir, 'ui-design-directory.png') })
        const target = directory.getByRole('button', { name: '文字与对齐', exact: true })
        const normal = await target.evaluate((node) => getComputedStyle(node).backgroundColor)
        await target.hover()
        assert.notEqual(await target.evaluate((node) => getComputedStyle(node).backgroundColor), normal)
        await target.click()
        await directory.locator('[aria-current="page"]').getByText('文字与对齐', { exact: true }).waitFor()
        assert.equal(await target.getAttribute('aria-current'), 'page')
        await page.reload()
        await target.waitFor()
        assert.equal(await target.getAttribute('aria-current'), 'page', '刷新应保留当前主题')
        const fullDirectorySize = await directory.getByRole('button').count()
        await hideDirectory.click()
        await directory.waitFor({ state: 'hidden' })
        assert(await search.isVisible(), '收起目录后仍可从顶部搜索')
        await search.fill('窄屏与动效')
        await search.press('Enter')
        await directory.getByRole('button', { name: '窄屏与动效', exact: true }).waitFor()
        await page.waitForFunction(() => document.querySelectorAll('.erp-design-document-toc .erp-design-topic-button').length === 1)
        assert.equal(await directory.getByRole('button').count(), 1)
        await directory.getByRole('button', { name: '窄屏与动效', exact: true }).click()
        await directory.locator('[aria-current="page"]').getByText('窄屏与动效', { exact: true }).waitFor()
        assert.equal(await search.inputValue(), '窄屏与动效', '打开图解保留关键词')
        assert.equal(await directory.getByRole('button').count(), 1, '打开图解保留搜索结果')
        await assertHierarchy()
        await hideDirectory.click()
        await directory.waitFor({ state: 'hidden' })
        await search.press('Enter')
        await directory.waitFor()
        assert.equal(await directory.getByRole('button').count(), 1, '再次提交相同关键词也能展开结果')
        await hideDirectory.click()
        await showDirectory.click()
        await assertHierarchy()
        await search.locator('xpath=..').getByRole('button', { name: '清除搜索', exact: true }).click()
        await directory.getByRole('button').nth(fullDirectorySize - 1).waitFor()
        assert.equal(await search.inputValue(), '')
        assert.equal(await directory.getByRole('button').count(), fullDirectorySize)
        await page.setViewportSize({ width: 1280, height: 800 })
        const rules = page.getByRole('group', { name: '当前图解的规范来源' })
        const closeRule = page.getByRole('button', { name: '收起规则', exact: true })
        const excerpt = page.locator('.erp-design-prose')
        for (const view of ['设计依据', '设计说明']) {
          await page.getByRole('tab', { name: view, exact: true }).click()
          await assertHierarchy()
          assert.equal(await page.getByLabel('设计阅读方式', { exact: true }).count(), 0)
          const selected = directory.locator('[aria-current="page"]')
          const title = await selected.innerText()
          const count = await directory.getByRole('button').count()
          await rules.getByRole('button').click()
          await excerpt.waitFor()
          await assertHierarchy()
          assert.equal(await selected.innerText(), title, '原位展开不切换目录对象')
          assert.equal(await directory.getByRole('button').count(), count, '始终使用图解目录')
          assert.equal(await search.count(), 1)
          await closeRule.click()
          await excerpt.waitFor({ state: 'hidden' })
        }
      },
    },
    {
      name: 'dev-ui-design-rule-read-through',
      path: '/__dev/ui-design?view=specification&topic=navigation',
      viewport: { width: 1280, height: 720 },
      themeMode: 'light',
      verify: async (page) => {
        const panel = page.locator('.erp-design-document-content')
        const trigger = page.getByRole('button', { name: '查找与返回的主线', exact: true })
        const article = page.getByRole('article', { name: '查找与返回的主线', exact: true })
        const chart = article.locator('.erp-markdown-mermaid__canvas svg')
        const close = article.getByRole('button', { name: '收起规则', exact: true })
        const openRule = async () => {
          await trigger.scrollIntoViewIfNeeded()
          const origin = await panel.evaluate((node) => node.scrollTop)
          await trigger.click()
          await chart.waitFor()
          return origin
        }
        const closeRule = async (origin) => {
          await close.click()
          await article.waitFor({ state: 'hidden' })
          assert(Math.abs(await panel.evaluate((node) => node.scrollTop) - origin) <= 1, '收起规则恢复原阅读位置')
          assert(await trigger.evaluate((node) => node === document.activeElement), '收起规则恢复入口焦点')
        }

        const origin = await openRule()
        await page.waitForFunction(() => {
          const rule = document.querySelector('#design-related-rule')?.getBoundingClientRect()
          const reader = document.querySelector('.erp-design-document-content')?.getBoundingClientRect()
          return rule && reader && rule.top >= reader.top - 1 && rule.bottom <= reader.bottom + 1
        }, undefined, { timeout: 4000 })
        assert(await article.evaluate((node) => node === document.activeElement), '展开时焦点进入规则')
        await closeRule(origin)

        await page.setViewportSize({ width: 950, height: 540 })
        const narrowOrigin = await openRule()
        const start = await panel.evaluate((node) => node.scrollTop)
        const reader = await panel.boundingBox()
        await page.mouse.move(reader.x + 8, reader.y + reader.height / 2)
        await page.mouse.wheel(0, 1200)
        await page.waitForFunction((previous) => {
          const panel = document.querySelector('.erp-design-document-content')
          const button = document.querySelector('.erp-design-rule-close')?.getBoundingClientRect()
          const bounds = panel?.getBoundingClientRect()
          return button && bounds && panel.scrollTop > previous && button.top >= bounds.top && button.bottom <= bounds.bottom + 1
        }, start, { timeout: 4000 })
        await closeRule(narrowOrigin)
        await assertNoHorizontalOverflow(page)
      },
    },
    {
      name: 'dev-workbench-directory-consistency',
      path: '/__dev/project-skills',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      themeMode: 'light',
      verify: async (page) => {
        const cases = [
          { path: '/__dev/project-skills', selector: '.erp-dev-skills__list > button' },
          { path: '/__dev/ui-design?page=controls', selector: '.erp-control-library-directory nav > button' },
          { path: '/__dev/development-resources?view=relationships', selector: '.erp-dev-project-relationships__catalog section > button' },
        ]
        const selectedSelector = ':is([aria-current="page"], [aria-pressed="true"])'
        const assertRows = async (selector) => {
          await page.mouse.move(0, 0)
          const rows = await page.locator(selector).evaluateAll((nodes) => nodes.map((node) => {
            const style = getComputedStyle(node)
            const label = node.querySelector('strong') || node
            return {
              title: label.textContent,
              shared: node.classList.contains('erp-dev-directory-item'),
              selected: node.matches('[aria-current="page"], [aria-pressed="true"]'),
              border: parseFloat(style.borderWidth),
              shadow: style.boxShadow,
              background: style.backgroundColor,
              fontWeight: getComputedStyle(label).fontWeight,
              height: node.getBoundingClientRect().height,
              overflow: node.scrollWidth > node.clientWidth + 1,
            }
          }))
          assert(rows.length > 1)
          assert.equal(rows.filter((row) => row.selected).length, 1)
          for (const row of rows) {
            assert(row.shared, `${row.title}应使用共享目录样式`)
            assert.equal(row.border, 0, `${row.title}不应单独卡片化`)
            assert.equal(row.shadow, 'none', `${row.title}不叠加选中底线或阴影`)
            assert.equal(row.fontWeight, row.selected ? '600' : '400')
            if (!row.selected) assert.equal(row.background, 'rgba(0, 0, 0, 0)')
            assert(row.height >= 40 && !row.overflow, `${row.title}应保留点击范围且没有文字溢出`)
          }
          assert.notEqual(rows.find((row) => row.selected).background, 'rgba(0, 0, 0, 0)')
          if (selector === '.erp-dev-skills__list > button') {
            const gap = await page.locator('.erp-dev-skills__list').evaluate((node) => parseFloat(getComputedStyle(node).rowGap))
            assert(gap <= 4, '目录条目不沿用内容卡片的区块间距')
            assert(rows.every((row) => row.height === 40), '单行目录采用统一紧凑行高')
          }
          await assertNoHorizontalOverflow(page)
        }
        for (const [index, entry] of cases.entries()) {
          if (index) await page.goto(new URL(entry.path, page.url()).href)
          const items = page.locator(entry.selector)
          await items.nth(1).waitFor()
          await assertRows(entry.selector)
          if (!index) await page.screenshot({ path: path.join(outputDir, 'project-skills-directory.png') })
          const target = items.nth(1)
          const label = await target.locator('strong').innerText()
          await target.click()
          await page.locator(`${entry.selector}${selectedSelector}`).filter({ hasText: label }).waitFor()
          await page.reload()
          await page.locator(`${entry.selector}${selectedSelector}`).filter({ hasText: label }).waitFor()
          await assertRows(entry.selector)
          await target.press('Tab')
          const focused = page.locator(`${entry.selector}:focus-visible`)
          assert.equal(await focused.count(), 1)
          assert.equal(await focused.evaluate((node) => getComputedStyle(node).outlineWidth), '2px')
          await page.setViewportSize({ width: 1280, height: 800 })
          await assertRows(entry.selector)
          await page.setViewportSize({ width: 1920, height: 1080 })
        }
      },
    },
    {
      name: 'dev-ui-design-lazy-views',
      path: '/__dev/ui-design?view=specification',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const preview = page.locator(visibleUIDesignFrame)
        const assertHTMLNotLoaded = async () => {
          assert.equal(await page.locator('iframe[title="ERP 最新可交互设计"]').count(), 0)
          const loaded = await page.evaluate(() => performance
            .getEntriesByType('resource')
            .some((item) => decodeURIComponent(item.name).includes('/docs/product/ui-design/index.html')))
          assert.equal(loaded, false, '说明和控件不加载 HTML 原型')
        }
        await page.locator('.erp-design-document-shell').waitFor()
        await assertHTMLNotLoaded()
        await page.getByRole('tab', { name: '设计依据', exact: true }).click()
        await page.locator('.erp-design-document-shell').waitFor()
        await assertHTMLNotLoaded()

        await page.goto(new URL('/__dev/ui-design?page=controls', page.url()).href)
        await page.getByRole('region', { name: '控件设计', exact: true }).waitFor()
        assert.equal(await page.getByRole('tab', { name: '设计样例', exact: true }).getAttribute('aria-selected'), 'true')
        await assertHTMLNotLoaded()
        await page.getByRole('tab', { name: '可交互设计', exact: true }).click()
        await chooseUIDesignMode(page, '登录页')
        await preview.waitFor()
        const originalFrame = await preview.elementHandle()
        const frame = page.frameLocator(visibleUIDesignFrame)
        const account = frame.locator('input').first()
        await account.fill('retained-preview')
        const tabs = page.locator('.erp-dev-ui-design-header')
        const before = await tabs.boundingBox()
        await page.getByRole('tab', { name: '设计说明', exact: true }).click()
        await page.locator('.erp-design-document-shell').waitFor()
        await page.getByRole('tab', { name: '可交互设计', exact: true }).click()
        await preview.waitFor()
        assert(await originalFrame.evaluate((node) => node.isConnected && !node.closest('[hidden]')), '已打开的原型保持挂载')
        assert.equal(await account.inputValue(), 'retained-preview')
        const after = await tabs.boundingBox()
        for (const key of ['x', 'y', 'width', 'height']) {
          assert(Math.abs(after[key] - before[key]) <= 1, `切换查看方式保持标题栏 ${key}`)
        }
        await page.getByRole('button', { name: /重置演示/u }).click()
        await account.waitFor()
        assert.notEqual(await account.inputValue(), 'retained-preview')
        await assertNoHorizontalOverflow(page)
      },
    },
    {
      name: 'dev-ui-design-login',
      path: '/__dev/ui-design?page=login',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const frame = page.frameLocator(visibleUIDesignFrame)
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
        await frame.locator('.preview-account-trigger').click()
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
        await chooseUIDesignMode(page, '桌面 ERP')
        await frame.locator('.workbench-queue-tabs button').first().waitFor()
        await assertNoHorizontalOverflow(page)
      },
    },
    {
      name: 'dev-ui-design-reading-details',
      path: '/__dev/ui-design?topic=layout',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await page
          .getByRole('heading', { name: '交互设计', exact: true })
          .waitFor()
        await page.getByRole('tab', { name: '设计说明', exact: true }).click()
        const directory = page.getByRole('navigation', { name: '设计阅读目录' })
        const panel = page.locator('.erp-design-document-content')
        const search = page.getByRole('textbox', { name: '搜索设计图解' })
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
        assert.equal(await directory.getByRole('button').count(), 19)
        const layout = page.locator('.erp-design-layout')
        const geometry = await layout.evaluate((node) => ({
          sidebar: node
            .querySelector('.erp-design-layout-sidebar')
            .getBoundingClientRect().width,
          account: node
            .querySelector('.erp-design-layout-account')
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
          account: 46,
          padding: '8px',
          gap: 6,
        })
        await page.getByRole('button', { name: '图解 B：账号与操作' }).click()
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
        await search.press('Enter')
        await page.getByText('没有匹配的图解主题', { exact: true }).waitFor()
        assert.equal(
          await directory
            .getByRole('button', { name: '页面骨架', exact: true })
            .count(),
          0
        )
        await page.reload()
        await search.waitFor()
        assert.equal(await search.inputValue(), '不存在的图解')
        await directory.getByRole('button', { name: '清除搜索', exact: true }).click()
        await page.waitForFunction(() => {
          const search = document.activeElement
          return search?.getAttribute('aria-label') === '搜索设计图解' && search.value === ''
        })
        await search.fill('返回')
        await search.press('Enter')
        await page.waitForURL((url) => url.searchParams.get('q') === '返回')
        await directory
          .getByRole('button', { name: '查找、下钻与返回', exact: true })
          .waitFor()
        await select('查找、下钻与返回')
        assert.equal(await search.inputValue(), '返回')
        await diagram.waitFor()
        const calloutNotes = page.getByRole('complementary', { name: '图解要点' })
        const returnMarker = page.getByRole('button', { name: '图解 3：回到原列表', exact: true })
        const returnNote = calloutNotes.getByRole('button', { name: '3 回到原列表', exact: true })
        const pressed = page.locator('[aria-pressed="true"]')
        await returnNote.press('Enter')
        await returnMarker.and(pressed).waitFor()
        const recordMarker = page.getByRole('button', { name: '图解 2：选中具体记录', exact: true })
        const recordNote = calloutNotes.getByRole('button', { name: '2 选中具体记录', exact: true })
        await recordMarker.click()
        await recordNote.and(pressed).waitFor()
        assert.equal(await returnNote.getAttribute('aria-pressed'), 'false')
        const query = page.getByRole('textbox', { name: '示例查询条件' })
        await query.fill('没有这个订单')
        await query.press('Enter')
        await page.getByText('没有匹配的样例订单', { exact: true }).waitFor()
        await query.fill('B')
        await query.press('Enter')
        const detailTrigger = page.getByRole('button', { name: '查看样例订单 B详情', exact: true })
        await detailTrigger.press('Enter')
        const sampleDetailTitle = page.getByRole('heading', { name: '样例订单 B · 详情', exact: true })
        await sampleDetailTitle.waitFor()
        assert(await sampleDetailTitle.evaluate((node) => node === document.activeElement), '打开具体详情后聚焦对象')
        await page
          .getByRole('button', { name: '返回原列表', exact: true })
          .click()
        assert.equal(await query.inputValue(), 'B')
        assert(await detailTrigger.evaluate((node) => node === document.activeElement), '返回恢复原记录入口焦点')
        assert.equal(await detailTrigger.locator('..').getAttribute('data-selected'), 'true')
        await page.getByRole('group', { name: '当前图解的规范来源' }).getByRole('button', { name: '查找与返回的主线', exact: true }).click()
        await page.getByRole('button', { name: '收起规则', exact: true }).click()
        assert.equal(await query.inputValue(), 'B')
        assert.equal(await recordNote.getAttribute('aria-pressed'), 'true')
        await page.reload()
        assert.equal(await recordNote.getAttribute('aria-pressed'), 'true', '刷新恢复图解定位')

        await search.locator('xpath=..').getByRole('button', { name: '清除搜索', exact: true }).click()
        await select('整页、弹窗与抽屉')
        const containerChoices = page.locator('.erp-feedback-container-choices')
        const modalChoice = containerChoices.getByRole('button', { name: /弹窗 · 局部选择/ })
        await modalChoice.click()
        assert.equal(await modalChoice.getAttribute('aria-pressed'), 'true')
        const sourceDemo = page.getByRole('region', { name: '试一次局部来源选择' })
        const sourceTrigger = sourceDemo.getByRole('button', { name: '选择演示材料', exact: true })
        await sourceTrigger.click()
        const sourceDialog = page.getByRole('dialog').filter({ hasText: '从演示材料库添加' })
        await sourceDialog.locator('tbody tr.ant-table-row').first().getByRole('checkbox').check()
        await sourceDialog.getByRole('button', { name: '添加到演示结果', exact: true }).click()
        await sourceDialog.waitFor({ state: 'hidden' })
        const sourceResult = sourceDemo.getByLabel('来源选择示例结果', { exact: true })
        assert.equal(await sourceResult.innerText(), '已添加 1 条：短毛绒')
        const drawerChoice = containerChoices.getByRole('button', { name: /抽屉 · 任务/ })
        await drawerChoice.click()
        assert.equal(await drawerChoice.getAttribute('aria-pressed'), 'true')
        await page.getByText('侧边展开上下文；复杂编辑仍返回正式入口。', { exact: true }).waitFor()
        assert.equal(await sourceDemo.isVisible(), false)
        await modalChoice.click()
        assert.equal(await sourceResult.innerText(), '已添加 1 条：短毛绒', '切换容器不丢已确认样例')
        // Use a short viewport so this chapter exercises independent scrolling.
        await page.setViewportSize({ width: 1440, height: 700 })
        await waitForFiniteAnimations(page, { selector: '.erp-design-document-shell' })
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
        await select('弹窗结构与尺寸')
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
        await page.setViewportSize({ width: 1440, height: 900 })
        await select('状态与异常恢复')
        await diagram.waitFor()
        const phone = page.getByRole('region', { name: '手机页面状态样例' })
        await page.getByRole('button', { name: '完成读取', exact: true }).click()
        await phone.getByRole('button', { name: '选择核对样品资料', exact: true }).click()
        await page.locator('.erp-design-state-tools .ant-select-selector').click()
        await page.locator('.ant-select-dropdown:visible').getByText('刷新失败', { exact: true }).click()
        await phone.getByText('刷新失败，仍显示上次结果', { exact: true }).waitFor()
        await phone.getByText('当前选择：核对样品资料', { exact: true }).waitFor()
        await phone.getByRole('button', { name: '重试读取', exact: true }).click()
        await phone.getByText('刷新失败，仍显示上次结果', { exact: true }).waitFor({ state: 'hidden' })
        await phone.getByText('当前选择：核对样品资料', { exact: true }).waitFor()

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

        const rules = page.getByRole('group', { name: '当前图解的规范来源' })
        const visualRule = rules.getByRole('button', { name: '复合信息与上下布局', exact: true })
        const closeRule = page.getByRole('button', { name: '收起规则', exact: true })
        const prose = page.locator('.erp-design-prose')
        const visualSection = prose.getByRole('heading', { name: '复合信息与上下布局', exact: true })
        await search.fill('文字与对齐')
        await search.press('Enter')
        await page.waitForURL((url) => url.searchParams.get('q') === '文字与对齐')
        await visualRule.scrollIntoViewIfNeeded()
        const guideScroll = await panel.evaluate((node) => node.scrollTop)
        await visualRule.press('Enter')
        await visualSection.waitFor()
        assert.equal(await prose.getByRole('heading', { name: '高保真视觉合同 / Visual Contract' }).count(), 0)
        assert(await page.locator('.erp-design-type-figure').isVisible(), '展开规则时图解保持可用')
        assert(await prose.evaluate((node) => document.activeElement === node), '从键盘展开后聚焦规则')
        assert.equal(await search.inputValue(), '文字与对齐', '展开不改变图解搜索')
        await page.goBack()
        await prose.waitFor({ state: 'hidden' })
        assert.equal(await search.inputValue(), '文字与对齐')
        await page.goForward()
        await visualSection.waitFor()
        await closeRule.click()
        await prose.waitFor({ state: 'hidden' })
        assert.equal(await search.inputValue(), '文字与对齐')
        assert(Math.abs(await panel.evaluate((node) => node.scrollTop) - guideScroll) <= 1, '收起规则恢复正文滚动位置')
        assert(await visualRule.evaluate((node) => document.activeElement === node), '收起后焦点回到规则入口')
        await visualRule.click()
        await visualSection.waitFor()
        const typography = await prose.evaluate((node) => ({
          title: Number.parseFloat(
            getComputedStyle(node.querySelector('h3')).fontSize
          ),
          paragraphLineHeight: Number.parseFloat(
            getComputedStyle(node.querySelector('p')).lineHeight
          ),
          firstColumn: node.querySelector('td').getBoundingClientRect().width,
          cellPadding: Number.parseFloat(
            getComputedStyle(node.querySelector('td')).paddingLeft
          ),
        }))
        assert(typography.title >= 16 && typography.paragraphLineHeight >= 22)
        assert(
          typography.firstColumn >= 150 && typography.cellPadding >= 10,
          '表格名称列不能退化为窄竖排'
        )
        await page.goto(new URL('/__dev/ui-design?view=specification&read=reference&chapter=图解阅读--illustrated-reading', page.url()).href)
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
        await search.press('Enter')
        assert(await heading.isVisible(), '从锚点开始搜索不能丢失当前章节')
        await page.reload()
        await heading.waitFor()
        assert.equal(await search.inputValue(), '留白')
        await closeRule.click()
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
        await rules.getByRole('button', { name: '各处留白解决什么问题', exact: true }).click()
        await prose.getByRole('heading', { name: /各处留白解决什么问题/u }).waitFor()
        await closeRule.click()
        await slider.waitFor()
        assert.equal(await slider.getAttribute('aria-valuenow'), '4', '返回原主题保留图解参数')
        await page.getByRole('button', { name: '对齐当前基准' }).click()
        assert.equal(await slider.getAttribute('aria-valuenow'), '8')
        await search.locator('..').getByRole('button', { name: '清除搜索', exact: true }).click()
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
        await page.setViewportSize({ width: 390, height: 844 })
        await page.goto(new URL('/__dev/ui-design?view=specification&topic=navigation&point=record', page.url()).href)
        const openDirectory = page.getByRole('button', { name: '展开目录', exact: true })
        await openDirectory.waitFor()
        assert.equal(await directory.isVisible(), false)
        const searchBox = await search.boundingBox()
        const toggleBox = await openDirectory.boundingBox()
        assert(searchBox && toggleBox && searchBox.y + searchBox.height <= toggleBox.y, '窄屏顶部搜索独占一行')
        assert.equal(await recordMarker.getAttribute('aria-pressed'), 'true')
        const markerBox = await recordMarker.boundingBox()
        assert(markerBox.width >= 44 && markerBox.height >= 44, '窄屏标注点击区至少 44px')
        assert(await panel.evaluate((node) => node.clientWidth > 340 && node.scrollWidth <= node.clientWidth + 1), '目录收起后保留正文可读宽度')
        await returnMarker.click()
        await returnNote.and(pressed).waitFor()
        await search.fill('文字与对齐')
        await search.press('Enter')
        await directory.getByRole('button', { name: '文字与对齐', exact: true }).click()
        await openDirectory.waitFor()
        assert.equal(await directory.isVisible(), false, '选择主题后收起窄屏目录')
        assert.equal(await search.inputValue(), '文字与对齐', '窄屏返回正文保留搜索词')
        assert(await panel.evaluate((node) => node === document.activeElement), '从窄屏目录转到正文')
        await rules.getByRole('button', { name: '复合信息与上下布局', exact: true }).click()
        await visualSection.waitFor()
        assert(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth + 1), '规则表只在自身范围内横向滚动')
        await assertNoHorizontalOverflow(page, '390px 图解阅读器')
        await closeRule.click()
        await prose.waitFor({ state: 'hidden' })
      },
    },
    {
      name: 'dev-ui-design-details',
      path: '/__dev/ui-design',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await page
          .getByRole('tab', { name: '可交互设计', exact: true })
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
        await page.getByRole('navigation', { name: '设计阅读目录' }).getByRole('button', { name: '页面骨架', exact: true }).click()
        await page
          .getByRole('heading', { name: '页面骨架：先分工，再分配空间' })
          .waitFor()
        await page.getByRole('tab', { name: '设计依据', exact: true }).click()
        await page
          .getByRole('heading', { name: '为什么采用 8 px 的紧凑页面边距？' })
          .waitFor()
        await page.getByRole('tab', { name: '可交互设计', exact: true }).click()
        await frame
          .getByRole('group', { name: '销售订单视图', exact: true })
          .waitFor()
        await page.getByRole('button', { name: /全屏预览/ }).click()
        await page
          .getByRole('dialog', { name: '交互设计全屏预览' })
          .waitFor()
        const fullscreenBounds = await page
          .getByRole('dialog', { name: '交互设计全屏预览' })
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
        assert.equal(await frame.getByRole('button', { name: '全部模块', exact: true }).count(), 0)
        await chooseUIDesignState(page, '空结果')
        await frame.getByText('当前筛选没有记录', { exact: true }).waitFor()
        await chooseUIDesignState(page, '正常')
        await frame.locator('.data-surface').waitFor()
        await frame.locator('.preview-account-trigger').click()
        const account = frame.getByRole('menu', { name: '账号菜单' })
        await account.waitFor()
        const accountAnchor = await frame.locator('.preview-account-trigger').boundingBox()
        const accountPopup = await account.boundingBox()
        assert.ok(Math.abs(accountPopup.x - (accountAnchor.x + accountAnchor.width) - 8) <= 1, '设计稿账号菜单从按钮右侧展开')
        assert.ok(Math.abs(accountPopup.y + accountPopup.height - (accountAnchor.y + accountAnchor.height)) <= 1, '设计稿账号菜单与按钮底边对齐')
        await frame.locator('.preview-account-trigger').click()
        await frame.getByRole('button', { name: '收起侧边菜单', exact: true }).click()
        await frame.locator('.preview-account-trigger').click()
        const collapsedAccountAnchor = await frame.locator('.preview-account-trigger').boundingBox()
        const collapsedAccountPopup = await account.boundingBox()
        assert.ok(Math.abs(collapsedAccountPopup.x - (collapsedAccountAnchor.x + collapsedAccountAnchor.width) - 8) <= 1, '设计稿收起侧栏后账号菜单仍向右展开')
        await frame.locator('.preview-account-trigger').click()
        const previousViewport = page.viewportSize()
        await page.setViewportSize({ width: 390, height: 844 })
        await frame.locator('[data-action="open-nav"]').filter({ visible: true }).first().click()
        await frame.locator('.preview-account-trigger').click()
        const narrowAccountPopup = await account.boundingBox()
        assert.ok(narrowAccountPopup.x >= 0 && narrowAccountPopup.x + narrowAccountPopup.width <= 390 && narrowAccountPopup.y >= 0 && narrowAccountPopup.y + narrowAccountPopup.height <= 844, '设计稿窄屏账号菜单保留在视口内')
        await frame.locator('.preview-account-trigger').click()
        await page.setViewportSize(previousViewport)
        await frame.getByRole('button', { name: '展开侧边菜单', exact: true }).click()
        await frame.locator('.preview-account-trigger').click()
        await account
          .getByRole('button', { name: '切换工作入口' })
          .press('Escape')
        await account.waitFor({ state: 'hidden' })
        assert.equal(
          await page
            .getByRole('dialog', { name: '交互设计全屏预览' })
            .isVisible(),
          true
        )
        await frame
          .getByRole('button', { name: '销售管理', exact: true })
          .press('Escape')
        await page
          .getByRole('dialog', { name: '交互设计全屏预览' })
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
                .getByRole('dialog', { name: '交互设计全屏预览' })
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

        await openUIDesignMobileTasks(frame)
        await frame.locator('.rm-task-card').first().locator('.rm-task-open').press('Enter')
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
