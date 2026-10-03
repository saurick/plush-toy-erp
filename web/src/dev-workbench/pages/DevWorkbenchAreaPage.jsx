import React from 'react'
import {
  BuildOutlined,
  CheckCircleOutlined,
  DeploymentUnitOutlined,
} from '@ant-design/icons'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, Typography } from 'antd'
import DevEnvironmentEvidencePanel from '../components/DevEnvironmentEvidencePanel.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import DevTaskNav from '../components/DevTaskNav.jsx'
import DevToolTable from '../components/DevToolTable.jsx'
import { DEV_HUB_ITEMS } from '../config/devHub.mjs'
import {
  DEV_PAGE_TITLE_BY_ROUTE,
  DEV_DELIVERY_ROUTE,
  DEV_PRODUCT_ENGINEERING_ROUTE,
  DEV_QUALITY_ROUTE,
  DEV_TESTING_ROUTE,
  DEV_WORKBENCH_AREA_KEYS,
  getDevSecondaryNavItems,
} from '../config/devRoutes.mjs'

const { Text, Title } = Typography
const AREA_PRESENTATION = {
  [DEV_WORKBENCH_AREA_KEYS.productEngineering]: {
    title: DEV_PAGE_TITLE_BY_ROUTE[DEV_PRODUCT_ENGINEERING_ROUTE],
    description: '查规则、核对权限与业务链，查看页面方案。',
    icon: <BuildOutlined />,
  },
  [DEV_WORKBENCH_AREA_KEYS.quality]: {
    title: DEV_PAGE_TITLE_BY_ROUTE[DEV_QUALITY_ROUTE],
    description: '按本轮改动选择检查，逐项核对证据。',
    icon: <CheckCircleOutlined />,
  },
  [DEV_WORKBENCH_AREA_KEYS.delivery]: {
    title: DEV_PAGE_TITLE_BY_ROUTE[DEV_DELIVERY_ROUTE],
    description: '先核对版本、目标与恢复点，再准备具体计划。',
    icon: <DeploymentUnitOutlined />,
  },
}
const DELIVERY_VIEWS = [
  { value: 'prepare', label: '交付任务' },
  { value: 'environments', label: '环境证据' },
]
const DELIVERY_TASK_SCOPE = {
  'customer-config': { scope: '所选客户配置包', action: '检查客户配置' },
  'database-migration': { scope: '本地共享开发库', action: '检查数据库升级' },
  'version-center': { scope: '已登记的 demo / test 目标', action: '管理版本与部署' },
  'drill-recovery': { scope: '已登记目标 · 只读核验', action: '核对安全与恢复' },
}

export default function DevWorkbenchAreaPage({ areaKey }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const presentation = AREA_PRESENTATION[areaKey]
  const visibleRoutes = new Set(
    getDevSecondaryNavItems(areaKey).map((item) => item.route)
  )
  const items = DEV_HUB_ITEMS.filter(
    (item) => item.areaKey === areaKey && visibleRoutes.has(item.route)
  )
  const isQuality = areaKey === DEV_WORKBENCH_AREA_KEYS.quality
  const isDelivery = areaKey === DEV_WORKBENCH_AREA_KEYS.delivery
  const activeView =
    isDelivery && searchParams.get('view') === 'environments'
      ? 'environments'
      : 'prepare'
  if (!presentation) {
    throw new Error(`unknown dev workbench area: ${String(areaKey || '')}`)
  }

  return (
    <div className={`erp-dev-hub-page erp-dev-hub-page--area erp-dev-workspace-page erp-dev-area-page${isDelivery ? ' erp-dev-delivery-workspace' : ''}`}>
      <DevPageNav />
      <header className="erp-dev-hub-header">
        <div className="erp-dev-hub-header__copy">
          <span className="erp-dev-hub-header__icon" aria-hidden="true">
            {presentation.icon}
          </span>
          <Title level={1} className="erp-dev-hub-title">
            {presentation.title}
          </Title>
        </div>
        {isQuality ? (
          <Button
            type="primary"
            href={DEV_TESTING_ROUTE}
          >
            开始验证
          </Button>
        ) : null}
      </header>
      <main className="erp-dev-hub-shell">
        {isDelivery ? (
          <DevTaskNav
            compact
            level="primary"
            className="erp-dev-delivery-taskbar"
            idPrefix="dev-delivery"
            ariaLabel="交付运行视图"
            items={DELIVERY_VIEWS}
            value={activeView}
            onChange={(value) => {
              const next = new URLSearchParams(searchParams)
              next.set('view', value)
              setSearchParams(next)
            }}
          />
        ) : null}
        <div
          hidden={isDelivery && activeView !== 'prepare'}
          id={isDelivery ? 'dev-delivery-panel-prepare' : undefined}
          role={isDelivery ? 'tabpanel' : undefined}
          aria-labelledby={isDelivery ? 'dev-delivery-tab-prepare' : undefined}
        >
          <section
            className="erp-dev-area-tools"
            aria-label={`${presentation.title}工具`}
          >
            <div className="erp-dev-area-tools__heading">
              <strong>
                {isQuality
                  ? '按需要选择检查'
                  : isDelivery
                    ? '按任务准备与核对'
                    : '产品工程工具'}
              </strong>
              <Text type="secondary">{items.length} 个工具</Text>
            </div>
            {isDelivery ? (
              <div className="erp-dev-tool-table-wrap">
                <table className="erp-dev-tool-table erp-dev-delivery-task-table" aria-label="交付运行任务">
                  <thead>
                    <tr><th scope="col">任务</th><th scope="col">作用范围</th><th scope="col">核对与结果</th><th scope="col">入口</th></tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={item.key}>
                        <th scope="row"><span className="erp-dev-delivery-task-number">{index + 1}</span>{item.title.split(' / ')[0]}</th>
                        <td>{DELIVERY_TASK_SCOPE[item.key].scope}</td>
                        <td>{item.description}</td>
                        <td><Link to={item.route}>{DELIVERY_TASK_SCOPE[item.key].action}</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <DevToolTable
                ariaLabel={`${presentation.title}工具清单`}
                items={items}
              />
            )}
          </section>
          {isDelivery ? (
            <div className="erp-dev-delivery-checks">
              <Link to={`${DEV_TESTING_ROUTE}?view=closeout`}>
                核对 Git 收口
              </Link>
              <Text type="secondary">
                交付前核对当前改动的检查与提交证据。环境运行状态在“环境证据”中查看。
              </Text>
            </div>
          ) : null}
        </div>
        {isDelivery ? (
          <section
            hidden={activeView !== 'environments'}
            id="dev-delivery-panel-environments"
            role="tabpanel"
            aria-labelledby="dev-delivery-tab-environments"
          >
            {activeView === 'environments' ? (
              <DevEnvironmentEvidencePanel />
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  )
}
