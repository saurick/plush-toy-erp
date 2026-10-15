export function createEmptyContactRow() {
  return { is_primary: true }
}

export function withPrimaryContact(rows, selectedIndex) {
  const selected = Number.isInteger(selectedIndex)
    ? selectedIndex
    : rows.findIndex((row) => row?.is_primary === true)
  const primaryIndex = selected >= 0 && selected < rows.length ? selected : 0
  return rows.map((row, index) => ({
    ...row,
    is_primary: index === primaryIndex,
  }))
}

export function contactRowsForForm(contacts = []) {
  const activeContacts = Array.isArray(contacts)
    ? contacts.filter((contact) => contact?.is_active !== false)
    : []
  const rows = activeContacts.map((contact) => ({
    id: contact.id,
    name: contact.name || '',
    title: contact.title || '',
    mobile: contact.mobile || '',
    phone: contact.phone || '',
    email: contact.email || '',
    note: contact.note || '',
    is_primary: contact.is_primary === true,
  }))
  return rows.length > 0 ? withPrimaryContact(rows) : [createEmptyContactRow()]
}

function hasContactPayload(row = {}) {
  return ['name', 'title', 'mobile', 'phone', 'email', 'note'].some((key) =>
    String(row?.[key] ?? '').trim()
  )
}

export function normalizeContactRows(rows = []) {
  const normalized = (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.id || hasContactPayload(row))
    .map((row) => ({
      ...row,
      id: row?.id ? Number(row.id) : undefined,
      name: String(row?.name ?? '').trim(),
      title: String(row?.title ?? '').trim(),
      mobile: String(row?.mobile ?? '').trim(),
      phone: String(row?.phone ?? '').trim(),
      email: String(row?.email ?? '').trim(),
      note: String(row?.note ?? '').trim(),
      is_primary: row?.is_primary === true,
    }))
  return withPrimaryContact(normalized)
}
