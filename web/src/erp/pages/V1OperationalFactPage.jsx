import React from 'react'
import { getBusinessModule } from '../config/businessModules.mjs'
import { OperationalFactWorkspace } from './OperationalFactsPage.jsx'

const PAGE_CONFIGS = Object.freeze({
  'production-progress': {
    initialActiveKey: 'production',
    enabledViews: ['production'],
    pageSummary:
      '生产进度当前接入生产发料、成品入库和返工事实；页面只提交事实动作，不从 Workflow 任务完成自动写库存或出货。',
    viewOverrides: {
      production: {
        title: '生产发料 / 入库事实',
        createLabel: '登记生产事实',
      },
    },
  },
  outbound: {
    initialActiveKey: 'reservations',
    enabledViews: ['reservations'],
    pageSummary:
      '出库管理当前只处理库存预留释放 / 消耗；出货单新建、确认出货和取消出货统一回到正式出货单页面。',
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
      '应收管理当前只接入 finance_facts 的 RECEIVABLE 事实；应收至少应来自真实出货后评审，不由销售订单或出货放行自动生成，也不代表收款核销、税控或总账已交付。',
    viewOverrides: {
      finance: {
        title: '应收事实',
        createLabel: '生成应收事实',
        createPrefix: 'receivable',
        hideCreateAction: true,
        modalDescription:
          'RECEIVABLE 业务事实应从真实出货或后续对账来源生成；不在本页提供无来源手工登记。',
        selectionBoundaryText:
          '当前页只调用 finance_facts 后端 usecase；结清只关闭应收业务事实，不代表真实收款、税控或总账完成。',
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
      '应付管理当前只接入 finance_facts 的 PAYABLE 事实；应付来源必须回到采购、委外或对账事实，不把待付款提醒当成付款、核销或总账事实。',
    viewOverrides: {
      finance: {
        title: '应付事实',
        createLabel: '生成应付事实',
        createPrefix: 'payable',
        hideCreateAction: true,
        modalDescription:
          'PAYABLE 业务事实应从采购、委外或后续对账来源生成；不在本页提供无来源手工登记。',
        selectionBoundaryText:
          '当前页只调用 finance_facts 后端 usecase；结清只关闭应付业务事实，不代表付款审批、付款流水、核销或总账完成。',
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
      '发票管理当前只接入 finance_facts 的 INVOICE 事实；这里只记录业务开票状态，不替代税控、发票查验、纳税申报、附件归档或总账凭证。',
    viewOverrides: {
      finance: {
        title: '发票事实',
        createLabel: '生成发票事实',
        createPrefix: 'invoice',
        hideCreateAction: true,
        modalDescription:
          'INVOICE 业务事实应从真实出货、应收或后续开票来源生成；不在本页提供无来源手工登记。',
        selectionBoundaryText:
          '当前页只调用 finance_facts 后端 usecase；过账、结清和取消不等于税控、查验、纳税或总账动作。',
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
      '对账管理当前只接入 finance_facts 的 RECONCILIATION 事实；对账可结清业务事实，但不自动写付款、发票、总账、凭证或税务数据。',
    viewOverrides: {
      finance: {
        title: '对账事实',
        createLabel: '生成对账事实',
        createPrefix: 'reconciliation',
        hideCreateAction: true,
        modalDescription:
          'RECONCILIATION 业务事实应从明确的应收、应付、发票或后续对账来源生成；不在本页提供无来源手工登记。',
        selectionBoundaryText:
          '当前页只调用 finance_facts 后端 usecase；结清只关闭对账业务事实，不自动写付款、发票、总账或凭证。',
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
