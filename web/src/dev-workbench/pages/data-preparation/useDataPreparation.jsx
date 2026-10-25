import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import useDevCustomerScope from '../../hooks/useDevCustomerScope.mjs'
import {
  DEV_DATA_PREPARATION_PROFILE_COPY,
  DEV_DATA_PREPARATION_PROFILE_KEYS,
  DEV_DATA_PREPARATION_PROFILE_QUERY_KEY,
  DEV_DATA_PREPARATION_ROUTE,
  DEV_DATA_PREPARATION_TARGET_KEYS,
  DEV_DATA_PREPARATION_TARGET_QUERY_KEY,
  buildDevDataPreparationSearch,
  createDevDataPreparationClient,
  resolveDataPreparationAvailability,
  resolveDataPreparationExecutionConfirmation,
  resolveDataPreparationPrepareIntent,
  selectRecoverableDataPreparationOperation,
} from '../../config/devDataPreparation.mjs'

export const DATA_VIEW_ITEMS = [
  { value: 'scope', label: '准备数据' },
  { value: 'confirm', label: '当前批次' },
  { value: 'receipts', label: '执行记录' },
]
const DATA_PROFILE_ORDER = [
  DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo,
  DEV_DATA_PREPARATION_PROFILE_KEYS.coreDemo,
  DEV_DATA_PREPARATION_PROFILE_KEYS.fullAcceptance,
]

export function profileTargetKey(profileKey, scenarioTargetKey) {
  if (profileKey === DEV_DATA_PREPARATION_PROFILE_KEYS.coreDemo) return DEV_DATA_PREPARATION_TARGET_KEYS.localDevelopment
  if (profileKey === DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo) return scenarioTargetKey
  return DEV_DATA_PREPARATION_TARGET_KEYS.isolatedLocal
}

export function useDataPreparation() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedDataView = DATA_VIEW_ITEMS.some((item) => item.value === searchParams.get('view'))
    ? searchParams.get('view') : 'scope'
  const selectDataView = (value) => setSearchParams((current) => {
    const next = new URLSearchParams(current)
    next.set('view', value)
    return next
  })
  const client = useMemo(() => createDevDataPreparationClient(), [])
  const searchWriterRef = useRef(setSearchParams)
  useEffect(() => { searchWriterRef.current = setSearchParams }, [setSearchParams])
  const mountedRef = useRef(false)
  const requestVersionRef = useRef(0)
  const refreshAbortRef = useRef(null)
  const currentOperationIdRef = useRef('')
  const prepareIntentRef = useRef(null)
  const mutationRef = useRef(false)
  const [summary, setSummary] = useState(null)
  const [selectedProfileKey, setSelectedProfileKey] = useState(() => {
    const requested = searchParams.get(DEV_DATA_PREPARATION_PROFILE_QUERY_KEY)
    return Object.values(DEV_DATA_PREPARATION_PROFILE_KEYS).includes(requested)
      ? requested : DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo
  })
  const [selectedScenarioTargetKey, setSelectedScenarioTargetKey] = useState(() =>
    searchParams.get(DEV_DATA_PREPARATION_TARGET_QUERY_KEY) === DEV_DATA_PREPARATION_TARGET_KEYS.customerTrial133
      ? DEV_DATA_PREPARATION_TARGET_KEYS.customerTrial133 : DEV_DATA_PREPARATION_TARGET_KEYS.localDevelopment)
  const selectedIsScenarioDemo = selectedProfileKey === DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo
  const customerScope = useDevCustomerScope({ searchParams, setSearchParams, normalize: selectedIsScenarioDemo })
  const customerReady = customerScope.status === 'ready'
  const [selectedChainKey, setSelectedChainKey] = useState('')
  const [currentOperation, setCurrentOperation] = useState(null)
  const dataView = requestedDataView === 'confirm'
    ? !currentOperation ? 'scope' : currentOperation.terminal ? 'receipts' : 'confirm'
    : requestedDataView
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [pollError, setPollError] = useState('')
  const [preparing, setPreparing] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')

  useEffect(() => {
    if (requestedDataView !== 'confirm' || !currentOperation?.terminal) return
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('view', 'receipts')
      return next
    }, { replace: true })
  }, [requestedDataView, currentOperation?.terminal, setSearchParams])
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])
  const isPageActive = () => mountedRef.current &&
    window.location.pathname.replace(/\/$/u, '') === DEV_DATA_PREPARATION_ROUTE
  const updateOperation = useCallback((operation) => {
    currentOperationIdRef.current = operation.id
    setCurrentOperation(operation)
    setSummary((current) => current ? { ...current,
      currentOperations: [operation, ...current.currentOperations.filter((item) => item.id !== operation.id)],
    } : current)
  }, [])
  const refresh = useCallback(async ({ force = false } = {}) => {
    refreshAbortRef.current?.abort()
    const controller = new AbortController()
    refreshAbortRef.current = controller
    const requestVersion = ++requestVersionRef.current
    setLoading(true)
    setLoadError('')
    try {
      const summaryClient = createDevDataPreparationClient({
        fetchImpl: (input, init) => globalThis.fetch(input, { ...init, signal: controller.signal }),
      })
      const nextSummary = await summaryClient.summary({ force })
      if (requestVersion !== requestVersionRef.current) return
      setSummary(nextSummary)
      const recoveredOperation = selectRecoverableDataPreparationOperation(
        nextSummary.currentOperations, currentOperationIdRef.current, selectedProfileKey, profileTargetKey(selectedProfileKey, selectedScenarioTargetKey))
      currentOperationIdRef.current = recoveredOperation?.id || ''
      setCurrentOperation(recoveredOperation)
      if (recoveredOperation) {
        setSelectedProfileKey(recoveredOperation.profileKey)
        const recoveredTargetKey = recoveredOperation.targetSummary.targetKey
        if (recoveredOperation.profileKey === DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo) setSelectedScenarioTargetKey(recoveredTargetKey)
        searchWriterRef.current((current) => buildDevDataPreparationSearch(current, {
          profileKey: recoveredOperation.profileKey, targetKey: recoveredTargetKey, customerKey: customerScope.customerKey,
        }), { replace: true })
        if (prepareIntentRef.current?.profileKey === recoveredOperation.profileKey) prepareIntentRef.current = null
      }
    } catch (error) {
      if (controller.signal.aborted || requestVersion !== requestVersionRef.current) return
      setLoadError(getActionErrorMessage(error, '读取数据准备预检'))
    } finally {
      if (requestVersion === requestVersionRef.current) setLoading(false)
    }
  }, [customerScope.customerKey, selectedProfileKey, selectedScenarioTargetKey])
  useEffect(() => {
    refresh()
    return () => { refreshAbortRef.current?.abort(); requestVersionRef.current += 1 }
  }, [refresh])

  const activeOperationId = currentOperation?.id || ''
  const activeOperationTerminal = currentOperation?.terminal === true
  useEffect(() => {
    if (!activeOperationId || activeOperationTerminal) return undefined
    let cancelled = false
    let timerId
    const poll = async () => {
      let delay = 1500
      try {
        const operation = await client.operation(activeOperationId)
        if (cancelled || currentOperationIdRef.current !== activeOperationId) return
        setPollError('')
        updateOperation(operation)
        if (operation.terminal) return
      } catch (error) {
        if (cancelled || currentOperationIdRef.current !== activeOperationId) return
        setPollError(getActionErrorMessage(error, '刷新回执'))
        delay = 3000
      }
      timerId = window.setTimeout(poll, delay)
    }
    timerId = window.setTimeout(poll, 1500)
    return () => { cancelled = true; window.clearTimeout(timerId) }
  }, [activeOperationId, activeOperationTerminal, client, updateOperation])

  const profiles = [...(summary?.profiles || [])].sort((a, b) => DATA_PROFILE_ORDER.indexOf(a.key) - DATA_PROFILE_ORDER.indexOf(b.key))
  const selectedProfile = profiles.find((profile) => profile.key === selectedProfileKey)
  const selectedProfileCopy = DEV_DATA_PREPARATION_PROFILE_COPY[selectedProfileKey]
  const selectedOperationTargetKey = profileTargetKey(selectedProfileKey, selectedScenarioTargetKey)
  const availability = resolveDataPreparationAvailability(summary, selectedProfileKey, selectedOperationTargetKey)
  const hasActiveOperation = (summary?.currentOperations || []).some((operation) => ['launching', 'running'].includes(operation.status))
  const currentIsScenarioDemo = currentOperation?.profileKey === DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo
  const canPrepare = Boolean(selectedProfile) && !availability.blockers.length && !hasActiveOperation &&
    (!selectedIsScenarioDemo || customerReady) && !loading && !loadError && !preparing && !executing
  const canExecuteCurrent = currentOperation?.status === 'ready' && currentOperation.profileKey === selectedProfileKey &&
    currentOperation.targetSummary.targetKey === selectedOperationTargetKey && !hasActiveOperation &&
    !availability.blockers.length && (!currentIsScenarioDemo || customerReady) && !loading && !loadError && !preparing && !executing
  const currentExecutionConfirmation = currentOperation ? resolveDataPreparationExecutionConfirmation(currentOperation, confirmation) : ''

  const changeSelection = (profileKey, targetKey) => {
    if (mutationRef.current) return
    requestVersionRef.current += 1
    refreshAbortRef.current?.abort()
    setLoading(true)
    setSelectedProfileKey(profileKey)
    setSelectedScenarioTargetKey(targetKey)
    setSearchParams((current) => buildDevDataPreparationSearch(current, {
      profileKey, targetKey, customerKey: customerScope.customerKey,
    }), { replace: true })
    currentOperationIdRef.current = ''
    prepareIntentRef.current = null
    setCurrentOperation(null)
    setActionError('')
    setPollError('')
    setConfirmOpen(false)
    setConfirmation('')
  }
  const selectProfile = (profileKey) => changeSelection(profileKey, selectedScenarioTargetKey)
  const selectScenarioTarget = (targetKey) => changeSelection(selectedProfileKey, targetKey)
  const prepareBlockingReason = loading ? '正在检查当前条件…'
    : loadError ? '预检读取失败，请重新检查后再操作。'
      : selectedIsScenarioDemo && !customerReady ? '先选择已登记甲方，再准备对应的业务场景。'
        : hasActiveOperation ? '已有批次正在执行，请先查看当前批次。'
          : availability.blockers.length ? '请先处理下面列出的条件，再重新检查。' : ''

  const handlePrepare = async () => {
    if (!canPrepare || mutationRef.current) return
    mutationRef.current = true
    setPreparing(true)
    setActionError('')
    try {
      const intent = resolveDataPreparationPrepareIntent(prepareIntentRef.current, selectedProfileKey, selectedOperationTargetKey)
      prepareIntentRef.current = intent
      const result = await client.prepare(selectedProfileKey, selectedOperationTargetKey, intent.idempotencyKey)
      if (!isPageActive()) return
      updateOperation(result.operation)
      selectDataView('confirm')
      prepareIntentRef.current = null
      message.success(result.reused ? '已读回复用的不可变计划' : '不可变计划已准备')
      if (selectedIsScenarioDemo && result.operation.status === 'ready') {
        setConfirmation(result.operation.confirmationRequired)
        setConfirmOpen(true)
      }
    } catch (error) {
      if (isPageActive()) setActionError(getActionErrorMessage(error, '准备计划'))
    } finally {
      mutationRef.current = false
      if (isPageActive()) setPreparing(false)
    }
  }
  const handleExecute = async () => {
    if (!canExecuteCurrent || !currentOperation || mutationRef.current || currentExecutionConfirmation !== currentOperation.confirmationRequired) return
    mutationRef.current = true
    setExecuting(true)
    setActionError('')
    try {
      const result = await client.execute(currentOperation.id, currentExecutionConfirmation)
      if (!isPageActive()) return
      updateOperation(result.operation)
      setConfirmOpen(false)
      setConfirmation('')
      selectDataView('confirm')
      message.success('批次已启动，正在跟踪执行结果')
    } catch (error) {
      if (isPageActive()) {
        setActionError(getActionErrorMessage(error, '执行固定计划', {
          suffix: '请先重新检查并核对批次结果，系统没有自动重试',
        }))
      }
    } finally {
      mutationRef.current = false
      if (isPageActive()) setExecuting(false)
    }
  }
  return {
    actionError,
    availability,
    canExecuteCurrent,
    canPrepare,
    confirmation,
    confirmOpen,
    currentExecutionConfirmation,
    currentIsScenarioDemo,
    currentOperation,
    customerScope,
    dataView,
    executing,
    handleExecute,
    handlePrepare,
    loadError,
    loading,
    pollError,
    prepareBlockingReason,
    preparing,
    profiles,
    refresh,
    selectDataView,
    selectedChainKey,
    selectedIsScenarioDemo,
    selectedOperationTargetKey,
    selectedProfile,
    selectedProfileCopy,
    selectedProfileKey,
    selectedScenarioTargetKey,
    selectProfile,
    selectScenarioTarget,
    setActionError,
    setConfirmation,
    setConfirmOpen,
    setSelectedChainKey,
    summary,
  }
}
