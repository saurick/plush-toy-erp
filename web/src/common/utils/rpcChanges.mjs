import { RpcMethod } from '../consts/rpcMethods.generated.mjs'

export const RPC_RECORDS_CHANGED = 'erp-rpc-records-changed'

const writeVerbs = new Set([
  'activate', 'add', 'allocate', 'apply', 'archive', 'block', 'boss',
  'cancel', 'clear', 'close', 'complete', 'confirm', 'copy', 'correct',
  'create', 'disable', 'execute', 'finance', 'pass', 'post', 'prepare',
  'publish', 'reassign', 'recover', 'reject', 'release', 'resume',
  'reverse', 'revoke', 'rollback', 'save', 'set', 'settle', 'ship',
  'start', 'submit', 'update', 'upload', 'urge', 'withdraw',
])

const mutations = new Set(Object.entries(RpcMethod).flatMap(([domain, methods]) =>
  Object.values(methods).filter((method) => writeVerbs.has(method.split('_')[0]))
    .map((method) => `${domain}:${method}`)
))
for (const method of [
  RpcMethod.admin.HELP_FEEDBACK_CREATE,
  RpcMethod.admin.HELP_FEEDBACK_RESPOND,
  RpcMethod.admin.HELP_SUPPLEMENT_PUBLISH,
  RpcMethod.admin.HELP_SUPPLEMENT_RESTORE,
  RpcMethod.admin.HELP_SUPPLEMENT_SAVE,
]) mutations.add(`admin:${method}`)

let readSource = null

// 只给当前窗口的并排工作区登记来源，不传递表单内容、业务快照或凭据。
export function registerRpcChangeSource(reader) {
  readSource = reader
  return () => { if (readSource === reader) readSource = null }
}

export function captureRpcChangeSource() {
  return readSource?.() || null
}

export function notifyRpcRecordsChanged(domain, method, source) {
  if (!source || !mutations.has(`${domain}:${method}`) || typeof window === 'undefined') return
  window.dispatchEvent(new window.CustomEvent(RPC_RECORDS_CHANGED, {
    detail: Object.freeze({ domain, method, source }),
  }))
}
