import React from 'react'
import { Button, Card, Typography } from 'antd'
import { CheckCircleFilled, PrinterOutlined } from '@ant-design/icons'
import { useSearchParams, useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { printTemplateCatalog } from '../config/printTemplates.mjs'
import PrintTemplateGuide from '../components/print/PrintTemplateGuide.jsx'
import '../styles/app/print-template-guide.css'
import {
  PRINT_WORKSPACE_DRAFT_MODE,
  PRINT_WORKSPACE_ENTRY_SOURCE,
  isSupportedPrintWorkspaceTemplate,
  openPrintWorkspaceWindow,
  resolvePrintWorkspaceEntrySource,
  resolvePrintWorkspaceDraftMode,
} from '../utils/printWorkspace.js'

const { Paragraph, Title } = Typography

export default function PrintCenterPage() {
  const { adminProfile } = useOutletContext() || {}
  const draftScope = {
    accountKey: adminProfile?.id,
    customerKey: adminProfile?.effective_session?.customer?.key || '',
    configRevision: adminProfile?.effective_session?.config_revision || '',
  }
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

  const activeTemplate = printTemplateCatalog.find(
    (item) => item.key === activeKey
  )
  const supportsWorkspace = isSupportedPrintWorkspaceTemplate(
    activeTemplate?.key
  )
  const selectTemplate = (template) => {
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.set('template', template.key)
    setSearchParams(nextSearchParams, { replace: true })
  }

  const handleOpenEditablePrint = async () => {
    try {
      if (supportsWorkspace) {
        openPrintWorkspaceWindow(activeTemplate.key, {
          ...draftScope,
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
    <div className="erp-print-center-page erp-template-center">
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
              选择模板，查看说明并打开编辑。
            </Paragraph>
          </div>
          <Button
            type="primary"
            icon={<PrinterOutlined />}
            onClick={handleOpenEditablePrint}
          >
            打开编辑与打印
          </Button>
        </div>
        <div className="erp-print-center-workbench">
          <nav className="erp-print-center-nav-panel" aria-label="打印模板目录">
            <h3 className="erp-template-center__nav-title">模板</h3>
            <div className="erp-print-center-template-list">
              {printTemplateCatalog.map((template) => {
                const isActive = template.key === activeTemplate.key
                return (
                  <button
                    type="button"
                    key={template.key}
                    className={`erp-print-center-template-btn${
                      isActive ? ' erp-print-center-template-btn--active' : ''
                    }`}
                    aria-pressed={isActive}
                    onClick={() => selectTemplate(template)}
                  >
                    <span className="erp-print-center-template-title">
                      {template.title}
                    </span>
                    {isActive ? <CheckCircleFilled aria-hidden="true" /> : null}
                  </button>
                )
              })}
            </div>
          </nav>
          <div className="erp-print-center-preview-panel">
            <PrintTemplateGuide
              key={activeTemplate.key}
              template={activeTemplate}
            />
          </div>
        </div>
        <p className="erp-template-center__note">
          此处为示例；真实内容请从对应业务页面打开。
        </p>
      </Card>
    </div>
  )
}
