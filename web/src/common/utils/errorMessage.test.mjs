import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

function loadErrorCodesModule() {
  const generatedPath = path.resolve(
    import.meta.dirname,
    '../consts/errorCodes.generated.js'
  )
  const generatedSource = fs.readFileSync(generatedPath, 'utf8')
  const generatedTransformed = generatedSource
    .replace(/export const /g, 'const ')
    .concat('\nmodule.exports = { RpcErrorCode };\n')

  const generatedSandbox = { module: { exports: {} }, exports: {} }
  vm.runInNewContext(generatedTransformed, generatedSandbox, {
    filename: generatedPath,
  })

  const filePath = path.resolve(import.meta.dirname, '../consts/errorCodes.js')
  const source = fs.readFileSync(filePath, 'utf8')
  const transformed = source
    .replace(
      /import\s+\{\s*RpcErrorCode\s*\}\s+from\s+["']\.\/errorCodes\.generated\.js["']\s*/u,
      'const { RpcErrorCode } = __generated__\n'
    )
    .replace(/export\s+\{\s*RpcErrorCode\s*\}\s*/u, '')
    .replace(/export const /g, 'const ')
    .replace(/export function /g, 'function ')
    .concat(
      '\nmodule.exports = { RpcErrorCode, AUTH_FAILURE_ERROR_CODES, isAuthFailureCode, DEFAULT_RPC_ERROR_MESSAGES };\n'
    )

  const sandbox = {
    module: { exports: {} },
    exports: {},
    __generated__: generatedSandbox.module.exports,
  }
  vm.runInNewContext(transformed, sandbox, { filename: filePath })
  return sandbox.module.exports
}

function loadErrorMessageModule() {
  const filePath = path.resolve(import.meta.dirname, './errorMessage.js')
  const source = fs.readFileSync(filePath, 'utf8')
  const transformed = source
    .replace(
      /import\s+\{\s*logout\s*\}\s+from\s+["'](?:@\/common\/auth\/auth|\.\.\/auth\/auth\.js)["']\s*/u,
      'const { logout } = __auth__\n'
    )
    .replace(
      /import\s+\{[\s\S]*?\}\s+from\s+["'](?:@\/common\/consts\/errorCodes|\.\.\/consts\/errorCodes\.js)["']\s*/u,
      'const { DEFAULT_RPC_ERROR_MESSAGES, RpcErrorCode, isAuthFailureCode } = __errorCodes__\n'
    )
    .replace(/export function /g, 'function ')
    .replace(/export const /g, 'const ')
    .concat(
      '\nmodule.exports = { getUserFacingErrorMessage, getActionErrorMessage, handleRpcError, ERROR_MESSAGES };\n'
    )

  const sandbox = {
    module: { exports: {} },
    exports: {},
    __auth__: { logout() {} },
    __errorCodes__: errorCodesModule,
  }
  vm.runInNewContext(transformed, sandbox, { filename: filePath })
  return sandbox.module.exports
}

const errorCodesModule = loadErrorCodesModule()
const { RpcErrorCode, DEFAULT_RPC_ERROR_MESSAGES } = errorCodesModule
const { getUserFacingErrorMessage, getActionErrorMessage } =
  loadErrorMessageModule()

test('errorMessage: 网络错误统一翻译为中文', () => {
  assert.equal(
    getUserFacingErrorMessage(
      { message: 'Network error', isNetworkError: true },
      '登录失败，请稍后重试'
    ),
    '网络错误，请稍后重试'
  )
})

test('errorMessage: 已知错误码优先走现有中文码表', () => {
  assert.equal(
    getUserFacingErrorMessage(
      { message: 'Business error', code: RpcErrorCode.AUTH_REQUIRED },
      '登录失败，请稍后重试'
    ),
    DEFAULT_RPC_ERROR_MESSAGES[RpcErrorCode.AUTH_REQUIRED]
  )
  assert.equal(
    getUserFacingErrorMessage(
      {
        message: 'idempotency key payload conflict',
        code: RpcErrorCode.IDEMPOTENCY_CONFLICT,
      },
      '保存失败，请稍后重试'
    ),
    '重复请求内容与首次提交不一致，请刷新后重试'
  )
  assert.equal(
    getUserFacingErrorMessage(
      {
        message: 'process domain command recovery requires explicit review',
        code: RpcErrorCode.PROCESS_DOMAIN_COMMAND_RECOVERY_REQUIRED,
      },
      '提交失败，请稍后重试'
    ),
    '此前业务处理结果需要人工核对，当前流程暂时无法继续，请联系管理员'
  )
})

test('errorMessage: 短信登录错误码显示精确中文提示', () => {
  const cases = [
    [RpcErrorCode.AUTH_SMS_CODE_TOO_FREQUENT, '验证码发送过于频繁，请稍后再试'],
    [
      RpcErrorCode.AUTH_SMS_SERVICE_QUOTA_EXCEEDED,
      '短信服务额度已用完，请联系管理员处理',
    ],
    [
      RpcErrorCode.AUTH_SMS_SERVICE_UNAVAILABLE,
      '短信服务暂不可用，请稍后再试或联系管理员',
    ],
    [RpcErrorCode.AUTH_INVALID_SMS_CODE, '验证码错误'],
    [RpcErrorCode.AUTH_SMS_CODE_EXPIRED, '验证码已过期，请重新获取'],
  ]

  for (const [code, message] of cases) {
    assert.equal(
      getActionErrorMessage({ message: 'Business error', code }, '获取验证码'),
      message
    )
  }
})

test('errorMessage: 已是中文的后端文案保持原样', () => {
  assert.equal(
    getUserFacingErrorMessage('用户名已存在', '注册失败，请稍后重试'),
    '用户名已存在'
  )
})

test('errorMessage: 未知英文原文收口到页面 fallback', () => {
  assert.equal(
    getUserFacingErrorMessage(
      { message: 'temporary upstream failure' },
      '加载失败，请稍后重试'
    ),
    '加载失败，请稍后重试'
  )
})

test('errorMessage: 直接传入英文拒绝原因也收口到 fallback', () => {
  assert.equal(
    getUserFacingErrorMessage(
      'owner_role_key mismatch',
      '当前账号不能提交这个任务动作'
    ),
    '当前账号不能提交这个任务动作'
  )
})

test('errorMessage: 中文夹带技术字段也收口到页面 fallback', () => {
  const cases = [
    '当前账号 owner_role_key 不匹配',
    'payload 校验失败，请检查 source_id',
    'task_status_key 不允许从 done 改为 blocked',
  ]

  for (const message of cases) {
    assert.equal(
      getUserFacingErrorMessage(message, '当前账号不能提交这个任务动作'),
      '当前账号不能提交这个任务动作'
    )
  }
})

test('errorMessage: 登录态短英文原文收口为中文重新登录提示', () => {
  assert.equal(
    getUserFacingErrorMessage('expired', '登录失败，请稍后重试'),
    '登录已过期，请重新登录'
  )
  assert.equal(
    getUserFacingErrorMessage('token expired', '登录失败，请稍后重试'),
    '登录已过期，请重新登录'
  )
})

test('errorMessage: 动作型 helper 自动补齐标准中文兜底', () => {
  assert.equal(
    getActionErrorMessage({ message: 'temporary upstream failure' }, '登录'),
    '登录失败，请稍后重试'
  )
})

test('errorMessage: 动作型 helper 支持自定义后缀', () => {
  assert.equal(
    getActionErrorMessage({ message: 'temporary upstream failure' }, '登录', {
      suffix: '请检查账号密码',
    }),
    '登录失败，请检查账号密码'
  )
})
