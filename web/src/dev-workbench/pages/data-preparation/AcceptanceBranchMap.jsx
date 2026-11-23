import { useId, useState } from 'react'
import { Descriptions, Space, Tag } from 'antd'

function StepDetails({ step, regression, scenarioLabelByKey }) {
  return (
    <Descriptions
      size="small"
      bordered
      column={regression ? 1 : { xs: 1, lg: 2 }}
      classNames={{ label: 'erp-dev-data-step-label' }}
      items={[
        {
          key: 'responsibility',
          label: '责任岗位',
          children: step.responsibleRole,
        },
        {
          key: 'preconditions',
          label: '前置状态',
          children: step.preconditions.join('；'),
        },
        ...(step.actions.length === 1 && step.actions[0] === step.label ? [] : [{
          key: 'actions',
          label: '允许动作',
          children: step.actions.join('；'),
        }]),
        {
          key: 'results',
          label: '结果状态',
          children: step.results.join('；'),
        },
        {
          key: 'facts',
          label: '业务事实',
          children: step.facts.join('；'),
        },
        {
          key: 'scenarios',
          label: '覆盖场景',
          children: (
            <Space wrap size={[4, 4]}>
              {step.scenarioKinds.map((kind) => (
                <Tag key={kind}>{scenarioLabelByKey.get(kind) || kind}</Tag>
              ))}
            </Space>
          ),
        },
      ]}
    />
  )
}

export default function AcceptanceBranchMap({ chain, regression, scenarioLabelByKey }) {
  const [selectedKey, setSelectedKey] = useState(null)
  const id = useId()
  // Group the displayed sources only. Each action keeps its own recorded destination.
  const groups = new Map()
  for (const step of chain.steps) {
    if (!groups.has(step.fromLabel)) groups.set(step.fromLabel, [])
    groups.get(step.fromLabel).push(step)
  }
  return (
    <div className="erp-dev-data-branches" role="group" aria-label="业务步骤分支图">
      <p>按来源查看办理动作和去向；点动作查看条件与结果。</p>
      {Array.from(groups, ([source, steps]) => (
        <div className="erp-dev-data-branch-group" key={source} role="group" aria-label={source}>
          <strong className="erp-dev-data-branch-source">{source}</strong>
          <ul>
            {steps.map((step) => {
              const branch = !step.scenarioKinds.includes('happy_path')
              const open = selectedKey === step.key
              const detailId = `${id}-${step.key}`
              return (
                <li key={step.key} data-branch={branch || undefined}>
                  <div className="erp-dev-data-branch-route">
                    <button
                      type="button"
                      className="erp-directory-item"
                      aria-expanded={open}
                      aria-current={open || undefined}
                      aria-controls={open ? detailId : undefined}
                      onClick={() => setSelectedKey(open ? null : step.key)}
                    >
                      {step.label}
                    </button>
                    <span>{branch && <Tag>分支</Tag>}<span aria-hidden="true">→ </span>{step.toLabel}</span>
                  </div>
                  {open && (
                    <div id={detailId} className="erp-dev-data-chain-step">
                      <StepDetails step={step} regression={regression} scenarioLabelByKey={scenarioLabelByKey} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
