import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { ESLint } from 'eslint'

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

const mobileFilterSource = readFileSync(
  new URL(
    '../src/erp/mobile/components/MobileFilterPopover.jsx',
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

test('semantic interactive controls expose pointer and disabled feedback', () => {
  for (const selector of [
    'button:not(:disabled)',
    "[role='menuitem']:not([aria-disabled='true'])",
    "[role='option']:not([aria-disabled='true'])",
    "[role='tab']:not([aria-disabled='true'])",
  ]) {
    assert(controlAffordanceSource.includes(selector), selector)
  }
  assert.match(
    controlAffordanceSource,
    /\)\s*\{\s*cursor:\s*pointer;\s*\}/u
  )
  assert.match(
    controlAffordanceSource,
    /\[role='menuitem'\]\[aria-disabled='true'\][\s\S]*?cursor:\s*not-allowed;/u
  )
})

test('mobile progress uses an anchored dropdown without desktop date inputs', () => {
  assert.match(mobileProgressSource, /<MobileFilterPopover/u)
  assert.match(mobileFilterSource, /<Popover/u)
  assert.equal(
    (mobileProgressSource.match(/<MobileSearchInput/gu) || []).length,
    1,
    '移动进度只能保留一个自由文本搜索入口'
  )
  assert.match(mobileProgressSource, /单号、名称或负责人/u)
  assert.doesNotMatch(mobileProgressSource, /mobile-progress-owner-filter/u)
  assert.match(mobileProgressSource, /IntersectionObserver/u)
  assert.match(mobileProgressSource, /继续下滑加载/u)
  assert.doesNotMatch(
    mobileProgressSource,
    /上一页|下一页|mobile-progress-pagination/u
  )
  assert.doesNotMatch(mobileProgressSource, /<Drawer/u)
  assert.doesNotMatch(mobileProgressSource, /<DateInput/u)
  assert.doesNotMatch(mobileProgressSource, /type="date"/u)
  assert.doesNotMatch(
    mobileProgressSource,
    /mobile-progress-date-picker-popup/u
  )
})

test('shallow mobile task filters use the same anchored dropdown pattern', () => {
  assert.match(mobileTaskOptionsSource, /<MobileFilterPopover/u)
  assert.match(mobileFilterSource, /mobile-filter-popover/u)
  assert.match(mobileFilterSource, /role="dialog"/u)
  assert.doesNotMatch(mobileTaskOptionsSource, /<Drawer/u)
})

test('navigation lint rejects bypasses while allowing shared controls and ordinary buttons', async () => {
  const eslint = new ESLint({
    cwd: path.resolve(import.meta.dirname, '..'),
    // 虚拟文件验证实际入口约束，不参与真实模块的循环依赖分析。
    overrideConfig: { rules: { 'import/no-cycle': 'off' } },
  })
  const lintNavigation = async (code) => {
    const [result] = await eslint.lintText(code, {
      filePath: 'src/pages/NavigationGuardFixture.jsx',
    })
    assert.equal(result.fatalErrorCount, 0)
    return result.messages.filter(({ ruleId }) =>
      ['no-restricted-imports', 'no-restricted-syntax'].includes(ruleId)
    )
  }
  for (const code of [
    "import { Tabs as PageTabs } from 'antd'",
    "import { Segmented } from 'antd'",
    'const element = <div role="tablist" />',
    'const element = <nav role="tablist" />',
  ]) {
    const messages = await lintNavigation(code)
    assert.equal(messages.length, 1, JSON.stringify(messages))
    assert.match(messages[0].message, /Sliding/u)
  }
  const allowed = await lintNavigation(
    `
    import { Button } from 'antd'
    const tabs = <SlidingTabList aria-label="视图" />
    const filter = <FilterChip selected>逾期</FilterChip>
    const action = <button type="button">刷新</button>
  `
  )
  assert.deepEqual(allowed, [])
})
