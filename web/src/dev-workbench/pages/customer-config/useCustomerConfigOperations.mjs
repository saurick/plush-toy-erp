import { useEffect, useRef, useState } from 'react'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { createDevCustomerConfigIdempotencyKey } from '../../config/devCustomerConfig.mjs'
import { releaseHistoryForBatch } from './navigation.mjs'
import { useCustomerConfigTestApply } from './useCustomerConfigTestApply.mjs'

export function useCustomerConfigOperations({
  overview,
  requestedReleaseBatch,
}) {
  const { customerKey } = overview
  const ready = overview.status === 'ready'
  const api = overview.importSummary || {}
  const { uiSessionApiPath, uiReleaseBatchesApiPath, uiOperationsApiPath } = api
  const [dryRunState, setDryRunState] = useState({ status: 'idle' })
  const [currentRelease, setCurrentRelease] = useState({ status: 'idle' })
  const [releaseBatchesState, setReleaseBatchesState] = useState({
    status: 'idle',
    batches: [],
  })
  const [historyState, setHistoryState] = useState({
    status: 'idle',
    operations: [],
  })
  const [readAttempt, setReadAttempt] = useState(0)
  const activityRef = useRef(0)
  const dryRunRequestRef = useRef(0)
  const dryRunAbortRef = useRef(null)
  const releaseRequestRef = useRef(0)
  const releaseAbortRef = useRef(null)
  const inFlightRef = useRef(false)
  const sessionRef = useRef({ token: '', promise: null, controller: null })

  const getBridgeCsrfToken = async () => {
    const session = sessionRef.current
    if (session.token) return session.token
    if (!session.promise) {
      session.controller = new AbortController()
      session.promise = fetch(uiSessionApiPath, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
        signal: session.controller.signal,
      })
        .then(async (response) => {
          const payload = await response.json()
          if (
            !response.ok ||
            payload.kind !== 'plush.dev-customer-config-session' ||
            typeof payload.csrfToken !== 'string' ||
            payload.csrfToken.length < 32
          ) {
            throw new Error('客户配置工具会话初始化失败')
          }
          session.token = payload.csrfToken
          return session.token
        })
        .finally(() => {
          session.promise = null
        })
    }
    return session.promise
  }

  const { applyState, requestApplyTestConfig } = useCustomerConfigTestApply({
    overview,
    getBridgeCsrfToken,
    invalidateBridgeSession: () => {
      sessionRef.current.token = ''
    },
  })
  const releaseBatch =
    releaseBatchesState.status === 'success' &&
    releaseBatchesState.batches.includes(requestedReleaseBatch)
      ? requestedReleaseBatch
      : ''
  const previousRelease = releaseHistoryForBatch(
    historyState.operations,
    releaseBatch
  )
  // A stored check belongs to its original source snapshot. It cannot qualify
  // the current working tree or a different evidence batch for publication.
  const releaseState =
    currentRelease.releaseBatch === releaseBatch && releaseBatch
      ? currentRelease
      : previousRelease
        ? {
            status: 'historical',
            operation: previousRelease,
            result: previousRelease.result,
          }
        : { status: 'idle' }
  const isMutationRunning =
    dryRunState.status === 'running' ||
    applyState.status === 'running' ||
    releaseState.status === 'checking'

  useEffect(() => {
    setDryRunState({ status: 'idle' })
    setCurrentRelease({ status: 'idle' })
    setReleaseBatchesState({ status: 'idle', batches: [] })
    setHistoryState({ status: 'idle', operations: [] })
    inFlightRef.current = false
    activityRef.current += 1
    return () => {
      activityRef.current += 1
      dryRunRequestRef.current += 1
      releaseRequestRef.current += 1
      dryRunAbortRef.current?.abort()
      releaseAbortRef.current?.abort()
      sessionRef.current.controller?.abort()
      sessionRef.current = { token: '', promise: null, controller: null }
    }
  }, [customerKey])

  useEffect(() => {
    if (!ready || !uiReleaseBatchesApiPath) return undefined
    const controller = new AbortController()
    const url = new URL(uiReleaseBatchesApiPath, window.location.origin)
    url.searchParams.set('customerKey', customerKey)
    setReleaseBatchesState({ status: 'loading', batches: [] })
    fetch(`${url.pathname}${url.search}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('发布批次读取失败')
        return response.json()
      })
      .then((payload) => {
        if (controller.signal.aborted) return
        setReleaseBatchesState({
          status: 'success',
          batches: Array.isArray(payload.batches) ? payload.batches : [],
        })
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setReleaseBatchesState({
          status: 'error',
          batches: [],
          error: getActionErrorMessage(error, '发布批次读取失败'),
        })
      })
    return () => controller.abort()
  }, [customerKey, readAttempt, ready, uiReleaseBatchesApiPath])

  useEffect(() => {
    if (!ready || !uiOperationsApiPath) return undefined
    const controller = new AbortController()
    const revision = activityRef.current
    const url = new URL(uiOperationsApiPath, window.location.origin)
    url.searchParams.set('customerKey', customerKey)
    fetch(`${url.pathname}${url.search}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('操作历史读取失败')
        return response.json()
      })
      .then((payload) => {
        if (controller.signal.aborted) return
        const operations = Array.isArray(payload.operations)
          ? payload.operations
          : []
        setHistoryState({ status: 'success', operations })
        if (revision !== activityRef.current) return
        const previous = operations.find((item) => item.action === 'dry-run')
        if (previous?.status === 'passed' && previous.result) {
          setDryRunState({
            status: 'success',
            historical: true,
            result: previous.result,
          })
        } else if (['failed', 'not_proven'].includes(previous?.status)) {
          setDryRunState({
            status: 'error',
            error:
              previous.status === 'not_proven'
                ? '上次样本试跑结果待核对，请重新试跑。'
                : '上次样本试跑失败，请修复后重新试跑。',
          })
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setHistoryState({
          status: 'error',
          operations: [],
          error: getActionErrorMessage(error, '操作历史读取失败'),
        })
      })
    return () => controller.abort()
  }, [customerKey, readAttempt, ready, uiOperationsApiPath])

  useEffect(() => {
    if (!isMutationRunning) return undefined
    const warn = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isMutationRunning])

  const postBridge = async (path, body, controller) => {
    const csrfToken = await getBridgeCsrfToken()
    if (controller.signal.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    const response = await fetch(path, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (response.status === 403) sessionRef.current.token = ''
    if (!response.ok) {
      const error = new Error('客户配置操作失败')
      error.httpStatus = response.status
      throw error
    }
    return response.json()
  }

  const handleRunDryRun = async () => {
    if (isMutationRunning || inFlightRef.current || !api.canRunUiDryRun) return
    inFlightRef.current = true
    activityRef.current += 1
    const id = ++dryRunRequestRef.current
    const controller = new AbortController()
    dryRunAbortRef.current = controller
    const current = () =>
      !controller.signal.aborted && dryRunRequestRef.current === id
    setDryRunState({ status: 'running' })
    try {
      const result = await postBridge(
        api.uiDryRunApiPath,
        {
          customerKey,
          idempotencyKey: createDevCustomerConfigIdempotencyKey(
            'dry-run',
            customerKey
          ),
        },
        controller
      )
      if (!current()) return
      setDryRunState({ status: 'success', result })
      message.success('样本试跑证据已生成')
    } catch (error) {
      if (!current()) return
      setDryRunState({
        status: 'error',
        error: getActionErrorMessage(error, '生成试跑结果', {
          suffix: '请检查开发服务后重试',
        }),
      })
      message.error('试跑生成失败')
    } finally {
      if (current()) inFlightRef.current = false
    }
  }

  const handleCheckReleaseReadiness = async () => {
    if (
      isMutationRunning ||
      inFlightRef.current ||
      !api.canCheckReleaseReadiness ||
      !releaseBatch
    ) {
      return
    }
    inFlightRef.current = true
    activityRef.current += 1
    const id = ++releaseRequestRef.current
    const controller = new AbortController()
    releaseAbortRef.current = controller
    const current = () =>
      !controller.signal.aborted && releaseRequestRef.current === id
    setCurrentRelease({ status: 'checking', releaseBatch })
    try {
      const result = await postBridge(
        api.uiReleaseReadinessApiPath,
        {
          customerKey,
          releaseBatch,
          idempotencyKey: createDevCustomerConfigIdempotencyKey(
            'release-readiness',
            customerKey
          ),
        },
        controller
      )
      if (!current()) return
      if (result.releaseBatch !== releaseBatch) {
        throw new Error('发布检查返回的证据批次不匹配，请重新检查。')
      }
      const status = result.status === 'ready' ? 'success' : 'blocked'
      setCurrentRelease({ status, result, releaseBatch })
      message[status === 'success' ? 'success' : 'warning'](
        status === 'success' ? '发布检查已通过' : '发布检查未通过'
      )
    } catch (error) {
      if (!current()) return
      setCurrentRelease({
        status: 'error',
        releaseBatch,
        error: getActionErrorMessage(error, '发布检查失败'),
      })
      message.error('发布检查失败')
    } finally {
      if (current()) inFlightRef.current = false
    }
  }

  return {
    dryRunState,
    applyState,
    releaseState,
    releaseBatchesState,
    historyState,
    releaseBatch,
    isMutationRunning,
    handleRunDryRun,
    requestApplyTestConfig: () => {
      if (isMutationRunning || inFlightRef.current) return
      activityRef.current += 1
      requestApplyTestConfig()
    },
    handleCheckReleaseReadiness,
    retryRead: () => setReadAttempt((attempt) => attempt + 1),
    resetRelease: () => setCurrentRelease({ status: 'idle' }),
  }
}
