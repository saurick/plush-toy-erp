export const TOOLBAR_EXAMPLES = [
  {
    key: 'inventory',
    label: '库存查询',
    scope: '仓库',
    placeholder: '搜编号、材料、产品',
  },
  {
    key: 'purchase',
    label: '采购订单',
    scope: '供应商',
    placeholder: '搜单号、材料、供应商',
  },
  {
    key: 'tasks',
    label: '工作台待办',
    scope: '办理人',
    placeholder: '搜任务、单号、产品',
  },
  {
    key: 'history',
    label: '历史记录',
    scope: '操作人',
    placeholder: '搜编号、名称、记录',
  },
]

export const TOOLBAR_SCENARIOS = [
  { value: 'current', label: '当前分类示意' },
  { value: 'categories', label: '假设：功能分类增多' },
  { value: 'data', label: '假设：数据选项增多' },
]

const views = {
  inventory: [
    { value: 'balances', label: '库存余额' },
    { value: 'lots', label: '库存批次' },
    { value: 'txns', label: '库存变动记录' },
  ],
  purchase: [
    { value: 'orders', label: '订单列表' },
    { value: 'followup', label: '采购跟进' },
  ],
  tasks: [
    { value: '', label: '全部待办' },
    { value: 'regular', label: '常规待办' },
    { value: 'exception', label: '异常处理' },
    { value: 'due', label: '到期提醒' },
  ],
  history: [
    '全部记录',
    '采购订单',
    '销售订单',
    '库存变动',
    '生产记录',
    '质检记录',
  ].map((label, index) => ({ value: index ? `type-${index}` : 'all', label })),
}

export function toolbarViews(business, scenario) {
  const base = views[business] || views.inventory
  return scenario === 'categories'
    ? [
        ...base,
        ...Array.from({ length: 6 }, (_, index) => ({
          value: `extra-${index + 1}`,
          label: `扩展分类 ${String.fromCharCode(65 + index)}`,
        })),
      ]
    : base
}

export function toolbarScopes(business, scenario) {
  const scope =
    TOOLBAR_EXAMPLES.find(({ key }) => key === business)?.scope || '仓库'
  return Array.from({ length: scenario === 'data' ? 30 : 3 }, (_, index) => ({
    value: String(index + 1),
    label: `示例${scope} ${String(index + 1).padStart(2, '0')}`,
  }))
}

export function toolbarRows(business, scenario) {
  const scopes = toolbarScopes(business, scenario)
  const categories = toolbarViews(business, scenario)
  const names = [
    '云朵小熊',
    '短毛绒',
    '水手企鹅',
    '填充棉',
    '长耳小兔',
    '包装纸箱',
  ]
  return Array.from({ length: scenario === 'data' ? 60 : 12 }, (_, index) => ({
    id: `${business}-${index + 1}`,
    number: `DEMO-${business.toUpperCase()}-${String(index + 1).padStart(3, '0')}`,
    name: `演示${names[index % names.length]}`,
    scope: scopes[index % scopes.length].value,
    scopeLabel: scopes[index % scopes.length].label,
    category: categories[(index % (categories.length - 1)) + 1].value,
    status: ['draft', 'confirmed', 'closed'][index % 3],
    statusLabel: ['草稿', '已确认', '已关闭'][index % 3],
    quantity: (index + 1) * 12,
    date: `2026-11-${String(5 + (index % 4)).padStart(2, '0')}`,
    note: '本地虚构记录，仅用于交互设计演示。',
  }))
}

export function filterToolbarRows(
  rows,
  { query = '', scope = '', status = '', category = '' } = {}
) {
  const keyword = query.trim().toLocaleLowerCase('zh-CN')
  return rows.filter(
    (row) =>
      (!keyword ||
        [row.number, row.name, row.scopeLabel, row.note].some((value) =>
          value.toLocaleLowerCase('zh-CN').includes(keyword)
        )) &&
      (!scope || row.scope === scope) &&
      (!status || row.status === status) &&
      (!category || row.category === category)
  )
}

export function toolbarGrowthExplanation(business, scenario) {
  if (scenario === 'data')
    { return '数据选项增至 30 项：在筛选中搜索仓库、供应商或人员；内容分类不随数据条数增加。' }
  if (scenario === 'categories') {
    return business === 'tasks'
      ? '功能增长假设：常用待办条件保持直达，扩展分类放入筛选；列表 / 日历仍是两种展示方式。'
      : '功能增长假设：扩展分类仅用于压力演示，使用可搜索选择并区分现有分类与假设分类，不承诺新增业务能力。'
  }
  return business === 'tasks'
    ? '列表 / 日历切换展示方式；待办按钮筛选同一批任务，两者职责不同。'
    : business === 'history'
      ? '记录类型较多且名称不等长，使用可搜索选择；历史查询不增加新建动作。'
      : '少量稳定的内容分类直接展示；展示方式、筛选条件、表格工具和主动作按需组合。'
}
