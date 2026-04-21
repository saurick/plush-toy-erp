import systemInitDoc from '../docs/system-init.md?raw'
import operationPlaybookDoc from '../docs/operation-playbook.md?raw'
import fieldTruthDoc from '../docs/field-truth.md?raw'
import dataModelDoc from '../docs/data-model.md?raw'
import importMappingDoc from '../docs/import-mapping.md?raw'
import mobileRolesDoc from '../docs/mobile-roles.md?raw'

export const docRegistry = {
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
    title: '桌面角色化与移动端多入口',
    summary: '明确桌面后台如何按角色区分，以及六个移动端入口分别做什么。',
    source: mobileRolesDoc,
  },
}
