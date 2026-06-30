import React, { useMemo, useState } from 'react'
import {
  AppstoreOutlined,
  CodeOutlined,
  DeploymentUnitOutlined,
  ExperimentOutlined,
  FileSearchOutlined,
  FundProjectionScreenOutlined,
  PushpinFilled,
  PushpinOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { Button, Empty, Input, Select, Tag, Tooltip, Typography } from 'antd'
import { Link } from 'react-router-dom'
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

const { Text, Title } = Typography

const ICON_BY_KEY = {
  governance: <ExperimentOutlined />,
  docs: <FileSearchOutlined />,
  testing: <SafetyCertificateOutlined />,
  prototypes: <AppstoreOutlined />,
  'capability-ledger': <FundProjectionScreenOutlined />,
  'customer-config': <DeploymentUnitOutlined />,
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

function EntryCard({ item, compact = false, pinned = false, onTogglePinned }) {
  const className = compact
    ? 'erp-dev-hub-card erp-dev-hub-card--compact'
    : 'erp-dev-hub-card'

  return (
    <article className={className}>
      <div className="erp-dev-hub-card__icon" aria-hidden="true">
        {ICON_BY_KEY[item.key] || <CodeOutlined />}
      </div>
      <div className="erp-dev-hub-card__body">
        <div className="erp-dev-hub-card__head">
          <div>
            <Title level={4} className="erp-dev-hub-card__title">
              {item.title}
            </Title>
            <Text className="erp-dev-hub-card__route">{item.route}</Text>
          </div>
          <div className="erp-dev-hub-card__actions">
            <Tag>{item.group}</Tag>
            <Tooltip title={pinned ? '取消置顶' : '置顶入口'}>
              <Button
                aria-label={`${pinned ? '取消置顶' : '置顶'}${item.title}`}
                className="erp-dev-hub-card__pin"
                icon={pinned ? <PushpinFilled /> : <PushpinOutlined />}
                size="small"
                type={pinned ? 'primary' : 'default'}
                onClick={() => onTogglePinned?.(item.route)}
              />
            </Tooltip>
          </div>
        </div>
        <Text className="erp-dev-hub-card__source">{item.source}</Text>
        <div className="erp-dev-hub-card__foot">
          <span>{item.status}</span>
          <Link to={item.route} className="erp-dev-hub-card__link">
            <span>进入</span>
            <RightOutlined />
          </Link>
        </div>
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
    <div className="erp-dev-hub-page">
      <header className="erp-dev-hub-header">
        <div className="erp-dev-hub-header__copy">
          <ExperimentOutlined className="erp-dev-hub-header__icon" />
          <Title level={3} className="erp-dev-hub-title">
            开发导航 / Dev Navigation
          </Title>
          <Text className="erp-dev-hub-summary">
            本地 dev-only 入口，不进入正式菜单、RBAC 或生产构建。
          </Text>
        </div>
      </header>

      <main className="erp-dev-hub-shell">
        {pinnedItems.length > 0 ? (
          <section className="erp-dev-hub-pinned" aria-label="置顶开发入口">
            <div className="erp-dev-hub-section-head">
              <Text strong>置顶 / Pinned</Text>
              <Text className="erp-dev-hub-toolbar__note">本地浏览器</Text>
            </div>
            <div className="erp-dev-hub-pinned__grid">
              {pinnedItems.map((item) => (
                <EntryCard
                  key={item.key}
                  item={item}
                  compact
                  pinned={pinnedRouteSet.has(item.route)}
                  onTogglePinned={handleTogglePinned}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="erp-dev-hub-toolbar" aria-label="开发入口筛选">
          <Input.Search
            allowClear
            placeholder="搜索入口或路径"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <Select
            aria-label="开发入口分组"
            className="erp-dev-hub-group-filter"
            value={group}
            options={groupOptions}
            onChange={setGroup}
          />
          <Text className="erp-dev-hub-toolbar__note">
            {items.length} / {DEV_HUB_ITEMS.length}
          </Text>
        </section>

        {items.length > 0 ? (
          <section className="erp-dev-hub-grid" aria-label="开发入口列表">
            {items.map((item) => (
              <EntryCard
                key={item.key}
                item={item}
                pinned={pinnedRouteSet.has(item.route)}
                onTogglePinned={handleTogglePinned}
              />
            ))}
          </section>
        ) : (
          <div className="erp-dev-hub-empty">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="没有匹配入口"
            />
          </div>
        )}
      </main>
    </div>
  )
}
