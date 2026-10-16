import { stylePaginatedRpcData } from './rpcMockResult.mjs'

import { createBusinessFormalAssertions } from './businessFormalAssertions.mjs'
import { createShipmentFinanceApprovalTaskFixture } from './shipmentApprovalFixtures.mjs'

export function createShipmentReleasePermissionScenarios(deps) {
  const {
    assert,
    assertNoHorizontalOverflow,
    assertTextAbsent,
    expectHeading,
    expectText,
    customerRuntimeEffectiveSession,
  } = deps
  const {
    assertBusinessCollaborationPanelAbsent,
    assertUnifiedListToolbarShell,
  } = createBusinessFormalAssertions(deps)
  return [
    {
      name: 'business-formal-shipping-release-no-permission-desktop',
      path: '/erp/warehouse/shipping-release',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      adminProfile: {
        username: 'style-l1-no-workflow-read',
        is_super_admin: false,
        roles: [{ role_key: 'warehouse', name: '仓库' }],
        permissions: ['erp.workbench.read'],
        menus: [
          {
            key: 'shipping-release',
            label: '出货放行',
            path: '/erp/warehouse/shipping-release',
            required_any: [],
            required_all: [],
          },
        ],
        erp_preferences: {
          column_orders: {},
        },
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: ['shipping-release'],
        actions: [],
      },
      verify: async (page) => {
        let shippingReleaseListTaskCalls = 0
        await page.route('**/rpc/workflow', async (route) => {
          const body = route.request().postDataJSON() || {}
          if (
            body.method === 'list_tasks' &&
            body.params?.source_type === 'shipping-release'
          ) {
            shippingReleaseListTaskCalls += 1
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: body.id || 'formal-shipping-release-no-permission-list',
                result: {
                  code: 0,
                  message: 'OK',
                  data: {
                    tasks: [],
                    total: 0,
                    limit: 100,
                    offset: 0,
                  },
                },
              }),
            })
            return
          }
          await route.fallback()
        })

        await expectHeading(page, '放行审批')
        await assertTextAbsent(page, '业务处理分开完成')
        await assertBusinessCollaborationPanelAbsent(
          page,
          'business-formal-shipping-release-no-permission-desktop'
        )
        await assertTextAbsent(page, '发起放行协同')
        await assertUnifiedListToolbarShell(page, {
          scenarioName:
            'business-formal-shipping-release-no-permission-desktop',
          exportVisible: false,
        })
        await expectText(page, '当前账号不能查看此类任务。')
        await page.getByRole('button', { name: '刷新当前页' }).click()
        assert.equal(
          shippingReleaseListTaskCalls,
          0,
          '无 workflow.task.read 时出货放行页不应调用 list_tasks 拉取审批任务'
        )
        await assertTextAbsent(page, '出货放行任务已刷新')
        await assertTextAbsent(page, '出货财务审批确认')
        await assertNoHorizontalOverflow(
          page,
          'business-formal-shipping-release-no-permission-desktop'
        )
      },
    },
  ]
}

export function createShipmentReleaseReadonlyScenarios(deps) {
  const {
    assert,
    assertNoHorizontalOverflow,
    assertTextAbsent,
    expectHeading,
    expectText,
    customerRuntimeEffectiveSession,
  } = deps
  const {
    assertBusinessCollaborationPanelAbsent,
    assertUnifiedListToolbarShell,
  } = createBusinessFormalAssertions(deps)
  return [
    (() => {
      let shippingReleaseListTaskCalls = 0
      let workflowWriteCalls = 0
      const readonlyShipmentReleaseTask =
        createShipmentFinanceApprovalTaskFixture({
          sourceID: 9201,
          taskID: 9201,
          processInstanceID: 19_201,
          processNodeInstanceID: 29_201,
          sourceNo: 'SHIP-REL-READONLY',
          taskName: '出货财务审批只读确认',
        })
      return {
        name: 'business-formal-shipping-release-readonly-actions-desktop',
        path: '/erp/warehouse/shipping-release',
        auth: 'admin',
        customerKey: 'yoyoosun',
        viewport: { width: 1440, height: 900 },
        adminProfile: {
          username: 'style-l1-workflow-readonly',
          is_super_admin: false,
          roles: [{ role_key: 'finance', name: '财务' }],
          permissions: ['erp.workbench.read', 'workflow.task.read'],
          menus: [
            {
              key: 'shipping-release',
              label: '出货放行',
              path: '/erp/warehouse/shipping-release',
              required_any: [],
              required_all: [],
            },
          ],
          erp_preferences: {
            column_orders: {},
          },
        },
        effectiveSession: {
          ...customerRuntimeEffectiveSession,
          pages: ['shipping-release'],
          actions: ['workflow.task.read'],
        },
        beforeNavigate: async (page) => {
          shippingReleaseListTaskCalls = 0
          workflowWriteCalls = 0
          await page.unroute('**/rpc/workflow')
          await page.route('**/rpc/workflow', async (route) => {
            const body = route.request().postDataJSON() || {}
            if (body.method === 'list_tasks') {
              shippingReleaseListTaskCalls += 1
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: body.id || 'formal-shipping-release-readonly-list',
                  result: {
                    code: 0,
                    message: 'OK',
                    data: stylePaginatedRpcData(
                      [readonlyShipmentReleaseTask],
                      'tasks',
                      body.params || {},
                      10
                    ),
                  },
                }),
              })
              return
            }
            if (body.method === 'explain_action_access') {
              const readonlyReason =
                '当前账号只有查看任务权限，没有完成、阻塞或催办权限。'
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id:
                    body.id || 'formal-shipping-release-readonly-action-access',
                  result: {
                    code: 0,
                    message: 'OK',
                    data: {
                      source_access: {
                        applicable: true,
                        resolved: true,
                        allowed: false,
                        reason_code: 'source_read_permission_missing',
                        reason:
                          '当前账号不能查看该任务的相关单据，因此不能办理；可催办责任人或联系管理员调整岗位权限。',
                      },
                      actions: [
                        {
                          action_key: 'complete',
                          allowed: false,
                          reason: readonlyReason,
                          reason_code: 'missing_workflow_write_permission',
                          required_permission: 'workflow.task.complete',
                          owner_role_key: 'finance',
                        },
                        {
                          action_key: 'block',
                          allowed: false,
                          reason: readonlyReason,
                          reason_code: 'missing_workflow_write_permission',
                          required_permission: 'workflow.task.update',
                          owner_role_key: 'finance',
                        },
                        {
                          action_key: 'reject',
                          allowed: false,
                          reason: readonlyReason,
                          reason_code: 'missing_workflow_write_permission',
                          required_permission: 'workflow.task.update',
                          owner_role_key: 'finance',
                        },
                        {
                          action_key: 'urge',
                          allowed: false,
                          reason: readonlyReason,
                          reason_code: 'missing_workflow_write_permission',
                          required_permission: 'workflow.task.update',
                          owner_role_key: 'finance',
                        },
                      ],
                    },
                  },
                }),
              })
              return
            }
            if (body.method === 'urge_task') {
              workflowWriteCalls += 1
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: body.id || 'formal-shipping-release-readonly-write',
                  result: {
                    code: 403001,
                    message: 'readonly workflow user cannot write tasks',
                    data: null,
                  },
                }),
              })
              return
            }
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: body.id || 'formal-shipping-release-readonly-fallback',
                result: {
                  code: 0,
                  message: 'OK',
                  data: {},
                },
              }),
            })
          })
        },
        verify: async (page) => {
          await expectHeading(page, '放行审批')
          const pageShell = await page.evaluate(() => ({
            path: location.pathname,
            workflowPageCount: document.querySelectorAll(
              '.erp-workflow-business-page'
            ).length,
            headings: Array.from(document.querySelectorAll('h1, h2, h3, h4'))
              .map((node) => String(node.textContent || '').trim())
              .filter(Boolean),
            buttons: Array.from(document.querySelectorAll('button'))
              .map((node) => String(node.textContent || '').trim())
              .filter(Boolean),
          }))
          assert.equal(
            pageShell.workflowPageCount,
            1,
            `只读出货放行场景必须进入正式 Workflow 页面: ${JSON.stringify(pageShell)}`
          )
          await assertBusinessCollaborationPanelAbsent(
            page,
            'business-formal-shipping-release-readonly-actions-desktop'
          )
          await assertUnifiedListToolbarShell(page, {
            scenarioName:
              'business-formal-shipping-release-readonly-actions-desktop',
            exportVisible: false,
          })
          await expectText(page, '出货财务审批只读确认')
          await expectText(page, 'SHIP-REL-READONLY')
          const readonlyShippingReleaseRow = page
            .locator('.ant-table-row')
            .filter({ hasText: '出货财务审批只读确认' })
            .first()
          await readonlyShippingReleaseRow
            .getByText('可执行', { exact: true })
            .waitFor({ state: 'visible' })
          await readonlyShippingReleaseRow.click()
          for (const actionLabel of [
            '完成任务',
            '标记阻塞',
            '退回任务',
            '催办',
          ]) {
            assert.equal(
              await page.getByRole('button', { name: actionLabel }).count(),
              0,
              `只读任务不应展示${actionLabel}动作`
            )
          }

          const readonlyMetrics = await page
            .locator('.ant-table-row')
            .filter({ hasText: '出货财务审批只读确认' })
            .first()
            .evaluate((node) => {
              const buttons = Array.from(node.querySelectorAll('button')).map(
                (button) => ({
                  text: String(button.textContent || '').trim(),
                  ariaLabel: button.getAttribute('aria-label') || '',
                  title: button.getAttribute('title') || '',
                  className: button.className,
                  actionKey:
                    button.getAttribute('data-business-action-key') || '',
                })
              )
              return {
                text: String(node.textContent || '')
                  .replace(/\s+/gu, ' ')
                  .trim(),
                buttons,
                scrollWidth: node.scrollWidth,
                clientWidth: node.clientWidth,
              }
            })
          const unexpectedRowButtons = readonlyMetrics.buttons.filter(
            (button) =>
              !String(button.className || '').includes(
                'erp-business-table-copyable-cell__button'
              )
          )
          assert(
            unexpectedRowButtons.length === 0,
            `出货放行只读表格行不应直接暴露动作按钮: ${JSON.stringify(
              readonlyMetrics
            )}`
          )
          assert(
            readonlyMetrics.scrollWidth <= readonlyMetrics.clientWidth + 1,
            `只读任务项出现横向溢出: ${JSON.stringify(readonlyMetrics)}`
          )
          assert(
            shippingReleaseListTaskCalls >= 1,
            '有 workflow.task.read 时出货放行页应允许读取协同任务'
          )
          assert.equal(workflowWriteCalls, 0, '只读协同任务不应触发 urge_task')
          await assertTextAbsent(page, '任务处理')
          await assertTextAbsent(page, '出货财务审批已完成')
          await assertNoHorizontalOverflow(
            page,
            'business-formal-shipping-release-readonly-actions-desktop'
          )
        },
      }
    })(),
  ]
}
