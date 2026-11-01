export function activeFormSectionIndex(
  tops,
  scrollTop,
  clientHeight,
  scrollHeight
) {
  if (!tops.length) return -1
  const maxScroll = Math.max(0, scrollHeight - clientHeight)
  const tailStart = Math.max(0, maxScroll - clientHeight)
  const tailProgress = maxScroll > tailStart
    ? Math.min(1, Math.max(0, (scrollTop - tailStart) / (maxScroll - tailStart)))
    : 0
  // 末屏的短分区无法滚到顶部，随剩余滚动距离逐步下移阅读线，依次经过各分区。
  const readingTop = scrollTop + 28 +
    Math.max(0, tops.at(-1) - maxScroll) * tailProgress
  let active = 0
  for (let index = 0; index < tops.length; index += 1) {
    if (tops[index] <= readingTop) active = index
    else break
  }
  return active
}
