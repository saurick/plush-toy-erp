import React, { Suspense, useLayoutEffect, useRef, useState } from 'react'
import { Button } from 'antd'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import { Loading } from '@/common/components/loading'
import SearchInput from '@/common/components/SearchInput'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import { MermaidDiagram } from '@/common/components/markdown'
import { lazyWithDynamicImportRetry } from '@/common/utils/lazyImportRetry.mjs'
import DevUIDesignCallouts from './DevUIDesignCallouts.jsx'

const DevUIPageStateExamples = lazyWithDynamicImportRetry(
  () => import('./DevUIPageStateExamples.jsx')
)

const MECHANISMS = {
  navigation: {
    chapter: '页面结构',
    Example: NavigationExample,
    points: [
      { key: 'query', title: '查询条件', description: '试搜 A、B 或 C。打开详情后仍能看到来源查询；查不到时清除条件，不清空整页。' },
      { key: 'record', title: '选中具体记录', description: '从某一行打开对应详情。进入详情后先核对名称和状态，避免在相似记录之间认错对象。' },
      { key: 'return', title: '回到原列表', description: '点击“返回原列表”，核对查询和选中记录；焦点回到刚才的详情入口，可继续键盘操作。' },
    ],
  },
  states: {
    chapter: '状态与恢复',
    Example: ReadStateExample,
    points: [
      { key: 'state', title: '选择读取场景', description: '对比首次读取、同条件刷新、没有匹配和读取失败。切换手机任务与电脑切页可核对各自等待范围。' },
      { key: 'result', title: '原位显示结果', description: '手机页签、筛选和电脑导航可继续使用。同一查询刷新时保留上次结果；读取失败与暂无记录分别提示。' },
      { key: 'recovery', title: '按原因恢复', description: '等待时可完成读取；没有匹配时清除条件；失败在原区重试。同一查询刷新失败后，选中的记录仍在。' },
    ],
  },
  data: {
    chapter: '业务汇总口径',
    Example: DataExample,
    points: [
      { key: 'table', title: '精确比较看表格', description: '同一查询范围、单位和筛选条件下按列对比数值。未知值应标明待核对，不能当作零。' },
      { key: 'trend', title: '时间变化看趋势', description: '先读时间、单位和范围，再看涨跌。图与明细须使用同一批有权限查看的数据。' },
      { key: 'source', title: '来源与依赖看关系', description: '箭头表示来源记录经过相同筛选后形成汇总，同时能回看明细。汇总范围由正式规则决定。' },
    ],
  },
  responsive: {
    chapter: '响应式与动效',
    Example: ResponsiveExample,
    points: [
      { key: 'identity', title: '对象始终可辨认', description: '切换宽屏或窄屏时，当前对象和主标题保持一致，读者能确认自己还在处理同一件事。' },
      { key: 'fields', title: '字段重排后仍完整', description: '宽屏横向比较，窄屏按组换行。较宽的明细在自己的区域内滚动，不把整页撑宽。' },
      { key: 'action', title: '风险和下一步都能找到', description: '窄屏也能看到风险原因和下一步；减少动态效果时仍用文字、位置和选中状态反馈变化。' },
    ],
  },
}

const SAMPLE_ORDERS = [
  { name: '样例订单 A', date: '10 月 20 日', quantity: 1280, state: '待处理' },
  { name: '样例订单 B', date: '10 月 21 日', quantity: 96, state: '已完成' },
  { name: '样例订单 C', date: '10 月 22 日', quantity: 240, state: '待处理' },
]
const formatQuantity = new Intl.NumberFormat('zh-CN')

function SampleFields({ order }) {
  return (
    <div className="erp-design-wire-fields">
      <span>对象名称<b>{order.name}</b></span>
      <span>计划日期<b>{order.date}</b></span>
      <span>数量<b>{formatQuantity.format(order.quantity)} 件</b></span>
      <span>状态<b>{order.state}</b></span>
    </div>
  )
}

function NavigationExample({ point }) {
  const [query, setQuery] = useState(SAMPLE_ORDERS[0].name)
  const [selected, setSelected] = useState(null)
  const [showDetail, setShowDetail] = useState(false)
  const resultButton = useRef(null)
  const detailTitle = useRef(null)
  const results = SAMPLE_ORDERS.filter(({ name }) =>
    name.toLowerCase().includes(query.trim().toLowerCase())
  )

  useLayoutEffect(() => {
    if (showDetail) detailTitle.current?.focus({ preventScroll: true })
    else if (selected) resultButton.current?.focus({ preventScroll: true })
  }, [showDetail, selected])

  return (
    <figure className="erp-design-simulation" aria-label="下钻与返回示例">
      <figcaption>
        <strong>试一次下钻与返回</strong>
        <span>只操作虚构样例</span>
      </figcaption>
      <div className="erp-design-path-stops" aria-label="下钻与返回路径">
        <span data-active={!showDetail && !selected}>筛选列表</span>
        <i aria-hidden="true">→</i>
        <span data-active={showDetail}>查看详情</span>
        <i aria-hidden="true">→</i>
        <span data-active={!showDetail && Boolean(selected)}>返回原列表</span>
      </div>
      <div className="erp-design-wire-page">
        {point('query', showDetail ? (
          <span>来源查询：{query || '全部样例订单'}</span>
        ) : (
          <SearchInput
            aria-label="示例查询条件"
            placeholder="搜索样例订单"
            value={query}
            allowClear
            onSearch={(value) => {
              setQuery(value)
              setSelected(null)
            }}
          />
        ))}
        {point('record', showDetail ? (
          <>
            <h3 className="erp-design-example-title" tabIndex={-1} ref={detailTitle}>{selected.name} · 详情</h3>
            <SampleFields order={selected} />
          </>
        ) : results.length ? (
          <ul className="erp-design-example-results" aria-label="匹配的样例记录">
            {results.map((order) => (
              <li className="erp-design-example-record" key={order.name} data-selected={selected === order}>
                <strong>{order.name}</strong>
                <span>{formatQuantity.format(order.quantity)} 件</span>
                <Button
                  ref={selected === order ? resultButton : undefined}
                  aria-label={`查看${order.name}详情`}
                  onClick={() => {
                    setSelected(order)
                    setShowDetail(true)
                  }}
                >
                  查看详情
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty description="没有匹配的样例订单" />
        ))}
        {point('return', showDetail ? (
          <Button onClick={() => setShowDetail(false)}>返回原列表</Button>
        ) : (
          <p className="erp-design-example-hint" role="status">
            {selected ? `已回到${selected.name}，查询条件仍在。` : '返回后会保留当前查询和选中记录。'}
          </p>
        ))}
      </div>
    </figure>
  )
}

function ReadStateExample({ point }) {
  return (
    <figure className="erp-design-simulation" aria-label="页面读取与恢复示例">
      <figcaption>
        <strong>试一次读取与恢复</strong>
        <span>只操作虚构样例</span>
      </figcaption>
      <Suspense fallback={<Loading title="正在加载页面状态样例" />}>
        <DevUIPageStateExamples annotate={point} />
      </Suspense>
    </figure>
  )
}

const TREND = [
  { day: '10/18', quantity: 104 },
  { day: '10/19', quantity: 128 },
  { day: '10/20', quantity: 112 },
]

function DataExample({ point }) {
  return (
    <div className="erp-design-visual-options" aria-label="按阅读任务选择图形">
      {point('table', (
        <figure>
          <figcaption>精确比较 · 表格</figcaption>
          <table className="erp-design-mini-table" data-table-lines="fixed" aria-label="样例订单数量">
            <thead><tr><th scope="col">样例订单</th><th scope="col">数量（件）</th></tr></thead>
            <tbody>
              {SAMPLE_ORDERS.map(({ name, quantity }) => (
                <tr key={name}><td>{name}</td><td>{formatQuantity.format(quantity)}</td></tr>
              ))}
            </tbody>
          </table>
        </figure>
      ))}
      {point('trend', (
        <figure>
          <figcaption>时间变化 · 同一筛选下的每日件数</figcaption>
          <svg viewBox="0 0 240 56" preserveAspectRatio="none" aria-hidden="true">
            <path className="erp-design-chart-axis" d="M 1 2 V 53 H 239" />
            <polyline
              className="erp-design-chart-line"
              points={TREND.map(({ quantity }, index) => `${40 + index * 80},${53 - quantity / 3}`).join(' ')}
            />
          </svg>
          <dl className="erp-design-trend-values">
            {TREND.map(({ day, quantity }) => <div key={day}><dt>{day}</dt><dd>{quantity} 件</dd></div>)}
          </dl>
        </figure>
      ))}
      {point('source', (
        <figure>
          <figcaption>核对来源 · 关系图</figcaption>
          <div className="erp-design-mini-relation">
            <span>来源记录</span>
            <i aria-hidden="true">→</i>
            <div>同一筛选</div>
            <i aria-hidden="true">→</i>
            <b>汇总与明细</b>
          </div>
        </figure>
      ))}
    </div>
  )
}

function ResponsiveExample({ point }) {
  const [narrow, setNarrow] = useState(false)
  return (
    <figure className="erp-design-simulation" aria-label="相同内容的宽窄排列">
      <figcaption>
        <strong>保留判断信息，改变排列方式</strong>
        <span>只改变样例，不修改外观偏好</span>
      </figcaption>
      <Segmented
        aria-label="示例内容宽度"
        value={narrow ? 'narrow' : 'wide'}
        onChange={(value) => setNarrow(value === 'narrow')}
        options={[
          { value: 'wide', label: '宽屏排列' },
          { value: 'narrow', label: '窄屏排列' },
        ]}
      />
      <div className={`erp-design-responsive-demo${narrow ? ' is-narrow' : ''}`}>
        {point('identity', <strong>{SAMPLE_ORDERS[0].name}</strong>)}
        {point('fields', <SampleFields order={SAMPLE_ORDERS[0]} />)}
        {point('action', (
          <div className="erp-design-responsive-action">
            <span>交付风险：需要核对</span>
            <b>下一步：查看工序</b>
          </div>
        ))}
      </div>
    </figure>
  )
}

export default function DevUIDesignMechanisms({ topic, chapters }) {
  const { chapter, Example, points } = MECHANISMS[topic.key]
  const diagram = chapters.find((item) => item.title === chapter)?.diagrams[0]
  return (
    <section className="erp-design-mechanism" aria-labelledby="design-mechanism-title">
      <div className="erp-design-guide-heading">
        <div>
          <h2 id="design-mechanism-title">{topic.title}</h2>
          <p>{topic.description}</p>
        </div>
      </div>
      <DevUIDesignCallouts points={points}>
        {(point) => <Example point={point} />}
      </DevUIDesignCallouts>
      <div className="erp-design-mechanism-rule">
        <span className="erp-design-eyebrow">关系与边界</span>
        {diagram ? (
          <MermaidDiagram chart={diagram} label={`${topic.title}原理图`} />
        ) : (
          <p>对应原理图暂不可读，请查阅下方规范。</p>
        )}
      </div>
    </section>
  )
}
