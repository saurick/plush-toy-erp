export function workflowTaskPayload(task = {}) {
  return task.payload && typeof task.payload === 'object' ? task.payload : {}
}
