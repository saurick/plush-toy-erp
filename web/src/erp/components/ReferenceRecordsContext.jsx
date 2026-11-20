import { createContext, useContext, useId, useLayoutEffect } from 'react'

export const ReferenceRecordsContext = createContext(null)

// 编辑器在自己的内容区承接读取反馈；隐藏的编辑器不占用反馈位置。
export function ReferenceRecordsFeedback({ active = true }) {
  const context = useContext(ReferenceRecordsContext)
  const id = useId()
  const register = context?.registerFeedbackHost
  useLayoutEffect(() => {
    if (!active || !register) return undefined
    return register(id)
  }, [active, register, id])
  return active ? context?.referenceFeedback || null : null
}
