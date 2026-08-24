import React, { useState } from 'react'
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons'
import { Button, Modal, Popover, Tag, Typography } from 'antd'
import {
  BUSINESS_HELP_TYPE_PRESENTATION,
  getBusinessHelpItem,
  getBusinessUsabilityEntry,
} from '../../config/businessUsabilityCatalog.mjs'

const { Text, Title } = Typography

function ExplanationDetails({ item }) {
  if (!item) return null

  const details = [
    item.source ? { label: '数据来源', value: item.source } : null,
    item.updateRule ? { label: '变化时注意', value: item.updateRule } : null,
    item.example ? { label: '举个例子', value: item.example } : null,
    item.effect ? { label: '会影响什么', value: item.effect } : null,
  ].filter(Boolean)

  return (
    <div className="erp-business-help-explanation">
      <div className="erp-business-help-explanation__heading">
        <Tag>{BUSINESS_HELP_TYPE_PRESENTATION[item.type]?.label || '说明'}</Tag>
        <strong>{item.title}</strong>
      </div>
      <p>{item.explanation}</p>
      {details.length > 0 ? (
        <dl>
          {details.map((detail) => (
            <React.Fragment key={detail.label}>
              <dt>{detail.label}</dt>
              <dd>{detail.value}</dd>
            </React.Fragment>
          ))}
        </dl>
      ) : null}
    </div>
  )
}

function PageGuideContent({ entry }) {
  return (
    <div className="erp-business-page-help">
      <section aria-labelledby={`${entry.key}-page-task`}>
        <Text type="secondary">当前页要做什么</Text>
        <Title level={4} id={`${entry.key}-page-task`}>
          {entry.task}
        </Title>
      </section>

      <div className="erp-business-page-help__outcomes">
        <section>
          <Text type="secondary">做到什么算完成</Text>
          <p>{entry.completion}</p>
        </section>
        <section>
          <Text type="secondary">完成后交给谁</Text>
          <p>{entry.handoff}</p>
        </section>
      </div>

      <section
        className="erp-business-page-help__flow"
        aria-labelledby={`${entry.key}-page-flow`}
      >
        <Title level={5} id={`${entry.key}-page-flow`}>
          办理顺序
        </Title>
        <ol>
          {entry.flowSteps.map((step, index) => (
            <li key={step}>
              <span aria-hidden="true">{index + 1}</span>
              <p>{step}</p>
            </li>
          ))}
        </ol>
      </section>

      {entry.items.length > 0 ? (
        <section
          className="erp-business-page-help__explanations"
          aria-labelledby={`${entry.key}-page-explanations`}
        >
          <Title level={5} id={`${entry.key}-page-explanations`}>
            容易弄错的地方
          </Title>
          <div>
            {entry.items.map((item) => (
              <ExplanationDetails item={item} key={item.key} />
            ))}
          </div>
        </section>
      ) : null}

      <details className="erp-business-page-help__boundary">
        <summary>使用限制</summary>
        <p>{entry.boundary}</p>
      </details>
    </div>
  )
}

export function BusinessPageHelpTrigger({ pageKey = '' }) {
  const [open, setOpen] = useState(false)
  const entry = getBusinessUsabilityEntry(pageKey)

  if (!entry?.hasPageHelp) return null

  return (
    <>
      <Button
        type="text"
        size="small"
        className="erp-business-page-help-trigger"
        icon={<QuestionCircleOutlined />}
        aria-label={`查看${entry.title}页面说明`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        这页怎么用
      </Button>
      <Modal
        centered
        destroyOnHidden
        focusTriggerAfterClose
        keyboard
        maskClosable
        className="erp-business-page-help-modal"
        width={760}
        style={{ maxWidth: 'calc(100vw - 24px)' }}
        styles={{
          body: {
            maxHeight: 'min(70vh, 680px)',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
          },
        }}
        open={open}
        title={`${entry.title}怎么用`}
        onCancel={() => setOpen(false)}
        footer={[
          <Button key="role-help" href="/erp/help-center">
            打开岗位使用帮助
            <ArrowRightOutlined />
          </Button>,
          <Button
            key="done"
            type="primary"
            icon={<CheckCircleOutlined />}
            onClick={() => setOpen(false)}
          >
            我知道了
          </Button>,
        ]}
      >
        <PageGuideContent entry={entry} />
      </Modal>
    </>
  )
}

export function BusinessHelpLabel({ label, pageKey = '', itemKey = '' }) {
  const item = getBusinessHelpItem(pageKey, itemKey)
  if (!item) return label

  return (
    <span className="erp-business-help-label">
      <span>{label}</span>
      <Popover
        destroyOnHidden
        trigger={['hover', 'focus', 'click']}
        placement="top"
        classNames={{ root: 'erp-business-inline-help-popover' }}
        content={<ExplanationDetails item={item} />}
      >
        <Button
          type="text"
          size="small"
          className="erp-business-inline-help-trigger"
          icon={<QuestionCircleOutlined />}
          aria-label={`查看${label}说明`}
        />
      </Popover>
    </span>
  )
}
