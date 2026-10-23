import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import postcss from 'postcss'

function styles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? styles(file) : file.endsWith('.css') ? [file] : []
  })
}

test('workbench color declarations reference defined ERP theme variables', () => {
  const sourceRoot = path.resolve(import.meta.dirname, '../..')
  const files = styles(sourceRoot)
  const definitions = new Set(files.flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/(--erp-[\w-]+)\s*:/gu)].map((match) => match[1])))
  const missing = []
  for (const file of styles(path.resolve(import.meta.dirname, '..'))) {
    postcss.parse(readFileSync(file, 'utf8')).walkDecls((declaration) => {
      if (!/color|background|border|shadow|fill|stroke/iu.test(declaration.prop)) return
      for (const match of declaration.value.matchAll(/var\((--erp-[\w-]+)/gu)) {
        if (!definitions.has(match[1])) missing.push({ file: path.relative(sourceRoot, file), line: declaration.source.start.line, variable: match[1] })
      }
    })
  }
  assert.deepEqual(missing, [], '未定义变量及其固定色 fallback 不能冒充已接入主题')
})
