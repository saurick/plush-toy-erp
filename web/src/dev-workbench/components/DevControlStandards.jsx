import React, { useLayoutEffect, useRef, useState } from 'react'
import { Alert, Button, ConfigProvider, Empty, Popover, theme } from 'antd'
import {
  ArrowRightOutlined,
  DownOutlined,
  FilterOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { Link, useSearchParams } from 'react-router-dom'
import SlidingTabs from '@/common/components/navigation/SlidingTabs'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'
import SlidingTabList from '@/common/components/navigation/SlidingTabList'
import FilterChip from '@/common/components/navigation/FilterChip'
import MobileSearchInput from '@/common/components/navigation/MobileSearchInput'
import NavigationCountBadge from '@/common/components/navigation/NavigationCountBadge'
import SearchInput from '@/common/components/SearchInput'
import { useERPTheme } from '@/common/theme/erpTheme'
import { getERPSurfaceTokens } from '@/common/theme/erpThemePalette.mjs'
import DevUIFeedbackExamples from './DevUIFeedbackExamples.jsx'
import DevSharedComponentGuide, { SHARED_COMPONENT_SEARCH_TEXT } from './DevSharedComponentGuide.jsx'
import DevUIPaginationExample from './DevUIPaginationExample.jsx'
import { BasicInputExample, DateInputExample } from './DevUIInputExamples.jsx'
import {
  PROGRESS_SCOPE_OPTIONS,
  progressQueryFromURL,
} from '../../erp/utils/businessProgress.mjs'
import '../styles/dev-ui-controls.css'

const TOPICS = [
  {
    key: 'feedback',
    title: '弹窗与反馈',
    summary: '编辑、提交、消息与恢复',
    guide: 'dialogs',
    description: '在同一份样例里体验输入校验、保存失败、结果未知和关闭保护。',
    rules: [
      ['系统信息与外观设置', 'AppModal 标准模式', '通用弹窗使用共享入口，保留任务需要的尺寸、内容和页脚。'],
      [
        '局部编辑',
        '弹窗',
        '保留来源页面；标题、输入和保存动作组成一个完整任务。',
      ],
      ['即时结果', 'Toast', '短暂说明成功，不移走输入焦点。'],
      [
        '需要处理的错误',
        '区域提示 / 持续通知',
        '恢复入口与原因一起保留，不能几秒后消失。',
      ],
      ['结果未知', '查询结果', '先确认本次操作，避免重复提交。'],
    ],
    checks: [
      '空标题保存：错误定位到字段。',
      '修改后关闭：先确认，取消后输入仍在。',
      '切换保存结果：分别试重试、查询结果和连续点击。',
    ],
    source: 'BusinessFormModal · AppModal · message / notification',
  },
  {
    key: 'components',
    title: '组件选用',
    summary: '按用途查正式入口与复用边界',
    description: '从当前实现约定查找基础控件、共享交互、业务组合和打印组件，再进入对应样例。',
    rules: [],
    source: SHARED_COMPONENT_SEARCH_TEXT,
  },
  {
    key: 'pagination',
    title: '列表与分页',
    summary: '翻页、条数与读取恢复',
    guide: 'data',
    description: '表格内分页与独立分页使用同一套控件；切换样例数据和读取状态，核对当前记录与分页结果。',
    rules: [
      ['表格内分页', 'AppTable', '表格统一接入公共分页配置，页面只提供当前页、总数和读取动作。'],
      ['独立分页', 'AppPagination', '复用尺寸、翻页图标、范围文案和窄屏模式；固定批次可关闭条数选择。'],
      ['条数与筛选', '回到第一页', '每页条数按接口支持的范围配置；改变范围时重新读取，避免保留失效页码。'],
      ['加载与失败', '禁用分页，保留当前内容', '加载中不重复翻页；失败由调用方提示并重试，已读取内容和当前页保留。'],
      ['手机任务', '连续加载', '手机任务列表沿用分批续取，不改为电脑页码导航。'],
    ],
    checks: [
      '翻到第二页，再修改每页条数，核对首项与范围回到第一页。',
      '切换表格内与独立分页，再试单页、空列表和恢复初始内容。',
      '切换加载中与加载失败，核对禁用、内容保留和重试恢复。',
    ],
    source: 'common/components/pagination/AppPagination · common/components/table/AppTable · common/utils/pagination.mjs',
  },
  {
    key: 'inputs',
    title: '基础输入',
    summary: '文本、选择与项目主题',
    guide: 'forms',
    description: 'Button、Input 继承项目主题；下拉统一使用 AppSelect / FilterSelect，选中后保留用途，清空后恢复提示。',
    rules: [
      ['普通文本与枚举', 'Input / AppSelect', '字段有明确提示和可见用途；可编辑值支持清空，必填仍由表单校验。'],
      ['搜索与业务筛选', 'SearchInput / FilterSelect / SelectFilter', '清空取消条件，下拉菜单不添加“全部……”占位项；固定模式保留有效值。'],
      ['领域选择', '已有来源或主数据选择器', '读取、搜索和来源快照合同由领域组件承接。'],
    ],
    checks: ['修改名称和类别，核对当前结果。', '清空内容，再恢复初始值。', '切换禁用与错误，核对值保留和状态外观。'],
    source: 'antd: Button / Input · common/components/select · src/App.jsx: ConfigProvider · erp/styles/app/control-*.css',
  },
  {
    key: 'dates',
    title: '日期与时间',
    summary: '日期、分钟与范围约束',
    guide: 'forms',
    description: '直接操作正式日期组件；正常、禁用与错误切换作用于上方两个输入，范围示例单独展示日期类型与起止约束。',
    rules: [
      ['单个日期', 'DateInput', '整框打开日历，选值立即回填，清空后保留空值。'],
      ['日期时间', 'DateTimeInput', '分钟选择即时生效；快捷截止沿用跟进任务的同一构造函数。'],
      ['起止筛选', 'DateRangeFilter', '组件组合日期类型与起止日期，限制倒置选择；已有倒置值保留错误提示并允许清空。'],
    ],
    checks: ['选择日期和分钟，核对下方值即时变化。', '使用截止快捷项，再切换禁用和错误。', '切换日期类型，查看倒置范围并清空、重置。'],
    source: 'erp/components/business-list/BusinessDateInputs.jsx · erp/utils/dateRange.mjs · erp/utils/workflowTaskTiming.mjs',
  },
  {
    key: 'navigation',
    title: '页签与视图',
    summary: '切换内容，保留当前对象',
    guide: 'type',
    description:
      '内容导航使用下划线，工作方式、显示模式和筛选选项使用分段按钮。手机任务、进度与流程跟踪同样按内容导航处理。',
    rules: [
      ['待办 / 已办 / 流程跟踪、订单交付 / 生产执行、电脑待办列表 / 日历', '内容页签', '切换不同工作内容，使用下划线。'],
      ['电脑 / 手机、表格 / 图形、主题与密度', '分段按钮', '选择运行模式、显示方式或设置值，使用底轨和选中滑块。'],
      ['内容页签当前项', '主题色 + 2px 下划线', '透明底与中性基线，主题线标明当前位置；两种状态均使用 500 字重，保持选项宽度。'],
      ['同页两条切换', '按职责区分', '登录页上方选择电脑或手机，下方切换密码或短信内容；选项少不等于分段按钮。'],
      ['手机顶部', '层间留白 4–8px', '主次页签间 4px、页签至搜索 6px、搜索至状态 8px；触摸区域至少 44px。'],
      ['管理员查看岗位', '我的 → 管理员视角', '保留所选岗位与查看权限，任务、风险和进度顶部不重复岗位栏。'],
      ['内容切换', '导航持续挂载', '指示条连续移动，不随正文重新出现。'],
    ],
    checks: [
      '切到关联任务：订单身份保持不变。',
      '快速反向切换：下划线或滑块从当前位置继续。',
      '用方向键切换，核对禁用项与减少动态效果。',
    ],
    source: 'SlidingTabs · SlidingSegmented · SlidingTabList · control-affordance.css',
  },
  {
    key: 'filters',
    title: '筛选与搜索',
    summary: '缩小同一份结果',
    guide: 'navigation',
    description: '点状态、提交关键词或改变范围，观察同一份虚构记录如何变化。',
    rules: [
      [
        '常用条件',
        '带数量的筛选按钮',
        '直接看见队列与当前条件，数量不是第二个按钮。',
      ],
      [
        '单号 / 产品 / 负责人',
        '一个主搜索',
        '点击搜索或按 Enter 提交；手机聚焦展开，提交后立即收起，清除后仍可继续输入。',
      ],
      [
        '少量次级条件',
        '按钮下方的轻量浮层',
        '覆盖内容，选择立即生效，不挤动列表。',
      ],
      ['重置筛选', '只恢复范围', '保留关键词；清除搜索由输入框单独处理。'],
    ],
    checks: [
      '选择逾期：结果与数量一起变化。',
      '输入期间结果不变；提交不存在的关键词后，出现无结果与清除入口。',
      '改变范围再重置：搜索词保持，其他页面条件不变。',
    ],
    source: 'FilterChip · MobileSearchInput · Popover',
  },
  {
    key: 'actions',
    title: '按钮与动作',
    summary: '主次、禁用与执行反馈',
    guide: 'states',
    description: '同一组突出一个主动作，文字、状态与反馈共同说明点击的结果。',
    rules: [
      ['主要提交', '实心主按钮', '一组只强调一个最重要动作。'],
      ['刷新 / 返回', '描边按钮', '可操作但不抢主次；图标配有名称。'],
      ['低频辅助', '文字按钮', '降低视觉重量，保留键盘焦点。'],
      [
        '执行中 / 不可用',
        '加载 / 禁用',
        '防止重复操作；危险确认在“弹窗与反馈”中体验。',
      ],
    ],
    checks: [
      '用 Tab 定位保存，再按 Enter。',
      '点击刷新与取消：就地看到各自结果。',
      '禁用项不触发；加载项保留原按钮尺寸。',
    ],
    source: 'Ant Design Button · control-affordance.css',
  },
  {
    key: 'empty',
    title: '空白与错误',
    summary: '区分无记录、无结果和失败',
    guide: 'states',
    description: '同样没有数据可显示，原因不同，页面给出的下一步也不同。',
    rules: [
      ['尚无记录', '中性空状态', '没有风险，不显示黄色警告框。'],
      ['筛选未命中', '保留条件 + 清除入口', '让用户理解当前范围，继续调整。'],
      ['读取失败', '错误 + 重试', '不能伪装成空记录，也不能丢失查询上下文。'],
    ],
    checks: [
      '依次切换三种原因，比较文字和动作。',
      '无结果时清除条件；失败时重试并核对结果。',
      '浅深主题中核对图标、文字和操作入口。',
    ],
    source: 'Ant Design Empty / Alert · 共享空状态配置',
  },
  {
    key: 'counts',
    title: '数字提醒',
    summary: '有待办才提示，点开范围一致',
    guide: 'states',
    description: '菜单数字帮助发现待办；办理后更新，打开页面不会清零。',
    rules: [
      ['任务管理', '低强调数字', '统计本人责任范围内未结束任务；同一任务只计一次。'],
      ['专门的异常入口', '风险色数字', '仅用于定义清楚的异常，不给所有模块总菜单挂红点。'],
      ['零 / 大数量', '隐藏 / 99+', '减少无效提示；悬停和读屏保留完整数量。'],
      ['读取中 / 失败', '省略号 / 待更新', '失败保留上次数量并标记；未知不能显示成零。'],
    ],
    checks: [
      '打开任务管理样例：清单与数字一致，浏览不清零。',
      '办理一项：清单和数字一起减少，归零后隐藏。',
      '切换大数量、读取中和失败，核对显示及重试。',
    ],
    source: 'NavigationCountBadge · 服务端任务管理总数',
  },
]

const RECORDS = [
  {
    number: 'SO-DEMO-01',
    product: '布偶熊',
    owner: '小林',
    risk: 'overdue',
    scope: 'active',
  },
  {
    number: 'SO-DEMO-02',
    product: '兔子挂件',
    owner: '小陈',
    risk: 'due',
    scope: 'active',
  },
  {
    number: 'SO-DEMO-03',
    product: '抱枕',
    owner: '小林',
    risk: 'blocked',
    scope: 'active',
  },
  {
    number: 'SO-DEMO-04',
    product: '布偶熊礼盒',
    owner: '小陈',
    risk: 'normal',
    scope: 'ended',
  },
]
const RISK_LABELS = {
  overdue: '已逾期',
  due: '7天内到期',
  blocked: '任务受阻',
  normal: '已结束',
}

function CountExample() {
  const [count, setCount] = useState(3)
  const [state, setState] = useState('ready')
  const [opened, setOpened] = useState(false)
  return (
    <div className="erp-control-example-stack">
      <SlidingSegmented
        aria-label="数字提醒状态"
        value={state}
        onChange={(value) => {
          setState(value)
          setCount(value === 'large' ? 128 : value === 'zero' ? 0 : 3)
        }}
        options={[
          { label: '3 项', value: 'ready' },
          { label: '零项', value: 'zero' },
          { label: '大数量', value: 'large' },
          { label: '读取中', value: 'loading' },
          { label: '失败', value: 'error' },
        ]}
      />
      <Button className="erp-control-count-entry" onClick={() => setOpened(true)}>
        任务管理
        <NavigationCountBadge count={state === 'loading' ? null : count} loading={state === 'loading'} error={state === 'error'} />
      </Button>
      {state === 'error' && <Button onClick={() => setState('ready')}>重新读取数量</Button>}
      {opened && (
        <div className="erp-control-count-list" aria-label="待我处理样例">
          <h3>待我处理 · {state === 'loading' ? '读取中' : `${count} 项${state === 'error' ? '（待更新）' : ''}`}</h3>
          {state !== 'loading' && count > 0 ? (
            <>
              <ol>
                {['核对样品尺寸', '确认面料到货', '处理包装阻塞'].slice(0, count).map((label) => <li key={label}>{label}</li>)}
              </ol>
              {count > 3 && <p>其余 {count - 3} 项 · 数量不受当前展示条数限制</p>}
              <Button disabled={state === 'error'} onClick={() => setCount((value) => value - 1)}>办理一项</Button>
            </>
          ) : state !== 'loading' ? <Empty description="当前没有待办" /> : <p>等待读取结果，不展示零项。</p>}
        </div>
      )}
      <div className="erp-control-count-comparison">
        <span>普通待办 <NavigationCountBadge count={3} /></span>
        <span>明确风险 <NavigationCountBadge count={3} risk label="风险任务" /></span>
      </div>
    </div>
  )
}

function NavigationExample() {
  const [view, setView] = useState('orders')
  const [trackingView, setTrackingView] = useState('progress')
  return (
    <div className="erp-control-example-stack">
      <div>
        <h3>① 同一订单，切换内容</h3>
        <div className="erp-control-example-context">
          订单 SO-DEMO · 虚构样例
        </div>
        <SlidingTabs
          aria-label="订单详情样例"
          items={[
            {
              key: 'products',
              label: '产品明细',
              children: (
                <dl className="erp-control-example-values">
                  <div>
                    <dt>产品</dt>
                    <dd>布偶熊</dd>
                  </div>
                  <div>
                    <dt>规格</dt>
                    <dd>20 cm</dd>
                  </div>
                  <div>
                    <dt>数量</dt>
                    <dd>120 件</dd>
                  </div>
                </dl>
              ),
            },
            {
              key: 'tasks',
              label: '关联任务',
              children: (
                <p>
                  当前：关联任务。订单身份仍在原位置。
                  <br />
                  核对包装样例 · 待处理
                </p>
              ),
            },
            { key: 'unavailable', label: '无权限', disabled: true },
          ]}
        />
      </div>
      <div>
        <h3>② 进度工作区，切换内容</h3>
        <SlidingTabList
          aria-label="进度视图样例"
          value={view}
          onChange={setView}
          options={[
            { label: '订单交付', value: 'orders' },
            { label: '生产执行', value: 'production' },
          ]}
        />
        <p role="status">
          当前查看：{view === 'orders' ? '订单交付' : '生产执行'}
        </p>
        <dl className="erp-control-example-values">
          {(view === 'orders'
            ? [
                ['订购', '120 件'],
                ['已交付', '80 件'],
                ['待交付', '40 件'],
              ]
            : [
                ['裁剪', '120 件'],
                ['车缝', '100 件'],
                ['充棉', '80 件'],
              ]
          ).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div>
        <h3>③ 同一工作下的第二层内容</h3>
        <SlidingTabList
          aria-label="二级导航样例"
          value={trackingView}
          onChange={setTrackingView}
          options={[
            { label: '流程进度', value: 'progress' },
            { label: '异常跟踪', value: 'exceptions' },
          ]}
        />
        <p>
          当前查看：{trackingView === 'progress' ? '流程进度' : '异常跟踪'}。
          内容导航保留下划线：两种状态均使用 500 字重，2px 主题线随当前位置连续移动。
          手机页面左右保留 12px，层间留白 4–8px，点击区域至少 44px；
          完整布局与“我的”岗位切换见手机版任务样例。
        </p>
      </div>
    </div>
  )
}

function demoRiskAvailable(risk, scope) {
  const due = risk === 'due' ? 'due_soon' : risk
  const query = progressQueryFromURL(new URLSearchParams({
    scope,
    due_status: risk === 'blocked' ? 'all' : due,
    blocked_only: String(risk === 'blocked'),
  }))
  return risk === 'blocked' ? query.blocked_only : query.due_status === due
}

function FiltersExample() {
  const [risk, setRisk] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [scope, setScope] = useState('active')
  const [open, setOpen] = useState(false)
  const matching = RECORDS.filter(
    (row) =>
      (scope === 'all' || row.scope === scope) &&
      `${row.number} ${row.product} ${row.owner}`
        .toLowerCase()
        .includes(keyword.trim().toLowerCase())
  )
  const rows = matching.filter((row) => risk === 'all' || row.risk === risk)
  const scopeLabel = PROGRESS_SCOPE_OPTIONS.find(
    ({ value }) => value === scope
  )?.label
  return (
    <div className="erp-control-example-stack">
      <div
        className="erp-control-example-row"
        role="group"
        aria-label="演示风险筛选"
      >
        {['all', 'overdue', 'due', 'blocked'].map((key) => (
          <FilterChip
            key={key}
            selected={risk === key}
            disabled={
              !demoRiskAvailable(key, scope)
            }
            count={
              key === 'all'
                ? matching.length
                : matching.filter((row) => row.risk === key).length
            }
            onClick={() => setRisk(key)}
          >
            {key === 'all' ? scopeLabel : RISK_LABELS[key]}
          </FilterChip>
        ))}
        <FilterChip disabled>暂不可用</FilterChip>
      </div>
      <div className="erp-control-example-search erp-mobile-controls erp-mobile-search-row">
        <MobileSearchInput
          aria-label="演示搜索"
          placeholder="单号、产品、负责人"
          value={keyword}
          onSearch={setKeyword}
          onFocus={() => setOpen(false)}
        />
        <Popover
          trigger="click"
          open={open}
          onOpenChange={setOpen}
          placement="bottomRight"
          arrow={false}
          classNames={{
            root: 'erp-control-example-popover erp-mobile-controls',
          }}
          content={
            <div className="erp-control-example-options">
              <fieldset>
                <legend>演示记录范围</legend>
                <SlidingSegmented
                  block
                  aria-label="演示记录范围"
                  value={scope}
                  onChange={(nextScope) => {
                    setScope(nextScope)
                    if (
                      !demoRiskAvailable(risk, nextScope)
                    ) setRisk('all')
                  }}
                  options={PROGRESS_SCOPE_OPTIONS}
                />
              </fieldset>
              <Button type="text" block onClick={() => setScope('active')}>
                重置筛选
              </Button>
            </div>
          }
        >
          <button
            type="button"
            className="erp-control-button"
            aria-expanded={open}
            data-active={scope !== 'active'}
          >
            <FilterOutlined aria-hidden="true" />
            筛选
            {scope !== 'active' && <span className="erp-control-count">1</span>}
            <DownOutlined aria-hidden="true" />
          </button>
        </Popover>
      </div>
      <p role="status">
        样例结果：{rows.length} 条 · 搜索：{keyword || '未输入'} · 范围：
        {{ active: '在执行', all: '全部记录', ended: '已结束' }[scope]}
      </p>
      {rows.length ? (
        <div className="erp-control-table-scroll">
          <table className="erp-control-table" data-table-lines="appearance">
            <thead>
              <tr>
                <th>单号</th>
                <th>产品</th>
                <th>负责人</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.number}>
                  <td>{row.number}</td>
                  <td>{row.product}</td>
                  <td>{row.owner}</td>
                  <td>{RISK_LABELS[row.risk]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty description="没有符合条件的记录">
          <Button
            onClick={() => {
              setKeyword('')
              setRisk('all')
              setScope('active')
            }}
          >
            清除条件
          </Button>
        </Empty>
      )}
    </div>
  )
}

function ActionsExample() {
  const [message, setMessage] = useState('选择一个动作，查看就地反馈。')
  return (
    <div className="erp-control-example-stack">
      <div className="erp-control-example-row">
        <Button
          type="primary"
          onClick={() => setMessage('演示反馈：已保存。没有写入业务数据。')}
        >
          保存
        </Button>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => setMessage('演示反馈：已刷新。')}
        >
          刷新
        </Button>
        <Button
          type="text"
          onClick={() => setMessage('演示反馈：已取消当前操作。')}
        >
          取消
        </Button>
        <Button disabled>无可操作记录</Button>
        <Button loading>保存中</Button>
      </div>
      <div className="erp-control-example-result" role="status">
        {message}
      </div>
      <div className="erp-control-action-legend">
        <span>主动作：实心</span>
        <span>次动作：描边</span>
        <span>辅助动作：文字</span>
      </div>
    </div>
  )
}

function EmptyExample() {
  const [state, setState] = useState('empty')
  const [recovered, setRecovered] = useState(false)
  return (
    <div className="erp-control-example-stack">
      <SlidingSegmented
        aria-label="空白与错误原因"
        value={state}
        onChange={(value) => {
          setState(value)
          setRecovered(false)
        }}
        options={[
          { value: 'empty', label: '尚无记录' },
          { value: 'filtered', label: '筛选无结果' },
          { value: 'failed', label: '读取失败' },
        ]}
      />
      <div className="erp-control-empty-stage">
        {recovered ? (
          <Alert
            type="success"
            showIcon
            message="重新读取成功：已恢复 1 条样例记录"
          />
        ) : state === 'failed' ? (
          <Alert
            type="error"
            showIcon
            message="本次读取失败，条件已保留"
            description="失败不能显示成空记录。此处重试只改变本地样例。"
            action={
              <Button onClick={() => setRecovered(true)}>重试读取</Button>
            }
          />
        ) : (
          <Empty
            description={
              state === 'filtered' ? '没有符合条件的记录' : '当前范围暂无记录'
            }
          >
            {state === 'filtered' && (
              <Button onClick={() => setState('empty')}>清除条件</Button>
            )}
          </Empty>
        )}
      </div>
    </div>
  )
}

export default function DevControlStandards() {
  const [params, setParams] = useSearchParams()
  const { accent, effectiveTheme } = useERPTheme()
  const [mode, setMode] = useState(effectiveTheme)
  const current =
    TOPICS.find((topic) => topic.key === params.get('control')) || TOPICS[0]
  const query = params.get('controlq') || ''
  const words = query.trim().toLowerCase().split(/\s+/u).filter(Boolean)
  const matches = TOPICS.filter((topic) =>
    words.every((word) =>
      `${topic.title} ${topic.summary} ${topic.description} ${topic.rules.flat().join(' ')} ${topic.source}`
        .toLowerCase()
        .includes(word)
    )
  )
  const contentRef = useRef(null)
  const directoryRef = useRef(null)
  const update = (values) => {
    const next = new URLSearchParams(window.location.search)
    Object.entries(values).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key)
    )
    setParams(next, {
      replace:
        Object.hasOwn(values, 'controlq') && !Object.hasOwn(values, 'control'),
    })
  }
  const guideLink = (view) => {
    const next = new URLSearchParams(params)
    next.set('view', view)
    next.set('topic', current.guide)
    return `/__dev/ui-design?${next}`
  }
  useLayoutEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0
  }, [current.key])
  return (
    <section className="erp-control-library" aria-label="控件设计">
      <aside className="erp-control-library-directory" ref={directoryRef}>
        <SearchInput
          aria-label="搜索控件设计"
          placeholder="控件或场景"
          value={query}
          allowClear
          onChange={(event) => update({ controlq: event.target.value })}
        />
        <nav aria-label="控件设计目录">
          {matches.map((topic) => (
            <button
              key={topic.key}
              type="button"
              aria-current={current.key === topic.key ? 'page' : undefined}
              onClick={() => update({ control: topic.key, controlq: '' })}
            >
              <span>
                <strong>{topic.title}</strong>
                <small>{topic.summary}</small>
              </span>
              <ArrowRightOutlined aria-hidden="true" />
            </button>
          ))}
          {!matches.length && (
            <div className="erp-control-library-no-results">
              <p>没有匹配的控件</p>
              <Button
                onClick={() => {
                  update({ controlq: '' })
                  directoryRef.current?.querySelector('input')?.focus()
                }}
              >
                清除搜索
              </Button>
            </div>
          )}
        </nav>
        <p className="erp-control-library-note">
          选择用途 → 操作样例 → 核对规则
        </p>
      </aside>
      <div className="erp-control-library-content" ref={contentRef}>
        <header className="erp-control-library-heading">
          <div>
            <h2>{current.title}</h2>
            <p>{current.description}</p>
          </div>
          <div className="erp-control-library-theme">
            {current.key !== 'components' && (
              <>
                <span>样例外观</span>
                <SlidingSegmented
                  aria-label="控件样例主题"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { label: '浅色', value: 'light' },
                    { label: '深色', value: 'dark' },
                  ]}
                />
              </>
            )}
          </div>
        </header>
        {current.key === 'components' ? (
          <DevSharedComponentGuide />
        ) : (
          <>
            <div className="erp-control-library-layout">
              <section
                className="erp-control-library-demo"
                aria-label="交互样例"
              >
                <div className="erp-control-library-caption">
                  <strong>交互样例</strong>
                  <span>本地虚构数据 · 可反复操作</span>
                </div>
                <ConfigProvider
                  theme={{
                    algorithm:
                      mode === 'dark'
                        ? theme.darkAlgorithm
                        : theme.defaultAlgorithm,
                    token: {
                      colorPrimary:
                        mode === 'dark' ? accent.dark : accent.primary,
                      ...getERPSurfaceTokens(mode === 'dark'),
                    },
                  }}
                >
                  <div
                    className="erp-control-library-stage"
                    data-erp-theme={mode}
                  >
                    {current.key === 'counts' ? (
                      <CountExample />
                    ) : current.key === 'feedback' ? (
                      <DevUIFeedbackExamples />
                    ) : current.key === 'navigation' ? (
                      <NavigationExample />
                    ) : current.key === 'filters' ? (
                      <FiltersExample />
                    ) : current.key === 'actions' ? (
                      <ActionsExample />
                    ) : current.key === 'inputs' ? (
                      <BasicInputExample />
                    ) : current.key === 'dates' ? (
                      <DateInputExample />
                    ) : current.key === 'pagination' ? (
                      <DevUIPaginationExample />
                    ) : (
                      <EmptyExample />
                    )}
                  </div>
                </ConfigProvider>
              </section>
              <aside className="erp-control-library-checks">
                <h3>按这 3 步核对</h3>
                <ol>
                  {current.checks.map((check) => (
                    <li key={check}>{check}</li>
                  ))}
                </ol>
                <Link to={guideLink('specification')}>
                  查看图解说明 <ArrowRightOutlined aria-hidden="true" />
                </Link>
                <Link to={guideLink('rationale')}>
                  查看设计依据 <ArrowRightOutlined aria-hidden="true" />
                </Link>
              </aside>
            </div>
            <section className="erp-control-library-rules">
              <h3>什么时候用，为什么这样设计</h3>
              <div className="erp-control-table-scroll">
                <table className="erp-control-table" data-table-lines="fixed">
                  <thead>
                    <tr>
                      <th>场景</th>
                      <th>设计选择</th>
                      <th>原因与边界</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.rules.map((row) => (
                      <tr key={row[0]}>
                        {row.map((cell) => (
                          <td key={cell}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <details className="erp-control-library-source">
              <summary>共享实现与尺寸</summary>
              <p>{current.source}</p>
              <p>
                桌面常规控件 32–38px；手机可触区至少
                44px。页面只安排位置，外观与动效沿用共享样式；样例不写业务数据或外观偏好。
              </p>
            </details>
          </>
        )}
      </div>
    </section>
  )
}
