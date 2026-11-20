import React, { useState } from 'react'
import { Button } from 'antd'
import AppTable from '@/common/components/table/AppTable.jsx'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import SlidingTabList from '@/common/components/navigation/SlidingTabList'
import {
  BusinessOperationPanel,
  BusinessPageLayout,
  BusinessToolbarWorkspace,
  PageHeaderCard,
  SearchInput,
} from '@/erp/components/business-list/BusinessListLayout.jsx'
import BusinessDetailsModal from '@/erp/components/business-list/BusinessDetailsModal.jsx'
import { BusinessViewSwitch } from '@/erp/components/business-visualizations/BusinessVisualizationFrame.jsx'
import { BusinessPageContext } from '@/erp/hooks/useBusinessPageContext.js'
import { ERPPageActionsContext } from '@/erp/components/ERPPageActions.jsx'
import { toolbarViews } from '../config/devToolbarExample.mjs'

const PURCHASE_ROWS = [
  {
    number: 'PO-DEMO-001',
    name: '短毛绒',
    supplier: '示例供应商甲',
    quantity: '120 米',
    followup: '交期将到，待确认送货',
  },
  {
    number: 'PO-DEMO-002',
    name: '填充棉',
    supplier: '示例供应商乙',
    quantity: '80 千克',
    followup: '到货有差异，待跟进处置',
  },
]

const PURCHASE_VIEWS = toolbarViews('purchase', 'current').map(
  ({ value, label }) => ({
    value,
    label,
    object: '采购单',
    action: value === 'orders' ? '查看订单' : '查看跟进',
    responsibility:
      value === 'orders'
        ? '查采购单、供应商和订购数量。'
        : '围绕同一批采购单，跟进交期和到货差异。',
    rows: PURCHASE_ROWS.map((row) => ({
      ...row,
      summary:
        value === 'orders' ? `${row.name} · ${row.quantity}` : row.followup,
    })),
  })
)

const PRODUCTION_VIEWS = [
  {
    value: 'orders',
    label: '生产订单',
    object: '生产单',
    action: '查看计划',
    responsibility: '计划：核对生产数量、交期和工艺路线。',
    rows: [
      { number: 'MO-DEMO-001', summary: '云朵小熊 · 120 件' },
      { number: 'MO-DEMO-002', summary: '水手企鹅 · 80 件' },
    ],
  },
  {
    value: 'execution',
    label: '生产执行',
    object: '执行批次',
    action: '查看批次',
    responsibility: '执行：跟进工序批次、内外发安排与质检进展。',
    rows: [
      { number: 'WIP-DEMO-001', summary: '云朵小熊 · 缝制 60 件' },
      { number: 'WIP-DEMO-002', summary: '水手企鹅 · 包装 40 件' },
    ],
  },
  {
    value: 'records',
    label: '生产记录',
    object: '生产记录',
    action: '查看记录',
    responsibility:
      '记录：核对领料、退料和成品收仓草稿；过账与入库各按原业务办理。',
    rows: [
      { number: 'PF-DEMO-001', summary: '云朵小熊领料 · 草稿' },
      { number: 'PF-DEMO-002', summary: '水手企鹅收仓 · 草稿' },
    ],
  },
  {
    value: 'exceptions',
    label: '异常处理',
    object: '处置申请',
    action: '查看处置',
    responsibility:
      '处置：核对异常申请、审批决定与执行记录；审批通过后仍需按条件显式执行。',
    rows: [
      { number: 'EX-DEMO-001', summary: '缝制不合格 6 件 · 待审批' },
      { number: 'EX-DEMO-002', summary: '补料重做 4 件 · 待执行' },
    ],
  },
]

function ComparisonPage({ business, entries }) {
  const production = business === 'production'
  const label = production ? '生产' : '采购'
  const [view, setView] = useState(entries[0].value)
  const [queries, setQueries] = useState({})
  const [details, setDetails] = useState(null)
  const entry = entries.find(({ value }) => value === view)
  const query = queries[view] || ''
  const keyword = query.trim().toLocaleLowerCase('zh-CN')
  const rows = entry.rows.filter((row) =>
    Object.values(row).some((value) =>
      value.toLocaleLowerCase('zh-CN').includes(keyword)
    )
  )
  const changeView = (value) => {
    setView(value)
    setDetails(null)
  }
  const options = entries.map(({ value, label: text }) => ({
    value,
    label: text,
  }))
  const navigation = production ? (
    <SlidingTabList
      className="erp-dev-tab-comparison__module-tabs"
      aria-label="生产对照办理入口"
      value={view}
      options={options}
      onChange={changeView}
    />
  ) : (
    <BusinessViewSwitch
      aria-label="采购对照查询视角"
      value={view}
      options={options}
      onChange={changeView}
    />
  )
  const columns = [
    { title: entry.object, dataIndex: 'number', width: 145 },
    { title: '当前内容', dataIndex: 'summary' },
    {
      title: '操作',
      key: 'action',
      width: 110,
      render: (_value, row) => (
        <Button type="link" onClick={() => setDetails(row)}>
          {entry.action}
        </Button>
      ),
    },
  ]
  return (
    <section
      className="erp-dev-tab-comparison__case"
      aria-label={`${label}页签位置对照`}
    >
      <h4>{production ? '生产：切换办理职责' : '采购：切换查看角度'}</h4>
      <p className="erp-dev-tab-comparison__reason">
        {production
          ? '计划、执行、记录与处置各有业务对象和操作，入口靠近标题。'
          : '同一批采购单，查单与跟进共用业务范围，分类与搜索放在一起。'}
      </p>
      <BusinessPageLayout>
        <PageHeaderCard
          title={production ? '生产管理' : '采购订单'}
          compact
          viewSwitch={production ? navigation : null}
        />
        <BusinessToolbarWorkspace
          contentSwitch={production ? null : navigation}
        >
          <BusinessPageLayout inWorkspace>
            <BusinessOperationPanel
              inWorkspace
              compact
              showSelection={false}
              filters={
                <SearchInput
                  aria-label={`${label}对照搜索`}
                  placeholder="搜编号或当前内容"
                  value={query}
                  resetKey={view}
                  onSearch={(value) =>
                    setQueries((previous) => ({ ...previous, [view]: value }))
                  }
                />
              }
            />
            <div className="erp-dev-tab-comparison__records">
              <AppTable
                rowKey="number"
                size="small"
                tableLayout="fixed"
                columns={columns}
                dataSource={rows}
                pagination={false}
                locale={{ emptyText: <Empty description="暂无匹配记录" /> }}
              />
            </div>
          </BusinessPageLayout>
        </BusinessToolbarWorkspace>
      </BusinessPageLayout>
      <p
        className="erp-dev-tab-comparison__responsibility"
        role="status"
        aria-label={`${label}对照当前职责`}
      >
        <strong>{entry.label}</strong> · {entry.responsibility}
      </p>
      <BusinessDetailsModal
        open={Boolean(details)}
        title={`${label}对照 · ${entry.action}`}
        record={
          details
            ? {
                ...details,
                responsibility: entry.responsibility,
                note: '本地虚构样例，仅演示查看，不办理真实业务。',
              }
            : null
        }
        columns={[
          ...columns.filter(({ key }) => key !== 'action'),
          ...(!production ? [{ title: '供应商', dataIndex: 'supplier' }] : []),
          { title: '办理职责', dataIndex: 'responsibility' },
          { title: '样例范围', dataIndex: 'note' },
        ]}
        onClose={() => setDetails(null)}
      />
    </section>
  )
}

export default function DevUIBusinessTabComparison() {
  const [revision, setRevision] = useState(0)
  const [context] = useState(() => ({
    adminProfile: null,
    moduleWorkspace: null,
    pageUIState: { values: new Map() },
  }))
  return (
    <section
      className="erp-dev-tab-comparison"
      aria-label="采购与生产页签位置对照"
    >
      <div className="erp-dev-tab-comparison__heading">
        <h3>采购与生产的页签位置</h3>
        <Button onClick={() => setRevision((value) => value + 1)}>
          重置对照
        </Button>
      </div>
      <p className="erp-dev-tab-comparison__reason">
        分别切换页签、搜索或查看记录，对照查看角度与办理职责的区别。各视图保留已提交搜索。
      </p>
      <ERPPageActionsContext.Provider value={null}>
        <BusinessPageContext.Provider value={context}>
          <div key={revision} className="erp-dev-tab-comparison__grid">
            <ComparisonPage business="purchase" entries={PURCHASE_VIEWS} />
            <ComparisonPage business="production" entries={PRODUCTION_VIEWS} />
          </div>
        </BusinessPageContext.Provider>
      </ERPPageActionsContext.Provider>
    </section>
  )
}
