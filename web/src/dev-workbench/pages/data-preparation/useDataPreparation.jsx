import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import useDevCustomerScope from '../../hooks/useDevCustomerScope.mjs'
import {
  DEV_DATA_PREPARATION_PROFILE_KEYS,
  DEV_DATA_PREPARATION_TARGET_KEYS,
  DEV_DATA_PREPARATION_TARGET_QUERY_KEY,
  createDevDataPreparationClient,
  resolveDataPreparationAvailability,
  resolveDataPreparationExecutionConfirmation,
  resolveDataPreparationPrepareIntent,
  selectRecoverableDataPreparationOperation,
} from '../../config/devDataPreparation.mjs'

export const DATA_VIEW_ITEMS = [
  { value: 'scope', label: '准备数据' },
  { value: 'receipts', label: '执行记录' },
]

function isWriting(operation) {
  return operation.status === 'launching' || operation.status === 'running'
}

function scenarioTarget(search) {
  return search.get(DEV_DATA_PREPARATION_TARGET_QUERY_KEY) === DEV_DATA_PREPARATION_TARGET_KEYS.customerTrial133
    ? DEV_DATA_PREPARATION_TARGET_KEYS.customerTrial133
    : DEV_DATA_PREPARATION_TARGET_KEYS.localDevelopment
}

export function useDataPreparation(profileKey) {
  const daily = profileKey === DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo
  const [searchParams, setSearchParams] = useSearchParams()
  const dataView = daily && searchParams.get('view') === 'receipts' ? 'receipts' : 'scope'
  const selectedTargetKey = daily ? scenarioTarget(searchParams) : DEV_DATA_PREPARATION_TARGET_KEYS.isolatedLocal
  const customerScope = useDevCustomerScope({ searchParams, setSearchParams, normalize: daily })
  const customerReady = !daily || customerScope.status === 'ready'
  const selectedChainKey = searchParams.get('planChain') || ''

  const setQuery = (key, value, options) => setSearchParams((current) => {
    const next = new URLSearchParams(current)
    if (value) next.set(key, value)
    else next.delete(key)
    return next
  }, options)

  const client = useMemo(() => createDevDataPreparationClient(), [])
  const mounted = useRef(false)
  const refreshAbort = useRef(null)
  const mutation = useRef(false)
  const prepareIntent = useRef(null)
  const [summary, setSummary] = useState(null)
  const [trackedId, setTrackedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [pollError, setPollError] = useState('')
  const [preparing, setPreparing] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [confirmOperationId, setConfirmOperationId] = useState('')
  const [confirmation, setConfirmation] = useState('')

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const refresh = useCallback(async ({ force = false } = {}) => {
    refreshAbort.current?.abort()
    const controller = new AbortController()
    refreshAbort.current = controller
    setLoading(true)
    setLoadError('')
    try {
      const summaryClient = createDevDataPreparationClient({
        fetchImpl: (input, init) => globalThis.fetch(input, { ...init, signal: controller.signal }),
      })
      const next = await summaryClient.summary({ force })
      if (!controller.signal.aborted) setSummary(next)
    } catch (error) {
      if (!controller.signal.aborted) setLoadError(getActionErrorMessage(error, '检查数据环境'))
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    return () => refreshAbort.current?.abort()
  }, [refresh, selectedTargetKey])

  const updateOperation = useCallback((operation) => {
    setSummary((current) => current ? {
      ...current,
      currentOperations: [operation, ...current.currentOperations.filter(({ id }) => id !== operation.id)],
    } : current)
  }, [])
  const operations = summary?.currentOperations || []
  const writingId = operations.find(isWriting)?.id
  const hasActiveOperation = Boolean(writingId) || (summary?.unresolvedOperations || []).some(isWriting)

  useEffect(() => {
    if (!writingId) return undefined
    let cancelled = false
    let timer
    const poll = async () => {
      let delay = 1500
      try {
        const operation = await client.operation(writingId)
        if (cancelled) return
        setPollError('')
        updateOperation(operation)
        if (operation.terminal) return
      } catch (error) {
        if (cancelled) return
        setPollError(getActionErrorMessage(error, '刷新执行结果'))
        delay = 3000
      }
      timer = window.setTimeout(poll, delay)
    }
    timer = window.setTimeout(poll, 1500)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [writingId, client, updateOperation])

  const currentOperation = selectRecoverableDataPreparationOperation(operations, trackedId, profileKey, selectedTargetKey)
  const availability = resolveDataPreparationAvailability(summary, profileKey, selectedTargetKey)
  const canPrepare = customerReady && !availability.blockers.length && !hasActiveOperation &&
    !loading && !loadError && !preparing && !executing
  const canExecute = canPrepare && currentOperation?.status === 'ready' &&
    !currentOperation.issues.some((issue) => issue.severity === 'blocked')
  const confirmOpen = Boolean(currentOperation?.status === 'ready' && confirmOperationId === currentOperation.id)
  const executionConfirmation = confirmOpen ? resolveDataPreparationExecutionConfirmation(currentOperation, confirmation) : ''

  function closeConfirm() {
    setConfirmOperationId('')
    setConfirmation('')
  }

  function selectTarget(targetKey) {
    if (mutation.current || targetKey === selectedTargetKey) return
    refreshAbort.current?.abort()
    setLoading(true)
    setTrackedId('')
    prepareIntent.current = null
    setActionError('')
    closeConfirm()
    setQuery(DEV_DATA_PREPARATION_TARGET_QUERY_KEY, targetKey, { replace: true })
  }

  function belongsToCurrentTarget() {
    return mounted.current && (!daily || scenarioTarget(new URLSearchParams(window.location.search)) === selectedTargetKey)
  }

  async function handlePrepare() {
    if (!canPrepare || mutation.current) return
    if (canExecute && !actionError) {
      setConfirmOperationId(currentOperation.id)
      return
    }
    mutation.current = true
    setPreparing(true)
    setActionError('')
    try {
      const intent = resolveDataPreparationPrepareIntent(prepareIntent.current, profileKey, selectedTargetKey)
      prepareIntent.current = intent
      const { operation } = await client.prepare(profileKey, selectedTargetKey, intent.idempotencyKey)
      if (!mounted.current) return
      updateOperation(operation)
      if (!belongsToCurrentTarget()) return
      setTrackedId(operation.id)
      prepareIntent.current = null
      if (operation.status === 'ready' && !operation.issues.some((issue) => issue.severity === 'blocked')) {
        setConfirmOperationId(operation.id)
      }
    } catch (error) {
      if (belongsToCurrentTarget()) setActionError(getActionErrorMessage(error, daily ? '准备手测数据' : '准备完整回归'))
    } finally {
      mutation.current = false
      if (mounted.current) setPreparing(false)
    }
  }

  async function handleExecute() {
    if (!confirmOpen || !canExecute || mutation.current || executionConfirmation !== currentOperation.confirmationRequired) return
    mutation.current = true
    setExecuting(true)
    setActionError('')
    try {
      const { operation } = await client.execute(currentOperation.id, executionConfirmation)
      if (!mounted.current) return
      updateOperation(operation)
      if (belongsToCurrentTarget()) closeConfirm()
    } catch (error) {
      if (belongsToCurrentTarget()) {
        closeConfirm()
        setActionError(getActionErrorMessage(error, daily ? '补齐手测数据' : '执行完整回归', {
          suffix: '请先重新检查并核对执行记录。',
        }))
      }
    } finally {
      mutation.current = false
      if (mounted.current) setExecuting(false)
    }
  }

  return {
    actionError,
availability,
canPrepare,
canExecute,
confirmOpen,
confirmation,
    currentOperation,
customerScope,
dataView,
executing,
executionConfirmation,
    handleExecute,
handlePrepare,
hasActiveOperation,
loading,
loadError,
pollError,
    preparing,
refresh,
selectedChainKey,
selectedTargetKey,
summary,
    closeConfirm,
selectTarget,
setConfirmation,
    selectDataView: daily ? (value) => setQuery('view', value === 'scope' ? '' : value) : undefined,
    setSelectedChainKey: (value) => {
      if (value !== selectedChainKey) setQuery('planChain', value, daily ? undefined : { replace: true, preventScrollReset: true })
    },
  }
}
