import { useEffect, useRef, useState } from 'react'
import { RpcErrorCode } from '@/common/consts/errorCodes.js'
import { message, modal } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  activateCustomerConfig,
  checkCustomerConfigTransition,
  getEffectiveSession,
  publishCustomerConfig,
  rollbackCustomerConfig,
  validateCustomerConfig,
} from '@/erp/api/customerConfigApi.mjs'
import {
  assertEffectiveCustomerConfigIdentity,
  assertPublishedCustomerConfigIdentity,
  confirmCustomerConfigTransition,
  resolveCustomerConfigApplyTransitionAction,
} from '@/erp/api/customerConfigTransition.mjs'
import { createDevCustomerConfigIdempotencyKey } from '../../config/devCustomerConfig.mjs'

const ACTIVE_REVISION_REQUIRED_REASON =
  'customer_config_active_revision_required'

function getCustomerConfigActionError(error, fallback) {
  const code = error?.code
  if (code === RpcErrorCode.AUTH_REQUIRED) {
    return '请先登录后台管理员账号，再执行客户配置应用。'
  }
  if (code === RpcErrorCode.ADMIN_DISABLED) {
    return '当前后台管理员账号已停用，请更换账号后重试。'
  }
  if (code === RpcErrorCode.PERMISSION_DENIED) {
    return '当前管理员没有客户配置发布或激活权限。'
  }
  if (error?.isNetworkError) {
    return '无法连接本地后端，请确认 server-dev 正在运行。'
  }
  return getActionErrorMessage(error, fallback)
}

async function assertLocalBackendCustomerContext(customerKey) {
  try {
    const session = await getEffectiveSession()
    const resolvedCustomerKey = String(session?.customer?.key || '').trim()
    if (resolvedCustomerKey !== customerKey) {
      throw new Error(
        `当前代理后端未固定为 ${customerKey}；请用对应客户配置重新启动后端再重试。`
      )
    }
  } catch (error) {
    if (
      error?.code === RpcErrorCode.PERMISSION_DENIED &&
      error?.json?.result?.data?.reason === ACTIVE_REVISION_REQUIRED_REASON
    ) {
      return
    }
    throw error
  }
}

export function useCustomerConfigTestApply({
  overview,
  getBridgeCsrfToken,
  invalidateBridgeSession,
}) {
  const { customerKey } = overview
  const [applyState, setApplyState] = useState({ status: 'idle' })
  const applyRequestRef = useRef(0)
  const applyAbortRef = useRef(null)
  const applyInFlightRef = useRef(false)
  const confirmationRef = useRef(null)
  useEffect(() => {
    setApplyState({ status: 'idle' })
    applyInFlightRef.current = false
    return () => {
      applyRequestRef.current += 1
      applyAbortRef.current?.abort()
      applyInFlightRef.current = false
      confirmationRef.current?.destroy?.()
    }
  }, [customerKey])
  const handleApplyTestConfig = async () => {
    if (applyInFlightRef.current) return
    if (!overview.importSummary.canApplyTestConfig) {
      setApplyState({
        status: 'error',
        error: overview.importSummary.testApply.note || '当前配置包不可应用。',
      })
      return
    }
    applyInFlightRef.current = true
    const requestId = applyRequestRef.current + 1
    applyRequestRef.current = requestId
    applyAbortRef.current?.abort()
    const controller = new AbortController()
    applyAbortRef.current = controller
    setApplyState({
      status: 'running',
      step: '正在编译运行时清单',
    })

    const ensureCurrent = () => applyRequestRef.current === requestId

    try {
      const csrfToken = await getBridgeCsrfToken()
      if (!ensureCurrent()) return
      const response = await fetch(
        overview.importSummary.uiRuntimeManifestApiPath,
        {
          method: 'POST',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          body: JSON.stringify({
            customerKey: overview.customerKey,
            idempotencyKey: createDevCustomerConfigIdempotencyKey(
              'runtime-manifest',
              overview.customerKey
            ),
          }),
          signal: controller.signal,
        }
      )
      const manifestPayload = await response.json()
      if (!ensureCurrent()) {
        return
      }
      if (!response.ok) {
        if (response.status === 403) invalidateBridgeSession()
        throw new Error(
          response.status === 403
            ? '当前开发入口不允许生成永绅本地测试配置，请从 start:yoyoosun 启动后重试。'
            : '本地测试配置编译失败，请检查客户配置包后重试。'
        )
      }
      const { manifest } = manifestPayload

      setApplyState({
        status: 'running',
        step: '正在确认后端客户上下文',
      })
      await assertLocalBackendCustomerContext(manifest.customer_key)
      if (!ensureCurrent()) {
        return
      }

      setApplyState({
        status: 'running',
        step: '正在校验客户配置',
      })
      const validation = await validateCustomerConfig(manifest)
      if (!ensureCurrent()) {
        return
      }

      setApplyState({
        status: 'running',
        step: '正在写入本地测试配置版本',
      })
      const publish = await publishCustomerConfig(manifest)
      assertPublishedCustomerConfigIdentity(publish, manifest, validation)
      const transitionAction =
        resolveCustomerConfigApplyTransitionAction(publish)
      if (!ensureCurrent()) {
        return
      }

      setApplyState({
        status: 'running',
        step: '正在检查配置切换条件',
      })
      const transition = await confirmCustomerConfigTransition({
        action: transitionAction,
        manifest,
        validation,
        check: checkCustomerConfigTransition,
      })
      if (!ensureCurrent()) {
        return
      }

      setApplyState({
        status: 'running',
        step:
          transitionAction === 'rollback'
            ? '正在回切本地测试配置版本'
            : '正在激活本地测试配置版本',
      })
      const applied =
        transitionAction === 'rollback'
          ? await rollbackCustomerConfig(transition.mutationPayload)
          : await activateCustomerConfig(transition.mutationPayload)
      if (!ensureCurrent()) {
        return
      }

      setApplyState({
        status: 'running',
        step: '正在读取有效配置投影',
      })
      const effectiveSession = await getEffectiveSession()
      if (!ensureCurrent()) {
        return
      }
      assertEffectiveCustomerConfigIdentity(
        effectiveSession,
        manifest,
        validation
      )

      setApplyState({
        status: 'success',
        result: {
          manifestPath: manifestPayload.manifestPath,
          manifestGeneratedAt: manifestPayload.generatedAt,
          manifestSummary: manifestPayload.summary,
          validation,
          publish,
          transition,
          applied,
          effectiveSession,
          steps: [
            {
              key: 'compile',
              label: '编译清单',
              status: 'passed',
              note: manifestPayload.manifestPath,
            },
            {
              key: 'validate',
              label: '后端校验',
              status: 'passed',
              note: validation?.config_hash || '客户配置校验通过',
            },
            {
              key: 'publish',
              label: '发布测试版本',
              status: 'passed',
              note: publish?.status || '客户配置发布通过',
            },
            {
              key: 'transition',
              label: '切换检查',
              status: 'passed',
              note:
                transition.transition?.noop === true
                  ? '当前已是目标配置版本'
                  : '配置切换条件通过',
            },
            {
              key: 'activate',
              label:
                transitionAction === 'rollback'
                  ? '回切测试版本'
                  : '激活测试版本',
              status: 'test_apply_done',
              note:
                applied?.status ||
                (transitionAction === 'rollback'
                  ? '客户配置回切通过'
                  : '客户配置激活通过'),
            },
            {
              key: 'session',
              label: '读取会话投影',
              status: 'test_apply_done',
              note: effectiveSession?.configRevision || '有效配置投影读取通过',
            },
          ],
        },
      })
      message.success('本地测试配置已应用')
    } catch (error) {
      if (error?.name === 'AbortError') {
        return
      }
      if (!ensureCurrent()) {
        return
      }
      setApplyState({
        status: 'error',
        error: getCustomerConfigActionError(
          error,
          '测试配置应用失败，请确认本地后端和管理员权限。'
        ),
      })
      message.error('测试配置应用失败')
    } finally {
      if (ensureCurrent()) applyInFlightRef.current = false
    }
  }

  const requestApplyTestConfig = () => {
    if (
      !overview.importSummary.canApplyTestConfig ||
      applyInFlightRef.current
    ) {
      return
    }
    confirmationRef.current = modal.confirm({
      maskClosable: true,
      centered: true,
      title: '确认应用测试配置？',
      content:
        '目标：已登记的本地开发库。使用当前管理员身份写入并激活测试配置，影响本地页面、角色与责任池。不会修改测试服或正式服，也不导入客户业务数据。',
      okText: '确认应用测试配置',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: handleApplyTestConfig,
    })
  }

  return { applyState, requestApplyTestConfig }
}
