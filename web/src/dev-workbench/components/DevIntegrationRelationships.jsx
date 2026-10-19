import React from 'react'
import { ArrowRightOutlined } from '@ant-design/icons'
import { Button, Descriptions, Tag } from 'antd'
import { Link } from 'react-router-dom'
import { Markdown } from '@/common/components/markdown'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'

export function DevIntegrationAccess({ boundary, onGuide, onInventory }) {
  return (
    <section className="erp-dev-integration__access" aria-label="接入关系">
      <div className="erp-dev-integration__section-heading">
        <h2>{onGuide ? '接入关系' : '实际接入关系'}</h2>
        <Tag>当前内部接口</Tag>
      </div>
      {onGuide ? (
        <Descriptions
          size="small"
          column={1}
          items={[
            { key: 'role', label: '接口职责', children: '内部 JSON-RPC 业务接口' },
            { key: 'mode', label: '接入方式', children: '内部直接调用' },
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
          <Button onClick={onInventory}>查看内部接口</Button>
        </div>
      )}
      {boundary ? <div className="erp-dev-integration__note"><Markdown source={boundary} /></div> : (
        <p role="status">接入边界说明缺失，请核对正式接口文档。</p>
      )}
      {onGuide ? (
        <Button type="link" onClick={onGuide}>查看接入指引</Button>
      ) : null}
    </section>
  )
}

export default function DevIntegrationRelationshipExamples({ examples, value, onChange }) {
  const selected = examples?.rows.find((row) => row.label === value) ||
    examples?.rows[0]
  return (
    <details
      className="erp-dev-integration__table erp-dev-integration__relationships"
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
          <Link to={examples.location}>查看接入关系正式说明</Link>
        </div>
      ) : (
        <p role="status">尚未登记接入关系展示说明。</p>
      )}
    </details>
  )
}
