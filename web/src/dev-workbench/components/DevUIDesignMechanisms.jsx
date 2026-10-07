import React, { useState } from 'react'
import { Button, Input } from 'antd'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import { MermaidDiagram } from '@/common/components/markdown'

const DIAGRAMS = {
  navigation: ['页面结构', 0],
  forms: ['页面结构', 1],
  states: ['状态与恢复', 0],
  data: ['业务汇总口径', 0],
  responsive: ['响应式与动效', 0],
}

function GhostFields() {
  return (
    <div className="erp-design-wire-fields">
      <span>
        对象名称<b>样例订单 A</b>
      </span>
      <span>
        计划日期<b>10 月 20 日</b>
      </span>
      <span>
        数量<b>1,280 件</b>
      </span>
      <span>
        状态<b>待处理</b>
      </span>
    </div>
  )
}

function NavigationExample() {
  const [detail, setDetail] = useState(false)
  const [query, setQuery] = useState('样例订单 A')
  return (
    <figure className="erp-design-simulation" aria-label="下钻与返回示例">
      <figcaption>
        <strong>试一次下钻与返回</strong>
        <span>只操作虚构样例</span>
      </figcaption>
      <div className="erp-design-path-stops">
        <span data-active={!detail}>筛选列表</span>
        <i>→</i>
        <span data-active={detail}>精确对象</span>
        <i>↩</i>
        <span>保留原条件</span>
      </div>
      {detail ? (
        <div className="erp-design-wire-page">
          <strong>样例订单 A · 详情</strong>
          <GhostFields />
          <Button onClick={() => setDetail(false)}>返回原列表</Button>
        </div>
      ) : (
        <div className="erp-design-wire-page">
          <Input
            aria-label="示例查询条件"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="erp-design-example-record">
            <span>样例订单 A</span>
            <span>1,280 件</span>
            <Button onClick={() => setDetail(true)}>查看样例详情</Button>
          </div>
          <small>输入任意查询备注，再打开并返回，观察输入是否保留。</small>
        </div>
      )}
    </figure>
  )
}

function FormsExample() {
  const [form, setForm] = useState('page')
  return (
    <figure className="erp-design-simulation" aria-label="整页、弹窗与抽屉对比">
      <figcaption>
        <strong>同样的内容，容器承担不同任务</strong>
      </figcaption>
      <Segmented
        aria-label="选择示例容器"
        value={form}
        onChange={setForm}
        options={[
          { value: 'page', label: '整页表单' },
          { value: 'modal', label: '局部弹窗' },
          { value: 'drawer', label: '上下文抽屉' },
        ]}
      />
      <div className={`erp-design-container-demo is-${form}`}>
        <div className="erp-design-container-base">
          <strong>业务列表</strong>
          {[1, 2, 3, 4].map((row) => (
            <div key={row}>
              <span>样例记录 {row}</span>
              <span>待处理</span>
              <span>查看</span>
            </div>
          ))}
        </div>
        <div className="erp-design-container-window">
          <header>
            {form === 'page'
              ? '编辑整张单据'
              : form === 'modal'
                ? '选择来源 / 局部确认'
                : '任务详情 / 上下文'}
            <span>{form === 'page' ? '连续填写' : '关闭后回原处'}</span>
          </header>
          <GhostFields />
          <footer>
            <span>{form === 'page' ? '返回列表' : '取消 / 关闭'}</span>
            <b>
              {form === 'page'
                ? '保存'
                : form === 'modal'
                  ? '确认选择'
                  : '当前可用动作'}
            </b>
          </footer>
        </div>
      </div>
    </figure>
  )
}

function RecoveryExample() {
  const [state, setState] = useState('ready')
  const [draft, setDraft] = useState('需要核对交付数量')
  return (
    <figure className="erp-design-simulation" aria-label="失败后保留输入示例">
      <figcaption>
        <strong>失败发生在当前操作处</strong>
        <span>失败和成功均为演示</span>
      </figcaption>
      <div className="erp-design-recovery-demo">
        <div className="erp-design-wire-page">
          <label htmlFor="design-example-draft">待保存的说明</label>
          <Input
            id="design-example-draft"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="erp-design-example-actions">
            <Button onClick={() => setState('failed')}>模拟保存失败</Button>
            {state === 'failed' ? (
              <Button type="primary" onClick={() => setState('saved')}>
                重试示例
              </Button>
            ) : null}
            <Button onClick={() => setState('ready')}>重置状态</Button>
          </div>
        </div>
        <div
          className="erp-design-state-result"
          data-state={state}
          aria-live="polite"
        >
          <strong>
            {state === 'failed'
              ? '保存失败'
              : state === 'saved'
                ? '已保存样例'
                : '等待操作'}
          </strong>
          <span>
            {state === 'failed'
              ? '输入仍在 → 就地重试'
              : state === 'saved'
                ? '已读回结果 → 继续工作'
                : '编辑文字，再试一次失败恢复'}
          </span>
        </div>
      </div>
    </figure>
  )
}

function DataExample() {
  return (
    <div className="erp-design-visual-options" aria-label="按阅读任务选择图形">
      <figure>
        <figcaption>精确比较 → 表格</figcaption>
        <div className="erp-design-mini-table">
          <span>对象</span>
          <span>数量</span>
          <span>A</span>
          <b>128</b>
          <span>B</span>
          <b>96</b>
          <span>C</span>
          <b>240</b>
        </div>
      </figure>
      <figure>
        <figcaption>变化趋势 → 折线</figcaption>
        <svg viewBox="0 0 240 110" role="img" aria-label="虚构趋势示意">
          <path className="erp-design-chart-axis" d="M 20 10 V 90 H 230" />
          <path
            className="erp-design-chart-line"
            d="M 25 74 L 64 60 L 101 69 L 141 35 L 180 44 L 220 18"
          />
          <text x="20" y="106">
            较早
          </text>
          <text x="198" y="106">
            较晚
          </text>
        </svg>
      </figure>
      <figure>
        <figcaption>依赖关系 → 关系图</figcaption>
        <div className="erp-design-mini-relation">
          <span>来源</span>
          <i>↓</i>
          <div>
            <b>汇总</b>
            <b>明细</b>
          </div>
        </div>
      </figure>
    </div>
  )
}

function ResponsiveExample() {
  const [narrow, setNarrow] = useState(false)
  return (
    <figure className="erp-design-simulation" aria-label="相同内容的宽窄排列">
      <figcaption>
        <strong>保留判断信息，改变排列方式</strong>
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
      <div
        className={`erp-design-responsive-demo${narrow ? ' is-narrow' : ''}`}
      >
        <strong>样例订单 A</strong>
        <GhostFields />
        <div className="erp-design-example-record">
          <span>交付风险：需要核对</span>
          <b>查看工序 →</b>
        </div>
      </div>
    </figure>
  )
}

export default function DevUIDesignMechanisms({ topic, chapters }) {
  const [chapterTitle, diagramIndex] = DIAGRAMS[topic.key]
  const diagram = chapters.find((chapter) => chapter.title === chapterTitle)
    ?.diagrams[diagramIndex]
  const examples = {
    navigation: NavigationExample,
    forms: FormsExample,
    states: RecoveryExample,
    data: DataExample,
    responsive: ResponsiveExample,
  }
  const Example = examples[topic.key]
  return (
    <section
      className="erp-design-mechanism"
      aria-labelledby="design-mechanism-title"
    >
      <div className="erp-design-guide-heading">
        <div>
          <h2 id="design-mechanism-title">{topic.title}</h2>
          <p>{topic.description}</p>
        </div>
      </div>
      <Example />
      <div className="erp-design-mechanism-rule">
        <span className="erp-design-eyebrow">
          {topic.key === 'forms' ? '怎样选择容器' : '关系与边界'}
        </span>
        {diagram ? (
          <MermaidDiagram chart={diagram} label={`${topic.title}原理图`} />
        ) : (
          <p>对应原理图暂不可读，请查阅下方规范。</p>
        )}
      </div>
    </section>
  )
}
