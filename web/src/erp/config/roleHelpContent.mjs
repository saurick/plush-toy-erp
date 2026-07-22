import { mobileRoleDefinitions } from './appRegistry.mjs'
import { getWorkflowWorkbenchRoleKeys } from '../utils/workflowDashboardStats.mjs'

const DESKTOP_HELP_ROLE_ORDER = Object.freeze([
  ...mobileRoleDefinitions.map((role) => role.roleKey),
  'admin',
])

const commonQuestions = Object.freeze([
  {
    question: '页面里没有需要的按钮怎么办？',
    answer:
      '先确认是否选中了可办理的记录，并检查记录当前状态。仍看不到入口时，请联系系统管理员核对账号的岗位和可用页面。',
  },
  {
    question: '任务显示完成，为什么业务记录还没变化？',
    answer:
      '任务完成只表示协同事项已经处理。入库、出货、应收、应付等结果仍要回到对应业务页面确认，最终以业务记录状态为准。',
  },
])

export const ROLE_HELP_GUIDES = Object.freeze([
  {
    key: 'boss',
    label: '老板 / 管理层',
    headline: '先看风险和阻塞，再决定今天需要谁推进什么。',
    summary:
      '管理层帮助聚焦交期、阻塞、库存、出货和财务待办，不代替各岗位办理具体业务。',
    priorities: [
      {
        title: '查看今日重点',
        description: '先看待处理、阻塞和即将到期的事项。',
        path: '/erp/dashboard',
        actionLabel: '打开工作台',
      },
      {
        title: '检查跨岗阻塞',
        description: '按负责岗位和办理状态定位卡点。',
        path: '/erp/task-board',
        actionLabel: '打开任务看板',
      },
      {
        title: '核对业务变化',
        description: '查看订单、库存、出货和财务数量变化。',
        path: '/erp/business-dashboard',
        actionLabel: '打开业务看板',
      },
    ],
    workflow: [
      '先看阻塞、逾期和高优先级事项。',
      '确认问题属于销售、采购、生产、品质、仓库还是财务。',
      '通过任务看板催办或查看当前处理进度。',
      '回到业务看板核对实际业务记录是否已经完成。',
    ],
    handoff:
      '管理层负责定优先级和协调责任人；具体入库、出货、质检和财务记录仍由对应岗位办理。',
    cautions: [
      '不要把任务完成当成入库、出货或收付款已经完成。',
      '先看异常原因和来源记录，再决定是否催办或调整优先级。',
      '经营数字用于发现问题，最终结果以对应业务页面记录为准。',
    ],
    questions: commonQuestions,
  },
  {
    key: 'sales',
    label: '业务',
    headline: '从客户和销售订单开始，持续跟进交期、出货和回款。',
    summary: '业务岗位帮助覆盖客户资料、销售订单、出货跟进、应收和开票衔接。',
    priorities: [
      {
        title: '维护客户资料',
        description: '先补齐交易主体和联系人，再创建销售订单。',
        path: '/erp/master/partners/customers',
        actionLabel: '打开客户档案',
      },
      {
        title: '跟进销售订单',
        description: '核对客户、产品规格、数量和预计出货日期。',
        path: '/erp/sales/project-orders/sales-orders',
        actionLabel: '打开销售订单',
      },
      {
        title: '查看出货结果',
        description: '确认出货单是否已实际发货，再跟进应收和开票。',
        path: '/erp/warehouse/shipments',
        actionLabel: '打开出货单',
      },
      {
        title: '办理客户退货',
        description: '从已出货记录发起退货，并跟进审核和实物收回。',
        path: '/erp/sales/customer-returns',
        actionLabel: '打开客户退货',
      },
    ],
    workflow: [
      '确认客户和联系人资料完整。',
      '创建或更新销售订单，核对产品规格、数量和交期。',
      '关注缺料、生产异常和出货放行进度。',
      '实际出货后，再到应收和发票页面跟进后续记录。',
    ],
    handoff:
      '订单确认后把明确的产品、数量和交期交给 PMC；出货后把应收和开票信息交给财务。',
    cautions: [
      '销售订单不会自动生成库存、出货、应收或发票记录。',
      '客户或产品来源变化时，要重新核对订单明细，不保留错误旧值。',
      '只有出货单确认发货后，才能按实际出货继续办理应收和开票。',
    ],
    questions: commonQuestions,
  },
  {
    key: 'purchase',
    label: '采购',
    headline: '把采购承诺、到料、检验和入库衔接清楚。',
    summary:
      '采购岗位帮助聚焦供应商、材料、采购订单、到料质检、入库和委外协作。',
    priorities: [
      {
        title: '核对供应商和材料',
        description: '确认供应商、材料规格和单位可以被采购单正确引用。',
        path: '/erp/master/partners/suppliers',
        actionLabel: '打开供应商档案',
      },
      {
        title: '办理采购订单',
        description: '维护采购数量、单价和预计到货日期。',
        path: '/erp/purchase/accessories',
        actionLabel: '打开采购订单',
      },
      {
        title: '跟进到料入库',
        description: '从已审核采购订单生成入库草稿并继续办理。',
        path: '/erp/warehouse/inbound',
        actionLabel: '打开入库管理',
      },
    ],
    workflow: [
      '先核对供应商、材料、单位和物料清单。',
      '创建采购订单并提交审核。',
      '从已审核采购订单生成入库草稿，跟进收货和来料检验。',
      '入库过账后再衔接应付；委外回货要先完成合格或让步判定。',
    ],
    handoff:
      '到料后把实收与异常情况交给品质和仓库；确认入库后把应付来源交给财务。',
    cautions: [
      '采购订单只表示采购承诺，不等于已经到货或入库。',
      '首次到货检验不合格会阻止本次入库，不能绕过检验继续确认。',
      '退货和调整必须从已经入库的来源记录办理。',
    ],
    questions: commonQuestions,
  },
  {
    key: 'production',
    label: '生产经理',
    headline: '围绕生产订单推进工序、质检、领料和完工。',
    summary:
      '生产岗位帮助覆盖生产订单、工序推进、异常处理、领料和完工入库衔接。',
    priorities: [
      {
        title: '查看生产订单',
        description: '核对来源、产品、数量、物料需求和固定工序路线。',
        path: '/erp/production/orders',
        actionLabel: '打开生产订单',
      },
      {
        title: '跟进生产进度',
        description: '办理领料、完工和返工来源记录。',
        path: '/erp/production/progress',
        actionLabel: '打开生产进度',
      },
      {
        title: '处理生产异常',
        description: '查看返工记录产生的异常待办和退回原因。',
        path: '/erp/production/exceptions',
        actionLabel: '打开生产异常',
      },
    ],
    workflow: [
      '确认生产订单已发布，物料需求和工序路线正确。',
      '按在制批次推进布料加工、车缝、手工和包装。',
      '需要检验的节点先发起质检，出现问题时记录返工来源。',
      '从生产订单生成领料或完工草稿，并到生产进度页面确认。',
    ],
    handoff:
      '缺料交给 PMC 和采购，检验交给品质，完工入库交给仓库；异常处理结果要回到来源生产记录核对。',
    cautions: [
      '生产订单发布、工序完成或任务完成都不等于库存已经变化。',
      '领料和完工必须从明确的生产订单来源生成并确认。',
      '返工记录与异常待办要分别核对，不能只处理其中一处。',
    ],
    questions: commonQuestions,
  },
  {
    key: 'warehouse',
    label: '仓库',
    headline: '按来源办理收货、入库、库存和实际出货。',
    summary:
      '仓库岗位帮助聚焦入库确认、批次状态、库存可用量、出货放行和实际出库。',
    priorities: [
      {
        title: '办理入库',
        description: '从采购来源核对收货、待检和入库状态。',
        path: '/erp/warehouse/inbound',
        actionLabel: '打开入库管理',
      },
      {
        title: '核对库存',
        description: '查看余额、已预留、可用量、批次和变动记录。',
        path: '/erp/warehouse/inventory',
        actionLabel: '打开库存台账',
      },
      {
        title: '办理实际出货',
        description: '先确认放行和检验，再由出货单完成发货。',
        path: '/erp/warehouse/shipments',
        actionLabel: '打开出货单',
      },
    ],
    workflow: [
      '核对采购来源、实收数量、仓库和批次。',
      '需要检验的到料先等待品质判定，再确认入库。',
      '备货时查看已预留和可用量，不只看库存总数。',
      '出货前核对放行、检验和来源数量，确认发货后再检查库存变化。',
    ],
    handoff:
      '收货异常交给采购和品质；可用库存、备货和实际发货结果及时反馈给 PMC 与业务。',
    cautions: [
      '出货放行只表示可以继续发货，不等于已经出库。',
      '释放预留不会增加库存总量，确认发货才会扣减库存。',
      '盘点、调拨和人工调整要在库存台账创建草稿并确认过账；未过账不会改变库存。',
    ],
    questions: commonQuestions,
  },
  {
    key: 'finance',
    label: '财务',
    headline: '从已发生的业务结果办理应收、应付、发票和对账。',
    summary:
      '财务岗位帮助聚焦来源核对、过账、结清、取消和单笔对账，不替代银行或税控系统。',
    priorities: [
      {
        title: '跟进应付',
        description: '从已入库采购或合格委外回货生成应付。',
        path: '/erp/finance/payables',
        actionLabel: '打开应付管理',
      },
      {
        title: '跟进应收',
        description: '从已出货记录生成并办理应收。',
        path: '/erp/finance/receivables',
        actionLabel: '打开应收管理',
      },
      {
        title: '办理收付款与核销',
        description: '登记真实收付款，并按往来方和币种选择多笔应收或应付核销。',
        path: '/erp/finance/payments',
        actionLabel: '打开收付款',
      },
    ],
    workflow: [
      '先核对来源单号、往来方、金额和业务状态。',
      '从符合条件的入库、委外回货或出货记录生成财务记录。',
      '确认无误后过账，再按实际进展结清或取消。',
      '真实收付款到账后登记并选择多笔应收或应付核销；差异核对另到对账页面办理。',
    ],
    handoff:
      '采购与仓库提供已入库来源，业务与仓库提供已出货来源；金额或往来方异常先退回来源岗位核对。',
    cautions: [
      '应收只从已出货记录生成，应付只从符合条件的入库或委外回货生成。',
      '系统发票记录不等于税控开票已经完成。',
      '收付款和核销不会自动生成总账凭证；错误记录使用冲销或红冲，不能删除原事实。',
    ],
    questions: commonQuestions,
  },
  {
    key: 'pmc',
    label: 'PMC',
    headline: '把订单、物料、排产、生产和出货节奏连起来。',
    summary: 'PMC 帮助聚焦齐套、排程、生产进度、委外进度、延期和出货协调。',
    priorities: [
      {
        title: '查看任务和风险',
        description: '先定位缺料、阻塞、逾期和需要跨岗协调的事项。',
        path: '/erp/task-board',
        actionLabel: '打开任务看板',
      },
      {
        title: '安排生产计划',
        description: '核对订单来源、物料需求和计划数量。',
        path: '/erp/production/orders',
        actionLabel: '打开生产订单',
      },
      {
        title: '推进生产排程',
        description: '处理生产订单发布后生成的排程待办。',
        path: '/erp/production/scheduling',
        actionLabel: '打开生产排程',
      },
    ],
    workflow: [
      '从销售订单和交期判断当前优先级。',
      '核对物料清单、库存可用量和采购到料进度。',
      '发布生产订单并完成排程待办。',
      '持续跟进生产、委外、质检、仓库和出货异常。',
    ],
    handoff:
      '缺料交给采购，工序与完工交给生产，检验交给品质，备货与出货交给仓库，并向业务反馈交期变化。',
    cautions: [
      '排程任务完成不等于领料、完工或库存已经更新。',
      '查看库存时同时核对已预留和可用量。',
      '交期变化要回到来源订单和相关任务同步确认。',
    ],
    questions: commonQuestions,
  },
  {
    key: 'quality',
    label: '品质',
    headline: '从真实来源发起检验，给出清晰判定并交回下一岗位。',
    summary: '品质岗位帮助覆盖采购来料、委外回货、生产过程和出货前成品检验。',
    priorities: [
      {
        title: '办理质量检验',
        description: '按来源查看待检项目、批次和判定要求。',
        path: '/erp/production/quality-inspections',
        actionLabel: '打开质量检验',
      },
      {
        title: '查看来料来源',
        description: '核对采购到料、批次和当前入库状态。',
        path: '/erp/warehouse/inbound',
        actionLabel: '打开入库管理',
      },
      {
        title: '跟进生产异常',
        description: '查看返工来源产生的异常待办。',
        path: '/erp/production/exceptions',
        actionLabel: '打开生产异常',
      },
    ],
    workflow: [
      '确认检验来自采购到料、委外回货、生产批次或出货单。',
      '核对产品或材料、批次、数量和检验要求。',
      '记录合格、让步接收或不合格判定及原因。',
      '把判定结果交回采购、生产、仓库或出货岗位继续办理。',
    ],
    handoff:
      '来料结果交给采购和仓库，过程结果交给生产，出货前结果交给仓库和业务。',
    cautions: [
      '任务完成不等于检验记录已经完成，最终以质检单状态为准。',
      '质检状态不会直接增减库存总量。',
      '首次到货不合格与已入库后的退货处理是两种不同场景。',
    ],
    questions: commonQuestions,
  },
  {
    key: 'engineering',
    label: '工程',
    headline: '先把产品、规格、材料、物料清单和加工环节维护准确。',
    summary:
      '工程岗位帮助聚焦产品工程资料，为销售、采购、生产、委外和打印提供可靠基础。',
    priorities: [
      {
        title: '维护产品规格',
        description: '核对产品规格、颜色、尺码、条码和包装版本。',
        path: '/erp/master/products',
        actionLabel: '打开产品档案',
      },
      {
        title: '维护物料清单',
        description: '维护产品结构、材料用量、损耗和生效版本。',
        path: '/erp/purchase/material-bom',
        actionLabel: '打开物料清单',
      },
      {
        title: '维护加工环节',
        description: '维护委外和质检可以引用的标准加工环节。',
        path: '/erp/engineering/processes',
        actionLabel: '打开加工环节',
      },
    ],
    workflow: [
      '先维护产品及规格，再确认材料档案和单位。',
      '建立物料清单，核对用量、损耗和版本。',
      '维护需要在委外或质检中引用的加工环节。',
      '资料变更后通知采购、PMC 和生产核对未完成单据。',
    ],
    handoff:
      '产品和物料清单交给业务、采购与 PMC 使用；加工环节交给委外、生产和品质引用。',
    cautions: [
      '物料清单生效不会自动生成采购需求、生产任务或库存。',
      '同一产品只保留一个当前生效的物料清单版本。',
      '修改工程资料前先确认是否会影响正在办理的订单。',
    ],
    questions: commonQuestions,
  },
  {
    key: 'admin',
    label: '系统管理员',
    headline: '维护账号、岗位和可用页面，并通过操作记录核对变更。',
    summary:
      '系统管理员帮助只覆盖系统设置，不授予采购、生产、库存、出货或财务办理能力。',
    priorities: [
      {
        title: '维护员工账号',
        description: '创建账号、设置岗位、调整可用页面并管理账号状态。',
        path: '/erp/system/permissions',
        actionLabel: '打开权限管理',
      },
      {
        title: '核对系统操作',
        description: '只读查看系统管理相关操作记录。',
        path: '/erp/system/audit-logs',
        actionLabel: '打开操作记录',
      },
    ],
    workflow: [
      '先确认员工实际岗位和需要使用的页面。',
      '创建或更新账号，并按最小需要分配岗位和页面。',
      '让员工重新登录后核对菜单和手机待办入口。',
      '出现账号或设置争议时，通过操作记录核对变更。',
    ],
    handoff:
      '账号设置完成后由对应岗位本人验证；业务数据和单据问题交给实际业务负责人处理。',
    cautions: [
      '系统管理员不会自动获得业务办理权限。',
      '停用账号会阻止登录，但不会删除历史业务记录。',
      '只分配完成工作所需的岗位和页面，避免无关入口增加误操作。',
    ],
    questions: [
      {
        question: '员工登录后看不到页面怎么办？',
        answer:
          '先核对账号是否启用、岗位是否正确、页面是否已分配；保存后让员工重新登录或等待页面自动同步。',
      },
      {
        question: '能否直接替员工办理业务？',
        answer:
          '系统管理员只负责系统设置。需要办理业务时，应另行分配真实业务岗位和所需页面，并由实际负责人操作。',
      },
    ],
  },
])

const roleHelpGuideMap = new Map(
  ROLE_HELP_GUIDES.map((guide) => [guide.key, guide])
)

export const GENERIC_HELP_GUIDE = Object.freeze({
  key: 'generic',
  label: '通用使用帮助',
  headline: '从当前可见页面开始，按来源和状态完成手头工作。',
  summary:
    '当前账号使用自定义岗位或尚未配置标准岗位，帮助中心只展示通用操作原则和已经开放的页面。',
  priorities: [],
  workflow: [
    '先从工作台或当前可见页面查看待处理事项。',
    '打开来源记录，核对状态、数量、负责人和下一步提示。',
    '只办理当前页面明确提供的操作。',
    '完成后回到来源业务页面确认记录状态。',
  ],
  handoff: '如当前帮助与实际职责不符，请联系系统管理员核对岗位设置。',
  cautions: [
    '不要通过猜测修改不熟悉的业务记录。',
    '页面未开放的操作需要由对应岗位办理。',
    '遇到异常先保留来源单号和页面提示，再联系负责人。',
  ],
  questions: commonQuestions,
})

export function getRoleHelpGuide(roleKey = '') {
  return roleHelpGuideMap.get(String(roleKey || '').trim()) || null
}

export function getRoleHelpGuidesForProfile(adminProfile = {}) {
  if (adminProfile?.is_super_admin === true) {
    return DESKTOP_HELP_ROLE_ORDER.map((roleKey) =>
      getRoleHelpGuide(roleKey)
    ).filter(Boolean)
  }

  const roleKeySet = new Set(getWorkflowWorkbenchRoleKeys(adminProfile))
  const guides = DESKTOP_HELP_ROLE_ORDER.filter((roleKey) =>
    roleKeySet.has(roleKey)
  )
    .map((roleKey) => getRoleHelpGuide(roleKey))
    .filter(Boolean)

  return guides.length > 0 ? guides : [GENERIC_HELP_GUIDE]
}

export function filterRoleHelpPriorities(
  guide,
  { allowedMenuPaths = [], isSuperAdmin = false } = {}
) {
  const allowedPathSet = new Set(
    (Array.isArray(allowedMenuPaths) ? allowedMenuPaths : [])
      .map((path) => String(path || '').trim())
      .filter(Boolean)
  )
  return (Array.isArray(guide?.priorities) ? guide.priorities : []).map(
    (priority) => ({
      ...priority,
      available: isSuperAdmin || allowedPathSet.has(priority.path),
    })
  )
}

export function getDesktopHelpRoleOrder() {
  return [...DESKTOP_HELP_ROLE_ORDER]
}
