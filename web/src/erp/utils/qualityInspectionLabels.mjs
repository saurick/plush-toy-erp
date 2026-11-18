import { QualityInspectionStatus } from '../../common/consts/statuses.generated.mjs'

export const QUALITY_STATUS_LABELS = Object.freeze({
  [QualityInspectionStatus.DRAFT]: '草稿',
  [QualityInspectionStatus.SUBMITTED]: '已提交',
  [QualityInspectionStatus.PASSED]: '合格',
  [QualityInspectionStatus.REJECTED]: '不合格',
  [QualityInspectionStatus.CANCELLED]: '已取消',
})

export const QUALITY_RESULT_LABELS = Object.freeze({
  PASS: '合格',
  CONCESSION: '让步接收',
  REJECT: '不合格',
})

export const QUALITY_STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  ...Object.entries(QUALITY_STATUS_LABELS).map(([value, label]) => ({ value, label })),
]
