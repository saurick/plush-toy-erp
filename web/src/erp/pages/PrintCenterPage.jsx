import React, { useEffect, useMemo, useState } from 'react'
import { Button, Card, Space, Tag, Typography } from 'antd'
import { FileSearchOutlined, PrinterOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
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

const PRINT_CENTER_CANDIDATE_TEMPLATES = Object.freeze([
  {
    key: 'sample-confirmation-candidate',
    title: '样品确认单',
    category: '候选模板',
    stateText: '候选模板 / 未启用',
    summary: '缺少正式模板样本和字段真源，本轮只保留导航占位。',
    enabled: false,
  },
])

function buildTemplateNavItems() {
  return [
    ...printTemplateCatalog.map((template) => ({
      ...template,
      stateText: '正式模板 / 已启用',
      enabled: true,
    })),
    ...PRINT_CENTER_CANDIDATE_TEMPLATES,
  ]
}

function buildPrintMappingRows(template = {}) {
  const sample = template.sample || {}
  return [
    {
      label: '合同编号 / 单号',
      state: sample.contractNo ? '默认样例' : '字段已定义',
      color: 'success',
    },
    {
      label: '供应商 / 客户',
      state:
        sample.supplierName || sample.buyerCompany ? '样例字段' : '按业务带值',
      color: 'success',
    },
    {
      label: '产品 / 明细行',
      state: '来自明细行',
      color: 'processing',
    },
    {
      label: '条款 / 签章栏',
      state: '手工确认',
      color: 'default',
    },
  ]
}

export default function PrintCenterPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
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
  const templateNavItems = useMemo(() => buildTemplateNavItems(), [])
  const supportsWorkspace = isSupportedPrintWorkspaceTemplate(
    activeTemplate?.key
  )
  const activePreviewLines = activeTemplate?.previewLines || []
  const activeSample = activeTemplate?.sample || {}
  const activeMappingRows = useMemo(
    () => buildPrintMappingRows(activeTemplate),
    [activeTemplate]
  )
  const previewSummary = [
    activeSample.contractNo
      ? `合同编号：${activeSample.contractNo}`
      : `模板：${activeTemplate?.title || '-'}`,
    activeSample.signDateText
      ? `签约日期：${activeSample.signDateText}`
      : `场景：${activeTemplate?.scene || '-'}`,
    activeSample.supplierName
      ? `供应商：${activeSample.supplierName}`
      : `模板场景：${activeTemplate?.scene || '-'}`,
    activeSample.buyerCompany
      ? `客户/委托方：${activeSample.buyerCompany}`
      : `输出：${activeTemplate?.output || '-'}`,
    activeTemplate?.layout || activeTemplate?.output || '固定打印模板',
  ]

  const selectTemplate = (template) => {
    if (!template?.enabled) {
      return
    }
    setActiveKey(template.key)
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.set('template', template.key)
    setSearchParams(nextSearchParams, { replace: true })
  }

  const openTemplateCheck = () => {
    if (activeTemplate?.key) {
      navigate(`/erp/print-center/${activeTemplate.key}`)
    }
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
              轻量工作台：模板选择、字段映射、纸面预览和打印窗口入口。
            </Paragraph>
          </div>
          <Space wrap>
            <Button icon={<FileSearchOutlined />} onClick={openTemplateCheck}>
              字段核对
            </Button>
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
          打印预览固定浅色；业务带值从对应业务页选中记录后进入，打印中心只展示默认样例。
        </Text>
        <div className="erp-print-center-workbench">
          <div className="erp-print-center-nav-panel">
            <div className="erp-print-center-nav-header">
              <Text className="erp-print-center-nav-title">模板</Text>
              <Text className="erp-print-center-nav-description">
                正式模板可切换；候选模板暂不开放打印。
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
                    <span className="erp-print-center-template-meta">
                      {template.stateText}
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
                默认样例预览，实际输出以独立打印窗口中的纸面 DOM 为准。
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
                  数量 / 金额：{activeSample.lines[0].quantity} / 默认样例
                </div>
              ) : null}
              <div className="erp-print-center-paper-line">
                备注：字段来自当前模板样例或业务页选中记录，仅用于打印预览。
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
          <div className="erp-print-center-mapping-panel">
            <div className="erp-print-center-nav-header">
              <Text className="erp-print-center-nav-title">字段映射</Text>
              <Text className="erp-print-center-nav-description">
                这里只展示现有模板的关键字段状态。
              </Text>
            </div>
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              {activeMappingRows.map((item) => (
                <div className="erp-print-center-map-row" key={item.label}>
                  <Text>{item.label}</Text>
                  <Tag color={item.color}>{item.state}</Tag>
                </div>
              ))}
              <Text className="erp-print-center-mapping-note">
                字段真源仍以打印模板配置、业务页带值和独立打印窗口为准；本页不编辑模板、不反写业务记录。
              </Text>
            </Space>
          </div>
        </div>
      </Card>
    </Space>
  )
}
