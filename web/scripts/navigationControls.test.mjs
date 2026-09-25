import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { ESLint } from 'eslint'
import config from '../eslint.config.js'

const filterChipSource = readFileSync(
  new URL(
    '../src/common/components/navigation/FilterChip.jsx',
    import.meta.url
  ),
  'utf8'
)
const controlAffordanceSource = readFileSync(
  new URL('../src/erp/styles/app/control-affordance.css', import.meta.url),
  'utf8'
)
const mobileProgressSource = readFileSync(
  new URL(
    '../src/erp/mobile/components/MobileProgressPanel.jsx',
    import.meta.url
  ),
  'utf8'
)
const mobileTaskOptionsSource = readFileSync(
  new URL(
    '../src/erp/mobile/components/MobileTaskListOptions.jsx',
    import.meta.url
  ),
  'utf8'
)

test('shared filter buttons use aria state without decorative check icons', () => {
  assert.match(filterChipSource, /aria-pressed=\{selected\}/u)
  assert.doesNotMatch(filterChipSource, /CheckOutlined|filter-chip__check/u)
})

test('shared selection controls use one neutral border token in every state', () => {
  assert.match(controlAffordanceSource, /--erp-control-tab-border:/u)
  assert.match(
    controlAffordanceSource,
    /--erp-slider-shadow:\s*inset 0 0 0 1px var\(--erp-control-tab-border\)/u
  )
  assert.doesNotMatch(
    controlAffordanceSource,
    /(?:ant-tabs-tab-active|erp-filter-chip\[aria-pressed='true'\])[\s\S]{0,160}border-color:\s*var\(--erp-control-accent\)/u
  )
})

test('mobile progress uses an anchored dropdown without desktop date inputs', () => {
  assert.match(mobileProgressSource, /<Popover/u)
  assert.match(mobileProgressSource, /mobile-progress-filter-popover/u)
  assert.equal(
    (mobileProgressSource.match(/<MobileSearchInput/gu) || []).length,
    1,
    '移动进度只能保留一个自由文本搜索入口'
  )
  assert.match(mobileProgressSource, /单号、客户、产品、负责人/u)
  assert.doesNotMatch(mobileProgressSource, /mobile-progress-owner-filter/u)
  assert.match(mobileProgressSource, /IntersectionObserver/u)
  assert.match(mobileProgressSource, /继续下滑加载/u)
  assert.doesNotMatch(mobileProgressSource, /上一页|下一页|mobile-progress-pagination/u)
  assert.doesNotMatch(mobileProgressSource, /<Drawer/u)
  assert.doesNotMatch(mobileProgressSource, /<DateInput/u)
  assert.doesNotMatch(mobileProgressSource, /type="date"/u)
  assert.doesNotMatch(
    mobileProgressSource,
    /mobile-progress-date-picker-popup/u
  )
})

test('shallow mobile task filters use the same anchored dropdown pattern', () => {
  assert.match(mobileTaskOptionsSource, /<Popover/u)
  assert.match(mobileTaskOptionsSource, /mobile-task-filter-popover/u)
  assert.doesNotMatch(mobileTaskOptionsSource, /<Drawer/u)
})

test('navigation lint rejects bypasses while allowing shared controls and ordinary buttons', async () => {
  const { rules } = config.at(-1)
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.jsx'],
        languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
        rules,
      },
    ],
  })
  for (const code of [
    "import { Tabs as PageTabs } from 'antd'",
    "import { Segmented } from 'antd'",
    'const element = <div role="tablist" />',
    'const element = <nav role="tablist" />',
  ]) {
    const [result] = await eslint.lintText(code, {
      filePath: 'guard-fixture.jsx',
    })
    assert.equal(result.errorCount, 1, JSON.stringify(result.messages))
    assert.match(result.messages[0].message, /Sliding/u)
  }
  const [allowed] = await eslint.lintText(
    `
    import { Button } from 'antd'
    const tabs = <SlidingTabList aria-label="视图" />
    const filter = <FilterChip selected>逾期</FilterChip>
    const action = <button type="button">刷新</button>
  `,
    { filePath: 'guard-fixture.jsx' }
  )
  assert.equal(allowed.errorCount, 0)
})
