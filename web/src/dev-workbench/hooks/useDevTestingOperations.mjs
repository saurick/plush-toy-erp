import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { message } from '@/common/utils/antdApp'
import {
  DEV_PRESSURE_ACTIONS,
  DEV_TESTING_FIXED_ACTIONS,
  createDevTestingIdempotencyKey,
  createDevTestingOperationClient,
  isDevTestingOperationActive,
} from '../config/devTestingOperation.mjs'

export const EMPTY_TESTING_OPERATIONS = Object.freeze(Object.fromEntries(
  [...DEV_TESTING_FIXED_ACTIONS, ...DEV_PRESSURE_ACTIONS].map(({ key }) => [key, null])
))

export default function useDevTestingOperations({ client } = {}) {
  const testingSummaryRequestSequence = useRef(0)
  const testingIdempotencyKeys = useRef({})
  const handledTestingTerminals = useRef(new Set())
  const actionController = useRef(null)
  const testingOperationClient = useMemo(
    () => client || createDevTestingOperationClient(),
    [client]
  )
  useEffect(() => () => actionController.current?.abort(), [])
  const [testingSummaryReloadKey, setTestingSummaryReloadKey] = useState(0)
  const [testingSummary, setTestingSummary] = useState(null)
  const [testingSummaryError, setTestingSummaryError] = useState('')
  const [testingActionStarting, setTestingActionStarting] = useState('')
  const testingOperations =
    testingSummary?.operations || EMPTY_TESTING_OPERATIONS
  const testingActiveOperations = Object.values(testingOperations).filter(
    isDevTestingOperationActive
  )
  const testingActiveOperationIds = testingActiveOperations
    .map((operation) => operation.id)
    .sort()
    .join(',')
  const testingHasActive = testingActiveOperations.length > 0
  const testingBusy = testingSummary?.busy || {
    active: false,
    kind: '',
    profile: '',
  }

  useEffect(() => {
    const controller = new AbortController()
    const requestSequence = testingSummaryRequestSequence.current + 1
    testingSummaryRequestSequence.current = requestSequence

    const loadTestingSummary = async () => {
      try {
        const nextSummary = await testingOperationClient.summary({
          signal: controller.signal,
        })
        if (
          controller.signal.aborted ||
          requestSequence !== testingSummaryRequestSequence.current
        ) {
          return
        }
        setTestingSummary(nextSummary)
        setTestingSummaryError('')
      } catch (_error) {
        if (
          controller.signal.aborted ||
          requestSequence !== testingSummaryRequestSequence.current
        ) {
          return
        }
        setTestingSummaryError('固定验证状态读取失败，请检查当前工作台服务。')
      }
    }

    loadTestingSummary()
    return () => controller.abort()
  }, [testingOperationClient, testingSummaryReloadKey])

  const handleTestingTerminal = useCallback((operation) => {
    if (!operation || isDevTestingOperationActive(operation)) return
    const terminalKey = `${operation.id}:${operation.revision}`
    if (handledTestingTerminals.current.has(terminalKey)) return
    handledTestingTerminals.current.add(terminalKey)
    delete testingIdempotencyKeys.current[operation.action]
    setTestingSummaryReloadKey((current) => current + 1)
    const toastKey = `dev-testing-${operation.action}`
    if (operation.status === 'completed') {
      message.success({ content: operation.message, key: toastKey })
    } else if (operation.status === 'failed') {
      message.error({ content: operation.message, key: toastKey })
    } else {
      message.warning({ content: operation.message, key: toastKey })
    }
  }, [])

  useEffect(() => {
    if (!testingActiveOperationIds) return undefined
    const operationIds = testingActiveOperationIds.split(',')
    const controller = new AbortController()
    let timer = null

    const poll = async () => {
      try {
        const nextOperations = await Promise.all(
          operationIds.map((operationId) =>
            testingOperationClient.read(operationId, {
              signal: controller.signal,
            })
          )
        )
        if (controller.signal.aborted) return
        setTestingSummary((current) => {
          if (!current) return current
          const operations = { ...current.operations }
          for (const operation of nextOperations) {
            const previous = operations[operation.action]
            if (
              !previous ||
              previous.id !== operation.id ||
              previous.revision <= operation.revision
            ) {
              operations[operation.action] = operation
            }
          }
          return { ...current, operations }
        })
        setTestingSummaryError('')
        for (const operation of nextOperations) {
          handleTestingTerminal(operation)
        }
        if (nextOperations.some(isDevTestingOperationActive)) {
          timer = window.setTimeout(poll, 1200)
        }
      } catch (_error) {
        if (controller.signal.aborted) return
        setTestingSummaryError(
          '固定验证进度读取暂时失败，后台任务可能仍在执行。'
        )
        timer = window.setTimeout(poll, 1800)
      }
    }

    timer = window.setTimeout(poll, 800)
    return () => {
      controller.abort()
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [handleTestingTerminal, testingActiveOperationIds, testingOperationClient])

  const reloadTestingSummary = useCallback(() => {
    setTestingSummaryError('')
    setTestingSummaryReloadKey((current) => current + 1)
  }, [])

  const runTestingAction = async (action, dataScale) => {
    if (
      actionController.current ||
      testingActionStarting ||
      !testingSummary ||
      testingSummaryError ||
      testingBusy.active ||
      testingHasActive
    ) {
      return
    }
    const controller = new AbortController()
    actionController.current = controller
    setTestingActionStarting(action)
    setTestingSummaryError('')
    try {
      if (!testingIdempotencyKeys.current[action]) {
        testingIdempotencyKeys.current[action] =
          { key: createDevTestingIdempotencyKey(action), dataScale }
      }
      const operation = await testingOperationClient.start(
        action,
        testingIdempotencyKeys.current[action].key,
        { dataScale: testingIdempotencyKeys.current[action].dataScale, signal: controller.signal }
      )
      if (controller.signal.aborted) return
      setTestingSummary((current) => ({
        ...(current || {
          kind: 'plush.dev-qa-testing-summary',
          operations: { ...EMPTY_TESTING_OPERATIONS },
        }),
        busy: isDevTestingOperationActive(operation)
          ? { active: true, kind: 'testing', profile: action }
          : { active: false, kind: '', profile: '' },
        operations: {
          ...(current?.operations || EMPTY_TESTING_OPERATIONS),
          [action]: operation,
        },
      }))
      if (!isDevTestingOperationActive(operation)) {
        handleTestingTerminal(operation)
      }
    } catch (_error) {
      if (controller.signal.aborted) return
      setTestingSummaryError(
        '固定验证请求暂时未确认；再次点击会复用同一请求，不会重复启动。'
      )
      message.error({
        content: '固定验证暂时无法确认，请检查当前工作台服务',
        key: `dev-testing-${action}`,
      })
    } finally {
      if (actionController.current === controller) actionController.current = null
      if (!controller.signal.aborted) setTestingActionStarting('')
    }
  }

  return {
    testingOperationClient,
    testingSummary,
    testingSummaryError,
    testingOperations,
    testingBusy,
    testingHasActive,
    testingActionStarting,
    reloadTestingSummary,
    runTestingAction,
  }
}
