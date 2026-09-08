import React from 'react'
import { Button, Card, Typography } from 'antd'
import {
  BgColorsOutlined,
  CheckCircleFilled,
  FileTextOutlined,
  PrinterOutlined,
  ReadOutlined,
  TableOutlined,
  ToolOutlined,
} from '@ant-design/icons'
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

const { Title } = Typography

const PRINT_TEMPLATE_ICONS = {
  'material-purchase-contract': FileTextOutlined,
  'processing-contract': ToolOutlined,
  'engineering-material-detail': TableOutlined,
  'engineering-color-card': BgColorsOutlined,
  'engineering-work-instruction': ReadOutlined,
}

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
  const selectTemplate = (template) => {
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.set('template', template.key)
    setSearchParams(nextSearchParams, { replace: true })
  }

  const handleOpenEditablePrint = (templateKey) => {
    try {
      if (isSupportedPrintWorkspaceTemplate(templateKey)) {
        openPrintWorkspaceWindow(templateKey, {
          ...draftScope,
          entrySource: requestedEntrySource,
          draftMode: requestedDraftMode,
        })
        return
      }
      window.location.assign(`/erp/print-center/${templateKey}`)
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
          </div>
          <Button
            type="primary"
            icon={<PrinterOutlined aria-hidden="true" />}
            onClick={() => handleOpenEditablePrint(activeKey)}
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
                const TemplateIcon =
                  PRINT_TEMPLATE_ICONS[template.key] || FileTextOutlined
                return (
                  <button
                    type="button"
                    key={template.key}
                    className={`erp-print-center-template-btn${
                      isActive ? ' erp-print-center-template-btn--active' : ''
                    }`}
                    aria-pressed={isActive}
                    onClick={() => selectTemplate(template)}
                    onDoubleClick={() => handleOpenEditablePrint(template.key)}
                  >
                    <span className="erp-print-center-template-title">
                      <TemplateIcon
                        className="erp-print-center-template-icon"
                        aria-hidden="true"
                      />
                      <span>{template.title}</span>
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
