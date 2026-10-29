import fs from 'node:fs/promises'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import {
  DEV_WORKSPACE_NAV_ITEMS,
  DEV_SECONDARY_NAV_ITEMS,
} from '../../src/dev-workbench/config/devRoutes.mjs'

export async function measureReadability(page) {
  return page.evaluate(() => {
    const visible = (node) => {
      const rect = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        !node.closest('[aria-hidden="true"], [hidden], svg, canvas, iframe')
      )
    }
    const identify = (node) => ({
      text: (node.innerText || node.getAttribute('aria-label') || '')
        .trim()
        .slice(0, 70),
      selector: `${node.tagName.toLowerCase()}.${[...node.classList].join('.')}`,
    })
    const smallText = [...document.body.querySelectorAll('*')]
      .filter(
        (node) =>
          visible(node) &&
          [...node.childNodes].some(
            (child) =>
              child.nodeType === Node.TEXT_NODE && child.textContent.trim()
          )
      )
      .map((node) => ({
        ...identify(node),
        font: parseFloat(getComputedStyle(node).fontSize),
      }))
      .filter((node) => node.font > 0 && node.font < 14)
    const smallTargets = [
      ...document.querySelectorAll(
        'button, summary, [role="tab"], [role="option"], [role="menuitem"], .ant-segmented-item-label, .erp-dev-workspace-nav a'
      ),
    ]
      .filter((node) => visible(node) && !node.disabled)
      .map((node) => ({
        ...identify(node),
        width: node.getBoundingClientRect().width,
        iconOnly: node.classList.contains('ant-btn-icon-only'),
        height: (node.closest('.ant-tabs-tab') || node).getBoundingClientRect()
          .height,
      }))
      .filter(
        (node) => node.height < 43.5 || (node.iconOnly && node.width < 43.5)
      )
    return { smallText, smallTargets }
  })
}

export function createReadabilityScenarios({
  assert,
  assertNoHorizontalOverflow,
  customerRuntimeEffectiveSession,
  outputDir,
  path,
}) {
  const check = async (page, name) => {
    await waitForFiniteAnimations(page)
    const metrics = await measureReadability(page)
    await fs.writeFile(
      path.join(outputDir, `${name}.json`),
      JSON.stringify(metrics, null, 2)
    )
    await assertNoHorizontalOverflow(page, name)
    assert.deepEqual(metrics.smallText, [], `${name} 阅读文字至少 14px`)
    assert.deepEqual(metrics.smallTargets, [], `${name} 操作区域至少 44px 高`)
  }
  return [
    ...['light', 'dark'].map((themeMode) => ({
      name: `mobile-readability-login-${themeMode}`,
      path: '/admin-login',
      mockAdminRpc: true,
      themeMode,
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await page.locator('#password').waitFor()
        for (const width of [320, 390, 430]) {
          await page.setViewportSize({ width, height: 844 })
          await check(page, `mobile-readability-login-${themeMode}-${width}`)
        }
      },
    })),
    {
      name: 'mobile-readability-image-failure',
      path: '/erp/master/products',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 390, height: 844 },
      beforeNavigate: async (page) => {
        await page.route('**/rpc/attachment', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          if (method === 'list_product_image_references') {
            return route.fulfill({
              json: {
                jsonrpc: '2.0',
                id,
                result: {
                  code: 0,
                  data: {
                    images: params.product_ids.map((productID) => ({
                      product_id: productID,
                      image_attachment_id: 900000 + productID,
                    })),
                  },
                },
              },
            })
          }
          if (method === 'download_attachment') {
            return route.fulfill({
              json: {
                jsonrpc: '2.0',
                id,
                result: { code: 500, message: '图片暂不可用' },
              },
            })
          }
          return route.fallback()
        })
      },
      verify: async (page) => {
        const placeholder = page
          .locator('.erp-task-product-image[data-image-state="failed"]')
          .first()
        await placeholder.waitFor()
        for (const width of [320, 390, 430]) {
          await page.setViewportSize({ width, height: 844 })
          const metrics = await placeholder.evaluate((node) => {
            const box = node.getBoundingClientRect()
            const label = node.querySelector(
              '.erp-task-product-image__placeholder > span:last-child'
            )
            const text = label.getBoundingClientRect()
            return {
              font: parseFloat(getComputedStyle(label).fontSize),
              top: text.top - box.top,
              bottom: box.bottom - text.bottom,
            }
          })
          assert(
            metrics.font >= 14 && metrics.top >= 0 && metrics.bottom >= 0,
            `图片失败说明清楚且完整：${JSON.stringify(metrics)}`
          )
          await assertNoHorizontalOverflow(
            page,
            `mobile-readability-image-failure-${width}`
          )
        }
      },
    },
    ...['light', 'dark'].map((themeMode) => ({
      name: `mobile-readability-business-form-${themeMode}`,
      path: '/erp/master/partners/customers',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      themeMode,
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await page.getByRole('button', { name: '新建客户' }).click()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor
          .getByRole('heading', { name: '新建客户档案', exact: true })
          .waitFor()
        await check(page, `mobile-readability-business-form-${themeMode}`)
        await editor
          .getByRole('button', { name: '返回列表', exact: true })
          .click()
        await page.getByRole('button', { name: '新建客户' }).waitFor()
      },
    })),
    ...['light', 'dark'].map((themeMode) => ({
      name: `mobile-readability-${themeMode}`,
      path: '/m/boss/tasks',
      auth: 'admin',
      themeMode,
      effectiveSession: customerRuntimeEffectiveSession,
      workflowTaskFixtures: Array.from({ length: 12 }, (_, index) => ({
        id: 8800 + index,
        version: 1,
        task_code: `TASK-READABILITY-${index + 1}`,
        task_name: `核对长名称材料采购订单的交期与到货说明 ${index + 1}`,
        task_group: 'material_check',
        owner_role_key: 'boss',
        task_status_key: index === 11 ? 'done' : 'blocked',
        source_type: 'sales_order',
        source_id: 1,
        source_no: 'SO-0001',
        created_at: 1788840000,
        payload: {},
        block_reason: '面料交期尚未确认，等待责任岗位补充到货日期',
      })),
      viewport: { width: 390, height: 844 },
      beforeNavigate: async (page) => {
        await page.route('**/rpc/workflow', (route) => {
          const { id, params } = route.request().postDataJSON()
          if (!params?.calendar_month) return route.fallback()
          return route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: {
                code: 0,
                data: {
                  calendar: {
                    month: params.calendar_month,
                    selection: params.calendar_selection,
                    days: {},
                    overdue: 0,
                    undated: 12,
                    total: 0,
                    offset: 0,
                    limit: 30,
                    items: [],
                  },
                },
              },
            }),
          })
        })
      },
      verify: async (page) => {
        await page.getByTestId('mobile-role-nav-tasks').click()
        await page.locator('.mobile-task-list-row').first().waitFor()
        for (const width of [320, 390, 430]) {
          await page.setViewportSize({ width, height: 844 })
          await check(page, `mobile-readability-${themeMode}-tasks-${width}`)
        }
        await page.setViewportSize({ width: 320, height: 844 })
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '20px'
        })
        await check(page, `mobile-readability-${themeMode}-larger-text`)
        await page.evaluate(() => {
          document.documentElement.style.fontSize = ''
        })
        await page
          .locator('[aria-label="待办显示方式"]')
          .getByText('日历', { exact: true })
          .click()
        await page
          .getByRole('region', { name: '待办日历', exact: true })
          .waitFor()
        await page
          .locator('.workflow-task-calendar__agenda[aria-busy="false"]')
          .waitFor()
        await check(page, `mobile-readability-${themeMode}-calendar`)
        await page
          .locator('[aria-label="待办显示方式"]')
          .getByText('列表', { exact: true })
          .click()
        await page.locator('.mobile-task-list-row').first().waitFor()
        await page.setViewportSize({ width: 390, height: 844 })
        await page.getByTestId('mobile-task-list-filter-trigger').click()
        await page
          .getByRole('dialog', { name: '筛选任务', exact: true })
          .waitFor()
        await check(page, `mobile-readability-${themeMode}-filters`)
        await page.keyboard.press('Escape')
        await page
          .getByRole('dialog', { name: '筛选任务', exact: true })
          .waitFor({ state: 'hidden' })
        await page.locator('.mobile-task-list-row').first().click()
        await page.locator('.mobile-role-tasks-page--detail').waitFor()
        await check(page, `mobile-readability-${themeMode}-detail`)
        await page.screenshot({
          path: path.join(
            outputDir,
            `mobile-readability-${themeMode}-detail.png`
          ),
        })
        await page.goBack()
        await page.getByTestId('mobile-role-nav-tasks').waitFor()
        for (const tab of ['progress', 'messages', 'mine']) {
          await page.getByTestId(`mobile-role-nav-${tab}`).click()
          await check(page, `mobile-readability-${themeMode}-${tab}`)
        }
      },
    })),
    ...[...DEV_WORKSPACE_NAV_ITEMS, ...DEV_SECONDARY_NAV_ITEMS].flatMap(
      (item) =>
        (['overview', 'status-flows', 'testing'].includes(item.key)
          ? ['light', 'dark']
          : ['light']
        ).map((themeMode) => ({
          name: `dev-readability-${item.key}-desktop${themeMode === 'dark' ? '-dark' : ''}`,
          themeMode,
          path: item.route,
          viewport: { width: 1440, height: 900 },
          verify: async (page) => {
            await page.locator('.erp-dev-workspace-page > header').waitFor()
            for (const width of [1280, 1440]) {
              await page.setViewportSize({ width, height: 900 })
              await waitForFiniteAnimations(page)
              const metrics = await measureReadability(page)
              await fs.writeFile(
                path.join(
                  outputDir,
                  `dev-readability-${item.key}-${themeMode}-${width}.json`
                ),
                JSON.stringify(metrics, null, 2)
              )
              await assertNoHorizontalOverflow(
                page,
                `dev-readability-${item.key}-${width}`
              )
              assert.deepEqual(
                metrics.smallText,
                [],
                `${item.label} 桌面阅读文字至少 14px`
              )
            }
            if (item.key === 'overview') {
              assert.equal(await page.getByRole('button', { name: '查看产品能力来源与边界', exact: true }).count(), 0)
            }
          },
        }))
    ),
  ]
}
