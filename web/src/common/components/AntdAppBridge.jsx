import React, { useEffect } from 'react'
import { App as AntdApp } from 'antd'
import { registerAntdAppApis } from '@/common/utils/antdApp'

const AntdAppBridge = () => {
  const { message, modal } = AntdApp.useApp()

  useEffect(() => {
    registerAntdAppApis({ message, modal })
    return () => {
      registerAntdAppApis()
    }
  }, [message, modal])

  return null
}

export default AntdAppBridge
