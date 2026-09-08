import React from 'react'
import { getBusinessModule } from '../config/businessModules.mjs'
import { OperationalFactWorkspace } from './OperationalFactsPage.jsx'

const PAGE_CONFIGS = Object.freeze({
  'production-progress': {
    initialActiveKey: 'production',
    enabledViews: ['production'],
    viewOverrides: {
      production: {
        title: '生产记录 / 成品入库',
      },
    },
  },
  outbound: {
    initialActiveKey: 'reservations',
    enabledViews: ['reservations'],
    viewOverrides: {
      reservations: {
        title: '库存预留',
      },
    },
  },
  receivables: {
    initialActiveKey: 'finance',
    enabledViews: ['finance'],
    showTabs: false,
    viewOverrides: {
      finance: {
        title: '应收记录',
        selectionBoundaryText:
          '本页不直接结清应收；结清状态只会根据正式收款核销、红冲或冲正结果更新，且不代表税控或总账已经完成。',
        listParams: { fact_type: 'RECEIVABLE' },
      },
    },
  },
  payables: {
    initialActiveKey: 'finance',
    enabledViews: ['finance'],
    showTabs: false,
    viewOverrides: {
      finance: {
        title: '应付记录',
        selectionBoundaryText:
          '本页不直接结清应付；结清状态只会根据正式付款核销、红冲或冲正结果更新，且不代表总账已经完成。',
        listParams: { fact_type: 'PAYABLE' },
      },
    },
  },
  invoices: {
    initialActiveKey: 'finance',
    enabledViews: ['finance'],
    showTabs: false,
    viewOverrides: {
      finance: {
        title: '发票记录',
        selectionBoundaryText:
          '取消当前业务发票记录不等于税控红冲、作废、查验、纳税或总账处理。',
        listParams: { fact_type: 'INVOICE' },
      },
    },
  },
  reconciliation: {
    initialActiveKey: 'finance',
    enabledViews: ['finance'],
    showTabs: false,
    viewOverrides: {
      finance: {
        title: '对账记录',
        selectionBoundaryText:
          '完成核对只关闭当前对账记录，不自动生成付款、发票、总账或凭证。',
        listParams: { fact_type: 'RECONCILIATION' },
      },
    },
  },
})

export default function V1OperationalFactPage({ moduleKey }) {
  const moduleItem = getBusinessModule(moduleKey)
  const config = PAGE_CONFIGS[moduleKey] || PAGE_CONFIGS['production-progress']

  return (
    <OperationalFactWorkspace
      pageTitle={moduleItem?.title || config.viewOverrides?.finance?.title}
      toolbarModuleKey={moduleKey}
      initialActiveKey={config.initialActiveKey}
      enabledViews={config.enabledViews}
      viewOverrides={config.viewOverrides}
      showTabs={config.showTabs}
    />
  )
}
