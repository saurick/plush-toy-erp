import React, { useMemo } from 'react'
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Empty,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import SearchInput from '@/common/components/SearchInput'
import {
  BUSINESS_HELP_TYPE_PRESENTATION,
  BUSINESS_USABILITY_CATALOG,
  BUSINESS_USABILITY_STATUS,
  BUSINESS_USABILITY_STATUS_PRESENTATION,
} from '../../erp/config/businessUsabilityCatalog.mjs'
import DevPageNav from '../components/DevPageNav.jsx'
import {
  DEV_BUSINESS_USABILITY_ALL_ROLES,
  DEV_BUSINESS_USABILITY_ALL_STATUS,
  DEV_BUSINESS_USABILITY_PAGE_SIZE,
  DEV_BUSINESS_USABILITY_ROLE_OPTIONS,
  DEV_BUSINESS_USABILITY_STATUS_OPTIONS,
  buildBusinessUsabilitySummary,
  filterBusinessUsabilityEntries,
  getBusinessUsabilityRoleLabels,
} from '../config/devBusinessUsability.mjs'
import '../styles/dev-business-usability.css'

const { Paragraph, Text, Title } = Typography

const STATUS_COLOR = Object.freeze({
  [BUSINESS_USABILITY_STATUS.COVERED]: 'green',
  [BUSINESS_USABILITY_STATUS.PARTIAL]: 'gold',
  [BUSINESS_USABILITY_STATUS.MISSING]: 'red',
})

function replaceQueryValue(searchParams, key, value, emptyValue = '') {
  const next = new URLSearchParams(searchParams)
  if (!value || value === emptyValue) next.delete(key)
  else next.set(key, value)
  return next
}

export default function DevBusinessUsabilityPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const keyword = searchParams.get('q') || ''
  const status = searchParams.get('status') || DEV_BUSINESS_USABILITY_ALL_STATUS
  const role = searchParams.get('role') || DEV_BUSINESS_USABILITY_ALL_ROLES
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

  const updateQuery = (key, value, emptyValue = '') => {
    setSearchParams(replaceQueryValue(searchParams, key, value, emptyValue), {
      replace: true,
    })
  }

  const columns = useMemo(
    () => [
      {
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
    <div className="erp-dev-business-usability-page erp-dev-workspace-page">
      <DevPageNav sourcePath="web/src/erp/config/businessUsabilityCatalog.mjs" />

      <header className="erp-dev-business-usability-header">
        <Space size={8} wrap>
          <QuestionCircleOutlined aria-hidden="true" />
          <Text className="erp-dev-business-usability-kicker">只读检查</Text>
        </Space>
        <Title level={1}>员工能不能看懂、能不能自己完成？</Title>
        <Paragraph>
          把正式业务页面、页内说明和岗位帮助放在一起核对。这里只看说明是否够用，不修改业务数据，也不建立第二套权限、岗位责任或业务链。
        </Paragraph>
      </header>

      <main className="erp-dev-business-usability-shell">
        <Alert
          showIcon
          type="info"
          message="推荐岗位不是权限，覆盖状态也不是客户验收"
          description={
            <span>
              岗位标签只表示该页面被哪些岗位帮助列为常用入口；实际能否进入和操作仍以正式权限为准。业务上下游继续到
              <Link to="/__dev/status-flows">业务链观察</Link>
              核对。
            </span>
          }
        />

        <section
          className="erp-dev-business-usability-summary"
          aria-label="业务易用性覆盖摘要"
        >
          {[
            ['正式业务页', summary.total],
            ['已接页内帮助', summary.pageHelpCount],
            ['已完整覆盖', summary.covered],
            ['局部解释条目', summary.explanationCount],
          ].map(([label, value]) => (
            <Card key={label} size="small">
              <Text type="secondary">{label}</Text>
              <strong>{value}</strong>
            </Card>
          ))}
        </section>

        <Card className="erp-dev-business-usability-filters" size="small">
          <SearchInput
            allowClear
            value={keyword}
            placeholder="搜索页面、任务、公式、来源或岗位"
            aria-label="搜索业务易用性说明"
            onChange={(event) => updateQuery('q', event.target.value)}
          />
          <Select
            value={status}
            options={DEV_BUSINESS_USABILITY_STATUS_OPTIONS}
            aria-label="按说明覆盖状态筛选"
            onChange={(value) =>
              updateQuery('status', value, DEV_BUSINESS_USABILITY_ALL_STATUS)
            }
          />
          <Select
            showSearch
            optionFilterProp="label"
            value={role}
            options={DEV_BUSINESS_USABILITY_ROLE_OPTIONS}
            aria-label="按岗位帮助推荐筛选"
            onChange={(value) =>
              updateQuery('role', value, DEV_BUSINESS_USABILITY_ALL_ROLES)
            }
          />
          <Text type="secondary">当前显示 {filteredEntries.length} 个页面</Text>
        </Card>

        <Card className="erp-dev-business-usability-table-card">
          <div className="erp-dev-business-usability-table-head">
            <div>
              <CheckCircleOutlined aria-hidden="true" />
              <Title level={2}>页面说明覆盖</Title>
            </div>
            <Text type="secondary">
              优先补高频、易错和需要跨岗位交接的页面。
            </Text>
          </div>
          <Table
            rowKey="key"
            size="small"
            columns={columns}
            dataSource={filteredEntries}
            pagination={{
              pageSize: DEV_BUSINESS_USABILITY_PAGE_SIZE,
              hideOnSinglePage: true,
              showSizeChanger: false,
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
