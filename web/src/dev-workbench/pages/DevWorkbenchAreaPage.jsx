import React from 'react'
import {
  BuildOutlined,
  CheckCircleOutlined,
  DeploymentUnitOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { Tag, Typography } from 'antd'
import DevPageNav from '../components/DevPageNav.jsx'
import DevReceiptPanel from '../components/DevReceiptPanel.jsx'
import { DEV_HUB_ITEMS } from '../config/devHub.mjs'
import { DEV_WORKBENCH_AREA_KEYS } from '../config/devRoutes.mjs'

const { Paragraph, Text, Title } = Typography

const AREA_PRESENTATION = Object.freeze({
  [DEV_WORKBENCH_AREA_KEYS.productEngineering]: Object.freeze({
    title: '产品工程 / Product Engineering',
    description:
      '从正式文档、代码合同和客户配置叠加层观察产品边界，不在工作台复制业务真源。',
    icon: <BuildOutlined aria-hidden="true" />,
  }),
  [DEV_WORKBENCH_AREA_KEYS.quality]: Object.freeze({
    title: '质量 / Quality',
    description:
      '选择与本轮影响面匹配的静态、单元、集成、浏览器和发布门禁，并保留可核验回执。',
    icon: <CheckCircleOutlined aria-hidden="true" />,
  }),
  [DEV_WORKBENCH_AREA_KEYS.delivery]: Object.freeze({
    title: '交付 / Delivery',
    description:
      '核对客户配置、发布前置、制品身份和回滚边界；工作台只编排证据，不替代正式发布流程。',
    icon: <DeploymentUnitOutlined aria-hidden="true" />,
  }),
})

export default function DevWorkbenchAreaPage({ areaKey }) {
  const presentation = AREA_PRESENTATION[areaKey]
  const items = DEV_HUB_ITEMS.filter((item) => item.areaKey === areaKey)

  if (!presentation) {
    throw new Error(`unknown dev workbench area: ${String(areaKey || '')}`)
  }

  return (
    <div className="erp-dev-hub-page erp-dev-workspace-page">
      <DevPageNav />
      <header className="erp-dev-hub-header">
        <div className="erp-dev-hub-header__copy">
          <span className="erp-dev-hub-header__icon">{presentation.icon}</span>
          <Title level={1} className="erp-dev-hub-title">
            {presentation.title}
          </Title>
          <Paragraph className="erp-dev-hub-summary">
            {presentation.description}
          </Paragraph>
        </div>
      </header>

      <main className="erp-dev-hub-shell">
        {[
          DEV_WORKBENCH_AREA_KEYS.quality,
          DEV_WORKBENCH_AREA_KEYS.delivery,
        ].includes(areaKey) ? (
          <DevReceiptPanel areaKey={areaKey} />
        ) : null}
        <section className="erp-dev-hub-grid" aria-label={`${presentation.title}入口`}>
          {items.map((item) => (
            <article className="erp-dev-hub-card" key={item.key}>
              <div className="erp-dev-hub-card__body">
                <div className="erp-dev-hub-card__head">
                  <div>
                    <Title level={4} className="erp-dev-hub-card__title">
                      {item.title}
                    </Title>
                    <Text className="erp-dev-hub-card__route">{item.route}</Text>
                  </div>
                  <Tag>{item.status}</Tag>
                </div>
                <Text className="erp-dev-hub-card__source">{item.source}</Text>
                <Text
                  type="secondary"
                  className="erp-dev-hub-card__description"
                >
                  {item.description}
                </Text>
                <div className="erp-dev-hub-card__foot">
                  <span>{item.truthSource}</span>
                  <Link
                    to={item.route}
                    className="erp-dev-hub-card__link"
                    aria-label={`进入${item.title}`}
                  >
                    <span>进入</span>
                    <RightOutlined aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  )
}
