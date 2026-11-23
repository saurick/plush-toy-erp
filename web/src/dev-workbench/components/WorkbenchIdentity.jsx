import React, { useEffect, useState } from 'react'
import { Button, Result } from 'antd'
import { Loading } from '@/common/components/loading'
import { parseWorkbenchSession } from '../config/workbenchAccess.mjs'

export function WorkbenchIdentity({ children }) {
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState('loading')
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    let mounted = true
    setStatus('loading')
    const read = async () => {
      try {
        const response = await fetch('/__dev/auth/session', {
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        })
        if (response.status === 401) return
        if (!response.ok) throw new Error('session unavailable')
        parseWorkbenchSession(await response.json())
        if (mounted) setStatus('ready')
      } catch {
        if (mounted) setStatus('failed')
      } finally {
        clearTimeout(timer)
      }
    }
    read()
    return () => { mounted = false; clearTimeout(timer); controller.abort() }
  }, [attempt])
  if (status === 'failed') { return (
    <Result
      status="error"
      title="暂时无法确认工作台登录状态"
      extra={<Button onClick={() => setAttempt((value) => value + 1)}>重新读取</Button>}
    />
  ) }
  if (status === 'loading') return <Loading title="正在读取工作台登录状态" />
  return children
}
