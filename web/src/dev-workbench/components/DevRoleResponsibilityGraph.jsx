import React from 'react'
import { Button, Space, Tag, Typography } from 'antd'
import BusinessActionRelations from './flow-state/BusinessActionRelations.jsx'
import { WorkbenchEmpty } from './WorkbenchPattern.jsx'

const { Text } = Typography
const statusColor = (status) =>
  status === '可用' ? 'green' : status === '受限' ? 'orange' : undefined

export default function DevRoleResponsibilityGraph({
  model,
  selectedKey,
  actionKey,
  onSelect,
  onSelectAction,
  onViewRole,
  onOpenRole,
  onOpenChain,
}) {
  const selected =
    model.duties.find((duty) => duty.key === selectedKey) || model.duties[0]
  return (
    <div className="erp-dev-role-responsibilities">
      <div className="erp-dev-role-responsibilities__layout">
        <section
          className="erp-dev-role-responsibilities__duties"
          aria-label="岗位与业务职责"
        >
          {model.roles.map((role) => (
            <section
              key={role.key}
              className="erp-dev-role-responsibilities__role"
            >
              <div className="erp-dev-role-responsibilities__heading">
                <Text strong>{role.name}</Text>
                <Text type="secondary">{role.activeAccounts} 个启用账号</Text>
              </div>
              <Text type="secondary">
                {role.policy.registered
                  ? `核心职责 · ${role.core.length} 项功能`
                  : '未登记职责模板，请在明细核对已授予功能'}
              </Text>
              <div className="erp-dev-role-responsibilities__nodes">
                {role.duties.map((duty) => (
                  <button
                    key={duty.key}
                    type="button"
                    aria-pressed={selected?.key === duty.key}
                    className="erp-dev-role-responsibilities__node"
                    onClick={() => onSelect(duty.key)}
                  >
                    <span>{duty.label}</span>
                    <small>{duty.actions.length} 个关联动作</small>
                  </button>
                ))}
              </div>
              {!role.duties.length ? (
                <Text type="secondary">
                  当前范围没有登记的业务链动作，可在明细核对中查看功能。
                </Text>
              ) : null}
              {role.optional.length ? (
                <div className="erp-dev-role-responsibilities__optional">
                  <Text type="secondary">可选辅助</Text>
                  {role.optional.map((item) => (
                    <div key={item.key}>
                      <span>{item.label}</span>
                      <Tag color={statusColor(item.status)}>{item.status}</Tag>
                    </div>
                  ))}
                </div>
              ) : null}
              <details className="erp-dev-role-responsibilities__core">
                <summary>核心功能与当前可用情况</summary>
                {role.core.map((item) => (
                  <div key={item.key}>
                    <span>{item.label}</span>
                    <Tag color={statusColor(item.status)}>{item.status}</Tag>
                  </div>
                ))}
              </details>
              <Space wrap>
                <Button type="link" onClick={() => onViewRole(role.key)}>
                  查看岗位功能
                </Button>
                <Button type="link" onClick={() => onOpenRole(role.key)}>
                  配置此岗位
                </Button>
              </Space>
            </section>
          ))}
        </section>
        <section
          className="erp-dev-role-responsibilities__detail"
          aria-label="职责关联详情"
        >
          {selected ? (
            <>
              <div className="erp-dev-role-responsibilities__heading">
                <Text strong>{selected.label}</Text>
                <Button
                  type="link"
                  onClick={() => onOpenChain(selected, actionKey)}
                >
                  打开业务链路
                </Button>
              </div>
              <Text type="secondary">
                标准职责与办理条件；当前单据的责任人、审批设置仍由业务规则确定。
              </Text>
              <BusinessActionRelations
                actions={selected.actions}
                selectedKey={actionKey}
                onSelect={onSelectAction}
              />
            </>
          ) : (
            <WorkbenchEmpty title="当前范围没有关联动作" />
          )}
        </section>
      </div>
      <section
        className="erp-dev-role-responsibilities__gaps"
        aria-label="职责配置检查"
      >
        <Text strong>
          全部岗位职责检查 ·{' '}
          {model.gaps.length
            ? `${model.gaps.length} 个岗位需核对`
            : '未发现岗位配置缺口'}
        </Text>
        <p>
          检查全部已登记岗位的启用、账号分配和核心功能。此处不判定某张单据可由谁办理，审批责任请在依据中查看。
        </p>
        {model.gaps.map((gap) => (
          <div key={gap.key}>
            <Button type="link" onClick={() => onViewRole(gap.key)}>
              {gap.name}
            </Button>
            <span>{gap.reasons.join('；')}</span>
          </div>
        ))}
      </section>
    </div>
  )
}
