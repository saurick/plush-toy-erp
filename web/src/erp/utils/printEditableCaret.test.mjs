import { runInNewContext } from 'node:vm'
import assert from 'node:assert/strict'
import test from 'node:test'
import { Window } from 'happy-dom'
import { bindPrintEditableCaret } from './printEditableCaret.mjs'

function setup(bind = bindPrintEditableCaret) {
  const win = new Window()
  const root = win.document.createElement('section')
  win.document.body.append(root)
  const unbind = bind(root)
  const editor = win.document.createElement('div')
  editor.setAttribute('contenteditable', 'true')
  root.append(editor)
  editor.focus()
  const dispatch = (type, options = {}, target = editor) => {
    const Constructor =
      type === 'keydown'
        ? win.KeyboardEvent
        : type.startsWith('composition')
          ? win.CompositionEvent
          : win.InputEvent
    const event = new Constructor(type, {
      bubbles: true,
      cancelable: true,
      ...options,
    })
    target.dispatchEvent(event)
    return event
  }
  return { win, root, editor, unbind, dispatch }
}

for (const [name, bind] of [
  ['module', bindPrintEditableCaret],
  ['inline runtime', runInNewContext(`(${bindPrintEditableCaret.toString()})`)],
]) {
  test(`${name}: blocks empty deletion while retaining a text caret`, () => {
    const { win, editor, dispatch } = setup(bind)
    editor.innerHTML = '<br>'
    dispatch('input', { inputType: 'deleteContentBackward' })
    assert.equal(editor.textContent, '\u00a0')
    for (const key of ['Backspace', 'Delete']) {
      assert.equal(dispatch('keydown', { key }).defaultPrevented, true)
      assert.equal(win.document.getSelection().anchorNode, editor.firstChild)
    }
    for (const inputType of [
      'deleteContentBackward',
      'deleteContentForward',
      'deleteByCut',
      'deleteWordBackward',
    ]) {
      assert.equal(
        dispatch('beforeinput', { inputType }).defaultPrevented,
        true
      )
    }
    assert.equal(editor.childNodes.length, 1)
  })

  test(`${name}: preserves normal deletion and replaces the placeholder on insertion`, () => {
    const { win, editor, dispatch } = setup(bind)
    editor.textContent = 'AB'
    assert.equal(
      dispatch('keydown', { key: 'Backspace' }).defaultPrevented,
      false
    )
    assert.equal(
      dispatch('beforeinput', { inputType: 'deleteContentBackward' })
        .defaultPrevented,
      false
    )
    assert.equal(editor.textContent, 'AB')
    editor.textContent = ''
    dispatch('input')
    assert.equal(
      dispatch('beforeinput', { inputType: 'insertText', data: '中' })
        .defaultPrevented,
      false
    )
    assert.equal(win.document.getSelection().toString(), '\u00a0')
  })

  test(`${name}: leaves IME composition intact and repairs only after it ends`, () => {
    const { editor, dispatch } = setup(bind)
    dispatch('compositionstart')
    editor.innerHTML = '<br>'
    assert.equal(
      dispatch('keydown', { key: 'Backspace', isComposing: true })
        .defaultPrevented,
      false
    )
    assert.equal(
      dispatch('beforeinput', {
        inputType: 'deleteCompositionText',
        isComposing: true,
      }).defaultPrevented,
      false
    )
    dispatch('input', { inputType: 'insertCompositionText' })
    assert.equal(editor.innerHTML, '<br>')
    dispatch('compositionend')
    assert.equal(editor.textContent, '\u00a0')
  })

  test(`${name}: delegates to new editors, skips readonly descendants and cleans up`, () => {
    const { win, root, editor, unbind, dispatch } = setup(bind)
    const next = win.document.createElement('div')
    next.setAttribute('contenteditable', 'true')
    root.append(next)
    assert.equal(
      dispatch('keydown', { key: 'Delete' }, next).defaultPrevented,
      true
    )
    const label = win.document.createElement('span')
    label.setAttribute('contenteditable', 'false')
    editor.replaceChildren(label)
    assert.equal(
      dispatch('keydown', { key: 'Delete' }, label).defaultPrevented,
      false
    )
    unbind()
    next.textContent = ''
    assert.equal(
      dispatch('keydown', { key: 'Delete' }, next).defaultPrevented,
      false
    )
    assert.equal(next.textContent, '')
  })
}
