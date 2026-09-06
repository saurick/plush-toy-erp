import { assertAntdModalCentered } from './modalAssertions.mjs'
import {
  expectHeading,
  expectText,
  assertTextAbsent,
  assertButtonDisabled,
} from './pageAssertions.mjs'
import assert from 'node:assert/strict'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

export function createBusinessListAssertions({ outputDir }) {
  async function assertOrderLifecycleActionsConsolidated(
    page,
    {
      scenarioName,
      primaryActionLabel,
      menuActionLabels = [],
      absentButtonLabels = [],
    }
  ) {
    const compactText = (value) => String(value || '').replace(/\s+/gu, '')
    const looseTextPattern = (value) =>
      new RegExp(
        String(value || '')
          .split('')
          .map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('\\s*'),
        'u'
      )
    const actionBar = page
      .locator('.erp-business-module-current-action')
      .first()
    await actionBar.waitFor({ state: 'visible', timeout: 10_000 })
    const primaryButton = actionBar.getByRole('button', {
      name: looseTextPattern(primaryActionLabel),
    })
    try {
      await primaryButton.waitFor({ state: 'visible', timeout: 10_000 })
    } catch (_error) {
      const currentMetrics = await actionBar.evaluate((element) => ({
        textContent: String(element.textContent || '')
          .replace(/\s+/g, ' ')
          .trim(),
        buttons: Array.from(element.querySelectorAll('button')).map(
          (button) => ({
            text: String(button.textContent || '')
              .replace(/\s+/g, ' ')
              .trim(),
            disabled: button.disabled,
            ariaLabel: button.getAttribute('aria-label') || '',
          })
        ),
        tags: Array.from(element.querySelectorAll('.ant-tag')).map((tag) =>
          String(tag.textContent || '')
            .replace(/\s+/g, ' ')
            .trim()
        ),
      }))
      throw new Error(
        `${scenarioName} 未找到主状态动作“${primaryActionLabel}”: ${JSON.stringify(
          currentMetrics
        )}`
      )
    }

    const directButtonTexts = (
      await actionBar.evaluate((element) =>
        Array.from(element.querySelectorAll('button')).map((button) =>
          String(button.textContent || '')
        )
      )
    ).map(compactText)
    for (const label of absentButtonLabels) {
      assert.equal(
        directButtonTexts.includes(compactText(label)),
        false,
        `${scenarioName} 不应继续把“${label}”作为横排状态按钮展示: ${JSON.stringify(
          directButtonTexts
        )}`
      )
    }

    const menuButton = actionBar
      .getByRole('button', { name: /更多操作/ })
      .first()
    await menuButton.waitFor({ state: 'visible', timeout: 10_000 })
    await menuButton.click()
    const menuDropdown = page
      .locator('.ant-dropdown:not(.ant-dropdown-hidden)')
      .filter({ hasText: '状态变更' })
      .last()
    await menuDropdown.waitFor({ state: 'visible', timeout: 10_000 })
    await menuDropdown.getByText('状态变更', { exact: true }).waitFor({
      state: 'visible',
      timeout: 10_000,
    })
    for (const label of menuActionLabels) {
      await menuDropdown
        .getByRole('menuitem', { name: looseTextPattern(label) })
        .waitFor({ state: 'visible', timeout: 10_000 })
    }

    const metrics = await actionBar.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const buttons = Array.from(element.querySelectorAll('button')).map(
        (button) => {
          const buttonRect = button.getBoundingClientRect()
          return {
            text: String(button.textContent || '')
              .replace(/\s+/g, ' ')
              .trim(),
            disabled: button.disabled,
            width: buttonRect.width,
            height: buttonRect.height,
            left: buttonRect.left,
            right: buttonRect.right,
          }
        }
      )
      return {
        width: rect.width,
        height: rect.height,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        buttons,
      }
    })

    assert(
      metrics.scrollWidth <= metrics.clientWidth + 2,
      `${scenarioName} 状态动作收口后不应造成横向溢出: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.buttons.every((item) => item.width > 0 && item.height > 0),
      `${scenarioName} 状态动作按钮应保持可见尺寸: ${JSON.stringify(metrics)}`
    )
    await page.keyboard.press('Escape')
  }

  async function _assertBusinessSelectionActionBarBoxModel(
    page,
    { scenarioName, expectedMode }
  ) {
    const metrics = await page.evaluate(() => {
      const rectOf = (selector, root = document) => {
        const element = root.querySelector(selector)
        if (!(element instanceof HTMLElement)) return null
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return {
          className: element.className,
          text: element.textContent?.replace(/\s+/g, ' ').trim() || '',
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          display: style.display,
          alignItems: style.alignItems,
          flexWrap: style.flexWrap,
        }
      }
      const actionBar = document.querySelector(
        '.erp-business-module-current-action'
      )
      const actionBarMetrics =
        actionBar instanceof HTMLElement
          ? {
              ...rectOf('.erp-business-module-current-action'),
              hasEmptyClass: actionBar.classList.contains(
                'erp-business-selection-action-bar--empty'
              ),
              hasActiveClass: actionBar.classList.contains(
                'erp-business-selection-action-bar--active'
              ),
            }
          : null

      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        documentWidth: document.documentElement.scrollWidth,
        actionBar: actionBarMetrics,
        row: actionBar
          ? rectOf('.erp-business-selection-action-bar__row', actionBar)
          : null,
        copy: actionBar
          ? rectOf('.erp-business-selection-action-bar__copy', actionBar)
          : null,
        tag: actionBar
          ? rectOf('.erp-business-selection-action-bar__tag', actionBar)
          : null,
        primary: actionBar
          ? rectOf('.erp-business-selection-action-bar__primary', actionBar)
          : null,
        actions: actionBar
          ? rectOf('.erp-business-selection-action-bar__actions', actionBar)
          : null,
        tableCard: rectOf('.erp-business-module-table-card'),
      }
    })

    assert(
      metrics.actionBar,
      `${scenarioName} 缺少业务选中操作条: ${JSON.stringify(metrics)}`
    )
    assert(
      expectedMode === 'empty'
        ? metrics.actionBar.hasEmptyClass && !metrics.actionBar.hasActiveClass
        : metrics.actionBar.hasActiveClass,
      `${scenarioName} 选中操作条状态类异常: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.row?.flexWrap === 'nowrap' || metrics.row?.display === 'flex',
      `${scenarioName} 选中操作条行布局异常: ${JSON.stringify(metrics)}`
    )
    if (metrics.viewport.width > 768) {
      assert.equal(
        metrics.row?.alignItems,
        'center',
        `${scenarioName} 桌面当前操作行左右区域应上下居中对齐: ${JSON.stringify(metrics)}`
      )
    }
    if (metrics.viewport.width > 768 && expectedMode === 'empty') {
      const primaryCenter =
        metrics.primary && (metrics.primary.top + metrics.primary.bottom) / 2
      const actionsCenter =
        metrics.actions && (metrics.actions.top + metrics.actions.bottom) / 2
      assert(
        Number.isFinite(primaryCenter) &&
          Number.isFinite(actionsCenter) &&
          Math.abs(primaryCenter - actionsCenter) <= 2,
        `${scenarioName} 未选中态当前操作文字与右侧按钮未在同一中线: ${JSON.stringify(metrics)}`
      )
    }
    assert(
      metrics.actionBar.scrollWidth <= metrics.actionBar.clientWidth + 2,
      `${scenarioName} 选中操作条出现横向溢出: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.actions.scrollWidth <= metrics.actions.clientWidth + 2,
      `${scenarioName} 选中操作按钮区出现横向溢出: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.documentWidth <= metrics.viewport.width + 2,
      `${scenarioName} 页面出现横向滚动: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.tableCard?.top > metrics.actionBar.bottom,
      `${scenarioName} 表格卡片与选中操作条发生重叠: ${JSON.stringify(metrics)}`
    )
  }

  async function assertBusinessListEmptySearchState(
    page,
    { scenarioName, searchPlaceholder, emptyText, staleText }
  ) {
    await page.getByText(staleText, { exact: false }).first().click()
    await _assertBusinessSelectionActionBarBoxModel(page, {
      scenarioName: `${scenarioName}-selected`,
      expectedMode: 'active',
    })

    const searchInput = page.getByPlaceholder(searchPlaceholder).first()
    await searchInput.fill(`NO-MATCH-${scenarioName}`)
    await page.keyboard.press('Enter')
    await page
      .waitForFunction(
        ({ expectedEmptyText }) => {
          const tableCard = document.querySelector(
            '.erp-business-module-table-card'
          )
          const placeholder = tableCard?.querySelector('.ant-table-placeholder')
          const dataRows = Array.from(
            tableCard?.querySelectorAll(
              '.ant-table-tbody > tr.ant-table-row'
            ) || []
          ).filter((row) => !row.classList.contains('ant-table-placeholder'))
          return (
            placeholder?.textContent?.includes(expectedEmptyText) &&
            dataRows.length === 0
          )
        },
        { expectedEmptyText: emptyText },
        { timeout: 10_000 }
      )
      .catch((error) => {
        throw new Error(
          `${scenarioName} 等待表格空态“${emptyText}”超时: ${error.message}`
        )
      })

    const metrics = await page.evaluate(
      ({ expectedEmptyText, previousText }) => {
        const actionBar = document.querySelector(
          '.erp-business-module-current-action'
        )
        const tableCard = document.querySelector(
          '.erp-business-module-table-card'
        )
        const placeholder = tableCard?.querySelector('.ant-table-placeholder')
        const dataRows = Array.from(
          tableCard?.querySelectorAll('.ant-table-tbody > tr.ant-table-row') ||
            []
        ).filter((row) => !row.classList.contains('ant-table-placeholder'))
        const actionBarRect = actionBar?.getBoundingClientRect()
        const tableRect = tableCard?.getBoundingClientRect()
        return {
          actionText: actionBar?.textContent?.replace(/\s+/g, ' ').trim() || '',
          actionHasEmptyClass:
            actionBar?.classList.contains(
              'erp-business-selection-action-bar--empty'
            ) || false,
          actionHasActiveClass:
            actionBar?.classList.contains(
              'erp-business-selection-action-bar--active'
            ) || false,
          placeholderText:
            placeholder?.textContent?.replace(/\s+/g, ' ').trim() || '',
          dataRowCount: dataRows.length,
          staleTextInAction:
            actionBar?.textContent?.includes(previousText) || false,
          staleTextInTable:
            tableCard?.textContent?.includes(previousText) || false,
          documentOverflow:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
          actionBottom: actionBarRect?.bottom || 0,
          tableTop: tableRect?.top || 0,
          expectedEmptyText,
        }
      },
      { expectedEmptyText: emptyText, previousText: staleText }
    )

    assert(
      metrics.placeholderText.includes(emptyText),
      `${scenarioName} 表格空态文案异常: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.dataRowCount,
      0,
      `${scenarioName} 搜索空结果时不应保留数据行: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.actionHasEmptyClass && !metrics.actionHasActiveClass,
      `${scenarioName} 搜索空结果后当前操作条应回到未选中态: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.staleTextInAction,
      false,
      `${scenarioName} 搜索空结果后当前操作条不应保留旧选中记录: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.staleTextInTable,
      false,
      `${scenarioName} 搜索空结果表格不应保留旧记录文本: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.documentOverflow,
      0,
      `${scenarioName} 空态不应造成页面级横向溢出: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.tableTop > metrics.actionBottom,
      `${scenarioName} 空态表格不应覆盖当前操作条: ${JSON.stringify(metrics)}`
    )

    await searchInput.fill('')
    await page.keyboard.press('Enter')
    await expectText(page, staleText)
  }

  async function assertShellRefreshButton(
    page,
    { scenarioName, expectVisible }
  ) {
    const metrics = await page.evaluate(() => {
      const isVisible = (node) => {
        if (!(node instanceof HTMLElement)) return false
        const rect = node.getBoundingClientRect()
        const style = window.getComputedStyle(node)
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0
        )
      }
      const buttons = Array.from(
        document.querySelectorAll('.erp-admin-header button')
      ).filter(
        (button) =>
          isVisible(button) &&
          String(button.textContent || '').trim() === '刷新当前页'
      )

      return {
        count: buttons.length,
        hasIcon: buttons.some((button) =>
          Boolean(button.querySelector('.anticon'))
        ),
      }
    })

    if (!expectVisible) {
      assert.equal(
        metrics.count,
        0,
        `${scenarioName} 壳层不应显示全局刷新按钮: ${JSON.stringify(metrics)}`
      )
      return
    }

    assert.equal(
      metrics.count,
      1,
      `${scenarioName} 壳层刷新按钮数量异常: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.hasIcon,
      `${scenarioName} 壳层刷新按钮缺少图标: ${JSON.stringify(metrics)}`
    )
  }

  async function assertNoDuplicatedAdminPageTitle(page, { scenarioName }) {
    const metrics = await page.evaluate(() => {
      const isVisible = (node) => {
        if (!(node instanceof HTMLElement)) return false
        const rect = node.getBoundingClientRect()
        const style = window.getComputedStyle(node)
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0
        )
      }
      const visiblePageHeads = Array.from(
        document.querySelectorAll('.erp-admin-page-head')
      )
        .filter(isVisible)
        .map((node) =>
          String(node.textContent || '')
            .replace(/\s+/g, ' ')
            .trim()
        )
      const outletErpLabels = Array.from(
        document.querySelectorAll('.erp-admin-outlet *')
      )
        .filter(isVisible)
        .map((node) =>
          String(node.textContent || '')
            .replace(/\s+/g, ' ')
            .trim()
        )
        .filter((text) => /^ERP\s*\//u.test(text))

      return {
        visiblePageHeads,
        outletErpLabels,
      }
    })

    assert.equal(
      metrics.visiblePageHeads.length,
      0,
      `${scenarioName} 自包含页面不应再渲染共享 page-head: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.outletErpLabels.length,
      0,
      `${scenarioName} 页面内容区不应重复渲染 ERP 面包屑式小标题: ${JSON.stringify(metrics)}`
    )
  }

  async function verifyBusinessModuleColumnOrderDialog(
    page,
    {
      moduleKey = 'project-orders',
      heading = '订单/款式立项',
      headerMenuTargetLabel = '',
    } = {}
  ) {
    const storageKey = `erp.module.column-order.${moduleKey}`
    await page.evaluate((key) => {
      window.localStorage.removeItem(key)
    }, storageKey)
    await verifyBusinessModuleColumnOrderHeaderMenu(page, {
      storageKey,
      targetLabel: headerMenuTargetLabel,
    })
    const primaryToolbarActions = page
      .locator('.erp-business-operation-panel__actions')
      .first()
    await primaryToolbarActions.getByRole('button', { name: /列顺序/ }).click()
    const dialog = page.locator('.erp-business-action-modal--columns:visible')
    await dialog.waitFor({ state: 'visible', timeout: 10_000 })
    await assertAntdModalCentered(page, dialog, 'business-column-order-modal')
    await expectText(page, '调整后的列顺序会保存到当前账号')
    await dialog.screenshot({
      path: path.resolve(outputDir, 'business-column-order-modal.png'),
    })
    await page.evaluate((key) => {
      window.localStorage.removeItem(key)
    }, storageKey)

    const moveFirstButtons = dialog.locator('button[aria-label$="移到最前"]')
    const moveUpButtons = dialog.locator('button[aria-label$="上移"]')
    const moveDownButtons = dialog.locator('button[aria-label$="下移"]')
    const moveLastButtons = dialog.locator('button[aria-label$="移到最后"]')
    const buttonCount = await moveFirstButtons.count()
    assert(buttonCount >= 2, '列顺序面板未渲染“移到最前”按钮')
    assert.equal(
      await moveUpButtons.count(),
      buttonCount,
      '列顺序面板“上移”按钮数量不完整'
    )
    assert.equal(
      await moveDownButtons.count(),
      buttonCount,
      '列顺序面板“下移”按钮数量不完整'
    )
    assert.equal(
      await moveLastButtons.count(),
      buttonCount,
      '列顺序面板“移到最前/最后”按钮数量不一致'
    )
    assert(
      await moveFirstButtons.nth(0).isDisabled(),
      '首列“移到最前”边界禁用异常'
    )
    assert(await moveUpButtons.nth(0).isDisabled(), '首列“上移”边界禁用异常')
    assert(
      await moveDownButtons.nth(buttonCount - 1).isDisabled(),
      '末列“下移”边界禁用异常'
    )
    assert(
      await moveLastButtons.nth(buttonCount - 1).isDisabled(),
      '末列“移到最后”边界禁用异常'
    )

    const moveFirstLabel = await moveFirstButtons
      .nth(1)
      .getAttribute('aria-label')
    assert(Boolean(moveFirstLabel), '未读取到可移动列的“移到最前”标签')
    await moveFirstButtons.nth(1).click()
    await page.waitForFunction((label) => {
      const target = [...document.querySelectorAll('button[aria-label]')].find(
        (button) => button.getAttribute('aria-label') === label
      )
      return Boolean(target?.disabled)
    }, moveFirstLabel)

    const enabledMoveLastButton = dialog
      .locator('button[aria-label$="移到最后"]:not([disabled])')
      .first()
    await enabledMoveLastButton.waitFor({ state: 'visible', timeout: 10_000 })
    const moveLastLabel = await enabledMoveLastButton.getAttribute('aria-label')
    assert(Boolean(moveLastLabel), '未读取到可移动列的“移到最后”标签')
    await enabledMoveLastButton.click()
    await page.waitForFunction((label) => {
      const target = [...document.querySelectorAll('button[aria-label]')].find(
        (button) => button.getAttribute('aria-label') === label
      )
      return Boolean(target?.disabled)
    }, moveLastLabel)

    const storedOrderBeforeDone = await page.evaluate((key) => {
      return window.localStorage.getItem(key)
    }, storageKey)
    assert.equal(
      storedOrderBeforeDone,
      null,
      '列顺序面板点击移动后不应在完成前写入本地缓存'
    )

    const finishButtons = dialog
      .locator('.ant-modal-footer button')
      .filter({ hasText: /完\s*成/u })
    assert.equal(
      await finishButtons.count(),
      1,
      '列顺序弹窗应只有一个“完成”按钮'
    )
    assert.equal(
      await finishButtons.first().isDisabled(),
      false,
      '列顺序弹窗“完成”按钮不应处于禁用态'
    )
    const finishButtonBox = await finishButtons.first().boundingBox()
    assert(
      finishButtonBox &&
        finishButtonBox.width > 0 &&
        finishButtonBox.height > 0,
      `列顺序弹窗“完成”按钮不可见: ${JSON.stringify(finishButtonBox)}`
    )
    await finishButtons.first().click()
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 })

    const storedOrder = await page.evaluate((key) => {
      return window.localStorage.getItem(key)
    }, storageKey)
    assert(Boolean(storedOrder), '列顺序面板点击完成后未写入本地缓存兜底')

    await primaryToolbarActions.getByRole('button', { name: /列顺序/ }).click()
    await dialog.waitFor({ state: 'visible', timeout: 10_000 })
    const persistedDialogBoundaryLabels = await page.evaluate(() => {
      return {
        firstDisabled:
          document
            .querySelector('button[aria-label$="移到最前"]:disabled')
            ?.getAttribute('aria-label') || '',
        lastDisabled:
          document
            .querySelector('button[aria-label$="移到最后"]:disabled')
            ?.getAttribute('aria-label') || '',
      }
    })
    assert(
      persistedDialogBoundaryLabels.firstDisabled &&
        persistedDialogBoundaryLabels.lastDisabled,
      '列顺序面板未读取到当前边界列标签'
    )

    await dialog.locator('.ant-modal-close').click()
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 })

    await page.evaluate((key) => {
      window.localStorage.removeItem(key)
    }, storageKey)
    await page.reload({ waitUntil: 'networkidle' })
    await expectHeading(page, heading)
    await primaryToolbarActions.getByRole('button', { name: /列顺序/ }).click()
    await dialog.waitFor({ state: 'visible', timeout: 10_000 })
    await assertAntdModalCentered(
      page,
      dialog,
      'business-column-order-modal-restored'
    )

    const restoredBoundaryLabels = await page.evaluate(() => {
      return {
        firstDisabled:
          document
            .querySelector('button[aria-label$="移到最前"]:disabled')
            ?.getAttribute('aria-label') || '',
        lastDisabled:
          document
            .querySelector('button[aria-label$="移到最后"]:disabled')
            ?.getAttribute('aria-label') || '',
      }
    })
    assert.equal(
      restoredBoundaryLabels.firstDisabled,
      persistedDialogBoundaryLabels.firstDisabled,
      '清空本地缓存后未从账号偏好恢复首列顺序'
    )
    assert.equal(
      restoredBoundaryLabels.lastDisabled,
      persistedDialogBoundaryLabels.lastDisabled,
      '清空本地缓存后未从账号偏好恢复末列顺序'
    )
    await dialog.locator('.ant-modal-close').click()
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 })
  }

  async function verifyBusinessModuleColumnOrderHeaderMenu(
    page,
    { storageKey, targetLabel = '' }
  ) {
    const headerLabelsBefore = await readBusinessModuleHeaderLabels(page)
    assert(
      headerLabelsBefore.length >= 2,
      `表头列顺序菜单缺少可调整列样本: ${JSON.stringify(headerLabelsBefore)}`
    )
    assert(
      !headerLabelsBefore.includes('下一步'),
      `正式业务页列表不应展示施工型“下一步”列: ${JSON.stringify(headerLabelsBefore)}`
    )

    const headerTriggers = page.locator(
      '.erp-business-data-table-card .erp-module-column-header-trigger'
    )
    const requestedTargetIndex = targetLabel
      ? headerLabelsBefore.indexOf(targetLabel)
      : 1
    const targetIndex = requestedTargetIndex > 0 ? requestedTargetIndex : 1
    const expectedFirstLabel = headerLabelsBefore[targetIndex]
    assert(
      expectedFirstLabel,
      `表头列顺序菜单未找到可移动目标列: ${JSON.stringify({ targetLabel, headerLabelsBefore })}`
    )
    const clickHeaderTrigger = async (index) => {
      const trigger = headerTriggers.nth(index)
      await trigger.waitFor({ state: 'visible', timeout: 10_000 })
      await trigger.click()
    }
    await clickHeaderTrigger(targetIndex)

    const menu = page.locator('.ant-dropdown:not(.ant-dropdown-hidden)').last()
    await menu
      .getByText('左移一列')
      .waitFor({ state: 'visible', timeout: 10_000 })
    await menu
      .getByText('右移一列')
      .waitFor({ state: 'visible', timeout: 10_000 })
    await menu
      .getByText('移到最前')
      .waitFor({ state: 'visible', timeout: 10_000 })
    await menu
      .getByText('移到最后')
      .waitFor({ state: 'visible', timeout: 10_000 })
    await menu
      .getByText('打开列顺序面板')
      .waitFor({ state: 'visible', timeout: 10_000 })
    assert.equal(
      await page.getByRole('dialog', { name: '调整列表列顺序' }).count(),
      0,
      '点击表头列设置应先打开快捷菜单，不应直接弹出列顺序面板'
    )

    const headerColumnOrderSync = waitForAdminColumnOrderSync(page)
    await menu.getByText('移到最前').click()
    await headerColumnOrderSync
    await page.waitForFunction(
      ({ expectedFirstLabel }) => {
        const firstLabel = document.querySelector(
          '.erp-business-data-table-card .erp-module-column-header-text'
        )
        return (
          String(firstLabel?.textContent || '').trim() === expectedFirstLabel
        )
      },
      { expectedFirstLabel }
    )

    const storedOrder = await page.evaluate((key) => {
      return window.localStorage.getItem(key)
    }, storageKey)
    assert(Boolean(storedOrder), '表头快捷调整后未写入本地缓存兜底')

    await clickHeaderTrigger(0)
    await menu
      .getByText('打开列顺序面板')
      .waitFor({ state: 'visible', timeout: 10_000 })
    await menu.getByText('打开列顺序面板').click()
    const dialog = page.getByRole('dialog', { name: '调整列表列顺序' })
    await dialog.waitFor({ state: 'visible', timeout: 10_000 })
    await dialog.locator('.ant-modal-close').click()
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 })
  }

  function waitForAdminColumnOrderSync(page) {
    return page.waitForResponse((response) => {
      if (!response.url().includes('/rpc/admin')) {
        return false
      }
      try {
        return (
          response.request().postDataJSON()?.method === 'set_erp_column_order'
        )
      } catch {
        return false
      }
    })
  }

  async function readBusinessModuleHeaderLabels(page) {
    return page.evaluate(() =>
      Array.from(
        document.querySelectorAll(
          '.erp-business-data-table-card .erp-module-column-header-text'
        )
      )
        .map((node) => String(node.textContent || '').trim())
        .filter(Boolean)
    )
  }

  async function verifySourceImportPicker(
    page,
    {
      parentModal,
      triggerButton,
      titleText,
      expectedTexts = [],
      emptyDescriptionText = '暂无可导入记录',
      collapseSelectTexts = [],
      selectText,
      importAndExpectText,
      selectedNoun = '来源',
      scenarioName,
    }
  ) {
    const trigger = parentModal
      .getByRole('button', { name: triggerButton })
      .first()
    await trigger.focus()
    await page.keyboard.press('Enter')
    const picker = page
      .locator('.erp-source-import-picker-modal.ant-modal:visible')
      .last()
    await picker.waitFor({ state: 'visible', timeout: 10_000 })
    await expectText(page, titleText)
    await page.waitForFunction(
      (text) => {
        const modals = Array.from(
          document.querySelectorAll('.erp-source-import-picker-modal.ant-modal')
        ).filter((node) => {
          const rect = node.getBoundingClientRect()
          const style = window.getComputedStyle(node)
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            node.textContent?.includes(text)
          )
        })
        const modalNode = modals.at(-1)
        const root = modalNode?.closest('.ant-modal-root') || modalNode
        return (
          modalNode &&
          document.activeElement instanceof Element &&
          root?.contains(document.activeElement) &&
          document.activeElement !== document.body
        )
      },
      titleText,
      { timeout: 2_000 }
    )
    const metrics = await picker.evaluate((node) => {
      const body = node.querySelector('.ant-modal-body')
      const table = node.querySelector('.ant-table')
      const root = node.closest('.ant-modal-root') || node
      const { activeElement } = document
      const dialog = node.closest('[role="dialog"]') || node
      const visibleModals = Array.from(
        document.querySelectorAll('.ant-modal')
      ).filter((modal) => {
        const rect = modal.getBoundingClientRect()
        const style = window.getComputedStyle(modal)
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        )
      }).length
      return {
        textContent: node.textContent?.replace(/\s+/g, ' ').trim() || '',
        body: body
          ? {
              clientWidth: body.clientWidth,
              scrollWidth: body.scrollWidth,
            }
          : null,
        hasTable: Boolean(table),
        hasEllipsisCell: Boolean(
          node.querySelector('.ant-table-cell-ellipsis')
        ),
        hasPagination: Boolean(
          node.querySelector('.erp-source-import-picker__pagination')
        ),
        hasPageControls: Boolean(node.querySelector('.ant-pagination')),
        selectionTop: node
          .querySelector('.erp-source-import-picker__selection')
          ?.getBoundingClientRect?.().top,
        tableTop: table?.getBoundingClientRect?.().top,
        visibleModalCount: visibleModals,
        ariaModal:
          dialog.getAttribute('aria-modal') ||
          node.getAttribute('aria-modal') ||
          '',
        activeTagName: activeElement?.tagName || '',
        activeClassName: String(activeElement?.className || ''),
        activeInsidePicker:
          activeElement instanceof Element && root.contains(activeElement),
        activeIsBody: activeElement === document.body,
      }
    })
    assert.equal(
      metrics.ariaModal,
      'true',
      `${scenarioName} 来源导入选择器应声明 aria-modal=true: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.activeInsidePicker && !metrics.activeIsBody,
      `${scenarioName} 来源导入选择器打开后焦点未进入弹窗: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.body && metrics.body.scrollWidth <= metrics.body.clientWidth + 1,
      `${scenarioName} 来源导入选择器出现横向溢出: ${JSON.stringify(metrics)}`
    )
    assert(metrics.hasTable, `${scenarioName} 来源导入选择器缺少表格`)
    assert.equal(
      metrics.hasEllipsisCell,
      false,
      `${scenarioName} 来源导入表格不应默认省略关键列: ${JSON.stringify(metrics)}`
    )
    assert(metrics.hasPagination, `${scenarioName} 来源导入选择器缺少分页`)
    await expectText(page, `未选择${selectedNoun}`)
    assert.equal(
      await picker.getByRole('button', { name: '清空已选' }).count(),
      0,
      `${scenarioName} 未选择来源时不应显示清空已选按钮`
    )
    assert(
      metrics.selectionTop > 0 &&
        metrics.tableTop > 0 &&
        metrics.selectionTop < metrics.tableTop,
      `${scenarioName} 默认已选摘要应固定在表格上方: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.textContent.includes('共') && metrics.textContent.includes('条'),
      `${scenarioName} 来源导入分页应显示总数: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.visibleModalCount <= 2,
      `${scenarioName} 来源导入不应超过两层弹窗: ${JSON.stringify(metrics)}`
    )
    for (const expectedText of expectedTexts) {
      assert(
        metrics.textContent.includes(expectedText),
        `${scenarioName} 来源导入选择器缺少 ${expectedText}: ${JSON.stringify(metrics)}`
      )
    }

    const selectedSummaryVisibleLimit = 2
    const findSourceRow = async (rowText) => {
      const firstPageButton = picker.locator('.ant-pagination-item-1').first()
      if ((await firstPageButton.count()) > 0) {
        await firstPageButton.click({ force: true })
      }
      for (let pageIndex = 0; pageIndex < 12; pageIndex += 1) {
        const row = picker
          .locator('.ant-table-row')
          .filter({ hasText: rowText })
          .first()
        if ((await row.count()) > 0 && (await row.isVisible())) {
          return row
        }
        const nextButton = picker.locator('.ant-pagination-next').first()
        const nextDisabled =
          (await nextButton.count()) === 0 ||
          (await nextButton.evaluate((node) =>
            node.classList.contains('ant-pagination-disabled')
          ))
        if (nextDisabled) break
        await nextButton.click({ force: true })
      }
      throw new Error(`${scenarioName} 来源导入分页中找不到 ${rowText}`)
    }

    const assertCollapsedSelectionPopover = async (expectedSelectedTexts) => {
      await expectText(page, `已选 ${expectedSelectedTexts.length} 条`)
      await expectText(
        page,
        `+${expectedSelectedTexts.length - selectedSummaryVisibleLimit}`
      )

      const moreTag = picker
        .locator('.erp-source-import-picker__selection-more')
        .last()
      await moreTag.click()
      const selectedPopover = page
        .locator('.erp-source-import-picker__selected-popover')
        .last()
      await selectedPopover.waitFor({ state: 'visible', timeout: 10_000 })
      const popoverMetrics = await selectedPopover.evaluate((node) => ({
        textContent: node.textContent?.replace(/\s+/g, ' ').trim() || '',
        itemCount: node.querySelectorAll(
          '.erp-source-import-picker__selected-popover-item'
        ).length,
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
      }))
      assert.equal(
        popoverMetrics.itemCount,
        expectedSelectedTexts.length,
        `${scenarioName} +N 弹层应显示全部已选项: ${JSON.stringify(
          popoverMetrics
        )}`
      )
      assert(
        popoverMetrics.scrollWidth <= popoverMetrics.clientWidth + 1,
        `${scenarioName} +N 弹层出现横向溢出: ${JSON.stringify(popoverMetrics)}`
      )
      for (const expectedSelectedText of expectedSelectedTexts) {
        assert(
          popoverMetrics.textContent.includes(expectedSelectedText),
          `${scenarioName} +N 弹层缺少 ${expectedSelectedText}: ${JSON.stringify(
            popoverMetrics
          )}`
        )
      }

      await picker.locator('.ant-input').first().click({ force: true })
      await selectedPopover.waitFor({ state: 'hidden', timeout: 10_000 })
    }

    if (collapseSelectTexts.length > selectedSummaryVisibleLimit) {
      for (const [index, collapseSelectText] of collapseSelectTexts.entries()) {
        const sourceRow = await findSourceRow(collapseSelectText)
        await sourceRow
          .locator('.ant-checkbox-wrapper, .ant-radio-wrapper')
          .first()
          .click()
        if (index === selectedSummaryVisibleLimit) {
          await assertCollapsedSelectionPopover(
            collapseSelectTexts.slice(0, selectedSummaryVisibleLimit + 1)
          )
        }
      }

      await assertCollapsedSelectionPopover(collapseSelectTexts)
      await picker.getByRole('button', { name: '清空已选' }).click({
        force: true,
      })
      await assertTextAbsent(page, `已选 ${collapseSelectTexts.length} 条`)
      await expectText(page, `未选择${selectedNoun}`)
    }

    if (selectText) {
      const sourceRow = await findSourceRow(selectText)
      const selectorControl = sourceRow
        .locator('.ant-checkbox-wrapper, .ant-radio-wrapper')
        .first()
      await selectorControl.click()
      await expectText(page, '已选 1 条')
      await expectText(page, '清空已选')
      const clearSelectionButton = picker.getByRole('button', {
        name: '清空已选',
      })
      const clearSelectionBorder = await clearSelectionButton.evaluate(
        (button) => {
          const style = window.getComputedStyle(button)
          return {
            borderColor: style.borderColor,
            borderWidth: style.borderWidth,
            boxShadow: style.boxShadow,
          }
        }
      )
      assert(
        (clearSelectionBorder.borderColor === 'rgba(0, 0, 0, 0)' ||
          clearSelectionBorder.borderColor === 'transparent') &&
          clearSelectionBorder.boxShadow === 'none',
        `${scenarioName} 清空已选按钮默认不应显示边框: ${JSON.stringify(
          clearSelectionBorder
        )}`
      )
      await clearSelectionButton.hover()
      const clearSelectionHoverBorder = await clearSelectionButton.evaluate(
        (button) => {
          const style = window.getComputedStyle(button)
          return {
            borderColor: style.borderColor,
            borderWidth: style.borderWidth,
            boxShadow: style.boxShadow,
          }
        }
      )
      const hasVisibleHoverFrame =
        clearSelectionHoverBorder.boxShadow !== 'none' ||
        (clearSelectionHoverBorder.borderWidth !== '0px' &&
          clearSelectionHoverBorder.borderColor !== 'rgba(0, 0, 0, 0)' &&
          clearSelectionHoverBorder.borderColor !== 'transparent')
      assert(
        hasVisibleHoverFrame,
        `${scenarioName} 清空已选按钮 hover 时应显示边框: ${JSON.stringify(
          clearSelectionHoverBorder
        )}`
      )
      const selectedMetrics = await picker.evaluate((node) => {
        const selection = node.querySelector(
          '.erp-source-import-picker__selection'
        )
        const table = node.querySelector('.ant-table')
        return {
          selectionTop: selection?.getBoundingClientRect().top || 0,
          tableTop: table?.getBoundingClientRect().top || 0,
        }
      })
      assert(
        selectedMetrics.selectionTop > 0 &&
          selectedMetrics.tableTop > 0 &&
          selectedMetrics.selectionTop < selectedMetrics.tableTop,
        `${scenarioName} 已选摘要应在表格上方: ${JSON.stringify(selectedMetrics)}`
      )
      const importButton = picker
        .locator('.erp-source-import-picker__footer-actions .ant-btn-primary')
        .last()
      const importDisabled = await importButton.evaluate(
        (button) => button.disabled
      )
      assert.equal(importDisabled, false, `${scenarioName} 导入按钮不应禁用`)
      await clearSelectionButton.click()
      await assertTextAbsent(page, '已选 1 条')
      assert.equal(
        await picker.getByRole('button', { name: '清空已选' }).count(),
        0,
        `${scenarioName} 清空已选后按钮应从来源选择器中移除`
      )
      await expectText(page, `未选择${selectedNoun}`)
      const clearedImportDisabled = await importButton.evaluate(
        (button) => button.disabled
      )
      assert.equal(
        clearedImportDisabled,
        true,
        `${scenarioName} 清空已选后导入按钮应禁用`
      )
      const searchInput = picker.locator('.ant-input').first()
      await searchInput.fill('NO-SOURCE-IMPORT-RESULT')
      let pickerTextAfterEmptySearch = ''
      for (let attempt = 0; attempt < 40; attempt += 1) {
        pickerTextAfterEmptySearch = await picker.evaluate((node) =>
          String(node.textContent || '')
            .replace(/\s+/g, ' ')
            .trim()
        )
        if (pickerTextAfterEmptySearch.includes(emptyDescriptionText)) {
          break
        }
        await delay(250)
      }
      assert(
        pickerTextAfterEmptySearch.includes(emptyDescriptionText),
        `${scenarioName} 来源导入搜索空结果应显示空态“${emptyDescriptionText}”: ${pickerTextAfterEmptySearch}`
      )
      const emptyPaginationMetrics = await picker.evaluate((node) => ({
        hasPagination: Boolean(
          node.querySelector('.erp-source-import-picker__pagination')
        ),
        hasPageControls: Boolean(node.querySelector('.ant-pagination')),
        textContent: node.textContent?.replace(/\s+/g, ' ').trim() || '',
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
      }))
      assert(
        emptyPaginationMetrics.hasPagination,
        `${scenarioName} 来源导入空结果仍应保留分页: ${JSON.stringify(
          emptyPaginationMetrics
        )}`
      )
      assert(
        emptyPaginationMetrics.textContent.includes('共 0 条'),
        `${scenarioName} 来源导入空结果分页应显示共 0 条: ${JSON.stringify(
          emptyPaginationMetrics
        )}`
      )
      assert(
        emptyPaginationMetrics.scrollWidth <=
          emptyPaginationMetrics.clientWidth + 1,
        `${scenarioName} 来源导入空结果出现横向溢出: ${JSON.stringify(
          emptyPaginationMetrics
        )}`
      )
      await searchInput.fill('')
      const sourceRowAfterEmptySearch = await findSourceRow(selectText)
      const selectorControlAfterEmptySearch = sourceRowAfterEmptySearch
        .locator('.ant-checkbox-wrapper, .ant-radio-wrapper')
        .first()
      await selectorControlAfterEmptySearch.click()
      await expectText(page, '已选 1 条')
      await importButton.click({ force: true })
      await picker.waitFor({ state: 'hidden', timeout: 10_000 })
      if (importAndExpectText) {
        await expectText(page, importAndExpectText)
      }
      await parentModal.waitFor({ state: 'visible', timeout: 10_000 })
      const parentFocusMetric = await parentModal.evaluate((node) => {
        const root = node.closest('.ant-modal-root') || node
        return {
          activeInsideParent:
            document.activeElement instanceof Element &&
            root.contains(document.activeElement),
          activeIsBody: document.activeElement === document.body,
          activeTagName: document.activeElement?.tagName || '',
          activeText:
            document.activeElement?.textContent?.replace(/\s+/g, ' ').trim() ||
            '',
        }
      })
      assert(
        parentFocusMetric.activeInsideParent && !parentFocusMetric.activeIsBody,
        `${scenarioName} 来源导入完成后焦点未回到父级业务弹窗: ${JSON.stringify(parentFocusMetric)}`
      )
      return
    }

    await picker
      .locator('.erp-source-import-picker__footer-actions .ant-btn')
      .first()
      .focus()
    await page.keyboard.press('Enter')
    await picker.waitFor({ state: 'hidden', timeout: 10_000 })
    await parentModal.waitFor({ state: 'visible', timeout: 10_000 })
    let triggerFocusMetric = null
    for (let i = 0; i < 12; i += 1) {
      triggerFocusMetric = await trigger.evaluate((node) => ({
        activeIsTrigger: document.activeElement === node,
        activeText: document.activeElement?.textContent?.replace(/\s+/g, ' '),
        buttonText: node.textContent?.replace(/\s+/g, ' '),
      }))
      if (triggerFocusMetric.activeIsTrigger) break
      await page.waitForTimeout(50)
    }
    assert(
      triggerFocusMetric.activeIsTrigger,
      `${scenarioName} 来源导入选择器关闭后焦点未回到触发按钮: ${JSON.stringify(triggerFocusMetric)}`
    )
  }

  async function assertBusinessToolbarDisabledButtons(
    page,
    { scenarioName, labels = [] }
  ) {
    const toolbar = page
      .locator('.erp-business-operation-panel__toolbar')
      .first()
    await toolbar.waitFor({ state: 'visible', timeout: 10_000 })
    const metrics = await toolbar.evaluate((node, expectedLabels) => {
      const buttons = Array.from(node.querySelectorAll('button')).map(
        (button) => ({
          text: String(button.textContent || '')
            .replace(/\s+/g, ' ')
            .trim(),
          disabled: button.disabled,
        })
      )
      return {
        buttons,
        expected: expectedLabels.map((label) => {
          const matched = buttons.find((button) => button.text === label)
          return {
            label,
            found: Boolean(matched),
            disabled: matched?.disabled === true,
          }
        }),
      }
    }, labels)

    assert.deepEqual(
      metrics.expected.filter((item) => !item.found || !item.disabled),
      [],
      `${scenarioName} 工具条弱动作应保持禁用: ${JSON.stringify(metrics)}`
    )
  }

  async function assertBusinessPageRefreshEntrypoint(page, { scenarioName }) {
    const metrics = await page.evaluate(() => {
      const isVisible = (node) => {
        if (!(node instanceof HTMLElement)) return false
        const rect = node.getBoundingClientRect()
        const style = window.getComputedStyle(node)
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0
        )
      }
      const allButtons = Array.from(document.querySelectorAll('button')).filter(
        isVisible
      )
      const refreshButtons = allButtons.filter(
        (button) => String(button.textContent || '').trim() === '刷新当前页'
      )
      const operationRefreshButtons = allButtons.filter(
        (button) =>
          button.closest('.erp-business-operation-panel') &&
          /^刷新(?:当前页)?$/.test(String(button.textContent || '').trim())
      )
      const contentRefreshButtons = allButtons.filter(
        (button) =>
          button.closest('.erp-admin-content') &&
          !button.closest('.erp-admin-header') &&
          String(button.textContent || '').trim() === '刷新'
      )
      const headerButtons = refreshButtons.filter((button) =>
        button.closest('.erp-admin-header')
      )

      return {
        refreshButtonCount: refreshButtons.length,
        headerRefreshButtonCount: headerButtons.length,
        headerRefreshHasIcon: headerButtons.some((button) =>
          Boolean(button.querySelector('.anticon'))
        ),
        operationRefreshButtonCount: operationRefreshButtons.length,
        operationRefreshButtonText: operationRefreshButtons.map((button) =>
          String(button.textContent || '').trim()
        ),
        contentRefreshButtonCount: contentRefreshButtons.length,
        contentRefreshButtonText: contentRefreshButtons.map((button) =>
          String(button.textContent || '').trim()
        ),
      }
    })

    assert.equal(
      metrics.refreshButtonCount,
      1,
      `${scenarioName} 业务页应只保留一个刷新当前页入口: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.headerRefreshButtonCount,
      1,
      `${scenarioName} 业务页应复用壳层刷新按钮: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.operationRefreshButtonCount,
      0,
      `${scenarioName} 业务操作盒不应重复显示刷新按钮: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.contentRefreshButtonCount,
      0,
      `${scenarioName} 业务内容区不应重复显示局部刷新按钮: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.headerRefreshHasIcon,
      `${scenarioName} 业务页壳层刷新按钮缺少图标: ${JSON.stringify(metrics)}`
    )
  }

  async function assertBusinessModuleToolbarControlStyle(
    page,
    { scenarioName, requireSearch = true }
  ) {
    const metrics = await page.evaluate(() => {
      const measureTextWidth = (() => {
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        return (text, font) => {
          if (!context) return 0
          context.font = font
          return context.measureText(text).width
        }
      })()
      const readControlFromElement = (element, selector = '') => {
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        const text = String(
          element.textContent || element.getAttribute('placeholder') || ''
        ).trim()
        const dateTextInput = element.matches?.('.erp-business-date-input')
          ? element.querySelector('input')
          : null
        const textSource = dateTextInput || element
        const textSourceStyle = window.getComputedStyle(textSource)
        const sampleText = element.matches?.('.erp-business-date-input')
          ? dateTextInput?.value || dateTextInput?.placeholder || 'yyyy/mm/dd'
          : text
        const paddingX =
          Number.parseFloat(textSourceStyle.paddingLeft || '0') +
          Number.parseFloat(textSourceStyle.paddingRight || '0')
        const textClientWidth =
          dateTextInput?.clientWidth || element.clientWidth
        const textScrollWidth =
          dateTextInput?.scrollWidth || element.scrollWidth
        return {
          selector,
          text,
          cursor: style.cursor,
          inputCursor: dateTextInput ? textSourceStyle.cursor : '',
          borderRadius: style.borderRadius,
          borderTopLeftRadius: style.borderTopLeftRadius,
          borderTopRightRadius: style.borderTopRightRadius,
          borderBottomLeftRadius: style.borderBottomLeftRadius,
          borderBottomRightRadius: style.borderBottomRightRadius,
          borderColor: style.borderTopColor,
          height: rect.height,
          top: rect.top,
          bottom: rect.bottom,
          centerY: rect.top + rect.height / 2,
          width: rect.width,
          scrollWidth: textScrollWidth,
          clientWidth: textClientWidth,
          effectiveTextWidth: Math.max(0, textClientWidth - paddingX),
          requiredTextWidth: Math.ceil(
            measureTextWidth(sampleText, style.font) + 6
          ),
        }
      }
      const readControl = (selector) => {
        const element = document.querySelector(selector)
        return element ? readControlFromElement(element, selector) : null
      }
      const filterRootSelectors = [
        '.erp-business-operation-panel__filters',
        '.erp-business-filter-panel__grid',
      ]
      const joinFilterRootSelector = (selector) =>
        filterRootSelectors.map((root) => `${root} ${selector}`).join(', ')
      const readFromFilterRoot = (selector) =>
        readControl(joinFilterRootSelector(selector))
      const dateControls = Array.from(
        document.querySelectorAll(
          joinFilterRootSelector('.erp-business-date-range-filter')
        )
      ).map((node) => readControlFromElement(node))
      const selectControls = Array.from(
        document.querySelectorAll(
          filterRootSelectors
            .map((root) => `${root} > .ant-select .ant-select-selector`)
            .join(', ')
        )
      ).map((node) => readControlFromElement(node))
      const filterControls = [
        readFromFilterRoot('.ant-input-affix-wrapper'),
        ...selectControls,
        ...dateControls,
      ].filter(Boolean)

      return {
        search: readFromFilterRoot('.ant-input-affix-wrapper'),
        searchInput: readFromFilterRoot(
          '.erp-business-filter-control--search input'
        ),
        dateInput: readFromFilterRoot('.erp-business-date-input'),
        dateControl: readFromFilterRoot('.erp-business-date-range-filter'),
        dateInputs: Array.from(
          document.querySelectorAll(
            joinFilterRootSelector('.erp-business-date-input')
          )
        ).map((node) => readControlFromElement(node)),
        dateControls,
        selectControls,
        filterControls,
        statusSelector: readControl(
          '.erp-business-filter-control--status .ant-select-selector'
        ),
        statusSelectionItem: readControl(
          '.erp-business-filter-control--status .ant-select-selection-item'
        ),
        statusPlaceholder: readControl(
          '.erp-business-filter-control--status .ant-select-selection-placeholder'
        ),
        statusSearchInput: readControl(
          '.erp-business-filter-control--status .ant-select-selection-search-input'
        ),
        statusArrow: readControl(
          '.erp-business-filter-control--status .ant-select-arrow'
        ),
        actionButton: readControl(
          '.erp-business-operation-panel__toolbar .ant-btn, .erp-business-module-toolbar .ant-btn'
        ),
      }
    })

    const baselineControl = metrics.search || metrics.statusSelector
    assert(
      (!requireSearch || metrics.search) &&
        baselineControl &&
        metrics.dateInput &&
        metrics.dateControl &&
        metrics.dateInputs.length === 2 &&
        metrics.statusSelector &&
        (metrics.statusPlaceholder || metrics.statusSelectionItem) &&
        metrics.statusSearchInput &&
        metrics.statusArrow &&
        metrics.actionButton,
      `${scenarioName} 工具栏控件缺失: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.dateControls.length,
      1,
      `${scenarioName} 日期范围控件应收口为一个整体: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.dateInputs.every(
        (item) => item.scrollWidth <= item.clientWidth + 1
      ),
      `${scenarioName} 起止日期文字出现裁切: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.dateInputs.every((item) => item.width >= 160),
      `${scenarioName} 起止日期输入宽度不足以完整显示 yyyy/mm/dd: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.dateInputs.every(
        (item) => item.effectiveTextWidth >= item.requiredTextWidth
      ),
      `${scenarioName} 起止日期可见文本区不足，日期组件会裁切 placeholder: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.dateInputs.every(
        (item) => Math.abs(item.centerY - metrics.dateControl.centerY) <= 1
      ),
      `${scenarioName} 起止日期输入不应脱离日期范围控件同一行: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.filterControls.every(
        (item) => Math.abs(item.height - baselineControl.height) <= 1
      ),
      `${scenarioName} 筛选输入框高度未统一: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.dateInput.cursor,
      'pointer',
      `${scenarioName} 日期组件 cursor 未统一为 pointer: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.dateInputs.every((item) => item.inputCursor === 'pointer'),
      `${scenarioName} 日期输入框 cursor 未统一为 pointer: ${JSON.stringify(metrics)}`
    )
    await page
      .locator('.erp-business-date-range-filter .erp-business-date-input')
      .first()
      .click({ position: { x: 16, y: 16 } })
    const datePanelVisible = await page
      .waitForSelector(
        '.ant-picker-dropdown:not(.ant-picker-dropdown-hidden) .ant-picker-panel',
        { state: 'visible', timeout: 1500 }
      )
      .then(() => true)
      .catch(() => false)
    assert(
      datePanelVisible,
      `${scenarioName} 点击日期输入框文本区域后应打开日期面板`
    )
    await page.keyboard.press('Escape')
    await assertBusinessDateRangePickerOrderGuard(page, { scenarioName })
    assert.equal(
      metrics.actionButton.cursor,
      'pointer',
      `${scenarioName} 工具栏按钮 cursor 未统一为 pointer: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.dateControl.borderTopLeftRadius,
      baselineControl.borderTopLeftRadius,
      `${scenarioName} 日期控件左上圆角未对齐筛选控件: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.dateControl.borderBottomLeftRadius,
      baselineControl.borderBottomLeftRadius,
      `${scenarioName} 日期控件左下圆角未对齐筛选控件: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.dateControl.borderTopRightRadius,
      baselineControl.borderTopRightRadius,
      `${scenarioName} 日期控件右上圆角未对齐筛选控件: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.dateControl.borderBottomRightRadius,
      baselineControl.borderBottomRightRadius,
      `${scenarioName} 日期控件右下圆角未对齐筛选控件: ${JSON.stringify(metrics)}`
    )
    if (metrics.search) {
      assert.equal(
        metrics.dateControl.borderColor,
        metrics.search.borderColor,
        `${scenarioName} 日期控件边框颜色未对齐搜索框: ${JSON.stringify(metrics)}`
      )
    }
    if (metrics.searchInput?.text) {
      assert(
        metrics.searchInput.effectiveTextWidth >=
          metrics.searchInput.requiredTextWidth,
        `${scenarioName} 搜索框 placeholder 可见文本区不足: ${JSON.stringify(metrics)}`
      )
    }
    assert(
      Math.abs(metrics.dateControl.height - baselineControl.height) <= 1,
      `${scenarioName} 日期控件高度未对齐筛选控件: ${JSON.stringify(metrics)}`
    )
    assert(
      Math.abs(
        (metrics.statusPlaceholder || metrics.statusSelectionItem).centerY -
          metrics.statusSelector.centerY
      ) <= 1,
      `${scenarioName} 状态筛选显示值未上下居中: ${JSON.stringify(metrics)}`
    )
    assert(
      Math.abs(
        metrics.statusSearchInput.centerY - metrics.statusSelector.centerY
      ) <= 1,
      `${scenarioName} 状态筛选内部搜索 input 未上下居中: ${JSON.stringify(metrics)}`
    )
    assert(
      Math.abs(metrics.statusArrow.centerY - metrics.statusSelector.centerY) <=
        1,
      `${scenarioName} 状态筛选箭头未上下居中: ${JSON.stringify(metrics)}`
    )
  }

  async function assertBusinessDateRangePickerOrderGuard(
    page,
    { scenarioName }
  ) {
    const dateInputs = page.locator(
      '.erp-business-date-range-filter .erp-business-date-input'
    )
    await dateInputs.first().click({ position: { x: 16, y: 16 } })
    const startDateTitle = await page
      .locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)')
      .evaluate((dropdown) => {
        const titles = Array.from(
          dropdown.querySelectorAll('.ant-picker-cell-in-view[title]')
        )
          .filter(
            (cell) =>
              !cell.className.includes('ant-picker-cell-disabled') &&
              cell.getAttribute('aria-disabled') !== 'true'
          )
          .map((cell) => cell.getAttribute('title'))
          .filter(Boolean)
          .sort()
        if (titles.length < 2) {
          throw new Error('date range guard needs at least two selectable days')
        }
        return titles[Math.min(15, titles.length - 1)]
      })
    const earlierEndDateTitle = await page
      .locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)')
      .evaluate((dropdown, selectedTitle) => {
        const titles = Array.from(
          dropdown.querySelectorAll('.ant-picker-cell-in-view[title]')
        )
          .map((cell) => cell.getAttribute('title'))
          .filter((title) => title && title < selectedTitle)
          .sort()
        if (titles.length < 1) {
          throw new Error('date range guard needs an earlier visible day')
        }
        return titles[0]
      }, startDateTitle)
    await page
      .locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)')
      .locator(`.ant-picker-cell[title="${startDateTitle}"]`)
      .click()
    await dateInputs.nth(1).click({ position: { x: 16, y: 16 } })
    const earlierEndCell = page
      .locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)')
      .locator(`.ant-picker-cell[title="${earlierEndDateTitle}"]`)
      .last()
    await earlierEndCell.waitFor({ state: 'visible', timeout: 1500 })
    const earlierEndMetrics = await earlierEndCell.evaluate((node) => ({
      className: node.className,
      ariaDisabled: node.getAttribute('aria-disabled'),
      title: node.getAttribute('title'),
    }))
    assert(
      earlierEndMetrics.className.includes('ant-picker-cell-disabled') ||
        earlierEndMetrics.ariaDisabled === 'true',
      `${scenarioName} 结束日期不能选择早于开始日期的日期: ${JSON.stringify(earlierEndMetrics)}`
    )
    await page.keyboard.press('Escape')
  }

  async function assertPaginationSizeChangerFocusStyle(page, { scenarioName }) {
    const sizeChanger = page
      .locator('.ant-pagination-options .ant-select')
      .first()
    await sizeChanger.waitFor({ state: 'visible', timeout: 10_000 })
    await sizeChanger.click()
    const popup = page.locator(
      '.ant-select-dropdown:not(.ant-select-dropdown-hidden)'
    )
    await popup.waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForTimeout(150)

    const metrics = await page.evaluate(() => {
      const readElement = (element) => {
        if (!element) return null
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return {
          boxShadow: style.boxShadow,
          borderColor: style.borderTopColor,
          outlineStyle: style.outlineStyle,
          ringColor: style.getPropertyValue('--tw-ring-color').trim(),
          width: rect.width,
          height: rect.height,
          active: element === document.activeElement,
        }
      }
      const select = document.querySelector(
        '.ant-pagination-options .ant-select'
      )
      const selector = select?.querySelector('.ant-select-selector')
      const searchInput = select?.querySelector(
        '.ant-select-selection-search-input'
      )
      const dropdown = document.querySelector(
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden)'
      )

      return {
        selector: readElement(selector),
        searchInput: readElement(searchInput),
        dropdown: readElement(dropdown),
      }
    })

    assert(
      metrics.selector && metrics.searchInput && metrics.dropdown,
      `${scenarioName} 分页条数选择器缺少可检查节点: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.searchInput.active,
      true,
      `${scenarioName} 分页条数选择器内部 input 未获得焦点，无法验证焦点态: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.searchInput.boxShadow,
      'none',
      `${scenarioName} 分页条数选择器内部 input 暴露了 Tailwind 蓝色焦点框: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.searchInput.outlineStyle,
      'none',
      `${scenarioName} 分页条数选择器内部 input 暴露了浏览器 outline: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.searchInput.ringColor === 'transparent' ||
        metrics.searchInput.ringColor === 'rgba(0, 0, 0, 0)',
      `${scenarioName} 分页条数选择器内部 input 未清理 Tailwind ring: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.dropdown.width >= metrics.selector.width,
      `${scenarioName} 分页条数下拉层宽度不应小于触发器: ${JSON.stringify(metrics)}`
    )

    await page.keyboard.press('Escape')
    await popup.waitFor({ state: 'hidden', timeout: 10_000 })
  }

  async function assertRowSelectionClearsAfterCancel(
    page,
    { dataRowSelector, selectedRowSelector, counterLabel }
  ) {
    const rows = page.locator(dataRowSelector)
    const rowCountBefore = await readLineCounter(page, counterLabel)

    assert(rowCountBefore > 0, `未找到可用明细计数: ${counterLabel}`)
    assert(await rows.count(), `未找到可选明细行: ${dataRowSelector}`)

    await page.getByRole('button', { name: '选择明细行' }).click()
    await rows.first().click()

    assert.equal(
      await page.locator(selectedRowSelector).count(),
      1,
      `进入选择模式后应只有 1 行高亮: ${selectedRowSelector}`
    )

    await page.getByRole('button', { name: '下插一行' }).click()

    assert.equal(
      await readLineCounter(page, counterLabel),
      rowCountBefore + 1,
      '插入空白行后明细行数应增加 1'
    )
    assert.equal(
      await page.locator(selectedRowSelector).count(),
      1,
      `插入空白行后应仍只有 1 行高亮: ${selectedRowSelector}`
    )

    await page.getByRole('button', { name: '取消选择' }).click()

    assert.equal(
      await page.locator(selectedRowSelector).count(),
      0,
      `取消选择后不应残留高亮行: ${selectedRowSelector}`
    )
    await assertButtonDisabled(page, '上插一行')
    await assertButtonDisabled(page, '下插一行')
    await assertButtonDisabled(page, '移除当前行')
  }

  async function readLineCounter(page, label) {
    const counter = page.locator('.erp-print-shell__counter')
    const text = (await counter.textContent()) || ''
    const match = text.match(new RegExp(`${label}:\\s*(\\d+)\\/300`))

    assert(match, `未找到 ${label} 计数: ${text}`)
    return Number(match[1])
  }
  return {
    assertOrderLifecycleActionsConsolidated,
    _assertBusinessSelectionActionBarBoxModel,
    assertBusinessListEmptySearchState,
    assertShellRefreshButton,
    assertNoDuplicatedAdminPageTitle,
    verifyBusinessModuleColumnOrderDialog,
    verifyBusinessModuleColumnOrderHeaderMenu,
    verifySourceImportPicker,
    assertBusinessToolbarDisabledButtons,
    assertBusinessPageRefreshEntrypoint,
    assertBusinessModuleToolbarControlStyle,
    assertBusinessDateRangePickerOrderGuard,
    assertPaginationSizeChangerFocusStyle,
    assertRowSelectionClearsAfterCancel,
  }
}
