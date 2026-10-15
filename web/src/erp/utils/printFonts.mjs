export const PRINT_FONT_FAMILIES = [
  'Noto Sans SC Variable',
  'Noto Serif SC Variable',
]
export const PRINT_FONT_LIMITS = Object.freeze({
  count: 128,
  eachBytes: 256 * 1024,
  totalBytes: 2 * 1024 * 1024,
})

export function unicodeRangeContainsText(range, text) {
  if (!range) return true
  const intervals = range.split(',').map((item) => {
    const value = item.trim().replace(/^U\+/i, '')
    if (value.includes('?')) {
      return [
        parseInt(value.replaceAll('?', '0'), 16),
        parseInt(value.replaceAll('?', 'F'), 16),
      ]
    }
    const [start, end = start] = value.split('-')
    return [parseInt(start, 16), parseInt(end, 16)]
  })
  return Array.from(text).some((character) =>
    intervals.some(
      ([start, end]) =>
        character.codePointAt(0) >= start && character.codePointAt(0) <= end
    )
  )
}

function fontRules(document) {
  const result = []
  const collect = (rules, baseURL) =>
    Array.from(rules || []).forEach((rule) => {
      if (rule.type === 5) result.push({ rule, baseURL })
      else if (rule.cssRules) collect(rule.cssRules, baseURL)
    })
  for (const sheet of Array.from(document.styleSheets || [])) {
    try {
      collect(sheet.cssRules, sheet.href || document.baseURI)
    } catch {
      /* unrelated cross-origin stylesheets */
    }
  }
  return result
}

// The same bundled, versioned font faces drive browser geometry and the offline PDF snapshot.
export async function preparePrintFonts(element) {
  const document = element?.ownerDocument
  const view = document?.defaultView
  if (!view?.getComputedStyle || !document.fonts) return ''
  const families = new Set()
  for (const node of [element, ...element.querySelectorAll('*')]) {
    const family = view.getComputedStyle(node).fontFamily
    PRINT_FONT_FAMILIES.filter((name) => family.includes(name)).forEach(
      (name) => families.add(name)
    )
  }
  if (!families.size) return ''
  const text = Array.from(new Set(element.textContent || ' ')).join('')
  const selected = fontRules(document).filter(({ rule }) => {
    const family = rule.style
      .getPropertyValue('font-family')
      .replace(/['"]/g, '')
    return (
      families.has(family) &&
      unicodeRangeContainsText(
        rule.style.getPropertyValue('unicode-range'),
        text
      )
    )
  })
  if (!selected.length || selected.length > PRINT_FONT_LIMITS.count) {
    throw new Error('打印字体尚未就绪，请刷新页面后重试。')
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    let totalBytes = 0
    const chunks = []
    // Bound concurrent network and memory use even for a page containing many uncommon characters.
    for (const { rule, baseURL } of selected) {
      const source = rule.style
        .getPropertyValue('src')
        .match(/url\(["']?([^"')]+)["']?\)/)?.[1]
      const url = new URL(source || '', baseURL)
      if (
        url.origin !== new URL(document.baseURI).origin ||
        !/\.woff2(?:\?|$)/.test(url.href)
      ) {
        throw new Error('打印字体来源无效，请刷新页面后重试。')
      }
      const response = await view.fetch(url.href, {
        signal: controller.signal,
        credentials: 'same-origin',
      })
      if (
        !response.ok ||
        Number(response.headers.get('content-length')) >
          PRINT_FONT_LIMITS.eachBytes
      ) {
        throw new Error('打印字体加载失败，请刷新页面后重试。')
      }
      const reader = response.body?.getReader()
      let bytes
      if (reader) {
        let length = 0
        const parts = []
        try {
          while (true) {
            const part = await reader.read()
            if (part.done) break
            length += part.value.length
            if (length > PRINT_FONT_LIMITS.eachBytes) {
              await reader.cancel()
              throw new Error('打印字体超出单次大小限制，请重试。')
            }
            parts.push(part.value)
          }
        } finally {
          reader.releaseLock()
        }
        bytes = new Uint8Array(length)
        let offset = 0
        parts.forEach((part) => {
          bytes.set(part, offset)
          offset += part.length
        })
      } else {
        bytes = new Uint8Array(await response.arrayBuffer())
      }
      totalBytes += bytes.length
      if (
        bytes.length > PRINT_FONT_LIMITS.eachBytes ||
        totalBytes > PRINT_FONT_LIMITS.totalBytes ||
        String.fromCharCode(...bytes.slice(0, 4)) !== 'wOF2'
      ) {
        throw new Error('打印字体超出单次大小限制，请减少内容后重试。')
      }
      let binary = ''
      for (let index = 0; index < bytes.length; index += 8192) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 8192))
      }
      chunks.push(
        rule.cssText.replace(
          /url\([^)]*\)/,
          `url("data:font/woff2;base64,${view.btoa(binary)}")`
        )
      )
    }
    await Promise.race([
      Promise.all(
        Array.from(families, (family) =>
          document.fonts.load(`400 12px "${family}"`, text)
        )
      ),
      new Promise((_, reject) => {
        const abort = () =>
          reject(
            Object.assign(new Error('font loading timed out'), {
              name: 'AbortError',
            })
          )
        if (controller.signal.aborted) abort()
        else controller.signal.addEventListener('abort', abort, { once: true })
      }),
    ])
    return chunks.join('\n')
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('打印字体加载超时，请重试。')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
