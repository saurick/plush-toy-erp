import assert from 'node:assert/strict'

export function isGreenFocusColor(color) {
  const match = String(color || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) return false
  const [, red, green, blue] = match.map(Number)
  return green > red && green >= blue
}

export function isDarkControlBackground(color) {
  const match = String(color || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) return false
  const [, red, green, blue] = match.map(Number)
  return red <= 32 && green <= 44 && blue <= 64
}

export function isLightReadonlyDisabledBackground(color) {
  const match = String(color || '').match(
    /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([.\d]+)\)/i
  )
  if (!match) return false
  const [, red, green, blue, alpha] = match
  return (
    Number(red) <= 16 &&
    Number(green) <= 16 &&
    Number(blue) <= 16 &&
    Number(alpha) > 0 &&
    Number(alpha) <= 0.08
  )
}

export function isDarkNeutralBorderColor(color) {
  const match = String(color || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) return false
  const [, red, green, blue] = match.map(Number)
  return red >= 45 && green >= 55 && blue >= 70 && blue >= red
}

export function isBluePrimaryColor(color) {
  const match = String(color || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) return false
  const [, red, green, blue] = match.map(Number)
  return blue >= 140 && blue > red * 1.25 && blue >= green
}

export function isWarningBorderColor(color) {
  const match = String(color || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) return false
  const [, red, green, blue] = match.map(Number)
  return red >= 120 && green >= 70 && green <= 160 && blue <= 90 && red >= green
}

export function isLightSurfaceColor(color) {
  const rgb = parseRgb(color)
  if (!rgb) return false
  return rgb[0] >= 220 && rgb[1] >= 220 && rgb[2] >= 220
}

export function assertReadableOnBackground(foreground, background, message) {
  const color = parseRgb(foreground)
  const bg = parseRgb(background)
  assert(
    color && bg,
    `${message}: ${JSON.stringify({ foreground, background })}`
  )
  const ratio = getContrastRatio(color, bg)
  assert(
    ratio >= 4.5,
    `${message}: ${JSON.stringify({
      foreground,
      background,
      ratio: Number(ratio.toFixed(2)),
    })}`
  )
}

export function assertReadableOnDark(foreground, background, message) {
  const color = parseRgb(foreground)
  const bg = parseRgb(background)
  assert(
    color && bg,
    `${message}: ${JSON.stringify({ foreground, background })}`
  )
  const ratio = getContrastRatio(color, bg)
  assert(
    ratio >= 3,
    `${message}: ${JSON.stringify({
      foreground,
      background,
      ratio: Number(ratio.toFixed(2)),
    })}`
  )
}

export function hasBlueFocusRing(value) {
  const normalized = String(value || '')
  return (
    normalized.includes('37, 99, 235') ||
    normalized.includes('22, 119, 255') ||
    normalized.includes('rgb(37 99 235') ||
    normalized.includes('rgb(22 119 255')
  )
}

export function assertNoBlueFocusStyle(metrics, scenarioName) {
  assert(
    !hasBlueFocusRing(metrics.boxShadow) &&
      !hasBlueFocusRing(metrics.sourceBoxShadow) &&
      !hasBlueFocusRing(metrics.borderColor) &&
      !hasBlueFocusRing(metrics.sourceBorderColor),
    `${scenarioName} ${metrics.label} focus 仍残留蓝色 ring 或边框: ${JSON.stringify(metrics)}`
  )
}

export function isNeutralModalControlBorderColor(color) {
  const rgb = parseRgb(color)
  if (!rgb) return false
  const [red, green, blue] = rgb
  const maxChannelGap = Math.max(
    Math.abs(red - green),
    Math.abs(red - blue),
    Math.abs(green - blue)
  )
  return red >= 190 && red <= 225 && maxChannelGap <= 4
}

export function isTailwindFormsResetBorderColor(color) {
  const normalized = String(color || '').replaceAll(' ', '')
  return normalized === 'rgb(107,114,128)' || normalized === 'rgba(0,0,0,0.88)'
}

export function isAcceptedFocusBorder(metrics) {
  if (metrics.skipBorderColor) return true
  if (metrics.allowTransparentBorder) {
    return (
      isGreenFocusColor(metrics.borderColor) ||
      isTransparentFocusColor(metrics.borderColor)
    )
  }
  return isGreenFocusColor(metrics.borderColor)
}

export function isTransparentFocusColor(color) {
  return (
    color === 'transparent' ||
    String(color || '').replaceAll(' ', '') === 'rgba(0,0,0,0)'
  )
}

export function hasGreenDominantInteractivePaint(metric) {
  return [
    metric.backgroundColor,
    metric.borderColor,
    metric.borderTopColor,
    metric.boxShadow,
    metric.outlineColor,
  ].some((value) => containsGreenDominantColor(value))
}

export function containsGreenDominantColor(value) {
  const matches = String(value || '').matchAll(
    /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/gi
  )
  for (const match of matches) {
    const red = Number(match[1])
    const green = Number(match[2])
    const blue = Number(match[3])
    const alpha = match[4] === undefined ? 1 : Number(match[4])
    if (alpha <= 0.05) continue
    if (green >= 72 && green > red * 1.18 && green > blue * 1.08) {
      return true
    }
  }
  return false
}

export function getContrastRatio(foreground, background) {
  const lighter = Math.max(getLuminance(foreground), getLuminance(background))
  const darker = Math.min(getLuminance(foreground), getLuminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

export function parseRgb(value) {
  const match = String(value || '').match(
    /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/
  )
  if (!match) return null
  if (match[4] !== undefined && Number(match[4]) === 0) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function getLuminance([red, green, blue]) {
  const values = [red, green, blue].map((value) => {
    const channel = value / 255
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  })
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
}

export function isTransparentColor(color) {
  return (
    String(color || '').replaceAll(' ', '') === 'rgba(0,0,0,0)' ||
    String(color || '').trim() === 'transparent'
  )
}
