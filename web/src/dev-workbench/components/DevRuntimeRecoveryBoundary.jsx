import React, { useEffect, useState } from 'react'
import { Alert, Button, Spin, Typography } from 'antd'
import { Helmet } from 'react-helmet-async'
import { useLocation } from 'react-router-dom'
import {
  DEV_DATABASE_MIGRATION_RECOVERY_ROUTE,
  DEV_RUNTIME_RECOVERY_EVENT,
  isDevDatabaseMigrationRecoveryActive,
  startDevRuntimeRecoveryMonitor,
} from '../config/devRuntimeRecovery.mjs'
import './DevRuntimeRecoveryBoundary.css'

export default function DevRuntimeRecoveryBoundary({ children }) {
  const location = useLocation()
  const [recoveryActive, setRecoveryActive] = useState(() =>
    isDevDatabaseMigrationRecoveryActive()
  )
  const isDevRoute = /^\/__dev(?:\/|$)/u.test(location.pathname)

  useEffect(() => {
    const handleRecovery = () => {
      setRecoveryActive(isDevDatabaseMigrationRecoveryActive())
    }
    window.addEventListener(DEV_RUNTIME_RECOVERY_EVENT, handleRecovery)
    handleRecovery()
    return () =>
      window.removeEventListener(DEV_RUNTIME_RECOVERY_EVENT, handleRecovery)
  }, [])

  useEffect(() => {
    if (!recoveryActive || isDevRoute) return undefined
    return startDevRuntimeRecoveryMonitor(() => setRecoveryActive(false))
  }, [recoveryActive, isDevRoute])

  if (!recoveryActive || isDevRoute) return children

  return (
    <main className="erp-dev-runtime-recovery">
      <Helmet>
        <title>服务暂不可用</title>
      </Helmet>
      <Alert
        type="warning"
        showIcon
        message="服务暂不可用"
        description={
          <>
            <Typography.Paragraph>
              服务恢复后会自动打开当前页面，无需手动跳转。
            </Typography.Paragraph>
            <div className="erp-dev-runtime-recovery__actions">
              <span className="erp-dev-runtime-recovery__waiting" role="status">
                <Spin size="small" />
                正在等待服务恢复
              </span>
              <Button
                href={DEV_DATABASE_MIGRATION_RECOVERY_ROUTE}
                target="_blank"
                rel="noopener noreferrer"
              >
                检查并恢复服务
              </Button>
            </div>
          </>
        }
      />
    </main>
  )
}
