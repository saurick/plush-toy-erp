import './delivery/delivery-workflow.css'
import React from 'react'
import {
  BuildOutlined,
  CheckCircleOutlined,
  DeploymentUnitOutlined,
} from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import { Button, Typography } from 'antd'
import { DeliveryWorkspace } from './delivery/DeliveryWorkspace.jsx'
import DevEnvironmentEvidencePanel from '../components/DevEnvironmentEvidencePanel.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import DevTaskNav from '../components/DevTaskNav.jsx'
import DevCustomerScopeSelector from '../components/DevCustomerScopeSelector.jsx'
import useDevCustomerScope from '../hooks/useDevCustomerScope.mjs'
import DevToolTable from '../components/DevToolTable.jsx'
import DevProductEngineeringTools from '../components/DevProductEngineeringTools.jsx'
import DevProjectRelationships from '../components/DevProjectRelationships.jsx'
import { DEV_HUB_ITEMS } from '../config/devHub.mjs'
import { DEV_PRODUCT_ENGINEERING_VIEWS } from '../config/devRelationshipPerspectives.mjs'
import {
  DEV_PAGE_TITLE_BY_ROUTE,
  DEV_DELIVERY_ROUTE,
  DEV_PRODUCT_ENGINEERING_ROUTE,
  DEV_QUALITY_ROUTE,
  DEV_TESTING_ROUTE,
  DEV_WORKBENCH_AREA_KEYS,
  getDevSecondaryNavItems,
} from '../config/devRoutes.mjs'

const { Title } = Typography
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
  const isProductEngineering = areaKey === DEV_WORKBENCH_AREA_KEYS.productEngineering
  const isDelivery = areaKey === DEV_WORKBENCH_AREA_KEYS.delivery
  const customerScope = useDevCustomerScope({
    searchParams,
    setSearchParams,
    normalize: isDelivery,
  })
  const activeView =
    isDelivery && searchParams.get('view') === 'environments'
      ? 'environments'
      : 'prepare'
  const productView = searchParams.get('view') === 'relationships' ? 'relationships' : 'tools'
  if (!presentation) {
    throw new Error(`unknown dev workbench area: ${String(areaKey || '')}`)
  }

  return (
    <div
      className={`erp-dev-hub-page erp-dev-hub-page--area erp-dev-workspace-page erp-dev-tool-page erp-dev-area-page${isDelivery ? ' erp-dev-delivery-workspace' : ''}`}
    >
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
          <Button type="primary" href={DEV_TESTING_ROUTE}>
            开始验证
          </Button>
        ) : null}
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
        {isProductEngineering ? (
          <DevTaskNav
            compact
            level="primary"
            className="erp-dev-product-view-tabs"
            idPrefix="dev-product-engineering"
            ariaLabel="产品工程查看方式"
            items={DEV_PRODUCT_ENGINEERING_VIEWS}
            value={productView}
            onChange={(value) => {
              if (value === productView) return
              const next = new URLSearchParams(searchParams)
              next.set('view', value)
              setSearchParams(next)
            }}
          />
        ) : null}
        {isDelivery ? (
          <section
            className="erp-dev-workbench-header-context"
            aria-label="交付运行范围"
            hidden={activeView !== 'prepare'}
          >
            <DevCustomerScopeSelector
              compact
              label="客户"
              note=""
              scope={customerScope}
              onChange={customerScope.selectCustomer}
            />
          </section>
        ) : null}
      </header>
      <main className="erp-dev-hub-shell">
        <div
          hidden={(isDelivery && activeView !== 'prepare') || (isProductEngineering && productView !== 'tools')}
          id={isDelivery ? 'dev-delivery-panel-prepare' : isProductEngineering ? 'dev-product-engineering-panel-tools' : undefined}
          role={isDelivery || isProductEngineering ? 'tabpanel' : undefined}
          aria-labelledby={isDelivery ? 'dev-delivery-tab-prepare' : isProductEngineering ? 'dev-product-engineering-tab-tools' : undefined}
        >
          {isDelivery ? (
            <DeliveryWorkspace items={items} scope={customerScope} />
          ) : isProductEngineering ? (
            <DevProductEngineeringTools items={items} />
          ) : (
            <section
              className="erp-dev-area-tools"
              aria-label={`${presentation.title}工具`}
            >
              <DevToolTable
                ariaLabel={`${presentation.title}工具清单`}
                items={items}
              />
            </section>
          )}
        </div>
        {isProductEngineering ? (
          <section
            hidden={productView !== 'relationships'}
            id="dev-product-engineering-panel-relationships"
            role="tabpanel"
            aria-labelledby="dev-product-engineering-tab-relationships"
          >
            {productView === 'relationships' ? <DevProjectRelationships /> : null}
          </section>
        ) : null}
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
