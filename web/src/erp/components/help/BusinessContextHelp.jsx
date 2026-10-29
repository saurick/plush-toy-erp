import React, { useRef, useState } from 'react'
import { QuestionCircleOutlined } from '@ant-design/icons'
import { Button, Popover, Tag, Typography } from 'antd'
import Link from '../business-list/BusinessLink.jsx'
import { getHelpCenterHref } from '../../config/helpManualCatalog.mjs'
import { getBusinessPageHelpScenario } from '../../config/helpScenarios.mjs'
import HelpScenarioContent from './HelpScenarioContent.jsx'
import BusinessModal from '@/erp/components/business-list/BusinessModal.jsx'
import {
  BUSINESS_HELP_TYPE_PRESENTATION,
  getBusinessHelpItem,
  getBusinessUsabilityEntry,
} from '../../config/businessUsabilityCatalog.mjs'

const { Text, Title } = Typography

function ExplanationDetails({ item, pageKey, showHeading = true }) {
  if (!item) return null

  const details = [
    item.source ? { label: '数据来源', value: item.source } : null,
    item.updateRule ? { label: '变化时注意', value: item.updateRule } : null,
    item.example ? { label: '举个例子', value: item.example } : null,
    item.effect ? { label: '会影响什么', value: item.effect } : null,
  ].filter(Boolean)

  return (
    <div className="erp-business-help-explanation">
      {showHeading ? (
        <div className="erp-business-help-explanation__heading">
          <Tag>
            {BUSINESS_HELP_TYPE_PRESENTATION[item.type]?.label || '说明'}
          </Tag>
          <strong>{item.title}</strong>
        </div>
      ) : null}
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
      {pageKey ? (
        <Link to={getHelpCenterHref({ pageKey, itemKey: item.key })}>
          打开帮助中心
        </Link>
      ) : null}
    </div>
  )
}

function PageGuideContent({ entry }) {
  const scenario = getBusinessPageHelpScenario(entry.key)
  return (
    <div className="erp-business-page-help">
      <p>{entry.task}</p>

      {scenario ? <HelpScenarioContent scenario={scenario} compact /> : (
        <>
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
        </>
      )}

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
              <details className="erp-business-page-help__item" key={item.key}>
                <summary>{item.title}</summary>
                <ExplanationDetails
                  item={item}
                  showHeading={false}
                />
              </details>
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
  const trigger = useRef(null)
  const entry = getBusinessUsabilityEntry(pageKey)

  if (!entry?.hasPageHelp) return null

  return (
    <>
      <Button
        ref={trigger}
        type="text"
        size="small"
        className="erp-business-page-help-trigger"
        icon={<QuestionCircleOutlined />}
        aria-label={`查看${entry.title}页面说明`}
        aria-haspopup="dialog"
        title="这页怎么用"
        onClick={() => setOpen(true)}
      />
      <BusinessModal
        centered
        destroyOnHidden
        focusTriggerAfterClose
        keyboard
        maskClosable
        className="erp-business-page-help-modal"
        size={getBusinessPageHelpScenario(pageKey) ? 'recordDetails' : 'localAction'}
        open={open}
        title={`${entry.title}怎么用`}
        onCancel={() => setOpen(false)}
        afterClose={() => trigger.current?.focus({ preventScroll: true })}
        footer={[
          <Button key="done" type="primary" onClick={() => setOpen(false)}>
            我知道了
          </Button>,
        ]}
      >
        <PageGuideContent entry={entry} />
      </BusinessModal>
    </>
  )
}

export function BusinessHelpLabel({ label, pageKey = '', itemKey = '', description = '', iconOnly = false }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const contentRef = useRef(null)
  const item = getBusinessHelpItem(pageKey, itemKey)
  if (!item && !description) return iconOnly ? null : label

  return (
    <span className="erp-business-help-label">
      {iconOnly ? null : <span>{label}</span>}
      <Popover
        destroyOnHidden
        trigger={description ? 'click' : ['hover', 'click']}
        open={open}
        onOpenChange={(nextOpen) => {
          if (
            nextOpen ||
            !contentRef.current?.contains(document.activeElement)
          ) {
            setOpen(nextOpen)
          }
        }}
        placement="top"
        classNames={{ root: 'erp-business-inline-help-popover' }}
        content={
          <div
            ref={contentRef}
            onBlur={(event) => {
              if (
                !event.currentTarget.contains(event.relatedTarget) &&
                event.relatedTarget !== triggerRef.current
              ) {
                setOpen(false)
              }
            }}
            onKeyDown={(event) => {
              if (
                event.key === 'Escape' ||
                (event.key === 'Tab' && event.shiftKey)
              ) {
                event.preventDefault()
                event.stopPropagation()
                triggerRef.current?.focus()
                if (event.key === 'Escape') setOpen(false)
              }
            }}
          >
            {description ? <p>{description}</p> : <ExplanationDetails item={item} pageKey={pageKey} />}
          </div>
        }
      >
        <Button
          ref={triggerRef}
          type="text"
          size="small"
          className="erp-business-inline-help-trigger"
          disabled={false}
          icon={<QuestionCircleOutlined />}
          aria-label={`查看${label}说明`}
          aria-expanded={open}
          onFocus={(event) => {
            // 键盘聚焦打开说明；触控留给点击，避免同一手势先打开再关闭。
            if (event.currentTarget.matches(':focus-visible')) setOpen(true)
          }}
          onBlur={(event) => {
            if (!contentRef.current?.contains(event.relatedTarget)) {
              setOpen(false)
            }
          }}
          onClick={(event) => event.stopPropagation()}
          onKeyDownCapture={(event) => {
            if (open && event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              setOpen(false)
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.stopPropagation()
            } else if (event.key === 'Tab' && !event.shiftKey && open) {
              const link = contentRef.current?.querySelector('a')
              if (link) {
                event.preventDefault()
                link.focus()
              }
            } else if (event.key === 'Escape') {
              event.stopPropagation()
              setOpen(false)
            }
          }}
        />
      </Popover>
    </span>
  )
}
