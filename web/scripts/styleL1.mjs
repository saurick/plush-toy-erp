import assert from 'node:assert/strict'
import net from 'node:net'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

import { chromium } from 'playwright'
import {
  createMockAdminToken,
  installAdminAuthExpiredRpcMocks,
  installAdminRpcMocks,
} from './style-l1/adminRpcMocks.mjs'
import {
  assertNoBlueFocusStyle,
  assertReadableOnBackground,
  assertReadableOnDark,
  getContrastRatio,
  hasGreenDominantInteractivePaint,
  isAcceptedFocusBorder,
  isBluePrimaryColor,
  isDarkControlBackground,
  isDarkNeutralBorderColor,
  isGreenFocusColor,
  isLightReadonlyDisabledBackground,
  isLightSurfaceColor,
  isNeutralModalControlBorderColor,
  isTailwindFormsResetBorderColor,
  isTransparentColor,
  isWarningBorderColor,
  parseRgb,
} from './style-l1/colorAssertions.mjs'
import { createPrintAssertions } from './style-l1/printAssertions.mjs'
import { createPurchaseReceiptAssertions } from './style-l1/purchaseReceiptAssertions.mjs'
import { createMobileTaskAssertions } from './style-l1/mobileTaskAssertions.mjs'
import { createStyleL1Scenarios } from './style-l1/scenarios.mjs'

const webDir = path.resolve(import.meta.dirname, '..')
const outputDir = path.resolve(webDir, 'output', 'playwright', 'style-l1')
const devServerPort = Number(process.env.STYLE_L1_PORT || 4173)
const externalBaseURL = String(process.env.STYLE_L1_BASE_URL || '').trim()
const baseURL = externalBaseURL || `http://localhost:${devServerPort}`
const headless = process.env.HEADED !== '1'
const scenarioFilter = new Set(
  String(process.env.STYLE_L1_SCENARIOS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
)
const scenarioMaxAttempts = 2

let devServerProcess = null
let devServerLogs = ''

const assertAntdModalCentered = (...args) =>
  assertAntdModalCenteredImpl(...args)

const {
  assertPrintPreviewPopup,
  assertPrintCenterPreviewPopup,
  assertEditablePrintWorkspacePopupRefresh,
  assertPrintWorkspacePaginationStyle,
  assertProcessingContractPaperRowCount,
  assertProcessingContractSignatureLayout,
  assertContractTableHeadersStaySingleLine,
  assertWorkspaceContinuedPageMargin,
  assertMaterialContractMetaAlignment,
  assertContractTableEditableAlignment,
  assertContractTotalCellsWrapLargeNumbers,
  assertMaterialContractPrintMediaIgnoresResponsiveBreakpoints,
} = createPrintAssertions({
  baseURL,
  outputDir,
  expectText,
  isIgnorableDevServerError,
})

function getScenarios() {
  return createStyleL1Scenarios({
    assert,
    assertAdminLoginLayout,
    assertAdminRoleModalLayout,
    assertAppAlertDialogLayout,
    assertBusinessCollaborationPanelCollapsedByDefault,
    assertBusinessHeaderHasNoSectionTitle,
    assertBusinessHeaderStatsSingleLine,
    assertBusinessListEmptySearchState,
    assertBusinessMainTableHasNoOperationColumn,
    assertBusinessMainTableInitialSelectionEmpty,
    assertBusinessMainTableSortableColumns,
    assertBusinessModuleToolbarControlStyle,
    assertBusinessPageRefreshEntrypoint,
    assertBusinessToolbarDisabledButtons,
    assertContractTableEditableAlignment,
    assertContractTableHeadersStaySingleLine,
    assertContractTotalCellsWrapLargeNumbers,
    assertDarkAntdStateSurfaces,
    assertDarkDashboardLinkButtonsUnboxed,
    assertDarkLoadingState,
    assertDarkThemeContrast,
    assertDarkThemeNeutralInteractions,
    assertDashboardMetricInteractionSemantics,
    assertDashboardTaskBoardLayout,
    assertDashboardWorkbenchEntryNavigation,
    assertDashboardWorkbenchLayout,
    assertDevPageUsesGlobalThemeOnly,
    assertERPThemeMode,
    assertEditablePrintWorkspacePopupRefresh,
    assertLineItemsUnifiedHorizontalScroll,
    assertLoginSegmentedReadable,
    assertMaterialContractMetaAlignment,
    assertMaterialContractPrintMediaIgnoresResponsiveBreakpoints,
    assertMobileTaskBossDoneList,
    assertMobileTaskDarkDetailReadable,
    assertMobileTaskMainNavigation,
    assertMobileTaskRefreshFeedback,
    assertNoDashboardCenterLocalRefreshButton,
    assertNoDuplicatedAdminPageTitle,
    assertNoHorizontalOverflow,
    assertOperationalFactModalViewport,
    assertOrderLifecycleActionsConsolidated,
    assertOutsourcingProcessSelectOptions,
    assertPaginationSizeChangerFocusStyle,
    assertPermissionSectionVisualSeparation,
    assertPrintCenterPreviewPopup,
    assertPrintPreviewPopup,
    assertPrintWorkspacePaginationStyle,
    assertProcessSuggestionOptions,
    assertProcessingContractPaperRowCount,
    assertProcessingContractSignatureLayout,
    assertPurchaseReceiptActionButtonState,
    assertPurchaseReceiptAddItemModalDarkTokens,
    assertPurchaseReceiptAddItemModalMetrics,
    assertPurchaseReceiptAddItemModalMobileLayout,
    assertBusinessFormModalKeyboardRecovery,
    assertPurchaseReceiptCreateModalDarkTokens,
    assertPurchaseReceiptCreateModalFocusStyles,
    assertPurchaseReceiptCreateModalKeyboardRecovery,
    assertPurchaseReceiptCreateModalMetrics,
    assertPurchaseReceiptCreateModalMobileLayout,
    assertPurchaseReceiptRowItemCount,
    assertRowSelectionClearsAfterCancel,
    assertShellRefreshButton,
    assertTaskActionDrawerLayout,
    assertTextAbsent,
    assertThemeReadable,
    assertVisibleModalInputFocusStyle,
    assertWorkspaceContinuedPageMargin,
    clickERPThemeOption,
    closeBusinessFormModal,
    expectButton,
    expectHeading,
    expectNoButton,
    expectText,
    fillPurchaseReceiptAddItemModalBoundaryValues,
    fillPurchaseReceiptCreateModalBoundaryValues,
    gotoScenarioPath,
    isLightSurfaceColor,
    openPurchaseReceiptAddItemModal,
    openPurchaseReceiptCreateModal,
    outputDir,
    path,
    seedBusinessCollaborationOverflowTasks,
    selectPurchaseReceiptRow,
    verifyBusinessActionFormModal,
    verifyBusinessModuleColumnOrderDialog,
    verifyBusinessRowDoubleClickEditModal,
    verifyFormalShellRowDoubleClickEditModal,
    verifySourceImportPicker,
    waitForPath,
    webDir,
  })
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true })
  const scenarios = getScenarios()
  const selectedScenarios =
    scenarioFilter.size > 0
      ? scenarios.filter((scenario) => scenarioFilter.has(scenario.name))
      : scenarios
  assert(
    selectedScenarios.length > 0,
    `[style:l1] 未匹配到场景: ${[...scenarioFilter].join(', ')}`
  )

  try {
    if (!externalBaseURL) {
      devServerProcess = startDevServer()
      await waitForServer(baseURL)
    }

    const browser = await chromium.launch({
      headless,
      args: ['--no-proxy-server', '--proxy-bypass-list=<-loopback>'],
    })
    try {
      for (const scenario of selectedScenarios) {
        await runScenario(browser, scenario)
      }
    } finally {
      await browser.close()
    }

    console.log(`[style:l1] 通过，共验证 ${selectedScenarios.length} 个场景`)
  } finally {
    await stopDevServer()
  }
}

function startDevServer() {
  const child = spawn(
    'pnpm',
    [
      'exec',
      'vite',
      '--config',
      'vite.config.mjs',
      '--host',
      'localhost',
      '--port',
      String(devServerPort),
      '--strictPort',
    ],
    {
      cwd: webDir,
      env: {
        ...process.env,
        BROWSER: 'none',
      },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )

  child.stdout.on('data', (chunk) => {
    devServerLogs += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    devServerLogs += chunk.toString()
  })

  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      devServerLogs += `\n[vite exited with code ${code}]`
    }
  })

  return child
}

async function stopDevServer() {
  if (!devServerProcess) {
    return
  }

  const devServerPID = devServerProcess.pid
  const killDevServer = (signal) => {
    if (!devServerPID) return
    try {
      process.kill(-devServerPID, signal)
    } catch {
      // Fall through to direct child kill when the process group is gone.
    }
    try {
      process.kill(devServerPID, signal)
    } catch {
      // The process already exited.
    }
    try {
      devServerProcess.kill(signal)
    } catch {
      // The child handle is already closed.
    }
  }

  if (devServerProcess.exitCode === null) {
    killDevServer('SIGTERM')
    await Promise.race([
      new Promise((resolve) => devServerProcess.once('exit', resolve)),
      delay(3000),
    ])
  }

  if (devServerProcess.exitCode === null) {
    killDevServer('SIGKILL')
    await delay(500)
  }

  devServerProcess.stdout?.destroy()
  devServerProcess.stderr?.destroy()
  devServerProcess.unref()
  devServerProcess = null
  await killDevServerPortListeners()
}

async function killDevServerPortListeners() {
  const pids = await listDevServerPortPIDs()
  await Promise.all(
    pids.map(async (pid) => {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        return
      }
      await delay(300)
      try {
        process.kill(pid, 0)
      } catch {
        return
      }
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // The process exited between checks.
      }
    })
  )
}

function listDevServerPortPIDs() {
  return new Promise((resolve) => {
    const child = spawn('lsof', [
      `-tiTCP:${String(devServerPort)}`,
      '-sTCP:LISTEN',
    ])
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.once('error', () => resolve([]))
    child.once('close', () => {
      resolve(
        output
          .split('\n')
          .map((item) => Number(item.trim()))
          .filter((pid) => Number.isInteger(pid) && pid > 0)
      )
    })
  })
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000
  let lastError = 'server did not become ready'

  while (Date.now() < deadline) {
    if (devServerProcess?.exitCode !== null) {
      throw new Error(
        `[style:l1] 前端预览进程已退出，无法继续使用可能残留的旧服务\n最近 vite 输出：\n${tailLogs(devServerLogs)}`
      )
    }

    try {
      const response = await fetch(url, {
        redirect: 'manual',
      })
      if (response.ok || response.status === 302 || response.status === 304) {
        return
      }
      lastError = `unexpected status ${response.status}`
    } catch (error) {
      lastError = error.message
      if (await canConnectToLocalServer(url)) {
        return
      }
    }
    await delay(300)
  }

  throw new Error(
    `[style:l1] 无法启动前端预览：${lastError}\n最近 vite 输出：\n${tailLogs(devServerLogs)}`
  )
}

function canConnectToLocalServer(url) {
  return new Promise((resolve) => {
    let settled = false
    const { hostname, port, protocol } = new URL(url)
    if (protocol !== 'http:' && protocol !== 'https:') {
      resolve(false)
      return
    }

    const socket = net.createConnection({
      host: hostname,
      port: Number(port || (protocol === 'https:' ? 443 : 80)),
    })
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(false)
    }, 500)

    socket.once('connect', () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      socket.end()
      resolve(true)
    })
    socket.once('error', () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(false)
    })
  })
}

async function runScenario(browser, scenario) {
  let lastError = null

  for (let attempt = 1; attempt <= scenarioMaxAttempts; attempt += 1) {
    try {
      await runScenarioOnce(browser, scenario)
      return
    } catch (error) {
      lastError = error
      if (
        attempt === scenarioMaxAttempts ||
        !isRetryableScenarioFailure(error)
      ) {
        break
      }

      const reason = String(error?.message || error).split('\n')[0]
      devServerLogs += `\n[style:l1] retry ${scenario.name} ${attempt + 1}/${scenarioMaxAttempts}: ${reason}\n`
      await delay(500 * attempt)
    }
  }

  throw new Error(
    `[style:l1] 场景失败: ${scenario.name}\n${lastError?.message || lastError}\n最近 vite 输出：\n${tailLogs(devServerLogs)}`
  )
}

async function runScenarioOnce(browser, scenario) {
  const context = await browser.newContext({ viewport: scenario.viewport })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: baseURL,
  })
  const page = await context.newPage()
  const errors = []

  if (scenario.mockAdminRpc) {
    await installAdminRpcMocks(page, { baseURL })
  }

  if (scenario.auth === 'admin' || scenario.auth === 'admin-expired') {
    const token = createMockAdminToken()
    if (scenario.auth === 'admin-expired') {
      await installAdminAuthExpiredRpcMocks(page)
    } else {
      await installAdminRpcMocks(page, { baseURL })
    }
    await page.addInitScript((mockToken) => {
      localStorage.setItem('admin_access_token', mockToken)
      localStorage.setItem('admin_is_super_admin', 'true')
      localStorage.setItem(
        'admin_roles',
        JSON.stringify([
          { role_key: 'boss', name: '老板' },
          { role_key: 'sales', name: '业务' },
          { role_key: 'purchase', name: '采购' },
          { role_key: 'production', name: '生产' },
          { role_key: 'warehouse', name: '仓库' },
          { role_key: 'finance', name: '财务' },
          { role_key: 'pmc', name: 'PMC' },
          { role_key: 'quality', name: '品质' },
        ])
      )
      localStorage.setItem(
        'admin_permissions',
        JSON.stringify([
          'workflow.task.read',
          'workflow.task.update',
          'workflow.task.complete',
          'workflow.task.approve',
          'workflow.task.reject',
        ])
      )
      localStorage.setItem('admin_menus', '[]')
      localStorage.setItem('erp:last_entry_target', 'desktop')
      localStorage.setItem(
        'admin_erp_preferences',
        JSON.stringify({ column_orders: {} })
      )
    }, token)
  }

  if (scenario.themeMode) {
    await page.addInitScript((themeMode) => {
      localStorage.setItem('plush_erp_theme_mode', themeMode)
    }, scenario.themeMode)
  }

  page.on('console', (message) => {
    if (message.type() === 'error') {
      const text = message.text()
      if (!isIgnorableDevServerError(text)) {
        const location = message.location()
        const source = [
          location.url,
          location.lineNumber,
          location.columnNumber,
        ]
          .filter((part) => part !== undefined && part !== '')
          .join(':')
        errors.push(`console error: ${text}${source ? ` @ ${source}` : ''}`)
      }
    }
  })
  page.on('pageerror', (error) => {
    errors.push(`page error: ${error.message}`)
  })

  try {
    await gotoScenarioPath(page, scenario.path, {
      waitUntil: 'domcontentloaded',
    })
    await waitForScenarioDocumentReady(page, errors)
    await delay(300)

    if (scenario.expectPath) {
      await waitForPath(page, scenario.expectPath)
    }

    await scenario.verify(page)
    await assertNoHorizontalOverflow(page, scenario.name)
    assert.deepEqual(errors, [], `${scenario.name} 出现控制台或运行时错误`)

    const screenshotPath = path.resolve(outputDir, `${scenario.name}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
  } finally {
    await page
      .evaluate(() => {
        localStorage.removeItem('plush_erp_theme_mode')
      })
      .catch(() => {})
    await context.close()
  }
}

async function waitForScenarioDocumentReady(page, errors = []) {
  await page.waitForLoadState('domcontentloaded', { timeout: 20_000 })
  try {
    await page.waitForFunction(
      () =>
        document.readyState !== 'loading' &&
        document.body &&
        document.body.innerText.trim().length > 0,
      null,
      { timeout: 20_000 }
    )
  } catch (error) {
    const snapshot = await page.evaluate(() => ({
      url: window.location.href,
      readyState: document.readyState,
      bodyText: document.body?.innerText?.slice(0, 500) || '',
      html: document.body?.innerHTML?.slice(0, 500) || '',
      resources: performance
        .getEntriesByType('resource')
        .map((item) => item.name)
        .filter((name) => name.includes('/src/') || name.includes('/rpc/'))
        .slice(0, 20),
    }))
    throw new Error(
      `${error.message}\n[style:l1] document snapshot=${JSON.stringify(snapshot)}\n[style:l1] collected errors=${JSON.stringify(errors)}`
    )
  }
}

function isRetryableScenarioFailure(error) {
  const message = String(error?.message || '')
  return (
    message.includes('Timeout') ||
    message.includes('未找到可见文案') ||
    message.includes('Execution context was destroyed') ||
    message.includes('net::ERR_ADDRESS_INVALID') ||
    message.includes('net::ERR_CONNECTION_REFUSED')
  )
}

async function gotoScenarioPath(page, scenarioPath, options = {}) {
  const url = new URL(scenarioPath, `${baseURL}/`).toString()
  const maxAttempts = 3
  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await page.goto(url, options)
      return
    } catch (error) {
      lastError = error
      if (!isRetryableLocalNavigationError(error) || attempt === maxAttempts) {
        throw error
      }
      await delay(250 * attempt)
    }
  }

  throw lastError
}

function isRetryableLocalNavigationError(error) {
  const message = String(error?.message || '')
  return (
    message.includes('net::ERR_ADDRESS_INVALID') ||
    message.includes('net::ERR_CONNECTION_REFUSED')
  )
}

async function waitForPath(page, expectedPath) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (new URL(page.url()).pathname === expectedPath) {
      return
    }
    await delay(100)
  }
  assert.equal(new URL(page.url()).pathname, expectedPath)
}

async function expectHeading(page, text) {
  const locator = page.getByRole('heading', { name: text }).first()
  await locator.waitFor({ state: 'visible', timeout: 20_000 })
}

async function expectButton(page, name) {
  const locator = page.getByRole('button', { name })
  await locator.waitFor({ state: 'visible', timeout: 10_000 })
}

async function expectNoButton(page, name) {
  const locator = page.getByRole('button', { name, exact: true })
  const count = await locator.count()

  for (let index = 0; index < count; index += 1) {
    assert.equal(
      await locator.nth(index).isVisible(),
      false,
      `不应显示按钮 ${name}`
    )
  }
}

async function expectText(page, text) {
  const locator = page.getByText(text, { exact: false })
  const timeoutAt = Date.now() + 10_000

  while (Date.now() < timeoutAt) {
    const count = await locator.count()

    for (let index = 0; index < count; index += 1) {
      if (await locator.nth(index).isVisible()) {
        return
      }
    }

    await delay(100)
  }

  const matches = await locator.evaluateAll((nodes) =>
    nodes.map((node) => ({
      text: String(node.textContent || '').trim(),
      visible:
        node instanceof HTMLElement
          ? (() => {
              const style = window.getComputedStyle(node)
              const rect = node.getBoundingClientRect()
              return (
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                rect.width > 0 &&
                rect.height > 0
              )
            })()
          : false,
    }))
  )

  throw new Error(
    `未找到可见文案“${text}”，当前命中：${JSON.stringify(matches)}`
  )
}

async function assertTextAbsent(page, text) {
  const count = await page.getByText(text, { exact: false }).count()
  assert.equal(count, 0, `页面不应继续出现文案“${text}”，当前命中 ${count} 处`)
}

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
  const actionBar = page.locator('.erp-business-module-current-action').first()
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
      buttons: Array.from(element.querySelectorAll('button')).map((button) => ({
        text: String(button.textContent || '')
          .replace(/\s+/g, ' ')
          .trim(),
        disabled: button.disabled,
        ariaLabel: button.getAttribute('aria-label') || '',
      })),
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

  const menuButton = actionBar.getByRole('button', { name: /更多操作/ }).first()
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
    `${scenarioName} 生命周期动作收口后不应造成横向溢出: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.buttons.every((item) => item.width > 0 && item.height > 0),
    `${scenarioName} 生命周期动作按钮应保持可见尺寸: ${JSON.stringify(metrics)}`
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
  await page.waitForFunction(
    ({ expectedEmptyText }) => {
      const placeholder = document.querySelector(
        '.erp-business-module-table-card .ant-table-placeholder'
      )
      return placeholder?.textContent?.includes(expectedEmptyText)
    },
    { expectedEmptyText: emptyText },
    { timeout: 10_000 }
  )

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
        tableCard?.querySelectorAll('.ant-table-tbody > tr.ant-table-row') || []
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

async function assertShellRefreshButton(page, { scenarioName, expectVisible }) {
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

async function assertNoDashboardCenterLocalRefreshButton(
  page,
  { scenarioName }
) {
  const metrics = await page.evaluate(() => {
    const forbiddenLabels = new Set(['刷新', '刷新任务', '刷新业务数据'])
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
      document.querySelectorAll('.erp-admin-content button')
    )
      .filter(isVisible)
      .map((button) => ({
        text: String(button.textContent || '').trim(),
        className: String(button.className || ''),
      }))
      .filter((button) => forbiddenLabels.has(button.text))

    return {
      forbiddenButtonCount: buttons.length,
      forbiddenButtons: buttons,
    }
  })

  assert.equal(
    metrics.forbiddenButtonCount,
    0,
    `${scenarioName} 看板中心内容区不应重复显示局部刷新按钮: ${JSON.stringify(metrics)}`
  )
}

async function assertDashboardMetricInteractionSemantics(
  page,
  {
    scenarioName,
    expectTaskMetrics = false,
    expectBusinessSummary = false,
  } = {}
) {
  const metrics = await page.evaluate(
    ({ expectTaskMetrics, expectBusinessSummary }) => {
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
      const describeNode = (node) => {
        const rect = node.getBoundingClientRect()
        const style = window.getComputedStyle(node)
        return {
          tagName: node.tagName,
          role: node.getAttribute('role') || '',
          ariaPressed: node.getAttribute('aria-pressed') || '',
          disabled: Boolean(node.disabled),
          cursor: style.cursor,
          width: rect.width,
          height: rect.height,
          text: String(node.textContent || '')
            .replace(/\s+/g, ' ')
            .trim(),
        }
      }
      const taskMetrics = expectTaskMetrics
        ? Array.from(document.querySelectorAll('.erp-task-center-metric'))
            .filter(isVisible)
            .map((node) => ({
              ...describeNode(node),
              iconCount: node.querySelectorAll('.erp-task-center-metric__icon')
                .length,
              hintCount: node.querySelectorAll('small').length,
              active: node.classList.contains('erp-task-center-metric--active'),
            }))
        : []
      const businessSummary = expectBusinessSummary
        ? Array.from(
            document.querySelectorAll('.erp-business-board-summary-card')
          )
            .filter(isVisible)
            .map((node) => ({
              ...describeNode(node),
              buttonCount: node.querySelectorAll('button').length,
              badgeText:
                node
                  .querySelector('.erp-metric-readonly-card__badge')
                  ?.textContent?.trim() || '',
            }))
        : []

      return {
        taskMetrics,
        businessSummary,
      }
    },
    { expectTaskMetrics, expectBusinessSummary }
  )

  if (expectTaskMetrics) {
    assert.equal(
      metrics.taskMetrics.length,
      3,
      `${scenarioName} 任务中心应有 3 个动作指标按钮: ${JSON.stringify(metrics)}`
    )
    for (const item of metrics.taskMetrics) {
      assert.equal(
        item.tagName,
        'BUTTON',
        `${scenarioName} 动作指标必须是真实 button: ${JSON.stringify(item)}`
      )
      assert.equal(
        item.iconCount,
        1,
        `${scenarioName} 动作指标必须带进入箭头: ${JSON.stringify(item)}`
      )
      assert.equal(
        item.hintCount,
        1,
        `${scenarioName} 动作指标必须带动作提示文案: ${JSON.stringify(item)}`
      )
      assert(
        item.ariaPressed === 'true' || item.ariaPressed === 'false',
        `${scenarioName} 动作指标必须声明 aria-pressed: ${JSON.stringify(item)}`
      )
      assert(
        item.height >= 72,
        `${scenarioName} 动作指标高度过低，容易退化成普通统计块: ${JSON.stringify(item)}`
      )
      if (item.disabled) {
        assert.notEqual(
          item.cursor,
          'pointer',
          `${scenarioName} 禁用动作指标不应露出可点光标: ${JSON.stringify(item)}`
        )
      } else {
        assert.equal(
          item.cursor,
          'pointer',
          `${scenarioName} 可用动作指标必须露出 pointer 光标: ${JSON.stringify(item)}`
        )
      }
    }
    assert(
      metrics.taskMetrics.some((item) => !item.disabled),
      `${scenarioName} 动作指标应至少有一个可用入口: ${JSON.stringify(metrics)}`
    )
  }

  if (expectBusinessSummary) {
    assert.equal(
      metrics.businessSummary.length,
      3,
      `${scenarioName} 业务看板应有 3 个只读摘要卡: ${JSON.stringify(metrics)}`
    )
    for (const item of metrics.businessSummary) {
      assert.equal(
        item.tagName,
        'DIV',
        `${scenarioName} 只读摘要卡不应渲染成 button: ${JSON.stringify(item)}`
      )
      assert.equal(
        item.role,
        '',
        `${scenarioName} 只读摘要卡不应声明 button 角色: ${JSON.stringify(item)}`
      )
      assert.equal(
        item.buttonCount,
        0,
        `${scenarioName} 只读摘要卡内部不应有按钮: ${JSON.stringify(item)}`
      )
      assert.equal(
        item.cursor,
        'default',
        `${scenarioName} 只读摘要卡必须使用 default 光标: ${JSON.stringify(item)}`
      )
      assert(
        item.badgeText.length > 0,
        `${scenarioName} 只读摘要卡必须露出用途标签: ${JSON.stringify(item)}`
      )
    }
  }
}

async function assertDarkDashboardLinkButtonsUnboxed(page, { scenarioName }) {
  const metrics = await page.evaluate(() => {
    const buttons = Array.from(
      document.querySelectorAll(
        '.erp-business-dashboard-page .erp-dashboard-table-card .erp-dashboard-link-button.ant-btn'
      )
    )
      .slice(0, 16)
      .map((button) => {
        const style = window.getComputedStyle(button)
        const rect = button.getBoundingClientRect()
        return {
          text: String(button.textContent || '').trim(),
          disabled: button.disabled,
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
          borderStyle: style.borderStyle,
          borderWidth: style.borderWidth,
          className: String(button.className || ''),
          cursor: style.cursor,
          height: rect.height,
          width: rect.width,
        }
      })

    return {
      effectiveTheme: document.documentElement.dataset.erpTheme || '',
      buttons,
    }
  })

  assert.equal(
    metrics.effectiveTheme,
    'dark',
    `${scenarioName} link 按钮无框断言必须在暗色模式执行: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.buttons.some((button) => button.text === '客户/供应商') &&
      metrics.buttons.some((button) => button.text === '0'),
    `${scenarioName} 缺少业务看板模块或数字 link 按钮样本: ${JSON.stringify(metrics)}`
  )

  for (const button of metrics.buttons) {
    assert(
      button.width > 0 && button.height > 0,
      `${scenarioName} link 按钮尺寸异常: ${JSON.stringify(button)}`
    )
    assert(
      isTransparentColor(button.backgroundColor),
      `${scenarioName} link 按钮默认态不应有暗色底框: ${JSON.stringify(button)}`
    )
    assert(
      button.borderStyle === 'none' ||
        Number.parseFloat(button.borderWidth) === 0 ||
        isTransparentColor(button.borderColor),
      `${scenarioName} link 按钮默认态不应有可见边框: ${JSON.stringify(button)}`
    )
  }
}

async function assertMobileTaskRefreshFeedback(page, { scenarioName }) {
  const refreshButton = page
    .locator('.mobile-role-tasks-page header button')
    .filter({ hasText: '刷新' })
    .first()
  await refreshButton.waitFor({ state: 'visible', timeout: 10_000 })
  await refreshButton.click()
  await expectText(page, '数据已刷新')
  const beforeFailureMetrics = await readMobileTaskVisibleListMetrics(
    page,
    '.erp-mobile-list-item'
  )

  let failedOnce = false
  await page.route('**/rpc/workflow', async (route) => {
    const body = route.request().postDataJSON() || {}
    if (!failedOnce && body.method === 'list_tasks') {
      failedOnce = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: body.id || 'mobile-refresh-failed',
          result: {
            code: 500123,
            message: 'refresh failed',
            data: null,
          },
        }),
      })
      return
    }
    await route.fallback()
  })

  await refreshButton.click()
  await expectText(page, '刷新移动端任务失败，已保留上次数据')
  const afterFailureMetrics = await readMobileTaskVisibleListMetrics(
    page,
    '.erp-mobile-list-item'
  )
  assert.equal(
    afterFailureMetrics.itemCount,
    beforeFailureMetrics.itemCount,
    `${scenarioName} 刷新失败后没有保留上次任务列表: ${JSON.stringify({ beforeFailureMetrics, afterFailureMetrics })}`
  )
}

async function verifyBusinessModuleColumnOrderDialog(
  page,
  { moduleKey = 'project-orders', heading = '订单/款式立项' } = {}
) {
  const storageKey = `erp.module.column-order.${moduleKey}`
  await page.evaluate((key) => {
    window.localStorage.removeItem(key)
  }, storageKey)
  await verifyBusinessModuleColumnOrderHeaderMenu(page, { storageKey })
  const primaryToolbarActions = page
    .locator('.erp-business-operation-panel__actions')
    .first()
  await primaryToolbarActions.getByRole('button', { name: /列顺序/ }).click()
  const dialog = page.getByRole('dialog', { name: '调整列表列顺序' })
  await dialog.waitFor({ state: 'visible', timeout: 10_000 })
  await assertAntdModalCentered(page, dialog, 'business-column-order-modal')
  await expectText(page, '当前模块列顺序会跟随当前管理员账号保存')
  await dialog.screenshot({
    path: path.resolve(outputDir, 'business-column-order-modal.png'),
  })

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
  const firstColumnOrderSync = waitForAdminColumnOrderSync(page)
  await moveFirstButtons.nth(1).click()
  await firstColumnOrderSync
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
  const secondColumnOrderSync = waitForAdminColumnOrderSync(page)
  await enabledMoveLastButton.click()
  await secondColumnOrderSync
  await page.waitForFunction((label) => {
    const target = [...document.querySelectorAll('button[aria-label]')].find(
      (button) => button.getAttribute('aria-label') === label
    )
    return Boolean(target?.disabled)
  }, moveLastLabel)

  const storedOrder = await page.evaluate((key) => {
    return window.localStorage.getItem(key)
  }, storageKey)
  assert(Boolean(storedOrder), '列顺序面板调整后未写入本地缓存兜底')

  const persistedBoundaryLabels = await page.evaluate(() => {
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
    persistedBoundaryLabels.firstDisabled &&
      persistedBoundaryLabels.lastDisabled,
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
    persistedBoundaryLabels.firstDisabled,
    '清空本地缓存后未从账号偏好恢复首列顺序'
  )
  assert.equal(
    restoredBoundaryLabels.lastDisabled,
    persistedBoundaryLabels.lastDisabled,
    '清空本地缓存后未从账号偏好恢复末列顺序'
  )
  await dialog.locator('.ant-modal-close').click()
  await dialog.waitFor({ state: 'hidden', timeout: 10_000 })
}

async function verifyBusinessModuleColumnOrderHeaderMenu(page, { storageKey }) {
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
  await headerTriggers.nth(1).click()

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

  await menu.getByText('左移一列').click()
  await page.waitForFunction(
    ({ expectedFirstLabel }) => {
      const firstLabel = document.querySelector(
        '.erp-business-data-table-card .erp-module-column-header-text'
      )
      return String(firstLabel?.textContent || '').trim() === expectedFirstLabel
    },
    { expectedFirstLabel: headerLabelsBefore[1] }
  )

  const storedOrder = await page.evaluate((key) => {
    return window.localStorage.getItem(key)
  }, storageKey)
  assert(Boolean(storedOrder), '表头快捷调整后未写入本地缓存兜底')

  await headerTriggers.first().click()
  await menu
    .getByText('打开列顺序面板')
    .waitFor({ state: 'visible', timeout: 10_000 })
  await menu.getByText('打开列顺序面板').click()
  const dialog = page.getByRole('dialog', { name: '调整列表列顺序' })
  await dialog.waitFor({ state: 'visible', timeout: 10_000 })
  await dialog.locator('.ant-modal-close').click()
  await dialog.waitFor({ state: 'hidden', timeout: 10_000 })
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

async function verifyBusinessActionFormModal(
  page,
  {
    buttonName,
    titleText,
    minFieldCount = 4,
    screenshotName,
    expectedTexts = [],
    absentTexts = [],
    requireMultiColumn = true,
    afterOpen,
  }
) {
  await page.getByRole('button', { name: buttonName }).click()
  const modal = page
    .locator('.erp-business-action-modal--form.ant-modal:visible')
    .last()
  await modal.waitFor({ state: 'visible', timeout: 10_000 })
  await expectText(page, titleText)
  await assertAntdModalCentered(page, modal, `${screenshotName}-centered`)

  const metrics = await modal.evaluate((node) => {
    const body = node.querySelector('.ant-modal-body')
    const form = node.querySelector('.erp-business-action-form')
    const formStyle = form ? window.getComputedStyle(form) : null
    const title = node.querySelector('.erp-business-action-modal__title')
    const fieldItems = Array.from(
      node.querySelectorAll('.erp-business-action-form__field')
    )
    const controls = Array.from(
      node.querySelectorAll(
        [
          '.erp-business-action-form input.ant-input:not([type="hidden"])',
          '.erp-business-action-form textarea.ant-input',
          '.erp-business-action-form .ant-input-affix-wrapper',
          '.erp-business-action-form .ant-input-number',
          '.erp-business-action-form .ant-picker',
          '.erp-business-action-form .ant-select-selector',
        ].join(', ')
      )
    )
      .filter((control) => {
        if (
          control.matches('input.ant-input, textarea.ant-input') &&
          control.closest(
            '.ant-input-affix-wrapper, .ant-input-number, .ant-picker, .ant-select'
          )
        ) {
          return false
        }
        const rect = control.getBoundingClientRect()
        const style = window.getComputedStyle(control)
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        )
      })
      .map((control) => {
        const rect = control.getBoundingClientRect()
        const style = window.getComputedStyle(control)
        return {
          width: rect.width,
          height: rect.height,
          borderRadius: style.borderRadius,
        }
      })
    const singleLineControls = Array.from(
      node.querySelectorAll(
        [
          '.erp-business-action-form input.ant-input:not([type="hidden"])',
          '.erp-business-action-form .ant-input-affix-wrapper:not(.ant-input-textarea-affix-wrapper)',
          '.erp-business-action-form .ant-input-number',
          '.erp-business-action-form .ant-picker',
          '.erp-business-action-form .ant-select-single .ant-select-selector',
        ].join(', ')
      )
    )
      .filter((control) => {
        if (
          control.matches('input.ant-input') &&
          control.closest(
            '.ant-input-affix-wrapper, .ant-input-number, .ant-picker, .ant-select'
          )
        ) {
          return false
        }
        const rect = control.getBoundingClientRect()
        const style = window.getComputedStyle(control)
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        )
      })
      .map((control) => {
        const rect = control.getBoundingClientRect()
        const style = window.getComputedStyle(control)
        return {
          tagName: control.tagName,
          className: String(control.className || ''),
          height: rect.height,
          lineHeight: style.lineHeight,
        }
      })
    const textareaCountLayouts = Array.from(
      node.querySelectorAll(
        '.erp-business-action-form .ant-input-textarea-show-count'
      )
    )
      .filter((wrapper) => {
        const rect = wrapper.getBoundingClientRect()
        const style = window.getComputedStyle(wrapper)
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        )
      })
      .map((wrapper) => {
        const textarea = wrapper.querySelector('textarea.ant-input')
        const borderNode =
          wrapper.querySelector('.ant-input-textarea-affix-wrapper') || textarea
        const count = wrapper.querySelector('.ant-input-data-count')
        const wrapperRect = wrapper.getBoundingClientRect()
        const borderRect = borderNode?.getBoundingClientRect()
        const countRect = count?.getBoundingClientRect()
        const borderStyle = borderNode
          ? window.getComputedStyle(borderNode)
          : null
        const textareaStyle = textarea
          ? window.getComputedStyle(textarea)
          : null

        return {
          wrapper: {
            width: wrapperRect.width,
            height: wrapperRect.height,
            bottom: wrapperRect.bottom,
          },
          border: borderRect
            ? {
                top: borderRect.top,
                right: borderRect.right,
                bottom: borderRect.bottom,
                left: borderRect.left,
                width: borderRect.width,
                height: borderRect.height,
                paddingBottom: Number.parseFloat(
                  borderStyle?.paddingBottom || '0'
                ),
              }
            : null,
          textarea: textarea
            ? {
                clientWidth: textarea.clientWidth,
                scrollWidth: textarea.scrollWidth,
                paddingBottom: Number.parseFloat(
                  textareaStyle?.paddingBottom || '0'
                ),
              }
            : null,
          count: countRect
            ? {
                top: countRect.top,
                right: countRect.right,
                bottom: countRect.bottom,
                left: countRect.left,
                width: countRect.width,
                height: countRect.height,
                text: count.textContent?.replace(/\s+/g, ' ').trim() || '',
              }
            : null,
        }
      })
    const controlHeight =
      Number.parseFloat(
        formStyle?.getPropertyValue('--erp-control-height') || ''
      ) || 36
    return {
      className: String(node.className || ''),
      textContent: String(node.textContent || '')
        .replace(/\s+/g, ' ')
        .trim(),
      titleText: title?.textContent?.replace(/\s+/g, ' ').trim() || '',
      hasSubtitle: Boolean(title?.querySelector('small')),
      body: body
        ? {
            clientWidth: body.clientWidth,
            scrollWidth: body.scrollWidth,
          }
        : null,
      gridTemplateColumns: formStyle?.gridTemplateColumns || '',
      fieldItemCount: fieldItems.length,
      fullFieldCount: fieldItems.filter((item) =>
        item.classList.contains('erp-business-action-form__field--full')
      ).length,
      controls,
      controlHeight,
      singleLineControls,
      textareaCountLayouts,
    }
  })

  assert(
    metrics.className.includes('erp-business-action-modal--form'),
    `${screenshotName} 未使用业务表单弹窗标准类: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.titleText.includes(titleText) && metrics.hasSubtitle,
    `${screenshotName} 弹窗标题或说明未按业务样板展示: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.body && metrics.body.scrollWidth <= metrics.body.clientWidth + 1,
    `${screenshotName} 表单弹窗出现横向溢出: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.fieldItemCount >= minFieldCount,
    `${screenshotName} 表单字段数量不足: ${JSON.stringify(metrics)}`
  )
  for (const expectedText of expectedTexts) {
    assert(
      metrics.textContent.includes(expectedText),
      `${screenshotName} 缺少产品核心字段 ${expectedText}: ${JSON.stringify(metrics)}`
    )
  }
  for (const absentText of absentTexts) {
    assert(
      !metrics.textContent.includes(absentText),
      `${screenshotName} 不应继续显示旧字段 ${absentText}: ${JSON.stringify(metrics)}`
    )
  }
  if (typeof afterOpen === 'function') {
    await afterOpen(modal)
  }
  if (requireMultiColumn) {
    assert(
      metrics.gridTemplateColumns.split(' ').length >= 2,
      `${screenshotName} 桌面表单未使用多列表格化布局: ${JSON.stringify(metrics)}`
    )
  }
  assert(
    metrics.controls.every(
      (control) => control.width >= 120 && control.height >= 30
    ),
    `${screenshotName} 表单控件尺寸异常: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.singleLineControls.length > 0 &&
      metrics.singleLineControls.every(
        (control) => Math.abs(control.height - metrics.controlHeight) <= 1
      ),
    `${screenshotName} 单行输入控件高度未统一: ${JSON.stringify(metrics)}`
  )
  for (const layout of metrics.textareaCountLayouts) {
    assert(
      layout.border && layout.textarea && layout.count,
      `${screenshotName} 多行输入字数统计缺少边框、textarea 或计数器: ${JSON.stringify(layout)}`
    )
    assert(
      layout.count.top >= layout.border.top + 4 &&
        layout.count.right <= layout.border.right - 24 &&
        layout.count.bottom <= layout.border.bottom - 4 &&
        layout.count.left >= layout.border.left + 8,
      `${screenshotName} 多行输入字数统计超出输入框边界: ${JSON.stringify(layout)}`
    )
    assert(
      Math.max(layout.border.paddingBottom, layout.textarea.paddingBottom) >=
        layout.count.height + 6,
      `${screenshotName} 多行输入字数统计未预留内容底部空间: ${JSON.stringify(layout)}`
    )
    assert(
      layout.textarea.scrollWidth <= layout.textarea.clientWidth + 1,
      `${screenshotName} 多行输入框出现横向溢出: ${JSON.stringify(layout)}`
    )
  }

  await modal.screenshot({
    path: path.resolve(outputDir, `${screenshotName}.png`),
  })
  await closeBusinessFormModal(page, modal)
}

async function assertProcessSuggestionOptions(page, modal, { scenarioName }) {
  const readVisibleSuggestionOptions = async (popupClassName) => {
    const popup = page.locator(`${popupClassName}:visible`).last()
    await popup.waitFor({ state: 'visible', timeout: 10_000 })
    return (
      await popup.locator('.ant-select-item-option-content').allTextContents()
    )
      .map((text) => text.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
  }

  const assertSuggestionList = async (selector, expectedOptions, label) => {
    const input = modal.locator(`${selector} input`).first()
    const popupClassName = `${selector}__popup`
    await input.click()
    await input.fill('')
    let optionTexts = await readVisibleSuggestionOptions(popupClassName)
    for (const expected of expectedOptions) {
      if (!optionTexts.includes(expected)) {
        await input.fill(expected)
        optionTexts = await readVisibleSuggestionOptions(popupClassName)
      }
      assert(
        optionTexts.includes(expected),
        `${scenarioName} ${label}缺少行业默认候选 ${expected}: ${JSON.stringify(optionTexts)}`
      )
    }
    await page.keyboard.press('Escape')
  }

  await assertSuggestionList(
    '.erp-process-name-suggested-input',
    ['查货', '手工', '车缝', '包装'],
    '环节名称'
  )
  await assertSuggestionList(
    '.erp-process-category-suggested-input',
    ['查货', '手工', '车缝', '包装'],
    '环节类别'
  )
}

async function assertOutsourcingProcessSelectOptions(
  page,
  modal,
  { scenarioName }
) {
  const processField = modal
    .locator('.ant-form-item:has(.ant-form-item-label label[title="工序"])')
    .first()
  await processField.locator('.ant-select-selector').click()
  const dropdown = page.locator('.ant-select-dropdown:visible').last()
  await dropdown.waitFor({ state: 'visible', timeout: 10_000 })
  const optionTexts = (
    await dropdown.locator('.ant-select-item-option-content').allTextContents()
  )
    .map((text) => text.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  for (const expected of ['查货', '手工', '车缝', '包装']) {
    assert(
      optionTexts.some((text) => text.includes(expected)),
      `${scenarioName} 加工合同工序下拉缺少行业默认候选 ${expected}: ${JSON.stringify(optionTexts)}`
    )
  }
  await page.keyboard.press('Escape')
}

const {
  openPurchaseReceiptCreateModal,
  selectPurchaseReceiptRow,
  assertPurchaseReceiptActionButtonState,
  assertPurchaseReceiptRowItemCount,
  openPurchaseReceiptAddItemModal,
  assertBusinessFormModalKeyboardRecovery,
  assertPurchaseReceiptCreateModalKeyboardRecovery,
  fillPurchaseReceiptCreateModalBoundaryValues,
  fillPurchaseReceiptAddItemModalBoundaryValues,
  assertPurchaseReceiptCreateModalMetrics,
  assertPurchaseReceiptAddItemModalMetrics,
  assertPurchaseReceiptAddItemModalDarkTokens,
  assertPurchaseReceiptAddItemModalMobileLayout,
  assertPurchaseReceiptCreateModalFocusStyles,
  assertPurchaseReceiptCreateModalDarkTokens,
  assertPurchaseReceiptCreateModalMobileLayout,
  assertLineItemsUnifiedHorizontalScroll,
} = createPurchaseReceiptAssertions({
  assert,
  path,
  outputDir,
  assertAntdModalCentered,
  assertNoBlueFocusStyle,
  assertThemeReadable,
  expectText,
  isAcceptedFocusBorder,
})

async function assertOperationalFactModalViewport(page, scenarioName) {
  const modal = page
    .locator('.erp-business-action-modal--operational-fact.ant-modal:visible')
    .last()
  await modal.waitFor({ state: 'visible', timeout: 10_000 })
  await assertAntdModalCentered(page, modal, `${scenarioName}-centered`)
  const metrics = await modal.evaluate((node) => {
    const body = node.querySelector('.ant-modal-body')
    const form = node.querySelector('.erp-business-action-form')
    const modalRect = node.getBoundingClientRect()
    const bodyStyle = body ? window.getComputedStyle(body) : null
    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      modal: {
        top: modalRect.top,
        bottom: modalRect.bottom,
        width: modalRect.width,
        height: modalRect.height,
      },
      body: body
        ? {
            clientWidth: body.clientWidth,
            scrollWidth: body.scrollWidth,
            clientHeight: body.clientHeight,
            scrollHeight: body.scrollHeight,
            overflowY: bodyStyle?.overflowY || '',
          }
        : null,
      hasBusinessForm: Boolean(form),
    }
  })
  assert(
    metrics.hasBusinessForm,
    `${scenarioName} 未使用业务表单结构: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.body && metrics.body.scrollWidth <= metrics.body.clientWidth + 1,
    `${scenarioName} modal body 出现横向溢出: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.body &&
      (metrics.body.scrollHeight <= metrics.body.clientHeight + 1 ||
        metrics.body.overflowY === 'auto'),
    `${scenarioName} 长表单未由 modal body 承载滚动: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.modal.top >= -1 &&
      metrics.modal.bottom <= metrics.viewport.height + 1 &&
      metrics.modal.width <= metrics.viewport.width,
    `${scenarioName} modal 超出视口: ${JSON.stringify(metrics)}`
  )
  await modal.screenshot({
    path: path.resolve(outputDir, `${scenarioName}.png`),
  })
  await closeBusinessFormModal(page, modal)
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
      hasEllipsisCell: Boolean(node.querySelector('.ant-table-cell-ellipsis')),
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
  await expectText(page, '未选择来源')
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
    await expectText(page, '未选择来源')
  }

  if (selectText) {
    const sourceRow = await findSourceRow(selectText)
    const selectorControl = sourceRow
      .locator('.ant-checkbox-wrapper, .ant-radio-wrapper')
      .first()
    await selectorControl.click()
    await expectText(page, '已选 1 条')
    await expectText(page, '清空已选')
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
    await picker.getByRole('button', { name: '清空已选' }).click()
    await assertTextAbsent(page, '已选 1 条')
    await expectText(page, '未选择来源')
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
  const toolbar = page.locator('.erp-business-operation-panel__toolbar').first()
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

async function verifyBusinessRowDoubleClickEditModal(
  page,
  { rowText, titleText, scenarioName, afterModalOpen }
) {
  const row = page
    .locator('.erp-business-data-table-card .ant-table-tbody tr')
    .filter({ hasText: rowText })
    .first()
  await row.waitFor({ timeout: 10_000 })
  await row.dblclick()

  const modal = page
    .locator('.erp-business-action-modal--form.ant-modal:visible')
    .filter({ hasText: titleText })
    .last()
  await modal.waitFor({ state: 'visible', timeout: 10_000 })
  await expectText(page, titleText)
  if (afterModalOpen) {
    await afterModalOpen()
  }

  const modalMetrics = await page.evaluate(
    ({ expectedTitle }) => {
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
      return {
        visibleEditModals: Array.from(document.querySelectorAll('.ant-modal'))
          .filter(isVisible)
          .filter((node) =>
            String(node.textContent || '').includes(expectedTitle)
          ).length,
        visibleDetailDrawers: Array.from(
          document.querySelectorAll('.ant-drawer')
        ).filter(isVisible).length,
      }
    },
    { expectedTitle: titleText }
  )
  assert.equal(
    modalMetrics.visibleEditModals,
    1,
    `${scenarioName} 双击行应打开编辑弹窗: ${JSON.stringify(modalMetrics)}`
  )
  assert.equal(
    modalMetrics.visibleDetailDrawers,
    0,
    `${scenarioName} 双击行不应打开详情抽屉: ${JSON.stringify(modalMetrics)}`
  )

  await closeBusinessFormModal(page, modal)
}

async function closeBusinessFormModal(page, modal) {
  await modal
    .locator('.ant-modal-close')
    .click({ force: true })
    .catch(() => {})
  try {
    await modal.waitFor({ state: 'hidden', timeout: 10_000 })
  } catch {
    const closeButton = modal.getByRole('button', { name: /取消|关闭/ }).last()
    await closeButton.click({ force: true }).catch(() => {})
    await page.keyboard.press('Escape').catch(() => {})
    await modal.waitFor({ state: 'hidden', timeout: 10_000 })
  }
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

async function assertAdminLoginLayout(page, { minCardWidth }) {
  const metrics = await page.evaluate(() => {
    const card = document.querySelector('.erp-login-card')
    const logo = document.querySelector('.erp-login-logo')
    const usernameInput = document.querySelector(
      'input[autocomplete="username"]'
    )
    const passwordInput = document.querySelector('.ant-input-affix-wrapper')
    const submitButton = document.querySelector('button[type="submit"]')
    const cardStyle = card ? window.getComputedStyle(card) : null
    const submitStyle = submitButton
      ? window.getComputedStyle(submitButton)
      : null

    return {
      cardWidth: card?.getBoundingClientRect?.().width || 0,
      cardRadius: Number.parseFloat(cardStyle?.borderTopLeftRadius || '0'),
      logoWidth: logo?.getBoundingClientRect?.().width || 0,
      usernameHeight: usernameInput?.getBoundingClientRect?.().height || 0,
      passwordHeight: passwordInput?.getBoundingClientRect?.().height || 0,
      submitHeight: submitButton?.getBoundingClientRect?.().height || 0,
      submitRadius: Number.parseFloat(submitStyle?.borderTopLeftRadius || '0'),
      descriptionCount: document.querySelectorAll(
        '.erp-login-card__description'
      ).length,
      tagCount: document.querySelectorAll('.erp-login-card__tags .ant-tag')
        .length,
      footerText:
        document
          .querySelector(
            '.erp-login-card .ant-typography.ant-typography-secondary'
          )
          ?.textContent?.trim() || '',
    }
  })

  assert(
    metrics.cardWidth >= minCardWidth,
    `登录卡片宽度异常: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.cardRadius >= 16,
    `登录卡片圆角回退: ${JSON.stringify(metrics)}`
  )
  assert(metrics.logoWidth > 0, `登录品牌头未渲染: ${JSON.stringify(metrics)}`)
  assert(
    metrics.logoWidth <= metrics.cardWidth,
    `登录品牌头溢出卡片: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.usernameHeight >= 54,
    `登录账号输入框高度异常: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.passwordHeight >= 54,
    `登录密码输入框高度异常: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.submitHeight >= 54,
    `登录按钮高度异常: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.submitRadius >= 20,
    `登录按钮圆角回退: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.descriptionCount,
    0,
    `登录描述文案未移除: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.tagCount,
    0,
    `登录标签区未移除: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.footerText,
    '',
    `登录页底部补充文案未移除: ${JSON.stringify(metrics)}`
  )
}

async function assertAppAlertDialogLayout(page, { scenarioName }) {
  await page
    .locator('.app-alert-dialog')
    .waitFor({ state: 'visible', timeout: 10_000 })

  const metrics = await page.evaluate(() => {
    const parseRgb = (value) => {
      const match = String(value || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
      if (!match) return null
      return match.slice(1, 4).map(Number)
    }
    const channel = (value) => {
      const normalized = value / 255
      return normalized <= 0.03928
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4
    }
    const luminance = (rgb) =>
      rgb
        ? 0.2126 * channel(rgb[0]) +
          0.7152 * channel(rgb[1]) +
          0.0722 * channel(rgb[2])
        : 0
    const contrastRatio = (foreground, background) => {
      const lighter = Math.max(luminance(foreground), luminance(background))
      const darker = Math.min(luminance(foreground), luminance(background))
      return (lighter + 0.05) / (darker + 0.05)
    }
    const rectOf = (element) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }
    }
    const visibleElement = (selector) =>
      Array.from(document.querySelectorAll(selector)).find((element) => {
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        )
      }) || null

    const dialog = visibleElement('.app-alert-dialog')
    const overlay = dialog?.parentElement || null
    const title = dialog?.querySelector('[data-app-alert-title]') || null
    const message = dialog?.querySelector('[data-app-alert-message]') || null
    const confirm = dialog?.querySelector('[data-app-alert-confirm]') || null
    const dialogStyle = dialog ? window.getComputedStyle(dialog) : null
    const titleStyle = title ? window.getComputedStyle(title) : null
    const messageStyle = message ? window.getComputedStyle(message) : null
    const confirmStyle = confirm ? window.getComputedStyle(confirm) : null
    const backgroundColor = parseRgb(dialogStyle?.backgroundColor)

    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      overlay: {
        position: overlay ? window.getComputedStyle(overlay).position : '',
        width: overlay?.getBoundingClientRect().width || 0,
        height: overlay?.getBoundingClientRect().height || 0,
      },
      dialog: rectOf(dialog),
      title: {
        rect: rectOf(title),
        text: title?.textContent?.trim() || '',
        fontSize: Number.parseFloat(titleStyle?.fontSize || '0'),
        contrast: contrastRatio(parseRgb(titleStyle?.color), backgroundColor),
        scrollWidth: title?.scrollWidth || 0,
        clientWidth: title?.clientWidth || 0,
      },
      message: {
        rect: rectOf(message),
        text: message?.textContent?.trim() || '',
        fontSize: Number.parseFloat(messageStyle?.fontSize || '0'),
        contrast: contrastRatio(parseRgb(messageStyle?.color), backgroundColor),
        scrollWidth: message?.scrollWidth || 0,
        clientWidth: message?.clientWidth || 0,
      },
      confirm: {
        rect: rectOf(confirm),
        text: confirm?.textContent?.trim() || '',
        fontSize: Number.parseFloat(confirmStyle?.fontSize || '0'),
        backgroundColor: confirmStyle?.backgroundColor || '',
        contrast: contrastRatio(
          parseRgb(confirmStyle?.color),
          parseRgb(confirmStyle?.backgroundColor)
        ),
        scrollWidth: confirm?.scrollWidth || 0,
        clientWidth: confirm?.clientWidth || 0,
      },
    }
  })

  assert(
    metrics.dialog,
    `${scenarioName} 缺少通用提示弹窗: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.title.rect && metrics.message.rect && metrics.confirm.rect,
    `${scenarioName} 通用提示弹窗内部元素缺失: ${JSON.stringify(metrics)}`
  )
  assert.equal(metrics.title.text, '登录状态已失效')
  assert.equal(metrics.message.text, '未登录')
  assert.equal(metrics.confirm.text, '重新登录')
  assert.equal(
    metrics.overlay.position,
    'fixed',
    `${scenarioName} 遮罩层不再固定覆盖视口: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.overlay.width >= metrics.viewport.width &&
      metrics.overlay.height >= metrics.viewport.height,
    `${scenarioName} 遮罩层未覆盖移动视口: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.dialog.width >= 320 &&
      metrics.dialog.width <= metrics.viewport.width - 24,
    `${scenarioName} 移动端弹窗宽度异常: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.dialog.height <= metrics.viewport.height - 48,
    `${scenarioName} 移动端弹窗高度溢出: ${JSON.stringify(metrics)}`
  )
  assert(
    Math.abs(
      metrics.dialog.left +
        metrics.dialog.width / 2 -
        metrics.viewport.width / 2
    ) <= 2 &&
      Math.abs(
        metrics.dialog.top +
          metrics.dialog.height / 2 -
          metrics.viewport.height / 2
      ) <= 8,
    `${scenarioName} 通用提示弹窗未上下左右居中: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.title.fontSize >= 20 && metrics.message.fontSize >= 14,
    `${scenarioName} 弹窗字号过小: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.title.contrast >= 7 && metrics.message.contrast >= 4.5,
    `${scenarioName} 弹窗文字对比度不足: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.confirm.contrast >= 4.5,
    `${scenarioName} 弹窗按钮文字对比度不足: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.title.scrollWidth <= metrics.title.clientWidth + 1 &&
      metrics.message.scrollWidth <= metrics.message.clientWidth + 1 &&
      metrics.confirm.scrollWidth <= metrics.confirm.clientWidth + 1,
    `${scenarioName} 弹窗文字出现横向溢出: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.title.rect.bottom < metrics.message.rect.top &&
      metrics.message.rect.bottom < metrics.confirm.rect.top,
    `${scenarioName} 弹窗内部文字和按钮发生重叠: ${JSON.stringify(metrics)}`
  )
}

async function assertAdminRoleModalLayout(page, { scenarioName, title }) {
  const modal = page.locator('.ant-modal').filter({ hasText: title }).last()
  await modal.waitFor({ state: 'visible', timeout: 10_000 })
  await assertAntdModalCentered(page, modal, scenarioName)

  const metrics = await modal.evaluate((node) => {
    const body = node.querySelector('.ant-modal-body')
    const formItems = [...node.querySelectorAll('.ant-form-item')]
    const controls = [
      ...node.querySelectorAll(
        '.ant-input, .ant-input-affix-wrapper, .ant-select-selector'
      ),
    ]
      .filter(
        (control) =>
          !(
            control.matches('.ant-input') &&
            control.closest('.ant-input-affix-wrapper')
          )
      )
      .map((control) => {
        const rect = control.getBoundingClientRect()
        const style = window.getComputedStyle(control)
        return {
          text: control.textContent?.trim()?.slice(0, 32) || '',
          width: rect.width,
          height: rect.height,
          borderRadius: style.borderRadius,
          borderColor: style.borderColor,
        }
      })
    const bodyRect = body?.getBoundingClientRect()

    return {
      hasPermissionModalClass: node.classList.contains('erp-permission-modal'),
      body: bodyRect
        ? {
            width: bodyRect.width,
            height: bodyRect.height,
            scrollWidth: body.scrollWidth,
            scrollHeight: body.scrollHeight,
            clientHeight: body.clientHeight,
          }
        : null,
      formItemCount: formItems.length,
      hasRoleSelect: Boolean(
        [...node.querySelectorAll('.ant-select-selection-placeholder')].some(
          (item) => item.textContent?.includes('选择一个或多个角色')
        )
      ),
      controls,
    }
  })

  assert(
    metrics.body,
    `${scenarioName} 缺少弹窗 body: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.formItemCount >= 4 && metrics.hasRoleSelect,
    `${scenarioName} 创建管理员弹窗缺少账号/手机号/密码/角色字段: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.hasPermissionModalClass,
    `${scenarioName} 权限弹窗未挂载 erp-permission-modal，输入控件无法继承统一样式: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.body.scrollWidth <= metrics.body.width + 8,
    `${scenarioName} 创建管理员弹窗出现横向滚动: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.controls.every(
      (control) => control.width >= 120 && control.height >= 30
    ),
    `${scenarioName} 创建管理员弹窗控件尺寸异常: ${JSON.stringify(metrics)}`
  )
  const controlRadii = [
    ...new Set(metrics.controls.map((control) => control.borderRadius)),
  ]
  assert(
    controlRadii.length === 1 && controlRadii[0] === '10px',
    `${scenarioName} 创建管理员弹窗输入框圆角不一致: ${JSON.stringify(metrics)}`
  )
}

async function assertAntdModalCenteredImpl(page, modalLocator, scenarioName) {
  await modalLocator.waitFor({ state: 'visible', timeout: 10_000 })
  await modalLocator
    .waitFor({
      state: 'visible',
      timeout: 10_000,
    })
    .catch(() => {})
  await page.waitForFunction(
    (selector) => {
      const modals = Array.from(document.querySelectorAll(selector)).filter(
        (node) => {
          const rect = node.getBoundingClientRect()
          const style = window.getComputedStyle(node)
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden'
          )
        }
      )
      const modal = modals.at(-1)
      if (!modal) return false
      const className = String(modal.className || '')
      return (
        !className.includes('ant-zoom-enter') &&
        !className.includes('ant-zoom-appear')
      )
    },
    '.ant-modal',
    { timeout: 10_000 }
  )

  const metrics = await modalLocator.evaluate((node) => {
    const modal =
      node instanceof HTMLElement && node.classList.contains('ant-modal')
        ? node
        : node.closest('.ant-modal')
    const wrap = modal?.closest('.ant-modal-wrap')
    const modalRect = modal?.getBoundingClientRect()
    const wrapRect = wrap?.getBoundingClientRect()

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      wrap: wrapRect
        ? {
            width: wrapRect.width,
            height: wrapRect.height,
          }
        : null,
      wrapClassName: String(wrap?.className || ''),
      modalClassName: String(modal?.className || ''),
      modalTitle: String(
        modal?.querySelector('.ant-modal-title')?.textContent || ''
      ).trim(),
      modalStyle: modal?.getAttribute('style') || '',
      modal: modalRect
        ? {
            left: modalRect.left,
            right: modalRect.right,
            top: modalRect.top,
            bottom: modalRect.bottom,
            width: modalRect.width,
            height: modalRect.height,
            centerX: modalRect.left + modalRect.width / 2,
            centerY: modalRect.top + modalRect.height / 2,
          }
        : null,
    }
  })

  assert(
    metrics.modal,
    `${scenarioName} 缺少可验证的 Ant Design 弹窗: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.wrapClassName.includes('ant-modal-centered'),
    `${scenarioName} Ant Design 弹窗未启用 centered: ${JSON.stringify(metrics)}`
  )
  const horizontalCenterTolerance =
    metrics.modal.width >= metrics.viewport.width * 0.85 ? 20 : 3
  assert(
    Math.abs(metrics.modal.centerX - metrics.viewport.width / 2) <=
      horizontalCenterTolerance,
    `${scenarioName} 弹窗未水平居中: ${JSON.stringify(metrics)}`
  )
  assert(
    Math.abs(metrics.modal.centerY - metrics.viewport.height / 2) <= 8,
    `${scenarioName} 弹窗未垂直居中: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.modal.top >= -1 &&
      metrics.modal.bottom <= metrics.viewport.height + 1,
    `${scenarioName} 弹窗垂直居中后溢出视口: ${JSON.stringify(metrics)}`
  )
}

async function assertPermissionSectionVisualSeparation(page, { scenarioName }) {
  const metrics = await page.evaluate(() => {
    const adminSection = document.querySelector(
      '.erp-permission-section--admins'
    )
    const roleSection = document.querySelector('.erp-permission-section--roles')
    const read = (node) => {
      if (!node) return null
      const style = window.getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      return {
        top: rect.top,
        background: style.background,
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
      }
    }
    return {
      admin: read(adminSection),
      role: read(roleSection),
    }
  })
  assert(
    metrics.admin && metrics.role,
    `${scenarioName} 未找到权限管理两个主模块: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.admin.top < metrics.role.top,
    `${scenarioName} 管理员模块应在角色权限模块前: ${JSON.stringify(metrics)}`
  )
  assert.notEqual(
    metrics.admin.borderColor,
    metrics.role.borderColor,
    `${scenarioName} 暗色下两个模块边框颜色不可相同: ${JSON.stringify(metrics)}`
  )
  assert.notEqual(
    metrics.admin.background,
    metrics.role.background,
    `${scenarioName} 暗色下两个模块背景不可相同: ${JSON.stringify(metrics)}`
  )
}

async function _assertPermissionModalFocusStyle(page, scenarioName) {
  const focusTargets = [
    {
      label: '账号输入框',
      selector: '.erp-permission-modal input.ant-input:not([disabled])',
      action: 'focus',
    },
    {
      label: '密码输入框',
      selector:
        '.erp-permission-modal .ant-input-affix-wrapper input:not([disabled])',
      action: 'focus',
    },
    {
      label: '等级下拉框',
      selector: '.erp-permission-modal .ant-select-selector',
      action: 'click',
    },
  ]

  const checked = []
  for (const target of focusTargets) {
    const locator = page.locator(target.selector).first()
    if ((await locator.count()) === 0) {
      continue
    }

    if (target.action === 'click') {
      await locator.click()
    } else {
      await locator.evaluate((node) => node.focus({ preventScroll: true }))
    }
    await page.waitForTimeout(80)
    const metrics = await locator.evaluate((node, label) => {
      const sourceStyle = window.getComputedStyle(node)
      const focusedControl =
        node.matches('.ant-select-selector') ||
        node.matches('.ant-input-affix-wrapper')
          ? node
          : node.closest('.ant-input-affix-wrapper') ||
            node.closest('.ant-input-number') ||
            node
      const style = window.getComputedStyle(focusedControl)
      return {
        label,
        tagName: focusedControl.tagName,
        className: String(focusedControl.className || ''),
        activeElementTagName: document.activeElement?.tagName || '',
        isFocused: document.activeElement === node,
        matchesFocus: node.matches(':focus'),
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        sourceBorderColor: sourceStyle.borderColor,
        sourceBoxShadow: sourceStyle.boxShadow,
      }
    }, target.label)
    checked.push(metrics)
    const selectSearchMetrics = await readActiveSelectSearchFocusMetric(
      page,
      target.label
    )
    if (selectSearchMetrics) {
      checked.push(selectSearchMetrics)
    }
    if (target.action === 'click') {
      await page.keyboard.press('Escape').catch(() => {})
    }
  }

  assert(
    checked.length > 0,
    `${scenarioName} 未找到可验证 focus 的权限弹窗控件`
  )
  checked.forEach((metrics) => {
    assert(
      isAcceptedFocusBorder(metrics),
      `${scenarioName} ${metrics.label} focus 边框未统一到绿色主题: ${JSON.stringify(metrics)}`
    )
    assertNoBlueFocusStyle(metrics, scenarioName)
  })
}

async function assertVisibleModalInputFocusStyle(
  page,
  { scenarioName, modalText }
) {
  const activeModal = page
    .locator('.ant-modal:visible')
    .filter({ hasText: modalText })
    .last()
  await activeModal.waitFor({ state: 'visible', timeout: 10_000 })

  const focusTargets = [
    {
      label: '弹窗文本输入框',
      selector: 'input.ant-input:not([disabled])',
      action: 'focus',
    },
    {
      label: '弹窗多行输入框',
      selector: 'textarea.ant-input:not([disabled])',
      action: 'focus',
    },
    {
      label: '弹窗数字输入框',
      selector: '.ant-input-number-input:not([disabled])',
      action: 'focus',
    },
    {
      label: '弹窗下拉框',
      selector: '.ant-select-selector',
      action: 'click',
    },
  ]

  const checked = []
  for (const target of focusTargets) {
    const locator = activeModal.locator(target.selector).first()
    if ((await locator.count()) === 0) {
      continue
    }

    if (target.action === 'click') {
      await locator.click()
    } else {
      await locator.focus()
    }
    await page.waitForTimeout(80)
    const metrics = await locator.evaluate((node, label) => {
      const sourceStyle = window.getComputedStyle(node)
      const focusedControl =
        node.matches('.ant-select-selector') ||
        node.matches('.ant-input-affix-wrapper')
          ? node
          : node.closest('.ant-input-affix-wrapper') ||
            node.closest('.ant-input-number') ||
            node.closest('.ant-picker') ||
            node
      const style = window.getComputedStyle(focusedControl)
      return {
        label,
        tagName: focusedControl.tagName,
        className: String(focusedControl.className || ''),
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        sourceBorderColor: sourceStyle.borderColor,
        sourceBoxShadow: sourceStyle.boxShadow,
      }
    }, target.label)
    checked.push(metrics)
    const selectSearchMetrics = await readActiveSelectSearchFocusMetric(
      page,
      target.label
    )
    if (selectSearchMetrics) {
      checked.push(selectSearchMetrics)
    }
    if (target.action === 'click') {
      await page.keyboard.press('Escape').catch(() => {})
    }
  }

  assert(
    checked.length > 0,
    `${scenarioName} 未找到可验证 focus 的弹窗输入控件`
  )
  checked.forEach((metrics) => {
    assert(
      isAcceptedFocusBorder(metrics),
      `${scenarioName} ${metrics.label} focus 边框未统一到绿色主题: ${JSON.stringify(metrics)}`
    )
    assertNoBlueFocusStyle(metrics, scenarioName)
  })
}

async function readActiveSelectSearchFocusMetric(page, label) {
  return page.evaluate((sourceLabel) => {
    const { activeElement } = document
    if (
      !activeElement?.classList?.contains('ant-select-selection-search-input')
    ) {
      return null
    }

    const style = window.getComputedStyle(activeElement)
    return {
      label: `${sourceLabel}内部搜索输入`,
      tagName: activeElement.tagName,
      className: String(activeElement.className || ''),
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
      allowTransparentBorder: true,
      skipBorderColor: true,
    }
  }, label)
}

function _assertTradeLikeModalChrome(metrics, scenarioName) {
  const chrome = metrics.modalChrome
  assert(
    chrome?.content,
    `${scenarioName} 缺少可检查的弹窗壳层样式: ${JSON.stringify(metrics)}`
  )

  const pixel = (value) => Number.parseFloat(String(value || '0'))
  const contentBorderWidth =
    pixel(chrome.content.borderTopWidth) +
    pixel(chrome.content.borderRightWidth) +
    pixel(chrome.content.borderBottomWidth) +
    pixel(chrome.content.borderLeftWidth)
  assert.equal(
    contentBorderWidth,
    0,
    `${scenarioName} 弹窗壳层不应额外叠加边框: ${JSON.stringify(chrome)}`
  )
  assert.equal(
    pixel(chrome.header?.borderBottomWidth),
    0,
    `${scenarioName} 弹窗头部不应额外叠加分割线: ${JSON.stringify(chrome)}`
  )
  assert.equal(
    pixel(chrome.footer?.borderTopWidth),
    0,
    `${scenarioName} 弹窗底部不应额外叠加分割线: ${JSON.stringify(chrome)}`
  )

  const radius = pixel(chrome.content.borderRadius)
  assert(
    Number.isFinite(radius) && radius >= 9 && radius <= 16,
    `${scenarioName} 弹窗圆角未沿用 Ant Design / 当前 ERP 基线: ${JSON.stringify(chrome)}`
  )
  assert(
    pixel(chrome.content.paddingTop) >= 16 &&
      pixel(chrome.content.paddingRight) >= 20 &&
      pixel(chrome.content.paddingBottom) >= 16 &&
      pixel(chrome.content.paddingLeft) >= 20,
    `${scenarioName} 弹窗内容不应回退到 padding=0 的重定制壳层: ${JSON.stringify(chrome)}`
  )
  assert(
    !String(chrome.content.boxShadow || '').includes('24px 54px'),
    `${scenarioName} 弹窗不应回退到本项目旧重阴影: ${JSON.stringify(chrome)}`
  )
}

function _assertTradeLikeModalControls(metrics, scenarioName) {
  const visibleControls = (metrics.controls || []).filter(
    (control) =>
      control.width > 0 &&
      control.height > 0 &&
      !control.isNestedInAffixInput &&
      !String(control.className || '').includes('erp-item-field-unit-suffix') &&
      !String(control.className || '').includes('ant-btn-link')
  )
  assert(
    visibleControls.length > 0,
    `${scenarioName} 未找到可检查的弹窗控件: ${JSON.stringify(metrics)}`
  )
  visibleControls.forEach((control) => {
    const radius = Number.parseFloat(control.borderRadius)
    assert(
      Number.isFinite(radius) && radius >= 9,
      `${scenarioName} 控件圆角未符合当前 ERP 表单基线: ${JSON.stringify(control)}`
    )
  })

  const fieldControls = visibleControls.filter(
    (control) => !control.className.includes('ant-btn')
  )
  fieldControls.forEach((control) => {
    assert(
      !isTailwindFormsResetBorderColor(control.borderColor),
      `${scenarioName} 弹窗控件仍被 Tailwind/forms 默认边框接管: ${JSON.stringify(control)}`
    )
    assert(
      isNeutralModalControlBorderColor(control.borderColor) ||
        isGreenFocusColor(control.borderColor),
      `${scenarioName} 弹窗控件边框未统一到 AntD 浅灰 / ERP 绿色焦点态: ${JSON.stringify(control)}`
    )
    assert(
      control.disabled
        ? control.backgroundColor === 'rgb(255, 255, 255)' ||
            isLightReadonlyDisabledBackground(control.backgroundColor)
        : control.backgroundColor === 'rgb(255, 255, 255)',
      `${scenarioName} 弹窗控件背景未统一为白底输入框: ${JSON.stringify(control)}`
    )
  })

  const singleLineControls = fieldControls.filter(
    (control) =>
      control.tagName !== 'TEXTAREA' &&
      !control.isTextareaAffixWrapper &&
      !control.className.includes('ant-input-number-input')
  )
  singleLineControls.forEach((control) => {
    assert(
      control.height >= 31 && control.height <= 33,
      `${scenarioName} 弹窗单行控件高度未统一到 32px 基线: ${JSON.stringify(control)}`
    )
  })

  const primaryButtons = visibleControls.filter(
    (control) =>
      control.className.includes('ant-btn-primary') && !control.disabled
  )
  primaryButtons.forEach((control) => {
    assert(
      isGreenFocusColor(control.backgroundColor) ||
        isGreenFocusColor(control.borderColor),
      `${scenarioName} 主按钮未沿用当前 ERP 绿色主题: ${JSON.stringify(control)}`
    )
  })
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
      const textClientWidth = dateTextInput?.clientWidth || element.clientWidth
      const textScrollWidth = dateTextInput?.scrollWidth || element.scrollWidth
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
    Math.abs(metrics.statusArrow.centerY - metrics.statusSelector.centerY) <= 1,
    `${scenarioName} 状态筛选箭头未上下居中: ${JSON.stringify(metrics)}`
  )
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
    const select = document.querySelector('.ant-pagination-options .ant-select')
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

async function seedBusinessCollaborationOverflowTasks(
  page,
  { sourceType, currentSourceID }
) {
  const createTask = async (params) =>
    page.evaluate(async (taskParams) => {
      const response = await fetch('/rpc/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `seed-business-collab-${taskParams.task_code}`,
          method: 'create_task',
          params: taskParams,
        }),
      })
      const payload = await response.json()
      if (payload?.result?.code !== 0) {
        throw new Error(`create_task failed: ${JSON.stringify(payload)}`)
      }
    }, params)

  for (let index = 0; index < 12; index += 1) {
    await createTask({
      task_code: `style-l1-business-collab-page-${index + 1}`,
      task_group: sourceType,
      task_name:
        index === 11
          ? '超长本页协同任务名称用于验证很多任务时不会横向溢出ABCDEFGHIJKLMN1234567890'
          : `本页协同批量任务 ${index + 1}`,
      source_type: sourceType,
      source_id: 9000 + index,
      source_no: `PO-BULK-${String(index + 1).padStart(3, '0')}`,
      task_status_key: index < 3 ? 'blocked' : 'ready',
      owner_role_key: index % 2 === 0 ? 'purchase' : 'finance',
      blocked_reason:
        index < 3 ? '批量阻塞原因很长用于验证提示换行和面板滚动边界' : '',
      payload:
        index === 1
          ? {
              urged: true,
              urge_count: 18,
              last_urge_reason: '连续催办但仍未反馈',
            }
          : {},
    })
  }

  for (let index = 0; index < 2; index += 1) {
    await createTask({
      task_code: `style-l1-business-collab-current-${index + 1}`,
      task_group: sourceType,
      task_name: `当前采购订单协同任务 ${index + 1}`,
      source_type: sourceType,
      source_id: currentSourceID,
      source_no: 'PO-STYLE-L1',
      task_status_key: index === 0 ? 'blocked' : 'ready',
      owner_role_key: 'purchase',
      blocked_reason: index === 0 ? '当前记录阻塞原因' : '',
      payload: {},
    })
  }
}

async function assertBusinessCollaborationPanelCollapsedByDefault(
  page,
  {
    scenarioName,
    expectCurrentRecord = false,
    checkDesktopResize = true,
    checkResizeHandleHover = true,
    expectedOverflowNote = '',
    expectedTabTexts = null,
  }
) {
  const compactText = (text) => String(text || '').replace(/\s+/gu, '')
  const parseRgb = (value) => {
    const match = String(value || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/iu)
    if (!match) return null
    return match.slice(1, 4).map((part) => Number(part))
  }
  const assertSubtleSurfaceDifference = (metrics, label) => {
    const panelRgb = parseRgb(metrics.panelBackground)
    const tableRgb = parseRgb(metrics.tableCardBackground)
    assert(
      panelRgb && tableRgb,
      `${scenarioName} ${label} 无法读取协同面板和主表卡片背景色: ${JSON.stringify(
        metrics
      )}`
    )
    const maxDelta = Math.max(
      ...panelRgb.map((channel, index) => Math.abs(channel - tableRgb[index]))
    )
    assert.notEqual(
      metrics.panelBackground,
      metrics.tableCardBackground,
      `${scenarioName} ${label} 协同面板背景不应和主业务表卡片完全相同: ${JSON.stringify(
        metrics
      )}`
    )
    assert(
      maxDelta >= 2 && maxDelta <= 28,
      `${scenarioName} ${label} 协同面板背景应只做轻微层级区分，不能和主业务卡片差异过大: ${JSON.stringify(
        { ...metrics, maxDelta }
      )}`
    )
  }
  const panel = page.locator('.erp-business-collaboration-task-panel').first()
  await panel.waitFor({ state: 'visible', timeout: 10_000 })
  const toggle = panel.locator('button[aria-expanded]').first()
  await toggle.waitFor({ state: 'attached', timeout: 10_000 })

  const collapsedMetrics = await panel.evaluate((node) => {
    const toggleButton = node.querySelector('button[aria-expanded]')
    const panelBody = node.querySelector(
      '.erp-business-collaboration-task-panel__body'
    )
    const pageLayout = node.closest('.erp-business-page-layout')
    const tableCard = pageLayout?.querySelector('.erp-business-data-table-card')
    const panelStyle = getComputedStyle(node)
    const tableCardStyle = tableCard ? getComputedStyle(tableCard) : null
    return {
      className: node.className,
      ariaExpanded: toggleButton?.getAttribute('aria-expanded') || null,
      toggleText: String(toggleButton?.textContent || '').trim(),
      titleLineText: String(
        node.querySelector('.erp-business-collaboration-task-panel__title-line')
          ?.textContent || ''
      ).trim(),
      hasExpandedPanel: Boolean(
        node.querySelector('.erp-business-collaboration-task-panel__panel')
      ),
      hasActiveHead: Boolean(
        node.querySelector(
          '.erp-business-collaboration-task-panel__active-head'
        )
      ),
      tabCount: node.querySelectorAll(
        '.erp-business-collaboration-task-panel__tab'
      ).length,
      summaryItems: [
        ...node.querySelectorAll(
          '.erp-business-collaboration-task-panel__summary-item'
        ),
      ].map((item) => String(item.textContent || '').trim()),
      actionTagTexts: [
        ...node.querySelectorAll(
          '.erp-business-collaboration-task-panel__actions .ant-tag'
        ),
      ].map((item) => String(item.textContent || '').trim()),
      bodyHeight: panelBody?.getBoundingClientRect().height || 0,
      panelBackground: panelStyle.backgroundColor,
      tableCardBackground: tableCardStyle?.backgroundColor || '',
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }
  })

  assert.equal(
    collapsedMetrics.ariaExpanded,
    'false',
    `${scenarioName} 本页协同默认应收起: ${JSON.stringify(collapsedMetrics)}`
  )
  assert.equal(
    collapsedMetrics.hasExpandedPanel,
    false,
    `${scenarioName} 默认收起态不应渲染协同任务面板: ${JSON.stringify(collapsedMetrics)}`
  )
  assert.equal(
    collapsedMetrics.tabCount,
    0,
    `${scenarioName} 默认收起态不应显示任务 tab: ${JSON.stringify(collapsedMetrics)}`
  )
  assert.equal(
    collapsedMetrics.hasActiveHead,
    false,
    `${scenarioName} 默认收起态不应渲染展开态说明行: ${JSON.stringify(collapsedMetrics)}`
  )
  const collapsedSummaryText = collapsedMetrics.summaryItems.map(compactText)
  assert(
    collapsedSummaryText.some((text) => text.startsWith('待办')) &&
      collapsedSummaryText.some((text) => text.startsWith('阻塞')),
    `${scenarioName} 默认收起态应保留待办和阻塞摘要: ${JSON.stringify(
      collapsedMetrics
    )}`
  )
  if (expectCurrentRecord) {
    assert(
      collapsedSummaryText.some((text) => text.startsWith('当前')),
      `${scenarioName} 选中记录后收起态应显示当前记录摘要: ${JSON.stringify(
        collapsedMetrics
      )}`
    )
  } else {
    assert(
      !collapsedSummaryText.some(
        (text) => text.startsWith('当前') || text.includes('未选择')
      ),
      `${scenarioName} 未选中记录时不应展示空的当前记录占位: ${JSON.stringify(
        collapsedMetrics
      )}`
    )
  }
  assert.equal(
    collapsedMetrics.actionTagTexts.length,
    0,
    `${scenarioName} 默认收起态不应在右侧重复展示任务计数 tag: ${JSON.stringify(
      collapsedMetrics
    )}`
  )
  assert(
    compactText(collapsedMetrics.titleLineText).includes('只处理Workflow任务'),
    `${scenarioName} 本页协同应保留 Workflow-only 边界短句: ${JSON.stringify(
      collapsedMetrics
    )}`
  )
  assert(
    compactText(collapsedMetrics.toggleText).includes('展开'),
    `${scenarioName} 默认收起态按钮应提示展开: ${JSON.stringify(collapsedMetrics)}`
  )
  assert(
    collapsedMetrics.scrollWidth <= collapsedMetrics.clientWidth + 1,
    `${scenarioName} 默认收起态出现横向溢出: ${JSON.stringify(collapsedMetrics)}`
  )
  assertSubtleSurfaceDifference(collapsedMetrics, '默认收起态')

  await toggle.evaluate((button) => button.click())
  await panel
    .locator('.erp-business-collaboration-task-panel__panel')
    .waitFor({ state: 'visible', timeout: 10_000 })

  const expandedMetrics = await panel.evaluate((node) => {
    const toggleButton = node.querySelector('button[aria-expanded]')
    const tabList = node.querySelector(
      '.erp-business-collaboration-task-panel__tabs'
    )
    const tabPanel = node.querySelector(
      '.erp-business-collaboration-task-panel__list'
    )
    const panelBody = node.querySelector(
      '.erp-business-collaboration-task-panel__body'
    )
    const tabRects = [
      ...node.querySelectorAll('.erp-business-collaboration-task-panel__tab'),
    ].map((item) => item.getBoundingClientRect())
    const pageLayout = node.closest('.erp-business-page-layout')
    const rectFor = (selector) => {
      const target = pageLayout?.querySelector(selector)
      if (!target) return null
      const rect = target.getBoundingClientRect()
      const style = getComputedStyle(target)
      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        style.display === 'none' ||
        style.visibility === 'hidden'
      ) {
        return null
      }
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      }
    }
    const panelRect = node.getBoundingClientRect()
    const tableCard = pageLayout?.querySelector('.erp-business-data-table-card')
    const panelStyle = getComputedStyle(node)
    const tableCardStyle = tableCard ? getComputedStyle(tableCard) : null
    const panelBounds = {
      top: panelRect.top,
      right: panelRect.right,
      bottom: panelRect.bottom,
      left: panelRect.left,
      width: panelRect.width,
      height: panelRect.height,
    }
    const criticalRects = [
      {
        key: 'tablePagination',
        rect: rectFor('.erp-business-data-table-card .ant-pagination'),
      },
      {
        key: 'selectionActionBar',
        rect: rectFor('.erp-business-selection-action-bar'),
      },
      {
        key: 'listToolbar',
        rect: rectFor('.erp-business-list-toolbar'),
      },
    ].filter((item) => item.rect)
    const overlaps = criticalRects
      .filter((item) => {
        const { rect } = item
        return !(
          rect.right <= panelBounds.left ||
          rect.left >= panelBounds.right ||
          rect.bottom <= panelBounds.top ||
          rect.top >= panelBounds.bottom
        )
      })
      .map((item) => ({
        key: item.key,
        rect: item.rect,
      }))
    return {
      ariaExpanded: toggleButton?.getAttribute('aria-expanded') || null,
      toggleText: String(toggleButton?.textContent || '').trim(),
      textContent: String(node.textContent || '').trim(),
      hasExpandedPanel: Boolean(
        node.querySelector('.erp-business-collaboration-task-panel__panel')
      ),
      hasActiveHead: Boolean(
        node.querySelector(
          '.erp-business-collaboration-task-panel__active-head'
        )
      ),
      bodyHeight: panelBody?.getBoundingClientRect().height || 0,
      tabListRole: tabList?.getAttribute('role') || '',
      tabListLabel: tabList?.getAttribute('aria-label') || '',
      tabListDisplay: tabList ? getComputedStyle(tabList).display : '',
      tabTexts: [
        ...node.querySelectorAll('.erp-business-collaboration-task-panel__tab'),
      ].map((item) => String(item.textContent || '').trim()),
      taskItemCount: node.querySelectorAll(
        '.erp-business-collaboration-task-panel__item'
      ).length,
      moreNoteTexts: [
        ...node.querySelectorAll(
          '.erp-business-collaboration-task-panel__more-note'
        ),
      ].map((item) => String(item.textContent || '').trim()),
      summaryItems: [
        ...node.querySelectorAll(
          '.erp-business-collaboration-task-panel__summary-item'
        ),
      ].map((item) => String(item.textContent || '').trim()),
      maxTabHeight: Math.max(0, ...tabRects.map((rect) => rect.height)),
      tabA11y: [
        ...node.querySelectorAll('.erp-business-collaboration-task-panel__tab'),
      ].map((item) => ({
        role: item.getAttribute('role') || '',
        selected: item.getAttribute('aria-selected') || '',
        controls: item.getAttribute('aria-controls') || '',
        id: item.id || '',
      })),
      tabPanelRole: tabPanel?.getAttribute('role') || '',
      tabPanelLabelledBy: tabPanel?.getAttribute('aria-labelledby') || '',
      panelBounds,
      panelBackground: panelStyle.backgroundColor,
      tableCardBackground: tableCardStyle?.backgroundColor || '',
      criticalRects,
      overlaps,
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }
  })

  assert.equal(
    expandedMetrics.ariaExpanded,
    'true',
    `${scenarioName} 点击展开后 aria-expanded 应为 true: ${JSON.stringify(expandedMetrics)}`
  )
  assert.equal(
    expandedMetrics.hasActiveHead,
    false,
    `${scenarioName} 展开态不应在 tab 和列表之间插入重复说明行: ${JSON.stringify(
      expandedMetrics
    )}`
  )
  if (expectedTabTexts) {
    assert.deepEqual(
      expandedMetrics.tabTexts.map(compactText),
      expectedTabTexts.map(compactText),
      `${scenarioName} 展开后任务 tab 计数不正确: ${JSON.stringify(
        expandedMetrics
      )}`
    )
  } else {
    assert.deepEqual(
      expandedMetrics.tabTexts.map((text) =>
        compactText(text).replace(/\d+$/u, '')
      ),
      ['本页待办', '当前记录', '阻塞异常'],
      `${scenarioName} 展开后任务 tab 不完整: ${JSON.stringify(expandedMetrics)}`
    )
  }
  if (expectedOverflowNote) {
    assert(
      expandedMetrics.moreNoteTexts
        .map(compactText)
        .includes(compactText(expectedOverflowNote)),
      `${scenarioName} 多任务截断提示不正确: ${JSON.stringify(expandedMetrics)}`
    )
    assert.equal(
      expandedMetrics.taskItemCount,
      6,
      `${scenarioName} 多任务展开态应只渲染前 6 条任务: ${JSON.stringify(
        expandedMetrics
      )}`
    )
  } else {
    assert.deepEqual(
      expandedMetrics.moreNoteTexts,
      [],
      `${scenarioName} 未超出可见上限时不应显示截断提示: ${JSON.stringify(
        expandedMetrics
      )}`
    )
  }
  assert.deepEqual(
    expandedMetrics.summaryItems,
    [],
    `${scenarioName} 展开态不应在标题行重复展示任务摘要计数: ${JSON.stringify(
      expandedMetrics
    )}`
  )
  assert.equal(
    expandedMetrics.tabListRole,
    'tablist',
    `${scenarioName} 协同任务分类缺少 tablist 语义: ${JSON.stringify(expandedMetrics)}`
  )
  assert.equal(
    expandedMetrics.tabListLabel,
    '本页协同任务分类',
    `${scenarioName} 协同任务分类 aria-label 不正确: ${JSON.stringify(expandedMetrics)}`
  )
  assert.equal(
    expandedMetrics.tabListDisplay,
    'flex',
    `${scenarioName} 展开态任务分类应使用紧凑分段控件布局: ${JSON.stringify(
      expandedMetrics
    )}`
  )
  assert(
    expandedMetrics.maxTabHeight > 0 && expandedMetrics.maxTabHeight <= 36,
    `${scenarioName} 展开态任务分类高度过高: ${JSON.stringify(expandedMetrics)}`
  )
  assert(
    expandedMetrics.tabA11y.every((item) => item.role === 'tab'),
    `${scenarioName} 协同任务分类按钮缺少 tab 语义: ${JSON.stringify(expandedMetrics)}`
  )
  assert.equal(
    expandedMetrics.tabA11y.filter((item) => item.selected === 'true').length,
    1,
    `${scenarioName} 协同任务分类应只有一个 aria-selected=true: ${JSON.stringify(
      expandedMetrics
    )}`
  )
  assert.equal(
    expandedMetrics.tabPanelRole,
    'tabpanel',
    `${scenarioName} 协同任务列表缺少 tabpanel 语义: ${JSON.stringify(expandedMetrics)}`
  )
  assert.equal(
    expandedMetrics.tabPanelLabelledBy,
    expandedMetrics.tabA11y.find((item) => item.selected === 'true')?.id,
    `${scenarioName} 协同任务 tabpanel 未绑定当前 tab: ${JSON.stringify(
      expandedMetrics
    )}`
  )
  assert(
    compactText(expandedMetrics.toggleText).includes('收起'),
    `${scenarioName} 展开态按钮应提示收起: ${JSON.stringify(expandedMetrics)}`
  )
  assert(
    !expandedMetrics.textContent.includes(
      '按当前业务模块读取现有 workflow 任务'
    ),
    `${scenarioName} 展开态不应保留解释性占位文案: ${JSON.stringify(expandedMetrics)}`
  )
  assert(
    expandedMetrics.scrollWidth <= expandedMetrics.clientWidth + 1,
    `${scenarioName} 展开态出现横向溢出: ${JSON.stringify(expandedMetrics)}`
  )
  assertSubtleSurfaceDifference(expandedMetrics, '展开态')

  const viewportSize = page.viewportSize()
  if ((viewportSize?.width || 0) >= 769) {
    assert.deepEqual(
      expandedMetrics.overlaps,
      [],
      `${scenarioName} 桌面展开态本页协同不应遮挡分页、表格工具栏或当前操作区: ${JSON.stringify(
        expandedMetrics
      )}`
    )
  }
  const shouldInspectResizeHandle =
    (viewportSize?.width || 0) >= 769 &&
    (checkDesktopResize || checkResizeHandleHover)
  if (shouldInspectResizeHandle) {
    const resizeHandle = panel.locator(
      '.erp-business-collaboration-task-panel__resize-handle'
    )
    await resizeHandle.waitFor({ state: 'visible', timeout: 10_000 })

    const readResizeHandleVisualMetrics = async () =>
      panel.evaluate((node) => {
        const handle = node.querySelector(
          '.erp-business-collaboration-task-panel__resize-handle'
        )
        const grip = node.querySelector(
          '.erp-business-collaboration-task-panel__grip-bar'
        )
        const panelBody = node.querySelector(
          '.erp-business-collaboration-task-panel__body'
        )
        const handleRect = handle?.getBoundingClientRect()
        const gripRect = grip?.getBoundingClientRect()
        const panelBodyRect = panelBody?.getBoundingClientRect()
        const handleStyle = handle ? getComputedStyle(handle) : null
        const gripStyle = grip ? getComputedStyle(grip) : null
        return {
          panelBodyHeight: panelBodyRect?.height || 0,
          panelBodyTop: panelBodyRect?.top || 0,
          panelBodyBottom: panelBodyRect?.bottom || 0,
          handleTop: handleRect?.top || 0,
          handleBottom: handleRect?.bottom || 0,
          handleCursor: handleStyle?.cursor || '',
          handleBackground: handleStyle?.backgroundColor || '',
          handleHeight: handleRect?.height || 0,
          gripWidth: gripRect?.width || 0,
          gripHeight: gripRect?.height || 0,
          gripTop: gripRect?.top || 0,
          gripBottom: gripRect?.bottom || 0,
          gripBackground: gripStyle?.backgroundColor || '',
          gripBoxShadow: gripStyle?.boxShadow || '',
        }
      })

    if (checkResizeHandleHover) {
      const idleHandleMetrics = await readResizeHandleVisualMetrics()
      assert.equal(
        idleHandleMetrics.handleCursor,
        'default',
        `${scenarioName} 协同入口拖拽手柄未拖动时不应显示上下拖拽光标: ${JSON.stringify(
          idleHandleMetrics
        )}`
      )
      assert(
        idleHandleMetrics.handleHeight >= 14 &&
          idleHandleMetrics.handleHeight <= 18,
        `${scenarioName} 协同入口拖拽手柄命中区应便于鼠标拖拽且不应变成大块横杆: ${JSON.stringify(
          idleHandleMetrics
        )}`
      )
      assert(
        idleHandleMetrics.handleTop >= idleHandleMetrics.panelBodyTop - 0.5 &&
          idleHandleMetrics.gripTop >= idleHandleMetrics.panelBodyTop - 0.5 &&
          idleHandleMetrics.gripBottom <=
            idleHandleMetrics.panelBodyBottom + 0.5,
        `${scenarioName} 协同入口拖拽横杆必须在面板可见区域内，不能被卡片顶部裁切: ${JSON.stringify(
          idleHandleMetrics
        )}`
      )
      assert(
        idleHandleMetrics.gripHeight >= 5 && idleHandleMetrics.gripHeight <= 5,
        `${scenarioName} 协同入口拖拽短线应保持 5px 可见握柄: ${JSON.stringify(
          idleHandleMetrics
        )}`
      )
      assert.equal(
        idleHandleMetrics.gripBoxShadow,
        'none',
        `${scenarioName} 协同入口拖拽短线默认不应有阴影加粗: ${JSON.stringify(
          idleHandleMetrics
        )}`
      )

      await resizeHandle.hover()
      const hoverHandleMetrics = await readResizeHandleVisualMetrics()
      assert.equal(
        hoverHandleMetrics.handleCursor,
        'ns-resize',
        `${scenarioName} 协同入口拖拽手柄 hover 应提示可上下拖拽: ${JSON.stringify(
          { idleHandleMetrics, hoverHandleMetrics }
        )}`
      )
      assert.equal(
        hoverHandleMetrics.handleBackground,
        idleHandleMetrics.handleBackground,
        `${scenarioName} 协同入口拖拽手柄 hover 不应改变背景: ${JSON.stringify({
          idleHandleMetrics,
          hoverHandleMetrics,
        })}`
      )
      assert.equal(
        hoverHandleMetrics.gripBackground,
        idleHandleMetrics.gripBackground,
        `${scenarioName} 协同入口拖拽短线 hover 不应变色: ${JSON.stringify({
          idleHandleMetrics,
          hoverHandleMetrics,
        })}`
      )
      assert.equal(
        hoverHandleMetrics.gripHeight,
        idleHandleMetrics.gripHeight,
        `${scenarioName} 协同入口拖拽短线 hover 不应变粗: ${JSON.stringify({
          idleHandleMetrics,
          hoverHandleMetrics,
        })}`
      )
      assert(
        Math.abs(
          hoverHandleMetrics.panelBodyHeight - idleHandleMetrics.panelBodyHeight
        ) <= 0.5,
        `${scenarioName} 协同入口拖拽手柄 hover 不应改变面板高度: ${JSON.stringify(
          {
            idleHandleMetrics,
            hoverHandleMetrics,
          }
        )}`
      )
    }

    if (!checkDesktopResize) {
      await page.mouse.move(1, 1)
    }

    if (checkDesktopResize) {
      const beforeResizeMetrics = await panel.evaluate((node) => {
        const cardBody = node.querySelector('.ant-card-body')
        const panelBody = node.querySelector(
          '.erp-business-collaboration-task-panel__body'
        )
        const taskList = node.querySelector('.erp-business-module-task-list')
        return {
          cardBodyHeight: cardBody?.getBoundingClientRect().height || 0,
          bodyHeight: panelBody?.getBoundingClientRect().height || 0,
          listClientHeight: taskList?.clientHeight || 0,
          listScrollHeight: taskList?.scrollHeight || 0,
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
        }
      })
      assert(
        beforeResizeMetrics.bodyHeight >= 240 &&
          beforeResizeMetrics.bodyHeight <= 300,
        `${scenarioName} 协同入口默认高度应保持紧凑且可处理任务: ${JSON.stringify(
          beforeResizeMetrics
        )}`
      )

      const growHandleBox = await resizeHandle.boundingBox()
      assert(
        growHandleBox,
        `${scenarioName} 协同入口桌面拖拽手柄缺少可点击区域`
      )
      await page.mouse.move(
        growHandleBox.x + growHandleBox.width / 2,
        growHandleBox.y + growHandleBox.height / 2
      )
      await page.mouse.down()
      await page.mouse.move(
        growHandleBox.x + growHandleBox.width / 2,
        growHandleBox.y + growHandleBox.height / 2 - 120,
        { steps: 6 }
      )
      await page.mouse.up()

      const grownMetrics = await panel.evaluate((node) => {
        const cardBody = node.querySelector('.ant-card-body')
        const panelBody = node.querySelector(
          '.erp-business-collaboration-task-panel__body'
        )
        const taskList = node.querySelector('.erp-business-module-task-list')
        return {
          cardBodyHeight: cardBody?.getBoundingClientRect().height || 0,
          bodyHeight: panelBody?.getBoundingClientRect().height || 0,
          listClientHeight: taskList?.clientHeight || 0,
          listScrollHeight: taskList?.scrollHeight || 0,
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
        }
      })
      assert(
        grownMetrics.bodyHeight >= beforeResizeMetrics.bodyHeight + 80,
        `${scenarioName} 向上拖动后协同入口高度未增加: ${JSON.stringify({
          beforeResizeMetrics,
          grownMetrics,
        })}`
      )
      assert(
        grownMetrics.scrollWidth <= grownMetrics.clientWidth + 1,
        `${scenarioName} 拖高后协同入口出现横向溢出: ${JSON.stringify(grownMetrics)}`
      )

      const shrinkHandleBox = await resizeHandle.boundingBox()
      assert(shrinkHandleBox, `${scenarioName} 协同入口拖高后手柄丢失`)
      await page.mouse.move(
        shrinkHandleBox.x + shrinkHandleBox.width / 2,
        shrinkHandleBox.y + shrinkHandleBox.height / 2
      )
      await page.mouse.down()
      await page.mouse.move(
        shrinkHandleBox.x + shrinkHandleBox.width / 2,
        shrinkHandleBox.y + shrinkHandleBox.height / 2 + 100,
        { steps: 6 }
      )
      await page.mouse.up()

      const shrunkMetrics = await panel.evaluate((node) => {
        const cardBody = node.querySelector('.ant-card-body')
        const panelBody = node.querySelector(
          '.erp-business-collaboration-task-panel__body'
        )
        const taskList = node.querySelector('.erp-business-module-task-list')
        return {
          cardBodyHeight: cardBody?.getBoundingClientRect().height || 0,
          bodyHeight: panelBody?.getBoundingClientRect().height || 0,
          listClientHeight: taskList?.clientHeight || 0,
          listScrollHeight: taskList?.scrollHeight || 0,
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
        }
      })
      assert(
        shrunkMetrics.bodyHeight <= grownMetrics.bodyHeight - 70,
        `${scenarioName} 向下拖动后协同入口高度未缩小: ${JSON.stringify({
          grownMetrics,
          shrunkMetrics,
        })}`
      )
      assert(
        shrunkMetrics.bodyHeight >= 240,
        `${scenarioName} 拖动后协同入口低于最小高度: ${JSON.stringify(shrunkMetrics)}`
      )
      assert(
        shrunkMetrics.listScrollHeight >= shrunkMetrics.listClientHeight,
        `${scenarioName} 协同任务列表没有保持面板内滚动边界: ${JSON.stringify(shrunkMetrics)}`
      )
      assert(
        shrunkMetrics.scrollWidth <= shrunkMetrics.clientWidth + 1,
        `${scenarioName} 拖低后协同入口出现横向溢出: ${JSON.stringify(shrunkMetrics)}`
      )
    }
  }

  await toggle.evaluate((button) => button.click())
  const restoredMetrics = await panel.evaluate((node) => {
    const toggleButton = node.querySelector('button[aria-expanded]')
    return {
      ariaExpanded: toggleButton?.getAttribute('aria-expanded') || null,
      toggleText: String(toggleButton?.textContent || '').trim(),
      hasExpandedPanel: Boolean(
        node.querySelector('.erp-business-collaboration-task-panel__panel')
      ),
    }
  })
  assert.equal(
    restoredMetrics.ariaExpanded,
    'false',
    `${scenarioName} 收起后 aria-expanded 应恢复 false: ${JSON.stringify(restoredMetrics)}`
  )
  assert.equal(
    restoredMetrics.hasExpandedPanel,
    false,
    `${scenarioName} 收起后不应继续显示任务面板: ${JSON.stringify(restoredMetrics)}`
  )
  assert(
    compactText(restoredMetrics.toggleText).includes('展开'),
    `${scenarioName} 收起后按钮应恢复展开: ${JSON.stringify(restoredMetrics)}`
  )
}

async function verifyFormalShellRowDoubleClickEditModal(
  page,
  { rowText, scenarioName, expectedTexts = [] }
) {
  const row = page
    .locator('.erp-business-data-table-card .ant-table-tbody tr')
    .filter({ hasText: rowText })
    .first()
  await row.waitFor({ timeout: 10_000 })
  await row.dblclick()

  const modal = page
    .locator('.erp-business-action-modal--form.ant-modal:visible')
    .filter({ hasText: '当前边界' })
    .last()
  await modal.waitFor({ timeout: 10_000 })
  await expectText(page, '当前页面仍是待接入预览页')
  await expectText(page, rowText)

  const modalMetrics = await page.evaluate(() => {
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
    return {
      visibleEditModals: Array.from(document.querySelectorAll('.ant-modal'))
        .filter(isVisible)
        .filter((node) =>
          String(node.textContent || '').includes('当前页面仍是待接入预览页')
        ).length,
      visibleFormModals: Array.from(
        document.querySelectorAll('.erp-business-action-modal--form.ant-modal')
      ).filter(isVisible).length,
      textContent: Array.from(
        document.querySelectorAll('.erp-business-action-modal--form.ant-modal')
      )
        .filter(isVisible)
        .map((node) => String(node.textContent || ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
      formFieldCount: document.querySelectorAll(
        '.erp-business-action-modal--form .erp-business-action-form__field'
      ).length,
      visibleDetailDrawers: Array.from(document.querySelectorAll('.ant-drawer'))
        .filter(isVisible)
        .filter((node) => String(node.textContent || '').includes('旧入口关系'))
        .length,
    }
  })
  assert.equal(
    modalMetrics.visibleEditModals,
    1,
    `${scenarioName} 双击行应打开编辑动作弹窗: ${JSON.stringify(modalMetrics)}`
  )
  assert.equal(
    modalMetrics.visibleDetailDrawers,
    0,
    `${scenarioName} 双击行不应再打开详情抽屉: ${JSON.stringify(modalMetrics)}`
  )
  assert.equal(
    modalMetrics.visibleFormModals,
    1,
    `${scenarioName} 双击行应使用业务表单弹窗: ${JSON.stringify(modalMetrics)}`
  )
  assert(
    modalMetrics.formFieldCount >= 8,
    `${scenarioName} 正式业务壳编辑弹窗字段不足: ${JSON.stringify(modalMetrics)}`
  )
  for (const expectedText of expectedTexts) {
    assert(
      modalMetrics.textContent.includes(expectedText),
      `${scenarioName} 编辑弹窗缺少产品核心字段 ${expectedText}: ${JSON.stringify(modalMetrics)}`
    )
  }

  await closeBusinessFormModal(page, modal)
}

async function assertDashboardWorkbenchLayout(page, { scenarioName }) {
  await page.locator('.erp-workbench-command-card').waitFor({
    timeout: 10_000,
  })

  const metrics = await page.evaluate(() => {
    const rectOf = (selectorOrNode) => {
      const element =
        typeof selectorOrNode === 'string'
          ? document.querySelector(selectorOrNode)
          : selectorOrNode
      if (!(element instanceof HTMLElement)) return null
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
        display: style.display,
        gridTemplateColumns: style.gridTemplateColumns,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
      }
    }
    const overlaps = (left, right) => {
      if (!left || !right) return false
      return (
        left.left < right.right - 1 &&
        left.right > right.left + 1 &&
        left.top < right.bottom - 1 &&
        left.bottom > right.top + 1
      )
    }
    const commandCard = rectOf('.erp-workbench-command-card')
    const mainGrid = rectOf('.erp-workbench-main-grid')
    const queuePanel = rectOf('.erp-workbench-queue-panel')
    const detailPanel = rectOf('.erp-workbench-task-detail')
    const detailHead = rectOf(
      '.erp-workbench-task-detail .erp-workbench-panel-head'
    )
    const detailBody = rectOf('.erp-workbench-detail-body')
    const detailTitle = rectOf('.erp-workbench-detail-title')
    const detailDescriptions = rectOf(
      '.erp-workbench-task-detail .ant-descriptions'
    )
    const detailActions = rectOf('.erp-workbench-detail-actions')
    const detailEmpty = rectOf('.erp-workbench-detail-empty')
    const detailEmptyContent = rectOf('.erp-workbench-detail-empty .ant-empty')
    const queueFilters = Array.from(
      document.querySelectorAll('.erp-workbench-queue-filter')
    )
      .map((node) => rectOf(node))
      .filter(Boolean)
    const activeQueueFilters = document.querySelectorAll(
      '.erp-workbench-queue-filter[aria-pressed="true"]'
    ).length
    const roleRows = Array.from(
      document.querySelectorAll('.erp-workbench-role-row')
    )
      .map((node) => rectOf(node))
      .filter(Boolean)
    const activeRows = document.querySelectorAll(
      '.erp-workbench-task-row--active'
    ).length
    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        documentScrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      },
      commandCard,
      mainGrid,
      queuePanel,
      detailPanel,
      detailHead,
      detailBody,
      detailTitle,
      detailDescriptions,
      detailActions,
      detailEmpty,
      detailEmptyContent,
      queueFilters,
      activeQueueFilters,
      roleRows,
      activeRows,
      queueDetailOverlap: overlaps(queuePanel, detailPanel),
    }
  })

  assert(
    metrics.commandCard?.width > 0 && metrics.commandCard?.height > 0,
    `${scenarioName} 工作台主卡片不可见: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.queueFilters.length,
    3,
    `${scenarioName} 工作台应保留 3 个队列筛选入口: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.activeQueueFilters,
    1,
    `${scenarioName} 工作台应只有一个当前队列入口: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.queuePanel?.width > 0 && metrics.detailPanel?.width > 0,
    `${scenarioName} 工作台队列和当前任务上下文应同时可见: ${JSON.stringify(metrics)}`
  )
  assert(
    !metrics.queueDetailOverlap,
    `${scenarioName} 工作台主列与当前任务上下文不应重叠: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.detailHead?.height > 0,
    `${scenarioName} 工作台任务上下文头部应可见: ${JSON.stringify(metrics)}`
  )
  if (metrics.detailBody) {
    assert(
      metrics.detailTitle?.height > 0 &&
        metrics.detailDescriptions?.height > 0 &&
        metrics.detailActions?.height > 0,
      `${scenarioName} 工作台任务上下文正文、字段和动作区应同时可见: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.detailTitle.left >= metrics.detailPanel.left + 12 &&
        metrics.detailDescriptions.left >= metrics.detailPanel.left + 12 &&
        metrics.detailActions.left >= metrics.detailPanel.left + 12,
      `${scenarioName} 工作台任务上下文正文不应贴左边框: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.detailTitle.top >= metrics.detailHead.bottom + 12,
      `${scenarioName} 工作台任务上下文标题不应贴住头部分割线: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.detailActions.right <= metrics.detailPanel.right - 12 + 1 &&
        metrics.detailActions.bottom <= metrics.detailPanel.bottom - 12 + 1,
      `${scenarioName} 工作台任务上下文动作区不应贴边或溢出: ${JSON.stringify(metrics)}`
    )
  } else {
    assert(
      metrics.detailEmpty?.height > 0,
      `${scenarioName} 工作台任务上下文空态应可见: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.detailEmptyContent?.height > 0 &&
        metrics.detailEmptyContent.left >= metrics.detailPanel.left + 12 &&
        metrics.detailEmptyContent.top >= metrics.detailHead.bottom + 12 &&
        metrics.detailEmptyContent.right <=
          metrics.detailPanel.right - 12 + 1 &&
        metrics.detailEmptyContent.bottom <=
          metrics.detailPanel.bottom - 12 + 1,
      `${scenarioName} 工作台任务上下文空态不应贴边或溢出: ${JSON.stringify(metrics)}`
    )
  }
  assert(
    metrics.viewport.documentScrollWidth <= metrics.viewport.clientWidth + 1,
    `${scenarioName} 工作台出现页面级横向溢出: ${JSON.stringify(metrics)}`
  )
  if (metrics.viewport.width >= 1280) {
    assert(
      metrics.queuePanel.width > metrics.detailPanel.width,
      `${scenarioName} 桌面工作台应是左侧主队列、右侧上下文: ${JSON.stringify(metrics)}`
    )
  } else {
    assert(
      metrics.detailPanel.top >= metrics.queuePanel.bottom - 1,
      `${scenarioName} 窄屏工作台应改为上下排列: ${JSON.stringify(metrics)}`
    )
  }
}

async function assertDashboardWorkbenchEntryNavigation(page, { scenarioName }) {
  const nowSec = Math.floor(Date.now() / 1000)
  const createTask = async (params) =>
    page.evaluate(async (taskParams) => {
      const response = await fetch('/rpc/workflow', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `dashboard-workbench-entry-${taskParams.task_code}`,
          method: 'create_task',
          params: taskParams,
        }),
      })
      const payload = await response.json()
      if (payload?.result?.code !== 0) {
        throw new Error(`create_task failed: ${JSON.stringify(payload)}`)
      }
    }, params)

  await createTask({
    task_code: 'style-l1-dashboard-entry-sales-order',
    task_group: 'sales-orders',
    task_name: '工作台正式页关联任务',
    source_type: 'sales-orders',
    source_id: 1,
    source_no: 'SO-STYLE-L1',
    business_status_key: 'project_pending',
    task_status_key: 'ready',
    owner_role_key: 'sales',
    due_at: nowSec + 3_600,
    payload: { notification_type: 'task_created' },
  })
  await createTask({
    task_code: 'style-l1-dashboard-entry-shell',
    task_group: 'shipment_release',
    task_name: '工作台待接入预览任务',
    source_type: 'shipping-release',
    source_id: 9011,
    source_no: 'OUT-DASH-SHELL',
    business_status_key: 'shipment_pending',
    task_status_key: 'ready',
    owner_role_key: 'warehouse',
    due_at: nowSec + 7_200,
    payload: {
      notification_type: 'task_created',
      alert_type: 'shipment_pending',
    },
  })

  await page.getByRole('button', { name: '刷新当前页' }).click()
  await expectText(page, '工作台正式页关联任务')
  await expectText(page, '工作台待接入预览任务')

  const formalRow = page
    .locator('.erp-workbench-queue-panel .ant-table-row')
    .filter({ hasText: '工作台正式页关联任务' })
    .first()
  await formalRow.click()
  const detailPanel = page.locator('.erp-workbench-task-detail')
  await expectText(page, 'SO-STYLE-L1')
  await detailPanel
    .getByRole('button', { name: '关联记录', exact: true })
    .click()
  await waitForPath(page, '/erp/sales/project-orders/sales-orders')
  assert.match(
    page.url(),
    /[?&]link_keyword=SO-STYLE-L1(?:&|$)/,
    `${scenarioName} 正式页关联入口应带来源单号: ${page.url()}`
  )
  await expectHeading(page, '销售订单')
  await expectText(page, 'SO-STYLE-L1')

  await gotoScenarioPath(page, '/erp/dashboard', {
    waitUntil: 'domcontentloaded',
  })
  await expectHeading(page, '工作台')
  await expectText(page, '工作台待接入预览任务')
  const shellRow = page
    .locator('.erp-workbench-queue-panel .ant-table-row')
    .filter({ hasText: '工作台待接入预览任务' })
    .first()
  await shellRow.click()
  await detailPanel
    .getByText('工作台待接入预览任务', { exact: true })
    .waitFor({ state: 'visible', timeout: 10_000 })
  assert.equal(
    await detailPanel
      .getByRole('button', { name: '关联记录', exact: true })
      .count(),
    0,
    `${scenarioName} formal-shell 任务不应显示关联记录按钮`
  )
}

async function assertDashboardTaskBoardLayout(page, { scenarioName }) {
  await page.locator('.erp-dashboard-task-board-card').waitFor({
    timeout: 10_000,
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
    const rectOf = (selectorOrNode) => {
      const element =
        typeof selectorOrNode === 'string'
          ? document.querySelector(selectorOrNode)
          : selectorOrNode
      if (!(element instanceof HTMLElement)) return null
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        position: style.position,
        gridTemplateColumns: style.gridTemplateColumns,
      }
    }
    const boardCard = rectOf('.erp-dashboard-task-board-card')
    const lanes = rectOf('.erp-task-board-lanes')
    const filters = rectOf('.erp-task-board-filters')
    const tableCard = rectOf('.erp-dashboard-table-card')
    const visiblePageHeads = Array.from(
      document.querySelectorAll('.erp-admin-page-head')
    ).filter(isVisible).length
    const laneRects = Array.from(
      document.querySelectorAll('.erp-task-board-lane')
    )
      .map((node) => rectOf(node))
      .filter(Boolean)
    const overlappingLanePairs = []
    for (let i = 0; i < laneRects.length; i += 1) {
      for (let j = i + 1; j < laneRects.length; j += 1) {
        const left = laneRects[i]
        const right = laneRects[j]
        const xOverlap =
          left.left < right.right - 1 && left.right > right.left + 1
        const yOverlap =
          left.top < right.bottom - 1 && left.bottom > right.top + 1
        if (xOverlap && yOverlap) {
          overlappingLanePairs.push([i, j])
        }
      }
    }

    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        documentScrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      },
      boardCard,
      lanes,
      filters,
      laneRects,
      overlappingLanePairs,
      tableCard,
      visiblePageHeads,
    }
  })

  assert(
    metrics.boardCard && metrics.lanes && metrics.filters,
    `${scenarioName} 缺少任务看板布局关键节点: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.laneRects.length === 4,
    `${scenarioName} 任务看板应渲染四个泳道: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.laneRects.every((lane) => lane.width >= 180 && lane.height > 0),
    `${scenarioName} 任务看板泳道尺寸异常: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.overlappingLanePairs.length === 0,
    `${scenarioName} 任务看板泳道之间发生重叠: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.filters.right <= metrics.boardCard.right + 2,
    `${scenarioName} 任务看板筛选区溢出卡片: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.visiblePageHeads,
    0,
    `${scenarioName} 任务看板不应再渲染独立页面说明卡: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.tableCard,
    null,
    `${scenarioName} 任务看板不应再重复渲染明细表: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.viewport.documentScrollWidth <= metrics.viewport.clientWidth + 2,
    `${scenarioName} 任务看板产生页面级横向滚动: ${JSON.stringify(metrics)}`
  )
}

async function assertTaskActionDrawerLayout(
  page,
  {
    scenarioName,
    expectedTaskText,
    expectedActionText,
    expectReasonInput = false,
  }
) {
  const drawer = page.locator('.erp-task-action-drawer').filter({
    hasText: expectedTaskText,
  })
  await drawer.waitFor({ state: 'visible', timeout: 10_000 })
  await expectText(page, expectedActionText)
  await expectText(page, 'Workflow / Fact 边界：')

  const metrics = await page.evaluate(
    ({ expectedTaskText: taskText }) => {
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
      const rectOf = (selectorOrNode) => {
        const element =
          typeof selectorOrNode === 'string'
            ? document.querySelector(selectorOrNode)
            : selectorOrNode
        if (!(element instanceof HTMLElement)) return null
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          display: style.display,
          gridTemplateColumns: style.gridTemplateColumns,
        }
      }
      const drawerElement = Array.from(
        document.querySelectorAll('.erp-task-action-drawer')
      )
        .filter(isVisible)
        .find((node) => String(node.textContent || '').includes(taskText))
      const scopeRect = rectOf(drawerElement)
      const rectInDrawer = (selector) =>
        drawerElement instanceof HTMLElement
          ? rectOf(drawerElement.querySelector(selector))
          : null
      const summary = rectInDrawer('.erp-task-action-drawer__summary')
      const metaGrid = rectInDrawer('.erp-task-action-drawer__meta-grid')
      const guide = rectInDrawer('.erp-task-action-drawer__guide')
      const guideSteps = rectInDrawer('.erp-task-action-drawer__guide-steps')
      const guideNote = rectInDrawer('.erp-task-action-drawer__guide-note')
      const actionPanel =
        rectInDrawer('.erp-task-action-drawer__action-panel') ||
        rectInDrawer('.erp-task-action-drawer__action-prompt')
      const footer = rectInDrawer('.ant-drawer-footer')
      const body = rectInDrawer('.ant-drawer-body')
      const textArea = rectInDrawer('textarea')
      const metaItems =
        drawerElement?.querySelectorAll(
          '.erp-task-action-drawer__meta-grid > div'
        ).length || 0
      const stepItems =
        drawerElement?.querySelectorAll('.erp-task-action-drawer__step')
          .length || 0
      const footerButtons =
        drawerElement?.querySelectorAll(
          '.erp-task-action-drawer__footer-actions button'
        ).length || 0
      return {
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          documentScrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        },
        scopeRect,
        summary,
        metaGrid,
        guide,
        guideSteps,
        guideNote,
        actionPanel,
        footer,
        body,
        textArea,
        metaItems,
        stepItems,
        footerButtons,
      }
    },
    { expectedTaskText }
  )

  assert(
    metrics.scopeRect?.width > 0 && metrics.scopeRect?.height > 0,
    `${scenarioName} 任务处理抽屉不可见: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.scopeRect.width <= Math.min(650, metrics.viewport.width) + 2,
    `${scenarioName} 任务处理抽屉宽度超出预期: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.summary?.height > 0 &&
      metrics.metaGrid?.height > 0 &&
      metrics.guide?.height > 0 &&
      metrics.guideSteps?.height > 0 &&
      metrics.guideNote?.height > 0 &&
      metrics.actionPanel?.height > 0 &&
      metrics.footer?.height > 0,
    `${scenarioName} 任务处理抽屉缺少关键分区: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.metaItems,
    4,
    `${scenarioName} 任务处理抽屉应展示 4 个任务摘要字段: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.stepItems,
    3,
    `${scenarioName} 任务处理抽屉应展示 3 个处理步骤: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.footerButtons >= 2,
    `${scenarioName} 任务处理抽屉底部动作不足: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    Boolean(metrics.textArea),
    expectReasonInput,
    `${scenarioName} 原因输入显示状态不符合当前动作: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.summary.right <= metrics.scopeRect.right + 2 &&
      metrics.metaGrid.right <= metrics.scopeRect.right + 2 &&
      metrics.guide.right <= metrics.scopeRect.right + 2 &&
      metrics.guideSteps.right <= metrics.scopeRect.right + 2 &&
      metrics.guideNote.right <= metrics.scopeRect.right + 2 &&
      metrics.actionPanel.right <= metrics.scopeRect.right + 2,
    `${scenarioName} 任务处理抽屉内容横向溢出: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.footer.top >= metrics.body.top &&
      metrics.footer.bottom <= metrics.scopeRect.bottom + 2,
    `${scenarioName} 任务处理抽屉底部动作区位置异常: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.viewport.documentScrollWidth <= metrics.viewport.clientWidth + 2,
    `${scenarioName} 打开任务处理抽屉后页面产生横向滚动: ${JSON.stringify(metrics)}`
  )
}

function isIgnorableDevServerError(text) {
  return (
    text.includes('Outdated Request') ||
    text.includes('[hmr] Failed to reload') ||
    text.includes('net::ERR_CONNECTION_REFUSED') ||
    text.includes('[vite] failed to connect to websocket') ||
    text.includes(
      'Warning: trigger element and popup element should in same shadow root.'
    ) ||
    (text.includes("WebSocket connection to 'ws://127.0.0.1:") &&
      text.includes('net::ERR_ADDRESS_INVALID'))
  )
}

async function assertNoHorizontalOverflow(page, scenarioName) {
  const metrics = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }))

  assert(
    metrics.bodyScrollWidth <= metrics.viewportWidth + 2,
    `${scenarioName} body 出现横向溢出: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.docScrollWidth <= metrics.viewportWidth + 2,
    `${scenarioName} document 出现横向溢出: ${JSON.stringify(metrics)}`
  )
}

async function assertBusinessMainTableHasNoOperationColumn(
  page,
  { scenarioName }
) {
  const metrics = await page.evaluate(() => {
    const tableCard = document.querySelector('.erp-business-data-table-card')
    const headers = tableCard
      ? Array.from(tableCard.querySelectorAll('.ant-table-thead th')).map(
          (node) =>
            String(node.textContent || '')
              .replace(/\s+/g, ' ')
              .trim()
        )
      : []
    return { headers }
  })

  assert(
    metrics.headers.length > 0,
    `${scenarioName} 未找到业务主表表头: ${JSON.stringify(metrics)}`
  )
  assert(
    !metrics.headers.includes('操作'),
    `${scenarioName} 业务主表不应再出现操作列: ${JSON.stringify(metrics)}`
  )
}

async function assertBusinessMainTableInitialSelectionEmpty(
  page,
  { scenarioName }
) {
  const metrics = await page.evaluate(() => {
    const tableCard = document.querySelector('.erp-business-data-table-card')
    const dataRows = Array.from(
      tableCard?.querySelectorAll('.ant-table-tbody > tr.ant-table-row') || []
    )
    const checkedInputs = Array.from(
      tableCard?.querySelectorAll('.ant-table-selection-column input') || []
    ).filter((input) => input.checked)
    const checkedWrappers = Array.from(
      tableCard?.querySelectorAll(
        '.ant-table-selection-column .ant-checkbox-wrapper-checked, .ant-table-selection-column .ant-radio-wrapper-checked'
      ) || []
    )
    const selectedRows = dataRows.filter((row) =>
      row.classList.contains('ant-table-row-selected')
    )
    const actionBar = document.querySelector(
      '.erp-business-module-current-action'
    )
    return {
      hasTable: Boolean(tableCard),
      dataRowCount: dataRows.length,
      checkedInputCount: checkedInputs.length,
      checkedWrapperCount: checkedWrappers.length,
      selectedRowCount: selectedRows.length,
      actionText: actionBar?.textContent?.replace(/\s+/g, ' ').trim() || '',
      actionHasEmptyClass:
        actionBar?.classList.contains(
          'erp-business-selection-action-bar--empty'
        ) || false,
      actionHasActiveClass:
        actionBar?.classList.contains(
          'erp-business-selection-action-bar--active'
        ) || false,
    }
  })

  assert(
    metrics.hasTable && metrics.dataRowCount > 0,
    `${scenarioName} 业务主表应已有可检查的数据行: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.checkedInputCount,
    0,
    `${scenarioName} 初始进入不应默认勾选业务记录: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.checkedWrapperCount,
    0,
    `${scenarioName} 初始进入不应残留选中控件样式: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.selectedRowCount,
    0,
    `${scenarioName} 初始进入不应默认高亮业务记录: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.actionHasEmptyClass && !metrics.actionHasActiveClass,
    `${scenarioName} 初始当前操作区应为空选择态: ${JSON.stringify(metrics)}`
  )
}

async function assertBusinessMainTableSortableColumns(
  page,
  { scenarioName, unsortableHeaders = [] }
) {
  const metrics = await page.evaluate(() => {
    const tableCard = document.querySelector('.erp-business-data-table-card')
    const headers = tableCard
      ? Array.from(tableCard.querySelectorAll('.ant-table-thead th')).map(
          (node) => ({
            text: String(node.textContent || '')
              .replace(/\s+/g, ' ')
              .trim(),
            isSelectionColumn: node.classList.contains(
              'ant-table-selection-column'
            ),
            hasSorter: Boolean(
              node.querySelector(
                '.ant-table-column-sorters, .ant-table-column-sorter'
              )
            ),
          })
        )
      : []
    return { headers }
  })
  const skippedHeaders = new Set(unsortableHeaders)
  const sortableHeaders = metrics.headers.filter(
    (header) =>
      header.text &&
      !header.isSelectionColumn &&
      !skippedHeaders.has(header.text)
  )
  const missingSorters = sortableHeaders.filter((header) => !header.hasSorter)

  assert(
    sortableHeaders.length > 0,
    `${scenarioName} 未找到可排序业务主表列: ${JSON.stringify(metrics)}`
  )
  assert.deepEqual(
    missingSorters,
    [],
    `${scenarioName} 业务主表数据列缺少排序入口: ${JSON.stringify(metrics)}`
  )
}

async function assertBusinessHeaderHasNoSectionTitle(page, { scenarioName }) {
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
    const header = document.querySelector('.erp-business-page-header-card')
    const directSectionLabels = header
      ? Array.from(
          header.querySelectorAll(
            '.erp-business-page-header-card__main > div > .ant-typography'
          )
        )
          .filter(isVisible)
          .map((node) =>
            String(node.textContent || '')
              .replace(/\s+/g, ' ')
              .trim()
          )
      : []
    const forbiddenLabels = ['基础资料', '销售链路', '正式业务入口']
    const headerText = String(header?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()

    return {
      hasHeader: Boolean(header),
      directSectionLabels,
      forbiddenLabelsInHeader: forbiddenLabels.filter((label) =>
        headerText.includes(label)
      ),
    }
  })

  assert(
    metrics.hasHeader,
    `${scenarioName} 缺少业务页头部卡片: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.directSectionLabels.length,
    0,
    `${scenarioName} 业务页头部不应显示分组小标题: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.forbiddenLabelsInHeader.length,
    0,
    `${scenarioName} 业务页头部仍出现重复分组文案: ${JSON.stringify(metrics)}`
  )
}

async function assertBusinessHeaderStatsSingleLine(
  page,
  {
    scenarioName,
    expectedLabels = ['总记录', '当前结果', '待处理', '已选记录'],
  }
) {
  const metrics = await page.evaluate(() => {
    const header = document.querySelector('.erp-business-page-header-card')
    const headerRect = header?.getBoundingClientRect()
    const grid = document.querySelector('.erp-business-page-header-card__grid')
    const gridStyle = grid ? window.getComputedStyle(grid) : null
    const main = document.querySelector('.erp-business-page-header-card__main')
    const mainRect = main?.getBoundingClientRect()
    const stats = document.querySelector('.erp-business-module-stats')
    const statsRect = stats?.getBoundingClientRect()
    const statsStyle = stats ? window.getComputedStyle(stats) : null
    const tiles = Array.from(
      document.querySelectorAll(
        '.erp-business-module-stats .erp-business-page-header-card__stat'
      )
    ).map((tile) => {
      const rect = tile.getBoundingClientRect()
      const label = tile.querySelector('.ant-typography')
      const labelRect = label?.getBoundingClientRect()
      const labelStyle = label ? window.getComputedStyle(label) : null
      const badge = tile.querySelector('.erp-metric-readonly-card__badge')
      const badgeRect = badge?.getBoundingClientRect()
      const tileStyle = window.getComputedStyle(tile)
      return {
        tagName: tile.tagName,
        role: tile.getAttribute('role'),
        cursor: tileStyle.cursor,
        text: tile.textContent?.replace(/\s+/g, ' ').trim() || '',
        badge: badge?.textContent || '',
        hasButton: Boolean(tile.querySelector('button')),
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
        labelWidth: labelRect?.width || 0,
        labelScrollWidth: label?.scrollWidth || 0,
        labelWhiteSpace: labelStyle?.whiteSpace || '',
        labelTextOverflow: labelStyle?.textOverflow || '',
        labelOverflow: labelStyle?.overflow || '',
        badgeLabelGap:
          labelRect && badgeRect ? badgeRect.left - labelRect.right : null,
      }
    })
    return {
      viewportWidth: window.innerWidth,
      bodyScrollWidth: document.body.scrollWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      header: headerRect
        ? {
            left: headerRect.left,
            right: headerRect.right,
            width: headerRect.width,
          }
        : null,
      grid: gridStyle
        ? {
            gridTemplateColumns: gridStyle.gridTemplateColumns,
            alignItems: gridStyle.alignItems,
          }
        : null,
      main: mainRect
        ? {
            left: mainRect.left,
            right: mainRect.right,
            width: mainRect.width,
          }
        : null,
      stats: statsRect
        ? {
            left: statsRect.left,
            right: statsRect.right,
            width: statsRect.width,
            scrollWidth: stats?.scrollWidth || 0,
            clientWidth: stats?.clientWidth || 0,
            flexWrap: statsStyle?.flexWrap || '',
            justifySelf: statsStyle?.justifySelf || '',
            justifyContent: statsStyle?.justifyContent || '',
          }
        : null,
      tiles,
    }
  })

  assert(
    metrics.stats,
    `${scenarioName} 缺少业务页头部统计区: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.header,
    `${scenarioName} 缺少业务页头部卡片: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.tiles.length,
    expectedLabels.length,
    `${scenarioName} formal 业务页统计项数量不符合当前口径: ${JSON.stringify(metrics)}`
  )
  assert.deepEqual(
    metrics.tiles.map((tile) =>
      tile.text.replace(/摘要/gu, '').replace(/\d+$/u, '')
    ),
    expectedLabels,
    `${scenarioName} 业务页头部统计项不符合当前口径: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.tiles.every(
      (tile) =>
        tile.tagName === 'DIV' &&
        tile.role === null &&
        tile.cursor === 'default' &&
        tile.badge === '摘要' &&
        tile.hasButton === false
    ),
    `${scenarioName} 业务页头部统计应保持只读摘要，不应伪装成按钮: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.tiles.every(
      (tile) =>
        Number.isFinite(tile.badgeLabelGap) &&
        tile.badgeLabelGap >= 2 &&
        tile.badgeLabelGap <= 12
    ),
    `${scenarioName} 业务页头部摘要徽标应紧跟指标标签，不应被推到卡片最右: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.grid?.gridTemplateColumns?.split(' ').filter((item) => item.trim())
      .length >= 2 && metrics.grid?.alignItems === 'center',
    `${scenarioName} 桌面业务页头部应使用左标题右摘要的两列布局: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.main &&
      metrics.stats.left >= metrics.main.right + 8 &&
      metrics.header.right - metrics.stats.right <= 24,
    `${scenarioName} 桌面业务页头部摘要组应位于标题右侧并贴近右边界: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.stats.justifySelf === 'end' &&
      metrics.stats.justifyContent === 'end',
    `${scenarioName} 桌面业务页头部摘要组应由共享布局右对齐: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.stats.flexWrap,
    'nowrap',
    `${scenarioName} 桌面业务页头部统计不应换行: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.stats.scrollWidth <= metrics.stats.clientWidth + 1,
    `${scenarioName} 业务页头部统计区内部不应横向溢出: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.tiles.every(
      (tile) => Math.abs(tile.top - metrics.tiles[0].top) <= 1
    ),
    `${scenarioName} 业务页头部统计卡不应掉到第二行: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.tiles.every(
      (tile) =>
        tile.width >= 116 &&
        tile.width <= 150 &&
        tile.height >= 48 &&
        tile.height <= 72
    ),
    `${scenarioName} 业务页头部统计卡尺寸异常: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.tiles.every(
      (tile) =>
        tile.labelWhiteSpace === 'normal' &&
        tile.labelTextOverflow !== 'ellipsis' &&
        tile.labelOverflow === 'visible'
    ),
    `${scenarioName} 业务页头部统计标签不应再用省略号裁切: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.tiles.every((tile) => !tile.text.includes('...')),
    `${scenarioName} 业务页头部统计标签不应出现省略号: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.bodyScrollWidth <= metrics.viewportWidth + 2 &&
      metrics.docScrollWidth <= metrics.viewportWidth + 2,
    `${scenarioName} 业务页头部统计修复后不应产生页面横向溢出: ${JSON.stringify(metrics)}`
  )
}

async function assertERPThemeMode(
  page,
  { scenarioName, expectedMode, expectedEffectiveTheme }
) {
  const metrics = await page.evaluate(() => ({
    mode: document.documentElement.dataset.erpThemeMode || '',
    effectiveTheme: document.documentElement.dataset.erpTheme || '',
    colorScheme: document.documentElement.style.colorScheme || '',
    storedMode: window.localStorage.getItem('plush_erp_theme_mode') || '',
  }))

  assert.equal(
    metrics.mode,
    expectedMode,
    `${scenarioName} 主题模式不符合预期: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.effectiveTheme,
    expectedEffectiveTheme,
    `${scenarioName} 生效主题不符合预期: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.colorScheme,
    expectedEffectiveTheme,
    `${scenarioName} color-scheme 未同步: ${JSON.stringify(metrics)}`
  )
  assert(
    expectedMode === 'system' || metrics.storedMode === expectedMode,
    `${scenarioName} 手动主题未持久化: ${JSON.stringify(metrics)}`
  )
}

async function assertDevPageUsesGlobalThemeOnly(
  page,
  {
    scenarioName,
    selector,
    expectedMode,
    expectedEffectiveTheme,
    expectDarkContrast = false,
  }
) {
  const toggleCount = await page.evaluate(
    (targetSelector) =>
      document.querySelectorAll(`${targetSelector} .erp-theme-toggle`).length,
    selector
  )
  assert.equal(toggleCount, 0, `${scenarioName} 开发页不应重复放置主题切换控件`)
  await assertERPThemeMode(page, {
    scenarioName,
    expectedMode,
    expectedEffectiveTheme,
  })
  if (expectDarkContrast) {
    await assertDarkThemeContrast(page, {
      scenarioName,
      selector,
    })
  }
  await assertThemeReadable(page, {
    scenarioName,
    selector,
  })
  await assertNoHorizontalOverflow(page, `${scenarioName}-theme`)
}

async function clickERPThemeOption(page, label) {
  const expectedModeByLabel = {
    跟系统: 'system',
    浅色: 'light',
    暗色: 'dark',
  }
  const expectedMode = expectedModeByLabel[label]
  const segmentedOption = page
    .locator('.erp-theme-toggle .ant-segmented-item')
    .filter({ hasText: label })
  if ((await segmentedOption.count()) > 0) {
    await segmentedOption.click()
  } else {
    const menuToggle = page.locator('.erp-theme-menu-toggle')
    assert.equal(
      await menuToggle.count(),
      1,
      `主题菜单按钮数量异常，无法切换到 ${label}`
    )
    await menuToggle.click()
    await assertNoERPThemeTooltip(page, '主题菜单打开后不应显示 tooltip')
    const menuItem = page
      .locator(
        '.ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu-item'
      )
      .filter({ hasText: label })
    await menuItem.waitFor({ state: 'visible', timeout: 10_000 })
    await menuItem.click()
    await page.keyboard.press('Escape')
    await page
      .locator('.ant-dropdown:not(.ant-dropdown-hidden)')
      .waitFor({ state: 'hidden', timeout: 10_000 })
      .catch(() => {})
  }
  if (expectedMode) {
    await page.waitForFunction(
      (mode) => document.documentElement.dataset.erpThemeMode === mode,
      expectedMode
    )
  }
}

async function assertNoERPThemeTooltip(page, message) {
  const tooltip = page
    .locator('.ant-tooltip:not(.ant-tooltip-hidden)')
    .filter({ hasText: /主题/ })
  assert.equal(await tooltip.count(), 0, message)
}

const {
  assertMobileTaskMainNavigation,
  assertMobileTaskBossDoneList,
  assertMobileTaskDarkDetailReadable,
  readMobileTaskVisibleListMetrics,
} = createMobileTaskAssertions({
  assert,
  assertDarkThemeContrast,
  assertReadableOnBackground,
  assertThemeReadable,
  expectText,
  gotoScenarioPath,
  isDarkNeutralBorderColor,
  isLightSurfaceColor,
  isTransparentColor,
  isWarningBorderColor,
})

async function assertThemeReadable(page, { scenarioName, selector }) {
  const metrics = await page.evaluate((targetSelector) => {
    const target = document.querySelector(targetSelector)
    if (!target) {
      return null
    }
    const style = window.getComputedStyle(target)
    const textNode =
      target.querySelector(
        'h1, h2, h3, .ant-typography, .ant-card-head-title, .erp-mobile-strong, .erp-mobile-page-title, button, input'
      ) || target
    const textStyle = window.getComputedStyle(textNode)
    return {
      selector: targetSelector,
      backgroundColor: style.backgroundColor,
      color: textStyle.color,
      rect: target.getBoundingClientRect().toJSON(),
    }
  }, selector)

  assert(metrics, `${scenarioName} 缺少主题可读性目标: ${selector}`)
  assert(
    !isTransparentColor(metrics.backgroundColor),
    `${scenarioName} 主题目标背景透明，无法验证可读性: ${JSON.stringify(metrics)}`
  )
  const background = parseRgb(metrics.backgroundColor)
  const color = parseRgb(metrics.color)
  assert(
    background && color,
    `${scenarioName} 无法解析主题颜色: ${JSON.stringify(metrics)}`
  )
  const ratio = getContrastRatio(color, background)
  assert(
    ratio >= 3,
    `${scenarioName} 主题文字对比度不足: ${JSON.stringify({
      ...metrics,
      contrastRatio: ratio,
    })}`
  )
}

async function assertLoginSegmentedReadable(page, { scenarioName }) {
  const metrics = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        '.erp-login-card .ant-segmented .ant-segmented-item-selected'
      )
    ).map((item) => {
      const label = item.querySelector('.ant-segmented-item-label') || item
      const itemStyle = window.getComputedStyle(item)
      const labelStyle = window.getComputedStyle(label)
      return {
        text: label.textContent?.replace(/\s+/g, ' ').trim() || '',
        backgroundColor: itemStyle.backgroundColor,
        color: labelStyle.color,
      }
    })
  )

  assert(
    metrics.length >= 2,
    `${scenarioName} 登录页缺少主题或入口 Segmented 选中项: ${JSON.stringify(metrics)}`
  )
  metrics.forEach((item) => {
    const background = parseRgb(item.backgroundColor)
    const color = parseRgb(item.color)
    assert(
      background && color,
      `${scenarioName} 无法解析登录页 Segmented 颜色: ${JSON.stringify(metrics)}`
    )
    const ratio = getContrastRatio(color, background)
    assert(
      ratio >= 4.5,
      `${scenarioName} 登录页 Segmented 选中项对比度不足: ${JSON.stringify({
        ...item,
        contrastRatio: ratio,
      })}`
    )
  })
}

async function assertDarkThemeContrast(
  page,
  { scenarioName, selector = 'body', minRatio = 3 }
) {
  const issues = await page.evaluate(
    ({ targetSelector, minContrastRatio }) => {
      const target = document.querySelector(targetSelector)
      if (!target) {
        return [{ reason: 'missing-target', selector: targetSelector }]
      }

      const parseColor = (value) => {
        const match = String(value || '').match(
          /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/
        )
        if (!match) return null
        const alpha = match[4] === undefined ? 1 : Number(match[4])
        if (alpha === 0) return null
        return [Number(match[1]), Number(match[2]), Number(match[3]), alpha]
      }
      const luminance = ([red, green, blue]) => {
        const values = [red, green, blue].map((value) => {
          const channel = value / 255
          return channel <= 0.03928
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4
        })
        return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
      }
      const contrast = (foreground, background) => {
        const lighter = Math.max(luminance(foreground), luminance(background))
        const darker = Math.min(luminance(foreground), luminance(background))
        return (lighter + 0.05) / (darker + 0.05)
      }
      const compositeColor = (top, bottom) => {
        const topAlpha = top[3] ?? 1
        const bottomAlpha = bottom[3] ?? 1
        const alpha = topAlpha + bottomAlpha * (1 - topAlpha)
        if (alpha === 0) return [0, 0, 0, 0]
        return [
          (top[0] * topAlpha + bottom[0] * bottomAlpha * (1 - topAlpha)) /
            alpha,
          (top[1] * topAlpha + bottom[1] * bottomAlpha * (1 - topAlpha)) /
            alpha,
          (top[2] * topAlpha + bottom[2] * bottomAlpha * (1 - topAlpha)) /
            alpha,
          alpha,
        ]
      }
      const backgroundFor = (element) => {
        const layers = []
        let current = element
        while (current && current instanceof Element) {
          const parsed = parseColor(
            window.getComputedStyle(current).backgroundColor
          )
          if (parsed) layers.push(parsed)
          current = current.parentElement
        }
        const bodyColor = parseColor(
          window.getComputedStyle(document.body).backgroundColor
        ) || [255, 255, 255, 1]
        return layers
          .reverse()
          .reduce(
            (background, layer) => compositeColor(layer, background),
            bodyColor
          )
      }
      const isVisible = (element) => {
        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity || 1) > 0.05 &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom >= 0 &&
          rect.right >= 0 &&
          rect.top <= window.innerHeight &&
          rect.left <= window.innerWidth
        )
      }
      const describe = (element) => {
        const classes =
          element.className && typeof element.className === 'string'
            ? `.${element.className.trim().split(/\s+/).slice(0, 4).join('.')}`
            : ''
        return `${element.tagName.toLowerCase()}${classes}`
      }
      const ignoredSelector = [
        '.anticon',
        '.ant-empty-img-default',
        '.ant-empty-image',
        '.ant-select-arrow',
        '.ant-table-column-sorter',
        '.erp-module-column-header-trigger',
      ].join(',')
      const visibleTextSelector =
        'a, button, label, th, td, h1, h2, h3, h4, p, span, strong, small, input, textarea, .ant-typography, .ant-tag, .ant-btn, .ant-select-selection-item, .ant-select-selection-placeholder, .ant-empty-description'
      const semanticCandidates = Array.from(
        target.querySelectorAll(visibleTextSelector)
      )
      const directTextCandidates = Array.from(
        target.querySelectorAll('*')
      ).filter((element) =>
        Array.from(element.childNodes).some(
          (node) =>
            node.nodeType === Node.TEXT_NODE &&
            String(node.textContent || '')
              .replace(/\s+/g, ' ')
              .trim()
        )
      )
      const candidates = Array.from(
        new Set([...semanticCandidates, ...directTextCandidates])
      )
      const failures = []
      for (const element of candidates) {
        if (!(element instanceof HTMLElement)) continue
        if (
          element.matches(ignoredSelector) ||
          element.closest(ignoredSelector)
        ) {
          continue
        }
        if (!isVisible(element)) continue
        const text =
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement
            ? element.placeholder || element.value || ''
            : element.textContent || ''
        const normalizedText = text.replace(/\s+/g, ' ').trim()
        if (!normalizedText) continue
        const style = window.getComputedStyle(element)
        const color = parseColor(style.color)
        const background = backgroundFor(element)
        if (!color || !background) continue
        const ratio = contrast(color, background)
        if (ratio < minContrastRatio) {
          failures.push({
            element: describe(element),
            text: normalizedText.slice(0, 80),
            color: style.color,
            backgroundColor: window.getComputedStyle(element).backgroundColor,
            effectiveBackground: `rgb(${Math.round(background[0])}, ${Math.round(
              background[1]
            )}, ${Math.round(background[2])})`,
            ratio: Number(ratio.toFixed(2)),
          })
        }
      }
      return failures.slice(0, 12)
    },
    { targetSelector: selector, minContrastRatio: minRatio }
  )

  assert.deepEqual(
    issues,
    [],
    `${scenarioName} 暗色主题存在低对比可见文本: ${JSON.stringify(issues)}`
  )
}

async function assertDarkThemeNeutralInteractions(
  page,
  { scenarioName, checks }
) {
  const interactionChecks = checks || [
    {
      label: '搜索输入 hover',
      selector: '.erp-business-filter-control--search',
      action: 'hover',
    },
    {
      label: '搜索输入 focus',
      selector: '.erp-business-filter-control--search',
      action: 'click',
    },
    {
      label: '业务状态筛选 hover',
      selector: '.erp-business-filter-control--status .ant-select-selector',
      action: 'hover',
    },
    {
      label: '日期筛选 hover',
      selector: '.erp-business-date-range-filter',
      action: 'hover',
    },
    {
      label: '普通工具按钮 hover',
      selector: '.erp-business-toolbar-button:not(.ant-btn-primary)',
      action: 'hover',
    },
    {
      label: '表头工具按钮 hover',
      selector: '.erp-module-column-header-trigger.ant-btn',
      action: 'hover',
    },
    {
      label: '表头单元格 hover',
      selector: '.erp-business-data-table-card .ant-table-thead > tr > th',
      action: 'hover',
      index: 2,
    },
  ]

  const metrics = []
  for (const check of interactionChecks) {
    const locator =
      check.index === undefined
        ? page.locator(check.selector).first()
        : page.locator(check.selector).nth(check.index)
    await locator.waitFor({ state: 'visible', timeout: 10_000 })
    if (check.action === 'click') {
      await locator.click()
    } else {
      await locator.hover()
    }
    await page.waitForTimeout(160)
    metrics.push(
      await locator.evaluate((node, label) => {
        const style = window.getComputedStyle(node)
        return {
          label,
          selector:
            node.className && typeof node.className === 'string'
              ? `${node.tagName.toLowerCase()}.${node.className
                  .trim()
                  .split(/\s+/)
                  .slice(0, 4)
                  .join('.')}`
              : node.tagName.toLowerCase(),
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
          borderTopColor: style.borderTopColor,
          boxShadow: style.boxShadow,
          outlineColor: style.outlineColor,
        }
      }, check.label)
    )
    if (check.action === 'click') {
      await page.keyboard.press('Escape').catch(() => {})
      await page.evaluate(() => document.activeElement?.blur?.())
    }
  }

  const greenIssues = metrics.filter((metric) =>
    hasGreenDominantInteractivePaint(metric)
  )
  assert.deepEqual(
    greenIssues,
    [],
    `${scenarioName} 暗色主题交互态仍残留绿色 hover/focus 面: ${JSON.stringify(
      greenIssues
    )}`
  )
}

async function assertDarkLoadingState(page, { scenarioName }) {
  const metrics = await page.evaluate(() => {
    const readNode = (selector) => {
      const node = document.querySelector(selector)
      if (!node) return null
      const style = window.getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      return {
        selector,
        text: node.textContent?.replace(/\s+/g, ' ').trim() || '',
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        color: style.color,
        width: rect.width,
        height: rect.height,
      }
    }
    return {
      page: readNode('.loading-page'),
      panel: readNode('.loading-page__panel'),
      title: readNode('.loading-page__title'),
      description: readNode('.loading-page__description'),
      dot: readNode('.loading-page .ant-spin-dot-item'),
    }
  })

  assert(
    metrics.page &&
      metrics.panel &&
      metrics.title &&
      metrics.description &&
      metrics.dot,
    `${scenarioName} 缺少可检查的暗色加载态: ${JSON.stringify(metrics)}`
  )
  assert(
    isDarkControlBackground(metrics.panel.backgroundColor),
    `${scenarioName} 加载态面板仍是浅色背景: ${JSON.stringify(metrics)}`
  )
  assert(
    isDarkNeutralBorderColor(metrics.panel.borderColor),
    `${scenarioName} 加载态面板边框未接入暗色主题: ${JSON.stringify(metrics)}`
  )
  assert(
    String(metrics.panel.boxShadow || '') !== 'none',
    `${scenarioName} 加载态面板缺少浮层阴影: ${JSON.stringify(metrics)}`
  )
  assert(
    isBluePrimaryColor(metrics.dot.backgroundColor),
    `${scenarioName} 加载态 Spin 未使用暗色主题主交互色: ${JSON.stringify(metrics)}`
  )
  assertReadableOnDark(
    metrics.title.color,
    metrics.panel.backgroundColor,
    `${scenarioName} 加载态标题对比度不足`
  )
  assertReadableOnDark(
    metrics.description.color,
    metrics.panel.backgroundColor,
    `${scenarioName} 加载态说明对比度不足`
  )
}

async function assertDarkAntdStateSurfaces(page, { scenarioName }) {
  const metrics = await page.evaluate(() => {
    const readNode = (selector) => {
      const node = document.querySelector(selector)
      if (!node) return null
      const style = window.getComputedStyle(node)
      return {
        selector,
        text: node.textContent?.replace(/\s+/g, ' ').trim().slice(0, 100) || '',
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        color: style.color,
      }
    }
    return {
      empty: readNode('.ant-empty'),
      emptyDescription: readNode('.ant-empty-description'),
      tag: readNode('.ant-tag'),
      paginationItem: readNode('.ant-pagination .ant-pagination-item'),
      tablePlaceholder: readNode('.ant-table-placeholder > td'),
    }
  })

  const visibleStates = Object.values(metrics).filter(Boolean)
  assert(
    visibleStates.length >= 1,
    `${scenarioName} 缺少可检查的 AntD 状态组件: ${JSON.stringify(metrics)}`
  )

  visibleStates.forEach((item) => {
    const background = isTransparentColor(item.backgroundColor)
      ? 'rgb(17, 24, 39)'
      : item.backgroundColor
    if (!isTransparentColor(item.backgroundColor)) {
      assert(
        !isLightSurfaceColor(item.backgroundColor),
        `${scenarioName} ${item.selector} 仍是浅色背景: ${JSON.stringify(metrics)}`
      )
    }
    assertReadableOnDark(
      item.color,
      background,
      `${scenarioName} ${item.selector} 文字对比度不足`
    )
  })
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
  await assertButtonDisabled(page, '删除当前行')
}

async function assertButtonDisabled(page, name) {
  const button = page.getByRole('button', { name })
  assert(await button.isDisabled(), `按钮应为禁用状态: ${name}`)
}

async function readLineCounter(page, label) {
  const counter = page.locator('.erp-print-shell__counter')
  const text = (await counter.textContent()) || ''
  const match = text.match(new RegExp(`${label}:\\s*(\\d+)\\/300`))

  assert(match, `未找到 ${label} 计数: ${text}`)
  return Number(match[1])
}

function tailLogs(text) {
  return text.trim().split('\n').slice(-20).join('\n')
}

await main()
