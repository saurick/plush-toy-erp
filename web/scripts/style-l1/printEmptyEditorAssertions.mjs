import assert from 'node:assert/strict'

export async function measureEmptyEditorHints(editors) {
  return editors.evaluateAll((nodes) => {
    const cacheName = '__plushStyleL1EmptyHintMetricCache'
    const metricCache =
      globalThis[cacheName] instanceof Map ? globalThis[cacheName] : new Map()
    globalThis[cacheName] = metricCache

    return nodes.map((node) => {
      const style = getComputedStyle(node)
      const hint = getComputedStyle(node, '::before')
      const fieldBox = node.getBoundingClientRect()
      const effectiveScaleX = node.clientWidth
        ? fieldBox.width / node.clientWidth
        : 1
      const effectiveScaleY = node.clientHeight
        ? fieldBox.height / node.clientHeight
        : 1
      const metricKey = JSON.stringify([
        node.tagName,
        node.className,
        hint.content,
        hint.width,
        hint.fontFamily,
        hint.fontSize,
        hint.fontWeight,
        hint.letterSpacing,
        hint.lineHeight,
        hint.lineBreak,
        hint.whiteSpace,
        hint.overflowWrap,
        hint.wordBreak,
        style.zoom,
        effectiveScaleX,
        effectiveScaleY,
        globalThis.devicePixelRatio,
      ])
      let metrics = metricCache.get(metricKey)
      if (!metrics) {
        const probe = document.createElement('span')
        Object.assign(probe.style, {
          position: 'fixed',
          left: '-10000px',
          top: '0',
          visibility: 'hidden',
          display: 'block',
          boxSizing: 'content-box',
          width: hint.width,
          fontFamily: hint.fontFamily,
          fontSize: hint.fontSize,
          fontWeight: hint.fontWeight,
          letterSpacing: hint.letterSpacing,
          lineHeight: hint.lineHeight,
          lineBreak: hint.lineBreak,
          whiteSpace: hint.whiteSpace,
          overflowWrap: hint.overflowWrap,
          wordBreak: hint.wordBreak,
          zoom: style.zoom,
        })
        probe.textContent = '点击填写'
        // 字体在缩放时会按实际像素取整，探针必须与提示处于相同的缩放上下文。
        node.parentElement.append(probe)
        const probeBox = probe.getBoundingClientRect()
        const zoom =
          probeBox.width / Number.parseFloat(getComputedStyle(probe).width) || 1
        const range = document.createRange()
        range.selectNodeContents(probe)
        metrics = {
          requiredHeight: probeBox.height / zoom,
          textWidth: Math.max(
            ...[...range.getClientRects()].map((r) => r.width / zoom)
          ),
        }
        probe.remove()
        if (metricCache.size >= 512) metricCache.clear()
        metricCache.set(metricKey, metrics)
      }
      const width = Number.parseFloat(hint.width)
      const height = Number.parseFloat(hint.height)
      const empty = !node.textContent.replace(/\u200b/g, '').trim()
      return {
        className: node.className,
        empty,
        focused: document.activeElement === node,
        display: style.display,
        fieldWidth: node.clientWidth,
        fieldHeight: node.clientHeight,
        minWidth: style.minWidth,
        flex: style.flex,
        content: hint.content,
        width,
        height,
        requiredHeight: metrics.requiredHeight,
        textWidth: metrics.textWidth,
        textFits:
          !empty ||
          (hint.content === '"点击填写"' &&
            width > 0 &&
            metrics.requiredHeight <= height + 0.1 &&
            metrics.textWidth <= width + 0.1 &&
            height <= node.clientHeight + 1),
      }
    })
  })
}

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
