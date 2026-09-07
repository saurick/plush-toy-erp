import assert from 'node:assert/strict'

export async function assertEmptyEditorCaret(page, editor, label) {
  const original = await editor.textContent()
  const read = () =>
    editor.evaluate((node) => {
      const selection = node.ownerDocument.getSelection()
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null
      const caret = range?.getBoundingClientRect()
      const box = node.getBoundingClientRect()
      return {
        text: node.textContent.replace(/\u200b/g, '').trim(),
        focused: node.ownerDocument.activeElement === node,
        textAnchor:
          selection?.anchorNode?.nodeType === 3 &&
          node.contains(selection.anchorNode),
        collapsed: selection?.isCollapsed,
        x: caret ? caret.x - box.x : null,
        y: caret ? caret.y - box.y : null,
        caretHeight: caret?.height || 0,
        width: box.width,
        height: box.height,
      }
    })
  const empty = async () => {
    const result = await read()
    assert(
      !result.text &&
        result.focused &&
        result.textAnchor &&
        result.collapsed &&
        result.caretHeight > 0,
      `${label} 空值应保留原生文字光标: ${JSON.stringify(result)}`
    )
    return result
  }

  try {
    await editor.click()
    await editor.press('ControlOrMeta+a')
    await editor.press('Backspace')
    await page.waitForTimeout(180)
    const cleared = await empty()
    for (const key of ['Backspace', 'Delete', 'Backspace', 'Alt+Backspace']) {
      await editor.press(key)
      const current = await empty()
      for (const metric of ['x', 'y', 'caretHeight', 'width', 'height']) {
        assert(
          Math.abs(current[metric] - cleared[metric]) <= 0.75,
          `${label} 空值 ${key} 改变了 ${metric}: ${JSON.stringify({ cleared, current })}`
        )
      }
    }
    await editor.pressSequentially('12')
    assert.equal(
      await editor.textContent(),
      '12',
      `${label} 占位不能混入新文字`
    )
    await editor.press('Backspace')
    assert.equal((await read()).text, '1', `${label} 正常退格应删除文字`)
    await editor.press('ArrowLeft')
    await editor.press('Delete')
    await empty()
    await editor.press('ControlOrMeta+z')
    assert.equal((await read()).text, '1', `${label} 撤销应恢复被删除的文字`)
    await editor.press('ControlOrMeta+Shift+z')
    await empty()
    await editor.pressSequentially('3')
    assert.equal(await editor.textContent(), '3', `${label} 清空后应能继续输入`)
    await editor.press('Backspace')
    const final = await empty()
    await editor.blur()
    // 序号等字段可能在失焦时按业务规则回填，空值光标检查不改这些规则。
    const remainsEmpty = !(await read()).text
    await editor.focus()
    if (remainsEmpty) await empty()
    return final
  } finally {
    await editor.fill(original.replace(/\u200b/g, '').trim())
    await editor.blur()
  }
}

export async function collectEmptyEditorSamples(editors) {
  return editors.evaluateAll((nodes) => {
    const kinds = new Set()
    return nodes.flatMap((node, index) => {
      if (!node.getClientRects().length) return []
      const style = getComputedStyle(node)
      const kind = [
        style.display,
        style.alignItems,
        style.textAlign,
        Boolean(node.closest('td, th')),
      ].join('|')
      if (kinds.has(kind)) return []
      kinds.add(kind)
      return [{ index, kind }]
    })
  })
}
