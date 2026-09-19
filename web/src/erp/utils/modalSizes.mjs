export const ERP_MODAL_WIDTHS = Object.freeze({
  confirm: 480,
  localAction: 'min(860px, calc(100vw - 32px))',
  recordDetails: 'min(1120px, calc(100vw - 32px))',
  lineItems: 'min(1800px, 94vw, calc(100vw - 32px))',
  columnOrder: 'min(960px, calc(100vw - 32px))',
})

export function resolveBusinessModalWidth(size = 'localAction', width = null) {
  if (!Object.hasOwn(ERP_MODAL_WIDTHS, size)) {
    throw new RangeError(`Unknown business modal size: ${size}`)
  }
  return width ?? ERP_MODAL_WIDTHS[size]
}
