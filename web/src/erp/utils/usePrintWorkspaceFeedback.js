import { useCallback, useState } from 'react'

export default function usePrintWorkspaceFeedback() {
  const [feedback, setFeedback] = useState(null)
  const reportFeedback = useCallback((area, text, tone = 'success') => {
    setFeedback(text ? { area, text, tone } : null)
  }, [])
  const clearFeedback = useCallback(() => setFeedback(null), [])

  return { feedback, reportFeedback, clearFeedback }
}
