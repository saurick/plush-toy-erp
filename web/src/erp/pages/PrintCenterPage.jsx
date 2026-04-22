import React, { useMemo, useState } from 'react'
import { Button, Card, Space, Tag, Typography } from 'antd'
import { ArrowRightOutlined, PrinterOutlined } from '@ant-design/icons'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  printTemplateCatalog,
  printTemplateStats,
} from '../config/printTemplates.mjs'
import {
  isSupportedPrintWorkspaceTemplate,
  openPrintWorkspaceWindow,
} from '../utils/printWorkspace.js'

const { Paragraph, Text, Title } = Typography

const PRINT_CENTER_OVERVIEW_ITEMS = [
  {
    label: '模板数量',
    value: `${printTemplateStats.total} 套固定模板`,
  },
  {
    label: '字段方式',
    value: '左侧编辑 + 右侧合同同步',
  },
  {
    label: '输出链路',
    value: '在线 PDF / 下载 / 打印',
  },
]

export default function PrintCenterPage() {
  const [activeKey, setActiveKey] = useState(printTemplateCatalog[0]?.key || '')

  const activeTemplate = useMemo(
    () =>
      printTemplateCatalog.find((item) => item.key === activeKey) ||
      printTemplateCatalog[0],
    [activeKey]
  )
  const supportsWorkspace = isSupportedPrintWorkspaceTemplate(
    activeTemplate?.key
  )

  const handleOpenEditablePrint = async () => {
    try {
      if (supportsWorkspace) {
        openPrintWorkspaceWindow(activeTemplate.key)
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
        className="erp-page-card erp-print-center-hero-card"
        variant="borderless"
      >
        <div className="erp-print-center-hero">
          <div className="erp-print-center-hero-main">
            <Text className="erp-print-center-eyebrow">模板工作台</Text>
            <Title level={3} className="erp-print-center-hero-title">
              打印模板中心
            </Title>
            <Paragraph className="erp-print-center-hero-description">
              当前只保留采购合同和加工合同两套正式打印模板，统一按 `trade-erp`
              的编辑壳页工作流收口成独立打印窗口，直接走 PDF 预览 / 下载 /
              打印。
            </Paragraph>
            {PRINT_CENTER_OVERVIEW_ITEMS.map((item) => (
              <div className="erp-print-center-overview-card" key={item.label}>
                <Text className="erp-print-center-overview-label">
                  {item.label}
                </Text>
                <Text className="erp-print-center-overview-value">
                  {item.value}
                </Text>
              </div>
            ))}
          </div>
          <div className="erp-print-center-hero-side">
            <Text className="erp-print-center-action-title">当前模板</Text>
            <Title
              level={4}
              className="erp-print-center-hero-side-title"
              style={{ margin: 0 }}
            >
              {activeTemplate.title}
            </Title>
            <Text className="erp-print-center-hero-action-hint">
              主按钮固定在这里，点击后直接打开独立打印窗口，再做 PDF
              预览、下载和打印。
            </Text>
            <Button
              type="primary"
              size="large"
              icon={<PrinterOutlined />}
              className="erp-print-center-hero-primary-action"
              onClick={handleOpenEditablePrint}
            >
              打开可编辑打印窗口
            </Button>
            <Text type="secondary" className="erp-print-center-action-hint">
              当前按默认样例字段进入，后续再接真实业务带值。
            </Text>
          </div>
        </div>
      </Card>

      <Card
        className="erp-page-card erp-print-center-workbench-card"
        variant="borderless"
      >
        <div className="erp-print-center-workbench">
          <div className="erp-print-center-nav-panel">
            <div className="erp-print-center-nav-header">
              <Text className="erp-print-center-nav-title">模板目录</Text>
              <Text className="erp-print-center-nav-description">
                当前目录只保留采购合同和加工合同两套模板，点击左侧模板卡后直接进入对应工作台。
              </Text>
            </div>
            <div
              className="erp-print-center-tabs"
              role="tablist"
              aria-label="打印模板目录"
            >
              {printTemplateCatalog.map((template, index) => {
                const isActive = template.key === activeTemplate.key
                return (
                  <div
                    className={`ant-tabs-tab${isActive ? ' ant-tabs-tab-active' : ''}`}
                    key={template.key}
                    role="presentation"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className="erp-print-center-tab-trigger"
                      onClick={() => setActiveKey(template.key)}
                    >
                      <span className="erp-print-center-tab-label">
                        <span className="erp-print-center-tab-index">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="erp-print-center-tab-copy">
                          <span className="erp-print-center-tab-title">
                            {template.title}
                          </span>
                          <span className="erp-print-center-tab-note">
                            {template.category}
                          </span>
                        </span>
                        <span className="erp-print-center-tab-meta">
                          <span className="erp-print-center-tab-state">
                            已启用
                          </span>
                          <ArrowRightOutlined className="erp-print-center-tab-arrow" />
                        </span>
                      </span>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="erp-print-center-detail-panel">
            <div className="erp-print-center-detail-hero">
              <div className="erp-print-center-detail-copy">
                <Text className="erp-print-center-detail-eyebrow">
                  当前模板
                </Text>
                <div className="erp-print-center-detail-title-row">
                  <Title level={4} className="erp-print-center-detail-title">
                    {activeTemplate.title}
                  </Title>
                </div>
                <Paragraph className="erp-print-center-detail-summary">
                  {activeTemplate.summary}
                </Paragraph>
                <Space wrap size={[8, 8]} className="erp-print-center-tag-row">
                  {activeTemplate.tags.map((tag) => (
                    <Tag key={tag}>{tag}</Tag>
                  ))}
                </Space>
              </div>

              <div className="erp-print-center-sheet-preview">
                <div className="erp-print-center-sheet-card">
                  <Text className="erp-print-center-sheet-eyebrow">
                    页面结构
                  </Text>
                  <Text className="erp-print-center-sheet-title">
                    {activeTemplate.shortTitle}
                  </Text>
                  <div className="erp-print-center-sheet-lines">
                    {activeTemplate.previewLines.map((line) => (
                      <div key={line} className="erp-print-center-sheet-line">
                        {line}
                      </div>
                    ))}
                  </div>
                  <Text className="erp-print-center-sheet-footer">
                    独立工作台 / A4 打印
                  </Text>
                </div>
              </div>
            </div>

            <div className="erp-print-center-info-grid">
              <div className="erp-print-center-info-card">
                <Text className="erp-print-center-info-label">适用场景</Text>
                <Text className="erp-print-center-info-value">
                  {activeTemplate.scene}
                </Text>
              </div>
              <div className="erp-print-center-info-card">
                <Text className="erp-print-center-info-label">版式特点</Text>
                <Text className="erp-print-center-info-value">
                  {activeTemplate.layout}
                </Text>
              </div>
              <div className="erp-print-center-info-card">
                <Text className="erp-print-center-info-label">输出方式</Text>
                <Text className="erp-print-center-info-value">
                  {activeTemplate.output}
                </Text>
              </div>
              <div className="erp-print-center-info-card">
                <Text className="erp-print-center-info-label">模板来源</Text>
                <div className="erp-print-center-record-summary">
                  {activeTemplate.sourceFiles.map((item) => (
                    <div key={item} className="erp-print-center-record-pill">
                      <span className="erp-print-center-record-pill-label">
                        真源
                      </span>
                      <span className="erp-print-center-record-pill-value">
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="erp-print-center-notes-card">
              <Text className="erp-print-center-info-label">使用提醒</Text>
              <div className="erp-print-center-note-list">
                {activeTemplate.notes.map((note) => (
                  <div className="erp-print-center-note-item" key={note}>
                    <span className="erp-print-center-note-dot" />
                    <Text className="erp-print-center-note-text">{note}</Text>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </Space>
  )
}
