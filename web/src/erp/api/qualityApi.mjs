import { RpcDomain, RpcMethod } from '../../common/consts/rpcMethods.generated.mjs'
import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc, requireRpcData as dataOf } from '@/common/utils/jsonRpc'
import { listAllPaginatedRecords } from '../utils/referencePagination.mjs'

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

export async function getQualityInspection(params = {}) {
  const result = await qualityRpc.call(RpcMethod.quality.GET_QUALITY_INSPECTION, params)
  return dataOf(result)?.quality_inspection || null
}
