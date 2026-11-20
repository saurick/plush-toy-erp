// Presentation only: keep original indices, empty drafts and non-adjacent runs independent.
export function adjacentLineItemRuns(items, identity) {
  const runs = []
  items.forEach((item, index) => {
    const key = identity(item)
    const previous = runs.at(-1)
    if (key !== undefined && key !== null && key !== '' && previous?.key === key) {
      previous.count += 1
    } else {
      runs.push({ key, start: index, count: 1 })
    }
  })
  return runs
}
