import { expect } from 'playwright/test'
import { FINANCE_RULES } from '../../src/dev-workbench/config/devFinanceWorkbench.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

export function createDevFinanceWorkbenchScenarios({
  assert,
  assertNoHorizontalOverflow,
  startNoWriteAudit,
}) {
  const writes = new WeakMap()
  return [
    {
      name: 'dev-finance-prototype-alignment',
      path: '/__dev/business-topics?flow_topic=finance_relations',
      viewport: { width: 1920, height: 1080 },
      beforeNavigate: (page) => startNoWriteAudit(page, writes),
      verify: async (page) => {
        const overview = page.locator('[data-finance-overview]')
        await expect(overview).toBeVisible()
        await expect(page.locator('[data-finance-detail]')).toHaveCount(0)
        assert.deepEqual(
          await overview.locator('[data-finance-lane] h3').allTextContents(),
          ['销售与出货', '采购与仓库', '委外与生产']
        )
        for (const key of ['sales', 'purchase', 'outsourcing']) {
          await expect(
            overview.locator(`[data-finance-lane="${key}"] [data-finance-node]`)
          ).toHaveCount(4)
        }
        await expect(
          overview.getByRole('button', {
            name: '采购退货与数量差额',
            exact: true,
          })
        ).toBeVisible()
        await expect(
          overview.getByRole('button', { name: '月结与期间对账', exact: true })
        ).toBeVisible()
        await expect(
          overview.getByRole('button', {
            name: '审批、权限与凭据',
            exact: true,
          })
        ).toBeVisible()
        for (const width of [1920, 1280, 1024]) {
          await page.setViewportSize({ width, height: 1080 })
          await assertNoHorizontalOverflow(page)
          const rows = await overview
            .locator('[data-finance-lane]')
            .evaluateAll((lanes) =>
              lanes.map((lane) =>
                [...lane.querySelectorAll('[data-finance-node]')].map(
                  (node) => {
                    const r = node.getBoundingClientRect()
                    return {
                      x: r.x,
                      y: r.y,
                      width: r.width,
                      clipped: node.scrollWidth > node.clientWidth + 1,
                    }
                  }
                )
              )
            )
          for (const row of rows) {
            assert(
              row.every(
                (box) => !box.clipped && Math.abs(box.y - row[0].y) <= 1
              ),
              '同一业务链四个步骤同排且文字不裁切'
            )
          }
          for (let column = 0; column < 4; column += 1) {
            assert(
              rows.every(
                (row) =>
                  Math.abs(row[column].x - rows[0][column].x) <= 1 &&
                  Math.abs(row[column].width - rows[0][column].width) <= 1
              ),
              '三条链的对应步骤列对齐'
            )
          }
        }
        const initialURL = page.url()
        const historyLength = await page.evaluate(() => history.length)
        const overviewBox = await overview.boundingBox()
        for (const key of await overview
          .locator('[data-finance-lane] [data-finance-node]')
          .evaluateAll((nodes) =>
            nodes.map((node) => node.dataset.financeNode)
          )) {
          const node = overview.locator(`[data-finance-node="${key}"]`)
          await node.click()
          await expect(page.locator(`#finance-note-${key}`)).toBeVisible()
          assert.equal(page.url(), initialURL, '步骤说明不改变 URL')
          assert.deepEqual(
            await overview.boundingBox(),
            overviewBox,
            '步骤说明不挤动总览'
          )
          await node.press('Escape')
          await expect(node).toHaveAttribute('aria-expanded', 'false')
          await expect(node).toBeFocused()
        }
        await overview
          .getByRole('button', { name: '采购退货与数量差额', exact: true })
          .click()
        const detail = page.locator('[data-finance-detail="purchase"]')
        await expect(detail).toBeVisible()
        await expect(overview).toBeVisible()
        await detail.getByText('草稿', { exact: true }).click()
        await expect(detail).toContainText('先取消冻结来源的草稿')
        await detail.locator('[data-finance-node="purchase-2"]').click()
        await expect(
          detail.locator('[data-finance-node="purchase-2"]')
        ).toHaveAttribute('aria-pressed', 'true')
        assert.equal(
          await page.evaluate(() => history.length),
          historyLength,
          '查阅操作不堆积返回历史'
        )
        await page.reload()
        await expect(
          detail.locator('[data-finance-node="purchase-2"]')
        ).toHaveAttribute('aria-pressed', 'true')
        const drawer = page.locator('.erp-dev-finance-drawer')
        const nav = drawer.getByRole('tablist', { name: '财务专题内容' })
        await waitForFiniteAnimations(page, { selector: '.erp-dev-finance-drawer' })
        const navBox = await nav.boundingBox()
        const close = drawer.getByRole('button', { name: '关闭', exact: true })
        const closeBox = await close.boundingBox()
        await detail.getByRole('button', { name: '查看采购差额规则' }).click()
        await expect(drawer.locator('[data-finance-rules]')).toBeVisible()
        assert.equal(new URL(page.url()).searchParams.get('view'), 'chain')
        assert.deepEqual(await nav.boundingBox(), navBox, '侧栏页签不移动')
        assert.deepEqual(
          await close.boundingBox(),
          closeBox,
          '关闭入口位置固定'
        )
        await expect(drawer.locator('a[href]')).toHaveCount(0)
        await close.click()
        await expect(drawer).toBeHidden()
        await expect(overview).toBeVisible()
        await overview
          .getByRole('button', { name: '月结与期间对账', exact: true })
          .click()
        await drawer
          .getByRole('button', {
            name: '月结到期日 中国自然月月末 ＋ 约定天数',
          })
          .click()
        await expect(drawer.locator('[data-finance-rules]')).toContainText(
          '到期时间以服务端冻结记录为准'
        )
        await expect(overview).toBeVisible()
        await close.click()
        await expect(
          overview.getByRole('button', { name: '月结与期间对账', exact: true })
        ).toBeFocused()
        await assertNoHorizontalOverflow(page)
        assert.deepEqual(writes.get(page), [], '财务阅读与关系页没有业务写入')
      },
    },
    {
      name: 'dev-finance-rules-reading-desktop',
      path: '/__dev/business-rules?view=finance_rules&finance_rule=sources',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: (page) => startNoWriteAudit(page, writes),
      verify: async (page) => {
        const rules = page.locator('[data-finance-rules]')
        await expect(rules).toContainText('来源缺失或冲突时拒绝')
        await expect(rules).toContainText('重复请求复用原草稿')
        await expect(rules).toContainText('六位小数')
        await expect(rules).toContainText('清空单价同步清空金额')
        await expect(rules).toContainText('不把未知金额补成零')
        const selector = page.locator('.ant-select').filter({
          has: page.getByRole('combobox', { name: '财务口径类型', exact: true }),
        })
        for (const rule of FINANCE_RULES) {
          await selector.locator('.ant-select-selector').click()
          await page.locator('.ant-select-dropdown:visible').getByText(rule.label, { exact: true }).click()
          await expect(rules.getByRole('region', { name: rule.label, exact: true })).toBeVisible()
          await expect(rules.locator('[data-source-reference]')).toHaveCount(0)
          await expect(rules).not.toContainText(/Test[A-Z]|规则依据与验证|查看规则依据/u)
          if (rule.key === 'corrections') {
            await expect(rules).toContainText('核销不得超过当前可用余额')
            await expect(rules).toContainText('取消或冲销失败整体回滚')
          }
          await assertNoHorizontalOverflow(page, rule.label)
        }
        await selector.locator('.ant-select-selector').click()
        await page.locator('.ant-select-dropdown:visible').getByText('来源与金额', { exact: true }).click()
        for (const width of [1024, 1280, 1920]) {
          await page.setViewportSize({ width, height: 1080 })
          await assertNoHorizontalOverflow(page, `财务规则 ${width}`)
        }
        assert.deepEqual(writes.get(page), [], '财务规则阅读没有业务写入')
      },
    },
  ]
}
