export const BUSINESS_FORM_READING_MARGIN = 28

export function activeFormSectionIndex(
  tops,
  scrollTop,
  clientHeight,
  scrollHeight,
  readingInset = 0
) {
  if (!tops.length) return -1
  // 固定导航裁切阅读区，不增加真实滚动距离或末屏进度。
  const readingTops = tops.map((top) => top - readingInset)
  const readingHeight = Math.max(0, clientHeight - readingInset)
  const contentHeight = Math.max(0, scrollHeight - readingInset)
  const maxScroll = Math.max(0, contentHeight - readingHeight)
  const tailStart = Math.max(0, maxScroll - readingHeight)
  const tailProgress = maxScroll > BUSINESS_FORM_READING_MARGIN && maxScroll > tailStart
    ? Math.min(1, Math.max(0, (scrollTop - tailStart) / (maxScroll - tailStart)))
    : 0
  // 末屏的短分区无法滚到顶部，随剩余滚动距离逐步下移阅读线，依次经过各分区。
  const readingTop = scrollTop + BUSINESS_FORM_READING_MARGIN +
    Math.max(0, readingTops.at(-1) - maxScroll) * tailProgress
  let active = 0
  for (let index = 0; index < readingTops.length; index += 1) {
    if (readingTops[index] <= readingTop) active = index
    else break
  }
  return active
}
