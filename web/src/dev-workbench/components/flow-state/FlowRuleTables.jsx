import React from 'react'
import Table from '@/common/components/table/AppTable'
import { WorkbenchSection } from '../WorkbenchPattern.jsx'
import { EvidenceDisclosure, KeyValue } from './FlowStateShared.jsx'

function RuleConditions({ rule }) {
  return (
    <>
      <p>{rule.condition}</p>
      <p>
        <strong>阻断原因：</strong>
        {rule.blocked}
      </p>
    </>
  )
}

function RuleEffects({ rule }) {
  return (
    <>
      <p>{rule.effect}</p>
      <p>
        <strong>纠正与恢复：</strong>
        {rule.recovery}
      </p>
    </>
  )
}

export function FlowActionRules({ flow }) {
  if (!flow.actionRules.length) return null
  const states = new Map(flow.states.map((state) => [state.key, state.label]))
  return (
    <WorkbenchSection
      flat
      headingLevel={3}
      title="办理条件与影响"
      className="erp-dev-flow-rule-table"
      data-action-rules
    >
      <p>
        以下为办理规则；实际能否办理由后端按当时的权限、版本和关联事实判定。
      </p>
      <Table
        aria-label={`${flow.label}办理规则`}
        rowKey="key"
        pagination={false}
        tableLayout="fixed"
        scroll={{ x: 720 }}
        dataSource={flow.actionRules}
        columns={[
          {
            title: '动作与责任',
            key: 'action',
            width: '26%',
            render: (_, rule) => (
              <>
                <strong>{rule.label}</strong>
                <p>
                  适用状态：
                  {rule.states.map((key) => states.get(key)).join('、')}
                </p>
                <p>{rule.authority}</p>
                <EvidenceDisclosure value={rule} label="规则依据">
                  {rule.permission.length > 0 ? (
                    <p>
                      权限：
                      <KeyValue value={rule.permission.join('、')} />
                    </p>
                  ) : null}
                </EvidenceDisclosure>
              </>
            ),
          },
          {
            title: '办理条件与阻断',
            key: 'conditions',
            width: '37%',
            render: (_, rule) => <RuleConditions rule={rule} />,
          },
          {
            title: '结果与纠正',
            key: 'effects',
            width: '37%',
            render: (_, rule) => <RuleEffects rule={rule} />,
          },
        ]}
      />
    </WorkbenchSection>
  )
}

export function MasterLifecycleRules({ flow }) {
  if (!flow.lifecycleRules.length) return null
  return (
    <WorkbenchSection
      flat
      headingLevel={3}
      title="逐对象启停规则"
      className="erp-dev-flow-rule-table"
      data-master-lifecycle-rules
    >
      <p>
        五类对象均使用“启用／停用”；归档不属于这五类对象的通用动作。停用不会自动作废历史单据。
      </p>
      <Table
        aria-label="主数据启停规则表"
        rowKey="key"
        pagination={false}
        tableLayout="fixed"
        scroll={{ x: 720 }}
        dataSource={flow.lifecycleRules}
        columns={[
          {
            title: '对象与入口',
            key: 'object',
            width: '20%',
            render: (_, rule) => (
              <>
                <strong>{rule.label}</strong>
                <p>
                  {rule.key === 'warehouse'
                    ? '编辑仓库 → 保存启停值'
                    : '对象专属启用／停用动作'}
                </p>
                <EvidenceDisclosure value={rule} label="规则依据">
                  <p>
                    字段：
                    <KeyValue value={rule.field} />
                  </p>
                  <p>
                    动作：
                    <KeyValue value={rule.action} />
                  </p>
                  <p>
                    权限：
                    <KeyValue value={rule.permission.join('、')} />
                  </p>
                </EvidenceDisclosure>
              </>
            ),
          },
          {
            title: '办理条件与限制',
            key: 'conditions',
            width: '40%',
            render: (_, rule) => <RuleConditions rule={rule} />,
          },
          {
            title: '引用、历史与恢复',
            key: 'effects',
            width: '40%',
            render: (_, rule) => <RuleEffects rule={rule} />,
          },
        ]}
      />
    </WorkbenchSection>
  )
}
