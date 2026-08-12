#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DEV_BROWSER_SCRIPT_PATH = fileURLToPath(import.meta.url)
const WSL_POWERSHELL_PATH =
  '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
const REUSED_MARKER = 'PLUSH_DEV_BROWSER_REUSED'
const OPENED_MARKER = 'PLUSH_DEV_BROWSER_OPENED'
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

const WINDOWS_TAB_REUSE_SOURCE = String.raw`
$ErrorActionPreference = "Stop"
$targetUrl = '__PLUSH_DEV_BROWSER_TARGET_URL__'

function Test-IsTargetAddress {
  param(
    [string]$RawAddress,
    [System.Collections.Generic.HashSet[string]]$TargetAuthorities
  )

  if ([string]::IsNullOrWhiteSpace($RawAddress)) {
    return $false
  }

  $normalizedAddress = $RawAddress.Trim()
  if ($normalizedAddress -notmatch '^[a-z][a-z0-9+.-]*://') {
    $normalizedAddress = "http://$normalizedAddress"
  }

  $candidateUri = $null
  if (-not [Uri]::TryCreate(
      $normalizedAddress,
      [UriKind]::Absolute,
      [ref]$candidateUri
    )) {
    return $false
  }

  return $TargetAuthorities.Contains($candidateUri.Authority)
}

function Get-SelectedTab {
  param($Tabs)

  foreach ($tab in $Tabs) {
    try {
      $selection = $tab.GetCurrentPattern(
        [Windows.Automation.SelectionItemPattern]::Pattern
      )
      if ($selection.Current.IsSelected) {
        return $tab
      }
    } catch {
      continue
    }
  }

  return $null
}

function Select-Tab {
  param($Tab)

  $selection = $Tab.GetCurrentPattern(
    [Windows.Automation.SelectionItemPattern]::Pattern
  )
  $selection.Select()
}

function Get-AddressValue {
  param($Window)

  $editCondition = [Windows.Automation.PropertyCondition]::new(
    [Windows.Automation.AutomationElement]::ControlTypeProperty,
    [Windows.Automation.ControlType]::Edit
  )
  $edits = $Window.FindAll(
    [Windows.Automation.TreeScope]::Descendants,
    $editCondition
  )

  foreach ($edit in $edits) {
    if ($edit.Current.ClassName -ne 'OmniboxViewViews') {
      continue
    }
    try {
      $valuePattern = $edit.GetCurrentPattern(
        [Windows.Automation.ValuePattern]::Pattern
      )
      return $valuePattern.Current.Value
    } catch {
      return ''
    }
  }

  return ''
}

function Invoke-Reload {
  param($Window)

  try {
    $reloadCondition = [Windows.Automation.PropertyCondition]::new(
      [Windows.Automation.AutomationElement]::ClassNameProperty,
      'ReloadButton'
    )
    $reloadButton = $Window.FindFirst(
      [Windows.Automation.TreeScope]::Descendants,
      $reloadCondition
    )
    if ($null -ne $reloadButton -and $reloadButton.Current.IsEnabled) {
      $invoke = $reloadButton.GetCurrentPattern(
        [Windows.Automation.InvokePattern]::Pattern
      )
      $invoke.Invoke()
    }
  } catch {
    # The Vite HMR client also reconnects after a restart, so reload is best effort.
  }
}

try {
  $targetUri = [Uri]$targetUrl
  $targetAuthorities = [System.Collections.Generic.HashSet[string]]::new(
    [StringComparer]::OrdinalIgnoreCase
  )
  [void]$targetAuthorities.Add($targetUri.Authority)

  $portSuffix = if ($targetUri.IsDefaultPort) {
    ''
  } else {
    ":$($targetUri.Port)"
  }
  if ($targetUri.Host -in @('127.0.0.1', 'localhost')) {
    [void]$targetAuthorities.Add("127.0.0.1$portSuffix")
    [void]$targetAuthorities.Add("localhost$portSuffix")
  }

  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class PlushDevBrowserWindow {
  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
'@

  # Only inspect tabs whose accessible title belongs to this ERP. The address
  # value is used in memory solely to compare the exact loopback authority.
  $knownTitlePattern = '(?i)(Plush Toy ERP|业务管理|毛绒玩具管理系统|手机待办|岗位任务|127[.]0[.]0[.]1|localhost)'
  $tabCondition = [Windows.Automation.PropertyCondition]::new(
    [Windows.Automation.AutomationElement]::ControlTypeProperty,
    [Windows.Automation.ControlType]::TabItem
  )
  $browserProcesses = Get-Process -Name chrome,msedge,brave -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    Sort-Object Id -Unique

  foreach ($browserProcess in $browserProcesses) {
    $window = [Windows.Automation.AutomationElement]::FromHandle(
      $browserProcess.MainWindowHandle
    )
    if ($null -eq $window) {
      continue
    }

    $tabs = $window.FindAll(
      [Windows.Automation.TreeScope]::Descendants,
      $tabCondition
    )
    $previousTab = Get-SelectedTab -Tabs $tabs
    $matchedTab = $null

    foreach ($tab in $tabs) {
      $title = $tab.Current.Name
      if ([string]::IsNullOrWhiteSpace($title) -or
          $title -notmatch $knownTitlePattern) {
        continue
      }

      try {
        Select-Tab -Tab $tab
        Start-Sleep -Milliseconds 160
        $address = Get-AddressValue -Window $window
        if (Test-IsTargetAddress -RawAddress $address -TargetAuthorities $targetAuthorities) {
          $matchedTab = $tab
          break
        }
      } catch {
        continue
      }
    }

    if ($null -ne $matchedTab) {
      if ([PlushDevBrowserWindow]::IsIconic(
          $browserProcess.MainWindowHandle
        )) {
        [void][PlushDevBrowserWindow]::ShowWindowAsync(
          $browserProcess.MainWindowHandle,
          9
        )
      }
      $activated = $false
      try {
        $shell = New-Object -ComObject WScript.Shell
        $activated = $shell.AppActivate($browserProcess.Id)
      } catch {
        $activated = $false
      }
      if (-not $activated) {
        [void][PlushDevBrowserWindow]::SetForegroundWindow(
          $browserProcess.MainWindowHandle
        )
      }
      Select-Tab -Tab $matchedTab
      try {
        $window.SetFocus()
      } catch {
        # Selecting and activating the tab is sufficient when Chrome refuses
        # focus on its root automation element.
      }
      Invoke-Reload -Window $window
      Write-Output '${REUSED_MARKER}'
      exit 0
    }

    if ($null -ne $previousTab) {
      try {
        Select-Tab -Tab $previousTab
      } catch {
        # A closed or inaccessible original tab does not block the fallback.
      }
    }
  }
} catch {
  # UI Automation can be unavailable across privilege or browser boundaries.
  # Falling back preserves the existing first-start behavior.
}

try {
  Start-Process -FilePath $targetUrl
  Write-Output '${OPENED_MARKER}'
  exit 0
} catch {
  Write-Error 'Unable to reuse or open the local development browser page.'
  exit 1
}
`

function isWSL(platform, release) {
  return (
    platform === 'linux' && String(release).toLowerCase().includes('microsoft')
  )
}

export function resolveWindowsPowerShellPath({
  env = process.env,
  fileExists = existsSync,
  platform = process.platform,
  release = os.release(),
} = {}) {
  if (platform === 'win32') {
    const systemRoot = env.SYSTEMROOT || env.SystemRoot || 'C:\\Windows'
    const candidate = path.win32.join(
      systemRoot,
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    )
    return fileExists(candidate) ? candidate : ''
  }

  if (isWSL(platform, release) && fileExists(WSL_POWERSHELL_PATH)) {
    return WSL_POWERSHELL_PATH
  }

  return ''
}

export function resolveDevBrowserLaunchEnv(
  env = process.env,
  runtime = {}
) {
  if (String(env.BROWSER || '').trim()) {
    return {}
  }

  const powerShellPath = resolveWindowsPowerShellPath({ env, ...runtime })
  if (!powerShellPath) {
    return {}
  }

  return {
    BROWSER: DEV_BROWSER_SCRIPT_PATH,
    ERP_DEV_BROWSER_POWERSHELL: powerShellPath,
  }
}

export function normalizeDevBrowserTarget(rawTarget) {
  let target
  try {
    target = new URL(String(rawTarget || ''))
  } catch {
    throw new Error('Vite did not provide a valid development URL')
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new Error('development browser URL must use http or https')
  }
  if (target.username || target.password) {
    throw new Error('development browser URL must not contain credentials')
  }
  if (!LOOPBACK_HOSTS.has(target.hostname.toLowerCase())) {
    throw new Error('development browser URL must use a loopback host')
  }

  return target
}

export function parseDevBrowserTarget(argv) {
  for (let index = argv.length - 1; index >= 0; index -= 1) {
    try {
      return normalizeDevBrowserTarget(argv[index])
    } catch {
      // Vite passes its own CLI arguments before the URL.
    }
  }
  throw new Error('Vite did not provide a loopback development URL')
}

export function openDevBrowser(
  rawTarget,
  {
    env = process.env,
    powerShellPath = env.ERP_DEV_BROWSER_POWERSHELL ||
      resolveWindowsPowerShellPath({ env }),
    spawnSyncImpl = spawnSync,
  } = {}
) {
  const target = normalizeDevBrowserTarget(rawTarget)
  if (!powerShellPath) {
    throw new Error('Windows PowerShell is unavailable for browser launch')
  }

  const powerShellTarget = target.href.replaceAll("'", "''")
  const powerShellSource = WINDOWS_TAB_REUSE_SOURCE.replace(
    '__PLUSH_DEV_BROWSER_TARGET_URL__',
    powerShellTarget
  )
  const encodedCommand = Buffer.from(powerShellSource, 'utf16le').toString(
    'base64'
  )
  const result = spawnSyncImpl(
    powerShellPath,
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encodedCommand,
    ],
    {
      encoding: 'utf8',
      env,
      timeout: 10_000,
      windowsHide: true,
    }
  )

  if (result.error || result.status !== 0) {
    throw new Error('Windows could not reuse or open the development page')
  }

  const output = String(result.stdout || '')
  if (output.includes(REUSED_MARKER)) {
    return { action: 'reused', origin: target.origin }
  }
  if (output.includes(OPENED_MARKER)) {
    return { action: 'opened', origin: target.origin }
  }
  throw new Error('Windows browser launcher returned an unknown result')
}

function main() {
  const target = parseDevBrowserTarget(process.argv.slice(2))
  const result = openDevBrowser(target)
  const message =
    result.action === 'reused'
      ? '已复用并刷新现有标签页'
      : '未找到同端口标签页，已打开新标签页'
  process.stdout.write(`[dev-browser] ${message}：${result.origin}\n`)
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isDirectRun) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`[dev-browser] ${error.message}\n`)
    process.exit(1)
  }
}
