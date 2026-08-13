#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'
import {
  loadDevPorts,
  validateDevAuxPort,
} from '../../scripts/dev-ports.mjs'

const projectRoot = path.resolve(import.meta.dirname, '../..')
const webRoot = path.join(projectRoot, 'web')

function parseArgs(argv) {
  const options = {
    buildDir: path.join(webRoot, 'build'),
    port: 0,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const value = argv[index + 1]
    if (arg === '--port') {
      options.port = Number(value)
      index += 1
      continue
    }
    if (arg === '--build-dir') {
      options.buildDir = path.resolve(value)
      index += 1
      continue
    }
    throw new Error(`unknown argument: ${arg}`)
  }

  const ports = loadDevPorts(projectRoot)
  options.port = validateDevAuxPort(
    ports,
    options.port,
    'production DEV-boundary browser port'
  )
  if (!existsSync(path.join(options.buildDir, 'index.html'))) {
    throw new Error(`production build is missing: ${options.buildDir}`)
  }
  return options
}

async function waitUntilReady(url, child, timeoutMs = 15_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `static server exited before readiness: ${child.exitCode ?? child.signalCode}`
      )
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Bounded readiness polling is expected while the local server starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`static server readiness timed out: ${url}`)
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ])
  if (child.exitCode === null && child.signalCode === null) {
    throw new Error('static server did not stop after SIGTERM')
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const baseURL = `http://127.0.0.1:${options.port}`
  const serverOutput = []
  const child = spawn(process.execPath, ['./scripts/serveStaticApp.mjs'], {
    cwd: webRoot,
    env: {
      ...process.env,
      API_ORIGIN: '',
      HOST: '127.0.0.1',
      PORT: String(options.port),
      STATIC_ROOT: options.buildDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => serverOutput.push(String(chunk)))
  child.stderr.on('data', (chunk) => serverOutput.push(String(chunk)))

  let browser
  try {
    await waitUntilReady(`${baseURL}/healthz`, child)
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    const response = await page.goto(`${baseURL}/__dev`, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    })
    assert.equal(response?.status(), 200)
    await page.waitForURL((url) => !url.pathname.startsWith('/__dev'), {
      timeout: 15_000,
    })
    await page.waitForLoadState('networkidle', { timeout: 15_000 })

    const result = await page.evaluate(() => {
      const loginPage = document.querySelector('.erp-login-page')
      const loginCard = document.querySelector('.erp-login-card')
      const loginPageStyle = loginPage
        ? window.getComputedStyle(loginPage)
        : null
      const loginPageRect = loginPage?.getBoundingClientRect?.()
      const loginCardRect = loginCard?.getBoundingClientRect?.()

      return {
        bodyText: document.body?.innerText || '',
        faviconHrefs: Array.from(
          document.querySelectorAll('link[rel~="icon"]')
        ).map((link) => link.getAttribute('href') || ''),
        loginCardCenterDelta: loginCardRect
          ? Math.abs(
              loginCardRect.left +
                loginCardRect.width / 2 -
                window.innerWidth / 2
            )
          : Number.POSITIVE_INFINITY,
        loginCardWidth: loginCardRect?.width || 0,
        loginPageDisplay: loginPageStyle?.display || '',
        loginPageHeight: loginPageRect?.height || 0,
        pathname: window.location.pathname,
        title: document.title,
        viewportHeight: window.innerHeight,
      }
    })
    assert.equal(result.pathname, '/admin-login')
    assert.doesNotMatch(result.bodyText, /研发效能工作台/u)
    assert.doesNotMatch(result.title, /研发效能工作台/u)
    assert(
      result.faviconHrefs.every((href) => !href.includes('favicon-dev.svg')),
      `production favicon leaked DEV metadata: ${JSON.stringify(result.faviconHrefs)}`
    )
    assert.equal(
      result.loginPageDisplay,
      'flex',
      `production login centering is missing: ${JSON.stringify(result)}`
    )
    assert(
      result.loginCardWidth >= 520 && result.loginCardWidth <= 622,
      `production login card width is invalid: ${JSON.stringify(result)}`
    )
    assert(
      result.loginCardCenterDelta <= 2,
      `production login card is not centered: ${JSON.stringify(result)}`
    )
    assert(
      result.loginPageHeight >= result.viewportHeight,
      `production login page does not cover the viewport: ${JSON.stringify(result)}`
    )
    process.stdout.write(
      `[production-dev-boundary-browser] status=passed direct=/__dev redirected=${result.pathname}\n`
    )
  } catch (error) {
    const output = serverOutput.join('').trim()
    throw new Error(
      `${error.message}${output ? `\nstatic server output:\n${output}` : ''}`
    )
  } finally {
    await browser?.close()
    await stopChild(child)
  }
}

run().catch((error) => {
  process.stderr.write(`[production-dev-boundary-browser] ${error.message}\n`)
  process.exit(1)
})
