import React from 'react'
import {
  BuildOutlined,
  CheckCircleOutlined,
  DeploymentUnitOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { Tag, Typography } from 'antd'
import DevEntrySourceDetails from '../components/DevEntrySourceDetails.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
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
    title: '质量验证 / Quality Assurance',
    description:
      '选择与本轮影响面匹配的静态、单元、集成、浏览器和发布门禁，并保留可核验回执。',
    icon: <CheckCircleOutlined aria-hidden="true" />,
  }),
  [DEV_WORKBENCH_AREA_KEYS.delivery]: Object.freeze({
    title: '交付运行 / Delivery Operations',
    description:
      '核对客户配置、发布前置、制品身份和回滚边界；工作台只编排证据，不替代正式发布流程。',
    icon: <DeploymentUnitOutlined aria-hidden="true" />,
  }),
})

const QUALITY_ENTRY_PRESENTATION = Object.freeze({
  testing: Object.freeze({
    eyebrow: '建议从这里开始',
    title: '检查本轮改动',
    description:
      '先让系统只读判断影响范围，再运行与本轮改动匹配的固定检查；每项结果独立保留。',
    action: '开始验证',
    boundary: '只读计划 · 固定检查 · 独立证据',
  }),
  'data-preparation': Object.freeze({
    eyebrow: '用例缺少前置数据时',
    title: '准备测试数据',
    description:
      '只从三种固定数据范围中选择。系统会先检查目标，写入前仍需核对计划并确认。',
    action: '选择数据范围',
    boundary: '固定范围 · 写前确认 · 终态读回',
  }),
})

const PRODUCT_ENGINEERING_ENTRY_PRESENTATION = Object.freeze({
  'product-core': Object.freeze({
    eyebrow: '当前产品事实',
    title: '哪些能力已经进入产品内核？',
    description:
      '完整查看已进入、部分进入、尚未进入和当前不纳入的产品能力，并继续核对可用范围与边界。',
    action: '查看产品内核',
    boundary: '适合查当前产品事实；不能推出已发布或客户已验收',
  }),
  'permission-relationships': Object.freeze({
    eyebrow: '权限核对',
    title: '账号为什么能使用这些功能？',
    description:
      '按岗位或账号汇聚最终可用功能、页面、仓库范围和审批责任，查看每条结果来自哪里。',
    action: '核对权限关系',
    boundary: '只读读取当前后端与已启用配置；不修改权限，不代表发布或验收',
  }),
  governance: Object.freeze({
    eyebrow: '规则与边界',
    title: '这件事该按哪条规则做？',
    description:
      '选择当前问题，先看结论、边界和第一份依据，再决定还要同步检查什么。',
    action: '判断规则',
    boundary: '适合方案分流、职责边界和正式真源定位',
  }),
  'status-flows': Object.freeze({
    eyebrow: '业务衔接',
    title: '这一步做完，业务真的完成了吗？',
    description:
      '沿一条业务链查看来源单据、协同任务、运行路径、事实结果和状态规则怎样衔接。',
    action: '查看业务链',
    boundary: '适合查当前节点、责任、事实与状态差异',
  }),
  docs: Object.freeze({
    eyebrow: '正式说明',
    title: '这项能力的正式说明写在哪里？',
    description:
      '按业务词、标题、路径或正文搜索，直接阅读当前工作区里的正式 Markdown。',
    action: '搜索文档',
    boundary: '适合核对口径、操作说明和维护边界',
  }),
  prototypes: Object.freeze({
    eyebrow: '方案评审',
    title: '页面应该怎样组织才更易用？',
    description:
      '按当前、待实现或参考资料筛选，预览页面方案并核对它适用于什么范围。',
    action: '评审原型',
    boundary: '适合评审交互层级，不代表功能已经实现',
  }),
})

function ProductEngineeringTaskEntry({ item, index }) {
  const copy = PRODUCT_ENGINEERING_ENTRY_PRESENTATION[item.key]

  if (!copy) return null

  return (
    <li className="erp-dev-product-task">
      <span className="erp-dev-product-task__index" aria-hidden="true">
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="erp-dev-product-task__copy">
        <Text className="erp-dev-product-task__eyebrow">{copy.eyebrow}</Text>
        <Title level={3}>{copy.title}</Title>
        <Paragraph>{copy.description}</Paragraph>
        <Text type="secondary" className="erp-dev-product-task__boundary">
          {copy.boundary}
        </Text>
        <details className="erp-dev-product-task__details">
          <summary>查看工具名称与技术边界</summary>
          <dl>
            <div>
              <dt>工具</dt>
              <dd>{item.title}</dd>
            </div>
            <div>
              <dt>页面路径</dt>
              <dd>{item.route}</dd>
            </div>
            <div>
              <dt>维护来源</dt>
              <dd>{item.source}</dd>
            </div>
            <div>
              <dt>依据</dt>
              <dd>{item.truthSource}</dd>
            </div>
          </dl>
          <ul>
            {item.guardrails.map((guardrail) => (
              <li key={guardrail}>{guardrail}</li>
            ))}
          </ul>
        </details>
      </div>
      <Link
        to={item.route}
        className="erp-dev-product-task__action"
        aria-label={`${copy.action}：${copy.title}`}
      >
        <span>{copy.action}</span>
        <RightOutlined aria-hidden="true" />
      </Link>
    </li>
  )
}

function QualityTaskEntry({ item }) {
  const copy = QUALITY_ENTRY_PRESENTATION[item.key]

  if (!copy) return null

  return (
    <article className="erp-dev-quality-task">
      <div className="erp-dev-quality-task__copy">
        <Text className="erp-dev-quality-task__eyebrow">{copy.eyebrow}</Text>
        <Title level={3}>{copy.title}</Title>
        <Paragraph>{copy.description}</Paragraph>
        <Text type="secondary" className="erp-dev-quality-task__boundary">
          {copy.boundary}
        </Text>
        <details className="erp-dev-quality-task__details">
          <summary>查看技术来源与边界</summary>
          <dl>
            <div>
              <dt>页面路径</dt>
              <dd>{item.route}</dd>
            </div>
            <div>
              <dt>维护来源</dt>
              <dd>{item.source}</dd>
            </div>
            <div>
              <dt>证据真源</dt>
              <dd>{item.truthSource}</dd>
            </div>
          </dl>
          <ul>
            {item.guardrails.map((guardrail) => (
              <li key={guardrail}>{guardrail}</li>
            ))}
          </ul>
        </details>
      </div>
      <Link
        to={item.route}
        className="erp-dev-quality-task__action"
        aria-label={`${copy.action}：${copy.title}`}
      >
        <span>{copy.action}</span>
        <RightOutlined aria-hidden="true" />
      </Link>
    </article>
  )
}

function WorkbenchEntryCard({ item }) {
  return (
    <article className="erp-dev-hub-card erp-dev-hub-card--without-icon">
      <div className="erp-dev-hub-card__body">
        <div className="erp-dev-hub-card__head">
          <div>
            <Title level={4} className="erp-dev-hub-card__title">
              {item.title}
            </Title>
          </div>
          <Tag>{item.status}</Tag>
        </div>
        <Text type="secondary" className="erp-dev-hub-card__description">
          {item.description}
        </Text>
        <DevEntrySourceDetails route={item.route} source={item.source} />
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
  )
}

export default function DevWorkbenchAreaPage({ areaKey }) {
  const presentation = AREA_PRESENTATION[areaKey]
  const items = DEV_HUB_ITEMS.filter((item) => item.areaKey === areaKey)
  const isQualityArea = areaKey === DEV_WORKBENCH_AREA_KEYS.quality
  const isProductEngineeringArea =
    areaKey === DEV_WORKBENCH_AREA_KEYS.productEngineering

  if (!presentation) {
    throw new Error(`unknown dev workbench area: ${String(areaKey || '')}`)
  }

  return (
    <div
      className={`erp-dev-hub-page erp-dev-hub-page--area erp-dev-workspace-page${
        isQualityArea ? ' erp-dev-quality-page' : ''
      }${isProductEngineeringArea ? ' erp-dev-product-engineering-page' : ''}`}
    >
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
        {isProductEngineeringArea ? (
          <section
            className="erp-dev-product-start"
            aria-labelledby="dev-product-start-title"
          >
            <div className="erp-dev-product-start__head">
              <div>
                <Text className="erp-dev-product-start__eyebrow">
                  当前要解决的问题
                </Text>
                <Title level={2} id="dev-product-start-title">
                  先选你想弄清楚的事情
                </Title>
              </div>
              <Text type="secondary">
                每个入口先给答案或可读内容；工具名称、路径和维护来源需要时再展开。
              </Text>
            </div>
            <ol className="erp-dev-product-task-list">
              {items.map((item, index) => (
                <ProductEngineeringTaskEntry
                  key={item.key}
                  item={item}
                  index={index}
                />
              ))}
            </ol>
          </section>
        ) : isQualityArea ? (
          <section
            className="erp-dev-quality-start"
            aria-labelledby="dev-quality-start-title"
          >
            <div className="erp-dev-quality-start__head">
              <div>
                <Text className="erp-dev-quality-start__eyebrow">当前任务</Text>
                <Title level={2} id="dev-quality-start-title">
                  先选要完成的事情
                </Title>
              </div>
              <Text type="secondary">
                测试数据不是每次都要准备；先判断本轮改动，再按需要进入数据准备。
              </Text>
            </div>
            <div className="erp-dev-quality-task-list">
              {items.map((item) => (
                <QualityTaskEntry key={item.key} item={item} />
              ))}
            </div>
          </section>
        ) : null}
        {!isQualityArea && !isProductEngineeringArea ? (
          <section
            className="erp-dev-hub-grid"
            aria-label={`${presentation.title}入口`}
          >
            {items.map((item) => (
              <WorkbenchEntryCard key={item.key} item={item} />
            ))}
          </section>
        ) : null}
      </main>
    </div>
  )
}
