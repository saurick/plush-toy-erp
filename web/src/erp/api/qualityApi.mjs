import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'

const qualityRpc = new JsonRpc({
  url: 'quality',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

function dataOf(result) {
  return result?.data || {}
}

export async function listQualityInspections(params = {}, options = {}) {
  const result = await qualityRpc.call(
    'list_quality_inspections',
    params,
    options
  )
  return dataOf(result)
}

export async function listFinishedGoodsQualityInspections(
  params = {},
  options = {}
) {
  const result = await qualityRpc.call(
    'list_finished_goods_quality_inspections',
    params,
    options
  )
  return dataOf(result)
}

export async function listProductionStageQualityInspections(
  params = {},
  options = {}
) {
  const result = await qualityRpc.call(
    'list_production_stage_quality_inspections',
    params,
    options
  )
  return dataOf(result)
}

export async function createFinishedGoodsQualityInspectionDraft(params = {}) {
  const result = await qualityRpc.call(
    'create_finished_goods_quality_inspection_draft',
    params
  )
  return dataOf(result)?.quality_inspection || null
}

export async function createQualityInspectionDraft(params = {}) {
  const result = await qualityRpc.call(
    'create_quality_inspection_draft',
    params
  )
  return dataOf(result)?.quality_inspection || null
}

export async function createQualityInspectionFromOutsourcingReturn(
  params = {}
) {
  const result = await qualityRpc.call(
    'create_quality_inspection_from_outsourcing_return',
    params
  )
  return dataOf(result)?.quality_inspection || null
}

export async function listOutsourcingReturnQualityInspections(
  params = {},
  options = {}
) {
  const result = await qualityRpc.call(
    'list_outsourcing_return_quality_inspections',
    params,
    options
  )
  return dataOf(result)
}

export async function submitQualityInspection(params = {}) {
  const result = await qualityRpc.call('submit_quality_inspection', params)
  return dataOf(result)?.quality_inspection || null
}

export async function passQualityInspection(params = {}) {
  const result = await qualityRpc.call('pass_quality_inspection', params)
  return dataOf(result)?.quality_inspection || null
}

export async function rejectQualityInspection(params = {}) {
  const result = await qualityRpc.call('reject_quality_inspection', params)
  return dataOf(result)?.quality_inspection || null
}

export async function cancelQualityInspection(params = {}) {
  const result = await qualityRpc.call('cancel_quality_inspection', params)
  return dataOf(result)?.quality_inspection || null
}

export async function getQualityInspection(params = {}) {
  const result = await qualityRpc.call('get_quality_inspection', params)
  return dataOf(result)?.quality_inspection || null
}
