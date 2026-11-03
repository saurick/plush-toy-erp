import React, { forwardRef, useLayoutEffect, useState } from 'react'
import { ConfigProvider, Grid, Input } from 'antd'

const countCharacters = (value) => [...value].length
const clipCharacters = (value, { max }) => [...value].slice(0, max).join('')

// Business descriptions remain readable in narrow cells and disabled forms.
// Ant Design owns resizing on value and width changes; no per-cell scroll cap.
const BusinessTextArea = forwardRef(
  (
    { minRows = 2, className = '', style, showCount, disabled, readOnly, maxLength, count, ...props },
    ref
  ) => {
    const { componentDisabled } = ConfigProvider.useConfig()
    const screens = Grid.useBreakpoint()
    const [measuredFor, setMeasuredFor] = useState(() => ({ desktop: screens.md, placeholder: props.placeholder }))
    // 字号或提示文字变化不会改变输入值，重新启用自动高度以触发测量。
    useLayoutEffect(() => {
      setMeasuredFor((previous) => previous.desktop === screens.md && previous.placeholder === props.placeholder
        ? previous : { desktop: screens.md, placeholder: props.placeholder })
    }, [screens.md, props.placeholder])
    return (
      <Input.TextArea
        {...props}
        ref={ref}
        disabled={disabled}
        readOnly={readOnly}
        showCount={showCount && !(disabled ?? componentDisabled) && !readOnly}
        count={maxLength == null ? count : {
          ...count,
          max: maxLength,
          strategy: countCharacters,
          exceedFormatter: clipCharacters,
        }}
        className={`erp-business-textarea ${className}`.trim()}
        style={{ ...style, '--erp-textarea-rows': minRows }}
        autoSize={measuredFor.desktop === screens.md && measuredFor.placeholder === props.placeholder ? { minRows } : false}
      />
    )
  }
)

export default BusinessTextArea
