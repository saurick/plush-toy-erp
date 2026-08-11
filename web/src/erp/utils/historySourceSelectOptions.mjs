const HISTORY_SOURCE_GROUPS = Object.freeze([
  Object.freeze({ kind: 'master', label: '基础资料' }),
  Object.freeze({ kind: 'order', label: '业务单据与版本' }),
])

export function buildHistorySourceSelectOptions(sources = []) {
  const availableSources = Array.isArray(sources) ? sources : []
  const knownKinds = new Set(HISTORY_SOURCE_GROUPS.map((group) => group.kind))
  const unknownSource = availableSources.find(
    (source) => !knownKinds.has(source?.kind)
  )
  if (unknownSource) {
    throw new Error(
      `history source select has unknown kind: ${unknownSource.kind || 'empty'}`
    )
  }

  const groups = HISTORY_SOURCE_GROUPS.flatMap((group) => {
    const options = availableSources
      .filter((source) => source.kind === group.kind)
      .map((source) => ({ value: source.key, label: source.label }))
    return options.length > 0 ? [{ label: group.label, options }] : []
  })
  const optionValues = groups.flatMap((group) =>
    group.options.map((option) => option.value)
  )
  if (
    optionValues.length !== availableSources.length ||
    new Set(optionValues).size !== optionValues.length
  ) {
    throw new Error('history source select groups must exactly cover sources')
  }
  return groups
}
