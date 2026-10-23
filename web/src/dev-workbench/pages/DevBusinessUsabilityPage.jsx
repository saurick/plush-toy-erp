import React, { useEffect, useMemo } from 'react'
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'
import { Button, Card, Empty, Space, Tag, Typography } from 'antd'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import Table from '@/common/components/table/AppTable'
import SearchInput from '@/common/components/SearchInput'
import {
  BUSINESS_HELP_TYPE_PRESENTATION,
  BUSINESS_USABILITY_CATALOG,
  BUSINESS_USABILITY_STATUS,
  BUSINESS_USABILITY_STATUS_PRESENTATION,
} from '../../erp/config/businessUsabilityCatalog.mjs'
import DevPageNav from '../components/DevPageNav.jsx'
import { DEV_PAGINATION } from '../config/devPagination.mjs'
import {
  DEV_BUSINESS_USABILITY_ROUTE,
  DEV_PAGE_TITLE_BY_ROUTE,
  DEV_TESTING_ROUTE,
} from '../config/devRoutes.mjs'
import {
  DEV_BUSINESS_USABILITY_PAGE_SIZE,
  DEV_BUSINESS_USABILITY_ROLE_OPTIONS,
  DEV_BUSINESS_USABILITY_STATUS_OPTIONS,
  buildDevBusinessUsabilitySearch,
  buildBusinessUsabilitySummary,
  filterBusinessUsabilityEntries,
  getBusinessUsabilityRoleLabels,
  parseDevBusinessUsabilitySearch,
} from '../config/devBusinessUsability.mjs'
import '../styles/dev-business-usability.css'
import FilterSelect from '@/common/components/select/FilterSelect'

const { Paragraph, Text, Title } = Typography

const STATUS_COLOR = Object.freeze({
  [BUSINESS_USABILITY_STATUS.COVERED]: 'green',
  [BUSINESS_USABILITY_STATUS.PARTIAL]: 'gold',
  [BUSINESS_USABILITY_STATUS.MISSING]: 'red',
})

export default function DevBusinessUsabilityPage() {
  const location = useLocation()
  const testingReturnParams = new URLSearchParams(typeof location.state?.testingReturnSearch === 'string' ? location.state.testingReturnSearch : '')
  testingReturnParams.set('view', 'guide')
  const [searchParams, setSearchParams] = useSearchParams()
  const parsedSearch = useMemo(
    () => parseDevBusinessUsabilitySearch(searchParams),
    [searchParams]
  )
  const { keyword, status, role } = parsedSearch
  const summary = useMemo(() => buildBusinessUsabilitySummary(), [])
  const filteredEntries = useMemo(
    () =>
      filterBusinessUsabilityEntries(BUSINESS_USABILITY_CATALOG, {
        keyword,
        status,
        role,
      }),
    [keyword, role, status]
  )

  useEffect(() => {
    if (parsedSearch.canonical) return
    const nextSearch = buildDevBusinessUsabilitySearch(parsedSearch)
    setSearchParams(new URLSearchParams(nextSearch.slice(1)), {
      replace: true,
      state: location.state,
    })
  }, [location.state, parsedSearch, setSearchParams])

  const updateQuery = (patch) => {
    const nextSearch = buildDevBusinessUsabilitySearch({
      keyword,
      status,
      role,
      ...patch,
    })
    setSearchParams(new URLSearchParams(nextSearch.slice(1)), {
      replace: true,
      state: location.state,
    })
  }

  const columns = useMemo(
    () => [
      {
        align: 'left',
        title: '业务页面',
        key: 'page',
        width: 300,
        render: (_, entry) => (
          <div className="erp-dev-business-usability-page-cell">
            <Text type="secondary">{entry.sectionTitle}</Text>
            <strong>{entry.title}</strong>
            <p>{entry.task}</p>
          </div>
        ),
      },
      {
        title: '说明覆盖',
        key: 'coverage',
        width: 220,
        render: (_, entry) => (
          <div className="erp-dev-business-usability-coverage">
            <Tag color={STATUS_COLOR[entry.status]}>
              {BUSINESS_USABILITY_STATUS_PRESENTATION[entry.status]?.label ||
                entry.status}
            </Tag>
            <div>
              {entry.helpTypeKeys.map((type) => (
                <Tag key={type}>
                  {BUSINESS_HELP_TYPE_PRESENTATION[type]?.shortLabel || type}
                </Tag>
              ))}
            </div>
          </div>
        ),
      },
      {
        align: 'left',
        title: '员工自己完成的依据',
        key: 'self-service',
        width: 380,
        render: (_, entry) => (
          <dl className="erp-dev-business-usability-outcomes">
            <div>
              <dt>完成标准</dt>
              <dd>{entry.completion || '尚未接入统一页内说明。'}</dd>
            </div>
            <div>
              <dt>交接对象</dt>
              <dd>{entry.handoff || '请先按当前业务页面边界办理。'}</dd>
            </div>
          </dl>
        ),
      },
      {
        align: 'left',
        title: '岗位帮助推荐',
        key: 'roles',
        width: 210,
        render: (_, entry) => {
          const labels = getBusinessUsabilityRoleLabels(entry)
          return labels.length > 0 ? (
            <Space size={[4, 6]} wrap>
              {labels.map((label) => (
                <Tag key={label}>{label}</Tag>
              ))}
            </Space>
          ) : (
            <Text type="secondary">未列入岗位常用入口</Text>
          )
        },
      },
      {
        align: 'left',
        title: '继续核对',
        key: 'actions',
        width: 170,
        fixed: 'right',
        render: (_, entry) => (
          <Space direction="vertical" size={0}>
            <Button type="link" href={entry.path}>
              打开业务页
              <ArrowRightOutlined />
            </Button>
            <Button
              type="link"
              href={
                entry.roleHelpKeys[0]
                  ? `/erp/help-center?role=${encodeURIComponent(entry.roleHelpKeys[0])}`
                  : '/erp/help-center'
              }
            >
              查看岗位帮助
            </Button>
          </Space>
        ),
      },
    ],
    []
  )

  return (
    <div className="erp-dev-business-usability-page erp-dev-workspace-page erp-dev-tool-page">
      <DevPageNav sourcePath="web/src/erp/config/businessUsabilityCatalog.mjs" />

      <header className="erp-dev-business-usability-header">
        <div className="erp-dev-business-usability-heading">
          <Title level={1}>
            {DEV_PAGE_TITLE_BY_ROUTE[DEV_BUSINESS_USABILITY_ROUTE]}
          </Title>
          <Link to={`${DEV_TESTING_ROUTE}?${testingReturnParams}`}>返回测试指引</Link>
        </div>
      </header>

      <main className="erp-dev-business-usability-shell">
        <details className="erp-dev-disclosure erp-dev-business-usability-boundary">
          <summary>检查说明与边界</summary>
          <Paragraph>推荐岗位不是权限，覆盖状态也不是客户验收。</Paragraph>
          <Paragraph>
            岗位标签只表示该页面被哪些岗位帮助列为常用入口；实际能否进入和操作仍以正式权限为准。业务上下游继续到
            <Link to="/__dev/status-flows">业务链路</Link>
            核对。界面值的含义和布局取舍到<Link to="/__dev/ui-design?view=specification&topic=task-cards">工作中心设计说明</Link>对照。
          </Paragraph>
        </details>

        <section
          className="erp-dev-business-usability-summary"
          aria-label="页面说明覆盖摘要"
        >
          {[
            ['业务页面', summary.total],
            ['已完整覆盖', summary.covered],
            ['待补齐', summary.total - summary.covered],
          ].map(([label, value]) => (
            <div key={label} className="erp-dev-business-usability-summary__item">
              <Text type="secondary">{label}</Text>
              <strong>{value}</strong>
            </div>
          ))}
        </section>

        <Card className="erp-dev-business-usability-filters" size="small">
          <SearchInput
            allowClear
            value={keyword}
            placeholder="搜索页面、任务、公式、来源或岗位"
            aria-label="搜索页面说明"
            onSearch={(value) => updateQuery({ keyword: value })}
          />
          <FilterSelect
            emptyValue="all"
            label="说明覆盖状态"
            placeholder="说明覆盖状态"
            value={status}
            options={DEV_BUSINESS_USABILITY_STATUS_OPTIONS}
            aria-label="按说明覆盖状态筛选"
            onChange={(value) => updateQuery({ status: value })}
          />
          <FilterSelect
            emptyValue="all"
            label="岗位帮助"
            placeholder="岗位帮助"
            showSearch
            optionFilterProp="label"
            value={role}
            options={DEV_BUSINESS_USABILITY_ROLE_OPTIONS}
            aria-label="按岗位帮助推荐筛选"
            onChange={(value) => updateQuery({ role: value })}
          />
          <Text type="secondary">当前显示 {filteredEntries.length} 个页面</Text>
        </Card>

        <Card className="erp-dev-business-usability-table-card">
          <div className="erp-dev-business-usability-table-head">
            <div>
              <CheckCircleOutlined aria-hidden="true" />
              <Title level={2}>页面说明覆盖</Title>
            </div>
          </div>
          <Table
            key={buildDevBusinessUsabilitySearch(parsedSearch)}
            rowKey="key"
            size="small"
            columns={columns}
            dataSource={filteredEntries}
            pagination={{
              ...DEV_PAGINATION,
              pageSize: DEV_BUSINESS_USABILITY_PAGE_SIZE,
              hideOnSinglePage: true,
            }}
            scroll={{ x: 1280 }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="没有符合当前条件的页面"
                />
              ),
            }}
          />
        </Card>
      </main>
    </div>
  )
}
