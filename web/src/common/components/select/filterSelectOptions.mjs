export function isEmptyFilterValue(value, emptyValue = '') {
  return value === emptyValue || value === undefined || value === null || value === ''
}

// Query contracts own their empty sentinel. It is not a selectable business value.
export function filterSelectOptions(options = [], emptyValue = '') {
  return options.flatMap((option) => {
    if (option.options) {
      const children = filterSelectOptions(option.options, emptyValue)
      return children.length ? [{ ...option, options: children }] : []
    }
    return isEmptyFilterValue(option.value, emptyValue) ? [] : [option]
  })
}
