import systemInitDoc from '../docs/system-init.md?raw'
import operationPlaybookDoc from '../docs/operation-playbook.md?raw'
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
  'mobile-roles': {
    title: '移动端角色初始化',
    summary: '明确每个角色手机端第一批页面、动作和待补能力。',
    source: mobileRolesDoc,
  },
}
