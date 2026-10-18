import {
  createWorkflowModuleSelectionFixtures,
  workflowModuleSelectionDefinitions,
} from './workflowModuleSelectionFixtures.mjs'
import { getContrastRatio, parseRgb } from './colorAssertions.mjs'
import { assertVisibleSearchPlaceholdersFit } from './inputControlAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

const taskActions = [
  'workflow.task.read',
  'workflow.task.complete',
  'workflow.task.approve',
  'workflow.task.update',
  'workflow.task.reject',
]

function scenarioIdentity(definition, effectiveSession, readonly = false) {
  const actions = readonly ? ['workflow.task.read'] : taskActions
  return {
    adminProfile: {
      username: `style-l1-${definition.key}-${readonly ? 'readonly' : 'handler'}`,
      is_super_admin: false,
      roles: [{ role_key: definition.role, name: definition.role }],
      permissions: ['erp.workbench.read', ...actions],
      menus: [
        {
          key: definition.key,
          label: definition.title,
          path: definition.path,
          required_any: [],
          required_all: [],
        },
      ],
    },
    effectiveSession: {
      ...effectiveSession,
      pages: [definition.key],
      actions,
      roles: [definition.role],
      workflow_visible_owner_role_keys_by_capability: Object.fromEntries(
        actions.map((key) => [key, [definition.role]])
      ),
    },
  }
}

const actionBar = (page) =>
  page.locator('.erp-business-module-current-action:visible')
const availableActions = (page) =>
  page.locator('.erp-business-module-current-action:visible, .erp-business-selection-action-menu:visible')
const taskRow = (page, id) =>
  page.locator(`.ant-table-tbody > tr[data-row-key="${id}"]`)
const taskAction = (page, action) =>
  actionBar(page).locator(
    `[data-business-action-key="workflow-task-${action}"]:visible`
  )

async function assertSelectedGeometry(page, assert, name) {
  const geometry = await actionBar(page).evaluate((bar) => {
    const actions = [
      ...bar.querySelectorAll(
        '.erp-business-selection-action-bar__record-actions button'
      ),
    ]
      .filter((button) => button.getBoundingClientRect().width > 0)
      .map((button) => {
        const rect = button.getBoundingClientRect()
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          height: rect.height,
        }
      })
    const rect = bar.getBoundingClientRect()
    return { height: rect.height, left: rect.left, right: rect.right, actions }
  })
  assert.ok(
    geometry.height <= 100,
    `${name}: long identity must stay within two compact rows: ${JSON.stringify(geometry)}`
  )
  assert.equal(
    new Set(geometry.actions.map((item) => Math.round(item.top))).size,
    1,
    `${name}: direct action buttons must stay on one row`
  )
  assert.ok(
    geometry.actions.every(
      (item) => item.left >= geometry.left && item.right <= geometry.right + 1
    ),
    `${name}: action buttons must stay inside the bar`
  )
  return geometry
}

async function closeDetails(page) {
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
}

export function createWorkflowModuleSelectionScenarios(deps) {
  const {
    assert,
    assertNoHorizontalOverflow,
    customerRuntimeEffectiveSession,
    outputDir,
    path,
  } = deps
  const fixtures = createWorkflowModuleSelectionFixtures()
  const scenarios = workflowModuleSelectionDefinitions.flatMap((definition) =>
    [1440, 1280].map((width) => {
      let releaseCompletion
      let completionGate
      let completionStarted
      let notifyCompletion
      let workflowWrites
      let factWrites
      const name = `business-selection-${definition.key}-${width}`
      const readyID = definition.taskBase + 1
      return {
        name,
        path: definition.path,
        auth: 'admin',
        customerKey: 'yoyoosun',
        viewport: { width, height: 1000 },
        workflowTaskFixtures: fixtures,
        ...scenarioIdentity(definition, customerRuntimeEffectiveSession),
        beforeNavigate: async (page) => {
          workflowWrites = []
          factWrites = []
          completionGate = new Promise((resolve) => {
            releaseCompletion = resolve
          })
          completionStarted = new Promise((resolve) => {
            notifyCompletion = resolve
          })
          page.on('request', (request) => {
            if (
              request.method() !== 'POST' ||
              !request.url().includes('/rpc/')
            ) {
              return
            }
            const body = request.postDataJSON() || {}
            if (
              !/^(?:list_|get_|explain_|resolve_|me$|version$|legal_notice_status$)/u.test(
                body.method || ''
              ) &&
              !request.url().endsWith('/rpc/workflow')
            ) {
              factWrites.push(body.method)
            }
          })
          await page.route('**/rpc/workflow', async (route) => {
            const body = route.request().postDataJSON() || {}
            if (
              /^(?:complete|resume|block|reject|urge)_task_action$/u.test(
                body.method || ''
              )
            ) {
              workflowWrites.push(body)
              if (body.method === 'complete_task_action') {
                notifyCompletion()
                await completionGate
              }
            }
            await route.fallback()
          })
        },
        verify: async (page) => {
          try {
            await taskRow(page, readyID).waitFor({ state: 'visible' })
            const hint = page.locator(
              '.erp-business-selection-action-bar--placeholder:visible'
            )
            await hint.waitFor({ state: 'visible' })
            const commandHeight = await page
              .locator('.erp-business-operation-panel__command')
              .evaluate((node) => node.getBoundingClientRect().height)
            assert.equal(
              await actionBar(page).count(),
              1,
              `${name}: unselected operation row stays visible`
            )
            await taskRow(page, readyID).getByRole('radio').check()
            assert.equal(
              await hint.count(),
              0,
              'selected actions replace the placeholder'
            )
            assert.equal(
              await page
                .locator('.erp-business-operation-panel__command')
                .evaluate((node) => node.getBoundingClientRect().height),
              commandHeight,
              'selection preserves the query row'
            )
            await taskAction(page, 'details').waitFor({ state: 'visible' })
            const complete = taskAction(page, 'complete')
            assert.equal(
              await complete.innerText(),
              definition.key === 'shipping-release' ? '审批通过' : '完成任务'
            )
            assert.equal(await complete.isEnabled(), true)
            const geometry = await assertSelectedGeometry(page, assert, name)
            console.log(
              `[style:l1:selection] id=${name} geometry=${JSON.stringify(geometry)}`
            )
            await page.screenshot({
              path: path.join(outputDir, `${name}-selected.png`),
              fullPage: true,
            })

            await taskAction(page, 'details').click()
            await page.getByRole('dialog').waitFor({ state: 'visible' })
            await closeDetails(page)
            assert.equal(
              await taskRow(page, readyID).getByRole('radio').isChecked(),
              true,
              'closing details retains the selected task'
            )
            const more = actionBar(page).getByRole('button', { name: /更多操作/u })
            if (await more.count()) await more.click()
            const menu = page.locator(
              '.erp-business-selection-action-menu:visible'
            )
            for (const action of ['block', 'reject', 'urge']) {
              assert.equal(
                await availableActions(page)
                  .locator(
                    `[data-business-action-key="workflow-task-${action}"]`
                  )
                  .isEnabled(),
                true
              )
            }
            if (await menu.count()) {
              await menu.press('Escape')
              await menu.waitFor({ state: 'hidden' })
            }

            await taskRow(page, readyID + 1)
              .getByRole('radio')
              .check()
            assert.equal(
              await taskAction(page, 'complete').count(),
              0,
              'blocked tasks cannot complete'
            )
            await taskAction(page, 'resume').click()
            const resumeDialog = page.getByRole('dialog')
            await resumeDialog
              .getByRole('textbox')
              .fill('补充资料已核对，恢复当前任务')
            await resumeDialog
              .getByRole('button', { name: '确认恢复', exact: true })
              .click()
            await resumeDialog.waitFor({ state: 'hidden' })
            await taskAction(page, 'complete').waitFor({ state: 'visible' })
            assert.equal(workflowWrites[0].method, 'resume_task_action')
            assert.equal(workflowWrites[0].params.expected_version, 1)

            for (const terminalID of [readyID + 2, readyID + 3]) {
              await taskRow(page, terminalID).getByRole('radio').check()
              assert.equal(await taskAction(page, 'details').isEnabled(), true)
              for (const action of [
                'complete',
                'resume',
                'block',
                'reject',
                'urge',
              ]) {
                assert.equal(
                  await taskAction(page, action).count(),
                  0,
                  'ended tasks expose no status mutations'
                )
              }
            }
            await page.locator('.ant-pagination-next button').click()
            await taskRow(page, readyID + 10).waitFor({ state: 'visible' })
            await hint.waitFor({ state: 'visible' })
            assert.equal(
              await actionBar(page).count(),
              1,
              'paging clears a stale selection'
            )
            await taskRow(page, readyID + 10)
              .getByRole('radio')
              .check()
            await actionBar(page)
              .getByRole('button', { name: '清空已选', exact: true })
              .click()
            assert.equal(await actionBar(page).count(), 1)
            await hint.waitFor({ state: 'visible' })
            await page.locator('.ant-pagination-prev button').click()
            await taskRow(page, readyID).waitFor({ state: 'visible' })
            await taskRow(page, readyID)
              .getByText(
                fixtures.find((task) => task.id === readyID).task_name,
                { exact: true }
              )
              .click()

            await taskAction(page, 'complete').click()
            if (definition.key === 'shipping-release') {
              const approvalDialog = page.getByRole('dialog')
              await approvalDialog.waitFor({ state: 'visible' })
              assert.equal(
                workflowWrites.filter(
                  (call) => call.method === 'complete_task_action'
                ).length,
                0,
                'opening approval must not submit it'
              )
              await approvalDialog
                .getByRole('button', { name: '确认通过', exact: true })
                .click()
              await page
                .getByText('请先填写原因', { exact: true })
                .waitFor({ state: 'visible' })
              assert.equal(
                workflowWrites.filter(
                  (call) => call.method === 'complete_task_action'
                ).length,
                0,
                'approval requires an opinion before submission'
              )
              await approvalDialog
                .getByRole('textbox')
                .fill('财务资料已核对，同意放行；实际出货由仓库独立确认')
              await approvalDialog
                .getByRole('button', { name: '取消', exact: true })
                .click()
              await approvalDialog.waitFor({ state: 'hidden' })
              assert.equal(
                workflowWrites.filter(
                  (call) => call.method === 'complete_task_action'
                ).length,
                0,
                'canceling approval must not submit it'
              )
              assert.equal(
                await taskRow(page, readyID).getByRole('radio').isChecked(),
                true
              )
              await taskAction(page, 'complete').click()
              await approvalDialog
                .getByRole('textbox')
                .fill('财务资料已核对，同意放行；实际出货由仓库独立确认')
              await approvalDialog
                .getByRole('button', { name: '确认通过', exact: true })
                .click()
            }
            await taskAction(page, 'complete')
              .locator('.anticon-loading')
              .waitFor({ state: 'visible' })
            await completionStarted
            assert.equal(
              await taskAction(page, 'complete').isEnabled(),
              false,
              'pending submission keeps a disabled stable action slot'
            )
            const completionCalls = workflowWrites.filter(
              (call) => call.method === 'complete_task_action'
            )
            assert.equal(completionCalls.length, 1)
            assert.equal(completionCalls[0].params.task_id, readyID)
            assert.equal(completionCalls[0].params.expected_version, 1)
            assert.ok(completionCalls[0].params.idempotency_key)
            if (definition.key === 'shipping-release') {
              assert.match(completionCalls[0].params.reason, /同意放行/u)
            }
            releaseCompletion()
            if (definition.key === 'shipping-release') {
              await page.getByRole('dialog').waitFor({ state: 'hidden' })
            }
            await taskRow(page, readyID)
              .getByText('已完成', { exact: true })
              .waitFor({ state: 'visible' })
            assert.equal(await taskAction(page, 'complete').count(), 0)
            assert.deepEqual(
              factWrites,
              [],
              'task actions must not post inventory, shipments, or finance facts'
            )
            await actionBar(page)
              .getByRole('button', { name: '清空已选', exact: true })
              .click()
            assert.equal(await actionBar(page).count(), 1)
            await assertNoHorizontalOverflow(page, name)
            await page.screenshot({
              path: path.join(outputDir, `${name}.png`),
              fullPage: true,
            })
            return { selectedGeometry: geometry }
          } finally {
            releaseCompletion?.()
          }
        },
      }
    })
  )

  for (const definition of workflowModuleSelectionDefinitions) {
    scenarios.push({
      name: `business-selection-${definition.key}-readonly`,
      path: definition.path,
      auth: 'admin',
      customerKey: 'yoyoosun',
      viewport: { width: 1280, height: 1000 },
      workflowTaskFixtures: fixtures,
      ...scenarioIdentity(definition, customerRuntimeEffectiveSession, true),
      verify: async (page) => {
        const readyID = definition.taskBase + 1
        await taskRow(page, readyID).getByRole('radio').check()
        assert.equal(await taskAction(page, 'details').isEnabled(), true)
        for (const action of [
          'complete',
          'resume',
          'block',
          'reject',
          'urge',
        ]) {
          assert.equal(
            await taskAction(page, action).count(),
            0,
            'read-only users have no task mutations'
          )
        }
        await taskAction(page, 'details').click()
        await closeDetails(page)
        assert.equal(
          await taskRow(page, readyID).getByRole('radio').isChecked(),
          true
        )
        await actionBar(page)
          .getByRole('button', { name: '清空已选', exact: true })
          .click()
        assert.equal(await actionBar(page).count(), 1)
        await assertNoHorizontalOverflow(page, definition.key)
      },
    })
  }
  scenarios.push({
    name: 'business-selection-bom-action-entries',
    path: '/erp/purchase/material-bom',
    auth: 'admin',
    customerKey: 'yoyoosun',
    effectiveSession: customerRuntimeEffectiveSession,
    viewport: { width: 1440, height: 1000 },
    verify: async (page) => {
      const draft = page
        .locator('.ant-table-tbody > tr')
        .filter({ hasText: 'BOM-STYLE-DRAFT' })
      const active = page
        .locator('.ant-table-tbody > tr')
        .filter({ hasText: 'BOM-STYLE-L1' })
      await draft.waitFor({ state: 'visible' })
      await page
        .locator('.erp-business-selection-action-bar--placeholder:visible')
        .waitFor({ state: 'visible' })
      assert.equal(await actionBar(page).count(), 1)
      await draft.getByRole('checkbox').check()
      for (const key of ['view', 'edit', 'activate']) {
        assert.equal(
          await actionBar(page)
            .locator(`[data-business-action-key="${key}"]:visible`)
            .isEnabled(),
          true
        )
      }
      const more = actionBar(page).getByRole('button', { name: /更多操作/u })
      if (await more.count()) await more.click()
      const menu = page.locator('.erp-business-selection-action-menu:visible')
      for (const key of ['related-tasks', 'copy']) {
        assert.equal(
          await availableActions(page).locator(`[data-business-action-key="${key}"]:visible`).isEnabled(),
          true,
          `BOM draft retains ${key}`
        )
      }
      for (const label of ['打印物料明细', '打印色卡', '打印作业指导书']) {
        assert.equal(
          await availableActions(page)
            .getByRole('button', { name: new RegExp(label, 'u') })
            .isEnabled(),
          true
        )
      }
      await page.screenshot({
        path: path.join(outputDir, 'business-selection-bom-action-entries.png'),
        fullPage: true,
      })
      if (await menu.count()) {
        await menu.press('Escape')
        await menu.waitFor({ state: 'hidden' })
      }
      await actionBar(page).locator('[data-business-action-key="edit"]').click()
      await page
        .getByRole('heading', { name: '编辑 BOM 草稿 · 未生效', exact: true })
        .waitFor({ state: 'visible' })
      await page.getByRole('button', { name: '返回列表', exact: true }).click()
      await actionBar(page).waitFor({ state: 'visible' })
      assert.equal(await draft.getByRole('checkbox').isChecked(), true)
      await actionBar(page)
        .getByRole('button', { name: '清空已选', exact: true })
        .click()
      await active.getByText('BOM-STYLE-L1', { exact: true }).click()
      assert.equal(
        await actionBar(page)
          .locator('[data-business-action-key="edit"]:visible')
          .count(),
        0,
        'active versions are revised through a draft'
      )
      assert.equal(
        await actionBar(page)
          .getByRole('button', { name: /查看草稿/u })
          .isEnabled(),
        true
      )
      await actionBar(page)
        .getByRole('button', { name: '清空已选', exact: true })
        .click()
      assert.equal(await actionBar(page).count(), 1)
      await assertNoHorizontalOverflow(
        page,
        'business-selection-bom-action-entries'
      )
    },
  })
  for (const themeMode of ['light', 'dark']) {
    let releaseList
    let listGate
    let responseMode
    const name = `business-selection-discovery-${themeMode}`
    scenarios.push({
      name,
      path: '/erp/purchase/material-bom',
      auth: 'admin',
      customerKey: 'yoyoosun',
      effectiveSession: customerRuntimeEffectiveSession,
      themeMode,
      viewport: { width: 1440, height: 1000 },
      beforeNavigate: async (page) => {
        responseMode = 'hold'
        listGate = new Promise((resolve) => {
          releaseList = resolve
        })
        await page.route('**/rpc/bom', async (route) => {
          const body = route.request().postDataJSON() || {}
          if (body.method === 'list_bom_versions') {
            if (responseMode === 'hold') await listGate
            if (responseMode === 'empty') {
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: body.id,
                  result: {
                    code: 0,
                    message: 'OK',
                    data: {
                      bom_versions: [],
                      total: 0,
                      limit: body.params?.limit || 20,
                      offset: 0,
                    },
                  },
                }),
              })
              return
            }
          }
          await route.fallback()
        })
      },
      verify: async (page) => {
        const hint = page.locator(
          '.erp-business-selection-action-bar--placeholder:visible'
        )
        try {
          await page
            .locator('.erp-business-data-table-card .ant-spin-spinning')
            .waitFor({ state: 'visible' })
          assert.equal(
            await hint.count(),
            0,
            'loading does not invite selection'
          )
          responseMode = 'data'
          releaseList()
          const draft = page
            .locator('.ant-table-tbody > tr')
            .filter({ hasText: 'BOM-STYLE-DRAFT' })
          await draft.waitFor({ state: 'visible' })
          for (const width of [1440, 1280, 1279, 1100, 1024, 768, 390, 320]) {
            await page.setViewportSize({ width, height: 1000 })
            await waitForFiniteAnimations(page)
            await hint.waitFor({ state: 'visible' })
            const geometry = await hint.evaluate((node) => {
              const text = node.querySelector(
                '.erp-business-selection-action-bar__placeholder-text'
              )
              const panel = node.closest('.erp-business-operation-panel')
              const table = panel
                .closest('[data-table-scroll-scope]')
                .querySelector('.erp-business-data-table-card')
              return {
                tableTop: table.getBoundingClientRect().top,
                barTop: node.getBoundingClientRect().top,
                searchHeight: panel
                  .querySelector('.erp-search-input')
                  .getBoundingClientRect().height,
                queryText: panel.querySelector(
                  '.erp-business-operation-panel__command'
                ).innerText,
                clipped: text.scrollWidth > text.clientWidth + 1,
                color: getComputedStyle(text).color,
                background: getComputedStyle(
                  node.closest('.erp-business-operation-panel__selection')
                ).backgroundColor,
              }
            })
            assert.doesNotMatch(
              geometry.queryText,
              /先选记录|选中记录后/u,
              'query controls have no duplicate guidance'
            )
            assert.equal(await actionBar(page).count(), 1)
            assert.equal(await hint.getByRole('button').count(), 0)
            assert.equal(geometry.clipped, false)
            assert.ok(
              getContrastRatio(
                parseRgb(geometry.color),
                parseRgb(geometry.background)
              ) >= 4.5,
              `${name}/${width}: readable placeholder contrast`
            )
            await draft.getByRole('checkbox').check()
            assert.equal(await hint.count(), 0)
            assert.equal(await actionBar(page).count(), 1)
            if (width >= 1280) {
              assert.equal(
                await page
                  .locator('.erp-business-data-table-card')
                  .evaluate((node) => node.getBoundingClientRect().top),
                geometry.tableTop,
                'BOM selection does not move the table'
              )
            }
            assert.equal(
              await page
                .locator('.erp-search-input')
                .evaluate((node) => node.getBoundingClientRect().height),
              geometry.searchHeight
            )
            await actionBar(page)
              .getByRole('button', { name: '清空已选', exact: true })
              .click()
            await hint.waitFor({ state: 'visible' })
            await waitForFiniteAnimations(page)
            assert.equal(
              await page
                .locator('.erp-business-data-table-card')
                .evaluate((node) => node.getBoundingClientRect().top),
              geometry.tableTop,
              `${name}/${width}: clearing restores the same table position`
            )
            await assertNoHorizontalOverflow(page, `${name}/${width}`)
            await assertVisibleSearchPlaceholdersFit(page, `${name}/${width}`)
            if (width === 1440 || width === 390) {
              await page.screenshot({
                path: path.join(outputDir, `${name}-${width}.png`),
                fullPage: true,
              })
            }
          }
          responseMode = 'empty'
          await page
            .getByRole('button', { name: '刷新当前页', exact: true })
            .click()
          await page
            .getByText('暂无 BOM 版本', { exact: true })
            .waitFor({ state: 'visible' })
          assert.equal(
            await hint.count(),
            0,
            'an empty table only shows its empty state'
          )
          await page.screenshot({ path: path.join(outputDir, `${name}-empty.png`), fullPage: true })
          assert.equal(
            await actionBar(page).count(),
            0,
            'empty lists leave the operation area hidden'
          )
          responseMode = 'data'
          await page
            .getByRole('button', { name: '刷新当前页', exact: true })
            .click()
          await hint.waitFor({ state: 'visible' })
        } finally {
          releaseList?.()
        }
      },
    })
  }
  return scenarios
}
