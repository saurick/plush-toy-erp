import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import Select from '@/common/components/select/AppSelect'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { showPageLoadError } from './PageLoadFeedback.jsx'
import {
  remoteReferences,
  loadReferenceIDs,
  canReadReference,
} from '../utils/remoteReferences.mjs'
import {
  createProductionOrderReferenceRequestGate,
  mergeProductionOrderReferenceOptions,
  nextProductionOrderReferencePage,
  PRODUCTION_ORDER_REFERENCE_PAGE_SIZE,
} from '../utils/productionOrderReferencePagination.mjs'

export const ReferenceRecordsContext = createContext(null)

export function ReferenceRecordsProvider({
  component: Component,
  handlers,
  adminProfile,
  children,
  ...props
}) {
  const value = useMemo(
    () => ({ ...handlers, adminProfile }),
    [handlers, adminProfile]
  )
  return (
    <ReferenceRecordsContext.Provider value={value}>
      <Component {...props}>{children}</Component>
    </ReferenceRecordsContext.Provider>
  )
}

const RemoteReferenceSelect = forwardRef(
  (
    {
      referenceType,
      params = {},
      component: Component = Select,
      options: initialOptions = [],
      value,
      disabled,
      onOpenChange,
      onSearch,
      onRecords,
      mapOption,
      ...props
    },
    ref
  ) => {
    const context = useContext(ReferenceRecordsContext)
    const scopeKey = JSON.stringify(context?.adminProfile || null)
    disabled =
      disabled || !canReadReference(context?.adminProfile, referenceType)
    const descriptor = remoteReferences[referenceType]
    const [options, setOptions] = useState([])
    const [selectedOptions, setSelectedOptions] = useState([])
    const [loading, setLoading] = useState(false)
    const state = useRef({
      gate: createProductionOrderReferenceRequestGate(),
      nextOffset: null,
      loading: false,
      keyword: '',
    })
    const controller = useRef(null)
    const timer = useRef(null)
    const paramsKey = JSON.stringify(params)
    const callbacks = useRef(null)
    callbacks.current = {
      context,
      onRecords,
      scopeKey,
      mapOption: mapOption || descriptor.option,
    }
    const accept = useCallback(
      (records) => {
        callbacks.current.context?.[referenceType]?.(records)
        callbacks.current.onRecords?.(records)
        return records.map((record) => ({
          ...callbacks.current.mapOption(record),
          record,
        }))
      },
      [referenceType]
    )
    const load = useCallback(
      async (keyword, offset, generation) => {
        state.current.loading = true
        setLoading(true)
        const abort = new AbortController()
        controller.current = abort
        try {
          const data = await descriptor.list(
            {
              ...(descriptor.active ? { active_only: true } : {}),
              ...JSON.parse(paramsKey),
              keyword,
              offset,
              limit: PRODUCTION_ORDER_REFERENCE_PAGE_SIZE,
            },
            { signal: abort.signal }
          )
          if (
            !state.current.gate.isCurrent(generation) ||
            callbacks.current.scopeKey !== scopeKey
          ) {
            return
          }
          if (
            !Array.isArray(data?.[referenceType]) ||
            data.offset !== offset ||
            data.limit !== PRODUCTION_ORDER_REFERENCE_PAGE_SIZE ||
            !Number.isSafeInteger(data.total) ||
            (data[referenceType].length === 0 && offset < data.total)
          ) {
            throw new Error('服务器返回的可选资料不完整，请重试')
          }
          const incoming = accept(data[referenceType])
          setOptions((current) =>
            offset === 0
              ? incoming
              : mergeProductionOrderReferenceOptions(current, incoming)
          )
          state.current.nextOffset = nextProductionOrderReferencePage({
            ...data,
            options: incoming,
          })
        } catch (error) {
          if (
            !isRpcAbortError(error) &&
            state.current.gate.isCurrent(generation)
          ) {
            showPageLoadError(error, '加载可选资料')
          }
        } finally {
          if (state.current.gate.isCurrent(generation)) {
            state.current.loading = false
            setLoading(false)
          }
        }
      },
      [descriptor, referenceType, paramsKey, accept, scopeKey]
    )
    const search = useCallback(
      (keyword = '') => {
        clearTimeout(timer.current)
        controller.current?.abort()
        const generation = state.current.gate.next()
        state.current.keyword = keyword
        state.current.nextOffset = null
        setOptions([])
        timer.current = setTimeout(
          () => load(keyword, 0, generation),
          keyword ? 220 : 0
        )
      },
      [load]
    )
    useEffect(() => {
      const requestState = state.current
      requestState.gate.next()
      controller.current?.abort()
      clearTimeout(timer.current)
      requestState.loading = false
      setLoading(false)
      setOptions([])
      return () => {
        requestState.gate.next()
        controller.current?.abort()
        clearTimeout(timer.current)
      }
    }, [referenceType, paramsKey, disabled, scopeKey])
    // Lookup does not apply the active-only candidate filter: an existing source
    // can retain a disabled historical reference without making it a new choice.
    const selectedID = Number(value || 0)
    const hasKnownOption = initialOptions.some(
      (option) => Number(option.value) === selectedID
    )
    useEffect(() => {
      setSelectedOptions([])
      if (!selectedID || hasKnownOption || disabled) return undefined
      const abort = new AbortController()
      loadReferenceIDs(referenceType, [selectedID], { signal: abort.signal })
        .then((data) => {
          if (!abort.signal.aborted) {
            setSelectedOptions(accept(data[referenceType]))
          }
        })
        .catch((error) => {
          if (!isRpcAbortError(error) && !abort.signal.aborted) {
            showPageLoadError(error, '加载已选资料')
          }
        })
      return () => abort.abort()
    }, [referenceType, selectedID, hasKnownOption, disabled, accept, scopeKey])
    const displayOptions = useMemo(() => {
      const known = new Map(
        initialOptions.map((option) => [option.value, option])
      )
      return [
        ...initialOptions.filter((option) => !Number(option.value)),
        ...mergeProductionOrderReferenceOptions(
          options.map((option) => ({ ...option, ...known.get(option.value) })),
          selectedOptions,
          initialOptions.filter((option) => Number(option.value) === selectedID)
        ),
      ]
    }, [options, selectedOptions, initialOptions, selectedID])
    return (
      <Component
        {...props}
        ref={ref}
        value={value}
        disabled={disabled}
        options={displayOptions}
        loading={loading}
        showSearch
        filterOption={false}
        onOpenChange={(open) => {
          if (open && !disabled) search('')
          onOpenChange?.(open)
        }}
        onSearch={(keyword) => {
          search(keyword)
          onSearch?.(keyword)
        }}
        onPopupScroll={(event) => {
          const target = event.currentTarget
          if (
            target.scrollHeight - target.scrollTop - target.clientHeight > 32 ||
            state.current.loading ||
            state.current.nextOffset === null
          ) {
            return
          }
          load(
            state.current.keyword,
            state.current.nextOffset,
            state.current.gate.next()
          )
        }}
      />
    )
  }
)

export default RemoteReferenceSelect
