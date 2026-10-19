import assert from 'node:assert/strict'

const pageTitles = new Set([
  '新建客户档案', '编辑客户',
  '新建供应商或加工厂', '编辑供应商',
  '新建材料档案', '编辑材料',
  '新建产品', '编辑产品', '新建产品规格', '编辑产品规格',
  '新建加工环节', '编辑加工环节',
  '新建生产订单', '编辑生产订单', '查看生产订单',
  '生成来料质检草稿', '登记收付款', '登记红冲',
  '编辑生产领料草稿', '核对待入库完工报告', '编辑返工草稿',
  '创建员工账号',
  '新建销售订单',
  '编辑销售订单',
  '新建采购订单',
  '编辑采购订单',
  '新建加工合同',
  '编辑加工合同',
  '新建出货单',
  '编辑出货草稿',
  '查看出货明细',
  '新建 BOM 草稿',
  '编辑 BOM 草稿',
  '查看 BOM 版本',
  '复制 BOM 新版本',
  '检查并保存导入草稿',
])

export function isBusinessFormPageTitle(title) {
  return pageTitles.has(title) || title.startsWith('修改资料：')
}

export async function assertBusinessFormPage(page, editor) {
  const fullscreen = editor.getByRole('button', { name: /^(全屏编辑|全屏查看|退出全屏)$/u })
  const desktop = page.viewportSize().width >= 768 && !new URL(page.url()).pathname.startsWith('/m/')
  await fullscreen.waitFor({ state: desktop ? 'visible' : 'hidden' })
  assert.equal(await fullscreen.count(), desktop ? 1 : 0)
  const editorHandle = await editor.elementHandle()
  await page
    .waitForFunction(
      (node) => {
        const body = node.querySelector('.erp-business-form-page__body')
        const visibleList = [...node.parentElement.children].some(
          (child) =>
            child !== node &&
            child.matches('.erp-business-data-table-card') &&
            child.getClientRects().length > 0
        )
        return (
          body &&
          body.scrollWidth - body.clientWidth <= 1 &&
          !visibleList
        )
      },
      editorHandle,
      { timeout: 10_000 }
    )
    .catch(() => {})
  const metrics = await editor.evaluate((node) => {
    const rect = node.getBoundingClientRect()
    const body = node.querySelector('.erp-business-form-page__body')
    const footer = node
      .querySelector('.erp-business-form-page__footer')
      ?.getBoundingClientRect()
    return {
      page: node.matches('.erp-business-form-page:not([hidden])'),
      dialog: Boolean(node.closest('[role="dialog"]')),
      masks: document.querySelectorAll('.ant-modal-mask').length,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      rect: {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      },
      bodyOverflow: body ? body.scrollWidth - body.clientWidth : -1,
      footer: footer ? { top: footer.top, bottom: footer.bottom } : null,
      ancestors: (() => {
        const entries = []
        for (let parent = node; parent && entries.length < 8; parent = parent.parentElement) {
          const style = getComputedStyle(parent)
          const bounds = parent.getBoundingClientRect()
          entries.push({ className: parent.className, height: bounds.height, display: style.display, flex: style.flex, minHeight: style.minHeight, overflow: style.overflow, rows: style.gridTemplateRows })
        }
        return entries
      })(),
      visibleList: [...node.parentElement.children].some(
        (child) =>
          child !== node &&
          child.matches('.erp-business-data-table-card') &&
          child.getClientRects().length > 0
      ),
    }
  })
  assert.equal(metrics.page, true, JSON.stringify(metrics))
  assert.equal(metrics.dialog, false)
  assert.equal(metrics.masks, 0)
  assert.equal(metrics.visibleList, false)
  assert.ok(
    metrics.rect.left >= 0 && metrics.rect.right <= metrics.viewport.width + 1,
    JSON.stringify(metrics)
  )
  assert.ok(
    metrics.bodyOverflow >= 0 && metrics.bodyOverflow <= 1,
    JSON.stringify(metrics)
  )
  assert.ok(
    metrics.footer &&
      metrics.footer.top > metrics.rect.top &&
      metrics.footer.bottom <= metrics.viewport.height + 1,
    JSON.stringify(metrics)
  )
  const inTask = /^\/m\/[a-z_]+\/tasks$/u.test(new URL(page.url()).pathname)
  await editor.getByRole('button', { name: inTask ? '返回办理' : '返回列表', exact: true }).waitFor()
}

export async function closeBusinessFormPage(page, editor) {
  const dirty = (await editor.getAttribute('data-unsaved')) === 'true'
  const inTask = /^\/m\/[a-z_]+\/tasks$/u.test(new URL(page.url()).pathname)
  await editor.getByRole('button', { name: inTask ? '返回办理' : '返回列表', exact: true }).click()
  if (dirty)
    { await page.getByRole('button', { name: '放弃修改', exact: true }).click() }
  await editor.waitFor({ state: 'hidden' })
}
