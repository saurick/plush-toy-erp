import React, { useEffect, useState } from 'react'
import { Button, Tag } from 'antd'
import {
  WorkbenchFacts,
  WorkbenchNotice,
  WorkbenchSection,
  WorkbenchToolbar,
} from '../WorkbenchPattern.jsx'
import DevTimestamp from '../DevTimestamp.jsx'
import { BUSINESS_RULE_STATUS, summarizeBusinessRuleStatus } from '../../config/devBusinessRules.mjs'
import {
  describeDevBusinessChainResponsibility,
  describeDevBusinessChainStep,
} from '../../config/devBusinessChainProjection.mjs'
import {
  chainStepRuleRows,
  chainStepSourceAccessFacts,
  readChainVerificationEvidence,
} from '../../config/devBusinessChainVerification.mjs'
import './businessChainStepVerification.css'

const gateLabels = {
  server: '后端单元与合同',
  web: '前端数据与打印',
  postgres: '真实 PostgreSQL',
}

export default function BusinessChainStepVerification({
  catalog,
  topic,
  step,
}) {
  const [evidence, setEvidence] = useState({})
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const description = describeDevBusinessChainStep(catalog, step)
  const rules = chainStepRuleRows(step, evidence)
  const from = topic.nodes.find((node) => node.key === step.fromNodeKey)
  const to = topic.nodes.find((node) => node.key === step.toNodeKey)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setEvidence({})
    readChainVerificationEvidence({ signal: controller.signal }).then(
      (value) => {
        if (!controller.signal.aborted) {
          setEvidence(value)
          setLoading(false)
        }
      }
    )
    return () => controller.abort()
  }, [reload])

  return (
    <WorkbenchSection
      className="erp-dev-chain-step-verification"
      aria-label="交接规则与验证"
      aria-busy={loading}
      data-chain-step-verification={step.key}
      title={step.label}
      headingLevel={4}
      description={`${from.label} → ${to.label}`}
    >
      <WorkbenchFacts
        items={[
          ...chainStepSourceAccessFacts(step),
          {
            label: '办理岗位',
            value: describeDevBusinessChainResponsibility(step.responsibility),
          },
          {
            label: '交接条件',
            value: description.condition || '按下列领域状态与规则办理',
          },
          {
            label: '前置状态',
            value: description.preconditions.join('；') || '见下列状态转换',
          },
          {
            label: '结果与状态转换',
            value: description.results.join('；') || '由流程节点及领域动作约束',
          },
        ]}
      />
      <WorkbenchToolbar
        tools={
          <Button
            loading={loading}
            onClick={() => setReload((value) => value + 1)}
          >
            重新读取证据
          </Button>
        }
      >
        <span>静态关联不代表已执行；本页只读取报告。</span>
      </WorkbenchToolbar>
      {evidence.errors?.length ? (
        <WorkbenchNotice
          tone="error"
          title={evidence.errors.join('；')}
          description="可重新读取；规则与测试关联仍可查看。"
        />
      ) : null}
      {!loading ? (
        <p className="erp-dev-chain-step-verification__evidence">
          <span>
            普通测试：
            {evidence.report
              ? evidence.reportCurrent
                ? '当前工作区'
                : '历史报告'
              : '未采集'}{' '}
            <DevTimestamp value={evidence.report?.generatedAt} missing="" />
          </span>
          <span>
            数据库：
            {evidence.evidence?.run
              ? evidence.evidence.current
                ? '源码一致'
                : '历史报告'
              : '未采集'}{' '}
            <DevTimestamp
              value={evidence.evidence?.run?.finishedAt}
              missing=""
            />
          </span>
        </p>
      ) : null}
      <ul className="erp-dev-chain-step-verification__rules">
        {rules.map((rule) => {
          const [label, color] = BUSINESS_RULE_STATUS[rule.status]
          return (
            <li key={rule.id} data-step-rule={rule.id}>
              <div className="erp-dev-chain-step-verification__rule-title">
                <strong>{rule.label}</strong>
                <Tag color={color}>{loading ? '读取中' : label}</Tag>
              </div>
              <p>{rule.standard}</p>
              <details className="erp-dev-disclosure">
                <summary>{rule.tests.length} 项验证结果</summary>
                <table data-table-lines="appearance" aria-label={`${rule.label}的验证结果`}>
                  <thead><tr><th scope="col">验证范围</th><th scope="col">执行结果</th><th scope="col">检查项</th></tr></thead>
                  <tbody>{[...new Set(rule.tests.map((item) => item.gate))].map((gate) => {
                    const tests = rule.tests.filter((item) => item.gate === gate)
                    const status = summarizeBusinessRuleStatus(tests.map((item) => item.status))
                    return <tr key={gate}><td>{gateLabels[gate]}</td><td><Tag color={BUSINESS_RULE_STATUS[status][1]}>{loading ? '读取中' : BUSINESS_RULE_STATUS[status][0]}</Tag></td><td>{tests.length} 项</td></tr>
                  })}
                  </tbody>
                </table>
                {rule.tests.some((item) => item.status === 'failed') ? <ul aria-label="失败检查">{rule.tests.filter((item) => item.status === 'failed').map((item) => <li key={item.id}><code>{item.name}</code></li>)}</ul> : null}
              </details>
            </li>
          )
        })}
      </ul>
    </WorkbenchSection>
  )
}
