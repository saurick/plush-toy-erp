// Task scope narrows the existing outsourcing commands; it never grants a
// capability or substitutes for the domain command's permission/state checks.
export function outsourcingTaskScope(taskBusiness) {
  if (!taskBusiness) return null
  const { task } = taskBusiness
  const group = task?.task_group
  const factType = group === 'handoff_outsourcing_issue' ? 'MATERIAL_ISSUE'
    : ['handoff_outsourcing_return', 'handoff_outsourcing_quality_request', 'handoff_outsourcing_inbound'].includes(group) ? 'RETURN_RECEIPT' : ''
  return {
    factType,
    factID: task?.source_type === 'outsourcing_fact' ? task.source_id : null,
    writable: taskBusiness.readOnly !== true,
    create: ['handoff_outsourcing_issue', 'handoff_outsourcing_return'].includes(group),
    post: ['handoff_outsourcing_issue', 'handoff_outsourcing_return', 'handoff_outsourcing_inbound'].includes(group),
    quality: group === 'handoff_outsourcing_quality_request',
  }
}

export function outsourcingTaskFactMatches(scope, fact) {
  return !scope || Boolean(scope.factType && fact?.fact_type === scope.factType && (!scope.factID || fact.id === scope.factID))
}
