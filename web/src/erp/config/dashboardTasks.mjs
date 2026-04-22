import { appDefinitions } from './appRegistry.mjs'
import { printTemplateStats } from './printTemplates.mjs'
import {
  PRINT_WORKSPACE_ENTRY_SOURCE,
  PROCESSING_CONTRACT_TEMPLATE_KEY,
  buildPrintCenterPath,
} from '../utils/printWorkspace.js'
import {
  helpCenterNavItems,
  plannedModules,
  sourceReadiness,
} from './seedData.mjs'

export const TASK_STATUS = Object.freeze({
  TODO: '待处理',
  IN_PROGRESS: '进行中',
  REVIEW: '待确认',
  BLOCKED: '风险阻塞',
  DONE: '已完成',
})

export const TASK_STATUS_ORDER = Object.freeze([
  TASK_STATUS.TODO,
  TASK_STATUS.IN_PROGRESS,
  TASK_STATUS.REVIEW,
  TASK_STATUS.BLOCKED,
  TASK_STATUS.DONE,
])

export const TASK_STATUS_META = Object.freeze({
  [TASK_STATUS.TODO]: {
    pillClass: 'border-amber-200 bg-amber-50 text-amber-700',
    valueClass: 'text-amber-700',
    barColor: '#f59e0b',
    summary: '已排进范围，但还没进入正式实现。',
  },
  [TASK_STATUS.IN_PROGRESS]: {
    pillClass: 'border-sky-200 bg-sky-50 text-sky-700',
    valueClass: 'text-sky-700',
    barColor: '#2563eb',
    summary: '当前轮正在推进的主任务。',
  },
  [TASK_STATUS.REVIEW]: {
    pillClass: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    valueClass: 'text-cyan-700',
    barColor: '#0891b2',
    summary: '需要继续补样本或确认口径后再收口。',
  },
  [TASK_STATUS.BLOCKED]: {
    pillClass: 'border-rose-200 bg-rose-50 text-rose-700',
    valueClass: 'text-rose-700',
    barColor: '#e11d48',
    summary: '受真实样本或当前范围限制，先卡住。',
  },
  [TASK_STATUS.DONE]: {
    pillClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    valueClass: 'text-emerald-700',
    barColor: '#059669',
    summary: '当前轮已按真源收口或已落正式入口。',
  },
})

const modulePathRegistry = Object.freeze({
  'customer-style': '/erp/docs/field-linkage-guide',
  'bom-materials': '/erp/docs/field-linkage-guide',
  'processing-contract': buildPrintCenterPath(
    PROCESSING_CONTRACT_TEMPLATE_KEY,
    {
      entrySource: PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS,
    }
  ),
  'production-schedule': '/erp/docs/operation-flow-overview',
  warehouse: '/erp/docs/operation-flow-overview',
  finance: '/erp/docs/calculation-guide',
  'help-docs': '/erp/docs/operation-guide',
  'print-center': '/erp/print-center',
  'mobile-topology': '/erp/docs/operation-guide',
})

const mobileAppCount = appDefinitions.filter(
  (app) => app.kind === 'mobile'
).length

const moduleTaskSupplements = Object.freeze({
  'customer-style': [
    {
      title: '桌面立项入口与缺资料提示',
      status: TASK_STATUS.IN_PROGRESS,
      note: '先把客户 / 款式 / 交期的缺口暴露到任务看板和角色入口。',
    },
    {
      title: '补客户订单 / 出货单样本确认订单号关系',
      status: TASK_STATUS.REVIEW,
      note: sourceReadiness.pending[0],
    },
  ],
  'bom-materials': [
    {
      title: '补 BOM / 辅包材导入映射与清洗规则',
      status: TASK_STATUS.IN_PROGRESS,
      note: '主料 BOM、辅材采购和包材采购继续按不同真源维护。',
    },
    {
      title: '补更多 BOM / 辅材 / 包材 Excel 样本',
      status: TASK_STATUS.REVIEW,
      note: sourceReadiness.pending[2],
    },
  ],
  'processing-contract': [
    {
      title: '把加工合同打印与字段快照并到统一入口',
      status: TASK_STATUS.IN_PROGRESS,
      note: '固定模板已落入口，后续继续收口自动带值范围。',
    },
    {
      title: '补更多加工合同 PDF 样本',
      status: TASK_STATUS.REVIEW,
      note: sourceReadiness.pending[1],
    },
  ],
  'production-schedule': [
    {
      title: '角色首页、排产卡片与进度回填',
      status: TASK_STATUS.IN_PROGRESS,
      note: '先让 PMC / 生产经理在桌面和移动端有统一的进度入口。',
    },
    {
      title: '返工日志与延期原因继续接真实保存链路',
      status: TASK_STATUS.TODO,
      note: '当前先保留结构和信息架构，不抢跑复杂排产引擎。',
    },
  ],
  warehouse: [
    {
      title: '收货 / 入库 / 待出货清单与异常件入口',
      status: TASK_STATUS.IN_PROGRESS,
      note: '先落轻量确认视图，不在当前轮引入复杂库位策略。',
    },
    {
      title: 'PDA / 硬件化入库依赖真实现场流程样本',
      status: TASK_STATUS.BLOCKED,
      note: sourceReadiness.pending[4],
    },
  ],
  finance: [
    {
      title: '对账提醒 / 待付款 / 异常费用入口',
      status: TASK_STATUS.IN_PROGRESS,
      note: '先落提醒与快照，不提前硬建完整账务实体。',
    },
    {
      title: '正式结算单 / 对账单样本不足',
      status: TASK_STATUS.BLOCKED,
      note: sourceReadiness.pending[3],
    },
  ],
  'help-docs': [
    {
      title: `已沉淀 ${helpCenterNavItems.length} 个帮助中心入口`,
      status: TASK_STATUS.DONE,
      note: '流程图、操作教程、字段联动口径和计算口径都已统一收口到帮助中心。',
    },
    {
      title: '帮助中心继续同步任务状态与 deferred 边界',
      status: TASK_STATUS.IN_PROGRESS,
      note: '避免页面、帮助中心和 changes slug 口径漂移。',
    },
  ],
  'print-center': [
    {
      title: `已整理 ${printTemplateStats.total} 套固定打印模板`,
      status: TASK_STATUS.DONE,
      note: '辅料合同、加工合同、材料汇总、加工汇总和生产总表已统一收口。',
    },
    {
      title: '真实业务记录自动带值仍待后续接入',
      status: TASK_STATUS.TODO,
      note: '当前继续以固定模板预览与浏览器打印为主。',
    },
  ],
  'mobile-topology': [
    {
      title: `${mobileAppCount} 个角色移动端端口已拆出`,
      status: TASK_STATUS.DONE,
      note: '六个角色继续共享同一仓库和同一套后端接口边界。',
    },
    {
      title: '角色页面继续接真实接口与保存链路',
      status: TASK_STATUS.TODO,
      note: '当前移动端仍以静态 / 半静态角色页为主。',
    },
  ],
})

function mapPlannedModuleStatusToTaskStatus(status) {
  switch (status) {
    case 'source_grounded':
      return TASK_STATUS.DONE
    case 'seeded':
      return TASK_STATUS.IN_PROGRESS
    case 'awaiting_confirmation':
      return TASK_STATUS.REVIEW
    case 'deferred':
      return TASK_STATUS.TODO
    default:
      return TASK_STATUS.TODO
  }
}

function createEmptyStatusCount() {
  return TASK_STATUS_ORDER.reduce((accumulator, status) => {
    accumulator[status] = 0
    return accumulator
  }, {})
}

export const dashboardTaskModules = Object.freeze(
  plannedModules.map((moduleItem) => ({
    key: moduleItem.key,
    title: moduleItem.title,
    owner: moduleItem.owner,
    summary: moduleItem.summary,
    path: modulePathRegistry[moduleItem.key] || '/erp/dashboard',
    tasks: Object.freeze([
      {
        title: moduleItem.title,
        status: mapPlannedModuleStatusToTaskStatus(moduleItem.status),
        note: moduleItem.summary,
      },
      ...(moduleTaskSupplements[moduleItem.key] || []),
    ]),
  }))
)

export function buildDashboardTaskRows(modules = dashboardTaskModules) {
  return (modules || []).map((moduleItem) => {
    const statusCount = createEmptyStatusCount()

    ;(moduleItem.tasks || []).forEach((task) => {
      const taskStatus = TASK_STATUS_ORDER.includes(task?.status)
        ? task.status
        : TASK_STATUS.TODO
      statusCount[taskStatus] += 1
    })

    return {
      key: moduleItem.key,
      title: moduleItem.title,
      owner: moduleItem.owner,
      path: moduleItem.path,
      summary: moduleItem.summary,
      total: (moduleItem.tasks || []).length,
      tasks: moduleItem.tasks || [],
      statusCount,
    }
  })
}

export function buildDashboardTaskSummary(rows = []) {
  const summary = (rows || []).reduce(
    (accumulator, row) => {
      accumulator.totalTasks += Number(row?.total || 0)
      TASK_STATUS_ORDER.forEach((status) => {
        accumulator.statusCount[status] += Number(
          row?.statusCount?.[status] || 0
        )
      })
      return accumulator
    },
    {
      totalTasks: 0,
      statusCount: createEmptyStatusCount(),
    }
  )

  return {
    ...summary,
    completionRatio: summary.totalTasks
      ? Math.round(
          (summary.statusCount[TASK_STATUS.DONE] / summary.totalTasks) * 100
        )
      : 0,
    attentionCount:
      summary.statusCount[TASK_STATUS.TODO] +
      summary.statusCount[TASK_STATUS.BLOCKED],
  }
}
