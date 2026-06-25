import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))

const scanDirs = ['pages', 'components', 'mobile'].map((dir) =>
  join(rootDir, dir)
)
const scanFiles = ['utils/referenceSelectOptions.mjs'].map((file) =>
  join(rootDir, file)
)
scanFiles.push(join(rootDir, 'utils/dashboardTaskDisplay.mjs'))

const sourceExtensions = new Set(['.js', '.jsx', '.mjs'])
const forbiddenUserVisibleText = [
  '幂等键',
  '内部引用',
  '内部主键',
  '内部流水',
  '内部批次',
  '内部余额',
  '内部记录',
  '内部来源',
  '客户 #',
  '供应商 #',
  '材料 #',
  '产品 #',
  'SKU #',
  '单位 #',
  '仓库 #',
  '销售订单 #',
  '销售订单行 #',
  '采购订单 #',
  '采购订单行 #',
  '采购入库 #',
  '采购入库单 #',
  '加工合同 ${',
  '出货单 #',
  '入库行 #',
  '批次 #',
  '管理员 #',
  '主键',
  '关联来源必须',
  '填写关联来源记录',
  '缺少出货单 ID',
  '来源选择器',
]

function isSourceFile(filePath) {
  return [...sourceExtensions].some((extension) => filePath.endsWith(extension))
}

function collectSourceFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return collectSourceFiles(path)
    }
    if (!entry.isFile() || !isSourceFile(path) || path.endsWith('.test.mjs')) {
      return []
    }
    return [path]
  })
}

test('业务前端页面不暴露技术实现字段文案', () => {
  const violations = []
  for (const dir of scanDirs) {
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) continue
    for (const filePath of collectSourceFiles(dir)) {
      const content = readFileSync(filePath, 'utf8')
      for (const text of forbiddenUserVisibleText) {
        if (content.includes(text)) {
          violations.push(`${relative(rootDir, filePath)}: ${text}`)
        }
      }
    }
  }
  for (const filePath of scanFiles) {
    if (!statSync(filePath, { throwIfNoEntry: false })?.isFile()) continue
    const content = readFileSync(filePath, 'utf8')
    for (const text of forbiddenUserVisibleText) {
      if (content.includes(text)) {
        violations.push(`${relative(rootDir, filePath)}: ${text}`)
      }
    }
  }

  assert.deepEqual(violations, [])
})
