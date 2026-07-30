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

test('收付款动作：未选中保留槽位，前置条件不足置灰，终态和无权限隐藏', () => {
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
    [false, true, '']
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
      assert.equal(
        resolveFinancePaymentActionAvailability({
          action,
          authorized: true,
          payment: { status },
        }).visible,
        false,
        `${status}/${action} 应隐藏`
      )
    }
  }
})

test('客户退货动作：待审批保留后续动作置灰，已收货只保留冲正', () => {
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
    false
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
      assert.equal(
        resolveSalesReturnActionAvailability({
          action,
          authorized: true,
          salesReturn: { status },
        }).visible,
        false,
        `${status}/${action} 应隐藏`
      )
    }
  }
})

test('出货动作：放行前置条件置灰，已完成、驳回或结构无关动作隐藏', () => {
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
    false
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
    assert.equal(
      resolveShipmentActionAvailability({
        action,
        authorized: true,
        shipment: draftRejected,
      }).visible,
      false,
      `${action} 在放行驳回后应隐藏`
    )
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
    false
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
    false
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
    false
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
    false
  )
})

test('相关单据动作：有能力但未选中时置灰，选中无关联时隐藏', () => {
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
    [false, true, '']
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
