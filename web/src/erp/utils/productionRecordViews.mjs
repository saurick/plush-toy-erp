import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import { hasActionPermission } from './masterDataOrderView.mjs'
import { OperationalFactStatus, ProductionExceptionStatus, ProductionExceptionExecutionStatus } from '../../common/consts/statuses.generated.mjs'

export function productionFactSummary(record = {}) {
  const receipt = record.fact_type === 'FINISHED_GOODS_RECEIPT'
  if (record.status === OperationalFactStatus.DRAFT) {
    return receipt
      ? { title: '待仓库确认成品入库', next: '仓库核对产品、数量、仓库和批次后确认入库；确认成功才增加成品库存。' }
      : { title: '草稿待核对', next: '核对来源、材料或产品、数量和批次，再按当前记录允许的动作办理。草稿尚未影响库存。' }
  }
  if (record.status === OperationalFactStatus.POSTED) {
    return receipt
      ? { title: '成品已确认入库', next: '成品库存已记录；检验、查货与包装进度仍需在生产执行核对。' }
      : { title: '生产记录已过账', next: '本次业务结果已记录；后续工序和返工批次在生产执行中继续跟进。' }
  }
  if (record.status === OperationalFactStatus.CANCELLED) {
    return { title: '生产记录已取消', next: '本记录不再办理；请结合有效记录核对数量和库存，取消原因在下方查看。' }
  }
  return { title: '生产记录状态待核对', next: '请刷新记录确认当前状态；可办理动作以当前权限和业务校验为准。' }
}

export function productionExceptionSummary(record = {}) {
  if (record.status === ProductionExceptionStatus.CANCELLED) return { title: '异常申请已撤回', next: '本申请不再继续办理；关联生产记录仍按实际业务结果核对。' }
  if (record.status === ProductionExceptionStatus.REJECTED) return { title: '异常申请未获批准', next: '核对审批意见；需要调整方案时，从原业务重新申请。' }
  if (record.status === ProductionExceptionStatus.SUBMITTED) return { title: '异常申请待审批', next: '在任务管理处理审批；审批通过后，仍需按批准方案办理生产业务。' }
  if (record.status !== ProductionExceptionStatus.APPROVED) return { title: '异常状态待核对', next: '请刷新申请，核对审批结论和业务执行结果。' }
  if (record.execution_status === ProductionExceptionExecutionStatus.REVERSED) return { title: record.decision_type === 'OVER_ISSUE' ? '超领额度已撤销' : '异常处置已冲正', next: '核对冲正或撤销原因及关联业务记录，不能按原批准数量继续执行。' }
  if (record.execution_status === ProductionExceptionExecutionStatus.APPLIED) return { title: '异常处置已执行', next: '核对执行原因与关联记录；需要更正时按权限办理冲正。' }
  if (record.execution_status !== ProductionExceptionExecutionStatus.PENDING) return { title: '业务执行状态待核对', next: '请刷新申请确认执行结果，勿重复办理。' }
  return record.decision_type === 'OVER_ISSUE'
    ? { title: '超领额度已生效', next: '在正式领料中按批准额度办理；未使用的额度可按权限撤销。审批不会直接扣减库存。' }
    : { title: '已批准，待生产执行', next: '核对批准方案和数量后确认执行。审批通过不代表生产处置已经执行。' }
}

export function canReadProductionExceptionDecisions(adminProfile) {
  return [
    PermissionCode.PMC_RISK_READ,
    PermissionCode.PRODUCTION_FACT_READ,
    PermissionCode.PRODUCTION_EXCEPTION_SUBMIT,
    PermissionCode.PRODUCTION_EXCEPTION_APPROVE,
  ].some((permission) => hasActionPermission(adminProfile, permission))
}

export function canReadProductionProcess(adminProfile) {
  return (
    hasActionPermission(adminProfile, PermissionCode.PRODUCTION_FACT_READ) &&
    hasActionPermission(adminProfile, PermissionCode.PRODUCTION_WIP_READ)
  )
}
