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
    const [sizedForDesktop, setSizedForDesktop] = useState(screens.md)
    // 窄屏字号变化不一定改变固定列宽，重新启用自动高度以触发组件测量。
    useLayoutEffect(() => {
      setSizedForDesktop(screens.md)
    }, [screens.md])
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
        autoSize={sizedForDesktop === screens.md ? { minRows } : false}
      />
    )
  }
)

export default BusinessTextArea
