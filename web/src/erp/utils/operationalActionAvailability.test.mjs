import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveFinancePaymentActionAvailability,
  resolveProductionExceptionActionAvailability,
  resolveRelatedRecordActionAvailability,
  resolveSalesReturnActionAvailability,
  resolveShipmentActionAvailability,
} from './operationalActionAvailability.mjs'

function state(result) {
  return [result.visible, result.disabled, result.disabledReason]
}

test('收付款动作：只有无权限隐藏，未选中、前置不足和终态都保留槽位', () => {
  for (const action of ['allocation', 'approval', 'cancel', 'reverse']) {
    assert.deepEqual(
      state(
        resolveFinancePaymentActionAvailability({
          action,
          authorized: false,
        })
      ),
      [false, true, '']
    )
    assert.deepEqual(
      state(
        resolveFinancePaymentActionAvailability({
          action,
          authorized: true,
        })
      ),
      [true, true, '请先选择一条收付款记录']
    )
  }

  const draft = { status: 'DRAFT' }
  assert.deepEqual(
    state(
      resolveFinancePaymentActionAvailability({
        action: 'allocation',
        authorized: true,
        payment: draft,
      })
    ),
    [true, true, '审批通过后可选择应收 / 应付核销']
  )
  assert.deepEqual(
    state(
      resolveFinancePaymentActionAvailability({
        action: 'reverse',
        authorized: true,
        payment: draft,
      })
    ),
    [true, true, '完成核销后可冲销收付款']
  )
  assert.deepEqual(
    state(
      resolveFinancePaymentActionAvailability({
        action: 'approval',
        authorized: true,
        payment: draft,
      })
    ),
    [true, false, '']
  )

  const approved = { status: 'APPROVED' }
  assert.deepEqual(
    state(
      resolveFinancePaymentActionAvailability({
        action: 'allocation',
        authorized: true,
        payment: approved,
        referenceLoading: true,
      })
    ),
    [true, true, '核销资料加载完成后可继续']
  )
  assert.deepEqual(
    state(
      resolveFinancePaymentActionAvailability({
        action: 'approval',
        authorized: true,
        payment: approved,
      })
    ),
    [true, true, '只有待审批收付款可以核对审批流']
  )

  const posted = { status: 'POSTED' }
  assert.deepEqual(
    state(
      resolveFinancePaymentActionAvailability({
        action: 'reverse',
        authorized: true,
        payment: posted,
      })
    ),
    [true, false, '']
  )
  for (const status of ['REJECTED', 'CANCELLED', 'REVERSED']) {
    for (const action of ['allocation', 'approval', 'cancel', 'reverse']) {
      const result = resolveFinancePaymentActionAvailability({
          action,
          authorized: true,
          payment: { status },
        })
      assert.equal(result.visible, true, `${status}/${action} 应保留`)
      assert.equal(result.disabled, true, `${status}/${action} 应置灰`)
      assert.ok(result.disabledReason, `${status}/${action} 应说明原因`)
    }
  }
})

test('客户退货动作：待审批和终态均保留已授权动作并置灰不可用项', () => {
  const draft = { status: 'DRAFT' }
  assert.deepEqual(
    state(
      resolveSalesReturnActionAvailability({
        action: 'receive',
        authorized: true,
        salesReturn: draft,
      })
    ),
    [true, true, '审批通过后可确认收货']
  )
  assert.deepEqual(
    state(
      resolveSalesReturnActionAvailability({
        action: 'reverse',
        authorized: true,
        salesReturn: draft,
      })
    ),
    [true, true, '确认收货后可冲正退货入库']
  )
  assert.equal(
    resolveSalesReturnActionAvailability({
      action: 'approval',
      authorized: true,
      salesReturn: draft,
    }).disabled,
    false
  )

  const received = { status: 'RECEIVED' }
  assert.equal(
    resolveSalesReturnActionAvailability({
      action: 'receive',
      authorized: true,
      salesReturn: received,
    }).visible,
    true
  )
  assert.equal(
    resolveSalesReturnActionAvailability({
      action: 'receive',
      authorized: true,
      salesReturn: received,
    }).disabled,
    true
  )
  assert.deepEqual(
    state(
      resolveSalesReturnActionAvailability({
        action: 'reverse',
        authorized: true,
        salesReturn: received,
        busy: true,
      })
    ),
    [true, true, '当前操作完成后可冲正退货入库']
  )

  for (const status of ['REJECTED', 'CANCELLED', 'REVERSED']) {
    for (const action of ['receive', 'approval', 'cancel', 'reverse']) {
      const result = resolveSalesReturnActionAvailability({
          action,
          authorized: true,
          salesReturn: { status },
        })
      assert.equal(result.visible, true, `${status}/${action} 应保留`)
      assert.equal(result.disabled, true, `${status}/${action} 应置灰`)
      assert.ok(result.disabledReason, `${status}/${action} 应说明原因`)
    }
  }
})

test('出货动作：放行前置、已完成和驳回都保留已授权动作并置灰', () => {
  const draftPending = {
    status: 'DRAFT',
    finance_release_status: 'PENDING',
  }
  assert.equal(
    resolveShipmentActionAvailability({
      action: 'release',
      authorized: true,
      shipment: draftPending,
    }).disabled,
    false
  )
  for (const action of ['ship', 'receivable', 'invoice']) {
    assert.equal(
      resolveShipmentActionAvailability({
        action,
        authorized: true,
        shipment: draftPending,
      }).disabled,
      true,
      `${action} 应保留为前置条件置灰`
    )
  }

  const draftApproved = {
    status: 'DRAFT',
    finance_release_status: 'APPROVED',
  }
  assert.equal(
    resolveShipmentActionAvailability({
      action: 'release',
      authorized: true,
      shipment: draftApproved,
    }).visible,
    true
  )
  assert.equal(
    resolveShipmentActionAvailability({
      action: 'release',
      authorized: true,
      shipment: draftApproved,
    }).disabled,
    true
  )
  assert.equal(
    resolveShipmentActionAvailability({
      action: 'ship',
      authorized: true,
      shipment: draftApproved,
    }).disabled,
    false
  )

  const draftRejected = {
    status: 'DRAFT',
    finance_release_status: 'REJECTED',
  }
  for (const action of ['release', 'ship', 'receivable', 'invoice']) {
    const result = resolveShipmentActionAvailability({
        action,
        authorized: true,
        shipment: draftRejected,
      })
    assert.equal(result.visible, true, `${action} 在放行驳回后应保留`)
    assert.equal(result.disabled, true, `${action} 在放行驳回后应置灰`)
    assert.ok(result.disabledReason)
  }
  assert.equal(
    resolveShipmentActionAvailability({
      action: 'cancel',
      authorized: true,
      shipment: draftRejected,
    }).disabled,
    false
  )

  const shipped = { status: 'SHIPPED', finance_release_status: 'APPROVED' }
  assert.equal(
    resolveShipmentActionAvailability({
      action: 'ship',
      authorized: true,
      shipment: shipped,
    }).visible,
    true
  )
  assert.equal(
    resolveShipmentActionAvailability({
      action: 'ship',
      authorized: true,
      shipment: shipped,
    }).disabled,
    true
  )
  for (const action of ['cancel', 'receivable', 'invoice']) {
    assert.equal(
      resolveShipmentActionAvailability({
        action,
        authorized: true,
        shipment: shipped,
      }).disabled,
      false,
      `${action} 在已出货时应可用`
    )
  }
})

test('生产异常动作：按异常类型、审批状态、执行状态和申请人归属稳定展示', () => {
  const submittedScrap = {
    status: 'SUBMITTED',
    execution_status: 'PENDING',
    decision_type: 'SCRAP',
  }
  assert.equal(
    resolveProductionExceptionActionAvailability({
      action: 'approval',
      authorized: true,
      productionException: submittedScrap,
      requesterOwned: false,
    }).visible,
    true
  )
  assert.equal(
    resolveProductionExceptionActionAvailability({
      action: 'approval',
      authorized: true,
      productionException: submittedScrap,
      requesterOwned: false,
    }).disabled,
    true
  )
  assert.equal(
    resolveProductionExceptionActionAvailability({
      action: 'approval',
      authorized: true,
      productionException: submittedScrap,
      requesterOwned: true,
    }).disabled,
    false
  )
  assert.deepEqual(
    state(
      resolveProductionExceptionActionAvailability({
        action: 'execute',
        authorized: true,
        productionException: submittedScrap,
      })
    ),
    [true, true, '审批通过后可确认执行报废或在制品让步']
  )

  const approvedScrap = {
    ...submittedScrap,
    status: 'APPROVED',
  }
  assert.equal(
    resolveProductionExceptionActionAvailability({
      action: 'execute',
      authorized: true,
      productionException: approvedScrap,
    }).disabled,
    false
  )
  assert.equal(
    resolveProductionExceptionActionAvailability({
      action: 'reverse',
      authorized: true,
      productionException: approvedScrap,
    }).disabled,
    true
  )
  assert.equal(
    resolveProductionExceptionActionAvailability({
      action: 'reverse',
      authorized: true,
      productionException: {
        ...approvedScrap,
        execution_status: 'APPLIED',
      },
    }).disabled,
    false
  )

  const approvedQuota = {
    status: 'APPROVED',
    execution_status: 'PENDING',
    decision_type: 'OVER_ISSUE',
  }
  assert.equal(
    resolveProductionExceptionActionAvailability({
      action: 'execute',
      authorized: true,
      productionException: approvedQuota,
    }).visible,
    true
  )
  assert.equal(
    resolveProductionExceptionActionAvailability({
      action: 'execute',
      authorized: true,
      productionException: approvedQuota,
    }).disabled,
    true
  )
  assert.equal(
    resolveProductionExceptionActionAvailability({
      action: 'revokeQuota',
      authorized: true,
      productionException: approvedQuota,
    }).disabled,
    false
  )
  assert.equal(
    resolveProductionExceptionActionAvailability({
      action: 'revokeQuota',
      authorized: true,
      productionException: {
        ...approvedQuota,
        execution_status: 'REVERSED',
      },
    }).visible,
    true
  )
  assert.equal(
    resolveProductionExceptionActionAvailability({
      action: 'revokeQuota',
      authorized: true,
      productionException: {
        ...approvedQuota,
        execution_status: 'REVERSED',
      },
    }).disabled,
    true
  )
})

test('相关单据动作：有能力但未选中或无关联时都保留入口并说明原因', () => {
  assert.deepEqual(
    state(
      resolveRelatedRecordActionAvailability({
        authorized: false,
      })
    ),
    [false, true, '']
  )
  assert.deepEqual(
    state(
      resolveRelatedRecordActionAvailability({
        authorized: true,
      })
    ),
    [true, true, '请先选择一条业务记录']
  )
  assert.deepEqual(
    state(
      resolveRelatedRecordActionAvailability({
        authorized: true,
        record: { id: 1 },
        itemCount: 0,
      })
    ),
    [true, true, '当前业务记录没有可打开的关联单据']
  )
  assert.deepEqual(
    state(
      resolveRelatedRecordActionAvailability({
        authorized: true,
        record: { id: 1 },
        itemCount: 2,
      })
    ),
    [true, false, '']
  )
})
