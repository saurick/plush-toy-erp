import React from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Button, Result } from 'antd'
import { getStoredAdminProfile } from '@/common/auth/auth'
import { getEntryConfig } from '../config/entryConfig.mjs'
import { taskLinkID, workflowTaskLinkDestination } from '../utils/workflowTaskLink.mjs'

export default function WorkflowTaskLinkEntryPage() {
  const { taskID } = useParams()
  const id = taskLinkID(taskID)
  const path = workflowTaskLinkDestination(id, getStoredAdminProfile(), getEntryConfig())
  return path ? <Navigate to={path} replace /> : (
    <Result
      status={id ? '403' : '404'}
      title={id ? '当前账号没有可用的任务入口' : '任务链接无效'}
      extra={<Button href="/entry">返回工作入口</Button>}
    />
  )
}
