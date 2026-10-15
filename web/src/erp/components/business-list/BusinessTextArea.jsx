import React, { forwardRef } from 'react'
import { Input } from 'antd'

// Business descriptions remain readable in narrow cells and disabled forms.
// Ant Design owns resizing on value and width changes; no per-cell scroll cap.
const BusinessTextArea = forwardRef(
  ({ minRows = 1, className = '', style, ...props }, ref) => (
    <Input.TextArea
      {...props}
      ref={ref}
      className={`erp-business-textarea ${className}`.trim()}
      style={{ ...style, '--erp-textarea-rows': minRows }}
      autoSize={{ minRows }}
    />
  )
)

export default BusinessTextArea
