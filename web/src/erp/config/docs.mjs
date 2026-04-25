import systemInitDoc from '../docs/system-init.md?raw'
import operationFlowOverviewDoc from '../docs/operation-flow-overview.md?raw'
import operationPlaybookDoc from '../docs/operation-playbook.md?raw'
import fieldTruthDoc from '../docs/field-truth.md?raw'
import dataModelDoc from '../docs/data-model.md?raw'
import importMappingDoc from '../docs/import-mapping.md?raw'
import mobileRolesDoc from '../docs/mobile-roles.md?raw'
import operationGuideDoc from '../docs/operation-guide.md?raw'
import roleCollaborationGuideDoc from '../docs/role-collaboration-guide.md?raw'
import rolePageDocumentMatrixDoc from '../docs/role-page-document-matrix.md?raw'
import taskDocumentMappingDoc from '../docs/task-document-mapping.md?raw'
import workflowStatusGuideDoc from '../docs/workflow-status-guide.md?raw'
import workflowSchemaDraftDoc from '../docs/workflow-schema-draft.md?raw'
import workflowUsecaseReviewDoc from '../docs/workflow-usecase-review.md?raw'
import industrySchemaReviewDoc from '../docs/industry-schema-review.md?raw'
import taskFlowV1Doc from '../docs/task-flow-v1.md?raw'
import rolePermissionMatrixV1Doc from '../docs/role-permission-matrix-v1.md?raw'
import notificationAlertV1Doc from '../docs/notification-alert-v1.md?raw'
import financeV1Doc from '../docs/finance-v1.md?raw'
import warehouseQualityV1Doc from '../docs/warehouse-quality-v1.md?raw'
import logTraceAuditV1Doc from '../docs/log-trace-audit-v1.md?raw'
import desktopRoleGuideDoc from '../docs/desktop-role-guide.md?raw'
import mobileRoleGuideDoc from '../docs/mobile-role-guide.md?raw'
import fieldLinkageGuideDoc from '../docs/field-linkage-guide.md?raw'
import calculationGuideDoc from '../docs/calculation-guide.md?raw'
import printSnapshotGuideDoc from '../docs/print-snapshot-guide.md?raw'
import exceptionHandlingGuideDoc from '../docs/exception-handling-guide.md?raw'
import currentBoundariesDoc from '../docs/current-boundaries.md?raw'
import printTemplatesDoc from '../docs/print-templates.md?raw'
import acceptanceOverviewDoc from '../docs/acceptance-overview.md?raw'
import businessChainDebugDoc from '../docs/business-chain-debug.md?raw'
import workflowTaskDebugDoc from '../docs/workflow-task-debug.md?raw'
import fieldLinkageCoverageDoc from '../docs/field-linkage-coverage.md?raw'
import qaRunRecordsDoc from '../docs/qa-run-records.md?raw'
import qaReportsDoc from '../docs/qa-reports.md?raw'

export const docRegistry = {
  'operation-flow-overview': {
    title: 'ERP 流程图总览',
    summary: '用一页说明当前 6 条真实闭环、推荐阅读顺序、当前边界和排查入口。',
    source: operationFlowOverviewDoc,
  },
  'operation-guide': {
    title: 'ERP 操作教程',
    summary: '说明总后台、角色剪裁后台、手机端任务端和帮助中心的使用方式。',
    source: operationGuideDoc,
  },
  'role-collaboration-guide': {
    title: '角色协同链路',
    summary: '按主链路和支线整理角色之间的交接、触发、反馈和异常回退关系。',
    source: roleCollaborationGuideDoc,
  },
  'role-page-document-matrix': {
    title: '角色权限 / 页面 / 单据矩阵',
    summary:
      '一页收口当前角色边界、正式页面清单和主链路单据流转矩阵，供继续做菜单剪裁和保存链路时对线。',
    source: rolePageDocumentMatrixDoc,
  },
  'task-document-mapping': {
    title: '任务 / 单据映射表',
    summary:
      '收口任务状态、任务来源、处理角色和完成条件，明确任务是协同层而不是业务真源。',
    source: taskDocumentMappingDoc,
  },
  'workflow-status-guide': {
    title: '任务 / 业务状态字典',
    summary:
      '统一任务状态、业务状态和推进阶段，供页面、任务池和保存链路继续对线。',
    source: workflowStatusGuideDoc,
  },
  'workflow-schema-draft': {
    title: 'Workflow / Schema 草案',
    summary:
      '提供任务协同层和业务状态层的表结构草案与 SQL 样例，只用于校对，不直接作为迁移真源。',
    source: workflowSchemaDraftDoc,
  },
  'workflow-usecase-review': {
    title: 'Workflow usecase 评审',
    summary:
      '评审前端 v1 编排和后端 workflow usecase 的边界、迁移优先级、回滚和测试要求。',
    source: workflowUsecaseReviewDoc,
  },
  'industry-schema-review': {
    title: '行业专表 Schema 评审',
    summary:
      '评审 business_records 继续使用边界、行业专表候选、P1 优先评审表和迁移一致性策略。',
    source: industrySchemaReviewDoc,
  },
  'task-flow-v1': {
    title: '工作流主任务树 v1',
    summary:
      '定义 T1 到 T8 的责任角色、触发事件、完成条件、关联模块、端侧、阻塞原因、超时规则和关键路径。',
    source: taskFlowV1Doc,
  },
  'role-permission-matrix-v1': {
    title: '角色权限矩阵 v1',
    summary:
      '明确菜单可见、数据范围、任务池、审批、催办、移动端处理和配置权限的边界。',
    source: rolePermissionMatrixV1Doc,
  },
  'notification-alert-v1': {
    title: '通知 / 预警 / 催办 / 升级 v1',
    summary:
      '说明站内通知、页面预警、催办事件和升级规则，外部推送暂不进入 v1。',
    source: notificationAlertV1Doc,
  },
  'finance-v1': {
    title: '财务 v1',
    summary: '收口应收、应付、发票、对账、税额和收付款状态的当前边界。',
    source: financeV1Doc,
  },
  'warehouse-quality-v1': {
    title: '仓库与品质 v1',
    summary:
      '收口收货、IQC、入库、发料、出货、库存、检验、返工复检和放行边界。',
    source: warehouseQualityV1Doc,
  },
  'log-trace-audit-v1': {
    title: '日志 / 审计 / Trace v1',
    summary:
      '说明业务事件、任务事件、业务状态快照、操作审计和 request_id / trace_id 的分层关系。',
    source: logTraceAuditV1Doc,
  },
  'desktop-role-guide': {
    title: '桌面端角色流程',
    summary: '只收口老板、业务、PMC、生产经理四类桌面端角色的主链路和子链路。',
    source: desktopRoleGuideDoc,
  },
  'mobile-role-guide': {
    title: '手机端角色流程',
    summary: '按任务分配、任务处理和处理反馈整理八类手机端角色的协同口径。',
    source: mobileRoleGuideDoc,
  },
  'field-linkage-guide': {
    title: 'ERP 字段联动口径',
    summary: '收口编号体系、字段真源、导入映射和主数据 / 快照分层边界。',
    source: fieldLinkageGuideDoc,
  },
  'calculation-guide': {
    title: 'ERP 计算口径',
    summary: '统一数量、金额、日期、派生字段和打印快照的当前口径。',
    source: calculationGuideDoc,
  },
  'print-snapshot-guide': {
    title: '打印 / 合同 / 快照口径',
    summary: '把采购合同、加工合同、打印冻结字段和历史快照边界单独收口。',
    source: printSnapshotGuideDoc,
  },
  'exception-handling-guide': {
    title: '异常 / 返工 / 延期处理',
    summary: '统一异常类型、触发入口、处理人、回退规则和关闭条件。',
    source: exceptionHandlingGuideDoc,
  },
  'current-boundaries': {
    title: '当前明确不做',
    summary: '把 deferred 能力、未落地边界和校对中的角色拆分单独说明。',
    source: currentBoundariesDoc,
  },
  'acceptance-overview': {
    title: '验收结果总览',
    summary: '查看当前闭环覆盖、质量命令、已知盲区和下一步排查入口。',
    source: acceptanceOverviewDoc,
  },
  'business-chain-debug': {
    title: '业务链路调试',
    summary:
      '说明 6 条 v1 主干闭环、deferred 扩展链路和安全 debug 场景操作边界。',
    source: businessChainDebugDoc,
  },
  'workflow-task-debug': {
    title: '协同任务调试',
    summary:
      '说明如何按 workflow_tasks、角色任务池、移动端可见性和 workflow_task_events 排查协同任务。',
    source: workflowTaskDebugDoc,
  },
  'field-linkage-coverage': {
    title: '字段联动覆盖',
    summary: '说明字段联动 latest 覆盖报告、catalog 真源和本地 runner 边界。',
    source: fieldLinkageCoverageDoc,
  },
  'run-records': {
    title: '运行记录',
    summary:
      '统一当前验收命令、运行产物和记录口径，后续再接结构化 latest 摘要。',
    source: qaRunRecordsDoc,
  },
  'qa-run-records': {
    title: '运行记录',
    summary: '查看每轮建议执行的命令、通过 / 失败 / 跳过记录和剩余风险写法。',
    source: qaRunRecordsDoc,
  },
  reports: {
    title: '专项报告',
    summary:
      '聚合字段联动、打印快照、workflow 状态、权限边界和错误码同步等专项边界。',
    source: qaReportsDoc,
  },
  'qa-reports': {
    title: '专项报告',
    summary:
      '聚合业务闭环、字段联动、打印快照、workflow、权限、通知预警、错误码和后端 schema 专项。',
    source: qaReportsDoc,
  },
  'system-init': {
    title: '系统初始化说明',
    summary: '说明本轮初始化范围、边界和后续接资料方式。',
    source: systemInitDoc,
  },
  'operation-playbook': {
    title: '毛绒 ERP 首批流程草案',
    summary: '把当前主链路和角色交接节点先沉淀成可维护文档。',
    source: operationPlaybookDoc,
  },
  'field-truth': {
    title: '字段真源对照',
    summary: '把客户、编号体系、数量、单价、交期和附件收口到真实资料来源。',
    source: fieldTruthDoc,
  },
  'data-model': {
    title: '首批正式数据模型',
    summary:
      '说明为什么不能照搬旧外贸模型，以及当前为什么暂不急着落 Ent schema。',
    source: dataModelDoc,
  },
  'import-mapping': {
    title: 'Excel / PDF 导入映射',
    summary: '逐个原件列出工作表、原始表头、标准字段、目标表和清洗规则。',
    source: importMappingDoc,
  },
  'mobile-roles': {
    title: '桌面单后台与移动端端口',
    summary: '明确桌面后台为什么收口成单入口，以及八个移动端端口分别做什么。',
    source: mobileRolesDoc,
  },
  'print-templates': {
    title: '模板打印与字段口径',
    summary:
      '按真实 Excel / PDF / 报表截图收口首批固定打印模板、快照字段和当前实现边界。',
    source: printTemplatesDoc,
  },
}
