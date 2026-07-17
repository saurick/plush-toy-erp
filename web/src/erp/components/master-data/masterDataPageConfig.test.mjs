import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('./masterDataPageConfig.mjs', import.meta.url),
  'utf8'
)

test('default plush process suggestions show sewing before handwork without becoming a route', () => {
  assert.match(
    source,
    /DEFAULT_PLUSH_PROCESS_NAMES = \['查货', '车缝', '手工', '包装'\]/u
  )
  assert.match(
    source,
    /DEFAULT_PLUSH_PROCESS_CATEGORIES = \[\s*'查货',\s*'车缝',\s*'手工',\s*'包装'/u
  )
  const sewingIndex = source.indexOf("'车缝'")
  const handworkIndex = source.indexOf("'手工'")
  assert.notEqual(sewingIndex, -1)
  assert.notEqual(handworkIndex, -1)
  assert(
    sewingIndex < handworkIndex,
    '默认加工环节建议必须先展示车缝，再展示手工'
  )
  assert.match(source, /排序只影响列表展示，不定义前后工序/u)
  assert.match(source, /默认展示车缝在手工前，但不管理完整工艺路线/u)
})
