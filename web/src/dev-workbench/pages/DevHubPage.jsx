import React, { useMemo, useState } from 'react'
import { BookOutlined } from '@ant-design/icons'
import { Button, Select, Typography } from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import SearchInput from '@/common/components/SearchInput'
import DevPageNav from '../components/DevPageNav.jsx'
import DevTaskNav from '../components/DevTaskNav.jsx'
import DevToolTable from '../components/DevToolTable.jsx'
import {
  DEV_HUB_ITEMS,
  DEV_HUB_PINNED_STORAGE_KEY,
  buildDevHubPinnedItems,
  filterDevHubItems,
  normalizeDevHubPinnedRoutes,
  toggleDevHubPinnedRoute,
} from '../config/devHub.mjs'
import { DEV_WORKSPACE_NAV_ITEMS } from '../config/devRoutes.mjs'
import { DEV_WORKBENCH_GUIDE } from '../config/devWorkbenchFlow.mjs'

const { Text, Title } = Typography
const VIEW_ITEMS = [
  { value: 'tools', label: '全部工具' },
  { value: 'pinned', label: '常用工具' },
  { value: 'path', label: '使用指南' },
]
const GROUP_OPTIONS = [
  { value: 'all', label: '全部领域' },
  ...DEV_WORKSPACE_NAV_ITEMS.filter((item) => item.key !== 'overview').map(
    (item) => ({ value: item.key, label: item.label })
  ),
]

function readPinnedRoutes() {
  try {
    return normalizeDevHubPinnedRoutes(
      JSON.parse(
        window.localStorage?.getItem(DEV_HUB_PINNED_STORAGE_KEY) || '[]'
      )
    )
  } catch {
    return []
  }
}

export default function DevHubPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeView = VIEW_ITEMS.some(
    (item) => item.value === searchParams.get('view')
  )
    ? searchParams.get('view')
    : 'tools'
  const keyword = searchParams.get('q') || ''
  const group = GROUP_OPTIONS.some(
    (item) => item.value === searchParams.get('group')
  )
    ? searchParams.get('group')
    : 'all'
  const [pinnedRoutes, setPinnedRoutes] = useState(readPinnedRoutes)
  const items = useMemo(() => {
    const source =
      activeView === 'pinned'
        ? buildDevHubPinnedItems(DEV_HUB_ITEMS, pinnedRoutes)
        : DEV_WORKSPACE_NAV_ITEMS.flatMap((area) =>
            DEV_HUB_ITEMS.filter((item) => item.areaKey === area.key)
          )
    return filterDevHubItems(source, { keyword }).filter(
      (item) => group === 'all' || item.areaKey === group
    )
  }, [activeView, group, keyword, pinnedRoutes])
  const selectParam = (key, value, replace = false) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace })
  }
  const handleTogglePinned = (route) =>
    setPinnedRoutes((current) => {
      const next = toggleDevHubPinnedRoute(route, current)
      try {
        window.localStorage?.setItem(
          DEV_HUB_PINNED_STORAGE_KEY,
          JSON.stringify(next)
        )
      } catch {
        /* 浏览器偏好不可写时，入口仍可正常使用。 */
      }
      return next
    })
  const resetFilters = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('q')
    next.delete('group')
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="erp-dev-hub-page erp-dev-hub-page--index erp-dev-overview-page erp-dev-workspace-page">
      <DevPageNav />
      <header className="erp-dev-hub-header">
        <Title level={1} className="erp-dev-hub-title">
          总览
        </Title>
        <Text type="secondary">开发工具</Text>
      </header>
      <main className="erp-dev-hub-shell">
        <section className="erp-dev-overview-library">
          <div className="erp-dev-overview-library__navigation">
            <DevTaskNav
              className="erp-dev-overview-view-tabs"
              ariaLabel="总览视图"
              idPrefix="dev-overview"
              compact
              items={VIEW_ITEMS}
              value={activeView}
              onChange={(value) => selectParam('view', value)}
            />
          </div>
          <section
            id={`dev-overview-panel-${activeView === 'pinned' ? 'pinned' : 'tools'}`}
            role="tabpanel"
            aria-labelledby={`dev-overview-tab-${activeView === 'pinned' ? 'pinned' : 'tools'}`}
            hidden={activeView === 'path'}
          >
            <div className="erp-dev-overview-library__toolbar">
              <SearchInput
                allowClear
                aria-label="搜索全部开发工具"
                placeholder="搜索工具名称或用途"
                value={keyword}
                onChange={(event) => selectParam('q', event.target.value, true)}
              />
              <Select
                aria-label="全部开发工具分组"
                value={group}
                options={GROUP_OPTIONS}
                onChange={(value) => selectParam('group', value, true)}
              />
              {keyword || group !== 'all' ? (
                <Button onClick={resetFilters}>清除筛选</Button>
              ) : null}
              <Text
                type="secondary"
                className="erp-dev-overview-library__count"
                aria-live="polite"
              >
                {items.length} 个工具
              </Text>
            </div>
            {activeView !== 'path' ? (
              <DevToolTable
                ariaLabel={
                  activeView === 'pinned' ? '常用开发工具' : '全部开发工具'
                }
                items={items}
                showGroup
                pinnedRoutes={pinnedRoutes}
                onTogglePinned={handleTogglePinned}
                onReset={keyword || group !== 'all' ? resetFilters : undefined}
                emptyDescription={
                  activeView === 'pinned' && !keyword && group === 'all'
                    ? '还没有常用工具，在全部工具中点击图钉即可添加。'
                    : undefined
                }
              />
            ) : null}
          </section>
          <section
            id="dev-overview-panel-path"
            role="tabpanel"
            aria-labelledby="dev-overview-tab-path"
            hidden={activeView !== 'path'}
          >
            <div className="erp-dev-overview-guide-intro">
              <BookOutlined />
              <Text type="secondary">
                按当前任务选择工具，运行结果以工具内的实际记录为准。
              </Text>
            </div>
            <div className="erp-dev-tool-table-wrap">
              <table
                className="erp-dev-tool-table"
                aria-label="开发工具使用指南"
              >
                <thead>
                  <tr>
                    <th scope="col">任务</th>
                    <th scope="col">检查重点</th>
                    <th scope="col">工具入口</th>
                  </tr>
                </thead>
                <tbody>
                  {DEV_WORKBENCH_GUIDE.map((step) => (
                    <tr key={step.value}>
                      <th scope="row">{step.label}</th>
                      <td>{step.completion}</td>
                      <td>
                        <Link to={step.route}>{step.action}</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </main>
    </div>
  )
}
