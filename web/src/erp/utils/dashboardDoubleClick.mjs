export const DASHBOARD_DOUBLE_CLICK_CONTROL_SELECTOR = [
  'a',
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'label',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '.ant-pagination',
  '.ant-picker',
  '.ant-select',
].join(', ')

export function shouldIgnoreDashboardDoubleClick(event) {
  const target = event?.target
  return Boolean(
    target &&
      typeof target.closest === 'function' &&
      target.closest(DASHBOARD_DOUBLE_CLICK_CONTROL_SELECTOR)
  )
}

export function openDashboardItemOnDoubleClick(event, onOpen) {
  if (
    typeof onOpen !== 'function' ||
    shouldIgnoreDashboardDoubleClick(event)
  ) {
    return false
  }
  onOpen()
  return true
}
