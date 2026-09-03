import assert from 'node:assert/strict'
import test from 'node:test'

import { Window } from 'happy-dom'

import { copyTextToClipboard } from './clipboard.mjs'

test('copyTextToClipboard prefers the browser clipboard API', async () => {
  const copied = []
  const previousNavigator = globalThis.navigator
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText: async (value) => copied.push(value),
      },
    },
  })

  try {
    await copyTextToClipboard('  SO-20260903-001  ')
  } finally {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: previousNavigator,
    })
  }

  assert.deepEqual(copied, ['SO-20260903-001'])
})

test('copyTextToClipboard falls back to a temporary textarea', async () => {
  const runtimeWindow = new Window()
  const previousDocument = globalThis.document
  const previousNavigator = globalThis.navigator
  const commands = []
  runtimeWindow.document.execCommand = (command) => {
    commands.push(command)
    return true
  }
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: runtimeWindow.document,
  })
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {},
  })

  try {
    await copyTextToClipboard('LOT-20260903-001')
  } finally {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: previousDocument,
    })
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: previousNavigator,
    })
  }

  assert.deepEqual(commands, ['copy'])
  assert.equal(runtimeWindow.document.querySelector('textarea'), null)
})

test('copyTextToClipboard rejects blank content', async () => {
  await assert.rejects(copyTextToClipboard('   '), /empty copy text/u)
})
