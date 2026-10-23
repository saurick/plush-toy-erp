import React, { forwardRef, useId, useState } from 'react'
import {
  ArrowLeftOutlined,
  CloseCircleFilled,
  SearchOutlined,
} from '@ant-design/icons'
import { Button, Input, Popover } from 'antd'
import useSubmittedSearch from '@/common/hooks/useSubmittedSearch'

function joinClassNames(...items) {
  return items.filter(Boolean).join(' ')
}

const SearchInput = forwardRef(
  (
    {
      allowClear = false,
      className = '',
      placeholder = '搜索关键词',
      searchHint,
      showSearchScope = false,
      onSearch,
      onSubmitted,
      onCancel,
      showCancel = false,
      resetKey,
      ...restProps
    },
    ref
  ) => {
    const explicit = typeof onSearch === 'function'
    const search = useSubmittedSearch({
      value: restProps.value,
      onSearch,
      resetKey,
    })
    const accessibleLabel = restProps['aria-label'] || searchHint || placeholder
    const title = restProps.title || searchHint || undefined
    const hintID = useId()
    const [focused, setFocused] = useState(false)
    const showHint = Boolean(
      showSearchScope && searchHint && focused && !restProps.disabled
    )
    const cancel = () => {
      search.cancel()
      setFocused(false)
      onCancel?.()
    }
    const submit = (event) => {
      event?.stopPropagation()
      if (!search.submit(search.value, event)) return
      if (event?.key === 'Enter') event.preventDefault()
      setFocused(false)
      onSubmitted?.()
    }

    return (
      <Popover
        open={showHint}
        trigger={[]}
        placement="bottomLeft"
        styles={{
          root: {
            maxWidth: 'min(384px, calc(100vw - 64px))',
            pointerEvents: 'none',
          },
        }}
        content={
          <div id={hintID} style={{ overflowWrap: 'anywhere' }}>
            {searchHint}
          </div>
        }
      >
        <Input
          {...restProps}
          {...(explicit
            ? {
                value: search.value,
                onChange: search.onChange,
                onCompositionStart: search.onCompositionStart,
                onCompositionEnd: search.onCompositionEnd,
                onPressEnter: submit,
                suffix: (
                  <>
                    {allowClear && (search.value || restProps.value) ? (
                      <button
                        type="button"
                        className="ant-input-clear-icon erp-search-clear"
                        aria-label="清除搜索"
                        disabled={restProps.disabled}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={search.clear}
                      >
                        <CloseCircleFilled aria-hidden="true" />
                      </button>
                    ) : null}
                    <Button
                      className="erp-search-submit"
                      type="primary"
                      disabled={restProps.disabled}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={submit}
                    >
                      搜索
                    </Button>
                  </>
                ),
              }
            : {})}
          ref={ref}
          allowClear={explicit ? false : allowClear}
          className={joinClassNames(
            'erp-search-input',
            explicit && 'erp-search-input--submitted',
            className
          )}
          prefix={
            showCancel ? (
              <button
                type="button"
                className="erp-search-cancel"
                aria-label="取消搜索"
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation()
                  cancel()
                }}
              >
                <ArrowLeftOutlined aria-hidden="true" />
              </button>
            ) : (
              <SearchOutlined aria-hidden="true" />
            )
          }
          placeholder={placeholder}
          aria-label={accessibleLabel}
          title={title}
          aria-describedby={
            showHint
              ? [restProps['aria-describedby'], hintID]
                  .filter(Boolean)
                  .join(' ')
              : restProps['aria-describedby']
          }
          onFocus={(event) => {
            setFocused(true)
            restProps.onFocus?.(event)
          }}
          onBlur={(event) => {
            setFocused(false)
            restProps.onBlur?.(event)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              if (explicit) cancel()
              else setFocused(false)
            }
            restProps.onKeyDown?.(event)
          }}
        />
      </Popover>
    )
  }
)

export default SearchInput
