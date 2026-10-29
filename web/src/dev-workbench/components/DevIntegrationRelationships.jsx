import React, { useEffect, useRef } from 'react'
import { ArrowRightOutlined } from '@ant-design/icons'
import { Descriptions, Tag } from 'antd'
import { useNavigate } from 'react-router-dom'
import { Markdown } from '@/common/components/markdown'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'
import { buildDevDocsLocation, resolveDevDocsMarkdownHref } from '../pages/devDocsNavigation.mjs'

export function DevIntegrationAccess({ boundary, method = false, guide }) {
  const boundaryRef = useRef(null)
  const navigate = useNavigate()
  useEffect(() => {
    const container = boundaryRef.current
    if (!container) return undefined
    const followLink = (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = event.target?.closest?.('a[href]')
      if (!anchor || !container.contains(anchor)) return
      const target = resolveDevDocsMarkdownHref(anchor.getAttribute('href'), 'server/docs/api.md')
      if (!target) return
      event.preventDefault()
      navigate(buildDevDocsLocation(target))
    }
    container.addEventListener('click', followLink)
    return () => container.removeEventListener('click', followLink)
  }, [boundary, navigate])
  return (
    <section className="erp-dev-integration__access" aria-label="接入关系">
      <div className="erp-dev-integration__section-heading">
        <h2>{method ? '接入关系' : '实际接入关系'}</h2>
        <Tag>当前接口合同</Tag>
      </div>
      {method ? (
        <Descriptions
          size="small"
          column={1}
          items={[
            { key: 'role', label: '接口职责', children: '内部 JSON-RPC 业务接口' },
            { key: 'mode', label: '接入方式', children: '按正式合同鉴权' },
            { key: 'external', label: '外部开放', children: '尚未开放' },
            {
              key: 'adapter',
              label: '关联适配器',
              children: '当前正式合同未关联实际适配器',
            },
          ]}
        />
      ) : (
        <div className="erp-dev-integration__current-relation">
          <div>
            <h3>外部业务接入尚未开放</h3>
            <p className="erp-dev-integration__note">当前正式合同未关联实际第三方业务接入与适配器。</p>
          </div>
        </div>
      )}
      {boundary ? <div className="erp-dev-integration__note" ref={boundaryRef}><Markdown source={boundary} /></div> : (
        <p role="status">接入边界说明缺失，请核对正式接口文档。</p>
      )}
      {method && guide ? (
        <details className="erp-dev-disclosure erp-dev-integration__guide-notes">
          <summary>接入方式与规则</summary>
          {guide.choiceTableSource ? <Markdown source={guide.choiceTableSource} /> : null}
        </details>
      ) : null}
    </section>
  )
}

export default function DevIntegrationRelationshipExamples({ examples, value, onChange }) {
  const selected = examples?.rows.find((row) => row.label === value) ||
    examples?.rows[0]
  return (
    <details
      className="erp-dev-disclosure erp-dev-integration__table erp-dev-integration__relationships"
      aria-label="接入关系展示示例"
      open
    >
      <summary>
        <span>接入关系展示示例</span>
        <Tag color="warning">设计示例 · 未实施</Tag>
      </summary>
      {selected ? (
        <div className="erp-dev-integration__relationship-content">
          <SlidingSegmented
            aria-label="接入关系示例"
            hierarchy="secondary"
            value={selected.label}
            options={examples.rows.map((row) => row.label)}
            onChange={onChange}
          />
          <div
            className="erp-dev-integration__flow"
            role="img"
            aria-label={`${selected.label}，未实施示例：${selected.steps.map((step) => step.title).join(' → ')}`}
          >
            {selected.steps.map((step, index) => (
              <React.Fragment key={step.title}>
                {index > 0 ? <ArrowRightOutlined aria-hidden="true" /> : null}
                <span className="erp-dev-integration__flow-step">
                  <strong>{step.title}</strong>
                  {step.description ? <span>{step.description}</span> : null}
                </span>
              </React.Fragment>
            ))}
          </div>
          <p className="erp-dev-integration__note" aria-live="polite">{selected.note}</p>
        </div>
      ) : (
        <p role="status">尚未登记接入关系展示说明。</p>
      )}
    </details>
  )
}
