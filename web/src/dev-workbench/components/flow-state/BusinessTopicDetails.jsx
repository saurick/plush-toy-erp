import React from 'react'
import { Button } from 'antd'
import { Link } from 'react-router-dom'
import { describeDevBusinessChainResponsibility } from '../../config/devBusinessChainProjection.mjs'
import {
  DEV_BUSINESS_CHAIN_AUDIT_ROUTE,
  DEV_DATA_PREPARATION_ROUTE,
  DEV_TESTING_ROUTE,
} from '../../config/devRoutes.mjs'
import './businessTopicDetails.css'

const evidenceLabels = {
  dataset: '模拟数据',
  contract_test: '规则测试',
  browser: '浏览器验证',
}

export default function BusinessTopicDetails({
  topic,
  node,
  onSelect,
  onExploreChain,
}) {
  const nodes = new Map(topic.nodes.map((item) => [item.key, item]))
  const steps = new Map(topic.steps.map((item) => [item.key, item]))
  const relations = topic.edges.filter(
    (edge) => edge.from === node.key || edge.to === node.key
  )
  return (
    <aside
      className="erp-dev-chain-topics__detail"
      aria-label={`${node.label}关联条件`}
    >
      <div className="erp-dev-fulfillment-guide__focus" aria-live="polite">
        <strong>{node.label}</strong>
        {node.summary ? <p>{node.summary}</p> : null}
      </div>
      <ul className="erp-dev-chain-topics__relations" aria-label="当前对象的关联条件">
        {relations.map((edge) => {
          const outgoing = edge.from === node.key
          const related = nodes.get(outgoing ? edge.to : edge.from)
          const step = steps.get(edge.key)
          const responsibility = step
            ? describeDevBusinessChainResponsibility(step.responsibility)
            : ''
          return (
            <li key={edge.key} data-topic-relation={edge.key}>
              <div className="erp-dev-chain-topics__relation-heading">
                <span>{outgoing ? '交接至' : '来自'}</span>
                <Button type="link" onClick={() => onSelect(related.key)}>
                  {related.label}
                </Button>
              </div>
              <p>{edge.label}</p>
              {edge.condition && edge.condition !== edge.label ? (
                <p className="erp-dev-chain-topics__condition">
                  <span>条件：</span>{edge.condition}
                </p>
              ) : null}
              {responsibility ? (
                <p className="erp-dev-chain-topics__responsibility">
                  {step.responsibility.mode === 'human' ? '相关岗位：' : '处理方式：'}
                  {responsibility}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>
      {onExploreChain ? (
        <Button type="link" onClick={() => onExploreChain(topic.key, node.key)}>
          查看规则
        </Button>
      ) : null}
    </aside>
  )
}

export function BusinessTopicVerification({ topic }) {
  return (
    <details className="erp-dev-disclosure erp-dev-chain-topics__verification">
      <summary>数据与验证（{topic.acceptanceScenarios.length} 类场景）</summary>
      <p>本专题的登记范围；实际执行结果见链路实测报告。</p>
      <table data-table-lines="appearance">
        <thead>
          <tr><th scope="col">场景</th><th scope="col">验证方式</th></tr>
        </thead>
        <tbody>
          {topic.acceptanceScenarios.map((scenario) => (
            <tr key={scenario.key}>
              <th scope="row">{scenario.label}</th>
              <td>{scenario.evidenceModes.map((mode) => evidenceLabels[mode]).join('、')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <nav aria-label="专题数据与验证入口">
        <Link to={DEV_DATA_PREPARATION_ROUTE}>打开测试数据</Link>
        <Link to={DEV_TESTING_ROUTE}>打开测试执行</Link>
        <Link to={`${DEV_BUSINESS_CHAIN_AUDIT_ROUTE}?chain=${encodeURIComponent(topic.key)}`}>
          查看本专题实测报告
        </Link>
      </nav>
    </details>
  )
}
