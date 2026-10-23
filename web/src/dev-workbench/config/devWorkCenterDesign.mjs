import { getWorkflowTaskIdentityPresentation, getWorkflowTaskIdentityCode } from '../../erp/utils/workflowTaskIdentity.mjs'
import { getWorkflowTaskDisplayName } from '../../erp/utils/processRuntimePresentation.mjs'
import { formatWorkflowTaskSource } from '../../erp/utils/dashboardTaskDisplay.mjs'
import { progressDelivery } from '../../erp/utils/businessProgress.mjs'
import { WorkflowTaskStatus } from '../../common/consts/statuses.generated.mjs'
import { getWorkflowTaskAssigneeLabel } from '../../erp/utils/workflowTaskEventPresentation.mjs'
import { getRoleDisplayName } from '../../erp/utils/roleKeys.mjs'

const note = (key, title, shows, when, why) => Object.freeze({ key, title, shows, when, why })
const topic = (key, title, description, points, sources, devices = ['desktop', 'mobile']) => Object.freeze({
  key, title, description, points: Object.freeze(points), sources: Object.freeze(sources.map((path) => `web/src/erp/${path}`)), devices: Object.freeze(devices),
})

export const WORK_CENTER_DESIGN_TOPICS = Object.freeze([
  topic('task-cards', '任务卡片怎样统一', '先看要办什么，再核对产品、来源、责任与期限。', [
    note('identity', '任务标题为什么固定显示办理事项？', '每项主标题始终显示要办理的事项，右上角显示任务状态；产品或物料放在下方关联信息区。', '有产品、无产品、多项关联、资料缺失和受阻任务都遵循同一顺序；无关联时保留同尺寸图标和“未关联产品／物料”语义占位；常规条目等高，长文本或异常自然增高。', '同一产品可能同时需要确认颜色和补齐资料，固定的任务标题能直接区分要做的事，避免每一行换一种读法。'),
    note('references', '产品、编号和关联数量怎样读？', '产品或物料名称用于认出对象；有效编号和关联订单用于精确核对。产品按款数、物料按种数、混合关联按项数标明；点击数量查看完整关联清单。', '有真实编号才显示编号，已关联但编号缺失时明确提示；关联按唯一对象计数，同款跨订单的完整记录仍在清单中保留，采购明细条数单独说明；关联计数不表示产品件数，模拟造数序号不放在办理事项后面。', '把对象与动作分开，避免将括号数字误读成数量；来源失效时清除旧图、名称与编号，直接提示不可用。'),
    note('responsibility', '“未指定办理人”和姓名分别表示什么？', '“业务 · 未指定办理人”表示业务岗位尚未确定具体办理人；“业务 · 示例业务员”表示已指定的办理人。来源按实际关联显示。', '责任依据真实指派状态；已指定人员但姓名缺失时显示“已指定办理人”，不能误写为“未指定办理人”。业务来源显示类型与单号；独立任务显示“未关联业务单据”。', '来源回答从哪里来，责任回答谁接着办；两者各占固定位置，不把人名和业务状态拼成一句。'),
    note('attention', '任务状态、受阻原因和期限怎样区分？', '任务状态显示一次，到期提醒不替代任务状态；原因说明当前缺什么，底部时间说明何时到期及是否超期。', '时间位置始终保留：待办无期限显示“未设置截止”，已办缺少结束时间显示“结束时间未记录”；非法时间提示待核对。原因按实际内容出现，所属业务状态另列，受阻与超期可以同时存在。', '核心字段缺值有明确提示，能区分未填写和没有读取到信息；手机版与电脑版保持同一含义，长文本和异常自然增高。'),
  ], ['mobile/components/MobileTaskListScreen.jsx', 'components/workflow/WorkflowTaskIdentity.jsx', 'components/workflow/WorkflowDashboardViews.jsx', 'utils/workflowTaskIdentity.mjs']),
  topic('task-handling', '办理信息为什么这样排', '身份、当前责任、可用动作和说明分层，避免边填边猜。', [
    note('context', '上方这一组先确认什么？', '任务名、来源、办理人和截止共同标识这一次办理，产品摘要只辅助识别。', '从待办或追踪进入，始终核对同一个任务；看得见任务不表示有权办理。', '先确认对象与当前责任，再接触输入，减少在相似订单或多产品任务中办错对象。'),
    note('action', '为什么先选处理方式，再填意见？', '动作决定意见的名称、必填条件和附加输入，例如退回原因、转交接收人、审批批准量。', '只显示当前状态和权限允许的动作；批准量没有填写与填写 0 含义不同，按正式校验核对。', '把输入放在对应动作下面，减少无关字段；限制和错误贴着相关输入，避免来回找原因。'),
    note('submit', '为什么主操作集中在下方？', '手机在底部集中放附件和当前主操作；电脑在办理容器内保留明确的提交与返回。', '提交中锁定操作；失败保留可修正输入，结果未知先核对，不能当作失败立即再提交。', '长内容滚动时仍能找到下一步，辅助动作按需查看；完整交互仍在“可交互设计”中演示。'),
  ], ['components/workflow/WorkflowTaskActionDrawer.jsx', 'mobile/components/MobileTaskActionScreen.jsx']),
  topic('work-progress', '进度数字应该怎样读', '先分清交付和生产，再读分子、分母与单位。', [
    note('identity', '卡片上方标识哪一笔业务？', '产品、单号、业务状态、客户和交期共同定位当前订单或生产执行。', '多产品保留多项标识，未定交期明确说明；任务截止不代替订单交期。', '先确定对象和时间，再比较完成量，避免把另一张单据或另一道工序的进度混进来。'),
    note('quantity', '720 / 1000 与 800 / 1000 分别是什么？', '订单交付读作已出货 / 订购；生产执行读作有效完工 / 计划。数量必须连同单位阅读。', '多单位、数量缺失或来源待核对时不显示汇总百分比；阶段百分比不平均成整单进度。', '把分子分母放在同一行，比孤立的百分比更容易核对；生产完工也不会被误认成已经出货。'),
    note('details', '阶段和关联任务为什么分开？', '资料确认、领料、生产与质检分别说明做到哪一步，关联任务说明还有什么需要接手。', '每个阶段保留自身单位与缺值；没有任务、没有查看权限和读取失败分别表达，不推造下一岗位。', '业务完成量与待办条目回答不同问题，分组呈现，避免把“办完了几个任务”当作整单完成比例。'),
  ], ['utils/businessProgress.mjs', 'components/business-visualizations/BusinessProgressDrawer.jsx', 'components/business-visualizations/useBusinessStatistics.jsx']),
  topic('work-tracking', '当前环节和历史怎样区分', '当前去向回答轮到谁，历史记录回答已经发生什么。', [
    note('summary', '事项名、岗位和发起人指向谁？', '事项名与来源单号识别整件流转，当前岗位与办理人说明现在轮到谁，发起人表示最初由谁发起。', '“我参与的”不等于“待我办理”；发起人与当前办理人不互相替代。', '先定位事项与当前去向，发起信息退居辅助位置，避免把历史参与者当作下一位处理人。'),
    note('flow', '这些节点为什么不能当作完整订单流水线？', '默认聚焦本任务的真实处理链，已结束、当前和待满足条件的步骤分别表达。', '只有明确关联的步骤才连接；同订单的并列任务不自动形成先后关系，完整订单流程按需打开。', '先解释眼前卡在哪里，把较长的全流程留给下钻，避免单项详情被整单任务淹没。'),
    note('history', '处理记录为什么另放一组？', '处理记录展示实际动作、办理人、时间、意见及状态变化，较近的结果优先阅读。', '记录来自已保存事件，不按当前节点推造历史；读取失败和没有记录分开提示。', '流程是结构，记录是事实经过；分开阅读才能同时看懂当前位置和最近一次交接。'),
  ], ['components/workflow/WorkflowTrackingPanel.jsx', 'components/workflow/WorkflowTaskHandlingChain.jsx', 'components/workflow/WorkflowTaskEventTrail.jsx']),
  topic('work-exceptions', '异常为什么单独强调', '先说明卡点与责任，再看已有处理和解除条件。', [
    note('reason', '醒目的那句话说明什么？', '异常名称识别事项，原因直接说明卡在哪里、影响什么，以及还缺哪些资料或支持。', '受阻、超时与其他风险分别表达；不能仅凭任务名猜测原因。', '把阻碍继续办理的信息放在前面，使用者无需翻历史才能知道为什么不能推进。'),
    note('owner', '责任与来源为什么紧跟原因？', '来源定位需要核对的业务，当前责任岗位和办理人说明应该由谁继续处理。', '责任取当前任务与异常记录；历史处理人不自动成为当前责任人。', '原因后面接对象和责任，能直接形成“什么问题、找谁处理”的阅读顺序。'),
    note('recovery', '解除条件与处理历史为什么都保留？', '历史说明已经采取的措施，解除条件说明还需满足什么，以及当前允许的动作。', '只有有权限且条件满足时才可解除；异常解除不等于任务、实际出货或库存入账已完成。', '把过去的处理与下一步分开，避免把一句“已回复”误认为异常已经结束。'),
  ], ['components/workflow/WorkflowExceptionPanel.jsx', 'mobile/components/MobileWorkflowExceptionPanel.jsx']),
  topic('work-results', '怎样读懂办理结果', '先确认结果可信，再核对同一任务、本次影响和下一步。', [
    note('result', '为什么要区分三种回执？', '“已确认”表示取得明确结果；“未完成”保留输入供修正；“结果待确认”表示暂时不知道是否已经处理成功。', '结果待确认先重读或核对，不能画成成功，也不能直接重复提交。', '把结果性质放在首位，使用者先知道该继续、修正还是等待核对。'),
    note('effect', '任务已完成，为什么还要写影响范围？', '同一任务的本次动作、办理人和处理时间用于核对；影响范围说明改变了协同任务还是正式业务记录。', '任务完成、审批通过、异常解除分别按真实回执解释，不自动表示已出货、入库或收付款。', '先确认“这是谁的哪次结果”，再明确结果边界，防止成功提示被理解成整件业务都结束。'),
    note('next', '返回和继续查看为什么放在最后？', '根据当前结果提供返回原列表、查看任务、修正或核对结果的适用入口。', '返回保留原查询和定位；另一任务的结果与草稿不能带进当前任务。', '读完结果再决定下一步，避免重复放多个同等显眼的按钮，让恢复路径更明确。'),
  ], ['mobile/components/MobileTaskReceiptScreen.jsx', 'components/workflow/WorkflowTaskActionDrawer.jsx']),
  topic('work-overview', '工作台、日历与数量', '工作台看优先事项，任务管理查全量，日历按任务截止组织。', [
    note('counts', '几个数量为什么不能直接相加？', '待我处理、审批、受阻或超时表示不同范围，同一任务可能落入多个范围。', '数量跟随账号、权限和当前查询；任务数不等于订单数、产品数或数量。', '用少量入口找需要先处理的事项；完整筛选与责任追踪集中在任务管理，避免维护两套任务。'),
    note('calendar', '日历里的日期是哪一种？', '日历按任务截止日期组织，选定日期后查看当天可见任务；订单交期在进度页另读。', '没有任务截止的事项不补造日期，仍可从列表查询。', '日期是另一种找任务的方式，不取代任务列表，也不把业务交期和办理期限混为一谈。'),
  ], ['components/workflow/WorkflowDashboardViews.jsx', 'components/workflow/WorkflowTaskCalendar.jsx']),
  topic('mobile-entry', '我的、岗位与换端', '账号、当前岗位、显示设置和工作入口各自承担不同职责。', [
    note('account', '姓名与岗位为什么放在一起？', '姓名识别当前账号，岗位说明当前工作视角；查看权限和可办理动作仍按有效授权核对。', '切换岗位不改变账号身份，也不凭岗位名称补造权限。', '先确认“我是谁、正在以哪个岗位工作”，避免把切换岗位误认为切换账号。'),
    note('entry', '显示设置和切换入口为什么分组？', '外观只改变阅读方式；“切换工作入口”用于进入电脑或手机界面，版本信息供核对运行版本。', '手机日常导航留在手机；完整来源单据在电脑查看，换端有明确入口。', '把常用阅读设置与工作方式分开，避免一次普通查看就意外离开手机任务。'),
  ], ['mobile/components/MobileTaskListScreen.jsx'], ['mobile']),
])

const product = { kind: 'product', name: '示例毛绒狐狸', code: 'DEMO-CP-001', order_no: 'DEMO-XD-001' }
const products = [product, { kind: 'product', name: '示例星星挂兔', code: 'DEMO-CP-002' }, { kind: 'product', name: '示例草莓小熊', code: 'DEMO-CP-003' }]
const material = { kind: 'material', name: '示例黑色塑料眼', code: 'DEMO-WL-001', supplier_item_no: 'EY-08' }
export const DESIGN_TASK_NOW = Date.parse('2026-10-21T09:00:00+08:00')
const designTask = (entry) => ({ owner_role_key: 'sales', task_status_key: WorkflowTaskStatus.READY, created_at: DESIGN_TASK_NOW / 1000, group: 'common', ...entry })
const context = (sourceNo, items) => ({ available: true, source_no: sourceNo, items })
export const DESIGN_TASK_GROUPS = Object.freeze([{ value: 'common', label: '常规条目' }, { value: 'missing', label: '异常与缺值' }])
export const DESIGN_TASKS = Object.freeze([
  designTask({ id: 'product', task_name: '准备并办理发货', source_type: 'shipment', source_no: 'DEMO-CK-001', assignee_id: 31, discovery: { assignee_name: '示例业务员' }, due_at: Date.parse('2026-10-24T17:00:00+08:00') / 1000, display_context: context('DEMO-CK-001', [product]) }),
  designTask({ id: 'multi', task_name: '核对多款产品发货资料', source_type: 'shipment', source_no: 'DEMO-CK-003', display_context: context('DEMO-CK-003', products) }),
  designTask({ id: 'material', task_name: '核对辅料到货差异', source_type: 'purchase_order', source_no: 'DEMO-CG-008', owner_role_key: 'warehouse', display_context: { ...context('DEMO-CG-008', [material]), source_line_count: 1 } }),
  designTask({ id: 'mixed', task_name: '核对包装齐套资料', source_type: 'production_order', source_no: 'DEMO-SC-021', owner_role_key: 'pmc', display_context: context('DEMO-SC-021', [product, { ...material, name: '示例配套礼盒', code: 'DEMO-WL-002', supplier_item_no: 'BOX-08' }]) }),
  designTask({ id: 'task', task_name: '核对收款说明', source_type: 'finance_payment', source_no: 'DEMO-SK-002', owner_role_key: 'finance', display_context: context('DEMO-SK-002', []) }),
  designTask({ id: 'blocked', group: 'missing', task_name: '确认颜色', task_status_key: WorkflowTaskStatus.BLOCKED, due_at: Date.parse('2026-10-16T22:39:00+08:00') / 1000, display_context: context('', [{ kind: 'product', name: '示例星星挂兔', code: '' }]), reason: '客户尚未确认产品颜色。' }),
  designTask({ id: 'customer', group: 'missing', task_name: '补齐客户资料', source_type: 'sales_order', source_no: 'DEMO-XD-004', assignee_id: 31, discovery: { assignee_name: '' }, display_context: context('DEMO-XD-004', [{ kind: 'product', name: '', code: '' }]) }),
  designTask({ id: 'long', group: 'missing', task_name: '核对联名周年限定礼盒的包装与交付资料', source_type: 'sales_order', source_no: 'DEMO-XD-2026-OVERSEAS-031', display_context: context('DEMO-XD-2026-OVERSEAS-031', [{ kind: 'product', name: '森林系列刺绣公仔与可拆卸背包配件套装', code: 'DEMO-CP-2026-OVERSEAS', order_no: 'DEMO-XD-2026-OVERSEAS-031' }, ...products]) }),
  designTask({ id: 'unavailable', group: 'missing', task_name: '决定质量异常处理方案', source_type: 'production_wip_batch', source_no: 'DEMO-WIP-OLD', display_context: { available: false, source_no: 'DEMO-WIP-OLD', items: [product] } }),
  designTask({ id: 'ended-undated', group: 'missing', task_name: '核对收款说明', task_status_key: WorkflowTaskStatus.DONE, source_type: 'finance_payment', display_context: context('DEMO-SK-003', []) }),
  designTask({ id: 'invalid-date', group: 'missing', task_name: '核对交付时间', due_at: 'invalid', display_context: context('', []) }),
])
export function designTaskPresentation(task) {
  const identity = getWorkflowTaskIdentityPresentation(task)
  const first = identity.available ? identity.first : null
  const assignee = getWorkflowTaskAssigneeLabel(task)
  return {
    title: getWorkflowTaskDisplayName(task),
    productName: first ? first.name || `${first.kind === 'material' ? '物料' : '产品'}名称未填写` : '',
    count: first ? identity.compactCountLabel : '',
    reference: first ? getWorkflowTaskIdentityCode(first) : '',
    order: first?.orderNo && first.orderNo !== identity.sourceNo ? first.orderNo : '',
    available: identity.available,
    hasProduct: Boolean(first),
    source: formatWorkflowTaskSource(task),
    responsibility: `${getRoleDisplayName(task.owner_role_key, '岗位待确认')} · ${assignee}`,
  }
}
export const DESIGN_PROGRESS = Object.freeze([
  { key: 'orders', title: '示例毛绒狐狸', code: 'DEMO-XD-001', meta: '示例客户 · 10 月 24 日交付', view: 'orders', delivery_known: true, ordered_quantity: '1000', shipped_quantity: '720', unit: '只' },
  { key: 'production', title: '车缝 · 示例星星挂兔', code: 'DEMO-SC-002', meta: '当前工序 · 执行中', view: 'production', ordered_quantity: '1000', completed_quantity: '800', unit: '只' },
  { key: 'mixed', title: '多单位订单', code: 'DEMO-XD-003', meta: '多项产品 · 交期尚未确定', view: 'orders', delivery_known: true, ordered_quantity: null, shipped_quantity: null },
  { key: 'missing', title: '', code: '', view: 'orders', delivery_known: false, ordered_quantity: null, shipped_quantity: null, customer: '', sales_owner: '', due_date: '', product_count: 0 },
].map((entry) => Object.freeze({ product_id: 0, product_count: entry.key === 'mixed' ? 3 : 1, status: 'draft', active: true, customer: '示例客户', due_date: entry.key === 'mixed' ? '' : '2026-10-24', open_tasks: 0, sales_owner: '示例业务员', ...entry, product: entry.title, order_no: entry.code, delivery: progressDelivery(entry) })))
export function getWorkCenterDesignTopic(key) {
  return WORK_CENTER_DESIGN_TOPICS.find((item) => item.key === key) || WORK_CENTER_DESIGN_TOPICS[0]
}
export function getWorkCenterDesignHref(key = 'task-cards', device = 'desktop') {
  const params = new URLSearchParams({ view: 'specification', topic: getWorkCenterDesignTopic(key).key })
  if (device === 'mobile') params.set('page', 'mobile-tasks')
  return `/__dev/ui-design?${params}`
}
