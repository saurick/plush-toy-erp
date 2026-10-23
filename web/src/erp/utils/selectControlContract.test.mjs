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
  for (const tag of source.matchAll(/<ui-select\b[^>]*>/gu)) {
    if (/history-source|data-mobile-sort|data-dev-project-example|data-dev-project-catalog|id="rh-/u.test(tag[0])) {
      assert.doesNotMatch(tag[0], /data-required-selection/u, tag[0])
    }
  }
})

test('关闭清空须就地说明操作参数为什么没有合法空态', async () => {
  for (const [props, errors] of [
    ['allowClear={false}', 1],
    ['allowClear={false /* 不可清空：金额统计必须明确单一币种，不能混加不同币种。 */}', 0],
    ['allowClear={loading ? false : true}', 0],
  ]) {
    const [result] = await lint.lintText(
      `import Select from '@/common/components/select/AppSelect'\nexport default function Fixture({ loading }) { return <Select label="统计币种" ${props} /> }\n`,
      { filePath: 'src/erp/pages/SelectGuardFixture.jsx' }
    )
    assert.equal(result.messages.filter(({ ruleId }) => ruleId === 'select-controls/clear-exception').length, errors)
  }
  const [result] = await lint.lintText('export const props = { allowClear: false }\n', { filePath: 'src/erp/utils/selectProps.mjs' })
  assert.equal(result.messages.filter(({ ruleId }) => ruleId === 'select-controls/clear-exception').length, 1)
})

test('下拉清空规则不干预普通输入框的清空配置', async () => {
  const [result] = await lint.lintText(
    'import { Input } from \'antd\'\nexport default function Fixture() { return <Input allowClear={false} /> }\n',
    { filePath: 'src/erp/pages/InputGuardFixture.jsx' }
  )
  assert.equal(result.messages.filter(({ ruleId }) => ruleId === 'select-controls/clear-exception').length, 0)
})

test('下拉用途前缀不重复已有可见标签', async () => {
  for (const [markup, errors] of [
    ['<label>显示比例<span><Select label="显示比例" /></span></label>', 1],
    ['<Form.Item label="单位"><Select label={"单位"} /></Form.Item>', 1],
    ['<label>显示比例：<Select placeholder="显示比例" aria-label="显示比例" /></label>', 0],
    ['<Form.Item label="单位"><Select placeholder="请选择单位" /></Form.Item>', 0],
    ['<Select label="显示比例" />', 0],
    ['<label>显示比例<Select label={dynamicLabel} /></label>', 0],
  ]) {
    const [result] = await lint.lintText(
      `export default function Fixture() { return ${markup} }\n`,
      { filePath: 'src/erp/pages/SelectGuardFixture.jsx' }
    )
    assert.equal(result.messages.filter(({ ruleId }) => ruleId === 'select-controls/duplicate-label').length, errors, markup)
  }
})
