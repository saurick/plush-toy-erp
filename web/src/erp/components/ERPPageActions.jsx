import React, { createContext, useContext } from 'react'
import { MenuOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button } from 'antd'

export const ERPPageActionsContext = createContext(null)

// 模块页头和独立页面共用壳层的刷新及离开保护，手机任务页不提供此上下文。
export default function ERPPageActions() {
  const actions = useContext(ERPPageActionsContext)
  if (!actions) return null

  return (
    <div className="erp-page-actions" role="group" aria-label="页面操作">
      <Button
        className="erp-page-actions__navigation"
        icon={<MenuOutlined />}
        aria-label="打开导航菜单"
        onClick={actions.onOpenNavigation}
      />
      <Button
        icon={<ReloadOutlined />}
        loading={actions.refreshing}
        onClick={actions.onRefresh}
        aria-label="刷新当前页"
      >
        刷新
      </Button>
    </div>
  )
}
