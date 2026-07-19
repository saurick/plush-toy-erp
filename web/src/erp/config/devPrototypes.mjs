export { DEV_PROTOTYPES_ROUTE } from './devRoutes.mjs'
export const DEV_PROTOTYPE_PINNED_STORAGE_KEY =
  'plush_erp_dev_prototype_pinned_keys'
export const DEV_PROTOTYPE_EXPANDED_GROUPS_STORAGE_KEY =
  'plush_erp_dev_prototype_expanded_groups'
export const DEV_PROTOTYPE_SELECTED_STORAGE_KEY =
  'plush_erp_dev_prototype_selected_key'
export const DEV_PROTOTYPE_STATUS_FILTER_STORAGE_KEY =
  'plush_erp_dev_prototype_status_filter'

export const DEV_PROTOTYPE_STATUSES = Object.freeze({
  CURRENT: '当前实现 / Current',
  TO_IMPLEMENT: '待实现 / To Implement',
  DRAFT: '起草阶段 / Draft',
  HISTORY: '历史参考 / History',
  EVIDENCE: '截图证据 / Evidence',
  COMPARISON: '方案对比 / Comparison',
})

export const DEV_PROTOTYPE_STATUS_OPTIONS = Object.freeze([
  DEV_PROTOTYPE_STATUSES.CURRENT,
  DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT,
  DEV_PROTOTYPE_STATUSES.DRAFT,
  DEV_PROTOTYPE_STATUSES.HISTORY,
  DEV_PROTOTYPE_STATUSES.EVIDENCE,
  DEV_PROTOTYPE_STATUSES.COMPARISON,
])

export const DEV_PROTOTYPE_FILTERS = Object.freeze({
  ALL: 'all',
  CURRENT: 'current',
  TO_IMPLEMENT: 'to-implement',
  REFERENCE: 'reference',
})

export const DEV_PROTOTYPE_FILTER_OPTIONS = Object.freeze([
  { value: DEV_PROTOTYPE_FILTERS.ALL, label: '全部 / All' },
  { value: DEV_PROTOTYPE_FILTERS.CURRENT, label: '当前实现 / Current' },
  {
    value: DEV_PROTOTYPE_FILTERS.TO_IMPLEMENT,
    label: '待实现 / To Implement',
  },
  { value: DEV_PROTOTYPE_FILTERS.REFERENCE, label: '参考资料 / Reference' },
])

const SANDBOX_STORAGE_SHIM = `<script>
;(function () {
  function createMemoryStorage() {
    var values = Object.create(null)
    var keys = []
    return {
      get length() { return keys.length },
      key: function (index) { return keys[index] || null },
      getItem: function (key) {
        key = String(key)
        return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null
      },
      setItem: function (key, value) {
        key = String(key)
        if (!Object.prototype.hasOwnProperty.call(values, key)) keys.push(key)
        values[key] = String(value)
      },
      removeItem: function (key) {
        key = String(key)
        if (!Object.prototype.hasOwnProperty.call(values, key)) return
        delete values[key]
        keys = keys.filter(function (item) { return item !== key })
      },
      clear: function () { values = Object.create(null); keys = [] }
    }
  }
  ;['localStorage', 'sessionStorage'].forEach(function (name) {
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        value: createMemoryStorage()
      })
    } catch (_error) {}
  })
})()
</script>`

export function prepareDevPrototypeSandboxSource(source = '') {
  const html = String(source || '')
  if (!html) return ''
  if (/<head(?:\s[^>]*)?>/i.test(html)) {
    return html.replace(/<head(?:\s[^>]*)?>/i, (head) => {
      return `${head}\n${SANDBOX_STORAGE_SHIM}`
    })
  }
  return `${SANDBOX_STORAGE_SHIM}\n${html}`
}

export const DEV_PROTOTYPE_ASSETS = Object.freeze([
  {
    key: 'admin-command-center',
    title: '后台工作台样板',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT],
    directory: 'admin-command-center-v1/',
    assetPath: 'admin-command-center-v1/index.html',
    readmePath: 'admin-command-center-v1/README.md',
    description:
      '把工作台收敛为登录后的今日处理台：今日焦点、队列筛选、当前任务上下文、当前任务关联记录入口和交接边界。',
    appliesTo:
      '后台首页 / 工作台、任务看板、业务看板、模板打印中心和异常闭环等总控入口可参照；当前任务关联记录入口不是正式菜单替代表。',
  },
  {
    key: 'admin-command-center-redesign-reference',
    title: '后台工作台重设计方向图',
    type: 'PNG',
    statuses: [DEV_PROTOTYPE_STATUSES.DRAFT],
    directory: 'admin-command-center-v1/images/',
    assetPath:
      'admin-command-center-v1/images/workbench-redesign-reference.png',
    readmePath: 'admin-command-center-v1/README.md',
    description:
      '保留后台工作台重设计时的首屏层级、主从布局和操作密度方向，供 HTML 样板与运行态 review 对照。',
    appliesTo:
      '仅作为工作台视觉与信息架构参考；它不是 Current、运行时截图、正式菜单或业务能力真源。',
  },
  {
    key: 'core-menu-coverage',
    title: '产品核心菜单覆盖样板',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT],
    directory: 'core-menu-coverage-v1/',
    assetPath: 'core-menu-coverage-v1/index.html',
    readmePath: 'core-menu-coverage-v1/README.md',
    description:
      '把 20260611 参考规格中的 51 个二级菜单收口为可筛选内容矩阵，标注页面类型、事实源、关键字段、动作和边界。',
    appliesTo:
      '用于逐菜单核对页面内容覆盖，并映射到现有列表页、详情页、表单页、动作浮层、工作台、报表、导入和移动任务样板；不是正式菜单承诺。',
  },
  {
    key: 'task-command-center',
    title: '任务中心样板',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT],
    directory: 'task-command-center-v1/',
    assetPath: 'task-command-center-v1/index.html',
    readmePath: 'task-command-center-v1/README.md',
    description:
      '把任务菜单收敛为职责处理台：待我处理、我发起的、阻塞交接、当前任务详情、任务处理抽屉和关联业务对象。',
    appliesTo:
      '我的任务、任务看板、工作台风险队列、岗位任务端和业务页协同入口可参照；不复制业务菜单树，不把任务完成写成事实过账。',
  },
  {
    key: 'task-command-center-redesign-reference',
    title: '任务看板重设计方向图',
    type: 'PNG',
    statuses: [DEV_PROTOTYPE_STATUSES.DRAFT],
    directory: 'task-command-center-v1/images/',
    assetPath:
      'task-command-center-v1/images/task-board-redesign-reference.png',
    readmePath: 'task-command-center-v1/README.md',
    description:
      '保留任务看板重设计时的队列、泳道、当前任务详情和主操作层级方向，供 HTML 样板与运行态 review 对照。',
    appliesTo:
      '仅作为任务看板视觉与信息架构参考；它不定义任务权限、状态机、Workflow 动作或事实过账。',
  },
  {
    key: 'workflow-task-action-flow',
    title: 'Workflow 任务处理流程样板',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT],
    directory: 'workflow-task-action-flow-v1/',
    assetPath: 'workflow-task-action-flow-v1/index.html',
    readmePath: 'workflow-task-action-flow-v1/README.md',
    description:
      '把核对任务、选择处理、确认与结果收口为可直接导航的三步流程；催办只是处理动作，确认页受动作与原因校验约束。',
    appliesTo:
      '任务中心、岗位任务端和有真实 Workflow 关联的业务页协同入口可参照；可用动作、原因规则和提交权限仍以现有 action explain、RBAC、owner / assignee 与任务状态为准。',
  },
  {
    key: 'workflow-task-action-flow-redesign-reference',
    title: '任务处理流程重设计方向图',
    type: 'PNG',
    statuses: [DEV_PROTOTYPE_STATUSES.DRAFT],
    directory: 'workflow-task-action-flow-v1/images/',
    assetPath:
      'workflow-task-action-flow-v1/images/task-action-flow-redesign-reference.png',
    readmePath: 'workflow-task-action-flow-v1/README.md',
    description:
      '保留任务处理三步导航、动作选择、原因输入和确认回执的视觉方向，供可交互 HTML 与运行态 review 对照。',
    appliesTo:
      '仅作为共享任务处理流程的视觉参考；它不替代运行时组件、任务权限、API 或 Workflow / Fact 边界。',
  },
  {
    key: 'business-management-center',
    title: '业务管理中心样板',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT],
    directory: 'business-management-center-v1/',
    assetPath: 'business-management-center-v1/index.html',
    readmePath: 'business-management-center-v1/README.md',
    description:
      '把业务管理菜单收敛为业务对象总控：按链路选择对象、查看风险、进入标准业务页或详情页。',
    appliesTo:
      '业务管理类总入口、业务看板下钻、正式入口壳和同类业务对象选择可参照；不恢复 business_records，不承诺未接 API 已完成。',
  },
  {
    key: 'business-management-center-redesign-reference',
    title: '业务看板重设计方向图',
    type: 'PNG',
    statuses: [DEV_PROTOTYPE_STATUSES.DRAFT],
    directory: 'business-management-center-v1/images/',
    assetPath:
      'business-management-center-v1/images/business-board-redesign-reference.png',
    readmePath: 'business-management-center-v1/README.md',
    description:
      '保留业务看板重设计时的业务分段、记录数量、办理边界和关注事项层级方向，供 HTML 样板与运行态 review 对照。',
    appliesTo:
      '仅作为业务看板视觉与信息架构参考；它不证明模块可用、业务数量真实或未接 API 已完成。',
  },
  {
    key: 'metric-card-interaction-standard',
    title: '指标卡交互语义样板',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT],
    directory: 'metric-card-interaction-standard-v1/',
    assetPath: 'metric-card-interaction-standard-v1/index.html',
    readmePath: 'metric-card-interaction-standard-v1/README.md',
    description:
      '统一只读统计卡、可点击动作卡和筛选统计卡的默认态、hover / focus、选中态和恢复态。',
    appliesTo:
      '后台首页、任务看板、业务看板、业务页标题摘要和同类 KPI / 数字入口可参照；先区分只读、动作和筛选三类语义。',
  },
  {
    key: 'formal-menu-candidate',
    title: '正式菜单候选原型',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT],
    directory: 'formal-menu-candidate-v1/',
    assetPath: 'formal-menu-candidate-v1/index.html',
    readmePath: 'formal-menu-candidate-v1/README.md',
    description:
      '把内部 51 项菜单覆盖压缩成 12 个高频主入口，说明哪些细项应进入 tab、筛选、动作或详情区。',
    appliesTo:
      '用于评审正式左侧导航候选：工作台、任务、主数据、销售、采购入库质检、库存、生产外协、出货、财务、报表、导入和系统；不改当前运行时菜单。',
  },
  {
    key: 'audit-log-page',
    title: '审计日志页原型',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT],
    directory: 'audit-log-page-v1/',
    assetPath: 'audit-log-page-v1/index.html',
    readmePath: 'audit-log-page-v1/README.md',
    description:
      '把审计日志页从空表壳收敛为系统控制面追踪工具：审计摘要、筛选分组、日志列表、事件详情、空态和风险事件态。',
    appliesTo:
      '系统管理 / 审计日志页面可参照；只读追溯账号、角色、权限和初始化事件，不替代业务事实表、后端 API、RBAC 或菜单真源。',
  },
  {
    key: 'business-module-standard-page',
    title: '业务模块标准页样板',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT],
    directory: 'business-module-page-standard-v1/',
    assetPath: 'business-module-page-standard-v1/index.html',
    readmePath: 'business-module-page-standard-v1/README.md',
    description:
      '保留标题摘要、少量筛选、表格和当前记录操作条；协同入口不作为所有标准页的默认固定栏。',
    appliesTo:
      '客户档案、供应商档案、产品、销售订单、采购订单、加工合同 / 委外下单、入库通知 / 检验 / 入库、库存、待出货 / 出货放行、出库、生产排单、生产进度、延期 / 返工 / 异常、品质检验、对账 / 结算、待付款 / 应付提醒、应收 / 开票登记和发票登记等同类列表页可参照列表骨架；不默认挂载协同入口。',
  },
  {
    key: 'print-template-center',
    title: '模板打印中心样板',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT],
    directory: 'print-template-center-v1/',
    assetPath: 'print-template-center-v1/index.html',
    readmePath: 'print-template-center-v1/README.md',
    description:
      '保留采购合同、加工合同、物料分析明细表、色卡和作业指导书五个正式模板的导航、纸面预览和打印窗口入口；字段编辑和明细确认回到独立打印窗口。',
    appliesTo:
      '模板打印中心可参照；当前运行时正式模板包含采购合同、加工合同、物料分析明细表、色卡和作业指导书，不新增样品确认单、字段映射配置、后端 API、RBAC 或 Fact 写入。',
  },
  {
    key: 'business-task-collab-entry',
    title: '业务页协同入口组件样板',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT],
    directory: 'business-module-page-standard-v1/',
    assetPath: 'business-module-page-standard-v1/task-collab-entry-v2.html',
    readmePath: 'business-module-page-standard-v1/README.md',
    description:
      '作为条件式业务页内组件样板：只处理当前选中业务记录的关联待办，无待办时不显示固定栏。',
    appliesTo:
      '仅有真实 Workflow 关联、能定位当前选中业务记录待办的业务页可参照；跨记录任务由任务中心承接。它是页内组件，不是独立菜单、路由或权限入口。',
  },
  {
    key: 'business-detail-standard-page',
    title: '业务详情页标准样板',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT],
    directory: 'business-detail-page-standard-v1/',
    assetPath: 'business-detail-page-standard-v1/index.html',
    readmePath: 'business-detail-page-standard-v1/README.md',
    description:
      '覆盖基础信息、业务状态、关联单据、操作记录、附件区，并区分 Workflow 协同动作和 Fact 事实动作。',
    appliesTo:
      '销售订单、客户 / 供应商、产品、采购入库、库存批次、质检、出货和财务等需要详情承载的页面可参照；字段和动作仍由各自 API / usecase / RBAC 决定。',
  },
  {
    key: 'business-form-standard-page',
    title: '新建 / 编辑表单标准样板',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT],
    directory: 'business-form-page-standard-v1/',
    assetPath: 'business-form-page-standard-v1/index.html',
    readmePath: 'business-form-page-standard-v1/README.md',
    description:
      '覆盖页面级新建 / 编辑骨架、字段分组、item 区来源选择器入口、横向滚动、明细统计、必填提示、校验错误、保存 / 取消 / 重置、来源带值、清值、新增 / 编辑 / 只读状态和缺值 / 残值防护。',
    appliesTo:
      '客户、供应商、联系人、销售订单、采购订单、BOM 和出货单等主数据或源单页面的新建 / 编辑表单可参照；生产、委外、库存、质检和财务事实不得套用无来源页面级新建，来源动作回到局部动作弹窗样板。',
  },
  {
    key: 'action-modal-drawer-standard',
    title: '局部动作弹窗标准样板',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT],
    directory: 'action-modal-drawer-standard-v1/',
    assetPath: 'action-modal-drawer-standard-v1/index.html',
    readmePath: 'action-modal-drawer-standard-v1/README.md',
    description:
      '覆盖单据补录、来源选择器、明细行、列顺序、状态动作说明和危险确认；来源选择器最多作为第二层，保留分页、已选摘要和清空已选，只选择来源不编辑本单字段，不承诺通用回收站。',
    appliesTo:
      '生产订单领料 / 完工、加工合同发料 / 回货、委外回货质检、出货生成应收 / 发票、采购或委外来源应付及单笔核对等来源动作可参照；PAYMENT 保持只读，不开放收付款录入，字段真源、权限、幂等和事实约束仍由后端 usecase / RBAC 决定。',
  },
  {
    key: 'business-direction-sidebar',
    title: '方向 1：右侧当前记录协同侧栏',
    type: 'PNG',
    statuses: [DEV_PROTOTYPE_STATUSES.DRAFT, DEV_PROTOTYPE_STATUSES.COMPARISON],
    directory: 'business-module-page-standard-v1/images/',
    assetPath:
      'business-module-page-standard-v1/images/direction-1-current-record-sidebar.png',
    readmePath: 'business-module-page-standard-v1/README.md',
    description: '早期协同入口方向图，用于追溯为何不采用右侧侧栏作为默认骨架。',
    appliesTo: '仅用于业务页协同入口方案对比，不对应正式菜单或当前实现。',
  },
  {
    key: 'business-direction-flowbar',
    title: '方向 2：顶部流程条 + 协同任务抽屉',
    type: 'PNG',
    statuses: [DEV_PROTOTYPE_STATUSES.DRAFT, DEV_PROTOTYPE_STATUSES.COMPARISON],
    directory: 'business-module-page-standard-v1/images/',
    assetPath:
      'business-module-page-standard-v1/images/direction-2-flowbar-task-drawer.png',
    readmePath: 'business-module-page-standard-v1/README.md',
    description:
      '早期协同入口方向图，用于比较流程条和抽屉结构的占位与理解成本。',
    appliesTo: '仅用于业务页协同入口方案对比，不对应正式菜单或当前实现。',
  },
  {
    key: 'business-direction-bottom-table',
    title: '方向 3：表格下方协同待办表',
    type: 'PNG',
    statuses: [DEV_PROTOTYPE_STATUSES.DRAFT, DEV_PROTOTYPE_STATUSES.COMPARISON],
    directory: 'business-module-page-standard-v1/images/',
    assetPath:
      'business-module-page-standard-v1/images/direction-3-bottom-task-table.png',
    readmePath: 'business-module-page-standard-v1/README.md',
    description: '早期协同入口方向图，用于说明长表格下方入口的可见性问题。',
    appliesTo: '仅用于业务页协同入口方案对比，不对应正式菜单或当前实现。',
  },
  {
    key: 'mobile-role-tasks-v2',
    title: '岗位任务中心 v2 原型',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT],
    directory: 'mobile-role-tasks-v2/',
    assetPath: 'mobile-role-tasks-v2/index.html',
    readmePath: 'mobile-role-tasks-v2/README.md',
    description:
      '保留 v1 列表壳，选中任务后进入 v2 全屏查看、处理和可信结果回执，结束后恢复原列表状态；无回执时不开放空结果。',
    appliesTo:
      '选中任务流程已接入本地运行时；To Implement 仅表示真实账号浏览器验收和用户确认尚未完成，不表示未来要替换 v1 列表。',
  },
  {
    key: 'mobile-role-tasks-implemented',
    title: '岗位任务端当前列表基线',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.CURRENT],
    directory: 'mobile-role-tasks-v1/',
    assetPath: 'mobile-role-tasks-v1/implemented-reference.html',
    readmePath: 'mobile-role-tasks-v1/README.md',
    description:
      '覆盖当前仍在使用的待办 / 已办 / 提醒 / 我的、主筛选、分批展开和任务卡片；HTML 内旧详情内处理只作历史对照。',
    appliesTo:
      '岗位任务端 `/m/<role>/tasks` 当前唯一 Current 列表基线；选中任务后的 v2 行为以真实代码、测试和运行态为准。',
  },
  {
    key: 'mobile-role-tasks-list',
    title: '岗位任务端早期待办列表图',
    type: 'PNG',
    statuses: [DEV_PROTOTYPE_STATUSES.HISTORY, DEV_PROTOTYPE_STATUSES.EVIDENCE],
    directory: 'mobile-role-tasks-v1/images/',
    assetPath:
      'mobile-role-tasks-v1/images/mobile-role-tasks-list-reference.png',
    readmePath: 'mobile-role-tasks-v1/README.md',
    description:
      '保留岗位胶囊、刷新、同步信息、指标、筛选、任务列表和底部导航的早期方向证据。',
    appliesTo:
      '仅为岗位任务端早期视觉参考；当前实现以 HTML 参考和运行时代码为准。',
  },
  {
    key: 'mobile-role-task-detail',
    title: '岗位任务端早期任务详情图',
    type: 'PNG',
    statuses: [DEV_PROTOTYPE_STATUSES.HISTORY, DEV_PROTOTYPE_STATUSES.EVIDENCE],
    directory: 'mobile-role-tasks-v1/images/',
    assetPath:
      'mobile-role-tasks-v1/images/mobile-role-task-detail-reference.png',
    readmePath: 'mobile-role-tasks-v1/README.md',
    description:
      '保留任务关键信息、风险提示、关联单据、最近动态、原因输入和底部动作栏的早期方向证据。',
    appliesTo:
      '仅为岗位任务端早期视觉参考；当前实现以 HTML 参考和运行时代码为准。',
  },
  {
    key: 'mobile-role-risk-dashboard',
    title: '岗位任务端早期风险分组图',
    type: 'PNG',
    statuses: [DEV_PROTOTYPE_STATUSES.HISTORY, DEV_PROTOTYPE_STATUSES.EVIDENCE],
    directory: 'mobile-role-tasks-v1/images/',
    assetPath:
      'mobile-role-tasks-v1/images/mobile-role-risk-dashboard-reference.png',
    readmePath: 'mobile-role-tasks-v1/README.md',
    description:
      '保留今日必须处理、卡点、等待他人、催办和已完成等分组的早期方向证据。',
    appliesTo:
      '仅为岗位任务端早期视觉参考；当前实现以 HTML 参考和运行时代码为准。',
  },
])

export function isDevPrototypesEnabled(env = import.meta.env) {
  return env?.DEV === true
}

function normalizePrototypeModulePath(modulePath = '') {
  const cleanPath = String(modulePath || '').replace(/\?.*$/, '')
  const marker = '/docs/product/prototypes/'
  const markerIndex = cleanPath.indexOf(marker)
  if (markerIndex >= 0) {
    return cleanPath.slice(markerIndex + marker.length)
  }
  return cleanPath
    .replace(/^\.{1,2}\//, '')
    .replace(/^(\.\.\/)+docs\/product\/prototypes\//, '')
}

function normalizeModuleValue(value) {
  if (typeof value === 'string') return value
  if (typeof value?.default === 'string') return value.default
  return ''
}

export function buildDevPrototypeItems({
  htmlModules = {},
  imageModules = {},
} = {}) {
  const htmlByPath = new Map(
    Object.entries(htmlModules).map(([modulePath, moduleValue]) => [
      normalizePrototypeModulePath(modulePath),
      normalizeModuleValue(moduleValue),
    ])
  )
  const imageByPath = new Map(
    Object.entries(imageModules).map(([modulePath, moduleValue]) => [
      normalizePrototypeModulePath(modulePath),
      normalizeModuleValue(moduleValue),
    ])
  )

  return DEV_PROTOTYPE_ASSETS.map((asset) => {
    const isHtml = asset.type === 'HTML'
    const source = isHtml ? htmlByPath.get(asset.assetPath) || '' : ''
    const url = isHtml ? '' : imageByPath.get(asset.assetPath) || ''
    return {
      ...asset,
      source,
      url,
      available: isHtml ? Boolean(source) : Boolean(url),
      searchText: [
        asset.title,
        asset.type,
        asset.directory,
        asset.assetPath,
        asset.readmePath,
        asset.description,
        asset.appliesTo,
        ...asset.statuses,
      ]
        .join(' ')
        .toLowerCase(),
    }
  })
}

export function filterDevPrototypeItems(
  items = [],
  { status = DEV_PROTOTYPE_FILTERS.ALL, keyword = '' } = {}
) {
  const query = String(keyword || '')
    .trim()
    .toLowerCase()
  return items.filter((item) => {
    const statuses = item.statuses || []
    const filter = String(status || DEV_PROTOTYPE_FILTERS.ALL)
    const statusMatched =
      filter === DEV_PROTOTYPE_FILTERS.ALL ||
      (filter === DEV_PROTOTYPE_FILTERS.CURRENT &&
        statuses.includes(DEV_PROTOTYPE_STATUSES.CURRENT)) ||
      (filter === DEV_PROTOTYPE_FILTERS.TO_IMPLEMENT &&
        statuses.includes(DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT)) ||
      (filter === DEV_PROTOTYPE_FILTERS.REFERENCE &&
        !statuses.includes(DEV_PROTOTYPE_STATUSES.CURRENT) &&
        !statuses.includes(DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT))
    const keywordMatched = !query || item.searchText?.includes(query)
    return statusMatched && keywordMatched
  })
}

export function normalizeDevPrototypeStatusFilter(
  status = DEV_PROTOTYPE_FILTERS.ALL
) {
  const filter = String(status || DEV_PROTOTYPE_FILTERS.ALL)
  return DEV_PROTOTYPE_FILTER_OPTIONS.some((option) => option.value === filter)
    ? filter
    : DEV_PROTOTYPE_FILTERS.ALL
}

export function normalizeDevPrototypeSelectedKey(selectedKey = '', items = []) {
  const fallbackKey = items[0]?.key || ''
  const itemKey = String(selectedKey || '')
  if (!itemKey) return fallbackKey
  return items.some((item) => item.key === itemKey) ? itemKey : fallbackKey
}

export function normalizeDevPrototypePinnedKeys(pinnedKeys = [], items = []) {
  if (!Array.isArray(pinnedKeys)) return []

  const availableKeys = new Set(items.map((item) => item.key))
  const normalized = []
  const seen = new Set()
  pinnedKeys.forEach((key) => {
    const itemKey = String(key || '')
    if (!itemKey || !availableKeys.has(itemKey) || seen.has(itemKey)) return
    normalized.push(itemKey)
    seen.add(itemKey)
  })
  return normalized
}

export function applyDevPrototypePinnedState(items = [], pinnedKeys = []) {
  const normalizedPinnedKeys = normalizeDevPrototypePinnedKeys(
    pinnedKeys,
    items
  )
  const pinnedRankByKey = new Map(
    normalizedPinnedKeys.map((key, index) => [key, index])
  )

  return items
    .map((item, index) => {
      const pinnedRank = pinnedRankByKey.get(item.key)
      return {
        ...item,
        pinned: pinnedRank !== undefined,
        pinnedRank: pinnedRank ?? Number.POSITIVE_INFINITY,
        originalIndex: index,
      }
    })
    .sort((left, right) => {
      if (left.pinned && right.pinned) return left.pinnedRank - right.pinnedRank
      if (left.pinned) return -1
      if (right.pinned) return 1
      return left.originalIndex - right.originalIndex
    })
}

export function groupDevPrototypeItemsByDirectory(items = []) {
  const groups = []
  const groupByDirectory = new Map()

  items.forEach((item) => {
    const directory = item.directory || '(未归类)'
    let group = groupByDirectory.get(directory)
    if (!group) {
      group = {
        key: directory,
        directory,
        items: [],
      }
      groupByDirectory.set(directory, group)
      groups.push(group)
    }
    group.items.push(item)
  })

  return groups
}

export function normalizeDevPrototypeExpandedGroupKeys(
  expandedGroupKeys = [],
  availableGroupKeys = []
) {
  if (!Array.isArray(expandedGroupKeys)) return []

  const availableKeys = new Set(availableGroupKeys)
  const normalized = []
  const seen = new Set()
  expandedGroupKeys.forEach((key) => {
    const groupKey = String(key || '')
    if (!groupKey || !availableKeys.has(groupKey) || seen.has(groupKey)) return
    normalized.push(groupKey)
    seen.add(groupKey)
  })
  return normalized
}
