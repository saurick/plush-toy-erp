// Alternate rules use their existing sample view when that view shows the control.
const field = (id) => `.erp-control-input-field:has([id="${id}"])`
const named = (label) => `[aria-label="${label}"]`
const feedbackAction = '.erp-feedback-example .ant-btn'
const feedbackControls = '.erp-feedback-example .ant-space'
const chainPickerExample = '[data-chain-picker-example]'

export const CONTROL_USAGE_LOCATIONS = {
  feedback: {
    anchor: feedbackControls,
    items: {
      操作结果: '[data-feedback-part="message"]',
      即时结果: '[data-feedback-part="message"]',
      复制成功: '[data-feedback-part="copy"]',
      可恢复错误: '[data-feedback-part="recovery"]',
    },
  },
  'attachment-drawer': { anchor: feedbackAction },
  'danger-confirm': {
    anchor: feedbackAction,
    items: { 动作结果: '.erp-feedback-example [role="status"]' },
  },
  'business-form': {
    anchor: named('业务表单示例结果'),
    variant: 'form',
    items: {
      草稿明细: { anchor: named('明细表结构'), variant: 'form' },
      多列明细: { anchor: '.erp-select-value-example__viewport', variant: 'wide-lines' },
      明细表头: {
        anchor: '.erp-select-value-example__viewport thead',
        fallback: '.erp-select-value-example__viewport .erp-task-line-cards',
        variant: 'wide-lines',
      },
      失败与离开: { anchor: named('表单保存结果'), variant: 'form' },
    },
  },
  'source-picker': {
    anchor: '.erp-control-example-row .ant-btn',
    items: {
      大量远程资料: named('来源清单状态'),
      '停用、加载与失败': named('来源清单状态'),
      关闭与清空: named('来源选择示例结果'),
    },
  },
  'business-toolbar': {
    anchor: named('采购与生产页签位置对照'),
    items: {
      入口层级: named('采购与生产页签位置对照'),
      内容分类: named('采购对照查询视角'),
      同范围展示: '.erp-dev-toolbar-example__page:not([hidden]) [data-toolbar-part="view"]',
      '查询、工具与主动作': '.erp-dev-toolbar-example__page:not([hidden]) .erp-business-operation-panel',
      分类或选项增长: named('组合示例增长场景'),
    },
  },
  table: {
    anchor: '.ant-table',
    items: {
      列与行标识: '.ant-table-thead',
    },
  },
  pagination: {
    anchor: named('分页示例列表'),
    items: {
      '当前页、总数与读取': named('分页示例结果'),
      每页条数: `${named('每页示例条数')} .ant-select-selector`,
      加载与失败: named('分页读取状态'),
    },
  },
  inputs: {
    anchor: '.erp-control-input-grid',
    items: {
      普通备注: field('control-remark'),
      搜索与业务筛选: field('control-product-category'),
      领域选择: field('control-product-category'),
    },
  },
  input: {
    anchor: field('control-product-name'),
    items: { 错误与禁用: named('基础输入状态') },
  },
  'text-area': {
    anchor: field('control-remark'),
    items: { 只读或禁用: named('基础输入状态') },
  },
  help: {
    anchor: '.erp-supplemental-help-example__fields',
    items: {
      效果示意: '.erp-supplemental-help-example__examples',
      页面帮助与警告: '.erp-supplemental-help-example__examples:last-of-type',
    },
  },
  select: {
    anchor: '.erp-control-input-field',
    items: {
      字段名称: { anchor: field('control-product-category'), variant: 'basic' },
      清空: { anchor: field('control-product-category'), variant: 'basic' },
      分组选择: { anchor: '.erp-control-input-grid', variant: 'grouped' },
      关闭清空: { anchor: '.erp-control-input-field', variant: 'operation-parameter' },
    },
  },
  'filter-select': { anchor: '.erp-control-input-field' },
  'search-input': { anchor: `.erp-search-input:has(${named('搜索样例材料')})` },
  'chain-view-picker': {
    anchor: chainPickerExample,
    items: {
      流程范围单选: `${chainPickerExample} > .erp-chain-design__role-filter:has(> [data-picker="scope"])`,
      岗位多选: `${chainPickerExample} > .erp-chain-design__role-filter:has(> [data-picker="role"])`,
    },
  },
  date: {
    anchor: field('control-date'),
    items: { 禁用或校验失败: named('日期输入状态') },
  },
  'date-time': { anchor: field('control-deadline') },
  'date-range': { anchor: named('日期范围示例') },
  directory: {
    anchor: named('目录导航样例'),
    items: {
      层级与开合: { anchor: `${named('目录导航样例')} button[aria-expanded]`, variant: 'nested' },
      章节定位: `${named('目录导航样例')} [data-directory-example-item="submit"]`,
    },
  },
  tabs: { anchor: '[role="tablist"]' },
  'tab-list': {
    anchor: '[role="tablist"]',
    items: { 二级页签: named('二级导航样例') },
  },
  segmented: { anchor: named('登录工作入口样例') },
  'filter-chip': { anchor: '.erp-control-example-row' },
  'filter-chip-group': { anchor: named('库存批次状态样例') },
  navigation: {
    anchor: named('三类控件对照'),
    items: {
      页签: '[role="tablist"]',
      分段选择: named('登录工作入口样例'),
      筛选: named('库存批次状态样例'),
    },
  },
  actions: {
    anchor: '.erp-control-example-row',
    items: {
      主次优先级: '.erp-control-action-legend',
      辅助动作: '.ant-btn-text',
      加载与禁用: '.ant-btn:disabled',
    },
  },
  'app-empty': {
    anchor: '.erp-ui-empty-examples__toolbar',
    items: { 空态说明: '[data-empty-state]', 表单与下拉: named('空提示位置') },
  },
  empty: {
    anchor: named('页面状态'),
    items: {
      首次读取与切页: named('页面状态设备'),
      场景规格: named('页面状态设备'),
    },
  },
  counts: { anchor: '.erp-control-count-comparison' },
}
