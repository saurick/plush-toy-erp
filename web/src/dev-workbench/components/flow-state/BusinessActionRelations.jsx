import React from 'react'
import { Button } from 'antd'
import AppSelect from '@/common/components/select/AppSelect'
import { PermissionLabel } from '../../../common/consts/permissions.generated.mjs'
import { WorkbenchFacts, WorkbenchSection, WorkbenchToolbar } from '../WorkbenchPattern.jsx'
import { describeDevBusinessChainResponsibility } from '../../config/devBusinessChainProjection.mjs'

import './businessRelations.css'

export default function BusinessActionRelations({
  actions,
  selectedKey,
  onSelect,
  onOpenRules,
}) {
  const action = actions.find((item) => item.key === selectedKey) || actions[0]
  if (!action) {
    return (
      <p className="erp-dev-relation-empty" role="status">
        当前范围没有匹配的关联动作。移除筛选条件可恢复查看。
      </p>
    )
  }
  const stateLabel = (flow, key) =>
    flow.states.find((state) => state.key === key)?.label || key
  const conditions = [
    ...new Set(
      [
        action.condition,
        ...action.transitions.map(({ transition }) => transition.guard),
      ].filter(Boolean)
    ),
  ]
  return (
    <WorkbenchSection
      flat
      className="erp-dev-action-relations"
      aria-label="动作关联"
      data-relation-action={action.key}
      title={actions.length === 1 ? action.label : undefined}
      headingLevel={4}
    >
      {actions.length > 1 ? (
        <WorkbenchToolbar>
          <AppSelect
            aria-label="关联动作"
            label="关联动作"
            value={action.key}
            virtual={false}
            options={actions.map((item) => ({
            value: item.key,
            label: item.label,
          }))}
            onChange={onSelect}
          />
        </WorkbenchToolbar>
      ) : null}
      <div
        className="erp-dev-action-relations__handoff"
        aria-label="动作上下游"
      >
        <div>
          <small>上游输入</small>
          <strong>{action.input}</strong>
        </div>
        <span aria-hidden>→</span>
        <div>
          <small>下游结果</small>
          <strong>{action.result}</strong>
        </div>
      </div>
      <WorkbenchFacts
        items={[
          {
            label: '责任',
            value: describeDevBusinessChainResponsibility({
              mode: action.responsibilityMode,
              ownerPoolKeys: action.roleKeys,
            }),
          },
          ...(action.transitions.length
            ? [
                {
                  label: '状态变化',
                  value: action.transitions
                    .map(
                      ({ flow, transition }) =>
                        `${flow.label}：${stateLabel(flow, transition.from)} → ${stateLabel(flow, transition.to)}`
                    )
                    .join('；'),
                },
              ]
            : []),
          {
            label: '关联权限',
            value:
              action.permissionKeys
                .map((key) => PermissionLabel[key] || key)
                .join('、') || '系统处理，沿用来源动作校验',
          },
        ]}
      />
      {conditions.length ? (
        <div className="erp-dev-action-relations__conditions">
          <span>办理条件</span>
          <ul>
            {conditions.map((condition) => (
              <li key={condition}>{condition}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {onOpenRules && action.machineKeys.length > 0 ? (
        <Button onClick={() => onOpenRules(action)}>查看动作规则</Button>
      ) : null}
    </WorkbenchSection>
  )
}
