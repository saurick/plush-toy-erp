import React, { useMemo, useState } from 'react'
import {
  ApartmentOutlined,
  AppstoreOutlined,
  CodeOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  ExperimentOutlined,
  FileSearchOutlined,
  PushpinFilled,
  PushpinOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { Button, Empty, Select, Tag, Tooltip, Typography } from 'antd'
import { Link } from 'react-router-dom'
import SearchInput from '@/common/components/SearchInput'
import DevEntrySourceDetails from '../components/DevEntrySourceDetails.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import {
  DEV_HUB_ALL_GROUP,
  DEV_HUB_ITEMS,
  DEV_HUB_PINNED_STORAGE_KEY,
  buildDevHubPinnedItems,
  filterDevHubItems,
  getDevHubGroupOptions,
  normalizeDevHubPinnedRoutes,
  toggleDevHubPinnedRoute,
} from '../config/devHub.mjs'
import {
  DEV_DELIVERY_ROUTE,
  DEV_PRODUCT_ENGINEERING_ROUTE,
  DEV_QUALITY_ROUTE,
  DEV_WORKBENCH_AREA_KEYS,
} from '../config/devRoutes.mjs'

const { Paragraph, Text, Title } = Typography

const OVERVIEW_STAGES = Object.freeze([
  Object.freeze({
    key: DEV_WORKBENCH_AREA_KEYS.productEngineering,
    eyebrow: '先决定怎么改',
    title: '先弄清楚怎么改',
    description:
      '先找到正式依据，确认规则、业务链和页面方案，再开始实现，避免边做边猜。',
    boundary: '只做判断和阅读，不在总览页创建第二套规则或运行真源',
    action: '进入产品工程',
    route: DEV_PRODUCT_ENGINEERING_ROUTE,
  }),
  Object.freeze({
    key: DEV_WORKBENCH_AREA_KEYS.quality,
    eyebrow: '再证明改动没问题',
    title: '验证这次改动没有越界',
    description:
      '按影响面选择固定检查并保留每项证据；只有用例缺少前置条件时才准备测试数据。',
    boundary: '逐项保留结果，不把局部绿色合并成完整交付结论',
    action: '开始验证',
    route: DEV_QUALITY_ROUTE,
  }),
  Object.freeze({
    key: DEV_WORKBENCH_AREA_KEYS.delivery,
    eyebrow: '最后准备交付',
    title: '确认配置、数据库和版本可以安全落地',
    description:
      '依次核对客户配置、数据库迁移和固定版本；涉及写入时仍先准备、再确认、最后读回。',
    boundary: '受控写入和发布继续经过明确确认、操作回执与终态读回',
    action: '准备交付',
    route: DEV_DELIVERY_ROUTE,
  }),
])

const ICON_BY_KEY = {
  governance: <ExperimentOutlined />,
  docs: <FileSearchOutlined />,
  testing: <SafetyCertificateOutlined />,
  'data-preparation': <DatabaseOutlined />,
  prototypes: <AppstoreOutlined />,
  'customer-config': <DeploymentUnitOutlined />,
  'status-flows': <ApartmentOutlined />,
  'database-migration': <DatabaseOutlined />,
  'version-center': <DeploymentUnitOutlined />,
}

function readPinnedRoutes() {
  try {
    const raw = window.localStorage?.getItem(DEV_HUB_PINNED_STORAGE_KEY)
    return normalizeDevHubPinnedRoutes(JSON.parse(raw || '[]'))
  } catch {
    return []
  }
}

function writeLocalRoutes(storageKey, routes = []) {
  try {
    window.localStorage?.setItem(storageKey, JSON.stringify(routes))
  } catch {
    // 本地开发偏好是 best-effort，不影响入口跳转。
  }
}

function writePinnedRoutes(routes = []) {
  writeLocalRoutes(DEV_HUB_PINNED_STORAGE_KEY, routes)
}

function OverviewStage({ stage, index }) {
  const stageItems = DEV_HUB_ITEMS.filter((item) => item.areaKey === stage.key)

  return (
    <li className="erp-dev-overview-stage">
      <span className="erp-dev-overview-stage__index" aria-hidden="true">
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="erp-dev-overview-stage__copy">
        <Text className="erp-dev-overview-stage__eyebrow">{stage.eyebrow}</Text>
        <Title level={3}>{stage.title}</Title>
        <Paragraph>{stage.description}</Paragraph>
        <Text type="secondary" className="erp-dev-overview-stage__boundary">
          {stage.boundary}
        </Text>
        <details className="erp-dev-overview-stage__details">
          <summary>
            <span>这一阶段包含什么</span>
            <span>{stageItems.length} 个入口</span>
          </summary>
          <div className="erp-dev-overview-stage__links">
            {stageItems.map((item) => (
              <Link
                key={item.key}
                to={item.route}
                className="erp-dev-overview-stage__link"
              >
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.status}</small>
                </span>
                <RightOutlined aria-hidden="true" />
              </Link>
            ))}
          </div>
        </details>
      </div>
      <Link
        to={stage.route}
        className="erp-dev-overview-stage__action"
        aria-label={`${stage.action}：${stage.title}`}
      >
        <span>{stage.action}</span>
        <RightOutlined aria-hidden="true" />
      </Link>
    </li>
  )
}

function PinnedShortcut({ item, onTogglePinned }) {
  return (
    <article className="erp-dev-overview-pinned__item">
      <Link to={item.route} className="erp-dev-overview-pinned__link">
        <strong>{item.title}</strong>
        <small>{item.status}</small>
      </Link>
      <Tooltip title="取消置顶">
        <Button
          aria-label={`取消置顶${item.title}`}
          className="erp-dev-overview-pinned__remove"
          icon={<PushpinFilled />}
          size="small"
          type="text"
          aria-pressed="true"
          onClick={() => onTogglePinned?.(item.route)}
        />
      </Tooltip>
    </article>
  )
}

function OverviewToolRow({ item, pinned = false, onTogglePinned }) {
  return (
    <article className="erp-dev-overview-tool">
      <div className="erp-dev-overview-tool__icon" aria-hidden="true">
        {ICON_BY_KEY[item.key] || <CodeOutlined />}
      </div>
      <div className="erp-dev-overview-tool__copy">
        <div className="erp-dev-overview-tool__head">
          <Title level={4}>{item.title}</Title>
          <div className="erp-dev-overview-tool__meta">
            <Tag>{item.group}</Tag>
            <Tooltip title={pinned ? '取消置顶' : '置顶入口'}>
              <Button
                aria-label={`${pinned ? '取消置顶' : '置顶'}${item.title}`}
                className="erp-dev-overview-tool__pin"
                icon={pinned ? <PushpinFilled /> : <PushpinOutlined />}
                size="small"
                type="text"
                aria-pressed={pinned}
                onClick={() => onTogglePinned?.(item.route)}
              />
            </Tooltip>
          </div>
        </div>
        <Text type="secondary" className="erp-dev-overview-tool__description">
          {item.description}
        </Text>
        <DevEntrySourceDetails route={item.route} source={item.source} />
      </div>
      <div className="erp-dev-overview-tool__actions">
        <Text type="secondary">{item.status}</Text>
        <Link
          to={item.route}
          className="erp-dev-overview-tool__open"
          aria-label={`打开${item.title}`}
        >
          <span>打开</span>
          <RightOutlined aria-hidden="true" />
        </Link>
      </div>
    </article>
  )
}

export default function DevHubPage() {
  const [keyword, setKeyword] = useState('')
  const [group, setGroup] = useState(DEV_HUB_ALL_GROUP)
  const [pinnedRoutes, setPinnedRoutes] = useState(readPinnedRoutes)
  const groupOptions = useMemo(() => getDevHubGroupOptions(DEV_HUB_ITEMS), [])
  const items = useMemo(
    () => filterDevHubItems(DEV_HUB_ITEMS, { keyword, group }),
    [group, keyword]
  )
  const pinnedItems = useMemo(
    () => buildDevHubPinnedItems(DEV_HUB_ITEMS, pinnedRoutes),
    [pinnedRoutes]
  )
  const pinnedRouteSet = useMemo(() => new Set(pinnedRoutes), [pinnedRoutes])
  const handleTogglePinned = (route) => {
    setPinnedRoutes((currentRoutes) => {
      const nextRoutes = toggleDevHubPinnedRoute(route, currentRoutes)
      writePinnedRoutes(nextRoutes)
      return nextRoutes
    })
  }

  return (
    <div className="erp-dev-hub-page erp-dev-hub-page--index erp-dev-overview-page erp-dev-workspace-page">
      <DevPageNav />
      <header className="erp-dev-hub-header">
        <div className="erp-dev-hub-header__copy">
          <ExperimentOutlined className="erp-dev-hub-header__icon" />
          <Title level={1} className="erp-dev-hub-title">
            研发效能工作台 / Engineering Delivery Workbench
          </Title>
          <Text className="erp-dev-hub-summary">
            按改动、验证和交付的顺序选择下一步；只在需要时再查具体工具。
          </Text>
          <details className="erp-dev-overview-boundary">
            <summary>查看开发态边界</summary>
            <Paragraph>
              仅本地开发态，不进入正式菜单或生产构建；受控写操作继续经过本机系统边界、明确确认和结果读回，不冒充
              ERP RBAC。
            </Paragraph>
          </details>
        </div>
      </header>

      <main className="erp-dev-hub-shell">
        <section
          className="erp-dev-overview-start"
          aria-labelledby="dev-overview-start-title"
        >
          <div className="erp-dev-overview-start__head">
            <div>
              <Text className="erp-dev-overview-start__eyebrow">当前任务</Text>
              <Title level={2} id="dev-overview-start-title">
                你现在要完成什么？
              </Title>
            </div>
            <Text type="secondary">
              通常从第一步开始；已经明确目标时，也可以直接进入对应阶段。
            </Text>
          </div>

          {pinnedItems.length > 0 ? (
            <section
              className="erp-dev-overview-pinned"
              aria-label="常用开发入口"
            >
              <div className="erp-dev-overview-pinned__head">
                <Text strong>常用入口</Text>
                <Text type="secondary">只保存在当前浏览器</Text>
              </div>
              <div className="erp-dev-overview-pinned__list">
                {pinnedItems.map((item) => (
                  <PinnedShortcut
                    key={item.key}
                    item={item}
                    onTogglePinned={handleTogglePinned}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <ol className="erp-dev-overview-stage-list">
            {OVERVIEW_STAGES.map((stage, index) => (
              <OverviewStage key={stage.key} stage={stage} index={index} />
            ))}
          </ol>
        </section>

        <details className="erp-dev-overview-tools">
          <summary>
            <span>
              <strong>需要找特定工具？查看全部入口</strong>
              <small>支持搜索、分类和本地置顶</small>
            </span>
            <span>{DEV_HUB_ITEMS.length} 个入口</span>
          </summary>
          <div className="erp-dev-overview-tools__content">
            <section
              className="erp-dev-hub-toolbar"
              aria-label="全部开发工具筛选"
            >
              <SearchInput
                allowClear
                aria-label="搜索全部开发工具"
                placeholder="搜索具体工具或路径"
                searchHint="可搜索工具名称、用途、路径、来源或边界"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
              <Select
                aria-label="全部开发工具分组"
                className="erp-dev-hub-group-filter"
                value={group}
                options={groupOptions}
                onChange={setGroup}
              />
              <Text className="erp-dev-hub-toolbar__note">
                {keyword.trim() || group !== DEV_HUB_ALL_GROUP
                  ? `匹配 ${items.length} 个入口`
                  : `全部 ${items.length} 个入口`}
              </Text>
            </section>

            {items.length > 0 ? (
              <section
                className="erp-dev-overview-tool-list"
                aria-label="全部开发工具"
              >
                {items.map((item) => (
                  <OverviewToolRow
                    key={item.key}
                    item={item}
                    pinned={pinnedRouteSet.has(item.route)}
                    onTogglePinned={handleTogglePinned}
                  />
                ))}
              </section>
            ) : (
              <div className="erp-dev-overview-empty">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="没有匹配的工具，请清空搜索或切换分类"
                />
              </div>
            )}
          </div>
        </details>
      </main>
    </div>
  )
}
