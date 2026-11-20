import { createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

async function edit(view, element, text) {
  await view.act(async () => {
    element.textContent = text
    element.dispatchEvent(new Event('input', { bubbles: true }))
    await view.runtimeWindow.happyDOM.whenAsyncComplete()
  })
}

test('paper input keeps the focused DOM and caret across a render and uses the current commit', async (t) => {
  const view = await createReactTestHarness(t)
  const { default: PrintEditableText } = await import('./PrintEditableText.jsx')
  const commits = []
  await view.render(createElement(PrintEditableText, {
    value: '原值',
    commitElementValue: () => {},
  }))
  const element = view.container.firstChild
  element.focus()
  await edit(view, element, '正在输入')
  const textNode = element.firstChild
  const selection = document.getSelection()
  selection.collapse(textNode, 2)
  await view.render(createElement(PrintEditableText, {
    value: '原值',
    commitElementValue: (target, options) => commits.push({
      text: target.textContent,
      normalize: options?.normalizeElement === true,
    }),
  }))
  assert.equal(element.textContent, '正在输入')
  assert.equal(element.firstChild, textNode)
  assert.equal(document.activeElement, element)
  assert.equal(selection.anchorNode, textNode)
  assert.equal(selection.anchorOffset, 2)
  await edit(view, element, '继续输入')
  assert.ok(commits.some((commit) => commit.text === '继续输入' && !commit.normalize))
  await view.act(async () => element.blur())
  assert.deepEqual(commits.at(-1), { text: '继续输入', normalize: true })
  await view.render(createElement(PrintEditableText, {
    value: '',
    commitElementValue: () => {},
  }))
  assert.equal(element.textContent, '\u00a0')
  assert.equal(element.dataset.printEmpty, 'true')
})

for (const rich of [false, true]) {
  test(`focused ${rich ? 'rich' : 'plain'} paper text keeps its DOM when the draft value changes`, async (t) => {
    const view = await createReactTestHarness(t)
    const { default: PrintEditableText } = await import('./PrintEditableText.jsx')
    const render = (value) => view.render(createElement(PrintEditableText, {
      value,
      ...(rich ? { html: `<span style="color: red">${value}</span>` } : {}),
      commitElementValue: () => {},
    }))
    await render('原值')
    const editor = view.container.firstChild
    editor.focus()
    await edit(view, editor, '正在输入  ')
    const textNode = editor.firstChild
    document.getSelection().collapse(textNode, 2)
    await render('正在输入')
    assert.equal(editor.textContent, '正在输入  ')
    assert.equal(editor.firstChild, textNode)
    assert.equal(document.getSelection().anchorNode, textNode)
    assert.equal(document.getSelection().anchorOffset, 2)
    await view.act(async () => editor.blur())
    await render('失焦后的新值')
    assert.equal(editor.textContent, '失焦后的新值')
  })
}

for (const kind of ['material', 'processing']) {
  test(`${kind} contract keeps its own single-line and multiline whitespace rules`, async (t) => {
    const view = await createReactTestHarness(t)
    const fields = []
    const clauses = []
    if (kind === 'material') {
      const [{ default: Paper }, { buildMaterialPurchaseContractDraft, computeMaterialPurchaseTotals }] = await Promise.all([
        import('./MaterialPurchaseContractPaper.jsx'),
        import('../../utils/materialPurchaseContractEditor.mjs'),
      ])
      const draft = buildMaterialPurchaseContractDraft()
      await view.render(createElement(Paper, {
        draft,
        totals: computeMaterialPurchaseTotals(draft.lines),
        handleFieldCommit: (key, value) => fields.push({ key, value }),
        handleClauseCommit: (...args) => clauses.push(args.at(-1)),
      }))
    } else {
      const [{ default: Paper }, { createProcessingContractDraft }] = await Promise.all([
        import('./ProcessingContractPaper.jsx'),
        import('../../data/processingContractTemplate.mjs'),
      ])
      await view.render(createElement(Paper, {
        contract: createProcessingContractDraft(),
        onFieldChange: (key, value) => fields.push({ key, value }),
        onClauseChange: (...args) => clauses.push(args.at(-1)),
      }))
    }
    const field = view.container.querySelector(`.erp-${kind}-contract-meta__value`)
    await edit(view, field, '  采购  合同\u00a0  ')
    assert.deepEqual(fields.at(-1), {
      key: 'contractNo',
      value: kind === 'material' ? '采购  合同' : '采购 合同',
    })
    const clause = view.container.querySelector(kind === 'material'
      ? '.erp-material-contract-clause-block__value'
      : '.erp-processing-contract-clauses__editable')
    await edit(view, clause, '  首行\n\n\n末行  ')
    assert.equal(clauses.at(-1), kind === 'material' ? '首行\n\n末行' : '  首行\n\n末行')
    field.focus()
    const enter = new view.runtimeWindow.KeyboardEvent('keydown', {
      key: 'Enter', bubbles: true, cancelable: true, isComposing: true,
    })
    await view.act(async () => field.dispatchEvent(enter))
    assert.equal(enter.defaultPrevented, false, '确认输入法候选词不能作为字段提交')
    assert.equal(document.activeElement, field)
    const webkitEnter = new view.runtimeWindow.KeyboardEvent('keydown', {
      key: 'Enter', keyCode: 229, bubbles: true, cancelable: true,
    })
    await view.act(async () => field.dispatchEvent(webkitEnter))
    assert.equal(webkitEnter.defaultPrevented, false)
    assert.equal(document.activeElement, field)
    await view.act(async () => field.blur())
    assert.equal(field.textContent, fields.at(-1).value, '失焦后的正文与提交草稿使用相同的规范化值')
  })
}

test('engineering single-line text does not end the edit on IME Enter', async (t) => {
  const view = await createReactTestHarness(t)
  const { EditableText } = await import('./EngineeringPrintPrimitives.jsx')
  await view.render(createElement(EditableText, { value: '工程文字', onCommit: () => {} }))
  const editor = view.container.firstChild
  editor.focus()
  const enter = new view.runtimeWindow.KeyboardEvent('keydown', {
    key: 'Enter', bubbles: true, cancelable: true, isComposing: true,
  })
  await view.act(async () => editor.dispatchEvent(enter))
  assert.equal(enter.defaultPrevented, false)
  assert.equal(document.activeElement, editor)
  const webkitEnter = new view.runtimeWindow.KeyboardEvent('keydown', {
    key: 'Enter', keyCode: 229, bubbles: true, cancelable: true,
  })
  await view.act(async () => editor.dispatchEvent(webkitEnter))
  assert.equal(webkitEnter.defaultPrevented, false)
  assert.equal(document.activeElement, editor)
  const commit = new view.runtimeWindow.KeyboardEvent('keydown', {
    key: 'Enter', bubbles: true, cancelable: true,
  })
  await view.act(async () => {
    editor.dispatchEvent(commit)
    await view.runtimeWindow.happyDOM.whenAsyncComplete()
  })
  assert.equal(commit.defaultPrevented, true)
  assert.notEqual(document.activeElement, editor, '普通 Enter 结束编辑后，恢复定时器不能重新抢回焦点')
})

test('engineering paper keeps plain text escaping, blank markers and normalization on blur', async (t) => {
  const view = await createReactTestHarness(t)
  const { EditableText } = await import('./EngineeringPrintPrimitives.jsx')
  const commits = []
  await view.render(createElement(EditableText, {
    value: 'A < B & C',
    onCommit: (value) => commits.push(value),
    blankField: true,
    multiline: true,
    as: 'div',
  }))
  const element = view.container.firstChild
  assert.equal(element.tagName, 'DIV')
  assert.equal(element.textContent, 'A < B & C')
  assert.equal(element.children.length, 0)
  assert.equal(element.dataset.printBlankField, '')
  element.focus()
  await edit(view, element, '\u00a0 首行\n\n\n末行  ')
  assert.equal(commits.at(-1), '首行\n\n末行')
  await view.act(async () => element.blur())
  assert.equal(element.textContent, '首行\n\n末行')
})

test('engineering rich text sanitizes input before committing and preserves reversible red text', async (t) => {
  const view = await createReactTestHarness(t)
  const { EditableText } = await import('./EngineeringPrintPrimitives.jsx')
  const commits = []
  await view.render(createElement(EditableText, {
    value: '<span style="color: red">原文</span>',
    onCommit: (value) => commits.push(value),
    rich: true,
  }))
  const element = view.container.firstChild
  for (const [html, red] of [
    ['<span style="color: red">新文</span>&amp;nbsp;', true],
    ['<span>新文</span>', false],
  ]) {
    await view.act(async () => {
      element.innerHTML = html
      element.dispatchEvent(new Event('input', { bubbles: true }))
      await view.runtimeWindow.happyDOM.whenAsyncComplete()
    })
    const committed = commits.at(-1)
    assert.equal(/color: red/u.test(committed), red)
    assert.ok(committed.includes('新文'))
    assert.doesNotMatch(committed, /(?:amp|nbsp)/u)
    assert.doesNotMatch(element.textContent, /(?:amp|nbsp)/u)
  }
})
