export async function openDateFilter(page, scope) {
  await scope.locator('.erp-filter-date-trigger').click()
  const dates = page.getByRole('dialog', { name: '选择日期范围', exact: true })
  await dates.waitFor()
  return dates
}

export const dateFilterButton = (dates, label) => dates.getByRole('button', { name: label, exact: true })
export const visibleCalendarDays = (dates) => dates.locator('.erp-filter-date-days:visible').last().getByRole('button')

export async function manualDateInputs(dates) {
  const entry = dateFilterButton(dates, '输入日期')
  if (await entry.isVisible()) await entry.click()
  return {
    from: dates.getByRole('textbox', { name: '开始日期', exact: true }),
    to: dates.getByRole('textbox', { name: '结束日期', exact: true }),
  }
}

export async function applyDateFilter(dates, { from, to }) {
  const fields = await manualDateInputs(dates)
  await fields.from.fill(from)
  await fields.to.fill(to)
  await dateFilterButton(dates, '应用日期').click()
}
