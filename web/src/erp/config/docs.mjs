import systemInitDoc from '../docs/system-init.md?raw'
import operationPlaybookDoc from '../docs/operation-playbook.md?raw'
import fieldTruthDoc from '../docs/field-truth.md?raw'
import dataModelDoc from '../docs/data-model.md?raw'
import importMappingDoc from '../docs/import-mapping.md?raw'
import mobileRolesDoc from '../docs/mobile-roles.md?raw'
import operationGuideDoc from '../docs/operation-guide.md?raw'
import fieldLinkageGuideDoc from '../docs/field-linkage-guide.md?raw'
import calculationGuideDoc from '../docs/calculation-guide.md?raw'
import printTemplatesDoc from '../docs/print-templates.md?raw'

export const docRegistry = {
  'operation-guide': {
    title: 'ERP 操作教程',
    summary: '说明桌面后台入口、移动端端口访问方式，以及当前帮助与打印主路径。',
    source: operationGuideDoc,
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
      '说明为什么不能照搬 trade-erp，以及当前为什么暂不急着落 Ent schema。',
    source: dataModelDoc,
  },
  'import-mapping': {
    title: 'Excel / PDF 导入映射',
    summary: '逐个原件列出工作表、原始表头、标准字段、目标表和清洗规则。',
    source: importMappingDoc,
  },
  'mobile-roles': {
    title: '桌面单后台与移动端端口',
    summary: '明确桌面后台为什么收口成单入口，以及六个移动端端口分别做什么。',
    source: mobileRolesDoc,
  },
  'print-templates': {
    title: '模板打印与字段口径',
    summary:
      '按真实 Excel / PDF / 报表截图收口首批固定打印模板、快照字段和当前实现边界。',
    source: printTemplatesDoc,
  },
}
