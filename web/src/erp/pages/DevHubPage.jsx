import React, { useMemo, useState } from 'react'
import {
  AppstoreOutlined,
  CodeOutlined,
  ExperimentOutlined,
  FileSearchOutlined,
  FundProjectionScreenOutlined,
  PushpinFilled,
  PushpinOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import {
  Button,
  Empty,
  Input,
  Segmented,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { Link } from 'react-router-dom'
import {
  DEV_HUB_ALL_GROUP,
  DEV_HUB_ITEMS,
  DEV_HUB_PINNED_STORAGE_KEY,
  DEV_HUB_RECENT_STORAGE_KEY,
  buildDevHubPinnedItems,
  buildDevHubSummary,
  buildDevHubRecentItems,
  filterDevHubItems,
  getDevHubGroupOptions,
  normalizeDevHubPinnedRoutes,
  normalizeDevHubRecentRoutes,
  recordDevHubRecentRoute,
  toggleDevHubPinnedRoute,
} from '../config/devHub.mjs'

const { Paragraph, Text, Title } = Typography

const ICON_BY_KEY = {
  docs: <FileSearchOutlined />,
  testing: <SafetyCertificateOutlined />,
  prototypes: <AppstoreOutlined />,
  'capability-ledger': <FundProjectionScreenOutlined />,
  'customer-config': <SettingOutlined />,
}

function readRecentRoutes() {
  try {
    const raw = window.localStorage?.getItem(DEV_HUB_RECENT_STORAGE_KEY)
    return normalizeDevHubRecentRoutes(JSON.parse(raw || '[]'))
  } catch {
    return []
  }
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

function writeRecentRoutes(routes = []) {
  writeLocalRoutes(DEV_HUB_RECENT_STORAGE_KEY, routes)
}

function writePinnedRoutes(routes = []) {
  writeLocalRoutes(DEV_HUB_PINNED_STORAGE_KEY, routes)
}

function Metric({ label, value, note }) {
  return (
    <div className="erp-dev-hub-metric">
      <span className="erp-dev-hub-metric__label">{label}</span>
      <span className="erp-dev-hub-metric__value">{value}</span>
      <span className="erp-dev-hub-metric__note">{note}</span>
    </div>
  )
}

function EntryCard({
  item,
  compact = false,
  pinned = false,
  onOpen,
  onTogglePinned,
}) {
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
            <Text className="erp-dev-hub-card__source">{item.source}</Text>
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
        <Paragraph className="erp-dev-hub-card__desc">
          {item.description}
        </Paragraph>
        <div className="erp-dev-hub-card__meta">
          <span>维护真源</span>
          <strong>{item.truthSource}</strong>
        </div>
        <div
          className="erp-dev-hub-card__guards"
          aria-label={`${item.title}边界`}
        >
          {(item.guardrails || []).map((guardrail) => (
            <span key={guardrail}>{guardrail}</span>
          ))}
        </div>
        <div className="erp-dev-hub-card__foot">
          <span>{item.status}</span>
          <Link
            to={item.route}
            className="erp-dev-hub-card__link"
            rel="noreferrer"
            target="_blank"
            onClick={() => onOpen?.(item.route)}
          >
            <span>{item.route}</span>
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
  const [recentRoutes, setRecentRoutes] = useState(readRecentRoutes)
  const [pinnedRoutes, setPinnedRoutes] = useState(readPinnedRoutes)
  const groupOptions = useMemo(() => getDevHubGroupOptions(DEV_HUB_ITEMS), [])
  const items = useMemo(
    () => filterDevHubItems(DEV_HUB_ITEMS, { keyword, group }),
    [group, keyword]
  )
  const recentItems = useMemo(
    () => buildDevHubRecentItems(DEV_HUB_ITEMS, recentRoutes),
    [recentRoutes]
  )
  const pinnedItems = useMemo(
    () => buildDevHubPinnedItems(DEV_HUB_ITEMS, pinnedRoutes),
    [pinnedRoutes]
  )
  const summary = useMemo(() => buildDevHubSummary(DEV_HUB_ITEMS), [])
  const pinnedRouteSet = useMemo(() => new Set(pinnedRoutes), [pinnedRoutes])
  const handleEntryOpen = (route) => {
    setRecentRoutes((currentRoutes) => {
      const nextRoutes = recordDevHubRecentRoute(route, currentRoutes)
      writeRecentRoutes(nextRoutes)
      return nextRoutes
    })
  }
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
          <Space align="center" size={10}>
            <ExperimentOutlined className="erp-dev-hub-header__icon" />
            <Title level={3} className="erp-dev-hub-title">
              开发入口总控 / Dev Hub
            </Title>
          </Space>
          <Paragraph className="erp-dev-hub-summary">
            统一收口本地开发态工具入口 / centralize local dev-only tools；不进入
            ERP 正式菜单、seedData、RBAC、后端业务或生产构建。
          </Paragraph>
        </div>
        <div className="erp-dev-hub-header__metrics">
          <Metric label="入口" value={summary.entryCount} note="个 dev-only" />
          <Metric label="分组" value={summary.groupCount} note="类治理面" />
          <Metric
            label="守卫"
            value={summary.guardrailCount}
            note="条边界标签"
          />
        </div>
      </header>

      <main className="erp-dev-hub-shell">
        <section className="erp-dev-hub-governance" aria-label="入口治理规则">
          <div>
            <Text strong>入口台账规则 / Registry Rules</Text>
            <Paragraph className="erp-dev-hub-governance__copy">
              新增或调整 `/__dev/*` 入口时，只维护配置台账和对应 dev-only 页面；
              不恢复产品内 docs registry、菜单、seedData、RBAC 或后端业务写入。
            </Paragraph>
          </div>
          <Tag color="blue">DEV_HUB_ITEMS</Tag>
        </section>

        <section className="erp-dev-hub-pinned" aria-label="置顶开发入口">
          <div className="erp-dev-hub-section-head">
            <Text strong>置顶入口 / Pinned</Text>
            <Text className="erp-dev-hub-toolbar__note">
              保存在当前浏览器 / Local browser
            </Text>
          </div>
          {pinnedItems.length > 0 ? (
            <div className="erp-dev-hub-pinned__grid">
              {pinnedItems.map((item) => (
                <EntryCard
                  key={item.key}
                  item={item}
                  compact
                  pinned={pinnedRouteSet.has(item.route)}
                  onOpen={handleEntryOpen}
                  onTogglePinned={handleTogglePinned}
                />
              ))}
            </div>
          ) : (
            <Text className="erp-dev-hub-pinned__empty">
              用入口卡片右上角图钉把常用页面固定在这里。
            </Text>
          )}
        </section>

        <section className="erp-dev-hub-recent" aria-label="最近访问入口">
          <div className="erp-dev-hub-section-head">
            <Text strong>最近访问 / Recent</Text>
            <Text className="erp-dev-hub-toolbar__note">
              保存在当前浏览器 / Local browser
            </Text>
          </div>
          {recentItems.length > 0 ? (
            <div className="erp-dev-hub-recent__grid">
              {recentItems.map((item) => (
                <EntryCard
                  key={item.key}
                  item={item}
                  compact
                  pinned={pinnedRouteSet.has(item.route)}
                  onOpen={handleEntryOpen}
                  onTogglePinned={handleTogglePinned}
                />
              ))}
            </div>
          ) : (
            <Text className="erp-dev-hub-recent__empty">
              点击任一入口后会在这里保留最近访问记录。
            </Text>
          )}
        </section>

        <section className="erp-dev-hub-toolbar" aria-label="开发入口筛选">
          <Input.Search
            allowClear
            placeholder="搜索入口、路径或资料来源"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <Segmented
            className="erp-dev-hub-group-filter"
            value={group}
            options={groupOptions}
            onChange={(value) => setGroup(value)}
          />
          <Text className="erp-dev-hub-toolbar__note">
            当前匹配 / Matches {items.length} / {DEV_HUB_ITEMS.length}
          </Text>
        </section>

        {items.length > 0 ? (
          <section className="erp-dev-hub-grid" aria-label="开发入口列表">
            {items.map((item) => (
              <EntryCard
                key={item.key}
                item={item}
                pinned={pinnedRouteSet.has(item.route)}
                onOpen={handleEntryOpen}
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
