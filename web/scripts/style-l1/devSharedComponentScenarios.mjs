import { readFile, writeFile } from 'node:fs/promises'
import { dateFilterButton, manualDateInputs, openDateFilter } from './dateFilterActions.mjs'
import { BusinessTextPolicy } from '../../src/common/consts/policies.generated.mjs'
import { assertControlPreviewThemeIsolation } from './controlThemeAssertions.mjs'
import { createDevPaginationScenarios } from './devPaginationScenarios.mjs'
import { createDevBusinessComponentScenarios } from './devBusinessComponentScenarios.mjs'
import { createDevToolbarExampleScenarios } from './devToolbarExampleScenarios.mjs'
import { createSelectOverflowScenarios } from './selectOverflowScenarios.mjs'
import { createGroupedSelectScenarios } from './groupedSelectScenarios.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { isAcceptedFocusBorder } from './colorAssertions.mjs'
import {
  findUIDesignChapter,
  readUIDesignChapters,
} from '../../src/dev-workbench/config/devUIDesignReading.mjs'

export function createDevSharedComponentScenarios({
  assert,
  assertNoHorizontalOverflow,
  customerRuntimeEffectiveSession,
  outputDir,
}) {
  const assertSelectedRule = async (usage, name) => {
    const row = usage.locator('tr[data-usage-selected]')
    assert.equal(await row.count(), 1, `「${name}」应是唯一选中的规则`)
    assert.equal(await row.locator('button').innerText(), name)
    const { cells, unselected } = await row.evaluate((element) => ({
      cells: [...element.cells].map((cell) => getComputedStyle(cell).backgroundColor),
      unselected: getComputedStyle(element.parentElement.querySelector('tr:not([data-usage-selected]) td')).backgroundColor,
    }))
    assert(cells.every((color) => color === cells[0]), `「${name}」应整行填色`)
    assert.notEqual(cells[0], unselected, `「${name}」选中底色应区别于相邻行`)
  }
  const assertFilledTarget = async (target) => {
    await target.waitFor({ timeout: 5000 })
    const { outline, image, shadow, innerFillSize, compactFrame } = await target.evaluate(async (element) => {
      // The selected control may be transitioning from its unfocused shadow.
      const fillTransitions = element.getAnimations().filter((animation) => animation.transitionProperty === 'box-shadow')
      await Promise.allSettled(fillTransitions.map((animation) => animation.finished))
      const style = getComputedStyle(element)
      let compactFrame
      if (element.matches('.erp-control-example-compact, [data-chain-picker-example] > .erp-chain-design__role-filter')) {
        const bounds = element.getBoundingClientRect()
        const children = [...element.children].map((child) => child.getBoundingClientRect()).filter((box) => box.width > 0)
        compactFrame = {
          rightGap: bounds.right - Math.max(...children.map((box) => box.right)),
          topGap: Math.min(...children.map((box) => box.top)) - bounds.top,
          radius: parseFloat(style.borderRadius),
          oneRow: Math.max(...children.map((box) => box.top)) < Math.min(...children.map((box) => box.bottom)),
        }
      }
      return {
        outline: style.outlineStyle,
        image: style.backgroundImage,
        shadow: style.boxShadow,
        innerFillSize: `${Math.max(innerWidth, innerHeight)}px`,
        compactFrame,
      }
    })
    assert.equal(outline, 'solid')
    assert(image.startsWith('linear-gradient(') || (shadow.includes(innerFillSize) && shadow.includes('inset')),
      `样例目标应有填色，实际为 ${image} ${shadow}`)
    if (compactFrame) {
      const { rightGap, topGap, radius, oneRow } = compactFrame
      assert(rightGap >= 4 && (!oneRow || rightGap <= 10) && topGap >= 3 && radius > 0,
        `紧凑控件组应收宽并在圆角内留空：${JSON.stringify(compactFrame)}`)
    }
  }
  return [
    ...['light', 'dark'].map((themeMode) => ({
      name: `shared-input-error-focus-${themeMode}`,
      path: '/__dev/ui-design?page=controls&control=inputs',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      themeMode,
      verify: async (page) => {
        const stage = page.locator('.erp-control-library-stage')
        await stage.getByLabel('产品名称', { exact: true }).waitFor()
        await page.getByLabel('组件样例主题', { exact: true })
          .getByText(themeMode === 'dark' ? '深色' : '浅色', { exact: true }).click()
        const error = stage.getByRole('radio', { name: '错误', exact: true })
        await error.locator('..').click()
        const readFocus = (input) => input.evaluate((node) => {
          const owner = node.closest('.ant-input-affix-wrapper') || node
          const style = getComputedStyle(owner)
          const box = owner.getBoundingClientRect()
          const inputBox = node.getBoundingClientRect()
          return {
            borderColor: style.borderColor,
            expectedFocusBorder: style.getPropertyValue('--erp-control-focus-border').trim(),
            boxShadow: style.boxShadow,
            error: owner.classList.contains('ant-input-status-error'),
            contained: inputBox.left >= box.left - 1 && inputBox.right <= box.right + 1,
          }
        })
        const evidence = []
        for (const label of ['产品名称']) {
          const input = stage.getByLabel(label, { exact: true })
          await input.focus()
          await waitForFiniteAnimations(page)
          const focused = await readFocus(input)
          assert(focused.error, `${label} 保留错误状态`)
          assert(isAcceptedFocusBorder(focused), `${label} 错误时仍使用主题焦点边框：${JSON.stringify(focused)}`)
          assert(focused.boxShadow.includes('inset'), `${label} 错误时的焦点环应在控件内：${JSON.stringify(focused)}`)
          assert(focused.contained, `${label} 输入框不能撑出焦点外框`)
          await error.focus()
          await waitForFiniteAnimations(page)
          const blurred = await readFocus(input)
          assert(blurred.error, `${label} 失焦后保留错误状态`)
          assert.notEqual(blurred.borderColor, focused.borderColor, `${label} 失焦后恢复错误边框`)
          evidence.push({ label, focused, blurred })
        }
        await stage.getByLabel('产品名称', { exact: true }).focus()
        await waitForFiniteAnimations(page)
        await page.screenshot({ path: `${outputDir}/input-error-focus-${themeMode}-4k.png` })
        await writeFile(`${outputDir}/input-error-focus-${themeMode}.json`, JSON.stringify(evidence, null, 2))
        await stage.getByRole('radio', { name: '正常', exact: true }).locator('..').click()
        assert.equal(await stage.locator('.ant-input-status-error').count(), 0, '恢复正常后清除错误外观')
        await stage.getByRole('radio', { name: '禁用', exact: true }).locator('..').click()
        assert(await stage.getByLabel('产品名称', { exact: true }).isDisabled())
        await assertNoHorizontalOverflow(page, `shared-input-error-focus-${themeMode}`)
      },
    })),
    {
      name: 'dev-ui-local-theme-isolation',
      path: '/__dev/ui-design?page=controls&control=actions',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const evidence = await assertControlPreviewThemeIsolation(page)
        await assertNoHorizontalOverflow(page, '组件样例内外主题隔离')
        await writeFile(`${outputDir}/control-preview-theme.json`, JSON.stringify(evidence, null, 2))
      },
    },
    ...createSelectOverflowScenarios({ assert, assertNoHorizontalOverflow, outputDir }),
    ...createGroupedSelectScenarios({ assert, assertNoHorizontalOverflow, outputDir }),
    ...createDevPaginationScenarios({ assert, assertNoHorizontalOverflow, outputDir }),
    ...createDevBusinessComponentScenarios({ assert, assertNoHorizontalOverflow, customerRuntimeEffectiveSession }),
    ...createDevToolbarExampleScenarios({ assert, assertNoHorizontalOverflow, outputDir }),
    {
      name: 'dev-ui-shared-component-catalog',
      path: '/__dev/ui-design?page=controls&control=components',
      viewport: { width: 1920, height: 1080 },
      verify: async (page) => {
        const catalog = page.getByRole('region', {
          name: '组件使用指南',
          exact: true,
        })
        await catalog.waitFor()
        await page.getByRole('heading', { name: '组件使用指南', exact: true }).waitFor()
        assert.equal(await page.getByRole('button', { name: /重置演示/u }).count(), 0, '指南不显示演示重置动作')
        const source = await readFile(
          new URL(
            '../../../docs/engineering/前端实现与交互约定.md',
            import.meta.url
          ),
          'utf8'
        )
        const chapter = findUIDesignChapter(
          readUIDesignChapters(source),
          '组件复用与使用入口--shared-component-entrypoints'
        )
        const rows = chapter.content
          .split(/\n\s*\n/u)
          .filter((block) => block.startsWith('| '))
          .flatMap((block) => block.split('\n').filter((line) => line.startsWith('| ')).slice(2))
        assert.equal(
          await catalog.locator('.erp-control-library-reference tbody tr').count(),
          rows.length,
          '选用表直接呈现正式文档全部入口'
        )
        for (const name of [
          'DateInput',
          'DateTimeInput',
          'DateRangeFilter',
          'PrintEditableText',
          'MaterialContractMetaPair',
        ]) {
          await catalog.locator('tbody td:nth-child(2)').filter({ hasText: name }).waitFor()
        }
        const sampleLinks = catalog.getByRole('region', { name: '组件样例与真实页面', exact: true })
        for (const row of await sampleLinks.locator('tbody tr').all()) {
          const sample = row.getByRole('link', { name: /^操作.+示例$/u })
          const usage = row.getByRole('link', { name: /^查看.+用法要求$/u })
          assert.equal(await sample.count(), 1, '目录提供当前组件样例入口')
          const target = await sample.getAttribute('href')
          assert(target.startsWith('/__dev/ui-design?page=controls&control='))
          assert.equal(await usage.count(), 1, '目录提供对应组件的用法要求入口')
          assert.equal(await usage.getAttribute('href'), `${target}&controlSection=usage`)
          const consumer = row.locator('td').nth(1)
          assert.ok((await consumer.locator('span').first().innerText()).trim(), '保留真实消费者名称')
          assert.ok((await consumer.locator('p').innerText()).trim(), '保留对应业务核对任务')
        }
        assert.equal(await catalog.locator('a[href^="/erp/"], a[target="_blank"]').count(), 0, '设计目录沿用工作台规范，不附加业务快捷跳转')
        const designLink = catalog.getByRole('link', { name: '下拉选择与清空', exact: true })
        assert((await designLink.getAttribute('href')).startsWith('/__dev/docs?path='), '嵌入文档沿用项目阅读器解析相对链接')
        const search = page.getByLabel('搜索组件设计', { exact: true })
        const directory = page.getByRole('navigation', {
          name: '组件设计目录',
          exact: true,
        })
        const catalogEntry = directory.getByRole('button', { name: '组件使用指南', exact: true })
        const inputGroup = directory.getByRole('region', { name: '录入与选值', exact: true })
        const filterGroup = directory.getByRole('region', { name: '搜索与筛选', exact: true })
        const tableGroup = directory.getByRole('region', { name: '表格与分页', exact: true })
        const compositionGroup = directory.getByRole('region', { name: '组合样例', exact: true })
        const paginationEntry = tableGroup.getByRole('button', { name: '分页', exact: true })
        const selectEntry = inputGroup.getByRole('button', { name: '下拉选择', exact: true })
        const componentName = page.locator('.erp-control-library-heading code')
        const groupTitles = ['录入与选值', '搜索与筛选', '表格与分页', '导航与视图', '弹窗与抽屉', '操作与反馈', '组合样例']
        const submitSearch = async (query) => {
          await search.fill(query)
          await search.press('Enter')
          await page.waitForURL((url) => url.searchParams.get('controlq') === query)
        }
        await directory.locator('.erp-directory-header').getByText('组件目录', { exact: true }).waitFor()
        assert.equal(await directory.locator('.erp-directory-item').first().innerText(), '组件使用指南', '指南固定在目录首项')
        const expandAll = directory.getByRole('button', { name: '展开全部', exact: true })
        const collapseAll = directory.getByRole('button', { name: '收起全部', exact: true })
        await collapseAll.waitFor()
        assert.deepEqual(await directory.locator('button[aria-expanded="true"]').allTextContents(), groupTitles)
        assert.equal(await expandAll.count(), 0, '目录默认全部展开')
        const entries = await directory.locator('.erp-directory-branch button').allTextContents()
        const branchLayout = await inputGroup.evaluate((group) => {
          const branch = group.querySelector('.erp-directory-branch')
          const parentLabel = group.querySelector('h2 button > span:last-child')
          const childLabel = branch.querySelector('button > span:last-child')
          return {
            indent: childLabel.getBoundingClientRect().left - parentLabel.getBoundingClientRect().left,
            guideWidth: getComputedStyle(branch).borderInlineStartWidth,
          }
        })
        assert.deepEqual(branchLayout, { indent: 16, guideWidth: '1px' }, '组件分组使用共用缩进与引导线')
        assert.equal(entries.length, new Set(entries).size, '每个样例在目录中只有一个入口')
        const guideEntries = await catalog.getByRole('link', { name: /^操作.+示例$/u }).allTextContents()
        assert.deepEqual(entries.sort(), guideEntries.sort(), '分组完整覆盖选用页的样例入口')
        assert.equal(await directory.locator('code').count(), 0, '代码名放在样例正文')
        for (const title of ['业务表单与明细', '筛选与搜索', '页签与视图', '抽屉内查看附件', '危险操作确认']) {
          await compositionGroup.getByRole('button', { name: title, exact: true }).waitFor()
        }
        await directory.getByRole('region', { name: '操作与反馈', exact: true })
          .getByRole('button', { name: '按钮', exact: true }).waitFor()
        await collapseAll.press('Enter')
        assert.deepEqual(await directory.locator('button[aria-expanded="false"]').allTextContents(), groupTitles)
        assert.equal(await directory.locator('.erp-directory-branch button').count(), 0)
        await expandAll.press('Enter')
        await directory.getByRole('button', { name: '录入与选值', exact: true }).press('Enter')
        await directory.getByRole('button', { name: '搜索与筛选', exact: true }).press('Enter')
        assert.equal(await inputGroup.getByRole('button', { name: '日期输入', exact: true }).count(), 0)
        assert.equal(await filterGroup.getByRole('button', { name: '日期范围筛选', exact: true }).count(), 0)
        await submitSearch('日期')
        await expandAll.waitFor({ state: 'detached' })
        await inputGroup.getByRole('button', { name: '日期输入', exact: true }).waitFor()
        await filterGroup.getByRole('button', { name: '日期范围筛选', exact: true }).waitFor()

        await submitSearch('AppPagination')
        await paginationEntry.waitFor()
        await paginationEntry.focus()
        await page.keyboard.press('Enter')
        await page.getByRole('heading', { name: '分页', exact: true }).waitFor()
        assert.equal(await componentName.textContent(), 'AppPagination')
        assert.equal(await search.inputValue(), 'AppPagination', '打开结果后保留搜索词')
        assert.equal(await page.getByRole('button', { name: '返回组件使用指南', exact: true }).count(), 0)
        await catalogEntry.click()
        await catalog.waitFor()

        for (const [query, title, control] of [
          ['附件预览', '抽屉内查看附件', 'attachment-drawer'],
          ['作废草稿', '危险操作确认', 'danger-confirm'],
        ]) {
          await submitSearch(query)
          await compositionGroup.getByRole('button', { name: '业务表单与明细', exact: true }).waitFor({ state: 'detached' })
          await compositionGroup.getByRole('button', { name: title, exact: true }).click()
          await page.getByRole('heading', { name: title, exact: true }).waitFor()
          assert.equal(new URL(page.url()).searchParams.get('control'), control)
          await catalogEntry.click()
          await catalog.waitFor()
          await compositionGroup.getByRole('button', { name: '业务表单与明细', exact: true }).waitFor()
        }

        await submitSearch('日期与时间')
        await compositionGroup.waitFor({ state: 'detached' })
        assert.equal(await directory.getByRole('button').count(), 1, '日期与时间只指向组件使用指南')
        await catalogEntry.click()
        const dateGuide = catalog.getByRole('region', { name: '日期控件选用', exact: true })
        await dateGuide.waitFor()
        assert.equal(await dateGuide.locator('tbody tr').count(), 3)
        for (const [title, control, output] of [
          ['日期输入', 'date', '日期当前值'],
          ['日期时间', 'date-time', '截止时间当前值'],
          ['日期范围筛选', 'date-range', '日期范围当前值'],
        ]) {
          await dateGuide.getByRole('link', { name: `操作${title}示例`, exact: true }).click()
          await page.getByRole('heading', { name: title, exact: true }).waitFor()
          await page.getByLabel(output, { exact: true }).waitFor()
          assert.equal(new URL(page.url()).searchParams.get('control'), control)
          await page.goBack()
          await dateGuide.waitFor()
        }
        await compositionGroup.waitFor()
        await submitSearch('AppSelect')
        await compositionGroup.waitFor({ state: 'detached' })
        await selectEntry.waitFor()
        assert.equal(await directory.getByRole('button').count(), 2, '组件名精确匹配只返回一个组件入口和固定选用入口')
        await catalogEntry.click()
        await compositionGroup.waitFor()
        await submitSearch('分组下拉')
        await compositionGroup.waitFor({ state: 'detached' })
        await selectEntry.click()
        await page.waitForURL((url) => url.searchParams.get('control') === 'select' && url.searchParams.get('example') === 'grouped')
        assert.equal(await componentName.textContent(), 'AppSelect')
        await page.getByRole('combobox', { name: '单选记录类型', exact: true }).waitFor()
        const variants = page.getByLabel('样例变体', { exact: true })
        await variants.getByText('长名称', { exact: true }).click()
        const longValue = page.getByLabel('仓库当前值', { exact: true })
        assert.match(await longValue.innerText(), /半成品与配套辅料存放区/u)
        await page.getByRole('combobox', { name: '仓库', exact: true }).press('ArrowDown')
        await page.locator('.ant-select-dropdown:visible').getByText(/WH-FINISHED-02/u).click()
        assert.equal(await longValue.innerText(), '成品仓')
        await page.goBack()
        await page.getByRole('combobox', { name: '单选记录类型', exact: true }).waitFor()
        await page.reload()
        await page.getByRole('combobox', { name: '单选记录类型', exact: true }).waitFor()
        await catalogEntry.click()
        await catalog.waitFor()

        await search.fill('PrintEditableText')
        await search.press('Enter')
        await page.waitForURL((url) => url.searchParams.get('controlq') === 'PrintEditableText')
        await directory.getByRole('button').nth(1).waitFor({ state: 'detached' })
        assert.equal(await directory.getByRole('button').count(), 1)
        await directory.getByRole('button', { name: /组件使用指南/u }).waitFor()
        await page.reload()
        await catalog.waitFor()
        assert.equal(await search.inputValue(), 'PrintEditableText')
        await designLink.click()
        await page.waitForURL(
          (url) =>
            url.pathname === '/__dev/docs' &&
            url.searchParams.get('path') === 'docs/product/ui-design/交互设计说明.md' &&
            decodeURIComponent(url.hash.slice(1)) === 'select-controls'
        )
        await page.goBack()
        await catalog.waitFor()
        assert.equal(await search.inputValue(), 'PrintEditableText')
        await search.fill('没有这样的控件')
        await search.press('Enter')
        await directory.getByText('没有匹配的组件或样例', { exact: true }).waitFor()
        await directory
          .getByRole('button', { name: '清除搜索', exact: true })
          .focus()
        await page.keyboard.press('Enter')
        await compositionGroup.waitFor()
        assert(await search.evaluate((node) => node === document.activeElement), '清除无结果搜索后回到搜索框，允许直接继续输入')
        const bounds = await catalog.evaluate((node) => ({
          width: node.clientWidth,
          scrollWidth: node.scrollWidth,
        }))
        assert(
          bounds.scrollWidth <= bounds.width + 1,
          '长组件路径在目录正文内换行'
        )
        await assertNoHorizontalOverflow(page)
        const searchHint = page.locator('.ant-popover:visible').filter({ hasText: '可搜索：组件代码名' })
        const resizeWithSearchFocused = async (width, height) => {
          await searchHint.waitFor()
          await page.setViewportSize({ width, height })
          const bounds = await searchHint.evaluate((node) => {
            const { left, right, top, bottom } = node.getBoundingClientRect()
            return { left, right, top, bottom, viewport: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth }
          })
          assert(bounds.left >= -1 && bounds.right <= width + 1 && bounds.top >= -1 && bounds.bottom <= height + 1, `缩放后的搜索提示在视口内 ${JSON.stringify(bounds)}`)
          assert(bounds.scrollWidth <= width + 1, `提示展开时页面不横向滚动 ${JSON.stringify(bounds)}`)
          assert(await search.evaluate((node) => node === document.activeElement), '缩放保持搜索输入焦点')
          await page.waitForFunction(() => {
            const input = document.querySelector('input[aria-label="搜索组件设计"]')
            const popup = document.getElementById(input?.getAttribute('aria-describedby'))?.closest('.ant-popover')
            if (!popup) return false
            const anchor = input.closest('.erp-search-input').getBoundingClientRect()
            const hint = popup.getBoundingClientRect()
            return Math.abs(anchor.left - hint.left) <= 1 && hint.top >= anchor.bottom - 1
          })
          await assertNoHorizontalOverflow(page, '保持搜索提示时调整窗口')
        }
        await resizeWithSearchFocused(390, 844)
        await dateGuide.waitFor()
        await resizeWithSearchFocused(1920, 1080)
        await resizeWithSearchFocused(390, 844)

        const searchControl = search.locator('xpath=..')
        await search.fill('AppSelect')
        await searchControl.getByRole('button', { name: '搜索', exact: true }).click()
        await page.waitForURL((url) => url.searchParams.get('controlq') === 'AppSelect')
        await compositionGroup.waitFor({ state: 'detached' })
        await searchHint.waitFor({ state: 'hidden' })
        assert.equal(await directory.getByRole('button').count(), 2)
        assert(await search.evaluate((node) => node === document.activeElement), '窄屏提交保留输入焦点')

        const clearInput = searchControl.getByRole('button', { name: '清除搜索', exact: true })
        await clearInput.focus()
        await clearInput.press('Enter')
        await page.waitForURL((url) => !url.searchParams.has('controlq'))
        await compositionGroup.waitFor()
        assert.equal(await search.inputValue(), '')
        assert(await search.evaluate((node) => node === document.activeElement), '键盘清空后焦点回到搜索框')
        await assertNoHorizontalOverflow(page, '窄屏清空搜索')

        await page.goto(new URL('/__dev/ui-design?page=controls&control=source-picker', page.url()).href)
        await page.getByRole('heading', { name: '来源选择', exact: true }).waitFor()
        const pickerGroup = directory.getByRole('region', { name: '弹窗与抽屉', exact: true })
        assert.equal(await pickerGroup.getByRole('button', { name: '弹窗与抽屉', exact: true }).getAttribute('aria-expanded'), 'true')
        assert.equal(await directory.locator('button[aria-expanded="true"]').count(), groupTitles.length, '直达沿用默认展开')
        const pickerEntry = pickerGroup.getByRole('button', { name: '来源选择', exact: true })
        assert.equal(await pickerEntry.getAttribute('aria-current'), 'page')
        assert(await pickerEntry.evaluate((node) => {
          const viewport = node.closest('.erp-control-library-groups').getBoundingClientRect()
          const item = node.getBoundingClientRect()
          return item.top >= viewport.top - 1 && item.bottom <= viewport.bottom + 1
        }), '直达链接把当前样例定位到目录可视区')
        assert.equal(await componentName.textContent(), 'SourceImportPickerModal')
        assert(await componentName.evaluate((node) => node.scrollWidth <= node.clientWidth + 1), '长代码名在正文内换行')
        await collapseAll.click()
        assert.equal(await directory.locator('button[aria-expanded="true"]').count(), 0)
        assert.equal(await pickerGroup.getByRole('button', { name: '弹窗与抽屉', exact: true }).getAttribute('aria-current'), 'location')
        assert.equal(await componentName.textContent(), 'SourceImportPickerModal', '目录收起后仍可查看当前样例')
        await assertNoHorizontalOverflow(page, '窄屏直达样例')

        await catalogEntry.click()
        await catalog.waitFor()
        await submitSearch('DirectoryHeader')
        await directory.getByRole('button', { name: '目录导航', exact: true }).waitFor()
        await sampleLinks.getByRole('link', { name: '操作目录导航示例', exact: true }).click()
        const sampleDirectory = page.getByRole('navigation', { name: '目录导航样例', exact: true })
        const content = page.getByRole('region', { name: '当前目录内容', exact: true })
        const link = (name) => sampleDirectory.getByRole('link', { name, exact: true })
        const materials = link('随单资料')
        const checklist = link('核对清单')
        const confirmation = link('交接确认')
        const submission = link('提交与归档')
        const toggle = sampleDirectory.getByRole('button', { name: /^(展开|收起)全部$/u })
        const reviewGroup = sampleDirectory.getByRole('button', { name: '交接核对', exact: true })
        const directoryStructure = page.getByLabel('样例变体', { exact: true })
        const selectStructure = async (label, value) => {
          await directoryStructure.getByText(label, { exact: true }).click()
          await page.waitForURL((url) => url.searchParams.get('example') === value)
        }
        await directoryStructure.getByText('一级目录', { exact: true }).waitFor()
        assert.deepEqual(await directoryStructure.locator('.ant-segmented-item-label').allTextContents(), ['分级目录', '一级目录'])
        assert.equal(await link('交接总览').getAttribute('aria-current'), 'location')
        await sampleDirectory.getByRole('heading', { name: '交接准备', exact: true }).waitFor()
        const arrow = reviewGroup.locator('.erp-directory-disclosure')
        await arrow.waitFor()
        assert.equal(await reviewGroup.getAttribute('aria-expanded'), 'true')
        const expandedTransform = await arrow.evaluate((element) => getComputedStyle(element).transform)
        assert.notEqual(expandedTransform, 'none')
        await checklist.press('Enter')
        assert.equal(await checklist.getAttribute('aria-current'), 'location')
        assert(await content.evaluate((element) => element.scrollTop > 0))
        await reviewGroup.press('Enter')
        await checklist.waitFor({ state: 'hidden' })
        assert.equal(await reviewGroup.getAttribute('aria-expanded'), 'false')
        assert.notEqual(await arrow.evaluate((element) => getComputedStyle(element).transform), expandedTransform)
        assert.equal(await reviewGroup.getAttribute('aria-current'), 'location')
        assert(await materials.isVisible())
        await toggle.press('Enter')
        await checklist.waitFor()
        assert.equal(await checklist.getAttribute('aria-current'), 'location')

        await confirmation.click()
        await toggle.press('Enter')
        await confirmation.waitFor({ state: 'hidden' })
        assert.equal(await submission.getAttribute('aria-expanded'), null)
        assert.equal(await submission.getAttribute('aria-current'), 'location')
        const scrollPosition = await content.evaluate((element) => element.scrollTop)
        await selectStructure('一级目录', 'flat')
        await confirmation.waitFor()
        assert.equal(await confirmation.getAttribute('aria-current'), 'location')
        assert.equal(await toggle.count(), 0)
        assert.equal(await sampleDirectory.locator('.erp-directory-branch').count(), 0)
        const flatOffsets = await sampleDirectory.getByRole('link').evaluateAll((rows) =>
          rows.map((row) => row.firstElementChild.getBoundingClientRect().left)
        )
        assert.equal(flatOffsets.length, 7)
        assert.equal(new Set(flatOffsets).size, 1, '一级目录条目左对齐')
        await selectStructure('分级目录', 'nested')
        await confirmation.waitFor({ state: 'hidden' })
        assert.equal(await submission.getAttribute('aria-current'), 'location')
        assert(Math.abs(await content.evaluate((element) => element.scrollTop) - scrollPosition) <= 1)
        await toggle.press('Enter')
        await confirmation.waitFor()
        assert.equal(await confirmation.getAttribute('aria-current'), 'location')
        await link('交接总览').click()
        await content.hover()
        await page.mouse.wheel(0, 1000)
        await sampleDirectory.locator('[aria-current="location"]').getByText('留档记录', { exact: true }).waitFor()

        await catalogEntry.click()
        await catalog.waitFor()
        await sampleLinks.getByRole('link', { name: '查看目录导航用法要求', exact: true }).click()
        const usage = page.getByRole('region', { name: '用法要求', exact: true })
        await selectStructure('一级目录', 'flat')
        await materials.press('Enter')
        assert.equal(await materials.getAttribute('aria-current'), 'location')
        await content.getByRole('heading', { name: '随单资料', exact: true }).waitFor()
        await usage.getByRole('button', { name: '层级与开合', exact: true }).click()
        await page.waitForURL((url) => url.searchParams.get('example') === 'nested')
        await reviewGroup.locator('xpath=self::*[@data-sample-usage-highlight]').waitFor()
        await usage.getByRole('button', { name: '章节定位', exact: true }).click()
        await submission.locator('xpath=self::*[@data-sample-usage-highlight]').waitFor()
        await assertNoHorizontalOverflow(page, '窄屏目录导航样例')
      },
    },
    {
      name: 'dev-ui-shared-focus-recovery',
      path: '/__dev/ui-design?page=controls&control=date-time',
      viewport: { width: 1920, height: 1080 },
      verify: async (page) => {
        const stage = page.locator('.erp-control-library-stage')
        const picker = stage.locator('.ant-picker').filter({ has: page.locator('#control-deadline') })
        const deadline = stage.locator('#control-deadline')
        const popup = page.locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)')
        await picker.click()
        await popup.waitFor()
        await page.keyboard.press('Escape')
        await popup.waitFor({ state: 'hidden' })
        assert(await deadline.evaluate((node) => node === document.activeElement), 'Escape 关闭日期弹层后返回原输入')

        await picker.click()
        await popup.getByRole('button', { name: '7 天后', exact: true }).click()
        await popup.waitFor({ state: 'hidden' })
        assert(await deadline.evaluate((node) => node === document.activeElement), '快捷选值后保留日期输入焦点')

        await picker.click()
        await popup.waitFor()
        const directory = page.getByRole('navigation', { name: '组件设计目录', exact: true })
        await directory.getByRole('button', { name: '组合样例', exact: true }).press('Enter')
        const inputs = directory.getByRole('button', { name: /基础输入/u })
        await inputs.focus()
        await page.keyboard.press('Enter')
        await stage.getByLabel('产品名称', { exact: true }).waitFor()
        await popup.waitFor({ state: 'hidden' })
        assert(await inputs.evaluate((node) => node === document.activeElement), '切换分类关闭旧弹层，焦点保留在目录项')

        const dates = directory.getByRole('button', { name: /^日期时间/u })
        await dates.focus()
        await page.keyboard.press('Enter')
        await deadline.fill('invalid-value')
        const reset = stage.getByRole('button', { name: '重置日期示例', exact: true })
        await reset.focus()
        await page.keyboard.press('Enter')
        await popup.waitFor({ state: 'hidden' })
        assert.equal(await deadline.inputValue(), '2026/10/08 09:00')
        assert.equal(await stage.getByLabel('截止时间当前值', { exact: true }).innerText(), '2026-10-08T09:00')
        assert(await reset.evaluate((node) => node === document.activeElement), '重置恢复非法输入并保留操作按钮焦点')

        await picker.click()
        await popup.waitFor()
        const resetAll = page.getByRole('button', { name: /重置演示/u })
        await resetAll.focus()
        await page.keyboard.press('Enter')
        await popup.waitFor({ state: 'hidden' })
        assert(await resetAll.evaluate((node) => node === document.activeElement), '重建示例关闭旧弹层且保留工具栏焦点')
        assert.equal(await deadline.inputValue(), '2026/10/08 09:00')
        await assertNoHorizontalOverflow(page)
      },
    },
    {
      name: 'dev-ui-component-usage-catalog',
      path: '/__dev/ui-design?page=controls&control=components',
      viewport: { width: 1024, height: 768 },
      verify: async (page) => {
        const directory = page.getByRole('navigation', { name: '组件设计目录', exact: true })
        const catalogEntry = directory.getByRole('button', { name: '组件使用指南', exact: true })
        const catalog = page.getByRole('region', { name: '组件使用指南', exact: true })
        await catalog.waitFor()
        const entries = await catalog.getByRole('link', { name: /^查看.+用法要求$/u })
          .evaluateAll((links) => links.map((link) => ({
            name: link.getAttribute('aria-label'),
            control: new URL(link.href).searchParams.get('control'),
          })))
        const sampleControls = await catalog.getByRole('link', { name: /^操作.+示例$/u })
          .evaluateAll((links) => links.map((link) => new URL(link.href).searchParams.get('control')))
        assert.deepEqual(entries.map(({ control }) => control).sort(), sampleControls.sort())
        await directory.getByRole('button', { name: '收起全部', exact: true }).waitFor()
        assert.equal(entries.length, await directory.locator('.erp-directory-branch button').count())
        assert.equal(new Set(entries.map(({ control }) => control)).size, entries.length)
        const overlaySamples = new Set(['business-form-modal', 'app-modal', 'business-modal', 'drawer', 'alert-dialog', 'filter-popover', 'filters'])
        for (const { name, control } of entries) {
          await catalog.getByRole('link', { name, exact: true }).click()
          await page.waitForURL((url) => url.searchParams.get('control') === control)
          const usage = page.getByRole('region', { name: '用法要求', exact: true })
          await usage.waitFor()
          const id = await usage.getAttribute('id')
          await page.waitForFunction((targetId) => document.activeElement?.id === targetId, id)
          const categories = await usage.locator('[data-requirement]').allTextContents()
          assert(categories.length > 0, `${control} 的用法表应有规则`)
          assert(categories.every((value) => ['必需', '默认', '可选', '有条件'].includes(value)), `${control} 的要求分类应可读`)
          const items = usage.locator('tbody th button')
          assert.equal(await items.count(), categories.length, `${control} 的每个项目都可定位`)
          if (!overlaySamples.has(control)) {
            const marker = page.locator('[data-sample-usage-highlight]')
            for (const item of await items.all()) {
              const itemName = await item.innerText()
              await item.press('Enter')
              await assertFilledTarget(marker)
                .catch((error) => { throw new Error(`${control} 的「${itemName}」未定位到样例部位：${error.message}`, { cause: error }) })
              if (control === 'chain-view-picker') {
                const pickers = {
                  流程范围单选: ['scope'],
                  岗位多选: ['role'],
                  键盘操作: ['scope', 'role'],
                }
                assert.deepEqual(
                  await marker.locator('button[data-picker]').evaluateAll((buttons) => buttons.map((button) => button.dataset.picker)),
                  pickers[itemName],
                  `「${itemName}」应只标记相关的选择器`,
                )
              }
              assert.equal(await item.getAttribute('aria-pressed'), 'true')
              await assertSelectedRule(usage, itemName)
            }
          }
          assert.equal(await page.getByRole('button', { name: '查看用法要求', exact: true }).count(), 0, `${control} 的样例页不应有重复的用法入口`)
          await catalogEntry.click()
          await catalog.waitFor()
        }
      },
    },
    {
      name: 'dev-ui-component-usage-rules',
      path: '/__dev/ui-design?page=controls&control=select',
      viewport: { width: 1024, height: 768 },
      verify: async (page) => {
        const stage = page.locator('.erp-control-library-stage')
        const requirements = page.getByRole('region', { name: '用法要求', exact: true })
        await requirements.waitFor()
        assert.deepEqual(
          await requirements.locator('[data-requirement]').allTextContents(),
          ['必需', '默认', '可选', '有条件']
        )
        assert((await requirements.boundingBox()).y < (await page.locator('.erp-control-library-checks').boundingBox()).y,
          '窄屏时规则紧跟样例，先于核对步骤')
        const category = stage.getByRole('combobox', { name: '产品类别', exact: true })
        const save = stage.getByRole('button', { name: '保存样例', exact: true })
        await stage.locator('.ant-select').hover()
        await stage.locator('.ant-select-clear').click()
        assert.equal(await stage.getByRole('alert').count(), 0, '编辑时允许清空必填字段')
        await save.click()
        await stage.getByRole('alert').filter({ hasText: '请选择产品类别' }).waitFor()
        assert(await category.evaluate((node) => node === document.activeElement), '保存校验聚焦必填字段')
        await stage.locator('.ant-select-selector').click()
        await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
          .getByText('挂件', { exact: true }).click()
        assert.equal(await stage.getByRole('alert').count(), 0)
        await save.click()
        await stage.getByText('已保存样例', { exact: true }).waitFor()

        await requirements.getByRole('button', { name: '关闭清空', exact: true }).click()
        await stage.getByRole('combobox', { name: '统计币种', exact: true }).waitFor()
        await stage.locator('.ant-select:visible').hover()
        assert.equal(await stage.locator('.ant-select-clear:visible').count(), 0, '统计必须始终有有效币种')
        await stage.locator('.ant-select-selector:visible').click()
        await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
          .getByText('美元', { exact: true }).click()
        assert.equal(await stage.locator('.ant-select-selection-item:visible').innerText(), '美元')
        await requirements.getByRole('button', { name: '字段名称', exact: true }).click()
        await category.waitFor()
        assert.equal(await stage.getByLabel('基础输入结果', { exact: true }).innerText(), '挂件')
        await stage.getByText('已保存样例', { exact: true }).waitFor()
        await requirements.getByRole('button', { name: '关闭清空', exact: true }).click()
        await stage.getByRole('combobox', { name: '统计币种', exact: true }).waitFor()
        assert.equal(await stage.locator('.ant-select-selection-item:visible').innerText(), '美元')
        await assertNoHorizontalOverflow(page, '下拉选择用法要求')

        const directory = page.getByRole('navigation', { name: '组件设计目录', exact: true })
        await directory.getByRole('button', { name: '多行文本', exact: true }).click()
        const readOnlyRule = requirements.getByRole('button', { name: '只读或禁用', exact: true })
        const readOnlyRow = requirements.getByRole('row', { name: /^只读或禁用 /u })
        const description = readOnlyRow.getByRole('cell', { name: '保留全文，隐藏编辑计数。', exact: true })
        await description.waitFor()
        assert.equal(await readOnlyRow.getAttribute('tabindex'), null)
        assert.equal(await readOnlyRow.locator('button, [tabindex="0"]').count(), 1, '每行只保留一个键盘停靠点')
        await page.mouse.move(0, 0)
        const rowColors = () => readOnlyRow.evaluate((row) => [...row.cells].map((cell) => getComputedStyle(cell).backgroundColor))
        const idleColors = await rowColors()
        await description.hover()
        const hoverColors = await rowColors()
        assert.notDeepEqual(hoverColors, idleColors, '悬停说明列时反馈整行')
        assert(hoverColors.every((color) => color === hoverColors[0]))
        assert.equal(await description.evaluate((cell) => getComputedStyle(cell).cursor), 'pointer')
        await description.click()
        await assertSelectedRule(requirements, '只读或禁用')
        assert.notDeepEqual(await rowColors(), hoverColors, '选中与悬停使用不同底色')
        assert(await readOnlyRule.evaluate((button) => button === document.activeElement), '点击说明后聚焦原来的项目按钮')
        await readOnlyRule.press('Space')
        assert.equal(await readOnlyRule.getAttribute('aria-pressed'), 'false', '空格只触发一次并取消高亮')

        await description.hover()
        const textLine = await description.evaluate((cell) => {
          const range = cell.ownerDocument.createRange()
          range.selectNodeContents(cell)
          const line = range.getClientRects()[0]
          return { left: line.left, right: line.right, centerY: line.top + line.height / 2 }
        })
        await page.mouse.move(textLine.left + 1, textLine.centerY)
        await page.mouse.down()
        await page.mouse.move(textLine.right - 1, textLine.centerY, { steps: 8 })
        await page.mouse.up()
        assert.match(await page.evaluate(() => document.getSelection().toString()), /隐藏编辑计数/u)
        assert.equal(await readOnlyRule.getAttribute('aria-pressed'), 'false', '拖选说明时不触发定位')
        await readOnlyRow.getByText('有条件', { exact: true }).click()
        await assertSelectedRule(requirements, '只读或禁用')

        const overlayGroup = directory.getByRole('button', { name: '弹窗与抽屉', exact: true })
        if (await overlayGroup.getAttribute('aria-expanded') === 'false') await overlayGroup.click()
        await directory.getByRole('button', { name: '业务编辑弹窗', exact: true }).click()
        const scenario = stage.locator('[data-feedback-example="editor"] .ant-select:visible')
        await scenario.hover()
        await scenario.locator('.ant-select-clear').click()
        const openRule = async (name) => {
          const rule = requirements.getByRole('button', { name, exact: true })
          await rule.press('Enter')
          assert.equal(await rule.getAttribute('aria-current'), 'true')
          await assertSelectedRule(requirements, name)
        }
        const editor = page.getByRole('dialog', { name: /补充采购说明/u })
        const cancel = editor.getByRole('button', { name: '取消', exact: true })
        for (const [name, section] of [['标题', 'header'], ['编辑内容', 'body'], ['保存与关闭', 'footer']]) {
          await openRule(name)
          await assertFilledTarget(editor.locator(`.ant-modal-${section}.erp-control-usage-highlight`))
          await cancel.click()
          await editor.waitFor({ state: 'hidden' })
          await page.waitForFunction((item) => document.activeElement?.textContent === item, name)
          await assertSelectedRule(requirements, name)
        }

        await openRule('离开保护')
        assert((await cancel.getAttribute('class')).includes('erp-control-usage-highlight'))
        await assertFilledTarget(cancel)
        const subject = editor.getByRole('textbox', { name: /说明标题/u })
        await subject.fill('确认演示采购单交期')
        await cancel.click()
        const guard = page.getByRole('dialog', { name: /放弃未保存的修改/u })
        await guard.getByRole('button', { name: '继续编辑', exact: true }).click()
        await guard.waitFor({ state: 'hidden' })
        assert.equal(await subject.inputValue(), '确认演示采购单交期')
        await cancel.click()
        await guard.getByRole('button', { name: '放弃修改', exact: true }).click()
        await editor.waitFor({ state: 'hidden' })
        await page.waitForFunction(() => document.activeElement?.textContent === '离开保护')
        const submit = editor.getByRole('button', { name: '保存说明', exact: true })
        await openRule('保存失败')
        const failure = editor.locator('.ant-alert-error.erp-control-usage-highlight')
        await assertFilledTarget(failure)
        assert.match(await failure.innerText(), /输入已保留，请重试/u)
        await stage.getByText('尚未保存样例 · 提交 0 次', { exact: true }).waitFor()
        assert.equal(await subject.inputValue(), '确认里布交期')
        await submit.click()
        await editor.waitFor({ state: 'hidden' })
        await stage.getByText('已保存样例：确认里布交期 · 提交 1 次', { exact: true }).waitFor()
        await assertSelectedRule(requirements, '保存失败')

        await stage.getByRole('button', { name: '重置样例', exact: true }).click()
        assert.equal(await requirements.locator('tr[data-usage-selected]').count(), 0)
        await openRule('结果未知')
        const unknown = editor.locator('.ant-alert-warning.erp-control-usage-highlight')
        await assertFilledTarget(unknown)
        assert.equal(await submit.isDisabled(), true)
        await cancel.click()
        await editor.waitFor({ state: 'hidden' })
        await page.waitForFunction(() => document.activeElement?.textContent === '结果未知')
        await assertSelectedRule(requirements, '结果未知')
        await openRule('结果未知')
        await unknown.getByRole('button', { name: '查询结果', exact: true }).click()
        await editor.waitFor({ state: 'hidden' })
        await stage.getByText('已查询确认：确认里布交期 · 提交 0 次', { exact: true }).waitFor()
        await assertNoHorizontalOverflow(page, '编辑弹窗用法要求')
      },
    },
    {
      name: 'dev-ui-filter-usage-location',
      path: '/__dev/ui-design?page=controls&control=filters',
      viewport: { width: 1024, height: 768 },
      verify: async (page) => {
        const stage = page.locator('.erp-control-library-stage')
        const usage = page.getByRole('region', { name: '用法要求', exact: true })
        const clickRule = async (name) => {
          const rule = usage.getByRole('button', { name, exact: true })
          await rule.click()
          await assertSelectedRule(usage, name)
        }
        const result = stage.locator('[data-filter-example-result]')
        const search = stage.getByRole('textbox', { name: '演示搜索', exact: true })
        await search.fill('布偶熊')
        await search.press('Enter')
        await page.waitForFunction(() => document.querySelector('[data-filter-example-result]')?.textContent.includes('搜索：布偶熊'))
        await clickRule('结果范围')
        await assertFilledTarget(result)
        const resultRule = usage.getByRole('button', { name: '结果范围', exact: true })
        await resultRule.press('Enter')
        assert.equal(await resultRule.getAttribute('aria-pressed'), 'false')
        assert.equal(await usage.locator('tr[data-usage-selected]').count(), 0)
        await clickRule('常用条件')
        await assertFilledTarget(stage.getByRole('group', { name: '演示风险筛选', exact: true }))
        await search.fill('未提交的查询词')
        await clickRule('手机快捷项')
        await assertFilledTarget(stage.locator('.erp-control-filter-preview--mobile .erp-horizontal-scroll'))
        assert.equal(await stage.locator('.erp-mobile-search input').inputValue(), '未提交的查询词')
        await clickRule('主搜索')
        await assertFilledTarget(stage.locator('.erp-mobile-search'))
        const secondary = usage.getByRole('button', { name: '次级条件', exact: true })
        await secondary.press('Enter')
        const panel = page.locator('.erp-business-filter-popover').getByRole('dialog', { name: '筛选条件', exact: true })
        await assertFilledTarget(panel.locator('.erp-filter-popover-panel__fields'))
        assert.equal(await search.inputValue(), '未提交的查询词')
        await page.waitForFunction(() => Boolean(document.activeElement?.closest('.erp-business-filter-popover__content')))
        await page.keyboard.press('Escape')
        await panel.waitFor({ state: 'hidden' })
        await page.waitForFunction(() => document.activeElement?.textContent === '次级条件')
        await assertSelectedRule(usage, '次级条件')
        await clickRule('次级条件')
        await panel.getByRole('button', { name: '全部记录', exact: true }).click()
        const before = await result.innerText()
        await clickRule('面板清空')
        const clear = panel.getByRole('button', { name: '清空筛选', exact: true })
        await assertFilledTarget(clear)
        assert.equal(await result.innerText(), before, '定位清空按钮保留搜索和筛选')
        await clear.click()
        assert.match(await result.innerText(), /搜索：布偶熊.*范围：在执行/u)
        const close = panel.getByRole('button', { name: '收起', exact: true })
        await close.click()
        await panel.waitFor({ state: 'hidden' })
        await page.waitForFunction(() => document.activeElement?.textContent === '面板清空')
        await assertNoHorizontalOverflow(page, '筛选与搜索定位')
      },
    },
    {
      name: 'dev-ui-usage-targets-and-replacement',
      path: '/__dev/ui-design?page=controls&control=app-modal',
      viewport: { width: 1024, height: 768 },
      themeMode: 'dark',
      verify: async (page) => {
        const base = new URL(page.url())
        const goTo = (control) => {
          const url = new URL(base)
          url.searchParams.set('control', control)
          return page.goto(url.href)
        }
        const usage = page.getByRole('region', { name: '用法要求', exact: true })
        const closeWithEscape = async (dialog, source) => {
          await page.waitForFunction(() => Boolean(document.activeElement?.closest('[role="dialog"], [role="alertdialog"], .ant-drawer')), undefined, { timeout: 5000 })
          assert(await dialog.evaluate((element) => {
            const focused = document.activeElement
            return element.contains(focused) || (focused?.matches('.ant-drawer') && focused.contains(element))
          }), '打开后将焦点移入对应浮层')
          await page.keyboard.press('Escape')
          await dialog.waitFor({ state: 'hidden' })
          await page.waitForFunction((name) => document.activeElement?.textContent === name, source)
          await assertSelectedRule(usage, source)
        }
        const openPart = async (name) => {
          const row = usage.getByRole('row').filter({ has: page.getByRole('button', { name, exact: true }) })
          await row.getByRole('cell').last().click()
          await assertSelectedRule(usage, name)
        }

        const app = page.getByRole('dialog', { name: '共享标准弹窗', exact: true })
        await openPart('标题与内容')
        await assertFilledTarget(app.locator('.ant-modal-header.erp-control-usage-highlight'))
        await assertFilledTarget(app.locator('.ant-modal-body.erp-control-usage-highlight'))
        await closeWithEscape(app, '标题与内容')
        await openPart('遮罩与焦点')
        await assertFilledTarget(app.locator('.ant-modal-content.erp-control-usage-highlight'))
        await closeWithEscape(app, '遮罩与焦点')
        await openPart('尺寸与页脚')
        await assertFilledTarget(app.locator('.ant-modal-footer.erp-control-usage-highlight'))
        assert.equal(await app.locator('.ant-modal-header.erp-control-usage-highlight').count(), 0)
        await closeWithEscape(app, '尺寸与页脚')

        await goTo('filter-popover')
        const filters = page.getByRole('dialog', { name: '样例筛选条件', exact: true })
        await openPart('打开入口与面板名称')
        await assertFilledTarget(page.getByRole('button', { name: '筛选', exact: true }))
        await closeWithEscape(filters, '打开入口与面板名称')
        await openPart('清空与收起')
        await assertFilledTarget(filters.getByRole('button', { name: '清空筛选', exact: true }))
        await assertFilledTarget(filters.getByRole('button', { name: '收起', exact: true }))
        await closeWithEscape(filters, '清空与收起')
        await openPart('筛选条件')
        await assertFilledTarget(filters.locator('.erp-filter-popover-panel__fields'))
        await closeWithEscape(filters, '筛选条件')

        await goTo('business-modal')
        await openPart('业务标题与正文')
        const record = page.getByRole('dialog', { name: '附件预览样例', exact: true })
        await assertFilledTarget(record.locator('.ant-modal-header.erp-control-usage-highlight'))
        await closeWithEscape(record, '业务标题与正文')
        await openPart('业务尺寸')
        await assertFilledTarget(record.locator('.ant-modal-content.erp-control-usage-highlight'))
        await closeWithEscape(record, '业务尺寸')
        await usage.getByRole('button', { name: '带草稿的编辑', exact: true }).press('Enter')
        await page.waitForURL((url) => url.searchParams.get('control') === 'business-form-modal')
        await usage.getByRole('button', { name: '标题', exact: true }).waitFor()

        await goTo('drawer')
        const drawer = page.getByRole('dialog', { name: '采购单上下文摘要', exact: true })
        await openPart('侧边展开')
        await assertFilledTarget(drawer.and(page.locator('.erp-control-usage-highlight')))
        await closeWithEscape(drawer, '侧边展开')
        for (const [name, section] of [['标题与上下文', 'header'], ['宽度与附加动作', 'body']]) {
          await openPart(name)
          await assertFilledTarget(drawer.locator(`.ant-drawer-${section}.erp-control-usage-highlight`))
          await closeWithEscape(drawer, name)
        }

        await goTo('alert-dialog')
        const alert = page.getByRole('alertdialog', { name: '登录状态已失效', exact: true })
        await openPart('提示名称与下一步')
        await assertFilledTarget(alert.locator('[data-app-alert-title]'))
        await closeWithEscape(alert, '提示名称与下一步')
        await openPart('关闭与焦点')
        await assertFilledTarget(alert.locator('.erp-feedback-alert-part--frame'))
        await closeWithEscape(alert, '关闭与焦点')
        await openPart('补充说明')
        await assertFilledTarget(alert.locator('[data-app-alert-message]'))
        await closeWithEscape(alert, '补充说明')
        await openPart('异步确认')
        await assertFilledTarget(alert.getByRole('button', { name: '重新登录', exact: true }))
        await closeWithEscape(alert, '异步确认')

        await goTo('pagination')
        await openPart('每页条数')
        const stage = page.getByRole('region', { name: '交互样例', exact: true })
        const sizeMarker = '[aria-label="每页示例条数"] .ant-select-selector[data-sample-usage-highlight]'
        const highlightedSize = stage.locator(sizeMarker)
        await assertFilledTarget(highlightedSize)
        await stage.getByRole('radio', { name: '独立分页', exact: true }).locator('..').click()
        const independent = stage.getByLabel('示例独立分页', { exact: true })
        await assertFilledTarget(independent.locator(sizeMarker))
        assert.equal(await highlightedSize.count(), 1)
        assert.equal(await usage.getByRole('button', { name: '每页条数', exact: true }).getAttribute('aria-pressed'), 'true')
        await assertNoHorizontalOverflow(page, '用法定位随分页控件更新')
      },
    },
    {
      name: 'dev-ui-shared-basic-inputs',
      path: '/__dev/ui-design?page=controls&control=inputs',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const stage = page.locator('.erp-control-library-stage')
        const name = stage.getByLabel('产品名称', { exact: true })
        const note = stage.getByLabel('备注', { exact: true })
        const count = stage.locator('.ant-input-data-count')
        await note.waitFor()
        const initialNoteHeight = (await note.boundingBox()).height
        assert.equal(await count.innerText(), `0 / ${BusinessTextPolicy.noteMaxCharacters}`)
        const noteMetrics = await note.evaluate((node) => {
          const style = getComputedStyle(node)
          return { height: node.clientHeight, lineHeight: parseFloat(style.lineHeight), padding: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) }
        })
        assert(noteMetrics.height - noteMetrics.padding >= noteMetrics.lineHeight * 2 - 1, '备注初始显示至少两行')
        const multiline = '分批交付\n'.repeat(6)
        await note.fill(multiline)
        await page.waitForFunction((height) => document.getElementById('control-remark').clientHeight > height, initialNoteHeight)
        assert.equal(await count.innerText(), `${multiline.length} / ${BusinessTextPolicy.noteMaxCharacters}`)
        await note.locator('..').locator('.ant-input-clear-icon').click()
        assert.equal(await note.inputValue(), '')
        await page.waitForFunction((height) => Math.abs(document.getElementById('control-remark').getBoundingClientRect().height - height) <= 1, initialNoteHeight)
        assert.equal(await count.innerText(), `0 / ${BusinessTextPolicy.noteMaxCharacters}`)
        await note.fill('字'.repeat(BusinessTextPolicy.noteMaxCharacters))
        await note.press('End')
        await note.press('x')
        assert.equal((await note.inputValue()).length, BusinessTextPolicy.noteMaxCharacters, '输入到上限后不继续写入')
        const emojiNote = '😀'.repeat(BusinessTextPolicy.noteMaxCharacters)
        await note.fill(emojiNote)
        assert.equal(await count.innerText(), `${BusinessTextPolicy.noteMaxCharacters} / ${BusinessTextPolicy.noteMaxCharacters}`)
        await note.press('End')
        await note.press('x')
        assert.equal(await note.inputValue(), emojiNote, '补充字符按一个字符计数并守住输入上限')
        await note.fill('保留备注')
        await name.fill('包装挂件')
        await stage.locator('.ant-select-selector').click()
        await page
          .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
          .getByText('挂件', { exact: true })
          .click()
        assert.equal(
          await stage.getByLabel('基础输入结果').innerText(),
          '包装挂件 · 挂件'
        )
        await name.fill('')
        await stage.locator('.ant-select').hover()
        await stage.locator('.ant-select-clear').click()
        assert.equal(await stage.getByLabel('基础输入结果').innerText(), '未填写名称 · 未选择类别')
        await name.fill('包装挂件')
        await stage
          .getByRole('radio', { name: '禁用', exact: true })
          .locator('..')
          .click()
        assert(await name.isDisabled())
        assert(await stage.getByRole('combobox', { name: '产品类别', exact: true }).isDisabled())
        assert.equal(await name.inputValue(), '包装挂件')
        assert(await note.isDisabled())
        assert.equal(await count.count(), 0, '禁用查看不显示字数')
        assert.equal(await note.inputValue(), '保留备注')
        await stage
          .getByRole('radio', { name: '错误', exact: true })
          .locator('..')
          .click()
        await stage.getByRole('alert').waitFor()
        assert.equal(
          await stage
            .locator('.ant-input-status-error, .ant-select-status-error')
            .count(),
          3
        )
        assert.equal(await count.innerText(), `4 / ${BusinessTextPolicy.noteMaxCharacters}`)
        await stage
          .getByRole('button', { name: '恢复初始内容', exact: true })
          .click()
        assert.equal(await name.inputValue(), '布偶熊')
        assert.equal(await stage.getByLabel('基础输入结果').innerText(), '布偶熊 · 毛绒玩具')
        assert.equal(await stage.getByRole('alert').count(), 0)
        assert.equal(await note.inputValue(), '')
        assert.equal(await count.innerText(), `0 / ${BusinessTextPolicy.noteMaxCharacters}`)
        await page
          .getByRole('button', { name: /重置演示/u })
          .click()
        assert.equal(await name.inputValue(), '布偶熊')
        await assertNoHorizontalOverflow(page)
      },
    },
    {
      name: 'dev-ui-assignee-filter-select',
      path: '/__dev/ui-design?page=controls&control=filter-select',
      viewport: { width: 1024, height: 768 },
      verify: async (page) => {
        const stage = page.locator('.erp-control-library-stage')
        const input = stage.getByRole('combobox', { name: '办理人', exact: true })
        const result = stage.getByLabel('筛选当前结果', { exact: true })
        await result.waitFor()
        assert.equal(await result.innerText(), '不限 · 4 条任务')

        await input.fill('无匹配姓名')
        const dropdown = page.locator('.ant-select-dropdown:visible')
        await dropdown.getByText('没有匹配的选项', { exact: true }).waitFor()
        assert.equal(await result.innerText(), '不限 · 4 条任务')

        await input.fill('王')
        const options = dropdown.locator('.ant-select-item-option-content')
        const match = options.filter({ hasText: /^王小禾$/u })
        await match.waitFor()
        assert.deepEqual(await options.allTextContents(), ['王小禾'])
        await match.click()
        assert.equal(await result.innerText(), '王小禾 · 2 条任务')

        await stage.locator('.ant-select').hover()
        await stage.locator('.ant-select-clear').click()
        assert.equal(await result.innerText(), '不限 · 4 条任务')
        await assertNoHorizontalOverflow(page)
      },
    },
    {
      name: 'dev-ui-shared-date-inputs',
      path: '/__dev/ui-design?page=controls&control=date',
      viewport: { width: 1920, height: 1080 },
      verify: async (page) => {
        const stage = page.locator('.erp-control-library-stage')
        await stage.getByLabel('单个日期', { exact: true }).waitFor()
        const businessRequests = []
        page.on('request', (request) => {
          if (new URL(request.url()).pathname.startsWith('/rpc/')) {
            businessRequests.push(request.url())
          }
        })
        const date = stage
          .locator('.ant-picker')
          .filter({ has: page.locator('#control-date') })
        const dateValue = stage.getByLabel('日期当前值', { exact: true })
        const popup = page.locator(
          '.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)'
        )
        const directory = page.getByRole('navigation', { name: '组件设计目录', exact: true })
        const choose = async (name) => {
          await directory.getByText(name, { exact: true }).click()
          await page.getByRole('heading', { name, exact: true }).waitFor()
        }
        const chooseState = (name) => stage.getByRole('radio', { name, exact: true }).locator('..').click()
        const resetSample = () => stage.getByRole('button', { name: '重置日期示例', exact: true }).click()
        await date.click({ position: { x: 12, y: 12 } })
        await popup
          .locator('.ant-picker-cell-in-view[title="2026-10-09"]')
          .click()
        assert.equal(
          await dateValue.innerText(),
          '2026-10-09',
          '日期选择立即到达受控示例'
        )
        await popup.waitFor({ state: 'hidden' })
        await date.hover()
        await date.locator('.ant-picker-clear').click()
        assert.equal(await dateValue.innerText(), '未设置')
        assert.equal(await popup.count(), 0, '清空不重新打开日历')
        await chooseState('禁用')
        assert(await stage.locator('#control-date').isDisabled())
        await chooseState('错误')
        assert.equal(await stage.locator('.ant-picker-status-error').count(), 1)
        await resetSample()
        assert.equal(await dateValue.innerText(), '2026-10-08')

        await choose('日期时间')
        const deadline = stage
          .locator('.ant-picker')
          .filter({ has: page.locator('#control-deadline') })
        const deadlineValue = stage.getByLabel('截止时间当前值', {
          exact: true,
        })
        await deadline.click({ position: { x: 12, y: 12 } })
        await popup
          .locator(
            '.ant-picker-time-panel-column:last-child .ant-picker-time-panel-cell'
          )
          .filter({ hasText: /^37$/u })
          .click()
        assert(
          (await deadlineValue.innerText()).endsWith(':37'),
          '分钟选择不依赖确认或关闭面板'
        )
        const sevenDays = await page.evaluate(() => {
          const now = new Date()
          now.setDate(now.getDate() + 7)
          return [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0'),
          ].join('-')
        })
        await popup.getByRole('button', { name: '7 天后', exact: true }).click()
        await page.waitForFunction(
          (prefix) =>
            document
              .querySelector('output[aria-label="截止时间当前值"]')
              ?.textContent.startsWith(prefix),
          `${sevenDays}T`
        )
        await chooseState('禁用')
        assert(await stage.locator('#control-deadline').isDisabled())
        assert((await deadlineValue.innerText()).startsWith(sevenDays))
        await chooseState('错误')
        assert.equal(await stage.locator('.ant-picker-status-error').count(), 1)
        await resetSample()
        assert.equal(await deadlineValue.innerText(), '2026-10-08T09:00')

        await directory.getByRole('button', { name: '搜索与筛选', exact: true }).click()
        await choose('日期范围筛选')
        const range = stage.getByRole('region', {
          name: '日期范围示例',
          exact: true,
        })
        await waitForFiniteAnimations(page)
        const dates = await openDateFilter(page, range)
        await waitForFiniteAnimations(page)
        const [previousMonth, nextMonth, monthHeadings] = await Promise.all([
          dateFilterButton(dates, '上个月').boundingBox(),
          dateFilterButton(dates, '下个月').boundingBox(),
          dates.locator('.erp-filter-date-calendar__headings').boundingBox(),
        ])
        assert(previousMonth && nextMonth && monthHeadings, '翻月按钮和月份标题均可见')
        const centerY = (box) => box.y + box.height / 2
        assert(
          [previousMonth, nextMonth].every((button) => Math.abs(centerY(button) - centerY(monthHeadings)) <= 1),
          `左右翻月按钮与月份标题同行 ${JSON.stringify({ previousMonth, nextMonth, monthHeadings })}`
        )
        const dateTypes = dates.getByRole('group', { name: '日期类型', exact: true })
        await dateFilterButton(dateTypes, '交货日期').click()
        assert.equal(await dateFilterButton(dateTypes, '交货日期').getAttribute('aria-pressed'), 'true')
        const { from, to } = await manualDateInputs(dates)
        assert.equal(await from.inputValue(), '2026-10-08')
        await to.fill('2026-10-07')
        assert.equal(await dateFilterButton(dates, '应用日期').isDisabled(), true)
        await dates.getByText('结束日期不能早于开始日期', { exact: true }).waitFor()
        await dateFilterButton(dates, '取消').click()
        await stage.getByRole('button', { name: '查看倒置范围', exact: true }).click()
        await openDateFilter(page, range)
        await dates.getByText('结束日期不能早于开始日期', { exact: true }).waitFor()
        assert.equal(await dateFilterButton(dates, '应用日期').isDisabled(), true)
        await dateFilterButton(dates, '取消').click()
        await stage
          .getByRole('button', { name: '清空范围', exact: true })
          .click()
        assert.equal(
          await stage.getByLabel('日期范围当前值', { exact: true }).innerText(),
          '未设置 至 未设置'
        )
        assert.equal(await range.getByRole('alert').count(), 0)
        await resetSample()
        assert.equal(await stage.getByLabel('日期范围当前值', { exact: true }).innerText(), '2026-10-08 至 2026-10-15')
        await page
          .getByRole('button', { name: /重置演示/u })
          .click()
        assert.equal(
          await stage.getByLabel('日期范围当前值', { exact: true }).innerText(),
          '2026-10-08 至 2026-10-15'
        )
        assert.deepEqual(businessRequests, [], '组件演示不调用业务接口')
        const dimensions = await stage.evaluate((node) => ({
          width: node.clientWidth,
          scrollWidth: node.scrollWidth,
        }))
        assert(
          dimensions.scrollWidth <= dimensions.width + 1,
          '日期范围样例不造成示例区横向溢出'
        )
        await assertNoHorizontalOverflow(page)
      },
    },
  ]
}
