import React, { forwardRef, useId } from 'react'
import { Form } from 'antd'
import { useBusinessSplit } from './BusinessSplitContext.jsx'

// 两栏中的同类表单需要独立 DOM 身份；字段路径与所属 form 实例保持原样。
const BusinessForm = forwardRef((props, ref) => {
  const split = useBusinessSplit()
  const id = useId().replace(/:/gu, '')
  const name = split?.side === 'right' && split.scope
    ? `${split.scope}-${props.name || id}`
    : props.name
  return <Form {...props} ref={ref} name={name} />
})

export default BusinessForm
