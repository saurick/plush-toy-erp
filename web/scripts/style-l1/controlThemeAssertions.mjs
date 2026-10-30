import assert from 'node:assert/strict'
import { WORKBENCH_APPEARANCE_STORAGE_KEY } from '../../src/common/theme/erpAppearance.mjs'
import { openERPAppearance } from './themeAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { assertReadableOnBackground } from './colorAssertions.mjs'

async function setRootTheme(page, mode) {
  await openERPAppearance(page)
  const dialog = page.getByRole('dialog', { name: '外观与密度' })
  await dialog.getByText(mode === 'dark' ? '暗色' : '浅色', { exact: true }).click()
  await page.waitForFunction((value) => document.documentElement.dataset.erpTheme === value, mode)
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
}

async function paint(locator) {
  return locator.evaluate((node) => {
    const style = getComputedStyle(node)
    let background = style.backgroundColor
    let parent = node.parentElement
    while (background === 'rgba(0, 0, 0, 0)' && parent) {
      background = getComputedStyle(parent).backgroundColor
      parent = parent.parentElement
    }
    return { color: style.color, background }
  })
}

async function readAnchoredOverlays(page, stage, directory, label) {
  const appearance = (locator) => locator.evaluate((node) => {
    const css = getComputedStyle(node)
    return { color: css.color, background: css.backgroundColor, border: css.border, shadow: css.boxShadow }
  })
  await directory.getByRole('button', { name: /^弹窗与反馈/u }).click()
  await stage.getByLabel('反馈演示场景', { exact: true }).getByText('浮层与确认', { exact: true }).click()
  await stage.getByRole('button', { name: '打开上下文抽屉', exact: true }).hover()
  const tooltip = stage.getByRole('tooltip', { name: '单击查看已有摘要，不离开当前页面', exact: true })
  await tooltip.waitFor()
  await waitForFiniteAnimations(page)
  const tooltipPaint = await appearance(tooltip)
  assertReadableOnBackground(tooltipPaint.color, tooltipPaint.background, `${label}/Tooltip`)
  const arrowColor = await tooltip.evaluate((node) => {
    const arrow = node.closest('.ant-tooltip')?.querySelector('.ant-tooltip-arrow')
    return arrow ? getComputedStyle(arrow, '::before').backgroundColor : null
  })
  assert.equal(arrowColor, tooltipPaint.background, 'Tooltip 箭头与内容使用同一主题底色')
  await page.mouse.move(0, 0)
  await tooltip.waitFor({ state: 'hidden' })

  await directory.getByRole('button', { name: /^筛选与搜索/u }).click()
  const trigger = stage.getByRole('button', { name: /^筛选/u })
  await trigger.focus()
  await trigger.press('Enter')
  const popover = stage.locator('.ant-popover-inner:visible')
  await popover.waitFor()
  await waitForFiniteAnimations(page)
  const popoverPaint = await appearance(popover)
  const text = await paint(popover.locator('legend'))
  assertReadableOnBackground(text.color, text.background, `${label}/Popover 实际文字`)
  await trigger.press('Enter')
  await popover.waitFor({ state: 'hidden' })
  assert(await trigger.evaluate((node) => node === document.activeElement), '筛选气泡关闭后保留触发按钮焦点')
  return { tooltip: tooltipPaint, arrowColor, popover: popoverPaint, text }
}

async function readPreviewPortals(page, stage, label) {
  const result = {}
  const scenes = stage.getByLabel('反馈演示场景', { exact: true })
  const open = async (name) => {
    const trigger = stage.getByRole('button', { name, exact: true })
    await trigger.focus()
    await trigger.press('Enter')
    return trigger
  }
  const record = async (name, surface, text) => {
    await surface.waitFor()
    await waitForFiniteAnimations(page)
    assert(await surface.evaluate((node) => Boolean(node.closest('[data-erp-theme-portal]'))), `${label}/${name} 使用独立主题 portal`)
    const contentPaint = await paint(surface)
    const textPaint = await paint(text)
    assertReadableOnBackground(textPaint.color, textPaint.background, `${label}/${name} 实际文字`)
    result[name] = { surface: contentPaint, text: textPaint }
  }
  const closed = async (dialog, trigger) => {
    await dialog.waitFor({ state: 'hidden' })
    await waitForFiniteAnimations(page)
    assert(await trigger.evaluate((node) => node === document.activeElement), `${label} 关闭后焦点回到触发按钮`)
  }

  await scenes.getByText('编辑与提交', { exact: true }).click()
  const editorTrigger = await open('打开编辑弹窗')
  const editor = page.locator('.erp-business-action-modal--form:visible')
  await record('editor', editor.locator('.ant-modal-content'), editor.getByLabel('说明标题', { exact: true }))
  await page.keyboard.press('Escape')
  await closed(editor, editorTrigger)

  await scenes.getByText('浮层与确认', { exact: true }).click()
  const modalTrigger = await open('打开标准弹窗')
  const modal = page.getByRole('dialog', { name: '共享标准弹窗', exact: true })
  await record('modal', modal.locator('.ant-modal-content'), modal.locator('p'))
  await page.keyboard.press('Escape')
  await closed(modal, modalTrigger)

  const drawerTrigger = await open('打开上下文抽屉')
  const drawer = page.getByRole('dialog', { name: '采购单上下文摘要', exact: true })
  await record('drawer', drawer, drawer.locator('p').first())
  await page.keyboard.press('Escape')
  await closed(drawer, drawerTrigger)

  const confirmTrigger = await open('危险操作确认')
  const confirm = page.locator('.ant-modal-confirm:visible')
  await record('confirm', confirm.locator('.ant-modal-content'), confirm.locator('.ant-modal-confirm-content'))
  await confirm.getByRole('button', { name: '保留草稿', exact: true }).click()
  await closed(confirm, confirmTrigger)

  const panelTrigger = await open('打开单步提示')
  const panel = page.getByRole('alertdialog', { name: '样例状态已说明', exact: true })
  await record('panel', panel.locator('.surface-panel'), panel.locator('[data-app-alert-message]'))
  assert(await page.locator('#root').evaluate((node) => node.inert), '单步提示保留背景隔离')
  assert.equal(await panel.evaluate((node) => Boolean(node.closest('[inert]'))), false, '独立 portal 不被背景隔离禁用')
  await panel.getByRole('button', { name: '知道了', exact: true }).click()
  await closed(panel, panelTrigger)
  assert.equal(await page.locator('#root').evaluate((node) => node.inert), false, '关闭提示释放背景隔离')

  await scenes.getByText('消息与恢复', { exact: true }).click()
  const toastTrigger = await open('短暂成功 Toast')
  const toast = page.locator('.ant-message-notice-content:visible')
  await record('message', toast, toast.getByText('已应用本次样例条件', { exact: true }))
  assert(await toastTrigger.evaluate((node) => node === document.activeElement), '消息不移动焦点')
  await toast.waitFor({ state: 'hidden' })

  await open('持续通知')
  const notice = page.locator('.ant-notification-notice:visible')
  await record('notification', notice, notice.locator('.ant-notification-notice-description'))
  await notice.locator('.ant-notification-notice-close').click()
  await notice.waitFor({ state: 'hidden' })
  return result
}

// Run against both the development entry and the built standalone workbench.
export async function assertControlPreviewThemeIsolation(page) {
  const stage = page.locator('.erp-control-library-stage')
  const directory = page.getByRole('navigation', { name: '控件设计目录' })
  const snapshots = new Map()
  const evidence = []
  for (const rootMode of ['light', 'dark']) {
    await setRootTheme(page, rootMode)
    const rootPreference = await page.evaluate((key) => localStorage.getItem(key), WORKBENCH_APPEARANCE_STORAGE_KEY)
    for (const [localMode, label] of [['light', '浅色'], ['dark', '深色'], ['light', '浅色']]) {
      await directory.getByRole('button', { name: /^按钮与动作/u }).click()
      await stage.getByRole('button', { name: '保存', exact: true }).waitFor()
      await page.getByLabel('控件样例主题', { exact: true }).getByText(label, { exact: true }).click()
      await waitForFiniteAnimations(page)
      assert.equal(await stage.getAttribute('data-erp-theme'), localMode)
      const button = stage.getByRole('button', { name: '保存', exact: true })
      const surface = await paint(stage)
      const primary = await paint(button)
      assertReadableOnBackground(primary.color, primary.background, `样例主按钮 ${rootMode}/${localMode}`)
      assertReadableOnBackground(surface.color, surface.background, `样例背景 ${rootMode}/${localMode}`)
      await button.hover()
      await waitForFiniteAnimations(page)
      const hovered = await paint(button)
      assertReadableOnBackground(hovered.color, hovered.background, `样例主按钮 hover ${rootMode}/${localMode}`)

      await directory.getByRole('button', { name: /^基础输入/u }).click()
      const input = stage.getByRole('textbox', { name: '产品名称', exact: true })
      await input.fill('局部主题切换后的长名称')
      const inputPaint = await paint(input)
      assertReadableOnBackground(inputPaint.color, inputPaint.background, `样例输入 ${rootMode}/${localMode}`)
      const category = stage.getByRole('combobox', { name: '产品类别', exact: true })
      await category.focus()
      await category.press('ArrowDown')
      const popup = stage.locator('.ant-select-dropdown:visible')
      await popup.waitFor()
      await waitForFiniteAnimations(page)
      const popupPaint = await paint(popup)
      const option = popup.locator('.ant-select-item-option-content').filter({ hasText: /^挂件$/u })
      const optionPaint = await paint(option)
      assertReadableOnBackground(optionPaint.color, popupPaint.background, `样例下拉浮层 ${rootMode}/${localMode}`)
      await option.click()
      await popup.waitFor({ state: 'hidden' })
      assert.equal(await input.inputValue(), '局部主题切换后的长名称')
      assert.equal(await stage.locator('.ant-select-selection-item').innerText(), '挂件')

      const anchored = await readAnchoredOverlays(page, stage, directory, `${rootMode}/${localMode}`)
      await directory.getByRole('button', { name: /^弹窗与反馈/u }).click()
      const portals = await readPreviewPortals(page, stage, `${rootMode}/${localMode}`)
      const result = { surface, primary, hovered, input: inputPaint, popup: popupPaint, option: optionPaint.color, anchored, portals }
      if (snapshots.has(localMode)) {
        assert.deepEqual(result, snapshots.get(localMode), `局部 ${localMode} 主题不应受外层主题或往返切换污染`)
      } else snapshots.set(localMode, result)
      assert.equal(await page.evaluate(() => document.documentElement.dataset.erpTheme), rootMode)
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), WORKBENCH_APPEARANCE_STORAGE_KEY), rootPreference, '局部预览不写入工作台偏好')
      evidence.push({ rootMode, localMode, ...result })
    }
  }
  return evidence
}
