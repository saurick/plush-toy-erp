import { readFile } from 'node:fs/promises'
import { createDevPaginationScenarios } from './devPaginationScenarios.mjs'
import { createDevBusinessComponentScenarios } from './devBusinessComponentScenarios.mjs'
import {
  findUIDesignChapter,
  readUIDesignChapters,
} from '../../src/dev-workbench/config/devUIDesignReading.mjs'

export function createDevSharedComponentScenarios({
  assert,
  assertNoHorizontalOverflow,
  customerRuntimeEffectiveSession,
}) {
  return [
    ...createDevPaginationScenarios({ assert, assertNoHorizontalOverflow }),
    ...createDevBusinessComponentScenarios({ assert, assertNoHorizontalOverflow, customerRuntimeEffectiveSession }),
    {
      name: 'dev-ui-shared-component-catalog',
      path: '/__dev/ui-design?page=controls&control=components',
      viewport: { width: 1920, height: 1080 },
      verify: async (page) => {
        const catalog = page.getByRole('region', {
          name: '公共组件选用',
          exact: true,
        })
        await catalog.waitFor()
        assert.equal(await page.getByRole('button', { name: /重置演示/u }).count(), 0, '只读选用表不显示演示重置动作')
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
          const links = row.getByRole('link')
          assert.equal(await links.count(), 2)
          assert((await links.nth(0).getAttribute('href')).startsWith('/__dev/ui-design?page=controls&control='))
          assert(/^\/erp\//u.test(await links.nth(1).getAttribute('href')), '真实入口必须指向正式业务路径')
        }
        const designLink = catalog.getByRole('link', { name: '下拉选择与清空', exact: true })
        assert((await designLink.getAttribute('href')).startsWith('/__dev/docs?path='), '嵌入文档沿用项目阅读器解析相对链接')
        const search = page.getByLabel('搜索控件设计', { exact: true })
        const directory = page.getByRole('navigation', {
          name: '控件设计目录',
          exact: true,
        })
        await search.fill('PrintEditableText')
        await search.press('Enter')
        await page.waitForURL((url) => url.searchParams.get('controlq') === 'PrintEditableText')
        await directory.getByRole('button').nth(1).waitFor({ state: 'detached' })
        assert.equal(await directory.getByRole('button').count(), 1)
        await directory.getByRole('button', { name: /组件选用/u }).waitFor()
        await page.reload()
        await catalog.waitFor()
        assert.equal(await search.inputValue(), 'PrintEditableText')
        const printLink = catalog.getByRole('link', {
          name: '查看打印组件与输出边界',
          exact: true,
        })
        await printLink.click()
        await page.waitForURL(
          (url) =>
            url.pathname === '/__dev/docs' &&
            url.searchParams.get('path') === 'docs/打印模板实现原理.md'
        )
        await page.goBack()
        await catalog.waitFor()
        assert.equal(await search.inputValue(), 'PrintEditableText')
        await search.fill('没有这样的控件')
        await search.press('Enter')
        await directory.getByText('没有匹配的控件', { exact: true }).waitFor()
        await directory
          .getByRole('button', { name: '清除搜索', exact: true })
          .focus()
        await page.keyboard.press('Enter')
        await directory.getByRole('button', { name: /日期与时间/u }).waitFor()
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
      },
    },
    {
      name: 'dev-ui-shared-focus-recovery',
      path: '/__dev/ui-design?page=controls&control=dates',
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
        const directory = page.getByRole('navigation', { name: '控件设计目录', exact: true })
        const inputs = directory.getByRole('button', { name: /基础输入/u })
        await inputs.focus()
        await page.keyboard.press('Enter')
        await stage.getByLabel('产品名称', { exact: true }).waitFor()
        await popup.waitFor({ state: 'hidden' })
        assert(await inputs.evaluate((node) => node === document.activeElement), '切换分类关闭旧弹层，焦点保留在目录项')

        const dates = directory.getByRole('button', { name: /日期与时间/u })
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
      name: 'dev-ui-shared-basic-inputs',
      path: '/__dev/ui-design?page=controls&control=inputs',
      viewport: { width: 1920, height: 1080 },
      verify: async (page) => {
        const stage = page.locator('.erp-control-library-stage')
        const name = stage.getByLabel('产品名称', { exact: true })
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
        await stage
          .getByRole('radio', { name: '错误', exact: true })
          .locator('..')
          .click()
        await stage.getByRole('alert').waitFor()
        assert.equal(
          await stage
            .locator('.ant-input-status-error, .ant-select-status-error')
            .count(),
          2
        )
        await stage
          .getByRole('button', { name: '恢复初始内容', exact: true })
          .click()
        assert.equal(await name.inputValue(), '布偶熊')
        assert.equal(await stage.getByLabel('基础输入结果').innerText(), '布偶熊 · 毛绒玩具')
        assert.equal(await stage.getByRole('alert').count(), 0)
        await page
          .getByRole('button', { name: /重置演示/u })
          .click()
        assert.equal(await name.inputValue(), '布偶熊')
        await assertNoHorizontalOverflow(page)
      },
    },
    {
      name: 'dev-ui-shared-date-inputs',
      path: '/__dev/ui-design?page=controls&control=dates',
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
        await stage
          .getByRole('radio', { name: '禁用', exact: true })
          .locator('..')
          .click()
        assert(await stage.locator('#control-date').isDisabled())
        assert(await stage.locator('#control-deadline').isDisabled())
        assert((await deadlineValue.innerText()).startsWith(sevenDays))
        await stage
          .getByRole('radio', { name: '错误', exact: true })
          .locator('..')
          .click()
        assert.equal(await stage.locator('.ant-picker-status-error').count(), 2)
        await stage
          .getByRole('radio', { name: '正常', exact: true })
          .locator('..')
          .click()
        const range = stage.getByRole('region', {
          name: '日期范围示例',
          exact: true,
        })
        await range
          .locator('.erp-business-date-range-filter__type .ant-select-selector')
          .click()
        await page
          .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
          .getByText('交货日期', { exact: true })
          .click()
        assert.equal(
          await range
            .getByRole('group', { name: '交货日期', exact: true })
            .count(),
          1
        )
        await range.locator('.erp-business-date-input').nth(1).click()
        assert(
          (
            await popup
              .locator('.ant-picker-cell-in-view[title="2026-10-07"]')
              .getAttribute('class')
          ).includes('ant-picker-cell-disabled'),
          '结束日期不能早于开始日期'
        )
        await page.keyboard.press('Escape')
        await stage
          .getByRole('button', { name: '查看倒置范围', exact: true })
          .click()
        await range.getByRole('alert').waitFor()
        assert.equal(await range.locator('.ant-picker-status-error').count(), 2)
        await stage
          .getByRole('button', { name: '清空范围', exact: true })
          .click()
        assert.equal(
          await stage.getByLabel('日期范围当前值', { exact: true }).innerText(),
          '未设置 至 未设置'
        )
        assert.equal(await range.getByRole('alert').count(), 0)
        await stage
          .getByRole('button', { name: '重置日期示例', exact: true })
          .click()
        assert.equal(await dateValue.innerText(), '2026-10-08')
        assert.equal(await deadlineValue.innerText(), '2026-10-08T09:00')
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
          '日期组合不造成示例区横向溢出'
        )
        await assertNoHorizontalOverflow(page)
      },
    },
  ]
}
