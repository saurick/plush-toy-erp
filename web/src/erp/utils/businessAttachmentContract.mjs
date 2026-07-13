export function assertBusinessAttachmentUploadParams(params = {}) {
  if (
    params?.owner_type === 'workflow_task' &&
    (!Number.isSafeInteger(params?.expected_version) ||
      params.expected_version <= 0)
  ) {
    throw new TypeError('workflow attachment expected_version is required')
  }
  return params
}
