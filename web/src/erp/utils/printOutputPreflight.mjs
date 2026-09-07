export const PRINT_IMAGE_LIMITS = Object.freeze({
  count: 32,
  eachBytes: 5 * 1024 * 1024,
  totalBytes: 16 * 1024 * 1024,
  htmlBytes: 24 * 1024 * 1024,
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
    problem = '有图片超过 5 MB，请缩小图片后再输出。'
  } else if (totalBytes > PRINT_IMAGE_LIMITS.totalBytes) {
    problem = '图片合计超过 16 MB，请减少或缩小图片后再输出。'
  }
  return { count: sources.length, totalBytes, problem }
}

const missing = (value) =>
  !String(value ?? '').trim() || /^未(?:维护|配置|关联)/.test(String(value))

export function getPrintDraftProblems(template, draft = {}) {
  if (draft.printMode === 'blank') return []
  const contract = template?.runtime
  const problems = (contract?.requiredFields || [])
    .filter(([key]) => missing(draft[key]))
    .map(([, label]) => label)
  if (contract?.requiredLineFields?.length) {
    const lines = Array.isArray(draft.lines) ? draft.lines : []
    if (!lines.length) problems.push('至少一行明细')
    lines.forEach((line, index) => {
      for (const [key, label] of contract.requiredLineFields) {
        if (missing(line[key])) problems.push(`第 ${index + 1} 行${label}`)
      }
    })
  }
  return problems
}

export function getPrintOutputProblem(template, draft, paper) {
  const fields = getPrintDraftProblems(template, draft)
  if (fields.length) {
    return `请先补充：${fields.slice(0, 8).join('、')}${fields.length > 8 ? `等 ${fields.length} 项` : ''}。需要打印空表时，请选择“空白模板”。`
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
  const { problem } = inspectPrintImageBudget(root)
  if (problem) throw new Error(problem)
  if (
    new TextEncoder().encode(html).byteLength > PRINT_IMAGE_LIMITS.htmlBytes
  ) {
    throw new Error('打印内容超过单次大小限制，请减少图片或拆分内容后再输出。')
  }
}
