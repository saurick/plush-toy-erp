#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { yoyoosunMenuConfig } from "../../config/customers/yoyoosun/menuConfig.mjs";
import { yoyoosunRoleFlowMatrix } from "../../config/customers/yoyoosun/roleFlowMatrix.mjs";
import { businessModuleDefinitions } from "../../web/src/erp/config/businessModules.mjs";
import {
  getNavigationSections,
  navigationItemRegistry,
  roleWorkbenches,
} from "../../web/src/erp/config/seedData.mjs";
import { printTemplateCatalog } from "../../web/src/erp/config/printTemplates.mjs";
import {
  PRINT_WORKSPACE_DRAFT_MODE,
  buildPrintWorkspacePath,
  isSupportedPrintWorkspaceTemplate,
} from "../../web/src/erp/utils/printWorkspace.js";

const EXPECTED_DESKTOP_PAGE_COUNT = 29;
const EXPECTED_MOBILE_PAGE_COUNT = 9;
const EXPECTED_PRINT_TEMPLATE_COUNT = 5;
const FORMAL_TRIAL_ACCOUNT_COUNT = 10;

export const MANUAL_ACCEPTANCE_SHIPMENT_FACT_COUNT = 47;
export const MANUAL_ACCEPTANCE_SHIPMENT_LONG_RECORD_COUNT = 1;
export const MANUAL_ACCEPTANCE_SHIPMENT_LONG_RECORD_LINE_COUNT = 25;

export const MANUAL_ACCEPTANCE_ROLE_TASK_SCENARIOS = Object.freeze({
  boss: Object.freeze([
    "delivery_review",
    "quotation_review",
    "delay_risk",
    "customer_requirement",
    "priority_order",
  ]),
  sales: Object.freeze([
    "customer_details",
    "color_confirmation",
    "packaging_confirmation",
    "delivery_address",
    "delivery_date_reply",
  ]),
  purchase: Object.freeze([
    "main_material_arrival",
    "accessory_delivery",
    "supplier_reply",
    "purchase_quantity",
    "expedite_material",
  ]),
  production: Object.freeze([
    "today_production",
    "outsourcing_return",
    "rework",
    "production_exception",
  ]),
  warehouse: Object.freeze([
    "receiving",
    "inbound",
    "material_picking",
    "shipping",
    "exception",
  ]),
  finance: Object.freeze([
    "customer_receipt",
    "supplier_statement",
    "invoice_details",
    "overdue_receivable",
    "weekly_payment",
  ]),
  pmc: Object.freeze([
    "material_readiness",
    "order_priority",
    "delay_risk",
    "production_readiness",
    "open_item_followup",
  ]),
  quality: Object.freeze([
    "incoming_inspection",
    "first_article",
    "rework_inspection",
    "pre_shipment_inspection",
    "appearance_issue",
  ]),
  engineering: Object.freeze([
    "material_list",
    "drawing_dimensions",
    "sewing_instructions",
    "packaging_information",
    "first_article_requirements",
  ]),
});
const SYSTEM_ADMIN_ROLE_KEY = "system_admin";
const CUSTOMER_ROLE_LABELS = Object.freeze({
  pmc: "生产计划",
});
const SOURCE_FILES = Object.freeze([
  "web/src/erp/config/businessModules.mjs",
  "web/src/erp/config/seedData.mjs",
  "config/customers/yoyoosun/menuConfig.mjs",
  "config/customers/yoyoosun/roleFlowMatrix.mjs",
  "web/src/erp/config/printTemplates.mjs",
  "web/src/erp/router.jsx",
  "web/src/erp/utils/printWorkspace.js",
]);

const ENTRY_PLANS = Object.freeze({
  "admin-login": {
    isList: false,
    minimumRecords: FORMAL_TRIAL_ACCOUNT_COUNT,
    minimumRecordUnit: "正式岗位试用账号（另验异常登录场景）",
    keyStates: ["十个正式岗位账号", "停用账号场景", "密码错误", "信息未填完整"],
    whatToDo: [
      "你要分别用十个正式岗位试用账号登录，再按验收安排核对一个停用账号场景。",
      "你要在信息未填完整时直接提交，再补齐信息重新登录。",
    ],
    whatToSee: [
      "应看到正常账号按已授权工作入口直接进入，错误密码、停用账号和未填完整信息都有清楚的中文提示。",
      "应看到提示只说明下一步怎么处理，不出现看不懂的英文异常或内部编号。",
    ],
  },
  entry: {
    isList: false,
    minimumRecords: FORMAL_TRIAL_ACCOUNT_COUNT,
    minimumRecordUnit: "正式岗位试用账号（另验停用与多岗位场景）",
    keyStates: [
      "九个岗位任务端账号",
      "一个后台管理账号",
      "停用账号场景",
      "多岗位场景",
      "无可用入口场景",
    ],
    whatToDo: [
      "你要用十个正式岗位试用账号逐一进入系统，核对各自可见的桌面后台或岗位任务端。",
      "你要按验收安排另行核对停用、多岗位和无可用入口场景，再退出并重新进入一次。",
    ],
    whatToSee: [
      "应看到每个账号只出现自己可以使用的入口，不会出现无关岗位。",
      "应看到进入后的公司名称、系统名称和岗位名称一致，返回入口时不会丢失登录状态。",
    ],
  },
});

const DESKTOP_PLANS = Object.freeze({
  "global-dashboard": {
    isList: false,
    minimumRecords: 18,
    minimumRecordUnit: "当前账号可见事项",
    keyStates: ["今日待处理", "临近到期", "已经阻塞", "需要关注", "暂无提醒"],
    whatToDo: [
      "你要查看今日重点、临近到期和阻塞事项，再从卡片进入对应页面。",
      "你要对照任务看板和业务页面抽查数量，确认刷新后数字仍一致。",
    ],
    whatToSee: [
      "应看到最需要处理的事项排在前面，名称、单号、岗位和到期时间都能直接看懂。",
      "应看到卡片数字与进入后的清单一致；没有提醒时显示清楚的空白说明。",
    ],
  },
  "business-dashboard": {
    isList: false,
    minimumRecords: 20,
    minimumRecordUnit: "可查看的业务记录与待办事项",
    keyStates: ["基础资料", "业务单据", "办理结果", "需要关注", "暂不可用"],
    whatToDo: [
      "你要查看基础资料、业务单据、办理结果和需要关注四类数字，再打开几项业务明细。",
      "你要对照进入后的页面数量，确认刷新后数字和可用状态仍一致。",
    ],
    whatToSee: [
      "应看到每类数字各自统计，客户、订单、生产、出货和待办等项目都有可以核对的数量。",
      "应看到数字暂不可用时有清楚说明，不会把不同类别直接相加或显示内部字段。",
    ],
  },
  "task-board": {
    isList: true,
    minimumRecords: 20,
    minimumRecordUnit: "当前账号可见岗位任务（九个岗位合计 180 条）",
    keyStates: ["可执行", "临近到期", "已阻塞", "已退回", "已完成", "已逾期"],
    whatToDo: [
      "你要按岗位、状态和到期时间筛选任务，并打开几条长标题和多次处理记录。",
      "你要完成一条任务、阻塞一条任务并填写原因，再恢复到原来的筛选条件。",
    ],
    whatToSee: [
      "应看到筛选结果、数量和当前条件一致，长标题不会盖住按钮或相邻内容。",
      "应看到每次处理都有明确结果和时间；需要填写原因时不能空着提交。",
    ],
  },
  customers: {
    isList: true,
    minimumRecords: 60,
    minimumRecordUnit: "客户档案",
    keyStates: ["启用", "停用", "有联系人", "无联系人", "名称较长"],
    whatToDo: [
      "你要按客户名称、编号和状态查找，打开有联系人和无联系人的档案。",
      "你要新建一条试用客户，修改联系人和联系电话，再停用并重新启用。",
    ],
    whatToSee: [
      "应看到列表、详情和编辑后的名称及联系人一致，空白选填项不会被补成假内容。",
      "应看到停用客户仍可查历史资料，但不会被误认为仍在正常合作。",
    ],
  },
  suppliers: {
    isList: true,
    minimumRecords: 60,
    minimumRecordUnit: "供应商或加工厂档案",
    keyStates: ["启用", "停用", "材料供应商", "加工厂", "多联系人"],
    whatToDo: [
      "你要按名称、编号、类型和状态查找供应商与加工厂。",
      "你要新建一条试用供应商，修改联系人、电话和邮箱，再停用并重新启用。",
    ],
    whatToSee: [
      "应看到供应商与加工厂名称、联系人、电话和邮箱在列表与详情中保持一致。",
      "应看到停用记录仍能用于查阅历史单据，但新业务选择时有清楚提示。",
    ],
  },
  products: {
    isList: true,
    minimumRecords: 20,
    minimumRecordUnit: "产品档案（合计至少 60 个规格）",
    keyStates: ["启用", "停用", "多颜色", "多尺码", "有条码", "资料不完整"],
    whatToDo: [
      "你要按产品编号、名称、颜色、尺码和条码查找，并打开同一产品的多个规格。",
      "你要新增一个试用规格，修改包装版本，再停用并重新启用。",
    ],
    whatToSee: [
      "应看到产品与规格归属清楚，同一产品的颜色、尺码和包装版本不会串到别的产品。",
      "应看到缺少选填资料时保持空白，不显示内部编号或猜测出来的内容。",
    ],
  },
  materials: {
    isList: true,
    minimumRecords: 80,
    minimumRecordUnit: "材料档案",
    keyStates: ["启用", "停用", "不同分类", "不同规格", "不同颜色", "长名称"],
    whatToDo: [
      "你要按材料编号、名称、分类、规格、颜色和状态组合查找。",
      "你要新增一条试用材料，修改默认单位，再停用并重新启用。",
    ],
    whatToSee: [
      "应看到筛选条件和结果一致，材料名称、规格、颜色和单位不会互相串值。",
      "应看到长名称可以完整查看，停用状态清楚但历史引用仍可识别。",
    ],
  },
  "sales-orders": {
    isList: true,
    minimumRecords: 45,
    minimumRecordUnit: "销售订单",
    keyStates: ["草稿", "已提交", "执行中", "已关闭", "已取消", "多明细"],
    whatToDo: [
      "你要按客户、订单号、状态和日期查找，并打开包含多种产品规格的订单。",
      "你要新建草稿、增删明细、修改数量与交期，再提交一张订单。",
    ],
    whatToSee: [
      "应看到客户、产品、数量、单位、交期和金额在列表、详情与编辑界面一致。",
      "应看到提交后的状态和可操作按钮符合当前进度，不会因为提交就显示已经出货或已经收款。",
    ],
  },
  "material-bom": {
    isList: true,
    minimumRecords: 45,
    minimumRecordUnit: "产品结构版本",
    keyStates: ["草稿", "当前生效", "已归档", "多版本", "长材料清单"],
    whatToDo: [
      "你要按产品和版本查找，比较同一产品的草稿、生效和归档版本。",
      "你要复制一个版本，修改材料用量与损耗，再将确认版本设为当前生效。",
    ],
    whatToSee: [
      "应看到每个版本的材料、用量、损耗和状态清楚，同一产品只有一个当前生效版本。",
      "应看到复制后修改不会改变旧版本，长材料清单仍可顺畅查看和编辑。",
    ],
  },
  processes: {
    isList: true,
    minimumRecords: 30,
    minimumRecordUnit: "加工环节档案",
    keyStates: ["启用", "停用", "可委外", "可内制", "需要质检"],
    whatToDo: [
      "你要按环节编号、名称、类别和状态查找。",
      "你要新增一个试用环节，切换委外、内制和质检标记，再停用并重新启用。",
    ],
    whatToSee: [
      "应看到环节名称和各项适用标记清楚，筛选结果与所选条件一致。",
      "应看到停用环节仍可查历史资料，但不会被误认为仍可用于新业务。",
    ],
  },
  "accessories-purchase": {
    isList: true,
    minimumRecords: 45,
    minimumRecordUnit: "采购订单",
    keyStates: ["草稿", "已提交", "已批准", "已关闭", "已取消", "临近到货"],
    whatToDo: [
      "你要按供应商、采购单号、状态和到货日期查找，并打开材料较多的订单。",
      "你要新建草稿、增删材料明细、修改数量与单价，提交后再打开采购合同。",
    ],
    whatToSee: [
      "应看到供应商、材料、数量、单位、单价、金额和到货日期在各处一致。",
      "应看到提交或批准只改变采购进度，不会提前显示已经入库或已经付款。",
    ],
  },
  "quality-inspections": {
    isList: true,
    minimumRecords: 54,
    minimumRecordUnit: "来料质检记录",
    keyStates: ["草稿", "已提交", "合格", "不合格", "已取消", "批次暂缓"],
    whatToDo: [
      "你要按供应商、材料、批次、判定和日期查找，打开合格与不合格记录。",
      "你要新建一条试用质检，填写抽检数量、判定和原因，再查看批次状态。",
    ],
    whatToSee: [
      "应看到来料来源、材料、批次、抽检数量、判定和原因完整且前后一致。",
      "应看到不合格或冻结状态醒目，处理质检不会被误显示成已经退货或库存已经变化。",
    ],
  },
  inbound: {
    isList: true,
    minimumRecords: 54,
    minimumRecordUnit: "采购入库记录",
    keyStates: [
      "草稿待检",
      "已提交待判定",
      "质检通过并已入库",
      "质检拒收",
      "质检已取消",
      "入库已取消并冲回",
    ],
    whatToDo: [
      "你要按供应商、采购单号、入库单号、状态和日期查找，并打开多批次记录。",
      "你要从采购订单准备一张试用入库草稿，核对材料、数量、仓库和批次。",
    ],
    whatToSee: [
      "应看到采购来源、材料、数量、仓库、批次和当前进度清楚，缺少来源时不会补造单号。",
      "应看到只有质检通过并确认入库后才显示库存已更新，取消入库后保留可追查的冲回记录。",
    ],
  },
  inventory: {
    isList: true,
    minimumRecords: 45,
    minimumRecordUnit: "库存余额、批次与流水",
    keyStates: [
      "有库存",
      "有预留",
      "可用量不足",
      "冻结批次",
      "多仓库",
      "多规格",
    ],
    whatToDo: [
      "你要按产品或材料、仓库、批次和日期查找，并切换余额、批次与流水查看。",
      "你要抽查有预留、可用量不足、冻结批次和同品多仓的记录。",
    ],
    whatToSee: [
      "应看到现存量、已预留、可用量、仓库、批次和单位关系清楚，数字可以相互核对。",
      "应看到不同产品规格和仓库不会合并错位，页面只提供查询，不出现直接改库存的入口。",
    ],
  },
  "processing-contracts": {
    isList: true,
    minimumRecords: 45,
    minimumRecordUnit: "委外订单",
    keyStates: ["草稿", "已提交", "已确认", "已关闭", "已取消", "临近回货"],
    whatToDo: [
      "你要按加工厂、合同号、状态和回货日期查找，并打开工序较多的订单。",
      "你要新建草稿、增删工序明细、修改数量与单价，确认内容后打开加工合同和作业指导书。",
    ],
    whatToSee: [
      "应看到加工厂、产品、工序、数量、单价、金额和回货日期在各处一致。",
      "应看到确认合同只表示委外内容已经确认，不会提前显示已经发料、回货、质检或付款。",
    ],
  },
  "production-orders": {
    isList: true,
    minimumRecords: 45,
    minimumRecordUnit: "生产订单",
    keyStates: [
      "草稿",
      "已发布",
      "已关闭",
      "已取消",
      "物料需求齐全",
      "物料需求待复核",
    ],
    whatToDo: [
      "你要按生产单号、来源订单、产品和状态查找，分别打开草稿、已发布、已关闭和已取消的生产订单。",
      "你要从一张资料齐全的已发布试用生产订单分别生成一笔领料草稿和一笔完工草稿，再到生产记录核对来源与数量。",
    ],
    whatToSee: [
      "应看到来源订单、产品、计划数量、物料需求、已处理数量和剩余数量前后一致，待复核需求不能办理领料。",
      "应看到领料和完工先生成待核对记录，只有在生产记录中过账后才会影响库存，重复办理不能超过剩余数量。",
    ],
  },
  "production-progress": {
    isList: true,
    minimumRecords: 45,
    minimumRecordUnit: "生产进度记录",
    keyStates: ["待处理", "已经登记", "已经取消", "领料", "成品入库", "返工"],
    whatToDo: [
      "你要按产品、订单、类型、状态和日期查找，分别打开领料、成品入库和返工记录。",
      "你要从正式生产任务、仓库业务操作形成的记录或已准备的试用记录中，核对数量、单位、仓库和备注。",
    ],
    whatToSee: [
      "应看到来源、产品、数量、单位、仓库和处理结果完整，本页不提供无来源的新建入口。",
      "应看到取消后的数量变化有相反记录可追查，原记录不会被直接抹掉。",
    ],
  },
  "production-scheduling": {
    isList: true,
    minimumRecords: 45,
    minimumRecordUnit: "生产订单发布后生成的排程协同任务",
    keyStates: ["可执行", "已完成"],
    whatToDo: [
      "你要按任务编号、状态、责任岗位和到期日期查找，打开正常排程、缺料、插单和延期任务。",
      "你要完成一条资料齐全的排程任务，阻塞一条缺料任务并填写具体原因，再催办一条临近到期任务。",
    ],
    whatToSee: [
      "应看到订单、产品、计划数量、交期、齐套情况、责任岗位和处理说明清楚，逾期与临期任务容易识别。",
      "应看到完成排程只表示协同安排已处理，不会提前显示已经领料、完工或入库。",
    ],
  },
  "production-exceptions": {
    isList: true,
    minimumRecords: 1,
    minimumRecordUnit: "返工取消后生成的生产异常协同任务",
    keyStates: ["已完成"],
    whatToDo: [
      "你要按任务编号、状态、责任岗位和到期日期查找，分别打开延期、返工、质量、设备和缺料异常。",
      "你要查看一条资料不足、等待补充的异常任务，并阻塞一条等待其他岗位处理的任务。",
    ],
    whatToSee: [
      "应看到异常来源、影响产品或订单、影响数量、发生时间、责任岗位、原因和下一步清楚可读。",
      "应看到完成异常协同不会直接修改生产、库存、出货或财务记录；返工和报废仍需在对应业务页面登记。",
    ],
  },
  "shipping-release": {
    isList: true,
    minimumRecords: 46,
    minimumRecordUnit: "出货单提交后生成的放行任务",
    keyStates: ["已完成"],
    whatToDo: [
      "你要按任务编号、状态、负责岗位和到期日期查找，打开数量、质检、箱唛、地址和出货时间等任务。",
      "你要核对一条资料齐全的放行任务，并查看阻塞、退回和已完成任务写明的原因或结果。",
    ],
    whatToSee: [
      "应看到客户、产品、数量、质检、包装和送货资料清楚，缺少什么可以直接看懂。",
      "应看到完成放行只表示可以继续办理出库，不能被误显示成已经出货、已经扣库存或已经收款。",
    ],
  },
  outbound: {
    isList: true,
    minimumRecords: 45,
    minimumRecordUnit: "库存预留记录",
    keyStates: [
      "生效中",
      "已释放",
      "库存充足",
      "库存不足提示",
      "多规格",
      "不同数量",
    ],
    whatToDo: [
      "你要按预留单号、产品、规格、仓库、状态和日期查找，打开生效中与已释放记录。",
      "你要从出货单处理形成的库存预留或已准备的试用记录中，对照库存台账核对预留量与可用量。",
    ],
    whatToSee: [
      "应看到预留数量与可用量关系清楚，预留不足时给出可执行的中文说明。",
      "应看到本页不提供无来源的新建入口，已释放预留也不会被显示成已经出库。",
    ],
  },
  shipments: {
    isList: true,
    minimumRecords: MANUAL_ACCEPTANCE_SHIPMENT_FACT_COUNT,
    minimumRecordUnit: "出货单",
    keyStates: [
      "草稿",
      "已出货",
      "已取消",
      "多产品规格",
      "多仓库",
      "25 条明细",
    ],
    whatToDo: [
      "你要按客户、销售订单、出货单号、状态和日期查找，并打开包含多产品规格、多仓库和 25 条明细的出货单。",
      "你要新建草稿、增删明细、核对仓库与数量，再确认一张具备条件的试用出货单。",
    ],
    whatToSee: [
      "应看到客户、来源订单、产品、规格、数量、仓库和出货日期前后一致。",
      "应看到只有确认出货后才显示已经出货；取消已出货记录时保留可追查的相反记录。",
    ],
  },
  reconciliation: {
    isList: true,
    minimumRecords: 45,
    minimumRecordUnit: "对账记录",
    keyStates: ["草稿", "已过账", "已结清", "已取消", "客户往来", "供应商往来"],
    whatToDo: [
      "你要按往来单位、对账单号、状态和日期查找，分别打开客户往来与供应商往来记录。",
      "你要比较金额、手续费和币种，再打开草稿、已过账、已结清和已取消记录。",
    ],
    whatToSee: [
      "应看到往来单位、金额、手续费、币种和状态清楚，金额合计可以核对；页面不显示没有来源依据的账期。",
      "应看到过账、结清或取消只改变当前记录进度，不会被显示成已经付款或已经收款。",
    ],
  },
  payables: {
    isList: true,
    minimumRecords: 45,
    minimumRecordUnit: "应付记录",
    keyStates: [
      "草稿",
      "已过账",
      "已结清",
      "已取消",
      "采购入库来源",
      "委外回货来源",
    ],
    whatToDo: [
      "你要按供应商、来源单号、状态和日期查找，分别打开采购入库与委外回货来源的记录。",
      "你要核对金额、手续费、币种和来源，再比较草稿、已过账、已结清和已取消记录。",
    ],
    whatToSee: [
      "应看到供应商、来源、金额、手续费、币种和状态清楚，无来源时不补造单号，也不显示猜测账期或发票类别。",
      "应看到应付过账不等于已经付款，结清和取消都有明确时间与结果。",
    ],
  },
  receivables: {
    isList: true,
    minimumRecords: 45,
    minimumRecordUnit: "应收记录",
    keyStates: [
      "草稿",
      "已过账",
      "已结清",
      "已取消",
      "收款分类明确",
      "标准与自定义账期",
    ],
    whatToDo: [
      "你要按客户、出货单号、状态和日期查找，核对应收款分类以及标准、自定义账期记录。",
      "你要从已经出货的来源核对金额、手续费、币种和账期，再比较四种进度。",
    ],
    whatToSee: [
      "应看到客户、出货来源、金额、手续费、币种、收款分类、精确账期和状态清楚；历史缺值显示“历史未记录”，未出货记录不会被当成应收来源。",
      "应看到应收过账不等于已经收款，结清和取消都有明确时间与结果。",
    ],
  },
  invoices: {
    isList: true,
    minimumRecords: 45,
    minimumRecordUnit: "开票记录",
    keyStates: ["草稿", "已过账", "已取消", "不开票", "多种发票类别"],
    whatToDo: [
      "你要按往来单位、记录号、状态和日期查找，打开不开票与不同发票类别的记录。",
      "你要核对金额、手续费、币种、发票类别和出货来源，再比较草稿、已过账和已取消三种进度。",
    ],
    whatToSee: [
      "应看到往来单位、来源、记录号、金额、手续费、币种、发票类别和状态清楚，合计数字可以核对。",
      "应看到页面只记录业务开票进度，不会把它描述成报税或会计凭证已经完成。",
    ],
  },
  "print-center": {
    isList: true,
    minimumRecords: 5,
    minimumRecordUnit: "正式打印模板",
    keyStates: [
      "五套正式模板",
      "固定默认样例",
      "模板用途",
      "业务入口说明",
      "选填项为空",
    ],
    whatToDo: [
      "你要逐一选择五套正式模板，查看打印中心提供的固定默认样例和用途说明。",
      "你要确认页面清楚说明业务带值需要从采购订单、委外订单或产品结构页面进入。",
    ],
    whatToSee: [
      "应看到模板名称、用途和适用岗位清楚，五套模板都能正常打开。",
      "应看到固定样例不会被当成当前业务记录，业务带值工作台与固定预览有清楚区别。",
    ],
  },
  "permission-center": {
    isList: true,
    minimumRecords: FORMAL_TRIAL_ACCOUNT_COUNT,
    minimumRecordUnit: "正式岗位试用账号（另验停用与多岗位记录）",
    keyStates: ["启用账号", "停用账号", "单岗位", "多岗位", "无可用入口"],
    whatToDo: [
      "你要查找十个正式岗位试用账号，核对九个岗位任务端账号和一个后台管理账号。",
      "你要另用临时验收记录核对多岗位、停用和无可用入口场景，完成后恢复原状。",
    ],
    whatToSee: [
      "应看到账号名称、状态和岗位清楚，岗位调整后可见菜单与任务入口随之变化。",
      "应看到停用账号不能继续登录，恢复后按当前岗位重新进入；敏感信息不会直接显示。",
    ],
  },
  "system-audit-logs": {
    isList: true,
    minimumRecords: 30,
    minimumRecordUnit: "系统操作记录",
    keyStates: ["成功", "失败", "账号调整", "状态变更", "跨日期"],
    whatToDo: [
      "你要按操作人、操作类型和时间范围查找，并打开成功与失败记录。",
      "你要完成一次账号状态调整后刷新，确认能查到对应操作。",
    ],
    whatToSee: [
      "应看到谁在什么时间对什么对象做了什么以及结果如何，信息足够追查但不泄露敏感内容。",
      "应看到大量记录可以稳定翻页和筛选，刷新后不会重复或丢失当前条件。",
    ],
  },
});

const MOBILE_PLANS = Object.freeze({
  boss: {
    taskScenarios: MANUAL_ACCEPTANCE_ROLE_TASK_SCENARIOS.boss,
    keyStates: ["待查看", "已退回", "已阻塞", "临近到期", "已逾期"],
    whatToDo: [
      "你要查看待审批和临近到期事项，打开摘要后将一条资料不足的事项退回，并给一条暂不能决定的事项填写阻塞原因。",
      "你要从已处理清单查看已退回的记录；正式同意操作请用销售订单正常提交后生成的审批事项验收。",
    ],
    whatToSee: [
      "应看到客户、单号、金额、交期、风险和提交人足够支持判断，不需要先看复杂表格。",
      "应看到退回或阻塞后状态立即更新，重复点击不会生成两次结果；普通试用事项不会冒充正式订单审批。",
    ],
  },
  sales: {
    taskScenarios: MANUAL_ACCEPTANCE_ROLE_TASK_SCENARIOS.sales,
    keyStates: ["待补资料", "待提交", "已阻塞", "临近交期", "已完成"],
    whatToDo: [
      "你要查看客户订单和缺资料事项，补齐可填写内容并提交一条试用任务。",
      "你要打开已阻塞、已完成和临近交期的事项，查看原因或处理结果并继续跟进。",
    ],
    whatToSee: [
      "应看到客户、订单、产品、交期和缺少内容清楚，下一步动作一眼可见。",
      "应看到提交任务只更新协同进度，不会提前显示已经生产、出货或收款。",
    ],
  },
  purchase: {
    taskScenarios: MANUAL_ACCEPTANCE_ROLE_TASK_SCENARIOS.purchase,
    keyStates: ["待下单", "待回签", "待到料", "已经阻塞", "已经完成"],
    whatToDo: [
      "你要查看待下单、待回签和待到料事项，打开材料与供应商摘要。",
      "你要完成一条可处理任务，并将一条缺价格或交期的任务设为阻塞并填写原因。",
    ],
    whatToSee: [
      "应看到材料、数量、供应商、要求日期和当前问题清楚，操作按钮与当前状态一致。",
      "应看到完成任务不会被显示成材料已经入库，阻塞原因能被后续人员直接看懂。",
    ],
  },
  production: {
    taskScenarios: MANUAL_ACCEPTANCE_ROLE_TASK_SCENARIOS.production,
    keyStates: ["待安排", "进行中", "待回货", "返工", "已经阻塞", "已经完成"],
    whatToDo: [
      "你要查看今日生产、委外回货和返工事项，按到期时间处理。",
      "你要回填一条进度，完成一条事项，并对无法继续的事项填写阻塞原因。",
    ],
    whatToSee: [
      "应看到产品、数量、工序、加工厂、要求日期和当前进度清楚。",
      "应看到任务处理结果不会被误显示成成品已经入库、质检已经通过或款项已经结清。",
    ],
  },
  warehouse: {
    taskScenarios: MANUAL_ACCEPTANCE_ROLE_TASK_SCENARIOS.warehouse,
    keyStates: ["待收货", "待入库", "待备料", "待出货", "异常件", "已经完成"],
    whatToDo: [
      "你要查看待收货、待入库、待备料、待出货和异常件事项。",
      "你要完成一条具备条件的事项，并退回一条数量或批次不清楚的事项并填写原因。",
    ],
    whatToSee: [
      "应看到单号、材料或产品、数量、仓库、批次和要求时间清楚。",
      "应看到完成任务不会直接改变库存；需要入库或出货时会指向对应业务页面继续确认。",
    ],
  },
  finance: {
    taskScenarios: MANUAL_ACCEPTANCE_ROLE_TASK_SCENARIOS.finance,
    keyStates: ["待对账", "待付款", "待收款", "有差异", "已逾期", "已经完成"],
    whatToDo: [
      "你要查看待对账、待付款、待收款和差异事项，按到期时间排序。",
      "你要完成一条资料齐全的事项，并退回一条来源或金额不清楚的事项。",
    ],
    whatToSee: [
      "应看到往来单位、来源单号、金额、到期日和差异说明足够清楚。",
      "应看到任务完成只表示跟进完成，不会被误显示成已经付款、收款或完成报税。",
    ],
  },
  pmc: {
    taskScenarios: MANUAL_ACCEPTANCE_ROLE_TASK_SCENARIOS.pmc,
    customerTitle: "生产计划岗位任务端",
    keyStates: ["待评审", "待排期", "缺料风险", "延期", "已催办", "已经完成"],
    whatToDo: [
      "你要查看待评审、待排期、缺料和延期事项，并按交期排序。",
      "你要完成一条评审任务，对一条延期事项发起催办并填写说明。",
    ],
    whatToSee: [
      "应看到订单、产品、数量、交期、齐套情况和责任岗位清楚。",
      "应看到排期和催办只更新推进情况，不会提前显示生产完工、入库或出货。",
    ],
  },
  quality: {
    taskScenarios: MANUAL_ACCEPTANCE_ROLE_TASK_SCENARIOS.quality,
    keyStates: ["待检", "合格", "不合格", "待复检", "已退回", "已经完成"],
    whatToDo: [
      "你要查看待检、待复检和不合格事项，打开材料、批次和抽检摘要。",
      "你要完成一条资料齐全的事项，并退回一条批次或数量不清楚的事项。",
    ],
    whatToSee: [
      "应看到来源、材料或产品、批次、数量、判定和问题说明清楚。",
      "应看到任务完成不等于质检记录已经登记，更不会被误显示成库存或出货已经变化。",
    ],
  },
  engineering: {
    taskScenarios: MANUAL_ACCEPTANCE_ROLE_TASK_SCENARIOS.engineering,
    keyStates: [
      "待建产品",
      "待补规格",
      "待补工序",
      "待补材料清单",
      "已阻塞",
      "已经完成",
    ],
    whatToDo: [
      "你要查看产品资料、规格、工序和材料清单补齐事项。",
      "你要完成一条资料齐全的任务，并将一条缺少样板或关键尺寸的任务设为阻塞后填写原因。",
    ],
    whatToSee: [
      "应看到产品、订单、缺少内容、要求日期和来源说明清楚。",
      "应看到完成资料任务不会自动生成采购、生产、质检、库存或出货记录。",
    ],
  },
});

const PRINT_MINIMUMS = Object.freeze({
  "material-purchase-contract": {
    preview: [1, "固定采购合同样例"],
    workspace: [5, "采购订单带值样本"],
  },
  "processing-contract": {
    preview: [1, "固定加工合同样例"],
    workspace: [5, "委外订单带值样本"],
  },
  "engineering-material-detail": {
    preview: [1, "固定物料明细样例"],
    workspace: [5, "产品结构带值样本"],
  },
  "engineering-color-card": {
    preview: [1, "固定色卡样例"],
    workspace: [5, "产品结构带值样本"],
  },
  "engineering-work-instruction": {
    preview: [1, "固定作业指导样例"],
    workspace: [5, "产品结构带值样本"],
  },
});

const PRINT_WORKSPACE_PLANS = Object.freeze({
  "material-purchase-contract": {
    entry: "你要从采购订单选择一张记录，打开采购合同打印工作台。",
    detail:
      "你要选一张包含 25 条明细的采购订单，核对带值内容，修改一处打印草稿后刷新并继续核对。",
    expected:
      "应看到供应商、材料、数量、单价和金额来自所选采购订单，刷新后打印草稿仍可继续核对。",
  },
  "processing-contract": {
    entry: "你要从委外订单选择一张记录，打开加工合同打印工作台。",
    detail:
      "你要选一张包含 25 条明细的委外订单，核对带值内容，修改一处打印草稿后刷新并继续核对。",
    expected:
      "应看到加工厂、产品、加工环节、数量、单价和金额来自所选委外订单，刷新后打印草稿仍可继续核对。",
  },
  "engineering-material-detail": {
    entry: "你要从产品结构管理选择一个版本，打开物料分析明细表打印工作台。",
    detail:
      "你要选择包含 25 条材料明细的版本，核对带值内容，修改一处打印草稿后刷新并继续核对。",
    expected:
      "应看到产品、版本、材料、用量和损耗来自所选产品结构，刷新后打印草稿仍可继续核对。",
  },
  "engineering-color-card": {
    entry: "你要从产品结构管理选择一个版本，打开色卡打印工作台。",
    detail:
      "你要核对材料分块、厂商、部位或加工方式和线下贴样留白，修改一处打印草稿后刷新并继续核对。",
    expected:
      "应看到色卡为打印后线下贴布料或物料样本预留位置，不上传图片也能完成打印核对。",
  },
  "engineering-work-instruction": {
    entry: "你要从产品结构管理选择一个版本，打开作业指导书打印工作台。",
    detail:
      "你要准备包含 25 行内容的作业指导草稿，核对带值内容，调整一行后刷新并继续核对。",
    expected:
      "应看到产品和工程资料来自所选产品结构，步骤顺序清楚，刷新后打印草稿仍可继续核对。",
  },
});

const PRINT_ROLE_KEYS = Object.freeze({
  "material-purchase-contract": ["purchase", "finance"],
  "processing-contract": ["production"],
  "engineering-material-detail": ["engineering"],
  "engineering-color-card": ["engineering"],
  "engineering-work-instruction": ["engineering", "production"],
});

const SHARED_PREPARATION = Object.freeze([
  "所有样本都使用虚构内容，并用本轮固定编号识别；名称保持简单易懂，不要在每个名称里重复堆叠“试用”。",
  "每个清单页按本目录列出的数量准备数据，日期覆盖过去、今天和未来，状态不能全部相同。",
  "每类数据都要包含长名称、长备注、选填项为空、多明细、大数量和小数金额等边界样本。",
  "同一客户、供应商、产品、材料和来源单据要能跨页面对照，避免各页面各造一套互不关联的数据。",
  "验收人员只按页面上的名称、编号、单号和状态操作，不需要理解任何内部编号。",
]);

function assertSource(condition, message) {
  if (!condition) {
    throw new Error(`手动验收目录真源校验失败：${message}`);
  }
}

function createRoleMaps() {
  const roles = yoyoosunRoleFlowMatrix.roles || [];
  return {
    roles,
    byKey: new Map(roles.map((role) => [role.roleKey, role])),
  };
}

function getRoleKeysForDesktopPage(pageKey, roles) {
  const roleKeys = roles
    .filter((role) => (role.menuSurfaces || []).includes(pageKey))
    .map((role) => role.roleKey);
  if (roleKeys.length > 0) {
    return roleKeys;
  }
  if (pageKey === "permission-center" || pageKey === "system-audit-logs") {
    return [SYSTEM_ADMIN_ROLE_KEY];
  }
  throw new Error(`桌面页 ${pageKey} 没有可用岗位，请先更新岗位矩阵或验收方案`);
}

function resolveRoleLabels(roleKeys, roleByKey) {
  return roleKeys.map((roleKey) => {
    if (roleKey === SYSTEM_ADMIN_ROLE_KEY) {
      return "系统管理员";
    }
    const role = roleByKey.get(roleKey);
    assertSource(role, `岗位 ${roleKey} 不在当前岗位矩阵中`);
    return CUSTOMER_ROLE_LABELS[roleKey] || role.displayName;
  });
}

function createTechnicalItem({
  key,
  title,
  route,
  section,
  roleKeys,
  plan,
  source,
  menuHidden = false,
}) {
  return {
    key,
    title,
    route,
    section,
    roleKeys: [...roleKeys],
    isList: Boolean(plan.isList),
    minimumRecords: plan.minimumRecords,
    minimumRecordUnit: plan.minimumRecordUnit,
    ...(Array.isArray(plan.taskScenarios)
      ? { requiredTaskScenarios: [...plan.taskScenarios] }
      : {}),
    source,
    menuHidden,
  };
}

function createAcceptanceItem(technicalItem, plan, roleByKey) {
  return {
    title: plan.customerTitle || technicalItem.title,
    roles: resolveRoleLabels(technicalItem.roleKeys, roleByKey),
    minimumData: `${technicalItem.minimumRecords} ${technicalItem.minimumRecordUnit}`,
    keyStates: [...plan.keyStates],
    whatToDo: [...plan.whatToDo],
    whatToSee: [...plan.whatToSee],
  };
}

function buildPrintPlans(template) {
  const minimum = PRINT_MINIMUMS[template.key];
  const roleKeys = PRINT_ROLE_KEYS[template.key];
  const workspaceCopy = PRINT_WORKSPACE_PLANS[template.key];
  assertSource(minimum, `打印模板 ${template.key} 缺少最少数据量`);
  assertSource(roleKeys, `打印模板 ${template.key} 缺少验收岗位`);
  assertSource(workspaceCopy, `打印模板 ${template.key} 缺少业务入口验收方案`);

  const previewPlan = {
    isList: false,
    minimumRecords: minimum.preview[0],
    minimumRecordUnit: minimum.preview[1],
    keyStates: [
      "固定默认样例",
      "模板标题",
      "纸面分区",
      "选填项为空",
      "长文字换行",
    ],
    whatToDo: [
      `你要从模板打印中心打开${template.title}的固定默认样例，不把样例内容当成当前业务记录。`,
      "你要检查标题、表头、明细、合计、签字或留白区域，并放大查看长文字。",
    ],
    whatToSee: [
      `应看到${template.title}固定样例纸面内容完整，表头、边线和明细不会重叠或被裁掉。`,
      "应看到缺少的内容保持空白，长文字能换行并保持可读；业务带值需从对应业务页面进入。",
    ],
  };

  const workspacePlan = {
    isList: false,
    minimumRecords: minimum.workspace[0],
    minimumRecordUnit: minimum.workspace[1],
    keyStates:
      template.key === "engineering-color-card"
        ? ["业务记录带值", "线下贴样留白", "文字调整", "刷新恢复", "下载与打印"]
        : ["业务记录带值", "25 行内容", "草稿调整", "刷新恢复", "下载与打印"],
    whatToDo: [workspaceCopy.entry, workspaceCopy.detail],
    whatToSee: [
      workspaceCopy.expected,
      `应看到${template.title}编辑内容与纸面预览一致，下载和打印入口可用，编辑不会反向修改原业务记录。`,
    ],
  };

  return { previewPlan, workspacePlan, roleKeys };
}

export function buildManualAcceptanceCatalog() {
  const { roles, byKey: roleByKey } = createRoleMaps();
  const hiddenItemKeys = [
    ...(yoyoosunMenuConfig.desktopMenu?.hiddenItemKeys || []),
  ];
  const formalSections = getNavigationSections(yoyoosunMenuConfig);
  const formalDesktopItems = formalSections.flatMap((section) =>
    section.items.map((item) => ({ ...item, sectionTitle: section.title })),
  );
  const businessModuleKeys = new Set(
    businessModuleDefinitions.map((item) => item.key),
  );

  assertSource(
    formalDesktopItems.length === EXPECTED_DESKTOP_PAGE_COUNT,
    `当前正式桌面路由应为 ${EXPECTED_DESKTOP_PAGE_COUNT} 个，实际为 ${formalDesktopItems.length} 个`,
  );
  assertSource(
    roleWorkbenches.length === EXPECTED_MOBILE_PAGE_COUNT,
    `当前岗位任务端应为 ${EXPECTED_MOBILE_PAGE_COUNT} 个，实际为 ${roleWorkbenches.length} 个`,
  );
  assertSource(
    roles.length === EXPECTED_MOBILE_PAGE_COUNT,
    `岗位矩阵应包含 ${EXPECTED_MOBILE_PAGE_COUNT} 个岗位，实际为 ${roles.length} 个`,
  );
  assertSource(
    printTemplateCatalog.length === EXPECTED_PRINT_TEMPLATE_COUNT,
    `当前正式打印模板应为 ${EXPECTED_PRINT_TEMPLATE_COUNT} 套，实际为 ${printTemplateCatalog.length} 套`,
  );

  const entryDefinitions = [
    {
      key: "admin-login",
      title: "登录页",
      route: "/admin-login",
      section: "登录与入口",
    },
    {
      key: "entry",
      title: "入口选择页",
      route: "/entry",
      section: "登录与入口",
    },
  ];
  const allEntryRoleKeys = [
    ...roleWorkbenches.map((item) => item.key),
    SYSTEM_ADMIN_ROLE_KEY,
  ];
  const entryTechnical = entryDefinitions.map((definition) => {
    const plan = ENTRY_PLANS[definition.key];
    return createTechnicalItem({
      ...definition,
      roleKeys: allEntryRoleKeys,
      plan,
      source: "router",
    });
  });
  const entryAcceptance = entryTechnical.map((item) =>
    createAcceptanceItem(item, ENTRY_PLANS[item.key], roleByKey),
  );

  const desktopTechnical = formalDesktopItems.map((item) => {
    const plan = DESKTOP_PLANS[item.key];
    assertSource(plan, `桌面页 ${item.key} 缺少验收方案`);
    assertSource(
      businessModuleKeys.has(item.key) || navigationItemRegistry[item.key],
      `桌面页 ${item.key} 不在当前业务模块或导航登记中`,
    );
    return createTechnicalItem({
      key: item.key,
      title: item.label,
      route: item.path,
      section: item.sectionTitle,
      roleKeys: getRoleKeysForDesktopPage(item.key, roles),
      plan,
      source: businessModuleKeys.has(item.key)
        ? "businessModules+seedData+yoyoosunMenu"
        : "seedData+yoyoosunMenu",
      menuHidden: hiddenItemKeys.includes(item.key),
    });
  });
  const desktopAcceptance = desktopTechnical.map((item) =>
    createAcceptanceItem(item, DESKTOP_PLANS[item.key], roleByKey),
  );

  const mobileRoleByKey = new Map(roles.map((role) => [role.roleKey, role]));
  const mobileTechnical = roleWorkbenches.map((workbench) => {
    const role = mobileRoleByKey.get(workbench.key);
    const plan = MOBILE_PLANS[workbench.key];
    assertSource(role, `岗位任务端 ${workbench.key} 不在当前岗位矩阵中`);
    assertSource(plan, `岗位任务端 ${workbench.key} 缺少验收方案`);
    const technicalPlan = {
      ...plan,
      isList: true,
      minimumRecords: 20,
      minimumRecordUnit: "岗位任务",
    };
    return createTechnicalItem({
      key: workbench.key,
      title: `${role.displayName}岗位任务端`,
      route: workbench.path,
      section: "岗位任务端",
      roleKeys: [role.roleKey],
      plan: technicalPlan,
      source: "seedData+roleFlowMatrix",
    });
  });
  const mobileAcceptance = mobileTechnical.map((item) =>
    createAcceptanceItem(
      item,
      {
        ...MOBILE_PLANS[item.key],
        isList: true,
        minimumRecords: 20,
        minimumRecordUnit: "岗位任务",
      },
      roleByKey,
    ),
  );

  const previewTechnical = [];
  const workspaceTechnical = [];
  const previewAcceptance = [];
  const workspaceAcceptance = [];
  const printCenterBasePath = navigationItemRegistry["print-center"]?.path;
  assertSource(printCenterBasePath, "打印中心没有当前导航路径");

  printTemplateCatalog.forEach((template) => {
    assertSource(
      isSupportedPrintWorkspaceTemplate(template.key),
      `打印模板 ${template.key} 没有当前打印工作台路由`,
    );
    const { previewPlan, workspacePlan, roleKeys } = buildPrintPlans(template);
    roleKeys.forEach((roleKey) => {
      const role = roleByKey.get(roleKey);
      assertSource(role, `打印模板 ${template.key} 使用了未知岗位 ${roleKey}`);
      assertSource(
        role.menuSurfaces.includes("print-center") &&
          role.capabilityKeys.includes("erp.print_template.read"),
        `打印模板 ${template.key} 的岗位 ${roleKey} 没有当前打印入口`,
      );
    });

    const previewItem = createTechnicalItem({
      key: template.key,
      title: `${template.title}预览`,
      route: `${printCenterBasePath}/${template.key}`,
      section: "模板预览",
      roleKeys,
      plan: previewPlan,
      source: "printTemplates+router",
    });
    const workspaceItem = createTechnicalItem({
      key: template.key,
      title: `${template.title}打印工作台`,
      route: buildPrintWorkspacePath(template.key, {
        draftMode: PRINT_WORKSPACE_DRAFT_MODE.FRESH,
      }),
      section: "打印工作台",
      roleKeys,
      plan: workspacePlan,
      source: "printTemplates+printWorkspaceRoute",
    });
    previewTechnical.push(previewItem);
    workspaceTechnical.push(workspaceItem);
    previewAcceptance.push(
      createAcceptanceItem(previewItem, previewPlan, roleByKey),
    );
    workspaceAcceptance.push(
      createAcceptanceItem(workspaceItem, workspacePlan, roleByKey),
    );
  });

  const allTechnical = [
    ...entryTechnical,
    ...desktopTechnical,
    ...mobileTechnical,
    ...previewTechnical,
    ...workspaceTechnical,
  ];
  const formalDesktopKeys = new Set(desktopTechnical.map((item) => item.key));
  hiddenItemKeys.forEach((hiddenKey) =>
    assertSource(
      formalDesktopKeys.has(hiddenKey),
      `菜单隐藏页 ${hiddenKey} 仍应进入正式路由验收目录`,
    ),
  );
  assertSource(
    allTechnical.every(
      (item) =>
        item.key &&
        item.route &&
        !item.key.includes("__dev") &&
        !item.route.includes("__dev"),
    ),
    "目录中存在缺少 key/route 或属于开发入口的项目",
  );

  return {
    meta: {
      version: 2,
      title: `${yoyoosunMenuConfig.brand.companyName}全页面手动验收目录`,
      systemName: yoyoosunMenuConfig.brand.systemName,
      customerKey: yoyoosunMenuConfig.customerKey,
      purpose:
        "供试用人员按岗位逐页检查大量模拟数据下的可读性、操作结果和业务边界。",
      boundary:
        "默认只输出目录，不连接服务、不读取账号密码、不写业务记录；使用 --out 时只写本地报告文件。",
    },
    summary: {
      entryPages: entryTechnical.length,
      desktopPages: desktopTechnical.length,
      mobileRolePages: mobileTechnical.length,
      printPreviewPages: previewTechnical.length,
      printWorkspacePages: workspaceTechnical.length,
      totalScenarios: allTechnical.length,
      hiddenDesktopPagesCovered: hiddenItemKeys.length,
    },
    technicalManifest: {
      sourceFiles: [...SOURCE_FILES],
      hiddenDesktopKeys: hiddenItemKeys,
      excludedDesktopKeys: [],
      entries: entryTechnical,
      desktopPages: desktopTechnical,
      mobileRolePages: mobileTechnical,
      printPreviewPages: previewTechnical,
      printWorkspacePages: workspaceTechnical,
    },
    acceptanceGuide: {
      preparation: [...SHARED_PREPARATION],
      entries: entryAcceptance,
      desktopPages: desktopAcceptance,
      mobileRolePages: mobileAcceptance,
      printPreviewPages: previewAcceptance,
      printWorkspacePages: workspaceAcceptance,
    },
  };
}

function escapeMarkdownCell(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", "<br>");
}

function renderTechnicalTable(items) {
  const rows = items.map(
    (item) =>
      `| ${escapeMarkdownCell(item.section)} | ${escapeMarkdownCell(item.title)} | \`${escapeMarkdownCell(item.key)}\` | \`${escapeMarkdownCell(item.route)}\` | ${escapeMarkdownCell(item.roleKeys.join("、"))} | ${item.isList ? "是" : "否"} | ${item.minimumRecords} ${escapeMarkdownCell(item.minimumRecordUnit)} |`,
  );
  return [
    "| 分组 | 页面 | key | route | 岗位代码 | 是否列表 | 最少数据量 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

function renderAcceptanceGroup(title, items) {
  const content = items
    .map(
      (item, index) => `### ${index + 1}. ${item.title}

- 使用岗位：${item.roles.join("、")}
- 最少准备：${item.minimumData}
- 关键状态：${item.keyStates.join("、")}

你要做什么

${item.whatToDo.map((step) => `1. ${step}`).join("\n")}

应看到什么

${item.whatToSee.map((step) => `- ${step}`).join("\n")}`,
    )
    .join("\n\n");
  return `## ${title}\n\n${content}`;
}

export function renderManualAcceptanceMarkdown(catalog) {
  const technicalGroups = [
    ["登录与入口", catalog.technicalManifest.entries],
    ["桌面后台", catalog.technicalManifest.desktopPages],
    ["岗位任务端", catalog.technicalManifest.mobileRolePages],
    ["模板预览", catalog.technicalManifest.printPreviewPages],
    ["打印工作台", catalog.technicalManifest.printWorkspacePages],
  ];
  const guideGroups = [
    ["登录与入口验收", catalog.acceptanceGuide.entries],
    ["桌面后台验收", catalog.acceptanceGuide.desktopPages],
    ["岗位任务端验收", catalog.acceptanceGuide.mobileRolePages],
    ["模板预览验收", catalog.acceptanceGuide.printPreviewPages],
    ["打印工作台验收", catalog.acceptanceGuide.printWorkspacePages],
  ];

  return `# ${catalog.meta.title}

${catalog.meta.purpose}

> ${catalog.meta.boundary}

## 覆盖摘要

| 范围 | 数量 |
| --- | ---: |
| 登录与入口 | ${catalog.summary.entryPages} |
| 桌面后台 | ${catalog.summary.desktopPages} |
| 岗位任务端 | ${catalog.summary.mobileRolePages} |
| 模板预览 | ${catalog.summary.printPreviewPages} |
| 打印工作台 | ${catalog.summary.printWorkspacePages} |
| 合计 | ${catalog.summary.totalScenarios} |

## 模拟数据准备

${catalog.acceptanceGuide.preparation.map((item) => `- ${item}`).join("\n")}

## 技术清单（不属于验收步骤）

下面的 key、route 和岗位代码只用于定位页面；试用人员按后面的中文步骤操作。

${technicalGroups
  .map(([title, items]) => `### ${title}\n\n${renderTechnicalTable(items)}`)
  .join("\n\n")}

# 试用验收步骤

${guideGroups
  .map(([title, items]) => renderAcceptanceGroup(title, items))
  .join("\n\n")}
`;
}

export function renderManualAcceptanceJson(catalog) {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

export function parseManualAcceptanceCatalogArgs(argv = []) {
  const options = { format: "markdown", out: "", help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--format") {
      const format = String(argv[index + 1] || "")
        .trim()
        .toLowerCase();
      if (!format || !["markdown", "json"].includes(format)) {
        throw new Error("--format 只支持 markdown 或 json");
      }
      options.format = format;
      index += 1;
      continue;
    }
    if (arg === "--out") {
      const out = String(argv[index + 1] || "").trim();
      if (!out) {
        throw new Error("--out 后必须提供本地文件或目录路径");
      }
      options.out = out;
      index += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    throw new Error(`不支持的参数：${arg}`);
  }
  return options;
}

export function getManualAcceptanceCatalogHelp() {
  return `用法：
  node scripts/qa/manual-acceptance-catalog.mjs
  node scripts/qa/manual-acceptance-catalog.mjs --format json
  node scripts/qa/manual-acceptance-catalog.mjs --out output/manual-acceptance
  node scripts/qa/manual-acceptance-catalog.mjs --out output/manual-acceptance.md

说明：
  默认把中文 Markdown 输出到终端；--format json 输出 JSON。
  --out 指向目录时同时写入 Markdown 和 JSON，指向 .md 或 .json 时只写对应文件。
  本命令不连接服务、不读取账号密码、不写业务记录；--out 只写本地报告文件。
`;
}

function writeOutputFiles(out, markdown, json) {
  const target = path.resolve(out);
  const extension = path.extname(target).toLowerCase();
  if (extension === ".md" || extension === ".json") {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, extension === ".md" ? markdown : json, "utf8");
    return [target];
  }

  fs.mkdirSync(target, { recursive: true });
  const markdownPath = path.join(target, "manual-acceptance-catalog.md");
  const jsonPath = path.join(target, "manual-acceptance-catalog.json");
  fs.writeFileSync(markdownPath, markdown, "utf8");
  fs.writeFileSync(jsonPath, json, "utf8");
  return [markdownPath, jsonPath];
}

export function runManualAcceptanceCatalogCli(
  options = {},
  { stdout = process.stdout } = {},
) {
  if (options.help) {
    const help = getManualAcceptanceCatalogHelp();
    stdout.write(help);
    return { help, catalog: null, writtenPaths: [] };
  }

  const catalog = buildManualAcceptanceCatalog();
  const markdown = renderManualAcceptanceMarkdown(catalog);
  const json = renderManualAcceptanceJson(catalog);
  if (options.out) {
    const writtenPaths = writeOutputFiles(options.out, markdown, json);
    stdout.write(`已写入本地验收目录：${writtenPaths.join("、")}\n`);
    return { catalog, markdown, json, writtenPaths };
  }

  const output = options.format === "json" ? json : markdown;
  stdout.write(output);
  return { catalog, markdown, json, writtenPaths: [] };
}

const isCli =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isCli) {
  try {
    const options = parseManualAcceptanceCatalogArgs(process.argv.slice(2));
    runManualAcceptanceCatalogCli(options);
  } catch (error) {
    console.error(`[manual-acceptance-catalog] ${error.message}`);
    process.exitCode = 1;
  }
}
