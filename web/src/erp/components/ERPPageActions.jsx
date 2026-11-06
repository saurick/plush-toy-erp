import React, { createContext, useContext } from 'react'
import { LayoutOutlined, MenuOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { BusinessSplitHeaderActions } from './BusinessSplitHeader.jsx'

export const ERPPageActionsContext = createContext(null)

// 模块页头和独立页面共用壳层的刷新及离开保护，手机任务页不提供此上下文。
export default function ERPPageActions({ showRefresh = true }) {
  const actions = useContext(ERPPageActionsContext)
  if (!actions) return null
  const refreshPending = Boolean(actions.refreshPending)

  return (
    <div className="erp-page-actions" role="group" aria-label="页面操作">
      <Button
        className="erp-page-actions__navigation"
        icon={<MenuOutlined />}
        aria-label="打开导航菜单"
        onClick={actions.onOpenNavigation}
      />
      {(showRefresh || refreshPending) && actions.onRefresh ? (
        <div className="erp-page-actions__refresh">
          <Button
            icon={<ReloadOutlined />}
            loading={actions.refreshing}
            disabled={actions.switching}
            onClick={actions.onRefresh}
            aria-label="刷新当前页"
          >
            刷新
          </Button>
          {refreshPending ? <span className="erp-page-actions__refresh-hint" role="status">相关资料有变动，返回列表后更新。</span> : null}
        </div>
      ) : null}
      <BusinessSplitHeaderActions />
      {actions.onSplit ? (
        <Button
          icon={<LayoutOutlined />}
          onClick={actions.onSplit}
          disabled={actions.switching}
          aria-pressed={actions.splitOpen}
          aria-label={actions.splitOpen ? '收起分栏' : '分栏'}
        >
          {actions.splitOpen ? '收起分栏' : '分栏'}
        </Button>
      ) : null}
    </div>
  )
}
