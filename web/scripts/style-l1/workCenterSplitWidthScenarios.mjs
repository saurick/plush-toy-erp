import { writeFile } from 'node:fs/promises'
import { createTaskItemSemanticsScenarios } from './taskItemSemanticsScenarios.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

export function createWorkCenterSplitWidthScenarios({ assert, outputDir }) {
  const base = createTaskItemSemanticsScenarios({ assert }).find((scene) => scene.name === 'task-item-layout-workbench-1056-light')
  const tasks = Array.from({ length: 12 }, (_, index) => ({
    ...base.workflowTaskFixtures[0],
    id: 97500 + index,
    task_code: `STYLE-L1-SPLIT-WIDTH-${index}`,
    task_name: '工程资料',
    source_type: 'sales_order',
    source_id: 100 + index,
    display_context: {
      available: true,
      source_no: `SO-WIDTH-LONG-REFERENCE-${100 + index}`,
      items: Array.from({ length: index % 3 + 1 }, (_, item) => ({ kind: 'product', name: index === 5 ? '窄栏验证长名称产品和包装配件套装' : `窄栏验证产品 ${index + 1}`, code: `WIDTH-PRODUCT-${index + 1}-${item + 1}` })),
    },
  }))
  return ['workbench', 'tasks'].flatMap((kind) => ['light', 'dark'].map((themeMode) => ({
    ...base,
    name: `work-center-split-width-${kind}-${themeMode}`,
    path: kind === 'workbench' ? '/erp/dashboard' : '/erp/task-board?mode=todo&lane=actionable',
    themeMode,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    workflowTaskFixtures: tasks,
    verify: async (page) => {
      const left = page.locator('.erp-split-pane--left')
      const right = page.locator('.erp-split-pane--right')
      const evidence = []
      const measure = async (state) => {
        const geometry = await page.locator('.erp-split-workspace .erp-work-center-table:visible tr[data-task-id]').evaluateAll((rows) => rows.map((row) => {
          const cell = row.querySelector('td')
          const content = row.querySelector('.erp-task-identity__content')
          const item = content?.querySelector(':scope > .erp-task-identity__item')
          const box = (node) => node?.getBoundingClientRect().toJSON()
          return {
            id: row.dataset.taskId,
            cell: box(cell),
            heading: box(content?.querySelector('.erp-task-identity__card-heading')),
            item: box(item),
            metadata: box(item?.querySelector('.erp-task-identity__metadata')),
            product: box(item?.querySelector('.erp-task-identity__product')),
          }
        }))
        evidence.push({ state, geometry })
        const panes = state === 'single-page' || state === 'collapsed' ? 1 : 2
        assert.equal(geometry.length, tasks.length * panes, '完整检查每个可见栏的当前页任务')
        for (const row of geometry) {
          assert(row.heading && row.item && row.metadata && row.product, '任务标题、产品和来源均存在')
          assert(row.heading.bottom <= row.item.top + 1, `标题与关联内容不能重叠：${JSON.stringify(row)}`)
          assert(row.heading.top >= row.cell.top - 1 && row.item.bottom <= row.cell.bottom + 1, `内容不能越过所属表格行：${JSON.stringify(row)}`)
          assert(row.product.bottom <= row.metadata.top + 1, `产品名称与编号来源不能重叠：${JSON.stringify(row)}`)
        }
      }
      const resize = async (ratio, state) => {
        const panels = page.locator('.erp-split-panels')
        const rect = await panels.boundingBox()
        const handle = await panels.locator(':scope > .ant-splitter-bar .ant-splitter-bar-dragger').boundingBox()
        const originalWidth = (await left.boundingBox()).width
        await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
        await page.mouse.down()
        await page.mouse.move(rect.x + rect.width * ratio, handle.y + handle.height / 2, { steps: 20 })
        assert(Math.abs((await left.boundingBox()).width - originalWidth) <= 1, '拖动中继续只更新预览线')
        await page.mouse.up()
        await waitForFiniteAnimations(page)
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        await measure(`${state}-${ratio}`)
      }
      try {
        await left.locator('.erp-work-center-table tr[data-task-id]').first().waitFor()
        await page.evaluate(() => document.fonts.ready)
        await measure('single-page')
        const original = await left.locator('.erp-work-center-table').elementHandle()
        await page.getByRole('button', { name: '分栏', exact: true }).first().click()
        const picker = right.getByRole('combobox', { name: '选择右栏页面' })
        await picker.click()
        await picker.fill('任务管理')
        await page.locator('.ant-select-dropdown:visible').getByText('任务管理', { exact: true }).click()
        await right.locator('.erp-work-center-table tr[data-task-id]').first().waitFor()
        for (const ratio of [0.32, 0.68, 0.4, 0.32]) await resize(ratio, 'original')
        await page.screenshot({ path: `${outputDir}/work-center-split-width-${kind}-${themeMode}-narrow.png`, fullPage: false })
        await left.getByRole('button', { name: '布局', exact: true }).click()
        await page.getByRole('button', { name: '左右互换' }).click()
        for (const ratio of [0.32, 0.68, 0.5]) await resize(ratio, 'swapped')
        await left.getByRole('button', { name: '收起分栏', exact: true }).first().click()
        await measure('collapsed')
        assert.equal(await left.locator('.erp-work-center-table').evaluate((node, original) => node === original, original), true, '调宽、互换及收起均保留表格实例')
        await original.dispose()
      } finally {
        await writeFile(`${outputDir}/work-center-split-width-${kind}-${themeMode}.json`, JSON.stringify(evidence, null, 2))
        await page.screenshot({ path: `${outputDir}/work-center-split-width-${kind}-${themeMode}-viewport.png`, fullPage: false })
      }
    },
  })))
}
