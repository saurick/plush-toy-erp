// Canonical readback clears validation metadata without resetting mounted editors.
// Keep existing empty metadata: rc-field-form can share its empty error/warning arrays.
export function applyBusinessFormReadback(form, values) {
  form.setFields(Object.entries(values).map(([name, value]) => ({
    name,
    value,
    touched: false,
    validating: false,
    ...(form.getFieldError(name).length ? { errors: [] } : {}),
    ...(form.getFieldWarning(name).length ? { warnings: [] } : {}),
  })))
}
