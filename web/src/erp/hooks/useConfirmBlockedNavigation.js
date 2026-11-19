import { useEffect } from 'react'

export default function useConfirmBlockedNavigation(blocker, confirmLeave) {
  useEffect(() => {
    if (blocker.state !== 'blocked') return undefined
    let active = true
    confirmLeave().then((allowed) => {
      if (!active) return
      if (allowed) blocker.proceed()
      else blocker.reset()
    })
    return () => { active = false }
  }, [blocker, confirmLeave])
}
