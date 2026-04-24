import systemInitDoc from '../docs/system-init.md?raw'
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
import fieldLinkageCoverageDoc from '../docs/field-linkage-coverage.md?raw'
import qaRunRecordsDoc from '../docs/qa-run-records.md?raw'
import qaReportsDoc from '../docs/qa-reports.md?raw'

export const docRegistry = {
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
    summary: '说明验收总览页的报告来源、已知盲区和下一步排查路径。',
    source: acceptanceOverviewDoc,
  },
  'business-chain-debug': {
    title: '业务链路调试',
    summary:
      '说明当前如何按业务记录、workflow 状态和协同任务排查链路，调试页只读查询，不伪装成一键造数工具。',
    source: businessChainDebugDoc,
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
  reports: {
    title: '专项报告',
    summary:
      '聚合字段联动、打印快照、workflow 状态、权限边界和错误码同步等专项边界。',
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
