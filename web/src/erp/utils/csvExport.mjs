function shouldProtectCSVText(value) {
  const firstCode = value.charCodeAt(0)
  if (firstCode === 9 || firstCode === 13) return true

  let index = 0
  while (index < value.length && value.charCodeAt(index) <= 32) {
    index += 1
  }
  const firstMeaningfulCharacter = value[index]
  return (
    firstMeaningfulCharacter === '=' ||
    firstMeaningfulCharacter === '+' ||
    firstMeaningfulCharacter === '-' ||
    firstMeaningfulCharacter === '@'
  )
}

export function protectCSVCellValue(value) {
  if (typeof value === 'string' && shouldProtectCSVText(value)) {
    return `'${value}`
  }
  return String(value ?? '')
}

export function escapeCSVCell(value) {
  const text = protectCSVCellValue(value)
  if (/[",\n\r]/u.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function buildCSVText(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => (Array.isArray(row) ? row : []).map(escapeCSVCell).join(','))
    .join('\n')
}

export function downloadCSVRows({ filename, rows }) {
  const csv = buildCSVText(rows)
  const blob = new Blob([`\uFEFF${csv}`], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    URL.revokeObjectURL(url)
  }
}
