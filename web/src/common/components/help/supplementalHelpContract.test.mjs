import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const sourceRoot = fileURLToPath(new URL('../../../', import.meta.url))
const questionIcon = /QuestionCircle(?:Outlined|Filled|TwoTone)|QuestionOutlined|HelpCircle|CircleHelp|QuestionMarkCircle/u
// These entries open complete guides or navigate to the help center.
const fullHelpEntries = new Map([
  ['erp/components/ERPLayout.jsx', /'help-center':\s*<QuestionCircleOutlined/u],
  ['erp/mobile/components/MobileTaskListScreen.jsx', /navigate\('\/erp\/help-center'/u],
  ['erp/components/help/BusinessContextHelp.jsx', /export function BusinessPageHelpTrigger/u],
  ['dev-workbench/components/quality-gates/QualityGateRunView.jsx', /onClick=\{\(\) => setHelpOpen\(true\)\}/u],
])

test('question icons remain limited to complete help, while supplementary explanations share the information icon', async () => {
  const files = await readdir(sourceRoot, { recursive: true })
  const found = []
  for (const name of files) {
    if (!/\.(?:jsx?|tsx?|mjs)$/u.test(name) || /\.test\./u.test(name)) continue
    const source = await readFile(path.join(sourceRoot, name), 'utf8')
    if (!questionIcon.test(source)) continue
    const expected = fullHelpEntries.get(name)
    assert.ok(expected, `补充说明不能新增问号图标：${name}`)
    assert.match(source, expected, `${name} 仍须保留完整帮助用途`)
    assert.equal((source.match(/<QuestionCircleOutlined\b/gu) || []).length, 1, `${name} 不新增第二处问号说明`)
    if (name.endsWith('BusinessContextHelp.jsx')) {
      assert.doesNotMatch(source.slice(source.indexOf('export function BusinessHelpLabel')), questionIcon)
    }
    found.push(name)
  }
  assert.equal(found.length, fullHelpEntries.size)
  const shared = await readFile(path.join(sourceRoot, 'common/components/help/SupplementalHelp.jsx'), 'utf8')
  assert.match(shared, /icon=\{<InfoCircleOutlined\b/u)
})
