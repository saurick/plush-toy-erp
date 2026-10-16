function printFields(root) {
  return Array.from(root?.querySelectorAll('[data-print-blank-field]') || [])
}

function printFieldsInPaperOrder(root) {
  const seenRegions = new Set()
  return printFields(root).flatMap((field) => {
    const region = field.closest('[data-print-blank-region]')
    if (!region) return [field]
    if (seenRegions.has(region)) return []
    seenRegions.add(region)
    // 并排区域的 DOM 可能按列组织，只在定位时按纸面行列读取顺序。
    return Array.from(region.querySelectorAll('[data-print-blank-field]'))
      .map((node) => ({
        node,
        box: (node.closest('td, th') || node).getBoundingClientRect(),
      }))
      .sort((left, right) =>
        Math.abs(left.box.top - right.box.top) > 1
          ? left.box.top - right.box.top
          : left.box.left - right.box.left
      )
      .map(({ node }) => node)
  })
}

function isBlank(field) {
  const value = field.querySelector('[contenteditable]') || field
  return !value.textContent.replace(/[\u200b\ufeff]/g, '').trim()
}

export function findBlankPrintFields(root) {
  // 计数只读取当前纸面的字段值，不触发布局测量；合并隐藏格不参与。
  return printFields(root).filter(isBlank)
}

export function findBlankPrintField(
  root,
  previousField = null,
  action = 'next'
) {
  const fields = printFieldsInPaperOrder(root)
  const previousIndex = fields.indexOf(previousField)
  let candidates
  // 按上次字段的纸面位置双向查找，填好后也不会因留白列表缩短而跳过相邻字段。
  switch (action) {
    case 'first':
      candidates = fields
      break
    case 'last':
      candidates = [...fields].reverse()
      break
    case 'previous': {
      const start = previousIndex < 0 ? fields.length : previousIndex
      candidates = [
        ...fields.slice(0, start).reverse(),
        ...fields.slice(start).reverse(),
      ]
      break
    }
    case 'next': {
      const start = previousIndex + 1
      candidates = [...fields.slice(start), ...fields.slice(0, start)]
      break
    }
    default:
      return null
  }
  return candidates.find(isBlank) || null
}
