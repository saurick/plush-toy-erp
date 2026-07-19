import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

function readSource(relativePath) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8'
  )
}

function sourceSlice(source, start, end) {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  assert.ok(startIndex >= 0, `missing source anchor: ${start}`)
  assert.ok(endIndex > startIndex, `missing source anchor: ${end}`)
  return source.slice(startIndex, endIndex)
}

function matchingBraceIndex(source, openingBraceIndex) {
  let depth = 0
  for (let index = openingBraceIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') depth -= 1
    if (depth === 0) return index
  }
  assert.fail('conditional branch has no matching closing brace')
}

function conditionalBranches(source, condition, fromIndex = 0) {
  const conditionAnchor = `if (${condition})`
  const conditionIndex = source.indexOf(conditionAnchor, fromIndex)
  assert.ok(conditionIndex >= 0, `missing conditional: ${conditionAnchor}`)

  const truthyOpen = source.indexOf(
    '{',
    conditionIndex + conditionAnchor.length
  )
  const truthyClose = matchingBraceIndex(source, truthyOpen)
  const elseIndex = source.indexOf('else', truthyClose + 1)
  assert.ok(elseIndex >= 0, `missing else branch: ${conditionAnchor}`)
  const falsyOpen = source.indexOf('{', elseIndex + 4)
  const falsyClose = matchingBraceIndex(source, falsyOpen)

  return {
    falsy: source.slice(falsyOpen + 1, falsyClose),
    nextIndex: falsyClose + 1,
    truthy: source.slice(truthyOpen + 1, truthyClose),
  }
}

const masterDataSource = readSource('../pages/V1MasterDataPage.jsx')
const salesOrderSource = readSource('../pages/V1SalesOrdersPage.jsx')
const purchaseOrderSource = readSource('../pages/V1PurchaseOrdersPage.jsx')
const outsourcingOrderSource = readSource(
  '../pages/V1OutsourcingOrdersPage.jsx'
)
const bomSource = readSource('../pages/BOMVersionsPage.jsx')
const shipmentSource = readSource('../pages/ShipmentsPage.jsx')
const productionOrderSource = readSource('../pages/V1ProductionOrdersPage.jsx')
const purchaseReceiptSource = readSource('../pages/V1PurchaseReceiptsPage.jsx')
const qualitySource = readSource('../pages/V1QualityInspectionsPage.jsx')
const operationalFactsSource = readSource('../pages/OperationalFactsPage.jsx')
const permissionCenterSource = readSource('../pages/PermissionCenterPage.jsx')
const purchaseOperationPanelSource = readSource(
  '../components/purchase-orders/PurchaseOrderOperationPanel.jsx'
)
const businessListLayoutSource = readSource(
  '../components/business-list/BusinessListLayout.jsx'
)

test('newest-first master-data creates return to page one while edits and ordered processes stay on the current page', () => {
  const mutation = sourceSlice(
    masterDataSource,
    'const saveRecord = async () => {',
    'const toggleRecordActive'
  )

  assert.match(mutation, /const isCreatingRecord = !editingRecord\?\.id/u)
  assert.match(
    mutation,
    /const shouldShowCreatedRecordOnFirstPage =\s*isCreatingRecord && effectiveType !== 'processes'/u
  )

  let nextIndex = 0
  for (const saveOutcome of ['partial image save', 'complete save']) {
    const branches = conditionalBranches(
      mutation,
      'shouldShowCreatedRecordOnFirstPage',
      nextIndex
    )
    assert.match(
      branches.truthy,
      /resetBusinessPaginationCurrent\(setPagination\)/u,
      `${saveOutcome} must reset a newly created record to page one`
    )
    assert.doesNotMatch(branches.truthy, /loadRecords\(\)/u)
    assert.match(
      branches.falsy,
      /await loadRecords\(\)/u,
      `${saveOutcome} must refresh edits and ordered process records in place`
    )
    assert.doesNotMatch(
      branches.falsy,
      /resetBusinessPaginationCurrent\(setPagination\)/u
    )
    nextIndex = branches.nextIndex
  }
})

for (const pageCase of [
  {
    title: '销售订单',
    source: salesOrderSource,
    start: 'const saveOrder = async () => {',
    end: 'const runLifecycleAction',
    resetPattern: /resetBusinessPaginationCurrent\(setPagination\)/u,
  },
  {
    title: '采购订单',
    source: purchaseOrderSource,
    start: 'const handleSave = async () => {',
    end: 'const runLifecycleAction',
    resetPattern:
      /setPagination\(\(current\) => \(\{ \.\.\.current, current: 1 \}\)\)/u,
  },
]) {
  test(`${pageCase.title} create resets page one and edit refreshes the current page`, () => {
    const mutation = sourceSlice(pageCase.source, pageCase.start, pageCase.end)
    assert.match(mutation, /const isCreatingOrder = !editingOrder\?\.id/u)

    const branches = conditionalBranches(mutation, 'isCreatingOrder')
    assert.match(branches.truthy, pageCase.resetPattern)
    assert.doesNotMatch(branches.truthy, /loadOrders\b/u)
    assert.match(branches.falsy, /loadOrders\b/u)
    assert.doesNotMatch(branches.falsy, pageCase.resetPattern)
  })
}

test('outsourcing create resets only the order page while edit refreshes the current page and workflow tasks', () => {
  const mutation = sourceSlice(
    outsourcingOrderSource,
    'const submitForm = async () => {',
    'const runLifecycleAction'
  )
  assert.match(mutation, /const isCreatingOrder = !editingRow\?\.id/u)

  const conditionIndex = mutation.indexOf('if (isCreatingOrder)')
  const createOpen = mutation.indexOf('{', conditionIndex)
  const createClose = matchingBraceIndex(mutation, createOpen)
  const createBranch = mutation.slice(createOpen + 1, createClose)
  const editTail = mutation.slice(createClose + 1)
  assert.match(
    createBranch,
    /setPagination\(\(current\) => \(\{ \.\.\.current, current: 1 \}\)\)/u
  )
  assert.match(createBranch, /await loadWorkflowTasks\(\)/u)
  assert.match(createBranch, /return/u)
  assert.doesNotMatch(createBranch, /loadOrders\(\)/u)
  assert.match(
    editTail,
    /await Promise\.all\(\[loadOrders\(\), loadWorkflowTasks\(\)\]\)/u
  )
  assert.doesNotMatch(editTail, /setPagination/u)
})

test('production order create writes page one while edit refreshes the current query page', () => {
  const mutation = sourceSlice(
    productionOrderSource,
    'const submitDraft = async (values) => {',
    'const runLifecycle'
  )
  assert.match(mutation, /const isCreate = formMode === 'create'/u)

  const conditionIndex = mutation.indexOf('if (isCreate)')
  const createOpen = mutation.indexOf('{', conditionIndex)
  const createClose = matchingBraceIndex(mutation, createOpen)
  const createBranch = mutation.slice(createOpen + 1, createClose)
  const editTail = mutation.slice(createClose + 1)
  assert.match(createBranch, /writeQuery\(\{ page: 1 \}\)/u)
  assert.match(createBranch, /return/u)
  assert.doesNotMatch(createBranch, /refreshAfterSuccess\(\)/u)
  assert.match(editTail, /await refreshAfterSuccess\(\)/u)
  assert.doesNotMatch(editTail, /writeQuery\(\{ page: 1 \}\)/u)
})

test('BOM create and copy reset page one while editing refreshes the current page', () => {
  const mutation = sourceSlice(
    bomSource,
    'const saveHeader = async () => {',
    'const activateSelected'
  )
  assert.match(mutation, /const isCreatingVersion = headerMode !== 'edit'/u)

  const branches = conditionalBranches(mutation, 'isCreatingVersion')
  assert.match(
    branches.truthy,
    /resetBusinessPaginationCurrent\(setPagination\)/u
  )
  assert.doesNotMatch(branches.truthy, /loadVersions\(\)/u)
  assert.match(branches.falsy, /await loadVersions\(\)/u)
  assert.doesNotMatch(
    branches.falsy,
    /resetBusinessPaginationCurrent\(setPagination\)/u
  )
})

test('create-only shipment, incoming-quality, and operational-fact flows return their list to page one', () => {
  const shipmentCreate = sourceSlice(
    shipmentSource,
    'const submitShipmentModal = async () => {',
    'const runShipmentAction'
  )
  assert.match(shipmentCreate, /createShipmentWithItems\(/u)
  assert.match(
    shipmentCreate,
    /resetBusinessPaginationCurrent\(setPagination\)/u
  )
  assert.doesNotMatch(shipmentCreate, /loadRows\(\)/u)

  const qualityCreate = sourceSlice(
    qualitySource,
    'const handleCreateInspection = useCallback(async () => {',
    'const markInspectionReturned'
  )
  assert.match(qualityCreate, /createQualityInspectionDraft\(/u)
  assert.match(
    qualityCreate,
    /resetBusinessPaginationCurrent\(setPagination\)/u
  )
  assert.doesNotMatch(qualityCreate, /loadRows\(\)/u)

  const productionReworkCreate = sourceSlice(
    operationalFactsSource,
    'const submitProductionRework = async (values) => {',
    'const confirmFinanceCancellation'
  )
  assert.match(
    productionReworkCreate,
    /createProductionReworkFromCompletion\(/u
  )
  assert.match(productionReworkCreate, /resetPaginationForKey\('production'\)/u)
  assert.doesNotMatch(productionReworkCreate, /loadRows\('production'\)/u)

  const financeReconciliationCreate = sourceSlice(
    operationalFactsSource,
    'const submitFinanceSourceAction = async (values) => {',
    'const viewOutsourcingPayable'
  )
  assert.match(
    financeReconciliationCreate,
    /createReconciliationFromFinanceFact\(/u
  )
  assert.match(
    financeReconciliationCreate,
    /resetPaginationForKey\(currentActiveKey\)/u
  )
  assert.doesNotMatch(
    financeReconciliationCreate,
    /loadRows\(currentActiveKey\)/u
  )
})

test('permission-center create resets page one and row edits preserve the current page', () => {
  const createMutation = sourceSlice(
    permissionCenterSource,
    'const createAdmin = async (values) => {',
    'const saveAdminRoles'
  )
  assert.match(createMutation, /adminRpc\.call\('create'/u)
  assert.match(
    createMutation,
    /setTablePagination\(\(prev\) => \(\{ \.\.\.prev, current: 1 \}\)\)/u
  )
  assert.ok(
    createMutation.indexOf('setTablePagination') <
      createMutation.indexOf('await loadData()'),
    'page one must be selected before the created admin list is reloaded'
  )

  for (const editCase of [
    [
      '岗位编辑',
      'const saveAdminRoles = async () => {',
      'const saveAdminPhone',
    ],
    [
      '手机号编辑',
      'const saveAdminPhone = async () => {',
      'const saveRolePermissions',
    ],
    [
      '启停状态编辑',
      'const applyAdminStatus = async (values) => {',
      'const resetAdminPassword',
    ],
    [
      '密码重置',
      'const resetAdminPassword = async (values) => {',
      'const onToggleAdminStatus',
    ],
    [
      '账号注销',
      'const revokeAdminAccount = async (values) => {',
      'const columns =',
    ],
  ]) {
    const [title, start, end] = editCase
    const editMutation = sourceSlice(permissionCenterSource, start, end)
    assert.match(
      editMutation,
      /await loadData\(\)/u,
      `${title} must refresh rows`
    )
    assert.doesNotMatch(
      editMutation,
      /setTablePagination/u,
      `${title} must preserve the current page`
    )
  }
})

test('purchase sort changes reset page one before applying the new server sort', () => {
  const sortControl = sourceSlice(
    purchaseOperationPanelSource,
    'className="erp-business-filter-control--sort"',
    'actions={'
  )
  assert.match(
    sortControl,
    /onChange=\{\(value\) => \{\s*resetPagination\(\)\s*setSortValue\(value\)\s*\}\}/u
  )
  assert.ok(
    sortControl.indexOf('resetPagination()') <
      sortControl.indexOf('setSortValue(value)'),
    'page reset must be scheduled before the sort state changes'
  )
})

test('server-paginated tables label function sorters as current-page sorting', () => {
  const dataTable = sourceSlice(
    businessListLayoutSource,
    'export function BusinessDataTable({',
    'export function ToolbarButton'
  )
  assert.match(
    dataTable,
    /pagination &&\s*resolvedColumns\.some\(\(column\) => typeof column\?\.sorter === 'function'\)/u
  )
  assert.match(
    dataTable,
    /showSorterTooltip=\{\s*hasPageLocalSorter \? \{ title: '仅排序当前页' \} : undefined\s*\}/u
  )
})

test('exact linked-record routes use a one-record page instead of injecting into paginated rows', () => {
  for (const [title, source] of [
    ['销售订单', salesOrderSource],
    ['采购订单', purchaseOrderSource],
    ['加工合同', outsourcingOrderSource],
    ['生产订单', productionOrderSource],
    ['出货单', shipmentSource],
    ['采购入库单', purchaseReceiptSource],
    ['质量检验单', qualitySource],
  ]) {
    assert.match(
      source,
      /const exactPage = resolveExactRecordPage\(\{/u,
      `${title} must resolve exact route records outside ordinary page totals`
    )
    assert.match(source, /setTotal\(exactPage\.total\)/u)
    assert.doesNotMatch(
      source,
      /setTotal\([\s\S]{0,180}\? 1\s*:\s*0/u,
      `${title} must not increment the server total for an existing cross-page record`
    )
  }
})
