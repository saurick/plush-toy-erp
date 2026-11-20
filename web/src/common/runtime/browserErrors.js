import { getToken } from '../auth/auth.js'
import { JsonRpc } from '../utils/jsonRpc.js'
import { RpcDomain, RpcMethod } from '../consts/rpcMethods.generated.mjs'
import { readEmbeddedBuildIdentity } from './buildIdentity.mjs'
import {
  createBrowserErrorReporter,
  installBrowserErrorListeners,
} from './browserErrorReporting.mjs'

const rpc = new JsonRpc({ url: RpcDomain.AUTH })
const identity = readEmbeddedBuildIdentity()
export const reportBrowserError = createBrowserErrorReporter({
  build: identity.gitSHA || (identity.local ? 'local' : 'unknown'),
  getPath: () => window.location.pathname,
  send: (report) =>
    getToken() &&
    !(import.meta.env.DEV && import.meta.env.VITE_ENABLE_RPC_MOCK === 'true')
      ? rpc.call(RpcMethod.auth.REPORT_CLIENT_ERROR, report, {
          signal: AbortSignal.timeout(5000),
        })
      : Promise.resolve(),
})

export function startBrowserErrorReporting(target = window) {
  return installBrowserErrorListeners(target, reportBrowserError)
}
