import React, { useState } from 'react'
import { Button } from 'antd'
import Select from '@/common/components/select/AppSelect'
import { WorkbenchFacts, WorkbenchSection, WorkbenchToolbar } from '../WorkbenchPattern.jsx'
import { buildDevDocsLocation } from '../../pages/devDocsNavigation.mjs'
import { chainRuleTestingURL } from '../../config/devBusinessChainVerification.mjs'
import { BUSINESS_RULES } from '../../config/devBusinessRules.mjs'
import { buildMasterLifecycleGraph } from '../../config/devBusinessRuleGraphs.mjs'
import BusinessFlowDiagram from './BusinessFlowDiagram.jsx'

function RuleReader({ rules, title, selectLabel, states, lifecycle = false, selectedKey, onSelect }) {
  const [localKey, setLocalKey] = useState(null)
  const key = onSelect ? selectedKey : localKey
  const rule = key === '' ? null : rules.find((item) => item.key === key) || (onSelect && key != null ? null : rules[0])
  if (!rules.length) return null
  return (
    <WorkbenchSection
      flat
      headingLevel={3}
      title={title}
      className="erp-dev-flow-rule-table"
      data-action-rules={!lifecycle || undefined}
      data-master-lifecycle-rules={lifecycle || undefined}
    >
      <WorkbenchToolbar>
        <Select
          aria-label={selectLabel}
          allowClear
          placeholder={`选择${selectLabel}`}
          virtual={false}
          value={rule?.key}
          options={rules.map((item) => ({ value: item.key, label: item.label }))}
          onChange={(key) => (onSelect || setLocalKey)(key ?? '')}
        />
      </WorkbenchToolbar>
      {rule ? (
        <>
          {lifecycle ? <BusinessFlowDiagram key={rule.key} relationships flow={buildMasterLifecycleGraph(rule)} label={`${rule.label}启停与引用规则图`} legend="启停由对象专属动作办理；保留历史引用不表示删除或作废原单据。" /> : null}
          <WorkbenchFacts
            items={[
          ...(rule.states ? [{ label: '适用状态', value: rule.states.map((key) => lifecycle ? (key ? '启用' : '停用') : states.get(key)).join('、') }] : []),
          ...(rule.authority ? [{ label: '办理责任', value: rule.authority }] : []),
          ...(lifecycle ? [{ label: '办理入口', value: rule.key === 'warehouse' ? '编辑仓库后保存启停值' : '对象专属启用／停用动作' }] : []),
        ]}
          />
          <div className="erp-dev-flow-rule-detail">
            <section>
              <h4>办理条件</h4>
              <p>{rule.condition}</p>
              <p><strong>受阻时：</strong>{rule.blocked}</p>
            </section>
            <section>
              <h4>结果与纠正</h4>
              <p>{rule.effect}</p>
              <p><strong>纠正与恢复：</strong>{rule.recovery}</p>
            </section>
          </div>
          {rule.relatedDocuments?.length || rule.verificationRuleIds?.length ? (
            <WorkbenchToolbar role="navigation" aria-label="关联说明与验证">
              {rule.relatedDocuments?.map((document) => {
                const location = buildDevDocsLocation(document)
                return (
                  <Button type="link" key={document.path + document.headingId} href={`${location.pathname}${location.search}${location.hash}`}>
                    {document.label}
                  </Button>
                )
              })}
              {rule.verificationRuleIds?.map((id) => (
                <Button type="link" key={id} href={chainRuleTestingURL(id)}>
                  {BUSINESS_RULES.find((item) => item.id === id)?.label}测试
                </Button>
              ))}
            </WorkbenchToolbar>
          ) : null}
        </>
      ) : null}
    </WorkbenchSection>
  )
}

export function FlowActionRules({ flow, stateKey = '', selectedKey, onSelect }) {
  const rules = stateKey
    ? flow.actionRules.filter((rule) => rule.states.includes(stateKey))
    : flow.actionRules
  return (
    <RuleReader
      rules={rules}
      title="办理规则"
      selectLabel="办理动作"
      selectedKey={selectedKey}
      onSelect={onSelect}
      states={new Map(flow.states.map((state) => [state.key, state.label]))}
    />
  )
}

export function MasterLifecycleRules({ flow, selectedKey, onSelect }) {
  return (
    <RuleReader
      rules={flow.lifecycleRules}
      title="启停规则"
      selectLabel="主数据对象"
      selectedKey={selectedKey}
      onSelect={onSelect}
      states={new Map(flow.states.map((state) => [state.key, state.label]))}
      lifecycle
    />
  )
}
