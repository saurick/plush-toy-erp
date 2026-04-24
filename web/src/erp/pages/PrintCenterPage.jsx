import React, { useEffect, useMemo, useState } from 'react'
import { Button, Card, Space, Typography } from 'antd'
import { ArrowRightOutlined, PrinterOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  printTemplateCatalog,
  printTemplateStats,
} from '../config/printTemplates.mjs'
import {
  PRINT_WORKSPACE_DRAFT_MODE,
  PRINT_WORKSPACE_ENTRY_SOURCE,
  isSupportedPrintWorkspaceTemplate,
  openPrintWorkspaceWindow,
  resolvePrintWorkspaceEntrySource,
  resolvePrintWorkspaceDraftMode,
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
  const [searchParams] = useSearchParams()
  const requestedTemplateKey = String(searchParams.get('template') || '').trim()
  const requestedEntrySource = resolvePrintWorkspaceEntrySource(searchParams)
  const requestedDraftMode =
    requestedEntrySource === PRINT_WORKSPACE_ENTRY_SOURCE.MENU
      ? PRINT_WORKSPACE_DRAFT_MODE.FRESH
      : resolvePrintWorkspaceDraftMode(searchParams)
  const [activeKey, setActiveKey] = useState(() => {
    if (isSupportedPrintWorkspaceTemplate(requestedTemplateKey)) {
      return requestedTemplateKey
    }
    return printTemplateCatalog[0]?.key || ''
  })

  useEffect(() => {
    if (
      requestedTemplateKey &&
      isSupportedPrintWorkspaceTemplate(requestedTemplateKey)
    ) {
      setActiveKey(requestedTemplateKey)
      return
    }

    if (!activeKey && printTemplateCatalog[0]?.key) {
      setActiveKey(printTemplateCatalog[0].key)
    }
  }, [activeKey, requestedTemplateKey])

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
              当前只保留采购合同和加工合同两套正式打印模板；业务页可从已选记录带值打开，打印中心保留默认样例和模板核对入口。
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
              这里按默认样例打开独立打印窗口；需要带业务记录字段时，请从对应业务页选中记录后打印。
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
              采购合同入口在“辅材/包材采购”，加工合同入口在“加工合同/委外下单”。
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
                当前目录只保留采购合同和加工合同两套模板，点击左侧模板卡可切换默认样例；业务带值入口在对应业务页。
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
        </div>
      </Card>
    </Space>
  )
}
