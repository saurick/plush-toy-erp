import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./V1QualityInspectionsPage.jsx', import.meta.url),
  'utf8'
)

test('quality page uses exact purchase return permission and dedicated source command', () => {
  assert.match(source, /'purchase\.return\.create'/u)
  assert.match(source, /'purchase\.return\.read'/u)
  assert.match(source, /createPurchaseReturnFromQualityInspection/u)
  assert.match(source, /isRejectedIncomingInspection/u)
  assert.doesNotMatch(
    source,
    /warehouse\.adjustment\.create|purchase\.order\.update/u
  )
})

test('quality rejection return retries safely and validates the returned source trace', () => {
  assert.match(
    source,
    /listAllPurchaseReceipts\(\{\}, \{ signal: request\.signal \}\)/u
  )
  assert.doesNotMatch(source, /listPurchaseReceipts\(\{ limit:/u)
  assert.match(
    source,
    /listAllPurchaseReturns\(\s*compactParams\(\{[\s\S]*?quality_inspection_id: inspection\.id/u
  )
  assert.doesNotMatch(source, /listPurchaseReturns\([\s\S]{0,180}limit:\s*20/u)
  assert.match(source, /getPurchaseReceipt\(\{ id: receiptID \}\)/u)
  assert.match(source, /selectedRowPurchaseReceiptRequestRef/u)
  assert.match(source, /未能确认来源收货已入库，暂不能生成采购退货/u)
  const openAction = source.slice(
    source.indexOf('const openPurchaseReturn'),
    source.indexOf('const closePurchaseReturn')
  )
  assert.match(
    openAction,
    /canCreatePurchaseReturnFromRejectedInspection\(\s*inspection,\s*sourceReceipt\s*\)/u
  )
  assert.match(
    openAction,
    /首次到货检验不合格只会阻止入库；只有已入库后追加检验不合格才可退供应商/u
  )
  assert.doesNotMatch(openAction, /findByPositiveID\([\s\S]*purchaseReceipts/u)
  const action = source.slice(
    source.indexOf('const submitPurchaseReturn'),
    source.indexOf('const runInspectionAction')
  )
  assert.match(action, /purchaseReturnInFlightRef\.current/u)
  assert.match(action, /purchaseReturnAttemptsRef\.current\.prepare/u)
  assert.match(action, /purchaseReturnAttemptsRef\.current\.settle/u)
  assert.match(action, /quality_inspection_id/u)
  assert.match(action, /created\?\.status/u)
  assert.match(action, /await loadRows\(\)/u)
  assert.match(
    action,
    /暂时无法确认是否处理成功，请保持内容不变后重试，避免重复记录/u
  )
})

test('quality source references use latest-wins readiness and fail closed for source-driven creation', () => {
  const loader = source.slice(
    source.indexOf('const loadReferenceOptions'),
    source.indexOf('const clearRouteContext')
  )
  assert.match(source, /useState\('loading'\)/u)
  assert.match(loader, /beginLatestRequest\('reference-options'\)/u)
  for (const functionName of [
    'listAllPurchaseReceipts',
    'listAllInventoryLots',
    'listAllMaterials',
    'listAllProducts',
    'listAllWarehouses',
  ]) {
    assert.match(
      loader,
      new RegExp(`${functionName}\\([\\s\\S]*?signal: request\\.signal`, 'u')
    )
  }
  assert.match(loader, /if \(!request\.isCurrent\(\)\) return false/u)
  assert.match(loader, /setReferenceDataState\('ready'\)/u)
  assert.match(loader, /setReferenceDataState\('error'\)/u)
  assert.match(
    source,
    /Promise\.all\(\[\s*loadRows\(\),\s*loadReferenceOptions\(\)/u
  )
  assert.match(source, /referenceDataState !== 'ready'/u)
  assert.match(source, /质检来源资料加载失败，请先刷新当前页后重试/u)
  assert.match(source, /referenceDataReady=\{referenceDataState === 'ready'\}/u)
})

test('incoming quality create submits only source selectors and customer context', () => {
  const createAction = source.slice(
    source.indexOf('const handleCreateInspection'),
    source.indexOf('const markInspectionReturned')
  )
  assert.match(createAction, /customer_key: activeCustomerKey/u)
  assert.match(createAction, /buildInspectionParams\(values\)/u)
  for (const forgedField of [
    'values.inventory_lot_id',
    'values.material_id',
    'values.warehouse_id',
    'values.source_type',
    'values.source_id',
  ]) {
    assert.equal(createAction.includes(forgedField), false)
  }
})

test('quality page mounts the return modal and marks a successful source once', () => {
  assert.match(source, /<QualityInspectionPurchaseReturnModal/u)
  assert.match(source, /markInspectionReturned\(inspection\.id\)/u)
  assert.match(source, /returnedInspectionIDs\.has\(selectedRow\.id\)/u)
  assert.match(source, /已生成退货/u)
})

test('quality page preserves the source receipt numeric(20,6) quantity string', () => {
  assert.match(
    source,
    /formatQuantity\(\s*selectedPurchaseReceiptItem\.quantity\s*\)/u
  )
  assert.doesNotMatch(
    source,
    /decimalNumber\(selectedPurchaseReceiptItem\.quantity/u
  )
})

test('quality page names and filters the shared read model by business inspection type', () => {
  assert.match(source, /title="质量检验"/u)
  assert.match(source, /QUALITY_INSPECTION_TYPE_FILTER_OPTIONS/u)
  assert.match(source, /inspection_type: inspectionTypeFilter/u)
  assert.match(source, /listOutsourcingReturnQualityInspections/u)
  assert.match(source, /listFinishedGoodsQualityInspections/u)
  assert.match(source, /listProductionStageQualityInspections/u)
  assert.match(source, /inspectionTypeFilter === 'OUTSOURCING_RETURN'/u)
  assert.match(source, /inspectionTypeFilter === 'FINISHED_GOODS'/u)
  assert.match(source, /inspectionTypeFilter === 'PRODUCTION_STAGE'/u)
  assert.match(source, /listAllProducts/u)
  assert.match(source, /productOptions/u)
  assert.match(source, /selectedSourceType === 'PURCHASE_RECEIPT'/u)
  assert.match(source, /source_type: selectedRow\.source_type/u)
  assert.match(source, /selectedSourceType === 'SHIPMENT'/u)
  assert.match(source, /shipment_id: selectedRow\.source_id/u)
  assert.match(source, /'shipment\.read'/u)
  assert.match(source, /'warehouse\.inventory\.read'/u)
  assert.match(source, /'purchase\.receipt\.read'/u)
  assert.match(source, /relatedMenuItems\.length > 0/u)
  assert.doesNotMatch(source, /relatedMenuItems\.length === 0/u)
  assert.doesNotMatch(source, /title="来料质检"/u)
})

test('quality page describes generic and production-stage sources without collapsing quality gates', () => {
  assert.match(source, /采购到货、委外回货、出货关联成品和生产 WIP 分段关口/u)
  assert.match(source, /裁片、皮套、成品、针检、抽检及订单要求的客户验货/u)
  assert.match(source, /每张质检单只代表当前在制批次和当前关口/u)
  assert.match(
    source,
    /首次到货检验不合格可按来源行和部分数量办理退厂或补换；补换确认生成新的待收与待检记录，原收货不会因部分处置被整单取消/u
  )
})

test('production-stage filter uses the WIP read model without inventory lot or warehouse filters', () => {
  const productionStageBranch = source.slice(
    source.indexOf("inspectionTypeFilter === 'PRODUCTION_STAGE'"),
    source.indexOf(
      '} else {',
      source.indexOf("inspectionTypeFilter === 'PRODUCTION_STAGE'")
    )
  )
  assert.match(
    productionStageBranch,
    /listProductionStageQualityInspections\(baseParams/u
  )
  assert.doesNotMatch(
    productionStageBranch,
    /inventorySourceParams|warehouse_id|inventory_lot_id/u
  )
  assert.match(
    source,
    /routeSelectedID > 0 && inspectionTypeFilter !== 'PRODUCTION_STAGE'/u
  )
  assert.match(source, /const listedRouteInspection =/u)
  assert.match(source, /setWarehouseFilter\(''\)/u)
  assert.match(source, /setLotFilter\(''\)/u)
  assert.equal(
    source.match(/disabled=\{inspectionTypeFilter === 'PRODUCTION_STAGE'\}/gu)
      ?.length,
    2
  )
})

test('production-stage decision summary displays backend business snapshots and never guesses from IDs', () => {
  const summary = source.slice(
    source.indexOf('if (isProductionStageQualityInspection(inspection))'),
    source.indexOf('const recordedSourceNo')
  )
  for (const businessField of [
    'production_order_no',
    'product_code',
    'product_name',
    'operation_name',
    'wip_batch_no',
    'batch_quantity',
    'gate_code',
  ]) {
    assert.match(summary, new RegExp(`inspection\\?\\.${businessField}`, 'u'))
  }
  assert.doesNotMatch(
    summary,
    /production_order_id|production_order_item_id|production_wip_batch_id|source_id|subject_id|defect_quantity|inspector_name|\bremark\b/u
  )
  assert.match(
    source,
    /if \(selectedSourceType === 'PRODUCTION_WIP'\) return \[\]/u
  )
  assert.match(
    summary,
    /if \(isProductionStageQualityInspection\(inspection\)\)\s*\{\s*return\s*\{/u
  )
  assert.match(
    source,
    /type="link"[\s\S]*?disabled=\{!selectedRow\}[\s\S]*?清空已选/u
  )
})

test('quality decision requires an estimated source-document defect rate without deriving return quantity', () => {
  assert.match(source, /defect_rate_selection: undefined/u)
  assert.match(source, /defect_rate_custom_percent: undefined/u)
  assert.match(source, /buildDecisionParams\(inspection\.id, values/u)
  assert.match(source, /来源单据：\$\{decisionSourceSummary\.sourceNo\}/u)
  assert.match(source, /inspection\?\.source_no/u)
  assert.match(source, /按来源记录估算不良比例/u)
  assert.match(source, /后续返工、退货或阻断仍由对应来源业务办理/u)
  assert.doesNotMatch(source, /defect_rate_percent\s*\*\s*quantity/u)
})
