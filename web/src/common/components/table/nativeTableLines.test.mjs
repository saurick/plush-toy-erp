import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { ESLint } from 'eslint'

const lint = new ESLint({
  cwd: path.resolve(import.meta.dirname, '../../../..'),
  overrideConfig: { rules: { 'import/no-cycle': 'off' } },
})

async function tableBoundaryMessages(source) {
  const [result] = await lint.lintText(source, {
    filePath: 'src/pages/NativeTableFixture.jsx',
  })
  assert.equal(result.fatalErrorCount, 0)
  return result.messages.filter(({ ruleId }) => ruleId === 'no-restricted-syntax')
}

test('native tables explicitly follow appearance or retain a dedicated fixed layout', async () => {
  for (const source of [
    'const table = <table />',
    'const table = <table data-table-lines="unknown" />',
    'const table = <table data-table-lines={mode} />',
    "const table = React.createElement('table')",
    "const table = createElement('table')",
  ]) assert((await tableBoundaryMessages(source)).length > 0, source)
  for (const mode of ['appearance', 'fixed']) {
    assert.deepEqual(
      await tableBoundaryMessages(`const table = <table data-table-lines="${mode}" />`),
      []
    )
  }
})
