import assert from 'node:assert/strict'

export async function assertProductFieldLayout(scope, peers, { hasImage = true } = {}) {
  const layout = await scope.evaluate((node, selectors) => {
    const row = node.getBoundingClientRect()
    const box = (element) => {
      const { top, left, right, height } = element.getBoundingClientRect()
      return { top: top - row.top, left, right, height }
    }
    const field = node.querySelector('.erp-product-field-control')
    const image = field.querySelector('.erp-task-product-image')
    const controls = [field.querySelector('.ant-select'), ...selectors.map((selector) => {
      const input = node.querySelector(selector)
      if (!input) throw new Error(`找不到同行控件：${selector}`)
      return input.closest('.ant-select, .ant-input-affix-wrapper, .ant-input-number, .ant-picker') || input
    })]
    return { image: image ? box(image) : null, fields: controls.map(box), height: row.height }
  }, peers)
  const [product] = layout.fields
  const detail = JSON.stringify(layout)
  assert.ok(layout.fields.every(({ top }) => Math.abs(top - product.top) <= 1), `同行控件的录入起点应一致：${detail}`)
  assert.equal(Boolean(layout.image), hasImage)
  if (layout.image) {
    const singleLineHeight = Math.min(...layout.fields.map(({ height }) => height))
    const imageCenter = layout.image.top + layout.image.height / 2
    assert.equal(layout.image.height, 48, '保留标准缩略图与占位提示的空间')
    assert.ok(Math.abs(product.top + singleLineHeight / 2 - imageCenter) <= 1, `缩略图应与单行控件上下居中：${detail}`)
  }
  return layout
}
