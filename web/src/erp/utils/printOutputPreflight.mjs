import {
  standardUnitForLabel,
  isQuantityTextWithinUnitPrecision,
} from './unitQuantity.mjs'
import { isUsableImageDimensions } from './imageDisplay.mjs'
import { getContractClauseLimitProblems } from './contractClauseEditor.mjs'
import { NumericContract } from '../../common/consts/numeric.generated.mjs'
import { PrintPolicy } from '../../common/consts/policies.generated.mjs'

export const PRINT_IMAGE_LIMITS = Object.freeze({
  count: PrintPolicy.imageCount,
  eachBytes: PrintPolicy.imageBytes,
  totalBytes: PrintPolicy.imageTotalBytes,
  htmlBytes: PrintPolicy.htmlBytes,
})

export function rasterDataURLBytes(value) {
  const match = String(value || '').match(
    /^data:image\/(?:png|jpe?g|webp|gif);base64,([a-z\d+/=]+)$/i
  )
  if (!match) return 0
  return (
    Math.floor((match[1].length * 3) / 4) -
    (match[1].match(/=+$/)?.[0].length || 0)
  )
}

export function inspectPrintImageBudget(root) {
  const sources = Array.from(root?.querySelectorAll?.('img[src]') || [])
    .map((image) => image.getAttribute('src'))
    .filter(Boolean)
  const sizes = sources.map(rasterDataURLBytes)
  const totalBytes = sizes.reduce((sum, size) => sum + size, 0)
  let problem = ''
  if (sources.length > PRINT_IMAGE_LIMITS.count) {
    problem = `正文和附图展开后共 ${sources.length} 张图片，单次最多 ${PRINT_IMAGE_LIMITS.count} 张。请减少图片或长图分段后再输出。`
  } else if (sizes.some((size) => size > PRINT_IMAGE_LIMITS.eachBytes)) {
    problem = `有图片超过 ${PRINT_IMAGE_LIMITS.eachBytes / (1024 * 1024)} MB，请缩小图片后再输出。`
  } else if (totalBytes > PRINT_IMAGE_LIMITS.totalBytes) {
    problem = `图片合计超过 ${PRINT_IMAGE_LIMITS.totalBytes / (1024 * 1024)} MB，请减少或缩小图片后再输出。`
  }
  return { count: sources.length, totalBytes, problem }
}

const missing = (value) =>
  !String(value ?? '').trim() || /^未(?:维护|配置|关联)/.test(String(value))

export function getPrintDraftProblems(template, draft = {}) {
  if (template?.runtime?.family !== 'contract') return []
  const problems = getContractClauseLimitProblems(draft.clauses)
  const lines = Array.isArray(draft.lines) ? draft.lines : []
  lines.forEach((line, index) => {
    const unit = standardUnitForLabel(line.unit)
    const quantityPrecision = unit?.precision ?? NumericContract.scale
    if (
      !missing(line.quantity) &&
      (!isQuantityTextWithinUnitPrecision(line.quantity, quantityPrecision) ||
        !(Number(line.quantity) > 0))
    ) {
      problems.push(
        unit
          ? `第 ${index + 1} 行数量（${unit.name}最多 ${quantityPrecision} 位小数）`
          : `第 ${index + 1} 行数量（须为正数，最多 ${quantityPrecision} 位小数）`
      )
    }
    if (
      !missing(line.unitPrice) &&
      (!isQuantityTextWithinUnitPrecision(line.unitPrice, NumericContract.scale) ||
        Number(line.unitPrice) < 0)
    ) {
      problems.push(`第 ${index + 1} 行单价（须为非负数，最多 ${NumericContract.scale} 位小数）`)
    }
  })
  return problems
}

export function getPrintOutputProblem(template, draft, paper) {
  const fields = getPrintDraftProblems(template, draft)
  if (fields.length) {
    return `请检查：${fields.slice(0, 8).join('、')}${fields.length > 8 ? `等 ${fields.length} 项` : ''}。内容可以留白，请调整上述问题后再输出。`
  }
  if (paper?.querySelector?.('[data-print-image-error]')) {
    return '有图片无法使用，请更换或清空后再输出。'
  }
  const images = Array.from(paper?.querySelectorAll?.('img[src]') || [])
  if (images.some((image) => image.complete === false)) {
    return '图片仍在加载，请稍后再输出。'
  }
  if (
    images.some(
      (image) => image.complete === true && !isUsableImageDimensions(image)
    )
  ) {
    return '有图片无法使用，请更换或清空后再输出。'
  }
  const callouts = Array.from(
    paper?.querySelectorAll?.(
      '[data-work-instruction-annotation-kind="callout"]'
    ) || []
  )
  if (
    callouts.some(
      (box) =>
        box.clientHeight > 0 &&
        (box.scrollHeight > box.clientHeight + 1 ||
          box.scrollWidth > box.clientWidth + 1)
    )
  ) {
    return '有说明文字超出说明框，请在“标注当前行图片”中扩大说明框或拆分说明后再输出。'
  }
  return inspectPrintImageBudget(paper).problem
}

export function assertPrintSnapshotBudget(root, html) {
  if (root?.querySelector?.('[data-print-image-error]')) {
    throw new Error('有图片无法使用，请更换或清空后再输出。')
  }
  const { problem } = inspectPrintImageBudget(root)
  if (problem) throw new Error(problem)
  if (
    new TextEncoder().encode(html).byteLength > PRINT_IMAGE_LIMITS.htmlBytes
  ) {
    throw new Error('打印内容超过单次大小限制，请减少图片或拆分内容后再输出。')
  }
}
