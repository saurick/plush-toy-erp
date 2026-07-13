import React from 'react'
import { Button, Card, Space, Typography } from 'antd'
import { PrinterOutlined } from '@ant-design/icons'
import { Link, Navigate, useParams } from 'react-router-dom'
import PrintTemplateRenderer from '../components/print/PrintTemplateRenderer.jsx'
import { printTemplateCatalog } from '../config/printTemplates.mjs'
import {
  isSupportedPrintWorkspaceTemplate,
  openPrintWorkspaceWindow,
} from '../utils/printWorkspace.js'

const { Paragraph, Text, Title } = Typography

export default function PrintTemplatePreviewPage() {
  const { templateKey } = useParams()
  const template = printTemplateCatalog.find((item) => item.key === templateKey)

  if (!template) {
    return <Navigate to="/erp/print-center" replace />
  }

  const supportsWorkspace = isSupportedPrintWorkspaceTemplate(template.key)

  return (
    <Card className="erp-page-card" variant="borderless">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <Text className="erp-print-center-detail-eyebrow">
            {supportsWorkspace ? '模板预览入口' : '模板预览'}
          </Text>
          <Title level={3}>{template.title}</Title>
          <Paragraph>
            {supportsWorkspace
              ? '可在独立窗口编辑、预览、下载或打印当前模板。'
              : '当前页面用于核对模板字段、版式和示例内容。'}
          </Paragraph>
        </div>

        <div className="erp-print-center-note-list">
          {(template.helpNotes || template.notes || []).map((note) => (
            <div key={note} className="erp-print-center-note-item">
              <span className="erp-print-center-note-dot" />
              <Text className="erp-print-center-note-text">{note}</Text>
            </div>
          ))}
        </div>

        {supportsWorkspace ? (
          <>
            <Space wrap>
              <Button
                type="primary"
                icon={<PrinterOutlined />}
                onClick={() => openPrintWorkspaceWindow(template.key)}
              >
                打开可编辑打印窗口
              </Button>
              <Link to="/erp/print-center">返回打印中心</Link>
            </Space>
            <PrintTemplateRenderer template={template} />
          </>
        ) : (
          <>
            <div className="rounded-3xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-50">
              当前模板支持固定预览和浏览器打印；如需业务数据，请从对应业务页面打开模板。
            </div>
            <PrintTemplateRenderer template={template} />
            <Link to="/erp/print-center">返回打印中心</Link>
          </>
        )}
      </Space>
    </Card>
  )
}
