import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PRODUCTION_WIP_ACTION,
  PRODUCTION_WIP_EXECUTION_MODE,
  PRODUCTION_WIP_QUANTITY_MAX_LENGTH,
  PRODUCTION_WIP_ROUTE_CODE,
  buildProductionWipActionParams,
  buildProductionWipConservingSplits,
  buildProductionWipFabricContractOptions,
  buildProductionWipOutsourcingCandidateOptions,
  compareProductionWipQuantity,
  currentProductionWipOperation,
  nextProductionWipOperation,
  normalizeProductionWipQuantity,
  partitionProductionCompletionItems,
  productionWipBatchForOperation,
  productionWipBatchLabel,
  productionWipCompletionEligibility,
  productionWipFabricMaterialRequirements,
  productionWipMaterialOutsourcingCandidateMatches,
  productionWipOperationsForBatch,
  productionWipOrderItem,
  productionWipOutsourcingCandidateMatches,
  productionWipPackagingConfirmationForBatch,
  productionWipQualitySummary,
  validateProductionWipAggregate,
} from './productionWipModel.mjs'

function aggregateFixture(patch = {}) {
  return {
    production_order: {
      id: 7,
      order_no: 'PO-SEW-001',
      status: 'RELEASED',
      version: 2,
    },
    production_order_items: [
      {
        id: 11,
        production_order_id: 7,
        line_no: 1,
        product_id: 101,
        product_sku_id: 102,
        unit_id: 103,
        planned_quantity: '120',
        product_code_snapshot: 'BEAR-20',
        product_name_snapshot: '毛绒小熊',
        sku_code_snapshot: 'BROWN-20CM',
        unit_name_snapshot: '只',
        route_code: 'PLUSH_SEW_HAND_V1',
        customer_inspection_required: false,
      },
    ],
    material_requirements: [
      {
        id: 21,
        production_order_id: 7,
        production_order_item_id: 11,
        bom_header_id: 12,
        bom_item_id: 13,
        material_id: 301,
        unit_id: 302,
        production_operation_code: 'FABRIC_PROCESSING',
        unit_quantity_snapshot: '0.5',
        loss_rate_snapshot: '0',
        planned_quantity: '60',
        issued_quantity: '60',
        remaining_quantity: '0',
        material_code_snapshot: 'FABRIC-BROWN',
        material_name_snapshot: '棕色短毛绒布',
        unit_code_snapshot: 'M',
        unit_name_snapshot: '米',
        created_at: 1784210000,
        updated_at: 1784210000,
      },
    ],
    production_wip_batches: [
      {
        id: 31,
        production_order_id: 7,
        production_order_item_id: 11,
        production_order_operation_id: 41,
        source_batch_id: null,
        batch_no: 'WIP-001',
        flow_type: 'NORMAL',
        execution_mode: 'OUTSOURCED',
        status: 'ACCEPTED',
        version: 3,
        quantity: '120',
        rework_reason: null,
        created_by: 1,
        started_at: 1784210100,
        completed_at: 1784210200,
        created_at: 1784210000,
        updated_at: 1784210200,
      },
      {
        id: 32,
        production_order_id: 7,
        production_order_item_id: 11,
        production_order_operation_id: 42,
        source_batch_id: 31,
        batch_no: 'WIP-002',
        flow_type: 'NORMAL',
        execution_mode: 'IN_HOUSE',
        status: 'WAITING_QUALITY',
        version: 2,
        quantity: '120',
        rework_reason: null,
        created_by: 1,
        started_at: 1784210300,
        completed_at: 1784210400,
        created_at: 1784210250,
        updated_at: 1784210400,
      },
    ],
    outsourcing_allocations: [
      {
        id: 71,
        production_wip_batch_id: 31,
        outsourcing_order_item_id: 81,
        production_order_material_requirement_id: 21,
        subject_type: 'MATERIAL',
        allocated_quantity: '60',
        unit_id: 302,
        created_by: 1,
        created_at: 1784210000,
      },
    ],
    production_order_operations: [
      {
        id: 42,
        production_order_id: 7,
        production_order_item_id: 11,
        route_code: 'PLUSH_SEW_HAND_V1',
        route_version: 1,
        step_no: 20,
        operation_code: 'SEWING',
        process_id: 202,
        process_code_snapshot: 'SEWING',
        process_name_snapshot: '车缝',
        output_code: 'SHELL',
        inhouse_allowed: true,
        outsourcing_allowed: true,
        planned_quantity: '120',
        required_quality_gates: ['SHELL'],
        business_confirmation_code: null,
        created_at: 1784210000,
      },
      {
        id: 41,
        production_order_id: 7,
        production_order_item_id: 11,
        route_code: 'PLUSH_SEW_HAND_V1',
        route_version: 1,
        step_no: 10,
        operation_code: 'FABRIC_PROCESSING',
        process_id: 201,
        process_code_snapshot: 'FABRIC_PROCESSING',
        process_name_snapshot: '布料加工',
        output_code: 'CUT_PIECE',
        inhouse_allowed: false,
        outsourcing_allowed: true,
        planned_quantity: '120',
        required_quality_gates: ['CUT_PIECE'],
        business_confirmation_code: null,
        created_at: 1784210000,
      },
      {
        id: 43,
        production_order_id: 7,
        production_order_item_id: 11,
        route_code: 'PLUSH_SEW_HAND_V1',
        route_version: 1,
        step_no: 30,
        operation_code: 'HANDWORK',
        process_id: 203,
        process_code_snapshot: 'HANDWORK',
        process_name_snapshot: '手工',
        output_code: 'FINISHED_GOODS',
        inhouse_allowed: true,
        outsourcing_allowed: true,
        planned_quantity: '120',
        required_quality_gates: ['FINISHED_GOODS', 'NEEDLE', 'SAMPLING'],
        business_confirmation_code: null,
        created_at: 1784210000,
      },
      {
        id: 44,
        production_order_id: 7,
        production_order_item_id: 11,
        route_code: 'PLUSH_SEW_HAND_V1',
        route_version: 1,
        step_no: 40,
        operation_code: 'PACKAGING',
        process_id: 204,
        process_code_snapshot: 'PACKAGING',
        process_name_snapshot: '包装',
        output_code: 'PACKED_GOODS',
        inhouse_allowed: true,
        outsourcing_allowed: false,
        planned_quantity: '120',
        required_quality_gates: [],
        business_confirmation_code: 'PACKAGING_MATERIAL',
        created_at: 1784210000,
      },
    ],
    quality_inspections: [
      {
        id: 51,
        inspection_no: 'QI-WIP-001',
        production_wip_batch_id: 31,
        gate_code: 'CUT_PIECE',
        status: 'PASSED',
        result: 'PASS',
      },
      {
        id: 52,
        inspection_no: 'QI-WIP-002',
        production_wip_batch_id: 32,
        gate_code: 'SHELL',
        status: 'SUBMITTED',
        result: null,
      },
    ],
    packaging_confirmations: [
      {
        id: 61,
        production_order_id: 7,
        production_order_item_id: 11,
        status: 'PENDING',
        version: 1,
        packaging_version_snapshot: null,
        confirmed_by: null,
        confirmed_at: null,
        note: null,
        created_at: 1784210000,
        updated_at: 1784210000,
      },
    ],
    ...patch,
  }
}

test('production WIP aggregate validates canonical route snapshots, batches and formal quality facts', () => {
  const aggregate = validateProductionWipAggregate(aggregateFixture(), {
    productionOrderID: 7,
  })
  assert.equal(aggregate.initialized, true)
  assert.equal(aggregate.productionOrder.order_no, 'PO-SEW-001')
  assert.deepEqual(
    aggregate.operations.map((operation) => operation.operation_code),
    ['FABRIC_PROCESSING', 'SEWING', 'HANDWORK', 'PACKAGING']
  )
  assert.equal(aggregate.qualityInspections.length, 2)
  assert.equal(
    productionWipPackagingConfirmationForBatch(aggregate, aggregate.batches[1])
      .version,
    1
  )
  const batch = aggregate.batches[1]
  assert.equal(currentProductionWipOperation(aggregate, batch).id, 42)
  assert.equal(
    productionWipBatchForOperation(aggregate, batch, aggregate.operations[0])
      .id,
    31
  )
  assert.equal(
    productionWipQualitySummary(aggregate, batch),
    '皮套检验：检验中'
  )
})

test('production WIP aggregate fails closed for invented statuses and dangling business references', () => {
  const inventedStatus = aggregateFixture()
  inventedStatus.production_wip_batches[1] = {
    ...inventedStatus.production_wip_batches[1],
    status: 'READY',
  }
  assert.throws(
    () => validateProductionWipAggregate(inventedStatus),
    /生产工序信息不完整/u
  )

  const danglingOperation = aggregateFixture()
  danglingOperation.production_wip_batches[1] = {
    ...danglingOperation.production_wip_batches[1],
    production_order_operation_id: 999,
  }
  assert.throws(
    () => validateProductionWipAggregate(danglingOperation),
    /生产工序信息不完整/u
  )

  const wrongGate = aggregateFixture()
  wrongGate.quality_inspections[1] = {
    ...wrongGate.quality_inspections[1],
    gate_code: 'NEEDLE',
  }
  assert.throws(
    () => validateProductionWipAggregate(wrongGate),
    /生产工序信息不完整/u
  )

  const concession = aggregateFixture()
  concession.quality_inspections[0] = {
    ...concession.quality_inspections[0],
    result: 'CONCESSION',
  }
  assert.throws(
    () => validateProductionWipAggregate(concession),
    /生产工序信息不完整/u,
    '生产阶段质量关口必须明确合格，不能把让步接收当成路线通过'
  )
})

test('production WIP aggregate permits a fully uninitialized route but not a half-built route', () => {
  const uninitialized = validateProductionWipAggregate({
    production_order: {
      id: 7,
      order_no: 'PO-SEW-001',
      status: 'RELEASED',
      version: 2,
    },
    production_order_items: aggregateFixture().production_order_items,
    production_wip_batches: [],
    material_requirements: [],
    outsourcing_allocations: [],
    production_order_operations: [],
    packaging_confirmations: [],
    quality_inspections: [],
  })
  assert.equal(uninitialized.initialized, false)
  assert.throws(
    () =>
      validateProductionWipAggregate({
        ...aggregateFixture(),
        production_wip_batches: [],
      }),
    /生产工序信息不完整/u
  )
})

test('production WIP quantities are canonical and compared without floating point drift', () => {
  assert.equal(normalizeProductionWipQuantity('001.2300'), '1.23')
  assert.equal(compareProductionWipQuantity('0.30', '0.3'), 0)
  assert.equal(
    compareProductionWipQuantity('99999999999999.000001', '99999999999999'),
    1
  )
  assert.throws(() => normalizeProductionWipQuantity('0'), /数量必须大于 0/u)
  assert.throws(() => normalizeProductionWipQuantity('-1'), /数量必须大于 0/u)
  assert.deepEqual(buildProductionWipConservingSplits('0.3', '0.1'), [
    { quantity: '0.1' },
    { quantity: '0.2' },
  ])
  assert.deepEqual(
    buildProductionWipConservingSplits('99999999999999.000001', '0.000002'),
    [{ quantity: '0.000002' }, { quantity: '99999999999998.999999' }]
  )
  assert.throws(
    () => buildProductionWipConservingSplits('20', '20'),
    /必须小于/u
  )
  assert.equal(PRODUCTION_WIP_QUANTITY_MAX_LENGTH, 21)
  for (const invalid of [
    '100000000000000',
    '1.0000001',
    '0000000000000000000001',
  ]) {
    assert.throws(
      () => normalizeProductionWipQuantity(invalid),
      /数量必须大于 0/u
    )
  }
})

test('production WIP action params keep references internal and enforce external assignment', () => {
  const split = buildProductionWipActionParams(
    PRODUCTION_WIP_ACTION.SPLIT_BATCH,
    {
      production_order_id: 7,
      production_wip_batch_id: 31,
      expected_version: 3,
      splits: [{ quantity: '20.00' }, { quantity: '100.000' }],
      idempotency_key: 'split-1',
      ignored_ui_field: 'must-not-pass',
    }
  )
  assert.deepEqual(split, {
    action: 'SPLIT_BATCH',
    production_order_id: 7,
    production_wip_batch_id: 31,
    expected_version: 3,
    splits: [{ quantity: '20' }, { quantity: '100' }],
    idempotency_key: 'split-1',
  })

  const outsourced = buildProductionWipActionParams(
    PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION,
    {
      production_order_id: 7,
      production_wip_batch_id: 31,
      expected_version: 3,
      execution_mode: PRODUCTION_WIP_EXECUTION_MODE.OUTSOURCED,
      outsourcing_allocations: [{ outsourcing_order_item_id: 81 }],
      idempotency_key: 'assign-1',
    }
  )
  assert.equal(outsourced.execution_mode, 'OUTSOURCED')
  assert.deepEqual(outsourced.outsourcing_allocations, [
    { outsourcing_order_item_id: 81 },
  ])
  assert.equal(Object.hasOwn(outsourced, 'outsourcing_order_item_id'), false)
  const materialOutsourced = buildProductionWipActionParams(
    PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION,
    {
      production_order_id: 7,
      production_wip_batch_id: 31,
      expected_version: 3,
      execution_mode: PRODUCTION_WIP_EXECUTION_MODE.OUTSOURCED,
      outsourcing_allocations: [
        {
          outsourcing_order_item_id: 83,
          production_order_material_requirement_id: 93,
        },
        {
          outsourcing_order_item_id: 82,
          production_order_material_requirement_id: 92,
          ignored_ui_field: 'must-not-pass',
        },
      ],
      idempotency_key: 'assign-material-1',
    }
  )
  assert.deepEqual(materialOutsourced.outsourcing_allocations, [
    {
      outsourcing_order_item_id: 82,
      production_order_material_requirement_id: 92,
    },
    {
      outsourcing_order_item_id: 83,
      production_order_material_requirement_id: 93,
    },
  ])
  assert.throws(
    () =>
      buildProductionWipActionParams(PRODUCTION_WIP_ACTION.SPLIT_BATCH, {
        production_order_id: 7,
        production_wip_batch_id: 31,
        expected_version: 3,
        splits: [{ quantity: '120' }],
        idempotency_key: 'split-invalid',
      }),
    /拆分数量/u
  )
  assert.throws(
    () =>
      buildProductionWipActionParams(PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION, {
        ...outsourced,
        outsourcing_allocations: [],
      }),
    /加工合同明细/u
  )
  assert.throws(
    () =>
      buildProductionWipActionParams(PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION, {
        ...materialOutsourced,
        outsourcing_allocations: [
          {
            outsourcing_order_item_id: 82,
            production_order_material_requirement_id: 92,
          },
          {
            outsourcing_order_item_id: 82,
            production_order_material_requirement_id: 93,
          },
        ],
      }),
    /不能重复关联/u
  )
})

test('production WIP outsourcing candidates mirror the confirmed open exact-match contract', () => {
  const fixture = aggregateFixture()
  const productionOrderItem = fixture.production_order_items[0]
  const operation = fixture.production_order_operations.find(
    (candidate) => candidate.operation_code === 'SEWING'
  )
  const batch = { ...fixture.production_wip_batches[1], quantity: '120.0000' }
  const source = {
    order: {
      id: 71,
      version: 3,
      outsourcing_order_no: 'OUT-SEW-001',
      lifecycle_status: 'confirmed',
      supplier_snapshot: { short_name: '永绅车缝加工厂' },
    },
    item: {
      id: 81,
      outsourcing_order_id: 71,
      line_no: 2,
      line_status: 'open',
      subject_type: 'PRODUCT',
      product_id: 101,
      product_sku_id: 102,
      material_id: null,
      process_id: 202,
      unit_id: 103,
      product_no_snapshot: 'BEAR-20',
      product_name_snapshot: '毛绒小熊',
      sku_code_snapshot: 'BROWN-20CM',
      process_name_snapshot: '车缝',
      unit_name_snapshot: '只',
      outsourcing_quantity: '120',
    },
  }
  const context = { productionOrderItem, operation, batch }
  assert.equal(productionWipOutsourcingCandidateMatches(source, context), true)
  assert.equal(
    productionWipOutsourcingCandidateMatches(source, {
      ...context,
      operation: {
        ...operation,
        operation_code: 'FABRIC_PROCESSING',
        process_id: source.item.process_id,
      },
    }),
    false,
    '布料加工不得被误当成单条产品型委外明细'
  )
  assert.equal(
    productionWipOutsourcingCandidateMatches(source, {
      ...context,
      batch: { ...batch, flow_type: 'REWORK' },
      operation: {
        ...operation,
        operation_code: 'FABRIC_PROCESSING',
        process_id: source.item.process_id,
      },
    }),
    true,
    '裁片返工应按当前返工批次关联单条产品加工明细'
  )
  const options = buildProductionWipOutsourcingCandidateOptions(
    [source, source],
    context
  )
  assert.equal(options.length, 1)
  assert.equal(options[0].value, 81)
  assert.match(options[0].label, /OUT-SEW-001.*永绅车缝加工厂.*车缝.*120 只/u)
  assert.match(
    options[0].matchSummary,
    /产品 BEAR-20 \/ 毛绒小熊；规格 BROWN-20CM；工序 车缝；数量 120 只/u
  )

  const mismatches = [
    { order: { lifecycle_status: 'submitted' } },
    { item: { line_status: 'closed' } },
    { item: { subject_type: 'MATERIAL' } },
    { item: { product_id: 999 } },
    { item: { product_sku_id: null } },
    { item: { process_id: 999 } },
    { item: { unit_id: 999 } },
    { item: { outsourcing_quantity: '119.9999' } },
  ].map((patch) => ({
    order: { ...source.order, ...(patch.order || {}) },
    item: { ...source.item, ...(patch.item || {}) },
  }))
  for (const mismatch of mismatches) {
    assert.equal(
      productionWipOutsourcingCandidateMatches(mismatch, context),
      false
    )
  }
})

test('normal fabric outsourcing covers every tagged material requirement within one contract', () => {
  const aggregate = validateProductionWipAggregate(aggregateFixture())
  const batch = aggregate.batches[0]
  const operation = aggregate.operations.find(
    (candidate) => candidate.operation_code === 'FABRIC_PROCESSING'
  )
  const requirements = productionWipFabricMaterialRequirements(aggregate, batch)
  assert.deepEqual(
    requirements.map((requirement) => requirement.id),
    [21]
  )
  const order = {
    id: 72,
    version: 2,
    outsourcing_order_no: 'OUT-FABRIC-001',
    lifecycle_status: 'confirmed',
    supplier_snapshot: { short_name: '布料加工厂' },
  }
  const item = {
    id: 82,
    outsourcing_order_id: 72,
    line_no: 1,
    line_status: 'open',
    subject_type: 'MATERIAL',
    product_id: null,
    product_sku_id: null,
    material_id: 301,
    process_id: operation.process_id,
    unit_id: 302,
    material_code_snapshot: 'FABRIC-BROWN',
    material_name_snapshot: '棕色短毛绒布',
    process_name_snapshot: '布料加工',
    unit_name_snapshot: '米',
    outsourcing_quantity: '60',
  }
  const source = { order, item }
  assert.equal(
    productionWipMaterialOutsourcingCandidateMatches(source, {
      requirement: requirements[0],
      operation,
    }),
    true
  )
  const options = buildProductionWipFabricContractOptions([source], {
    requirements,
    operation,
  })
  assert.equal(options.length, 1)
  assert.match(options[0].label, /OUT-FABRIC-001.*布料加工厂.*覆盖 1 项布料/u)
  assert.equal(options[0].requirementOptions[0].suggestedItemID, 82)
  assert.equal(
    buildProductionWipFabricContractOptions(
      [{ order, item: { ...item, outsourcing_quantity: '59.999999' } }],
      { requirements, operation }
    ).length,
    0
  )
})

test('accepted batches transfer explicitly and never piggyback on completion', () => {
  const params = buildProductionWipActionParams(
    PRODUCTION_WIP_ACTION.TRANSFER_TO_NEXT_OPERATION,
    {
      production_order_id: 7,
      production_wip_batch_id: 31,
      target_operation_id: 42,
      expected_version: 3,
      quantity: '120',
      idempotency_key: 'transfer-1',
    }
  )
  assert.equal(params.action, 'TRANSFER_TO_NEXT_OPERATION')
  assert.equal(params.target_operation_id, 42)
  assert.equal(params.quantity, '120')
  assert.equal(
    nextProductionWipOperation(
      validateProductionWipAggregate(aggregateFixture()),
      aggregateFixture().production_wip_batches[0]
    ).id,
    42
  )
})

test('packaging confirmation is item-level and never carries a WIP batch reference', () => {
  const params = buildProductionWipActionParams(
    PRODUCTION_WIP_ACTION.CONFIRM_PACKAGING_MATERIAL,
    {
      production_order_id: 7,
      production_order_item_id: 11,
      production_wip_batch_id: 32,
      expected_version: 1,
      packaging_version_snapshot: '彩盒 V3',
      note: '版面与装箱方式已核对',
      idempotency_key: 'packaging-1',
    }
  )
  assert.deepEqual(params, {
    action: 'CONFIRM_PACKAGING_MATERIAL',
    production_order_id: 7,
    production_order_item_id: 11,
    expected_version: 1,
    packaging_version_snapshot: '彩盒 V3',
    note: '版面与装箱方式已核对',
    idempotency_key: 'packaging-1',
  })
  assert.equal('production_wip_batch_id' in params, false)
  assert.throws(
    () =>
      buildProductionWipActionParams(
        PRODUCTION_WIP_ACTION.CONFIRM_PACKAGING_MATERIAL,
        {
          ...params,
          packaging_version_snapshot: '   ',
        }
      ),
    /包装版本/u
  )
})

test('production WIP rework requires target, quantity and reason', () => {
  const input = {
    production_order_id: 7,
    production_wip_batch_id: 32,
    expected_version: 2,
    target_operation_id: 41,
    quantity: '20',
    reason: '皮套针距不合格，退回车缝返工',
    idempotency_key: 'rework-1',
  }
  const params = buildProductionWipActionParams(
    PRODUCTION_WIP_ACTION.REWORK,
    input
  )
  assert.equal(params.target_operation_id, 41)
  assert.equal(params.quantity, '20')
  assert.equal(params.reason, input.reason)
  assert.throws(
    () =>
      buildProductionWipActionParams(PRODUCTION_WIP_ACTION.REWORK, {
        ...input,
        reason: '',
      }),
    /返工去向/u
  )
})

test('production WIP labels show business line snapshots and never raw IDs', () => {
  const aggregate = validateProductionWipAggregate(aggregateFixture())
  const batch = aggregate.batches[0]
  const item = productionWipOrderItem(aggregate, batch)
  assert.equal(
    productionWipBatchLabel(batch, item),
    'WIP-001 · 第 1 行 · 毛绒小熊 / BROWN-20CM'
  )
  assert.deepEqual(
    productionWipOperationsForBatch(aggregate, batch).map(
      (operation) => operation.operation_code
    ),
    ['FABRIC_PROCESSING', 'SEWING', 'HANDWORK', 'PACKAGING']
  )
  assert.equal(PRODUCTION_WIP_ROUTE_CODE, 'PLUSH_SEW_HAND_V1')
})

test('routed completion requires accepted packaging and item-level packaging confirmation', () => {
  const aggregate = validateProductionWipAggregate(aggregateFixture())
  const item = aggregate.items[0]
  assert.match(
    productionWipCompletionEligibility(aggregate, item).reason,
    /完成包装工序/u
  )

  const packagingAccepted = {
    ...aggregate,
    batches: [
      ...aggregate.batches,
      {
        ...aggregate.batches[1],
        id: 33,
        production_order_operation_id: 44,
        source_batch_id: 32,
        batch_no: 'WIP-003',
        status: 'ACCEPTED',
        quantity: '0.000001',
      },
      {
        ...aggregate.batches[1],
        id: 34,
        production_order_operation_id: 44,
        source_batch_id: 32,
        batch_no: 'WIP-004',
        status: 'ACCEPTED',
        quantity: '39.999999',
      },
    ],
  }
  assert.match(
    productionWipCompletionEligibility(packagingAccepted, item).reason,
    /确认包材版面和包装版本/u
  )

  const ready = {
    ...packagingAccepted,
    packagingConfirmations: [
      {
        ...aggregate.packagingConfirmations[0],
        status: 'CONFIRMED',
        packaging_version_snapshot: '彩盒 V3',
        confirmed_by: 1,
        confirmed_at: 1784210500,
      },
    ],
  }
  assert.deepEqual(productionWipCompletionEligibility(ready, item), {
    eligible: true,
    reason: '',
    acceptedPackagingQuantity: '40',
  })

  const readyPartition = partitionProductionCompletionItems([item], ready)
  assert.equal(
    readyPartition.eligibleItems[0].accepted_packaging_quantity,
    '40'
  )

  const legacyItem = { ...item, id: 12, route_code: null }
  const partitioned = partitionProductionCompletionItems(
    [item, legacyItem],
    aggregate
  )
  assert.deepEqual(partitioned.eligibleItems, [legacyItem])
  assert.equal(partitioned.blockedItems[0].item, item)
})
