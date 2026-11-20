import { useEffect } from 'react'
import { App as AntdApp } from 'antd'
import { registerAntdAppApis } from '@/common/utils/antdApp'

const AntdAppBridge = () => {
  const { message, modal, notification } = AntdApp.useApp()

  useEffect(() => {
    registerAntdAppApis({ message, modal, notification })
    return () => {
      registerAntdAppApis()
    }
  }, [message, modal, notification])

  return null
}

export default AntdAppBridge
