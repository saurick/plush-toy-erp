import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'

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
  try {
    await locator.waitFor({ state: 'visible', timeout: 20_000 })
  } catch (error) {
    const snapshot = await page
      .locator('body')
      .innerText()
      .then((value) => String(value).replace(/\s+/gu, ' ').slice(0, 600))
      .catch(() => '')
    throw new Error(
      `${error.message}\n当前地址: ${page.url()}\n页面摘要: ${snapshot}`,
      { cause: error }
    )
  }
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

async function assertButtonDisabled(page, name) {
  const button = page.getByRole('button', { name })
  assert(await button.isDisabled(), `按钮应为禁用状态: ${name}`)
}
export {
  waitForPath,
  expectHeading,
  expectButton,
  expectNoButton,
  expectText,
  assertTextAbsent,
  assertNoHorizontalOverflow,
  assertButtonDisabled,
}
