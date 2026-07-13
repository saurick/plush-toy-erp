import React from 'react'
import { getBusinessModule } from '../config/businessModules.mjs'
import { OperationalFactWorkspace } from './OperationalFactsPage.jsx'

const PAGE_CONFIGS = Object.freeze({
  'production-progress': {
    initialActiveKey: 'production',
    enabledViews: ['production'],
    pageSummary:
      '生产进度当前接入生产发料、成品入库和返工记录；页面只提交正式业务操作，完成协同任务不会自动修改库存或出货记录。',
    viewOverrides: {
      production: {
        title: '生产发料 / 入库记录',
        createLabel: '从生产任务生成记录',
        hideCreateAction: true,
        modalDescription:
          '生产记录需要从明确的生产任务、物料、仓库、批次和单位来源生成；本页不提供无来源的手工登记。',
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
        createLabel: '登记库存预留',
        hideCreateAction: true,
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
        createLabel: '生成应收记录',
        createPrefix: 'receivable',
        hideCreateAction: true,
        modalDescription:
          '应收记录应从真实出货或后续对账来源生成；本页不提供无来源手工登记。',
        selectionBoundaryText:
          '结清只关闭当前应收记录，不代表真实收款、税控或总账已经完成。',
        listParams: { fact_type: 'RECEIVABLE' },
        initialValues: {
          fact_type: 'RECEIVABLE',
          counterparty_type: 'CUSTOMER',
          currency: 'CNY',
          fee_amount: '0',
          collection_type: 'ACCOUNTS_RECEIVABLE',
          payment_term: 'EOM_30',
          payment_term_days: 30,
          invoice_category: 'NONE',
        },
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
        createLabel: '生成应付记录',
        createPrefix: 'payable',
        hideCreateAction: true,
        modalDescription:
          '应付记录应从采购、委外或后续对账来源生成；本页不提供无来源手工登记。',
        selectionBoundaryText:
          '结清只关闭当前应付记录，不代表付款审批、付款流水、核销或总账已经完成。',
        listParams: { fact_type: 'PAYABLE' },
        initialValues: {
          fact_type: 'PAYABLE',
          counterparty_type: 'SUPPLIER',
          currency: 'CNY',
          fee_amount: '0',
          invoice_category: 'NONE',
        },
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
        createLabel: '生成发票记录',
        createPrefix: 'invoice',
        hideCreateAction: true,
        modalDescription:
          '发票记录应从真实出货、应收或后续开票来源生成；本页不提供无来源手工登记。',
        selectionBoundaryText:
          '当前页由系统按财务规则处理；过账、结清和取消不等于税控、查验、纳税或总账动作。',
        listParams: { fact_type: 'INVOICE' },
        initialValues: {
          fact_type: 'INVOICE',
          counterparty_type: 'CUSTOMER',
          currency: 'CNY',
          fee_amount: '0',
          invoice_category: 'EXPORT_GENERAL',
        },
      },
    },
  },
  reconciliation: {
    initialActiveKey: 'finance',
    enabledViews: ['finance'],
    showTabs: false,
    pageSummary:
      '对账管理当前记录业务往来核对结果；结清对账不会自动生成付款、发票、总账、凭证或税务数据。',
    viewOverrides: {
      finance: {
        title: '对账记录',
        createLabel: '生成对账记录',
        createPrefix: 'reconciliation',
        hideCreateAction: true,
        modalDescription:
          '对账记录应从明确的应收、应付、发票或后续对账来源生成；本页不提供无来源手工登记。',
        selectionBoundaryText:
          '结清只关闭当前对账记录，不自动生成付款、发票、总账或凭证。',
        listParams: { fact_type: 'RECONCILIATION' },
        initialValues: {
          fact_type: 'RECONCILIATION',
          counterparty_type: 'OTHER',
          currency: 'CNY',
          fee_amount: '0',
        },
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
