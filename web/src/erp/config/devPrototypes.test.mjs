import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  DEV_PROTOTYPES_ROUTE,
  DEV_PROTOTYPE_ASSETS,
  DEV_PROTOTYPE_EXPANDED_GROUPS_STORAGE_KEY,
  DEV_PROTOTYPE_FILTER_OPTIONS,
  DEV_PROTOTYPE_FILTERS,
  DEV_PROTOTYPE_PINNED_STORAGE_KEY,
  DEV_PROTOTYPE_SELECTED_STORAGE_KEY,
  DEV_PROTOTYPE_STATUSES,
  DEV_PROTOTYPE_STATUS_FILTER_STORAGE_KEY,
  applyDevPrototypePinnedState,
  buildDevPrototypeItems,
  filterDevPrototypeItems,
  groupDevPrototypeItemsByDirectory,
  isDevPrototypesEnabled,
  normalizeDevPrototypeExpandedGroupKeys,
  normalizeDevPrototypePinnedKeys,
  normalizeDevPrototypeSelectedKey,
  normalizeDevPrototypeStatusFilter,
  prepareDevPrototypeSandboxSource,
} from './devPrototypes.mjs'
import { printTemplateCatalog } from './printTemplates.mjs'

const repoRoot = path.resolve(import.meta.dirname, '../../../..')
const prototypesPageSource = readFileSync(
  path.join(repoRoot, 'web/src/erp/pages/DevPrototypesPage.jsx'),
  'utf8'
)
const prototypeRegistryReadmeSource = readFileSync(
  path.join(repoRoot, 'docs/product/prototypes/README.md'),
  'utf8'
)
const prototypeStaticIndexSource = readFileSync(
  path.join(repoRoot, 'docs/product/prototypes/index.html'),
  'utf8'
)

test('devPrototypes: 只通过开发态独立路径暴露', () => {
  assert.equal(DEV_PROTOTYPES_ROUTE, '/__dev/prototypes')
  assert.equal(isDevPrototypesEnabled({ DEV: true }), true)
  assert.equal(isDevPrototypesEnabled({ DEV: false }), false)
  assert(!DEV_PROTOTYPES_ROUTE.startsWith('/erp/'))
})

test('devPrototypes: sandbox preview uses in-memory storage without same-origin access', () => {
  const prepared = prepareDevPrototypeSandboxSource(
    '<!doctype html><html><head><title>Demo</title></head><body></body></html>'
  )
  assert.match(prepared, /Object\.defineProperty\(window, name/u)
  assert.match(prepared, /createMemoryStorage/u)
  assert.doesNotMatch(prepared, /window\[name\]\.getItem/u)
  assert(
    prepared.indexOf('createMemoryStorage') < prepared.indexOf('<title>Demo')
  )
  assert.match(prototypesPageSource, /sandbox="allow-scripts"/u)
  assert.doesNotMatch(prototypesPageSource, /allow-same-origin/u)
  assert.equal(prepareDevPrototypeSandboxSource(''), '')
})

test('devPrototypes: 登记当前原型与样板资产并区分类型和状态', () => {
  assert.equal(DEV_PROTOTYPE_ASSETS.length, 26)
  assert.equal(
    DEV_PROTOTYPE_ASSETS.filter((item) => item.type === 'HTML').length,
    16
  )
  assert.equal(
    DEV_PROTOTYPE_ASSETS.filter((item) => item.type === 'PNG').length,
    10
  )
  assert(
    DEV_PROTOTYPE_ASSETS.every(
      (item) => typeof item.appliesTo === 'string' && item.appliesTo.length > 0
    )
  )

  const statuses = new Set(
    DEV_PROTOTYPE_ASSETS.flatMap((item) => item.statuses)
  )
  assert(statuses.has(DEV_PROTOTYPE_STATUSES.CURRENT))
  assert(statuses.has(DEV_PROTOTYPE_STATUSES.DRAFT))
  assert(statuses.has(DEV_PROTOTYPE_STATUSES.HISTORY))
  assert(statuses.has(DEV_PROTOTYPE_STATUSES.EVIDENCE))
  assert(statuses.has(DEV_PROTOTYPE_STATUSES.COMPARISON))
  assert.equal(
    DEV_PROTOTYPE_ASSETS.filter((item) =>
      item.statuses.includes(DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT)
    ).length,
    15
  )
  assert.deepEqual(
    DEV_PROTOTYPE_ASSETS.filter((item) =>
      item.statuses.includes(DEV_PROTOTYPE_STATUSES.CURRENT)
    ).map((item) => item.key),
    ['mobile-role-tasks-implemented']
  )
  assert.deepEqual(
    DEV_PROTOTYPE_FILTER_OPTIONS.map((option) => option.value),
    [
      DEV_PROTOTYPE_FILTERS.ALL,
      DEV_PROTOTYPE_FILTERS.CURRENT,
      DEV_PROTOTYPE_FILTERS.TO_IMPLEMENT,
      DEV_PROTOTYPE_FILTERS.REFERENCE,
    ]
  )
  assert.equal(
    DEV_PROTOTYPE_ASSETS.find((item) => item.key === 'admin-command-center')
      ?.statuses[0],
    DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT
  )
  assert.equal(
    DEV_PROTOTYPE_ASSETS.find(
      (item) => item.key === 'workflow-task-action-flow'
    )?.statuses[0],
    DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT
  )
  assert.match(
    DEV_PROTOTYPE_ASSETS.find(
      (item) => item.key === 'workflow-task-action-flow'
    )?.description || '',
    /可直接导航的三步流程/
  )
  assert.equal(
    DEV_PROTOTYPE_ASSETS.find((item) => item.key === 'mobile-role-tasks-v2')
      ?.statuses[0],
    DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT
  )
  assert.match(
    DEV_PROTOTYPE_ASSETS.find((item) => item.key === 'mobile-role-tasks-v2')
      ?.appliesTo || '',
    /v2 不代表 API、RBAC、菜单或客户环境已改造/
  )
  for (const key of [
    'admin-command-center-redesign-reference',
    'task-command-center-redesign-reference',
    'business-management-center-redesign-reference',
    'workflow-task-action-flow-redesign-reference',
  ]) {
    const reference = DEV_PROTOTYPE_ASSETS.find((item) => item.key === key)
    assert.equal(reference?.type, 'PNG')
    assert.deepEqual(reference?.statuses, [DEV_PROTOTYPE_STATUSES.DRAFT])
  }
  assert.equal(
    DEV_PROTOTYPE_ASSETS.find((item) => item.key === 'core-menu-coverage')
      ?.statuses[0],
    DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT
  )
  assert.match(
    DEV_PROTOTYPE_ASSETS.find((item) => item.key === 'core-menu-coverage')
      ?.description || '',
    /51 个二级菜单/
  )
  assert.equal(
    DEV_PROTOTYPE_ASSETS.find((item) => item.key === 'formal-menu-candidate')
      ?.statuses[0],
    DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT
  )
  assert.equal(
    DEV_PROTOTYPE_ASSETS.find(
      (item) => item.key === 'metric-card-interaction-standard'
    )?.statuses[0],
    DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT
  )
  assert.match(
    DEV_PROTOTYPE_ASSETS.find(
      (item) => item.key === 'metric-card-interaction-standard'
    )?.description || '',
    /只读统计卡/
  )
  assert.match(
    DEV_PROTOTYPE_ASSETS.find((item) => item.key === 'formal-menu-candidate')
      ?.description || '',
    /12 个高频主入口/
  )
  assert.equal(
    DEV_PROTOTYPE_ASSETS.find((item) => item.key === 'audit-log-page')
      ?.statuses[0],
    DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT
  )
  assert.match(
    DEV_PROTOTYPE_ASSETS.find((item) => item.key === 'audit-log-page')
      ?.description || '',
    /系统控制面追踪工具/
  )
  assert.equal(
    DEV_PROTOTYPE_ASSETS.find(
      (item) => item.key === 'business-task-collab-entry'
    )?.statuses[0],
    DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT
  )
  const businessStandardPage = DEV_PROTOTYPE_ASSETS.find(
    (item) => item.key === 'business-module-standard-page'
  )
  const businessCollaborationEntry = DEV_PROTOTYPE_ASSETS.find(
    (item) => item.key === 'business-task-collab-entry'
  )
  assert.match(
    businessStandardPage?.description || '',
    /不作为所有标准页的默认固定栏/
  )
  assert.match(businessStandardPage?.appliesTo || '', /不默认挂载协同入口/)
  assert.match(
    businessCollaborationEntry?.description || '',
    /当前选中业务记录/
  )
  assert.match(
    businessCollaborationEntry?.description || '',
    /无待办时不显示固定栏/
  )
  assert.match(businessCollaborationEntry?.appliesTo || '', /任务中心承接/)
  assert.equal(
    DEV_PROTOTYPE_ASSETS.find((item) => item.key === 'print-template-center')
      ?.statuses[0],
    DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT
  )
  assert.match(
    DEV_PROTOTYPE_ASSETS.find((item) => item.key === 'print-template-center')
      ?.appliesTo || '',
    /不新增样品确认单/
  )
  assert.match(
    DEV_PROTOTYPE_ASSETS.find(
      (item) => item.key === 'business-form-standard-page'
    )?.description || '',
    /只读状态/
  )
  assert.match(
    DEV_PROTOTYPE_ASSETS.find(
      (item) => item.key === 'business-form-standard-page'
    )?.appliesTo || '',
    /局部动作弹窗样板/
  )
  const actionModal = DEV_PROTOTYPE_ASSETS.find(
    (item) => item.key === 'action-modal-drawer-standard'
  )
  assert.doesNotMatch(
    actionModal?.description || '',
    /覆盖[^。；]*回收站|删除确认/,
    '局部动作弹窗样板不应把回收站或删除确认登记成通用覆盖项'
  )
  assert.match(actionModal?.description || '', /状态动作说明/)
  assert.match(actionModal?.description || '', /不承诺通用回收站/)
  assert.match(actionModal?.appliesTo || '', /后端 usecase \/ RBAC 决定/)
  assert.equal(
    DEV_PROTOTYPE_ASSETS.find(
      (item) => item.key === 'business-task-collab-entry'
    )?.statuses.includes(DEV_PROTOTYPE_STATUSES.COMPARISON),
    false
  )
  assert.match(
    DEV_PROTOTYPE_ASSETS.find(
      (item) => item.key === 'business-task-collab-entry'
    )?.appliesTo || '',
    /不是独立菜单/
  )
  assert.equal(
    DEV_PROTOTYPE_ASSETS.find(
      (item) => item.key === 'business-direction-sidebar'
    )?.statuses[0],
    DEV_PROTOTYPE_STATUSES.DRAFT
  )
})

test('devPrototypes: 中央 README 与静态查看器同步登记本轮重设计资产', () => {
  const redesignedAssetPaths = [
    'admin-command-center-v1/images/workbench-redesign-reference.png',
    'task-command-center-v1/images/task-board-redesign-reference.png',
    'business-management-center-v1/images/business-board-redesign-reference.png',
    'workflow-task-action-flow-v1/index.html',
    'workflow-task-action-flow-v1/images/task-action-flow-redesign-reference.png',
    'mobile-role-tasks-v2/index.html',
  ]

  assert.match(
    prototypeStaticIndexSource,
    /<span>HTML 样板<\/span><strong>16<\/strong>/u
  )
  assert.match(
    prototypeStaticIndexSource,
    /<span>PNG \/ 截图<\/span><strong>10<\/strong>/u
  )
  for (const assetPath of redesignedAssetPaths) {
    assert(
      prototypeStaticIndexSource.includes(assetPath),
      `${assetPath} should be listed in the static prototype index`
    )
    assert(
      prototypeRegistryReadmeSource.includes(assetPath),
      `${assetPath} should be listed in the prototype registry README`
    )
    assert.doesNotThrow(() =>
      readFileSync(path.join(repoRoot, 'docs/product/prototypes', assetPath))
    )
  }
  assert.match(prototypeRegistryReadmeSource, /截至 2026-07-16/u)
  assert.match(prototypeRegistryReadmeSource, /十五个产品内核相关 HTML/u)
  assert.match(
    prototypeRegistryReadmeSource,
    /mobile-role-tasks-v2\/index\.html` 尚未进入运行时/u
  )
})

test('devPrototypes: 业务页协同入口只呈现当前记录待办并在空待办时隐藏', () => {
  const html = readFileSync(
    path.join(
      repoRoot,
      'docs/product/prototypes/business-module-page-standard-v1/task-collab-entry-v2.html'
    ),
    'utf8'
  )

  assert.match(html, /协同入口只处理当前选中记录的待办/u)
  assert.match(html, /跨记录任务回到任务中心/u)
  assert.match(html, /const tasksByRecord = \{/u)
  assert.match(
    html,
    /activeRecordTasks = tasksByRecord\[recordKey\] \|\| \[\]/u
  )
  assert.match(html, /dock\.hidden = activeRecordTasks\.length === 0/u)
  assert.match(html, /data-record-key="SO-202606-017"[\s\S]*?<td>无待办<\/td>/u)
  assert.match(html, /实际出货、开票和收付款仍须在对应业务页面办理/u)
  assert.doesNotMatch(html, /处理本页相关任务|本页待办|只显示当前页面相关任务/u)
})

test('devPrototypes: 岗位任务端 Current 参考不透出移动端旧动作和技术 key', () => {
  const html = readFileSync(
    path.join(
      repoRoot,
      'docs/product/prototypes/mobile-role-tasks-v1/implemented-reference.html'
    ),
    'utf8'
  )

  assert(
    html.includes('任务已流转至仓库'),
    'mobile role tasks Current reference should use readable owner role label'
  )
  assert(
    html.includes('请填写原因，说明卡点、退回依据或催办诉求'),
    'mobile role tasks Current reference should keep the runtime reason placeholder'
  )
  assert(
    html.includes('<strong>仓库</strong>'),
    'mobile role tasks Current reference should show readable role names in Mine tab'
  )
  assert(
    html.includes('grid-template-columns: repeat(3, minmax(0, 1fr))'),
    'mobile role tasks Current reference action bar should match the three runtime actions'
  )
  assert.doesNotMatch(html, /任务已流转至[^<]*\/\s*warehouse/u)
  assert.doesNotMatch(html, /<strong>仓库\s*\/\s*demo<\/strong>/u)
  assert.doesNotMatch(html, /class="action process"|▶ 处理/u)
  assert.doesNotMatch(html, /请填写原因，至少 5 个字/u)
})

test('devPrototypes: 岗位任务端 Current 参考由同一任务对象渲染列表与详情', () => {
  const html = readFileSync(
    path.join(
      repoRoot,
      'docs/product/prototypes/mobile-role-tasks-v1/implemented-reference.html'
    ),
    'utf8'
  )

  assert.match(html, /function renderTaskDetail\(task\)/u)
  assert.match(
    html,
    /const task = tasks\[Number\(taskButton\.dataset\.openDetail\)\]/u
  )
  assert.match(html, /renderTaskDetail\(task\)/u)
  assert.match(
    html,
    /detailSourceText\.textContent = `来源：\$\{task\.source\}`/u
  )
  assert.match(
    html,
    /detailLinkedSource\.textContent = `来源：\$\{task\.source\}`/u
  )
  assert.match(html, /\["截止", task\.due\]/u)
  assert.match(html, /activeTaskTrigger\?\.focus/u)
  assert.doesNotMatch(html, /PROSHIP-01|DBG|demo_|调试/u)
  assert.match(html, /data-filter="all"/u)
  assert.match(html, /data-filter="risk"/u)
  assert.match(html, /data-list-more/u)
  assert.match(html, /id="cancelReasonButton"/u)
  assert.match(html, /id="submitReasonButton"/u)
  assert.match(
    html,
    /if \(!activeActionButton \|\| !activeTask \|\| actionSubmitting\) return/u
  )
  assert.match(html, /完成反馈（必填）/u)
  assert.match(html, /if \(!reason\)/u)
  assert.match(html, /请先填写本次处理说明再提交。/u)
  assert.match(html, /const submittedActionButton = activeActionButton/u)
  assert.match(html, /const submittedTask = activeTask/u)
  assert.match(html, /setActionSubmitting\(true\)/u)
  assert.match(html, /submittedTask\.actionLocked = true/u)
  assert.match(html, /tasks\.splice\(submittedTaskIndex, 1\)/u)
  assert.match(html, /任务列表已刷新/u)
  assert.match(html, /\["状态", task\.status\]/u)
  assert.match(html, /detailRisk\.hidden = !task\.risk/u)
  assert.match(html, /task\.blockedReason \?/u)
  assert.doesNotMatch(html, /taskIndex === 0/u)
  assert.match(html, /activeActionButton\?\.focus/u)
})

test('devPrototypes: 业务列表更多操作默认关闭并在窄屏收敛动作', () => {
  const html = readFileSync(
    path.join(
      repoRoot,
      'docs/product/prototypes/business-module-page-standard-v1/index.html'
    ),
    'utf8'
  )

  assert.match(
    html,
    /id="moreActionsButton"[\s\S]*?aria-haspopup="menu"[\s\S]*?aria-expanded="false"[\s\S]*?aria-controls="statusActionMenu"/u
  )
  assert.match(
    html,
    /id="statusActionMenu"[\s\S]*?role="menu"[\s\S]*?hidden/u
  )
  assert.match(html, /function openMoreActions\(\)/u)
  assert.match(html, /function closeMoreActions\(/u)
  assert.match(html, /let selectedIndex = -1/u)
  assert.match(html, /statusActionMenu\.hidden = false/u)
  assert.match(html, /event\.key === "Escape"/u)
  assert.match(
    html,
    /if \(!event\.target\.closest\("\.status-action-menu"\)\) closeMoreActions\(\)/u
  )
  assert.match(
    html,
    /\.selection-actions > \.secondary-action[\s\S]*?display: none/u
  )
  assert.match(html, /class="btn small primary action-button primary-action"/u)
  assert.match(html, />生成入库草稿</u)
  assert.match(html, /data-requires-open-record/u)
  assert.match(html, /const isClosed = record\?\.status === "已关闭"/u)
  assert.match(
    html,
    /lifecycleSensitiveActions\.forEach\(\(button\) => \{[\s\S]*?button\.disabled = !hasSelection \|\| isClosed/u
  )
  assert.match(html, /已关闭，仅可查看、复制或打印/u)
  assert.match(html, /type="radio" name="purchaseOrderSelection"/u)
  assert.match(html, /id="lifecycleDialog"[\s\S]*?aria-modal="true"/u)
  assert.match(html, /lifecycleDialog\.showModal\(\)/u)
  assert.match(html, /lifecycleDialog\.addEventListener\("cancel"/u)
  assert.match(html, /event\.key !== "Tab"/u)
  assert.match(html, /lifecycleTrigger\?\.focus/u)
})

test('devPrototypes: 业务表单样板使用真实单弹窗与完整键盘边界', () => {
  const html = readFileSync(
    path.join(
      repoRoot,
      'docs/product/prototypes/business-form-page-standard-v1/index.html'
    ),
    'utf8'
  )

  assert.equal([...html.matchAll(/<dialog\b/gu)].length, 1)
  assert.equal([...html.matchAll(/<div class="footer"/gu)].length, 1)
  assert.equal(
    [...html.matchAll(/class="btn primary save-action"/gu)].length,
    1
  )
  assert.match(html, /id="openFormModal"[^>]*aria-haspopup="dialog"/su)
  assert.match(
    html,
    /<dialog[\s\S]*?aria-modal="true"[\s\S]*?aria-labelledby="businessFormTitle"[\s\S]*?aria-describedby="businessFormDescription"/u
  )
  assert.match(html, /businessFormDialog\.showModal\(\)/u)
  assert.match(html, /querySelector\("\[data-initial-focus\]"\)\?\.focus/u)
  assert.match(html, /businessFormDialog\.addEventListener\("keydown"/u)
  assert.match(html, /event\.key === "Escape"/u)
  assert.match(html, /event\.key !== "Tab"/u)
  assert.match(html, /modalTrigger\?\.focus/u)
  assert.doesNotMatch(html, /<dialog[^>]*\sopen(?:\s|>)/u)
  const editableFields =
    html.match(/const editableFieldIds = \[([\s\S]*?)\];/u)?.[1] || ''
  assert.doesNotMatch(editableFields, /"lineAmount"/u)
  assert.match(html, /<input id="lineAmount"[^>]*disabled/u)
  assert.doesNotMatch(html, /id="source"|sourceData|上游业务单据/u)
  assert.match(html, /<label class="required" for="customer">客户<\/label>/u)
  assert.match(html, /<select id="customer"/u)
  assert.match(html, /<input id="status"[^>]*readonly[^>]*aria-readonly="true"/u)
  assert.doesNotMatch(html, /toy-a|toy-b/u)
  assert.match(html, /<select id="itemImportSelection">/u)
  assert.match(html, /applySkuSelection\(itemImportSelection\.value\)/u)
  assert.match(html, /SKU 只带入产品主数据，不覆盖当前订单的数量、价格、金额和交期/u)
  assert.match(html, /const mutationControlSelector = \[/u)
  assert.match(html, /"#itemImportApply"/u)
  assert.match(html, /"#attachment"/u)
  assert.match(html, /"\.remove-item"/u)
  assert.match(html, /"#addItem"/u)
  assert.match(html, /"#footerReset"/u)
  assert.match(html, /"#footerSave"/u)
  assert.match(html, /function syncMutationControls\(readonly\)/u)
  assert.match(html, /if \(formMode\.value === "readonly"\) return/u)
  const skuCatalog = html.match(
    /const skuCatalog = \{([\s\S]*?)\n\s{6}\};/u
  )?.[1]
  assert.ok(skuCatalog, 'business form prototype should define SKU catalog')
  assert.doesNotMatch(
    skuCatalog,
    /quantity|unitPrice|lineAmount|dueDate/u,
    'SKU master selection must not overwrite document quantity, price, amount, or due date'
  )
})

test('devPrototypes: 审计空结果同步清除选中项、详情和指标', () => {
  const html = readFileSync(
    path.join(repoRoot, 'docs/product/prototypes/audit-log-page-v1/index.html'),
    'utf8'
  )

  assert.match(html, /function clearDetail\(\)/u)
  assert.match(
    html,
    /detailSubtitle\.textContent = "未选择事件"[\s\S]*?detailPanel\.hidden = true/u
  )
  assert.match(
    html,
    /function setActiveRow\(row\)[\s\S]*?else \{[\s\S]*?clearDetail\(\)/u
  )
  assert.match(html, /totalMetric\.textContent = String\(visible\)/u)
  assert.match(html, /riskMetric\.textContent = String\(high\)/u)
  assert.match(html, /setActiveRow\(firstVisible\)/u)
})

test('devPrototypes: 局部动作弹层使用原生 dialog 和 alertdialog 行为契约', () => {
  const html = readFileSync(
    path.join(
      repoRoot,
      'docs/product/prototypes/action-modal-drawer-standard-v1/index.html'
    ),
    'utf8'
  )

  assert.equal([...html.matchAll(/<dialog\b/gu)].length, 5)
  assert.equal([...html.matchAll(/<\/dialog>/gu)].length, 5)
  assert.equal([...html.matchAll(/aria-haspopup="dialog"/gu)].length, 5)
  assert.match(
    html,
    /<dialog[^>]*id="confirmDialog"[^>]*role="alertdialog"[^>]*aria-modal="true"/u
  )
  assert.doesNotMatch(html, /role="tooltip"/u)
  assert.match(html, /dialog\.showModal\(\)/u)
  assert.match(html, /dialog\.addEventListener\("cancel"/u)
  assert.match(html, /dialog\.querySelectorAll\("\[data-dialog-close\]"\)/u)
  assert.match(html, /element\.inert = blocked/u)
  assert.match(html, /dialog\.querySelector\([\s\S]*?\[data-initial-focus\]/u)
  assert.match(html, /trigger\?\.focus\(\{ preventScroll: true \}\)/u)
  assert.match(html, /openDialog\("form", buttons\[0\]\)/u)
})

test('devPrototypes: 模板打印中心样板覆盖当前五个正式模板', () => {
  const html = readFileSync(
    path.join(
      repoRoot,
      'docs/product/prototypes/print-template-center-v1/index.html'
    ),
    'utf8'
  )
  const prototypeTitles = [
    ...html.matchAll(
      /<button class="template-card"[\s\S]*?<h2>([^<]+)<\/h2>/gu
    ),
  ].map((match) => match[1].trim())

  assert.deepEqual(
    prototypeTitles,
    printTemplateCatalog.map((template) => template.title)
  )
  assert.equal(new Set(prototypeTitles).size, printTemplateCatalog.length)
})

test('devPrototypes: 全屏预览将共享开发导航纳入 inert 背景', () => {
  assert.match(
    prototypesPageSource,
    /const pageNavRef = React\.useRef\(null\)/u
  )
  assert.match(prototypesPageSource, /pageNavRef\.current/u)
  assert.match(prototypesPageSource, /<DevPageNav\s+navRef=\{pageNavRef\}/u)
  assert.match(prototypesPageSource, /aria-label="复制当前原型资产路径"/u)
  assert.match(
    prototypesPageSource,
    /aria-label="在开发文档中打开当前原型说明"/u
  )
  assert.match(prototypesPageSource, /aria-label="全屏预览当前原型"/u)
  assert.match(prototypesPageSource, /data-prototype-focus-guard/u)
  assert.match(
    prototypesPageSource,
    /aria-current=\{selected \? 'true' : undefined\}/u
  )
})

test('devPrototypes: 构建 HTML source 和 PNG URL 资产', () => {
  const items = buildDevPrototypeItems({
    htmlModules: {
      '../../../../docs/product/prototypes/admin-command-center-v1/index.html':
        '<!doctype html><title>后台工作台样板</title>',
      '../../../../docs/product/prototypes/workflow-task-action-flow-v1/index.html':
        '<!doctype html><title>Workflow 任务处理流程样板</title>',
      '../../../../docs/product/prototypes/core-menu-coverage-v1/index.html':
        '<!doctype html><title>产品核心菜单覆盖样板</title>',
      '../../../../docs/product/prototypes/formal-menu-candidate-v1/index.html':
        '<!doctype html><title>正式菜单候选原型</title>',
      '../../../../docs/product/prototypes/audit-log-page-v1/index.html':
        '<!doctype html><title>审计日志页原型</title>',
      '../../../../docs/product/prototypes/metric-card-interaction-standard-v1/index.html':
        '<!doctype html><title>指标卡交互语义样板</title>',
      '../../../../docs/product/prototypes/business-module-page-standard-v1/index.html':
        '<!doctype html><title>业务模块标准页样板</title>',
      '../../../../docs/product/prototypes/print-template-center-v1/index.html':
        '<!doctype html><title>模板打印中心样板</title>',
      '../../../../docs/product/prototypes/business-detail-page-standard-v1/index.html':
        '<!doctype html><title>业务详情页标准样板</title>',
      '../../../../docs/product/prototypes/business-form-page-standard-v1/index.html':
        '<!doctype html><title>新建编辑表单标准样板</title>',
      '../../../../docs/product/prototypes/action-modal-drawer-standard-v1/index.html':
        '<!doctype html><title>弹窗抽屉动作标准样板</title>',
      '../../../../docs/product/prototypes/mobile-role-tasks-v1/implemented-reference.html':
        '<!doctype html><title>岗位任务端</title>',
      '../../../../docs/product/prototypes/mobile-role-tasks-v2/index.html':
        '<!doctype html><title>岗位任务中心 v2</title>',
    },
    imageModules: {
      '../../../../docs/product/prototypes/admin-command-center-v1/images/workbench-redesign-reference.png':
        '/assets/workbench-redesign-reference.png',
      '../../../../docs/product/prototypes/task-command-center-v1/images/task-board-redesign-reference.png':
        '/assets/task-board-redesign-reference.png',
      '../../../../docs/product/prototypes/business-management-center-v1/images/business-board-redesign-reference.png':
        '/assets/business-board-redesign-reference.png',
      '../../../../docs/product/prototypes/workflow-task-action-flow-v1/images/task-action-flow-redesign-reference.png':
        '/assets/task-action-flow-redesign-reference.png',
      '../../../../docs/product/prototypes/mobile-role-tasks-v1/images/mobile-role-tasks-list-reference.png':
        '/assets/mobile-role-tasks-list-reference.png',
    },
  })

  const businessPrototype = items.find(
    (item) => item.key === 'business-module-standard-page'
  )
  const commandCenterPrototype = items.find(
    (item) => item.key === 'admin-command-center'
  )
  const mobileList = items.find((item) => item.key === 'mobile-role-tasks-list')
  const menuCoveragePrototype = items.find(
    (item) => item.key === 'core-menu-coverage'
  )
  const formalMenuPrototype = items.find(
    (item) => item.key === 'formal-menu-candidate'
  )
  const metricCardPrototype = items.find(
    (item) => item.key === 'metric-card-interaction-standard'
  )
  const auditLogPrototype = items.find((item) => item.key === 'audit-log-page')
  const detailPrototype = items.find(
    (item) => item.key === 'business-detail-standard-page'
  )
  const printPrototype = items.find(
    (item) => item.key === 'print-template-center'
  )
  const formPrototype = items.find(
    (item) => item.key === 'business-form-standard-page'
  )
  const actionPrototype = items.find(
    (item) => item.key === 'action-modal-drawer-standard'
  )
  const workflowActionPrototype = items.find(
    (item) => item.key === 'workflow-task-action-flow'
  )
  const workflowActionReference = items.find(
    (item) => item.key === 'workflow-task-action-flow-redesign-reference'
  )
  const mobileV2Prototype = items.find(
    (item) => item.key === 'mobile-role-tasks-v2'
  )

  assert.equal(commandCenterPrototype?.available, true)
  assert.match(commandCenterPrototype?.source || '', /后台工作台样板/)
  assert.equal(menuCoveragePrototype?.available, true)
  assert.match(menuCoveragePrototype?.source || '', /产品核心菜单覆盖样板/)
  assert.equal(formalMenuPrototype?.available, true)
  assert.match(formalMenuPrototype?.source || '', /正式菜单候选原型/)
  assert.equal(metricCardPrototype?.available, true)
  assert.match(metricCardPrototype?.source || '', /指标卡交互语义样板/)
  assert.equal(auditLogPrototype?.available, true)
  assert.match(auditLogPrototype?.source || '', /审计日志页原型/)
  assert.equal(businessPrototype?.available, true)
  assert.match(businessPrototype?.source || '', /业务模块标准页样板/)
  assert.equal(printPrototype?.available, true)
  assert.match(printPrototype?.source || '', /模板打印中心样板/)
  assert.equal(detailPrototype?.available, true)
  assert.match(detailPrototype?.source || '', /业务详情页标准样板/)
  assert.equal(formPrototype?.available, true)
  assert.match(formPrototype?.source || '', /新建编辑表单标准样板/)
  assert.equal(actionPrototype?.available, true)
  assert.match(actionPrototype?.source || '', /弹窗抽屉动作标准样板/)
  assert.equal(workflowActionPrototype?.available, true)
  assert.match(workflowActionPrototype?.source || '', /任务处理流程样板/)
  assert.equal(workflowActionReference?.available, true)
  assert.equal(
    workflowActionReference?.url,
    '/assets/task-action-flow-redesign-reference.png'
  )
  assert.equal(mobileV2Prototype?.available, true)
  assert.match(mobileV2Prototype?.source || '', /岗位任务中心 v2/)
  assert.equal(mobileList?.available, true)
  assert.equal(mobileList?.url, '/assets/mobile-role-tasks-list-reference.png')
})

test('devPrototypes: 支持按状态和关键词筛选', () => {
  const items = buildDevPrototypeItems({
    htmlModules: {
      '../../../../docs/product/prototypes/mobile-role-tasks-v1/implemented-reference.html':
        '<!doctype html><title>岗位任务端</title>',
    },
  })

  assert.deepEqual(
    filterDevPrototypeItems(items, {
      status: DEV_PROTOTYPE_FILTERS.CURRENT,
    }).map((item) => item.key),
    ['mobile-role-tasks-implemented']
  )
  assert(
    filterDevPrototypeItems(items, {
      status: DEV_PROTOTYPE_FILTERS.REFERENCE,
      keyword: '风险',
    }).some((item) => item.key === 'mobile-role-risk-dashboard')
  )
  assert(
    filterDevPrototypeItems(items, {
      status: DEV_PROTOTYPE_FILTERS.REFERENCE,
    }).every(
      (item) =>
        !item.statuses.includes(DEV_PROTOTYPE_STATUSES.CURRENT) &&
        !item.statuses.includes(DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT)
    )
  )
  assert(
    filterDevPrototypeItems(items, {
      status: DEV_PROTOTYPE_FILTERS.CURRENT,
      keyword: '岗位任务端',
    }).some((item) => item.key === 'mobile-role-tasks-implemented')
  )
  assert(
    filterDevPrototypeItems(items, {
      status: DEV_PROTOTYPE_FILTERS.TO_IMPLEMENT,
      keyword: '51 个二级菜单',
    }).some((item) => item.key === 'core-menu-coverage')
  )
  assert(
    filterDevPrototypeItems(items, {
      status: DEV_PROTOTYPE_FILTERS.TO_IMPLEMENT,
      keyword: '12 个高频主入口',
    }).some((item) => item.key === 'formal-menu-candidate')
  )
  assert(
    filterDevPrototypeItems(items, {
      status: DEV_PROTOTYPE_FILTERS.TO_IMPLEMENT,
      keyword: '审计日志',
    }).some((item) => item.key === 'audit-log-page')
  )
  assert(
    filterDevPrototypeItems(items, {
      status: DEV_PROTOTYPE_FILTERS.TO_IMPLEMENT,
      keyword: '销售订单',
    }).some((item) => item.key === 'business-module-standard-page')
  )
  assert(
    filterDevPrototypeItems(items, {
      status: DEV_PROTOTYPE_FILTERS.TO_IMPLEMENT,
      keyword: '只读状态',
    }).some((item) => item.key === 'business-form-standard-page')
  )
  assert(
    filterDevPrototypeItems(items, {
      status: DEV_PROTOTYPE_FILTERS.TO_IMPLEMENT,
      keyword: '打印窗口',
    }).some((item) => item.key === 'print-template-center')
  )
  for (const templateName of printTemplateCatalog.map(
    (template) => template.title
  )) {
    assert(
      filterDevPrototypeItems(items, {
        status: DEV_PROTOTYPE_FILTERS.TO_IMPLEMENT,
        keyword: templateName,
      }).some((item) => item.key === 'print-template-center'),
      `${templateName} should find print-template-center`
    )
  }
  assert.deepEqual(
    filterDevPrototypeItems(items, {
      status: DEV_PROTOTYPE_FILTERS.TO_IMPLEMENT,
    }).map((item) => item.key),
    [
      'admin-command-center',
      'core-menu-coverage',
      'task-command-center',
      'workflow-task-action-flow',
      'business-management-center',
      'metric-card-interaction-standard',
      'formal-menu-candidate',
      'audit-log-page',
      'business-module-standard-page',
      'print-template-center',
      'business-task-collab-entry',
      'business-detail-standard-page',
      'business-form-standard-page',
      'action-modal-drawer-standard',
      'mobile-role-tasks-v2',
    ]
  )
  assert.equal(
    filterDevPrototypeItems(items, { keyword: '../unsafe' }).length,
    0
  )
})

test('devPrototypes: 支持筛选和当前资产本地缓存归一化', () => {
  const items = buildDevPrototypeItems()

  assert.equal(
    DEV_PROTOTYPE_SELECTED_STORAGE_KEY,
    'plush_erp_dev_prototype_selected_key'
  )
  assert.equal(
    DEV_PROTOTYPE_STATUS_FILTER_STORAGE_KEY,
    'plush_erp_dev_prototype_status_filter'
  )
  assert.equal(
    normalizeDevPrototypeStatusFilter(DEV_PROTOTYPE_FILTERS.TO_IMPLEMENT),
    DEV_PROTOTYPE_FILTERS.TO_IMPLEMENT
  )
  assert.equal(
    normalizeDevPrototypeStatusFilter('missing-filter'),
    DEV_PROTOTYPE_FILTERS.ALL
  )
  assert.equal(
    normalizeDevPrototypeSelectedKey('mobile-role-tasks-implemented', items),
    'mobile-role-tasks-implemented'
  )
  assert.equal(
    normalizeDevPrototypeSelectedKey('missing-prototype', items),
    items[0].key
  )
  assert.equal(normalizeDevPrototypeSelectedKey('', []), '')
})

test('devPrototypes: 支持置顶资产并清理无效 pin key', () => {
  const items = buildDevPrototypeItems()
  const pinnedKeys = normalizeDevPrototypePinnedKeys(
    [
      'mobile-role-tasks-list',
      'missing-key',
      'mobile-role-tasks-list',
      'business-module-standard-page',
    ],
    items
  )

  assert.equal(
    DEV_PROTOTYPE_PINNED_STORAGE_KEY,
    'plush_erp_dev_prototype_pinned_keys'
  )
  assert.deepEqual(pinnedKeys, [
    'mobile-role-tasks-list',
    'business-module-standard-page',
  ])

  const sortedItems = applyDevPrototypePinnedState(items, pinnedKeys)
  assert.deepEqual(
    sortedItems.slice(0, 2).map((item) => item.key),
    ['mobile-role-tasks-list', 'business-module-standard-page']
  )
  assert.deepEqual(
    sortedItems
      .filter((item) => item.pinned)
      .map((item) => [item.key, item.pinnedRank]),
    [
      ['mobile-role-tasks-list', 0],
      ['business-module-standard-page', 1],
    ]
  )
})

test('devPrototypes: 按所属目录分组并清理无效展开目录', () => {
  const items = buildDevPrototypeItems()
  const groups = groupDevPrototypeItemsByDirectory(items)

  assert.equal(
    DEV_PROTOTYPE_EXPANDED_GROUPS_STORAGE_KEY,
    'plush_erp_dev_prototype_expanded_groups'
  )
  assert.deepEqual(
    groups.map((group) => group.directory),
    [
      'admin-command-center-v1/',
      'admin-command-center-v1/images/',
      'core-menu-coverage-v1/',
      'task-command-center-v1/',
      'task-command-center-v1/images/',
      'workflow-task-action-flow-v1/',
      'workflow-task-action-flow-v1/images/',
      'business-management-center-v1/',
      'business-management-center-v1/images/',
      'metric-card-interaction-standard-v1/',
      'formal-menu-candidate-v1/',
      'audit-log-page-v1/',
      'business-module-page-standard-v1/',
      'print-template-center-v1/',
      'business-detail-page-standard-v1/',
      'business-form-page-standard-v1/',
      'action-modal-drawer-standard-v1/',
      'business-module-page-standard-v1/images/',
      'mobile-role-tasks-v2/',
      'mobile-role-tasks-v1/',
      'mobile-role-tasks-v1/images/',
    ]
  )
  assert.deepEqual(
    groups.map((group) => group.items.length),
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 3, 1, 1, 3]
  )

  assert.deepEqual(
    normalizeDevPrototypeExpandedGroupKeys(
      [
        'mobile-role-tasks-v1/images/',
        'missing-directory/',
        'mobile-role-tasks-v1/images/',
      ],
      groups.map((group) => group.key)
    ),
    ['mobile-role-tasks-v1/images/']
  )
})

test('devPrototypes: asset、filter 和关键词由 canonical query 驱动', () => {
  assert.match(prototypesPageSource, /useSearchParams\(\)/)
  assert.match(prototypesPageSource, /const ASSET_QUERY_KEY = 'asset'/)
  assert.match(prototypesPageSource, /const FILTER_QUERY_KEY = 'filter'/)
  assert.match(prototypesPageSource, /const KEYWORD_QUERY_KEY = 'q'/)
  assert.match(prototypesPageSource, /searchParams\.has\(FILTER_QUERY_KEY\)/)
  assert.match(prototypesPageSource, /searchParams\.has\(ASSET_QUERY_KEY\)/)
  assert.match(
    prototypesPageSource,
    /setSearchParams\(nextParams, \{ replace: true \}\)/
  )
  assert.doesNotMatch(
    prototypesPageSource,
    /\[\s*statusFilter\s*,\s*setStatusFilter\s*\]/
  )
  assert.doesNotMatch(
    prototypesPageSource,
    /\[\s*selectedKey\s*,\s*setSelectedKey\s*\]/
  )
  assert.doesNotMatch(
    prototypesPageSource,
    /\[\s*keyword\s*,\s*setKeyword\s*\]/
  )
})
