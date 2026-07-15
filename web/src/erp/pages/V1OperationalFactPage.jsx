import React from 'react'
import { getBusinessModule } from '../config/businessModules.mjs'
import { OperationalFactWorkspace } from './OperationalFactsPage.jsx'

const PAGE_CONFIGS = Object.freeze({
  'production-progress': {
    initialActiveKey: 'production',
    enabledViews: ['production'],
    pageSummary:
      '生产进度当前可查看和处理生产发料、成品入库和返工记录；任务标记为完成不会自动修改库存或出货记录。',
    viewOverrides: {
      production: {
        title: '生产发料 / 入库记录',
      },
    },
  },
  outbound: {
    initialActiveKey: 'reservations',
    enabledViews: ['reservations'],
    pageSummary:
      '出库管理当前只处理库存预留释放；库存预留仅在确认出货时随出库处理一并消耗，出货单新建、确认出货和取消出货统一回到正式出货单页面。',
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
    pageSummary:
      '应收管理当前记录业务应收；应收至少应来自真实出货后的核对，不由销售订单或出货放行自动生成，也不代表收款核销、税控或总账已完成。',
    viewOverrides: {
      finance: {
        title: '应收记录',
        selectionBoundaryText:
          '结清只关闭当前应收记录，不代表真实收款、税控或总账已经完成。',
        listParams: { fact_type: 'RECEIVABLE' },
      },
    },
  },
  payables: {
    initialActiveKey: 'finance',
    enabledViews: ['finance'],
    showTabs: false,
    pageSummary:
      '应付管理当前记录业务应付；来源必须回到采购、委外或对账记录，待付款提醒不代表已经付款、核销或记账。',
    viewOverrides: {
      finance: {
        title: '应付记录',
        selectionBoundaryText:
          '结清只关闭当前应付记录，不代表付款审批、付款记录、核销或总账已经完成。',
        listParams: { fact_type: 'PAYABLE' },
      },
    },
  },
  invoices: {
    initialActiveKey: 'finance',
    enabledViews: ['finance'],
    showTabs: false,
    pageSummary:
      '发票管理当前只记录业务开票状态，不替代税控、发票查验、纳税申报、附件归档或总账凭证。',
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
    pageSummary:
      '对账管理当前记录业务往来核对结果；完成核对不会自动生成付款、发票、总账、凭证或税务数据。',
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
      pageSummary={config.pageSummary || moduleItem?.description}
      toolbarModuleKey={moduleKey}
      initialActiveKey={config.initialActiveKey}
      enabledViews={config.enabledViews}
      viewOverrides={config.viewOverrides}
      showTabs={config.showTabs}
    />
  )
}
