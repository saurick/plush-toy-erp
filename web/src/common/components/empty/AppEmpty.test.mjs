import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement as h } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

test('空提示保留场景文案和恢复动作，三种规格共用语义', async (t) => {
  const view = await createReactTestHarness(t)
  const { default: Empty } = await import('./AppEmpty.jsx')
  let cleared = 0
  await view.render(
    h(
      Empty,
      { description: '没有符合条件的订单' },
      h(
        'button',
        {
          onClick: () => {
            cleared++
          },
        },
        '清除条件'
      )
    )
  )
  assert.equal(
    document.querySelector('[role="status"] .ant-empty-description')
      .textContent,
    '没有符合条件的订单'
  )
  await view.act(async () => document.querySelector('button').click())
  assert.equal(cleared, 1)
  await view.render(
    h(Empty, { variant: 'inline', description: '尚未录入明细' })
  )
  assert.equal(
    Boolean(document.querySelector('.erp-empty--inline[role="status"]')),
    true
  )
  assert.equal(document.querySelectorAll('.ant-empty-image').length, 0)
  await view.render(
    h(Empty, { variant: 'compact', description: '没有匹配的材料' })
  )
  assert.equal(
    Boolean(document.querySelector('.erp-empty--compact .ant-empty-image')),
    true
  )
  await view.render(h(Empty, { variant: 'inline', description: 0 }))
  assert.equal(document.querySelector('.erp-empty__copy').textContent, '0')
})

test('读取失败、无权限和读取中不混为无记录', async (t) => {
  const view = await createReactTestHarness(t)
  const { default: Empty } = await import('./AppEmpty.jsx')
  await view.render(
    h(
      Empty,
      { state: 'error', description: '材料读取失败' },
      h('button', null, '重新加载')
    )
  )
  assert.equal(
    Boolean(document.querySelector('.erp-empty--error[role="alert"]')),
    true
  )
  assert.equal(
    document.querySelector('.ant-empty-description').textContent,
    '材料读取失败'
  )
  await view.render(
    h(Empty, {
      state: 'denied',
      description: '无权查看材料',
      detail: '请联系管理员核对权限。',
    })
  )
  assert.equal(
    Boolean(document.querySelector('.erp-empty--denied[role="status"]')),
    true
  )
  assert.equal(document.querySelectorAll('button').length, 0)
  assert.equal(document.querySelectorAll('[role="alert"]').length, 0)
  await view.render(
    h(Empty, {
      state: 'loading',
      variant: 'compact',
      description: '正在读取材料…',
    })
  )
  assert.equal(document.querySelectorAll('.ant-empty, .erp-empty').length, 0)
  assert.equal(
    document.querySelector('[aria-busy="true"]').textContent,
    '正在读取材料…'
  )
})

test('表格读取中隐藏空结果，读取完成后恢复共享空提示', async (t) => {
  const view = await createReactTestHarness(t)
  const { default: Table } = await import('../table/AppTable.jsx')
  const props = {
    columns: [{ title: '订单编号', dataIndex: 'number' }],
    dataSource: [],
    pagination: false,
  }
  await view.render(h(Table, { ...props, loading: true }))
  assert.equal(document.querySelectorAll('.erp-empty').length, 0)
  await view.render(h(Table, { ...props, loading: false }))
  assert.equal(
    document.querySelector('.ant-empty-description').textContent,
    '暂无记录'
  )
  await view.render(
    h(Table, {
      ...props,
      loading: { spinning: false },
      locale: { emptyText: '没有符合条件的订单' },
    })
  )
  assert.equal(
    document.querySelector('.ant-empty-description').textContent,
    '没有符合条件的订单'
  )
  await view.render(
    h(Table, {
      ...props,
      loading: { spinning: true },
      locale: { emptyText: '没有符合条件的订单' },
    })
  )
  assert.equal(document.querySelectorAll('.erp-empty').length, 0)
})

test('显式空提示统一经过共享入口，Ant Design 原语留在主题接入和组件内部', () => {
  const root = new URL('../../../', import.meta.url)
  const allowed = new Set(['App.jsx', 'common/components/empty/AppEmpty.jsx'])
  const bypasses = []
  const visit = (url, relative = '') => {
    for (const entry of readdirSync(url, { withFileTypes: true })) {
      const next = path.posix.join(relative, entry.name)
      const entryURL = new URL(
        `${entry.name}${entry.isDirectory() ? '/' : ''}`,
        url
      )
      if (entry.isDirectory()) visit(entryURL, next)
      else if (/\.(?:jsx|js)$/u.test(entry.name) && !allowed.has(next)) {
        if (
          /import\s*\{[^}]*\bEmpty\b[^}]*\}\s*from\s*['"]antd['"]/u.test(
            readFileSync(entryURL, 'utf8')
          )
        ) {
          bypasses.push(next)
        }
      }
    }
  }
  visit(root)
  assert.deepEqual(bypasses, [])
})
