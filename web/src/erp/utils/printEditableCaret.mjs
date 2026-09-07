export function bindPrintEditableCaret(root, { marker = '\u00a0' } = {}) {
  if (!root) return () => {}

  const composing = new WeakSet()
  const getEditor = (event) => {
    const editor = event.target.closest?.('[contenteditable]')
    return editor?.getAttribute('contenteditable') === 'true' &&
      root.contains(editor)
      ? editor
      : null
  }
  const isEmpty = (editor) => !editor.textContent.replace(/\u200b/g, '').trim()
  const ensureCaret = (editor) => {
    if (!isEmpty(editor) || composing.has(editor)) return
    // 空的 flex/grid 编辑器需要文字节点，原生光标才能沿字段的对齐方式定位。
    if (
      editor.childNodes.length !== 1 ||
      editor.firstChild.nodeType !== 3 ||
      editor.textContent !== marker
    ) {
      editor.textContent = marker
    }
    const doc = editor.ownerDocument
    if (doc.activeElement === editor) {
      doc.getSelection()?.collapse(editor.firstChild, marker.length)
    }
  }
  const selectPlaceholder = (editor) => {
    ensureCaret(editor)
    const doc = editor.ownerDocument
    const selection = doc.getSelection()
    if (!selection || doc.activeElement !== editor) return
    const range = doc.createRange()
    range.selectNodeContents(editor)
    selection.removeAllRanges()
    selection.addRange(range)
  }
  const handleEvent = (event) => {
    const editor = getEditor(event)
    if (!editor) return
    if (event.type === 'compositionstart') {
      if (isEmpty(editor)) selectPlaceholder(editor)
      composing.add(editor)
      return
    }
    if (event.type === 'compositionend') {
      composing.delete(editor)
      ensureCaret(editor)
      return
    }
    if (event.isComposing || event.keyCode === 229 || composing.has(editor)) {
      return
    }
    if (!isEmpty(editor)) return

    const deleting =
      (event.type === 'keydown' &&
        (event.key === 'Backspace' || event.key === 'Delete')) ||
      (event.type === 'beforeinput' && event.inputType?.startsWith('delete'))
    if (deleting) {
      event.preventDefault()
      ensureCaret(editor)
    } else if (
      event.type === 'beforeinput' &&
      event.inputType?.startsWith('insert')
    ) {
      // 首次输入替换占位，避免把不可见空格留在正文前后。
      selectPlaceholder(editor)
    } else if (['focusin', 'click', 'input'].includes(event.type)) {
      ensureCaret(editor)
    }
  }
  const events = [
    'keydown',
    'beforeinput',
    'input',
    'focusin',
    'click',
    'compositionstart',
    'compositionend',
  ]
  events.forEach((name) => root.addEventListener(name, handleEvent, true))
  return () => {
    events.forEach((name) => root.removeEventListener(name, handleEvent, true))
  }
}
