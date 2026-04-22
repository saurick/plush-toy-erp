import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

import { chromium } from 'playwright'

const webDir = path.resolve(import.meta.dirname, '..')
const outputDir = path.resolve(webDir, 'output', 'playwright', 'style-l1')
const devServerPort = Number(process.env.STYLE_L1_PORT || 4173)
const externalBaseURL = String(process.env.STYLE_L1_BASE_URL || '').trim()
const baseURL = externalBaseURL || `http://127.0.0.1:${devServerPort}`
const headless = process.env.HEADED !== '1'

let devServerProcess = null
let devServerLogs = ''

const scenarios = [
  {
    name: 'root-redirect-desktop',
    path: '/',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '毛绒 ERP 管理后台')
      await expectButton(page, /登\s*录/)
      await expectText(page, '东莞市永绅玩具有限公司')
      await assertAdminLoginLayout(page, { minCardWidth: 520 })
    },
  },
  {
    name: 'root-redirect-mobile',
    path: '/',
    viewport: { width: 390, height: 844 },
    verify: async (page) => {
      await expectHeading(page, '毛绒 ERP 管理后台')
      await expectButton(page, /登\s*录/)
      await expectText(page, '东莞市永绅玩具有限公司')
      await assertAdminLoginLayout(page, { minCardWidth: 320 })
    },
  },
  {
    name: 'admin-login-mobile',
    path: '/admin-login',
    viewport: { width: 390, height: 844 },
    verify: async (page) => {
      await expectText(page, '毛绒 ERP 管理后台')
      await expectButton(page, /登\s*录/)
      await expectText(page, '东莞市永绅玩具有限公司')
      await assertAdminLoginLayout(page, { minCardWidth: 320 })
    },
  },
  {
    name: 'erp-dashboard-redirect',
    path: '/erp/dashboard',
    viewport: { width: 1280, height: 800 },
    verify: async (page) => {
      await expectText(page, '毛绒 ERP 管理后台')
      await expectButton(page, /登\s*录/)
      await assertAdminLoginLayout(page, { minCardWidth: 520 })
    },
  },
  {
    name: 'erp-dashboard-desktop',
    path: '/erp/dashboard',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectText(page, '超级管理员')
      await expectText(page, 'style-l1-admin')
      await expectHeading(page, '毛绒 ERP 任务看板')
      await expectText(page, '任务总数')
      await expectText(page, '任务状态分布')
      await expectText(page, '模块进度明细')
    },
  },
  {
    name: 'erp-layout-scroll-isolated',
    path: '/erp/dashboard',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      const result = await page.evaluate(() => {
        const menu = document.querySelector('.erp-admin-menu')
        const content = document.querySelector('.erp-admin-content')
        if (!menu || !content) {
          return { ok: false, reason: 'missing menu or content container' }
        }

        const menuStyle = window.getComputedStyle(menu)
        const beforeMenuTop = menu.getBoundingClientRect().top
        const beforeMenuScroll = menu.scrollTop
        content.scrollTop = 480
        const afterMenuTop = menu.getBoundingClientRect().top
        const afterMenuScroll = menu.scrollTop

        return {
          ok:
            menuStyle.overflowY === 'auto' &&
            Math.abs(beforeMenuTop - afterMenuTop) < 1 &&
            beforeMenuScroll === afterMenuScroll,
          reason: {
            overflowY: menuStyle.overflowY,
            beforeMenuTop,
            afterMenuTop,
            beforeMenuScroll,
            afterMenuScroll,
          },
        }
      })

      assert(
        result.ok,
        `侧栏与内容滚动未隔离: ${JSON.stringify(result.reason)}`
      )
    },
  },
  {
    name: 'erp-dashboard-mobile',
    path: '/erp/dashboard',
    auth: 'admin',
    viewport: { width: 390, height: 844 },
    verify: async (page) => {
      await expectText(page, '超级管理员')
      await expectText(page, '毛绒 ERP 管理后台')
      await expectText(page, '毛绒 ERP 任务看板')
      await expectText(page, '任务状态分布')
    },
  },
  {
    name: 'permission-center-desktop',
    path: '/erp/system/permissions',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '权限管理')
      await expectText(page, '创建管理员')
      await expectText(page, '超级管理员')
      await expectText(page, '普通管理员')
    },
  },
  {
    name: 'help-center-mobile',
    path: '/erp/docs/operation-guide',
    auth: 'admin',
    viewport: { width: 390, height: 844 },
    verify: async (page) => {
      await expectHeading(page, 'ERP 操作教程')
      await expectText(page, '桌面后台统一从')
      await expectText(page, '移动端端口速查')
      await expectText(page, '当前明确不做')
    },
  },
  {
    name: 'print-center-desktop',
    path: '/erp/print-center',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '打印模板中心')
      await expectText(page, '打开可编辑打印窗口')
      await expectText(page, '模板目录')
      await expectText(page, '当前模板')
      await expectText(page, '模板数量')
    },
  },
  {
    name: 'print-preview-material',
    path: '/erp/print-center/material-purchase-contract',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '采购合同')
      await expectText(page, '兼容入口')
      await expectText(page, '打开可编辑打印窗口')
      await expectText(page, '返回打印中心')
    },
  },
  {
    name: 'print-preview-processing',
    path: '/erp/print-center/processing-contract',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '加工合同')
      await expectText(page, '兼容入口')
      await expectText(page, '打开可编辑打印窗口')
      await expectText(page, '返回打印中心')
    },
  },
  {
    name: 'print-workspace-material',
    path: '/erp/print-workspace/material-purchase-contract',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectText(page, '采购合同')
      await expectText(page, '当前记录字段（可编辑）')
      await expectText(page, '使用默认模板')
      await expectText(page, '在线预览 PDF')
      await expectText(page, '选择明细行')
      await expectText(page, '下载 PDF')
    },
  },
  {
    name: 'print-workspace-processing',
    path: '/erp/print-workspace/processing-contract',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectText(page, '加工合同')
      await expectText(page, '当前记录字段（可编辑）')
      await expectText(page, '使用默认模板')
      await expectText(page, '在线预览 PDF')
      await expectText(page, '下载 PDF')
      await expectText(page, '选择明细行')
      await expectText(page, '打印')
      await expectButton(page, '上传纸样 / 图样附件位 1')
      await expectButton(page, '上传纸样 / 图样附件位 2')
      await expectText(
        page,
        '纸样 / 图样附件独立上传，仅作为合同附件快照保留，不进入右侧模板或 PDF。'
      )
      await page
        .locator('.erp-processing-contract-upload-bar__input')
        .first()
        .setInputFiles(path.resolve(webDir, 'public', 'favicon.svg'))
      await expectText(page, '已选：favicon.svg')
      const attachmentTemplateState = await page.evaluate(() => ({
        uploadPanelCount: document.querySelectorAll(
          '.erp-processing-contract-upload-bar'
        ).length,
        templateAttachmentCount: document.querySelectorAll(
          '.erp-processing-contract-attachments'
        ).length,
      }))
      assert.equal(
        attachmentTemplateState.uploadPanelCount,
        1,
        '加工合同工作台应显示独立附件上传区'
      )
      assert.equal(
        attachmentTemplateState.templateAttachmentCount,
        0,
        '加工合同纸面模板不应再渲染附件占位区'
      )
    },
  },
  {
    name: 'docs-field-linkage-guide-desktop',
    path: '/erp/docs/field-linkage-guide',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await page
        .getByRole('heading', { name: 'ERP 字段联动口径' })
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 })
      await expectText(page, 'BOM 真源')
      await assertDocsArticleReadable(page)
    },
  },
  {
    name: 'operation-guide-mobile',
    path: '/erp/docs/operation-guide',
    auth: 'admin',
    viewport: { width: 390, height: 844 },
    verify: async (page) => {
      await expectHeading(page, 'ERP 操作教程')
      await expectText(page, '六个移动端角色按端口直接访问')
      await expectText(page, '当前明确不做')
    },
  },
  {
    name: 'field-linkage-guide-desktop',
    path: '/erp/docs/field-linkage-guide',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, 'ERP 字段联动口径')
      await expectText(page, '产品订单编号')
      await expectText(page, '材料分析明细表')
    },
  },
  {
    name: 'business-menu-groups-desktop',
    path: '/erp/master/partners',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '客户/供应商')
      await expectText(page, '基础资料')
      await expectText(page, '销售链路')
      await expectText(page, '采购/仓储')
      await expectText(page, '生产环节')
      await expectText(page, '财务环节')
      await expectText(page, '单据模板')
      assert.equal(
        await page.getByText('流程与真源', { exact: true }).count(),
        0,
        '侧栏不应再显示“流程与真源”分组'
      )
    },
  },
  {
    name: 'business-partners-desktop',
    path: '/erp/master/partners',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '客户/供应商')
      await expectText(page, '对 trade-erp 的复用方式')
      await expectText(page, '关键字段 / 口径')
      await expectText(page, '加工厂商资料')
      await expectText(page, '当前不强行生成统一 partner_code')
    },
  },
  {
    name: 'business-processing-contracts-desktop',
    path: '/erp/purchase/processing-contracts',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '加工合同/委外下单')
      await expectText(page, '委外加工合同')
      await expectText(page, '合同编号 / 下单日期 / 回货日期')
      await expectText(page, '加工 成慧怡.xlsx')
      await expectText(page, '保存链路和打印回填暂未接通')
    },
  },
  {
    name: 'business-reconciliation-desktop',
    path: '/erp/finance/reconciliation',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '对账/结算')
      await expectText(page, '加工费、辅包材采购金额')
      await expectText(page, '当前还缺正式对账单 / 结算单样本')
      await expectText(page, '加工合同 PDF')
    },
  },
]

async function main() {
  await fs.mkdir(outputDir, { recursive: true })

  try {
    if (!externalBaseURL) {
      devServerProcess = startDevServer()
      await waitForServer(baseURL)
    }

    const browser = await chromium.launch({ headless })
    try {
      for (const scenario of scenarios) {
        await runScenario(browser, scenario)
      }
    } finally {
      await browser.close()
    }

    console.log(`[style:l1] 通过，共验证 ${scenarios.length} 个场景`)
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
      '127.0.0.1',
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

  if (devServerProcess.exitCode === null) {
    devServerProcess.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => devServerProcess.once('exit', resolve)),
      delay(3000),
    ])
  }

  if (devServerProcess.exitCode === null) {
    devServerProcess.kill('SIGKILL')
  }

  devServerProcess = null
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000
  let lastError = 'server did not become ready'

  while (Date.now() < deadline) {
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
    }
    await delay(300)
  }

  throw new Error(
    `[style:l1] 无法启动前端预览：${lastError}\n最近 vite 输出：\n${tailLogs(devServerLogs)}`
  )
}

async function runScenario(browser, scenario) {
  const page = await browser.newPage({ viewport: scenario.viewport })
  const errors = []

  if (scenario.auth === 'admin') {
    const token = createMockAdminToken()
    await installAdminRpcMocks(page)
    await page.addInitScript((mockToken) => {
      localStorage.setItem('admin_access_token', mockToken)
    }, token)
  }

  page.on('console', (message) => {
    if (message.type() === 'error') {
      const text = message.text()
      if (!isIgnorableDevServerError(text)) {
        errors.push(`console error: ${text}`)
      }
    }
  })
  page.on('pageerror', (error) => {
    errors.push(`page error: ${error.message}`)
  })

  try {
    await page.goto(new URL(scenario.path, `${baseURL}/`).toString(), {
      waitUntil: 'domcontentloaded',
    })
    await delay(300)

    if (scenario.expectPath) {
      await waitForPath(page, scenario.expectPath)
    }

    await scenario.verify(page)
    await assertNoHorizontalOverflow(page, scenario.name)
    assert.deepEqual(errors, [], `${scenario.name} 出现控制台或运行时错误`)

    const screenshotPath = path.resolve(outputDir, `${scenario.name}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
  } catch (error) {
    throw new Error(
      `[style:l1] 场景失败: ${scenario.name}\n${error.message}\n最近 vite 输出：\n${tailLogs(devServerLogs)}`
    )
  } finally {
    await page.close()
  }
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

async function installAdminRpcMocks(page) {
  await page.route('**/rpc/admin', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body

    const adminProfile = {
      id: 1,
      username: 'style-l1-admin',
      level: 0,
      disabled: false,
      menu_permissions: [
        '/erp/dashboard',
        '/erp/print-center',
        '/erp/docs/operation-flow-overview',
        '/erp/docs/operation-guide',
        '/erp/docs/field-linkage-guide',
        '/erp/docs/calculation-guide',
        '/erp/system/permissions',
      ],
    }

    let data = {}
    switch (method) {
      case 'me':
        data = adminProfile
        break
      case 'list':
        data = {
          admins: [
            adminProfile,
            {
              id: 2,
              username: 'assistant-admin',
              level: 1,
              disabled: false,
              menu_permissions: [
                '/erp/dashboard',
                '/erp/print-center',
                '/erp/docs/operation-guide',
              ],
            },
          ],
        }
        break
      case 'create':
      case 'set_permissions':
      case 'set_disabled':
        data = {
          admin: {
            id: Number(params.id || 2),
            username: params.username || 'assistant-admin',
            level: Number(params.level || 1),
            disabled: Boolean(params.disabled),
            menu_permissions: Array.isArray(params.menu_permissions)
              ? params.menu_permissions
              : ['/erp/dashboard'],
          },
        }
        break
      case 'menu_options':
        data = {
          menu_options: adminProfile.menu_permissions.map((key) => ({
            key,
            label: key,
          })),
        }
        break
      default:
        data = {}
        break
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          code: 0,
          message: 'OK',
          data,
        },
      }),
    })
  })

  await page.route('**/rpc/auth', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method } = body

    if (method === 'logout') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: {
            code: 0,
            message: 'OK',
          },
        }),
      })
      return
    }

    await route.fallback()
  })
}

async function expectHeading(page, text) {
  const locator = page.getByRole('heading', { name: text }).first()
  await locator.waitFor({ state: 'visible', timeout: 10_000 })
}

async function expectRole(page, role, name) {
  const locator = page.getByRole(role, { name })
  await locator.waitFor({ state: 'visible', timeout: 10_000 })
}

async function expectButton(page, name) {
  const locator = page.getByRole('button', { name })
  await locator.waitFor({ state: 'visible', timeout: 10_000 })
}

async function expectText(page, text) {
  const locator = page.getByText(text, { exact: false })
  await locator.first().waitFor({ state: 'visible', timeout: 10_000 })
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

async function assertDocsArticleReadable(page) {
  const metrics = await page.evaluate(() => {
    const article = document.querySelector('.erp-docs-article')
    const paragraph = article?.querySelector('p')
    const listItem = article?.querySelector('li')
    const link = article?.querySelector('a')
    const inlineCode = article?.querySelector('code')

    const parseColor = (value) => {
      if (!value) return null
      const match = value.match(/\d+(\.\d+)?/g)
      if (!match || match.length < 3) return null
      const [r, g, b, a] = match.map(Number)
      return { r, g, b, a: Number.isFinite(a) ? a : 1 }
    }

    const toLinear = (channel) => {
      const normalized = channel / 255
      if (normalized <= 0.03928) {
        return normalized / 12.92
      }
      return ((normalized + 0.055) / 1.055) ** 2.4
    }

    const luminance = (color) => {
      if (!color) return 0
      return (
        0.2126 * toLinear(color.r) +
        0.7152 * toLinear(color.g) +
        0.0722 * toLinear(color.b)
      )
    }

    const resolveBackground = (element) => {
      let current = element
      while (current && current !== document.documentElement) {
        const background = parseColor(getComputedStyle(current).backgroundColor)
        if (background && background.a > 0) {
          return background
        }
        current = current.parentElement
      }
      return { r: 255, g: 255, b: 255, a: 1 }
    }

    const describe = (element) => {
      if (!element) return null
      const style = getComputedStyle(element)
      const color = parseColor(style.color)
      const background = resolveBackground(element)
      const contrast =
        (Math.max(luminance(color), luminance(background)) + 0.05) /
        (Math.min(luminance(color), luminance(background)) + 0.05)

      return {
        text: element.textContent?.trim().slice(0, 80) || '',
        color: style.color,
        background: `rgb(${background.r}, ${background.g}, ${background.b})`,
        contrast: Number(contrast.toFixed(2)),
      }
    }

    return {
      paragraph: describe(paragraph),
      listItem: describe(listItem),
      link: describe(link),
      inlineCode: describe(inlineCode),
    }
  })

  for (const [name, item] of Object.entries(metrics)) {
    if (name === 'link' && !item) {
      continue
    }
    assert(item, `文档页缺少 ${name} 节点: ${JSON.stringify(metrics)}`)
    assert(
      item.contrast >= 4.5,
      `文档页 ${name} 对比度不足: ${JSON.stringify(item)}`
    )
  }
}

function createMockAdminToken() {
  const header = encodeBase64URL({ alg: 'none', typ: 'JWT' })
  const payload = encodeBase64URL({
    uid: 1,
    uname: 'style-l1-admin',
    role: 1,
    exp: Math.floor(Date.now() / 1000) + 3600,
  })
  return `${header}.${payload}.stylel1`
}

function encodeBase64URL(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function isIgnorableDevServerError(text) {
  return (
    text.includes('Outdated Request') ||
    text.includes('[hmr] Failed to reload') ||
    text.includes('net::ERR_CONNECTION_REFUSED')
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

function tailLogs(text) {
  return text.trim().split('\n').slice(-20).join('\n')
}

await main()
