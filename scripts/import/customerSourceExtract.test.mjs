import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { OUTPUT_FILES, readXlsxWorkbook, runExtraction } from './customerSourceExtract.mjs'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '../..')
const cliPath = path.join(testDir, 'customerSourceExtract.mjs')
const rawDir = path.join(repoRoot, 'docs/customers/yoyoosun/raw-source-files')

test('help 输出可运行', () => {
  const result = spawnSync(process.execPath, [cliPath, '--help'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0)
  assert.match(result.stdout, /Yoyoosun customer source extractor/)
  assert.match(result.stdout, /--raw-dir/)
})

test('xlsx reader 正确处理自闭合空单元格后的 shared string', async () => {
  const workbook = await readXlsxWorkbook(
    path.join(rawDir, '26029#夜樱烬色才料明细表2026-1-19.xlsx'),
  )
  const sheet = workbook.sheets.find((item) => item.name === '材料分析明细表')
  assert.ok(sheet)
  const row = sheet.rows.find((item) => item.rowNumber === 7)
  assert.ok(row)
  assert.equal(row.values[4], '左侧衣*1')
  assert.equal(row.values[8], '激光')
})

test('runExtraction 生成本地 source snapshot、配置候选和 no-real-import 边界', async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), 'customer-source-extract-'))
  try {
    const result = await runExtraction({
      rawDir,
      out: outDir,
      customer: 'yoyoosun',
    })

    for (const fileName of OUTPUT_FILES) {
      const content = await readFile(path.join(outDir, fileName), 'utf8')
      assert.ok(content.length > 0, `${fileName} should not be empty`)
    }

    assert.equal(result.sourceSnapshot.canExecuteRealImport, false)
    assert.equal(result.sourceSnapshot.noRealImport, true)
    assert.equal(result.importConfig.boundaries.executesImport, false)
    assert.equal(result.importConfig.boundaries.createsTenant, false)
    assert.ok(result.summary.sourceCount > 5000)
    assert.ok(result.summary.countsByDomain.materials > 100)
    assert.ok(result.summary.countsByDomain.bom > 50)
    assert.ok(result.summary.countsByDomain.purchase_orders > 1000)
    assert.ok(result.summary.countsByDomain.outsourcing > 1000)
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
})
