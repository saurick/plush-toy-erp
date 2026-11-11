import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { buildCustomerConfigDevOverview, DEV_CUSTOMER_CONFIG_REGISTRY } from '../../config/devCustomerConfig.mjs'

test('overview shows the first package blocker and clears it when the package is valid', async (t) => {
  const { container, render } = await createReactTestHarness(t)
  const { OverviewPanel } = await import('./OverviewPanel.jsx')
  const customerKey = 'yoyoosun'
  const { customerPackage } = DEV_CUSTOMER_CONFIG_REGISTRY[customerKey]
  const props = {
    dryRunState: { status: 'idle' },
    applyState: { status: 'idle' },
    onNavigate: () => {},
  }
  const overview = buildCustomerConfigDevOverview({ customerKey })
  const blocked = buildCustomerConfigDevOverview({
    customerKey,
    customerPackage: {
      ...customerPackage,
      runtimeEnabled: true,
      boundaries: { ...customerPackage.boundaries, createsTenant: true },
    },
  })
  const startText = () => container.querySelector('.erp-dev-customer-start').textContent

  await render(createElement(OverviewPanel, { ...props, overview: blocked }))
  assert.match(startText(), /先处理配置包问题.*运行时启用：是；要求：否/u)
  assert.doesNotMatch(startText(), /创建租户/u)
  assert.match(startText(), /服务器生效状态见「版本发布」/u)

  await render(createElement(OverviewPanel, { ...props, overview }))
  assert.match(startText(), /配置包可以继续验证/u)
  assert.doesNotMatch(startText(), /运行时启用：是/u)
})
