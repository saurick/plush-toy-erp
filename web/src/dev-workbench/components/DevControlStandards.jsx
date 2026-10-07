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
import FilterChip from '@/common/components/navigation/FilterChip'
import MobileSearchInput from '@/common/components/navigation/MobileSearchInput'
import NavigationCountBadge from '@/common/components/navigation/NavigationCountBadge'
import SearchInput from '@/common/components/SearchInput'
import { useERPTheme } from '@/common/theme/erpTheme'
import { getERPSurfaceTokens } from '@/common/theme/erpThemePalette.mjs'
import DevUIFeedbackExamples from './DevUIFeedbackExamples.jsx'
import '../styles/dev-ui-controls.css'

const TOPICS = [
  {
    key: 'feedback',
    title: '弹窗与反馈',
    summary: '编辑、提交、消息与恢复',
    guide: 'dialogs',
    description: '在同一份样例里体验输入校验、保存失败、结果未知和关闭保护。',
    rules: [
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
    key: 'navigation',
    title: '页签与视图',
    summary: '切换内容，保留当前对象',
    guide: 'type',
    description:
      '两种切换共享底轨与滑块，区别在于切换的是同级内容还是观察视角。',
    rules: [
      ['产品明细 / 关联任务', '页签', '同一对象下有不同内容区域。'],
      ['订单交付 / 生产执行', '分段切换', '少量互斥视角，按内容宽度排列。'],
      ['当前项', '浅色滑块 + 字重', '保留统一细边框，避免每项都争夺注意力。'],
      ['内容切换', '导航持续挂载', '指示条连续移动，不随正文重新出现。'],
    ],
    checks: [
      '切到关联任务：订单身份保持不变。',
      '快速反向切换：滑块从当前位置继续。',
      '用方向键切换，核对禁用项与减少动态效果。',
    ],
    source: 'SlidingTabs · SlidingSegmented · tabs-motion.css',
  },
  {
    key: 'filters',
    title: '筛选与搜索',
    summary: '缩小同一份结果',
    guide: 'navigation',
    description: '点状态、输入关键词或改变范围，观察同一份虚构记录如何变化。',
    rules: [
      [
        '常用条件',
        '带数量的筛选按钮',
        '直接看见队列与当前条件，数量不是第二个按钮。',
      ],
      [
        '单号 / 产品 / 负责人',
        '一个主搜索',
        '减少猜测入口，清除后仍可继续输入。',
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
      '输入不存在的关键词：出现无结果与清除入口。',
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
      ['任务看板', '低强调数字', '统计本人责任范围内未结束任务；同一任务只计一次。'],
      ['专门的异常入口', '风险色数字', '仅用于定义清楚的异常，不给所有模块总菜单挂红点。'],
      ['零 / 大数量', '隐藏 / 99+', '减少无效提示；悬停和读屏保留完整数量。'],
      ['读取中 / 失败', '省略号 / 待更新', '失败保留上次数量并标记；未知不能显示成零。'],
    ],
    checks: [
      '打开任务看板样例：清单与数字一致，浏览不清零。',
      '办理一项：清单和数字一起减少，归零后隐藏。',
      '切换大数量、读取中和失败，核对显示及重试。',
    ],
    source: 'NavigationCountBadge · 服务端任务看板总数',
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
        任务看板
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
        <h3>② 同一进度，切换视角</h3>
        <SlidingSegmented
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
    </div>
  )
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
            count={
              key === 'all'
                ? matching.length
                : matching.filter((row) => row.risk === key).length
            }
            onClick={() => setRisk(key)}
          >
            {key === 'all' ? '全部' : RISK_LABELS[key]}
          </FilterChip>
        ))}
        <FilterChip disabled>暂不可用</FilterChip>
      </div>
      <div className="erp-control-example-search erp-mobile-controls">
        <MobileSearchInput
          aria-label="演示搜索"
          placeholder="单号、产品、负责人"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onClear={() => setKeyword('')}
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
                  onChange={setScope}
                  options={[
                    { value: 'active', label: '在执行' },
                    { value: 'all', label: '全部' },
                    { value: 'ended', label: '已结束' },
                  ]}
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
          <table className="erp-control-table">
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
      <aside className="erp-control-library-directory">
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
              <Button onClick={() => update({ controlq: '' })}>清除搜索</Button>
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
          </div>
        </header>
        <div className="erp-control-library-layout">
          <section className="erp-control-library-demo" aria-label="交互样例">
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
                  colorPrimary: mode === 'dark' ? accent.dark : accent.primary,
                  ...getERPSurfaceTokens(mode === 'dark'),
                },
              }}
            >
              <div className="erp-control-library-stage" data-erp-theme={mode}>
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
            <table className="erp-control-table">
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
      </div>
    </section>
  )
}
