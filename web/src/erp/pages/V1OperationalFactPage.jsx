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
      '应收管理当前只接入 finance_facts 的 RECEIVABLE 事实；应收至少应来自真实出货后评审，不由销售订单或出货放行自动生成，也不代表收款核销、税控或总账已交付。',
    viewOverrides: {
      finance: {
        title: '应收事实',
        createLabel: '登记应收事实',
        createPrefix: 'receivable',
        modalDescription:
          '这里只登记 RECEIVABLE 业务事实；不生成收款核销、税控票据、总账凭证或多账簿数据。',
        selectionBoundaryText:
          '当前页只调用 finance_facts 后端 usecase；结清只关闭应收业务事实，不代表真实收款、税控或总账完成。',
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
      '应付管理当前只接入 finance_facts 的 PAYABLE 事实；应付来源必须回到采购、委外或对账事实，不把待付款提醒当成付款、核销或总账事实。',
    viewOverrides: {
      finance: {
        title: '应付事实',
        createLabel: '登记应付事实',
        createPrefix: 'payable',
        modalDescription:
          '这里只登记 PAYABLE 业务事实；不生成付款审批、付款流水、费用报销、核销或总账凭证。',
        selectionBoundaryText:
          '当前页只调用 finance_facts 后端 usecase；结清只关闭应付业务事实，不代表付款审批、付款流水、核销或总账完成。',
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
      '发票管理当前只接入 finance_facts 的 INVOICE 事实；这里只记录业务开票状态，不替代税控、发票查验、纳税申报、附件归档或总账凭证。',
    viewOverrides: {
      finance: {
        title: '发票事实',
        createLabel: '登记发票事实',
        createPrefix: 'invoice',
        modalDescription:
          '这里只登记 INVOICE 业务事实；不替代税控开票、发票查验、纳税申报、附件归档或总账凭证。',
        selectionBoundaryText:
          '当前页只调用 finance_facts 后端 usecase；过账、结清和取消不等于税控、查验、纳税或总账动作。',
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
      '对账管理当前只接入 finance_facts 的 RECONCILIATION 事实；对账可结清业务事实，但不自动写付款、发票、总账、凭证或税务数据。',
    viewOverrides: {
      finance: {
        title: '对账事实',
        createLabel: '登记对账事实',
        createPrefix: 'reconciliation',
        modalDescription:
          '这里只登记 RECONCILIATION 业务事实；不自动生成付款、发票、总账凭证、税务数据或跨账簿调整。',
        selectionBoundaryText:
          '当前页只调用 finance_facts 后端 usecase；结清只关闭对账业务事实，不自动写付款、发票、总账或凭证。',
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
