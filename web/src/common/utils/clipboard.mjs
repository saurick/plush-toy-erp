export async function copyTextToClipboard(value) {
  const text = String(value ?? '').trim()
  if (!text) {
    throw new Error('empty copy text')
  }

  if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  if (typeof document === 'undefined' || !document.body) {
    throw new Error('clipboard unavailable')
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'readonly')
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)

  try {
    textarea.select()
    const copied =
      typeof document.execCommand === 'function' && document.execCommand('copy')
    if (!copied) {
      throw new Error('document copy failed')
    }
  } finally {
    document.body.removeChild(textarea)
  }
}
