import { formatAdminIdentity } from './adminIdentity.mjs'

export function buildWorkflowAssignmentSelectOptions({
  canReturnToPool = false,
  candidates = [],
  ownerRoleLabel = '',
} = {}) {
  const poolOptions = canReturnToPool
    ? [
        {
          value: 'pool',
          label: ownerRoleLabel
            ? `暂不指定个人，退回共同待办（负责岗位：${ownerRoleLabel}）`
            : '暂不指定个人，退回负责岗位共同待办',
        },
      ]
    : []
  const candidateOptions = (Array.isArray(candidates) ? candidates : []).map(
    (candidate) => ({
      value: candidate.admin_id,
      label: `${formatAdminIdentity(candidate)} · ${candidate.role_label || ownerRoleLabel}`,
    })
  )

  return [
    { label: '岗位共同待办', options: poolOptions },
    { label: '指定员工', options: candidateOptions },
  ].filter((group) => group.options.length > 0)
}

export function flattenWorkflowAssignmentSelectOptions(groups = []) {
  return (Array.isArray(groups) ? groups : []).flatMap(
    (group) => group.options || []
  )
}
