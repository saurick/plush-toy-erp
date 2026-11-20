import React, { createContext, useContext, useEffect, useState } from 'react'
import { Button, Result } from 'antd'
import { Loading } from '@/common/components/loading'
import { parseWorkbenchSession } from '../config/workbenchAccess.mjs'

const IdentityContext = createContext(null)
export const useWorkbenchIdentity = () => useContext(IdentityContext)

export function WorkbenchIdentity({ children }) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ identity: null, failed: false })
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    let mounted = true
    setState({ identity: null, failed: false })
    const read = async () => {
      try {
        const response = await fetch('/__dev/auth/session', {
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        })
        if (response.status === 401) return
        if (!response.ok) throw new Error('session unavailable')
        const identity = parseWorkbenchSession(await response.json())
        if (mounted) setState({ identity, failed: false })
      } catch {
        if (mounted) setState({ identity: null, failed: true })
      } finally {
        clearTimeout(timer)
      }
    }
    read()
    return () => { mounted = false; clearTimeout(timer); controller.abort() }
  }, [attempt])
  if (state.failed) { return (
    <Result
      status="error"
      title="暂时无法确认工作台登录状态"
      extra={<Button onClick={() => setAttempt((value) => value + 1)}>重新读取</Button>}
    />
  ) }
  if (!state.identity) return <Loading title="正在读取工作台登录状态" />
  return <IdentityContext.Provider value={state.identity}>{children}</IdentityContext.Provider>
}
