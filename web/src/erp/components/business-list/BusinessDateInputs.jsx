import React from 'react'
import { CalendarOutlined } from '@ant-design/icons'
import { Button, DatePicker, Form } from 'antd'
import FilterChipGroup from '@/common/components/navigation/FilterChipGroup.jsx'
import { dateFilterPresets } from '../../utils/filterDateRange.mjs'
import FilterField from '@/common/components/navigation/FilterField.jsx'
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
      defaultOpen = false,
      onClick,
      onMouseDown,
      onOpenChange,
      onCalendarChange,
      showTime,
      quickOptions = [],
      quickOptionsLabel = '快捷选择',
      renderExtraFooter,
      popupAlign,
      ...restProps
    },
    ref
  ) => {
    const [open, setOpen] = React.useState(defaultOpen)
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
        popupAlign={{
          offset: [0, 0],
          ...popupAlign,
          overflow: {
            adjustX: true,
            adjustY: true,
            shiftX: true,
            shiftY: true,
            ...popupAlign?.overflow,
          },
        }}
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
    classNames={{
      ...props.classNames,
      popup: {
        ...props.classNames?.popup,
        root: joinClassNames(
          'erp-business-date-picker-dropdown',
          props.classNames?.popup?.root || ''
        ),
      },
    }}
    displayFormat={DATE_INPUT_DISPLAY_FORMAT}
    parseValue={parseDateInputValue}
    placeholder={props.placeholder || '选择日期'}
    valueFormat={DATE_INPUT_VALUE_FORMAT}
  />
))

export const InheritedDateInput = React.forwardRef(
  ({ value, onChange, inheritedValue, label = '行交期', disabled, onOpenChange, ...props }, ref) => {
    const [editing, setEditing] = React.useState(false)
    const pickerRef = React.useRef(null)
    const buttonRef = React.useRef(null)
    const restoreFocus = React.useRef(false)
    const { status } = Form.Item.useStatus()
    const showPicker = Boolean(value) || editing || status === 'error'
    const inheritedDate = parseDateInputValue(inheritedValue)?.format(DATE_INPUT_DISPLAY_FORMAT)
    const summary = inheritedDate ? `${inheritedDate} · 沿用` : '沿用整单交期'

    React.useImperativeHandle(ref, () => ({
      focus: () => (pickerRef.current || buttonRef.current)?.focus(),
    }), [])
    React.useEffect(() => {
      if (!showPicker && restoreFocus.current) {
        buttonRef.current?.focus()
        restoreFocus.current = false
      }
    }, [showPicker])

    if (!showPicker) {
      return (
        <Button
          ref={buttonRef}
          id={props.id}
          type="link"
          size="small"
          htmlType="button"
          disabled={disabled}
          aria-label={`${label}：${summary}，单独修改`}
          onClick={() => setEditing(true)}
        >
          {summary}
        </Button>
      )
    }
    return (
      <DateInput
        {...props}
        ref={pickerRef}
        disabled={disabled}
        value={value}
        placeholder={inheritedDate || '沿用整单交期'}
        defaultOpen={editing && !value}
        autoFocus={editing}
        onChange={(next) => {
          if (!next) restoreFocus.current = true
          onChange?.(next)
          if (!next) setEditing(false)
        }}
        onOpenChange={(open) => {
          if (!open) {
            restoreFocus.current = true
            setEditing(false)
          }
          onOpenChange?.(open)
        }}
      />
    )
  }
)

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
  startValue = '',
  endValue = '',
  onRangeChange,
  customOnly = false,
  required = false,
  inputReadOnly,
}) {
  const hasMultipleDateTypes = options.length > 1
  const dateType = options.find((option) => option.value === value) || options[0]
  const label = dateType?.label || '日期范围'
  const [editingRange, setEditingRange] = React.useState(null)
  const presets = dateFilterPresets(dateType?.upcoming).filter((option) => !required || option.value)
  const editing = editingRange?.from === startValue && editingRange?.to === endValue
  const period = editing ? 'custom' : presets.find(
    (option) => option.from === startValue && option.to === endValue
  )?.value ?? 'custom'
  const showInputs = customOnly || period === 'custom'
  const selectPeriod = (next) => {
    if (next === 'custom') {
      setEditingRange({ from: startValue, to: endValue })
      return
    }
    setEditingRange(null)
    const { from, to } = dateFilterPresets(dateType?.upcoming).find((option) => option.value === next)
    onRangeChange(from, to)
  }
  const editRange = (from, to) => {
    setEditingRange(from || to ? { from, to } : null)
    onRangeChange(from, to)
  }
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
        'erp-business-filter-control erp-business-date-range-filter',
        rangeInvalid ? 'erp-business-date-range-filter--invalid' : ''
      )}
      role="group"
      aria-label={label}
    >
      {hasMultipleDateTypes ? (
        <FilterChipGroup
          label="日期类型"
          options={options}
          value={value}
          onChange={onTypeChange}
        />
      ) : null}
      {customOnly ? <FilterField label={label} /> : (
        <FilterChipGroup
          label={hasMultipleDateTypes ? '时间范围' : label}
          aria-label="时间范围"
          allowClear={!required}
          options={presets}
          value={period}
          onChange={selectPeriod}
        />
      )}
      {showInputs && (
        <div className="erp-business-date-range-filter__range">
          <span className="erp-business-date-range-filter__separator" aria-hidden="true">从</span>
          <DateInput
            aria-label="开始日期"
            placeholder="开始日期"
            status={rangeInvalid ? 'error' : undefined}
            value={startValue}
            inputReadOnly={inputReadOnly}
            disabledDate={endValue ? startDisabledDate : undefined}
            onChange={(from) => editRange(from, endValue)}
          />
          <span
            className="erp-business-date-range-filter__separator"
            aria-hidden="true"
          >
            至
          </span>
          <DateInput
            aria-label="结束日期"
            placeholder="结束日期"
            status={rangeInvalid ? 'error' : undefined}
            value={endValue}
            inputReadOnly={inputReadOnly}
            disabledDate={startValue ? endDisabledDate : undefined}
            onChange={(to) => editRange(startValue, to)}
          />
        </div>
      )}
    </div>
  )
}
