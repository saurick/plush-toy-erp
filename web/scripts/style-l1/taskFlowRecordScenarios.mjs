import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'

export function createTaskFlowRecordScenarios({
  assert,
  path,
  outputDir,
  customerRuntimeEffectiveSession,
}) {
  return ['desktop', 'mobile'].flatMap((surface) =>
    ['light', 'dark'].map((themeMode) => {
      const mobile = surface === 'mobile'
      const paginated = !mobile && themeMode === 'dark'
      const task = {
        id: 9641,
        version: 1,
        task_code: 'STYLE-L1-FLOW-RECORDS',
        task_name: '核对到货资料',
        task_group: 'trial_warehouse_work',
        task_status_key: 'ready',
        owner_role_key: 'warehouse',
        required_capability_key: 'workflow.task.complete',
        source_type: 'purchase_receipt',
        source_id: 9641,
        source_no: 'PR-DEMO-FLOW-001',
        created_at: 1793490000,
      }
      const prior = {
        ...task,
        id: 9642,
        task_code: 'STYLE-L1-FLOW-QUALITY',
        task_name:
          mobile && themeMode === 'dark'
            ? `复核到货质量与规格（含分批到货说明） · QC-DEMO-${'20261101'.repeat(8)}`
            : '复核到货质量',
        task_group: 'quality_followup',
        task_status_key: 'done',
        owner_role_key: 'quality',
      }
      const event = (id, origin, event_type, extra = {}) => ({
        id,
        task_id: origin.id,
        task: {
          id: origin.id,
          task_name: origin.task_name,
          task_group: origin.task_group,
          owner_role_key: origin.owner_role_key,
          required_capability_key: origin.required_capability_key,
          source_type: origin.source_type,
          source_id: origin.source_id,
        },
        event_type,
        actor_display_name:
          origin.id === task.id ? '仓库演示人员' : '品质演示人员',
        actor_role_key: origin.owner_role_key,
        task_version: 1,
        created_at: 1793490000 + id,
        ...extra,
      })
      const own = [
        event(9000, task, 'status_changed', {
          from_status_key: 'blocked',
          to_status_key: 'ready',
          reason: '所需资料已补齐，可以继续核对。',
        }),
        event(8999, task, 'status_changed', {
          from_status_key: 'ready',
          to_status_key: 'blocked',
          reason: '等资料：请补充完整的规格与检验说明。',
        }),
        event(8998, task, 'created'),
      ]
      const flow = [
        ...own,
        event(8997, prior, 'status_changed', {
          from_status_key: 'ready',
          to_status_key: 'done',
          reason: '本次到货质量已复核，办理结果以正式检验单据为准。',
        }),
        event(8996, prior, 'created'),
      ]
      if (paginated)
        for (let id = 8995; id >= 8901; id--)
          flow.push(event(id, prior, 'payload_refreshed'))
      const actions = [
        'workflow.task.read',
        'workflow.task.complete',
        'workflow.task.update',
        'workflow.task.reject',
        'purchase_receipt.read',
        'mobile.warehouse.access',
      ]
      let failFlow = true
      let failOlder = true
      return {
        name: `task-flow-records-${surface}-${themeMode}`,
        path: mobile ? '/m/warehouse/tasks' : '/erp/task-board',
        auth: 'admin',
        themeMode,
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1920, height: 1080 },
        deviceScaleFactor: mobile ? 1 : 2,
        workflowTaskFixtures: [task],
        effectiveSession: {
          ...customerRuntimeEffectiveSession,
          actions,
          roles: ['warehouse'],
          workPools: ['warehouse'],
          pages: ['task-board'],
          workflow_visible_owner_role_keys_by_capability: Object.fromEntries(
            actions
              .filter((value) => value.startsWith('workflow.task.'))
              .map((value) => [value, ['warehouse', 'quality']])
          ),
        },
        adminProfile: {
          id: 1,
          username: 'style-l1-flow-records',
          is_super_admin: false,
          roles: [{ role_key: 'warehouse', name: '仓库' }],
          permissions: actions,
          menus: [
            {
              key: 'task-board',
              label: '任务管理',
              path: '/erp/task-board',
              required_any: ['workflow.task.read'],
              required_all: [],
            },
          ],
        },
        beforeNavigate: async (page) => {
          failFlow = true
          failOlder = true
          await page.route('**/rpc/workflow', async (route) => {
            const body = route.request().postDataJSON()
            if (body.method !== 'list_task_events') return route.fallback()
            const reply = (data, code = 0) =>
              route.fulfill({
                json: {
                  jsonrpc: '2.0',
                  id: body.id,
                  result: { code, message: code ? '读取失败' : 'OK', data },
                },
              })
            if (body.params.scope !== 'flow')
              return reply({ items: own, truncated: false })
            if (failFlow) {
              failFlow = false
              return reply({}, 500)
            }
            if (body.params.before_event_id) {
              assert.equal(body.params.before_event_id, 8901)
              if (failOlder) {
                failOlder = false
                return reply({}, 500)
              }
              return reply({
                items: [event(8900, prior, 'created')],
                truncated: false,
              })
            }
            return reply({ items: flow, truncated: paginated })
          })
        },
        verify: async (page) => {
          await page
            .getByRole('button', {
              name: `查看${task.task_name}详情`,
              exact: true,
            })
            .click()
          const detail = mobile
            ? page.getByTestId('mobile-task-detail-screen')
            : page.locator('.erp-task-action-drawer')
          const records = detail.getByTestId('workflow-task-event-trail')
          await records
            .getByRole('heading', { name: '处理记录', exact: true })
            .waitFor()
          await records
            .getByRole('button', { name: '重新读取', exact: true })
            .waitFor()
          assert.match(
            await records.getByRole('alert').innerText(),
            /处理记录加载失败/u
          )
          await assertRecordHeaderLayout(records, assert, mobile)
          const checkScopeHelp = async (kind, expectedIncluded) => {
            const progress = kind === 'progress'
            const label = progress ? '任务进度范围' : '处理记录范围'
            const trigger = detail.getByRole('button', { name: `查看${label}说明`, exact: true })
            await trigger.scrollIntoViewIfNeeded()
            if (mobile) await trigger.tap()
            else await trigger.hover()
            const help = page.getByRole('region', { name: `${label}说明`, exact: true })
            await help.waitFor()
            await waitForFiniteAnimations(page)
            assert.equal(await help.locator('[data-included]').count(), expectedIncluded)
            const box = await help.boundingBox()
            const viewport = page.viewportSize()
            assert.ok(box.x >= 0 && box.x + box.width <= viewport.width, JSON.stringify({ box, viewport }))
            if (mobile) {
              const target = await trigger.boundingBox()
              assert.ok(target.width >= 44 && target.height >= 44, JSON.stringify(target))
            }
            await page.screenshot({ path: path.join(outputDir, `task-scope-help-${surface}-${themeMode}-${kind}-${expectedIncluded}.png`) })
            const close = help.getByRole('button', { name: `关闭${label}说明`, exact: true })
            await close.focus()
            await close.press('Escape')
            await help.waitFor({ state: 'hidden' })
            assert.equal(await detail.isVisible(), true, '关闭说明不能关闭任务详情')
            assert.equal(await trigger.evaluate((node) => document.activeElement === node), true)
            await page.mouse.move(0, 0)
            await trigger.click()
            await help.waitFor()
            await help.getByRole('button', { name: `关闭${label}说明`, exact: true }).click()
            await help.waitFor({ state: 'hidden' })
            assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
            await page.mouse.move(0, 0)
            await trigger.click()
            await help.waitFor()
            await help.getByRole('button', { name: `关闭${label}说明`, exact: true }).focus()
            const outside = await detail.evaluate((node) => {
              const popup = document.querySelector('.erp-supplemental-help-popover:not(.ant-popover-hidden)')
              const box = node.getBoundingClientRect()
              for (let y = Math.max(16, box.top + 12); y < Math.min(innerHeight - 16, box.bottom); y += 32) {
                for (const x of [Math.max(16, box.left + 12), (box.left + box.right) / 2]) {
                  const hit = document.elementFromPoint(x, y)
                  if (hit && node.contains(hit) && !popup?.contains(hit) && !hit.closest('button, a, input, summary, select, textarea, [role="button"]')) return { x, y }
                }
              }
              throw new Error('任务详情中没有可用于收起说明的可见背景')
            })
            if (mobile) await page.touchscreen.tap(outside.x, outside.y)
            else await page.mouse.click(outside.x, outside.y)
            await help.waitFor({ state: 'hidden' })
            assert.equal(await detail.isVisible(), true, '点击说明外的任务内容只关闭说明')
          }
          await checkScopeHelp('progress', 2)
          await checkScopeHelp('records', 2)
          const scopeRoot = records.locator('.workflow-task-event-trail__scope')
          await scopeRoot.scrollIntoViewIfNeeded()
          const before = await scopeRoot.boundingBox()
          const switchElement = await scopeRoot.elementHandle()
          await verifyMobileNavigationMotion(
            page,
            assert,
            '.workflow-task-event-trail__scope',
            1
          )
          await waitForFiniteAnimations(page)
          assert.equal(
            await records.locator('.workflow-task-event-trail__item').count(),
            3
          )
          assert.equal(
            await records.getByText('复核到货质量', { exact: true }).count(),
            0
          )
          const after = await scopeRoot.boundingBox()
          assert.ok(
            Math.abs(before.x - after.x) <= 1 &&
              Math.abs(before.y - after.y) <= 1 &&
              Math.abs(before.width - after.width) <= 1
          )
          assert.equal(
            await switchElement.evaluate((node) => node.isConnected),
            true
          )
          await checkScopeHelp('records', 1)
          if (mobile && themeMode === 'dark') {
            await page.setViewportSize({ width: 320, height: 844 })
            await checkScopeHelp('records', 1)
            await assertRecordHeaderLayout(records, assert, mobile)
            await page.setViewportSize({ width: 390, height: 844 })
          }
          await verifyMobileNavigationMotion(
            page,
            assert,
            '.workflow-task-event-trail__scope',
            0,
            true
          )
          await records
            .getByRole('button', { name: '重新读取', exact: true })
            .click()
          await records
            .getByText('品质演示人员', { exact: true })
            .first()
            .waitFor()
          assert.equal(
            await records.locator('.workflow-task-event-trail__item').count(),
            paginated ? 100 : 5
          )
          assert.equal(
            await records.getByText('本任务', { exact: true }).count(),
            3
          )
          const details = records.getByRole('button', {
            name: '查看任务已恢复待处理记录详情',
            exact: true,
          })
          await details.click()
          const popover = page.locator('.ant-popover:visible')
          await popover.getByText('所属任务', { exact: true }).waitFor()
          await popover.getByText(task.task_name, { exact: true }).waitFor()
          await details.press('Escape')
          await popover.waitFor({ state: 'hidden' })
          if (paginated) {
            const olderButton = records.getByRole('button', {
              name: '加载更早记录',
              exact: true,
            })
            await olderButton.scrollIntoViewIfNeeded()
            const tail = await olderButton.boundingBox()
            await page.mouse.move(
              tail.x + tail.width / 2,
              tail.y + tail.height / 2
            )
            await page.mouse.wheel(0, -300)
            await page.mouse.wheel(0, 700)
            await waitForFiniteAnimations(page)
            const visibleTail = await olderButton.boundingBox()
            assert.ok(
              visibleTail.y >= 0 && visibleTail.y + visibleTail.height <= 1080
            )
            await records
              .getByRole('button', { name: '加载更早记录', exact: true })
              .click()
            await records
              .getByRole('button', { name: '重试加载更早记录', exact: true })
              .waitFor()
            assert.equal(
              await records.locator('.workflow-task-event-trail__item').count(),
              100
            )
            await records
              .getByRole('button', { name: '重试加载更早记录', exact: true })
              .click()
            await page.waitForFunction(
              () =>
                document.querySelectorAll('.workflow-task-event-trail__item')
                  .length === 101
            )
            assert.equal(
              await records
                .getByRole('button', { name: '加载更早记录', exact: true })
                .count(),
              0
            )
          }
          await records
            .locator('.workflow-task-event-trail__head')
            .evaluate((node) => node.scrollIntoView({ block: 'start' }))
          const geometry = await records.evaluate((node) => ({
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
            label: node.querySelector('h3').textContent,
            scopeCount: node.querySelectorAll(
              '.workflow-task-event-trail__scope'
            ).length,
          }))
          assert.ok(
            geometry.scrollWidth <= geometry.clientWidth + 1,
            JSON.stringify(geometry)
          )
          assert.equal(geometry.scopeCount, 1)
          geometry.headerLayout = await assertRecordHeaderLayout(records, assert, mobile)
          await waitForFiniteAnimations(page)
          await page.mouse.move(20, 20)
          await page.screenshot({
            path: path.join(
              outputDir,
              `task-flow-records-${surface}-${themeMode}.png`
            ),
          })
          await fsWriteEvidence(
            path.join(
              outputDir,
              `task-flow-records-${surface}-${themeMode}.json`
            ),
            geometry
          )
        },
      }
    })
  )
}

async function assertRecordHeaderLayout(records, assert, mobile) {
  const geometry = await records.evaluate((node) => {
    const box = (element) => {
      const { x, y, width, height, right, bottom } = element.getBoundingClientRect()
      return { x, y, width, height, right, bottom }
    }
    const head = node.querySelector('.workflow-task-event-trail__head')
    return {
      head: box(head),
      label: box(node.querySelector('.workflow-task-event-trail__heading-label')),
      scope: box(node.querySelector('.workflow-task-event-trail__scope')),
      content: box(head.nextElementSibling),
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
    }
  })
  const { head, label, scope, content } = geometry
  const evidence = JSON.stringify(geometry)
  const sameRow = Math.abs(label.y + label.height / 2 - scope.y - scope.height / 2) <= 1
  if (!mobile) assert.ok(sameRow, `桌面记录标题与范围应同排：${evidence}`)
  assert.ok(scope.x >= head.x - 1 && scope.right <= head.right + 1, evidence)
  assert.ok(label.x >= head.x - 1 && label.right <= head.right + 1, evidence)
  assert.ok(Math.abs(Math.min(label.y, scope.y) - head.y) <= 1, evidence)
  assert.ok(Math.abs(Math.max(label.bottom, scope.bottom) - head.bottom) <= 1, evidence)
  if (sameRow) {
    assert.ok(scope.x - label.right >= 8, `标题和范围不能重叠：${evidence}`)
  } else {
    assert.ok(scope.y - label.bottom >= 0 && scope.y - label.bottom <= 8, `窄屏换行只保留必要间距：${evidence}`)
  }
  assert.ok(content.y - head.bottom >= 8 && content.y - head.bottom <= 12, `记录正文与标题间距应紧凑：${evidence}`)
  assert.ok(geometry.scrollWidth <= geometry.clientWidth + 1, evidence)
  return geometry
}

async function fsWriteEvidence(file, evidence) {
  const fs = await import('node:fs/promises')
  await fs.writeFile(file, JSON.stringify(evidence, null, 2))
}
