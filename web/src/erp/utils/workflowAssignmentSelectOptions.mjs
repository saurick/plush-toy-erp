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
            ? `交回${ownerRoleLabel}，由岗位人员处理`
            : '交回负责岗位，由岗位人员处理',
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
    { label: '由岗位人员处理', options: poolOptions },
    { label: '指定员工', options: candidateOptions },
  ].filter((group) => group.options.length > 0)
}

export function flattenWorkflowAssignmentSelectOptions(groups = []) {
  return (Array.isArray(groups) ? groups : []).flatMap(
    (group) => group.options || []
  )
}
