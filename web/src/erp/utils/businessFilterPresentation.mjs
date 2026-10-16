export function shouldUseDirectFilterChoices({ options = [], mode, showSearch, onSearch, labelInValue, allowClear, className = '' }) {
  if (mode || showSearch || onSearch || labelInValue || className.includes('--sort')) return false
  const count = options.length + (allowClear && !options.some((option) => option.value == null || option.value === '') ? 1 : 0)
  return count >= 2 && options.every((option) => !option.options && typeof option.label === 'string')
}
