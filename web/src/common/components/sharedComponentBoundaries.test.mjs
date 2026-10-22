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

test('shared controls reject named aliases, namespace imports and deep Ant Design paths', async () => {
  for (const source of [
    "import { Select as Choice } from 'antd'",
    "import Choice from 'antd/es/select'",
    "import { Table as Grid } from 'antd'",
    "import { Pagination as Pager } from 'antd'",
    "import { Modal as Popup } from 'antd'",
    "import { Tabs, Segmented } from 'antd'",
    "import { message, notification } from 'antd'",
    "import * as Controls from 'antd'",
    "import Grid from 'antd/es/table'",
    "import Pager from 'antd/es/pagination'",
    "import Pager from 'antd/lib/pagination/Pagination'",
    "import Popup from 'antd/lib/modal/Modal'",
    "import Tabs from 'antd/es/tabs'",
    "import { Modal } from 'antd/es/index.js'",
    "import { Table } from 'antd/lib'",
    "import * as Controls from 'antd/lib/index.js'",
    "import Controls from 'antd/lib/index.js'",
  ]) {
    assert((await boundaryMessages(source)).length > 0, source)
  }
})

test('only each exact implementation can import its own protected primitive', async () => {
  for (const [name, owner] of [
    ['Select', 'src/common/components/select/AppSelect.jsx'],
    ['Table', 'src/common/components/table/AppTable.jsx'],
    ['Pagination', 'src/common/components/pagination/AppPagination.jsx'],
    ['Modal', 'src/common/components/modal/AppModal.jsx'],
    ['Tabs', 'src/common/components/navigation/SlidingTabs.jsx'],
    ['Segmented', 'src/common/components/navigation/SlidingSegmented.jsx'],
  ]) {
    assert.deepEqual(await boundaryMessages(`import { ${name} } from 'antd'`, owner), [])
    assert((await boundaryMessages(`import { ${name} } from 'antd'`, owner.replace('.jsx', 'Copy.jsx'))).length > 0)
    const other = name === 'Table' ? 'Modal' : 'Table'
    assert((await boundaryMessages(`import { ${other} } from 'antd'`, owner)).length > 0)
  }
})

test('approved entries and unwrapped basic Ant Design controls remain available', async () => {
  assert.deepEqual(await boundaryMessages(`
    import Table from '@/common/components/table/AppTable'
    import Pagination from '@/common/components/pagination/AppPagination'
    import Modal from '@/common/components/modal/AppModal'
    import Tabs from '@/common/components/navigation/SlidingTabs'
    import Select from '@/common/components/select/AppSelect'
    import { Button, Input, Drawer, Popover } from 'antd'
    import { Button as BasicButton } from 'antd/es/index.js'
    import { message, modal, notification } from '@/common/utils/antdApp'
  `), [])
  assert.deepEqual(await boundaryMessages("import Modal from '@/erp/components/business-list/BusinessModal'", 'src/erp/pages/Fixture.jsx'), [])
  for (const source of [
    "import Modal from '@/common/components/modal/AppModal'",
    "import Modal from '../../common/components/modal/AppModal.jsx'",
  ]) assert((await boundaryMessages(source, 'src/erp/pages/Fixture.jsx')).length > 0, source)
  assert.deepEqual(await boundaryMessages("import Modal from '@/common/components/modal/AppModal'", 'src/erp/components/business-list/BusinessModal.jsx'), [])
  assert.deepEqual(await boundaryMessages("import { Modal } from 'antd/es/index.js'", 'src/common/components/modal/AppModal.jsx'), [])
  assert((await boundaryMessages("import { Modal } from 'antd'", 'src/erp/components/business-list/BusinessModal.jsx')).length > 0)
  assert((await boundaryMessages("import Modal from '@/common/components/modal/AppModal'", 'src/erp/components/business-list/BusinessModalCopy.jsx')).length > 0)
})

test('native controls cannot bypass shared selection and overlay behavior', async () => {
  for (const source of [
    'const control = <select />',
    "const control = document.createElement('select')",
    "const control = React.createElement('select')",
    'const control = <dialog />',
    "const control = createElement('dialog')",
    'const control = <div role="tablist" />',
  ]) assert((await boundaryMessages(source)).length > 0, source)
  assert.deepEqual(await boundaryMessages('const control = <div role="tablist" />', 'src/common/components/navigation/SlidingTabList.jsx'), [])
  assert.deepEqual(await boundaryMessages('const control = <dialog />', 'src/erp/components/SessionRecoveryDialog.jsx'), [])
  assert((await boundaryMessages('const control = <select />', 'src/erp/components/SessionRecoveryDialog.jsx')).length > 0)
  assert.deepEqual(await boundaryMessages("const fixture = document.createElement('dialog')", 'src/erp/components/ERPLayout.test.mjs'), [])
})
