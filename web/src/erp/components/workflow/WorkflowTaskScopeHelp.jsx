import React from 'react'
import { CloseOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { BusinessHelpLabel } from '../help/BusinessContextHelp.jsx'
import './workflowTaskScopeHelp.css'

export default function WorkflowTaskScopeHelp({ kind, orderView = false, scope = 'flow' }) {
  const progress = kind === 'progress'
  const label = progress ? '任务进度范围' : '处理记录范围'

  return (
    <BusinessHelpLabel
      label={label}
      iconOnly
      renderContent={(closeHelp) => (
        <section className="workflow-task-scope-help" aria-label={`${label}说明`}>
          <div className="workflow-task-scope-help__heading">
            <strong>{progress ? '看进度：有哪些事，办到哪了' : '查经过：谁在什么时候做过什么'}</strong>
            <Button
              type="text"
              size="small"
              className="erp-business-inline-help-trigger"
              icon={<CloseOutlined aria-hidden="true" />}
              aria-label={`关闭${label}说明`}
              onClick={(event) => { event.stopPropagation(); closeHelp() }}
            />
          </div>

          {progress ? (
            <figure className="workflow-task-scope-help__map" data-active={orderView || undefined} aria-label="整张订单包含本次相关任务，本次相关任务包含当前任务和关联任务">
              <span>整张订单</span>
              <div className="workflow-task-scope-help__related" data-active={!orderView || undefined}>
                <span>这次相关的任务</span>
                <div className="workflow-task-scope-help__tasks">
                  <span data-included>当前任务</span>
                  <span data-included>关联任务</span>
                </div>
              </div>
              <span className="workflow-task-scope-help__secondary">同订单的其他采购、生产、发货任务</span>
            </figure>
          ) : (
            <figure className="workflow-task-scope-help__map" aria-label={scope === 'flow' ? '包含当前任务和本次关联任务的处理记录' : '只包含当前任务的处理记录'}>
              <span>这次相关的任务</span>
              <div className="workflow-task-scope-help__tasks">
                <span data-included>当前任务的记录</span>
                <span data-included={scope === 'flow' || undefined}>关联任务的记录</span>
              </div>
              <span className="workflow-task-scope-help__secondary">例如：创建、受阻、恢复、处理意见</span>
            </figure>
          )}

          <dl className="workflow-task-scope-help__definitions">
            {progress ? (
              <>
                <dt>相关任务进度</dt><dd>看与手头这项工作有关的任务，谁负责、哪些待办、哪些已结束。</dd>
                <dt>整单进度</dt><dd>放大到整张订单，看各个业务环节的任务。</dd>
              </>
            ) : (
              <>
                <dt>含关联任务</dt><dd>把当前任务和这次相关任务的处理经过放在一起看。</dd>
                <dt>只看本任务</dt><dd>只保留眼前这一个任务的处理经过，包含不同人的操作。</dd>
              </>
            )}
          </dl>
          <p className="workflow-task-scope-help__boundary">
            {progress
              ? '这里看任务进度；“处理记录”查每次办理的时间和意见。整单也只显示有权查看的任务。'
              : '两档都只显示有权查看的记录；没有其他关联任务时，内容相同。'}
          </p>
        </section>
      )}
    />
  )
}
