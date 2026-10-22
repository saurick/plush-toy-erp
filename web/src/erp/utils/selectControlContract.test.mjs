import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { ESLint } from 'eslint'

const web = path.resolve(import.meta.dirname, '../../..')
const lint = new ESLint({ cwd: web })

test('native dropdowns are rejected in business pages and navigation components', async () => {
  for (const filePath of [
    'src/erp/pages/SelectGuardFixture.jsx',
    'src/dev-workbench/pages/SelectGuardFixture.jsx',
    'src/common/components/navigation/SlidingTabs.jsx',
  ]) {
    const [result] = await lint.lintText(
      'export default function Fixture() { return <select aria-label="岗位"><option>仓库</option></select> }\n',
      { filePath }
    )
    assert(
      result.messages.some(({ message }) =>
        message.includes('Use AppSelect / FilterSelect')
      ),
      filePath
    )
  }
})

test('Select 的底层导入只允许共享入口，页面使用 AppSelect', async () => {
  const [result] = await lint.lintText(
    "import { Select } from 'antd'\nexport default function Fixture() { return <Select aria-label=\"岗位\" options={[{ value: 'warehouse', label: '仓库' }]} /> }\n",
    { filePath: 'src/erp/pages/SelectGuardFixture.jsx' }
  )
  assert.equal(
    result.messages.filter(({ message }) =>
      message.includes('统一使用 AppSelect')
    ).length,
    1
  )
  const [shared] = await lint.lintText(
    "import Select from '@/common/components/select/AppSelect'\nexport default function Fixture() { return <Select label=\"岗位\" options={[{ value: 'warehouse', label: '仓库' }]} /> }\n",
    { filePath: 'src/erp/pages/SelectGuardFixture.jsx' }
  )
  assert.equal(shared.messages.filter(({ ruleId }) => ruleId === 'no-restricted-imports').length, 0)
})

test('downloadable prototype uses one dropdown implementation including help', () => {
  const source = readFileSync(
    path.resolve(web, '../docs/product/ui-design/index.html'),
    'utf8'
  )
  assert.doesNotMatch(source, /<select\b/iu)
  assert.match(source, /customElements\.define\('ui-select', UIDesignSelect\)/u)
  assert.match(source, /<ui-select id="mobile-preview-role"/u)
  assert.match(
    source,
    /byId\(id\)\.setOptions\(pickerOptions\(id\), pickerValue\(id\)\)/u
  )
})
