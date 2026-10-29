import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'

test('来源显示文件名，复制保留完整路径及行号，切换对象清除旧来源', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: References } = await import('./DevSourceReferences.jsx')
  const paths = [
    'server/internal/biz/engineering_material_request.go:119',
    'server/internal/data/engineering_material_request_repo.go',
  ]
  const copied = []
  document.execCommand = (command) => {
    assert.equal(command, 'copy')
    copied.push(document.getSelection().toString())
    return true
  }
  await harness.render(h(References, { references: [...paths, paths[0], ''] }))
  assert.equal(harness.container.querySelectorAll('li').length, 2)
  assert(!harness.container.textContent.includes('server/internal/'))
  assert(harness.container.textContent.includes('业务规则'))
  assert(harness.container.textContent.includes('数据访问'))
  for (const button of harness.container.querySelectorAll('.ant-typography-copy')) {
    await harness.act(() => button.click())
  }
  assert.deepEqual(copied, paths)
  await harness.render(h(References, { references: ['scripts/qa/README.md'] }))
  assert.equal(harness.container.querySelectorAll('li').length, 1)
  assert(!harness.container.textContent.includes('engineering_material_request'))
  await harness.render(h(References, { references: [] }))
  assert.equal(harness.container.childElementCount, 0)
})

test('同名文件保留目录区别，技术字符作为文字展示', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: References } = await import('./DevSourceReferences.jsx')
  await harness.render(h(References, { references: [
    'server/internal/biz/order.go',
    'server/internal/data/order.go',
    'docs/README.md',
    'scripts/qa/README.md',
    'web/src/<img onerror=alert(1)>.jsx',
  ] }))
  const labels = [...harness.container.querySelectorAll('code')].map((node) => node.textContent)
  assert(labels.includes('biz/order.go'))
  assert(labels.includes('data/order.go'))
  assert(labels.includes('docs/README.md'))
  assert(labels.includes('qa/README.md'))
  assert(labels.includes('<img onerror=alert(1)>.jsx'))
  assert.equal(harness.container.querySelector('img'), null)
})
