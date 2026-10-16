import process from 'node:process'

import { RpcErrorCode } from '../../src/common/consts/errorCodes.generated.js'

import { createBusinessFormalAssertions } from './businessFormalAssertions.mjs'

export function createSourceDocumentReadRecoveryScenarios(deps) {
  const {
    assert,
    closeBusinessFormModal,
    expectHeading,
    expectText,
    outputDir,
    path,
    customerRuntimeEffectiveSession,
  } = deps
  const { findSelectionActionButton } = createBusinessFormalAssertions(deps)
  return [
    (() => {
      let consoleErrors = []
      let itemReadCalls = 0
      let pageErrors = []
      let rpcMethods = []
      let saveCalls = 0
      return {
        name: 'source-document-edit-items-read-failure-fail-closed',
        path: '/erp/sales/project-orders/sales-orders',
        auth: 'admin',
        effectiveSession: customerRuntimeEffectiveSession,
        viewport: { width: 1440, height: 900 },
        beforeNavigate: async (page) => {
          consoleErrors = []
          itemReadCalls = 0
          pageErrors = []
          rpcMethods = []
          saveCalls = 0
          page.on('console', (message) => {
            if (message.type() === 'error') consoleErrors.push(message.text())
          })
          page.on('pageerror', (error) => pageErrors.push(error.message))
          await page.route('**/rpc/sales_order', async (route) => {
            const body = route.request().postDataJSON() || {}
            const { id = 'mock-id', method } = body
            if (method) rpcMethods.push(method)
            if (method === 'list_sales_order_items') {
              itemReadCalls += 1
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id,
                  result: {
                    code: RpcErrorCode.INTERNAL,
                    message: '销售订单明细暂时无法加载',
                    data: {},
                  },
                }),
              })
              return
            }
            if (method === 'save_sales_order_with_items') saveCalls += 1
            await route.fallback()
          })
        },
        verify: async (page) => {
          await expectHeading(page, '销售订单')
          await expectText(page, 'SO-STYLE-L1')
          await page.getByText('SO-STYLE-L1', { exact: false }).first().click()
          await (await findSelectionActionButton(page, '编辑订单')).click()
          await expectText(page, '未进入编辑')
          const failureNotice = page
            .getByText('未进入编辑', { exact: false })
            .first()
          await failureNotice.screenshot({
            path: path.resolve(
              outputDir,
              'source-document-edit-items-read-failure-fail-closed-message.png'
            ),
          })
          await page.screenshot({
            path: path.resolve(
              outputDir,
              'source-document-edit-items-read-failure-fail-closed-visible.png'
            ),
            fullPage: true,
          })

          const metrics = await page.evaluate(() => {
            const isVisible = (node) => {
              if (!(node instanceof HTMLElement)) return false
              const rect = node.getBoundingClientRect()
              const style = window.getComputedStyle(node)
              return (
                rect.width > 0 &&
                rect.height > 0 &&
                style.display !== 'none' &&
                style.visibility !== 'hidden'
              )
            }
            const visibleEditModals = Array.from(
              document.querySelectorAll(
                '.ant-modal, .erp-business-form-page:not([hidden])'
              )
            ).filter(
              (node) =>
                isVisible(node) &&
                String(node.textContent || '').includes('编辑销售订单')
            )
            const visibleLineRows = Array.from(
              document.querySelectorAll('.erp-sales-order-lines-form__row')
            ).filter(isVisible)
            return {
              visibleEditModalCount: visibleEditModals.length,
              visibleLineRowCount: visibleLineRows.length,
            }
          })
          const evidence = {
            ...metrics,
            consoleErrors,
            itemReadCalls,
            pageErrors,
            rpcMethods,
            saveCalls,
          }
          assert.equal(
            metrics.visibleEditModalCount,
            0,
            `明细读取失败后不得打开编辑弹窗: ${JSON.stringify(evidence)}`
          )
          assert.equal(
            metrics.visibleLineRowCount,
            0,
            `明细读取失败后不得生成可保存空行: ${JSON.stringify(evidence)}`
          )
          assert.equal(
            itemReadCalls,
            1,
            `编辑入口应且只应读取一次完整明细: ${JSON.stringify(evidence)}`
          )
          assert.equal(
            saveCalls,
            0,
            `明细读取失败后不得调用聚合保存: ${JSON.stringify(evidence)}`
          )
          assert.deepEqual(
            consoleErrors,
            [],
            `明细读取失败不应产生控制台错误: ${JSON.stringify(evidence)}`
          )
          assert.deepEqual(
            pageErrors,
            [],
            `明细读取失败不应产生页面错误: ${JSON.stringify(evidence)}`
          )
          process.stdout.write(
            `[style:l1] source-document-edit-items-read-failure-fail-closed evidence=${JSON.stringify(
              evidence
            )}\n`
          )
        },
      }
    })(),
    (() => {
      let consoleErrors = []
      let itemReadCalls = 0
      let itemRequestStarted
      let lateResponseFinished
      let lateRouteOutcome = ''
      let pageErrors = []
      let releaseLateResponse
      let resolveItemRequestStarted
      let resolveLateResponseFinished
      let rpcMethods = []
      let saveCalls = 0
      return {
        name: 'source-document-open-edit-race-new-document-wins',
        path: '/erp/sales/project-orders/sales-orders',
        auth: 'admin',
        effectiveSession: customerRuntimeEffectiveSession,
        viewport: { width: 1440, height: 900 },
        beforeNavigate: async (page) => {
          consoleErrors = []
          itemReadCalls = 0
          lateRouteOutcome = ''
          pageErrors = []
          rpcMethods = []
          saveCalls = 0
          itemRequestStarted = new Promise((resolve) => {
            resolveItemRequestStarted = resolve
          })
          const releaseResponse = new Promise((resolve) => {
            releaseLateResponse = resolve
          })
          lateResponseFinished = new Promise((resolve) => {
            resolveLateResponseFinished = resolve
          })
          page.on('console', (message) => {
            if (message.type() === 'error') consoleErrors.push(message.text())
          })
          page.on('pageerror', (error) => pageErrors.push(error.message))
          await page.route('**/rpc/sales_order', async (route) => {
            const body = route.request().postDataJSON() || {}
            const { method } = body
            if (method) rpcMethods.push(method)
            if (method === 'list_sales_order_items') {
              itemReadCalls += 1
              resolveItemRequestStarted()
              await releaseResponse
              try {
                await route.fallback()
                lateRouteOutcome = 'fulfilled-after-new'
              } catch (error) {
                lateRouteOutcome = `request-canceled-after-new:${String(
                  error?.message || error
                )}`
              } finally {
                resolveLateResponseFinished()
              }
              return
            }
            if (method === 'save_sales_order_with_items') saveCalls += 1
            await route.fallback()
          })
        },
        verify: async (page) => {
          await expectHeading(page, '销售订单')
          await expectText(page, 'SO-STYLE-L1')
          await page.getByText('SO-STYLE-L1', { exact: false }).first().click()
          await (await findSelectionActionButton(page, '编辑订单')).click()
          await itemRequestStarted

          await page.getByRole('button', { name: '新建订单' }).click()
          const newOrderDialog = page
            .locator('.erp-business-form-page:not([hidden])')
            .filter({ hasText: '新建销售订单' })
            .last()
          await newOrderDialog
            .getByText('新建销售订单', { exact: true })
            .waitFor()
          const retainedNote = '竞态期间填写的新订单备注'
          await newOrderDialog
            .getByLabel('备注', { exact: true })
            .first()
            .fill(retainedNote)

          releaseLateResponse()
          await lateResponseFinished
          await page.waitForTimeout(100)

          const metrics = await newOrderDialog.evaluate((dialog) => {
            const visibleLineRows = Array.from(
              dialog.querySelectorAll('.erp-sales-order-lines-form__row')
            ).filter((node) => {
              const rect = node.getBoundingClientRect()
              const style = window.getComputedStyle(node)
              return (
                rect.width > 0 &&
                rect.height > 0 &&
                style.display !== 'none' &&
                style.visibility !== 'hidden'
              )
            })
            return {
              dialogText: String(dialog.textContent || ''),
              visibleLineRowCount: visibleLineRows.length,
            }
          })
          const noteValue = await newOrderDialog
            .getByLabel('备注', { exact: true })
            .first()
            .inputValue()
          const staleFailureNotices = await page
            .getByText('未进入编辑', { exact: false })
            .count()
          const evidence = {
            consoleErrors,
            itemReadCalls,
            lateRouteOutcome,
            noteValue,
            pageErrors,
            rpcMethods,
            saveCalls,
            staleFailureNotices,
            visibleLineRowCount: metrics.visibleLineRowCount,
          }

          assert(
            metrics.dialogText.includes('新建销售订单') &&
              !metrics.dialogText.includes('编辑销售订单'),
            `迟到编辑响应不得覆盖新建身份: ${JSON.stringify(evidence)}`
          )
          assert.equal(
            noteValue,
            retainedNote,
            `迟到编辑响应不得覆盖新建表单值: ${JSON.stringify(evidence)}`
          )
          assert.equal(
            metrics.dialogText.includes('样式产品'),
            false,
            `迟到编辑响应不得注入旧订单行: ${JSON.stringify(evidence)}`
          )
          assert.equal(
            metrics.visibleLineRowCount,
            0,
            `新建草稿应保持无明细，不能被迟到响应注入旧行: ${JSON.stringify(evidence)}`
          )
          assert.equal(
            lateRouteOutcome,
            'fulfilled-after-new',
            JSON.stringify(evidence)
          )
          assert.equal(itemReadCalls, 1, JSON.stringify(evidence))
          assert.equal(saveCalls, 0, JSON.stringify(evidence))
          assert.equal(staleFailureNotices, 0, JSON.stringify(evidence))
          assert.deepEqual(consoleErrors, [], JSON.stringify(evidence))
          assert.deepEqual(pageErrors, [], JSON.stringify(evidence))

          await page.screenshot({
            path: path.resolve(
              outputDir,
              'source-document-open-edit-race-new-document-wins-visible.png'
            ),
            fullPage: true,
          })
          await closeBusinessFormModal(page, newOrderDialog)
          process.stdout.write(
            `[style:l1] source-document-open-edit-race-new-document-wins evidence=${JSON.stringify(
              evidence
            )}\n`
          )
        },
      }
    })(),
  ]
}
