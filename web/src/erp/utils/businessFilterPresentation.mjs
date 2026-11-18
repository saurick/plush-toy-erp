export function shouldUseDirectFilterChoices({ options = [], mode, showSearch, onSearch, labelInValue, allowClear, className = '' }) {
  if (mode || showSearch || onSearch || labelInValue || className.includes('--sort')) return false
  const count = options.length + (allowClear && !options.some((option) => option.value == null || option.value === '') ? 1 : 0)
  return count >= 2 && options.every((option) => !option.options && typeof option.label === 'string')
}

// A bookmarked text query remains clearable until the user selects an exact value.
export const savedTextFilterValue = -1

export function withSavedTextFilter(options, text) {
  return text ? [{ value: savedTextFilterValue, label: `名称包含「${text}」`, disabled: true }, ...options] : options
}
