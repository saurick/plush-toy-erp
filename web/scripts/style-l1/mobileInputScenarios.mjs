import assert from 'node:assert/strict'
import { assertMobileEditableInputSize } from './inputControlAssertions.mjs'
import { getContrastRatio, parseRgb } from './colorAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

const fixturePath = '/__mobile-input-fixture'
const fixtureHTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script type="module">
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
</script></head><body><div id="root"></div>
<script type="module" src="/scripts/test/MobileInputFixture.jsx"></script></body></html>`

const node = {
  id: 98003,
  process_instance_id: 98002,
  node_key: 'approve_production_exception',
  node_type: 'approval',
  form_profile_key: 'production_exception_approval',
  attempt: 1,
  version: 1,
  status: 'active',
  outcome: '',
}

export function createMobileInputScenarios() {
  return ['light', 'dark'].map((themeMode) => ({
    name: `mobile-input-controls-${themeMode}`,
    path: `${fixturePath}?theme=${themeMode}`,
    auth: 'admin',
    viewport: { width: 390, height: 844 },
    beforeNavigate: async (page) => {
      await page.route(`**${fixturePath}?*`, (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: fixtureHTML,
        })
      )
      await page.route('**/rpc/workflow', (route) => {
        const body = route.request().postDataJSON()
        assert.equal(body.method, 'get_task_process_context')
        assert.equal(body.params.task_id, 98001)
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              code: 0,
              data: {
                process_context: {
                  source: {
                    type: 'production_report',
                    id: 98004,
                    no: 'STYLE-L1-INPUT',
                  },
                  process_instance: {
                    id: 98002,
                    process_key: 'production_exception_approval',
                    process_version: 'v1',
                    status: 'active',
                    started_at: 1900000000,
                  },
                  nodes: [node],
                  current_nodes: [node],
                  completed_nodes: [],
                  linked_node: node,
                  current_responsibilities: [
                    { node_instance_id: node.id, owner_role_key: 'boss' },
                  ],
                  approval_form: {
                    profile_key: 'production_exception_approval',
                    reason_required: true,
                    approved_quantity: {
                      required: false,
                      precision: 20,
                      scale: 6,
                    },
                  },
                },
              },
            },
          }),
        })
      })
    },
    verify: async (page) => {
      const reason = page.getByRole('textbox', { name: '审批意见' })
      const quantity = page.getByRole('textbox', {
        name: '批准数量',
        exact: true,
      })
      const submit = page.getByRole('button', {
        name: '确认审批通过',
        exact: true,
      })
      const output = page.getByTestId('input-submission')
      await quantity.waitFor()
      const titlePaint = await page
        .locator('[data-testid="mobile-task-action-screen"] h2')
        .first()
        .evaluate((title) => ({
          color: getComputedStyle(title).color,
          background: getComputedStyle(title.closest('section'))
            .backgroundColor,
        }))
      assert(
        getContrastRatio(
          parseRgb(titlePaint.color),
          parseRgb(titlePaint.background)
        ) >= 4.5,
        JSON.stringify(titlePaint)
      )
      await assertMobileEditableInputSize(page, `审批输入 ${themeMode}`)
      assert.equal(await quantity.getAttribute('inputmode'), 'decimal')

      await submit.click()
      await page
        .getByRole('alert')
        .filter({ hasText: '审批意见为必填项' })
        .waitFor()
      assert(
        await reason.evaluate((element) => element === document.activeElement)
      )
      assert.equal(await output.textContent(), 'null')
      const feedback = '已核对申请数量与处理依据。\n下一岗位按批准数量办理。'
      await reason.fill(feedback)
      await reason.focus()
      await assertMobileEditableInputSize(page, `审批输入聚焦 ${themeMode}`)
      assert.equal(await reason.getAttribute('aria-invalid'), 'false')
      for (const invalid of ['0', '-1', '1.1234567']) {
        await quantity.fill(invalid)
        await submit.click()
        await page
          .getByRole('alert')
          .filter({ hasText: '批准数量必须大于 0' })
          .waitFor()
        assert.equal(await quantity.getAttribute('aria-invalid'), 'true')
        assert(
          await quantity.evaluate(
            (element) => element === document.activeElement
          )
        )
        assert.match(
          await quantity.getAttribute('aria-describedby'),
          /approved-quantity-error$/u
        )
        assert.equal(await output.textContent(), 'null')
      }
      await quantity.fill('12.345678')
      assert.equal(await quantity.getAttribute('aria-invalid'), 'false')
      await submit.click()
      assert.deepEqual(JSON.parse(await output.textContent()), {
        action: 'done',
        approvedQuantity: '12.345678',
        reason: feedback,
      })
      await quantity.fill('')
      await submit.click()
      assert.equal(JSON.parse(await output.textContent()).approvedQuantity, '')

      for (const [action, label] of [
        ['blocked', '标记阻塞'],
        ['rejected', '退回'],
        ['urge', '催办'],
      ]) {
        await page.getByRole('radio', { name: label, exact: true }).check()
        assert(
          await page
            .getByRole('radio', { name: label, exact: true })
            .isChecked()
        )
        assert.equal(
          await page
            .getByRole('radio')
            .evaluateAll(
              (radios) => radios.filter((radio) => radio.checked).length
            ),
          1
        )
        await quantity.waitFor({ state: 'detached' })
        assert.equal(
          await quantity.count(),
          0,
          '离开审批通过后不残留批准数量输入'
        )
        await page
          .getByRole('button', { name: `确认${label}`, exact: true })
          .click()
        assert.equal(JSON.parse(await output.textContent()).action, action)
      }
      await page.getByRole('radio', { name: '审批通过', exact: true }).check()
      await quantity.waitFor()
      assert.equal(await quantity.inputValue(), '')
      await page.setViewportSize({ width: 320, height: 360 })
      await page.waitForFunction(() => {
        const footer = document.querySelector('.mobile-task-action-footer')
        return (
          footer && footer.getBoundingClientRect().bottom <= innerHeight + 1
        )
      })
      await reason.focus()
      await assertMobileEditableInputSize(page, `短屏输入 ${themeMode}`)
      const geometry = await page
        .locator('.mobile-task-action-footer')
        .evaluate((element) => {
          const rect = element.getBoundingClientRect()
          return {
            top: rect.top,
            bottom: rect.bottom,
            height: rect.height,
            viewport: innerHeight,
          }
        })
      assert(
        geometry.height >= 44 &&
          geometry.top >= 0 &&
          geometry.bottom <= geometry.viewport + 1,
        JSON.stringify(geometry)
      )
      await page.setViewportSize({ width: 390, height: 844 })
      await waitForFiniteAnimations(page)
    },
  }))
}
