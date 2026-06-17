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
        createLabel: '新建生产事实',
      },
    },
  },
  outbound: {
    initialActiveKey: 'shipments',
    enabledViews: ['shipments', 'reservations'],
    pageSummary:
      '出库管理当前承接出货单确认和库存预留处理；只有出货单发货才写库存 OUT，取消已出货写 REVERSAL，预留释放 / 消耗不等于库存流水。',
    viewOverrides: {
      shipments: {
        title: '出货出库',
        createLabel: '新建出货单',
      },
      reservations: {
        title: '库存预留',
        createLabel: '新建库存预留',
      },
    },
  },
  receivables: {
    initialActiveKey: 'finance',
    enabledViews: ['finance'],
    showTabs: false,
    pageSummary:
      '应收管理当前接入 finance_facts 的 RECEIVABLE 事实；应收至少应来自真实出货后评审，不由销售订单或出货放行自动生成。',
    viewOverrides: {
      finance: {
        title: '应收事实',
        createLabel: '新建应收',
        createPrefix: 'receivable',
        listParams: { fact_type: 'RECEIVABLE' },
        initialValues: {
          fact_type: 'RECEIVABLE',
          counterparty_type: 'CUSTOMER',
          currency: 'CNY',
        },
      },
    },
  },
  payables: {
    initialActiveKey: 'finance',
    enabledViews: ['finance'],
    showTabs: false,
    pageSummary:
      '应付管理当前接入 finance_facts 的 PAYABLE 事实；应付来源必须回到采购、委外或对账事实，不把待付款提醒当成付款事实。',
    viewOverrides: {
      finance: {
        title: '应付事实',
        createLabel: '新建应付',
        createPrefix: 'payable',
        listParams: { fact_type: 'PAYABLE' },
        initialValues: {
          fact_type: 'PAYABLE',
          counterparty_type: 'SUPPLIER',
          currency: 'CNY',
        },
      },
    },
  },
  invoices: {
    initialActiveKey: 'finance',
    enabledViews: ['finance'],
    showTabs: false,
    pageSummary:
      '发票管理当前接入 finance_facts 的 INVOICE 事实；这里只记录业务开票状态，不替代税控、发票查验或总账凭证。',
    viewOverrides: {
      finance: {
        title: '发票事实',
        createLabel: '新建发票',
        createPrefix: 'invoice',
        listParams: { fact_type: 'INVOICE' },
        initialValues: {
          fact_type: 'INVOICE',
          counterparty_type: 'CUSTOMER',
          currency: 'CNY',
        },
      },
    },
  },
  reconciliation: {
    initialActiveKey: 'finance',
    enabledViews: ['finance'],
    showTabs: false,
    pageSummary:
      '对账管理当前接入 finance_facts 的 RECONCILIATION 事实；对账可结清业务事实，但不自动写付款、发票、总账或凭证。',
    viewOverrides: {
      finance: {
        title: '对账事实',
        createLabel: '新建对账',
        createPrefix: 'reconciliation',
        listParams: { fact_type: 'RECONCILIATION' },
        initialValues: {
          fact_type: 'RECONCILIATION',
          counterparty_type: 'OTHER',
          currency: 'CNY',
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
      initialActiveKey={config.initialActiveKey}
      enabledViews={config.enabledViews}
      viewOverrides={config.viewOverrides}
      showTabs={config.showTabs}
    />
  )
}
