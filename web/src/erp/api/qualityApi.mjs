import { RpcDomain, RpcMethod } from '../../common/consts/rpcMethods.generated.mjs'
import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc, requireRpcData as dataOf } from '@/common/utils/jsonRpc'
import { listAllPaginatedRecords, listReferenceRecordsByIDs } from '../utils/referencePagination.mjs'
import { QualityInspectionStatus } from '../../common/consts/statuses.generated.mjs'

const qualityRpc = new JsonRpc({
  url: RpcDomain.QUALITY,
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

export async function listQualityInspections(params = {}, options = {}) {
  const result = await qualityRpc.call(
    RpcMethod.quality.LIST_QUALITY_INSPECTIONS,
    params,
    options
  )
  return dataOf(result)
}

export async function listAllQualityInspections(params = {}, options = {}) {
  return listAllPaginatedRecords(
    listQualityInspections,
    params,
    'quality_inspections',
    options,
    {
      invalidResponseMessage: '服务器返回的质检记录不完整，请刷新后重试',
    }
  )
}

export async function listFinishedGoodsQualityInspections(
  params = {},
  options = {}
) {
  const result = await qualityRpc.call(
    RpcMethod.quality.LIST_FINISHED_GOODS_QUALITY_INSPECTIONS,
    params,
    options
  )
  return dataOf(result)
}

export async function listAllFinishedGoodsQualityInspections(
  params = {},
  options = {}
) {
  return listAllPaginatedRecords(
    listFinishedGoodsQualityInspections,
    params,
    'quality_inspections',
    options,
    {
      invalidResponseMessage: '服务器返回的成品质检记录不完整，请刷新后重试',
    }
  )
}

export async function listProductionStageQualityInspections(
  params = {},
  options = {}
) {
  const result = await qualityRpc.call(
    RpcMethod.quality.LIST_PRODUCTION_STAGE_QUALITY_INSPECTIONS,
    params,
    options
  )
  return dataOf(result)
}

export async function listAllProductionStageQualityInspections(
  params = {},
  options = {}
) {
  return listAllPaginatedRecords(
    listProductionStageQualityInspections,
    params,
    'quality_inspections',
    options,
    {
      invalidResponseMessage:
        '服务器返回的生产分段质检记录不完整，请刷新后重试',
    }
  )
}

export async function createFinishedGoodsQualityInspectionDraft(params = {}) {
  const result = await qualityRpc.call(
    RpcMethod.quality.CREATE_FINISHED_GOODS_QUALITY_INSPECTION_DRAFT,
    params
  )
  return dataOf(result)?.quality_inspection || null
}

export async function createQualityInspectionDraft(params = {}) {
  const result = await qualityRpc.call(
    RpcMethod.quality.CREATE_QUALITY_INSPECTION_DRAFT,
    params
  )
  return dataOf(result)?.quality_inspection || null
}

export async function createQualityInspectionFromOutsourcingReturn(
  params = {}
) {
  const result = await qualityRpc.call(
    RpcMethod.quality.CREATE_QUALITY_INSPECTION_FROM_OUTSOURCING_RETURN,
    params
  )
  return dataOf(result)?.quality_inspection || null
}

export async function listOutsourcingReturnQualityInspections(
  params = {},
  options = {}
) {
  const result = await qualityRpc.call(
    RpcMethod.quality.LIST_OUTSOURCING_RETURN_QUALITY_INSPECTIONS,
    params,
    options
  )
  return dataOf(result)
}

export async function listOutsourcingReturnQualityInspectionsForFacts(factIDs, params = {}, options = {}) {
  return listReferenceRecordsByIDs(
    listOutsourcingReturnQualityInspections,
    params,
    'quality_inspections',
    factIDs,
    options,
    { filterKey: 'fact_ids', referenceKey: 'source_id' }
  )
}

export async function listAllOutsourcingReturnQualityInspections(
  params = {},
  options = {}
) {
  return listAllPaginatedRecords(
    listOutsourcingReturnQualityInspections,
    params,
    'quality_inspections',
    options,
    {
      invalidResponseMessage:
        '服务器返回的委外回货质检记录不完整，请刷新后重试',
    }
  )
}

export async function submitQualityInspection(params = {}) {
  const result = await qualityRpc.call(RpcMethod.quality.SUBMIT_QUALITY_INSPECTION, params)
  return dataOf(result)?.quality_inspection || null
}

export async function passQualityInspection(params = {}) {
  const result = await qualityRpc.call(RpcMethod.quality.PASS_QUALITY_INSPECTION, params)
  return dataOf(result)?.quality_inspection || null
}

export async function rejectQualityInspection(params = {}) {
  const result = await qualityRpc.call(RpcMethod.quality.REJECT_QUALITY_INSPECTION, params)
  return dataOf(result)?.quality_inspection || null
}

export async function cancelQualityInspection(params = {}) {
  const result = await qualityRpc.call(RpcMethod.quality.CANCEL_QUALITY_INSPECTION, params)
  return dataOf(result)?.quality_inspection || null
}

export async function correctQualityInspectionResult(params = {}) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error('请核对原质检单、复检单号和纠正原因')
  const request = {
    ...(params.customer_key ? { customer_key: params.customer_key } : {}),
    id: params.id,
    correction_inspection_no: typeof params.correction_inspection_no === 'string' ? params.correction_inspection_no.trim() : '',
    reason: typeof params.reason === 'string' ? params.reason.trim() : '',
  }
  if (!Number.isSafeInteger(request.id) || request.id <= 0 || !request.correction_inspection_no || !request.reason) throw new Error('请核对原质检单、复检单号和纠正原因')
  const result = await qualityRpc.call(RpcMethod.quality.CORRECT_QUALITY_INSPECTION_RESULT, request)
  const inspection = dataOf(result)?.quality_inspection
  if (!Number.isSafeInteger(inspection?.id) || inspection.id <= 0 || inspection.id === request.id || inspection.correction_of_inspection_id !== request.id || inspection.inspection_no !== request.correction_inspection_no ||
      ![QualityInspectionStatus.SUBMITTED, QualityInspectionStatus.PASSED, QualityInspectionStatus.REJECTED].includes(inspection.status)) {
    const error = new Error('纠正复检返回结果与原质检单不一致，请重新核对')
    error.isInvalidResponse = true
    throw error
  }
  return inspection
}

export async function getQualityInspection(params = {}) {
  const result = await qualityRpc.call(RpcMethod.quality.GET_QUALITY_INSPECTION, params)
  return dataOf(result)?.quality_inspection || null
}
