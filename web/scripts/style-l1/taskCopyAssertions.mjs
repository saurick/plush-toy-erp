import assert from 'node:assert/strict'

export async function assertTaskCopy(
  page,
  button,
  expected,
  { keyboard = false, failure = false, fallback = false } = {}
) {
  const details = page.locator(
    '.erp-task-action-drawer:visible, [data-testid="mobile-task-detail-screen"]'
  )
  const before = { url: page.url(), details: await details.count() }
  await page.evaluate(
    ({ failure, fallback }) => {
      const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
      const command = document.execCommand
      window.__taskCopyProbe = {
        writes: [],
        restore: () => {
          if (descriptor) {
            Object.defineProperty(navigator, 'clipboard', descriptor)
          } else delete navigator.clipboard
          document.execCommand = command
          delete window.__taskCopyProbe
        },
      }
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: fallback
          ? undefined
          : {
              writeText: async (value) => {
                if (failure) {
                  throw new DOMException('Clipboard blocked', 'NotAllowedError')
                }
                window.__taskCopyProbe.writes.push(value)
              },
            },
      })
      if (fallback) {
        document.execCommand = () => {
          window.__taskCopyProbe.writes.push(document.activeElement.value)
          return true
        }
      }
    },
    { failure, fallback }
  )
  try {
    if (keyboard) {
      await button.focus()
      await button.press('Enter')
    } else await button.click()
    if (failure) {
      await page
        .getByText('复制失败，请在任务详情中选中文字复制', { exact: true })
        .waitFor()
    } else {
      await page.waitForFunction(
        () => window.__taskCopyProbe.writes.length === 1
      )
      const [value] = await page.evaluate(() => window.__taskCopyProbe.writes)
      if (Array.isArray(expected)) {
        for (const part of expected) {
          assert.ok(value.includes(part), `复制结果应包含 ${part}`)
        }
      } else assert.equal(value, expected)
    }
    assert.equal(page.url(), before.url, '复制不改变列表地址')
    assert.equal(await details.count(), before.details, '复制不打开或关闭任务')
    assert.equal(
      await page.locator('.erp-task-card button button').count(),
      0,
      '任务卡不能嵌套按钮'
    )
    if (keyboard) {
      assert.equal(
        await button.evaluate((node) => node === document.activeElement),
        true,
        '键盘复制后保留焦点'
      )
    }
  } finally {
    await page.evaluate(() => window.__taskCopyProbe.restore())
  }
}

export async function clickTaskCardContent(card, target) {
  const open = card.locator('.erp-task-card__open')
  const [cardBox, targetBox] = await Promise.all([
    open.boundingBox(),
    target.boundingBox(),
  ])
  assert.ok(cardBox && targetBox)
  await open.click({
    position: {
      x: targetBox.x - cardBox.x + 4,
      y: targetBox.y - cardBox.y + targetBox.height / 2,
    },
  })
}
