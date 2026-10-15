export function activeFormSectionIndex(
  tops,
  scrollTop,
  clientHeight,
  scrollHeight
) {
  if (!tops.length) return -1
  if (
    scrollHeight > clientHeight + 2 &&
    scrollTop + clientHeight >= scrollHeight - 2
  ) {
    return tops.length - 1
  }
  let active = 0
  for (let index = 0; index < tops.length; index += 1) {
    if (tops[index] <= scrollTop + 28) active = index
    else break
  }
  return active
}
