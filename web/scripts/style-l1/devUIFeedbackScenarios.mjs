import { writeFile } from 'node:fs/promises'

export function createDevUIFeedbackScenarios({ assert, assertNoHorizontalOverflow, outputDir }) {
  const editor = (page) => page.locator('.erp-business-action-modal--form:visible')
  const waitForModalFocus = async (page, dialog) => {
    await dialog.waitFor()
    const handle = await dialog.elementHandle()
    try {
      await page.waitForFunction(
        (node) => !/ant-zoom-(enter|appear)/u.test(node.className) &&
          node.closest('.ant-modal-wrap').contains(document.activeElement),
        handle,
        { timeout: 5000 }
      )
    } finally { await handle.dispose() }
  }
  const openEditor = async (page) => {
    await page.getByRole('button', { name: '打开编辑弹窗', exact: true }).click()
    await editor(page).waitFor()
    await page.waitForFunction(() => {
      const node = [...document.querySelectorAll('.erp-business-action-modal--form')].find((item) => item.getBoundingClientRect().width > 0 && getComputedStyle(item).visibility === 'visible')
      return node && !/ant-zoom-(enter|appear)/u.test(node.className) && getComputedStyle(node).transform === 'none'
    }, undefined, { timeout: 5000 })
    return editor(page)
  }
  const chooseResult = async (page, name) => {
    await page.getByRole('combobox', { name: '样例保存结果' }).press('ArrowDown')
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').getByText(name, { exact: true }).click()
  }
  const waitFocus = (page, selector) => page.waitForFunction((value) => document.activeElement?.matches(value), selector)
  const save = (dialog) => dialog.getByRole('button', { name: '保存说明', exact: true })

  return [
    {
      name: 'dev-ui-feedback',
      path: '/__dev/ui-design?view=specification&topic=dialogs',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const size = page.locator('.erp-feedback-guide-tools .ant-select')
        const defaultWidth = await page.locator('.erp-feedback-guide-tools code').textContent()
        await size.getByRole('combobox', { name: '弹窗宽度' }).press('ArrowDown')
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').getByText('单步确认', { exact: true }).click()
        await size.locator('.ant-select-clear').click()
        assert.equal(await size.locator('.ant-select-selection-placeholder').textContent(), '弹窗宽度')
        assert.equal(await page.locator('.erp-feedback-guide-tools code').textContent(), defaultWidth, '清空尺寸恢复默认展示宽度')
        assert.equal(await page.locator('.erp-feedback-anatomy').getAttribute('data-size'), 'localAction')
        const result = page.locator('[data-feedback-example="editor"] .ant-select').first()
        await result.locator('.ant-select-clear').click()
        assert.equal(await result.locator('.ant-select-selection-placeholder').textContent(), '样例保存结果')
        assert.equal(await page.getByRole('button', { name: '打开编辑弹窗', exact: true }).isDisabled(), true, '没有演示结果时保留选择入口并禁用依赖动作')
        await chooseResult(page, '保存成功')
        const dialog = await openEditor(page)
        await save(dialog).click()
        await dialog.getByText('请填写说明标题', { exact: true }).waitFor()
        await waitFocus(page, 'input[id$="_subject"]')
        assert.equal(await page.locator('.ant-message-notice').count(), 0)
        await dialog.getByLabel('说明标题').fill('核对到货时间')
        await dialog.getByRole('combobox', { name: '事项' }).press('ArrowDown')
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({ hasText: '包装' }).waitFor()
        await page.keyboard.press('Escape')
        assert.equal(await dialog.isVisible(), true, 'Escape should first dismiss the select popup')
        await dialog.getByLabel('说明标题').focus()
        await page.keyboard.press('Escape')
        const discard = page.locator('.ant-modal-confirm:visible')
        await discard.locator('.ant-modal-confirm-title').filter({ hasText: '放弃未保存的修改？' }).waitFor()
        await page.waitForFunction(() => document.activeElement?.textContent.replace(/\s/gu, '') === '继续编辑')
        await page.keyboard.press('Escape')
        await discard.waitFor({ state: 'hidden' })
        await waitFocus(page, 'input[id$="_subject"]')
        assert.equal(await dialog.getByLabel('说明标题').inputValue(), '核对到货时间')
        await dialog.getByRole('button', { name: '取消', exact: true }).click()
        await discard.getByRole('button', { name: '放弃修改', exact: true }).click()
        await dialog.waitFor({ state: 'hidden' })
        await page.waitForFunction(() => document.activeElement?.textContent === '打开编辑弹窗')

        await openEditor(page)
        await dialog.getByLabel('说明标题').fill('样例保存结果')
        await save(dialog).dblclick()
        await page.keyboard.press('Escape')
        assert.equal(await dialog.isVisible(), true)
        assert.equal(await dialog.getByRole('button', { name: '取消', exact: true }).isDisabled(), true)
        assert.equal(await dialog.locator('.ant-modal-close').count(), 0)
        await page.locator('.ant-modal-wrap').last().click({ position: { x: 2, y: 2 } })
        assert.equal(await dialog.isVisible(), true)
        await dialog.waitFor({ state: 'hidden' })
        await page.getByText('已保存样例：样例保存结果 · 提交 1 次', { exact: true }).waitFor()
        await page.locator('.erp-feedback-message [role="status"]').waitFor()
        await page.locator('.erp-feedback-message').waitFor({ state: 'hidden', timeout: 5000 })

        await chooseResult(page, '首次失败，可重试')
        await openEditor(page)
        await dialog.getByLabel('说明标题').fill('失败保留的输入')
        await save(dialog).click()
        await dialog.getByText('本次样例未保存，输入已保留，请重试。', { exact: true }).waitFor()
        assert.equal(await dialog.getByLabel('说明标题').inputValue(), '失败保留的输入')
        assert.equal(await page.locator('.erp-feedback-message').count(), 0)
        await save(dialog).click()
        await dialog.waitFor({ state: 'hidden' })
        await page.getByText('已保存样例：失败保留的输入 · 提交 2 次', { exact: true }).waitFor()

        await chooseResult(page, '结果未知，先查询')
        await openEditor(page)
        await dialog.getByLabel('说明标题').fill('待确认的保存')
        await save(dialog).click()
        await dialog.getByText('还不能确认是否保存成功', { exact: true }).waitFor()
        assert.equal(await save(dialog).isDisabled(), true)
        await dialog.getByRole('button', { name: '取消', exact: true }).click()
        await dialog.waitFor({ state: 'hidden' })
        await openEditor(page)
        assert.equal(await save(dialog).isDisabled(), true)
        assert.equal(await dialog.getByLabel('说明标题').inputValue(), '待确认的保存')
        await dialog.getByRole('button', { name: '查询结果', exact: true }).click()
        await dialog.waitFor({ state: 'hidden' })
        await page.getByText('已查询确认：待确认的保存 · 提交 1 次', { exact: true }).waitFor()

        await page.getByRole('radio', { name: '消息与恢复', exact: true }).locator('..').click()
        await page.locator('.erp-feedback-message').waitFor({ state: 'hidden' })
        await page.getByRole('button', { name: '长消息 / 同条更新', exact: true }).click({ clickCount: 3 })
        await page
          .locator('.erp-feedback-message [role="status"]')
          .filter({ hasText: /^同一操作使用同一个 key，连续点击更新这一条消息。较长的说明在视口内换行，不遮住整页内容。$/u })
          .waitFor({ state: 'visible', timeout: 5000 })
        assert.equal(await page.locator('.erp-feedback-message').count(), 1)
        const toast = await page.locator('.erp-feedback-message .ant-message-notice-content').evaluate((node) => ({ width: node.getBoundingClientRect().width, right: node.getBoundingClientRect().right, viewport: innerWidth }))
        assert.ok(toast.width <= 480 && toast.right <= toast.viewport)
        await page.getByRole('button', { name: '加载后更新成功', exact: true }).click()
        await page.getByText('演示文件已生成（未触发下载）', { exact: true }).waitFor()
        assert.equal(await page.locator('.erp-feedback-message').count(), 1)
        await page.getByRole('button', { name: '重置反馈', exact: true }).click()
        await page.locator('.erp-feedback-message').waitFor({ state: 'hidden' })
        await page.getByRole('button', { name: '取消读取（无失败提示）', exact: true }).click()
        assert.equal(await page.locator('.erp-feedback-message').count(), 0)
        await page.getByRole('button', { name: '持续通知', exact: true }).click()
        await page.getByRole('alert').filter({ hasText: '演示导出未完成' }).waitFor()
        await page.getByRole('button', { name: '查看恢复入口', exact: true }).click()
        await page.getByRole('button', { name: '重新生成', exact: true }).click()
        await page.getByText('演示文件已生成（未触发下载）', { exact: true }).waitFor()
        await page.getByRole('button', { name: '重置反馈', exact: true }).click()
        await assertNoHorizontalOverflow(page, 'feedback-desktop')
      },
    },
    {
      name: 'dev-ui-feedback-boundaries',
      path: '/__dev/ui-design?page=controls',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const controls = page.getByRole('region', { name: '组件设计', exact: true })
        await controls.waitFor()
        await controls.getByRole('radio', { name: '深色', exact: true }).locator('..').click()
        await openEditor(page)
        const dialog = editor(page)
        const metrics = await dialog.evaluate((node) => ({
          width: node.getBoundingClientRect().width,
          background: getComputedStyle(node.querySelector('.ant-modal-content')).backgroundColor,
          padding: getComputedStyle(node.querySelector('.ant-modal-body')).padding,
        }))
        assert.equal(metrics.width, 860)
        assert.notEqual(metrics.background, 'rgb(255, 255, 255)')
        await dialog.getByLabel('说明标题').fill('很长的说明标题'.repeat(20))
        await dialog.getByLabel('补充内容').fill('这是用于检查内容保留和滚动的长文本。\n'.repeat(100))
        await page.setViewportSize({ width: 390, height: 660 })
        const narrow = await dialog.evaluate((node) => {
          const body = node.querySelector('.ant-modal-body')
          const footer = node.querySelector('.ant-modal-footer')
          return { width: node.getBoundingClientRect().width, right: node.getBoundingClientRect().right, footer: footer.getBoundingClientRect().bottom, height: innerHeight, scrollable: getComputedStyle(body).overflowY, padding: getComputedStyle(body).paddingInlineStart }
        })
        assert.ok(narrow.width <= 362 && narrow.right <= 390)
        assert.ok(narrow.footer <= narrow.height)
        assert.equal(narrow.scrollable, 'auto')
        assert.equal(narrow.padding, '16px')
        for (let index = 0; index < 12; index += 1) {
          await page.keyboard.press('Tab')
          assert.equal(await dialog.evaluate((node) => node.closest('.ant-modal-wrap').contains(document.activeElement)), true)
        }
        await dialog.getByRole('button', { name: '取消', exact: true }).click()
        await page.locator('.ant-modal-confirm').getByRole('button', { name: '放弃修改', exact: true }).click()
        await dialog.waitFor({ state: 'hidden' })
        await page.setViewportSize({ width: 1920, height: 1080 })
        await controls.getByRole('radio', { name: '浅色', exact: true }).locator('..').click()
        const directory = controls.getByRole('navigation', { name: '组件设计目录', exact: true })
        const stage = controls.getByRole('region', { name: '交互样例', exact: true })
        const choose = async (title) => {
          await directory.getByText(title, { exact: true }).click()
          await controls.getByRole('heading', { name: title, exact: true }).waitFor()
        }
        await directory.getByRole('button', { name: '组合样例', exact: true }).click()
        await choose('危险操作确认')
        const danger = stage.getByRole('button', { name: '危险操作确认', exact: true })
        const dangerDialog = page.locator('.ant-modal-confirm:visible')
        const draft = stage.getByRole('status')
        await danger.click()
        await page.waitForFunction(() => document.activeElement?.textContent.replace(/\s/gu, '') === '保留草稿')
        await page.keyboard.press('Escape')
        await dangerDialog.waitFor({ state: 'hidden' })
        assert.equal(await draft.innerText(), '样例草稿：未生效')
        await danger.click()
        await dangerDialog.getByRole('button', { name: '作废草稿', exact: true }).click()
        await stage.getByText('样例草稿：已作废', { exact: true }).waitFor()
        assert(await danger.isDisabled())
        await stage.getByRole('button', { name: '重置草稿', exact: true }).click()
        assert.equal(await draft.innerText(), '样例草稿：未生效')

        await choose('抽屉内查看附件')
        await stage.getByRole('button', { name: '打开上下文抽屉', exact: true }).click()
        const drawer = page.getByRole('dialog', { name: '采购单上下文摘要' })
        const attachmentTrigger = drawer.getByRole('button', { name: '打开附件预览', exact: true })
        await attachmentTrigger.click()
        const preview = page.getByRole('dialog', { name: '附件预览样例', exact: true })
        await waitForModalFocus(page, preview)
        await preview.getByText('采购说明.txt', { exact: true }).waitFor()
        await page.keyboard.press('Escape')
        await preview.waitFor({ state: 'hidden' })
        assert.equal(await drawer.isVisible(), true)
        await page.waitForFunction(() => document.activeElement?.textContent.trim() === '打开附件预览')
        await drawer.locator('input[type="file"]').setInputFiles({ name: '交互样例.txt', mimeType: 'text/plain', buffer: Buffer.from('仅供本地反馈演示') })
        await drawer.getByText('附件：交互样例.txt', { exact: true }).waitFor()
        await attachmentTrigger.click()
        await waitForModalFocus(page, preview)
        await preview.getByText('交互样例.txt', { exact: true }).waitFor()
        await preview.getByRole('button', { name: '关闭预览', exact: true }).click()
        await preview.waitFor({ state: 'hidden' })
        assert.equal(await drawer.isVisible(), true)
        await page.keyboard.press('Escape')
        await drawer.waitFor({ state: 'hidden' })
        await directory.getByRole('button', { name: '操作与反馈', exact: true }).click()
        await choose('会话提示')
        await controls.getByRole('cell', { name: /按 Esc 或点击遮罩可关闭/u }).waitFor()
        const sessionTrigger = stage.getByRole('button', { name: '打开会话提示', exact: true })
        const alert = page.getByRole('alertdialog', { name: '登录状态已失效', exact: true })
        const relogin = alert.getByRole('button', { name: '重新登录', exact: true })
        const backdrop = page.locator('.app-modal-root .ant-modal-wrap').filter({ has: alert })
        for (const dismiss of [
          () => relogin.click(),
          () => page.keyboard.press('Escape'),
          () => backdrop.click({ position: { x: 2, y: 2 } }),
        ]) {
          await sessionTrigger.click()
          await waitForModalFocus(page, alert)
          await waitFocus(page, '[data-app-alert-confirm]')
          assert.equal(await page.locator('#root').getAttribute('inert'), '')
          await dismiss()
          await alert.waitFor({ state: 'hidden' })
          assert.equal(await page.locator('#root').getAttribute('inert'), null)
          await page.waitForFunction(() => document.activeElement?.textContent.trim() === '打开会话提示')
        }

        const search = controls.getByRole('textbox', { name: '搜索组件设计', exact: true })
        await search.fill('Toast')
        await search.press('Enter')
        await page.waitForURL((url) => url.searchParams.get('controlq') === 'Toast')
        await choose('操作反馈')
        const copyTrigger = stage.getByRole('button', { name: '复制成功 Toast（可关闭）', exact: true })
        await controls.getByRole('button', { name: '复制成功', exact: true }).click()
        await copyTrigger.and(stage.locator('[data-sample-usage-highlight]')).waitFor()
        await copyTrigger.click({ clickCount: 2 })
        const copyToast = page.locator('.erp-feedback-message--copy-success:visible')
        await copyToast.nth(1).getByRole('button', { name: '关闭「样例编号已复制」提示', exact: true }).waitFor()
        await stage.getByRole('button', { name: '重置反馈', exact: true }).click()
        await copyToast.first().waitFor({ state: 'hidden' })
        await stage.getByRole('button', { name: '短暂成功 Toast', exact: true }).click()
        await page.getByRole('status').getByText('已应用本次样例条件', { exact: true }).waitFor()
        assert.equal(await copyToast.count(), 0)
        await stage.getByRole('button', { name: '重置反馈', exact: true }).click()
        await writeFile(`${outputDir}/feedback-metrics.json`, JSON.stringify({ desktop: metrics, narrow }, null, 2))
      },
    },
    {
      name: 'dev-ui-feedback-reading',
      path: '/__dev/ui-design?view=rationale&topic=dialogs',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const directory = page.getByRole('navigation', { name: '设计阅读目录', exact: true })
        await page.getByRole('slider', { name: '讲解正文留白' }).waitFor()
        await page.getByRole('slider', { name: '讲解正文留白' }).focus()
        await page.keyboard.press('ArrowRight')
        await page.getByText('讲解：调整正文留白（28px）', { exact: true }).waitFor()
        await page.getByRole('button', { name: '恢复当前桌面值' }).click()
        await page.getByRole('tab', { name: '设计说明', exact: true }).click()
        await page.getByRole('heading', { name: '内容区如何表现', exact: true }).waitFor()
        await page.goBack()
        await page.getByRole('slider', { name: '讲解正文留白' }).waitFor()
        await page.goForward()
        await page.getByRole('heading', { name: '内容区如何表现', exact: true }).waitFor()
        const sources = page.getByRole('group', { name: '当前图解的规范来源' })
        await sources.getByRole('button', { name: '弹窗结构与尺寸' }).click()
        await page.locator('.erp-design-prose').getByText('localAction', { exact: true }).waitFor()
        await page.reload()
        await page.locator('.erp-design-prose').getByText('localAction', { exact: true }).waitFor()
        await page.goBack()
        const search = page.getByRole('textbox', { name: '搜索设计图解' })
        await search.fill('Toast')
        await search.press('Enter')
        await page.waitForURL((url) => url.searchParams.get('q') === 'Toast')
        await page.reload()
        assert.equal(await search.inputValue(), 'Toast')
        await directory.getByRole('button', { name: 'Toast 与反馈选择' }).click()
        const choices = page.getByRole('group', { name: '反馈选择关系' })
        const toastChoice = choices.getByRole('button', { name: /短暂且无后续动作/ })
        const toast = page.locator('.erp-feedback-message--copy-success:visible')
        assert.equal(await toast.count(), 0, '打开图解不会自动发送反馈')
        await toastChoice.press('Enter')
        await toast.getByRole('status').getByText('样例编号已复制', { exact: true }).waitFor()
        await toast.getByRole('img', { name: 'check-circle' }).waitFor()
        assert.equal(await toast.evaluate((node) => node.closest('.ant-message').style.top), '64px')
        assert.equal(await toastChoice.evaluate((node) => node === document.activeElement), true)
        const oldest = await toast.elementHandle()
        try {
          await toastChoice.press('Enter')
          await toastChoice.press('Enter')
          await toast.nth(2).waitFor()
          await toastChoice.press('Enter')
          await page.waitForFunction((node) => !node.isConnected, oldest, { timeout: 2000 })
        } finally {
          await oldest.dispose()
        }
        assert.equal(await toast.count(), 3, '第 4 次触发后移除最早的一条')
        await page.screenshot({ path: `${outputDir}/feedback-copy-toast-stack-4k.png`, animations: 'disabled' })
        const middle = toast.nth(1)
        const middleHandle = await middle.elementHandle()
        try {
          await middle.getByRole('button', { name: '关闭「样例编号已复制」提示', exact: true }).click()
          await page.waitForFunction((node) => !node.isConnected, middleHandle, { timeout: 2000 })
        } finally {
          await middleHandle.dispose()
        }
        assert.equal(await toast.count(), 2, '关闭一条后保留其余两条')
        await toast.first().getByRole('button', { name: '关闭「样例编号已复制」提示', exact: true }).press('Enter')
        await toast.nth(1).waitFor({ state: 'hidden' })
        assert.equal(await toastChoice.evaluate((node) => node === document.activeElement), true)
        await toast.first().waitFor({ state: 'hidden', timeout: 6000 })

        await choices.getByRole('button', { name: /能定位到输入/ }).click()
        const field = page.getByRole('textbox', { name: '说明标题', exact: true })
        assert.equal(await field.getAttribute('aria-invalid'), 'true')
        await page.getByText('请填写说明标题', { exact: true }).waitFor()
        await choices.getByRole('button', { name: /影响当前区域/ }).click()
        await page.getByRole('alert').getByText('读取失败，当前输入已保留', { exact: true }).waitFor()

        const notificationChoice = choices.getByRole('button', { name: /稍后仍需处理/ })
        const notification = page.locator('.ant-notification-topRight .ant-notification-notice').filter({ hasText: '样例导出未完成' })
        await notificationChoice.click()
        await notification.getByRole('alert').waitFor()
        await notification.locator('.ant-notification-notice-close').click()
        await notification.waitFor({ state: 'hidden' })
        await notificationChoice.click()
        await notification.waitFor()

        await search.locator('..').getByRole('button', { name: '清除搜索', exact: true }).click()
        for (const title of ['提交与恢复', '关闭与焦点']) {
          await directory.getByRole('button', { name: title, exact: true }).click()
          await page.locator('.erp-design-guide-section svg').first().waitFor()
        }
        await notification.waitFor({ state: 'hidden' })
        await page.setViewportSize({ width: 1280, height: 720 })
        await assertNoHorizontalOverflow(page, 'feedback-reader-1280')
        await page.waitForFunction(() => {
          const selected = document.querySelector('.erp-design-document-toc [aria-current="page"]')
          if (!selected) return false
          const item = selected.getBoundingClientRect()
          const bounds = selected.closest('nav').getBoundingClientRect()
          return item.top >= bounds.top - 1 && item.bottom <= bounds.bottom + 1
        })
        await page.getByRole('button', { name: '收起目录', exact: true }).click()
        assert.equal(await directory.isVisible(), false)
        await page.getByRole('button', { name: '展开目录', exact: true }).click()
        await directory.waitFor()
        await page.getByRole('tab', { name: '设计依据', exact: true }).click()
        for (const [title, chapter] of [
          ['Toast 与反馈选择', '反馈持续时间的取舍'],
          ['提交与恢复', '保留上下文与确认结果'],
          ['关闭与焦点', '什么时候需要关闭保护'],
        ]) {
          await directory.getByRole('button', { name: title, exact: true }).click()
          await page.getByRole('heading', { name: title, exact: true }).waitFor()
          await sources.getByRole('button', { name: chapter, exact: true }).click()
          await page.locator('.erp-design-prose').getByRole('heading', { name: new RegExp(chapter, 'u') }).waitFor()
          await page.goBack()
          await page.locator('.erp-design-prose').waitFor({ state: 'hidden' })
        }
      },
    },
  ]
}
