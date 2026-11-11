import React, { useState } from 'react'
import { Button, Slider, Switch } from 'antd'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import BusinessCellStack from '@/erp/components/business-list/BusinessCellStack.jsx'
import DevUIDesignMechanisms from './DevUIDesignMechanisms.jsx'
import DevUIDesignCallouts from './DevUIDesignCallouts.jsx'
import DevUIFeedbackGuide from './DevUIFeedbackGuide.jsx'
import DevWorkCenterDesign from './DevWorkCenterDesign.jsx'
import { WORK_CENTER_DESIGN_TOPICS } from '../config/devWorkCenterDesign.mjs'

const LAYOUT_PARTS = [
  {
    value: 'navigation',
    label: '导航',
    title: '固定导航，减少重新找入口',
    text: '侧栏承担模块定位，内容区承担当前工作。展开时保留可扫描的文字，熟悉模块后可收起，为宽表释放空间。',
  },
  {
    value: 'header',
    label: '账号与操作',
    title: '账号固定底部，刷新跟随当前页面',
    text: '账号固定在侧栏底部，外观设置收进账号菜单；刷新放在页面标题或工具栏。移除单独占高的全局顶栏，窄屏从页面操作打开导航。',
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
    <table className="erp-design-sample-table" data-table-lines="fixed" aria-label="虚构订单布局样例">
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
              <div className="erp-design-layout-account">
                {point('header', 'B', '账号与操作')}
                <span>{collapsed ? '账号' : '账号 · 外观'}</span>
              </div>
            </div>
            <div className="erp-design-layout-body">
              <div className="erp-design-layout-content">
                {point('spacing', 'C', '留白')}
                <span className="erp-design-layout-ruler">
                  ← 页面边距 8 px →
                </span>
                <div className="erp-design-layout-toolbar">
                  <strong>订单列表</strong>
                  <span>搜索 · 筛选 · 新建 · 刷新</span>
                  <small>内部上下 10 / 左右 12 px</small>
                </div>
                <div
                  className="erp-design-layout-gap"
                  aria-label="操作区与数据区间隔 6 px"
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
              <dd>8 px · 隔开页面与容器</dd>
            </div>
            <div>
              <dt>内部留白</dt>
              <dd>10 / 12 px · 保留操作空间</dd>
            </div>
            <div>
              <dt>区块间隔</dt>
              <dd>6 px · 操作区与数据区</dd>
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

const TYPE_POINTS = [
  { key: 'hierarchy', title: '文字先分主次', description: '页面标题定位当前工作，分区标题组织相邻字段。正文保持可读，辅助说明靠近被解释的内容，按字重和位置区分。' },
  { key: 'alignment', title: '同类信息沿一条线比较', description: '名称和状态文字靠左；同单位的数量、金额按位靠右。留足列宽，保持单位及币种与数值同行。' },
  { key: 'related', title: '同一对象的相关信息成组', description: '上行先认出对象，下行补足电话、地址或编号。缺项不留空行，长名称自然换行；精确规则可查复合单元格说明。' },
]

function TypographyGuide() {
  return (
    <GuideSection
      id="design-type"
      title="文字与对齐：让眼睛有一条稳定的路径"
      description="用字号、字重和位置区分主次；先读对象，再比较状态与数值。"
    >
      <DevUIDesignCallouts points={TYPE_POINTS}>
        {(point) => (
          <figure className="erp-design-type-figure">
            {point('hierarchy', (
              <>
                <div className="erp-design-type-line">
                  <strong>订单列表</strong>
                  <span>页面标题 · 识别当前工作</span>
                </div>
                <div className="erp-design-type-line">
                  <b>交付明细</b>
                  <span>分区标题 · 组织相邻字段</span>
                </div>
                <div className="erp-design-type-line">
                  <span>样例订单 A</span>
                  <span>表格正文 · 沿用正文字号</span>
                </div>
                <div className="erp-design-type-line">
                  <small>按当前筛选条件统计</small>
                  <span>辅助说明 · 就近解释口径</span>
                </div>
              </>
            ))}
            {point('alignment', <div className="erp-design-sample-table-scroll"><SampleTable /></div>)}
            {point('related', (
              <>
                <h3 className="erp-design-cell-samples-title">联系人：同一格内区分主次</h3>
                <table className="erp-design-cell-samples" data-table-lines="fixed" aria-label="虚构联系人上下布局样例">
                  <thead>
                    <tr><th scope="col">场景</th><th scope="col">联系人</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">信息齐全</th>
                      <td><BusinessCellStack primary="张小林" secondary="13800000000" /></td>
                    </tr>
                    <tr>
                      <th scope="row">缺少电话</th>
                      <td><BusinessCellStack primary="王小雨" /></td>
                    </tr>
                    <tr>
                      <th scope="row">长内容</th>
                      <td><BusinessCellStack primary="欧阳晴川（华南仓储服务中心夜班收货联系人）" secondary="13800000000" /></td>
                    </tr>
                  </tbody>
                </table>
              </>
            ))}
            <figcaption>联系人与订单均为虚构示例。</figcaption>
          </figure>
        )}
      </DevUIDesignCallouts>
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
      title="为什么采用 8 px 的紧凑页面边距？"
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
          marks={{ 4: '4', 8: '8', 24: '24', 32: '32' }}
        />
        <Button onClick={() => setSpacing(8)}>对齐当前基准</Button>
      </div>
      <div className="erp-design-comparison">
        <SpacingSample spacing={8} label="当前基准" />
        <SpacingSample spacing={spacing} label="调整后" />
      </div>
      <div className="erp-design-spacing-feedback" aria-live="polite">
        <strong>
          {spacing < 8
            ? '更贴近边缘'
            : spacing === 8
              ? '与当前基准一致'
              : '更宽的外围留白'}
        </strong>
        <span>
          {spacing < 8
            ? '内容空间增加，但容器之间更难分组，文字与边界容易显得拥挤。'
            : spacing === 8
              ? '保留可辨认的间隙，同时把大部分宽度留给记录与字段。'
              : `相比当前基准，两侧合计少了 ${(spacing - 8) * 2} px 内容宽度；在多列列表中，额外留白可能更早触发换行或横向滚动。`}
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

const SURFACE_POINTS = [
  { key: 'page', title: '页面底色', description: '中性底色托住各区块，区块之间靠留白分隔。普通页面用平面，阴影主要用于覆盖内容的浮层。' },
  { key: 'surface', title: '内容面', description: '细边界和独立底色把一组相关操作与数据放在一起。切换去掉分层，比较分组是否还容易辨认。' },
  { key: 'selected', title: '选中视图', description: '强调色和字重指明正在看的视图；主题改变后选中、焦点和禁用仍能区分。状态始终保留文字。' },
]

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
      <DevUIDesignCallouts points={SURFACE_POINTS}>
        {(point) => (
          <figure className={`erp-design-surface-figure${layered ? '' : ' is-flat'}`}>
            <div className="erp-design-surface-page">
              {point('page', <span className="erp-design-surface-label">页面底色 · 区块之间的留白</span>)}
              <div className="erp-design-surface-content">
                {point('surface', <span className="erp-design-surface-label">内容面 · 把一组操作放在一起</span>)}
                {point('selected', (
                  <div className="erp-design-surface-track">
                    <span className="erp-design-surface-selected">选中视图</span>
                    <span>其他视图</span>
                  </div>
                ))}
                <div className="erp-design-sample-table-scroll"><SampleTable /></div>
              </div>
            </div>
            <figcaption>
              {layered
                ? '比较页面底色、内容面和当前选中项。'
                : '去掉色差与边界后，比较还能不能迅速认出分组和选中项。'}
            </figcaption>
          </figure>
        )}
      </DevUIDesignCallouts>
    </GuideSection>
  )
}

export default function DevUIDesignIllustrations({ topic, chapters, view }) {
  if (WORK_CENTER_DESIGN_TOPICS.some((item) => item.key === topic.key)) return <DevWorkCenterDesign topic={topic} />
  if (['forms', 'dialogs', 'feedback', 'submission', 'closing'].includes(topic.key)) {
    return <DevUIFeedbackGuide topic={topic} chapters={chapters} view={view} />
  }
  if (topic.key === 'layout') return <LayoutGuide />
  if (topic.key === 'type') return <TypographyGuide />
  if (topic.key === 'spacing') return <SpacingGuide />
  if (topic.key === 'surfaces') return <SurfaceGuide />
  return <DevUIDesignMechanisms topic={topic} chapters={chapters} />
}
