import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { prepareUIDesignSandboxSource } from '../../src/dev-workbench/config/devUIDesign.mjs'

const designSource = prepareUIDesignSandboxSource(
  readFileSync(
    new URL('../../../docs/product/ui-design/index.html', import.meta.url),
    'utf8'
  )
)
const fixturePath = '/__style-fixtures/form-density-design'
const designHTML = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%}iframe{width:100%;height:calc(100% - 30px);border:0;display:block}</style></head><body><div style="height:30px;padding:4px 12px;box-sizing:border-box">表单交互设计验证</div><iframe title="ERP 最新可交互设计" sandbox="allow-scripts allow-modals allow-downloads" srcdoc="${designSource.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"></iframe></body></html>`

async function assertCompactBounds(table, narrow) {
  const metrics = await table.evaluate((node) => ({
    width: node.clientWidth,
    scrollWidth: node.scrollWidth,
    rows: [
      ...node.querySelectorAll('tbody > tr:not(.compact-row-details)'),
    ].map((row) => ({
      height: row.getBoundingClientRect().height,
      fields: [...row.querySelectorAll('input, select')].map(
        (input) => ({ width: input.getBoundingClientRect().width, height: input.getBoundingClientRect().height })
      ),
    })),
  }))
  assert.ok(metrics.scrollWidth <= metrics.width + 1, JSON.stringify(metrics))
  if (!narrow) {
    assert.ok(
      metrics.rows.every((row) => row.height < 85),
      JSON.stringify(metrics)
    )
  }
  assert.ok(
    metrics.rows.every((row) =>
      row.fields.every((field) => field.width >= 75 && field.height >= 32)
    ),
    JSON.stringify(metrics)
  )
}

export function createFormDensityScenarios({ outputDir }) {
  return ['desktop', 'narrow'].map((size) => ({
    name: `form-density-design-${size}`,
    path: fixturePath,
    beforeNavigate: async (page) => {
      page.setDefaultTimeout(5000)
      await page.route(`**${fixturePath}`, (route) =>
        route.fulfill({ contentType: 'text/html', body: designHTML })
      )
    },
    viewport: { width: size === 'desktop' ? 1920 : 720, height: 1000 },
    verify: async (page) => {
      const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
      if (size === 'narrow') {
        await frame.locator('[data-action="open-theme"]').click()
        await frame
          .locator('[data-action="set-mode"][data-value="dark"]')
          .click()
        await frame.getByRole('button', { name: '完成', exact: true }).click()
      }
      const navigate = async (title) => {
        if (size === 'narrow') {
          await frame
            .getByRole('button', { name: '打开导航', exact: true })
            .click()
        }
        await frame
          .getByRole('button', { name: '全部模块', exact: true })
          .click()
        await frame
          .locator('.catalog-card')
          .filter({ has: frame.getByText(title, { exact: true }) })
          .click()
      }
      const openAction = async (kind) => {
        await frame.locator('[data-action="more-selected"]').click()
        await frame
          .locator(`[data-action="open-compact-action"][data-kind="${kind}"]`)
          .click()
      }
      for (const [title, kind] of [
        ['质量检验', 'quality'],
        ['采购入库', 'return'],
        ['采购入库', 'adjustment'],
        ['销售订单', 'engineering'],
      ]) {
        await navigate(title)
        await frame
          .locator('.table-wrap [data-action="select-row"]')
          .first()
          .check()
        await openAction(kind)
        const modal = frame
          .locator('[role="dialog"]')
          .filter({ has: frame.locator('.compact-action-form') })
        await modal.waitFor()
        const table = modal.locator('.compact-form-table')
        await assertCompactBounds(table, size === 'narrow')
        if (kind === 'quality') {
          await modal.getByLabel('检查项目 1', { exact: true }).fill('色差复核')
          await modal.getByLabel('实际情况 1').fill('与确认样一致')
          await modal.getByLabel('检查范围 1').selectOption('抽检')
          await modal.getByLabel('说明 / 抽检范围 1').fill('抽取三卷')
          await modal.getByRole('button', { name: '添加检查项' }).click()
          await modal.getByLabel('检查项目 2').fill('克重')
          await modal.getByRole('button', { name: '移除明细 1' }).click()
          assert.equal(
            await modal.getByLabel('检查项目 1', { exact: true }).inputValue(),
            '克重'
          )
        } else {
          const note = modal.locator('.compact-optional').first()
          await note.locator('summary').click()
          await note.locator('textarea').fill('保存后仍须保留的补充说明')
          await note.locator('summary').click()
          assert.match(
            await note.locator('summary').innerText(),
            /保存后仍须保留/
          )
          if (kind === 'engineering') {
            await modal.getByLabel('工程产品 1').selectOption('节庆毛绒礼盒')
            await modal.getByLabel('打样 BOM 1').selectOption('V1')
            assert.equal(
              await modal.getByLabel('设计师 1').inputValue(),
              '周敏'
            )
            await modal.getByLabel('工程产品 1').selectOption('毛绒挂件')
            assert.equal(await modal.getByLabel('打样 BOM 1').inputValue(), '')
            assert.equal(await modal.getByLabel('设计师 1').inputValue(), '')
          } else {
            await modal
              .getByLabel(kind === 'return' ? '退货数量 1' : '调整数量 1')
              .fill('2')
            if (kind === 'adjustment') {
              await modal.getByLabel('调整方式 1').selectOption('仓库更正')
              await modal.getByLabel('目标仓库 1').selectOption('辅料仓')
              await modal.getByLabel('调整方式 1').selectOption('批次更正')
              assert.equal(
                await modal.getByLabel('目标批次 1').inputValue(),
                ''
              )
              await modal.getByLabel('目标批次 1').selectOption('L0918')
            }
          }
        }
        await modal.screenshot({
          path: `${outputDir}/form-density-design-${kind}-${size}.png`,
        })
        await modal.locator('[data-action="save-compact-action"]').click()
        await modal.waitFor({ state: 'hidden' })
        await openAction(kind)
        await modal.waitFor()
        if (kind === 'quality') {
          assert.equal(
            await modal.getByLabel('检查项目 1', { exact: true }).inputValue(),
            '克重'
          )
        } else {
          assert.match(
            await modal
              .locator('.compact-optional summary')
              .first()
              .innerText(),
            /保存后仍须保留/
          )
        }
        await modal.getByRole('button', { name: '取消', exact: true }).click()
      }
      await navigate('生产管理')
      await frame.locator('[data-action="new-record"]').click()
      const production = frame.locator('.compact-form-table')
      await production.waitFor()
      await frame
        .getByLabel('产品 1', { exact: true })
        .selectOption('节庆毛绒礼盒')
      await production.locator('summary').click()
      await frame.getByLabel('明细备注 1', { exact: true }).fill('生产首行备注')
      await production.locator('summary').click()
      await frame.getByRole('button', { name: '增加明细', exact: true }).click()
      assert.equal(await production.locator('tbody').count(), 2)
      assert.match(
        await production.locator('summary').first().innerText(),
        /生产首行备注/
      )
      await production
        .locator('tbody')
        .last()
        .getByRole('button', { name: '移除' })
        .click()
      await frame.getByRole('button', { name: '保存草稿', exact: true }).click()
      assert.equal(await production.locator('tbody').count(), 1)
      assert.match(
        await production.locator('summary').innerText(),
        /生产首行备注/
      )
      await assertCompactBounds(production, size === 'narrow')
      await production.screenshot({
        path: `${outputDir}/form-density-design-production-${size}.png`,
      })
      await frame.getByRole('button', { name: '返回列表', exact: true }).click()
      for (const title of [
        '销售订单',
        '采购订单',
        '物料清单（BOM）',
        '委外订单',
      ]) {
        await navigate(title)
        await frame.locator('[data-action="new-record"]').click()
        const empty = frame.locator('.compact-form-empty')
        await empty.waitFor()
        assert.ok((await empty.boundingBox()).height < 55)
        await frame
          .getByRole('button', { name: '返回列表', exact: true })
          .click()
      }
      await navigate('库存台账')
      await frame.locator('[data-action="new-record"]').click()
      await frame.getByLabel('操作原因').fill('核对盘点差异')
      await frame.getByLabel('作业数量').fill('1200')
      await frame.locator('.compact-optional summary').click()
      await frame.getByLabel('备注', { exact: true }).fill('盘点补充说明')
      await frame.locator('.compact-optional summary').click()
      await frame.getByRole('button', { name: '保存草稿', exact: true }).click()
      assert.equal(await frame.getByLabel('作业数量').inputValue(), '1200')
      assert.match(
        await frame.locator('.compact-optional summary').innerText(),
        /盘点补充说明/
      )
      await frame.getByLabel('操作类型').selectOption('调拨')
      assert.equal(await frame.getByLabel('作业数量').inputValue(), '')
      await frame.getByLabel('作业数量').fill('20')
      await frame.getByLabel('目标仓库').selectOption('辅料仓')
      await frame.getByRole('button', { name: '保存修改', exact: true }).click()
      assert.equal(await frame.getByLabel('目标仓库').inputValue(), '辅料仓')
      await frame
        .locator('.form-view')
        .screenshot({
          path: `${outputDir}/form-density-design-inventory-${size}.png`,
        })
    },
  }))
}
