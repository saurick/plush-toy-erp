export function isDraftSourceDocument(record) {
  return Boolean(record && record.lifecycle_status === 'draft')
}
