import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { createDashboardTaskScenarios } from './dashboardTaskScenarios.mjs'
import { createAuditLogScenarios } from './auditLogScenarios.mjs'
import { createDevVersionCenterScenarios } from './devVersionCenterScenarios.mjs'
import { createDevQualityGateScenarios } from './devQualityGateScenarios.mjs'

async function setDensity(page, label) {
  await page.getByRole('button', { name: '外观与密度', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '外观与密度' })
  await dialog.getByText('表格密度', { exact: true }).waitFor()
  await dialog.getByText(label, { exact: true }).click()
  await dialog
    .locator('.ant-modal-footer')
    .getByRole('button', { name: '关闭', exact: true })
    .click()
  await dialog.waitFor({ state: 'hidden' })
  await waitForFiniteAnimations(page)
}

async function measure(row) {
  await row.waitFor()
  return row.evaluate((node) => ({
    height: node.getBoundingClientRect().height,
    padding: [...node.children].map((cell) =>
      Number.parseFloat(getComputedStyle(cell).paddingTop)
    ),
    controls: [...node.querySelectorAll('input, textarea, button, .ant-select')]
      .filter((control) => control.getBoundingClientRect().width > 0)
      .map((control) => ({
        height: control.getBoundingClientRect().height,
        value: control.value ?? control.textContent,
      })),
  }))
}

export function createTableDensityScenarios(deps) {
  const { customerRuntimeEffectiveSession, outputDir } = deps
  const roundTrip = async (page, selector, name, hooks = {}) => {
    const samples = []
    for (const label of ['标准', '紧凑', '标准']) {
      await setDensity(page, label)
      await hooks.open?.()
      const row = page.locator(`${selector}:visible`).first()
      await waitForFiniteAnimations(page)
      samples.push(await measure(row))
      if (label === '紧凑') {
        await page.screenshot({ path: `${outputDir}/${name}-compact.png` })
      }
      await hooks.close?.()
    }
    const [standard, compact, restored] = samples
    assert.ok(
      compact.height < standard.height,
      `${name}: ${JSON.stringify(samples)}`
    )
    assert.ok(compact.height >= 42, `${name}: 内容高度不得被强制截断`)
    assert.ok(
      compact.padding.some(
        (padding, index) => padding < standard.padding[index]
      ),
      `${name}: 表格单元格留白应随密度变化`
    )
    assert.deepEqual(
      compact.controls,
      standard.controls,
      `${name}: 控件尺寸和值应保留`
    )
    assert.deepEqual(restored, standard, `${name}: 恢复标准密度应无残留`)
    await writeFile(
      `${outputDir}/${name}-metrics.json`,
      JSON.stringify(samples, null, 2)
    )
  }
  const business = {
    auth: 'admin',
    effectiveSession: customerRuntimeEffectiveSession,
    viewport: { width: 1440, height: 1000 },
  }
  const task = createDashboardTaskScenarios(deps).find(
    (scenario) => scenario.name === 'erp-task-board-desktop'
  )
  const audit = createAuditLogScenarios(deps).find(
    (scenario) => scenario.name === 'system-audit-logs-desktop'
  )
  const version = createDevVersionCenterScenarios(deps)[0]
  const quality = createDevQualityGateScenarios(deps).find(
    (scenario) => scenario.name === 'dev-quality-gates-desktop-light'
  )
  return [
    ...['light', 'dark'].map((themeMode) => ({
      ...business,
      name: `table-density-permissions-${themeMode}`,
      path: '/erp/system/permissions',
      themeMode,
      verify: async (page) => {
        await roundTrip(
          page,
          '.erp-permission-matrix__row',
          `density-matrix-${themeMode}`
        )
        await page.getByRole('tab', { name: /员工账号/ }).click()
        await roundTrip(
          page,
          '.erp-permission-section--admins tbody tr[data-row-key]',
          `density-accounts-${themeMode}`
        )
        await page.getByRole('tab', { name: /审批责任/ }).click()
        await roundTrip(
          page,
          '.erp-approval-responsibility__table tbody tr[data-row-key]',
          `density-approvals-${themeMode}`
        )
      },
    })),
    {
      ...task,
      name: 'table-density-task-board',
      path: '/erp/task-board?lane=actionable',
      verify: async (page) => {
        await roundTrip(
          page,
          '.erp-task-board-lane--focused tbody tr[data-row-key]',
          'density-task-board'
        )
      },
    },
    {
      ...business,
      name: 'table-density-edit-lines',
      path: '/erp/sales/project-orders/sales-orders',
      verify: async (page) => {
        await page.getByRole('button', { name: '新建订单' }).click()
        const form = page.locator('.erp-business-form-page:not([hidden])')
        await form
          .getByRole('button', { name: '添加订货明细', exact: true })
          .click()
        await form
          .getByLabel('订货产品名称', { exact: true })
          .fill('长文本产品名称，切换密度后应保留已填写内容')
        await roundTrip(
          page,
          '.erp-line-item-table tbody tr:not(.erp-line-item-table__more-row)',
          'density-edit-lines'
        )
      },
    },
    {
      ...business,
      name: 'table-density-bom',
      path: '/erp/purchase/material-bom',
      verify: async (page) => {
        await page.getByText('BOM-STYLE-DRAFT', { exact: true }).dblclick()
        await page
          .getByLabel('部位 1', { exact: true })
          .first()
          .fill('长文本部位名称，切换后保留')
        await roundTrip(
          page,
          '.erp-bom-parts-table tr[data-bom-part-index]',
          'density-bom'
        )
      },
    },
    {
      ...business,
      name: 'table-density-contacts',
      path: '/erp/master/partners/customers',
      verify: async (page) => {
        await page.getByRole('button', { name: '新建客户' }).click()
        await page
          .locator('.erp-contact-editor')
          .getByLabel('联系人', { exact: true })
          .fill('密度验证联系人')
        await roundTrip(
          page,
          '.erp-contact-editor__table .erp-contact-editor__fields',
          'density-contacts'
        )
      },
    },
    {
      ...audit,
      name: 'table-density-audit-changes',
      verify: async (page) => {
        await roundTrip(
          page,
          '.erp-audit-record-detail__changes tbody tr',
          'density-audit-changes',
          {
            open: () =>
              page.getByRole('button', { name: '查看变化' }).first().click(),
            close: () =>
              page
                .locator('.erp-audit-detail-drawer .ant-drawer-close')
                .click(),
          }
        )
      },
    },
    {
      ...version,
      name: 'table-density-dev-versions',
      verify: async (page) => {
        await roundTrip(
          page,
          '.erp-dev-version-workspace tbody tr[data-row-key]',
          'density-dev-versions'
        )
        await page.getByRole('tab', { name: '操作记录', exact: true }).click()
        await roundTrip(
          page,
          '.erp-dev-version-workspace tbody tr[data-row-key]',
          'density-dev-operations'
        )
      },
    },
    {
      ...quality,
      name: 'table-density-dev-quality',
      verify: async (page) => {
        const views = page.locator('[aria-label="服务器门禁详情"]')
        await views.getByText('Job 性能', { exact: true }).click()
        await roundTrip(
          page,
          '.erp-dev-quality-server-performance__table tbody tr',
          'density-dev-performance'
        )
        await views.getByText('CI 历史', { exact: true }).click()
        await roundTrip(
          page,
          '.erp-dev-quality-server-history__table tbody tr',
          'density-dev-history'
        )
      },
    },
    {
      name: 'table-density-dev-product-core',
      path: '/__dev/product-core',
      viewport: { width: 1440, height: 1000 },
      verify: async (page) => {
        await roundTrip(
          page,
          '.erp-dev-product-core-table tbody tr',
          'density-dev-product-core'
        )
      },
    },
  ]
}
