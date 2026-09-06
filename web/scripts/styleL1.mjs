import { createBusinessActionAssertions } from './style-l1/businessActionAssertions.mjs'
import { createBusinessListAssertions } from './style-l1/businessListAssertions.mjs'
import {
  seedBusinessCollaborationOverflowTasks,
  assertBusinessCollaborationPanelCollapsedByDefault,
} from './style-l1/collaborationAssertions.mjs'
import { createDashboardAssertions } from './style-l1/dashboardAssertions.mjs'
import {
  assertPermissionSectionVisualSeparation,
  assertPermissionChecklistItemLayout,
} from './style-l1/permissionAssertions.mjs'
import {
  assertAntdModalCentered,
  assertAppAlertDialogLayout,
  assertAdminRoleModalLayout,
  assertVisibleModalInputFocusStyle,
} from './style-l1/modalAssertions.mjs'
import {
  assertAdminLoginLayout,
  assertAdminLoginSmsHintLayout,
  assertAdminLoginSmsCodeErrorHintSpacing,
} from './style-l1/loginAssertions.mjs'
import {
  assertERPThemeMode,
  assertDevPageUsesGlobalThemeOnly,
  clickERPThemeOption,
  assertThemeReadable,
  assertLoginSegmentedReadable,
  assertDarkThemeContrast,
  assertDarkThemeNeutralInteractions,
  assertDarkLoadingState,
  assertDarkAntdStateSurfaces,
} from './style-l1/themeAssertions.mjs'
import {
  waitForPath,
  expectHeading,
  expectButton,
  expectNoButton,
  expectText,
  assertTextAbsent,
  assertNoHorizontalOverflow,
} from './style-l1/pageAssertions.mjs'
import {
  assertBusinessMainTableHasNoOperationColumn,
  assertBusinessMainTableInitialSelectionEmpty,
  assertBusinessMainTableSortableColumns,
  assertBusinessHeaderHasNoSectionTitle,
  assertBusinessHeaderStatsSingleLine,
} from './style-l1/businessTableAssertions.mjs'
import {
  assertVisibleInputControlRadius,
  assertVisibleSearchPlaceholdersFit,
  assertVisibleRoundedInputWrapperClipping,
  assertVisibleInputFocusRingNotClipped,
  assertVisibleInputTextVerticalRhythm,
  assertVisibleBusinessFormControlHeight,
} from './style-l1/inputControlAssertions.mjs'
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
  installAdminDisabledRpcMocks,
  installAdminAuthExpiredRpcMocks,
  installAdminRpcMocks,
} from './style-l1/adminRpcMocks.mjs'
import {
  assertNoBlueFocusStyle,
  isAcceptedFocusBorder,
  isLightSurfaceColor,
} from './style-l1/colorAssertions.mjs'
import { createPrintAssertions } from './style-l1/printAssertions.mjs'
import { createBusinessFormModalAssertions } from './style-l1/businessFormModalAssertions.mjs'
import { createPurchaseReceiptAssertions } from './style-l1/purchaseReceiptAssertions.mjs'

import { createStyleL1Scenarios } from './style-l1/scenarios.mjs'
import { installDeliverySummaryRoute } from './style-l1/devVersionCenterScenarios.mjs'
import { loadDevPorts } from '../../scripts/dev-ports.mjs'

const webDir = path.resolve(import.meta.dirname, '..')
const repoRoot = path.resolve(webDir, '..')
const devPorts = loadDevPorts(repoRoot)
const outputDir = resolveStyleL1OutputDirectory(
  repoRoot,
  webDir,
  process.env.STYLE_L1_OUTPUT_DIR
)
const devServerPort = Number(process.env.STYLE_L1_PORT || devPorts.style)
const externalBaseURL = String(process.env.STYLE_L1_BASE_URL || '').trim()
const baseURL = externalBaseURL || `http://127.0.0.1:${devServerPort}`
const headless = process.env.HEADED !== '1'
const scenarioFilter = new Set(
  String(process.env.STYLE_L1_SCENARIOS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
)
const scenarioStartAt = String(process.env.STYLE_L1_START_AT || '').trim()
const scenarioMaxAttempts = resolveStyleL1ScenarioMaxAttempts(
  process.env.STYLE_L1_SCENARIO_MAX_ATTEMPTS
)

export function resolveStyleL1ScenarioMaxAttempts(value) {
  const normalized = String(value || '').trim()
  if (!normalized) return 2
  assert.match(
    normalized,
    /^[12]$/u,
    '[style:l1] STYLE_L1_SCENARIO_MAX_ATTEMPTS 只能是 1 或 2'
  )
  return Number(normalized)
}

export function resolveStyleL1OutputDirectory(
  projectRoot,
  projectWebDir,
  value
) {
  const normalized = String(value || '').trim()
  if (!normalized) {
    return path.resolve(projectWebDir, 'output', 'playwright', 'style-l1')
  }
  const resolved = path.resolve(normalized)
  const managedOutputRoot = path.resolve(projectRoot, 'output')
  const relative = path.relative(managedOutputRoot, resolved)
  assert(
    relative &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative),
    '[style:l1] STYLE_L1_OUTPUT_DIR 必须位于项目 managed output 根内'
  )
  return resolved
}

let devServerProcess = null
let devServerProcessGroupID = null
let devServerLogs = ''
let activeBrowser = null
let runtimeCleanupPromise = null

async function cleanupStyleL1Runtime() {
  runtimeCleanupPromise ||= (async () => {
    const browser = activeBrowser
    activeBrowser = null
    try {
      await browser?.close()
    } finally {
      await stopDevServer()
    }
  })()
  return runtimeCleanupPromise
}

export function installStyleL1TerminationHandlers({
  processRef = process,
  cleanup = cleanupStyleL1Runtime,
  exit = (code) => processRef.exit(code),
} = {}) {
  let interruptedSignal = ''
  let shutdownPromise = null
  const interrupt = (signal) => {
    if (interruptedSignal) return
    interruptedSignal = signal
    shutdownPromise ||= Promise.resolve()
      .then(() => cleanup())
      .then(
        () => exit(interruptedSignal === 'SIGINT' ? 130 : 143),
        () => exit(1)
      )
  }
  const onSigterm = () => interrupt('SIGTERM')
  const onSigint = () => interrupt('SIGINT')
  processRef.on('SIGTERM', onSigterm)
  processRef.on('SIGINT', onSigint)
  return Object.freeze({
    dispose() {
      processRef.removeListener('SIGTERM', onSigterm)
      processRef.removeListener('SIGINT', onSigint)
    },
    get shutdownPromise() {
      return shutdownPromise
    },
    get signal() {
      return interruptedSignal
    },
  })
}

const { assertBusinessFormModalKeyboardRecovery } =
  createBusinessFormModalAssertions({
    assert,
  })

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
  assertMaterialContractLineCellsWrapLongValues,
  assertMaterialDetailLineCellsWrapLongValues,
  assertPrintTemplateLongBusinessValuesStayInsidePaper,
  assertContractTotalCellsWrapLargeNumbers,
  assertMaterialContractPrintMediaIgnoresResponsiveBreakpoints,
} = createPrintAssertions({
  baseURL,
  outputDir,
  expectText,
  isIgnorableDevServerError,
})

const {
  gotoScenarioPath,
  assertNoDashboardCenterLocalRefreshButton,
  assertDashboardMetricInteractionSemantics,
  assertDarkDashboardLinkButtonsUnboxed,
  assertMobileTaskRefreshFeedback,
  assertDashboardWorkbenchLayout,
  assertDashboardWorkbenchEntryNavigation,
  assertDashboardTaskBoardLayout,
  assertTaskActionDrawerLayout,
  assertMobileTaskMainNavigation,
  assertMobileTaskInitialSkeleton,
  assertMobileTaskBossDoneList,
  assertMobileTaskDarkDetailReadable,
} = createDashboardAssertions({ outputDir, baseURL })

const {
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
} = createBusinessListAssertions({ outputDir })

const {
  verifyBusinessActionFormModal,
  assertProcessSuggestionOptions,
  assertOutsourcingProcessSelectOptions,
  assertOperationalFactModalViewport,
  verifyBusinessRowDoubleClickModal,
  closeBusinessFormModal,
} = createBusinessActionAssertions({ outputDir })

function getScenarios() {
  return createStyleL1Scenarios({
    assert,
    assertAntdModalCentered,
    assertAdminLoginLayout,
    assertAdminLoginSmsCodeErrorHintSpacing,
    assertAdminLoginSmsHintLayout,
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
    assertMaterialContractLineCellsWrapLongValues,
    assertMaterialDetailLineCellsWrapLongValues,
    assertPrintTemplateLongBusinessValuesStayInsidePaper,
    assertMaterialContractMetaAlignment,
    assertMaterialContractPrintMediaIgnoresResponsiveBreakpoints,
    assertMobileTaskBossDoneList,
    assertMobileTaskDarkDetailReadable,
    assertMobileTaskInitialSkeleton,
    assertMobileTaskMainNavigation,
    assertMobileTaskRefreshFeedback,
    assertNoDashboardCenterLocalRefreshButton,
    assertNoDuplicatedAdminPageTitle,
    assertNoHorizontalOverflow,
    assertOperationalFactModalViewport,
    assertOrderLifecycleActionsConsolidated,
    assertOutsourcingProcessSelectOptions,
    assertPaginationSizeChangerFocusStyle,
    assertPermissionChecklistItemLayout,
    assertPermissionSectionVisualSeparation,
    assertPrintCenterPreviewPopup,
    assertPrintPreviewPopup,
    assertPrintWorkspacePaginationStyle,
    assertProcessSuggestionOptions,
    assertProcessingContractPaperRowCount,
    assertProcessingContractSignatureLayout,
    assertBusinessFormModalKeyboardRecovery,
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
    gotoScenarioPath,
    isLightSurfaceColor,
    outputDir,
    path,
    seedBusinessCollaborationOverflowTasks,
    selectPurchaseReceiptRow,
    verifyBusinessActionFormModal,
    verifyBusinessModuleColumnOrderDialog,
    verifyBusinessRowDoubleClickModal,
    verifySourceImportPicker,
    waitForPath,
    webDir,
  })
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true })
  const scenarios = getScenarios()
  const scenarioNames = new Set(scenarios.map((scenario) => scenario.name))
  const missingScenarioNames = [...scenarioFilter].filter(
    (name) => !scenarioNames.has(name)
  )
  assert.deepEqual(
    missingScenarioNames,
    [],
    `[style:l1] STYLE_L1_SCENARIOS 包含不存在的场景: ${missingScenarioNames.join(
      ', '
    )}\n可用场景: ${scenarios.map((scenario) => scenario.name).join(', ')}`
  )
  assert(
    !(scenarioFilter.size > 0 && scenarioStartAt),
    '[style:l1] STYLE_L1_SCENARIOS 与 STYLE_L1_START_AT 不能同时使用'
  )
  const scenarioStartIndex = scenarioStartAt
    ? scenarios.findIndex((scenario) => scenario.name === scenarioStartAt)
    : -1
  assert(
    !scenarioStartAt || scenarioStartIndex >= 0,
    `[style:l1] STYLE_L1_START_AT 场景不存在: ${scenarioStartAt}`
  )
  const selectedScenarios =
    scenarioFilter.size > 0
      ? scenarios.filter((scenario) => scenarioFilter.has(scenario.name))
      : scenarioStartAt
        ? scenarios.slice(scenarioStartIndex)
        : scenarios
  assert(
    selectedScenarios.length > 0,
    `[style:l1] 未匹配到场景: ${
      scenarioStartAt || [...scenarioFilter].join(', ')
    }`
  )
  if (scenarioStartAt) {
    console.log(
      `[style:l1] start_at=${scenarioStartAt} selected=${selectedScenarios.length}/${scenarios.length}`
    )
  }

  try {
    if (!externalBaseURL) {
      await assertPortAvailable(devServerPort)
      console.log(
        `[style:l1] target=self-host worktree=${webDir} port=${devServerPort}`
      )
      devServerProcess = startDevServer()
      devServerProcessGroupID = await verifyDevServerProcessGroup()
      await waitForServer(baseURL)
      await assertDevServerPortOwnership(devServerProcessGroupID)
    } else {
      console.log(`[style:l1] target=external base_url=${externalBaseURL}`)
    }

    activeBrowser = await chromium.launch({
      headless,
      args: ['--no-proxy-server', '--proxy-bypass-list=<-loopback>'],
    })
    for (const scenario of selectedScenarios) {
      await runScenario(activeBrowser, scenario)
    }

    console.log(`[style:l1] 通过，共验证 ${selectedScenarios.length} 个场景`)
  } finally {
    await cleanupStyleL1Runtime()
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
      '0.0.0.0',
      '--port',
      String(devServerPort),
      '--strictPort',
    ],
    {
      cwd: webDir,
      env: {
        ...process.env,
        BROWSER: 'none',
        ERP_VITE_PORT: String(devServerPort),
        ERP_VITE_HMR_CLIENT_PORT: String(devServerPort),
        VITE_RELEASE_VERSION: 'yoyoosun-20260810-20c96d38-amd64',
        VITE_GIT_SHA: '20c96d3819429361a35d2551b63b211f055de37e',
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

  if (devServerProcessGroupID) {
    await terminateOwnedProcessGroup(devServerProcessGroupID)
  } else if (devServerProcess.exitCode === null) {
    // Group ownership is not yet verified only when startup failed before the
    // detached child could be inspected. In that narrow path, kill the direct
    // child only; never infer ownership from a port or an unverified PID.
    devServerProcess.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => devServerProcess.once('exit', resolve)),
      delay(3000),
    ])
    if (devServerProcess.exitCode === null) {
      devServerProcess.kill('SIGKILL')
      await delay(500)
    }
  }

  devServerProcess.stdout?.destroy()
  devServerProcess.stderr?.destroy()
  devServerProcess.unref()
  devServerProcess = null
  devServerProcessGroupID = null
}

function signalOwnedProcessGroup(
  processGroupID,
  signal,
  { permissionDeniedIsGone = false } = {}
) {
  try {
    process.kill(-processGroupID, signal)
    return true
  } catch (error) {
    if (error?.code === 'ESRCH') return false
    // After a successful signal, macOS can report EPERM while the terminated
    // group is being reaped. At that point the verified group is no longer
    // ours to signal; treating it as gone also prevents hitting a reused PGID.
    if (permissionDeniedIsGone && error?.code === 'EPERM') return false
    throw error
  }
}

export function isOwnedProcessGroupAlive(processGroupID) {
  assert(
    Number.isInteger(processGroupID) && processGroupID > 0,
    `[style:l1] invalid owned process group: ${processGroupID}`
  )
  return signalOwnedProcessGroup(processGroupID, 0)
}

async function waitForOwnedProcessGroupExit(
  processGroupID,
  { timeoutMs, pollIntervalMs }
) {
  const deadline = Date.now() + timeoutMs
  while (
    signalOwnedProcessGroup(processGroupID, 0, {
      permissionDeniedIsGone: true,
    })
  ) {
    if (Date.now() >= deadline) return false
    await delay(Math.min(pollIntervalMs, Math.max(1, deadline - Date.now())))
  }
  return true
}

export async function terminateOwnedProcessGroup(
  processGroupID,
  { termGraceMs = 3000, killGraceMs = 1000, pollIntervalMs = 25 } = {}
) {
  if (!isOwnedProcessGroupAlive(processGroupID)) {
    return { signal: null }
  }

  signalOwnedProcessGroup(processGroupID, 'SIGTERM')
  if (
    await waitForOwnedProcessGroupExit(processGroupID, {
      timeoutMs: termGraceMs,
      pollIntervalMs,
    })
  ) {
    return { signal: 'SIGTERM' }
  }

  signalOwnedProcessGroup(processGroupID, 'SIGKILL')
  if (
    await waitForOwnedProcessGroupExit(processGroupID, {
      timeoutMs: killGraceMs,
      pollIntervalMs,
    })
  ) {
    return { signal: 'SIGKILL' }
  }

  throw new Error(
    `[style:l1] owned process group ${processGroupID} survived SIGKILL`
  )
}

function assertPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', (error) => {
      reject(
        new Error(
          `[style:l1] self-host port ${port} is unavailable before Vite start: ${error.message}`
        )
      )
    })
    server.listen(port, '127.0.0.1', () => {
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  })
}

function listDevServerPortPIDs() {
  return new Promise((resolve, reject) => {
    const child = spawn('lsof', [
      `-tiTCP:${String(devServerPort)}`,
      '-sTCP:LISTEN',
    ])
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.once('error', reject)
    child.once('close', (code) => {
      if (code !== 0 && code !== 1) {
        reject(new Error(`lsof exited with code ${code}`))
        return
      }
      resolve(
        output
          .split('\n')
          .map((item) => Number(item.trim()))
          .filter((pid) => Number.isInteger(pid) && pid > 0)
      )
    })
  })
}

function processGroupID(pid) {
  return new Promise((resolve, reject) => {
    const child = spawn('ps', ['-o', 'pgid=', '-p', String(pid)])
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.once('error', reject)
    child.once('close', (code) => {
      const value = Number(output.trim())
      if (code !== 0 || !Number.isInteger(value) || value <= 0) {
        reject(new Error(`cannot resolve process group for pid ${pid}`))
        return
      }
      resolve(value)
    })
  })
}

async function verifyDevServerProcessGroup() {
  const expectedGroup = devServerProcess?.pid
  assert(
    Number.isInteger(expectedGroup) && expectedGroup > 0,
    '[style:l1] self-host child PID is unavailable'
  )
  const childGroup = await processGroupID(expectedGroup)
  assert.equal(
    childGroup,
    expectedGroup,
    `[style:l1] self-host child is not the leader of its detached process group: pid=${expectedGroup} pgid=${childGroup}`
  )
  return expectedGroup
}

async function assertDevServerPortOwnership(expectedGroup) {
  const listenerPIDs = await listDevServerPortPIDs()
  assert(
    listenerPIDs.length > 0,
    `[style:l1] no listener found for self-host port ${devServerPort}`
  )
  const listenerGroups = await Promise.all(
    listenerPIDs.map((pid) => processGroupID(pid))
  )
  assert(
    listenerGroups.every((group) => group === expectedGroup),
    `[style:l1] self-host port ownership mismatch: expected pgid=${expectedGroup}, listeners=${listenerPIDs
      .map((pid, index) => `${pid}:${listenerGroups[index]}`)
      .join(',')}`
  )
  console.log(
    `[style:l1] self-host ownership verified pid=${expectedGroup} port=${devServerPort}`
  )
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
  const startedAt = Date.now()

  for (let attempt = 1; attempt <= scenarioMaxAttempts; attempt += 1) {
    try {
      await runScenarioOnce(browser, scenario)
      console.log(
        `[style:l1:scenario] id=${scenario.name} status=passed durationMs=${Math.max(
          0,
          Date.now() - startedAt
        )} attempts=${attempt}`
      )
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
      const retryMessage = `[style:l1] retry ${scenario.name} ${attempt + 1}/${scenarioMaxAttempts}: ${reason}`
      const retryEvidence = `${retryMessage}\n${error?.stack || error}`
      console.warn(retryEvidence)
      devServerLogs += `\n${retryEvidence}\n`
      await delay(500 * attempt)
    }
  }

  throw new Error(
    `[style:l1] 场景失败: ${scenario.name}\n${lastError?.stack || lastError?.message || lastError}\n最近 vite 输出：\n${tailLogs(devServerLogs)}`
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
    await installAdminRpcMocks(page, {
      baseURL,
      adminProfileOverride: scenario.adminProfile,
      effectiveSessionOverride: scenario.effectiveSession,
      workflowTaskFixtures: scenario.workflowTaskFixtures,
      workflowProcessContextFixtures: scenario.workflowProcessContextFixtures,
      approvalSettingsMode: scenario.approvalSettingsMode,
      workflowSourceTaskProducerFixtures:
        scenario.workflowSourceTaskProducerFixtures,
    })
  }

  if (
    scenario.auth === 'admin' ||
    scenario.auth === 'admin-expired' ||
    scenario.auth === 'admin-disabled'
  ) {
    const token = createMockAdminToken()
    if (scenario.auth === 'admin-expired') {
      await installAdminAuthExpiredRpcMocks(page)
    } else if (scenario.auth === 'admin-disabled') {
      await installAdminRpcMocks(page, {
        baseURL,
        adminProfileOverride: scenario.adminProfile,
        effectiveSessionOverride: scenario.effectiveSession,
        workflowTaskFixtures: scenario.workflowTaskFixtures,
        workflowProcessContextFixtures: scenario.workflowProcessContextFixtures,
        approvalSettingsMode: scenario.approvalSettingsMode,
        workflowSourceTaskProducerFixtures:
          scenario.workflowSourceTaskProducerFixtures,
      })
      await installAdminDisabledRpcMocks(page)
    } else {
      await installAdminRpcMocks(page, {
        baseURL,
        adminProfileOverride: scenario.adminProfile,
        effectiveSessionOverride: scenario.effectiveSession,
        workflowTaskFixtures: scenario.workflowTaskFixtures,
        workflowProcessContextFixtures: scenario.workflowProcessContextFixtures,
        approvalSettingsMode: scenario.approvalSettingsMode,
        workflowSourceTaskProducerFixtures:
          scenario.workflowSourceTaskProducerFixtures,
      })
    }
    await page.addInitScript(
      ({ mockToken, profileOverride, entryTarget }) => {
        const fallbackProfile = {
          is_super_admin: true,
          roles: [
            { role_key: 'boss', name: '老板' },
            { role_key: 'sales', name: '业务' },
            { role_key: 'purchase', name: '采购' },
            { role_key: 'production', name: '生产' },
            { role_key: 'warehouse', name: '仓库' },
            { role_key: 'finance', name: '财务' },
            { role_key: 'pmc', name: 'PMC' },
            { role_key: 'quality', name: '品质' },
          ],
          permissions: [
            'workflow.task.read',
            'workflow.task.update',
            'workflow.task.complete',
            'workflow.task.approve',
            'workflow.task.reject',
          ],
          menus: [],
          erp_preferences: { column_orders: {} },
        }
        const profile =
          profileOverride && typeof profileOverride === 'object'
            ? { ...fallbackProfile, ...profileOverride }
            : fallbackProfile
        try {
          localStorage.setItem('admin_access_token', mockToken)
          localStorage.setItem(
            'admin_is_super_admin',
            profile.is_super_admin === true ? 'true' : 'false'
          )
          localStorage.setItem(
            'admin_roles',
            JSON.stringify(Array.isArray(profile.roles) ? profile.roles : [])
          )
          localStorage.setItem(
            'admin_permissions',
            JSON.stringify(
              Array.isArray(profile.permissions) ? profile.permissions : []
            )
          )
          localStorage.setItem(
            'admin_menus',
            JSON.stringify(Array.isArray(profile.menus) ? profile.menus : [])
          )
          if (!localStorage.getItem('erp:last_entry_target')) {
            localStorage.setItem('erp:last_entry_target', entryTarget)
          }
          localStorage.setItem(
            'admin_erp_preferences',
            JSON.stringify(profile.erp_preferences || { column_orders: {} })
          )
        } catch (error) {
          if (error?.name !== 'SecurityError') throw error
        }
      },
      {
        mockToken: token,
        profileOverride: scenario.adminProfile || null,
        entryTarget: String(scenario.path || '').startsWith('/m/')
          ? 'mobileTasks'
          : 'desktop',
      }
    )
  }

  if (scenario.themeMode) {
    await page.addInitScript((themeMode) => {
      try {
        localStorage.setItem('plush_erp_theme_mode', themeMode)
      } catch (error) {
        if (error?.name !== 'SecurityError') throw error
      }
    }, scenario.themeMode)
  }

  const runtimeCustomerKey =
    typeof scenario.customerKey === 'string' && scenario.customerKey.trim()
      ? scenario.customerKey.trim()
      : typeof scenario.effectiveSession?.customer?.key === 'string'
        ? scenario.effectiveSession.customer.key.trim()
        : ''
  const runtimeCustomerConfig =
    scenario.customerConfig && typeof scenario.customerConfig === 'object'
      ? scenario.customerConfig
      : null
  if (runtimeCustomerKey || runtimeCustomerConfig) {
    await page.addInitScript(
      ({ customerKey, customerConfig }) => {
        window.__PLUSH_ERP_CUSTOMER_CONFIG__ = {
          ...(window.__PLUSH_ERP_CUSTOMER_CONFIG__ || {}),
          ...(customerConfig || {}),
          ...(customerKey ? { customerKey } : {}),
        }
      },
      {
        customerKey: runtimeCustomerKey,
        customerConfig: runtimeCustomerConfig,
      }
    )
  }

  page.on('console', (message) => {
    if (message.type() === 'error') {
      const text = message.text()
      if (!isIgnorableDevServerError(text)) {
        const location = message.location()
        let pagePath = ''
        try {
          pagePath = new URL(page.url()).pathname
        } catch {
          pagePath = page.url()
        }
        const source = [
          location.url,
          location.lineNumber,
          location.columnNumber,
        ]
          .filter((part) => part !== undefined && part !== '')
          .join(':')
        errors.push(
          `console error${pagePath ? ` [path=${pagePath}]` : ''}: ${text}${
            source ? ` @ ${source}` : ''
          }`
        )
      }
    }
  })
  page.on('pageerror', (error) => {
    errors.push(`page error: ${error.message}`)
  })

  try {
    if (String(scenario.path || '').startsWith('/__dev')) {
      // Style L1 verifies deterministic browser states. Live GitHub and 133
      // readback remain covered by their dedicated runtime acceptance lanes.
      await installDeliverySummaryRoute(page)
    }
    if (typeof scenario.beforeNavigate === 'function') {
      await scenario.beforeNavigate(page)
    }

    await gotoScenarioPath(page, scenario.path, {
      waitUntil: 'domcontentloaded',
    })
    await waitForScenarioDocumentReady(page, errors)
    await delay(300)

    if (scenario.expectPath) {
      await waitForPath(page, scenario.expectPath)
    }

    await scenario.verify(page)
    await assertVisibleInputControlRadius(page, scenario.name)
    await assertVisibleRoundedInputWrapperClipping(page, scenario.name)
    await assertVisibleInputFocusRingNotClipped(page, scenario.name)
    await assertVisibleInputTextVerticalRhythm(page, scenario.name)
    await assertVisibleSearchPlaceholdersFit(page, scenario.name)
    await assertVisibleBusinessFormControlHeight(page, scenario.name)
    await assertNoHorizontalOverflow(page, scenario.name)
    const expectedConsoleErrorPatterns = Array.isArray(
      scenario.expectedConsoleErrorPatterns
    )
      ? scenario.expectedConsoleErrorPatterns
      : []
    for (const pattern of expectedConsoleErrorPatterns) {
      assert(
        pattern instanceof RegExp &&
          errors.some((error) => pattern.test(error)),
        `${scenario.name} 未出现声明的预期浏览器错误: ${String(pattern)}`
      )
    }
    const unexpectedErrors = errors.filter(
      (error) =>
        !expectedConsoleErrorPatterns.some((pattern) => pattern.test(error))
    )
    assert.deepEqual(
      unexpectedErrors,
      [],
      `${scenario.name} 出现未声明的控制台或运行时错误`
    )

    const screenshotPath = path.resolve(outputDir, `${scenario.name}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
  } catch (error) {
    if (errors.length > 0) {
      error.message = `${error.message}\n浏览器错误：\n${errors.join('\n')}`
    }
    throw error
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
  const documentReadyTimeout = 45_000
  await page.waitForLoadState('domcontentloaded', {
    timeout: documentReadyTimeout,
  })
  try {
    await page.waitForFunction(
      () =>
        document.readyState !== 'loading' &&
        document.body &&
        document.body.innerText.trim().length > 0,
      null,
      { timeout: documentReadyTimeout }
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

export function isRetryableScenarioFailure(error) {
  const message = String(error?.message || '')
  return (
    message.includes('Timeout') ||
    message.includes('未找到可见文案') ||
    message.includes('Execution context was destroyed') ||
    message.includes('net::ERR_NETWORK_CHANGED') ||
    message.includes('net::ERR_ADDRESS_INVALID') ||
    message.includes('net::ERR_CONNECTION_REFUSED')
  )
}

const {
  selectPurchaseReceiptRow,
  assertPurchaseReceiptRowItemCount,
  assertLineItemsUnifiedHorizontalScroll,
} = createPurchaseReceiptAssertions({
  assert,
  path,
  outputDir,
  assertAntdModalCentered,
  assertNoBlueFocusStyle,
  assertBusinessFormModalKeyboardRecovery,
  assertThemeReadable,
  expectText,
  isAcceptedFocusBorder,
})

function isIgnorableDevServerError(text) {
  return (
    text.includes('Outdated Request') ||
    text.includes('[hmr] Failed to reload') ||
    text.includes('net::ERR_CONNECTION_REFUSED') ||
    text.includes('Failed to load resource: net::ERR_ADDRESS_INVALID') ||
    text.includes('[vite] failed to connect to websocket') ||
    text.includes(
      'Warning: trigger element and popup element should in same shadow root.'
    ) ||
    (text.includes("WebSocket connection to 'ws://127.0.0.1:") &&
      text.includes('net::ERR_ADDRESS_INVALID'))
  )
}

function tailLogs(text) {
  return text.trim().split('\n').slice(-20).join('\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const termination = installStyleL1TerminationHandlers()
  try {
    await main()
  } finally {
    termination.dispose()
  }
}
