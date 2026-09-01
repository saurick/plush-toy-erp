import {
  DEV_DATABASE_MIGRATION_ROUTE,
  DEV_DOCS_ROUTE,
  DEV_DRILL_RECOVERY_ROUTE,
  DEV_GOVERNANCE_ROUTE,
  DEV_PERMISSION_RELATIONSHIPS_ROUTE,
  DEV_PRODUCT_CORE_ROUTE,
  DEV_QUALITY_GATES_ROUTE,
  DEV_STATUS_FLOWS_ROUTE,
  DEV_VERSION_CENTER_ROUTE,
} from './devRoutes.mjs'

export const DEV_PRODUCT_ENGINEERING_VIEW = Object.freeze({
  QUESTIONS: 'questions',
  RELATIONSHIPS: 'relationships',
})
export const DEV_PRODUCT_ENGINEERING_DEFAULT_VIEW =
  DEV_PRODUCT_ENGINEERING_VIEW.QUESTIONS
export const DEV_PRODUCT_ENGINEERING_VIEW_ITEMS = Object.freeze([
  Object.freeze({
    value: DEV_PRODUCT_ENGINEERING_VIEW.QUESTIONS,
    label: '按问题找入口',
    description: '从七类常见问题进入',
  }),
  Object.freeze({
    value: DEV_PRODUCT_ENGINEERING_VIEW.RELATIONSHIPS,
    label: '项目图视角',
    description: '按六类图模型理解项目',
  }),
])

export const DEV_PRODUCT_ENGINEERING_GRAPH_VIEW_COPY = Object.freeze({
  eyebrow: '项目图视角',
  title: '从图模型理解本项目',
  description:
    '把业务对象、状态、岗位、依赖和证据看作节点，再通过连线方向、层级与回路理解整体结构。',
  boundary:
    '当前页提供六类图模型的分类说明和现有入口；对应页面、正式文档、代码合同和运行回执提供具体依据。',
})

const DEV_PRODUCT_ENGINEERING_VIEW_KEYS = new Set(
  DEV_PRODUCT_ENGINEERING_VIEW_ITEMS.map((item) => item.value)
)

export function parseDevProductEngineeringSearch(search) {
  const params =
    search instanceof URLSearchParams
      ? new URLSearchParams(search)
      : new URLSearchParams(String(search || '').replace(/^\?/u, ''))
  const requestedViews = params.getAll('view')
  const requestedView = requestedViews.length === 1 ? requestedViews[0] : ''
  const view = DEV_PRODUCT_ENGINEERING_VIEW_KEYS.has(requestedView)
    ? requestedView
    : DEV_PRODUCT_ENGINEERING_DEFAULT_VIEW
  const entries = [...params.entries()]

  return Object.freeze({
    view,
    canonical:
      entries.length === 1 &&
      entries[0][0] === 'view' &&
      requestedViews.length === 1 &&
      requestedView === view,
  })
}

export function buildDevProductEngineeringSearch(view) {
  if (!DEV_PRODUCT_ENGINEERING_VIEW_KEYS.has(view)) {
    throw new Error('产品工程查看方式无效')
  }
  return `?${new URLSearchParams({ view }).toString()}`
}

export const DEV_RELATIONSHIP_PERSPECTIVES = Object.freeze([
  Object.freeze({
    key: 'business-facts',
    title: '业务与事实',
    shape: '有向图 · 主链多为无环',
    question: '单据从哪里来，经过什么协同，最终形成什么已生效结果？',
    relationship:
      '来源单据 → 岗位协同与运行路径 → 受控业务动作 → 已生效事实；返工、退回和冲正另看异常路径。',
    boundary: '业务完成情况由对应事实单据和台账结果确认。',
    destinations: Object.freeze([
      Object.freeze({
        label: '看业务链总图',
        route: `${DEV_STATUS_FLOWS_ROUTE}?view=chain&chain=all`,
      }),
    ]),
  }),
  Object.freeze({
    key: 'state-workflow',
    title: '状态与流程',
    shape: '有向有环图',
    question: '当前在哪一步，允许推进、拒绝、退回还是重试？',
    relationship:
      '当前状态 → 允许动作 → 下一状态；退回、重试和恢复形成回路，对应有向有环图。',
    boundary: '状态规则描述允许路径；实例历史由实际事件记录呈现。',
    destinations: Object.freeze([
      Object.freeze({
        label: '查状态规则',
        route: `${DEV_STATUS_FLOWS_ROUTE}?view=states`,
      }),
      Object.freeze({
        label: '查责任与任务',
        route: `${DEV_STATUS_FLOWS_ROUTE}?view=workflow`,
      }),
    ]),
  }),
  Object.freeze({
    key: 'access-responsibility',
    title: '权限与责任',
    shape: '有向关系图',
    question: '账号或岗位为什么能用、为什么受限，又承担什么责任？',
    relationship:
      '账号 → 岗位 → 功能、页面、数据范围和审批责任；箭头解释结果从哪里来。',
    boundary: '权限关系展示当前只读投影；单据可执行动作还取决于业务状态。',
    destinations: Object.freeze([
      Object.freeze({
        label: '看权限关系图',
        route: `${DEV_PERMISSION_RELATIONSHIPS_ROUTE}?tab=graph`,
      }),
    ]),
  }),
  Object.freeze({
    key: 'structure-governance',
    title: '产品结构与治理',
    shape: '树 / 森林 + 有向引用',
    question: '能力、页面、文档和规则分别归在哪里，改动时先看什么？',
    relationship:
      '责任域向下组织能力与页面，文档和规则再用引用关系指向正式依据。',
    boundary: '目录和治理关系负责定位；能力状态与业务事实由各自正式真源提供。',
    destinations: Object.freeze([
      Object.freeze({ label: '看产品内核', route: DEV_PRODUCT_CORE_ROUTE }),
      Object.freeze({ label: '看改动指南', route: DEV_GOVERNANCE_ROUTE }),
      Object.freeze({ label: '搜索正式文档', route: DEV_DOCS_ROUTE }),
    ]),
  }),
  Object.freeze({
    key: 'quality-ci',
    title: '质量与 CI',
    shape: 'DAG（有向无环图）',
    question: '哪些检查有先后依赖，哪些能并行，最后在哪里汇合？',
    relationship:
      '计划 → 准备 → 分片检查 → 汇总 → 门禁结论；相互独立的检查可以并行。',
    boundary:
      '局部或本地绿色对应当前检查范围；完整发布由聚合门禁与发布回执确认。',
    destinations: Object.freeze([
      Object.freeze({
        label: '看服务器门禁',
        route: `${DEV_QUALITY_GATES_ROUTE}?view=server`,
      }),
    ]),
  }),
  Object.freeze({
    key: 'delivery-evidence',
    title: '交付与证据',
    shape: '有向依赖链',
    question: '代码、制品、迁移、部署和恢复证据怎样绑定到同一版本？',
    relationship:
      '提交身份 → CI 证据 → 不可变制品 → 迁移与部署 → 运行读回 → 恢复点。',
    boundary: '工作台编排证据；目标环境读回和实际验收确认最终交付状态。',
    destinations: Object.freeze([
      Object.freeze({ label: '看版本发布', route: DEV_VERSION_CENTER_ROUTE }),
      Object.freeze({
        label: '看数据库迁移',
        route: DEV_DATABASE_MIGRATION_ROUTE,
      }),
      Object.freeze({ label: '看演练与恢复', route: DEV_DRILL_RECOVERY_ROUTE }),
    ]),
  }),
])
