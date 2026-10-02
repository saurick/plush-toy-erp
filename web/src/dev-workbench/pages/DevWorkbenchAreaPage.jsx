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
  DEV_VERSION_CENTER_ROUTE,
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
  { value: 'prepare', label: '准备交付' },
  { value: 'environments', label: '环境证据' },
]

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
    <div className="erp-dev-hub-page erp-dev-hub-page--area erp-dev-workspace-page erp-dev-area-page">
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
        {isQuality || isDelivery ? (
          <Button
            type="primary"
            href={isQuality ? DEV_TESTING_ROUTE : DEV_VERSION_CENTER_ROUTE}
          >
            {isQuality ? '开始验证' : '版本发布'}
          </Button>
        ) : null}
      </header>
      <main className="erp-dev-hub-shell">
        {isDelivery ? (
          <DevTaskNav
            compact
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
                    ? '交付工具'
                    : '产品工程工具'}
              </strong>
              <Text type="secondary">{items.length} 个工具</Text>
            </div>
            <DevToolTable
              ariaLabel={`${presentation.title}工具清单`}
              items={items}
            />
          </section>
          {isDelivery ? (
            <div className="erp-dev-delivery-checks">
              <Link to={`${DEV_TESTING_ROUTE}?view=closeout`}>
                核对 Git 收口
              </Link>
              <Text type="secondary">
                Hook 接线、提交与推送职责在同一页核对。
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
