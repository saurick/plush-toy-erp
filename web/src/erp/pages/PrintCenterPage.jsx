import React, { useMemo } from 'react'
import { Button, Card, Space, Typography } from 'antd'
import { ArrowRightOutlined, PrinterOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { printTemplateCatalog } from '../config/printTemplates.mjs'
import {
  PRINT_WORKSPACE_DRAFT_MODE,
  PRINT_WORKSPACE_ENTRY_SOURCE,
  isSupportedPrintWorkspaceTemplate,
  openPrintWorkspaceWindow,
  resolvePrintWorkspaceEntrySource,
  resolvePrintWorkspaceDraftMode,
} from '../utils/printWorkspace.js'

const { Paragraph, Text, Title } = Typography

function buildTemplateNavItems() {
  return printTemplateCatalog.map((template) => ({
    ...template,
    stateText: '可使用',
    enabled: true,
  }))
}

export default function PrintCenterPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTemplateKey = String(searchParams.get('template') || '').trim()
  const requestedEntrySource = resolvePrintWorkspaceEntrySource(searchParams)
  const requestedDraftMode =
    requestedEntrySource === PRINT_WORKSPACE_ENTRY_SOURCE.MENU
      ? PRINT_WORKSPACE_DRAFT_MODE.FRESH
      : resolvePrintWorkspaceDraftMode(searchParams)
  const activeKey = isSupportedPrintWorkspaceTemplate(requestedTemplateKey)
    ? requestedTemplateKey
    : printTemplateCatalog[0]?.key || ''

  const activeTemplate = useMemo(
    () =>
      printTemplateCatalog.find((item) => item.key === activeKey) ||
      printTemplateCatalog[0],
    [activeKey]
  )
  const templateNavItems = useMemo(() => buildTemplateNavItems(), [])
  const supportsWorkspace = isSupportedPrintWorkspaceTemplate(
    activeTemplate?.key
  )
  const activePreviewLines = activeTemplate?.previewLines || []
  const activeSample = activeTemplate?.sample || {}
  const previewSummary = [
    activeSample.contractNo
      ? `合同编号：${activeSample.contractNo}`
      : `模板：${activeTemplate?.title || '-'}`,
    activeSample.signDateText || activeSample.buyerSignDateText
      ? `签约日期：${activeSample.signDateText || activeSample.buyerSignDateText}`
      : `场景：${activeTemplate?.scene || '-'}`,
    activeSample.supplierName
      ? `供应商：${activeSample.supplierName}`
      : `模板场景：${activeTemplate?.scene || '-'}`,
    activeSample.buyerCompany
      ? `${activeTemplate?.key === 'processing-contract' ? '委托方' : '订货方'}：${activeSample.buyerCompany}`
      : `输出：${activeTemplate?.output || '-'}`,
    activeTemplate?.layout || activeTemplate?.output || '固定打印模板',
  ]

  const selectTemplate = (template) => {
    if (!template?.enabled) {
      return
    }
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.set('template', template.key)
    setSearchParams(nextSearchParams, { replace: true })
  }

  const handleOpenEditablePrint = async () => {
    try {
      if (supportsWorkspace) {
        openPrintWorkspaceWindow(activeTemplate.key, {
          entrySource: requestedEntrySource,
          draftMode: requestedDraftMode,
        })
        return
      }
      window.location.assign(`/erp/print-center/${activeTemplate.key}`)
    } catch (error) {
      message.error(getActionErrorMessage(error, '打开模板'))
    }
  }

  return (
    <Space
      direction="vertical"
      size={16}
      style={{ width: '100%' }}
      className="erp-print-center-page"
    >
      <Card
        className="erp-page-card erp-print-center-workbench-card"
        variant="borderless"
      >
        <div className="erp-print-center-section-head">
          <div>
            <Title level={4} className="erp-print-center-section-title">
              模板打印中心
            </Title>
            <Paragraph className="erp-print-center-nav-description">
              选择模板、预览内容并打开打印窗口。
            </Paragraph>
          </div>
          <Space wrap>
            <Button
              type="primary"
              icon={<PrinterOutlined />}
              onClick={handleOpenEditablePrint}
            >
              打印当前模板
            </Button>
          </Space>
        </div>
        <Text className="erp-print-center-workbench-note">
          如需打印真实业务内容，请从对应订单或业务页面进入；从打印中心打开时显示示例内容。
        </Text>
        <div className="erp-print-center-workbench">
          <div className="erp-print-center-nav-panel">
            <div className="erp-print-center-nav-header">
              <Text className="erp-print-center-nav-title">模板</Text>
              <Text className="erp-print-center-nav-description">
                选择需要使用的模板。
              </Text>
            </div>
            <div
              className="erp-print-center-template-list"
              role="listbox"
              aria-label="打印模板目录"
            >
              {templateNavItems.map((template) => {
                const isActive = template.key === activeTemplate.key
                return (
                  <button
                    type="button"
                    key={template.key}
                    className={`erp-print-center-template-btn${
                      isActive ? ' erp-print-center-template-btn--active' : ''
                    }`}
                    aria-pressed={isActive}
                    aria-disabled={!template.enabled}
                    disabled={!template.enabled}
                    onClick={() => selectTemplate(template)}
                  >
                    <span className="erp-print-center-template-title">
                      {template.title}
                    </span>
                    <span className="erp-print-center-template-row">
                      <span className="erp-print-center-template-meta">
                        {template.stateText}
                      </span>
                      <span className="erp-print-center-template-action">
                        {isActive ? '当前模板' : '选择'}
                        <ArrowRightOutlined aria-hidden="true" />
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="erp-print-center-preview-panel">
            <div className="erp-print-center-nav-header">
              <Text className="erp-print-center-nav-title">纸面预览</Text>
              <Text className="erp-print-center-nav-description">
                打印前请在打开的窗口中核对最终内容。
              </Text>
            </div>
            <div className="erp-print-center-paper-preview">
              <Text className="erp-print-center-paper-title">
                {activeTemplate.title}
              </Text>
              <div className="erp-print-center-paper-grid">
                {previewSummary.map((line) => (
                  <div className="erp-print-center-paper-line" key={line}>
                    {line}
                  </div>
                ))}
              </div>
              {activeSample.lines?.[0]?.productName ? (
                <div className="erp-print-center-paper-line">
                  产品名称：{activeSample.lines[0].productName}
                </div>
              ) : null}
              {activeSample.lines?.[0]?.quantity ? (
                <div className="erp-print-center-paper-line">
                  数量：{activeSample.lines[0].quantity}（示例）
                </div>
              ) : null}
              <div className="erp-print-center-paper-line">
                当前显示示例内容；从业务页面进入时会带入所选记录。
              </div>
              <div className="erp-print-center-paper-section">
                {activePreviewLines.length > 0
                  ? activePreviewLines.map((line) => (
                    <span key={line}>{line}</span>
                    ))
                  : activeTemplate.tags?.map((line) => (
                    <span key={line}>{line}</span>
                    ))}
              </div>
              <div className="erp-print-center-paper-stamp">模板预览</div>
            </div>
          </div>
        </div>
      </Card>
    </Space>
  )
}
