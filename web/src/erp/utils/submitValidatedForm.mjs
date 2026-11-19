export async function submitValidatedForm(form, onSubmit) {
  try {
    const values = await form.validateFields()
    await onSubmit(values)
  } catch (error) {
    if (!error?.errorFields) throw error
  }
}
