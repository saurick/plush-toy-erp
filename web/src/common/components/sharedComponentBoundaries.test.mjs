import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { ESLint } from 'eslint'

// 虚拟文件只核对入口约束；真实模块的循环依赖仍由完整 lint 检查。
const lint = new ESLint({
  cwd: path.resolve(import.meta.dirname, '../../..'),
  overrideConfig: { rules: { 'import/no-cycle': 'off' } },
})
const fixture = 'src/pages/SharedControlFixture.jsx'
async function boundaryMessages(source, filePath = fixture) {
  const [result] = await lint.lintText(source, { filePath })
  assert.equal(result.fatalErrorCount, 0)
  return result.messages.filter(({ ruleId }) =>
    ['no-restricted-imports', 'no-restricted-syntax'].includes(ruleId)
  )
}

test('shared pagination rejects aliases, namespace imports and deep Ant Design paths', async () => {
  for (const source of [
    "import { Pagination as Pager } from 'antd'",
    "import Pager from 'antd/es/pagination'",
    "import Pager from 'antd/lib/pagination/Pagination'",
    "import { Pagination } from 'antd/es/index.js'",
    "import { Pagination } from 'antd/lib'",
    "import * as Controls from 'antd'",
    "import Controls from 'antd/lib/index.js'",
  ]) assert((await boundaryMessages(source)).length > 0, source)
})

test('only the pagination implementation can import Ant Design Pagination', async () => {
  const source = "import { Pagination } from 'antd'"
  const owner = 'src/common/components/pagination/AppPagination.jsx'
  assert.deepEqual(await boundaryMessages(source, owner), [])
  assert((await boundaryMessages(source, owner.replace('.jsx', 'Copy.jsx'))).length > 0)
  assert((await boundaryMessages(source, 'src/common/components/navigation/SlidingTabs.jsx')).length > 0)
})

test('the shared pager and basic Ant Design controls remain available', async () => {
  assert.deepEqual(await boundaryMessages(`
    import Pagination from '@/common/components/pagination/AppPagination'
    import { Button, Input, Select, Drawer, Popover } from 'antd'
  `), [])
})
