import {
  RpcDomain,
  RpcMethod,
} from '../../common/consts/rpcMethods.generated.mjs'
import { AUTH_SCOPE } from '../../common/auth/auth.js'
import { ADMIN_BASE_PATH } from '../../common/utils/adminRpc.js'
import { JsonRpc, requireRpcData } from '../../common/utils/jsonRpc.js'

const rpc = new JsonRpc({
  url: RpcDomain.ADMIN,
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})
export const readHelpContent = (signal) =>
  rpc.call(RpcMethod.admin.HELP_CONTENT, {}, { signal }).then(requireRpcData)
export const readHelpChapter = (documentId, signal) =>
  rpc
    .call(RpcMethod.admin.HELP_CHAPTER, { document_id: documentId }, { signal })
    .then(requireRpcData)
export const createHelpFeedback = (input) =>
  rpc.call(RpcMethod.admin.HELP_FEEDBACK_CREATE, input).then(requireRpcData)
export const respondHelpFeedback = (input) =>
  rpc.call(RpcMethod.admin.HELP_FEEDBACK_RESPOND, input).then(requireRpcData)
export const writeHelpSupplement = (action, input) => {
  const methods = {
    save: RpcMethod.admin.HELP_SUPPLEMENT_SAVE,
    publish: RpcMethod.admin.HELP_SUPPLEMENT_PUBLISH,
    restore: RpcMethod.admin.HELP_SUPPLEMENT_RESTORE,
  }
  return rpc.call(methods[action], input).then(requireRpcData)
}
