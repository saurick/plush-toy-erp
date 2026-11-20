export function businessFormSnapshot(values) {
  return JSON.stringify(values || {}, (_key, value) => {
    if (value === '') return undefined
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, value[key]])
      )
    }
    return value
  })
}
