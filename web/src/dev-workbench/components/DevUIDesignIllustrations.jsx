import React, { useState } from 'react'
import { Button, Slider, Switch } from 'antd'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import DevUIDesignMechanisms from './DevUIDesignMechanisms.jsx'
import DevUIFeedbackGuide from './DevUIFeedbackGuide.jsx'

const LAYOUT_PARTS = [
  {
    value: 'navigation',
    label: '导航',
    title: '固定导航，减少重新找入口',
    text: '侧栏承担模块定位，内容区承担当前工作。展开时保留可扫描的文字，熟悉模块后可收起，为宽表释放空间。',
  },
  {
    value: 'header',
    label: '顶栏',
    title: '全局操作与当前工作分开',
    text: '顶栏放刷新、外观与账号。当前对象和主要动作留在内容区，主标题只出现一次，把垂直空间留给记录。',
  },
  {
    value: 'spacing',
    label: '留白',
    title: '用间距说明哪些内容属于一组',
    text: '页面外边距隔开导航与工作内容；操作区内部留白让控件不贴边。搜索、筛选与动作沿同一阅读边缘排列，避免每一层再套一张卡片。',
  },
  {
    value: 'data',
    label: '数据',
    title: '把最大面积留给需要比较的内容',
    text: '列表适合逐列比较日期、数量和金额。表头与数据对齐，宽表只在自身区域滚动，页面导航和主动作保持可达。',
  },
]

const SAMPLE_ROWS = [
  ['样例订单 A', '待处理', '1,280'],
  ['样例订单 B', '已完成', '96'],
  ['样例订单 C', '待处理', '3,600'],
]

function SampleTable() {
  return (
    <table className="erp-design-sample-table" aria-label="虚构订单布局样例">
      <thead>
        <tr>
          <th>订单</th>
          <th>状态</th>
          <th>数量</th>
        </tr>
      </thead>
      <tbody>
        {SAMPLE_ROWS.map(([name, status, quantity]) => (
          <tr key={name}>
            <td>{name}</td>
            <td>
              <span className="erp-design-sample-status">{status}</span>
            </td>
            <td>{quantity}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function GuideSection({ id, title, description, children }) {
  return (
    <section
      id={id}
      className="erp-design-guide-section"
      aria-labelledby={`${id}-title`}
    >
      <div className="erp-design-guide-heading">
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function LayoutGuide() {
  const [part, setPart] = useState('spacing')
  const [collapsed, setCollapsed] = useState(false)
  const selected = LAYOUT_PARTS.find((item) => item.value === part)
  const point = (value, letter, label) => (
    <button
      type="button"
      className="erp-design-layout-point"
      aria-label={`图解 ${letter}：${label}`}
      aria-pressed={part === value}
      onClick={() => setPart(value)}
    >
      {letter}
    </button>
  )
  return (
    <GuideSection
      id="design-layout"
      title="页面骨架：先分工，再分配空间"
      description="点击图中的 A / B / C / D 查看分工与尺寸。虚构内容只演示分区。"
    >
      <div className="erp-design-guide-controls">
        <Segmented
          aria-label="查看布局区域"
          options={LAYOUT_PARTS.map(({ value, label }) => ({ value, label }))}
          value={part}
          onChange={setPart}
        />
        <label className="erp-design-guide-switch">
          <Switch
            checked={collapsed}
            onChange={setCollapsed}
            aria-label="收起示意侧栏"
          />
          收起侧栏
        </label>
      </div>
      <div className="erp-design-explainer-grid">
        <figure className="erp-design-layout-figure">
          <div
            className={`erp-design-layout${collapsed ? ' is-collapsed' : ''}`}
            data-highlight={part}
          >
            <div className="erp-design-layout-sidebar">
              {point('navigation', 'A', '导航')}
              <strong>{collapsed ? '导航' : '业务导航'}</strong>
              <span className="erp-design-dimension">
                {collapsed ? '64' : '206'} px
              </span>
              {['工作台', '销售', '采购', '库存'].map((name) => (
                <span className="erp-design-layout-menu" key={name}>
                  {collapsed ? name.slice(0, 1) : name}
                </span>
              ))}
            </div>
            <div className="erp-design-layout-body">
              <div className="erp-design-layout-topbar">
                {point('header', 'B', '顶栏')}
                <span>全局操作</span>
                <span className="erp-design-dimension">48 px</span>
              </div>
              <div className="erp-design-layout-content">
                {point('spacing', 'C', '留白')}
                <span className="erp-design-layout-ruler">
                  ← 页面边距 12 px →
                </span>
                <div className="erp-design-layout-toolbar">
                  <strong>订单列表</strong>
                  <span>搜索 · 筛选 · 新建</span>
                  <small>内部上下 10 / 左右 12 px</small>
                </div>
                <div
                  className="erp-design-layout-gap"
                  aria-label="操作区与数据区间隔 9 px"
                />
                <div className="erp-design-layout-data">
                  {point('data', 'D', '数据')}
                  <SampleTable />
                  <div className="erp-design-layout-table-note">
                    数据区 · 宽表在区内滚动
                  </div>
                </div>
              </div>
            </div>
          </div>
          <figcaption>
            蓝色虚线是讲解标注，正式页面通过留白、细边界与底色分组。
          </figcaption>
        </figure>
        <aside className="erp-design-explanation" aria-live="polite">
          <span className="erp-design-eyebrow">{selected.label}的设计理由</span>
          <h3>{selected.title}</h3>
          <p>{selected.text}</p>
          <dl>
            <div>
              <dt>外部留白</dt>
              <dd>12 px · 隔开页面与容器</dd>
            </div>
            <div>
              <dt>内部留白</dt>
              <dd>10 / 12 px · 保留操作空间</dd>
            </div>
            <div>
              <dt>区块间隔</dt>
              <dd>9 px · 操作区与数据区</dd>
            </div>
            <div>
              <dt>容器边界</dt>
              <dd>1 px 细线 · 10 px 圆角</dd>
            </div>
          </dl>
        </aside>
      </div>
    </GuideSection>
  )
}

function TypographyGuide() {
  return (
    <GuideSection
      id="design-type"
      title="文字与对齐：让眼睛有一条稳定的路径"
      description="用字号、字重和位置区分主次；先读对象，再比较状态与数值。"
    >
      <div className="erp-design-explainer-grid">
        <figure className="erp-design-type-figure">
          <div className="erp-design-type-line">
            <strong>订单列表</strong>
            <span>页面标题 · 识别当前工作</span>
          </div>
          <div className="erp-design-type-line">
            <b>交付明细</b>
            <span>分区标题 · 组织相邻字段</span>
          </div>
          <div className="erp-design-type-line">
            <span>样例订单 A / 待处理</span>
            <span>表格正文 · 13 px</span>
          </div>
          <div className="erp-design-type-line">
            <small>按当前筛选条件统计</small>
            <span>辅助说明 · 就近解释口径</span>
          </div>
          <SampleTable />
          <figcaption>
            文字靠左形成起点，数量靠右方便按位比较。状态保留文字，颜色只做辅助。
          </figcaption>
        </figure>
        <aside className="erp-design-explanation">
          <span className="erp-design-eyebrow">平面编排的三个抓手</span>
          <h3>对齐、接近、对比</h3>
          <p>
            共同左边缘让标题、筛选和数据自然衔接；组内距离小、组间距离大，让关联不必靠更多边框解释。
          </p>
          <p>
            标题靠字重与适度字号建立层级，主动作才使用强调色。正文保持可读，较低优先级通过位置与色阶处理。
          </p>
          <p className="erp-design-guide-note">
            长名称允许换行或查看完整值；长文档控制行宽，宽数据表保留比较所需的空间。
          </p>
        </aside>
      </div>
    </GuideSection>
  )
}

function SpacingSample({ spacing, label }) {
  return (
    <figure className="erp-design-spacing-sample">
      <figcaption>
        <strong>{label}</strong>
        <span>左右 {spacing} px</span>
      </figcaption>
      <div
        className="erp-design-spacing-page"
        style={{ '--design-demo-spacing': `${spacing}px` }}
      >
        <div className="erp-design-spacing-surface">
          <strong>订单列表</strong>
          <span className="erp-design-demo-search">搜索单号或客户</span>
          <SampleTable />
        </div>
      </div>
    </figure>
  )
}

function SpacingGuide() {
  const [spacing, setSpacing] = useState(24)
  return (
    <GuideSection
      id="design-spacing"
      title="为什么是 12 px，而不是越宽松越好？"
      description="保持相同内容，只改变页面左右边距。拖动滑块，观察空隙与可用宽度的变化。"
    >
      <div className="erp-design-spacing-controls">
        <span>对比边距（px）</span>
        <Slider
          id="design-spacing-slider"
          ariaLabelForHandle="对比页面边距"
          min={4}
          max={32}
          step={2}
          value={spacing}
          onChange={setSpacing}
          marks={{ 4: '4', 12: '12', 24: '24', 32: '32' }}
        />
        <Button onClick={() => setSpacing(12)}>对齐当前基准</Button>
      </div>
      <div className="erp-design-comparison">
        <SpacingSample spacing={12} label="当前基准" />
        <SpacingSample spacing={spacing} label="调整后" />
      </div>
      <div className="erp-design-spacing-feedback" aria-live="polite">
        <strong>
          {spacing < 12
            ? '更贴近边缘'
            : spacing === 12
              ? '与当前基准一致'
              : '更宽的外围留白'}
        </strong>
        <span>
          {spacing < 12
            ? '内容空间增加，但容器之间更难分组，文字与边界容易显得拥挤。'
            : spacing === 12
              ? '保留可辨认的间隙，同时把大部分宽度留给记录与字段。'
              : `相比当前基准，两侧合计少了 ${(spacing - 12) * 2} px 内容宽度；在多列列表中，额外留白可能更早触发换行或横向滚动。`}
        </span>
      </div>
      <div className="erp-design-principle-grid">
        <div>
          <h3>接近原则</h3>
          <p>
            相关字段靠近，独立区块留出间隙。间距的关系比所有地方使用同一个数更重要。
          </p>
        </div>
        <div>
          <h3>密度有边界</h3>
          <p>
            标准 / 紧凑表格行高基准为 52 / 42 px，主要改变留白。34 px
            控件保持稳定，长内容可以撑高。
          </p>
        </div>
        <div>
          <h3>用任务校验</h3>
          <p>
            检查首屏能否看清对象、状态和下一步；再看长文字、错误提示和宽表，不能仅凭“能塞多少行”判断。
          </p>
        </div>
      </div>
    </GuideSection>
  )
}

function SurfaceGuide() {
  const [layered, setLayered] = useState(true)
  return (
    <GuideSection
      id="design-surfaces"
      title="为什么以平面为主，还需要层次？"
      description="边界来自位置、明度和选中态；持续工作页面用少量强调，把注意力留给内容。"
    >
      <div className="erp-design-guide-controls">
        <Segmented
          aria-label="比较视觉层次"
          value={layered ? 'layered' : 'flat'}
          onChange={(value) => setLayered(value === 'layered')}
          options={[
            { value: 'layered', label: '当前分层' },
            { value: 'flat', label: '去掉分层作对照' },
          ]}
        />
      </div>
      <div className="erp-design-explainer-grid">
        <figure
          className={`erp-design-surface-figure${layered ? '' : ' is-flat'}`}
        >
          <div className="erp-design-surface-page">
            <span>① 页面底色 · 区块之间的留白</span>
            <div className="erp-design-surface-content">
              <span>② 内容面 · 把一组操作放在一起</span>
              <div className="erp-design-surface-track">
                <span className="erp-design-surface-selected">③ 选中视图</span>
                <span>其他视图</span>
              </div>
              <SampleTable />
            </div>
          </div>
          <figcaption>
            {layered
              ? '底色 → 内容面 → 底轨 → 选中块。阴影主要留给真正覆盖内容的浮层。'
              : '颜色与边界全部相同时，分组和当前选中项更难辨认。示例保留文字以便对照。'}
          </figcaption>
        </figure>
        <aside className="erp-design-explanation">
          <span className="erp-design-eyebrow">克制不等于没有反馈</span>
          <h3>中性底色托住内容，强调色指向动作</h3>
          <p>
            主题色用于主动作、选中和焦点；成功、待处理、错误各自保留语义和文字。装饰色不承担业务判断。
          </p>
          <div className="erp-design-swatches">
            <span>
              <i className="erp-design-swatch-page" />
              页面
            </span>
            <span>
              <i className="erp-design-swatch-content" />
              内容
            </span>
            <span>
              <i className="erp-design-swatch-accent" />
              强调
            </span>
          </div>
          <p>
            10 px 容器圆角与 8 px 控件圆角区分包裹层级；1 px
            细线明确边界，避免用大面积阴影给普通区块制造虚假高低关系。
          </p>
          <p className="erp-design-guide-note">
            暗色保持同样分工，以不同黑阶区分内容和浮层；键盘焦点、错误和禁用态需要单独可辨。
          </p>
        </aside>
      </div>
    </GuideSection>
  )
}

export default function DevUIDesignIllustrations({ topic, chapters, view }) {
  if (['forms', 'dialogs', 'feedback', 'submission', 'closing'].includes(topic.key)) {
    return <DevUIFeedbackGuide topic={topic} chapters={chapters} view={view} />
  }
  if (topic.key === 'layout') return <LayoutGuide />
  if (topic.key === 'type') return <TypographyGuide />
  if (topic.key === 'spacing') return <SpacingGuide />
  if (topic.key === 'surfaces') return <SurfaceGuide />
  return <DevUIDesignMechanisms topic={topic} chapters={chapters} />
}
