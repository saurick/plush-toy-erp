import React, { forwardRef, useLayoutEffect, useState } from 'react'
import { ConfigProvider, Grid, Input } from 'antd'

const countCharacters = (value) => [...value].length
const clipCharacters = (value, { max }) => [...value].slice(0, max).join('')

// Business descriptions remain readable in narrow cells and disabled forms.
// CSS owns the minimum rows; Ant Design measures content on value and width changes.
const BusinessTextArea = forwardRef(
  (
    { minRows = 2, className = '', style, styles, showCount, disabled, readOnly, maxLength, count, ...props },
    ref
  ) => {
    const { componentDisabled } = ConfigProvider.useConfig()
    const screens = Grid.useBreakpoint()
    const effectiveShowCount = showCount && !(disabled ?? componentDisabled) && !readOnly
    const counted = Boolean(effectiveShowCount)
    const [measuredFor, setMeasuredFor] = useState(() => ({ desktop: screens.md, placeholder: props.placeholder, counted }))
    // 字号、提示文字或计数留白变化时，输入值可能不变，需重新触发自动测量。
    useLayoutEffect(() => {
      setMeasuredFor((previous) => previous.desktop === screens.md && previous.placeholder === props.placeholder && previous.counted === counted
        ? previous : { desktop: screens.md, placeholder: props.placeholder, counted })
    }, [screens.md, props.placeholder, counted])
    // 内层样式只绑定共享尺寸变量，不与 Ant Design 的默认最小高度叠加选择器。
    return (
      <Input.TextArea
        {...props}
        ref={ref}
        disabled={disabled}
        readOnly={readOnly}
        showCount={effectiveShowCount}
        count={maxLength == null ? count : {
          ...count,
          max: maxLength,
          strategy: countCharacters,
          exceedFormatter: clipCharacters,
        }}
        className={`erp-business-textarea ${className}`.trim()}
        style={{ ...style, '--erp-textarea-rows': minRows }}
        styles={{ ...styles, textarea: { ...styles?.textarea, minHeight: 'var(--erp-textarea-min-height)' } }}
        autoSize={measuredFor.desktop === screens.md && measuredFor.placeholder === props.placeholder && measuredFor.counted === counted}
      />
    )
  }
)

export default BusinessTextArea
