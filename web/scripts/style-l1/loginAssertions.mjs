import assert from 'node:assert/strict'
import { getContrastRatio, parseRgb } from './colorAssertions.mjs'

async function assertAdminLoginLayout(page, { minCardWidth }) {
  const metrics = await page.evaluate(() => {
    const loginPage = document.querySelector('.erp-login-page')
    const background = document.querySelector('.erp-login-page__bg')
    const card = document.querySelector('.erp-login-card')
    const logo = document.querySelector('.erp-login-logo')
    const usernameInput = document.querySelector(
      'input[autocomplete="username"]'
    )
    const passwordInput = document.querySelector('.ant-input-affix-wrapper')
    const submitButton = document.querySelector('button[type="submit"]')
    const loginPageRect = loginPage?.getBoundingClientRect?.()
    const backgroundRect = background?.getBoundingClientRect?.()
    const cardRect = card?.getBoundingClientRect?.()
    const loginPageStyle = loginPage ? window.getComputedStyle(loginPage) : null
    const cardStyle = card ? window.getComputedStyle(card) : null
    const submitStyle = submitButton
      ? window.getComputedStyle(submitButton)
      : null

    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      pageDisplay: loginPageStyle?.display || '',
      pageAlignItems: loginPageStyle?.alignItems || '',
      pageJustifyContent: loginPageStyle?.justifyContent || '',
      pageWidth: loginPageRect?.width || 0,
      pageHeight: loginPageRect?.height || 0,
      backgroundWidth: backgroundRect?.width || 0,
      backgroundHeight: backgroundRect?.height || 0,
      cardWidth: cardRect?.width || 0,
      cardCenterDelta: cardRect
        ? Math.abs(cardRect.left + cardRect.width / 2 - window.innerWidth / 2)
        : Number.POSITIVE_INFINITY,
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
    metrics.cardWidth <= 622,
    `登录卡片不应撑满桌面视口: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.pageDisplay,
    'flex',
    `登录页居中容器未生效: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.pageAlignItems,
    'center',
    `登录页垂直居中未生效: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.pageJustifyContent,
    'center',
    `登录页水平居中未生效: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.cardCenterDelta <= 2,
    `登录卡片未水平居中: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.pageWidth >= metrics.viewportWidth,
    `登录页未覆盖视口宽度: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.pageHeight >= metrics.viewportHeight,
    `登录页未覆盖视口高度: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.backgroundWidth >= metrics.viewportWidth &&
      metrics.backgroundHeight >= metrics.viewportHeight,
    `登录页背景未覆盖视口: ${JSON.stringify(metrics)}`
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

async function assertAdminLoginSmsHintLayout(page, { scenarioName }) {
  await page
    .locator('.erp-login-card .erp-login-sms-hint')
    .waitFor({ state: 'visible', timeout: 10_000 })

  const metrics = await page.evaluate(() => {
    const hint = document.querySelector('.erp-login-card .erp-login-sms-hint')
    const message = hint?.querySelector('.ant-alert-message')
    const icon = hint?.querySelector('.ant-alert-icon')
    const card = document.querySelector('.erp-login-card')
    const form = document.querySelector('.erp-login-card form')
    const submitButton = document.querySelector(
      '.erp-login-card button[type="submit"]'
    )
    const hintRect = hint?.getBoundingClientRect()
    const formRect = form?.getBoundingClientRect()
    const submitRect = submitButton?.getBoundingClientRect()
    const hintStyle = hint ? window.getComputedStyle(hint) : null
    const messageStyle = message ? window.getComputedStyle(message) : null

    return {
      cardWidth: card?.getBoundingClientRect?.().width || 0,
      formWidth: formRect?.width || 0,
      hintWidth: hintRect?.width || 0,
      hintHeight: hintRect?.height || 0,
      hintBottom: hintRect?.bottom || 0,
      submitTop: submitRect?.top || 0,
      submitHeight: submitRect?.height || 0,
      borderRadius: Number.parseFloat(hintStyle?.borderTopLeftRadius || '0'),
      backgroundColor: hintStyle?.backgroundColor || '',
      color: messageStyle?.color || '',
      iconColor: icon ? window.getComputedStyle(icon).color : '',
      overflowX: hint ? hint.scrollWidth - hint.clientWidth : 0,
      messageText: message?.textContent?.replace(/\s+/g, ' ').trim() || '',
    }
  })

  assert(metrics.hintWidth > 0, `${scenarioName} 短信提示未渲染`)
  assert(
    metrics.hintWidth <= metrics.formWidth,
    `${scenarioName} 短信提示宽度不应撑满或溢出表单: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.hintHeight >= 32 && metrics.hintHeight <= 46,
    `${scenarioName} 短信提示高度应是轻量反馈: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.borderRadius >= 18,
    `${scenarioName} 短信提示圆角回退: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.submitTop - metrics.hintBottom >= 10,
    `${scenarioName} 短信提示和登录按钮间距不足或重叠: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.submitHeight >= 54,
    `${scenarioName} 登录按钮高度被短信提示影响: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.overflowX <= 1,
    `${scenarioName} 短信提示文字横向溢出: ${JSON.stringify(metrics)}`
  )
  const background = parseRgb(metrics.backgroundColor)
  const color = parseRgb(metrics.color)
  assert(
    background && color,
    `${scenarioName} 无法解析短信提示颜色: ${JSON.stringify(metrics)}`
  )
  const contrastRatio = getContrastRatio(color, background)
  assert(
    contrastRatio >= 4.5,
    `${scenarioName} 短信提示文字对比度不足: ${JSON.stringify({
      ...metrics,
      contrastRatio,
    })}`
  )
}

async function assertAdminLoginSmsCodeErrorHintSpacing(page, { scenarioName }) {
  await page
    .getByText('请输入验证码', { exact: true })
    .waitFor({ state: 'visible', timeout: 10_000 })
  await page
    .locator('.erp-login-card .erp-login-sms-hint')
    .waitFor({ state: 'visible', timeout: 10_000 })

  const metrics = await page.evaluate(() => {
    const errorNodes = [
      ...document.querySelectorAll(
        '.erp-login-card .ant-form-item-explain-error'
      ),
    ]
    const codeError = errorNodes.find(
      (node) => node.textContent?.trim() === '请输入验证码'
    )
    const hint = document.querySelector('.erp-login-card .erp-login-sms-hint')
    const codeInput = document.querySelector(
      '.erp-login-card input[placeholder="请输入验证码"]'
    )
    const codeGroup = document.querySelector(
      '.erp-login-card .erp-login-sms-code-compact'
    )
    const errorRect = codeError?.getBoundingClientRect()
    const hintRect = hint?.getBoundingClientRect()
    const inputRect = codeInput?.getBoundingClientRect()
    const groupRect = codeGroup?.getBoundingClientRect()

    return {
      errorText: codeError?.textContent?.trim() || '',
      errorTop: errorRect?.top || 0,
      errorBottom: errorRect?.bottom || 0,
      hintTop: hintRect?.top || 0,
      hintBottom: hintRect?.bottom || 0,
      codeInputBottom: inputRect?.bottom || 0,
      codeGroupBottom: groupRect?.bottom || 0,
      overlap: errorRect && hintRect ? errorRect.bottom - hintRect.top : 0,
    }
  })

  assert.equal(
    metrics.errorText,
    '请输入验证码',
    `${scenarioName} 未找到验证码错误文案: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.errorTop + 6 >= metrics.codeGroupBottom,
    `${scenarioName} 验证码错误文案不应盖住输入组: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.hintTop - metrics.errorBottom >= 6,
    `${scenarioName} 短信提示不应遮挡验证码错误文案: ${JSON.stringify(metrics)}`
  )
}
export {
  assertAdminLoginLayout,
  assertAdminLoginSmsHintLayout,
  assertAdminLoginSmsCodeErrorHintSpacing,
}
