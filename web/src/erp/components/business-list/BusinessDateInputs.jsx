import React from 'react'
import { CalendarOutlined } from '@ant-design/icons'
import { Button, DatePicker } from 'antd'
import Select from '@/common/components/select/AppSelect'
import {
  DATE_INPUT_DISPLAY_FORMAT,
  DATE_INPUT_VALUE_FORMAT,
  DATE_TIME_INPUT_DISPLAY_FORMAT,
  DATE_TIME_INPUT_VALUE_FORMAT,
  isDateInputAfter,
  isDateInputBefore,
  isDateInputRangeReversed,
  parseDateInputValue,
  parseDateTimeInputValue,
} from '../../utils/dateRange.mjs'

function joinClassNames(...items) {
  return items.filter(Boolean).join(' ')
}

const BusinessDatePicker = React.forwardRef(
  (
    {
      value,
      onChange,
      parseValue,
      valueFormat,
      displayFormat,
      className = '',
      disabled,
      placeholder,
      allowClear = true,
      inputReadOnly = true,
      onClick,
      onMouseDown,
      onOpenChange,
      onCalendarChange,
      showTime,
      quickOptions = [],
      quickOptionsLabel = '快捷选择',
      renderExtraFooter,
      ...restProps
    },
    ref
  ) => {
    const [open, setOpen] = React.useState(false)
    const pickerValue = parseValue(value)
    const handleChange = React.useCallback(
      (nextValue) => {
        const formattedValue = nextValue ? nextValue.format(valueFormat) : ''
        onChange?.(formattedValue)
      },
      [onChange, valueFormat]
    )
    const handlePointerOpen = React.useCallback(
      (event) => {
        if (
          disabled === true ||
          event.currentTarget?.classList?.contains('ant-picker-disabled')
        ) {
          return
        }
        if (event.target?.closest?.('.ant-picker-clear')) return
        setOpen(true)
      },
      [disabled]
    )
    const handleClick = React.useCallback(
      (event) => {
        handlePointerOpen(event)
        onClick?.(event)
      },
      [handlePointerOpen, onClick]
    )
    const handleMouseDown = React.useCallback(
      (event) => {
        handlePointerOpen(event)
        onMouseDown?.(event)
      },
      [handlePointerOpen, onMouseDown]
    )
    const handleOpenChange = React.useCallback(
      (nextOpen) => {
        setOpen(nextOpen)
        onOpenChange?.(nextOpen)
      },
      [onOpenChange]
    )
    const handleQuickOption = React.useCallback(
      (option) => {
        const optionDisabled =
          typeof option?.disabled === 'function'
            ? option.disabled()
            : option?.disabled
        if (optionDisabled) return
        const rawValue =
          typeof option?.value === 'function' ? option.value() : option?.value
        const nextValue = parseValue(rawValue)
        if (!nextValue) return
        handleOpenChange(false)
        // rc-picker emits its pending empty input once while a custom footer
        // closes. Apply the shortcut after that close cycle so it remains the
        // controlled Form value.
        setTimeout(() => handleChange(nextValue), 0)
      },
      [handleChange, handleOpenChange, parseValue]
    )
    const mergedRenderExtraFooter = React.useCallback(
      (mode) => {
        const extraFooter = renderExtraFooter?.(mode)
        if (!quickOptions.length) return extraFooter
        return (
          <>
            <div
              className="erp-business-date-picker-quick-options"
              role="group"
              aria-label={quickOptionsLabel}
            >
              <span className="erp-business-date-picker-quick-options__label">
                {quickOptionsLabel}
              </span>
              {quickOptions.map((option) => {
                const optionDisabled =
                  typeof option.disabled === 'function'
                    ? option.disabled()
                    : option.disabled
                return (
                  <Button
                    key={option.key || option.label}
                    size="small"
                    htmlType="button"
                    disabled={optionDisabled}
                    data-business-date-quick-option={
                      option.key || option.label
                    }
                    title={option.title}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                    }}
                    onClick={(event) => {
                      event.stopPropagation()
                      handleQuickOption(option)
                    }}
                  >
                    {option.label}
                  </Button>
                )
              })}
            </div>
            {extraFooter}
          </>
        )
      },
      [handleQuickOption, quickOptions, quickOptionsLabel, renderExtraFooter]
    )

    return (
      <DatePicker
        {...restProps}
        ref={ref}
        needConfirm={false}
        showTime={showTime}
        allowClear={allowClear}
        className={joinClassNames('erp-business-date-input', className)}
        disabled={disabled}
        format={displayFormat}
        inputReadOnly={inputReadOnly}
        open={open}
        placeholder={placeholder}
        suffixIcon={<CalendarOutlined />}
        value={pickerValue}
        onChange={handleChange}
        onCalendarChange={(nextValue, ...args) => {
          // Date-time pickers otherwise defer onChange until the panel closes.
          if (showTime && nextValue?.isValid()) handleChange(nextValue)
          onCalendarChange?.(nextValue, ...args)
        }}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onOpenChange={handleOpenChange}
        renderExtraFooter={mergedRenderExtraFooter}
      />
    )
  }
)

export const DateInput = React.forwardRef((props, ref) => (
  <BusinessDatePicker
    {...props}
    ref={ref}
    displayFormat={DATE_INPUT_DISPLAY_FORMAT}
    parseValue={parseDateInputValue}
    placeholder={props.placeholder || '选择日期'}
    valueFormat={DATE_INPUT_VALUE_FORMAT}
  />
))

export const DateTimeInput = React.forwardRef((props, ref) => (
  <BusinessDatePicker
    {...props}
    ref={ref}
    className={joinClassNames(
      'erp-business-date-time-input',
      props.className || ''
    )}
    classNames={{
      ...props.classNames,
      popup: {
        ...props.classNames?.popup,
        root: joinClassNames(
          'erp-business-date-time-picker-dropdown',
          props.classNames?.popup?.root || ''
        ),
      },
    }}
    displayFormat={DATE_TIME_INPUT_DISPLAY_FORMAT}
    inputReadOnly={props.inputReadOnly ?? false}
    parseValue={parseDateTimeInputValue}
    placeholder={props.placeholder || '选择日期和时间'}
    showTime={{ format: 'HH:mm', ...(props.showTime || {}) }}
    valueFormat={DATE_TIME_INPUT_VALUE_FORMAT}
  />
))

export function DateRangeFilter({
  options = [],
  value,
  onTypeChange,
  startValue,
  endValue,
  onStartChange,
  onEndChange,
}) {
  const hasMultipleDateTypes = options.length > 1
  const selectedDateTypeLabel =
    options.find((option) => option.value === value)?.label || options[0]?.label
  const rangeInvalid = isDateInputRangeReversed(startValue, endValue)
  const startDisabledDate = React.useCallback(
    (current) => isDateInputAfter(current, endValue),
    [endValue]
  )
  const endDisabledDate = React.useCallback(
    (current) => isDateInputBefore(current, startValue),
    [startValue]
  )
  return (
    <div
      className={joinClassNames(
        'erp-business-filter-control erp-business-date-range-filter erp-business-module-date-filter',
        rangeInvalid ? 'erp-business-date-range-filter--invalid' : ''
      )}
      role="group"
      aria-label={selectedDateTypeLabel || '日期范围'}
    >
      {hasMultipleDateTypes ? (
        <Select
          allowClear={false}
          label="日期类型"
          placeholder="日期类型"
          className="erp-business-date-range-filter__type"
          aria-label="日期类型"
          options={options}
          value={value || undefined}
          onChange={onTypeChange}
          classNames={{
            popup: { root: 'erp-business-module-select-popup' },
          }}
        />
      ) : selectedDateTypeLabel ? (
        <span
          className="erp-business-date-range-filter__type erp-business-date-range-filter__type-label"
          aria-label="日期类型"
        >
          {selectedDateTypeLabel}
        </span>
      ) : null}
      <div className="erp-business-date-range-filter__range">
        <DateInput
          aria-label="开始日期"
          className="erp-business-date-range-filter__date"
          placeholder="开始日期"
          status={rangeInvalid ? 'error' : undefined}
          value={startValue}
          disabledDate={endValue ? startDisabledDate : undefined}
          onChange={onStartChange}
        />
        <span
          className="erp-business-date-range-filter__separator"
          aria-hidden="true"
        >
          至
        </span>
        <DateInput
          aria-label="结束日期"
          className="erp-business-date-range-filter__date"
          placeholder="结束日期"
          status={rangeInvalid ? 'error' : undefined}
          value={endValue}
          disabledDate={startValue ? endDisabledDate : undefined}
          onChange={onEndChange}
        />
      </div>
    </div>
  )
}
