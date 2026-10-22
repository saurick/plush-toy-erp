import React, { useEffect, useRef, useState } from 'react'
import { Button, Tag } from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import { WorkflowTaskStatus } from '../../common/consts/statuses.generated.mjs'
import { ProgressIdentity, ProgressDue, ProgressDelivery, ProgressAttention } from '../../erp/components/business-visualizations/ProgressCompactContent.jsx'
import '../../erp/styles/app/progress-board.css'
import '../../erp/mobile/mobileProgress.css'
import { WorkflowTaskAssociation } from '../../erp/components/workflow/WorkflowTaskIdentity.jsx'
import WorkflowTaskTiming from '../../erp/components/workflow/WorkflowTaskTiming.jsx'
import { getWorkflowTaskEventStatusLabel } from '../../erp/utils/workflowTaskEventPresentation.mjs'
import { DESIGN_TASKS, DESIGN_TASK_GROUPS, DESIGN_TASK_NOW, DESIGN_PROGRESS, designTaskPresentation, getWorkCenterDesignTopic } from '../config/devWorkCenterDesign.mjs'
import '../styles/dev-work-center-design.css'

function Point({ id, marked = false, children, topic, selected, select, className = '' }) {
  const index = topic.points.findIndex((item) => item.key === id)
  return (
    <div className={`erp-wc-point ${selected === id ? 'is-selected' : ''} ${className}`} data-design-point={id}>
      {marked ? <button type="button" className="erp-wc-marker" aria-label={`${index + 1} ${topic.points[index].title}`} aria-pressed={selected === id} onClick={() => select(id)}>{index + 1}</button> : null}
      {children}
    </div>
  )
}

function TaskCards({ point, mobile }) {
  const [group, setGroup] = useState('common')
  const cards = DESIGN_TASKS.filter((task) => task.group === group).map((task, index) => {
    const item = designTaskPresentation(task)
    const blocked = task.task_status_key === WorkflowTaskStatus.BLOCKED
    const status = <Tag color={blocked ? 'error' : undefined}>{blocked ? '受阻' : getWorkflowTaskEventStatusLabel(task.task_status_key)}</Tag>
    const heading = point('identity', <span className="erp-wc-task-badges"><strong className="erp-wc-task-title">{item.title}</strong></span>, index === 0)
    const association = point('references', <span className={`erp-task-identity erp-task-identity--compact${mobile ? '' : ' erp-task-identity--card erp-task-identity--table'}`}><WorkflowTaskAssociation task={task} heading={mobile ? null : heading} /></span>, index === 0)
    const responsibility = <span>{item.responsibility}</span>
    const reason = blocked ? <p className="erp-wc-danger">受阻原因：{task.reason}</p> : null
    const deadline = <WorkflowTaskTiming task={task} includeKeys={['due', 'ended']} nowMs={DESIGN_TASK_NOW} />
    const source = item.available ? item.source : '生产工序批次'
    if (mobile) {
      return (
        <article className="erp-wc-task-card erp-task-card erp-task-card--compact" key={task.id} data-design-task-case={task.id}>
          {point('identity', <div className="erp-wc-card-head erp-task-identity__card-heading"><strong className="erp-wc-task-title">{item.title}</strong><span className="erp-wc-task-badges">{status}</span></div>, index === 0)}
          {association}
          {point('responsibility', <span className="erp-wc-secondary erp-wc-source">{source}</span>, index === 0)}
          {reason}
          <div className="erp-wc-card-footer erp-task-card__footer">
            {responsibility}
            {point('attention', deadline, index === 0)}
          </div>
        </article>
      )
    }
    return (
      <tr key={task.id} className="erp-task-table-row" data-design-task-case={task.id}>
        <td>{association}</td>
        <td>{point('responsibility', <span>{source}</span>, index === 0)}{deadline}</td>
        <td>{point('attention', <>{status}{reason}</>, index === 0)}</td>
        <td>{responsibility}</td>
      </tr>
    )
  })
  return <div className="erp-wc-task-examples"><Segmented aria-label="任务样例分组" value={group} options={DESIGN_TASK_GROUPS} onChange={setGroup} />{mobile ? <div className="erp-wc-card-list">{cards}</div> : <div className="erp-wc-table-wrap"><table className="erp-wc-task-table" data-table-lines="fixed" aria-label="电脑版任务列表样例"><thead><tr><th>办理事项 / 关联内容</th><th>来源 / 时间</th><th>状态 / 原因</th><th>负责岗位 / 办理人</th></tr></thead><tbody>{cards}</tbody></table></div>}</div>
}

function ProgressCards({ point, mobile }) {
  const rows = DESIGN_PROGRESS.map((item, index) => {
    const identity = point('identity', <ProgressIdentity row={item} />, index === 0)
    const quantity = point('quantity', <ProgressDelivery row={item} />, index === 0)
    const attention = point('details', <ProgressAttention row={item} access={{ tasks: true }} />, index === 0)
    return mobile ? <article className="mobile-progress-card erp-wc-progress-card" key={item.key}><div className="mobile-progress-card-main"><div className="mobile-progress-card-identity">{identity}<ProgressDue row={item} snapshotAt="2026-10-21" /></div>{quantity}</div><div className="mobile-progress-task-entry mobile-progress-task-entry--empty">{attention}</div></article> : <tr className="erp-progress-row" key={item.key}><td>{identity}</td><td><ProgressDue row={item} snapshotAt="2026-10-21" /></td><td>{quantity}</td><td>{attention}</td></tr>
  })
  return <div className="erp-wc-progress-examples">{mobile ? <div className="erp-wc-card-list">{rows}</div> : <div className="erp-wc-table-wrap"><table className="erp-progress-table" data-table-lines="fixed" aria-label="电脑版进度列表样例"><thead><tr><th>订单与产品</th><th>交期</th><th>数量与单位</th><th>当前待办</th></tr></thead><tbody>{rows}</tbody></table></div>}</div>
}

function TaskContext() {
  return <><strong>准备并办理发货</strong><span className="erp-wc-secondary">示例毛绒狐狸 · DEMO-CP-001</span><span>出货单 · DEMO-CK-001</span><span>示例员工（业务） · 截止 10 月 22 日 17:00</span></>
}

function Scene({ topic, mobile, point, select }) {
  switch (topic.key) {
    case 'task-cards': return <TaskCards point={point} mobile={mobile} />
    case 'task-handling': return <div className="erp-wc-sample-panel"><div className="erp-wc-sample-tabs"><span>1 核对任务</span><strong>2 选择处理</strong><span>3 确认结果</span></div>{point('context', <TaskContext />, true)}{point('action', <><span className="erp-wc-input">转交任务</span><span>转交原因 <span className="erp-wc-required">必填</span></span><p className="erp-wc-input">发货资料已核对，请业务同事继续办理。</p><span>接收人</span><span className="erp-wc-input">示例接收员工</span></>, true)}{point('submit', <div className="erp-wc-action-footer"><Button onClick={() => select('submit')}>附件</Button><Button type="primary" onClick={() => select('submit')}>确认转交</Button></div>, true)}</div>
    case 'work-progress': return <ProgressCards point={point} mobile={mobile} />
    case 'work-tracking': return <div className="erp-wc-sample-panel">{point('summary', <><div className="erp-wc-card-head"><strong>发货办理 · DEMO-LC-001</strong><Tag>办理中</Tag></div><span>出货单 · DEMO-CK-001</span><span>业务 · 示例员工</span><span className="erp-wc-secondary">由示例发起人于 10 月 20 日发起</span></>, true)}{point('flow', <ol className="erp-wc-chain"><li>放行复核 · 已结束</li><li aria-current="step">发货准备 · 当前任务</li><li>实际出货 · 等待办理</li></ol>, true)}{point('history', <><strong>最近处理记录</strong><span>10:26 · 示例员工 · 核对发货资料</span><span>09:00 · 任务进入业务岗位</span></>, true)}</div>
    case 'work-exceptions': return <div className="erp-wc-sample-panel">{point('reason', <><div className="erp-wc-card-head"><strong>发货资料待补齐</strong><Tag color="error">尚未解除</Tag></div><p className="erp-wc-danger">收货信息未确认，当前发货办理受阻。</p></>, true)}{point('owner', <><span>出货单 · DEMO-CK-001</span><span>业务 · 示例员工</span></>, true)}{point('recovery', <><strong>处理记录</strong><span>10:26 · 已联系业务核对收货信息</span><span className="erp-wc-secondary">补齐资料，由有权限的责任人核对解除条件。</span><Button onClick={() => select('recovery')}>查看可办理动作</Button></>, true)}</div>
    case 'work-results': return <div className="erp-wc-sample-panel">{point('result', <><strong>暂时无法确认是否处理成功</strong><span>请先核对本次结果。</span></>, true)}{point('effect', <><TaskContext /><div className="erp-wc-divider" /><span>本次申请：转交任务</span><span className="erp-wc-secondary">当前回执不能证明业务结果已生效。</span></>, true)}{point('next', <div className="erp-wc-action-footer"><Button onClick={() => select('next')}>返回任务</Button><Button type="primary" onClick={() => select('next')}>核对结果</Button></div>, true)}</div>
    case 'work-overview': return <div className="erp-wc-sample-panel">{point('counts', <><div className="erp-wc-metrics"><span><strong>19</strong>待我处理</span><span><strong>3</strong>待我审批</span><span><strong>14</strong>风险事项</span></div><span className="erp-wc-secondary">待我处理可能同时属于审批与风险范围</span></>, true)}{point('calendar', <><strong>2026 年 10 月</strong><div className="erp-wc-calendar"><span>19</span><strong>20</strong><span>21</span></div><strong>10 月 20 日 · 3 项任务</strong><span>1 项受阻 · 2 项待处理</span><span className="erp-wc-secondary">按任务截止日期组织</span></>, true)}</div>
    case 'mobile-entry': return <div className="erp-wc-sample-panel">{point('account', <><strong>示例员工</strong><span>当前岗位 · 业务</span></>, true)}{point('entry', <><div className="erp-wc-profile-row"><span>显示设置</span><span>跟随系统 ›</span></div><div className="erp-wc-profile-row"><span>切换工作入口</span><span>›</span></div><div className="erp-wc-profile-row"><span>运行版本</span><span>示例版本</span></div></>, true)}</div>
    default: return null
  }
}

export default function DevWorkCenterDesign({ topic: entry }) {
  const topic = getWorkCenterDesignTopic(entry.key)
  const [params, setParams] = useSearchParams()
  const root = useRef(null)
  const mobile = topic.devices.length === 1 || params.get('page') === 'mobile-tasks'
  const selected = topic.points.find((item) => item.key === params.get('point')) || topic.points[0]
  const index = topic.points.indexOf(selected)
  const basisParams = new URLSearchParams(params)
  basisParams.set('view', 'rationale')
  basisParams.set('read', 'reference')
  basisParams.set('chapter', 'work-center-rationale')
  const origin = useRef(null)
  const update = (patch) => {
    const next = new URLSearchParams(window.location.search)
    Object.entries(patch).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key))
    setParams(next)
  }
  useEffect(() => {
    if (params.has('point') && !topic.points.some((item) => item.key === params.get('point'))) {
      const next = new URLSearchParams(params)
      next.delete('point')
      setParams(next, { replace: true })
    }
  }, [params, setParams, topic])
  const select = (key, from = 'sample') => {
    origin.current = from
    if (key === selected.key) {
      root.current?.querySelector(from === 'sample' ? '.erp-wc-explanation' : `[data-design-point="${key}"]`)?.scrollIntoView({ block: 'nearest' })
    }
    update({ point: key === topic.points[0].key ? '' : key })
  }
  useEffect(() => {
    if (!origin.current) return
    root.current?.querySelector(origin.current === 'sample' ? '.erp-wc-explanation' : `[data-design-point="${selected.key}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    origin.current = null
  }, [selected.key])
  const point = (id, children, marked = false) => <Point key={id} id={id} marked={marked} topic={topic} selected={selected.key} select={select}>{children}</Point>
  return (
    <section ref={root} className="erp-design-work-center" aria-label="工作中心界面说明" data-design-topic={topic.key} data-design-device={mobile ? 'mobile' : 'desktop'}>
      <header className="erp-wc-heading"><div><h2>{topic.title}</h2><p>{topic.description}</p></div>{topic.devices.length > 1 ? <Segmented aria-label="说明设备" value={mobile ? 'mobile' : 'desktop'} options={[{ value: 'desktop', label: '电脑版' }, { value: 'mobile', label: '手机版' }]} onChange={(value) => update({ page: value === 'mobile' ? 'mobile-tasks' : '', point: '' })} /> : null}</header>
      <div className="erp-wc-layout"><figure className={`erp-wc-figure ${mobile ? 'is-mobile' : ''}`} aria-label="界面信息示意"><Scene topic={topic} mobile={mobile} point={point} select={select} /><figcaption>示例数据 · 点击编号看含义与布局原因</figcaption></figure>
        <aside className="erp-wc-explanation" aria-label="当前界面解释"><nav className="erp-wc-point-nav" aria-label="查看说明位置">{topic.points.map((item, number) => <button key={item.key} type="button" aria-label={`${number + 1} ${item.title}`} aria-pressed={selected.key === item.key} onClick={() => select(item.key, 'explanation')}>{number + 1}</button>)}</nav><div aria-live="polite"><h3>{index + 1} {selected.title}</h3><p>{selected.shows}</p><h4>为什么这样安排</h4><p>{selected.why}</p><h4>什么时候变化</h4><p>{selected.when}</p></div><Link to={`/__dev/ui-design?${basisParams}`}>查看设计依据</Link></aside>
      </div>
    </section>
  )
}
