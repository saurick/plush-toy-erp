import { validateProjectManuals } from '../config/projectManuals.mjs'
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

export async function readProjectManuals({ signal } = {}) {
  return validateProjectManuals(
    requireRpcData(
      await rpc.call(RpcMethod.admin.PROJECT_MANUALS, {}, { signal })
    )
  )
}
