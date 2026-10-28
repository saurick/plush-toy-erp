// Canonical readback clears validation metadata without resetting mounted editors.
// Separate error and warning arrays avoid shared metadata in rc-field-form comparisons.
export function applyBusinessFormReadback(form, values) {
  form.setFields(Object.entries(values).map(([name, value]) => ({
    name,
    value,
    touched: false,
    validating: false,
    errors: [],
    warnings: [],
  })))
}
