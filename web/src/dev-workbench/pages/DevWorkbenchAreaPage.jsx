import './delivery/delivery-workflow.css'
import React from 'react'
import {
  BuildOutlined,
  CheckCircleOutlined,
  CodeOutlined,
  DeploymentUnitOutlined,
} from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import { Typography } from 'antd'
import { DeliveryWorkspace } from './delivery/DeliveryWorkspace.jsx'
import DevEnvironmentEvidencePanel from '../components/DevEnvironmentEvidencePanel.jsx'
import DevPageHeader from '../components/DevPageHeader.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import DevTaskNav from '../components/DevTaskNav.jsx'
import DevCustomerScopeSelector from '../components/DevCustomerScopeSelector.jsx'
import useDevCustomerScope from '../hooks/useDevCustomerScope.mjs'
import DevToolTable from '../components/DevToolTable.jsx'
import DevProjectRelationships from '../components/DevProjectRelationships.jsx'
import { DEV_HUB_ITEMS } from '../config/devHub.mjs'
import { DEV_DEVELOPMENT_RESOURCES_VIEWS } from '../config/devRelationshipPerspectives.mjs'
import {
  DEV_PAGE_TITLE_BY_ROUTE,
  DEV_DELIVERY_ROUTE,
  DEV_DEVELOPMENT_RESOURCES_ROUTE,
  DEV_PRODUCT_ENGINEERING_ROUTE,
  DEV_QUALITY_ROUTE,
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
  [DEV_WORKBENCH_AREA_KEYS.developmentResources]: {
    title: DEV_PAGE_TITLE_BY_ROUTE[DEV_DEVELOPMENT_RESOURCES_ROUTE],
    description: '查接口、项目文档、Skill 与项目关系。',
    icon: <CodeOutlined />,
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
  const items = getDevSecondaryNavItems(areaKey).map(
    (entry) => DEV_HUB_ITEMS.find((item) => item.key === entry.key)
  )
  const isDevelopmentResources = areaKey === DEV_WORKBENCH_AREA_KEYS.developmentResources
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
  const resourceView = searchParams.get('view') === 'relationships' ? 'relationships' : 'tools'
  if (!presentation) {
    throw new Error(`unknown dev workbench area: ${String(areaKey || '')}`)
  }

  return (
    <div
      className={`erp-dev-hub-page erp-dev-hub-page--area erp-dev-workspace-page erp-dev-tool-page erp-dev-area-page${isDelivery ? ' erp-dev-delivery-workspace' : ''}`}
    >
      <DevPageNav />
      <DevPageHeader
        className="erp-dev-hub-header"
        title={
          <div className="erp-dev-hub-header__copy">
            <span className="erp-dev-hub-header__icon" aria-hidden="true">
              {presentation.icon}
            </span>
            <Title level={1} className="erp-dev-hub-title">
              {presentation.title}
            </Title>
          </div>
        }
        navigation={
          isDelivery || isDevelopmentResources ? (
            <>
              {isDelivery ? (
                <DevTaskNav
                  compact
                  level="primary"
                  className="erp-dev-delivery-taskbar"
                  idPrefix="dev-delivery"
                  ariaLabel="交付运维视图"
                  items={DELIVERY_VIEWS}
                  value={activeView}
                  onChange={(value) => {
                    const next = new URLSearchParams(searchParams)
                    next.set('view', value)
                    setSearchParams(next)
                  }}
                />
              ) : null}
              {isDevelopmentResources ? (
                <DevTaskNav
                  compact
                  level="primary"
                  className="erp-dev-product-view-tabs"
                  idPrefix="dev-development-resources"
                  ariaLabel="开发资源查看方式"
                  items={DEV_DEVELOPMENT_RESOURCES_VIEWS}
                  value={resourceView}
                  onChange={(value) => {
                    if (value === resourceView) return
                    const next = new URLSearchParams(searchParams)
                    next.set('view', value)
                    setSearchParams(next)
                  }}
                />
              ) : null}
            </>
          ) : null
        }
      >
        {isDelivery ? (
          <section
            className="erp-dev-workbench-header-context"
            aria-label="交付运维范围"
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
      </DevPageHeader>

      <main className="erp-dev-hub-shell">
        <div
          hidden={(isDelivery && activeView !== 'prepare') || (isDevelopmentResources && resourceView !== 'tools')}
          id={isDelivery ? 'dev-delivery-panel-prepare' : isDevelopmentResources ? 'dev-development-resources-panel-tools' : undefined}
          role={isDelivery || isDevelopmentResources ? 'tabpanel' : undefined}
          aria-labelledby={isDelivery ? 'dev-delivery-tab-prepare' : isDevelopmentResources ? 'dev-development-resources-tab-tools' : undefined}
        >
          {isDelivery ? (
            <DeliveryWorkspace items={items} scope={customerScope} />
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
        {isDevelopmentResources ? (
          <section
            hidden={resourceView !== 'relationships'}
            id="dev-development-resources-panel-relationships"
            role="tabpanel"
            aria-labelledby="dev-development-resources-tab-relationships"
          >
            {resourceView === 'relationships' ? <DevProjectRelationships /> : null}
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
