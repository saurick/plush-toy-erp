import assert from 'node:assert/strict'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

const fixturePath = '/__contact-form-fixture'
const fixtureHTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true;</script>
</head><body><div id="root"></div><script type="module" src="/scripts/test/ContactFormFixture.jsx"></script></body></html>`

async function measureContacts(editor, narrow = false) {
  const metrics = await editor.evaluate((node) => {
    const rows = [...node.querySelectorAll('.erp-contact-editor__fields')].map(
      (row) => ({
        height: row.getBoundingClientRect().height,
        fields: [...row.querySelectorAll('input.ant-input')]
          .filter((input) => input.getBoundingClientRect().width > 0)
          .map((input) => {
            const { x, y, width, height } = input.getBoundingClientRect()
            return { x, y, width, height }
          }),
      })
    )
    return {
      width: node.clientWidth,
      contentWidth: node.scrollWidth,
      height: node.getBoundingClientRect().height,
      rows,
    }
  })
  assert.ok(metrics.contentWidth <= metrics.width + 1, JSON.stringify(metrics))
  for (const row of metrics.rows) {
    assert.equal(row.fields.length, 5)
    assert.ok(row.fields.every((field) => field.width >= 90))
    if (!narrow) {
      assert.ok(row.height <= 80, JSON.stringify(metrics))
      assert.ok(
        row.fields.every((field) => Math.abs(field.y - row.fields[0].y) <= 1)
      )
    }
  }
  return metrics
}

async function measureDesignContacts(editor, narrow = false) {
  const metrics = await editor.evaluate((node) => ({
    width: node.clientWidth,
    contentWidth: node.scrollWidth,
    height: node.getBoundingClientRect().height,
    rows: [...node.querySelectorAll('.compact-contact-fields')].map((row) => ({
      height: row.getBoundingClientRect().height,
      fields: [...row.querySelectorAll('input:not([type="radio"])')].map(
        (input) => {
          const { x, y, width, height } = input.getBoundingClientRect()
          return { x, y, width, height }
        }
      ),
    })),
  }))
  assert.ok(metrics.contentWidth <= metrics.width + 1, JSON.stringify(metrics))
  for (const row of metrics.rows) {
    assert.equal(row.fields.length, 5)
    assert.ok(
      row.fields.every((field) => field.width >= 90 && field.height >= 34),
      JSON.stringify(metrics)
    )
    if (!narrow) {
      assert.ok(row.height <= 80, JSON.stringify(metrics))
      assert.ok(
        row.fields.every((field) => Math.abs(field.y - row.fields[0].y) <= 1)
      )
    }
  }
  return metrics
}

export function createContactEditorScenarios({
  outputDir,
  customerRuntimeEffectiveSession,
}) {
  const pages = [
    ['customers', '新建客户', 'light'],
    ['suppliers', '新建供应商', 'dark'],
  ].map(([kind, action, themeMode]) => ({
    name: `contact-editor-${kind}`,
    path: `/erp/master/partners/${kind}`,
    auth: 'admin',
    effectiveSession: customerRuntimeEffectiveSession,
    themeMode,
    viewport: { width: 1440, height: 1000 },
    verify: async (page) => {
      await page.getByRole('button', { name: action }).click()
      const editor = page.locator('.erp-contact-editor')
      const rows = editor.locator('.erp-master-contact-list__row')
      await editor.waitFor()
      assert.equal(await rows.count(), 1)
      assert.equal(await editor.getByRole('radio').count(), 0)
      await rows.first().getByLabel('联系人', { exact: true }).fill('小陈')
      await rows.first().getByLabel('职位', { exact: true }).fill('业务联系')
      await editor
        .getByRole('button', { name: '添加联系人', exact: true })
        .click()
      await rows.nth(1).getByLabel('联系人', { exact: true }).fill('小周')
      await rows.nth(1).getByLabel('职位', { exact: true }).fill('收货联系')
      assert.equal(
        await editor.getByRole('radio', { checked: true }).count(),
        1
      )
      await editor
        .getByRole('radio', { name: '设为主联系人 2', exact: true })
        .check()
      assert.equal(
        await editor.getByRole('radio', { checked: true }).count(),
        1
      )
      assert.equal(
        await editor
          .getByRole('textbox', { name: '备注', exact: true })
          .count(),
        0
      )
      await waitForFiniteAnimations(page)
      const metrics = await measureContacts(editor)
      assert.ok(metrics.height < 260, JSON.stringify(metrics))
      await editor.screenshot({
        path: `${outputDir}/contact-editor-${kind}-compact.png`,
      })
    },
  }))

  const roundTrips = ['desktop', 'narrow'].map((size) => ({
    name: `contact-editor-roundtrip-${size}`,
    path: `${fixturePath}${size === 'narrow' ? '?theme=dark' : ''}`,
    viewport: { width: size === 'narrow' ? 390 : 1200, height: 950 },
    beforeNavigate: async (page) => {
      await page.route(`**${fixturePath}*`, (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: fixtureHTML.replace(
            '<html>',
            `<html data-erp-theme="${size === 'narrow' ? 'dark' : 'light'}">`
          ),
        })
      )
    },
    verify: async (page) => {
      const editor = page.locator('.erp-contact-editor')
      const rows = editor.locator('.erp-master-contact-list__row')
      const result = page.getByLabel('保存结果', { exact: true })
      const save = page.getByRole('button', { name: '保存联系人', exact: true })
      await rows.nth(1).waitFor()
      await measureContacts(editor, size === 'narrow')
      await page.getByRole('button', { name: '切换只读', exact: true }).click()
      for (const name of [
        '添加联系人',
        '复制联系人条目 1',
        '移除联系人条目 1',
      ]) {
        assert.equal(
          await editor.getByRole('button', { name, exact: true }).isDisabled(),
          true
        )
      }
      assert.equal(await editor.getByRole('radio').first().isDisabled(), true)
      await page.getByRole('button', { name: '切换只读', exact: true }).click()
      await editor.getByRole('radio').first().focus()
      await page.keyboard.press('ArrowRight')
      assert.equal(await editor.getByRole('radio').nth(1).isChecked(), true)
      assert.equal(
        await editor
          .getByRole('textbox', { name: '备注', exact: true })
          .count(),
        0
      )
      assert.ok(
        (
          await editor
            .locator('.erp-contact-editor__note-summary')
            .first()
            .textContent()
        ).includes('请先电话确认')
      )
      await editor
        .getByRole('radio', { name: '设为主联系人 2', exact: true })
        .check()
      await save.click()
      await page.waitForFunction(
        () =>
          JSON.parse(document.querySelector('pre').textContent)[1].is_primary
      )
      assert.deepEqual(
        JSON.parse(await result.textContent()).map((row) => row.is_primary),
        [false, true]
      )
      await page.getByRole('button', { name: '重新读回', exact: true }).click()
      assert.equal(
        await editor
          .getByRole('radio', { name: '设为主联系人 2', exact: true })
          .isChecked(),
        true
      )
      await editor
        .getByRole('button', { name: '复制联系人条目 1', exact: true })
        .click()
      await rows.nth(2).waitFor()
      await rows
        .nth(1)
        .getByLabel('联系人', { exact: true })
        .fill('小陈的备选联系')
      await save.click()
      await page.waitForFunction(
        () => JSON.parse(document.querySelector('pre').textContent).length === 3
      )
      const copied = JSON.parse(await result.textContent())
      assert.equal(copied[1].id, undefined)
      assert.equal(copied[1].note, copied[0].note)
      assert.equal(copied[2].id, 42)
      await editor
        .getByRole('button', { name: '移除联系人条目 1', exact: true })
        .click()
      assert.equal(
        await rows.first().getByLabel('联系人', { exact: true }).inputValue(),
        '小陈的备选联系'
      )
      assert.equal(
        await editor
          .getByRole('radio', { name: '设为主联系人 2', exact: true })
          .isChecked(),
        true
      )
      await editor
        .getByRole('button', { name: '移除联系人条目 2', exact: true })
        .click()
      assert.equal(await rows.count(), 1)
      assert.equal(await editor.getByRole('radio').count(), 0)
      await editor
        .getByRole('button', { name: '展开联系人备注 1', exact: true })
        .click()
      const note = rows.first().getByLabel('备注', { exact: true })
      assert.equal(await note.inputValue(), '工作日联系\n请先电话确认')
      await note.fill('长备注'.repeat(60))
      await editor
        .getByRole('button', { name: '收起联系人备注 1', exact: true })
        .click()
      await save.click()
      await page.waitForFunction(
        () => JSON.parse(document.querySelector('pre').textContent).length === 1
      )
      assert.equal(JSON.parse(await result.textContent())[0].is_primary, true)
      await page.getByRole('button', { name: '重新读回', exact: true }).click()
      assert.equal(
        await editor
          .getByRole('textbox', { name: '备注', exact: true })
          .count(),
        0
      )
      await editor
        .getByRole('button', { name: '展开联系人备注 1', exact: true })
        .click()
      assert.equal(await note.inputValue(), '长备注'.repeat(60))
      await note.fill('')
      await save.click()
      await page.waitForFunction(
        () =>
          JSON.parse(document.querySelector('pre').textContent)[0].note === ''
      )
      await editor
        .getByRole('button', { name: '收起联系人备注 1', exact: true })
        .click()
      assert.equal(
        await editor.locator('.erp-contact-editor__note-summary').count(),
        0
      )
      await rows.first().getByLabel('联系人', { exact: true }).fill('')
      await save.click()
      await editor.getByText('请填写联系人', { exact: true }).waitFor()
      await rows
        .first()
        .getByLabel('联系人', { exact: true })
        .fill('可读联系人')
      await page.getByRole('button', { name: '切换只读', exact: true }).click()
      assert.equal(
        await rows.first().getByLabel('联系人', { exact: true }).isDisabled(),
        true
      )
      assert.equal(
        await editor
          .getByRole('button', { name: '添加联系人', exact: true })
          .isDisabled(),
        true
      )
      await page.getByRole('button', { name: '切换只读', exact: true }).click()
      await page.getByRole('button', { name: '切换记录', exact: true }).click()
      assert.equal(
        await rows.first().getByLabel('联系人', { exact: true }).inputValue(),
        '另一个客户联系人'
      )
      assert.equal(
        await editor
          .getByRole('textbox', { name: '备注', exact: true })
          .count(),
        0
      )
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1
        ),
        false
      )
      await waitForFiniteAnimations(page)
      await editor.screenshot({
        path: `${outputDir}/contact-editor-roundtrip-${size}.png`,
      })
    },
  }))

  const design = {
    name: 'contact-editor-design',
    path: '/__dev/ui-design',
    viewport: { width: 1920, height: 1000 },
    verify: async (page) => {
      const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
      await frame.getByRole('button', { name: '基础资料', exact: true }).click()
      await frame.getByRole('tab', { name: '客户档案', exact: true }).click()
      await frame.getByRole('button', { name: '新建客户', exact: true }).click()
      const editor = frame.locator('.compact-contacts')
      await frame
        .locator('[data-form-field="party"]')
        .fill('紧凑联系人试用客户')
      await editor.locator('#contact-0-name').fill('小陈')
      await editor
        .getByRole('button', { name: '＋ 添加联系人', exact: true })
        .click()
      await editor.locator('#contact-1-name').fill('小周')
      await editor
        .getByRole('radio', { name: '设为主联系人 2', exact: true })
        .check()
      await editor
        .getByRole('button', { name: '展开联系人备注 1', exact: true })
        .click()
      await editor.locator('#contact-0-note').fill('工作日联系\n先电话确认')
      await editor
        .getByRole('button', { name: '收起联系人备注 1', exact: true })
        .click()
      await editor
        .getByRole('button', { name: '复制联系人 1', exact: true })
        .click()
      await editor
        .getByRole('button', { name: '移除联系人 1', exact: true })
        .click()
      assert.equal(await editor.locator('#contact-0-name').inputValue(), '小陈')
      assert.equal(
        await editor
          .getByRole('radio', { name: '设为主联系人 2', exact: true })
          .isChecked(),
        true
      )
      await frame.getByRole('button', { name: '保存资料', exact: true }).click()
      await frame.getByRole('button', { name: '返回列表', exact: true }).click()
      await frame.locator('#list-search').fill('紧凑联系人试用客户')
      await frame
        .getByRole('row')
        .filter({ hasText: '紧凑联系人试用客户' })
        .dblclick()
      await editor.waitFor()
      assert.equal(await editor.locator('#contact-0-name').inputValue(), '小陈')
      assert.equal(
        await editor
          .getByRole('radio', { name: '设为主联系人 2', exact: true })
          .isChecked(),
        true
      )
      assert.ok(
        (
          await editor.locator('.compact-contact-summary').textContent()
        ).includes('先电话确认')
      )
      await waitForFiniteAnimations(page)
      const metrics = await measureDesignContacts(editor)
      assert.ok(metrics.height < 260, JSON.stringify(metrics))
      await editor.screenshot({
        path: `${outputDir}/contact-editor-design-compact.png`,
      })
      await page.setViewportSize({ width: 1120, height: 1000 })
      await measureDesignContacts(editor, true)
      await editor
        .getByRole('button', { name: '查看联系人备注 1', exact: true })
        .click()
      assert.equal(
        await editor.locator('#contact-0-note').inputValue(),
        '工作日联系\n先电话确认'
      )
      await editor.screenshot({
        path: `${outputDir}/contact-editor-design-narrow.png`,
      })
    },
  }
  return [...pages, ...roundTrips, design]
}
