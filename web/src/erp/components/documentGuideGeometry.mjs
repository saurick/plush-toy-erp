const clampPercent = (value) => Math.min(100, Math.max(0, value))

export function measureDocumentGuideRegion(
  frame,
  targets,
  separateTargets = false
) {
  if (!(frame.width > 0 && frame.height > 0)) return null
  const visible = targets.filter((rect) => rect.width > 0 && rect.height > 0)
  if (!visible.length) return null
  const left = clampPercent(
    ((Math.min(...visible.map((rect) => rect.left)) - frame.left) /
      frame.width) *
      100
  )
  const right = clampPercent(
    ((Math.max(...visible.map((rect) => rect.right)) - frame.left) /
      frame.width) *
      100
  )
  const top = clampPercent(
    ((Math.min(...visible.map((rect) => rect.top)) - frame.top) /
      frame.height) *
      100
  )
  const bottom = clampPercent(
    ((Math.max(...visible.map((rect) => rect.bottom)) - frame.top) /
      frame.height) *
      100
  )
  if (!(right > left && bottom > top)) return null
  const region = { left, right, top, bottom }
  if (separateTargets) {
    const fragments = []
    for (const target of [...visible].sort((a, b) => a.top - b.top)) {
      const next = measureDocumentGuideRegion(frame, [target])
      if (!next) continue
      const previous = fragments.at(-1)
      if (
        previous &&
        ((next.top - previous.bottom) / 100) * frame.height <= 1
      ) {
        previous.bottom = Math.max(previous.bottom, next.bottom)
        previous.left = Math.min(previous.left, next.left)
        previous.right = Math.max(previous.right, next.right)
      } else fragments.push(next)
    }
    if (!fragments.length) return null
    region.fragments = fragments
  }
  return region
}

export function layoutDocumentGuideCallouts(regions, height, minGap = 44) {
  if (!(height > 0)) return []
  const callouts = regions.map((region, index) => {
    if (!region) return null
    const anchor =
      region.fragments?.reduce((largest, next) =>
        next.bottom - next.top > largest.bottom - largest.top ? next : largest
      ) || region
    return {
      ...region,
      index,
      side: region.side || 'right',
      center: ((anchor.top + anchor.bottom) / 200) * height,
    }
  })
  for (const side of ['left', 'right']) {
    const group = callouts
      .filter((item) => item?.side === side)
      .sort((a, b) => a.center - b.center)
    if (!group.length) continue
    // 短图允许编号略超出图片上下缘；外侧留白容纳触控区，引线仍指向原区域。
    const extension = Math.max(0, minGap * (group.length - 1) - height) / 2
    const lower = -extension
    const upper = height + extension
    group.forEach((item, index) => {
      item.markerY = Math.max(
        item.center,
        index ? group[index - 1].markerY + minGap : lower
      )
    })
    group.at(-1).markerY = Math.min(group.at(-1).markerY, upper)
    for (let index = group.length - 2; index >= 0; index -= 1) {
      group[index].markerY = Math.min(
        group[index].markerY,
        group[index + 1].markerY - minGap
      )
    }
  }
  return callouts
}
