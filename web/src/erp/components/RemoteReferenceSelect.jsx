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
import { Alert, Button } from 'antd'
import Select from '@/common/components/select/AppSelect'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import { RpcErrorCode } from '@/common/consts/errorCodes.js'
import { getPageLoadErrorMessage } from '@/common/utils/errorMessage'
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
      listHeight = 256,
      popupRender,
      emptyDescription = '暂无可选资料',
      filteredEmptyDescription = '没有符合条件的可选资料',
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
    const [candidateError, setCandidateError] = useState(null)
    const [searchKeyword, setSearchKeyword] = useState('')
    const state = useRef({
      gate: createProductionOrderReferenceRequestGate(),
      nextOffset: null,
      loading: false,
      keyword: '',
      inputKeyword: '',
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
        setCandidateError(null)
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
            setCandidateError(error)
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
        state.current.loading = true
        setLoading(true)
        setCandidateError(null)
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
      setCandidateError(null)
      setSearchKeyword('')
      requestState.inputKeyword = ''
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
    const candidateDenied = candidateError?.code === RpcErrorCode.PERMISSION_DENIED
    const retryCandidates = useCallback(() => search(state.current.inputKeyword), [search])
    const clearCandidateSearch = () => {
      state.current.inputKeyword = ''
      setSearchKeyword('')
      search('')
      onSearch?.('')
    }
    const readFeedback = useMemo(() => candidateError ? (
      <Empty
        variant="compact"
        state={candidateDenied ? 'denied' : 'error'}
        description={getPageLoadErrorMessage(candidateError, '加载可选资料')}
        detail={candidateDenied ? '请联系管理员核对权限。' : undefined}
      >
        {!candidateDenied ? <Button onMouseDown={(event) => event.preventDefault()} onClick={retryCandidates}>重试读取</Button> : null}
      </Empty>
    ) : null, [candidateError, candidateDenied, retryCandidates])
    const hasCandidateOptions = displayOptions.length > 0
    const renderPopup = useCallback((menu) => {
      // 加载、搜索和空结果沿用候选列表高度，避免浮层重新选择展开方向。
      const content = (
        <div style={{ minHeight: listHeight }}>
          {candidateDenied ? readFeedback : (
            <>
              {candidateError && hasCandidateOptions ? (
                <Alert type="error" showIcon message="可选资料读取失败" description="已保留原有候选和当前输入。" action={<Button onMouseDown={(event) => event.preventDefault()} onClick={retryCandidates}>重试读取</Button>} />
              ) : null}
              {menu}
            </>
          )}
        </div>
      )
      return popupRender ? popupRender(content) : content
    }, [listHeight, popupRender, candidateDenied, readFeedback, candidateError, hasCandidateOptions, retryCandidates])
    return (
      <Component
        {...props}
        ref={ref}
        value={value}
        disabled={disabled}
        options={displayOptions}
        listHeight={listHeight}
        popupRender={renderPopup}
        loading={loading}
        searchValue={searchKeyword}
        notFoundContent={loading ? <Empty variant="compact" state="loading" description="正在读取可选资料…" /> : readFeedback || props.notFoundContent || (
          <Empty variant="compact" description={searchKeyword.trim() ? filteredEmptyDescription : emptyDescription}>
            {searchKeyword.trim() ? <Button onMouseDown={(event) => event.preventDefault()} onClick={clearCandidateSearch}>清除搜索</Button> : null}
          </Empty>
        )}
        showSearch
        filterOption={false}
        onOpenChange={(open) => {
          // 输入可先于展开事件到达，展开不能覆盖刚输入的搜索词。
          if (open && !disabled) search(state.current.inputKeyword)
          if (!open) {
            state.current.inputKeyword = ''
            setSearchKeyword('')
          }
          onOpenChange?.(open)
        }}
        onSearch={(keyword) => {
          state.current.inputKeyword = keyword
          setSearchKeyword(keyword)
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
