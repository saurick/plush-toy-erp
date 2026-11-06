import React, { useEffect, useMemo, useState } from 'react'
import { Button, Calendar, Checkbox, List, Tag } from 'antd'
import { EyeOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import AppSelect from '@/common/components/select/AppSelect'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'
import {
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  BusinessToolbarWorkspace,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  SelectionClearAction,
  ToolbarButton,
} from '@/erp/components/business-list/BusinessListLayout.jsx'
import BusinessStatusFilter from '@/erp/components/business-list/BusinessStatusFilter.jsx'
import { BusinessViewSwitch } from '@/erp/components/business-visualizations/BusinessVisualizationFrame.jsx'
import {
  BusinessListToolbarActions,
  downloadBusinessListCSV,
} from '@/erp/components/business-list/BusinessListToolbarActions.jsx'
import { ColumnOrderModal } from '@/erp/components/business-list/ColumnOrderModal.jsx'
import BusinessDetailsModal from '@/erp/components/business-list/BusinessDetailsModal.jsx'
import { BusinessPageContext } from '@/erp/hooks/useBusinessPageContext.js'
import { ERPPageActionsContext } from '@/erp/components/ERPPageActions.jsx'
import {
  applyModuleColumnOrder,
  applyModuleColumnVisibility,
} from '@/erp/utils/moduleTableColumns.mjs'
import {
  TOOLBAR_EXAMPLES,
  TOOLBAR_SCENARIOS,
  filterToolbarRows,
  toolbarGrowthExplanation,
  toolbarRows,
  toolbarScopes,
  toolbarViews,
} from '../config/devToolbarExample.mjs'
import '../styles/dev-ui-toolbar-example.css'

const RESPONSIBILITIES = {
  content: [
    '内容切换 · 业务决定',
    '切换所查看的业务内容。少量稳定分类直接展示，较多分类使用搜索选择。',
  ],
  view: [
    '展示方式 · 按需出现',
    '同一业务范围可以按明细、分布或日历阅读，不新增业务层级。',
  ],
  quick: [
    '快捷条件 · 业务决定',
    '缩小同一份结果；名称、数量和常用项由岗位任务决定。',
  ],
  query: [
    '查询 · 共用交互',
    '输入后按搜索或 Enter 生效；清空、筛选与翻页规则共用。',
  ],
  tools: [
    '工具 · 共用位置',
    '导出和列设置复用真实组件；此处仅处理本地演示数据。',
  ],
  primary: [
    '主动作 · 按权限出现',
    '仅有相应业务能力时出现；查询页不为了布局补一个新建按钮。',
  ],
}

// Markers occupy no extra row inside the shared toolbar.
function MarkedPart({ role, highlight, children }) {
  return (
    <div
      className={`erp-dev-toolbar-example__part erp-dev-toolbar-example__part--${role}`}
      data-highlighted={highlight === role}
      data-toolbar-part={role}
    >
      {children}
    </div>
  )
}

function ExamplePage({ business, scenario, annotations, active }) {
  const example = TOOLBAR_EXAMPLES.find(({ key }) => key === business)
  const [context] = useState(() => ({
    adminProfile: null,
    moduleWorkspace: null,
    pageUIState: { values: new Map() },
  }))
  const [view, setView] = useState(toolbarViews(business, 'current')[0].value)
  const [presentation, setPresentation] = useState(
    business === 'tasks' ? 'list' : 'detail'
  )
  const [quick, setQuick] = useState('')
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)
  const [details, setDetails] = useState(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [columnSettings, setColumnSettings] = useState({})
  const [highlight, setHighlight] = useState(business === 'tasks' ? 'view' : 'content')
  const [feedback, setFeedback] = useState(
    '选择分类或记录，体验真实工具栏与表格。'
  )
  const [calendarDate, setCalendarDate] = useState(() => dayjs('2026-11-05'))
  useEffect(() => {
    const availableViews = toolbarViews(business, scenario)
    const availableScopes = toolbarScopes(business, scenario)
    setView((previous) => availableViews.some(({ value }) => value === previous) ? previous : availableViews[0].value)
    setScope((previous) => availableScopes.some(({ value }) => value === previous) ? previous : '')
    if (business === 'tasks') {
      setQuick((previous) => availableViews.some(({ value }) => value === previous) ? previous : '')
    }
    setPage(1)
    setSelected(null)
    setDetails(null)
    setFiltersOpen(false)
    setColumnsOpen(false)
  }, [business, scenario])
  const views = toolbarViews(business, scenario)
  const currentView = views.some(({ value }) => value === view)
    ? view
    : views[0].value
  const currentQuick = views.some(({ value }) => value === quick) ? quick : ''
  const scopes = toolbarScopes(business, scenario)
  const currentScope = scopes.some(({ value }) => value === scope) ? scope : ''
  const rows = useMemo(
    () => toolbarRows(business, scenario),
    [business, scenario]
  )
  const category = currentView.startsWith('extra-')
    ? currentView
    : business === 'history' && currentView !== 'all'
      ? currentView
      : business === 'tasks'
        ? currentQuick
        : business === 'purchase' && currentView === 'exceptions'
          ? 'exceptions'
          : ''
  const baseRows = filterToolbarRows(rows, { query, scope: currentScope })
  const queryRows = filterToolbarRows(baseRows, { category })
  const hasQuick = business === 'tasks' || (business === 'purchase' && currentView === 'orders')
  const hasPrimary = business === 'purchase' && currentView === 'orders'
  const filtered = filterToolbarRows(queryRows, {
    status: hasPrimary ? quick : '',
  })
  const settingsKey = `${currentView}:${presentation}`
  const settings = columnSettings[settingsKey] || { order: [], hidden: [] }
  const columns = [
    {
      title: business === 'tasks' ? '任务编号' : '记录编号',
      dataIndex: 'number',
      width: 260,
    },
    {
      title: business === 'tasks' ? '任务内容' : '材料 / 产品',
      dataIndex: 'name',
      width: 160,
    },
    { title: example.scope, dataIndex: 'scopeLabel', width: 160 },
    ...(hasPrimary
      ? [
          {
            title: '状态',
            dataIndex: 'statusLabel',
            width: 110,
            render: (value) => <Tag>{value}</Tag>,
          },
        ]
      : []),
    {
      title:
        business === 'tasks'
          ? '到期日期'
          : business === 'inventory' && currentView === 'lots'
            ? '入库日期'
            : '日期',
      dataIndex: 'date',
      width: 120,
    },
    ...(business === 'inventory' || business === 'purchase'
      ? [
          {
            title:
              business === 'inventory' && currentView === 'txns'
                ? '变动数量'
                : '数量',
            dataIndex: 'quantity',
            width: 100,
            align: 'right',
          },
        ]
      : []),
  ]
  const visibleColumns = applyModuleColumnVisibility(
    applyModuleColumnOrder(columns, settings.order),
    settings.hidden
  )
  const change = (setter) => (value) => {
    setter(value)
    setPage(1)
    setSelected(null)
  }
  const mark = (role, children, props = {}) => (
    <MarkedPart role={role} highlight={annotations ? highlight : ''} {...props}>
      {children}
    </MarkedPart>
  )
  const options = views
  const isCalendar = business === 'tasks' && presentation === 'calendar'
  const isDistribution =
    business === 'inventory' &&
    currentView === 'balances' &&
    presentation === 'distribution'
  const roles = [
    business === 'tasks' ? 'view' : 'content',
    ...(business === 'inventory' && currentView === 'balances' ? ['view'] : []),
    ...(hasQuick ? ['quick'] : []),
    'query',
    ...(!isCalendar ? ['tools'] : []),
    ...(hasPrimary ? ['primary'] : []),
  ]
  const contentSwitch =
    business === 'tasks'
      ? null
      : mark(
          'content',
          scenario === 'categories' || business === 'history' ? (
            <AppSelect
              aria-label={`${example.label}内容分类`}
              allowClear={false} // 不可清空：内容分类必须保留一个当前视图。
              value={currentView}
              showSearch
              optionFilterProp="label"
              onChange={change(setView)}
              options={
                scenario === 'categories'
                  ? [
                      {
                        label: '现有分类示意',
                        options: toolbarViews(business, 'current'),
                      },
                      {
                        label: '增长假设',
                        options: views.filter(({ value }) =>
                          value.startsWith('extra-')
                        ),
                      },
                    ]
                  : views
              }
              className="erp-dev-toolbar-example__classification"
            />
          ) : (
            <BusinessViewSwitch
              aria-label={`${example.label}内容分类`}
              appearance="chips"
              value={currentView}
              options={options}
              onChange={change(setView)}
            />
          )
        )
  const viewSwitch =
    business === 'tasks'
      ? mark(
          'view',
        <BusinessViewSwitch
          aria-label="待办展示方式"
          value={presentation}
          onChange={setPresentation}
          options={[
            { value: 'list', label: '列表' },
            { value: 'calendar', label: '日历' },
            ]}
        />
        )
      : business === 'inventory' && currentView === 'balances'
        ? mark(
            'view',
          <SlidingSegmented
            aria-label="库存余额展示方式"
            value={presentation}
            onChange={setPresentation}
            options={[
              { value: 'detail', label: '余额明细' },
              { value: 'distribution', label: '仓库分布' },
              ]}
          />
          )
        : null
  const quickOptions =
    business === 'tasks'
      ? toolbarViews('tasks', 'current')
      : [
          { value: '', label: '不限状态' },
          { value: 'draft', label: '草稿' },
          { value: 'confirmed', label: '已确认' },
          { value: 'closed', label: '已关闭' },
        ]
  const counts = Object.fromEntries(
    quickOptions.map(({ value }) => [
      value,
      filterToolbarRows(
        business === 'tasks' ? baseRows : queryRows,
        business === 'tasks' ? { category: value } : { status: value }
      ).length,
    ])
  )
  const clearFilters = () => {
    setScope('')
    setQuick('')
    setPage(1)
    setSelected(null)
  }
  const visibleSelection =
    filtered.find(({ id }) => id === selected?.id) || null
  const totals = scopes
    .map(({ value, label }) => ({
      name: label,
      quantity: filtered
        .filter((row) => row.scope === value)
        .reduce((sum, row) => sum + row.quantity, 0),
    }))
    .filter(({ quantity }) => quantity)

  return (
    <section
      hidden={!active}
      className="erp-dev-toolbar-example__page"
      aria-label={`${example.label}组合样例`}
      data-business={business}
    >
      <ERPPageActionsContext.Provider value={null}>
        <BusinessPageContext.Provider value={context}>
          {annotations && (
            <div
              className="erp-dev-toolbar-example__annotations"
              aria-label="工具栏职责标注"
            >
              <div className="erp-dev-toolbar-example__legend">
                {roles.map((role) => (
                  <Button
                    key={role}
                    size="small"
                    aria-pressed={highlight === role}
                    onClick={() => setHighlight(role)}
                  >
                    {RESPONSIBILITIES[role][0]}
                  </Button>
                ))}
              </div>
              <p>
                {
                  RESPONSIBILITIES[
                    roles.includes(highlight) ? highlight : roles[0]
                  ][1]
                }
              </p>
            </div>
          )}
          <BusinessPageLayout>
            <PageHeaderCard title={example.label} compact />
            <BusinessToolbarWorkspace contentSwitch={contentSwitch}>
              <BusinessPageLayout inWorkspace>
                <BusinessOperationPanel
                  inWorkspace
                  compact
                  viewSwitch={viewSwitch}
                  filtersOpen={active && filtersOpen}
                  onFiltersOpenChange={setFiltersOpen}
                  activeFilterCount={
                    Number(Boolean(currentScope)) + Number(hasQuick && Boolean(business === 'tasks' ? currentQuick : quick))
                  }
                  onClearFilters={clearFilters}
                  filters={
                    <>
                      {hasQuick &&
                        mark(
                          'quick',
                          <BusinessStatusFilter
                            value={business === 'tasks' ? currentQuick : quick}
                            options={quickOptions}
                            counts={counts}
                            allCount={counts['']}
                            allLabel={
                              business === 'tasks' ? '全部待办' : '不限状态'
                            }
                            aria-label={`${example.label}快捷条件`}
                            onChange={change(setQuick)}
                          />,
                          { inline: true }
                        )}
                      {mark(
                        'query',
                        <SearchInput
                          aria-label={`${example.label}搜索`}
                          value={query}
                          onSearch={change(setQuery)}
                          placeholder={example.placeholder}
                          searchHint="可搜索演示编号、材料或产品名称、仓库、供应商和人员"
                        />,
                        { primarySearch: true }
                      )}
                      <SelectFilter
                        aria-label={example.scope}
                        value={currentScope}
                        onChange={change(setScope)}
                        options={scopes}
                        placeholder={`选择${example.scope}`}
                        showSearch
                        optionFilterProp="label"
                      />
                      {business === 'tasks' && scenario === 'categories' && (
                        <SelectFilter
                          aria-label="扩展待办分类"
                          value={
                            currentQuick.startsWith('extra-')
                              ? currentQuick
                              : ''
                          }
                          onChange={change(setQuick)}
                          options={views.filter(({ value }) =>
                            value.startsWith('extra-')
                          )}
                          placeholder="选择扩展分类"
                          showSearch
                          optionFilterProp="label"
                        />
                      )}
                    </>
                  }
                  actions={
                    !isCalendar &&
                    mark(
                      'tools',
                      <BusinessListToolbarActions
                        exportDisabled={!filtered.length}
                        columnOrderDisabled={isDistribution}
                        columnOrderDisabledReason={
                          isDistribution
                            ? '仓库分布不使用表格列，切换余额明细后可调整列'
                            : ''
                        }
                        onExport={() => {
                          downloadBusinessListCSV({
                            filename: `演示-${example.label}.csv`,
                            columns,
                            rows: filtered,
                          })
                          setFeedback(
                            `已导出本地演示结果，共 ${filtered.length} 条。`
                          )
                        }}
                        onOpenColumnOrder={() => setColumnsOpen(true)}
                      />
                    )
                  }
                  primaryAction={
                    hasPrimary &&
                    mark(
                      'primary',
                      <ToolbarButton
                        type="primary"
                        aria-label="新建采购订单"
                        icon={<PlusOutlined />}
                        onClick={() =>
                          setFeedback(
                            '主动作示意：新建采购订单。完整编辑请在“业务表单与明细”样例中体验。'
                          )
                        }
                      >
                        新建采购订单
                      </ToolbarButton>
                    )
                  }
                  showSelection={!isCalendar && !isDistribution}
                >
                  <SelectionActionBar
                    selectedCount={visibleSelection ? 1 : 0}
                    selectedLabel={visibleSelection?.number}
                  >
                    <ToolbarButton
                      aria-label="查看明细"
                      icon={<EyeOutlined />}
                      disabled={!visibleSelection}
                      onClick={() => setDetails(visibleSelection)}
                    >
                      查看明细
                    </ToolbarButton>
                    <SelectionClearAction
                      selectedCount={visibleSelection ? 1 : 0}
                      onClear={() => setSelected(null)}
                    />
                  </SelectionActionBar>
                </BusinessOperationPanel>
                {isCalendar ? (
                  <div
                    className="erp-dev-toolbar-example__calendar"
                    aria-label="本地待办日历"
                  >
                    <Calendar
                      fullscreen={false}
                      value={calendarDate}
                      onChange={setCalendarDate}
                    />
                    <List
                      header={`${calendarDate.format('YYYY-MM-DD')} · 演示待办`}
                      dataSource={filtered.filter(
                        ({ date }) => date === calendarDate.format('YYYY-MM-DD')
                      )}
                      locale={{ emptyText: '当日没有匹配待办' }}
                      renderItem={(row) => (
                        <List.Item
                          actions={[
                            <Button
                              key="details"
                              onClick={() => setDetails(row)}
                            >
                              查看明细
                            </Button>,
                          ]}
                        >
                          {row.name}
                        </List.Item>
                      )}
                    />
                  </div>
                ) : isDistribution ? (
                  <List
                    bordered
                    aria-label="演示仓库分布"
                    dataSource={totals}
                    locale={{ emptyText: '暂无匹配记录' }}
                    renderItem={(row) => (
                      <List.Item>
                        <span>{row.name}</span>
                        <strong>
                          {row.quantity.toLocaleString('zh-CN')} 件
                        </strong>
                      </List.Item>
                    )}
                  />
                ) : (
                  <BusinessDataTable
                    rowKey="id"
                    columns={visibleColumns}
                    dataSource={filtered}
                    onOpenRecord={setDetails}
                    rowSelection={{
                      type: 'radio',
                      selectedRowKeys: visibleSelection
                        ? [visibleSelection.id]
                        : [],
                      onChange: (_keys, records) =>
                        setSelected(records[0] || null),
                    }}
                    pagination={{
                      current: Math.min(
                        page,
                        Math.max(1, Math.ceil(filtered.length / 5))
                      ),
                      pageSize: 5,
                      total: filtered.length,
                      showSizeChanger: false,
                      onChange: setPage,
                    }}
                  />
                )}
              </BusinessPageLayout>
            </BusinessToolbarWorkspace>
          </BusinessPageLayout>
          <p
            className="erp-dev-toolbar-example__feedback"
            role="status"
            aria-label="组合样例操作结果"
          >
            {feedback}
          </p>
          <BusinessDetailsModal
            open={active && Boolean(details)}
            record={details}
            title="演示记录详情"
            columns={[...columns, { title: '说明', dataIndex: 'note' }]}
            onClose={() => setDetails(null)}
          />
          <ColumnOrderModal
            open={active && columnsOpen}
            columns={columns}
            order={settings.order}
            hiddenColumns={settings.hidden}
            moduleTitle={`演示${example.label}`}
            onClose={() => setColumnsOpen(false)}
            onChange={(order, hidden) => {
              setColumnSettings((previous) => ({
                ...previous,
                [settingsKey]: { order, hidden },
              }))
              setColumnsOpen(false)
              setFeedback('演示列设置已更新，仅保留在本次样例中。')
            }}
          />
        </BusinessPageContext.Provider>
      </ERPPageActionsContext.Provider>
    </section>
  )
}

export default function DevUIBusinessToolbarExample() {
  const [business, setBusiness] = useState('inventory')
  const [visited, setVisited] = useState(['inventory'])
  const [scenarios, setScenarios] = useState({})
  const [annotations, setAnnotations] = useState(true)
  const [revision, setRevision] = useState(0)
  const scenario = scenarios[business] || 'current'
  return (
    <section className="erp-dev-toolbar-example" aria-label="四业务工具栏组合">
      <div className="erp-dev-toolbar-example__settings">
        <SlidingSegmented
          aria-label="组合示例业务"
          value={business}
          options={TOOLBAR_EXAMPLES.map(({ key, label }) => ({
            value: key,
            label,
          }))}
          onChange={(value) => {
            setVisited((previous) =>
              previous.includes(value) ? previous : [...previous, value]
            )
            setBusiness(value)
          }}
        />
        <AppSelect
          aria-label="组合示例增长场景"
          allowClear={false} // 不可清空：场景切换必须保留一个当前演示场景。
          value={scenario}
          options={TOOLBAR_SCENARIOS}
          onChange={(value) =>
            setScenarios((previous) => ({ ...previous, [business]: value }))
          }
          className="erp-dev-toolbar-example__scenario"
        />
        <Checkbox
          checked={annotations}
          onChange={(event) => setAnnotations(event.target.checked)}
        >
          显示职责标注
        </Checkbox>
        <Button
          aria-label="恢复示例"
          icon={<ReloadOutlined />}
          onClick={() => {
            setBusiness('inventory')
            setVisited(['inventory'])
            setScenarios({})
            setAnnotations(true)
            setRevision((value) => value + 1)
          }}
        >
          恢复示例
        </Button>
      </div>
      <p className="erp-dev-toolbar-example__explanation">
        {toolbarGrowthExplanation(business, scenario)}
      </p>
      {visited.map((key) => (
        <ExamplePage
          key={`${revision}:${key}`}
          business={key}
          scenario={scenarios[key] || 'current'}
          annotations={annotations}
          active={business === key}
        />
      ))}
    </section>
  )
}
