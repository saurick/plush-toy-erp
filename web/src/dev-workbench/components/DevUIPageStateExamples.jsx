import React, { useState } from 'react'
import { Alert, Button, Empty, Tag } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { Loading } from '@/common/components/loading'
import AppSelect from '@/common/components/select/AppSelect'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'
import SlidingTabs from '@/common/components/navigation/SlidingTabs'
import FilterChip from '@/common/components/navigation/FilterChip'
import MobileTaskListContent from '../../erp/mobile/components/MobileTaskListContent.jsx'
import WorkflowTaskCard from '../../erp/components/workflow/WorkflowTaskCard.jsx'
import WorkflowTaskIdentity from '../../erp/components/workflow/WorkflowTaskIdentity.jsx'
import { UI_DESIGN_MOBILE_STATES } from '../config/devUIDesign.mjs'
import '../../erp/mobile/mobileRoleTasks.css'
import '../styles/dev-ui-page-states.css'

const TASKS = [
  '核对样品资料',
  '确认包装图稿',
  '完善工程用料',
  '核对产品尺寸',
].map((name, index) => ({
  id: index + 1,
  task_name: name,
  source_no: 'SO-DEMO-01',
  display_context: {
    available: true,
    source_no: 'SO-DEMO-01',
    items: [{ kind: 'product', name: '浅棕小熊', code: 'BEAR-DEMO-01' }],
  },
}))

const DESKTOP_STATES = [
  { key: 'route-loading', label: '切页等待' },
  { key: 'data', label: '正常' },
  { key: 'error', label: '读取失败' },
]

const STATE_HELP = {
  loading: '首次读取用四张卡片占位；页签与筛选始终保留。',
  switching: '新栏目尚未读回时，只在列表区等待，不显示其他栏目的记录。',
  refreshing: '同一查询刷新时保留卡片、选择与滚动位置。',
  data: '内容就绪后移除等待反馈，卡片可以选择。',
  empty: '确认没有记录后才显示空状态。',
  filtered: '没有匹配结果时保留条件，并提供清除入口。',
  error: '失败单独说明原因，重试保留当前查询。',
  'refresh-error': '刷新失败保留上次成功内容，并明确提示尚未更新。',
  'route-loading': '只替换内容区；等待期间仍可选择其他导航。',
}

function EmptyOrError({ state, recover }) {
  if (state === 'error' || state === 'refresh-error') {
    return (
      <Alert
        type="error"
        showIcon
        message={
          state === 'refresh-error'
            ? '刷新失败，仍显示上次结果'
            : '本次读取失败，条件已保留'
        }
        action={<Button onClick={recover}>重试读取</Button>}
      />
    )
  }
  return (
    <Empty
      description={
        state === 'filtered' ? '没有符合条件的记录' : '当前范围暂无记录'
      }
    >
      {state === 'filtered' && <Button onClick={recover}>清除条件</Button>}
    </Empty>
  )
}

function MobileExample({
  state,
  setState,
  width,
  attentionOnly,
  setAttentionOnly,
}) {
  const [tab, setTab] = useState('todo')
  const [selected, setSelected] = useState(null)
  const pending = ['loading', 'switching'].includes(state)
  const loading = pending || state === 'refreshing'
  const hasRows = ['data', 'refreshing', 'refresh-error'].includes(state)
  const recover = () => {
    if (state === 'filtered') setAttentionOnly(false)
    setState('data')
  }
  return (
    <section
      className="erp-page-state-phone"
      style={{ width }}
      aria-label="手机页面状态样例"
    >
      <div className="erp-page-state-phone__toolbar">
        <SlidingTabs
          aria-label="样例任务栏目"
          activeKey={tab}
          onChange={(value) => {
            setTab(value)
            setState('switching')
            setSelected(null)
          }}
          items={[
            { key: 'todo', label: '待办' },
            { key: 'done', label: '已办' },
          ]}
        />
        <div className="erp-control-example-row" aria-label="样例查询条件">
          <FilterChip
            selected={attentionOnly}
            onClick={() => {
              setAttentionOnly(!attentionOnly)
              setState(attentionOnly ? 'data' : 'filtered')
            }}
          >
            需要关注
          </FilterChip>
          <Button
            icon={<ReloadOutlined />}
            loading={state === 'refreshing'}
            disabled={pending}
            onClick={() => setState('refreshing')}
          >
            刷新
          </Button>
        </div>
      </div>
      <div className="erp-page-state-phone__scroll">
        <div className="erp-page-state-phone__feedback" role="status">
          {state === 'refreshing'
            ? '正在刷新，保留当前内容'
            : selected && hasRows
              ? `当前选择：${TASKS.find((task) => task.id === selected).task_name}`
              : ''}
        </div>
        <MobileTaskListContent
          loading={loading}
          pending={pending}
          initialLoading={state === 'loading'}
          label={`正在加载${tab === 'done' ? '已办' : '待办'}任务`}
        >
          {['empty', 'filtered', 'error', 'refresh-error'].includes(state) && (
            <EmptyOrError state={state} recover={recover} />
          )}
          {hasRows && (
            <div className="mobile-task-card-list">
              {TASKS.map((task) => (
                <WorkflowTaskCard
                  key={task.id}
                  compact
                  label={`选择${task.task_name}`}
                  className={`erp-mobile-list-item mobile-task-list-row${selected === task.id ? ' mobile-task-list-row--selected' : ''}`}
                  onOpen={() => setSelected(task.id)}
                >
                  <WorkflowTaskIdentity
                    task={task}
                    compact
                    layout="card"
                    copyable={false}
                    showTaskName
                    status={
                      <Tag className="mobile-task-list-status">
                        {tab === 'done' ? '已处理' : '待处理'}
                      </Tag>
                    }
                    source={task.source_no}
                  />
                  <div className="erp-task-card__footer mobile-task-list-row__footer">
                    <span>工程 · 小林</span>
                    <span>今天 09:20</span>
                  </div>
                </WorkflowTaskCard>
              ))}
            </div>
          )}
        </MobileTaskListContent>
      </div>
    </section>
  )
}

function DesktopExample({ state, setState }) {
  const [destination, setDestination] = useState('销售订单')
  return (
    <section className="erp-page-state-desktop" aria-label="电脑切页样例">
      <nav aria-label="样例主导航">
        {['工作台', '任务管理', '销售订单'].map((label) => (
          <Button
            key={label}
            type={destination === label ? 'primary' : 'default'}
            onClick={() => {
              setDestination(label)
              setState('data')
            }}
          >
            {label}
          </Button>
        ))}
      </nav>
      <div
        className="erp-page-state-desktop__content"
        aria-busy={state === 'route-loading'}
      >
        {state === 'route-loading' ? (
          <Loading
            title={`正在打开${destination}`}
            description="页面内容准备中，您仍可使用左侧导航。"
          />
        ) : state === 'error' ? (
          <EmptyOrError state={state} recover={() => setState('data')} />
        ) : (
          <>
            <h3>{destination}</h3>
            <Alert type="success" showIcon message={`${destination}已就绪`} />
            <p>当前查询与可用操作在此处继续。</p>
          </>
        )}
      </div>
    </section>
  )
}

export default function DevUIPageStateExamples() {
  const [device, setDevice] = useState('mobile')
  const [state, setState] = useState('loading')
  const [width, setWidth] = useState(390)
  const [attentionOnly, setAttentionOnly] = useState(false)
  const states = device === 'mobile' ? UI_DESIGN_MOBILE_STATES : DESKTOP_STATES
  return (
    <div className="erp-control-example-stack erp-page-state-examples">
      <div className="erp-control-example-row">
        <SlidingSegmented
          aria-label="页面状态设备"
          value={device}
          onChange={(value) => {
            setDevice(value)
            setState(value === 'mobile' ? 'loading' : 'route-loading')
          }}
          options={[
            { value: 'mobile', label: '手机任务' },
            { value: 'desktop', label: '电脑切页' },
          ]}
        />
        <AppSelect
          label="页面状态"
          placeholder="页面状态"
          aria-label="页面状态"
          value={state}
          onChange={(value) => {
            setState(value)
            if (value === 'filtered') setAttentionOnly(true)
          }}
          options={states.map(({ key, label }) => ({ value: key, label }))}
        />
        {device === 'mobile' && (
          <SlidingSegmented
            aria-label="手机样例宽度"
            value={width}
            onChange={setWidth}
            options={[
              { value: 390, label: '390px' },
              { value: 320, label: '320px' },
            ]}
          />
        )}
        {['loading', 'switching', 'refreshing', 'route-loading'].includes(
          state
        ) && <Button onClick={() => setState('data')}>完成读取</Button>}
      </div>
      {state && <p className="erp-page-state-hint">{STATE_HELP[state]}</p>}
      {!state ? (
        <Empty description="请选择页面状态" />
      ) : device === 'mobile' ? (
        <MobileExample
          state={state}
          setState={setState}
          width={width}
          attentionOnly={attentionOnly}
          setAttentionOnly={setAttentionOnly}
        />
      ) : (
        <DesktopExample state={state} setState={setState} />
      )}
    </div>
  )
}
