import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Spin } from 'antd'
import Drawer from '@/common/components/drawer/AppDrawer.jsx'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { getWorkflowTask } from '../../api/workflowApi.mjs'
import { taskLinkID } from '../../utils/workflowTaskLink.mjs'

export default function WorkflowExactTaskEntry({ value, profile, onOpen, onClose }) {
  const id = taskLinkID(value)
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const open = useRef(onOpen)
  open.current = onOpen
  useEffect(() => {
    open.current(null)
    if (!id) return undefined
    const controller = new AbortController()
    setState('loading')
    getWorkflowTask(id, { signal: controller.signal }).then((task) => {
      if (controller.signal.aborted) return
      setState('opened')
      open.current(task)
    }).catch((failure) => {
      if (controller.signal.aborted) return
      setError(getActionErrorMessage(failure, '读取指定任务'))
      setState('error')
    })
    return () => controller.abort()
  }, [id, attempt, profile])
  if (state === 'opened') return null
  return (
    <Drawer title="任务详情" open onClose={onClose}>
      {!id || state === 'error' ? <Alert
        showIcon
        type="error"
        message={id ? error : '任务编号无效'}
        action={id && <Button onClick={() => setAttempt((n) => n + 1)}>重新读取</Button>}
      /> : <Spin aria-label="正在读取任务" />}
    </Drawer>
  )
}
